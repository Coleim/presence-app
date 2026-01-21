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

      // First, download all clubs from server that user has access to
      console.log('[SyncService] Downloading clubs from server...');
      const { data: serverClubs, error: clubsError } = await supabase
        .from('clubs')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (clubsError) {
        console.error('[SyncService] Error fetching clubs:', clubsError);
      } else if (serverClubs && serverClubs.length > 0) {
        console.log(`[SyncService] Found ${serverClubs.length} clubs on server`);
        
        // Merge with local clubs
        const localClubs = await dataService.getClubs();
        const localClubIds = new Set(localClubs.map(c => c.id));
        
        // Add clubs from server that don't exist locally
        const clubsToAdd = serverClubs.filter(sc => !localClubIds.has(sc.id));
        if (clubsToAdd.length > 0) {
          console.log(`[SyncService] Adding ${clubsToAdd.length} new clubs from server`);
          const allClubs = [...localClubs, ...clubsToAdd];
          await AsyncStorage.setItem('@presence_app:clubs', JSON.stringify(allClubs));
          
          // Download sessions, participants, and attendance for new clubs
          for (const club of clubsToAdd) {
            console.log(`[SyncService] Downloading data for club: ${club.name}`);
            
            // Download sessions
            const { data: sessions } = await supabase
              .from('sessions')
              .select('*')
              .eq('club_id', club.id);
            
            if (sessions && sessions.length > 0) {
              console.log(`[SyncService] Downloaded ${sessions.length} sessions`);
              const allSessions = await AsyncStorage.getItem('@presence_app:sessions');
              const existingSessions = allSessions ? JSON.parse(allSessions) : [];
              await AsyncStorage.setItem('@presence_app:sessions', JSON.stringify([...existingSessions, ...sessions]));
            }
            
            // Download participants
            const { data: participants } = await supabase
              .from('participants')
              .select('*')
              .eq('club_id', club.id);
            
            if (participants && participants.length > 0) {
              console.log(`[SyncService] Downloaded ${participants.length} participants`);
              const allParticipants = await AsyncStorage.getItem('@presence_app:participants');
              const existingParticipants = allParticipants ? JSON.parse(allParticipants) : [];
              await AsyncStorage.setItem('@presence_app:participants', JSON.stringify([...existingParticipants, ...participants]));
            }
            
            // Download attendance
            const { data: attendance } = await supabase
              .from('attendance')
              .select('*')
              .eq('club_id', club.id);
            
            if (attendance && attendance.length > 0) {
              console.log(`[SyncService] Downloaded ${attendance.length} attendance records`);
              const allAttendance = await AsyncStorage.getItem('@presence_app:attendance');
              const existingAttendance = allAttendance ? JSON.parse(allAttendance) : [];
              await AsyncStorage.setItem('@presence_app:attendance', JSON.stringify([...existingAttendance, ...attendance]));
            }
          }
        }
      }

      // Then, upload any local-only clubs (created while offline)
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
                  owner_id: session.user.id,
                  updated_at: club.updated_at || new Date().toISOString()
                })
                .select()
                .single();
              
              if (insertError) throw insertError;
              if (!newClub) {
                throw new Error('No club returned from insert');
              }
              serverClub = newClub;
              
              // Add owner as a club member
              const { error: memberError } = await supabase
                .from('club_members')
                .insert({
                  club_id: serverClub.id,
                  user_id: session.user.id
                })
                .select()
                .single();
              
              if (memberError) {
                console.error('[SyncService] Warning: Could not add owner as club member:', memberError);
              } else {
                console.log('[SyncService] Owner added as club member');
              }
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
        } else {
          // Upload updates for existing clubs (only if we're the owner)
          if (club.owner_id === session.user.id) {
            console.log('[SyncService] Uploading club update:', club.name);
            try {
              await this.uploadToSupabase('clubs', club, 'UPDATE');
              console.log('[SyncService] ✅ Club updated on server:', club.name);
            } catch (error) {
              console.error('[SyncService] Error updating club:', error);
            }
          } else {
            console.log('[SyncService] Skipping club update (not owner):', club.name);
          }
        }
      }

      // Get user's clubs from local storage
      // We sync whatever clubs the user has locally (owned or joined via share code)
      const clubsToSync = await dataService.getClubs();
      
      if (!clubsToSync || clubsToSync.length === 0) {
        console.log('[SyncService] No clubs to sync');
        await this.updateLastSyncTime();
        const newLastSync = await this.getLastSyncTime();
        this.notifyListeners({ isSyncing: false, lastSync: newLastSync, error: null });
        console.log('[SyncService] Sync completed successfully (no clubs)');
        return true;
      }

      // Sync sessions/participants for existing clubs (local is source of truth)
      const uploadedSessionIds = new Set<string>(); // Track IDs of sessions we just uploaded
      const uploadedParticipantIds = new Set<string>(); // Track IDs of participants we just uploaded
      
      for (const club of clubsToSync) {
        const isOwner = club.owner_id === session.user.id;
        
        // === SESSIONS SYNC ===
        const localSessions = await dataService.getSessions(club.id);
        
        // Fetch current server sessions
        const { data: serverSessions } = await supabase
          .from('sessions')
          .select('id')
          .eq('club_id', club.id);
        
        const serverSessionIds = new Set(serverSessions?.map(s => s.id) || []);
        const localSessionIds = new Set(localSessions.filter(s => !s.id.startsWith('local-')).map(s => s.id));
        
        // Only delete sessions from server if we're the owner
        if (isOwner) {
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
        } else {
          console.log(`[SyncService] Skipping session deletions (not owner): ${club.name}`);
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
                  const oldId = session.id;
                  const newId = serverSession.id;
                  
                  // Update local session with server ID immediately
                  const allSessions = await AsyncStorage.getItem('@presence_app:sessions');
                  const sessionsList = allSessions ? JSON.parse(allSessions) : [];
                  const updatedSessions = sessionsList.map((s: any) => 
                    s.id === oldId ? { ...s, id: newId } : s
                  );
                  await AsyncStorage.setItem('@presence_app:sessions', JSON.stringify(updatedSessions));
                  
                  // Update participant_sessions to use the new session ID
                  const localPS = await AsyncStorage.getItem('@presence_app:participant_sessions');
                  if (localPS) {
                    const participantSessionsList = JSON.parse(localPS);
                    const updatedPS = participantSessionsList.map((ps: any) => 
                      ps.session_id === oldId ? { ...ps, session_id: newId } : ps
                    );
                    await AsyncStorage.setItem('@presence_app:participant_sessions', JSON.stringify(updatedPS));
                  }
                  
                  // Update the session object too so subsequent operations use the new ID
                  session.id = newId;
                  console.log(`[SyncService] ✅ Session uploaded: ${session.day_of_week} ${session.start_time}-${session.end_time} (${oldId} → ${newId})`);
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
        
        // Only delete participants from server if we're the owner
        if (isOwner) {
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
        } else {
          console.log(`[SyncService] Skipping participant deletions (not owner): ${club.name}`);
        }
        
        // Push all local participants to server
        if (localParticipants.length > 0) {
          console.log(`[SyncService] Syncing ${localParticipants.length} participants for club ${club.id}`);
          for (const participant of localParticipants) {
            try {
              const isLocal = participant.id.startsWith('local-');
              console.log(`[SyncService] Uploading participant ${participant.id} (${participant.first_name} ${participant.last_name}) - isLocal: ${isLocal}`);
              const serverParticipant = await this.uploadToSupabase('participants', participant, isLocal ? 'INSERT' : 'UPDATE');
              if (serverParticipant) {
                uploadedParticipantIds.add(serverParticipant.id); // Track this ID
                if (isLocal) {
                  const oldId = participant.id;
                  const newId = serverParticipant.id;
                  
                  // Update local participant with server ID immediately
                  const allParticipants = await AsyncStorage.getItem('@presence_app:participants');
                  const participantsList = allParticipants ? JSON.parse(allParticipants) : [];
                  const updatedParticipants = participantsList.map((p: any) => 
                    p.id === oldId ? { ...p, id: newId } : p
                  );
                  await AsyncStorage.setItem('@presence_app:participants', JSON.stringify(updatedParticipants));
                  
                  // Update participant_sessions to use the new participant ID
                  const localPS = await AsyncStorage.getItem('@presence_app:participant_sessions');
                  if (localPS) {
                    const participantSessionsList = JSON.parse(localPS);
                    const updatedPS = participantSessionsList.map((ps: any) => 
                      ps.participant_id === oldId ? { ...ps, participant_id: newId } : ps
                    );
                    await AsyncStorage.setItem('@presence_app:participant_sessions', JSON.stringify(updatedPS));
                  }
                  
                  // Update the participant object too so subsequent operations use the new ID
                  participant.id = newId;
                  console.log(`[SyncService] ✅ Participant uploaded: ${participant.first_name} ${participant.last_name} (${oldId} → ${newId})`);
                }
              }
            } catch (err) {
              console.error('[SyncService] Failed to upload participant:', participant.id, participant.first_name, participant.last_name, err);
            }
          }
        }
        
        // === PARTICIPANT_SESSIONS SYNC ===
        // Sync enrollment (which participants are enrolled in which sessions)
        if (localParticipants.length > 0) {
          const localPS = await AsyncStorage.getItem('@presence_app:participant_sessions');
          const participantSessionsList = localPS ? JSON.parse(localPS) : [];
          
          // Filter to only this club's participant_sessions
          const clubParticipantIds = new Set(localParticipants.map(p => p.id));
          const clubParticipantSessions = participantSessionsList.filter((ps: any) => 
            clubParticipantIds.has(ps.participant_id)
          );
          
          if (clubParticipantSessions.length > 0) {
            console.log(`[SyncService] Syncing ${clubParticipantSessions.length} participant enrollments for club ${club.id}`);
            
            // Get existing server enrollments for these participants
            const { data: serverPS } = await supabase
              .from('participant_sessions')
              .select('id, participant_id, session_id')
              .in('participant_id', Array.from(clubParticipantIds));
            
            const serverPSSet = new Set(
              (serverPS || []).map((ps: any) => `${ps.participant_id}-${ps.session_id}`)
            );
            const localPSSet = new Set(
              clubParticipantSessions.map((ps: any) => `${ps.participant_id}-${ps.session_id}`)
            );
            
            // Delete enrollments that exist on server but not locally
            if (serverPS) {
              for (const ps of serverPS) {
                const key = `${ps.participant_id}-${ps.session_id}`;
                if (!localPSSet.has(key)) {
                  try {
                    await supabase.from('participant_sessions').delete().eq('id', ps.id);
                    console.log(`[SyncService] Deleted enrollment from server: ${key}`);
                  } catch (err) {
                    console.error('[SyncService] Failed to delete enrollment:', err);
                  }
                }
              }
            }
            
            // Add enrollments that exist locally but not on server
            for (const ps of clubParticipantSessions) {
              const key = `${ps.participant_id}-${ps.session_id}`;
              if (!serverPSSet.has(key)) {
                // Skip if either ID starts with "local-" (not yet synced to server)
                if (ps.participant_id.startsWith('local-') || ps.session_id.startsWith('local-')) {
                  console.log(`[SyncService] Skipping enrollment with local ID: ${key}`);
                  continue;
                }
                
                try {
                  console.log(`[SyncService] Uploading enrollment: participant=${ps.participant_id}, session=${ps.session_id}`);
                  await supabase.from('participant_sessions').insert({
                    participant_id: ps.participant_id,
                    session_id: ps.session_id
                  });
                  console.log(`[SyncService] ✅ Enrollment uploaded: ${key}`);
                } catch (err) {
                  console.error('[SyncService] Failed to upload enrollment:', key, err);
                }
              }
            }
          }
        }
        
        // === ATTENDANCE SYNC ===
        // Upload local attendance records to server
        const localAttendance = await AsyncStorage.getItem('@presence_app:attendance');
        const attendanceList = localAttendance ? JSON.parse(localAttendance) : [];
        
        // Filter to only this club's attendance (based on session_id)
        const clubSessionIds = new Set(localSessions.map(s => s.id));
        const clubAttendance = attendanceList.filter((a: any) => clubSessionIds.has(a.session_id));
        
        if (clubAttendance.length > 0) {
          console.log(`[SyncService] Syncing ${clubAttendance.length} attendance records for club ${club.id}`);
          
          // Get existing server attendance for these sessions
          const { data: serverAttendance } = await supabase
            .from('attendance')
            .select('id, participant_id, session_id, date, present')
            .in('session_id', Array.from(clubSessionIds));
          
          const serverAttendanceSet = new Set(
            (serverAttendance || []).map((a: any) => `${a.participant_id}-${a.session_id}-${a.date}`)
          );
          const localAttendanceSet = new Set(
            clubAttendance.map((a: any) => `${a.participant_id}-${a.session_id}-${a.date}`)
          );
          
          // Delete attendance records that exist on server but not locally
          if (serverAttendance) {
            for (const a of serverAttendance) {
              const key = `${a.participant_id}-${a.session_id}-${a.date}`;
              if (!localAttendanceSet.has(key)) {
                try {
                  await supabase.from('attendance').delete().eq('id', a.id);
                  console.log(`[SyncService] Deleted attendance from server: ${key}`);
                } catch (err) {
                  console.error('[SyncService] Failed to delete attendance:', err);
                }
              }
            }
          }
          
          // Add/update attendance records that exist locally but not on server or have changed
          for (const a of clubAttendance) {
            const key = `${a.participant_id}-${a.session_id}-${a.date}`;
            
            // Skip if either ID starts with "local-" (not yet synced to server)
            if (a.participant_id?.startsWith('local-') || a.session_id?.startsWith('local-')) {
              console.log(`[SyncService] Skipping attendance with local ID: ${key}`);
              continue;
            }
            
            const serverRecord = serverAttendance?.find((sa: any) => 
              sa.participant_id === a.participant_id && 
              sa.session_id === a.session_id && 
              sa.date === a.date
            );
            
            try {
              if (!serverRecord) {
                // Insert new attendance (convert status to present boolean)
                const attendanceData = {
                  participant_id: a.participant_id,
                  session_id: a.session_id,
                  date: a.date,
                  present: a.status === 'present', // Convert status text to boolean
                  updated_at: a.updated_at || new Date().toISOString() // Preserve local timestamp
                };
                
                console.log(`[SyncService] Uploading attendance: ${key}`);
                console.log('[SyncService] Cleaned attendance data to send:', attendanceData);
                
                // Validate all fields are present
                if (!attendanceData.participant_id || !attendanceData.session_id || !attendanceData.date || attendanceData.present === undefined) {
                  console.error('[SyncService] Invalid attendance data - missing required fields:', attendanceData);
                  continue;
                }
                
                const { data: inserted, error } = await supabase
                  .from('attendance')
                  .insert(attendanceData)
                  .select();
                  
                if (error) {
                  console.error(`[SyncService] Supabase error details:`, JSON.stringify(error));
                  throw error;
                }
                console.log(`[SyncService] ✅ Attendance uploaded: ${key}`, inserted);
              } else if (serverRecord.present !== (a.status === 'present')) {
                // Update existing attendance if status changed (compare boolean to converted status)
                console.log(`[SyncService] Updating attendance: ${key} present=${serverRecord.present} → ${a.status === 'present'}`);
                const { error } = await supabase.from('attendance').update({
                  present: a.status === 'present',
                  updated_at: a.updated_at || new Date().toISOString() // Preserve local timestamp
                }).eq('id', serverRecord.id);
                if (error) {
                  console.error(`[SyncService] Error updating attendance:`, error);
                  throw error;
                }
                console.log(`[SyncService] ✅ Attendance updated: ${key}`);
              }
            } catch (err) {
              console.error('[SyncService] Failed to sync attendance:', key, err);
            }
          }
        }
      }

      // Sync each club (download changes from server, skipping IDs we just uploaded)
      console.log(`[SyncService] ⬇️ About to sync ${clubsToSync.length} clubs`);
      for (const club of clubsToSync) {
        console.log(`[SyncService] ⬇️ Syncing club: ${club.name} (${club.id})`);
        const isOwner = club.owner_id === session.user.id;
        const localSessions = await dataService.getSessions(club.id);
        
        // For members with no local data, do a full sync (not just since last sync)
        const needsFullSync = !isOwner && localSessions.length === 0;
        const syncSince = needsFullSync ? new Date(0) : since; // Epoch = get all data
        
        await this.syncClub(club.id, syncSince, uploadedSessionIds, uploadedParticipantIds);
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
      const existingIndex = localRecords.findIndex((r: any) => r.id === serverRecord.id);
      
      if (existingIndex >= 0) {
        const localRecord = localRecords[existingIndex];
        
        // Compare timestamps: only update if server is newer
        const serverUpdated = serverRecord.updated_at || serverRecord.created_at;
        const localUpdated = localRecord.updated_at || localRecord.created_at;
        
        if (serverUpdated && localUpdated) {
          const serverTime = new Date(serverUpdated).getTime();
          const localTime = new Date(localUpdated).getTime();
          
          if (serverTime > localTime) {
            // Server is newer, update local
            console.log(`[SyncService] Server ${tableName} is newer, updating local:`, serverRecord.id);
            localRecords[existingIndex] = { ...localRecord, ...serverRecord };
          } else {
            console.log(`[SyncService] Local ${tableName} is newer, keeping local:`, serverRecord.id);
            // Keep local version, don't overwrite
          }
        } else {
          // No timestamps, use server version (default behavior)
          console.log(`[SyncService] No timestamps, updating ${tableName}:`, serverRecord.id);
          localRecords[existingIndex] = { ...localRecord, ...serverRecord };
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
        // For UPDATE operations, check if local data is newer before uploading
        if (operation === 'UPDATE' && !record.id.startsWith('local-')) {
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
          if (id && !id.startsWith('local-')) mappedRecord.id = id;
          
          const { data, error } = await supabase
            .from(table)
            .upsert(mappedRecord, { onConflict: 'id' })
            .select()
            .single();
          
          if (error) throw error;
          return data;
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
