# Attendance Management App

A React Native Expo app for managing student attendance in clubs/sessions.

## Features

- **Offline-First**: Works completely offline, stores data locally, syncs when online
- User authentication (online) or offline mode
- Club creation and joining via code/password
- Adding sessions and participants
- Marking attendance for sessions
- Basic statistics view

## Setup

1. (Optional) Create a Supabase project at https://supabase.com
2. (Optional) Run the SQL schema from `sql/schema.sql` in your Supabase SQL editor.
3. (Optional) Update `lib/supabase.js` with your Supabase URL and key.
4. Install dependencies: `npm install`
5. Run the app: `npm start`

## Offline Usage

The app works fully offline:
- All data is stored locally using AsyncStorage
- If Supabase is configured and online, data syncs automatically
- If not configured, use offline mode from the auth screen
- Data persists between app restarts

## Online Sync

When Supabase is configured:
- Data is synced on app start and when saving
- Conflicts are resolved with last-write-wins
- Attendance and other data syncs seamlessly

## Test Utilities

Pour tester l'application avec des données fictives :

1. Ouvrir un club dans l'app
2. Cliquer sur "🧪 Utilitaires de test"
3. **Créer 20 participants de test** : Ajoute 20 participants avec des noms français
4. **Supprimer les participants de test** : Supprime tous les participants marqués "TEST - À SUPPRIMER"

Les participants de test incluent :
- Antoine BERNARD, Sophie MARTIN, Lucas DUBOIS, Emma THOMAS, Hugo ROBERT
- Léa PETIT, Tom DURAND, Chloé LEROY, Mathis MOREAU, Sarah SIMON
- Nathan LAURENT, Manon LEFEBVRE, Enzo MICHEL, Camille GARCIA, Maxime DAVID
- Inès BERTRAND, Arthur ROUX, Jade VINCENT, Paul FOURNIER, Zoé MOREL

Pratique pour tester :
- Le tri par sessions préférées (⭐)
- Les statistiques de présence
- Le scroll dans les longues listes
- La suppression en masse
