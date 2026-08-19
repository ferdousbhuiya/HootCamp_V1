# Skills Pathfinder Project Context

This file is the repository-side continuation reference for daily development.

## Deadline
Complete the application before Friday, August 21, 2026. Target finish: Thursday, August 20.

## Target application
Student signup/profile → resume and certificate collection → optional certificate verification → ongoing-course tracking → comprehensive skill extraction and normalization → career/job matching → skill gaps → certifications/courses → 30-day, 6-month and 1-year plans → final student report → progress tracking → AI career advisor.

## Engineering plan
1. Backend: improve recommendation matching, confidence weighting, normalization, career ranking and consistent API responses.
2. React: improve SkillDashboard and CareerRecommendations, comparison, best-career view, skill-gap roadmap, URLs, and null handling.
3. Supabase: verify resume_analyses, skill_tracking, saved_certifications, ongoing_courses and profiles, RLS and database error handling.
4. Final flow: Login → Onboarding → Resume Upload → AI Skill Extraction → Skill Dashboard → Career Recommendations → Career Details → Skill Gap → Certifications/Courses → Progress Tracking.
5. Expand beyond the initial hard-coded career list toward a broad occupation intelligence layer with reliable salary/market data.

## 2026-08-19
- GitHub read/write access verified.
- Repository-first workflow started so source files do not need to be pasted into chat.
- React stabilization added on branch `agent/skills-pathfinder-stabilize`: best-career summary, comparison, gap roadmap, course alignment, safer null handling, same-origin API fallback, and stronger Supabase error handling.
- Backend career matching rewritten to remove arbitrary substring matching, add explicit aliases, confidence-aware scoring, match/gap percentages, matched evidence details, and explainable `match_reason` output.
- Added `server.py` production bootstrap to wire recommendation functions into the existing FastAPI app and provide resilient Groq JSON parsing for `openai/gpt-oss-20b`.
- Backend Dockerfile now starts `server:app`.
- Added backend recommendation unit tests.
- Added GitHub Actions CI for backend compile/tests and frontend production build.
- Added automatic certificate pipeline for PDF, DOCX, TXT, PNG, JPG, and JPEG.
- Certificate processing extracts certificate name, provider, holder, credential ID, verification URL, issue/expiry dates, and certificate-derived skills.
- Electronic verification is conservative: a trusted-domain URL alone is NOT enough. The provider page must be reached and contain matching credential evidence before `electronically_verified` is returned.
- Added distinct certificate statuses for no link, unknown provider/manual review, invalid link, unavailable verification page, provider page reached but unconfirmed, and electronically verified.
- LinkedIn, Udemy, Coursera, Credly and other major credential hosts are supported by the trusted-host classifier. They remain unverified until evidence is actually found.
- Dashboard certificate management now uses the same backend verification rules; opening a link or recognizing a provider domain can no longer self-mark a certificate verified.
- Added `/api/verify-certificate-link` for safe re-verification of saved/manual certificate links.
- Onboarding and dashboard accept multiple certificate formats; certificate findings and certificate-derived skills are saved with provenance and verification state.
- Resume uploads now persist both `resume_analyses` and the long-term `skill_tracking` inventory, with evidence/confidence updates and career-recommendation snapshots.
- Added `supabase/20260819_persistence.sql` for rich certificate evidence, skill provenance, career recommendation history, learning plans and career report history.
- Added distinct `certificate_extracted` skill provenance so an unverified certificate skill is never mislabeled as certificate-verified.
- Ongoing courses remain manual-entry data and support add/update/cancel/delete flows.
- Onboarding separates Close/Cancel from Finish. Closing no longer marks onboarding complete. Back/Next retains in-memory changes until the student explicitly finishes and saves.
- Onboarding save operations now use a stable session key plus Supabase upserts for resume, certificate, course and career-recommendation records. Retrying after a partial network failure updates the same records instead of duplicating them.
- Career advice now targets the requested 30-day, 6-month and 1-year plan instead of the old 30/60/90-day-only structure.
- Career reports now use skills, certificates, ongoing courses and saved career matches, and persist both the final report and learning-plan snapshot in Supabase.
- Added certificate verification tests for LinkedIn, Udemy and Coursera. These hosts are accepted for electronic checking but never pre-verified.
- Added a broad multi-field career fallback catalog covering healthcare/nursing, clinical research, public health, biology, environmental science, business, finance/accounting, HR, marketing, administration, operations, supply chain, education, history/humanities, software, cybersecurity, cloud, data/AI, networking, databases, engineering, and project management.
- Regulated careers such as Registered Nurse and Teacher are explicitly flagged and include licensure/education pathway requirements.
- Latest GitHub Actions run for branch head `cb5caa95` completed successfully. Backend compile/unit tests and frontend production build are green.

## Deployment note before merge
The new frontend persistence code depends on the schema additions in `supabase/20260819_persistence.sql`. Apply that migration to the live Supabase project before merging/deploying this branch, otherwise the new columns/tables will not exist.

## Next work
- Add current salary/job-market lookup from authoritative sources instead of stale hard-coded market figures.
- Improve course-to-skill extraction/alignment beyond simple course-name comparison.
- Add saved report/learning-plan history views in the dashboard.
- Expand the profile-aware AI career advisor.
