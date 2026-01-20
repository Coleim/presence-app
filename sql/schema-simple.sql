-- ============================================
-- SIMPLE SCHEMA FOR PRESENCE APP
-- ============================================
-- Clean, straightforward schema without complex sync mechanisms

-- ============================================
-- STEP 1: CLEAN EVERYTHING
-- ============================================
-- Run these commands in Supabase SQL Editor to clean existing tables:

/*
DROP TABLE IF EXISTS attendance CASCADE;
DROP TABLE IF EXISTS participant_sessions CASCADE;
DROP TABLE IF EXISTS participants CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS club_members CASCADE;
DROP TABLE IF EXISTS clubs CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS sync_log CASCADE;

DROP FUNCTION IF EXISTS create_club_with_membership CASCADE;
DROP FUNCTION IF EXISTS join_club_with_code CASCADE;
DROP FUNCTION IF EXISTS get_club_changes_since CASCADE;
DROP FUNCTION IF EXISTS log_changes CASCADE;
DROP FUNCTION IF EXISTS set_share_code CASCADE;
DROP FUNCTION IF EXISTS generate_share_code CASCADE;
DROP FUNCTION IF EXISTS soft_delete_club CASCADE;
DROP FUNCTION IF EXISTS soft_delete_session CASCADE;
DROP FUNCTION IF EXISTS soft_delete_participant CASCADE;
DROP FUNCTION IF EXISTS restore_club CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;
DROP FUNCTION IF EXISTS handle_new_user CASCADE;
DROP FUNCTION IF EXISTS add_owner_as_member CASCADE;
DROP FUNCTION IF EXISTS update_updated_at CASCADE;
*/

-- ============================================
-- STEP 2: CREATE USER TABLE
-- ============================================
-- User profiles (auto-created when user signs in)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- STEP 3: AUTO-CREATE USER PROFILE ON AUTH
-- ============================================
-- Clean up existing trigger and function first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Trigger to automatically create user profile when user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email)
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- STEP 4: CREATE CLUBS TABLE WITH OWNER
-- ============================================
CREATE TABLE clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- SESSIONS TABLE
-- ============================================
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- PARTICIPANTS TABLE
-- ============================================
CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  is_long_term_sick BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- PARTICIPANT_SESSIONS (which sessions they're enrolled in)
-- ============================================
CREATE TABLE participant_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(participant_id, session_id)
);

-- ============================================
-- ATTENDANCE TABLE
-- ============================================
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  present BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(participant_id, session_id, date)
);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- User profiles: users can only see their own profile
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- Clubs: users can only see and manage their own clubs
CREATE POLICY "Users can view their own clubs" ON clubs
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "Users can create clubs" ON clubs
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update their clubs" ON clubs
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Owners can delete their clubs" ON clubs
  FOR DELETE USING (owner_id = auth.uid());

-- Sessions: users can manage sessions in their own clubs
CREATE POLICY "Users can view sessions in their clubs" ON sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = sessions.club_id
      AND clubs.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can create sessions in their clubs" ON sessions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = sessions.club_id
      AND clubs.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update sessions in their clubs" ON sessions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = sessions.club_id
      AND clubs.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete sessions in their clubs" ON sessions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = sessions.club_id
      AND clubs.owner_id = auth.uid()
    )
  );

-- Participants: users can manage participants in their own clubs
CREATE POLICY "Users can view participants in their clubs" ON participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = participants.club_id
      AND clubs.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can create participants in their clubs" ON participants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = participants.club_id
      AND clubs.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update participants in their clubs" ON participants
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = participants.club_id
      AND clubs.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete participants in their clubs" ON participants
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = participants.club_id
      AND clubs.owner_id = auth.uid()
    )
  );

-- Participant sessions: users can manage in their own clubs
CREATE POLICY "Users can view participant sessions" ON participant_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM participants p
      JOIN clubs c ON c.id = p.club_id
      WHERE p.id = participant_sessions.participant_id
      AND c.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can create participant sessions" ON participant_sessions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM participants p
      JOIN clubs c ON c.id = p.club_id
      WHERE p.id = participant_sessions.participant_id
      AND c.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete participant sessions" ON participant_sessions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM participants p
      JOIN clubs c ON c.id = p.club_id
      WHERE p.id = participant_sessions.participant_id
      AND c.owner_id = auth.uid()
    )
  );

-- Attendance: users can manage attendance in their own clubs
CREATE POLICY "Users can view attendance" ON attendance
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM participants p
      JOIN clubs c ON c.id = p.club_id
      WHERE p.id = attendance.participant_id
      AND c.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can create attendance" ON attendance
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM participants p
      JOIN clubs c ON c.id = p.club_id
      WHERE p.id = attendance.participant_id
      AND c.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update attendance" ON attendance
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM participants p
      JOIN clubs c ON c.id = p.club_id
      WHERE p.id = attendance.participant_id
      AND c.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete attendance" ON attendance
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM participants p
      JOIN clubs c ON c.id = p.club_id
      WHERE p.id = attendance.participant_id
      AND c.owner_id = auth.uid()
    )
  );

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX idx_clubs_owner ON clubs(owner_id);
CREATE INDEX idx_sessions_club ON sessions(club_id);
CREATE INDEX idx_participants_club ON participants(club_id);
CREATE INDEX idx_participant_sessions_participant ON participant_sessions(participant_id);
CREATE INDEX idx_participant_sessions_session ON participant_sessions(session_id);
CREATE INDEX idx_attendance_participant ON attendance(participant_id);
CREATE INDEX idx_attendance_session ON attendance(session_id);
CREATE INDEX idx_attendance_date ON attendance(date);

-- ============================================
-- DONE! Much simpler schema
-- ============================================
