const ProjectFooter = () => (
  <footer className="mt-10 border-t border-slate-800 bg-slate-950 text-slate-300">
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="grid gap-6 md:grid-cols-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-400">Master's Project</p>
          <h2 className="mt-2 text-lg font-black text-white">Skills Pathfinder</h2>
          <p className="mt-1 text-sm text-slate-400">Connecting Talent to Opportunity</p>
          <p className="mt-3 text-xs leading-5 text-slate-500">AI-powered software/web application for career matching, skill-gap analysis, learning recommendations and career development planning.</p>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-400">Academic & Project Information</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div><dt className="inline font-semibold text-slate-200">Course: </dt><dd className="inline">AI Hootcamp Summer 2026</dd></div>
            <div><dt className="inline font-semibold text-slate-200">University: </dt><dd className="inline">Florida Atlantic University</dd></div>
            <div><dt className="inline font-semibold text-slate-200">Supervisor: </dt><dd className="inline">Dr. David Jaram</dd></div>
            <div><dt className="inline font-semibold text-slate-200">Sponsor / Organization: </dt><dd className="inline">U.S. Department of Education</dd></div>
            <div><dt className="inline font-semibold text-slate-200">Project type: </dt><dd className="inline">AI-powered software / web application</dd></div>
          </dl>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-400">Developed By</p>
          <p className="mt-3 font-bold text-white">Md Ferdouse Hossain Bhuiya</p>
          <p className="mt-1 text-sm"><span className="font-semibold text-slate-200">Z-Number:</span> Z23975522</p>
          <p className="mt-1 text-sm"><span className="font-semibold text-slate-200">Phone:</span> (954) 325-2242</p>
          <p className="mt-3 text-xs leading-5 text-slate-500">Project contact coordination is available through the AI Hootcamp Coordinator.</p>
        </div>
      </div>

      <div className="mt-7 flex flex-col gap-2 border-t border-slate-800 pt-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>Skills Pathfinder · Connecting Talent to Opportunity</p>
        <p>Florida Atlantic University · AI Hootcamp Summer 2026</p>
      </div>
    </div>
  </footer>
);

export default ProjectFooter;
