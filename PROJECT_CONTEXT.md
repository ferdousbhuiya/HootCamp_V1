# Skills Pathfinder Project Context

This file is the repository-side continuation reference for daily development.

## Deadline
Complete the application before Friday, August 21, 2026. Target finish: Thursday, August 20.

## Target application
Student signup/profile → resume and certificate collection → optional certificate verification → ongoing-course tracking → comprehensive skill extraction and normalization → career/job matching → skill gaps → certifications/courses → 30-day, 6-month and 1-year plans → final student report → progress tracking → AI career advisor.

## Engineering plan
1. Backend: improve recommendation matching, confidence weighting, normalization, career ranking and consistent API responses.
2. React: improve SkillDashboard and CareerRecommendations, comparison, best-career view, skill-gap roadmap, URLs, and null handling.
3. Supabase: preserve resume analyses, original documents, skills, certificates, verification evidence, courses, career matches, plans, reports and future derived findings with RLS.
4. Final flow: Login → Onboarding → Resume Upload → AI Skill Extraction → Skill Dashboard → Career Recommendations → Career Details → Skill Gap → Certifications/Courses → Progress Tracking.
5. Expand beyond the initial hard-coded career list toward a broad occupation intelligence layer with reliable current salary/market data.

## 2026-08-19
- GitHub read/write access verified.
- Repository-first workflow started so source files do not need to be pasted into chat.
- React stabilization added on branch `agent/skills-pathfinder-stabilize`: best-career summary, comparison, gap roadmap, course alignment, safer null handling, same-origin API fallback, and stronger Supabase error handling.
- Backend career matching rewritten to remove arbitrary substring matching, add explicit aliases, confidence-aware scoring, match/gap percentages, matched evidence details, and explainable `match_reason` output.
- Added `server.py` production bootstrap to wire recommendation functions into the existing FastAPI app and provide resilient Groq JSON parsing for `openai/gpt-oss-20b`.
- Backend Dockerfile now starts `server:app`.
- Added backend recommendation unit tests and GitHub Actions CI for backend compile/tests plus frontend production build.
- Added automatic certificate pipeline for PDF, DOCX, TXT, PNG, JPG, and JPEG.
- Certificate processing extracts certificate name, provider, holder, credential ID, verification URL, issue/expiry dates, and certificate-derived skills.
- Electronic verification is conservative: a trusted-domain URL alone is NOT enough. The provider page must be reached and contain matching credential evidence before `electronically_verified` is returned.
- Added distinct certificate statuses for no link, unknown provider/manual review, invalid link, unavailable verification page, provider page reached but unconfirmed, and electronically verified.
- Added provider-specific verification-link handling for LinkedIn Learning, Udemy (including `ude.my` certificate-share links), Coursera accomplishment/verification links, Credly and other major credential hosts. These remain unverified until evidence is actually found on the provider page.
- Strengthened certificate-link safety by rejecting local/private targets and validating redirect hosts.
- Dashboard certificate management uses the same backend verification rules; opening a link or recognizing a provider domain can no longer self-mark a certificate verified.
- Added `/api/verify-certificate-link` for safe re-verification of saved/manual certificate links.
- Onboarding and dashboard accept multiple certificate formats; certificate findings and certificate-derived skills are saved with provenance and verification state.
- Resume uploads persist both `resume_analyses` and the long-term `skill_tracking` inventory, with evidence/confidence updates and career-recommendation snapshots.
- Consolidated persistence schema in `supabase/20260819_persistence.sql`. It adds rich certificate evidence, skill provenance, retry-safe client keys, career recommendation history, learning plans, career reports, and a generic `career_findings` JSON store for market lookups, skill-gap snapshots, course alignment, onboarding drafts and advisor outputs.
- Added distinct `certificate_extracted` skill provenance so an unverified certificate skill is never mislabeled as certificate-verified.
- Ongoing courses remain manual-entry data and support add/update/cancel/delete flows in the dashboard.
- Career advice targets 30-day, 6-month and 1-year plans instead of only 30/60/90-day steps.
- Career reports use skills, certificates, ongoing courses and saved career matches, and persist report/learning-plan snapshots in Supabase.
- Added certificate verification tests for LinkedIn Learning, Udemy and Coursera. These hosts are accepted for electronic checking but never pre-verified.
- Added a broad multi-field career fallback catalog covering healthcare/nursing, clinical research, public health, biology, environmental science, business, finance/accounting, HR, marketing, administration, operations, supply chain, education, history/humanities, software, cybersecurity, cloud, data/AI, networking, databases, engineering, and project management.
- Regulated careers such as Registered Nurse and Teacher are explicitly flagged and include licensure/education pathway requirements.
- Redesigned the public landing/auth page with a professional student-focused split layout, clearer product explanation, accessible form controls, password visibility, improved sign-up hierarchy, and an inline Skills Pathfinder brand mark.
- Visual testing found that the first mobile design placed marketing before login. The mobile order was corrected so sign-in/sign-up is immediately visible, while the richer product overview follows below.
- Authentication now reloads `profiles.has_completed_onboarding` after sign-in rather than assuming every returning user finished onboarding.
- CI was strengthened to install real backend requirements, compile modules, run unit tests, import the production `server:app`, verify critical API routes, build the frontend, serve the production preview, and capture desktop/mobile landing screenshots with Chromium.
- Onboarding was upgraded to incremental persistence. Successful resume, certificate and course actions are saved immediately; an `onboarding:active` draft is saved in `career_findings`, restored after refresh/sign-in, and removed only after successful completion.
- Back/step navigation saves the onboarding draft. Save & Exit no longer loses processed data or marks onboarding complete.
- Resume analyses, certificate results and career recommendation snapshots use stable retry-safe keys during onboarding.
- Certificate-derived and resume-derived skills now carry multi-source provenance in `skill_tracking.metadata.sources` during onboarding.
- Database triggers were added so later certificate electronic verification promotes matching certificate evidence, and certificate deletion removes/downgrades certificate skill provenance rather than leaving stale verified status.
- Fixed `career_findings` conflict handling by using a non-partial unique `(user_id, client_record_key)` index so Supabase/PostgREST upserts can infer the conflict target reliably.
- Added a profile-aware `/api/career-advisor` endpoint. It grounds answers in saved profile data, skills, certificate verification states, ongoing courses and career matches; it explicitly handles regulated roles and missing evidence.
- Added `CareerAdvisor.jsx` with suggested questions, saved advisor-response history, and automatic persistence of every successful advisor answer in `career_findings`.
- Added `SavedCareerHistory.jsx` so students can revisit generated career reports and saved 30-day, 6-month and 1-year learning plans after returning to the application.
- Course-to-gap matching was tightened to avoid arbitrary short substring matches and can use stored course `extracted_skills` when available.
- Hard-coded salary/outlook values are labeled as reference values in the UI until live authoritative market data is integrated and persisted.
- Added `supabase/20260819_document_storage.sql` defining private `student-resumes` and `student-certificates` buckets, 15MB limits, user-folder storage policies, and storage-path columns.
- Added a reusable private-document storage helper and integrated original resume retention into the main resume upload flow. Analysis remains saved even if source-document storage fails, with a visible retry warning.
- Latest branch validation after the release-readiness changes passed: backend dependency install, compile, unit tests, production FastAPI import/route contract, frontend dependency install/build, Vite production preview, and desktop/mobile Chromium screenshot capture.

## Flow robustness rules
- Data should be persisted as early as practical and never exist only in UI state when it is a durable finding.
- Back/Next navigation must not destroy uploaded/extracted data.
- Close/Cancel must never mark onboarding complete.
- Finish marks onboarding complete only after persistence succeeds.
- Repeated save/retry operations should use stable client keys or update existing rows rather than creating duplicates.
- Manual entry is allowed where appropriate, especially ongoing courses, profile details and self-reported skills.
- Manual certificate entry never implies verification. Verification state comes from the backend classifier/electronic checker.
- Course update/cancel/delete and profile update/cancel paths must preserve database consistency.
- Removing or verifying a certificate must update skill provenance consistently; database triggers provide an additional integrity layer.
- Original student documents should live only in private user-scoped Supabase Storage buckets; public document URLs are not used.
- AI Advisor answers must use the structured student profile and be persisted for later retrieval.

## Deployment note before merge
Apply migrations in this order to the live Supabase project before deploying/merging the branch:
1. Existing `supabase/migration.sql` if not already applied.
2. `supabase/20260819_persistence.sql`.
3. `supabase/20260819_document_storage.sql`.

The new frontend expects the added columns/tables, RLS policies, provenance triggers and private storage buckets. Do not deploy this branch against the old schema.

## Remaining laptop/live-integration work
- Apply the two Aug 19 Supabase migrations to the live project and verify they complete without errors.
- Deploy the development branch to a staging/preview deployment with the real Supabase/Groq environment variables.
- Run a true authenticated end-to-end journey: signup/email verification → onboarding → resume → certificates → ongoing courses → save/exit → resume draft after sign-in → career recommendations → report → advisor → logout/login → saved-history retrieval.
- Test real PDF, DOCX, TXT, PNG/JPG, scanned-PDF OCR and several certificate providers against the deployed container.
- Verify private resume/certificate Storage uploads and signed retrieval in the live Supabase instance; certificate source-file retention still needs to be wired through every certificate upload entry point if not completed before staging.
- Integrate and validate current salary/job-market examples from authoritative/current external sources, persist market snapshots with source/date, and replace reference-only presentation for live market mode.
- Review final UI on desktop/mobile after authenticated data exists and make any last usability adjustments.
- Only after all live integration tests pass: mark PR ready, merge to `main`, redeploy production, and run one final smoke test.
