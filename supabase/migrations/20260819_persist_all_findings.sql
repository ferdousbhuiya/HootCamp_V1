-- Skills Pathfinder persistence expansion
-- Date: 2026-08-19
-- Purpose: preserve extracted evidence, verification details, recommendations,
-- learning plans, market findings, reports, and advisor outputs for later use.

-- Existing table enrichment -------------------------------------------------
ALTER TABLE public.resume_analyses
  ADD COLUMN IF NOT EXISTS ai_failed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS extraction_status text,
  ADD COLUMN IF NOT EXISTS document_type text,
  ADD COLUMN IF NOT EXISTS raw_analysis jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.skill_tracking
  ADD COLUMN IF NOT EXISTS confidence numeric,
  ADD COLUMN IF NOT EXISTS evidence jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source_details jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now();

ALTER TABLE public.saved_certifications
  ADD COLUMN IF NOT EXISTS holder_name text,
  ADD COLUMN IF NOT EXISTS issue_date text,
  ADD COLUMN IF NOT EXISTS expiration_date text,
  ADD COLUMN IF NOT EXISTS certificate_skills jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS verification_method text,
  ADD COLUMN IF NOT EXISTS verification_provider text,
  ADD COLUMN IF NOT EXISTS verification_message text,
  ADD COLUMN IF NOT EXISTS verification_evidence jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS verified_url text,
  ADD COLUMN IF NOT EXISTS extraction_data jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.ongoing_courses
  ADD COLUMN IF NOT EXISTS course_url text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS extracted_skills jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Generic durable findings store -------------------------------------------
CREATE TABLE IF NOT EXISTS public.career_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
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

ALTER TABLE public.career_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "career_findings_select_own" ON public.career_findings;
CREATE POLICY "career_findings_select_own"
  ON public.career_findings FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "career_findings_insert_own" ON public.career_findings;
CREATE POLICY "career_findings_insert_own"
  ON public.career_findings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "career_findings_update_own" ON public.career_findings;
CREATE POLICY "career_findings_update_own"
  ON public.career_findings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "career_findings_delete_own" ON public.career_findings;
CREATE POLICY "career_findings_delete_own"
  ON public.career_findings FOR DELETE
  USING (auth.uid() = user_id);

-- Helper timestamps ---------------------------------------------------------
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

DROP TRIGGER IF EXISTS set_career_findings_updated_at ON public.career_findings;
CREATE TRIGGER set_career_findings_updated_at
BEFORE UPDATE ON public.career_findings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
