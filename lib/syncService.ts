import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { authManager } from './authManager';

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

      // Get user's clubs
      const { data: clubMemberships } = await supabase
        .from('club_members')
        .select('club_id')
        .eq('user_id', session.user.id)
        .is('deleted_at', null);

      if (!clubMemberships || clubMemberships.length === 0) {
        console.log('No clubs to sync');
        await this.updateLastSyncTime();
        return true;
      }

      // Sync each club
      for (const membership of clubMemberships) {
        await this.syncClub(membership.club_id, since);
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

  private syncClub = async (clubId: string, since: Date) => {
    try {
      console.log(`Syncing club ${clubId} since ${since.toISOString()}`);

      // Get changes from server using the SQL function
      const { data: changes, error } = await supabase.rpc('get_club_changes_since', {
        p_club_id: clubId,
        p_since: since.toISOString()
      });

      if (error) {
        console.error('Error getting club changes:', error);
        return;
      }

      if (!changes || changes.length === 0) {
        console.log(`No changes for club ${clubId}`);
        return;
      }

      console.log(`Processing ${changes.length} changes for club ${clubId}`);

      // Group changes by table
      const changesByTable: Record<string, any[]> = {};
      changes.forEach((change: any) => {
        if (!changesByTable[change.table_name]) {
          changesByTable[change.table_name] = [];
        }
        changesByTable[change.table_name]!.push(change);
      });

      // Apply changes to local storage
      if (changesByTable['clubs']) {
        await this.syncTable('clubs', changesByTable['clubs']);
      }
      if (changesByTable['sessions']) {
        await this.syncTable('sessions', changesByTable['sessions']);
      }
      if (changesByTable['participants']) {
        await this.syncTable('participants', changesByTable['participants']);
      }
      if (changesByTable['attendance']) {
        await this.syncTable('attendance', changesByTable['attendance']);
      }
      if (changesByTable['participant_sessions']) {
        await this.syncTable('participant_sessions', changesByTable['participant_sessions']);
      }

    } catch (error) {
      console.error(`Error syncing club ${clubId}:`, error);
    }
  };

  private syncTable = async (tableName: string, changes: any[]) => {
    const storageKey = this.getStorageKey(tableName);
    const local = await AsyncStorage.getItem(storageKey);
    let records = local ? JSON.parse(local) : [];

    console.log(`Syncing ${changes.length} changes to ${tableName}`);

    changes.forEach((change: any) => {
      const recordId = change.record_id;
      const existingIndex = records.findIndex((r: any) => r.id === recordId);

      if (change.operation === 'DELETE') {
        // Soft delete: set deleted_at field
        if (existingIndex >= 0) {
          records[existingIndex] = { ...records[existingIndex], ...change.data };
        }
      } else if (change.operation === 'UPDATE') {
        if (existingIndex >= 0) {
          // Update existing record
          records[existingIndex] = { ...records[existingIndex], ...change.data };
        } else {
          // Record doesn't exist locally, add it
          records.push(change.data);
        }
      } else if (change.operation === 'INSERT' || change.operation === 'RESTORE') {
        if (existingIndex >= 0) {
          // Update if exists (shouldn't happen for INSERT, but handle it)
          records[existingIndex] = { ...records[existingIndex], ...change.data };
        } else {
          // Add new record
          records.push(change.data);
        }
      }
    });

    await AsyncStorage.setItem(storageKey, JSON.stringify(records));
    console.log(`Synced ${tableName}: ${records.length} records in local storage`);
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
        // Use soft delete function
        const functionMap: Record<string, string> = {
          'clubs': 'soft_delete_club',
          'sessions': 'soft_delete_session',
          'participants': 'soft_delete_participant'
        };
        
        const functionName = functionMap[table];
        if (functionName) {
          const { data, error } = await supabase.rpc(functionName, {
            [`${table.slice(0, -1)}_uuid`]: record.id
          });
          
          if (error) throw error;
          return data;
        }
      } else if (operation === 'INSERT' || operation === 'UPDATE') {
        // Prepare record for upload (remove local-only fields)
        const cleanRecord = { ...record };
        delete cleanRecord.preferred_session_ids; // This is handled by participant_sessions table
        
        const { data, error } = await supabase
          .from(table)
          .upsert(cleanRecord)
          .select()
          .single();
        
        if (error) throw error;
        return data;
      }
    } catch (error) {
      console.error(`Error uploading to ${table}:`, error);
      throw error;
    }
  };

  // Join a club with share code
  joinClubWithCode = async (shareCode: string, password?: string): Promise<string> => {
    try {
      const { data, error } = await supabase.rpc('join_club_with_code', {
        p_share_code: shareCode.toUpperCase(),
        p_password: password || null
      });

      if (error) throw error;
      
      // Trigger immediate sync to download club data
      await this.syncNow();
      
      return data; // Returns club_id
    } catch (error) {
      console.error('Error joining club:', error);
      throw error;
    }
  };

  // Get club's share code
  getClubShareCode = async (clubId: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase
        .from('clubs')
        .select('share_code')
        .eq('id', clubId)
        .is('deleted_at', null)
        .single();

      if (error) throw error;
      return data?.share_code || null;
    } catch (error) {
      console.error('Error getting share code:', error);
      return null;
    }
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
