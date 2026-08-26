-- Skills Pathfinder: reset all current student data and enforce future auth-user cleanup.
-- SAFE FOR SCHEMA: this script keeps tables, columns, indexes, RLS policies, functions,
-- and buckets intact. It deletes only current rows/files, then repairs user FKs so
-- deleting auth.users cascades to all public user-owned data.
--
-- IMPORTANT: Running this script deletes ALL current Skills Pathfinder student data
-- and all stored resume/certificate objects in the two private student buckets.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Remove current stored student documents, but keep storage buckets/policies.
-- ---------------------------------------------------------------------------
DELETE FROM storage.objects
WHERE bucket_id IN ('student-resumes', 'student-certificates');

-- ---------------------------------------------------------------------------
-- 2. Remove current application rows. Child/derived tables first.
-- ---------------------------------------------------------------------------
DELETE FROM public.career_findings;
DELETE FROM public.career_reports;
DELETE FROM public.learning_plans;
DELETE FROM public.career_recommendations;
DELETE FROM public.ongoing_courses;
DELETE FROM public.saved_certifications;
DELETE FROM public.skill_tracking;
DELETE FROM public.resume_analyses;
DELETE FROM public.career_goals;
DELETE FROM public.academic_subjects;
DELETE FROM public.academic_profiles;
DELETE FROM public.profiles;

-- ---------------------------------------------------------------------------
-- 3. Repair every user-owned public-table FK to auth.users ON DELETE CASCADE.
--    We remove any existing auth.users FK for each listed table/column first so
--    this remains safe even if an older migration used a different constraint name.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  item record;
  fk record;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('profiles',               'id',      'profiles_auth_user_fkey'),
      ('resume_analyses',        'user_id', 'resume_analyses_auth_user_fkey'),
      ('skill_tracking',         'user_id', 'skill_tracking_auth_user_fkey'),
      ('saved_certifications',   'user_id', 'saved_certifications_auth_user_fkey'),
      ('ongoing_courses',        'user_id', 'ongoing_courses_auth_user_fkey'),
      ('career_recommendations', 'user_id', 'career_recommendations_auth_user_fkey'),
      ('learning_plans',         'user_id', 'learning_plans_auth_user_fkey'),
      ('career_reports',         'user_id', 'career_reports_auth_user_fkey'),
      ('career_findings',        'user_id', 'career_findings_auth_user_fkey'),
      ('academic_profiles',      'user_id', 'academic_profiles_auth_user_fkey'),
      ('academic_subjects',      'user_id', 'academic_subjects_auth_user_fkey'),
      ('career_goals',           'user_id', 'career_goals_auth_user_fkey')
    ) AS v(table_name, column_name, constraint_name)
  LOOP
    IF to_regclass(format('public.%I', item.table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    -- Drop all existing FKs on this table/column that reference auth.users.
    FOR fk IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE c.contype = 'f'
        AND n.nspname = 'public'
        AND t.relname = item.table_name
        AND c.confrelid = 'auth.users'::regclass
        AND EXISTS (
          SELECT 1
          FROM unnest(c.conkey) AS key(attnum)
          JOIN pg_attribute a
            ON a.attrelid = c.conrelid
           AND a.attnum = key.attnum
          WHERE a.attname = item.column_name
        )
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', item.table_name, fk.conname);
    END LOOP;

    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE CASCADE',
      item.table_name,
      item.constraint_name,
      item.column_name
    );
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Delete private storage objects automatically when an Auth user is deleted.
--    Public-table data is handled by the ON DELETE CASCADE foreign keys above.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_deleted_user_storage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id IN ('student-resumes', 'student-certificates')
    AND (storage.foldername(name))[1] = OLD.id::text;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_deleted_user_storage ON auth.users;
CREATE TRIGGER trg_cleanup_deleted_user_storage
AFTER DELETE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_deleted_user_storage();

COMMIT;

-- Optional verification queries after the migration:
-- SELECT count(*) FROM public.profiles;
-- SELECT count(*) FROM public.resume_analyses;
-- SELECT count(*) FROM public.skill_tracking;
-- SELECT count(*) FROM public.saved_certifications;
-- SELECT count(*) FROM public.ongoing_courses;
-- SELECT count(*) FROM public.academic_profiles;
-- SELECT count(*) FROM public.academic_subjects;
-- SELECT count(*) FROM public.career_goals;
-- SELECT count(*) FROM public.career_recommendations;
-- SELECT count(*) FROM public.learning_plans;
-- SELECT count(*) FROM public.career_reports;
-- SELECT count(*) FROM public.career_findings;
