import { useEffect, useMemo, useState } from 'react';
import CareerReportV2 from './CareerReportV2';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const safe = (value) => Array.isArray(value) ? value : [];

const resumeEvidenceFromRow = (row) => {
  const raw = row?.raw_analysis && typeof row.raw_analysis === 'object' ? row.raw_analysis : {};
  return raw.structured_evidence && typeof raw.structured_evidence === 'object'
    ? raw.structured_evidence
    : {
        education: safe(raw.education),
        experience: safe(raw.experience),
        projects: safe(raw.projects),
        publications: safe(raw.publications),
        certifications: safe(raw.certifications_from_resume),
        courses: safe(raw.courses_from_resume),
        total_experience_years: raw.total_experience_years ?? 0,
      };
};

const normalizeResumeCredential = (item, index) => ({
  id: `resume-credential-${index}-${String(item?.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  certification_name: item?.name || 'Resume-listed credential',
  provider: item?.provider || 'Listed on resume',
  status: item?.status || 'completed',
  is_verified: false,
  verification_status: 'resume_evidence_unverified',
  source: 'resume_evidence',
  resume_evidence: item?.evidence || '',
});

/**
 * Report isolation boundary.
 *
 * A generated report must describe one resume analysis, not the user's accumulated
 * cross-resume skill/history profile. Load the latest analysis once, then pass that
 * analysis id, its exact skills and its exact career recommendations downstream.
 */
const CareerReportV3 = (props) => {
  const { user, certifications = [] } = props;
  const [ready, setReady] = useState(false);
  const [resumeEvidence, setResumeEvidence] = useState({});
  const [analysisId, setAnalysisId] = useState(null);
  const [analysisSkills, setAnalysisSkills] = useState([]);
  const [analysisRecommendations, setAnalysisRecommendations] = useState([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!user?.id) {
        if (active) setReady(true);
        return;
      }
      const { data, error } = await supabase
        .from('resume_analyses')
        .select('id, raw_analysis, extracted_skills, recommendations, uploaded_at')
        .eq('user_id', user.id)
        .order('uploaded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!active) return;
      if (error) console.error('Career report could not load latest resume analysis:', error);

      const raw = data?.raw_analysis && typeof data.raw_analysis === 'object' ? data.raw_analysis : {};
      setAnalysisId(data?.id || raw.analysis_id || null);
      setResumeEvidence(resumeEvidenceFromRow(data));
      setAnalysisSkills(
        safe(raw.extracted_skills).length ? safe(raw.extracted_skills) : safe(data?.extracted_skills)
      );
      setAnalysisRecommendations(
        safe(raw.recommendations).length ? safe(raw.recommendations) : safe(data?.recommendations)
      );
      setReady(true);
    };
    load();
    return () => { active = false; };
  }, [user?.id]);

  const reportCertifications = useMemo(() => {
    const savedNames = new Set(
      safe(certifications).map((item) => String(item?.certification_name || '').trim().toLowerCase()).filter(Boolean)
    );
    const resumeCredentials = safe(resumeEvidence?.certifications)
      .filter((item) => item?.name && !savedNames.has(String(item.name).trim().toLowerCase()))
      .map(normalizeResumeCredential);
    return [...safe(certifications), ...resumeCredentials];
  }, [certifications, resumeEvidence]);

  useEffect(() => {
    if (!ready) return undefined;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (!url.includes('/api/generate-career-advice') || String(init?.method || 'GET').toUpperCase() !== 'POST') {
        return originalFetch(input, init);
      }
      try {
        const body = JSON.parse(init.body || '{}');
        return originalFetch(input, {
          ...init,
          body: JSON.stringify({
            ...body,
            analysis_id: analysisId,
            resume_evidence: resumeEvidence || {},
          }),
        });
      } catch {
        return originalFetch(input, init);
      }
    };
    return () => { window.fetch = originalFetch; };
  }, [ready, analysisId, resumeEvidence]);

  if (!ready) {
    return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><div className="rounded-xl bg-white p-8 text-center shadow-2xl"><div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-teal-100 border-t-teal-600" /><p className="text-lg font-semibold">Preparing complete resume evidence…</p></div></div>;
  }

  return <CareerReportV2
    {...props}
    analysisId={analysisId}
    careerRecommendations={analysisRecommendations}
    skills={analysisSkills}
    certifications={reportCertifications}
  />;
};

export default CareerReportV3;
