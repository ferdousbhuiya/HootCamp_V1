# Skills Pathfinder Project Context

This file is the repository-side continuation reference for daily development.

## Deadline
Complete the application before Friday, August 21, 2026. Target finish: Thursday, August 20.

## Target application
Student signup/profile → resume and certificate collection → optional certificate verification → ongoing-course tracking → comprehensive skill extraction and normalization → career/job matching → skill gaps → certifications/courses → 30-day, 6-month and 1-year plans → final student report → progress tracking → AI career advisor.

## Engineering plan
1. Backend: improve recommendation matching, confidence weighting, normalization, career ranking and consistent API responses.
2. React: improve SkillDashboard and CareerRecommendations, comparison, best-career view, skill-gap roadmap, URLs, and null handling.
3. Supabase: preserve resume analyses, skills, certificates, verification evidence, courses, career matches, plans, reports and future derived findings with RLS.
4. Final flow: Login → Onboarding → Resume Upload → AI Skill Extraction → Skill Dashboard → Career Recommendations → Career Details → Skill Gap → Certifications/Courses → Progress Tracking.
5. Expand beyond the initial hard-coded career list toward a broad occupation intelligence layer with reliable salary/market data.

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
- Consolidated persistence schema in `supabase/20260819_persistence.sql`. It adds rich certificate evidence, skill provenance, retry-safe client keys, career recommendation history, learning plans, career reports, and a generic `career_findings` JSON store for market lookups, skill-gap snapshots, course alignment, and future advisor outputs.
- Added distinct `certificate_extracted` skill provenance so an unverified certificate skill is never mislabeled as certificate-verified.
- Ongoing courses remain manual-entry data and support add/update/cancel/delete flows in the dashboard.
- Onboarding separates Close/Cancel from Finish. Closing no longer marks onboarding complete. Back/Next retains work and retry-safe upserts prevent duplicate records after partial save failures.
- Career advice targets 30-day, 6-month and 1-year plans instead of only 30/60/90-day steps.
- Career reports use skills, certificates, ongoing courses and saved career matches, and persist report/learning-plan snapshots in Supabase.
- Added certificate verification tests for LinkedIn Learning, Udemy and Coursera. These hosts are accepted for electronic checking but never pre-verified.
- Added a broad multi-field career fallback catalog covering healthcare/nursing, clinical research, public health, biology, environmental science, business, finance/accounting, HR, marketing, administration, operations, supply chain, education, history/humanities, software, cybersecurity, cloud, data/AI, networking, databases, engineering, and project management.
- Regulated careers such as Registered Nurse and Teacher are explicitly flagged and include licensure/education pathway requirements.

## Flow robustness rules
- Data should be persisted as early as practical and never exist only in UI state when it is a durable finding.
- Back/Next navigation must not destroy uploaded/extracted data.
- Close/Cancel must never mark onboarding complete.
- Finish marks onboarding complete only after persistence succeeds.
- Repeated save/retry operations should use stable client keys or update existing rows rather than creating duplicates.
- Manual entry is allowed where appropriate, especially ongoing courses, profile details and self-reported skills.
- Manual certificate entry never implies verification. Verification state comes from the backend classifier/electronic checker.
- Course update/cancel/delete and profile update/cancel paths must preserve database consistency.

## Deployment note before merge
The new frontend persistence code depends on schema additions in `supabase/20260819_persistence.sql`. Apply that migration to the live Supabase project before merging/deploying this branch, otherwise new columns/tables will not exist.

## Next work
- Make onboarding save resume/certificate/course findings incrementally as each step succeeds, so closing mid-flow never loses already-processed work.
- Add current salary/job-market lookup from authoritative sources instead of stale hard-coded market figures.
- Improve course-to-skill extraction/alignment beyond simple course-name comparison.
- Add saved report/learning-plan history views in the dashboard.
- Expand the profile-aware AI career advisor.
