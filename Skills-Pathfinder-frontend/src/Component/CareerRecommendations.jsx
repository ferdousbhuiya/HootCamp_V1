import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const safeArray = (value) => (Array.isArray(value) ? value : []);
const percent = (value) => `${Math.round((Number(value) || 0) * 100)}%`;
const normalize = (value = '') => String(value).trim().toLowerCase().replace(/[^a-z0-9+#./ -]+/g, ' ').replace(/\s+/g, ' ');
const meaningfulPhraseMatch = (left, right) => {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 6) return false;
  return a.includes(b) || b.includes(a);
};

const CareerRecommendations = ({ skills, user, onBack }) => {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCareer, setSelectedCareer] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [userSkills, setUserSkills] = useState([]);
  const [userCourses, setUserCourses] = useState([]);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user) return;
      const [skillsResult, coursesResult] = await Promise.all([
        supabase.from('skill_tracking').select('*').eq('user_id', user.id),
        supabase.from('ongoing_courses').select('*').eq('user_id', user.id)
      ]);

      if (skillsResult.error) console.error('Could not load tracked skills:', skillsResult.error);
      if (coursesResult.error) console.error('Could not load ongoing courses:', coursesResult.error);
      setUserSkills(skillsResult.data || []);
      setUserCourses(coursesResult.data || []);
    };
    fetchUserData();
  }, [user]);

  useEffect(() => {
    if (Array.isArray(skills?.recommendations)) {
      setRecommendations(skills.recommendations);
      setLoading(false);
      return;
    }

    if (!safeArray(skills?.extracted_skills).length) {
      setRecommendations([]);
      setLoading(false);
      return;
    }

    const fetchRecommendations = async () => {
      setLoading(true);
      setError(null);
      try {
        const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
        const response = await fetch(`${apiUrl}/api/recommendations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ extracted_skills: skills.extracted_skills })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || 'Failed to fetch recommendations');
        setRecommendations(safeArray(data.recommendations));
      } catch (err) {
        setError(err?.message || 'Unable to load career recommendations.');
      } finally {
        setLoading(false);
      }
    };
    fetchRecommendations();
  }, [skills]);

  const rankedRecommendations = useMemo(
    () => [...recommendations].sort((a, b) => (Number(b.match_score) || 0) - (Number(a.match_score) || 0)),
    [recommendations]
  );

  const bestCareer = rankedRecommendations[0];

  const getSkillVerificationStatus = (skillName = '') => {
    const target = normalize(skillName);
    const skill = userSkills.find((item) => normalize(item.skill_name) === target);
    if (!skill) return { status: 'not_found', badge: '' };
    if (skill.verification_status === 'certificate_verified') return { status: 'verified', badge: 'Verified' };
    if (skill.verification_status === 'in_progress') return { status: 'in_progress', badge: 'In progress' };
    if (skill.verification_status === 'ai_verified') return { status: 'ai_verified', badge: 'AI extracted' };
    if (skill.verification_status === 'certificate_extracted_unverified') return { status: 'certificate_extracted', badge: 'Certificate extracted' };
    return { status: 'self_reported', badge: 'Tracked' };
  };

  const courseAlignment = (rec) => {
    const missing = safeArray(rec?.missing_skills);
    return userCourses.filter((course) => {
      const signals = [course.course_name, ...safeArray(course.extracted_skills).map((skill) => skill?.name || skill)].filter(Boolean);
      return missing.some((skill) => signals.some((signal) => meaningfulPhraseMatch(skill, signal)));
    });
  };

  if (loading) {
    return <div className="bg-white rounded-xl shadow-lg p-12 text-center"><div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-indigo-600 mx-auto"/><p className="mt-6 text-lg text-gray-600 font-medium">Analyzing your career path...</p></div>;
  }

  if (error) {
    return <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center"><h3 className="text-red-800 font-semibold text-lg mb-2">Error Loading Recommendations</h3><p className="text-red-600 mb-4">{error}</p><button onClick={onBack} className="text-indigo-600 hover:underline">Go Back</button></div>;
  }

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div><h1 className="text-2xl font-bold">Career Path Recommendations</h1><p className="mt-1 text-indigo-100">{rankedRecommendations.length} career paths matched to your current evidence</p></div>
          <button onClick={onBack} className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg">Back to Skills</button>
        </div>
      </div>

      <div className="p-6">
        {!bestCareer ? (
          <div className="text-center py-12"><h3 className="text-xl font-semibold text-gray-800 mb-2">No career paths found</h3><p className="text-gray-500">Add more resume, certificate, course, or self-reported skill evidence and try again.</p></div>
        ) : (
          <>
            <div className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Best career for you right now</p>
              <div className="mt-2 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                <div><h2 className="text-2xl font-bold text-gray-900">{bestCareer.path}</h2><p className="text-gray-600">{bestCareer.category} · {safeArray(bestCareer.matched_skills).length} matching skills · {safeArray(bestCareer.missing_skills).length} priority gaps</p></div>
                <div className="text-3xl font-bold text-indigo-700">{percent(bestCareer.match_score)}</div>
              </div>
            </div>

            {rankedRecommendations.length > 1 && (
              <div className="mb-8 overflow-x-auto">
                <h3 className="font-semibold text-gray-800 mb-3">Career comparison</h3>
                <table className="min-w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50"><tr><th className="text-left p-3">Career</th><th className="text-left p-3">Match</th><th className="text-left p-3">Salary reference</th><th className="text-left p-3">Skill gaps</th></tr></thead>
                  <tbody>{rankedRecommendations.slice(0, 5).map((rec) => <tr key={rec.id} className="border-t"><td className="p-3 font-medium">{rec.path}</td><td className="p-3">{percent(rec.match_score)}</td><td className="p-3">{rec.median_salary || 'Not available'}</td><td className="p-3">{safeArray(rec.missing_skills).length}</td></tr>)}</tbody>
                </table>
                <p className="mt-2 text-xs text-gray-400">Salary figures in the career catalog are reference values. Live market validation will be stored separately when current market data is available.</p>
              </div>
            )}

            <div className="space-y-6">
              {rankedRecommendations.map((rec, index) => {
                const matched = safeArray(rec.matched_skills);
                const missing = safeArray(rec.missing_skills);
                const alignedCourses = courseAlignment(rec);
                return (
                  <div key={rec.id || rec.path} className={`rounded-lg border-2 ${index === 0 ? 'border-indigo-300 bg-indigo-50/40' : 'border-gray-200 bg-white'}`}>
                    <div className="p-6">
                      <div className="flex flex-col md:flex-row md:justify-between gap-4">
                        <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-xl font-bold text-gray-800">{rec.path}</h3>{index === 0 && <span className="bg-indigo-600 text-white text-xs px-3 py-1 rounded-full">Top Match</span>}<span className="bg-gray-100 text-gray-700 text-xs px-3 py-1 rounded-full">{rec.category}</span></div><p className="mt-3 text-sm text-gray-600">{rec.match_reason || `Your profile currently covers ${matched.length} of ${matched.length + missing.length} core skills.`}</p></div>
                        <div className="text-2xl font-bold text-indigo-700">{percent(rec.match_score)}</div>
                      </div>

                      <div className="mt-4 h-2 bg-gray-200 rounded-full"><div className="h-2 rounded-full bg-indigo-600" style={{ width: percent(rec.match_score) }}/></div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 my-5">
                        <div className="p-3 rounded-lg border bg-white"><p className="text-xs text-gray-500">Job outlook reference</p><p className="font-semibold">{rec.job_outlook || 'Not available'}</p></div>
                        <div className="p-3 rounded-lg border bg-white"><p className="text-xs text-gray-500">Salary reference</p><p className="font-semibold">{rec.median_salary || 'Not available'}</p></div>
                        <div className="p-3 rounded-lg border bg-white"><p className="text-xs text-gray-500">Top locations</p><p className="font-semibold text-sm">{safeArray(rec.top_locations).slice(0, 3).join(', ') || 'Not available'}</p></div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div><h4 className="font-semibold text-emerald-700 mb-2">Your matching skills</h4><div className="flex flex-wrap gap-2">{matched.map((skill) => { const verification = getSkillVerificationStatus(skill); return <span key={skill} className="px-3 py-1 rounded-full text-sm bg-emerald-100 text-emerald-800 border border-emerald-200">{skill}{verification.badge ? ` · ${verification.badge}` : ''}</span>; })}</div></div>
                        <div><h4 className="font-semibold text-amber-700 mb-2">Skills to develop</h4><div className="flex flex-wrap gap-2">{missing.map((skill) => <span key={skill} className="px-3 py-1 rounded-full text-sm bg-amber-100 text-amber-800 border border-amber-200">{skill}</span>)}</div></div>
                      </div>

                      {alignedCourses.length > 0 && <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800"><strong>Course-path alignment:</strong> {alignedCourses.map((c) => c.course_name).join(', ')} already overlaps one or more current skill gaps. Keep the course in progress before adding a duplicate beginner recommendation.</div>}

                      <button onClick={() => { setSelectedCareer(selectedCareer?.id === rec.id ? null : rec); setActiveTab('overview'); }} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg mt-5">{selectedCareer?.id === rec.id ? 'Hide Details' : 'View Career Details & Roadmap'}</button>
                    </div>

                    {selectedCareer?.id === rec.id && (
                      <div className="border-t-2 border-indigo-200 bg-white p-6">
                        <div className="flex border-b border-gray-200 mb-4 overflow-x-auto">{['overview', 'certifications', 'degrees', 'next-steps', 'resources'].map((tab) => <button key={tab} className={`px-4 py-2 font-medium text-sm capitalize whitespace-nowrap ${activeTab === tab ? 'border-indigo-500 text-indigo-600 border-b-2' : 'text-gray-500'}`} onClick={() => setActiveTab(tab)}>{tab.replace('-', ' ')}</button>)}</div>
                        {activeTab === 'overview' && <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4"><h5 className="font-semibold text-indigo-800 mb-2">Skill-gap roadmap</h5><p className="text-indigo-700 text-sm">Current match: {percent(rec.match_score)}. Prioritize {missing.slice(0, 3).join(', ') || 'maintaining and demonstrating your current skills'}. Add project, certificate, course, or work evidence as you develop each gap.</p></div>}
                        {activeTab === 'certifications' && <div className="space-y-3">{safeArray(rec.recommended_certifications).map((cert) => <div key={cert.name} className="bg-gray-50 border rounded-lg p-4"><div className="flex justify-between gap-3"><h5 className="font-semibold">{cert.name}</h5><span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded">{cert.provider}</span></div><p className="text-sm text-gray-600 mt-2">{cert.time} · {cert.cost}</p>{cert.url && <a href={cert.url} target="_blank" rel="noreferrer" className="inline-block mt-2 text-indigo-600 hover:underline text-sm">Official certification page</a>}</div>)}</div>}
                        {activeTab === 'degrees' && <div className="space-y-3">{safeArray(rec.recommended_degrees).map((degree) => <div key={degree.name} className="bg-gray-50 border rounded-lg p-4"><h5 className="font-semibold">{degree.name}</h5><p className="text-sm text-gray-600 mt-2">{degree.type} · {degree.duration} · {degree.format}</p></div>)}</div>}
                        {activeTab === 'next-steps' && <ol className="space-y-3">{safeArray(rec.next_steps).map((step, i) => <li key={`${step}-${i}`} className="flex gap-3"><span className="w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm flex-shrink-0">{i + 1}</span><span>{step}</span></li>)}</ol>}
                        {activeTab === 'resources' && <div className="space-y-3">{safeArray(rec.learning_resources).map((resource) => <div key={resource.name} className="bg-gray-50 border rounded-lg p-4"><h5 className="font-semibold">{resource.name}</h5><p className="text-sm text-gray-600 mt-1">{resource.type} · {resource.cost}</p>{resource.url && <a href={resource.url} target="_blank" rel="noreferrer" className="inline-block mt-2 text-indigo-600 hover:underline text-sm">Open learning resource</a>}</div>)}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CareerRecommendations;
