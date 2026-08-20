import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import OnboardingWizard from './OnboardingWizard';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const ACTIVE_DRAFT_KEY = 'onboarding:active';
const normalize = (value = '') => String(value).trim().toLowerCase().replace(/\s+/g, ' ');

const OnboardingWizardV2 = (props) => {
  const { user } = props;
  const [ready, setReady] = useState(false);
  const [warning, setWarning] = useState(null);

  useEffect(() => {
    let active = true;

    const mergeSavedCoursesIntoDraft = async () => {
      if (!user?.id) {
        if (active) setReady(true);
        return;
      }

      try {
        const [draftResult, coursesResult] = await Promise.all([
          supabase
            .from('career_findings')
            .select('*')
            .eq('user_id', user.id)
            .eq('client_record_key', ACTIVE_DRAFT_KEY)
            .maybeSingle(),
          supabase
            .from('ongoing_courses')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true })
        ]);

        if (draftResult.error) throw draftResult.error;
        if (coursesResult.error) throw coursesResult.error;

        const savedCourses = coursesResult.data || [];
        const draft = draftResult.data?.data || {};
        const draftCourses = Array.isArray(draft.courses) ? draft.courses : [];
        const merged = new Map();

        const add = (course) => {
          if (!course) return;
          const key = course.id || course.client_record_key || normalize(course.course_name);
          if (!key) return;
          merged.set(key, { ...course, item_key: course.item_key || course.client_record_key || course.id });
        };

        savedCourses.forEach(add);
        draftCourses.forEach(add);
        const courses = Array.from(merged.values());

        if (savedCourses.length || draftResult.data) {
          const payload = {
            session_key: draft.session_key || globalThis.crypto?.randomUUID?.() || `session-${Date.now()}`,
            step: Math.min(Math.max(Number(draft.step) || 1, 1), 4),
            resume_data: draft.resume_data || null,
            certificates: Array.isArray(draft.certificates) ? draft.certificates : [],
            courses,
            updated_at: new Date().toISOString()
          };

          const { error: upsertError } = await supabase.from('career_findings').upsert({
            user_id: user.id,
            client_record_key: ACTIVE_DRAFT_KEY,
            finding_type: 'onboarding_draft',
            source_type: 'profile_builder',
            title: 'Active profile builder progress',
            status: 'in_progress',
            data: payload,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id,client_record_key' });
          if (upsertError) throw upsertError;
        }
      } catch (error) {
        console.error('Saved course merge failed:', error);
        if (active) setWarning('Some previously saved course data could not be preloaded. Your original database records were not changed.');
      } finally {
        if (active) setReady(true);
      }
    };

    mergeSavedCoursesIntoDraft();
    return () => { active = false; };
  }, [user?.id]);

  if (!ready) {
    return <div className="min-h-[50vh] grid place-items-center"><div className="text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" /><p className="mt-4 text-sm text-slate-500">Loading your complete saved profile…</p></div></div>;
  }

  return <div>{warning && <div className="mx-auto mt-4 max-w-5xl rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{warning}</div>}<OnboardingWizard {...props} /></div>;
};

export default OnboardingWizardV2;
