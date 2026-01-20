# 🚀 Quick Start - Sync Multi-Device

## En 3 étapes

### 1️⃣ Exécuter le SQL dans Supabase (5 min)

```bash
# 1. Aller sur supabase.com
# 2. Ouvrir votre projet
# 3. Aller dans SQL Editor
# 4. Copier tout le contenu de sql/schema-v2-multi-device.sql
# 5. Coller et exécuter
# 6. Vérifier : aucune erreur ✅
```

### 2️⃣ Tester depuis Supabase (2 min)

Dans SQL Editor, tester les fonctions :

```sql
-- Test 1 : Créer un club
INSERT INTO clubs (name, owner_id)
VALUES ('Mon Club Test', auth.uid())
RETURNING *;

-- Note le share_code généré (ex: "ABC123")

-- Test 2 : Rejoindre le club (depuis un autre compte)
SELECT join_club_with_code('ABC123');

-- Test 3 : Voir les membres
SELECT * FROM club_members WHERE club_id = 'votre-club-id';

-- ✅ Si ça marche, c'est bon !
```

### 3️⃣ Implémenter dans l'app (30 min)

```bash
# Copier les fichiers exemples
docs/SYNC_IMPLEMENTATION_GUIDE.md

# Créer syncService.ts
# Modifier dataService.ts
# Ajouter la sync auto dans HomeScreen
```

## 📱 Flow utilisateur final

### Scénario : 2 professeurs partagent un club

```
┌─────────────────────────────────────────────────────────┐
│ Prof A (Device 1)          │  Prof B (Device 2)         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ 1. Crée "Club Judo"        │                            │
│    Code : JUD123           │                            │
│                            │                            │
│ 2. Partage JUD123          │                            │
│    (par SMS/email)         │                            │
│                            │                            │
│                            │ 3. Entre le code JUD123    │
│                            │    Rejoint le club ✅      │
│                            │                            │
│ 4. Crée session            │                            │
│    "Lundi 14h-16h"         │                            │
│                            │                            │
│                            │ 5. [30s plus tard]         │
│                            │    Voit la session ✅      │
│                            │                            │
│                            │ 6. Ajoute élève            │
│                            │    "Sophie Martin"         │
│                            │                            │
│ 7. [30s plus tard]         │                            │
│    Voit l'élève ✅         │                            │
│                            │                            │
│ 8. Marque présence         │                            │
│    Sophie : Présente       │                            │
│                            │                            │
│                            │ 9. [30s plus tard]         │
│                            │    Voit la présence ✅     │
│                            │                            │
└─────────────────────────────────────────────────────────┘
```

## 🎯 Résultat attendu

✅ Les 2 professeurs voient exactement les mêmes données
✅ Changements visibles en ~30 secondes maximum
✅ Pas de perte de données (soft delete)
✅ Historique complet de qui a fait quoi
✅ Mode offline fonctionnel

## 🐛 Dépannage rapide

### Les changements n'apparaissent pas ?

```typescript
// Vérifier que la sync est active
console.log('Sync active ?', syncService.syncInterval !== null);

// Forcer une sync manuelle
await syncService.syncClub(clubId);
```

### Erreur "Club not found" ?

```sql
-- Vérifier que le code existe
SELECT * FROM clubs WHERE share_code = 'ABC123';

-- Vérifier que le club n'est pas supprimé
SELECT * FROM clubs WHERE share_code = 'ABC123' AND deleted_at IS NULL;
```

### RLS bloque l'accès ?

```sql
-- Vérifier que l'utilisateur est membre
SELECT * FROM club_members 
WHERE user_id = auth.uid() 
AND club_id = 'club-uuid';

-- Vérifier les permissions
SELECT role, can_manage_sessions, can_mark_attendance 
FROM club_members 
WHERE user_id = auth.uid() AND club_id = 'club-uuid';
```

## 📚 Pour aller plus loin

- [Documentation complète](./SUPABASE_MULTI_DEVICE_SETUP.md)
- [Guide d'implémentation](./SYNC_IMPLEMENTATION_GUIDE.md)
- [FAQ](./SYNC_FAQ.md)
