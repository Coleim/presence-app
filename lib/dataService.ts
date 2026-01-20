import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { syncService } from './syncService';

const CLUBS_KEY = '@presence_app:clubs';
const SESSIONS_KEY = '@presence_app:sessions';
const PARTICIPANTS_KEY = '@presence_app:participants';
const PARTICIPANT_SESSIONS_KEY = '@presence_app:participant_sessions';
const ATTENDANCE_KEY = '@presence_app:attendance';
const USER_KEY = '@presence_app:user';

export interface Club {
  id: string;
  name: string;
  description?: string;
}

export interface Session {
  id: string;
  club_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  date?: string;
}

export interface Participant {
  id: string;
  club_id: string;
  first_name: string;
  last_name: string;
  is_long_term_sick?: boolean; // Exclude from attendance statistics
  preferred_session_ids?: string[]; // Array of session IDs this participant is assigned to
}

export interface ParticipantSession {
  id: string;
  participant_id: string;
  session_id: string;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  participant_id: string;
  date: string;
  status: 'present' | 'absent';
}

export interface User {
  id: string;
  email: string;
}

class DataService {
  public isOnline: boolean;

  constructor() {
    this.isOnline = false;
    // Don't check online on construction - do it lazily
    this.migrateStorageKeys();
  }

  // Migrate old storage keys to new prefixed keys
  private migrateStorageKeys = async () => {
    const migrations = [
      { old: 'clubs', new: '@presence_app:clubs' },
      { old: 'sessions', new: '@presence_app:sessions' },
      { old: 'participants', new: '@presence_app:participants' },
      { old: 'participant_sessions', new: '@presence_app:participant_sessions' },
      { old: 'attendance', new: '@presence_app:attendance' },
      { old: 'user', new: '@presence_app:user' }
    ];

    for (const { old, new: newKey } of migrations) {
      const oldData = await AsyncStorage.getItem(old);
      if (oldData) {
        // Copy to new key
        await AsyncStorage.setItem(newKey, oldData);
        // Remove old key
        await AsyncStorage.removeItem(old);
        console.log(`[DataService] Migrated ${old} → ${newKey}`);
      }
    }
  }

  checkOnline = () => {
    // Check online status in background without blocking
    supabase.from('clubs').select('id').limit(0)
      .then(() => {
        this.isOnline = true;
        console.log('[DataService] Online status: connected');
      },
      () => {
        this.isOnline = false;
        console.log('[DataService] Online status: offline');
      });
  }

  getClubs = async (): Promise<Club[]> => {
    const local = await AsyncStorage.getItem(CLUBS_KEY);
    const clubs = local ? JSON.parse(local) : [];
    return clubs;
  }

  getClub = async (id: string): Promise<Club | null> => {
    const clubs = await this.getClubs();
    return clubs.find(c => c.id === id) || null;
  }
  resetClubStats = async (clubId: string): Promise<void> => {
    const resetDate = new Date().toISOString().split('T')[0];
    
    // Update club with reset date
    const clubs = await this.getClubs();
    const updatedClubs = clubs.map(c => {
      if (c.id === clubId) {
        return { ...c, stats_reset_date: resetDate };
      }
      return c;
    });
    await AsyncStorage.setItem(CLUBS_KEY, JSON.stringify(updatedClubs));
    
    // Delete ALL attendance records from local storage
    await AsyncStorage.removeItem(ATTENDANCE_KEY);
    
    if (this.isOnline) {
      try {
        const club = updatedClubs.find(c => c.id === clubId);
        await supabase.from('clubs').update({ stats_reset_date: club?.stats_reset_date }).eq('id', clubId);
      } catch (e) {
        console.info('Reset stats locally, sync later');
      }
    }
  }
  deleteClub = async (id: string): Promise<void> => {
    const clubs = await this.getClubs();
    const club = clubs.find(c => c.id === id);
    const filtered = clubs.filter(c => c.id !== id);
    await AsyncStorage.setItem(CLUBS_KEY, JSON.stringify(filtered));
    
    // Also delete related data locally
    const sessions = await this.getSessions(id);
    const sessionIds = sessions.map(s => s.id);
    const allSessions = await AsyncStorage.getItem(SESSIONS_KEY);
    if (allSessions) {
      const filteredSessions = JSON.parse(allSessions).filter(s => s.club_id !== id);
      await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(filteredSessions));
    }
    const participants = await this.getParticipants(id);
    const participantIds = participants.map(p => p.id);
    const allParticipants = await AsyncStorage.getItem(PARTICIPANTS_KEY);
    if (allParticipants) {
      const filteredParticipants = JSON.parse(allParticipants).filter(p => p.club_id !== id);
      await AsyncStorage.setItem(PARTICIPANTS_KEY, JSON.stringify(filteredParticipants));
    }
    // Delete attendance for those sessions and participants
    const allAttendance = await AsyncStorage.getItem(ATTENDANCE_KEY);
    if (allAttendance) {
      const filteredAttendance = JSON.parse(allAttendance).filter(a => 
        !sessionIds.includes(a.session_id) && !participantIds.includes(a.participant_id)
      );
      await AsyncStorage.setItem(ATTENDANCE_KEY, JSON.stringify(filteredAttendance));
    }
    
    // Delete participant_sessions for these participants
    const allPS = await AsyncStorage.getItem(PARTICIPANT_SESSIONS_KEY);
    if (allPS) {
      const filteredPS = JSON.parse(allPS).filter(ps => !participantIds.includes(ps.participant_id));
      await AsyncStorage.setItem(PARTICIPANT_SESSIONS_KEY, JSON.stringify(filteredPS));
    }
    
    // Delete from cloud
    if (this.isOnline) {
      console.log('[DataService] Deleting club from cloud:', id);
      try {
        // Delete participant_sessions first (foreign key constraint)
        if (participantIds.length > 0) {
          console.log('[DataService] Deleting participant_sessions for', participantIds.length, 'participants');
          await supabase.from('participant_sessions').delete().in('participant_id', participantIds);
        }
        // Delete attendance
        if (sessionIds.length > 0) {
          console.log('[DataService] Deleting attendance for', sessionIds.length, 'sessions');
          await supabase.from('attendance').delete().in('session_id', sessionIds);
        }
        if (participantIds.length > 0) {
          console.log('[DataService] Deleting attendance for', participantIds.length, 'participants');
          await supabase.from('attendance').delete().in('participant_id', participantIds);
        }
        // Delete participants
        console.log('[DataService] Deleting participants for club', id);
        await supabase.from('participants').delete().eq('club_id', id);
        // Delete sessions
        console.log('[DataService] Deleting sessions for club', id);
        await supabase.from('sessions').delete().eq('club_id', id);
        // Delete club
        if (club) {
          console.log('[DataService] Deleting club', id);
          await syncService.uploadToSupabase('clubs', club, 'DELETE');
          console.log('[DataService] ✅ Club deleted from cloud');
        }
      } catch (e) {
        console.error('Error deleting club from cloud:', e);
        console.info('Club deleted locally, will sync later');
      }
    } else {
      console.log('[DataService] Offline - club deleted locally only');
    }
  }

  saveClub = async (club: Club): Promise<Club> => {
    const clubs = await this.getClubs();
    const existingIndex = clubs.findIndex((c: Club) => c.id === club.id);
    
    if (existingIndex >= 0) {
      clubs[existingIndex] = club;
    } else {
      // Generate UUID for new club
      club.id = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      clubs.push(club);
    }
    
    // Save locally first
    await AsyncStorage.setItem(CLUBS_KEY, JSON.stringify(clubs));
    
    // Cloud sync will be handled by periodic SyncService
    
    return club;
  }

  getSessions = async (clubId: string): Promise<Session[]> => {
    const local = await AsyncStorage.getItem(SESSIONS_KEY);
    const sessions = local ? JSON.parse(local).filter((s: Session) => s.club_id === clubId) : [];
    return sessions;
  }

  saveSession = async (session: Session): Promise<Session> => {
    const allSessions = await AsyncStorage.getItem(SESSIONS_KEY);
    let sessions = allSessions ? JSON.parse(allSessions) : [];
    const existingIndex = sessions.findIndex((s: Session) => s.id === session.id);
    
    if (existingIndex >= 0) {
      sessions[existingIndex] = session;
    } else {
      session.id = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      sessions.push(session);
    }
    
    // Save locally first
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    
    // Cloud sync will be handled by periodic SyncService
    
    return session;
  }

  deleteSession = async (id: string): Promise<void> => {
    const allSessions = await AsyncStorage.getItem(SESSIONS_KEY);
    let session = null;
    if (allSessions) {
      const sessions = JSON.parse(allSessions);
      session = sessions.find(s => s.id === id);
      const filtered = sessions.filter(s => s.id !== id);
      await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(filtered));
    }
    if (this.isOnline && session) {
      try {
        await syncService.uploadToSupabase('sessions', session, 'DELETE');
      } catch (e) {
        console.info('Delete sync later');
      }
    }
    // Delete related attendance records
    const allAttendance = await AsyncStorage.getItem(ATTENDANCE_KEY);
    if (allAttendance) {
      const attendance = JSON.parse(allAttendance).filter(a => a.session_id !== id);
      await AsyncStorage.setItem(ATTENDANCE_KEY, JSON.stringify(attendance));
    }
  }

  getParticipants = async (clubId: string): Promise<Participant[]> => {
    const local = await AsyncStorage.getItem(PARTICIPANTS_KEY);
    const participants = local ? JSON.parse(local).filter((p: Participant) => p.club_id === clubId) : [];
    return participants;
  }

  saveParticipant = async (participant: Participant): Promise<Participant> => {
    const allParticipants = await AsyncStorage.getItem(PARTICIPANTS_KEY);
    let participants = allParticipants ? JSON.parse(allParticipants) : [];
    const existingIndex = participants.findIndex((p: Participant) => p.id === participant.id);
    
    if (existingIndex >= 0) {
      participants[existingIndex] = participant;
    } else {
      participant.id = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      participants.push(participant);
    }
    
    // Save locally first
    await AsyncStorage.setItem(PARTICIPANTS_KEY, JSON.stringify(participants));
    
    // Cloud sync will be handled by periodic SyncService
    
    return participant;
  }

  deleteParticipant = async (id: string): Promise<void> => {
    const allParticipants = await AsyncStorage.getItem(PARTICIPANTS_KEY);
    let participant = null;
    if (allParticipants) {
      const participants = JSON.parse(allParticipants);
      participant = participants.find(p => p.id === id);
      const filtered = participants.filter(p => p.id !== id);
      await AsyncStorage.setItem(PARTICIPANTS_KEY, JSON.stringify(filtered));
    }
    if (this.isOnline && participant) {
      try {
        await syncService.uploadToSupabase('participants', participant, 'DELETE');
      } catch (e) {
        console.info('Delete sync later');
      }
    }
    // Delete related attendance records
    const allAttendance = await AsyncStorage.getItem(ATTENDANCE_KEY);
    if (allAttendance) {
      const attendance = JSON.parse(allAttendance).filter(a => a.participant_id !== id);
      await AsyncStorage.setItem(ATTENDANCE_KEY, JSON.stringify(attendance));
    }
  }

  getAttendance = async (sessionId: string, date: string): Promise<AttendanceRecord[]> => {
    console.log('[DataService] getAttendance for session', sessionId, 'date', date);
    const local = await AsyncStorage.getItem(ATTENDANCE_KEY);
    const attendance = local ? JSON.parse(local).filter((a: AttendanceRecord) => a.session_id === sessionId && a.date === date) : [];
    console.log('[DataService] Found', attendance.length, 'attendance records in local storage');
    return attendance;
  }

  getAllAttendance = async (): Promise<AttendanceRecord[]> => {
    const local = await AsyncStorage.getItem(ATTENDANCE_KEY);
    const allAttendance = local ? JSON.parse(local) : [];
    return allAttendance;
  }

  saveAttendance = async (records: AttendanceRecord[]): Promise<void> => {
    console.log('[DataService] saveAttendance called with', records.length, 'records');
    
    if (records.length === 0) {
      console.log('[DataService] No records to save');
      return;
    }
    
    const firstRecord = records[0];
    console.log('[DataService] Full first record:', JSON.stringify(firstRecord));
    
    const allAttendance = await AsyncStorage.getItem(ATTENDANCE_KEY);
    let attendance = allAttendance ? JSON.parse(allAttendance) : [];
    
    // Remove existing records for this session and date
    const sessionId = firstRecord.session_id;
    const date = firstRecord.date;
    console.log('[DataService] Filtering by - sessionId:', sessionId, 'date:', date);
    attendance = attendance.filter((a: AttendanceRecord) => !(a.session_id === sessionId && a.date === date));
    
    // Add new records with IDs
    const recordsWithIds = records.map(record => ({
      ...record,
      id: record.id || Date.now().toString() + Math.random().toString(36).substr(2, 9)
    }));
    
    attendance.push(...recordsWithIds);
    
    console.log('[DataService] Saving', attendance.length, 'total attendance records to local storage');
    // Save locally first
    await AsyncStorage.setItem(ATTENDANCE_KEY, JSON.stringify(attendance));
    
    // Cloud sync will be handled by periodic SyncService
  }

  getUser = async (): Promise<User | null> => {
    const local = await AsyncStorage.getItem(USER_KEY);
    if (local) return JSON.parse(local);
    
    // Use authManager to get session without lock contention
    const session = await authManager.getSession();
    if (this.isOnline && session?.user) {
      const user = session.user;
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
      return user;
    }
    return null; // Offline user
  }

  setUser = async (user: User): Promise<void> => {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  // Participant Sessions (Preferred Sessions) methods
  
  getParticipantSessions = async (participantId: string): Promise<string[]> => {
    console.log('[DataService] getParticipantSessions called for:', participantId);
    const local = await AsyncStorage.getItem(PARTICIPANT_SESSIONS_KEY);
    const allPS = local ? JSON.parse(local) : [];
    const participantSessions = allPS.filter(ps => ps.participant_id === participantId);
    
    console.log('[DataService] Found', participantSessions.length, 'sessions for participant', participantId);
    console.log('[DataService] Session IDs:', participantSessions.map(ps => ps.session_id));
    
    // Return local data immediately - SyncService handles cloud sync
    return participantSessions.map(ps => ps.session_id);
  }

  saveParticipantSessions = async (participantId: string, sessionIds: string[]): Promise<void> => {
    console.log('[DataService] saveParticipantSessions called:', { participantId, sessionIds });
    
    // Remove all existing relationships for this participant
    const local = await AsyncStorage.getItem(PARTICIPANT_SESSIONS_KEY);
    let allPS = local ? JSON.parse(local) : [];
    console.log('[DataService] Current participant_sessions count:', allPS.length);
    
    allPS = allPS.filter((ps: ParticipantSession) => ps.participant_id !== participantId);
    console.log('[DataService] After filtering participant', participantId, ':', allPS.length);
    
    // Add new relationships
    sessionIds.forEach(sessionId => {
      const newPS: ParticipantSession = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        participant_id: participantId,
        session_id: sessionId
      };
      allPS.push(newPS);
      console.log('[DataService] Added participant_session:', newPS);
    });
    
    // Save locally first
    await AsyncStorage.setItem(PARTICIPANT_SESSIONS_KEY, JSON.stringify(allPS));
    console.log('[DataService] ✅ Saved participant_sessions. Total count:', allPS.length);
    
    // Cloud sync will be handled by periodic SyncService
  }

  // Get participants with their preferred sessions loaded
  getParticipantsWithSessions = async (clubId: string): Promise<Participant[]> => {
    const participants = await this.getParticipants(clubId);
    
    // Load preferred sessions for each participant
    for (const participant of participants) {
      participant.preferred_session_ids = await this.getParticipantSessions(participant.id);
    }
    
    return participants;
  }
}

export const dataService = new DataService();