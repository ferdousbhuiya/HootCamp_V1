-- Skills Pathfinder academic pathway expansion
-- Apply after 20260819_persistence.sql and 20260819_document_storage.sql.
-- Adds resume-optional academic evidence, subject/credit history, and target careers.

ALTER TABLE public.ongoing_courses
  ADD COLUMN IF NOT EXISTS subject_area text,
  ADD COLUMN IF NOT EXISTS credit_hours numeric,
  ADD COLUMN IF NOT EXISTS semester text,
  ADD COLUMN IF NOT EXISTS institution text;

ALTER TABLE public.saved_certifications
  ADD COLUMN IF NOT EXISTS subjects jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS credit_hours numeric,
  ADD COLUMN IF NOT EXISTS credential_type text;

CREATE TABLE IF NOT EXISTS public.academic_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  institution text,
  program_name text,
  field_of_study text,
  degree_level text,
  academic_status text DEFAULT 'enrolled',
  credits_earned numeric DEFAULT 0,
  credits_in_progress numeric DEFAULT 0,
  expected_graduation_date date,
  gpa numeric,
  interests jsonb DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.academic_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_name text NOT NULL,
  subject_code text,
  subject_area text,
  credit_hours numeric DEFAULT 0,
  grade text,
  semester text,
  institution text,
  status text DEFAULT 'completed',
  skills_learned jsonb DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.career_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  career_id text,
  career_title text NOT NULL,
  goal_type text DEFAULT 'primary',
  target_date date,
  motivation text,
  status text DEFAULT 'active',
  source text DEFAULT 'student_selected',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_academic_subjects_user ON public.academic_subjects(user_id);
CREATE INDEX IF NOT EXISTS idx_academic_subjects_status ON public.academic_subjects(user_id, status);
CREATE INDEX IF NOT EXISTS idx_career_goals_user ON public.career_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_career_goals_status ON public.career_goals(user_id, status);

ALTER TABLE public.academic_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "academic_profiles_select_own" ON public.academic_profiles;
CREATE POLICY "academic_profiles_select_own" ON public.academic_profiles FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "academic_profiles_insert_own" ON public.academic_profiles;
CREATE POLICY "academic_profiles_insert_own" ON public.academic_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "academic_profiles_update_own" ON public.academic_profiles;
CREATE POLICY "academic_profiles_update_own" ON public.academic_profiles FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "academic_profiles_delete_own" ON public.academic_profiles;
CREATE POLICY "academic_profiles_delete_own" ON public.academic_profiles FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "academic_subjects_select_own" ON public.academic_subjects;
CREATE POLICY "academic_subjects_select_own" ON public.academic_subjects FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "academic_subjects_insert_own" ON public.academic_subjects;
CREATE POLICY "academic_subjects_insert_own" ON public.academic_subjects FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "academic_subjects_update_own" ON public.academic_subjects;
CREATE POLICY "academic_subjects_update_own" ON public.academic_subjects FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "academic_subjects_delete_own" ON public.academic_subjects;
CREATE POLICY "academic_subjects_delete_own" ON public.academic_subjects FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "career_goals_select_own" ON public.career_goals;
CREATE POLICY "career_goals_select_own" ON public.career_goals FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "career_goals_insert_own" ON public.career_goals;
CREATE POLICY "career_goals_insert_own" ON public.career_goals FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "career_goals_update_own" ON public.career_goals;
CREATE POLICY "career_goals_update_own" ON public.career_goals FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "career_goals_delete_own" ON public.career_goals;
CREATE POLICY "career_goals_delete_own" ON public.career_goals FOR DELETE USING (auth.uid() = user_id);
