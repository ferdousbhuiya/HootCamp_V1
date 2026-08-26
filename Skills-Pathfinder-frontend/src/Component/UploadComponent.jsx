import { useRef, useState } from 'react';

const emptyGuided = {
  summary: '', education: '', experience: '', projects: '', skills: '', certifications: '', activities: ''
};

const UploadComponent = ({ onUploadSuccess, onUploadError, isLoading, setIsLoading }) => {
  const fileInputRef = useRef(null);
  const progressTimerRef = useRef(null);
  const [mode, setMode] = useState('upload');
  const [error, setError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [pastedText, setPastedText] = useState('');
  const [guided, setGuided] = useState(emptyGuided);

  const MAX_FILE_SIZE = 15 * 1024 * 1024;
  const ANALYSIS_TIMEOUT_MS = 150000;
  const validTypes = ['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/png','image/jpeg','image/jpg','text/plain'];
  const validExtensions = ['.pdf', '.docx', '.png', '.jpg', '.jpeg', '.txt'];

  const validateFile = (file) => {
    const ext = '.' + (file.name?.split('.').pop() || '').toLowerCase();
    if (!validTypes.includes(file.type) && !validExtensions.includes(ext)) return 'Invalid file type. Supported: PDF, DOCX, PNG, JPG, JPEG, TXT';
    if (file.size > MAX_FILE_SIZE) return `File is too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`;
    return null;
  };

  const stopProgressTimer = () => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  const startProgressTimer = () => {
    stopProgressTimer();
    const startedAt = Date.now();
    setElapsedSeconds(0);
    setUploadProgress('Reading your document and extracting evidence...');
    progressTimerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setElapsedSeconds(elapsed);
      if (elapsed >= 70) {
        setUploadProgress('Finalizing career matches. Complex resumes can take a little longer...');
      } else if (elapsed >= 35) {
        setUploadProgress('Building profession-specific career matches and readiness evidence...');
      } else if (elapsed >= 12) {
        setUploadProgress('Organizing skills, education, credentials and experience...');
      }
    }, 1000);
  };

  const processFile = async (file) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      onUploadError({ message: validationError });
      return;
    }

    setError(null);
    setSelectedFile(file);
    setIsLoading(true);
    startProgressTimer();
    const formData = new FormData();
    formData.append('file', file);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);

    try {
      const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const response = await fetch(`${apiUrl}/api/upload`, { method: 'POST', body: formData, signal: controller.signal });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || `Server error: ${response.status}`);
      }
      const data = await response.json();
      stopProgressTimer();
      setUploadProgress('Saving skills, evidence and career findings...');
      await onUploadSuccess(data, file);
      setUploadProgress('Analysis saved successfully.');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      const message = err.name === 'AbortError'
        ? 'Analysis is taking unusually long. Please try again. Your document was not deleted or changed.'
        : (err.message || 'The document could not be analyzed.');
      setError(message);
      onUploadError({ message });
    } finally {
      clearTimeout(timeoutId);
      stopProgressTimer();
      setIsLoading(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target?.files ? e.target.files[0] : e;
    if (file) processFile(file);
  };

  const analyzePastedText = () => {
    const text = pastedText.trim();
    if (text.length < 40) return setError('Please paste enough information for a meaningful analysis.');
    processFile(new File([text], 'pasted-resume.txt', { type: 'text/plain' }));
  };

  const analyzeGuidedResume = () => {
    const sections = [
      ['SUMMARY / CAREER INTEREST', guided.summary],
      ['EDUCATION', guided.education],
      ['EXPERIENCE / VOLUNTEERING', guided.experience],
      ['PROJECTS / LABS / RESEARCH', guided.projects],
      ['SKILLS / TOOLS / LANGUAGES', guided.skills],
      ['CERTIFICATIONS / TRAINING', guided.certifications],
      ['ACTIVITIES / LEADERSHIP', guided.activities]
    ].filter(([, value]) => value.trim());
    if (sections.length < 2) return setError('Please complete at least two sections before analyzing your profile.');
    const text = sections.map(([title, value]) => `${title}\n${value.trim()}`).join('\n\n');
    processFile(new File([text], 'guided-student-profile.txt', { type: 'text/plain' }));
  };

  const tabs = [
    ['upload', 'Upload resume'], ['paste', 'Paste resume'], ['guided', 'Build profile manually']
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Resume is optional</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-900">Tell us what you have done so far</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Upload an existing resume, paste one, or build a simple student profile. All three paths use the same AI skill and career analysis.</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 rounded-xl bg-slate-100 p-1.5">
        {tabs.map(([key, label]) => <button key={key} type="button" onClick={() => { setMode(key); setError(null); }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${mode === key ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{label}</button>)}
      </div>

      {mode === 'upload' && (
        <div
          className={`rounded-2xl border-2 border-dashed p-8 text-center transition-all ${isLoading ? 'cursor-not-allowed border-slate-200 bg-slate-50' : 'cursor-pointer border-teal-200 bg-teal-50/40 hover:border-teal-400 hover:bg-teal-50'}`}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (!isLoading && e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); }}
          onClick={() => !isLoading && fileInputRef.current?.click()}
        >
          <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} accept=".pdf,.docx,.png,.jpg,.jpeg,.txt" disabled={isLoading} />
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white text-teal-700 shadow-sm">{isLoading ? <span className="h-7 w-7 animate-spin rounded-full border-4 border-teal-100 border-t-teal-600" /> : '↑'}</div>
          <h3 className="text-lg font-bold text-slate-900">{isLoading ? `Processing ${selectedFile?.name || 'document'}...` : 'Drop a resume or supporting profile document'}</h3>
          <p className="mt-2 text-sm text-slate-500">{isLoading ? uploadProgress : 'PDF, DOCX, PNG, JPG, JPEG or TXT, up to 15MB'}</p>
          {isLoading && <p className="mt-2 text-xs font-semibold text-slate-400">Elapsed: {elapsedSeconds}s · Please keep this page open while the analysis finishes.</p>}
        </div>
      )}

      {mode === 'paste' && (
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-800">Paste your resume, bio, academic summary, or experience notes</label>
          <textarea rows={14} value={pastedText} onChange={(e) => setPastedText(e.target.value)} placeholder="Paste text here. It does not need to be perfectly formatted." className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6" />
          <button type="button" onClick={analyzePastedText} disabled={isLoading} className="mt-4 rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50">{isLoading ? 'Analyzing…' : 'Analyze pasted profile'}</button>
        </div>
      )}

      {mode === 'guided' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[
            ['summary','Career interest or short introduction','Example: First-year biology student interested in healthcare, research, or biotechnology.'],
            ['education','Education','School, program, major, diploma, degree, dates, notable subjects.'],
            ['experience','Experience or volunteering','Jobs, internships, volunteering, campus work, family business experience.'],
            ['projects','Projects, labs or research','Class projects, lab work, research, capstone work, competitions.'],
            ['skills','Skills and tools','Software, lab techniques, languages, equipment, communication, technical skills.'],
            ['certifications','Certifications or training','Diploma, trade, vocational, safety, professional or online certificates.'],
            ['activities','Activities and leadership','Clubs, organizations, sports, leadership, community service.']
          ].map(([field, label, placeholder]) => <div key={field} className={field === 'summary' ? 'md:col-span-2' : ''}><label className="mb-1 block text-sm font-semibold text-slate-800">{label}</label><textarea rows={field === 'summary' ? 3 : 5} value={guided[field]} onChange={(e) => setGuided({ ...guided, [field]: e.target.value })} placeholder={placeholder} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" /></div>)}
          <div className="md:col-span-2"><button type="button" onClick={analyzeGuidedResume} disabled={isLoading} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50">{isLoading ? 'Analyzing…' : 'Analyze my student profile'}</button></div>
        </div>
      )}

      {selectedFile && !isLoading && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">Selected: {selectedFile.name}</div>}
      {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
    </div>
  );
};

export default UploadComponent;
