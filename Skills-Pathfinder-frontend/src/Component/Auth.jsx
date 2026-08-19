import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const initialForm = {
  email: '',
  password: '',
  fullName: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  zipCode: ''
};

const BrandMark = ({ compact = false }) => (
  <div className="flex items-center gap-3">
    <div className={`${compact ? 'h-10 w-10' : 'h-12 w-12'} relative grid place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-400 shadow-lg shadow-indigo-900/20`}>
      <svg viewBox="0 0 48 48" aria-hidden="true" className="h-7 w-7 text-white" fill="none">
        <path d="M9 16.5 24 9l15 7.5L24 24 9 16.5Z" fill="currentColor" opacity=".95" />
        <path d="M14 21.5V29c0 4.5 4.5 8 10 8s10-3.5 10-8v-7.5L24 27l-10-5.5Z" fill="currentColor" opacity=".72" />
        <path d="M39 17v12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
    <div>
      <div className={`${compact ? 'text-lg' : 'text-xl'} font-bold tracking-tight text-slate-900`}>Skills Pathfinder</div>
      {!compact && <div className="text-xs font-medium uppercase tracking-[0.2em] text-indigo-600">Career intelligence for students</div>}
    </div>
  </div>
);

const Feature = ({ icon, title, children }) => (
  <div className="flex gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
    <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-white/10 text-lg">{icon}</div>
    <div>
      <h3 className="font-semibold text-white">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-300">{children}</p>
    </div>
  </div>
);

const InputField = ({ label, name, value, onChange, type = 'text', placeholder, required = false, autoComplete }) => (
  <label className="block">
    <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}{required && <span className="text-rose-500"> *</span>}</span>
    <input
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      required={required}
      autoComplete={autoComplete}
      placeholder={placeholder}
      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
    />
  </label>
);

const Auth = ({ onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState(initialForm);

  const handleInputChange = (e) => {
    setFormData((current) => ({ ...current, [e.target.name]: e.target.value }));
    setError(null);
    setSuccessMessage(null);
  };

  const switchMode = () => {
    setIsLogin((current) => !current);
    setError(null);
    setSuccessMessage(null);
    setShowPassword(false);
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: formData.email.trim(),
        password: formData.password,
        options: {
          data: { full_name: formData.fullName.trim() },
          emailRedirectTo: `${window.location.origin}/`
        }
      });

      if (signUpError) throw signUpError;

      if (data.user && !data.session) {
        setSuccessMessage('Account created. Check your email to verify your address, then return here to sign in.');
        setFormData(initialForm);
        setIsLogin(true);
      } else if (data.user && data.session) {
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: data.user.id,
            full_name: formData.fullName.trim(),
            phone: formData.phone.trim() || null,
            address: formData.address.trim() || null,
            city: formData.city.trim() || null,
            state: formData.state.trim() || null,
            zip_code: formData.zipCode.trim() || null,
            has_completed_onboarding: false,
            updated_at: new Date().toISOString()
          }, { onConflict: 'id' });

        if (profileError) throw profileError;
        onAuthSuccess(data.user, true);
      }
    } catch (err) {
      setError(err?.message || 'Account creation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email.trim(),
        password: formData.password
      });
      if (signInError) throw signInError;
      onAuthSuccess(data.user);
    } catch (err) {
      setError(err?.message || 'Sign in failed. Check your email and password and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-900">
      <div className="relative isolate min-h-screen overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -left-40 -top-48 h-[34rem] w-[34rem] rounded-full bg-indigo-600/25 blur-3xl" />
          <div className="absolute -right-40 top-1/3 h-[30rem] w-[30rem] rounded-full bg-cyan-500/15 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.18),transparent_35%),linear-gradient(to_bottom,rgba(15,23,42,0.1),rgba(15,23,42,0.75))]" />
        </div>

        <div className="relative mx-auto grid min-h-screen max-w-7xl lg:grid-cols-[1.08fr_0.92fr]">
          <section className="order-2 flex flex-col justify-between px-6 py-8 text-white sm:px-10 lg:order-1 lg:px-14 lg:py-12">
            <div className="hidden lg:block">
              <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-lg shadow-indigo-950/30">
                  <svg viewBox="0 0 48 48" aria-hidden="true" className="h-6 w-6 text-white" fill="none">
                    <path d="M9 16.5 24 9l15 7.5L24 24 9 16.5Z" fill="currentColor" />
                    <path d="M14 21.5V29c0 4.5 4.5 8 10 8s10-3.5 10-8v-7.5L24 27l-10-5.5Z" fill="currentColor" opacity=".7" />
                  </svg>
                </div>
                <div>
                  <div className="font-bold tracking-tight">Skills Pathfinder</div>
                  <div className="text-xs text-slate-300">Built for student career decisions</div>
                </div>
              </div>
            </div>

            <div className="mx-auto max-w-2xl py-10 lg:mx-0 lg:py-16">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
                From evidence to a practical career plan
              </div>
              <h1 className="max-w-xl text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl lg:leading-[1.05]">
                Discover where your skills can take you.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
                Upload your resume and certificates, track what you are learning, and turn your real experience into career matches, skill gaps, and a step-by-step development plan.
              </p>

              <div className="mt-9 grid gap-3 sm:grid-cols-2">
                <Feature icon="✦" title="Evidence-based skill profile">Skills are traced back to resumes, certificates, courses, and student updates.</Feature>
                <Feature icon="◎" title="Career fit you can understand">See matched skills, missing skills, readiness, and requirements for each path.</Feature>
                <Feature icon="↗" title="Learning path that adapts">Ongoing courses are recognized so recommendations build on what you already started.</Feature>
                <Feature icon="✓" title="Saved progress">Your findings, plans, and updates are stored so you can return and continue later.</Feature>
              </div>

              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-400">
                <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Broad career coverage</span>
                <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-cyan-400" /> Certificate verification support</span>
                <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-violet-400" /> Private student workspace</span>
              </div>
            </div>

            <p className="hidden text-xs leading-5 text-slate-500 lg:block">
              Career guidance is informational. Regulated professions may require specific education, examinations, licensing, or supervised experience.
            </p>
          </section>

          <section className="order-1 flex items-center justify-center bg-slate-50/95 px-4 py-8 sm:px-8 lg:order-2 lg:bg-white lg:px-12">
            <div className="w-full max-w-lg">
              <div className="mb-7 lg:hidden">
                <BrandMark />
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-950/10 sm:p-8">
                <div className="mb-7">
                  <p className="text-sm font-semibold text-indigo-600">{isLogin ? 'Welcome back' : 'Start your student profile'}</p>
                  <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                    {isLogin ? 'Sign in to continue' : 'Create your account'}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {isLogin ? 'Continue your saved career analysis, courses, certificates, and plans.' : 'Your profile becomes the foundation for personalized skill and career recommendations.'}
                  </p>
                </div>

                {successMessage && (
                  <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">
                    <div className="flex gap-3"><span aria-hidden="true">✓</span><span>{successMessage}</span></div>
                  </div>
                )}

                {error && (
                  <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800">
                    <div className="flex gap-3"><span aria-hidden="true">!</span><span>{error}</span></div>
                  </div>
                )}

                <form onSubmit={isLogin ? handleSignIn : handleSignUp} className="space-y-4">
                  {!isLogin && (
                    <InputField label="Full name" name="fullName" value={formData.fullName} onChange={handleInputChange} required placeholder="Your full name" autoComplete="name" />
                  )}

                  <InputField label="Email address" name="email" value={formData.email} onChange={handleInputChange} type="email" required placeholder="you@example.com" autoComplete="email" />

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">Password <span className="text-rose-500">*</span></span>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        value={formData.password}
                        onChange={handleInputChange}
                        required
                        minLength={8}
                        autoComplete={isLogin ? 'current-password' : 'new-password'}
                        placeholder={isLogin ? 'Enter your password' : 'At least 8 characters'}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-20 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                      />
                      <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute inset-y-0 right-3 my-auto h-8 rounded-lg px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {!isLogin && <span className="mt-1.5 block text-xs text-slate-400">Use 8 or more characters.</span>}
                  </label>

                  {!isLogin && (
                    <details className="group rounded-xl border border-slate-200 bg-slate-50">
                      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-700 marker:hidden">
                        <div className="flex items-center justify-between">
                          <span>Add contact information <span className="font-normal text-slate-400">(optional)</span></span>
                          <span className="transition group-open:rotate-180">⌄</span>
                        </div>
                      </summary>
                      <div className="grid gap-4 border-t border-slate-200 p-4">
                        <InputField label="Phone number" name="phone" value={formData.phone} onChange={handleInputChange} type="tel" placeholder="+1 (555) 123-4567" autoComplete="tel" />
                        <InputField label="Street address" name="address" value={formData.address} onChange={handleInputChange} placeholder="Street address" autoComplete="street-address" />
                        <div className="grid gap-4 sm:grid-cols-2">
                          <InputField label="City" name="city" value={formData.city} onChange={handleInputChange} placeholder="City" autoComplete="address-level2" />
                          <InputField label="State" name="state" value={formData.state} onChange={handleInputChange} placeholder="State" autoComplete="address-level1" />
                        </div>
                        <InputField label="ZIP code" name="zipCode" value={formData.zipCode} onChange={handleInputChange} placeholder="ZIP code" autoComplete="postal-code" />
                      </div>
                    </details>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />Please wait</span>
                    ) : isLogin ? 'Sign in to Skills Pathfinder' : 'Create student account'}
                  </button>
                </form>

                <div className="mt-6 border-t border-slate-100 pt-5 text-center">
                  <p className="text-sm text-slate-500">
                    {isLogin ? 'New to Skills Pathfinder?' : 'Already have an account?'}{' '}
                    <button type="button" onClick={switchMode} className="font-semibold text-indigo-600 hover:text-indigo-800">
                      {isLogin ? 'Create an account' : 'Sign in'}
                    </button>
                  </p>
                </div>
              </div>

              <p className="mt-5 px-2 text-center text-xs leading-5 text-slate-400">
                Your documents and career findings are associated with your account so you can return to them later.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
};

export default Auth;
