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
      console.log('Sync already in progress, skipping...');
      return false;
    }

    // Debounce: prevent syncs that are too close together
    const now = Date.now();
    if (now - this.lastSyncTime < MIN_SYNC_DELAY) {
      console.log('Sync called too soon after last sync, skipping...');
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

      console.log('[SyncService] Starting sync...');

      // Get last sync timestamp
      const lastSync = await this.getLastSyncTime();
      const since = lastSync || new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24h if first sync

      // First, upload any local-only clubs (created while offline)
      const localClubs = await dataService.getClubs();
      for (const club of localClubs) {
        if (club.id.startsWith('local-')) {
          console.log('[SyncService] Uploading local club:', club.name);
          try {
            const oldClubId = club.id;
            
            // Check if club already exists on server (by name and owner_id)
            const { data: existingClubs } = await supabase
              .from('clubs')
              .select('*')
              .eq('name', club.name)
              .eq('owner_id', session.user.id)
              .limit(1);
            
            let serverClub;
            
            if (existingClubs && existingClubs.length > 0) {
              // Club already exists, use existing one
              serverClub = existingClubs[0];
              console.log('[SyncService] Club already exists on server, using existing:', serverClub.id);
            } else {
              // Insert new club
              const { data: newClub, error: insertError } = await supabase
                .from('clubs')
                .insert({
                  name: club.name,
                  description: club.description || '',
                  owner_id: session.user.id
                })
                .select()
                .single();
              
              if (insertError) throw insertError;
              if (!newClub) {
                throw new Error('No club returned from insert');
              }
              serverClub = newClub;
            }
            
            // Update local club ID and save via dataService
            const updatedClub = {
              ...club,
              id: serverClub.id,
              owner_id: serverClub.owner_id,
              created_at: serverClub.created_at
            };
            
            // Update club in storage
            const updatedClubs = localClubs.map(c => 
              c.id === oldClubId ? updatedClub : c
            );
            await AsyncStorage.setItem('@presence_app:clubs', JSON.stringify(updatedClubs));
            
            // Also update and upload any local sessions/participants with the new club ID
            const sessions = await dataService.getSessions(oldClubId);
            if (sessions.length > 0) {
              console.log(`[SyncService] Uploading ${sessions.length} sessions for club ${serverClub.name}`);
              
              // Upload sessions to server and collect updated IDs
              const sessionIdMap = new Map(); // old ID -> new ID
              for (const session of sessions) {
                try {
                  const sessionToUpload = { ...session, club_id: serverClub.id };
                  const serverSession = await this.uploadToSupabase('sessions', sessionToUpload, 'INSERT');
                  if (serverSession) {
                    sessionIdMap.set(session.id, serverSession.id);
                    console.log(`[SyncService] ✅ Session uploaded: ${session.day_of_week} ${session.start_time}-${session.end_time}`);
                  }
                } catch (err) {
                  console.error('[SyncService] Failed to upload session:', err);
                }
              }
              
              // Update local sessions with server IDs and new club_id
              const allSessions = await AsyncStorage.getItem('@presence_app:sessions');
              const sessionsList = allSessions ? JSON.parse(allSessions) : [];
              const finalSessions = sessionsList.map((s: any) => {
                if (s.club_id === oldClubId) {
                  return {
                    ...s,
                    id: sessionIdMap.get(s.id) || s.id,
                    club_id: serverClub.id
                  };
                }
                return s;
              });
              await AsyncStorage.setItem('@presence_app:sessions', JSON.stringify(finalSessions));
            }
            
            const participants = await dataService.getParticipants(oldClubId);
            if (participants.length > 0) {
              console.log(`[SyncService] Uploading ${participants.length} participants for club ${serverClub.name}`);
              
              // Upload participants to server and collect updated IDs
              const participantIdMap = new Map(); // old ID -> new ID
              for (const participant of participants) {
                try {
                  const participantToUpload = { ...participant, club_id: serverClub.id };
                  const serverParticipant = await this.uploadToSupabase('participants', participantToUpload, 'INSERT');
                  if (serverParticipant) {
                    participantIdMap.set(participant.id, serverParticipant.id);
                    console.log(`[SyncService] ✅ Participant uploaded: ${participant.first_name} ${participant.last_name}`);
                  }
                } catch (err) {
                  console.error('[SyncService] Failed to upload participant:', err);
                }
              }
              
              // Update local participants with server IDs and new club_id
              const allParticipants = await AsyncStorage.getItem('@presence_app:participants');
              const participantsList = allParticipants ? JSON.parse(allParticipants) : [];
              const finalParticipants = participantsList.map((p: any) => {
                if (p.club_id === oldClubId) {
                  return {
                    ...p,
                    id: participantIdMap.get(p.id) || p.id,
                    club_id: serverClub.id
                  };
                }
                return p;
              });
              await AsyncStorage.setItem('@presence_app:participants', JSON.stringify(finalParticipants));
            }
            
            console.log('[SyncService] ✅ Club uploaded:', serverClub.name, 'ID:', serverClub.id);
          } catch (error) {
            console.error('[SyncService] Failed to upload local club:', error);
          }
        }
      }

      // Get user's clubs (now based on owner_id instead of club_members)
      const { data: userClubs } = await supabase
        .from('clubs')
        .select('id')
        .eq('owner_id', session.user.id);

      if (!userClubs || userClubs.length === 0) {
        console.log('No clubs to sync from server');
        await this.updateLastSyncTime();
        return true;
      }

      // Sync sessions/participants for existing clubs (local is source of truth)
      const uploadedSessionIds = new Set<string>(); // Track IDs of sessions we just uploaded
      const uploadedParticipantIds = new Set<string>(); // Track IDs of participants we just uploaded
      
      for (const club of userClubs) {
        // === SESSIONS SYNC ===
        const localSessions = await dataService.getSessions(club.id);
        
        // Fetch current server sessions
        const { data: serverSessions } = await supabase
          .from('sessions')
          .select('id')
          .eq('club_id', club.id);
        
        const serverSessionIds = new Set(serverSessions?.map(s => s.id) || []);
        const localSessionIds = new Set(localSessions.filter(s => !s.id.startsWith('local-')).map(s => s.id));
        
        // Delete sessions from server that don't exist locally
        for (const serverId of serverSessionIds) {
          if (!localSessionIds.has(serverId)) {
            try {
              console.log(`[SyncService] Deleting session from server: ${serverId}`);
              await supabase.from('sessions').delete().eq('id', serverId);
            } catch (err) {
              console.error('[SyncService] Failed to delete session:', err);
            }
          }
        }
        
        // Push all local sessions to server
        if (localSessions.length > 0) {
          console.log(`[SyncService] Syncing ${localSessions.length} sessions for club ${club.id}`);
          for (const session of localSessions) {
            try {
              const isLocal = session.id.startsWith('local-');
              const serverSession = await this.uploadToSupabase('sessions', session, isLocal ? 'INSERT' : 'UPDATE');
              if (serverSession) {
                uploadedSessionIds.add(serverSession.id); // Track this ID
                if (isLocal) {
                  // Update local session with server ID immediately
                  const allSessions = await AsyncStorage.getItem('@presence_app:sessions');
                  const sessionsList = allSessions ? JSON.parse(allSessions) : [];
                  const updatedSessions = sessionsList.map((s: any) => 
                    s.id === session.id ? { ...s, id: serverSession.id } : s
                  );
                  await AsyncStorage.setItem('@presence_app:sessions', JSON.stringify(updatedSessions));
                  // Update the session object too so subsequent operations use the new ID
                  session.id = serverSession.id;
                  console.log(`[SyncService] ✅ Session uploaded: ${session.day_of_week} ${session.start_time}-${session.end_time}`);
                }
              }
            } catch (err) {
              console.error('[SyncService] Failed to upload session:', err);
            }
          }
        }

        // === PARTICIPANTS SYNC ===
        const localParticipants = await dataService.getParticipants(club.id);
        
        // Fetch current server participants
        const { data: serverParticipants } = await supabase
          .from('participants')
          .select('id')
          .eq('club_id', club.id);
        
        const serverParticipantIds = new Set(serverParticipants?.map(p => p.id) || []);
        const localParticipantIds = new Set(localParticipants.filter(p => !p.id.startsWith('local-')).map(p => p.id));
        
        // Delete participants from server that don't exist locally
        for (const serverId of serverParticipantIds) {
          if (!localParticipantIds.has(serverId)) {
            try {
              console.log(`[SyncService] Deleting participant from server: ${serverId}`);
              await supabase.from('participants').delete().eq('id', serverId);
            } catch (err) {
              console.error('[SyncService] Failed to delete participant:', err);
            }
          }
        }
        
        // Push all local participants to server
        if (localParticipants.length > 0) {
          console.log(`[SyncService] Syncing ${localParticipants.length} participants for club ${club.id}`);
          for (const participant of localParticipants) {
            try {
              const isLocal = participant.id.startsWith('local-');
              const serverParticipant = await this.uploadToSupabase('participants', participant, isLocal ? 'INSERT' : 'UPDATE');
              if (serverParticipant && isLocal) {
                // Update local participant with server ID immediately
                const allParticipants = await AsyncStorage.getItem('@presence_app:participants');
                const participantsList = allParticipants ? JSON.parse(allParticipants) : [];
                const updatedParticipants = participantsList.map((p: any) => 
                  p.id === participant.id ? { ...p, id: serverParticipant.id } : p
                );
                await AsyncStorage.setItem('@presence_app:participants', JSON.stringify(updatedParticipants));
                // Update the participant object too so subsequent operations use the new ID
                participant.id = serverParticipant.id;
                console.log(`[SyncService] ✅ Participant uploaded: ${participant.first_name} ${participant.last_name}`);
              }
            } catch (err) {
              console.error('[SyncService] Failed to upload participant:', err);
            }
          }
        }
      }

      // Sync each club (download changes from server, skipping IDs we just uploaded)
      for (const club of userClubs) {
        await this.syncClub(club.id, since, uploadedSessionIds, uploadedParticipantIds);
      }

      // Update last sync time
      await this.updateLastSyncTime();
      
      const newLastSync = await this.getLastSyncTime();
      this.notifyListeners({ isSyncing: false, lastSync: newLastSync, error: null });
      
      console.log('Sync completed successfully');
      return true;

    } catch (error) {
      console.error('Sync error:', error);
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
      console.log(`Syncing club ${clubId} since ${since.toISOString()}`);

      // Get changes from server using direct queries (no sync_log needed)
      // For simplified schema, we just fetch all data newer than 'since'
      const sinceStr = since.toISOString();

      // Fetch club data
      const { data: clubData } = await supabase
        .from('clubs')
        .select('*')
        .eq('id', clubId)
        .gte('created_at', sinceStr);

      // Fetch sessions for this club
      const { data: sessionsData } = await supabase
        .from('sessions')
        .select('*')
        .eq('club_id', clubId)
        .gte('created_at', sinceStr);

      // Fetch participants for this club
      const { data: participantsData } = await supabase
        .from('participants')
        .select('*')
        .eq('club_id', clubId)
        .gte('created_at', sinceStr);

      // Fetch participant_sessions for participants in this club
      const { data: participantSessionsData } = await supabase
        .from('participant_sessions')
        .select('*, participants!inner(club_id)')
        .eq('participants.club_id', clubId)
        .gte('created_at', sinceStr);

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
      const existing = localRecords.findIndex((r: any) => r.id === serverRecord.id);
      if (existing >= 0) {
        // Update existing record, but preserve local fields if server doesn't have them
        console.log(`[SyncService] Updating existing ${tableName} record:`, serverRecord.id);
        localRecords[existing] = { ...localRecords[existing], ...serverRecord };
      } else {
        // Add new record
        console.log(`[SyncService] Adding new ${tableName} record:`, serverRecord.id);
        localRecords.push(serverRecord);
      }
    }

    await AsyncStorage.setItem(storageKey, JSON.stringify(localRecords));
    console.log(`[SyncService] Total ${tableName} in local storage:`, localRecords.length);
  };

  private getStorageKey = (tableName: string): string => {
    const keyMap: Record<string, string> = {
      'clubs': 'clubs',
      'sessions': 'sessions',
      'participants': 'participants',
      'attendance': 'attendance',
      'participant_sessions': 'participant_sessions'
    };
    return keyMap[tableName] || tableName;
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
        if (record.id.startsWith('local-')) {
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
          .single();
        
        if (error) {
          console.error(`[SyncService] Delete error:`, error);
          throw error;
        }
        console.log(`[SyncService] ✅ Deleted ${table}:`, record.id);
        return data;
      } else if (operation === 'INSERT' || operation === 'UPDATE') {
        // Prepare record for upload (remove local-only fields and map to new schema)
        const cleanRecord: any = { ...record };
        delete cleanRecord.preferred_session_ids; // This is handled by participant_sessions table
        
        // Map old fields to new schema
        if (table === 'clubs') {
          // Clubs: keep only id, name, description, owner_id
          const { id, name, description, owner_id } = cleanRecord;
          const mappedRecord: any = { 
            name, 
            description,
            owner_id: owner_id || session.user.id // Ensure owner_id is set
          };
          if (id && !id.startsWith('local-')) mappedRecord.id = id;
          
          const { data, error } = await supabase
            .from(table)
            .upsert(mappedRecord)
            .select()
            .single();
          
          if (error) throw error;
          return data;
        } else if (table === 'sessions') {
          // Sessions: keep day_of_week, start_time, end_time as-is
          const { id, club_id, day_of_week, start_time, end_time } = cleanRecord;
          const mappedRecord: any = { 
            club_id,
            day_of_week,
            start_time,
            end_time
          };
          if (id && !id.startsWith('local-')) mappedRecord.id = id;
          
          console.log('[SyncService] Uploading session:', mappedRecord);
          
          const { data, error } = await supabase
            .from(table)
            .upsert(mappedRecord)
            .select()
            .single();
          
          if (error) {
            console.error('[SyncService] Session upload error:', error);
            throw error;
          }
          console.log('[SyncService] Session upload response:', data);
          return data;
        } else if (table === 'participants') {
          // Participants: keep only id, club_id, first_name, last_name, is_long_term_sick
          const { id, club_id, first_name, last_name, is_long_term_sick } = cleanRecord;
          const mappedRecord: any = { 
            club_id,
            first_name,
            last_name,
            is_long_term_sick: is_long_term_sick || false
          };
          if (id && !id.startsWith('local-')) mappedRecord.id = id;
          
          const { data, error } = await supabase
            .from(table)
            .upsert(mappedRecord)
            .select()
            .single();
          
          if (error) throw error;
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
