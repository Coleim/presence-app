# CRITICAL SECURITY FIX - RLS Policies

## Problem
The current RLS policies allow **ANY authenticated user to see ALL clubs** in the database. This is a serious security vulnerability.

## Root Cause
In `sql/migration_club_sharing.sql`, line 129:
```sql
CREATE POLICY "Anyone can view clubs" ON clubs
  FOR SELECT USING (true);
```

This policy allows unrestricted access to all clubs.

## Solution

### 1. Run the fix SQL script
Execute `/Users/coliva/dev/perso/presence-app/sql/fix_rls_policies.sql` in your Supabase SQL Editor.

This will:
- Create a `club_members` table to track who has access to which clubs
- Update all RLS policies to only allow access to clubs you own OR clubs you've joined
- Fix policies for sessions, participants, attendance, and participant_sessions

### 2. Add club owner as member when creating clubs
Update the `saveClub` function to automatically add the owner to `club_members` when creating a new club.

### 3. Update existing clubs
After running the migration, you need to backfill the `club_members` table for existing clubs:

```sql
-- Add all existing club owners as members of their clubs
INSERT INTO club_members (club_id, user_id)
SELECT id, owner_id
FROM clubs
WHERE owner_id IS NOT NULL
ON CONFLICT (club_id, user_id) DO NOTHING;
```

## What Changed

### Before
- Any user could see ALL clubs in the database
- No access control between users

### After
- Users can only see:
  1. Clubs they own (owner_id = their user ID)
  2. Clubs they've joined via share code (recorded in club_members table)
- All related data (sessions, participants, attendance) follows the same access rules

## Testing
After applying the fix:
1. Sign out and sign in with a different account
2. You should see NO clubs (or only clubs you've joined)
3. Create a new club - it should appear only for you
4. Share the club code and join from another account
5. Both accounts should now see the shared club
