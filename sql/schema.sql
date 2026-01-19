-- Supabase SQL Schema for Attendance Management App

-- Enable RLS
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

-- Clubs table
CREATE TABLE clubs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  academic_year_start DATE,
  academic_year_end DATE,
  code TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sessions table
CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  club_id INTEGER REFERENCES clubs(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL
);

-- Participants table
CREATE TABLE participants (
  id SERIAL PRIMARY KEY,
  club_id INTEGER REFERENCES clubs(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  grade TEXT,
  level TEXT,
  notes TEXT
);

-- Participant Sessions table (many-to-many relationship for preferred sessions)
CREATE TABLE participant_sessions (
  id SERIAL PRIMARY KEY,
  participant_id INTEGER REFERENCES participants(id) ON DELETE CASCADE,
  session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  UNIQUE(participant_id, session_id)
);

-- Attendance table
CREATE TABLE attendance (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  participant_id INTEGER REFERENCES participants(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
  UNIQUE(session_id, participant_id, date)
);

-- Club users table for access control
CREATE TABLE club_users (
  id SERIAL PRIMARY KEY,
  club_id INTEGER REFERENCES clubs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE(club_id, user_id)
);

-- RLS Policies
-- Clubs: users can only see clubs they have access to
CREATE POLICY "Users can view clubs they have access to" ON clubs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM club_users
      WHERE club_users.club_id = clubs.id
      AND club_users.user_id = auth.uid()
    )
  );

-- Allow inserting clubs (for creation)
CREATE POLICY "Users can create clubs" ON clubs FOR INSERT WITH CHECK (true);

-- Sessions: same as clubs
CREATE POLICY "Users can view sessions of accessible clubs" ON sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM club_users
      WHERE club_users.club_id = sessions.club_id
      AND club_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert sessions for accessible clubs" ON sessions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM club_users
      WHERE club_users.club_id = sessions.club_id
      AND club_users.user_id = auth.uid()
    )
  );

-- Similar for participants and attendance

CREATE POLICY "Users can view participants of accessible clubs" ON participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM club_users
      WHERE club_users.club_id = participants.club_id
      AND club_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert participants for accessible clubs" ON participants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM club_users
      WHERE club_users.club_id = participants.club_id
      AND club_users.user_id = auth.uid()
    )
  );

-- Participant sessions policies
CREATE POLICY "Users can view participant sessions of accessible clubs" ON participant_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM club_users cu
      JOIN participants p ON p.id = participant_sessions.participant_id
      WHERE cu.club_id = p.club_id
      AND cu.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage participant sessions for accessible clubs" ON participant_sessions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM club_users cu
      JOIN participants p ON p.id = participant_sessions.participant_id
      WHERE cu.club_id = p.club_id
      AND cu.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view attendance of accessible clubs" ON attendance
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM club_users cu
      JOIN sessions s ON s.id = attendance.session_id
      WHERE cu.club_id = s.club_id
      AND cu.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert/update attendance for accessible clubs" ON attendance
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM club_users cu
      JOIN sessions s ON s.id = attendance.session_id
      WHERE cu.club_id = s.club_id
      AND cu.user_id = auth.uid()
    )
  );

-- Club users
CREATE POLICY "Users can view their club accesses" ON club_users
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert club accesses" ON club_users
  FOR INSERT WITH CHECK (user_id = auth.uid());