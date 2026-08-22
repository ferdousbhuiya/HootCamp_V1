# Skills Pathfinder - Final Staging Handoff

Date: 2026-08-19
Branch: `agent/skills-pathfinder-stabilize`
PR: #1

## Code-side status

The development branch is feature-complete for staging. The latest clean CI pass validates:

- backend dependency installation;
- Python compilation;
- recommendation, certificate, expanded-career, and market-intelligence unit tests;
- production FastAPI import and required route contract;
- frontend dependency installation and production build;
- Vite production preview;
- desktop and mobile Chromium smoke screenshots.

## Data/persistence coverage

The branch persists or prepares persistence for:

- student profile and onboarding state;
- active onboarding draft / Save & Exit recovery;
- resume analyses and original resume files;
- extracted skills, evidence, confidence, provenance, proficiency and verification state;
- certificates, extracted metadata, verification classification/evidence and original certificate files;
- ongoing courses and course progress;
- career recommendation snapshots;
- current market-data snapshots with source/date metadata;
- career reports;
- 30-day, 6-month and 1-year learning plans;
- AI Career Advisor responses/history.

Original resume and certificate binaries use private, user-scoped Supabase Storage buckets. Certificate deletion also attempts private-object cleanup, while database provenance triggers protect skill evidence consistency.

## Certificate verification behavior

Supported upload formats: PDF, DOCX, TXT, PNG, JPG/JPEG.

Recognized verification hosts include LinkedIn Learning, Udemy / `ude.my`, Coursera, Credly and other configured credential providers. A trusted URL alone is never treated as verified. `electronically_verified` requires the provider page to be reached and matching credential evidence to be found.

Other classifications include no verification link, manual review, verification unavailable, invalid/untrusted link, and provider page reached but unconfirmed.

## Market intelligence

A failure-tolerant market service uses public BLS OEWS and O*NET data. Market enrichment never blocks core resume analysis or career matching. When authoritative market data is available, the UI can show current mapped wage/employment context and persist a dated snapshot.

## Required live steps before merge

1. Back up the current Supabase project/schema.
2. Apply migrations in order:
   - existing `supabase/migration.sql` if not already applied;
   - `supabase/20260819_persistence.sql`;
   - `supabase/20260819_document_storage.sql`.
3. Deploy this branch to staging/preview with the real Supabase and Groq environment variables.
4. Run a real authenticated end-to-end journey:
   signup/email verification -> onboarding -> resume -> certificates -> courses -> Save & Exit -> resume onboarding -> career recommendations -> market data -> report -> AI Advisor -> logout/login -> saved-history restoration.
5. Test PDF, DOCX, TXT, PNG/JPG and scanned-PDF OCR.
6. Test LinkedIn Learning, Udemy and Coursera certificate examples plus a certificate with no verification link.
7. Verify private resume/certificate Storage upload, ownership isolation, signed retrieval and deletion cleanup.
8. Verify RLS prevents one user from reading or changing another user's records.
9. Review authenticated desktop/mobile UI with real data and fix only issues discovered in staging.
10. When all live checks pass, mark PR #1 ready, merge to `main`, redeploy production and run one final smoke test.

## Merge rule

Do not merge this branch into `main` before the live Supabase migrations and staging end-to-end test pass.
