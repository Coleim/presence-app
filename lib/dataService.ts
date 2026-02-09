import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const CLUBS_KEY = '@presence_app:clubs';
const SESSIONS_KEY = '@presence_app:sessions';
const PARTICIPANTS_KEY = '@presence_app:participants';
const PARTICIPANT_SESSIONS_KEY = '@presence_app:participant_sessions';
const ATTENDANCE_KEY = '@presence_app:attendance';
const USER_KEY = '@presence_app:user';
const DELETED_ITEMS_KEY = '@presence_app:deleted_items';

/**
 * Generate a deterministic UUID v4-like ID from content.
 * Same content always produces the same ID, avoiding duplicates.
 * Exported for use in syncService.
 */
export const generateContentBasedId = (content: string): string => {
  // Simple hash function (djb2)
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash) + content.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Generate a second hash for more uniqueness
  let hash2 = 0;
  for (let i = 0; i < content.length; i++) {
    hash2 = content.charCodeAt(i) + ((hash2 << 6) + (hash2 << 16) - hash2);
    hash2 = hash2 & hash2;
  }
  
  // Convert to hex and format as UUID-like string
  const h1 = Math.abs(hash).toString(16).padStart(8, '0');
  const h2 = Math.abs(hash2).toString(16).padStart(8, '0');
  const h3 = Math.abs(hash ^ hash2).toString(16).padStart(8, '0');
  const h4 = Math.abs(hash + hash2).toString(16).padStart(8, '0');
  
  return `${h1.slice(0,8)}-${h1.slice(0,4)}-4${h2.slice(0,3)}-${['8','9','a','b'][Math.abs(hash) % 4]}${h2.slice(3,6)}-${h3.slice(0,4)}${h4.slice(0,8)}`.toLowerCase();
};

interface DeletedItems {
  clubs: string[];
  sessions: string[];
  participants: string[];
  participant_sessions: string[];
  attendance: string[];
}

export interface Club {
  id: string;
  name: string;
  description?: string;
  owner_id?: string;
  share_code?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Session {
  id: string;
  club_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  date?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Participant {
  id: string;
  club_id: string;
  first_name: string;
  last_name: string;
  is_long_term_sick?: boolean; // Exclude from attendance statistics
  preferred_session_ids?: string[]; // Array of session IDs this participant is assigned to
  created_at?: string;
  updated_at?: string;
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
  present: boolean;
  created_at?: string;
  updated_at?: string;
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
      }
    }
    
    // Clean up invalid attendance records with non-UUID IDs
    await this.cleanupInvalidAttendanceRecords();
  }
  
  // Remove attendance records with invalid UUID IDs
  private cleanupInvalidAttendanceRecords = async () => {
    const attendanceData = await AsyncStorage.getItem(ATTENDANCE_KEY);
    if (!attendanceData) return;
    
    const attendance = JSON.parse(attendanceData);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    // Only check if ID is valid UUID IF it exists (undefined is OK for new records)
    const isValidUUID = (id: string | undefined) => {
      if (!id || id === 'undefined') return true; // undefined is valid (new record)
      return uuidRegex.test(id); // check format if ID exists
    };
    
    const validAttendance = attendance.filter((a: AttendanceRecord) => {
      // Check all IDs - only validate if they exist
      const validId = isValidUUID(a.id);
      const validParticipantId = isValidUUID(a.participant_id);
      const validSessionId = isValidUUID(a.session_id);
      const isValid = validId && validParticipantId && validSessionId;
      
      return isValid;
    });
    
    if (validAttendance.length !== attendance.length) {
      await AsyncStorage.setItem(ATTENDANCE_KEY, JSON.stringify(validAttendance));
    }
  }

  checkOnline = () => {
    // Check online status in background without blocking
    supabase.from('clubs').select('id').limit(0)
      .then(() => {
        this.isOnline = true;
      },
      () => {
        this.isOnline = false;
      });
  }

  // ============================================
  // DELETION TRACKING SYSTEM
  // Track items explicitly deleted by user for sync
  // ============================================
  
  private getDeletedItems = async (): Promise<DeletedItems> => {
    const data = await AsyncStorage.getItem(DELETED_ITEMS_KEY);
    return data ? JSON.parse(data) : {
      clubs: [],
      sessions: [],
      participants: [],
      participant_sessions: [],
      attendance: []
    };
  }

  markAsDeleted = async (type: keyof DeletedItems, id: string): Promise<void> => {
    const deleted = await this.getDeletedItems();
    if (!deleted[type].includes(id)) {
      deleted[type].push(id);
      await AsyncStorage.setItem(DELETED_ITEMS_KEY, JSON.stringify(deleted));
    }
  }

  clearDeletedMarks = async (type: keyof DeletedItems, ids: string[]): Promise<void> => {
    const deleted = await this.getDeletedItems();
    deleted[type] = deleted[type].filter(id => !ids.includes(id));
    await AsyncStorage.setItem(DELETED_ITEMS_KEY, JSON.stringify(deleted));
  }

  getDeletedIds = async (type: keyof DeletedItems): Promise<string[]> => {
    const deleted = await this.getDeletedItems();
    return deleted[type];
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

  // Join a club using a share code
  joinClubByCode = async (shareCode: string): Promise<Club | null> => {
    try {
      // Try to fetch club from server by share code
      const { data, error } = await supabase
        .rpc('get_club_by_share_code', {
          p_share_code: shareCode.toUpperCase()
        });

      if (error) {
        return null;
      }

      if (!data || data.length === 0) {
        return null;
      }

      const clubData = data[0];
      const club: Club = {
        id: clubData.club_id,
        name: clubData.club_name,
        description: clubData.club_description,
        owner_id: clubData.owner_id,
        share_code: clubData.share_code,
        created_at: clubData.created_at,
        updated_at: clubData.updated_at
      };

      // Add user as a club member in the database
      const { error: memberError } = await supabase
        .from('club_members')
        .insert({
          club_id: club.id,
          user_id: (await supabase.auth.getSession()).data.session?.user.id
        })
        .select()
        .single();

      if (memberError) {
        // Ignore duplicate key errors (user already a member)
        if (memberError.code !== '23505') {
          // Silent fail for other errors
        }
      }

      // Download all club data immediately
      
      // Download sessions
      const { data: sessions, error: sessionsError } = await supabase
        .from('sessions')
        .select('*')
        .eq('club_id', club.id);
      
      if (sessionsError) {
        // Silent fail
      } else if (sessions && sessions.length > 0) {
        const allSessions = await AsyncStorage.getItem(SESSIONS_KEY);
        const existingSessions = allSessions ? JSON.parse(allSessions) : [];
        const merged = [...existingSessions, ...sessions];
        await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(merged));
      }
      
      // Download participants
      const { data: participants, error: participantsError } = await supabase
        .from('participants')
        .select('*')
        .eq('club_id', club.id);
      
      if (participants && participants.length > 0) {
        const allParticipants = await AsyncStorage.getItem(PARTICIPANTS_KEY);
        const existingParticipants = allParticipants ? JSON.parse(allParticipants) : [];
        const merged = [...existingParticipants, ...participants];
        await AsyncStorage.setItem(PARTICIPANTS_KEY, JSON.stringify(merged));
      }
      
      // Download attendance - get attendance for all sessions in this club
      if (sessions && sessions.length > 0) {
        const sessionIds = sessions.map(s => s.id);
        
        // Chunk session IDs to avoid query limits (PostgreSQL IN clause limit)
        const CHUNK_SIZE = 500;
        const attendanceRecords: any[] = [];
        
        for (let i = 0; i < sessionIds.length; i += CHUNK_SIZE) {
          const chunk = sessionIds.slice(i, i + CHUNK_SIZE);
          const { data: chunkAttendance, error: attendanceError } = await supabase
            .from('attendance')
            .select('*')
            .in('session_id', chunk);
          
          if (attendanceError) {
            // Silent fail
          } else if (chunkAttendance) {
            attendanceRecords.push(...chunkAttendance);
          }
        }
        
        if (attendanceRecords.length > 0) {
          const allAttendance = await AsyncStorage.getItem(ATTENDANCE_KEY);
          const existingAttendance = allAttendance ? JSON.parse(allAttendance) : [];
          
          // Merge without duplicates based on attendance ID
          const existingIds = new Set(existingAttendance.map((a: AttendanceRecord) => a.id));
          const newAttendance = attendanceRecords.filter(a => !existingIds.has(a.id));
          const merged = [...existingAttendance, ...newAttendance];
          
          await AsyncStorage.setItem(ATTENDANCE_KEY, JSON.stringify(merged));
        }
      }
      
      // Download participant_sessions
      if (sessions && sessions.length > 0) {
        const sessionIds = sessions.map(s => s.id);
        const { data: participantSessions } = await supabase
          .from('participant_sessions')
          .select('*')
          .in('session_id', sessionIds);
        
        if (participantSessions && participantSessions.length > 0) {
          const allPS = await AsyncStorage.getItem(PARTICIPANT_SESSIONS_KEY);
          const existingPS = allPS ? JSON.parse(allPS) : [];
          const merged = [...existingPS, ...participantSessions];
          await AsyncStorage.setItem(PARTICIPANT_SESSIONS_KEY, JSON.stringify(merged));
        }
      }

      // Save club locally
      const clubs = await this.getClubs();
      const existingIndex = clubs.findIndex(c => c.id === club.id);
      if (existingIndex >= 0) {
        clubs[existingIndex] = club;
      } else {
        clubs.push(club);
      }
      await AsyncStorage.setItem(CLUBS_KEY, JSON.stringify(clubs));

      return club;
    } catch (error) {
      return null;
    }
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
        // Silent fail - sync later
      }
    }
  }
  deleteClub = async (id: string): Promise<void> => {
    const clubs = await this.getClubs();
    const club = clubs.find(c => c.id === id);
    const filtered = clubs.filter(c => c.id !== id);
    await AsyncStorage.setItem(CLUBS_KEY, JSON.stringify(filtered));
    
    // Mark club as deleted for sync
    await this.markAsDeleted('clubs', id);
    
    // Also delete related data locally
    const sessions = await this.getSessions(id);
    const sessionIds = sessions.map(s => s.id);
    const allSessions = await AsyncStorage.getItem(SESSIONS_KEY);
    if (allSessions) {
      const filteredSessions = JSON.parse(allSessions).filter(s => s.club_id !== id);
      await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(filteredSessions));
    }
    // Mark all sessions as deleted
    for (const sessionId of sessionIds) {
      await this.markAsDeleted('sessions', sessionId);
    }
    
    const participants = await this.getParticipants(id);
    const participantIds = participants.map(p => p.id);
    const allParticipants = await AsyncStorage.getItem(PARTICIPANTS_KEY);
    if (allParticipants) {
      const filteredParticipants = JSON.parse(allParticipants).filter(p => p.club_id !== id);
      await AsyncStorage.setItem(PARTICIPANTS_KEY, JSON.stringify(filteredParticipants));
    }
    // Mark all participants as deleted
    for (const participantId of participantIds) {
      await this.markAsDeleted('participants', participantId);
    }
    
    // Delete attendance for those sessions and participants
    const allAttendance = await AsyncStorage.getItem(ATTENDANCE_KEY);
    if (allAttendance) {
      const attendanceRecords = JSON.parse(allAttendance);
      const attendanceToDelete = attendanceRecords.filter(a => 
        sessionIds.includes(a.session_id) || participantIds.includes(a.participant_id)
      );
      // Mark attendance as deleted
      for (const att of attendanceToDelete) {
        await this.markAsDeleted('attendance', att.id);
      }
      const filteredAttendance = attendanceRecords.filter(a => 
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
    
    // Delete from cloud ONLY if user is the owner
    if (this.isOnline && club) {
      // Get current user to check ownership
      const { data: { user } } = await supabase.auth.getUser();
      const isOwner = user && club.owner_id === user.id;
      
      if (isOwner) {
        try {
          // Delete participant_sessions first (foreign key constraint)
          if (participantIds.length > 0) {
            await supabase.from('participant_sessions').delete().in('participant_id', participantIds);
          }
          // Delete attendance
          if (sessionIds.length > 0) {
            await supabase.from('attendance').delete().in('session_id', sessionIds);
          }
          if (participantIds.length > 0) {
            await supabase.from('attendance').delete().in('participant_id', participantIds);
          }
          // Delete participants
          await supabase.from('participants').delete().eq('club_id', id);
          // Delete sessions
          await supabase.from('sessions').delete().eq('club_id', id);
          // Delete club
          await supabase.from('clubs').delete().eq('id', id);
        } catch (e) {
          // Silent fail - club deleted locally, will try to sync later
        }
      }
    }
  }

  saveClub = async (club: Club): Promise<Club> => {
    const clubs = await this.getClubs();
    const existingIndex = clubs.findIndex((c: Club) => c.id === club.id);
    
    // Add updated_at timestamp
    club.updated_at = new Date().toISOString();
    
    if (existingIndex >= 0) {
      clubs[existingIndex] = club;
    } else {
      // Generate local ID for new club (server will generate share_code via trigger)
      club.id = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      club.created_at = new Date().toISOString();
      // Don't set share_code - server will generate it via trigger
      clubs.push(club);
    }
    
    // Save locally first
    await AsyncStorage.setItem(CLUBS_KEY, JSON.stringify(clubs));
    
    // Cloud sync will be handled by periodic SyncService
    
    return club;
  }

  /**
   * Migrate session references when session ID changes (old ID -> content hash ID)
   * Updates attendance and participant_sessions to use the new ID
   */
  private migrateSessionReferences = async (oldId: string, newId: string): Promise<void> => {
    if (oldId === newId) return;
    
    // Update attendance records
    const attendanceData = await AsyncStorage.getItem(ATTENDANCE_KEY);
    if (attendanceData) {
      const attendance = JSON.parse(attendanceData);
      const updated = attendance.map((a: any) => 
        a.session_id === oldId ? { ...a, session_id: newId, updated_at: new Date().toISOString() } : a
      );
      await AsyncStorage.setItem(ATTENDANCE_KEY, JSON.stringify(updated));
    }
    
    // Update participant_sessions records
    const psData = await AsyncStorage.getItem(PARTICIPANT_SESSIONS_KEY);
    if (psData) {
      const participantSessions = JSON.parse(psData);
      const updated = participantSessions.map((ps: any) => 
        ps.session_id === oldId ? { ...ps, session_id: newId, updated_at: new Date().toISOString() } : ps
      );
      await AsyncStorage.setItem(PARTICIPANT_SESSIONS_KEY, JSON.stringify(updated));
    }
    
    // Also migrate the deleted items tracking
    const deletedData = await AsyncStorage.getItem(DELETED_ITEMS_KEY);
    if (deletedData) {
      const deleted = JSON.parse(deletedData);
      if (deleted.sessions?.includes(oldId)) {
        deleted.sessions = deleted.sessions.filter((id: string) => id !== oldId);
        deleted.sessions.push(newId);
        await AsyncStorage.setItem(DELETED_ITEMS_KEY, JSON.stringify(deleted));
      }
    }
  }

  /**
   * Migrate participant references when participant ID changes (old ID -> content hash ID)
   * Updates attendance and participant_sessions to use the new ID
   */
  private migrateParticipantReferences = async (oldId: string, newId: string): Promise<void> => {
    if (oldId === newId) return;
    
    // Update attendance records
    const attendanceData = await AsyncStorage.getItem(ATTENDANCE_KEY);
    if (attendanceData) {
      const attendance = JSON.parse(attendanceData);
      const updated = attendance.map((a: any) => 
        a.participant_id === oldId ? { ...a, participant_id: newId, updated_at: new Date().toISOString() } : a
      );
      await AsyncStorage.setItem(ATTENDANCE_KEY, JSON.stringify(updated));
    }
    
    // Update participant_sessions records
    const psData = await AsyncStorage.getItem(PARTICIPANT_SESSIONS_KEY);
    if (psData) {
      const participantSessions = JSON.parse(psData);
      const updated = participantSessions.map((ps: any) => 
        ps.participant_id === oldId ? { ...ps, participant_id: newId, updated_at: new Date().toISOString() } : ps
      );
      await AsyncStorage.setItem(PARTICIPANT_SESSIONS_KEY, JSON.stringify(updated));
    }
    
    // Also migrate the deleted items tracking
    const deletedData = await AsyncStorage.getItem(DELETED_ITEMS_KEY);
    if (deletedData) {
      const deleted = JSON.parse(deletedData);
      if (deleted.participants?.includes(oldId)) {
        deleted.participants = deleted.participants.filter((id: string) => id !== oldId);
        deleted.participants.push(newId);
        await AsyncStorage.setItem(DELETED_ITEMS_KEY, JSON.stringify(deleted));
      }
    }
  }

  getSessions = async (clubId: string): Promise<Session[]> => {
    const local = await AsyncStorage.getItem(SESSIONS_KEY);
    const sessions = local ? JSON.parse(local).filter((s: Session) => s.club_id === clubId) : [];
    return sessions;
  }

  saveSession = async (session: Session): Promise<Session> => {
    const allSessions = await AsyncStorage.getItem(SESSIONS_KEY);
    let sessions = allSessions ? JSON.parse(allSessions) : [];
    
    // Add updated_at timestamp
    session.updated_at = new Date().toISOString();
    
    // Always compute content-based hash ID
    const contentKey = `session|${session.club_id}|${session.day_of_week}|${session.start_time}|${session.end_time}`;
    const contentHashId = generateContentBasedId(contentKey);
    
    // Find existing by current ID
    const existingByIdIndex = sessions.findIndex((s: Session) => s.id === session.id);
    // Find existing by content hash (might be different record with same content)
    const existingByHashIndex = sessions.findIndex((s: Session) => s.id === contentHashId);
    
    // Check if current ID matches the content hash
    const needsMigration = session.id && session.id !== contentHashId;
    
    if (needsMigration && existingByIdIndex >= 0) {
      // Old ID exists - need to migrate to content hash ID
      const oldId = session.id;
      session.id = contentHashId;
      
      if (existingByHashIndex >= 0 && existingByHashIndex !== existingByIdIndex) {
        // Content hash already exists as a different record - merge!
        // Keep the one with hash ID, remove the old one
        sessions[existingByHashIndex] = session;
        sessions.splice(existingByIdIndex, 1);
        
        // Update references from old ID to new hash ID
        await this.migrateSessionReferences(oldId, contentHashId);
      } else {
        // Just update the ID in place
        sessions[existingByIdIndex] = session;
        
        // Update references from old ID to new hash ID
        await this.migrateSessionReferences(oldId, contentHashId);
      }
    } else if (existingByIdIndex >= 0) {
      // ID already matches hash (or is the hash), just update
      sessions[existingByIdIndex] = session;
    } else if (existingByHashIndex >= 0) {
      // No ID match but hash exists - update existing
      session.id = contentHashId;
      sessions[existingByHashIndex] = session;
    } else {
      // Brand new session
      session.id = contentHashId;
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
    
    // Mark session as deleted for sync (don't try to delete from server immediately)
    await this.markAsDeleted('sessions', id);
    
    // Delete related attendance records
    const allAttendance = await AsyncStorage.getItem(ATTENDANCE_KEY);
    if (allAttendance) {
      const attendanceRecords = JSON.parse(allAttendance);
      const attendanceToDelete = attendanceRecords.filter(a => a.session_id === id);
      // Mark attendance as deleted
      for (const att of attendanceToDelete) {
        await this.markAsDeleted('attendance', att.id);
      }
      const filtered = attendanceRecords.filter(a => a.session_id !== id);
      await AsyncStorage.setItem(ATTENDANCE_KEY, JSON.stringify(filtered));
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
    
    // Add updated_at timestamp
    participant.updated_at = new Date().toISOString();
    
    // Always compute content-based hash ID
    const contentKey = `participant|${participant.club_id}|${(participant.first_name || '').toLowerCase()}|${(participant.last_name || '').toLowerCase()}`;
    const contentHashId = generateContentBasedId(contentKey);
    
    // Find existing by current ID
    const existingByIdIndex = participants.findIndex((p: Participant) => p.id === participant.id);
    // Find existing by content hash (might be different record with same content)
    const existingByHashIndex = participants.findIndex((p: Participant) => p.id === contentHashId);
    
    // Check if current ID matches the content hash
    const needsMigration = participant.id && participant.id !== contentHashId;
    
    if (needsMigration && existingByIdIndex >= 0) {
      // Old ID exists - need to migrate to content hash ID
      const oldId = participant.id;
      participant.id = contentHashId;
      
      if (existingByHashIndex >= 0 && existingByHashIndex !== existingByIdIndex) {
        // Content hash already exists as a different record - merge!
        // Keep the one with hash ID, remove the old one
        participants[existingByHashIndex] = participant;
        participants.splice(existingByIdIndex, 1);
        
        // Update references from old ID to new hash ID
        await this.migrateParticipantReferences(oldId, contentHashId);
      } else {
        // Just update the ID in place
        participants[existingByIdIndex] = participant;
        
        // Update references from old ID to new hash ID
        await this.migrateParticipantReferences(oldId, contentHashId);
      }
    } else if (existingByIdIndex >= 0) {
      // ID already matches hash (or is the hash), just update
      participants[existingByIdIndex] = participant;
    } else if (existingByHashIndex >= 0) {
      // No ID match but hash exists - update existing
      participant.id = contentHashId;
      participants[existingByHashIndex] = participant;
    } else {
      // Brand new participant
      participant.id = contentHashId;
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
    
    // Mark participant as deleted for sync (don't try to delete from server immediately)
    await this.markAsDeleted('participants', id);
    
    // Delete related attendance records
    const allAttendance = await AsyncStorage.getItem(ATTENDANCE_KEY);
    if (allAttendance) {
      const attendanceRecords = JSON.parse(allAttendance);
      const attendanceToDelete = attendanceRecords.filter(a => a.participant_id === id);
      // Mark attendance as deleted
      for (const att of attendanceToDelete) {
        await this.markAsDeleted('attendance', att.id);
      }
      const filtered = attendanceRecords.filter(a => a.participant_id !== id);
      await AsyncStorage.setItem(ATTENDANCE_KEY, JSON.stringify(filtered));
    }
  }

  getAttendance = async (sessionId: string, date: string): Promise<AttendanceRecord[]> => {
    const local = await AsyncStorage.getItem(ATTENDANCE_KEY);
    const attendance = local ? JSON.parse(local).filter((a: AttendanceRecord) => a.session_id === sessionId && a.date === date) : [];
    return attendance;
  }

  getAllAttendance = async (): Promise<AttendanceRecord[]> => {
    const local = await AsyncStorage.getItem(ATTENDANCE_KEY);
    const allAttendance = local ? JSON.parse(local) : [];
    return allAttendance;
  }

  saveAttendance = async (records: AttendanceRecord[]): Promise<void> => {
    if (records.length === 0) {
      return;
    }
    
    const firstRecord = records[0];
    
    const allAttendance = await AsyncStorage.getItem(ATTENDANCE_KEY);
    let attendance = allAttendance ? JSON.parse(allAttendance) : [];
    
    // Remove existing records for this session and date
    const sessionId = firstRecord.session_id;
    const date = firstRecord.date;
    attendance = attendance.filter((a: AttendanceRecord) => !(a.session_id === sessionId && a.date === date));
    
    // Add new records with timestamps (no ID - database will generate UUID on insert)
    const recordsWithTimestamps = records.map(record => ({
      ...record,
      updated_at: new Date().toISOString(),
      // Remove any existing ID so database generates a new UUID
      id: undefined
    }));
    
    attendance.push(...recordsWithTimestamps);
    
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
    // console.log('[DataService] getParticipantSessions called for:', participantId);
    const local = await AsyncStorage.getItem(PARTICIPANT_SESSIONS_KEY);
    const allPS = local ? JSON.parse(local) : [];
    const participantSessions = allPS.filter(ps => ps.participant_id === participantId);
    
    // console.log('[DataService] Found', participantSessions.length, 'sessions for participant', participantId);
    // console.log('[DataService] Session IDs:', participantSessions.map(ps => ps.session_id));
    
    // Return local data immediately - SyncService handles cloud sync
    return participantSessions.map(ps => ps.session_id);
  }

  saveParticipantSessions = async (participantId: string, sessionIds: string[]): Promise<void> => {
    // Remove all existing relationships for this participant
    const local = await AsyncStorage.getItem(PARTICIPANT_SESSIONS_KEY);
    let allPS = local ? JSON.parse(local) : [];
    
    allPS = allPS.filter((ps: ParticipantSession) => ps.participant_id !== participantId);
    
    // Add new relationships with timestamp for conflict resolution
    const now = new Date().toISOString();
    sessionIds.forEach(sessionId => {
      const newPS = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        participant_id: participantId,
        session_id: sessionId,
        created_at: now,
        updated_at: now
      };
      allPS.push(newPS);
    });
    
    // Save locally first
    await AsyncStorage.setItem(PARTICIPANT_SESSIONS_KEY, JSON.stringify(allPS));
    
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