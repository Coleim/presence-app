-- ============================================
-- RATE LIMITS AND ABUSE PREVENTION
-- ============================================
-- Protects against database abuse if credentials are compromised
-- 
-- Limits:
-- - 1 club maximum per user (as owner)
-- - 30 participants maximum per club
-- - 10 sessions maximum per club
-- - 1000 attendance records per club per day
-- - Maximum 5 club memberships per user
-- ============================================

-- ============================================
-- FUNCTION: Check club ownership limit
-- ============================================
-- Ensures a user can only own 1 club
CREATE OR REPLACE FUNCTION check_club_ownership_limit()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if user already owns a club
  IF (SELECT COUNT(*) FROM clubs WHERE owner_id = NEW.owner_id) >= 1 THEN
    RAISE EXCEPTION 'User can only own 1 club maximum';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for club ownership limit
DROP TRIGGER IF EXISTS enforce_club_ownership_limit ON clubs;
CREATE TRIGGER enforce_club_ownership_limit
  BEFORE INSERT ON clubs
  FOR EACH ROW
  EXECUTE FUNCTION check_club_ownership_limit();

-- ============================================
-- FUNCTION: Check participants limit per club
-- ============================================
-- Ensures a club cannot have more than 30 participants
CREATE OR REPLACE FUNCTION check_participants_limit()
RETURNS TRIGGER AS $$
BEGIN
  -- Check current number of participants in the club
  IF (SELECT COUNT(*) FROM participants 
      WHERE club_id = NEW.club_id) >= 30 THEN
    RAISE EXCEPTION 'Club cannot have more than 30 participants';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for participants limit
DROP TRIGGER IF EXISTS enforce_participants_limit ON participants;
CREATE TRIGGER enforce_participants_limit
  BEFORE INSERT ON participants
  FOR EACH ROW
  EXECUTE FUNCTION check_participants_limit();

-- ============================================
-- FUNCTION: Check sessions limit per club
-- ============================================
-- Ensures a club cannot have more than 10 sessions
CREATE OR REPLACE FUNCTION check_sessions_limit()
RETURNS TRIGGER AS $$
BEGIN
  -- Check current number of sessions in the club
  IF (SELECT COUNT(*) FROM sessions 
      WHERE club_id = NEW.club_id) >= 10 THEN
    RAISE EXCEPTION 'Club cannot have more than 10 sessions';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for sessions limit
DROP TRIGGER IF EXISTS enforce_sessions_limit ON sessions;
CREATE TRIGGER enforce_sessions_limit
  BEFORE INSERT ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION check_sessions_limit();

-- ============================================
-- FUNCTION: Check club memberships limit per user
-- ============================================
-- Ensures a user cannot be a member of more than 5 clubs
CREATE OR REPLACE FUNCTION check_club_memberships_limit()
RETURNS TRIGGER AS $$
BEGIN
  -- Check current number of club memberships for the user
  IF (SELECT COUNT(*) FROM club_members 
      WHERE user_id = NEW.user_id) >= 5 THEN
    RAISE EXCEPTION 'User cannot join more than 5 clubs';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for club memberships limit
DROP TRIGGER IF EXISTS enforce_club_memberships_limit ON club_members;
CREATE TRIGGER enforce_club_memberships_limit
  BEFORE INSERT ON club_members
  FOR EACH ROW
  EXECUTE FUNCTION check_club_memberships_limit();

-- ============================================
-- FUNCTION: Check attendance records rate limit
-- ============================================
-- Prevents abuse by limiting attendance records per club per day
CREATE OR REPLACE FUNCTION check_attendance_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  club_id_var UUID;
BEGIN
  -- Get the club_id from the session
  SELECT s.club_id INTO club_id_var
  FROM sessions s
  WHERE s.id = NEW.session_id;
  
  -- Check number of attendance records created today for this club
  -- Note: attendance table doesn't have created_at in the schema, so using date column
  IF (SELECT COUNT(*) FROM attendance a
      JOIN sessions s ON a.session_id = s.id
      WHERE s.club_id = club_id_var
      AND a.date = CURRENT_DATE) >= 1000 THEN
    RAISE EXCEPTION 'Rate limit exceeded: maximum 1000 attendance records per club per day';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for attendance rate limit
DROP TRIGGER IF EXISTS enforce_attendance_rate_limit ON attendance;
CREATE TRIGGER enforce_attendance_rate_limit
  BEFORE INSERT ON attendance
  FOR EACH ROW
  EXECUTE FUNCTION check_attendance_rate_limit();

-- ============================================
-- ADDITIONAL SECURITY: Size limits on text fields
-- ============================================
-- Prevent abuse through extremely large text inputs
CREATE OR REPLACE FUNCTION check_text_field_sizes()
RETURNS TRIGGER AS $$
BEGIN
  -- For clubs table
  IF TG_TABLE_NAME = 'clubs' THEN
    IF length(NEW.name) > 200 THEN
      RAISE EXCEPTION 'Club name too long (max 200 characters)';
    END IF;
    IF NEW.description IS NOT NULL AND length(NEW.description) > 2000 THEN
      RAISE EXCEPTION 'Club description too long (max 2000 characters)';
    END IF;
  END IF;
  
  -- For participants table
  IF TG_TABLE_NAME = 'participants' THEN
    IF length(NEW.first_name) > 100 THEN
      RAISE EXCEPTION 'First name too long (max 100 characters)';
    END IF;
    IF length(NEW.last_name) > 100 THEN
      RAISE EXCEPTION 'Last name too long (max 100 characters)';
    END IF;
    IF NEW.notes IS NOT NULL AND length(NEW.notes) > 1000 THEN
      RAISE EXCEPTION 'Participant notes too long (max 1000 characters)';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for text field size validation
DROP TRIGGER IF EXISTS check_clubs_text_sizes ON clubs;
CREATE TRIGGER check_clubs_text_sizes
  BEFORE INSERT OR UPDATE ON clubs
  FOR EACH ROW
  EXECUTE FUNCTION check_text_field_sizes();

DROP TRIGGER IF EXISTS check_participants_text_sizes ON participants;
CREATE TRIGGER check_participants_text_sizes
  BEFORE INSERT OR UPDATE ON participants
  FOR EACH ROW
  EXECUTE FUNCTION check_text_field_sizes();

-- ============================================
-- VIEWS: Monitor resource usage
-- ============================================
-- Useful for admins to monitor usage patterns

-- View: Clubs per user (if owner_id column exists)
CREATE OR REPLACE VIEW v_clubs_per_user AS
SELECT 
  owner_id,
  COUNT(*) as club_count,
  array_agg(name) as club_names
FROM clubs
WHERE owner_id IS NOT NULL
GROUP BY owner_id;

-- View: Participants per club
CREATE OR REPLACE VIEW v_participants_per_club AS
SELECT 
  club_id,
  c.name as club_name,
  COUNT(*) as participant_count
FROM participants p
JOIN clubs c ON p.club_id = c.id
GROUP BY club_id, c.name;

-- View: Sessions per club
CREATE OR REPLACE VIEW v_sessions_per_club AS
SELECT 
  club_id,
  c.name as club_name,
  COUNT(*) as session_count
FROM sessions s
JOIN clubs c ON s.club_id = c.id
GROUP BY club_id, c.name;

-- View: Daily attendance records per club
CREATE OR REPLACE VIEW v_daily_attendance_per_club AS
SELECT 
  s.club_id,
  c.name as club_name,
  a.date,
  COUNT(*) as attendance_count
FROM attendance a
JOIN sessions s ON a.session_id = s.id
JOIN clubs c ON s.club_id = c.id
GROUP BY s.club_id, c.name, a.date;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON FUNCTION check_club_ownership_limit() IS 'Ensures users can only own 1 club maximum';
COMMENT ON FUNCTION check_participants_limit() IS 'Ensures clubs cannot have more than 30 participants';
COMMENT ON FUNCTION check_sessions_limit() IS 'Ensures clubs cannot have more than 10 sessions';
COMMENT ON FUNCTION check_club_memberships_limit() IS 'Ensures users cannot join more than 5 clubs';
COMMENT ON FUNCTION check_attendance_rate_limit() IS 'Prevents spam by limiting attendance records to 1000 per club per day';
COMMENT ON FUNCTION check_text_field_sizes() IS 'Prevents abuse through extremely large text inputs';
