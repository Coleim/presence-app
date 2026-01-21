# Club Sharing Implementation - Installation & Setup Guide

## ✅ Completed Implementation

All code changes have been implemented for the club sharing feature. Here's what was added:

### 1. Database Schema
- Created `/sql/migration_club_sharing.sql` with all necessary columns and functions
- Added `owner_id`, `share_code`, `updated_at` columns to clubs table
- **NO club_members table** - membership tracked locally!
- Simplified RLS policies (anyone can read/write, only owners can delete)
- Created `generate_share_code()` and `get_club_by_share_code()` functions

### 2. Code Changes
- ✅ Updated Club interface with owner_id, share_code, created_at, updated_at
- ✅ Added Session, Participant, AttendanceRecord timestamps for conflict resolution
- ✅ Added `generateShareCode()` and `joinClubByCode()` methods to dataService
- ✅ Updated ClubDetailsScreen to show share code (owner only) with copy/share buttons
- ✅ Updated JoinClubScreen to use new joinClubByCode method (no membership tracking!)
- ✅ Added permission checks: hide delete buttons for non-owners
- ✅ Updated CreateClubScreen to set owner_id when authenticated
- ✅ Updated EditParticipantScreen to hide delete button for non-owners
- ✅ Updated syncService to sync all locally stored clubs (no server query needed!)

### 3. Documentation
- ✅ Created `/docs/CLUB_SHARING.md` with complete feature documentation

## 🔧 Required Setup Steps

### Step 1: Install Missing Package
```bash
npx expo install expo-clipboard
```

### Step 2: Run Database Migration
1. Open Supabase Dashboard → SQL Editor
2. Copy the contents of `/sql/migration_club_sharing.sql`
3. Execute the SQL script
4. Verify columns, functions, and policies were created successfully
5. **Note**: No club_members table needed!

### Step 3: Set Owner for Existing Clubs (if any)
If you have existing clubs without owner_id, run this query:
```sql
-- Option 1: Set a specific user as owner for all clubs
UPDATE clubs 
SET owner_id = '<your-user-id>' 
WHERE owner_id IS NULL;

-- Option 2: Or query your user ID first
SELECT id, email FROM auth.users;
-- Then use that ID in the update above
```

### Step 4: Test the Feature
1. **Create a club** (while logged in)
   - Verify share code is generated
   - Check that owner_id is set

2. **View club details** (as owner)
   - Verify share code is displayed
   - Test copy button
   - Test share button

3. **Join a club** (as different user)
   - Go to "Rejoindre un club"
   - Enter share code
   - Verify club appears in list
   - Verify you can add participants but NOT delete them

4. **Test permissions**
   - Owner: can add/delete sessions and participants
   - Member: can only add participants, view sessions
   - Verify delete buttons are hidden for non-owners

5. **Test sync**
   - Make changes on one device
   - Wait for sync (60 seconds) or trigger manually
   - Verify changes appear on other device

## 🎯 Key Features

1. **Automatic Share Code**: 6-character codes (ABC234 format)
2. **Copy & Share**: Native clipboard and share sheet integration
3. **Permission-Based UI**: Buttons hidden/disabled based on ownership
4. **Conflict Resolution**: Last-Write-Wins using updated_at timestamps
5. **Security**: RLS policies enforce delete permissions (only owners)
6. **Local-First**: No membership table - clubs stored locally after joining!

## 🔍 Verification

After setup, verify:
- [ ] Share codes are generated for new clubs
- [ ] Copy button works in ClubDetailsScreen
- [ ] Share button opens native share sheet
- [ ] JoinClubScreen accepts valid codes
- [ ] Invalid codes show error message
- [ ] Non-owners cannot delete participants/sessions
- [ ] Sync works between owner and members
- [ ] Timestamps prevent sync conflicts

## 🐛 Troubleshooting

### "expo-clipboard not found"
Run: `npx expo install expo-clipboard`

### "Invalid share code" error when joining
- Ensure migration ran successfully
- Check `get_club_by_share_code` function exists in Supabase
- Verify RLS policies allow SELECT on clubs table (should allow anyone)

### Share code not visible
- Must be logged in
- Must be club owner (check owner_id === current user id)

### Cannot delete participant as member
- This is expected! Only owners can delete
- Verify RLS policies are active

### Sync not working for shared clubs
- Verify club is saved in local AsyncStorage
- Check syncService syncs all locally stored clubs (no server filtering)
- Local club list is source of truth

## 📝 Next Steps

1. Install expo-clipboard package
2. Run database migration
3. Test with at least 2 authenticated users
4. Review permissions and security
5. Consider adding features from "Future Enhancements" in CLUB_SHARING.md

## 🔗 Related Files

- `/sql/migration_club_sharing.sql` - Database setup
- `/docs/CLUB_SHARING.md` - Feature documentation
- `/lib/dataService.ts` - Share code generation, join club logic
- `/lib/syncService.ts` - Multi-device sync with club_members
- `/screens/ClubDetailsScreen.tsx` - Share code display
- `/screens/JoinClubScreen.tsx` - Join by code interface
- `/screens/EditParticipantScreen.tsx` - Permission checks
