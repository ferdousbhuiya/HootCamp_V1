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
- Added GitHub Actions CI for backend compile/tests and frontend production build; backend and frontend builds passed.
- Added automatic certificate pipeline for PDF, DOCX, TXT, PNG, JPG, and JPEG.
- Certificate processing now extracts certificate name, provider, holder, credential ID, verification URL, dates, and certificate-derived skills.
- Electronic verification is conservative: a trusted-domain URL alone is NOT enough. The provider page must be reached and contain matching credential evidence before `electronically_verified` is returned.
- Added distinct certificate statuses for no link, unknown provider/manual review, invalid link, unavailable verification page, provider page reached but unconfirmed, and electronically verified.
- Onboarding now accepts multiple certificates, displays verification classifications, merges certificate skills with resume skills, and preserves verification state in Supabase.
- Added certificate verification unit tests.
- Added a broad multi-field career fallback catalog covering healthcare/nursing, clinical research, public health, biology, environmental science, business, finance/accounting, HR, marketing, administration, operations, supply chain, education, history/humanities, software, cybersecurity, cloud, data/AI, networking, databases, engineering, and project management.
- Regulated careers such as Registered Nurse and Teacher are explicitly flagged and include licensure/education pathway requirements.

## Next work
- Harmonize the UserDashboard certificate-management flow with the new automatic verification endpoint so no UI can self-mark a certificate verified from a URL alone.
- Add current salary/job-market lookup from authoritative sources instead of stale hard-coded market figures.
- Synchronize resume/certificate/course-derived skills more deeply into the unified Supabase skill profile and deduplicate across repeated sessions.
- Build learning-path recommendations and 30-day/6-month/1-year reporting.
- Expand final profile-aware AI career advisor.
