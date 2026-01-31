/**
 * End-to-End Test Suite for Presence App
 * 
 * These tests verify complete user flows, especially focusing on club ownership scenarios
 * to ensure that changes don't break existing features when the user is the owner.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { dataService, Club, Session, Participant } from '../../lib/dataService';
import { supabase } from '../../lib/supabase';

// Mock setup
jest.mock('@react-native-async-storage/async-storage');
jest.mock('../../lib/supabase');

describe('E2E: Complete User Flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  describe('E2E: Club Owner Creates and Manages Club', () => {
    it('should complete full club lifecycle as owner', async () => {
      const ownerId = 'owner-user-id';

      // Mock user authentication
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: { session: { user: { id: ownerId } } },
        error: null,
      });

      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: ownerId } },
        error: null,
      });

      // Step 1: User creates a new club
      const newClub: Club = {
        id: '',
        name: 'My Soccer Club',
        description: 'A club for soccer enthusiasts',
        owner_id: ownerId,
      };

      const savedClub = await dataService.saveClub(newClub);

      expect(savedClub.id).toMatch(/^local-/);
      expect(savedClub.owner_id).toBe(ownerId);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@presence_app:clubs',
        expect.any(String)
      );

      // Step 2: Owner adds sessions to the club
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
        if (key === '@presence_app:clubs') {
          return Promise.resolve(JSON.stringify([savedClub]));
        }
        if (key === '@presence_app:sessions') {
          return Promise.resolve(JSON.stringify([]));
        }
        return Promise.resolve(null);
      });

      const session1: Session = {
        id: '',
        club_id: savedClub.id,
        day_of_week: 'Monday',
        start_time: '18:00',
        end_time: '19:30',
      };

      const session2: Session = {
        id: '',
        club_id: savedClub.id,
        day_of_week: 'Wednesday',
        start_time: '18:00',
        end_time: '19:30',
      };

      const savedSession1 = await dataService.saveSession(session1);
      const savedSession2 = await dataService.saveSession(session2);

      expect(savedSession1.id).toBeDefined();
      expect(savedSession2.id).toBeDefined();

      // Update mock to include sessions
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
        if (key === '@presence_app:clubs') {
          return Promise.resolve(JSON.stringify([savedClub]));
        }
        if (key === '@presence_app:sessions') {
          return Promise.resolve(JSON.stringify([savedSession1, savedSession2]));
        }
        if (key === '@presence_app:participants') {
          return Promise.resolve(JSON.stringify([]));
        }
        return Promise.resolve(null);
      });

      // Step 3: Owner adds participants
      const participant1: Participant = {
        id: '',
        club_id: savedClub.id,
        first_name: 'John',
        last_name: 'Doe',
        preferred_session_ids: [savedSession1.id],
      };

      const participant2: Participant = {
        id: '',
        club_id: savedClub.id,
        first_name: 'Jane',
        last_name: 'Smith',
        preferred_session_ids: [savedSession2.id],
      };

      const savedParticipant1 = await dataService.saveParticipant(participant1);
      const savedParticipant2 = await dataService.saveParticipant(participant2);

      expect(savedParticipant1.id).toBeDefined();
      expect(savedParticipant2.id).toBeDefined();

      // Step 4: Verify owner can retrieve all data
      const clubs = await dataService.getClubs();
      expect(clubs).toHaveLength(1);
      expect(clubs[0]?.name).toBe('My Soccer Club');

      const sessions = await dataService.getSessions(savedClub.id);
      expect(sessions).toHaveLength(2);

      // Update mock to include participants
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
        if (key === '@presence_app:clubs') {
          return Promise.resolve(JSON.stringify([savedClub]));
        }
        if (key === '@presence_app:sessions') {
          return Promise.resolve(JSON.stringify([savedSession1, savedSession2]));
        }
        if (key === '@presence_app:participants') {
          return Promise.resolve(JSON.stringify([savedParticipant1, savedParticipant2]));
        }
        if (key === '@presence_app:participant_sessions') {
          return Promise.resolve(JSON.stringify([]));
        }
        return Promise.resolve(null);
      });

      const participants = await dataService.getParticipantsWithSessions(savedClub.id);
      expect(participants).toHaveLength(2);

      // Step 5: Owner deletes the club (with cascade)
      dataService.isOnline = true;

      const mockDelete = jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: null, error: null })),
        in: jest.fn(() => Promise.resolve({ data: null, error: null })),
      }));

      (supabase.from as jest.Mock).mockReturnValue({
        delete: mockDelete,
      });

      await dataService.deleteClub(savedClub.id);

      // Verify cloud deletion was attempted (owner privilege)
      expect(supabase.from).toHaveBeenCalledWith('clubs');
      expect(mockDelete).toHaveBeenCalled();

      // Verify local deletion
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('@presence_app:clubs', '[]');
    });
  });

  describe('E2E: Non-Owner Joins and Views Club', () => {
    it('should allow non-owner to join club but not delete it', async () => {
      const ownerId = 'owner-user-id';
      const memberId = 'member-user-id';

      // Mock club owned by someone else
      const existingClub: Club = {
        id: 'club-123',
        name: 'Existing Club',
        description: 'A club owned by someone else',
        owner_id: ownerId,
        share_code: 'ABC123',
      };

      // Step 1: Member joins club using share code
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [{
          club_id: existingClub.id,
          club_name: existingClub.name,
          club_description: existingClub.description,
          owner_id: existingClub.owner_id,
          share_code: existingClub.share_code,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        }],
        error: null,
      });

      const mockInsert = jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ data: {}, error: null })),
        })),
      }));

      (supabase.from as jest.Mock).mockImplementation((table) => {
        if (table === 'club_members') {
          return { insert: mockInsert };
        }
        // For other tables (sessions, participants, attendance)
        return {
          select: () => ({
            eq: jest.fn(() => Promise.resolve({ data: [], error: null })),
          }),
        };
      });

      (supabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: { session: { user: { id: memberId } } },
        error: null,
      });

      const joinedClub = await dataService.joinClubByCode('ABC123');

      expect(joinedClub).toBeDefined();
      expect(joinedClub?.owner_id).toBe(ownerId);
      expect(supabase.from).toHaveBeenCalledWith('club_members');

      // Step 2: Member tries to delete club (should only delete locally)
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
        if (key === '@presence_app:clubs') {
          return Promise.resolve(JSON.stringify([existingClub]));
        }
        return Promise.resolve(null);
      });

      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: memberId } },
        error: null,
      });

      dataService.isOnline = true;

      const mockDelete = jest.fn();
      (supabase.from as jest.Mock).mockReturnValue({
        delete: mockDelete,
      });

      await dataService.deleteClub(existingClub.id);

      // Verify cloud deletion was NOT attempted (non-owner)
      expect(mockDelete).not.toHaveBeenCalled();

      // But local deletion should still work
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('@presence_app:clubs', '[]');
    });
  });

  describe('E2E: Offline Mode Full Permissions', () => {
    it('should grant full permissions in offline mode', async () => {
      // Simulate offline mode - no auth
      (supabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: { session: null },
        error: null,
      });

      dataService.isOnline = false;

      // Create club offline
      const offlineClub: Club = {
        id: '',
        name: 'Offline Club',
        description: 'Created offline',
      };

      const savedClub = await dataService.saveClub(offlineClub);
      expect(savedClub.id).toMatch(/^local-/);

      // Mock storage
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
        if (key === '@presence_app:clubs') {
          return Promise.resolve(JSON.stringify([savedClub]));
        }
        return Promise.resolve(null);
      });

      // Delete club offline - should work without server call
      await dataService.deleteClub(savedClub.id);

      // Verify no server calls were made
      expect(supabase.from).not.toHaveBeenCalled();

      // Verify local deletion happened
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('@presence_app:clubs', '[]');
    });
  });

  describe('E2E: Session and Attendance Management', () => {
    it('should manage sessions and attendance as club owner', async () => {
      const ownerId = 'owner-user-id';

      (supabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: { session: { user: { id: ownerId } } },
        error: null,
      });

      // Create club
      const club: Club = {
        id: '',
        name: 'Test Club',
        owner_id: ownerId,
      };

      const savedClub = await dataService.saveClub(club);

      // Mock storage with club
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
        if (key === '@presence_app:clubs') {
          return Promise.resolve(JSON.stringify([savedClub]));
        }
        if (key === '@presence_app:sessions') {
          return Promise.resolve(JSON.stringify([]));
        }
        if (key === '@presence_app:participants') {
          return Promise.resolve(JSON.stringify([]));
        }
        if (key === '@presence_app:attendance') {
          return Promise.resolve(JSON.stringify([]));
        }
        return Promise.resolve(null);
      });

      // Add session
      const session: Session = {
        id: '',
        club_id: savedClub.id,
        day_of_week: 'Friday',
        start_time: '19:00',
        end_time: '20:30',
      };

      const savedSession = await dataService.saveSession(session);

      // Add participant
      const participant: Participant = {
        id: '',
        club_id: savedClub.id,
        first_name: 'Test',
        last_name: 'User',
      };

      const savedParticipant = await dataService.saveParticipant(participant);

      // Update mocks
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
        if (key === '@presence_app:sessions') {
          return Promise.resolve(JSON.stringify([savedSession]));
        }
        if (key === '@presence_app:participants') {
          return Promise.resolve(JSON.stringify([savedParticipant]));
        }
        if (key === '@presence_app:attendance') {
          return Promise.resolve(JSON.stringify([]));
        }
        return Promise.resolve(null);
      });

      // Record attendance
      const attendanceRecords = [{
        id: '',
        session_id: savedSession.id,
        participant_id: savedParticipant.id,
        date: '2024-01-15',
        present: true,
      }];

      await dataService.saveAttendance(attendanceRecords);

      // Verify attendance was saved
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@presence_app:attendance',
        expect.any(String)
      );
    });
  });
});
