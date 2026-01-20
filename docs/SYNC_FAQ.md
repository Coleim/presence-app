# Réponses aux Questions - Sync Multi-Device

## ❓ Questions posées

### 1. Me donner les tables à créer (ou index, ou autre. Tout le setup Supabase à faire)

✅ **Réponse** : Voir [`sql/schema-v2-multi-device.sql`](../sql/schema-v2-multi-device.sql)

**Tables créées** :
- `user_profiles` - Profils utilisateurs
- `clubs` - Les clubs/groupes
- `club_members` - Membres avec permissions granulaires
- `sessions` - Créneaux réguliers  
- `participants` - Élèves
- `participant_sessions` - Sessions préférées
- `attendance` - Présences/absences
- `sync_log` - Historique complet des modifications

**Fonctionnalités** :
- ✅ Génération automatique de codes de partage (ex: "ABC123")
- ✅ Soft delete (pas de suppression définitive)
- ✅ Historique complet via triggers
- ✅ Timestamps automatiques (created_at, updated_at)
- ✅ Numéros de version pour gestion de conflits
- ✅ Row Level Security (RLS) pour sécurité
- ✅ Index pour performance

**Fonctions SQL** :
- `join_club_with_code()` - Rejoindre un club avec code
- `get_club_changes_since()` - Sync incrémentale
- `soft_delete_*()` - Suppression douce
- `restore_*()` - Restauration

---

### 2. Partager le planning/présences entre plusieurs professeurs

✅ **Réponse** : Système de partage par code

**Comment ça marche** :

1. **Prof A crée un club**
   ```
   Club créé !
   Code de partage : ABC123
   (Optionnel) Mot de passe : mon-pass
   ```

2. **Prof A partage le code avec Prof B**
   - Par SMS, email, ou autre

3. **Prof B rejoint le club**
   ```sql
   SELECT join_club_with_code('ABC123', 'mon-pass');
   ```

4. **Tous les deux voient les mêmes données**
   - Sessions
   - Élèves  
   - Présences/absences
   - Statistiques

**Permissions** :
- Par défaut, tous les profs peuvent tout faire
- Le propriétaire peut restreindre les permissions si besoin
- Rôles : owner, admin, teacher, viewer

---

### 3. Quand un prof note des présences/absences, tous les autres doivent aussi le voir (pas real time, quelques minutes ok)

✅ **Réponse** : Synchronisation toutes les 30 secondes

**Architecture** :

```
Device A                 Supabase                Device B
   │                        │                       │
   │── Marque présent ─────>│                       │
   │                        │                       │
   │                        │<──── Sync (30s) ──────│
   │                        │                       │
   │                        │──── Nouvelle donnée ─>│
```

**Mécanisme** :

1. **Device A** marque une présence
   ```typescript
   await dataService.markAttendance(sessionId, participantId, date, 'present');
   // → Upload immédiat vers Supabase
   ```

2. **Supabase** enregistre la modification
   - Dans la table `attendance`
   - Dans `sync_log` via trigger automatique

3. **Device B** synchronise (toutes les 30s)
   ```typescript
   const changes = await get_club_changes_since(clubId, lastSync);
   // → Récupère uniquement les nouveautés
   // → Applique localement
   ```

**Délai** : Maximum 30 secondes (configurable)

---

### 4. Quand on crée une session, elle doit être dispo partout. Idem pour un élève.

✅ **Réponse** : Même principe que les présences

**Toutes les données sont synchronisées** :
- Sessions (créneaux réguliers)
- Participants (élèves)
- Présences/absences
- Modifications du club

**Flux** :

```typescript
// Device A : Créer une session
const session = await dataService.createSession({
  club_id: clubId,
  day_of_week: 'Lundi',
  start_time: '14:00',
  end_time: '16:00'
});
// → Upload immédiat vers Supabase

// Device B : Après 30s max
// → Reçoit la nouvelle session
// → L'affiche dans l'interface
```

**Données synchronisées** :
- ✅ Création
- ✅ Modification
- ✅ Suppression (soft delete)
- ✅ Restauration

---

### 5. Comment faire pour pas qu'une "erreur" (genre suppression d'une session), impacte tous les devices?

✅ **Réponse** : Soft Delete + Historique complet

**Protection multi-niveaux** :

#### Niveau 1 : Soft Delete
```sql
-- ❌ Suppression définitive (JAMAIS FAIT)
DELETE FROM sessions WHERE id = '123';

-- ✅ Soft delete (ce qui est fait)
UPDATE sessions 
SET deleted_at = NOW(), 
    deleted_by = 'user-456'
WHERE id = '123';
```

**Avantages** :
- Les données restent dans la base
- Possibilité de restaurer
- Historique conservé

#### Niveau 2 : Historique complet

Chaque modification est enregistrée dans `sync_log` :

```sql
-- Trigger automatique qui enregistre
INSERT INTO sync_log (
  table_name,
  record_id,
  operation,
  old_data,     -- État avant
  new_data,     -- État après
  user_id,      -- Qui a fait ça
  timestamp     -- Quand
) VALUES (
  'sessions',
  '123',
  'DELETE',
  {...},
  {...},
  'user-456',
  NOW()
);
```

**Permet de** :
- Voir qui a supprimé quoi et quand
- Récupérer l'état précédent
- Auditer toutes les actions

#### Niveau 3 : Interface de restauration

```typescript
// Voir les sessions supprimées
const deleted = await supabase
  .from('sessions')
  .select('*')
  .not('deleted_at', 'is', null)
  .eq('club_id', clubId);

// Restaurer une session
await supabase.rpc('restore_session', { session_uuid: '123' });
```

#### Niveau 4 : Permissions

```sql
-- Seuls les profs autorisés peuvent supprimer
CREATE POLICY "Only teachers can delete" ON sessions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM club_members
      WHERE club_id = sessions.club_id
      AND user_id = auth.uid()
      AND can_manage_sessions = true
    )
  );
```

**Scénario concret** :

1. **Prof A supprime une session par erreur**
   - La session est marquée `deleted_at = NOW()`
   - Elle disparaît de l'interface
   - Après 30s, elle disparaît aussi sur Device B

2. **Prof A ou B se rend compte de l'erreur**
   - Va dans "Sessions supprimées" (à implémenter)
   - Clique sur "Restaurer"
   - La session réapparaît partout

3. **Alternative : Support demande l'historique**
   ```sql
   -- Voir toutes les actions sur cette session
   SELECT * FROM sync_log 
   WHERE table_name = 'sessions' 
   AND record_id = '123'
   ORDER BY timestamp DESC;
   ```

---

## 📊 Récapitulatif technique

| Problème | Solution | Fichier |
|----------|----------|---------|
| Tables à créer | Schéma SQL complet avec RLS | [`schema-v2-multi-device.sql`](../sql/schema-v2-multi-device.sql) |
| Partage entre profs | Codes de partage + permissions | Table `club_members` |
| Sync des présences | Sync toutes les 30s | [`syncService.ts`](../docs/SYNC_IMPLEMENTATION_GUIDE.md) |
| Sync sessions/élèves | Même mécanisme | Toutes les tables |
| Protection erreurs | Soft delete + historique | `deleted_at` + `sync_log` |

---

## 📚 Documentation

1. **Setup Supabase** : [`SUPABASE_MULTI_DEVICE_SETUP.md`](./SUPABASE_MULTI_DEVICE_SETUP.md)
   - Comment créer le projet
   - Exécuter le schéma SQL
   - Configurer l'authentification

2. **Implémentation code** : [`SYNC_IMPLEMENTATION_GUIDE.md`](./SYNC_IMPLEMENTATION_GUIDE.md)
   - Services TypeScript à créer
   - Modifications du code existant
   - Exemples de code

3. **Schéma SQL** : [`../sql/schema-v2-multi-device.sql`](../sql/schema-v2-multi-device.sql)
   - Toutes les tables
   - Triggers et fonctions
   - RLS policies

---

## ✅ Checklist de mise en œuvre

### Phase 1 : Supabase
- [ ] Créer projet Supabase
- [ ] Exécuter le schéma SQL
- [ ] Vérifier que toutes les tables sont créées
- [ ] Tester `join_club_with_code()` manuellement
- [ ] Tester `get_club_changes_since()` manuellement

### Phase 2 : Code
- [ ] Créer `lib/types.ts` avec les nouveaux types
- [ ] Créer `lib/syncService.ts`
- [ ] Modifier `lib/dataService.ts`
- [ ] Créer `screens/JoinClubScreen.tsx`
- [ ] Créer `screens/ShareClubScreen.tsx`
- [ ] Ajouter sync auto dans `HomeScreen.tsx`

### Phase 3 : Tests
- [ ] Test : Créer un club sur Device A
- [ ] Test : Rejoindre le club sur Device B
- [ ] Test : Créer une session sur A, visible sur B
- [ ] Test : Marquer présence sur B, visible sur A
- [ ] Test : Supprimer puis restaurer
- [ ] Test : Mode offline puis reconnexion

### Phase 4 : Polish
- [ ] Indicateur de sync en cours
- [ ] Affichage "Dernière sync il y a X secondes"
- [ ] Interface pour sessions supprimées
- [ ] Gestion des conflits
- [ ] Messages d'erreur clairs

---

## 🚀 Prochaines étapes

1. **Maintenant** : Exécuter le schéma SQL dans Supabase
2. **Ensuite** : Implémenter `syncService.ts`
3. **Puis** : Modifier les écrans existants
4. **Enfin** : Tester la synchronisation

**Temps estimé** : 1-2 jours de dev
