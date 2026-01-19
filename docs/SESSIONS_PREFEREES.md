# Système de Sessions Préférées

## Vue d'ensemble

Le système de sessions préférées permet d'assigner des participants à des sessions spécifiques (leurs sessions "régulières"). Cela permet un calcul plus précis des statistiques de présence.

## Fonctionnement

### Assignation des sessions

Lors de l'ajout d'un participant, vous pouvez sélectionner les sessions auxquelles il vient habituellement :
- **Facultatif** : Un participant peut ne pas avoir de sessions assignées
- **Multiple** : Un participant peut être assigné à plusieurs sessions
- **Visual** : Les sessions sélectionnées sont marquées d'une coche verte

### Indicateur visuel dans la liste de présence

Dans l'écran de prise de présence, les participants assignés à la session actuelle sont identifiés par une étoile ⭐.

## Calcul des statistiques

Le système distingue deux types de présences :

### 1. Présences aux sessions assignées
**Taux de présence régulier** : Calculé uniquement sur les sessions assignées
- **Absent d'une session assignée** : Compte comme absent ❌
- **Présent à une session assignée** : Compte comme présent ✓
- **Formule** : (Présences aux sessions assignées) / (Total présences+absences aux sessions assignées) × 100

### 2. Présences bonus
**Présences aux sessions non-assignées** : Valorisées comme bonus 🎁
- **Absent d'une session non-assignée** : Ne compte ni présent ni absent (neutre)
- **Présent à une session non-assignée** : Compte comme présence bonus

## Affichage des statistiques

### Participant avec sessions assignées
```
DUPONT Jean
Sessions assignées: 8/10 sessions
+2 bonus
80%
```

### Participant sans sessions assignées
```
MARTIN Claire
Aucune session assignée
5 présences
```

## Avantages du système

1. **Taux de présence réaliste** : Calculé uniquement pour les sessions où le participant est attendu
2. **Flexibilité** : Permet de gérer participants réguliers et occasionnels
3. **Valorisation** : Les présences "bonus" sont mises en avant
4. **Pas de pénalité** : Ne pénalise pas les absences aux sessions non-assignées

## Base de données

### Nouvelle table : participant_sessions
```sql
CREATE TABLE participant_sessions (
  id SERIAL PRIMARY KEY,
  participant_id INTEGER REFERENCES participants(id) ON DELETE CASCADE,
  session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE(participant_id, session_id)
);
```

Cette table stocke la relation many-to-many entre participants et sessions.

## Mise à jour future

Pour modifier les sessions assignées d'un participant existant :
1. Aller dans les détails du club
2. Long press sur un participant
3. Sélectionner "Modifier les sessions assignées"
4. Cocher/décocher les sessions
5. Enregistrer

*(Cette fonctionnalité sera implémentée dans une prochaine version)*
