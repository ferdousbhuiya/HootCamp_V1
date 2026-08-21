-- Skills Pathfinder unified evidence expansion
-- Adds richer ongoing-course evidence without changing existing rows or RLS.

ALTER TABLE public.ongoing_courses
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS topics jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS target_career text,
  ADD COLUMN IF NOT EXISTS aligned_competencies jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS potential_skill_gaps_addressed jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS academic_preparation_addressed jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS alignment_summary text,
  ADD COLUMN IF NOT EXISTS alignment_level text,
  ADD COLUMN IF NOT EXISTS alignment_data jsonb DEFAULT '{}'::jsonb;

-- Keep existing ownership model. If the table was created by an older migration,
-- make sure deletion of the Auth user removes this evidence row automatically.
DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND t.relname = 'ongoing_courses'
      AND c.confrelid = 'auth.users'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.ongoing_courses DROP CONSTRAINT %I', fk.conname);
  END LOOP;

  ALTER TABLE public.ongoing_courses
    ADD CONSTRAINT ongoing_courses_auth_user_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_ongoing_courses_target_career
  ON public.ongoing_courses(user_id, target_career);
