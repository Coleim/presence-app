import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { authManager } from './authManager';
import { dataService, generateContentBasedId } from './dataService';

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
  private hasMigratedSessions = false; // Only migrate once per app session

  /**
   * One-time migration: Update sessions to use content-based hash IDs
   * This fixes sessions that were created with random UUIDs
   */
  private migrateSessionsToHashIds = async (): Promise<void> => {
    if (this.hasMigratedSessions) return;
    
    console.log('[Migration] Starting session ID migration to content hashes...');
    
    try {
      // Get all sessions from server
      const { data: serverSessions, error } = await supabase
        .from('sessions')
        .select('*');
      
      if (error || !serverSessions) {
        console.log('[Migration] Failed to fetch sessions:', error);
        return;
      }

      for (const session of serverSessions) {
        const contentKey = `session|${session.club_id}|${session.day_of_week}|${session.start_time}|${session.end_time}`;
        const hashId = generateContentBasedId(contentKey);
        
        if (session.id !== hashId) {
          console.log(`[Migration] Session needs migration:`);
          console.log(`  Old ID: ${session.id}`);
          console.log(`  New Hash ID: ${hashId}`);
          console.log(`  Content: ${session.day_of_week} ${session.start_time}-${session.end_time}`);
          
          // Check if a session with this hash already exists (duplicate)
          const { data: existing } = await supabase
            .from('sessions')
            .select('id')
            .eq('id', hashId)
            .maybeSingle();
          
          if (existing) {
            console.log(`  Hash ID already exists - will delete duplicate and update references`);
            
            // Update participant_sessions to point to the existing hash ID
            await supabase
              .from('participant_sessions')
              .update({ session_id: hashId })
              .eq('session_id', session.id);
            
            // Update attendance to point to existing hash ID
            await supabase
              .from('attendance')
              .update({ session_id: hashId })
              .eq('session_id', session.id);
            
            // Delete the duplicate session (the one with old UUID)
            await supabase
              .from('sessions')
              .delete()
              .eq('id', session.id);
            
            console.log(`  ✓ Merged duplicate into existing hash ID`);
          } else {
            // No duplicate - create new session with hash ID, update references, delete old
            
            // 1. Create new session with hash ID
            const { error: insertError } = await supabase
              .from('sessions')
              .insert({
                id: hashId,
                club_id: session.club_id,
                day_of_week: session.day_of_week,
                start_time: session.start_time,
                end_time: session.end_time
              });
            
            if (insertError) {
              console.log(`  ✗ Failed to create new session:`, insertError);
              continue;
            }
            
            // 2. Update participant_sessions to use new ID
            await supabase
              .from('participant_sessions')
              .update({ session_id: hashId })
              .eq('session_id', session.id);
            
            // 3. Update attendance to use new ID
            await supabase
              .from('attendance')
              .update({ session_id: hashId })
              .eq('session_id', session.id);
            
            // 4. Delete old session
            await supabase
              .from('sessions')
              .delete()
              .eq('id', session.id);
            
            console.log(`  ✓ Migrated to hash ID`);
          }
        }
      }
      
      // Also migrate local storage
      await this.migrateLocalSessionsToHashIds();
      
      this.hasMigratedSessions = true;
      console.log('[Migration] Session migration complete!');
      
    } catch (err) {
      console.log('[Migration] Error during migration:', err);
    }
  };

  /**
   * Migrate local sessions to hash IDs
   */
  private migrateLocalSessionsToHashIds = async (): Promise<void> => {
    console.log('[Migration] Migrating local sessions...');
    
    const sessionsData = await AsyncStorage.getItem('@presence_app:sessions');
    if (!sessionsData) return;
    
    const sessions = JSON.parse(sessionsData);
    const idMapping: Map<string, string> = new Map(); // old -> new
    const seenHashes = new Set<string>();
    const migratedSessions: any[] = [];
    
    for (const session of sessions) {
      const contentKey = `session|${session.club_id}|${session.day_of_week}|${session.start_time}|${session.end_time}`;
      const hashId = generateContentBasedId(contentKey);
      
      if (seenHashes.has(hashId)) {
        // Duplicate - skip this session but record mapping
        console.log(`  Skipping duplicate: ${session.id} -> ${hashId}`);
        idMapping.set(session.id, hashId);
        continue;
      }
      
      seenHashes.add(hashId);
      
      if (session.id !== hashId) {
        console.log(`  Migrating: ${session.id} -> ${hashId}`);
        idMapping.set(session.id, hashId);
        session.id = hashId;
      }
      
      migratedSessions.push(session);
    }
    
    // Save migrated sessions
    await AsyncStorage.setItem('@presence_app:sessions', JSON.stringify(migratedSessions));
    
    // Update participant_sessions references
    const psData = await AsyncStorage.getItem('@presence_app:participant_sessions');
    if (psData) {
      const participantSessions = JSON.parse(psData);
      const updatedPS = participantSessions.map((ps: any) => {
        const newId = idMapping.get(ps.session_id);
        if (newId) {
          console.log(`  PS: ${ps.session_id} -> ${newId}`);
          return { ...ps, session_id: newId };
        }
        return ps;
      });
      await AsyncStorage.setItem('@presence_app:participant_sessions', JSON.stringify(updatedPS));
    }
    
    // Update attendance references
    const attData = await AsyncStorage.getItem('@presence_app:attendance');
    if (attData) {
      const attendance = JSON.parse(attData);
      const updatedAtt = attendance.map((a: any) => {
        const newId = idMapping.get(a.session_id);
        if (newId) {
          return { ...a, session_id: newId };
        }
        return a;
      });
      await AsyncStorage.setItem('@presence_app:attendance', JSON.stringify(updatedAtt));
    }
    
    console.log(`[Migration] Local migration done. Migrated ${idMapping.size} session IDs.`);
  };

  // Start auto-sync every 30 seconds
  startAutoSync = async () => {
    if (this.syncInterval) {
      return; // Already running
    }
    
    // Initial sync (don't await to not block)
    this.syncNow().catch(() => {});
    
    // Set up interval
    this.syncInterval = setInterval(async () => {
      await this.syncNow();
    }, SYNC_INTERVAL);
  };

  stopAutoSync = () => {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  };

  syncNow = async (): Promise<boolean> => {
    if (this.isSyncing) {
      return false;
    }

    // Debounce: prevent syncs that are too close together
    const now = Date.now();
    if (now - this.lastSyncTime < MIN_SYNC_DELAY) {
      return false;
    }
    this.lastSyncTime = now;

    const syncStart = Date.now();
    const timer = (label: string, start: number) => {
      console.log(`⏱️ [SYNC TIMER] ${label}: ${Date.now() - start}ms`);
      return Date.now();
    };

    try {
      this.isSyncing = true;
      this.notifyListeners({ isSyncing: true, lastSync: await this.getLastSyncTime(), error: null });

      // Check if user is authenticated (using cached session)
      let stepStart = Date.now();
      const session = await authManager.getSession();
      stepStart = timer('Auth check', stepStart);
      
      if (!session) {
        this.isSyncing = false;
        return false;
      }

      // ============================================
      // STEP 0: MIGRATE SESSIONS TO HASH IDs (one-time)
      // ============================================
      await this.migrateSessionsToHashIds();
      stepStart = timer('Step 0 - Migration', stepStart);

      // ============================================
      // STEP 1: DOWNLOAD ALL DATA FROM SERVER FIRST
      // ============================================
      
      // Download all clubs user has access to
      const { data: serverClubs, error: clubsError } = await supabase
        .from('clubs')
        .select('*')
        .order('created_at', { ascending: false });
      


      // Download all data for these clubs
      const serverData: any = {
        clubs: serverClubs || [],
        sessions: [],
        participants: [],
        participant_sessions: [],
        attendance: []
      };

      if (serverClubs && serverClubs.length > 0) {
        const clubIds = serverClubs.map(c => c.id);

        // Download sessions and participants in PARALLEL (they're independent)
        const [sessionsResult, participantsResult] = await Promise.all([
          supabase.from('sessions').select('*').in('club_id', clubIds),
          supabase.from('participants').select('*').in('club_id', clubIds)
        ]);
        
        serverData.sessions = sessionsResult.data || [];
        serverData.participants = participantsResult.data || [];

        // Now download participant_sessions and attendance in PARALLEL
        // (they depend on results above but not on each other)
        const participantIds = serverData.participants.map((p: any) => p.id);
        const sessionIds = serverData.sessions.map((s: any) => s.id);

        const [psResult, attendanceResult] = await Promise.all([
          participantIds.length > 0 
            ? supabase.from('participant_sessions').select('*').in('participant_id', participantIds)
            : Promise.resolve({ data: [] }),
          sessionIds.length > 0
            ? supabase.from('attendance').select('*').in('session_id', sessionIds)
            : Promise.resolve({ data: [] })
        ]);

        serverData.participant_sessions = psResult.data || [];
        serverData.attendance = attendanceResult.data || [];
      }
      stepStart = timer('Step 1 - Download from server', stepStart);

      // ============================================
      // STEP 2: UPLOAD LOCAL CHANGES TO SERVER FIRST
      // This ensures local IDs get mapped to server UUIDs before merging
      // ============================================
      
      const localClubs = await dataService.getClubs();
      const uploadedIds: any = {
        sessions: new Set<string>(),
        participants: new Set<string>()
      };

      // Helper functions for batching
      const isValidUUID = (id: string) => {
        if (!id) return false;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(id);
      };
      
      const generateUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      };

      // Collect all data to upload in batches
      const sessionsToUpsert: any[] = [];
      const participantsToUpsert: any[] = [];
      const participantSessionsToUpsert: any[] = [];
      const attendanceToUpsert: any[] = [];
      const clubsToUpsert: any[] = [];

      // Upload local-only clubs (these need individual handling for ID mapping)
      for (const club of localClubs) {
        if (club.id.startsWith('local-')) {
          await this.uploadLocalClub(club, session.user.id, uploadedIds);
        } else if (club.owner_id === session.user.id) {
          clubsToUpsert.push(club);
        }
      }

      // Batch upsert clubs
      if (clubsToUpsert.length > 0) {
        await supabase.from('clubs').upsert(clubsToUpsert, { onConflict: 'id' });
      }

      // Collect sessions and participants (only non-local IDs for batch)
      for (const club of localClubs) {
        const localSessions = await dataService.getSessions(club.id);
        for (const sess of localSessions) {
          if (sess.id.startsWith('local-')) {
            // Local IDs need individual handling for ID mapping
            const serverSession = await this.uploadToSupabase('sessions', sess, 'INSERT');
            if (serverSession) {
              uploadedIds.sessions.add(serverSession.id);
              await this.updateLocalId('sessions', sess.id, serverSession.id);
            }
          } else {
            sessionsToUpsert.push(sess);
          }
        }

        const localParticipants = await dataService.getParticipants(club.id);
        for (const participant of localParticipants) {
          // Strip local-only fields that don't exist in DB schema
          const { preferred_session_ids, ...dbParticipant } = participant as any;
          
          if (participant.id.startsWith('local-')) {
            const serverParticipant = await this.uploadToSupabase('participants', dbParticipant, 'INSERT');
            if (serverParticipant) {
              uploadedIds.participants.add(serverParticipant.id);
              await this.updateLocalId('participants', participant.id, serverParticipant.id);
            }
          } else {
            participantsToUpsert.push(dbParticipant);
          }
        }
      }

      // Batch upsert sessions and participants IN PARALLEL
      const [sessionsUpsertResult, participantsUpsertResult] = await Promise.all([
        sessionsToUpsert.length > 0 
          ? supabase.from('sessions').upsert(sessionsToUpsert, { onConflict: 'id' })
          : Promise.resolve({ error: null }),
        participantsToUpsert.length > 0 
          ? supabase.from('participants').upsert(participantsToUpsert, { onConflict: 'id' })
          : Promise.resolve({ error: null })
      ]);
      
      if (sessionsUpsertResult.error) {
        console.error('[Upload] Sessions upsert FAILED:', sessionsUpsertResult.error.message);
      }
      if (participantsUpsertResult.error) {
        console.error('[Upload] Participants upsert FAILED:', participantsUpsertResult.error.message);
      }

      // Collect participant_sessions and attendance for batch upsert IN PARALLEL
      const [allPS, allAttendance] = await Promise.all([
        AsyncStorage.getItem('@presence_app:participant_sessions'),
        AsyncStorage.getItem('@presence_app:attendance')
      ]);
      
      // Build set of valid IDs - use ONLY what's confirmed on server
      // serverData is from Step 1 download, but we just uploaded more data
      // The upsert should have added participantsToUpsert and sessionsToUpsert
      // ONLY if the upserts succeeded, include the uploaded IDs
      const serverParticipantIds = new Set(serverData.participants.map((p: any) => p.id));
      const serverSessionIds = new Set(serverData.sessions.map((s: any) => s.id));
      
      // Only include uploaded IDs if the upsert succeeded
      if (!participantsUpsertResult.error) {
        for (const p of participantsToUpsert) {
          serverParticipantIds.add(p.id);
        }
      }
      if (!sessionsUpsertResult.error) {
        for (const s of sessionsToUpsert) {
          serverSessionIds.add(s.id);
        }
      }
      
      const validParticipantIds = serverParticipantIds;
      const validSessionIds = serverSessionIds;
      
      console.log(`[Upload] Valid participants: ${validParticipantIds.size}, Valid sessions: ${validSessionIds.size}`);
      
      if (allPS) {
        const psList = JSON.parse(allPS);
        const updatedPsList = [...psList];
        
        console.log(`[Upload] Total participant_sessions in local storage: ${psList.length}`);
        
        // Use a Map to dedupe by composite key (participant_id + session_id)
        // Keep the most recent record for each combination
        const psMap = new Map<string, any>();
        
        for (let i = 0; i < updatedPsList.length; i++) {
          const ps = updatedPsList[i];
          if (isValidUUID(ps.participant_id) && isValidUUID(ps.session_id)) {
            // Only upload if both participant AND session exist on server
            if (!validParticipantIds.has(ps.participant_id)) {
              console.log(`[Upload] Skipping PS - participant not on server: ${ps.participant_id.slice(0,8)}...`);
              continue;
            }
            if (!validSessionIds.has(ps.session_id)) {
              console.log(`[Upload] Skipping PS - session not on server: ${ps.session_id.slice(0,8)}...`);
              continue;
            }
            
            if (!isValidUUID(ps.id)) {
              ps.id = generateUUID();
              updatedPsList[i] = ps;
            }
            
            // Dedupe by composite key, keeping most recent
            const key = `${ps.participant_id}|${ps.session_id}`;
            const existing = psMap.get(key);
            if (!existing || new Date(ps.updated_at || ps.created_at || 0) > new Date(existing.updated_at || existing.created_at || 0)) {
              psMap.set(key, ps);
            }
          } else {
            console.log(`[Upload] Skipping PS - invalid UUIDs: participant=${ps.participant_id?.slice(0,8)}, session=${ps.session_id?.slice(0,8)}`);
          }
        }
        
        // Convert map values to array
        participantSessionsToUpsert.push(...psMap.values());
        
        // Debug: list unique participant IDs we're about to upsert
        const uniquePIds = [...new Set(participantSessionsToUpsert.map(ps => ps.participant_id))];
        console.log(`[Upload] Unique participant IDs in upsert: ${uniquePIds.length}`);
        
        // Check if any are NOT in validParticipantIds (shouldn't happen but let's verify)
        const invalidPIds = uniquePIds.filter(pid => !validParticipantIds.has(pid));
        if (invalidPIds.length > 0) {
          console.error(`[Upload] BUG! Invalid participant IDs slipped through: ${invalidPIds.map(id => id.slice(0,8)).join(', ')}`);
        }
        
        // Same for session IDs
        const uniqueSIds = [...new Set(participantSessionsToUpsert.map(ps => ps.session_id))];
        const invalidSIds = uniqueSIds.filter(sid => !validSessionIds.has(sid));
        if (invalidSIds.length > 0) {
          console.error(`[Upload] BUG! Invalid session IDs slipped through: ${invalidSIds.map(id => id.slice(0,8)).join(', ')}`);
        }
        
        console.log(`[Upload] participant_sessions to upsert: ${participantSessionsToUpsert.length} (deduped from ${psList.length})`);
        
        await AsyncStorage.setItem('@presence_app:participant_sessions', JSON.stringify(updatedPsList));
      }

      if (allAttendance) {
        const attendanceList = JSON.parse(allAttendance);
        
        for (const attendance of attendanceList) {
          if (attendance.participant_id?.startsWith('local-') || 
              attendance.session_id?.startsWith('local-') ||
              !attendance.participant_id ||
              !attendance.session_id ||
              !isValidUUID(attendance.participant_id) ||
              !isValidUUID(attendance.session_id)) {
            continue;
          }
          if (!isValidUUID(attendance.id)) {
            attendance.id = generateUUID();
          }
          attendanceToUpsert.push(attendance);
        }
      }

      // Batch upsert participant_sessions and attendance IN PARALLEL
      // For participant_sessions, remove 'id' field - let server use composite key (participant_id, session_id)
      const psWithoutIds = participantSessionsToUpsert.map(({ id, ...rest }) => rest);
      
      const [psUpsertResult, attUpsertResult] = await Promise.all([
        psWithoutIds.length > 0 
          ? supabase.from('participant_sessions').upsert(psWithoutIds, { onConflict: 'participant_id,session_id' })
          : Promise.resolve({ error: null }),
        attendanceToUpsert.length > 0 
          ? supabase.from('attendance').upsert(attendanceToUpsert, { onConflict: 'id' })
          : Promise.resolve({ error: null })
      ]);
      
      if (psUpsertResult.error) {
        console.error('[Upload] participant_sessions upsert FAILED:', psUpsertResult.error.message);
      } else {
        console.log(`[Upload] participant_sessions upsert SUCCESS (${psWithoutIds.length} records)`);
      }

      // Handle deletions - compare ALL local participant_sessions vs server
      // Use the raw local data (allPS), not the filtered participantSessionsToUpsert
      if (allPS) {
        const localPSList = JSON.parse(allPS);
        
        // Build set of ALL local participant_session keys (regardless of validity)
        const allLocalPSKeys = new Set(
          localPSList
            .filter((ps: any) => isValidUUID(ps.participant_id) && isValidUUID(ps.session_id))
            .map((ps: any) => `${ps.participant_id}|${ps.session_id}`)
        );
        
        // Get ALL participants that exist on server (from downloaded data)
        const serverParticipantIdsList = serverData.participants.map((p: any) => p.id);
        
        if (serverParticipantIdsList.length > 0) {
          const { data: serverPS } = await supabase
            .from('participant_sessions')
            .select('participant_id, session_id')
            .in('participant_id', serverParticipantIdsList);
          
          if (serverPS) {
            // Find server records that don't exist locally - these should be deleted
            const toDelete = serverPS.filter(sps => !allLocalPSKeys.has(`${sps.participant_id}|${sps.session_id}`));
            
            if (toDelete.length > 0) {
              console.log(`[Upload] Deleting ${toDelete.length} participant_sessions removed locally`);
              for (const sps of toDelete) {
                console.log(`  - Deleting: participant=${sps.participant_id.slice(0,8)}... session=${sps.session_id.slice(0,8)}...`);
              }
              
              // Delete all in parallel
              await Promise.all(toDelete.map(sps => 
                supabase
                  .from('participant_sessions')
                  .delete()
                  .eq('participant_id', sps.participant_id)
                  .eq('session_id', sps.session_id)
              ));
            }
          }
        }
      }
      stepStart = timer('Step 2 - Upload to server', stepStart);

      // ============================================
      // STEP 3: MERGE SERVER DATA WITH LOCAL
      // Use the data we already downloaded in Step 1 (no re-download needed)
      // Our uploads used upsert so server now has our changes
      // ============================================
      
      await this.mergeDataWithLocal('clubs', serverData.clubs, session.user.id);
      await this.mergeDataWithLocal('sessions', serverData.sessions, session.user.id);
      await this.mergeDataWithLocal('participants', serverData.participants, session.user.id);
      await this.mergeDataWithLocal('participant_sessions', serverData.participant_sessions || [], session.user.id);
      await this.mergeDataWithLocal('attendance', serverData.attendance, session.user.id);
      stepStart = timer('Step 3 - Merge with local', stepStart);

      // ============================================
      // STEP 4: DELETE ITEMS MARKED FOR DELETION
      // Only delete items explicitly marked by user
      // ============================================
      
      await this.deleteMarkedItems('sessions');
      await this.deleteMarkedItems('participants');
      await this.deleteMarkedItems('attendance');
      await this.deleteMarkedItems('clubs');
      stepStart = timer('Step 4 - Delete marked items', stepStart);

      // Update last sync time
      await this.updateLastSyncTime();
      const newLastSync = await this.getLastSyncTime();
      this.notifyListeners({ isSyncing: false, lastSync: newLastSync, error: null });
      
      timer('TOTAL SYNC TIME', syncStart);
      return true;

    } catch (error) {
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
      const sinceStr = since.toISOString();

      // Fetch club data (updated since last sync)
      const { data: clubData } = await supabase
        .from('clubs')
        .select('*')
        .eq('id', clubId)
        .or(`created_at.gte.${sinceStr},updated_at.gte.${sinceStr}`);

      // Fetch sessions for this club (updated since last sync)
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select('*')
        .eq('club_id', clubId)
        .or(`created_at.gte.${sinceStr},updated_at.gte.${sinceStr}`);



      // Fetch participants for this club (updated since last sync)
      const { data: participantsData } = await supabase
        .from('participants')
        .select('*')
        .eq('club_id', clubId)
        .or(`created_at.gte.${sinceStr},updated_at.gte.${sinceStr}`);

      // Fetch participant_sessions for participants in this club
      const { data: participantSessionsData } = await supabase
        .from('participant_sessions')
        .select('*, participants!inner(club_id)')
        .eq('participants.club_id', clubId)
        .or(`created_at.gte.${sinceStr},updated_at.gte.${sinceStr}`);

      // Fetch attendance for participants in this club
      const { data: attendanceData } = await supabase
        .from('attendance')
        .select('*, participants!inner(club_id)')
        .eq('participants.club_id', clubId)
        .gte('created_at', sinceStr);

      // Apply changes to local storage (filter out IDs we just uploaded to prevent duplicates)
      if (clubData && clubData.length > 0) {
        await this.syncTableRecords('clubs', clubData);
      }
      if (sessionsData && sessionsData.length > 0) {
        const filteredSessions = sessionsData.filter(s => !skipSessionIds.has(s.id));
        if (filteredSessions.length > 0) {
          await this.syncTableRecords('sessions', filteredSessions);
        }
      }
      if (participantsData && participantsData.length > 0) {
        const filteredParticipants = participantsData.filter(p => !skipParticipantIds.has(p.id));
        if (filteredParticipants.length > 0) {
          await this.syncTableRecords('participants', filteredParticipants);
        }
      }
      if (participantSessionsData && participantSessionsData.length > 0) {
        await this.syncTableRecords('participant_sessions', participantSessionsData);
      }
      if (attendanceData && attendanceData.length > 0) {
        await this.syncTableRecords('attendance', attendanceData);
      }

    } catch (error) {
      // Silent fail
    }
  };

  private syncTableRecords = async (tableName: string, records: any[]) => {
    const storageKey = this.getStorageKey(tableName);
    const local = await AsyncStorage.getItem(storageKey);
    let localRecords = local ? JSON.parse(local) : [];

    // Merge server records into local storage
    for (const serverRecord of records) {
      const existingIndex = localRecords.findIndex((r: any) => r.id === serverRecord.id);
      
      if (existingIndex >= 0) {
        const localRecord = localRecords[existingIndex];
        
        // For clubs, participants, and participant_sessions, always trust server
        if (['clubs', 'participants', 'participant_sessions'].includes(tableName)) {
          localRecords[existingIndex] = { ...localRecord, ...serverRecord };
        } else {
          // For sessions and attendance, compare timestamps
          const serverUpdated = serverRecord.updated_at || serverRecord.created_at;
          const localUpdated = localRecord.updated_at || localRecord.created_at;
          
          if (serverUpdated && localUpdated) {
            const serverTime = new Date(serverUpdated).getTime();
            const localTime = new Date(localUpdated).getTime();
            
            if (serverTime > localTime) {
              localRecords[existingIndex] = { ...localRecord, ...serverRecord };
            }
          } else {
            localRecords[existingIndex] = { ...localRecord, ...serverRecord };
          }
        }
      } else {
        // Add new record from server
        localRecords.push(serverRecord);
      }
    }

    await AsyncStorage.setItem(storageKey, JSON.stringify(localRecords));
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
        return null;
      }

      if (operation === 'DELETE') {
        // Skip delete if record is local-only (never uploaded to server)
        if (record.id?.startsWith('local-')) {
          return null;
        }
        
        const { data, error } = await supabase
          .from(table)
          .delete()
          .eq('id', record.id)
          .select()
          .maybeSingle(); // Use maybeSingle() instead of single() to allow 0 results
        
        if (error) {
          throw error;
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
          
          // IDs are now content-based (deterministic), so always include them
          // This ensures same content = same ID everywhere, no duplicates possible
          if (id && !id.startsWith('local-')) {
            mappedRecord.id = id;
          }
          
          const { data, error } = await supabase
            .from(table)
            .upsert(mappedRecord, { onConflict: 'id' })
            .select()
            .single();
          
          if (error) {
            throw error;
          }
          return data;
        } else if (table === 'participants') {
          // Participants: keep id, club_id, first_name, last_name, is_long_term_sick, updated_at
          const { id, club_id, first_name, last_name, is_long_term_sick, updated_at } = cleanRecord;
          const mappedRecord: any = { 
            club_id,
            first_name,
            last_name,
            is_long_term_sick: is_long_term_sick || false,
            updated_at: updated_at || new Date().toISOString() // Preserve local timestamp for conflict resolution
          };
          
          // IDs are now content-based (deterministic), so always include them
          // This ensures same content = same ID everywhere, no duplicates possible
          if (id && !id.startsWith('local-')) {
            mappedRecord.id = id;
          }
          
          const { data, error } = await supabase
            .from(table)
            .upsert(mappedRecord, { onConflict: 'id' })
            .select()
            .single();
          
          if (error) throw error;
          return data;
        } else if (table === 'participant_sessions') {
          // Participant_sessions: keep participant_id, session_id, and updated_at for conflict resolution
          const { participant_id, session_id, updated_at } = cleanRecord;
          const mappedRecord: any = { 
            participant_id,
            session_id,
            updated_at: updated_at || new Date().toISOString() // Preserve local timestamp
          };
          // Don't include id - use the composite key (participant_id, session_id) for conflict resolution
          
          const { data, error } = await supabase
            .from(table)
            .upsert(mappedRecord, { onConflict: 'participant_id,session_id' })
            .select()
            .single();
          
          if (error) throw error;
          return data;
        } else if (table === 'attendance') {
          // Attendance: keep participant_id, session_id, date, present
          // Note: Use UPSERT with unique constraint on (participant_id, session_id, date)
          const { id, participant_id, session_id, date, present } = cleanRecord;
          
          const mappedRecord: any = { 
            participant_id,
            session_id,
            date,
            present: present || false
          };
          
          // Always use UPSERT with the natural key (participant_id, session_id, date)
          // The database has a unique constraint on these three fields
          const { data, error } = await supabase
            .from(table)
            .upsert(mappedRecord, { 
              onConflict: 'participant_id,session_id,date',
              ignoreDuplicates: false 
            })
            .select()
            .single();
          
          if (error) {
            throw error;
          }
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
  private mergeDataWithLocal = async (type: 'clubs' | 'sessions' | 'participants' | 'participant_sessions' | 'attendance', serverRecords: any[], userId: string): Promise<void> => {
    const storageKey = this.getStorageKey(type);
    const localData = await AsyncStorage.getItem(storageKey);
    const localRecords = localData ? JSON.parse(localData) : [];

    // Get list of IDs marked for deletion - DON'T re-add these!
    const deletedIds = await dataService.getDeletedIds(type);
    const deletedIdsSet = new Set(deletedIds);

    // For participant_sessions, use composite key (participant_id + session_id) instead of id
    if (type === 'participant_sessions') {
      await this.mergeParticipantSessions(serverRecords, localRecords, storageKey, userId, deletedIdsSet);
      return;
    }

    // Create a map of local records by ID for quick lookup
    const localMap = new Map(localRecords.map((r: any) => [r.id, r]));
    const mergedRecords = [...localRecords];

    // For sessions: create a content-based map for deduplication
    // Key format: "club_id|day_of_week|start_time|end_time"
    const sessionContentMap = type === 'sessions' 
      ? new Map(localRecords.map((r: any) => [`${r.club_id}|${r.day_of_week}|${r.start_time}|${r.end_time}`, r]))
      : null;

    // For participants: create a content-based map for deduplication
    // Key format: "club_id|first_name|last_name" (lowercased for case-insensitive matching)
    const participantContentMap = type === 'participants' 
      ? new Map(localRecords.map((r: any) => [`${r.club_id}|${(r.first_name || '').toLowerCase()}|${(r.last_name || '').toLowerCase()}`, r]))
      : null;

    for (const serverRecord of serverRecords) {
      // CRITICAL: Skip items marked for deletion
      if (deletedIdsSet.has(serverRecord.id)) {
        continue;
      }

      let localRecord = localMap.get(serverRecord.id);

      // For sessions: also check content-based match using the deterministic hash
      if (!localRecord && type === 'sessions' && sessionContentMap) {
        const contentKey = `${serverRecord.club_id}|${serverRecord.day_of_week}|${serverRecord.start_time}|${serverRecord.end_time}`;
        const matchByContent = sessionContentMap.get(contentKey);
        
        // Also compute what the content hash ID should be
        const expectedHashId = generateContentBasedId(`session|${serverRecord.club_id}|${serverRecord.day_of_week}|${serverRecord.start_time}|${serverRecord.end_time}`);
        const matchByHashId = localMap.get(expectedHashId);
        
        // Prefer match by hash ID, fallback to content map
        const matchedRecord = matchByHashId || matchByContent;
        
        if (matchedRecord && matchedRecord.id !== serverRecord.id) {
          // Found a local session with same content but different ID
          // Replace local session with server version
          const index = mergedRecords.findIndex((r: any) => r.id === matchedRecord.id);
          if (index >= 0) {
            const oldId = matchedRecord.id;
            mergedRecords[index] = { ...serverRecord };
            
            // Update references in attendance and participant_sessions to use new ID
            await this.updateLocalId('sessions', oldId, serverRecord.id);
          }
          // Update the maps so we don't process this content again
          sessionContentMap.delete(contentKey);
          localMap.delete(matchedRecord.id);
          continue;
        }
      }

      // For participants: also check content-based match using the deterministic hash
      if (!localRecord && type === 'participants' && participantContentMap) {
        const contentKey = `${serverRecord.club_id}|${(serverRecord.first_name || '').toLowerCase()}|${(serverRecord.last_name || '').toLowerCase()}`;
        const matchByContent = participantContentMap.get(contentKey);
        
        // Also compute what the content hash ID should be
        const expectedHashId = generateContentBasedId(`participant|${serverRecord.club_id}|${(serverRecord.first_name || '').toLowerCase()}|${(serverRecord.last_name || '').toLowerCase()}`);
        const matchByHashId = localMap.get(expectedHashId);
        
        // Prefer match by hash ID, fallback to content map
        const matchedRecord = matchByHashId || matchByContent;
        
        if (matchedRecord && matchedRecord.id !== serverRecord.id) {
          // Found a local participant with same content but different ID
          // Replace local participant with server version
          const index = mergedRecords.findIndex((r: any) => r.id === matchedRecord.id);
          if (index >= 0) {
            const oldId = matchedRecord.id;
            mergedRecords[index] = { ...serverRecord };
            
            // Update references in attendance and participant_sessions to use new ID
            await this.updateLocalId('participants', oldId, serverRecord.id);
          }
          // Update the maps so we don't process this content again
          participantContentMap.delete(contentKey);
          localMap.delete(matchedRecord.id);
          continue;
        }
      }

      if (!localRecord) {
        // New record from server, add it
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
        } else if (type === 'participant_sessions') {
          // For participant_sessions, check via participant's club ownership
          const clubs = await dataService.getClubs();
          const allParticipants = await AsyncStorage.getItem('@presence_app:participants');
          const participants = allParticipants ? JSON.parse(allParticipants) : [];
          const participant = participants.find((p: any) => p.id === serverRecord.participant_id);
          if (participant) {
            const club = clubs.find(c => c.id === participant.club_id);
            isOwner = club?.owner_id === userId;
          } else {
            // If participant not found locally, use timestamp resolution
            isOwner = true;
          }
        } else if (type === 'attendance') {
          // For attendance, always use timestamp conflict resolution
          isOwner = true; // Treat everyone as having edit rights
        }

        if (!isOwner && type !== 'attendance') {
          // Non-owner for clubs/sessions/participants: server ALWAYS wins
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
            const index = mergedRecords.findIndex((r: any) => r.id === serverRecord.id);
            if (index >= 0) {
              mergedRecords[index] = { ...localRecord, ...serverRecord };
            }
          }
        }
      }
    }

    await AsyncStorage.setItem(storageKey, JSON.stringify(mergedRecords));
  };

  /**
   * Special merge for participant_sessions using composite key (participant_id + session_id)
   * Local changes should win if they have a more recent timestamp
   */
  private mergeParticipantSessions = async (
    serverRecords: any[], 
    localRecords: any[], 
    storageKey: string, 
    userId: string,
    deletedIdsSet: Set<string>
  ): Promise<void> => {
    // Get valid session IDs (sessions that actually exist)
    const localSessionsData = await AsyncStorage.getItem('@presence_app:sessions');
    const localSessionsList = localSessionsData ? JSON.parse(localSessionsData) : [];
    const validSessionIds = new Set(localSessionsList.map((s: any) => s.id));
    
    console.log(`[PS Merge] Valid session IDs: ${validSessionIds.size}`);

    // Filter out orphaned records BEFORE merging
    const filterOrphans = (records: any[]) => 
      records.filter(r => validSessionIds.has(r.session_id));
    
    const filteredLocalRecords = filterOrphans(localRecords);
    const filteredServerRecords = filterOrphans(serverRecords);
    
    const localOrphans = localRecords.length - filteredLocalRecords.length;
    const serverOrphans = serverRecords.length - filteredServerRecords.length;
    if (localOrphans > 0 || serverOrphans > 0) {
      console.log(`[PS Merge] Filtered orphans: ${localOrphans} local, ${serverOrphans} server`);
    }

    // Log session IDs comparison (after filtering)
    console.log('[SyncService] Local session_ids:', [...new Set(filteredLocalRecords.map(r => r.session_id))]);
    console.log('[SyncService] Remote session_ids:', [...new Set(filteredServerRecords.map(r => r.session_id))]);

    // Group records by participant_id
    const groupByParticipant = (records: any[]) => {
      const map = new Map<string, any[]>();
      for (const r of records) {
        if (!map.has(r.participant_id)) map.set(r.participant_id, []);
        map.get(r.participant_id)!.push(r);
      }
      return map;
    };

    const localByParticipant = groupByParticipant(filteredLocalRecords);
    const serverByParticipant = groupByParticipant(filteredServerRecords);

    // Get all participant IDs from both sides
    const allParticipantIds = new Set([
      ...localByParticipant.keys(),
      ...serverByParticipant.keys()
    ]);

    const mergedRecords: any[] = [];

    for (const participantId of allParticipantIds) {
      const localPS = localByParticipant.get(participantId) || [];
      const serverPS = serverByParticipant.get(participantId) || [];

      // Find the most recent update on each side
      const getLatestTime = (records: any[]) => {
        if (records.length === 0) return 0;
        return Math.max(...records.map(r => 
          new Date(r.updated_at || r.created_at || 0).getTime()
        ));
      };

      const localLatest = getLatestTime(localPS);
      const serverLatest = getLatestTime(serverPS);

      console.log(`[PS Merge] Participant ${participantId.slice(0,8)}...: local=${localPS.length} sessions (${new Date(localLatest).toISOString().slice(11,19)}), server=${serverPS.length} sessions (${new Date(serverLatest).toISOString().slice(11,19)})`);

      if (localPS.length === 0) {
        // Only server has records for this participant
        for (const ps of serverPS) {
          if (!deletedIdsSet.has(ps.id)) {
            mergedRecords.push(ps);
          }
        }
      } else if (serverPS.length === 0) {
        // Only local has records for this participant
        for (const ps of localPS) {
          if (!deletedIdsSet.has(ps.id)) {
            mergedRecords.push(ps);
          }
        }
      } else if (localLatest > serverLatest) {
        // Local is more recent - use ALL local sessions for this participant
        // This means if user removed a session locally, it stays removed
        console.log(`  -> Using LOCAL (newer)`);
        for (const ps of localPS) {
          if (!deletedIdsSet.has(ps.id)) {
            mergedRecords.push(ps);
          }
        }
      } else {
        // Server is more recent or same - use ALL server sessions for this participant
        console.log(`  -> Using SERVER (newer or same)`);
        for (const ps of serverPS) {
          if (!deletedIdsSet.has(ps.id)) {
            mergedRecords.push(ps);
          }
        }
      }
    }

    console.log(`[PS Merge] Final merged count: ${mergedRecords.length}`);
    await AsyncStorage.setItem(storageKey, JSON.stringify(mergedRecords));
    
    // Also clean up orphans from server
    const allServerOrphanIds = serverRecords
      .filter(r => !validSessionIds.has(r.session_id))
      .map(r => ({ participant_id: r.participant_id, session_id: r.session_id }));
    
    if (allServerOrphanIds.length > 0) {
      console.log(`[PS Merge] Cleaning ${allServerOrphanIds.length} orphans from server...`);
      for (const orphan of allServerOrphanIds) {
        await supabase
          .from('participant_sessions')
          .delete()
          .eq('participant_id', orphan.participant_id)
          .eq('session_id', orphan.session_id);
      }
      console.log(`[PS Merge] ✓ Server orphans cleaned`);
    }
  };

  /**
   * Upload a local-only club and all its data
   */
  private uploadLocalClub = async (club: any, userId: string, uploadedIds: any): Promise<void> => {
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
    } catch (error) {
      // Silent fail
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
      // Update participant_sessions records
      const psData = await AsyncStorage.getItem('@presence_app:participant_sessions');
      if (psData) {
        const participantSessions = JSON.parse(psData);
        const updated = participantSessions.map((ps: any) => 
          ps.session_id === oldId ? { ...ps, session_id: newId } : ps
        );
        await AsyncStorage.setItem('@presence_app:participant_sessions', JSON.stringify(updated));
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
      // Update participant_sessions records
      const psData = await AsyncStorage.getItem('@presence_app:participant_sessions');
      if (psData) {
        const participantSessions = JSON.parse(psData);
        const updated = participantSessions.map((ps: any) => 
          ps.participant_id === oldId ? { ...ps, participant_id: newId } : ps
        );
        await AsyncStorage.setItem('@presence_app:participant_sessions', JSON.stringify(updated));
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
  };

  /**
   * Delete items from server that are marked for deletion
   */
  private deleteMarkedItems = async (type: 'clubs' | 'sessions' | 'participants' | 'attendance'): Promise<void> => {
    const deletedIds = await dataService.getDeletedIds(type);
    
    if (deletedIds.length === 0) {
      return;
    }

    for (const id of deletedIds) {
      // Skip invalid IDs (null, undefined, or local-only)
      if (!id || id === 'undefined' || id.startsWith('local-')) {
        continue;
      }

      try {
        await supabase
          .from(type)
          .delete()
          .eq('id', id);
      } catch (error) {
        // Silent fail
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
