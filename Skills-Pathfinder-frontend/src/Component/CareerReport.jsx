import { useState, useEffect, useRef } from 'react';
import html2pdf from 'html2pdf.js';

const CareerReport = ({ user, profile, skills, certifications, courses, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [advice, setAdvice] = useState(null);
  const reportRef = useRef();

  useEffect(() => {
    fetchAdvice();
  }, []);

  const fetchAdvice = async () => {
    setLoading(true);
    try {
      // Extract skill names - handle both data structures
      const skillNames = skills.map(s => {
        if (s.skill_name) return s.skill_name; // From skill_tracking
        if (s.name) return s.name; // From resume_analyses
        if (typeof s === 'string') return s;
        return '';
      }).filter(name => name !== '');
      
      const res = await fetch('http://localhost:8000/api/generate-career-advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: skillNames })
      });
      const data = await res.json();
      if (data.status === 'success') setAdvice(data.advice);
    } catch (err) {
      console.error('Error fetching advice:', err);
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = () => {
    const element = reportRef.current;
    const opt = {
      margin: 0.5,
      filename: `Skills_Pathfinder_Report_${user?.email || 'User'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white p-8 rounded-xl shadow-2xl text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-lg font-semibold text-gray-800">AI is generating your personalized career report...</p>
          <p className="text-sm text-gray-500 mt-2">This may take a few seconds.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-900/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl my-8 flex flex-col max-h-[90vh]">
        
        {/* Toolbar */}
        <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl sticky top-0 z-10">
          <h2 className="text-xl font-bold text-gray-800">Career Intelligence Report</h2>
          <div className="flex gap-3">
            <button onClick={downloadPDF} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              Download PDF
            </button>
            <button onClick={onClose} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-medium">Close</button>
          </div>
        </div>

        {/* Report Content */}
        <div className="overflow-y-auto p-8" ref={reportRef} style={{ backgroundColor: 'white' }}>
          
          {/* Header */}
          <div className="border-b-2 border-indigo-600 pb-6 mb-8">
            <h1 className="text-4xl font-bold text-indigo-900 mb-2">Skills Pathfinder</h1>
            <p className="text-xl text-gray-600">Comprehensive Career Analysis Report</p>
            <p className="text-sm text-gray-500 mt-2">Generated for: {profile?.full_name || user?.email} | Date: {new Date().toLocaleDateString()}</p>
          </div>

          {/* Executive Summary */}
          {advice && advice.executive_summary && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-3 border-l-4 border-indigo-600 pl-3">Executive Summary</h2>
              <p className="text-gray-700 leading-relaxed text-lg">{advice.executive_summary}</p>
            </div>
          )}

          {/* SWOT Analysis */}
          {advice && advice.swot_analysis && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-4 border-l-4 border-indigo-600 pl-3">SWOT Analysis</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <h3 className="font-bold text-green-800 mb-2">Strengths</h3>
                  <ul className="list-disc list-inside text-sm text-gray-700">
                    {advice.swot_analysis.strengths.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
                <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                  <h3 className="font-bold text-red-800 mb-2">Weaknesses</h3>
                  <ul className="list-disc list-inside text-sm text-gray-700">
                    {advice.swot_analysis.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <h3 className="font-bold text-blue-800 mb-2">Opportunities</h3>
                  <ul className="list-disc list-inside text-sm text-gray-700">
                    {advice.swot_analysis.opportunities.map((o, i) => <li key={i}>{o}</li>)}
                  </ul>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                  <h3 className="font-bold text-yellow-800 mb-2">Threats</h3>
                  <ul className="list-disc list-inside text-sm text-gray-700">
                    {advice.swot_analysis.threats.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Current Profile Snapshot */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 border-l-4 border-indigo-600 pl-3">Current Profile Snapshot</h2>
            
            <div className="grid grid-cols-3 gap-6 mb-6">
              <div className="bg-gray-50 p-4 rounded-lg text-center">
                <p className="text-3xl font-bold text-indigo-600">{skills.length}</p>
                <p className="text-sm text-gray-600">Verified Skills</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg text-center">
                <p className="text-3xl font-bold text-indigo-600">{certifications.length}</p>
                <p className="text-sm text-gray-600">Certifications</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg text-center">
                <p className="text-3xl font-bold text-indigo-600">{courses ? courses.length : 0}</p>
                <p className="text-sm text-gray-600">Ongoing Courses</p>
              </div>
            </div>

            <h3 className="font-semibold text-gray-700 mb-2">Top Skills Identified:</h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {skills.slice(0, 15).map((s, i) => {
                const skillName = s.skill_name || s.name || s;
                return (
                  <span key={i} className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm font-medium">
                    {skillName}
                  </span>
                );
              })}
            </div>

            {/* Ongoing Courses Section */}
            {courses && courses.length > 0 && (
              <div className="mt-6">
                <h3 className="font-semibold text-gray-700 mb-2">Ongoing Courses:</h3>
                <div className="space-y-2">
                  {courses.map((course, i) => (
                    <div key={i} className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-gray-800">{course.course_name}</p>
                          {course.provider && <p className="text-sm text-gray-600">{course.provider}</p>}
                          {course.expected_completion_date && (
                            <p className="text-xs text-gray-500 mt-1">
                              Expected: {new Date(course.expected_completion_date).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                          In Progress
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 30-60-90 Day Plan */}
          {advice && advice.action_plan && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-4 border-l-4 border-indigo-600 pl-3">30-60-90 Day Action Plan</h2>
              <div className="space-y-4">
                <div className="flex gap-4 items-start">
                  <div className="bg-indigo-600 text-white font-bold px-4 py-2 rounded-lg min-w-[80px] text-center">30 Days</div>
                  <p className="text-gray-700 pt-2">{advice.action_plan['30_days'] || 'N/A'}</p>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="bg-indigo-600 text-white font-bold px-4 py-2 rounded-lg min-w-[80px] text-center">60 Days</div>
                  <p className="text-gray-700 pt-2">{advice.action_plan['60_days'] || 'N/A'}</p>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="bg-indigo-600 text-white font-bold px-4 py-2 rounded-lg min-w-[80px] text-center">90 Days</div>
                  <p className="text-gray-700 pt-2">{advice.action_plan['90_days'] || 'N/A'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="mt-12 pt-6 border-t text-center text-gray-500 text-sm">
            <p>Generated by Skills Pathfinder AI • Confidential Career Document</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CareerReport;