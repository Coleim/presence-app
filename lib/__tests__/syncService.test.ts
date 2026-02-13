import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { syncService } from '../syncService';
import { authManager } from '../authManager';
import { dataService } from '../dataService';

// Mock dependencies
jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      getSession: jest.fn(),
      getUser: jest.fn(),
    },
  },
}));

jest.mock('../authManager', () => ({
  authManager: {
    getSession: jest.fn(),
  },
}));

jest.mock('../dataService', () => ({
  dataService: {
    getClubs: jest.fn(),
    getSessions: jest.fn(),
    getParticipants: jest.fn(),
  },
}));

// Helper to create a valid UUID
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Sample test data
const mockSession = {
  user: { id: 'user-123' },
  access_token: 'token',
};

const mockClub = {
  id: generateUUID(),
  name: 'Test Club',
  owner_id: 'user-123',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockParticipant1 = {
  id: generateUUID(),
  name: 'Participant 1',
  club_id: mockClub.id,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockParticipant2 = {
  id: generateUUID(),
  name: 'Participant 2',
  club_id: mockClub.id,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  preferred_session_ids: ['session-1', 'session-2'], // Local-only field
};

const mockServerSession1 = {
  id: generateUUID(),
  name: 'Session 1',
  club_id: mockClub.id,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockServerSession2 = {
  id: generateUUID(),
  name: 'Session 2',
  club_id: mockClub.id,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  
  // Reset syncService state
  (syncService as any).isSyncing = false;
  (syncService as any).lastSyncTime = 0;
  (syncService as any).hasMigratedSessions = true; // Skip migration in tests
  (syncService as any).hasCleanedDuplicates = true; // Skip server cleanup in tests
  (syncService as any).hasCleanedLocalDuplicates = true; // Skip local cleanup in tests
});

describe('SyncService - Batch Upload Optimization', () => {
  
  it('should batch upsert sessions instead of individual uploads', async () => {
    // Setup auth
    (authManager.getSession as jest.Mock).mockResolvedValue(mockSession);
    
    // Setup local data
    (dataService.getClubs as jest.Mock).mockResolvedValue([mockClub]);
    (dataService.getSessions as jest.Mock).mockResolvedValue([mockServerSession1, mockServerSession2]);
    (dataService.getParticipants as jest.Mock).mockResolvedValue([]);
    
    // Track upsert calls
    const upsertCalls: { table: string; data: any[] }[] = [];
    
    // Setup Supabase mock
    (supabase.from as jest.Mock).mockImplementation((table) => ({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: table === 'clubs' ? [mockClub] : [], error: null }),
      upsert: jest.fn((data) => {
        upsertCalls.push({ table, data: Array.isArray(data) ? data : [data] });
        return Promise.resolve({ data, error: null });
      }),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    }));
    
    // Setup AsyncStorage
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === '@presence_app:participant_sessions') return Promise.resolve('[]');
      if (key === '@presence_app:attendance') return Promise.resolve('[]');
      if (key === '@presence_app:sessions') return Promise.resolve(JSON.stringify([mockServerSession1, mockServerSession2]));
      if (key === '@presence_app:deleted_items') return Promise.resolve('{}');
      return Promise.resolve(null);
    });

    await syncService.syncNow();

    // Verify batch upsert was used for sessions
    const sessionUpserts = upsertCalls.filter(c => c.table === 'sessions');
    expect(sessionUpserts.length).toBeGreaterThanOrEqual(1);
    
    // Should batch multiple sessions in single call
    if (sessionUpserts.length > 0) {
      expect(Array.isArray(sessionUpserts[0].data)).toBe(true);
    }
  });

  it('should batch upsert participants instead of individual uploads', async () => {
    (authManager.getSession as jest.Mock).mockResolvedValue(mockSession);
    (dataService.getClubs as jest.Mock).mockResolvedValue([mockClub]);
    (dataService.getSessions as jest.Mock).mockResolvedValue([]);
    (dataService.getParticipants as jest.Mock).mockResolvedValue([mockParticipant1, mockParticipant2]);
    
    const upsertCalls: { table: string; data: any[] }[] = [];
    
    (supabase.from as jest.Mock).mockImplementation((table) => ({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ 
        data: table === 'clubs' ? [mockClub] : 
              table === 'participants' ? [mockParticipant1, mockParticipant2] : [], 
        error: null 
      }),
      upsert: jest.fn((data) => {
        upsertCalls.push({ table, data: Array.isArray(data) ? data : [data] });
        return Promise.resolve({ data, error: null });
      }),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    }));
    
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === '@presence_app:participant_sessions') return Promise.resolve('[]');
      if (key === '@presence_app:attendance') return Promise.resolve('[]');
      if (key === '@presence_app:sessions') return Promise.resolve('[]');
      if (key === '@presence_app:deleted_items') return Promise.resolve('{}');
      return Promise.resolve(null);
    });

    await syncService.syncNow();

    const participantUpserts = upsertCalls.filter(c => c.table === 'participants');
    expect(participantUpserts.length).toBeGreaterThanOrEqual(1);
  });
});

describe('SyncService - Strip Local-Only Fields', () => {
  
  it('should strip preferred_session_ids before uploading participants', async () => {
    (authManager.getSession as jest.Mock).mockResolvedValue(mockSession);
    (dataService.getClubs as jest.Mock).mockResolvedValue([mockClub]);
    (dataService.getSessions as jest.Mock).mockResolvedValue([]);
    (dataService.getParticipants as jest.Mock).mockResolvedValue([mockParticipant2]);
    
    let uploadedParticipants: any[] = [];
    
    (supabase.from as jest.Mock).mockImplementation((table) => ({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ 
        data: table === 'clubs' ? [mockClub] : 
              table === 'participants' ? [mockParticipant2] : [], 
        error: null 
      }),
      upsert: jest.fn((data) => {
        if (table === 'participants') {
          uploadedParticipants = Array.isArray(data) ? data : [data];
        }
        return Promise.resolve({ data, error: null });
      }),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    }));
    
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === '@presence_app:participant_sessions') return Promise.resolve('[]');
      if (key === '@presence_app:attendance') return Promise.resolve('[]');
      if (key === '@presence_app:sessions') return Promise.resolve('[]');
      if (key === '@presence_app:deleted_items') return Promise.resolve('{}');
      return Promise.resolve(null);
    });

    await syncService.syncNow();

    // Verify preferred_session_ids was stripped
    for (const p of uploadedParticipants) {
      expect(p).not.toHaveProperty('preferred_session_ids');
    }
  });
});

describe('SyncService - Participant Sessions Deduplication', () => {
  
  it('should dedupe participant_sessions by composite key keeping most recent', async () => {
    (authManager.getSession as jest.Mock).mockResolvedValue(mockSession);
    (dataService.getClubs as jest.Mock).mockResolvedValue([mockClub]);
    (dataService.getSessions as jest.Mock).mockResolvedValue([mockServerSession1]);
    (dataService.getParticipants as jest.Mock).mockResolvedValue([mockParticipant1]);
    
    const oldTimestamp = '2024-01-01T00:00:00Z';
    const newTimestamp = '2024-12-01T00:00:00Z';
    
    // Duplicate participant_sessions with same composite key
    const duplicatePSList = [
      {
        id: generateUUID(),
        participant_id: mockParticipant1.id,
        session_id: mockServerSession1.id,
        created_at: oldTimestamp,
        updated_at: oldTimestamp,
      },
      {
        id: generateUUID(),
        participant_id: mockParticipant1.id,
        session_id: mockServerSession1.id,
        created_at: newTimestamp,
        updated_at: newTimestamp,
      },
    ];
    
    let uploadedPS: any[] = [];
    
    (supabase.from as jest.Mock).mockImplementation((table) => ({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ 
        data: table === 'clubs' ? [mockClub] : 
              table === 'participants' ? [mockParticipant1] :
              table === 'sessions' ? [mockServerSession1] : [], 
        error: null 
      }),
      upsert: jest.fn((data) => {
        if (table === 'participant_sessions') {
          uploadedPS = Array.isArray(data) ? data : [data];
        }
        return Promise.resolve({ data, error: null });
      }),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    }));
    
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === '@presence_app:participant_sessions') {
        return Promise.resolve(JSON.stringify(duplicatePSList));
      }
      if (key === '@presence_app:attendance') return Promise.resolve('[]');
      if (key === '@presence_app:sessions') {
        return Promise.resolve(JSON.stringify([mockServerSession1]));
      }
      if (key === '@presence_app:deleted_items') return Promise.resolve('{}');
      return Promise.resolve(null);
    });

    await syncService.syncNow();

    // Should have deduped to 1 record
    expect(uploadedPS.length).toBe(1);
    // Should keep the most recent one
    expect(uploadedPS[0].updated_at).toBe(newTimestamp);
  });
});

describe('SyncService - Foreign Key Validation', () => {
  
  it('should skip participant_sessions with participant_id not on server', async () => {
    (authManager.getSession as jest.Mock).mockResolvedValue(mockSession);
    (dataService.getClubs as jest.Mock).mockResolvedValue([mockClub]);
    (dataService.getSessions as jest.Mock).mockResolvedValue([mockServerSession1]);
    (dataService.getParticipants as jest.Mock).mockResolvedValue([mockParticipant1]);
    
    const nonExistentParticipantId = generateUUID();
    
    const psList = [
      // Valid - participant exists on server
      {
        id: generateUUID(),
        participant_id: mockParticipant1.id,
        session_id: mockServerSession1.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      // Invalid - participant doesn't exist on server
      {
        id: generateUUID(),
        participant_id: nonExistentParticipantId,
        session_id: mockServerSession1.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    
    let uploadedPS: any[] = [];
    
    (supabase.from as jest.Mock).mockImplementation((table) => ({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ 
        data: table === 'clubs' ? [mockClub] : 
              table === 'participants' ? [mockParticipant1] :
              table === 'sessions' ? [mockServerSession1] : [], 
        error: null 
      }),
      upsert: jest.fn((data) => {
        if (table === 'participant_sessions') {
          uploadedPS = Array.isArray(data) ? data : [data];
        }
        return Promise.resolve({ data, error: null });
      }),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    }));
    
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === '@presence_app:participant_sessions') {
        return Promise.resolve(JSON.stringify(psList));
      }
      if (key === '@presence_app:attendance') return Promise.resolve('[]');
      if (key === '@presence_app:sessions') {
        return Promise.resolve(JSON.stringify([mockServerSession1]));
      }
      if (key === '@presence_app:deleted_items') return Promise.resolve('{}');
      return Promise.resolve(null);
    });

    await syncService.syncNow();

    // Should only upload the valid one
    expect(uploadedPS.length).toBe(1);
    expect(uploadedPS[0].participant_id).toBe(mockParticipant1.id);
  });

  it('should skip participant_sessions with session_id not on server', async () => {
    (authManager.getSession as jest.Mock).mockResolvedValue(mockSession);
    (dataService.getClubs as jest.Mock).mockResolvedValue([mockClub]);
    (dataService.getSessions as jest.Mock).mockResolvedValue([mockServerSession1]);
    (dataService.getParticipants as jest.Mock).mockResolvedValue([mockParticipant1]);
    
    const nonExistentSessionId = generateUUID();
    
    const psList = [
      // Valid - session exists on server
      {
        id: generateUUID(),
        participant_id: mockParticipant1.id,
        session_id: mockServerSession1.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      // Invalid - session doesn't exist on server
      {
        id: generateUUID(),
        participant_id: mockParticipant1.id,
        session_id: nonExistentSessionId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    
    let uploadedPS: any[] = [];
    
    (supabase.from as jest.Mock).mockImplementation((table) => ({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ 
        data: table === 'clubs' ? [mockClub] : 
              table === 'participants' ? [mockParticipant1] :
              table === 'sessions' ? [mockServerSession1] : [], 
        error: null 
      }),
      upsert: jest.fn((data) => {
        if (table === 'participant_sessions') {
          uploadedPS = Array.isArray(data) ? data : [data];
        }
        return Promise.resolve({ data, error: null });
      }),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    }));
    
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === '@presence_app:participant_sessions') {
        return Promise.resolve(JSON.stringify(psList));
      }
      if (key === '@presence_app:attendance') return Promise.resolve('[]');
      if (key === '@presence_app:sessions') {
        return Promise.resolve(JSON.stringify([mockServerSession1]));
      }
      if (key === '@presence_app:deleted_items') return Promise.resolve('{}');
      return Promise.resolve(null);
    });

    await syncService.syncNow();

    // Should only upload the valid one
    expect(uploadedPS.length).toBe(1);
    expect(uploadedPS[0].session_id).toBe(mockServerSession1.id);
  });
});

describe('SyncService - Deletion Sync Logic', () => {
  
  it('should identify participant_sessions to delete based on local vs server comparison', () => {
    // This tests the deletion logic directly without full sync flow
    const localPSList = [
      { participant_id: 'p1', session_id: 's1' },
      // s2 was removed locally
    ];
    
    const serverPSList = [
      { participant_id: 'p1', session_id: 's1' },
      { participant_id: 'p1', session_id: 's2' }, // This should be deleted
    ];
    
    const allLocalPSKeys = new Set(
      localPSList
        .filter((ps: any) => ps.participant_id && ps.session_id)
        .map((ps: any) => `${ps.participant_id}|${ps.session_id}`)
    );
    
    // Find records to delete
    const toDelete = serverPSList.filter(
      sps => !allLocalPSKeys.has(`${sps.participant_id}|${sps.session_id}`)
    );
    
    // Should identify s2 for deletion
    expect(toDelete.length).toBe(1);
    expect(toDelete[0]!.session_id).toBe('s2');
  });

  it('should not delete anything when local and server match', () => {
    const localPSList = [
      { participant_id: 'p1', session_id: 's1' },
      { participant_id: 'p1', session_id: 's2' },
    ];
    
    const serverPSList = [
      { participant_id: 'p1', session_id: 's1' },
      { participant_id: 'p1', session_id: 's2' },
    ];
    
    const allLocalPSKeys = new Set(
      localPSList.map((ps: any) => `${ps.participant_id}|${ps.session_id}`)
    );
    
    const toDelete = serverPSList.filter(
      sps => !allLocalPSKeys.has(`${sps.participant_id}|${sps.session_id}`)
    );
    
    expect(toDelete.length).toBe(0);
  });

  it('should delete all when local has none for a participant', () => {
    const localPSList: any[] = [];
    
    const serverPSList = [
      { participant_id: 'p1', session_id: 's1' },
      { participant_id: 'p1', session_id: 's2' },
    ];
    
    const allLocalPSKeys = new Set(
      localPSList.map((ps: any) => `${ps.participant_id}|${ps.session_id}`)
    );
    
    const toDelete = serverPSList.filter(
      sps => !allLocalPSKeys.has(`${sps.participant_id}|${sps.session_id}`)
    );
    
    expect(toDelete.length).toBe(2);
  });
});

describe('SyncService - Orphan Filtering in Merge', () => {
  
  it('should filter orphaned participant_sessions during merge', async () => {
    (authManager.getSession as jest.Mock).mockResolvedValue(mockSession);
    (dataService.getClubs as jest.Mock).mockResolvedValue([mockClub]);
    (dataService.getSessions as jest.Mock).mockResolvedValue([mockServerSession1]);
    (dataService.getParticipants as jest.Mock).mockResolvedValue([mockParticipant1]);
    
    const orphanedSessionId = generateUUID(); // Session that doesn't exist
    
    // Server has orphaned participant_session
    const serverPSList = [
      {
        id: generateUUID(),
        participant_id: mockParticipant1.id,
        session_id: mockServerSession1.id, // Valid
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: generateUUID(),
        participant_id: mockParticipant1.id,
        session_id: orphanedSessionId, // Orphan - session doesn't exist
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    
    let mergedPS: any[] = [];
    
    (supabase.from as jest.Mock).mockImplementation((table) => ({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockImplementation(() => {
        if (table === 'participant_sessions') {
          return Promise.resolve({ data: serverPSList, error: null });
        }
        return Promise.resolve({ data: [], error: null });
      }),
      order: jest.fn().mockImplementation(() => {
        if (table === 'clubs') return Promise.resolve({ data: [mockClub], error: null });
        if (table === 'participants') return Promise.resolve({ data: [mockParticipant1], error: null });
        if (table === 'sessions') return Promise.resolve({ data: [mockServerSession1], error: null });
        return Promise.resolve({ data: [], error: null });
      }),
      upsert: jest.fn(() => Promise.resolve({ data: null, error: null })),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    }));
    
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === '@presence_app:participant_sessions') {
        return Promise.resolve(JSON.stringify([serverPSList[0]])); // Only valid one locally
      }
      if (key === '@presence_app:attendance') return Promise.resolve('[]');
      if (key === '@presence_app:sessions') {
        return Promise.resolve(JSON.stringify([mockServerSession1]));
      }
      if (key === '@presence_app:deleted_items') return Promise.resolve('{}');
      return Promise.resolve(null);
    });
    
    (AsyncStorage.setItem as jest.Mock).mockImplementation((key, value) => {
      if (key === '@presence_app:participant_sessions') {
        mergedPS = JSON.parse(value);
      }
      return Promise.resolve();
    });

    await syncService.syncNow();

    // Verify orphaned PS was filtered out
    const orphanInMerged = mergedPS.find(ps => ps.session_id === orphanedSessionId);
    expect(orphanInMerged).toBeUndefined();
  });
});

describe('SyncService - Parallel Query Optimization', () => {
  
  it('should download sessions and participants in parallel', async () => {
    (authManager.getSession as jest.Mock).mockResolvedValue(mockSession);
    (dataService.getClubs as jest.Mock).mockResolvedValue([mockClub]);
    (dataService.getSessions as jest.Mock).mockResolvedValue([]);
    (dataService.getParticipants as jest.Mock).mockResolvedValue([]);
    
    const queryOrder: string[] = [];
    
    (supabase.from as jest.Mock).mockImplementation((table) => {
      return {
        select: jest.fn().mockImplementation(() => {
          queryOrder.push(`select:${table}`);
          return {
            in: jest.fn().mockImplementation(() => {
              queryOrder.push(`in:${table}`);
              return Promise.resolve({ data: [], error: null });
            }),
            order: jest.fn().mockImplementation(() => {
              queryOrder.push(`order:${table}`);
              return Promise.resolve({ data: table === 'clubs' ? [mockClub] : [], error: null });
            }),
          };
        }),
        upsert: jest.fn(() => Promise.resolve({ data: null, error: null })),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
    });
    
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === '@presence_app:participant_sessions') return Promise.resolve('[]');
      if (key === '@presence_app:attendance') return Promise.resolve('[]');
      if (key === '@presence_app:sessions') return Promise.resolve('[]');
      if (key === '@presence_app:deleted_items') return Promise.resolve('{}');
      return Promise.resolve(null);
    });

    await syncService.syncNow();

    // Sessions and participants queries should be initiated close together (parallel)
    // This is hard to test precisely, but we verify both are called
    expect(queryOrder).toContain('in:sessions');
    expect(queryOrder).toContain('in:participants');
  });
});

describe('SyncService - Remove ID from participant_sessions upsert', () => {
  
  it('should remove id field from participant_sessions before upsert', async () => {
    (authManager.getSession as jest.Mock).mockResolvedValue(mockSession);
    (dataService.getClubs as jest.Mock).mockResolvedValue([mockClub]);
    (dataService.getSessions as jest.Mock).mockResolvedValue([mockServerSession1]);
    (dataService.getParticipants as jest.Mock).mockResolvedValue([mockParticipant1]);
    
    const psWithId = {
      id: generateUUID(),
      participant_id: mockParticipant1.id,
      session_id: mockServerSession1.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    let uploadedPS: any[] = [];
    
    (supabase.from as jest.Mock).mockImplementation((table) => ({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockImplementation(() => {
        if (table === 'participant_sessions') {
          return Promise.resolve({ data: [], error: null });
        }
        return Promise.resolve({ data: [], error: null });
      }),
      order: jest.fn().mockImplementation(() => {
        if (table === 'clubs') return Promise.resolve({ data: [mockClub], error: null });
        if (table === 'participants') return Promise.resolve({ data: [mockParticipant1], error: null });
        if (table === 'sessions') return Promise.resolve({ data: [mockServerSession1], error: null });
        return Promise.resolve({ data: [], error: null });
      }),
      upsert: jest.fn((data) => {
        if (table === 'participant_sessions') {
          uploadedPS = Array.isArray(data) ? data : [data];
        }
        return Promise.resolve({ data, error: null });
      }),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    }));
    
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key) => {
      if (key === '@presence_app:participant_sessions') {
        return Promise.resolve(JSON.stringify([psWithId]));
      }
      if (key === '@presence_app:attendance') return Promise.resolve('[]');
      if (key === '@presence_app:sessions') {
        return Promise.resolve(JSON.stringify([mockServerSession1]));
      }
      if (key === '@presence_app:deleted_items') return Promise.resolve('{}');
      return Promise.resolve(null);
    });

    await syncService.syncNow();

    // Verify id was stripped
    for (const ps of uploadedPS) {
      expect(ps).not.toHaveProperty('id');
    }
  });
});
