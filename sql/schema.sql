-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.attendance (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL,
  session_id uuid NOT NULL,
  date date NOT NULL,
  present boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT attendance_pkey PRIMARY KEY (id),
  CONSTRAINT attendance_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.participants(id)
);
CREATE TABLE public.club_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  club_id uuid,
  user_id uuid,
  joined_at timestamp with time zone DEFAULT now(),
  CONSTRAINT club_members_pkey PRIMARY KEY (id),
  CONSTRAINT club_members_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id),
  CONSTRAINT club_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.clubs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  owner_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  share_code character varying UNIQUE,
  CONSTRAINT clubs_pkey PRIMARY KEY (id),
  CONSTRAINT clubs_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.user_profiles(id)
);
CREATE TABLE public.participant_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL,
  session_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT participant_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT participant_sessions_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.participants(id)
);
CREATE TABLE public.participants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  is_long_term_sick boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT participants_pkey PRIMARY KEY (id),
  CONSTRAINT participants_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id)
);
CREATE TABLE public.sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  day_of_week text NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT sessions_pkey PRIMARY KEY (id),
  CONSTRAINT sessions_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id)
);
CREATE TABLE public.user_profiles (
  id uuid NOT NULL,
  email text NOT NULL,
  display_name text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);