-- ============================================================
-- Skills Pathfinder — Supabase schema + Row Level Security
-- For self-hosted Supabase (Hetzner / Coolify)
-- Run in the Supabase SQL Editor (Database → SQL) once.
-- Assumes GoTrue auth schema (users) is already provisioned.
-- ============================================================

-- ---------- 1. ENUMS ----------
CREATE TYPE public.skill_source AS ENUM (
  'resume_extracted',
  'certificate_verified',
  'self_reported',
  'ongoing_course'
);

-- ---------- 2. TABLES ----------

-- 2.1 profiles: mirrors the auth user. id = auth.uid().
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name text,
  phone text,
  address text,
  city text,
  state text,
  zip_code text,
  updated_at timestamptz DEFAULT now(),
  has_completed_onboarding boolean DEFAULT false
);

-- 2.2 resume_analyses: one row per analyzed resume (App.jsx inserts filename, chars, skills, explanation, recs)
CREATE TABLE IF NOT EXISTS public.resume_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  filename text,
  character_count integer,
  skills_count integer,
  extracted_skills jsonb,
  explanations jsonb,
  recommendations jsonb,
  uploaded_at timestamptz DEFAULT now()
);

-- 2.3 skill_tracking: tiered skills (AI-extracted / certificate-verified / self-reported / in-progress)
CREATE TABLE IF NOT EXISTS public.skill_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  skill_name text NOT NULL,
  category text,
  proficiency_level text DEFAULT 'beginner',
  status text,
  source public.skill_source,
  verification_status text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2.4 saved_certifications: original schema columns + the `source` column OnboardingWizard writes
CREATE TABLE IF NOT EXISTS public.saved_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  certification_name text,
  provider text,
  credential_id text,
  verification_url text,
  certificate_file_url text,
  is_verified boolean DEFAULT false,
  verified_at timestamptz,
  verification_status text,
  status text,
  source text,
  created_at timestamptz DEFAULT now()
);

-- 2.5 ongoing_courses
CREATE TABLE IF NOT EXISTS public.ongoing_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  course_name text NOT NULL,
  provider text,
  expected_completion_date date,
  status text DEFAULT 'in_progress',
  created_at timestamptz DEFAULT now()
);

-- ---------- 3. INDEXES ----------
CREATE INDEX IF NOT EXISTS idx_resume_analyses_user_id   ON public.resume_analyses (user_id);
CREATE INDEX IF NOT EXISTS idx_skill_tracking_user_id    ON public.skill_tracking (user_id);
CREATE INDEX IF NOT EXISTS idx_certs_user_id             ON public.saved_certifications (user_id);
CREATE INDEX IF NOT EXISTS idx_courses_user_id           ON public.ongoing_courses (user_id);

-- ---------- 4. ROW LEVEL SECURITY ----------
ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_analyses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_tracking       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ongoing_courses      ENABLE ROW LEVEL SECURITY;

-- profiles: user owns their own row
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- resume_analyses: owner only
DROP POLICY IF EXISTS "resume_select_own" ON public.resume_analyses;
CREATE POLICY "resume_select_own" ON public.resume_analyses FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "resume_insert_own" ON public.resume_analyses;
CREATE POLICY "resume_insert_own" ON public.resume_analyses FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "resume_update_own" ON public.resume_analyses FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "resume_delete_own" ON public.resume_analyses FOR DELETE USING (auth.uid() = user_id);

-- skill_tracking: owner only
DROP POLICY IF EXISTS "skill_select_own" ON public.skill_tracking;
CREATE POLICY "skill_select_own" ON public.skill_tracking FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "skill_insert_own" ON public.skill_tracking;
CREATE POLICY "skill_insert_own" ON public.skill_tracking FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "skill_update_own" ON public.skill_tracking FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "skill_delete_own" ON public.skill_tracking FOR DELETE USING (auth.uid() = user_id);

-- saved_certifications: owner only
DROP POLICY IF EXISTS "certs_select_own" ON public.saved_certifications;
CREATE POLICY "certs_select_own" ON public.saved_certifications FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "certs_insert_own" ON public.saved_certifications;
CREATE POLICY "certs_insert_own" ON public.saved_certifications FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "certs_update_own" ON public.saved_certifications FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "certs_delete_own" ON public.saved_certifications FOR DELETE USING (auth.uid() = user_id);

-- ongoing_courses: owner only
DROP POLICY IF EXISTS "courses_select_own" ON public.ongoing_courses;
CREATE POLICY "courses_select_own" ON public.ongoing_courses FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "courses_insert_own" ON public.ongoing_courses;
CREATE POLICY "courses_insert_own" ON public.ongoing_courses FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "courses_update_own" ON public.ongoing_courses FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "courses_delete_own" ON public.ongoing_courses FOR DELETE USING (auth.uid() = user_id);

-- ---------- 5. NEW-USER TRIGGER: create a profiles row when auth.users row appears ----------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, updated_at)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data ->> 'full_name', ''),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- Re-create trigger idempotently (first install only; comment out on subsequent runs if it already exists)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();