-- ============================================
-- SUPABASE SCHEMA V2 - MULTI-DEVICE SYNC
-- ============================================
-- Architecture pour synchronisation multi-device avec:
-- - Soft delete (pas de suppression définitive)
-- - Historique des modifications
-- - Timestamps pour la synchronisation
-- - Gestion des conflits
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable RLS sur toutes les tables
ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC;

-- ============================================
-- TABLE: USERS (Profiles utilisateurs)
-- ============================================
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- TABLE: CLUBS
-- ============================================
CREATE TABLE clubs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  academic_year_start DATE,
  academic_year_end DATE,
  
  -- Partage du club
  share_code TEXT UNIQUE NOT NULL, -- Code pour rejoindre le club
  share_password TEXT, -- Mot de passe optionnel
  
  -- Statistiques
  stats_reset_date DATE,
  
  -- Metadata
  owner_id UUID REFERENCES auth.users(id), -- Créateur du club
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Soft delete
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_by UUID REFERENCES auth.users(id),
  
  -- Sync
  version INTEGER DEFAULT 1, -- Pour gestion de conflits
  last_modified_by UUID REFERENCES auth.users(id)
);

-- Index pour performance
CREATE INDEX idx_clubs_share_code ON clubs(share_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_clubs_deleted ON clubs(deleted_at);

-- ============================================
-- TABLE: CLUB_MEMBERS (Membres d'un club)
-- ============================================
CREATE TABLE club_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Rôles et permissions
  role TEXT NOT NULL DEFAULT 'teacher' CHECK (role IN ('owner', 'admin', 'teacher', 'viewer')),
  
  -- Permissions spécifiques
  can_edit_club BOOLEAN DEFAULT false,
  can_add_members BOOLEAN DEFAULT false,
  can_manage_sessions BOOLEAN DEFAULT true,
  can_manage_participants BOOLEAN DEFAULT true,
  can_mark_attendance BOOLEAN DEFAULT true,
  can_view_stats BOOLEAN DEFAULT true,
  
  -- Metadata
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  invited_by UUID REFERENCES auth.users(id),
  
  -- Soft delete
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  UNIQUE(club_id, user_id)
);

CREATE INDEX idx_club_members_user ON club_members(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_club_members_club ON club_members(club_id) WHERE deleted_at IS NULL;

-- ============================================
-- TABLE: SESSIONS (Créneaux réguliers)
-- ============================================
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  
  -- Informations du créneau
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche')),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  
  -- Soft delete
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_by UUID REFERENCES auth.users(id),
  
  -- Sync
  version INTEGER DEFAULT 1,
  last_modified_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_sessions_club ON sessions(club_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sessions_day ON sessions(day_of_week) WHERE deleted_at IS NULL;

-- ============================================
-- TABLE: PARTICIPANTS (Élèves)
-- ============================================
CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  
  -- Informations de l'élève
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  grade TEXT,
  level TEXT,
  notes TEXT,
  is_long_term_sick BOOLEAN DEFAULT false,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  
  -- Soft delete
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_by UUID REFERENCES auth.users(id),
  
  -- Sync
  version INTEGER DEFAULT 1,
  last_modified_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_participants_club ON participants(club_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_participants_name ON participants(last_name, first_name) WHERE deleted_at IS NULL;

-- ============================================
-- TABLE: PARTICIPANT_SESSIONS (Sessions préférées)
-- ============================================
CREATE TABLE participant_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  
  -- Soft delete
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_by UUID REFERENCES auth.users(id),
  
  UNIQUE(participant_id, session_id)
);

CREATE INDEX idx_participant_sessions_participant ON participant_sessions(participant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_participant_sessions_session ON participant_sessions(session_id) WHERE deleted_at IS NULL;

-- ============================================
-- TABLE: ATTENDANCE (Présences)
-- ============================================
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  marked_by UUID REFERENCES auth.users(id), -- Qui a marqué la présence
  
  -- Soft delete (pour historique)
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_by UUID REFERENCES auth.users(id),
  
  -- Sync
  version INTEGER DEFAULT 1,
  last_modified_by UUID REFERENCES auth.users(id),
  
  UNIQUE(session_id, participant_id, date)
);

CREATE INDEX idx_attendance_session_date ON attendance(session_id, date) WHERE deleted_at IS NULL;
CREATE INDEX idx_attendance_participant ON attendance(participant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_attendance_date ON attendance(date) WHERE deleted_at IS NULL;

-- ============================================
-- TABLE: SYNC_LOG (Historique des modifications)
-- ============================================
-- Pour tracer toutes les modifications et résoudre les conflits
CREATE TABLE sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Quelle table et quelle ligne
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  
  -- Type d'opération
  operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE', 'RESTORE')),
  
  -- Données avant/après
  old_data JSONB,
  new_data JSONB,
  
  -- Qui et quand
  user_id UUID REFERENCES auth.users(id),
  device_id TEXT, -- Optionnel: identifiant du device
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Sync
  synced_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_sync_log_table_record ON sync_log(table_name, record_id);
CREATE INDEX idx_sync_log_timestamp ON sync_log(timestamp);
CREATE INDEX idx_sync_log_user ON sync_log(user_id);

-- ============================================
-- FUNCTIONS: Triggers pour updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Appliquer aux tables concernées
CREATE TRIGGER update_clubs_updated_at BEFORE UPDATE ON clubs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_participants_updated_at BEFORE UPDATE ON participants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON attendance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- FUNCTIONS: Logging automatique des modifications
-- ============================================
CREATE OR REPLACE FUNCTION log_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    INSERT INTO sync_log (table_name, record_id, operation, old_data, user_id)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', row_to_json(OLD), auth.uid());
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO sync_log (table_name, record_id, operation, old_data, new_data, user_id)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', row_to_json(OLD), row_to_json(NEW), auth.uid());
    RETURN NEW;
  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO sync_log (table_name, record_id, operation, new_data, user_id)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', row_to_json(NEW), auth.uid());
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Appliquer aux tables importantes
CREATE TRIGGER log_clubs_changes AFTER INSERT OR UPDATE OR DELETE ON clubs
  FOR EACH ROW EXECUTE FUNCTION log_changes();

CREATE TRIGGER log_sessions_changes AFTER INSERT OR UPDATE OR DELETE ON sessions
  FOR EACH ROW EXECUTE FUNCTION log_changes();

CREATE TRIGGER log_participants_changes AFTER INSERT OR UPDATE OR DELETE ON participants
  FOR EACH ROW EXECUTE FUNCTION log_changes();

CREATE TRIGGER log_attendance_changes AFTER INSERT OR UPDATE OR DELETE ON attendance
  FOR EACH ROW EXECUTE FUNCTION log_changes();

-- ============================================
-- FUNCTIONS: Soft Delete
-- ============================================
-- Fonction pour soft delete au lieu de hard delete
CREATE OR REPLACE FUNCTION soft_delete_club(club_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE clubs 
  SET deleted_at = NOW(), 
      deleted_by = auth.uid(),
      version = version + 1
  WHERE id = club_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Similaire pour les autres tables
CREATE OR REPLACE FUNCTION soft_delete_session(session_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE sessions 
  SET deleted_at = NOW(), 
      deleted_by = auth.uid(),
      version = version + 1
  WHERE id = session_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION soft_delete_participant(participant_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE participants 
  SET deleted_at = NOW(), 
      deleted_by = auth.uid(),
      version = version + 1
  WHERE id = participant_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTIONS: Restore (annuler une suppression)
-- ============================================
CREATE OR REPLACE FUNCTION restore_club(club_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE clubs 
  SET deleted_at = NULL, 
      deleted_by = NULL,
      version = version + 1,
      last_modified_by = auth.uid()
  WHERE id = club_uuid;
  
  -- Log la restoration
  INSERT INTO sync_log (table_name, record_id, operation, user_id)
  VALUES ('clubs', club_uuid, 'RESTORE', auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTIONS: Génération de code de partage
-- ============================================
CREATE OR REPLACE FUNCTION generate_share_code()
RETURNS TEXT AS $$
DECLARE
  characters TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Sans O, I, 0, 1 pour éviter confusion
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(characters, floor(random() * length(characters) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour générer automatiquement un code de partage unique
CREATE OR REPLACE FUNCTION set_share_code()
RETURNS TRIGGER AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  IF NEW.share_code IS NULL THEN
    LOOP
      new_code := generate_share_code();
      SELECT EXISTS(SELECT 1 FROM clubs WHERE share_code = new_code) INTO code_exists;
      IF NOT code_exists THEN
        EXIT;
      END IF;
    END LOOP;
    NEW.share_code := new_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_club_share_code BEFORE INSERT ON clubs
  FOR EACH ROW EXECUTE FUNCTION set_share_code();

-- ============================================
-- RLS POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

-- ============================================
-- POLICIES: user_profiles
-- ============================================
CREATE POLICY "Users can view their own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================
-- POLICIES: clubs
-- ============================================
-- Les utilisateurs peuvent voir les clubs dont ils sont membres (non supprimés)
CREATE POLICY "Members can view their clubs" ON clubs
  FOR SELECT USING (
    deleted_at IS NULL AND
    EXISTS (
      SELECT 1 FROM club_members
      WHERE club_members.club_id = clubs.id
      AND club_members.user_id = auth.uid()
      AND club_members.deleted_at IS NULL
    )
  );

-- Les utilisateurs peuvent créer des clubs
CREATE POLICY "Users can create clubs" ON clubs
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Les propriétaires et admins peuvent modifier leur club
CREATE POLICY "Owners and admins can update clubs" ON clubs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM club_members
      WHERE club_members.club_id = clubs.id
      AND club_members.user_id = auth.uid()
      AND club_members.role IN ('owner', 'admin')
      AND club_members.can_edit_club = true
      AND club_members.deleted_at IS NULL
    )
  );

-- Soft delete uniquement pour owners
CREATE POLICY "Owners can soft delete clubs" ON clubs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM club_members
      WHERE club_members.club_id = clubs.id
      AND club_members.user_id = auth.uid()
      AND club_members.role = 'owner'
      AND club_members.deleted_at IS NULL
    )
  );

-- ============================================
-- POLICIES: club_members
-- ============================================
CREATE POLICY "Members can view club members" ON club_members
  FOR SELECT USING (
    deleted_at IS NULL AND
    (
      user_id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM club_members cm
        WHERE cm.club_id = club_members.club_id
        AND cm.user_id = auth.uid()
        AND cm.deleted_at IS NULL
      )
    )
  );

-- Les admins peuvent ajouter des membres
CREATE POLICY "Admins can add members" ON club_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM club_members
      WHERE club_members.club_id = club_members.club_id
      AND club_members.user_id = auth.uid()
      AND club_members.can_add_members = true
      AND club_members.deleted_at IS NULL
    )
  );

-- ============================================
-- POLICIES: sessions
-- ============================================
CREATE POLICY "Members can view sessions" ON sessions
  FOR SELECT USING (
    deleted_at IS NULL AND
    EXISTS (
      SELECT 1 FROM club_members
      WHERE club_members.club_id = sessions.club_id
      AND club_members.user_id = auth.uid()
      AND club_members.deleted_at IS NULL
    )
  );

CREATE POLICY "Teachers can manage sessions" ON sessions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM club_members
      WHERE club_members.club_id = sessions.club_id
      AND club_members.user_id = auth.uid()
      AND club_members.can_manage_sessions = true
      AND club_members.deleted_at IS NULL
    )
  );

-- ============================================
-- POLICIES: participants
-- ============================================
CREATE POLICY "Members can view participants" ON participants
  FOR SELECT USING (
    deleted_at IS NULL AND
    EXISTS (
      SELECT 1 FROM club_members
      WHERE club_members.club_id = participants.club_id
      AND club_members.user_id = auth.uid()
      AND club_members.deleted_at IS NULL
    )
  );

CREATE POLICY "Teachers can manage participants" ON participants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM club_members
      WHERE club_members.club_id = participants.club_id
      AND club_members.user_id = auth.uid()
      AND club_members.can_manage_participants = true
      AND club_members.deleted_at IS NULL
    )
  );

-- ============================================
-- POLICIES: participant_sessions
-- ============================================
CREATE POLICY "Members can view participant sessions" ON participant_sessions
  FOR SELECT USING (
    deleted_at IS NULL AND
    EXISTS (
      SELECT 1 FROM club_members cm
      JOIN participants p ON p.id = participant_sessions.participant_id
      WHERE cm.club_id = p.club_id
      AND cm.user_id = auth.uid()
      AND cm.deleted_at IS NULL
    )
  );

CREATE POLICY "Teachers can manage participant sessions" ON participant_sessions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM club_members cm
      JOIN participants p ON p.id = participant_sessions.participant_id
      WHERE cm.club_id = p.club_id
      AND cm.user_id = auth.uid()
      AND cm.can_manage_participants = true
      AND cm.deleted_at IS NULL
    )
  );

-- ============================================
-- POLICIES: attendance
-- ============================================
CREATE POLICY "Members can view attendance" ON attendance
  FOR SELECT USING (
    deleted_at IS NULL AND
    EXISTS (
      SELECT 1 FROM club_members cm
      JOIN sessions s ON s.id = attendance.session_id
      WHERE cm.club_id = s.club_id
      AND cm.user_id = auth.uid()
      AND cm.deleted_at IS NULL
    )
  );

CREATE POLICY "Teachers can mark attendance" ON attendance
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM club_members cm
      JOIN sessions s ON s.id = attendance.session_id
      WHERE cm.club_id = s.club_id
      AND cm.user_id = auth.uid()
      AND cm.can_mark_attendance = true
      AND cm.deleted_at IS NULL
    )
  );

-- ============================================
-- POLICIES: sync_log
-- ============================================
CREATE POLICY "Members can view sync log of their clubs" ON sync_log
  FOR SELECT USING (
    -- Vérifier que l'utilisateur a accès à cette donnée
    CASE table_name
      WHEN 'clubs' THEN EXISTS (
        SELECT 1 FROM club_members
        WHERE club_members.club_id = sync_log.record_id::UUID
        AND club_members.user_id = auth.uid()
      )
      WHEN 'sessions' THEN EXISTS (
        SELECT 1 FROM club_members cm
        JOIN sessions s ON s.club_id = cm.club_id
        WHERE s.id = sync_log.record_id::UUID
        AND cm.user_id = auth.uid()
      )
      ELSE false
    END
  );

-- ============================================
-- FUNCTIONS: Rejoindre un club avec code
-- ============================================
CREATE OR REPLACE FUNCTION join_club_with_code(
  p_share_code TEXT,
  p_password TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_club_id UUID;
  v_club_password TEXT;
BEGIN
  -- Trouver le club
  SELECT id, share_password INTO v_club_id, v_club_password
  FROM clubs
  WHERE share_code = p_share_code
  AND deleted_at IS NULL;
  
  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'Club not found with code: %', p_share_code;
  END IF;
  
  -- Vérifier le mot de passe si nécessaire
  IF v_club_password IS NOT NULL AND v_club_password != p_password THEN
    RAISE EXCEPTION 'Invalid password';
  END IF;
  
  -- Ajouter l'utilisateur au club s'il n'est pas déjà membre
  INSERT INTO club_members (club_id, user_id, role)
  VALUES (v_club_id, auth.uid(), 'teacher')
  ON CONFLICT (club_id, user_id) DO UPDATE
  SET deleted_at = NULL;
  
  RETURN v_club_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTIONS: Obtenir les changements depuis un timestamp
-- ============================================
-- Pour la synchronisation incrémentale
CREATE OR REPLACE FUNCTION get_club_changes_since(
  p_club_id UUID,
  p_since TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '1 hour'
)
RETURNS TABLE (
  table_name TEXT,
  record_id UUID,
  operation TEXT,
  data JSONB,
  changed_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sl.table_name,
    sl.record_id,
    sl.operation,
    COALESCE(sl.new_data, sl.old_data) as data,
    sl.timestamp
  FROM sync_log sl
  WHERE sl.timestamp > p_since
  AND (
    (sl.table_name = 'clubs' AND sl.record_id = p_club_id) OR
    (sl.table_name = 'sessions' AND EXISTS (
      SELECT 1 FROM sessions WHERE id = sl.record_id AND club_id = p_club_id
    )) OR
    (sl.table_name = 'participants' AND EXISTS (
      SELECT 1 FROM participants WHERE id = sl.record_id AND club_id = p_club_id
    )) OR
    (sl.table_name = 'attendance' AND EXISTS (
      SELECT 1 FROM attendance a
      JOIN sessions s ON s.id = a.session_id
      WHERE a.id = sl.record_id AND s.club_id = p_club_id
    ))
  )
  ORDER BY sl.timestamp ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- VIEWS: Vues utiles
-- ============================================

-- Vue pour les clubs actifs
CREATE VIEW active_clubs AS
SELECT * FROM clubs WHERE deleted_at IS NULL;

-- Vue pour les sessions actives
CREATE VIEW active_sessions AS
SELECT * FROM sessions WHERE deleted_at IS NULL;

-- Vue pour les participants actifs
CREATE VIEW active_participants AS
SELECT * FROM participants WHERE deleted_at IS NULL;

-- ============================================
-- INDEXES supplémentaires pour performance
-- ============================================
CREATE INDEX idx_sync_log_club_changes ON sync_log(timestamp)
  WHERE table_name IN ('clubs', 'sessions', 'participants', 'attendance');

-- ============================================
-- GRANTS (permissions)
-- ============================================
-- Les utilisateurs authentifiés peuvent utiliser les fonctions
GRANT EXECUTE ON FUNCTION join_club_with_code TO authenticated;
GRANT EXECUTE ON FUNCTION get_club_changes_since TO authenticated;
GRANT EXECUTE ON FUNCTION soft_delete_club TO authenticated;
GRANT EXECUTE ON FUNCTION soft_delete_session TO authenticated;
GRANT EXECUTE ON FUNCTION soft_delete_participant TO authenticated;
GRANT EXECUTE ON FUNCTION restore_club TO authenticated;

-- ============================================
-- DONE!
-- ============================================
-- Ce schéma permet:
-- 1. Synchronisation multi-device via sync_log et timestamps
-- 2. Soft delete pour éviter les pertes de données
-- 3. Historique complet des modifications
-- 4. Gestion des conflits avec version numbers
-- 5. Partage sécurisé via codes
-- 6. Permissions granulaires par rôle
-- ============================================
