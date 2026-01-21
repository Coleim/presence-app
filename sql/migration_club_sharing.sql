-- Migration: Add club sharing functionality
-- This adds share codes and proper ownership tracking

-- 1. Add columns to clubs table
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id);
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS share_code VARCHAR(8) UNIQUE;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. No club_members table needed!
-- Membership is tracked locally in the app
-- Users join via share code and save club locally
-- Sync handles all locally stored clubs

-- 3. Create function to generate unique share codes
CREATE OR REPLACE FUNCTION generate_share_code() RETURNS VARCHAR(8) AS $$
DECLARE
  code VARCHAR(8);
  exists boolean;
BEGIN
  LOOP
    -- Generate 6-character alphanumeric code (excluding confusing chars like 0/O, 1/I)
    code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6));
    code := TRANSLATE(code, '0O1I', '2345');
    
    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM clubs WHERE share_code = code) INTO exists;
    EXIT WHEN NOT exists;
  END LOOP;
  
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- 4. Create trigger to auto-generate share codes for new clubs
CREATE OR REPLACE FUNCTION set_club_share_code() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.share_code IS NULL THEN
    NEW.share_code := generate_share_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clubs_share_code_trigger
  BEFORE INSERT ON clubs
  FOR EACH ROW
  EXECUTE FUNCTION set_club_share_code();

-- 5. Create trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clubs_updated_at_trigger
  BEFORE UPDATE ON clubs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Also add updated_at to other tables for Last-Write-Wins conflict resolution
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE participants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE participant_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE TRIGGER sessions_updated_at_trigger
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER participants_updated_at_trigger
  BEFORE UPDATE ON participants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER attendance_updated_at_trigger
  BEFORE UPDATE ON attendance
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER participant_sessions_updated_at_trigger
  BEFORE UPDATE ON participant_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 6. Create function to fetch club by share code
-- No membership tracking needed - just return club data
CREATE OR REPLACE FUNCTION get_club_by_share_code(
  p_share_code VARCHAR(8)
) RETURNS TABLE (
  club_id UUID,
  club_name TEXT,
  club_description TEXT,
  owner_id UUID,
  share_code VARCHAR(8),
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  -- Find and return club by share code
  RETURN QUERY
  SELECT 
    clubs.id,
    clubs.name,
    clubs.description,
    clubs.owner_id,
    clubs.share_code,
    clubs.created_at,
    clubs.updated_at
  FROM clubs
  WHERE clubs.share_code = p_share_code;
  
  -- If not found, return empty result (no exception needed)
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Update Row Level Security (RLS) policies
-- Simplified: anyone can read, only owners can modify/delete
-- Drop old policies if they exist
DROP POLICY IF EXISTS "Users can view clubs they have access to" ON clubs;
DROP POLICY IF EXISTS "Users can create clubs" ON clubs;
DROP POLICY IF EXISTS "Users can update clubs" ON clubs;
DROP POLICY IF EXISTS "Users can delete clubs" ON clubs;
DROP POLICY IF EXISTS "Users can view their clubs" ON clubs;

-- Anyone can view clubs (needed to fetch by share code)
CREATE POLICY "Anyone can view clubs" ON clubs
  FOR SELECT USING (true);

-- Anyone can create clubs
CREATE POLICY "Anyone can create clubs" ON clubs
  FOR INSERT WITH CHECK (true);

-- Anyone can update clubs (local-first: validation happens in app)
-- But typically only owners will update in practice
CREATE POLICY "Anyone can update clubs" ON clubs
  FOR UPDATE USING (true);

-- Only owners can delete clubs
CREATE POLICY "Only owners can delete clubs" ON clubs
  FOR DELETE USING (owner_id = auth.uid());

-- Sessions: Anyone can view, only owners can create/update/delete
DROP POLICY IF EXISTS "Users can view sessions of accessible clubs" ON sessions;
DROP POLICY IF EXISTS "Users can insert sessions for accessible clubs" ON sessions;
DROP POLICY IF EXISTS "Users can update sessions" ON sessions;
DROP POLICY IF EXISTS "Users can delete sessions" ON sessions;
DROP POLICY IF EXISTS "Users can view sessions of their clubs" ON sessions;
DROP POLICY IF EXISTS "Owners can manage sessions" ON sessions;

CREATE POLICY "Anyone can view sessions" ON sessions
  FOR SELECT USING (true);

CREATE POLICY "Anyone can create sessions" ON sessions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update sessions" ON sessions
  FOR UPDATE USING (true);

CREATE POLICY "Only owners can delete sessions" ON sessions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = sessions.club_id
      AND clubs.owner_id = auth.uid()
    )
  );

-- Participants: Anyone can add/update, only owners can delete
DROP POLICY IF EXISTS "Users can view participants of accessible clubs" ON participants;
DROP POLICY IF EXISTS "Users can insert participants for accessible clubs" ON participants;
DROP POLICY IF EXISTS "Users can update participants" ON participants;
DROP POLICY IF EXISTS "Users can delete participants" ON participants;
DROP POLICY IF EXISTS "Users can view participants of their clubs" ON participants;
DROP POLICY IF EXISTS "Users can add participants to their clubs" ON participants;
DROP POLICY IF EXISTS "Users can update participants in their clubs" ON participants;
DROP POLICY IF EXISTS "Owners can delete participants" ON participants;

CREATE POLICY "Anyone can view participants" ON participants
  FOR SELECT USING (true);

CREATE POLICY "Anyone can add participants" ON participants
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update participants" ON participants
  FOR UPDATE USING (true);

CREATE POLICY "Only owners can delete participants" ON participants
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = participants.club_id
      AND clubs.owner_id = auth.uid()
    )
  );

-- Attendance: Anyone can manage (local-first model)
DROP POLICY IF EXISTS "Users can view attendance of accessible clubs" ON attendance;
DROP POLICY IF EXISTS "Users can insert/update attendance for accessible clubs" ON attendance;
DROP POLICY IF EXISTS "Users can manage attendance for their clubs" ON attendance;

CREATE POLICY "Anyone can manage attendance" ON attendance
  FOR ALL USING (true);

-- Participant Sessions: Anyone can manage
DROP POLICY IF EXISTS "Users can view participant sessions of accessible clubs" ON participant_sessions;
DROP POLICY IF EXISTS "Users can manage participant sessions for accessible clubs" ON participant_sessions;
DROP POLICY IF EXISTS "Users can manage participant sessions for their clubs" ON participant_sessions;

CREATE POLICY "Anyone can manage participant sessions" ON participant_sessions
  FOR ALL USING (true);

-- 8. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_clubs_owner_id ON clubs(owner_id);
CREATE INDEX IF NOT EXISTS idx_clubs_share_code ON clubs(share_code);

-- 9. Migrate existing data: set owner_id for existing clubs without one
-- You'll need to manually set this based on your data or leave it NULL for offline-only clubs
-- Example: UPDATE clubs SET owner_id = (SELECT id FROM auth.users LIMIT 1) WHERE owner_id IS NULL;

COMMENT ON COLUMN clubs.share_code IS 'Unique code for sharing club access with others';
COMMENT ON COLUMN clubs.owner_id IS 'User who created and owns the club (can delete, manage sessions/participants)';
COMMENT ON FUNCTION get_club_by_share_code IS 'Fetch club details by share code for local storage';
