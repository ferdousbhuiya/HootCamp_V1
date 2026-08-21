-- Skills Pathfinder: clarify academic evidence model.
-- Completed education is stored separately from the current academic program.
-- Existing tables/data remain intact.

CREATE TABLE IF NOT EXISTS public.education_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  institution text,
  program_name text,
  field_of_study text,
  degree_level text,
  completion_date date,
  credits_earned numeric DEFAULT 0,
  gpa numeric,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_education_history_user_id
  ON public.education_history(user_id);

ALTER TABLE public.education_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "education_history_select_own" ON public.education_history;
CREATE POLICY "education_history_select_own" ON public.education_history
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "education_history_insert_own" ON public.education_history;
CREATE POLICY "education_history_insert_own" ON public.education_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "education_history_update_own" ON public.education_history;
CREATE POLICY "education_history_update_own" ON public.education_history
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "education_history_delete_own" ON public.education_history;
CREATE POLICY "education_history_delete_own" ON public.education_history
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE public.education_history IS
  'Completed degrees/programs only. Current education remains in academic_profiles; current courses remain in ongoing_courses.';
