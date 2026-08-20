# Skills Pathfinder Project Context

This file is the repository-side continuation reference for daily development.

## Deadline
Complete the application before Friday, August 21, 2026. Target finish: Thursday, August 20.

## Target application
Student signup/profile → resume-optional evidence collection → academic subjects/credits → certificates and optional verification → ongoing-course tracking → comprehensive skill extraction and normalization → career/job matching → skill gaps → certifications/courses → 30-day, 6-month and 1-year plans → trackable progress → final student report → AI career advisor.

## Engineering plan
1. Backend: maintain explainable career matching, confidence weighting, normalization, career ranking, certificate verification and consistent API responses.
2. React: maintain a professional student dashboard with academic pathways, career comparison, best-career view, skill-gap roadmap, market intelligence, saved plans and report history.
3. Supabase: preserve resume analyses, original documents, skills, certificates, verification evidence, courses, academic profiles, subjects, career goals, career matches, plans, reports, market snapshots and durable findings with RLS.
4. Final flow: Login → Career Dashboard → Academic Profile/Subjects, Resume/Manual Profile, Certificates and Courses in any order → Target Career → AI Analysis → Career Intelligence → Skill Gap → Plan → Progress Tracking → Final Report.
5. Use authoritative public occupation/market data instead of requiring a paid labor-market API.

## 2026-08-19
- GitHub read/write access verified and repository-first workflow started.
- Working branch: `agent/skills-pathfinder-stabilize`; `main` remains unchanged until live testing succeeds.
- Backend career matching rewritten to remove arbitrary substring matching, add explicit aliases, confidence-aware scoring, match/gap percentages, matched evidence details, and explainable `match_reason` output.
- Added `server.py` production bootstrap with resilient Groq JSON parsing for `openai/gpt-oss-20b`; backend Dockerfile starts `server:app`.
- Added broad multi-field career coverage across healthcare/nursing, clinical research, public health, biology, environmental science, business, finance/accounting, HR, marketing, administration, operations, supply chain, education, history/humanities, software, cybersecurity, cloud, data/AI, networking, databases, engineering, and project management.
- Regulated careers such as Registered Nurse and Teacher are explicitly flagged and include licensure/education pathway requirements.
- Added automatic certificate processing for PDF, DOCX, TXT, PNG, JPG, and JPEG. Certificate processing extracts certificate name, provider, holder, credential ID, verification URL, issue/expiry dates, and certificate-derived skills.
- Electronic verification is conservative: a trusted-domain URL alone is NOT enough. The provider page must be reached and contain matching credential evidence before `electronically_verified` is returned.
- Added provider-specific verification-link handling for LinkedIn Learning, Udemy/`ude.my`, Coursera, Credly and other major credential hosts, plus local/private-target and unsafe-redirect rejection.
- Dashboard certificate re-verification uses the backend `/api/verify-certificate-link` rules; no UI path should self-mark a certificate verified from a URL alone.
- Added `supabase/20260819_persistence.sql` with rich certificate evidence, skill provenance, retry-safe client keys, career recommendation history, learning plans, career reports, `career_findings`, RLS and provenance integrity triggers.
- Added `certificate_extracted` skill provenance so unverified certificate evidence is distinct from verified evidence.
- Database triggers promote certificate evidence after successful electronic verification and remove/downgrade certificate skill provenance when a certificate is deleted.
- Fixed `career_findings` upsert support with a non-partial unique `(user_id, client_record_key)` index.
- Onboarding saves successful resume, certificate and course actions immediately. Stable client keys make retries idempotent.
- Ongoing courses support manual add/update/cancel/delete. Course-to-gap matching avoids arbitrary short substring matching and can use stored `extracted_skills` when available.
- Career advice produces 30-day, 6-month and 1-year plans. Career reports and learning-plan snapshots persist to Supabase.
- Added `SavedCareerHistory.jsx` so reports and learning plans remain available after returning to the application.
- Added profile-aware `/api/career-advisor` plus `CareerAdvisor.jsx`. The advisor uses structured saved profile data, skill provenance, certificate verification states, courses, and career matches; successful answers are saved in `career_findings`.
- Redesigned public landing/auth UI with a professional student-focused visual identity, accessibility improvements, password visibility, and responsive layout.
- Added private source-document storage design in `supabase/20260819_document_storage.sql`: private `student-resumes` and `student-certificates` buckets, 15MB limits, user-folder policies and storage-path columns.
- Added `src/lib/documentStorage.js` and integrated original resume retention into the main resume upload flow. Analysis remains saved if source-file storage fails, with a visible warning.
- Original certificate binary retention remains a private-storage wiring gap across some certificate upload entry points; certificate metadata/evidence/skills are durable.
- Added a no-paid-key market intelligence layer in `market_intelligence.py` using public U.S. BLS OEWS and O*NET data. It is failure-tolerant so market-source outages cannot block resume analysis or career matching.
- Added conservative application-career → BLS occupation mappings, O*NET occupation matching, caching, source/release metadata, and unit tests for wage-table parsing/mappings.
- Added `GET /api/market-data?career_title=...` to the production API.
- `CareerRecommendations.jsx` enriches leading career matches with BLS/O*NET evidence, displays mapped occupation/wage/employment details when available, falls back to catalog references when unavailable, and persists dated market snapshots.
- CI validates backend dependencies, compile, recommendation/certificate/catalog/market tests, production FastAPI route contract, frontend build, production preview, and desktop/mobile Chromium screenshot capture.

## 2026-08-20
- Added `supabase/20260820_academic_pathways.sql` and executed it successfully in live Supabase.
- New RLS-protected tables: `academic_profiles`, `academic_subjects`, `career_goals`.
- Added academic fields to ongoing courses: `subject_area`, `credit_hours`, `semester`, `institution`.
- Added credential fields to saved certifications: `subjects`, `credit_hours`, `credential_type`.
- Added `AcademicPathways.jsx` and resume-optional academic analysis. Academic program, subjects, credits, certificates, current courses and target career can generate a persisted AI analysis without a resume.
- Added `StudentCareerDashboard.jsx` with readiness estimate, career comparison, evidence strength, academic progress, active learning, verified credentials, next-best-action guidance and course/subject gap alignment.
- Fixed a React hook-order crash that occurred when opening Academic Profile & Subjects / Update Academic Pathway.
- Changed login behavior so incomplete onboarding no longer gates access behind the old resume-first wizard. Students land on the Career Dashboard and can build evidence in any order.
- Stabilized academic analysis persistence: recommendation snapshots, skills, career findings and source metadata are saved before opening Career Intelligence.
- Academic analysis now includes ongoing courses and certificate subject evidence.
- Final Career Report now includes academic profile, subjects, target career, career comparison, skill gaps and saved market evidence in addition to AI advice.
- Generated learning plans initialize persisted action-item progress.
- Saved Plans now support checkboxes for 30-day, 6-month and 1-year actions. Progress percentage and completion status persist to `learning_plans` and `career_findings`.

## Flow robustness rules
- Durable findings must be persisted as early as practical and should not exist only in UI state.
- Academic evidence, resume evidence, certificate evidence, courses and manual skills may be entered in any order.
- A resume is optional and must not gate Career Intelligence when sufficient academic/profile evidence exists.
- Back/Next navigation must not destroy uploaded/extracted data.
- Close/Cancel must never incorrectly mark a workflow complete.
- Repeated save/retry operations use stable client keys or update existing records rather than creating duplicates.
- Manual entry is allowed where appropriate, especially ongoing courses, profile details and self-reported skills.
- Manual certificate entry never implies verification; verification state comes from the backend classifier/electronic checker.
- Course update/cancel/delete and profile update/cancel paths must preserve database consistency.
- Removing or verifying a certificate must update skill provenance consistently; database triggers provide an additional integrity layer.
- Original student documents should live only in private user-scoped Supabase Storage buckets; public document URLs are not used.
- AI Advisor answers use the structured student profile and are persisted for later retrieval.
- Current market enrichment is non-critical: BLS/O*NET failure must not block career recommendations.
- Market findings store source, release/period, retrieval time and mapping evidence so students can later understand the basis for salary/employment information.
- Learning-plan completion is durable. Each action checkbox updates Supabase and a summarized progress finding.

## Deployment note before merge
The live database is expected to include, in order:
1. Existing `supabase/migration.sql`.
2. `supabase/20260819_persistence.sql`.
3. `supabase/20260819_document_storage.sql`.
4. `supabase/20260820_academic_pathways.sql`.

Do not deploy the development branch against an older schema.

## Remaining live-integration work
- Deploy the latest `agent/skills-pathfinder-stabilize` branch after CI passes.
- Run authenticated end-to-end tests for five personas: resume student, no-resume academic student, certificate-only student, academic subjects/courses student, and experienced resume+certificate+course student.
- Confirm Academic Profile & Subjects, Update Academic Pathway and Back to Dashboard remain stable after deployment.
- Verify academic analysis automatically opens Career Intelligence and survives logout/login.
- Verify generated final report contains academic evidence and career comparison, then confirm it reappears in Saved Plans/Reports.
- Verify plan action checkboxes persist after refresh and update completion percentage/status.
- Test real PDF, DOCX, TXT, PNG/JPG, scanned-PDF OCR and several certificate providers against the deployed container.
- Verify private resume Storage upload/signed retrieval and finish original certificate binary storage across every certificate upload path.
- Verify live server access to BLS/O*NET sources and confirm dated market snapshots are written to Supabase.
- Review final authenticated UI on desktop/mobile and make only usability or reliability fixes, not architectural redesigns.
- Only after live integration tests pass: merge to `main`, redeploy production, and run one final smoke test.
