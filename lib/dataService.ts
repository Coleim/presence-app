import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const CLUBS_KEY = 'clubs';
const SESSIONS_KEY = 'sessions';
const PARTICIPANTS_KEY = 'participants';
const PARTICIPANT_SESSIONS_KEY = 'participant_sessions';
const ATTENDANCE_KEY = 'attendance';
const USER_KEY = 'user';

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
  grade?: string;
  level?: string;
  notes?: string;
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
  constructor() {
    this.isOnline = false;
    this.checkOnline();
  }

  checkOnline = async () => {
    try {
      // Simple check if supabase is configured
      if (supabase && supabase.supabaseUrl !== 'YOUR_SUPABASE_URL') {
        await supabase.from('clubs').select('id').limit(1);
        this.isOnline = true;
      }
    } catch {
      this.isOnline = false;
    }
  }

  getClubs = async (): Promise<Club[]> => {
    const local = await AsyncStorage.getItem(CLUBS_KEY);
    let clubs = local ? JSON.parse(local) : [];
    if (this.isOnline) {
      try {
        const { data } = await supabase.from('clubs').select('*');
        if (data) {
          clubs = data;
          await AsyncStorage.setItem(CLUBS_KEY, JSON.stringify(clubs));
        }
      } catch (e) {
        console.log('Offline mode for clubs');
      }
    }
    return clubs;
  }

  getClub = async (id: string): Promise<Club | null> => {
    const clubs = await this.getClubs();
    return clubs.find(c => c.id === id) || null;
  }

  deleteClub = async (id: string): Promise<void> => {
    const clubs = await this.getClubs();
    const filtered = clubs.filter(c => c.id !== id);
    await AsyncStorage.setItem(CLUBS_KEY, JSON.stringify(filtered));
    if (this.isOnline) {
      try {
        await supabase.from('clubs').delete().eq('id', id);
      } catch (e) {
        console.log('Delete sync later');
      }
    }
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
  }

  saveClub = async (club: Club): Promise<Club> => {
    const clubs = await this.getClubs();
    const existingIndex = clubs.findIndex(c => c.id === club.id);
    if (existingIndex >= 0) {
      clubs[existingIndex] = club;
    } else {
      club.id = Date.now().toString(); // Local ID
      clubs.push(club);
    }
    await AsyncStorage.setItem(CLUBS_KEY, JSON.stringify(clubs));
    if (this.isOnline) {
      try {
        const { data, error } = await supabase.from('clubs').upsert(club).select();
        if (!error && data) {
          // Update with server ID
          club.id = data[0].id;
          await AsyncStorage.setItem(CLUBS_KEY, JSON.stringify(clubs));
        }
      } catch (e) {
        console.log('Save locally, sync later');
      }
    }
    return club;
  }

  getSessions = async (clubId: string): Promise<Session[]> => {
    const local = await AsyncStorage.getItem(SESSIONS_KEY);
    let sessions = local ? JSON.parse(local).filter(s => s.club_id === clubId) : [];
    if (this.isOnline) {
      try {
        const { data } = await supabase.from('sessions').select('*').eq('club_id', clubId);
        if (data) {
          sessions = data;
          const allSessions = local ? JSON.parse(local) : [];
          // Merge
          data.forEach(s => {
            const index = allSessions.findIndex(as => as.id === s.id);
            if (index >= 0) allSessions[index] = s;
            else allSessions.push(s);
          });
          await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(allSessions));
        }
      } catch (e) {
        console.log('Offline mode for sessions');
      }
    }
    return sessions;
  }

  saveSession = async (session: Session): Promise<Session> => {
    const allSessions = await AsyncStorage.getItem(SESSIONS_KEY);
    let sessions = allSessions ? JSON.parse(allSessions) : [];
    const existingIndex = sessions.findIndex(s => s.id === session.id);
    if (existingIndex >= 0) {
      sessions[existingIndex] = session;
    } else {
      session.id = Date.now().toString();
      sessions.push(session);
    }
    await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    if (this.isOnline) {
      try {
        const { data, error } = await supabase.from('sessions').upsert(session).select();
        if (!error && data) {
          session.id = data[0].id;
          await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
        }
      } catch (e) {
        console.log('Save locally');
      }
    }
    return session;
  }

  deleteSession = async (id: string): Promise<void> => {
    const allSessions = await AsyncStorage.getItem(SESSIONS_KEY);
    if (allSessions) {
      const sessions = JSON.parse(allSessions).filter(s => s.id !== id);
      await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    }
    if (this.isOnline) {
      try {
        await supabase.from('sessions').delete().eq('id', id);
      } catch (e) {
        console.log('Delete sync later');
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
    let participants = local ? JSON.parse(local).filter(p => p.club_id === clubId) : [];
    if (this.isOnline) {
      try {
        const { data } = await supabase.from('participants').select('*').eq('club_id', clubId);
        if (data) {
          participants = data;
          const allParticipants = local ? JSON.parse(local) : [];
          data.forEach(p => {
            const index = allParticipants.findIndex(ap => ap.id === p.id);
            if (index >= 0) allParticipants[index] = p;
            else allParticipants.push(p);
          });
          await AsyncStorage.setItem(PARTICIPANTS_KEY, JSON.stringify(allParticipants));
        }
      } catch (e) {
        console.log('Offline mode for participants');
      }
    }
    return participants;
  }

  saveParticipant = async (participant: Participant): Promise<Participant> => {
    const allParticipants = await AsyncStorage.getItem(PARTICIPANTS_KEY);
    let participants = allParticipants ? JSON.parse(allParticipants) : [];
    const existingIndex = participants.findIndex(p => p.id === participant.id);
    if (existingIndex >= 0) {
      participants[existingIndex] = participant;
    } else {
      participant.id = Date.now().toString();
      participants.push(participant);
    }
    await AsyncStorage.setItem(PARTICIPANTS_KEY, JSON.stringify(participants));
    if (this.isOnline) {
      try {
        const { data, error } = await supabase.from('participants').upsert(participant).select();
        if (!error && data) {
          participant.id = data[0].id;
          await AsyncStorage.setItem(PARTICIPANTS_KEY, JSON.stringify(participants));
        }
      } catch (e) {
        console.log('Save locally');
      }
    }
    return participant;
  }

  deleteParticipant = async (id: string): Promise<void> => {
    const allParticipants = await AsyncStorage.getItem(PARTICIPANTS_KEY);
    if (allParticipants) {
      const participants = JSON.parse(allParticipants).filter(p => p.id !== id);
      await AsyncStorage.setItem(PARTICIPANTS_KEY, JSON.stringify(participants));
    }
    if (this.isOnline) {
      try {
        await supabase.from('participants').delete().eq('id', id);
      } catch (e) {
        console.log('Delete sync later');
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
    const local = await AsyncStorage.getItem(ATTENDANCE_KEY);
    let attendance = local ? JSON.parse(local).filter(a => a.session_id === sessionId && a.date === date) : [];
    if (this.isOnline) {
      try {
        const { data } = await supabase.from('attendance').select('*').eq('session_id', sessionId).eq('date', date);
        if (data) {
          attendance = data;
          const allAttendance = local ? JSON.parse(local) : [];
          data.forEach(a => {
            const index = allAttendance.findIndex(aa => aa.id === a.id);
            if (index >= 0) allAttendance[index] = a;
            else allAttendance.push(a);
          });
          await AsyncStorage.setItem(ATTENDANCE_KEY, JSON.stringify(allAttendance));
        }
      } catch (e) {
        console.log('Offline mode for attendance');
      }
    }
    return attendance;
  }

  getAllAttendance = async (): Promise<AttendanceRecord[]> => {
    const local = await AsyncStorage.getItem(ATTENDANCE_KEY);
    return local ? JSON.parse(local) : [];
  }

  saveAttendance = async (records: AttendanceRecord[]): Promise<void> => {
    const allAttendance = await AsyncStorage.getItem(ATTENDANCE_KEY);
    let attendance = allAttendance ? JSON.parse(allAttendance) : [];
    
    // Remove existing records for this session and date
    const sessionId = records[0]?.session_id;
    const date = records[0]?.date;
    attendance = attendance.filter(a => !(a.session_id === sessionId && a.date === date));
    
    // Add new records
    records.forEach(record => {
      record.id = record.id || Date.now().toString() + Math.random().toString(36).substr(2, 9);
      attendance.push(record);
    });
    
    await AsyncStorage.setItem(ATTENDANCE_KEY, JSON.stringify(attendance));
    
    if (this.isOnline) {
      try {
        // Upsert each record
        for (const record of records) {
          const { error } = await supabase.from('attendance').upsert(record);
          if (error) console.log('Sync error:', error);
        }
      } catch (e) {
        console.log('Save locally, sync later');
      }
    }
  }

  getUser = async (): Promise<User | null> => {
    const local = await AsyncStorage.getItem(USER_KEY);
    if (local) return JSON.parse(local);
    if (this.isOnline && supabase.auth.user()) {
      const user = supabase.auth.user();
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
    const local = await AsyncStorage.getItem(PARTICIPANT_SESSIONS_KEY);
    let participantSessions = local ? JSON.parse(local).filter(ps => ps.participant_id === participantId) : [];
    
    if (this.isOnline) {
      try {
        const { data } = await supabase.from('participant_sessions').select('*').eq('participant_id', participantId);
        if (data) {
          participantSessions = data;
          const allPS = local ? JSON.parse(local) : [];
          data.forEach(ps => {
            const index = allPS.findIndex(aps => aps.id === ps.id);
            if (index >= 0) allPS[index] = ps;
            else allPS.push(ps);
          });
          await AsyncStorage.setItem(PARTICIPANT_SESSIONS_KEY, JSON.stringify(allPS));
        }
      } catch (e) {
        console.log('Offline mode for participant sessions');
      }
    }
    
    return participantSessions.map(ps => ps.session_id);
  }

  saveParticipantSessions = async (participantId: string, sessionIds: string[]): Promise<void> => {
    // Remove all existing relationships for this participant
    const local = await AsyncStorage.getItem(PARTICIPANT_SESSIONS_KEY);
    let allPS = local ? JSON.parse(local) : [];
    allPS = allPS.filter(ps => ps.participant_id !== participantId);
    
    // Add new relationships
    sessionIds.forEach(sessionId => {
      const newPS: ParticipantSession = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        participant_id: participantId,
        session_id: sessionId
      };
      allPS.push(newPS);
    });
    
    await AsyncStorage.setItem(PARTICIPANT_SESSIONS_KEY, JSON.stringify(allPS));
    
    if (this.isOnline) {
      try {
        // Delete existing relationships
        await supabase.from('participant_sessions').delete().eq('participant_id', participantId);
        
        // Insert new relationships
        if (sessionIds.length > 0) {
          const records = sessionIds.map(sessionId => ({
            participant_id: participantId,
            session_id: sessionId
          }));
          await supabase.from('participant_sessions').insert(records);
        }
      } catch (e) {
        console.log('Save locally, sync later');
      }
    }
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