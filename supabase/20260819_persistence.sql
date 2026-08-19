-- Skills Pathfinder persistence expansion
-- Apply after the original migration.sql.
-- This migration preserves important derived results so they can be retrieved
-- later for dashboards, reports, career advice, market snapshots, and auditing.

ALTER TYPE public.skill_source ADD VALUE IF NOT EXISTS 'certificate_extracted';

ALTER TABLE public.saved_certifications
  ADD COLUMN IF NOT EXISTS holder_name text,
  ADD COLUMN IF NOT EXISTS issued_at date,
  ADD COLUMN IF NOT EXISTS expires_at date,
  ADD COLUMN IF NOT EXISTS extracted_skills jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS verification_method text,
  ADD COLUMN IF NOT EXISTS verification_provider text,
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
  ADD COLUMN IF NOT EXISTS source_details jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now();

ALTER TABLE public.resume_analyses
  ADD COLUMN IF NOT EXISTS client_record_key text,
  ADD COLUMN IF NOT EXISTS ai_failed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS extraction_status text,
  ADD COLUMN IF NOT EXISTS document_type text,
  ADD COLUMN IF NOT EXISTS raw_analysis jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.ongoing_courses
  ADD COLUMN IF NOT EXISTS client_record_key text,
  ADD COLUMN IF NOT EXISTS course_url text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS extracted_skills jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

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
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
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

-- Generic durable findings store for current/future derived information that
-- should never exist only in browser state: onboarding drafts, skill-gap
-- snapshots, course alignment, job-market examples, salary lookups, advisor
-- outputs, etc.
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

CREATE INDEX IF NOT EXISTS idx_career_recommendations_user_id ON public.career_recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_plans_user_id ON public.learning_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_career_reports_user_id ON public.career_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_career_findings_user_id ON public.career_findings(user_id);
CREATE INDEX IF NOT EXISTS idx_career_findings_type ON public.career_findings(user_id, finding_type);

CREATE UNIQUE INDEX IF NOT EXISTS uq_resume_client_record ON public.resume_analyses(user_id, client_record_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cert_client_record ON public.saved_certifications(user_id, client_record_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_course_client_record ON public.ongoing_courses(user_id, client_record_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_career_rec_client_record ON public.career_recommendations(user_id, client_record_key);

-- A non-partial unique index is intentional here. PostgreSQL still permits
-- multiple NULL client_record_key values, while Supabase/PostgREST can infer
-- this index for ON CONFLICT (user_id, client_record_key) upserts.
DROP INDEX IF EXISTS public.uq_career_findings_client_record;
CREATE UNIQUE INDEX uq_career_findings_client_record ON public.career_findings(user_id, client_record_key);

ALTER TABLE public.career_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_findings ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "career_findings_select_own" ON public.career_findings;
CREATE POLICY "career_findings_select_own" ON public.career_findings FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "career_findings_insert_own" ON public.career_findings;
CREATE POLICY "career_findings_insert_own" ON public.career_findings FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "career_findings_update_own" ON public.career_findings;
CREATE POLICY "career_findings_update_own" ON public.career_findings FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "career_findings_delete_own" ON public.career_findings;
CREATE POLICY "career_findings_delete_own" ON public.career_findings FOR DELETE USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Certificate provenance integrity
-- ---------------------------------------------------------------------------
-- Skills can have several evidence sources recorded in metadata.sources. These
-- helpers guarantee that certificate verification/deletion keeps the displayed
-- source and verification state consistent, even when the UI changes later.

CREATE OR REPLACE FUNCTION public.skill_source_rank(status_text text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE status_text
    WHEN 'certificate_verified' THEN 40
    WHEN 'ai_verified' THEN 30
    WHEN 'certificate_extracted_unverified' THEN 20
    WHEN 'in_progress' THEN 15
    WHEN 'self_reported' THEN 10
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.promote_verified_certificate_skill_sources()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  skill_row record;
  source_item jsonb;
  rebuilt_sources jsonb;
  best_source jsonb;
BEGIN
  IF NOT NEW.is_verified OR COALESCE(OLD.is_verified, false) = true THEN
    RETURN NEW;
  END IF;

  FOR skill_row IN
    SELECT *
    FROM public.skill_tracking
    WHERE user_id = NEW.user_id
      AND (
        source_record_id = NEW.id
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(metadata -> 'sources', '[]'::jsonb)) AS s
          WHERE s ->> 'source_record_id' = NEW.id::text
        )
      )
  LOOP
    rebuilt_sources := '[]'::jsonb;

    IF jsonb_array_length(COALESCE(skill_row.metadata -> 'sources', '[]'::jsonb)) > 0 THEN
      SELECT COALESCE(jsonb_agg(
        CASE
          WHEN item ->> 'source_record_id' = NEW.id::text THEN
            jsonb_set(
              jsonb_set(item, '{source}', '"certificate_verified"'::jsonb, true),
              '{verification_status}', '"certificate_verified"'::jsonb, true
            )
          ELSE item
        END
      ), '[]'::jsonb)
      INTO rebuilt_sources
      FROM jsonb_array_elements(skill_row.metadata -> 'sources') AS item;
    ELSE
      rebuilt_sources := jsonb_build_array(jsonb_build_object(
        'source', 'certificate_verified',
        'source_record_id', NEW.id,
        'verification_status', 'certificate_verified',
        'evidence', COALESCE(skill_row.evidence, 'Certificate: ' || COALESCE(NEW.certification_name, 'credential'))
      ));
    END IF;

    SELECT item
    INTO best_source
    FROM jsonb_array_elements(rebuilt_sources) AS item
    ORDER BY public.skill_source_rank(item ->> 'verification_status') DESC
    LIMIT 1;

    UPDATE public.skill_tracking
    SET source = COALESCE((best_source ->> 'source')::public.skill_source, source),
        verification_status = COALESCE(best_source ->> 'verification_status', verification_status),
        source_record_id = COALESCE(NULLIF(best_source ->> 'source_record_id', '')::uuid, source_record_id),
        evidence = COALESCE(best_source ->> 'evidence', evidence),
        metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{sources}', rebuilt_sources, true),
        last_seen_at = now(),
        updated_at = now()
    WHERE id = skill_row.id;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_certificate_verified_skill_sources ON public.saved_certifications;
CREATE TRIGGER trg_certificate_verified_skill_sources
AFTER UPDATE OF is_verified ON public.saved_certifications
FOR EACH ROW
WHEN (NEW.is_verified = true AND OLD.is_verified IS DISTINCT FROM true)
EXECUTE FUNCTION public.promote_verified_certificate_skill_sources();

CREATE OR REPLACE FUNCTION public.remove_deleted_certificate_skill_sources()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  skill_row record;
  remaining_sources jsonb;
  best_source jsonb;
BEGIN
  FOR skill_row IN
    SELECT *
    FROM public.skill_tracking
    WHERE user_id = OLD.user_id
      AND (
        source_record_id = OLD.id
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(metadata -> 'sources', '[]'::jsonb)) AS s
          WHERE s ->> 'source_record_id' = OLD.id::text
        )
      )
  LOOP
    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
    INTO remaining_sources
    FROM jsonb_array_elements(COALESCE(skill_row.metadata -> 'sources', '[]'::jsonb)) AS item
    WHERE item ->> 'source_record_id' IS DISTINCT FROM OLD.id::text;

    IF jsonb_array_length(remaining_sources) = 0 THEN
      DELETE FROM public.skill_tracking WHERE id = skill_row.id;
    ELSE
      SELECT item
      INTO best_source
      FROM jsonb_array_elements(remaining_sources) AS item
      ORDER BY public.skill_source_rank(item ->> 'verification_status') DESC
      LIMIT 1;

      UPDATE public.skill_tracking
      SET source = COALESCE((best_source ->> 'source')::public.skill_source, source),
          verification_status = COALESCE(best_source ->> 'verification_status', verification_status),
          source_record_id = NULLIF(best_source ->> 'source_record_id', '')::uuid,
          evidence = best_source ->> 'evidence',
          metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{sources}', remaining_sources, true),
          last_seen_at = now(),
          updated_at = now()
      WHERE id = skill_row.id;
    END IF;
  END LOOP;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_certificate_deleted_skill_sources ON public.saved_certifications;
CREATE TRIGGER trg_certificate_deleted_skill_sources
AFTER DELETE ON public.saved_certifications
FOR EACH ROW
EXECUTE FUNCTION public.remove_deleted_certificate_skill_sources();
