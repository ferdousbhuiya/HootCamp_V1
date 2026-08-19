-- Skills Pathfinder persistence expansion
-- Apply after the original migration.sql.
-- This migration preserves every important derived result so it can be
-- retrieved later for dashboards, reports, career advice, and auditing.

ALTER TYPE public.skill_source ADD VALUE IF NOT EXISTS 'certificate_extracted';

ALTER TABLE public.saved_certifications
  ADD COLUMN IF NOT EXISTS holder_name text,
  ADD COLUMN IF NOT EXISTS issued_at date,
  ADD COLUMN IF NOT EXISTS expires_at date,
  ADD COLUMN IF NOT EXISTS extracted_skills jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS verification_method text,
  ADD COLUMN IF NOT EXISTS verification_message text,
  ADD COLUMN IF NOT EXISTS verification_evidence jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS verified_url text,
  ADD COLUMN IF NOT EXISTS raw_extraction jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS client_record_key text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.skill_tracking
  ADD COLUMN IF NOT EXISTS confidence numeric,
  ADD COLUMN IF NOT EXISTS evidence text,
  ADD COLUMN IF NOT EXISTS source_record_id uuid,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.resume_analyses ADD COLUMN IF NOT EXISTS client_record_key text;
ALTER TABLE public.ongoing_courses ADD COLUMN IF NOT EXISTS client_record_key text;

CREATE TABLE IF NOT EXISTS public.career_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  source_analysis_id uuid REFERENCES public.resume_analyses (id) ON DELETE SET NULL,
  career_id text,
  career_title text,
  category text,
  match_score numeric,
  match_percentage numeric,
  skill_gap_percentage numeric,
  matched_skills jsonb DEFAULT '[]'::jsonb,
  missing_skills jsonb DEFAULT '[]'::jsonb,
  recommendation_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  market_data jsonb DEFAULT '{}'::jsonb,
  client_record_key text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.learning_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  target_career_id text,
  target_career_title text,
  plan_30_days jsonb DEFAULT '{}'::jsonb,
  plan_6_months jsonb DEFAULT '{}'::jsonb,
  plan_1_year jsonb DEFAULT '{}'::jsonb,
  recommended_skills jsonb DEFAULT '[]'::jsonb,
  recommended_courses jsonb DEFAULT '[]'::jsonb,
  recommended_certifications jsonb DEFAULT '[]'::jsonb,
  ongoing_course_alignment jsonb DEFAULT '[]'::jsonb,
  plan_data jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.career_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  report_type text DEFAULT 'career_intelligence',
  report_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  profile_snapshot jsonb DEFAULT '{}'::jsonb,
  skills_snapshot jsonb DEFAULT '[]'::jsonb,
  certifications_snapshot jsonb DEFAULT '[]'::jsonb,
  courses_snapshot jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_career_recommendations_user_id ON public.career_recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_plans_user_id ON public.learning_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_career_reports_user_id ON public.career_reports(user_id);
-- PostgreSQL unique indexes allow multiple NULL values, so these can be used
-- directly by Supabase upsert(onConflict: 'user_id,client_record_key').
CREATE UNIQUE INDEX IF NOT EXISTS uq_resume_client_record ON public.resume_analyses(user_id, client_record_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cert_client_record ON public.saved_certifications(user_id, client_record_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_course_client_record ON public.ongoing_courses(user_id, client_record_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_career_rec_client_record ON public.career_recommendations(user_id, client_record_key);

ALTER TABLE public.career_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "career_recs_select_own" ON public.career_recommendations;
CREATE POLICY "career_recs_select_own" ON public.career_recommendations FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "career_recs_insert_own" ON public.career_recommendations;
CREATE POLICY "career_recs_insert_own" ON public.career_recommendations FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "career_recs_update_own" ON public.career_recommendations;
CREATE POLICY "career_recs_update_own" ON public.career_recommendations FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "career_recs_delete_own" ON public.career_recommendations;
CREATE POLICY "career_recs_delete_own" ON public.career_recommendations FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "learning_plans_select_own" ON public.learning_plans;
CREATE POLICY "learning_plans_select_own" ON public.learning_plans FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "learning_plans_insert_own" ON public.learning_plans;
CREATE POLICY "learning_plans_insert_own" ON public.learning_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "learning_plans_update_own" ON public.learning_plans;
CREATE POLICY "learning_plans_update_own" ON public.learning_plans FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "learning_plans_delete_own" ON public.learning_plans;
CREATE POLICY "learning_plans_delete_own" ON public.learning_plans FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "career_reports_select_own" ON public.career_reports;
CREATE POLICY "career_reports_select_own" ON public.career_reports FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "career_reports_insert_own" ON public.career_reports;
CREATE POLICY "career_reports_insert_own" ON public.career_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "career_reports_update_own" ON public.career_reports;
CREATE POLICY "career_reports_update_own" ON public.career_reports FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "career_reports_delete_own" ON public.career_reports;
CREATE POLICY "career_reports_delete_own" ON public.career_reports FOR DELETE USING (auth.uid() = user_id);
