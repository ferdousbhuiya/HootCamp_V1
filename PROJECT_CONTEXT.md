# Skills Pathfinder Project Context

This file is the repository-side continuation reference for daily development.

## Deadline
Complete the application before Friday, August 21, 2026. Target finish: Thursday, August 20.

## Target application
Student signup/profile → resume and certificate collection → optional certificate verification → ongoing-course tracking → comprehensive skill extraction and normalization → career/job matching → skill gaps → certifications/courses → 30-day, 6-month and 1-year plans → final student report → progress tracking → AI career advisor.

## Engineering plan
1. Backend: improve recommendation matching, confidence weighting, normalization, career ranking and consistent API responses.
2. React: improve SkillDashboard and CareerRecommendations, comparison, best-career view, skill-gap roadmap, URLs, and null handling.
3. Supabase: preserve resume analyses, original documents, skills, certificates, verification evidence, courses, career matches, plans, reports, market snapshots and future derived findings with RLS.
4. Final flow: Login → Onboarding → Resume Upload → AI Skill Extraction → Skill Dashboard → Career Recommendations → Career Details → Skill Gap → Certifications/Courses → Progress Tracking.
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
- Onboarding now saves successful resume, certificate and course actions immediately. An `onboarding:active` draft is persisted in `career_findings`, restored after refresh/sign-in, and removed only after successful onboarding completion.
- Back/step navigation saves state; Save & Exit does not mark onboarding complete. Stable client keys make retries idempotent.
- Authentication reloads `profiles.has_completed_onboarding`; incomplete users resume onboarding instead of being treated as completed.
- Ongoing courses support manual add/update/cancel/delete. Course-to-gap matching avoids arbitrary short substring matching and can use stored `extracted_skills` when available.
- Career advice produces 30-day, 6-month and 1-year plans. Career reports and learning-plan snapshots persist to Supabase.
- Added `SavedCareerHistory.jsx` so reports and learning plans remain available after returning to the application.
- Added profile-aware `/api/career-advisor` plus `CareerAdvisor.jsx`. The advisor uses structured saved profile data, skill provenance, certificate verification states, courses, and career matches; successful answers are saved in `career_findings`.
- Redesigned public landing/auth UI with a professional student-focused visual identity, accessibility improvements, password visibility, and responsive layout. Visual smoke testing caught and fixed mobile ordering so authentication appears first on phones.
- Added private source-document storage design in `supabase/20260819_document_storage.sql`: private `student-resumes` and `student-certificates` buckets, 15MB limits, user-folder policies and storage-path columns.
- Added `src/lib/documentStorage.js` and integrated original resume retention into the main resume upload flow. Analysis remains saved if source-file storage fails, with a visible warning.
- Original certificate binary retention is the remaining private-storage wiring gap across all certificate upload entry points; certificate metadata/evidence/skills are already durable.
- Added a no-paid-key market intelligence layer in `market_intelligence.py` using public U.S. BLS OEWS and O*NET data. It is explicitly failure-tolerant so market-source outages cannot block resume analysis or career matching.
- Added conservative application-career → BLS occupation mappings, O*NET occupation matching, caching, source/release metadata, and unit tests for wage-table parsing/mappings.
- Added `GET /api/market-data?career_title=...` to the production API.
- `CareerRecommendations.jsx` now asynchronously enriches the top career matches with BLS/O*NET evidence, displays current mapped occupation/wage/employment details when available, falls back to catalog references when unavailable, and persists dated market snapshots to `career_findings` and `career_recommendations.market_data`.
- CI validates backend dependencies, compile, recommendation/certificate/catalog/market tests, production FastAPI route contract, frontend build, production preview, and desktop/mobile Chromium screenshot capture.

## Flow robustness rules
- Durable findings must be persisted as early as practical and should not exist only in UI state.
- Back/Next navigation must not destroy uploaded/extracted data.
- Close/Cancel must never mark onboarding complete.
- Finish marks onboarding complete only after persistence succeeds.
- Repeated save/retry operations use stable client keys or update existing records rather than creating duplicates.
- Manual entry is allowed where appropriate, especially ongoing courses, profile details and self-reported skills.
- Manual certificate entry never implies verification; verification state comes from the backend classifier/electronic checker.
- Course update/cancel/delete and profile update/cancel paths must preserve database consistency.
- Removing or verifying a certificate must update skill provenance consistently; database triggers provide an additional integrity layer.
- Original student documents should live only in private user-scoped Supabase Storage buckets; public document URLs are not used.
- AI Advisor answers use the structured student profile and are persisted for later retrieval.
- Current market enrichment is non-critical: BLS/O*NET failure must not block career recommendations.
- Market findings store source, release/period, retrieval time and mapping evidence so students can later understand the basis for salary/employment information.

## Deployment note before merge
Apply migrations in this order to the live Supabase project before deploying/merging the branch:
1. Existing `supabase/migration.sql` if not already applied.
2. `supabase/20260819_persistence.sql`.
3. `supabase/20260819_document_storage.sql`.

Do not deploy this branch against the old schema.

## Remaining laptop/live-integration work
- Apply the Aug 19 Supabase migrations to the live project and verify they complete without errors.
- Deploy the development branch to a staging/preview deployment with the real Supabase/Groq environment variables.
- Run a true authenticated end-to-end journey: signup/email verification → onboarding → resume → certificates → ongoing courses → save/exit → resume draft after sign-in → career recommendations → BLS/O*NET market enrichment → report → advisor → logout/login → saved-history retrieval.
- Test real PDF, DOCX, TXT, PNG/JPG, scanned-PDF OCR and several certificate providers against the deployed container.
- Verify private resume Storage upload/signed retrieval and wire/test original certificate binary storage across every certificate upload path.
- Verify live server access to BLS/O*NET sources and confirm dated market snapshots are written to Supabase.
- Review final authenticated UI on desktop/mobile and make any last usability adjustments.
- Only after all live integration tests pass: mark PR ready, merge to `main`, redeploy production, and run one final smoke test.
