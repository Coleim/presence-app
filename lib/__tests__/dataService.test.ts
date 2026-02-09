import AsyncStorage from '@react-native-async-storage/async-storage';
import { dataService, Club, Session, Participant } from '../dataService';
import { supabase } from '../supabase';

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
});

describe('DataService - Club Ownership Tests', () => {
  const mockOwnerId = 'owner-user-id';
  const mockNonOwnerId = 'non-owner-user-id';
  
  const mockClub: Club = {
    id: 'club-123',
    name: 'Test Club',
    description: 'Test Description',
    owner_id: mockOwnerId,
    share_code: 'ABC123',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  describe('deleteClub - Owner Permissions', () => {
    it('should delete club from cloud when user is the owner', async () => {
      // Mock that user is authenticated as owner
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: mockOwnerId } },
        error: null,
      });

      // Mock club exists in local storage
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
        if (key === '@presence_app:clubs') {
          return Promise.resolve(JSON.stringify([mockClub]));
        }
        return Promise.resolve(null);
      });

      // Set service as online
      dataService.isOnline = true;

      // Mock supabase delete operations
      const mockDelete = jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: null, error: null })),
        in: jest.fn(() => Promise.resolve({ data: null, error: null })),
      }));
      
      (supabase.from as jest.Mock).mockReturnValue({
        delete: mockDelete,
      });

      await dataService.deleteClub('club-123');

      // Verify cloud deletion was attempted
      expect(supabase.from).toHaveBeenCalledWith('clubs');
      expect(mockDelete).toHaveBeenCalled();
    });

    it('should NOT delete club from cloud when user is NOT the owner', async () => {
      // Mock that user is authenticated but NOT the owner
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: mockNonOwnerId } },
        error: null,
      });

      // Mock club exists in local storage
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
        if (key === '@presence_app:clubs') {
          return Promise.resolve(JSON.stringify([mockClub]));
        }
        return Promise.resolve(null);
      });

      // Set service as online
      dataService.isOnline = true;

      const mockDelete = jest.fn();
      (supabase.from as jest.Mock).mockReturnValue({
        delete: mockDelete,
      });

      await dataService.deleteClub('club-123');

      // Verify cloud deletion was NOT attempted
      expect(mockDelete).not.toHaveBeenCalled();
      
      // But local deletion should still happen
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@presence_app:clubs',
        expect.any(String)
      );
    });

    it('should delete club locally even when offline', async () => {
      // Mock club exists in local storage
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
        if (key === '@presence_app:clubs') {
          return Promise.resolve(JSON.stringify([mockClub]));
        }
        return Promise.resolve(null);
      });

      // Set service as offline
      dataService.isOnline = false;

      await dataService.deleteClub('club-123');

      // Verify local deletion happened
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@presence_app:clubs',
        '[]'
      );

      // Verify cloud deletion was NOT attempted
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('should cascade delete sessions and participants when owner deletes club', async () => {
      const mockSessions: Session[] = [
        { id: 'session-1', club_id: 'club-123', day_of_week: 'Monday', start_time: '10:00', end_time: '11:00' },
      ];

      const mockParticipants: Participant[] = [
        { id: 'participant-1', club_id: 'club-123', first_name: 'John', last_name: 'Doe' },
      ];

      // Mock that user is the owner
      (supabase.auth.getUser as jest.Mock).mockResolvedValue({
        data: { user: { id: mockOwnerId } },
        error: null,
      });

      // Mock local storage with club, sessions, and participants
      (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
        if (key === '@presence_app:clubs') {
          return Promise.resolve(JSON.stringify([mockClub]));
        }
        if (key === '@presence_app:sessions') {
          return Promise.resolve(JSON.stringify(mockSessions));
        }
        if (key === '@presence_app:participants') {
          return Promise.resolve(JSON.stringify(mockParticipants));
        }
        return Promise.resolve(null);
      });

      dataService.isOnline = true;

      const mockDelete = jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ data: null, error: null })),
        in: jest.fn(() => Promise.resolve({ data: null, error: null })),
      }));

      (supabase.from as jest.Mock).mockReturnValue({
        delete: mockDelete,
      });

      await dataService.deleteClub('club-123');

      // Verify cascading deletes for sessions and participants
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('@presence_app:sessions', '[]');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('@presence_app:participants', '[]');
    });
  });

  describe('saveClub - CRUD Operations', () => {
    it('should create a new club with local ID', async () => {
      const newClub: Club = {
        id: '',
        name: 'New Club',
        description: 'New Description',
        owner_id: mockOwnerId,
      };

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([]));

      const savedClub = await dataService.saveClub(newClub);

      expect(savedClub.id).toMatch(/^local-/);
      expect(savedClub.created_at).toBeDefined();
      expect(savedClub.updated_at).toBeDefined();
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@presence_app:clubs',
        expect.stringContaining('New Club')
      );
    });

    it('should update an existing club', async () => {
      const existingClub = { ...mockClub };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify([existingClub])
      );

      const updatedClub = { ...mockClub, name: 'Updated Name' };
      const result = await dataService.saveClub(updatedClub);

      expect(result.name).toBe('Updated Name');
      expect(result.updated_at).toBeDefined();
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@presence_app:clubs',
        expect.stringContaining('Updated Name')
      );
    });
  });

  describe('getClubs', () => {
    it('should retrieve all clubs from local storage', async () => {
      const clubs = [mockClub, { ...mockClub, id: 'club-456', name: 'Club 2' }];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(clubs));

      const result = await dataService.getClubs();

      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe('Test Club');
      expect(result[1]?.name).toBe('Club 2');
    });

    it('should return empty array when no clubs exist', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const result = await dataService.getClubs();

      expect(result).toEqual([]);
    });
  });

  describe('getClub', () => {
    it('should retrieve a specific club by ID', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify([mockClub])
      );

      const result = await dataService.getClub('club-123');

      expect(result).toEqual(mockClub);
    });

    it('should return null for non-existent club', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
        JSON.stringify([mockClub])
      );

      const result = await dataService.getClub('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('joinClubByCode', () => {
    it('should join a club using a valid share code', async () => {
      const mockClubData = {
        club_id: 'club-123',
        club_name: 'Test Club',
        club_description: 'Test Description',
        owner_id: mockOwnerId,
        share_code: 'ABC123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [mockClubData],
        error: null,
      });

      (supabase.auth.getSession as jest.Mock).mockResolvedValue({
        data: { session: { user: { id: 'test-user' } } },
        error: null,
      });

      const mockSingle = jest.fn(() => Promise.resolve({ data: {}, error: null }));
      const mockSelect = jest.fn(() => ({ 
        single: mockSingle,
        eq: jest.fn(() => Promise.resolve({ data: [], error: null })),
      }));
      const mockInsert = jest.fn(() => ({ select: mockSelect }));
      const mockEq = jest.fn(() => Promise.resolve({ data: [], error: null }));

      (supabase.from as jest.Mock).mockImplementation((table) => {
        if (table === 'club_members') {
          return { insert: mockInsert };
        }
        // For other tables (sessions, participants, etc.)
        return {
          select: () => ({
            eq: mockEq,
          }),
        };
      });

      const result = await dataService.joinClubByCode('ABC123');

      expect(result).toBeDefined();
      expect(result?.id).toBe('club-123');
      expect(result?.name).toBe('Test Club');
      expect(supabase.rpc).toHaveBeenCalledWith('get_club_by_share_code', {
        p_share_code: 'ABC123',
      });
    });

    it('should return null for invalid share code', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
      });

      const result = await dataService.joinClubByCode('INVALID');

      expect(result).toBeNull();
    });
  });
});

describe('DataService - Session Management', () => {
  const mockSession: Session = {
    id: 'session-123',
    club_id: 'club-123',
    day_of_week: 'Monday',
    start_time: '10:00',
    end_time: '11:00',
  };

  beforeEach(() => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  });

  it('should get sessions for a specific club', async () => {
    const sessions = [
      mockSession,
      { ...mockSession, id: 'session-456', club_id: 'other-club' },
    ];
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(sessions));

    const result = await dataService.getSessions('club-123');

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('session-123');
  });

  it('should save a new session', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([]));

    const newSession = { ...mockSession, id: '' };
    const saved = await dataService.saveSession(newSession);

    // Now generates content-based UUID instead of local- prefix
    expect(saved.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@presence_app:sessions',
      expect.any(String)
    );
  });
});

describe('DataService - Participant Management', () => {
  const mockParticipant: Participant = {
    id: 'participant-123',
    club_id: 'club-123',
    first_name: 'John',
    last_name: 'Doe',
    is_long_term_sick: false,
  };

  it('should get participants for a club', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === '@presence_app:participants') {
        return Promise.resolve(JSON.stringify([mockParticipant]));
      }
      return Promise.resolve(null);
    });

    const result = await dataService.getParticipantsWithSessions('club-123');

    expect(result).toHaveLength(1);
    expect(result[0]?.first_name).toBe('John');
  });

  it('should save a new participant', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([]));

    const newParticipant = { ...mockParticipant, id: '' };
    const saved = await dataService.saveParticipant(newParticipant);

    // Now generates content-based UUID instead of local- prefix
    expect(saved.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(AsyncStorage.setItem).toHaveBeenCalled();
  });
});
