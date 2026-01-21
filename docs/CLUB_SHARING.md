# Club Sharing Feature

## Overview
The club sharing feature allows authenticated users to share their clubs with other users using unique share codes. This enables collaborative management of attendance and participants across multiple devices.

## Features

### 1. **Share Code Generation**
- Each club automatically gets a unique 6-character alphanumeric code when created
- Code format: uppercase letters and numbers (excluding confusing characters: 0, O, 1, I)
- Example: `ABC234`, `XYZ567`

### 2. **Ownership & Permissions**
- **Club Owner** (creator):
  - Can view and share the club code
  - Can add/delete sessions
  - Can add/delete participants
  - Can delete the club
  - Can reset statistics
  
- **Club Members** (joined via share code):
  - Can view all sessions and participants
  - Can add participants
  - Can mark attendance
  - **CANNOT** delete participants
  - **CANNOT** add/delete sessions
  - **CANNOT** delete the club

### 3. **Conflict Resolution**
- Uses **Last-Write-Wins** strategy based on `updated_at` timestamps
- When syncing, the most recent change (highest timestamp) is kept
- Prevents overwrites between multiple devices

## User Interface

### ClubDetailsScreen
- **For Owners**: Displays share code with copy and share buttons
- **For Members**: Share code section is hidden
- Session list shows "(seul le propriétaire peut supprimer)" hint for members
- Delete club button only visible to owners

### JoinClubScreen
- Requires authentication to join a club
- Shows warning if user is not logged in
- Input for 6-character share code
- Fetches and saves club data from server

### EditParticipantScreen
- Delete button only visible to club owner
- Shows "Seul le propriétaire du club peut supprimer des participants" message for members

## Database Schema

### Updated Columns
```sql
ALTER TABLE clubs ADD COLUMN owner_id UUID REFERENCES auth.users(id);
ALTER TABLE clubs ADD COLUMN share_code VARCHAR(8) UNIQUE;
ALTER TABLE clubs ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
```

### Functions
- `generate_share_code()`: Generates unique 6-character codes
- `get_club_by_share_code(p_share_code)`: Fetches club details by share code (no membership tracking)

### Row Level Security (RLS)
**Simple, local-first approach:**
- Anyone can SELECT (read) all data
- Anyone can INSERT/UPDATE (local-first model)
- Only owners can DELETE clubs, sessions, and participants

**No membership tracking needed!**
- When you join via share code → club saved locally
- Sync syncs all locally stored clubs
- Permissions enforced by checking `owner_id`

## Implementation Details

### dataService.ts
- `generateShareCode()`: Client-side code generation (fallback)
- `joinClubByCode(shareCode)`: Calls RPC function to fetch club and save locally (no membership table!)
- `saveClub()`: Auto-generates share code for new clubs

### syncService.ts
- Syncs all locally stored clubs (no server query needed!)
- Local club list is source of truth
- Uploads club updates to server when edited
- Last-Write-Wins conflict resolution using `updated_at` timestamps

### Migration Required
Run `/sql/migration_club_sharing.sql` in Supabase SQL Editor to:
1. Add new columns and tables
2. Create triggers for auto-generation of share codes
3. Set up RLS policies
4. Create necessary indexes

## Usage Flow

### Creating & Sharing a Club
1. User creates a club (automatically sets `owner_id` and generates `share_code`)
2. Owner opens club details → sees share code with copy/share buttons
3. Owner shares code via Share button or copies to clipboard
4. Code is shared with other users (SMS, email, messaging apps, etc.)

### Joining a Club
1. Recipient must be logged in (redirected to Auth screen if not)
2. Navigate to "Rejoindre un club" from Home screen
3. Enter the 6-character code
4. App fetches club from server via `get_club_by_share_code` RPC
5. Club is saved locally (no membership table entry needed!)
6. Subsequent syncs download all sessions, participants, and attendance

### Collaborative Usage
1. Owner and members can all mark attendance
2. Members can add new participants
3. Only owner can delete participants or sessions
4. Changes sync every 60 seconds (or manually via sync button)
5. Last-Write-Wins prevents conflicts

## Security Considerations

1. **Authentication Required**: Only logged-in users can join shared clubs
2. **Share Code Validation**: Server validates codes before returning club data
3. **RLS Policies**: Database enforces delete permissions at row level (only owners)
4. **Role-Based UI**: Client hides/disables features based on ownership
5. **Local-First Security**: Membership tracked locally, permissions enforced by owner_id check

## Testing Checklist

- [ ] Create club and verify share code is generated
- [ ] Copy share code works
- [ ] Share button opens native share sheet
- [ ] Join club with valid code succeeds
- [ ] Join club with invalid code shows error
- [ ] Non-authenticated user prompted to log in
- [ ] Owner sees all management buttons
- [ ] Member cannot see delete buttons
- [ ] Session delete only works for owner (long-press)
- [ ] Participant delete button hidden for members
- [ ] Attendance syncs between owner and members
- [ ] Last-Write-Wins conflict resolution works
- [ ] Club appears in both owner's and member's club lists

## Future Enhancements

- Role management (add "admin" role with more permissions)
- Revoke access (remove members from club)
- Share code expiration
- Invite notifications
- Activity log for club changes
- Member list display
