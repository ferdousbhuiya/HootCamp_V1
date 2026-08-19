-- Skills Pathfinder private document storage
-- Apply after supabase/20260819_persistence.sql.
-- Source documents are private. The first folder segment is always auth.uid().

ALTER TABLE public.resume_analyses
  ADD COLUMN IF NOT EXISTS storage_bucket text DEFAULT 'student-resumes',
  ADD COLUMN IF NOT EXISTS storage_path text;

ALTER TABLE public.saved_certifications
  ADD COLUMN IF NOT EXISTS storage_bucket text DEFAULT 'student-certificates',
  ADD COLUMN IF NOT EXISTS storage_path text;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES
  (
    'student-resumes',
    'student-resumes',
    false,
    15728640,
    ARRAY[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'image/png',
      'image/jpeg',
      'image/jpg'
    ]
  ),
  (
    'student-certificates',
    'student-certificates',
    false,
    15728640,
    ARRAY[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'image/png',
      'image/jpeg',
      'image/jpg'
    ]
  )
ON CONFLICT (id) DO UPDATE
SET public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS "student_docs_select_own" ON storage.objects;
CREATE POLICY "student_docs_select_own"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id IN ('student-resumes', 'student-certificates')
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "student_docs_insert_own" ON storage.objects;
CREATE POLICY "student_docs_insert_own"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN ('student-resumes', 'student-certificates')
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "student_docs_update_own" ON storage.objects;
CREATE POLICY "student_docs_update_own"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id IN ('student-resumes', 'student-certificates')
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id IN ('student-resumes', 'student-certificates')
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "student_docs_delete_own" ON storage.objects;
CREATE POLICY "student_docs_delete_own"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id IN ('student-resumes', 'student-certificates')
  AND (storage.foldername(name))[1] = auth.uid()::text
);
