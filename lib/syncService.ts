import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { authManager } from './authManager';
import { dataService } from './dataService';

const LAST_SYNC_KEY = 'last_sync_timestamp';
const SYNC_INTERVAL = 60000; // 60 seconds (increased to reduce lock contention)
const MIN_SYNC_DELAY = 5000; // Minimum 5 seconds between syncs

export interface SyncStatus {
  isSyncing: boolean;
  lastSync: Date | null;
  error: string | null;
}

class SyncService {
  private syncInterval: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private lastSyncTime = 0;
  private statusListeners: ((status: SyncStatus) => void)[] = [];

  // Start auto-sync every 30 seconds
  startAutoSync = async () => {
    if (this.syncInterval) {
      console.log('[SyncService] Auto-sync already running');
      return; // Already running
    }
    
    console.log('[SyncService] Starting auto-sync...');
    
    // Initial sync (don't await to not block)
    this.syncNow().catch(err => console.log('[SyncService] Initial sync failed:', err));
    
    // Set up interval
    this.syncInterval = setInterval(async () => {
      await this.syncNow();
    }, SYNC_INTERVAL);
  };

  stopAutoSync = () => {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('Auto-sync stopped');
    }
  };

  syncNow = async (): Promise<boolean> => {
    if (this.isSyncing) {
      console.log('[SyncService] Sync already in progress, skipping...');
      return false;
    }

    // Debounce: prevent syncs that are too close together
    const now = Date.now();
    if (now - this.lastSyncTime < MIN_SYNC_DELAY) {
      console.log('[SyncService] Sync called too soon after last sync, skipping...');
      return false;
    }
    this.lastSyncTime = now;

    try {
      this.isSyncing = true;
      this.notifyListeners({ isSyncing: true, lastSync: await this.getLastSyncTime(), error: null });

      // Check if user is authenticated (using cached session)
      const session = await authManager.getSession();
      
      if (!session) {
        console.log('[SyncService] Not authenticated, skipping sync');
        this.isSyncing = false;
        return false;
      }

      console.log('[SyncService] ========================================');
      console.log('[SyncService] Starting sync...');
      console.log('[SyncService] ========================================');

      // ============================================
      // STEP 1: DOWNLOAD ALL DATA FROM SERVER FIRST
      // ============================================
      console.log('[SyncService] STEP 1: Downloading all data from server...');
      
      // Download all clubs user has access to
      const { data: serverClubs, error: clubsError } = await supabase
        .from('clubs')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (clubsError) {
        console.error('[SyncService] Error fetching clubs:', clubsError);
      }

      // Download all data for these clubs
      const serverData: any = {
        clubs: serverClubs || [],
        sessions: [],
        participants: [],
        attendance: []
      };

      if (serverClubs && serverClubs.length > 0) {
        console.log(`[SyncService] Found ${serverClubs.length} clubs on server`);
        const clubIds = serverClubs.map(c => c.id);

        // Download sessions for all clubs
        const { data: serverSessions } = await supabase
          .from('sessions')
          .select('*')
          .in('club_id', clubIds);
        serverData.sessions = serverSessions || [];
        console.log(`[SyncService] Downloaded ${serverData.sessions.length} sessions`);

        // Download participants for all clubs
        const { data: serverParticipants } = await supabase
          .from('participants')
          .select('*')
          .in('club_id', clubIds);
        serverData.participants = serverParticipants || [];
        console.log(`[SyncService] Downloaded ${serverData.participants.length} participants`);

        // Download attendance for all clubs
        const { data: serverAttendance } = await supabase
          .from('attendance')
          .select('*')
          .in('club_id', clubIds);
        serverData.attendance = serverAttendance || [];
        console.log(`[SyncService] Downloaded ${serverData.attendance.length} attendance records`);
      }

      // ============================================
      // STEP 2: MERGE SERVER DATA WITH LOCAL
      // For non-owners: server always wins (except attendance)
      // For owners: most recent timestamp wins
      // ============================================
      console.log('[SyncService] STEP 2: Merging server data with local...');
      
      await this.mergeDataWithLocal('clubs', serverData.clubs, session.user.id);
      await this.mergeDataWithLocal('sessions', serverData.sessions, session.user.id);
      await this.mergeDataWithLocal('participants', serverData.participants, session.user.id);
      await this.mergeDataWithLocal('attendance', serverData.attendance, session.user.id);

      // ============================================
      // STEP 3: UPLOAD LOCAL CHANGES TO SERVER
      // ============================================
      console.log('[SyncService] STEP 3: Uploading local changes to server...');
      
      const localClubs = await dataService.getClubs();
      const uploadedIds: any = {
        sessions: new Set<string>(),
        participants: new Set<string>()
      };

      // Upload local-only clubs
      for (const club of localClubs) {
        if (club.id.startsWith('local-')) {
          await this.uploadLocalClub(club, session.user.id, uploadedIds);
        } else if (club.owner_id === session.user.id) {
          // Upload updates for clubs we own
          await this.uploadToSupabase('clubs', club, 'UPDATE');
        }
      }

      // Upload sessions/participants/attendance for all clubs
      for (const club of localClubs) {
        const isOwner = club.owner_id === session.user.id;
        
        // Upload sessions
        const localSessions = await dataService.getSessions(club.id);
        for (const session of localSessions) {
          const isLocal = session.id.startsWith('local-');
          const serverSession = await this.uploadToSupabase('sessions', session, isLocal ? 'INSERT' : 'UPDATE');
          if (serverSession && isLocal) {
            uploadedIds.sessions.add(serverSession.id);
            await this.updateLocalId('sessions', session.id, serverSession.id);
          }
        }

        // Upload participants
        const localParticipants = await dataService.getParticipants(club.id);
        for (const participant of localParticipants) {
          const isLocal = participant.id.startsWith('local-');
          const serverParticipant = await this.uploadToSupabase('participants', participant, isLocal ? 'INSERT' : 'UPDATE');
          if (serverParticipant && isLocal) {
            uploadedIds.participants.add(serverParticipant.id);
            await this.updateLocalId('participants', participant.id, serverParticipant.id);
          }
        }

        // Upload attendance
        const allAttendance = await AsyncStorage.getItem('@presence_app:attendance');
        if (allAttendance) {
          const attendanceList = JSON.parse(allAttendance);
          console.log(`[SyncService] Found ${attendanceList.length} total attendance records in storage`);
          
          const clubSessionIds = new Set(localSessions.map(s => s.id));
          const clubAttendance = attendanceList.filter((a: any) => clubSessionIds.has(a.session_id));
          console.log(`[SyncService] Found ${clubAttendance.length} attendance records for this club`);
          
          // UUID validation regex
          const isValidUUID = (id: string) => {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            return !id || id === 'undefined' || uuidRegex.test(id);
          };
          
          let uploadedCount = 0;
          let skippedCount = 0;
          
          for (const attendance of clubAttendance) {
            // Skip if has local IDs, missing required fields, or invalid UUID format
            if (attendance.participant_id?.startsWith('local-') || 
                attendance.session_id?.startsWith('local-') ||
                !attendance.participant_id ||
                !attendance.session_id ||
                !isValidUUID(attendance.id) ||
                !isValidUUID(attendance.participant_id) ||
                !isValidUUID(attendance.session_id)) {
              console.log('[SyncService] Skipping invalid attendance record:', {
                id: attendance.id,
                participant_id: attendance.participant_id,
                session_id: attendance.session_id,
                date: attendance.date
              });
              skippedCount++;
              continue;
            }
            console.log('[SyncService] Uploading attendance record:', {
              id: attendance.id,
              participant_id: attendance.participant_id,
              session_id: attendance.session_id,
              date: attendance.date,
              present: attendance.present
            });
            try {
              await this.uploadToSupabase('attendance', attendance, 'UPDATE');
              uploadedCount++;
              console.log('[SyncService] ✅ Attendance record uploaded successfully');
            } catch (error) {
              console.error('[SyncService] ❌ Failed to upload attendance record:', error);
            }
          }
          
          console.log(`[SyncService] Attendance sync summary: ${uploadedCount} uploaded, ${skippedCount} skipped`);
        } else {
          console.log('[SyncService] No attendance records found in storage');
        }
      }

      // ============================================
      // STEP 4: DELETE ITEMS MARKED FOR DELETION
      // Only delete items explicitly marked by user
      // ============================================
      console.log('[SyncService] STEP 4: Deleting items marked for removal...');
      
      await this.deleteMarkedItems('sessions');
      await this.deleteMarkedItems('participants');
      await this.deleteMarkedItems('attendance');
      await this.deleteMarkedItems('clubs');

      // Update last sync time
      await this.updateLastSyncTime();
      const newLastSync = await this.getLastSyncTime();
      this.notifyListeners({ isSyncing: false, lastSync: newLastSync, error: null });
      
      console.log('[SyncService] ========================================');
      console.log('[SyncService] Sync completed successfully!');
      console.log('[SyncService] ========================================');
      return true;

    } catch (error) {
      console.error('[SyncService] Sync error:', error);
      this.notifyListeners({ 
        isSyncing: false, 
        lastSync: await this.getLastSyncTime(), 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return false;
    } finally {
      this.isSyncing = false;
    }
  };

  private syncClub = async (
    clubId: string, 
    since: Date, 
    skipSessionIds: Set<string> = new Set(), 
    skipParticipantIds: Set<string> = new Set()
  ) => {
    try {
      console.log(`[SyncService] 🔄 Syncing club ${clubId} since ${since.toISOString()}`);

      // Get changes from server using direct queries (no sync_log needed)
      // For simplified schema, we just fetch all data newer than 'since'
      const sinceStr = since.toISOString();

      // Fetch club data (updated since last sync)
      const { data: clubData } = await supabase
        .from('clubs')
        .select('*')
        .eq('id', clubId)
        .or(`created_at.gte.${sinceStr},updated_at.gte.${sinceStr}`);

      // Fetch sessions for this club (updated since last sync)
      console.log(`[SyncService] 🔍 Querying sessions: club_id=${clubId}, since=${sinceStr}`);
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select('*')
        .eq('club_id', clubId)
        .or(`created_at.gte.${sinceStr},updated_at.gte.${sinceStr}`);

      if (sessionsError) {
        console.error('[SyncService] ❌ Sessions query error:', sessionsError);
      }
      console.log(`[SyncService] 📥 Server returned ${sessionsData?.length || 0} sessions`);
      if (sessionsData && sessionsData.length > 0) {
        sessionsData.forEach((session, idx) => {
          console.log(`[SyncService] Session ${idx + 1}:`);
          console.log(`  - id: ${session.id}`);
          console.log(`  - day_of_week: ${session.day_of_week}`);
          console.log(`  - start_time: ${session.start_time}`);
          console.log(`  - end_time: ${session.end_time}`);
          console.log(`  - created_at: ${session.created_at}`);
          console.log(`  - updated_at: ${session.updated_at}`);
        });
      }

      // Fetch participants for this club (updated since last sync)
      const { data: participantsData } = await supabase
        .from('participants')
        .select('*')
        .eq('club_id', clubId)
        .or(`created_at.gte.${sinceStr},updated_at.gte.${sinceStr}`);

      console.log(`[SyncService] 📥 Server returned ${participantsData?.length || 0} participants`);
      if (participantsData && participantsData.length > 0) {
        console.log('[SyncService] Participants from server:', JSON.stringify(participantsData, null, 2));
      }

      // Fetch participant_sessions for participants in this club
      const { data: participantSessionsData } = await supabase
        .from('participant_sessions')
        .select('*, participants!inner(club_id)')
        .eq('participants.club_id', clubId)
        .or(`created_at.gte.${sinceStr},updated_at.gte.${sinceStr}`);

      console.log(`[SyncService] 📥 Server returned ${participantSessionsData?.length || 0} participant_sessions`);

      // Fetch attendance for participants in this club
      const { data: attendanceData } = await supabase
        .from('attendance')
        .select('*, participants!inner(club_id)')
        .eq('participants.club_id', clubId)
        .gte('created_at', sinceStr);

      let hasChanges = false;

      // Apply changes to local storage (filter out IDs we just uploaded to prevent duplicates)
      if (clubData && clubData.length > 0) {
        await this.syncTableRecords('clubs', clubData);
        hasChanges = true;
      }
      if (sessionsData && sessionsData.length > 0) {
        const filteredSessions = sessionsData.filter(s => !skipSessionIds.has(s.id));
        if (filteredSessions.length > 0) {
          console.log(`[SyncService] Filtered ${sessionsData.length - filteredSessions.length} just-uploaded sessions`);
          await this.syncTableRecords('sessions', filteredSessions);
        }
        hasChanges = true;
      }
      if (participantsData && participantsData.length > 0) {
        const filteredParticipants = participantsData.filter(p => !skipParticipantIds.has(p.id));
        if (filteredParticipants.length > 0) {
          console.log(`[SyncService] Filtered ${participantsData.length - filteredParticipants.length} just-uploaded participants`);
          await this.syncTableRecords('participants', filteredParticipants);
        }
        hasChanges = true;
      }
      if (participantSessionsData && participantSessionsData.length > 0) {
        await this.syncTableRecords('participant_sessions', participantSessionsData);
        hasChanges = true;
      }
      if (attendanceData && attendanceData.length > 0) {
        await this.syncTableRecords('attendance', attendanceData);
        hasChanges = true;
      }

      if (!hasChanges) {
        console.log(`No changes for club ${clubId}`);
      } else {
        console.log(`Synced changes for club ${clubId}`);
      }

    } catch (error) {
      console.error(`Error syncing club ${clubId}:`, error);
    }
  };

  private syncTableRecords = async (tableName: string, records: any[]) => {
    const storageKey = this.getStorageKey(tableName);
    const local = await AsyncStorage.getItem(storageKey);
    let localRecords = local ? JSON.parse(local) : [];

    console.log(`Syncing ${records.length} records to ${tableName}`);

    // Merge server records into local storage
    for (const serverRecord of records) {
      const existingIndex = localRecords.findIndex((r: any) => r.id === serverRecord.id);
      
      if (existingIndex >= 0) {
        const localRecord = localRecords[existingIndex];
        
        // For clubs, participants, and participant_sessions, always trust server
        // since owner makes changes and pushes them up
        if (['clubs', 'participants', 'participant_sessions'].includes(tableName)) {
          console.log(`[SyncService] Updating ${tableName} from server:`, serverRecord.id);
          localRecords[existingIndex] = { ...localRecord, ...serverRecord };
        } else {
          // For sessions and attendance, compare timestamps
          const serverUpdated = serverRecord.updated_at || serverRecord.created_at;
          const localUpdated = localRecord.updated_at || localRecord.created_at;
          
          if (serverUpdated && localUpdated) {
            const serverTime = new Date(serverUpdated).getTime();
            const localTime = new Date(localUpdated).getTime();
            
            if (serverTime > localTime) {
              console.log(`[SyncService] Server ${tableName} is newer, updating local:`, serverRecord.id);
              localRecords[existingIndex] = { ...localRecord, ...serverRecord };
            } else {
              console.log(`[SyncService] Local ${tableName} is newer, keeping local:`, serverRecord.id);
            }
          } else {
            console.log(`[SyncService] No timestamps, updating ${tableName}:`, serverRecord.id);
            localRecords[existingIndex] = { ...localRecord, ...serverRecord };
          }
        }
      } else {
        // Add new record from server
        console.log(`[SyncService] Adding new ${tableName} record from server:`, serverRecord.id);
        localRecords.push(serverRecord);
      }
    }

    await AsyncStorage.setItem(storageKey, JSON.stringify(localRecords));
    console.log(`[SyncService] Total ${tableName} in local storage:`, localRecords.length);
  };

  private getStorageKey = (tableName: string): string => {
    const keyMap: Record<string, string> = {
      'clubs': '@presence_app:clubs',
      'sessions': '@presence_app:sessions',
      'participants': '@presence_app:participants',
      'attendance': '@presence_app:attendance',
      'participant_sessions': '@presence_app:participant_sessions'
    };
    return keyMap[tableName] || `@presence_app:${tableName}`;
  };

  private getLastSyncTime = async (): Promise<Date | null> => {
    const timestamp = await AsyncStorage.getItem(LAST_SYNC_KEY);
    return timestamp ? new Date(timestamp) : null;
  };

  private updateLastSyncTime = async () => {
    await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  };

  // Upload local data to server
  uploadToSupabase = async (
    table: string,
    record: any,
    operation: 'INSERT' | 'UPDATE' | 'DELETE'
  ): Promise<any> => {
    try {
      const session = await authManager.getSession();
      if (!session) {
        console.log('Not authenticated, cannot upload');
        return null;
      }

      if (operation === 'DELETE') {
        // Skip delete if record is local-only (never uploaded to server)
        if (record.id?.startsWith('local-')) {
          console.log(`[SyncService] Skipping delete of local-only record: ${record.id}`);
          return null;
        }
        
        // Direct delete from table (no soft deletes in simplified schema)
        console.log(`[SyncService] Deleting ${table} record:`, record.id);
        const { data, error } = await supabase
          .from(table)
          .delete()
          .eq('id', record.id)
          .select()
          .maybeSingle(); // Use maybeSingle() instead of single() to allow 0 results
        
        if (error) {
          console.error(`[SyncService] Delete error:`, error);
          throw error;
        }
        
        if (!data) {
          console.log(`[SyncService] Record already deleted from server: ${record.id}`);
        } else {
          console.log(`[SyncService] ✅ Deleted ${table}:`, record.id);
        }
        return data;
      } else if (operation === 'INSERT' || operation === 'UPDATE') {
        // For UPDATE operations on sessions/attendance, check if local data is newer
        // For clubs/participants/participant_sessions, always upload (owner is source of truth)
        if (operation === 'UPDATE' && record.id && !record.id.startsWith('local-') && !['clubs', 'participants', 'participant_sessions'].includes(table)) {
          const { data: serverRecord } = await supabase
            .from(table)
            .select('updated_at')
            .eq('id', record.id)
            .single();
          
          if (serverRecord?.updated_at && record.updated_at) {
            const serverTime = new Date(serverRecord.updated_at).getTime();
            const localTime = new Date(record.updated_at).getTime();
            
            if (localTime <= serverTime) {
              console.log(`[SyncService] Skipping upload - server data is newer for ${table}:`, record.id);
              return serverRecord;
            }
          }
        }
        
        // Prepare record for upload (remove local-only fields and map to new schema)
        const cleanRecord: any = { ...record };
        delete cleanRecord.preferred_session_ids; // This is handled by participant_sessions table
        
        // Map old fields to new schema
        if (table === 'clubs') {
          // Clubs: keep only id, name, description, owner_id, updated_at
          const { id, name, description, owner_id, updated_at } = cleanRecord;
          const mappedRecord: any = { 
            name, 
            description,
            owner_id: owner_id || session.user.id, // Ensure owner_id is set
            updated_at: updated_at || new Date().toISOString() // Preserve local timestamp
          };
          
          if (operation === 'UPDATE' && id && !id.startsWith('local-')) {
            // Use UPDATE for existing clubs to avoid triggering INSERT constraint
            const { data, error } = await supabase
              .from(table)
              .update(mappedRecord)
              .eq('id', id)
              .select()
              .single();
            
            if (error) throw error;
            return data;
          } else {
            // Use upsert for INSERT operations
            if (id && !id.startsWith('local-')) mappedRecord.id = id;
            
            const { data, error } = await supabase
              .from(table)
              .upsert(mappedRecord, { onConflict: 'id' })
              .select()
              .single();
            
            if (error) throw error;
            return data;
          }
        } else if (table === 'sessions') {
          // Sessions: keep day_of_week, start_time, end_time (updated_at is handled by DB trigger)
          const { id, club_id, day_of_week, start_time, end_time } = cleanRecord;
          const mappedRecord: any = { 
            club_id,
            day_of_week,
            start_time,
            end_time
            // Don't send updated_at - let database trigger handle it
          };
          if (id && !id.startsWith('local-')) mappedRecord.id = id;
          
          console.log('[SyncService] Uploading session:', mappedRecord);
          
          const { data, error } = await supabase
            .from(table)
            .upsert(mappedRecord, { onConflict: 'id' })
            .select()
            .single();
          
          if (error) {
            console.error('[SyncService] Session upload error:', error);
            throw error;
          }
          console.log('[SyncService] Session upload response:', data);
          return data;
        } else if (table === 'participants') {
          // Participants: keep only id, club_id, first_name, last_name, is_long_term_sick (updated_at is handled by DB trigger)
          const { id, club_id, first_name, last_name, is_long_term_sick } = cleanRecord;
          const mappedRecord: any = { 
            club_id,
            first_name,
            last_name,
            is_long_term_sick: is_long_term_sick || false
            // Don't send updated_at - let database trigger handle it
          };
          if (id && !id.startsWith('local-')) mappedRecord.id = id;
          
          const { data, error } = await supabase
            .from(table)
            .upsert(mappedRecord, { onConflict: 'id' })
            .select()
            .single();
          
          if (error) throw error;
          return data;
        } else if (table === 'participant_sessions') {
          // Participant_sessions: keep participant_id, session_id
          const { id, participant_id, session_id } = cleanRecord;
          const mappedRecord: any = { 
            participant_id,
            session_id
          };
          if (id && !id.startsWith('local-')) mappedRecord.id = id;
          
          const { data, error } = await supabase
            .from(table)
            .upsert(mappedRecord, { onConflict: 'id' })
            .select()
            .single();
          
          if (error) throw error;
          return data;
        } else if (table === 'attendance') {
          // Attendance: keep participant_id, session_id, date, present
          // Note: Use UPSERT with unique constraint on (participant_id, session_id, date)
          const { id, participant_id, session_id, date, present } = cleanRecord;
          console.log('[SyncService] Uploading attendance - id:', id, 'participant_id:', participant_id, 'session_id:', session_id);
          
          const mappedRecord: any = { 
            participant_id,
            session_id,
            date,
            present: present || false
          };
          
          // Always use UPSERT with the natural key (participant_id, session_id, date)
          // The database has a unique constraint on these three fields
          console.log('[SyncService] Upserting attendance record:', mappedRecord);
          const { data, error } = await supabase
            .from(table)
            .upsert(mappedRecord, { 
              onConflict: 'participant_id,session_id,date',
              ignoreDuplicates: false 
            })
            .select()
            .single();
          
          if (error) {
            console.error('[SyncService] Upsert attendance error:', error);
            throw error;
          }
          console.log('[SyncService] Upsert attendance success:', data);
          return data;
        } else {
          // Other tables: use as-is
          const { data, error } = await supabase
            .from(table)
            .upsert(cleanRecord)
            .select()
            .single();
          
          if (error) throw error;
          return data;
        }
      }
    } catch (error) {
      console.error(`Error uploading to ${table}:`, error);
      throw error;
    }
  };

  // ============================================
  // HELPER FUNCTIONS FOR NEW SYNC LOGIC
  // ============================================

  /**
   * Merge server data with local data based on timestamps
   * Server data takes precedence if it's newer or if local doesn't exist
   */
  private mergeDataWithLocal = async (type: 'clubs' | 'sessions' | 'participants' | 'attendance', serverRecords: any[], userId: string): Promise<void> => {
    const storageKey = this.getStorageKey(type);
    const localData = await AsyncStorage.getItem(storageKey);
    const localRecords = localData ? JSON.parse(localData) : [];
    
    console.log(`[SyncService] Merging ${serverRecords.length} ${type} from server with ${localRecords.length} local records`);

    // Get list of IDs marked for deletion - DON'T re-add these!
    const deletedIds = await dataService.getDeletedIds(type);
    const deletedIdsSet = new Set(deletedIds);
    
    if (deletedIds.length > 0) {
      console.log(`[SyncService] Found ${deletedIds.length} ${type} marked for deletion - will skip these`);
    }

    // Create a map of local records by ID for quick lookup
    const localMap = new Map(localRecords.map((r: any) => [r.id, r]));
    const mergedRecords = [...localRecords];

    for (const serverRecord of serverRecords) {
      // CRITICAL: Skip items marked for deletion
      if (deletedIdsSet.has(serverRecord.id)) {
        console.log(`[SyncService] Skipping ${type} marked for deletion: ${serverRecord.id}`);
        continue;
      }

      const localRecord = localMap.get(serverRecord.id);

      if (!localRecord) {
        // New record from server, add it
        console.log(`[SyncService] Adding new ${type} from server: ${serverRecord.id}`);
        mergedRecords.push(serverRecord);
      } else {
        // Check if user is owner for this entity
        let isOwner = false;
        if (type === 'clubs') {
          isOwner = serverRecord.owner_id === userId;
        } else if (type === 'sessions' || type === 'participants') {
          // For sessions/participants, check club ownership
          const clubs = await dataService.getClubs();
          const club = clubs.find(c => c.id === serverRecord.club_id);
          isOwner = club?.owner_id === userId;
        } else if (type === 'attendance') {
          // For attendance, always use timestamp conflict resolution
          isOwner = true; // Treat everyone as having edit rights
        }

        if (!isOwner && type !== 'attendance') {
          // Non-owner for clubs/sessions/participants: server ALWAYS wins
          console.log(`[SyncService] Non-owner: Server ${type} overrides local: ${serverRecord.id}`);
          const index = mergedRecords.findIndex((r: any) => r.id === serverRecord.id);
          if (index >= 0) {
            mergedRecords[index] = serverRecord;
          }
        } else {
          // Owner or attendance: compare timestamps
          const serverTime = new Date(serverRecord.updated_at || serverRecord.created_at).getTime();
          const localTime = new Date(localRecord.updated_at || localRecord.created_at).getTime();

          if (serverTime > localTime) {
            // Server is newer, update local
            console.log(`[SyncService] Server ${type} is newer, updating local: ${serverRecord.id}`);
            const index = mergedRecords.findIndex((r: any) => r.id === serverRecord.id);
            if (index >= 0) {
              mergedRecords[index] = { ...localRecord, ...serverRecord };
            }
          } else {
            console.log(`[SyncService] Local ${type} is newer or same, keeping local: ${localRecord.id}`);
          }
        }
      }
    }

    await AsyncStorage.setItem(storageKey, JSON.stringify(mergedRecords));
    console.log(`[SyncService] Merged ${type}: ${mergedRecords.length} total records`);
  };

  /**
   * Upload a local-only club and all its data
   */
  private uploadLocalClub = async (club: any, userId: string, uploadedIds: any): Promise<void> => {
    console.log('[SyncService] Uploading local club:', club.name);
    try {
      const oldClubId = club.id;
      
      // Check if club already exists on server (by name and owner_id)
      const { data: existingClubs } = await supabase
        .from('clubs')
        .select('*')
        .eq('name', club.name)
        .eq('owner_id', userId)
        .limit(1);
      
      let serverClub;
      
      if (existingClubs && existingClubs.length > 0) {
        serverClub = existingClubs[0];
        console.log('[SyncService] Club already exists on server:', serverClub.id);
      } else {
        // Insert new club
        const { data: newClub, error: insertError } = await supabase
          .from('clubs')
          .insert({
            name: club.name,
            description: club.description || '',
            owner_id: userId,
            updated_at: club.updated_at || new Date().toISOString()
          })
          .select()
          .single();
        
        if (insertError) throw insertError;
        serverClub = newClub;
        
        // Add owner as club member
        await supabase
          .from('club_members')
          .insert({
            club_id: serverClub.id,
            user_id: userId
          });
      }
      
      // Update local club ID
      await this.updateLocalId('clubs', oldClubId, serverClub.id);
      
      // Upload sessions for this club
      const sessions = await dataService.getSessions(serverClub.id);
      for (const session of sessions) {
        if (session.id.startsWith('local-')) {
          const serverSession = await this.uploadToSupabase('sessions', { ...session, club_id: serverClub.id }, 'INSERT');
          if (serverSession) {
            uploadedIds.sessions.add(serverSession.id);
            await this.updateLocalId('sessions', session.id, serverSession.id);
          }
        }
      }
      
      // Upload participants for this club
      const participants = await dataService.getParticipants(serverClub.id);
      for (const participant of participants) {
        if (participant.id.startsWith('local-')) {
          const serverParticipant = await this.uploadToSupabase('participants', { ...participant, club_id: serverClub.id }, 'INSERT');
          if (serverParticipant) {
            uploadedIds.participants.add(serverParticipant.id);
            await this.updateLocalId('participants', participant.id, serverParticipant.id);
          }
        }
      }
      
      console.log('[SyncService] ✅ Local club uploaded:', serverClub.name);
    } catch (error) {
      console.error('[SyncService] Failed to upload local club:', error);
    }
  };

  /**
   * Update a local ID to match the server ID
   */
  private updateLocalId = async (type: 'clubs' | 'sessions' | 'participants', oldId: string, newId: string): Promise<void> => {
    const storageKey = this.getStorageKey(type);
    const data = await AsyncStorage.getItem(storageKey);
    if (!data) return;

    const records = JSON.parse(data);
    const updatedRecords = records.map((r: any) => 
      r.id === oldId ? { ...r, id: newId } : r
    );
    await AsyncStorage.setItem(storageKey, JSON.stringify(updatedRecords));

    // Also update references in other tables
    if (type === 'sessions') {
      // Update attendance records
      const attendanceData = await AsyncStorage.getItem('@presence_app:attendance');
      if (attendanceData) {
        const attendance = JSON.parse(attendanceData);
        const updated = attendance.map((a: any) => 
          a.session_id === oldId ? { ...a, session_id: newId } : a
        );
        await AsyncStorage.setItem('@presence_app:attendance', JSON.stringify(updated));
      }
    } else if (type === 'participants') {
      // Update attendance records
      const attendanceData = await AsyncStorage.getItem('@presence_app:attendance');
      if (attendanceData) {
        const attendance = JSON.parse(attendanceData);
        const updated = attendance.map((a: any) => 
          a.participant_id === oldId ? { ...a, participant_id: newId } : a
        );
        await AsyncStorage.setItem('@presence_app:attendance', JSON.stringify(updated));
      }
    } else if (type === 'clubs') {
      // Update sessions
      const sessionsData = await AsyncStorage.getItem('@presence_app:sessions');
      if (sessionsData) {
        const sessions = JSON.parse(sessionsData);
        const updated = sessions.map((s: any) => 
          s.club_id === oldId ? { ...s, club_id: newId } : s
        );
        await AsyncStorage.setItem('@presence_app:sessions', JSON.stringify(updated));
      }
      // Update participants
      const participantsData = await AsyncStorage.getItem('@presence_app:participants');
      if (participantsData) {
        const participants = JSON.parse(participantsData);
        const updated = participants.map((p: any) => 
          p.club_id === oldId ? { ...p, club_id: newId } : p
        );
        await AsyncStorage.setItem('@presence_app:participants', JSON.stringify(updated));
      }
    }

    console.log(`[SyncService] Updated ${type} ID: ${oldId} → ${newId}`);
  };

  /**
   * Delete items from server that are marked for deletion
   */
  private deleteMarkedItems = async (type: 'clubs' | 'sessions' | 'participants' | 'attendance'): Promise<void> => {
    const deletedIds = await dataService.getDeletedIds(type);
    
    if (deletedIds.length === 0) {
      return;
    }

    console.log(`[SyncService] Deleting ${deletedIds.length} marked ${type} from server`);

    for (const id of deletedIds) {
      // Skip invalid IDs (null, undefined, or local-only)
      if (!id || id === 'undefined' || id.startsWith('local-')) {
        console.log(`[SyncService] Skipping invalid/local-only ${type}: ${id}`);
        continue;
      }

      try {
        await supabase
          .from(type)
          .delete()
          .eq('id', id);
        
        console.log(`[SyncService] ✅ Deleted ${type} from server: ${id}`);
      } catch (error) {
        console.error(`[SyncService] Failed to delete ${type} ${id}:`, error);
      }
    }

    // Clear the deletion marks after successful sync
    await dataService.clearDeletedMarks(type, deletedIds);
  };

  // Join a club with share code - DISABLED (sharing removed from simplified schema)
  joinClubWithCode = async (_shareCode: string, _password?: string): Promise<string> => {
    throw new Error('Club sharing functionality has been removed in the simplified schema');
  };

  // Get club's share code - DISABLED (sharing removed from simplified schema)
  getClubShareCode = async (_clubId: string): Promise<string | null> => {
    return null; // Share codes removed from schema
  };

  // Subscribe to sync status updates
  onSyncStatusChange = (callback: (status: SyncStatus) => void) => {
    this.statusListeners.push(callback);
    
    // Return unsubscribe function
    return () => {
      this.statusListeners = this.statusListeners.filter(l => l !== callback);
    };
  };

  private notifyListeners = (status: SyncStatus) => {
    this.statusListeners.forEach(listener => listener(status));
  };

  // Get current sync status
  getSyncStatus = async (): Promise<SyncStatus> => {
    return {
      isSyncing: this.isSyncing,
      lastSync: await this.getLastSyncTime(),
      error: null
    };
  };
}

export const syncService = new SyncService();
