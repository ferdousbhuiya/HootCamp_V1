-- Skills Pathfinder persistence expansion
-- Date: 2026-08-19
-- Purpose: preserve extracted evidence, verification details, recommendations,
-- learning plans, market findings, reports, and advisor outputs for later use.

-- Resume analysis -----------------------------------------------------------
ALTER TABLE public.resume_analyses
  ADD COLUMN IF NOT EXISTS client_record_key text,
  ADD COLUMN IF NOT EXISTS ai_failed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS extraction_status text,
  ADD COLUMN IF NOT EXISTS document_type text,
  ADD COLUMN IF NOT EXISTS raw_analysis jsonb DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_resume_client_record_key
  ON public.resume_analyses (user_id, client_record_key)
  WHERE client_record_key IS NOT NULL;

-- Unified skill profile -----------------------------------------------------
ALTER TABLE public.skill_tracking
  ADD COLUMN IF NOT EXISTS confidence numeric,
  ADD COLUMN IF NOT EXISTS evidence text,
  ADD COLUMN IF NOT EXISTS source_record_id uuid,
  ADD COLUMN IF NOT EXISTS source_details jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now();

-- Certificate extraction + verification -----------------------------------
ALTER TABLE public.saved_certifications
  ADD COLUMN IF NOT EXISTS client_record_key text,
  ADD COLUMN IF NOT EXISTS holder_name text,
  ADD COLUMN IF NOT EXISTS issued_at text,
  ADD COLUMN IF NOT EXISTS expires_at text,
  ADD COLUMN IF NOT EXISTS extracted_skills jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS verification_method text,
  ADD COLUMN IF NOT EXISTS verification_provider text,
  ADD COLUMN IF NOT EXISTS verification_message text,
  ADD COLUMN IF NOT EXISTS verification_evidence jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS verified_url text,
  ADD COLUMN IF NOT EXISTS raw_extraction jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_cert_client_record_key
  ON public.saved_certifications (user_id, client_record_key)
  WHERE client_record_key IS NOT NULL;

-- Ongoing course progress ---------------------------------------------------
ALTER TABLE public.ongoing_courses
  ADD COLUMN IF NOT EXISTS client_record_key text,
  ADD COLUMN IF NOT EXISTS course_url text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS extracted_skills jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_course_client_record_key
  ON public.ongoing_courses (user_id, client_record_key)
  WHERE client_record_key IS NOT NULL;

-- Durable recommendation snapshots ----------------------------------------
CREATE TABLE IF NOT EXISTS public.career_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  client_record_key text,
  source_analysis_id uuid REFERENCES public.resume_analyses (id) ON DELETE SET NULL,
  career_id text,
  career_title text NOT NULL,
  category text,
  match_score numeric,
  match_percentage numeric,
  skill_gap_percentage numeric,
  matched_skills jsonb DEFAULT '[]'::jsonb,
  missing_skills jsonb DEFAULT '[]'::jsonb,
  recommendation_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  market_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_career_recommendations_user_id
  ON public.career_recommendations (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_career_rec_client_record_key
  ON public.career_recommendations (user_id, client_record_key)
  WHERE client_record_key IS NOT NULL;

-- Generic durable findings store -------------------------------------------
-- This stores future outputs that do not belong naturally in the source
-- tables: market lookups, skill-gap snapshots, course alignment, 30-day,
-- 6-month and 1-year plans, generated reports, and AI advisor snapshots.
CREATE TABLE IF NOT EXISTS public.career_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  client_record_key text,
  finding_type text NOT NULL,
  source_type text,
  source_id uuid,
  title text,
  status text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_career_findings_user_id
  ON public.career_findings (user_id);
CREATE INDEX IF NOT EXISTS idx_career_findings_type
  ON public.career_findings (user_id, finding_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_career_findings_client_record_key
  ON public.career_findings (user_id, client_record_key)
  WHERE client_record_key IS NOT NULL;

-- RLS ----------------------------------------------------------------------
ALTER TABLE public.career_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "career_recommendations_select_own" ON public.career_recommendations;
CREATE POLICY "career_recommendations_select_own" ON public.career_recommendations
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "career_recommendations_insert_own" ON public.career_recommendations;
CREATE POLICY "career_recommendations_insert_own" ON public.career_recommendations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "career_recommendations_update_own" ON public.career_recommendations;
CREATE POLICY "career_recommendations_update_own" ON public.career_recommendations
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "career_recommendations_delete_own" ON public.career_recommendations;
CREATE POLICY "career_recommendations_delete_own" ON public.career_recommendations
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "career_findings_select_own" ON public.career_findings;
CREATE POLICY "career_findings_select_own" ON public.career_findings
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "career_findings_insert_own" ON public.career_findings;
CREATE POLICY "career_findings_insert_own" ON public.career_findings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "career_findings_update_own" ON public.career_findings;
CREATE POLICY "career_findings_update_own" ON public.career_findings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "career_findings_delete_own" ON public.career_findings;
CREATE POLICY "career_findings_delete_own" ON public.career_findings
  FOR DELETE USING (auth.uid() = user_id);

-- Updated timestamps --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_skill_tracking_updated_at ON public.skill_tracking;
CREATE TRIGGER set_skill_tracking_updated_at
BEFORE UPDATE ON public.skill_tracking
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_saved_certifications_updated_at ON public.saved_certifications;
CREATE TRIGGER set_saved_certifications_updated_at
BEFORE UPDATE ON public.saved_certifications
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_ongoing_courses_updated_at ON public.ongoing_courses;
CREATE TRIGGER set_ongoing_courses_updated_at
BEFORE UPDATE ON public.ongoing_courses
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_career_recommendations_updated_at ON public.career_recommendations;
CREATE TRIGGER set_career_recommendations_updated_at
BEFORE UPDATE ON public.career_recommendations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_career_findings_updated_at ON public.career_findings;
CREATE TRIGGER set_career_findings_updated_at
BEFORE UPDATE ON public.career_findings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
