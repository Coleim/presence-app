-- FIX: Secure RLS Policies for Clubs
-- Users should only see clubs they own or have explicitly joined

-- 1. Create a club_members table to track who has access to which clubs
CREATE TABLE IF NOT EXISTS club_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(club_id, user_id)
);

-- Enable RLS on club_members
ALTER TABLE club_members ENABLE ROW LEVEL SECURITY;

-- Anyone can view their own memberships
CREATE POLICY "Users can view their club memberships" ON club_members
  FOR SELECT USING (user_id = auth.uid());

-- Anyone can join a club (via share code in application logic)
CREATE POLICY "Users can join clubs" ON club_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can leave clubs they've joined
CREATE POLICY "Users can leave clubs" ON club_members
  FOR DELETE USING (user_id = auth.uid());

-- 2. Fix the clubs RLS policies
DROP POLICY IF EXISTS "Anyone can view clubs" ON clubs;
DROP POLICY IF EXISTS "Anyone can create clubs" ON clubs;
DROP POLICY IF EXISTS "Anyone can update clubs" ON clubs;
DROP POLICY IF EXISTS "Only owners can delete clubs" ON clubs;
DROP POLICY IF EXISTS "Users can view their clubs" ON clubs;
DROP POLICY IF EXISTS "Users can create clubs" ON clubs;
DROP POLICY IF EXISTS "Users can update their clubs" ON clubs;

-- Users can only view clubs they own or are members of
CREATE POLICY "Users can view their clubs" ON clubs
  FOR SELECT USING (
    owner_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM club_members
      WHERE club_members.club_id = clubs.id
      AND club_members.user_id = auth.uid()
    )
  );

-- Users can create clubs (they become the owner)
CREATE POLICY "Users can create clubs" ON clubs
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- Only owners can update clubs (not members)
CREATE POLICY "Only owners can update clubs" ON clubs
  FOR UPDATE USING (owner_id = auth.uid());

-- Only owners can delete clubs
CREATE POLICY "Only owners can delete clubs" ON clubs
  FOR DELETE USING (owner_id = auth.uid());

-- 3. Fix sessions RLS policies
DROP POLICY IF EXISTS "Anyone can view sessions" ON sessions;
DROP POLICY IF EXISTS "Anyone can create sessions" ON sessions;
DROP POLICY IF EXISTS "Anyone can update sessions" ON sessions;
DROP POLICY IF EXISTS "Only owners can delete sessions" ON sessions;
DROP POLICY IF EXISTS "Users can view sessions of their clubs" ON sessions;
DROP POLICY IF EXISTS "Users can create sessions for their clubs" ON sessions;
DROP POLICY IF EXISTS "Users can update sessions of their clubs" ON sessions;

CREATE POLICY "Users can view sessions of their clubs" ON sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = sessions.club_id
      AND (
        clubs.owner_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM club_members
          WHERE club_members.club_id = clubs.id
          AND club_members.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can create sessions for their clubs" ON sessions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = sessions.club_id
      AND (
        clubs.owner_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM club_members
          WHERE club_members.club_id = clubs.id
          AND club_members.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can update sessions of their clubs" ON sessions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = sessions.club_id
      AND (
        clubs.owner_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM club_members
          WHERE club_members.club_id = clubs.id
          AND club_members.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Only owners can delete sessions" ON sessions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = sessions.club_id
      AND clubs.owner_id = auth.uid()
    )
  );

-- 4. Fix participants RLS policies
DROP POLICY IF EXISTS "Anyone can view participants" ON participants;
DROP POLICY IF EXISTS "Anyone can create participants" ON participants;
DROP POLICY IF EXISTS "Anyone can update participants" ON participants;
DROP POLICY IF EXISTS "Owners can delete participants" ON participants;
DROP POLICY IF EXISTS "Users can view participants of their clubs" ON participants;
DROP POLICY IF EXISTS "Users can add participants to their clubs" ON participants;
DROP POLICY IF EXISTS "Users can update participants in their clubs" ON participants;
DROP POLICY IF EXISTS "Only owners can delete participants" ON participants;

CREATE POLICY "Users can view participants of their clubs" ON participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = participants.club_id
      AND (
        clubs.owner_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM club_members
          WHERE club_members.club_id = clubs.id
          AND club_members.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can add participants to their clubs" ON participants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = participants.club_id
      AND (
        clubs.owner_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM club_members
          WHERE club_members.club_id = clubs.id
          AND club_members.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can update participants in their clubs" ON participants
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = participants.club_id
      AND (
        clubs.owner_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM club_members
          WHERE club_members.club_id = clubs.id
          AND club_members.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Only owners can delete participants" ON participants
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = participants.club_id
      AND clubs.owner_id = auth.uid()
    )
  );

-- 5. Fix attendance RLS policies (similar pattern)
DROP POLICY IF EXISTS "Anyone can view attendance" ON attendance;
DROP POLICY IF EXISTS "Anyone can create attendance" ON attendance;
DROP POLICY IF EXISTS "Anyone can update attendance" ON attendance;
DROP POLICY IF EXISTS "Anyone can delete attendance" ON attendance;
DROP POLICY IF EXISTS "Users can view attendance of their clubs" ON attendance;
DROP POLICY IF EXISTS "Users can record attendance for their clubs" ON attendance;
DROP POLICY IF EXISTS "Users can update attendance for their clubs" ON attendance;
DROP POLICY IF EXISTS "Users can delete attendance for their clubs" ON attendance;

CREATE POLICY "Users can view attendance of their clubs" ON attendance
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sessions
      JOIN clubs ON clubs.id = sessions.club_id
      WHERE sessions.id = attendance.session_id
      AND (
        clubs.owner_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM club_members
          WHERE club_members.club_id = clubs.id
          AND club_members.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can record attendance for their clubs" ON attendance
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions
      JOIN clubs ON clubs.id = sessions.club_id
      WHERE sessions.id = attendance.session_id
      AND (
        clubs.owner_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM club_members
          WHERE club_members.club_id = clubs.id
          AND club_members.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can update attendance for their clubs" ON attendance
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM sessions
      JOIN clubs ON clubs.id = sessions.club_id
      WHERE sessions.id = attendance.session_id
      AND (
        clubs.owner_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM club_members
          WHERE club_members.club_id = clubs.id
          AND club_members.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can delete attendance for their clubs" ON attendance
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM sessions
      JOIN clubs ON clubs.id = sessions.club_id
      WHERE sessions.id = attendance.session_id
      AND (
        clubs.owner_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM club_members
          WHERE club_members.club_id = clubs.id
          AND club_members.user_id = auth.uid()
        )
      )
    )
  );

-- 6. Fix participant_sessions RLS policies
DROP POLICY IF EXISTS "Anyone can view participant_sessions" ON participant_sessions;
DROP POLICY IF EXISTS "Anyone can create participant_sessions" ON participant_sessions;
DROP POLICY IF EXISTS "Anyone can update participant_sessions" ON participant_sessions;
DROP POLICY IF EXISTS "Anyone can delete participant_sessions" ON participant_sessions;
DROP POLICY IF EXISTS "Users can view participant_sessions of their clubs" ON participant_sessions;
DROP POLICY IF EXISTS "Users can manage participant_sessions for their clubs" ON participant_sessions;

CREATE POLICY "Users can view participant_sessions of their clubs" ON participant_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sessions
      JOIN clubs ON clubs.id = sessions.club_id
      WHERE sessions.id = participant_sessions.session_id
      AND (
        clubs.owner_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM club_members
          WHERE club_members.club_id = clubs.id
          AND club_members.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can manage participant_sessions for their clubs" ON participant_sessions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sessions
      JOIN clubs ON clubs.id = sessions.club_id
      WHERE sessions.id = participant_sessions.session_id
      AND (
        clubs.owner_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM club_members
          WHERE club_members.club_id = clubs.id
          AND club_members.user_id = auth.uid()
        )
      )
    )
  );
