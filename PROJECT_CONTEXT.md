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
- Backend CI passed.
- Frontend dependency install and production build passed.

## Next work
- Expand the career intelligence layer beyond the initial eight careers.
- Synchronize resume/certificate/course-derived skills into the unified Supabase skill profile.
- Build learning-path and 30-day/6-month/1-year reporting.
