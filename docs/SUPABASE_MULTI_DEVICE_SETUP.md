# Guide de Configuration Supabase - Multi-Device Sync

## 🎯 Objectifs

Ce schéma permet de :
- ✅ Partager un club entre plusieurs professeurs
- ✅ Synchroniser automatiquement les données (présences, sessions, élèves)
- ✅ Éviter les pertes de données (soft delete)
- ✅ Historiser toutes les modifications
- ✅ Gérer les conflits entre devices
- ✅ Permissions granulaires par utilisateur

## 📋 Étapes de configuration

### 1️⃣ Créer le projet Supabase

1. Allez sur [supabase.com](https://supabase.com)
2. Créez un nouveau projet
3. Notez votre **URL** et **anon key**

### 2️⃣ Exécuter le schéma SQL

1. Ouvrez le **SQL Editor** dans Supabase
2. Copiez tout le contenu de [`sql/schema-v2-multi-device.sql`](../sql/schema-v2-multi-device.sql)
3. Exécutez le script
4. Vérifiez qu'il n'y a pas d'erreurs

### 3️⃣ Vérifier les tables créées

Dans **Table Editor**, vous devriez voir :
- `user_profiles` - Profils utilisateurs
- `clubs` - Clubs/groupes
- `club_members` - Membres des clubs (qui peut accéder)
- `sessions` - Créneaux réguliers
- `participants` - Élèves
- `participant_sessions` - Sessions préférées des élèves
- `attendance` - Présences/absences
- `sync_log` - Historique des modifications

### 4️⃣ Configurer l'authentification

1. Dans **Authentication** > **Providers**
2. Activez **Google** (déjà fait si vous avez suivi le guide OAuth)
3. Les utilisateurs pourront se connecter et leurs données seront isolées

### 5️⃣ Tester les permissions (RLS)

Les **Row Level Security (RLS)** policies garantissent que :
- Un utilisateur ne voit que SES clubs
- Un utilisateur ne peut modifier que ce qu'il a le droit
- Les suppressions ne sont que des soft-deletes

## 🔄 Fonctionnement de la synchronisation

### Architecture

```
Device 1 (Prof A)          Supabase          Device 2 (Prof B)
     │                         │                     │
     │────── Crée élève ──────>│                     │
     │    (INSERT)             │                     │
     │                         │<──── Sync ──────────│
     │                         │   (toutes les 30s)  │
     │                         │                     │
     │                         │────── Nouvel élève ─>│
```

### Timestamps et versions

Chaque enregistrement a :
- `created_at` : Date de création
- `updated_at` : Date de dernière modification
- `version` : Numéro de version (incrémenté à chaque modif)
- `last_modified_by` : Qui a fait la dernière modification

### Soft Delete

Au lieu de supprimer définitivement :
```sql
-- ❌ NE PAS FAIRE
DELETE FROM participants WHERE id = '123';

-- ✅ FAIRE
SELECT soft_delete_participant('123');
```

Cela ajoute :
- `deleted_at` : Timestamp de suppression
- `deleted_by` : Qui a supprimé

Avantages :
- Possibilité de restaurer (`restore_*` functions)
- Historique complet
- Pas d'impact immédiat sur les autres devices

### Historique (sync_log)

Chaque modification est enregistrée automatiquement via des **triggers** :
```sql
INSERT INTO sync_log (table_name, record_id, operation, new_data, user_id)
VALUES ('participants', '123...', 'INSERT', {...}, 'user-456...');
```

Permet de :
- Voir qui a fait quoi et quand
- Synchroniser uniquement les changements récents
- Résoudre les conflits

## 🔑 Partage de club

### Créer et partager un club

1. **Créateur** : Crée un club
   - Un `share_code` unique est généré automatiquement (ex: "ABC123")
   - Optionnel : Définir un `share_password`

2. **Partager** : Donner le code à un collègue
   ```
   Code : ABC123
   Mot de passe : mon-password (si défini)
   ```

3. **Rejoindre** : Le collègue utilise le code
   ```sql
   SELECT join_club_with_code('ABC123', 'mon-password');
   ```

### Rôles et permissions

Quand quelqu'un rejoint un club, il obtient le rôle `teacher` par défaut avec ces permissions :

| Permission | Description | Par défaut |
|-----------|-------------|------------|
| `can_edit_club` | Modifier infos du club | ❌ Non |
| `can_add_members` | Inviter d'autres membres | ❌ Non |
| `can_manage_sessions` | Créer/modifier/supprimer sessions | ✅ Oui |
| `can_manage_participants` | Créer/modifier/supprimer élèves | ✅ Oui |
| `can_mark_attendance` | Marquer présences | ✅ Oui |
| `can_view_stats` | Voir statistiques | ✅ Oui |

Le **owner** (créateur) a tous les droits et peut modifier les permissions des autres.

## 🔄 Synchronisation incrémentale

Au lieu de tout télécharger à chaque fois, on peut récupérer uniquement les changements :

```sql
-- Récupérer les changements depuis les 30 dernières minutes
SELECT * FROM get_club_changes_since(
  'club-uuid',
  NOW() - INTERVAL '30 minutes'
);
```

Retourne :
- Tous les INSERT/UPDATE/DELETE
- Sur toutes les tables liées au club
- Depuis le timestamp donné

## 📱 Implémentation dans l'app React Native

### Stratégie de sync recommandée

1. **Au démarrage de l'app**
   ```typescript
   // Charger les données locales
   const localClubs = await AsyncStorage.getItem('clubs');
   
   // Sync avec Supabase
   const { data } = await supabase
     .from('clubs')
     .select('*')
     .is('deleted_at', null);
   
   // Fusionner et sauver localement
   await AsyncStorage.setItem('clubs', JSON.stringify(data));
   ```

2. **Sync périodique (toutes les 30-60 secondes)**
   ```typescript
   const lastSync = await AsyncStorage.getItem('last_sync_timestamp');
   
   // Récupérer uniquement les changements
   const { data: changes } = await supabase.rpc('get_club_changes_since', {
     p_club_id: clubId,
     p_since: lastSync
   });
   
   // Appliquer les changements localement
   for (const change of changes) {
     await applyChange(change);
   }
   
   // Sauver le nouveau timestamp
   await AsyncStorage.setItem('last_sync_timestamp', new Date().toISOString());
   ```

3. **Upload des modifications locales**
   ```typescript
   // Quand on marque une présence
   const { error } = await supabase
     .from('attendance')
     .upsert({
       session_id: sessionId,
       participant_id: participantId,
       date: date,
       status: 'present',
       marked_by: userId,
       version: currentVersion + 1
     });
   ```

### Gestion des conflits

Si deux profs modifient la même donnée en même temps :

```typescript
// Version optimiste avec retry
async function updateWithRetry(table, id, updates, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    // Récupérer la version actuelle
    const { data: current } = await supabase
      .from(table)
      .select('version')
      .eq('id', id)
      .single();
    
    // Mettre à jour avec la nouvelle version
    const { data, error } = await supabase
      .from(table)
      .update({
        ...updates,
        version: current.version + 1,
        last_modified_by: userId
      })
      .eq('id', id)
      .eq('version', current.version); // Condition : version n'a pas changé
    
    if (!error) {
      return data; // Succès
    }
    
    if (i < maxRetries - 1) {
      // Attendre avant de réessayer
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  throw new Error('Conflict: data was modified by another user');
}
```

## 🛡️ Sécurité

### Row Level Security (RLS)

Les policies empêchent :
- ❌ Voir les clubs des autres
- ❌ Modifier les données sans permission
- ❌ Supprimer définitivement des données

### Soft Delete

- Aucune donnée n'est réellement supprimée
- Possibilité de tout restaurer
- Protection contre les erreurs

### Audit trail

- Toutes les actions sont tracées dans `sync_log`
- On sait toujours qui a fait quoi et quand

## 📊 Requêtes utiles

### Voir l'historique des modifications d'un élève

```sql
SELECT 
  operation,
  old_data->>'first_name' as old_name,
  new_data->>'first_name' as new_name,
  timestamp,
  u.email as modified_by
FROM sync_log sl
JOIN auth.users u ON u.id = sl.user_id
WHERE table_name = 'participants'
AND record_id = 'participant-uuid'
ORDER BY timestamp DESC;
```

### Voir qui a marqué les présences aujourd'hui

```sql
SELECT 
  p.first_name,
  p.last_name,
  a.status,
  u.email as marked_by,
  a.created_at
FROM attendance a
JOIN participants p ON p.id = a.participant_id
JOIN auth.users u ON u.id = a.marked_by
WHERE a.date = CURRENT_DATE
ORDER BY a.created_at DESC;
```

### Restaurer un élève supprimé par erreur

```sql
SELECT restore_participant('participant-uuid');
```

## 🚀 Migration depuis l'ancien schéma

Si vous avez déjà des données avec l'ancien schéma :

1. **Backup** vos données actuelles
2. Créer une fonction de migration (à adapter selon vos données)
3. Exécuter le nouveau schéma sur une nouvelle base
4. Migrer les données

## ✅ Checklist de déploiement

- [ ] Projet Supabase créé
- [ ] Schema SQL exécuté sans erreurs
- [ ] Toutes les tables visibles dans Table Editor
- [ ] RLS activé sur toutes les tables
- [ ] Google Auth configuré
- [ ] Variables d'environnement mises à jour dans l'app
- [ ] Test : Créer un club
- [ ] Test : Générer un code de partage
- [ ] Test : Rejoindre le club depuis un autre compte
- [ ] Test : Créer une session visible par les deux comptes
- [ ] Test : Marquer une présence visible par les deux comptes
- [ ] Test : Soft delete et restore

## 📞 Support

En cas de problème :
1. Vérifier les logs Supabase (Dashboard > Logs)
2. Vérifier les policies RLS
3. Vérifier que l'utilisateur est bien authentifié
4. Consulter la documentation Supabase

---

**Next steps** : Implémenter le service de synchronisation dans React Native
