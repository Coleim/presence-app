# Guide d'Implémentation - Sync Multi-Device

## 🎯 Architecture de synchronisation

```
┌─────────────────┐         ┌──────────────┐         ┌─────────────────┐
│   Device A      │         │   Supabase   │         │   Device B      │
│                 │         │              │         │                 │
│ AsyncStorage ───┼────────>│  PostgreSQL  │<────────┼─── AsyncStorage │
│  (offline)      │  Sync   │   (source    │  Sync   │   (offline)     │
│                 │<────────│   of truth)  │────────>│                 │
└─────────────────┘         └──────────────┘         └─────────────────┘
```

## 📝 Modifications à faire dans le code

### 1. Mettre à jour les types TypeScript

```typescript
// lib/types.ts
export interface Club {
  id: string; // UUID
  name: string;
  description?: string;
  academic_year_start?: string; // Date ISO
  academic_year_end?: string; // Date ISO
  share_code: string; // Code de partage (ex: "ABC123")
  share_password?: string; // Optionnel
  stats_reset_date?: string;
  owner_id: string; // UUID du créateur
  created_at: string; // Timestamp ISO
  updated_at: string; // Timestamp ISO
  deleted_at?: string | null; // Soft delete
  deleted_by?: string | null;
  version: number; // Pour gestion conflits
  last_modified_by?: string;
}

export interface ClubMember {
  id: string;
  club_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'teacher' | 'viewer';
  can_edit_club: boolean;
  can_add_members: boolean;
  can_manage_sessions: boolean;
  can_manage_participants: boolean;
  can_mark_attendance: boolean;
  can_view_stats: boolean;
  joined_at: string;
  invited_by?: string;
  deleted_at?: string | null;
}

export interface Session {
  id: string;
  club_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  version: number;
  last_modified_by?: string;
}

export interface Participant {
  id: string;
  club_id: string;
  first_name: string;
  last_name: string;
  grade?: string;
  level?: string;
  notes?: string;
  is_long_term_sick: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  version: number;
  last_modified_by?: string;
}

export interface Attendance {
  id: string;
  session_id: string;
  participant_id: string;
  date: string; // Date ISO
  status: 'present' | 'absent';
  created_at: string;
  updated_at: string;
  marked_by?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  version: number;
  last_modified_by?: string;
}

export interface SyncChange {
  table_name: string;
  record_id: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'RESTORE';
  data: any;
  timestamp: string;
}
```

### 2. Créer le service de synchronisation

```typescript
// lib/syncService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { Club, Session, Participant, Attendance, SyncChange } from './types';

const LAST_SYNC_KEY = 'last_sync_timestamp';
const SYNC_INTERVAL = 30000; // 30 secondes

class SyncService {
  private syncInterval: NodeJS.Timeout | null = null;
  private isSyncing = false;

  /**
   * Démarrer la synchronisation automatique
   */
  startAutoSync(clubId: string) {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    // Sync immédiat
    this.syncClub(clubId);

    // Puis toutes les 30 secondes
    this.syncInterval = setInterval(() => {
      this.syncClub(clubId);
    }, SYNC_INTERVAL);
  }

  /**
   * Arrêter la synchronisation automatique
   */
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Synchroniser un club
   */
  async syncClub(clubId: string): Promise<void> {
    if (this.isSyncing || !supabase) return;

    try {
      this.isSyncing = true;
      console.log('[Sync] Starting sync for club:', clubId);

      // 1. Récupérer le timestamp de dernière sync
      const lastSync = await AsyncStorage.getItem(`${LAST_SYNC_KEY}_${clubId}`);
      const since = lastSync || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24h par défaut

      // 2. Récupérer les changements depuis Supabase
      const { data: changes, error } = await supabase.rpc('get_club_changes_since', {
        p_club_id: clubId,
        p_since: since
      });

      if (error) {
        console.error('[Sync] Error fetching changes:', error);
        return;
      }

      if (!changes || changes.length === 0) {
        console.log('[Sync] No changes to sync');
        await AsyncStorage.setItem(`${LAST_SYNC_KEY}_${clubId}`, new Date().toISOString());
        return;
      }

      console.log('[Sync] Found', changes.length, 'changes');

      // 3. Appliquer les changements localement
      for (const change of changes as SyncChange[]) {
        await this.applyChange(change);
      }

      // 4. Mettre à jour le timestamp
      await AsyncStorage.setItem(`${LAST_SYNC_KEY}_${clubId}`, new Date().toISOString());

      console.log('[Sync] Sync completed successfully');

    } catch (error) {
      console.error('[Sync] Error during sync:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Appliquer un changement localement
   */
  private async applyChange(change: SyncChange): Promise<void> {
    const { table_name, record_id, operation, data } = change;

    try {
      // Récupérer les données locales
      const localData = await AsyncStorage.getItem(table_name);
      let items = localData ? JSON.parse(localData) : [];

      const index = items.findIndex((item: any) => item.id === record_id);

      switch (operation) {
        case 'INSERT':
        case 'RESTORE':
          if (index === -1) {
            items.push(data);
          } else {
            items[index] = data; // Mise à jour si existe déjà
          }
          break;

        case 'UPDATE':
          if (index !== -1) {
            items[index] = { ...items[index], ...data };
          } else {
            items.push(data); // Ajouter si n'existe pas
          }
          break;

        case 'DELETE':
          if (index !== -1) {
            items[index] = { ...items[index], deleted_at: data.deleted_at };
          }
          break;
      }

      // Sauver localement
      await AsyncStorage.setItem(table_name, JSON.stringify(items));

      console.log(`[Sync] Applied ${operation} on ${table_name}:${record_id}`);

    } catch (error) {
      console.error('[Sync] Error applying change:', error);
    }
  }

  /**
   * Upload une modification locale vers Supabase
   */
  async uploadChange<T>(
    table: string,
    data: Partial<T>,
    userId: string
  ): Promise<{ data: T | null; error: any }> {
    if (!supabase) {
      return { data: null, error: new Error('Offline mode') };
    }

    try {
      // Ajouter les champs de tracking
      const enrichedData = {
        ...data,
        last_modified_by: userId,
        version: (data as any).version ? (data as any).version + 1 : 1
      };

      const { data: result, error } = await supabase
        .from(table)
        .upsert(enrichedData)
        .select()
        .single();

      if (error) {
        console.error(`[Sync] Error uploading to ${table}:`, error);
        return { data: null, error };
      }

      console.log(`[Sync] Uploaded change to ${table}`);
      return { data: result as T, error: null };

    } catch (error) {
      console.error('[Sync] Upload error:', error);
      return { data: null, error };
    }
  }

  /**
   * Soft delete
   */
  async softDelete(
    table: string,
    id: string,
    userId: string
  ): Promise<{ error: any }> {
    if (!supabase) {
      return { error: new Error('Offline mode') };
    }

    try {
      // Utiliser les fonctions SQL pour soft delete
      let functionName = '';
      switch (table) {
        case 'clubs':
          functionName = 'soft_delete_club';
          break;
        case 'sessions':
          functionName = 'soft_delete_session';
          break;
        case 'participants':
          functionName = 'soft_delete_participant';
          break;
        default:
          // Fallback: mise à jour manuelle
          const { error } = await supabase
            .from(table)
            .update({
              deleted_at: new Date().toISOString(),
              deleted_by: userId
            })
            .eq('id', id);
          return { error };
      }

      const { error } = await supabase.rpc(functionName, {
        [`${table.slice(0, -1)}_uuid`]: id
      });

      return { error };

    } catch (error) {
      console.error('[Sync] Soft delete error:', error);
      return { error };
    }
  }

  /**
   * Rejoindre un club avec code
   */
  async joinClubWithCode(
    shareCode: string,
    password?: string
  ): Promise<{ clubId: string | null; error: any }> {
    if (!supabase) {
      return { clubId: null, error: new Error('Offline mode') };
    }

    try {
      const { data, error } = await supabase.rpc('join_club_with_code', {
        p_share_code: shareCode.toUpperCase(),
        p_password: password || null
      });

      if (error) {
        console.error('[Sync] Error joining club:', error);
        return { clubId: null, error };
      }

      console.log('[Sync] Joined club:', data);
      return { clubId: data, error: null };

    } catch (error) {
      console.error('[Sync] Join club error:', error);
      return { clubId: null, error };
    }
  }

  /**
   * Obtenir les membres d'un club
   */
  async getClubMembers(clubId: string) {
    if (!supabase) return { data: [], error: null };

    const { data, error } = await supabase
      .from('club_members')
      .select(`
        *,
        user:auth.users(email)
      `)
      .eq('club_id', clubId)
      .is('deleted_at', null);

    return { data, error };
  }
}

export const syncService = new SyncService();
```

### 3. Mettre à jour dataService.ts

Modifier les fonctions existantes pour utiliser le syncService :

```typescript
// lib/dataService.ts (modifications)
import { syncService } from './syncService';

// Exemple pour createClub
createClub = async (club: Omit<Club, 'id' | 'created_at'>): Promise<Club> => {
  const userId = await this.getUserId();
  
  if (supabase) {
    // Mode online : créer dans Supabase
    const { data, error } = await supabase
      .from('clubs')
      .insert({
        ...club,
        owner_id: userId
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    // Ajouter automatiquement le créateur comme membre
    await supabase.from('club_members').insert({
      club_id: data.id,
      user_id: userId,
      role: 'owner',
      can_edit_club: true,
      can_add_members: true,
      can_manage_sessions: true,
      can_manage_participants: true,
      can_mark_attendance: true,
      can_view_stats: true
    });

    // Sauver localement
    const clubs = await this.getClubs();
    clubs.push(data);
    await AsyncStorage.setItem(CLUBS_KEY, JSON.stringify(clubs));

    return data;
  } else {
    // Mode offline : créer localement
    const newClub = {
      ...club,
      id: generateUUID(),
      owner_id: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1
    };

    const clubs = await this.getClubs();
    clubs.push(newClub);
    await AsyncStorage.setItem(CLUBS_KEY, JSON.stringify(clubs));

    return newClub;
  }
};

// Exemple pour markAttendance
markAttendance = async (
  sessionId: string,
  participantId: string,
  date: string,
  status: 'present' | 'absent'
): Promise<void> => {
  const userId = await this.getUserId();

  if (supabase) {
    // Upload vers Supabase
    const { error } = await syncService.uploadChange('attendance', {
      session_id: sessionId,
      participant_id: participantId,
      date,
      status,
      marked_by: userId
    }, userId);

    if (error) {
      console.error('Error marking attendance:', error);
      throw error;
    }
  }

  // Sauver localement
  const attendance = await AsyncStorage.getItem(ATTENDANCE_KEY);
  const records = attendance ? JSON.parse(attendance) : [];
  
  const existing = records.findIndex(
    (r: Attendance) => 
      r.session_id === sessionId &&
      r.participant_id === participantId &&
      r.date === date
  );

  const record: Attendance = {
    id: existing >= 0 ? records[existing].id : generateUUID(),
    session_id: sessionId,
    participant_id: participantId,
    date,
    status,
    marked_by: userId,
    created_at: existing >= 0 ? records[existing].created_at : new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: existing >= 0 ? records[existing].version + 1 : 1
  };

  if (existing >= 0) {
    records[existing] = record;
  } else {
    records.push(record);
  }

  await AsyncStorage.setItem(ATTENDANCE_KEY, JSON.stringify(records));
};
```

### 4. Utiliser dans les composants

```typescript
// screens/HomeScreen.tsx (exemple)
import { syncService } from '../lib/syncService';

useEffect(() => {
  if (selectedClub) {
    // Démarrer la sync auto pour ce club
    syncService.startAutoSync(selectedClub.id);

    return () => {
      // Arrêter quand on quitte
      syncService.stopAutoSync();
    };
  }
}, [selectedClub]);
```

```typescript
// screens/JoinClubScreen.tsx (nouveau)
const handleJoinClub = async () => {
  const { clubId, error } = await syncService.joinClubWithCode(
    shareCode,
    password
  );

  if (error) {
    Alert.alert('Erreur', error.message);
    return;
  }

  Alert.alert('Succès', 'Vous avez rejoint le club !');
  navigation.navigate('ClubDetails', { clubId });
};
```

## 🧪 Tests à faire

1. **Test synchronisation basique**
   - Device A : Créer un club
   - Device B : Rejoindre le club
   - Device A : Créer une session
   - Device B : Vérifier que la session apparaît (attendre 30s max)

2. **Test présences**
   - Device A : Marquer une présence
   - Device B : Vérifier que la présence apparaît

3. **Test soft delete**
   - Device A : Supprimer un élève
   - Device B : Vérifier qu'il disparaît

4. **Test offline**
   - Couper le réseau sur Device A
   - Créer une session offline
   - Reconnecter
   - Vérifier que la session est uploadée

## 📊 Monitoring

Ajouter des logs pour suivre la sync :

```typescript
// lib/logger.ts
export const logSync = (message: string, data?: any) => {
  console.log(`[SYNC ${new Date().toISOString()}]`, message, data || '');
  
  // Optionnel : envoyer à un service de monitoring
  // analytics.track('sync_event', { message, data });
};
```

## 🚀 Prochaines étapes

1. Implémenter les écrans :
   - `JoinClubScreen` : Pour rejoindre avec un code
   - `ClubMembersScreen` : Voir les membres et leurs permissions
   - `ShareClubScreen` : Partager le code du club

2. Ajouter un indicateur de sync :
   - Badge "En cours de synchronisation..."
   - Timestamp de dernière sync
   - Nombre de changements en attente

3. Gestion des conflits :
   - Interface pour résoudre les conflits
   - Option "Garder ma version" / "Garder la version du serveur"

4. Optimisations :
   - Compression des données
   - Sync différentielle (uniquement les champs modifiés)
   - Queue de sync pour l'offline
