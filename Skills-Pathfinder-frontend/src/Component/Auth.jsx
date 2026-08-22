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

const Logo = () => (
  <div className="flex items-center gap-3">
    <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-cyan-500 text-white shadow-lg shadow-indigo-200">
      <svg viewBox="0 0 48 48" className="h-7 w-7" fill="none" aria-hidden="true">
        <path d="M8 16 24 8l16 8-16 8-16-8Z" fill="currentColor" />
        <path d="M13 22v7c0 5 5 9 11 9s11-4 11-9v-7l-11 5-11-5Z" fill="currentColor" opacity=".75" />
      </svg>
    </div>
    <div>
      <div className="text-lg font-extrabold tracking-tight text-slate-950">Skills Pathfinder</div>
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-600">Student Career Intelligence</div>
    </div>
  </div>
);

const MiniCard = ({ title, value, accent = 'indigo' }) => {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    cyan: 'bg-cyan-50 text-cyan-700 border-cyan-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100'
  };
  return (
    <div className={`rounded-2xl border p-4 ${colors[accent]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{title}</p>
      <p className="mt-2 text-2xl font-extrabold">{value}</p>
    </div>
  );
};

const Input = ({ label, name, value, onChange, type = 'text', placeholder, required = false, autoComplete }) => (
  <label className="block">
    <span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}{required && <span className="text-rose-500"> *</span>}</span>
    <input name={name} value={value} onChange={onChange} type={type} required={required} autoComplete={autoComplete} placeholder={placeholder} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
  </label>
);

const Auth = ({ onAuthSuccess }) => {
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState(initialForm);
  const [verificationCode, setVerificationCode] = useState('');
  const [pendingProfile, setPendingProfile] = useState(null);

  const isLogin = mode === 'login';
  const isReset = mode === 'reset';
  const isVerify = mode === 'verify';

  const handleInputChange = (e) => {
    setFormData((current) => ({ ...current, [e.target.name]: e.target.value }));
    setError(null);
    setSuccessMessage(null);
  };

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setError(null);
    setSuccessMessage(null);
    setShowPassword(false);
    if (nextMode !== 'verify') setVerificationCode('');
  };

  const switchMode = () => changeMode(isLogin ? 'signup' : 'login');

  const saveProfile = async (userId, profile = pendingProfile || formData) => {
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userId,
      full_name: profile.fullName?.trim() || null,
      phone: profile.phone?.trim() || null,
      address: profile.address?.trim() || null,
      city: profile.city?.trim() || null,
      state: profile.state?.trim() || null,
      zip_code: profile.zipCode?.trim() || null,
      has_completed_onboarding: false,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
    if (profileError) throw profileError;
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null); setSuccessMessage(null);
    try {
      const signupEmail = formData.email.trim();
      const profileSnapshot = { ...formData };
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: signupEmail,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName.trim(),
            phone: formData.phone.trim() || null,
            city: formData.city.trim() || null,
            state: formData.state.trim() || null
          },
          emailRedirectTo: `${window.location.origin}/`
        }
      });
      if (signUpError) throw signUpError;

      if (data.user && !data.session) {
        setPendingProfile(profileSnapshot);
        setFormData((current) => ({ ...initialForm, email: signupEmail }));
        setVerificationCode('');
        setMode('verify');
        setSuccessMessage('Account created. Verify your email using either the link in the Supabase email or the verification code shown in that email.');
      } else if (data.user && data.session) {
        await saveProfile(data.user.id, profileSnapshot);
        onAuthSuccess(data.user, true);
      }
    } catch (err) {
      setError(err?.message || 'Account creation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    const email = formData.email.trim();
    const token = verificationCode.trim().replace(/\s+/g, '');
    if (!email || !token) {
      setError('Enter the email address and verification code from the Supabase email.');
      return;
    }
    setLoading(true); setError(null); setSuccessMessage(null);
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'signup'
      });
      if (verifyError) throw verifyError;
      if (!data?.user) throw new Error('Email verification completed but no user session was returned. Please sign in.');

      try {
        await saveProfile(data.user.id);
      } catch (profileError) {
        console.error('Email verified but profile details could not be saved:', profileError);
      }

      setPendingProfile(null);
      setVerificationCode('');
      if (data.session) {
        onAuthSuccess(data.user, true);
      } else {
        setMode('login');
        setSuccessMessage('Email verified successfully. You can now sign in.');
      }
    } catch (err) {
      setError(err?.message || 'The verification code is invalid or expired. Request a new code and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    const email = formData.email.trim();
    if (!email) {
      setError('Enter your account email before requesting another verification email.');
      return;
    }
    setLoading(true); setError(null); setSuccessMessage(null);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${window.location.origin}/` }
      });
      if (resendError) throw resendError;
      setSuccessMessage('A new verification email has been sent. You may use either its link or its verification code.');
    } catch (err) {
      setError(err?.message || 'A new verification email could not be sent. Please try again shortly.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null); setSuccessMessage(null);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: formData.email.trim(), password: formData.password });
      if (signInError) throw signInError;
      onAuthSuccess(data.user);
    } catch (err) {
      const message = err?.message || 'Sign in failed. Check your email and password and try again.';
      setError(message);
      if (/email.*confirm|confirm.*email|email.*verified/i.test(message)) {
        setMode('verify');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    const email = formData.email.trim();
    if (!email) { setError('Enter the email address associated with your account.'); return; }
    setLoading(true); setError(null); setSuccessMessage(null);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/?password-recovery=1`
      });
      if (resetError) throw resetError;
      setSuccessMessage('If an account exists for this email, a password-reset link has been sent. Check your inbox and spam folder.');
    } catch (err) {
      setError(err?.message || 'Password reset could not be requested. Please try again.');
    } finally { setLoading(false); }
  };

  const panelEyebrow = isVerify ? 'Email verification' : isReset ? 'Account recovery' : isLogin ? 'Welcome back' : 'Create your student workspace';
  const panelTitle = isVerify ? 'Verify your email' : isReset ? 'Reset your password' : isLogin ? 'Sign in to continue' : 'Start your profile';

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8 lg:px-10">
          <Logo />
          <div className="hidden items-center gap-6 text-sm font-semibold text-slate-600 md:flex">
            <span>Career matching</span><span>Skill gap analysis</span><span>Learning plans</span>
            {!isReset && !isVerify && <button onClick={switchMode} className="rounded-xl bg-slate-950 px-4 py-2 text-white hover:bg-indigo-700">{isLogin ? 'Create account' : 'Sign in'}</button>}
          </div>
        </div>
      </div>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(99,102,241,0.16),transparent_28%),radial-gradient(circle_at_90%_5%,rgba(6,182,212,0.14),transparent_24%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:px-10 lg:py-16">
          <div className="flex flex-col justify-center">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-indigo-700 shadow-sm">Career planning built around your evidence</div>
            <h1 className="mt-6 max-w-3xl text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl lg:leading-[1.05]">Turn your experience into a clear career direction.</h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">Skills Pathfinder brings your resume, certificates, current courses, and verified skills together to show where you fit, what you are missing, what to learn next, and which careers deserve your attention.</p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3"><MiniCard title="Your evidence" value="Resume + Certs" accent="indigo" /><MiniCard title="Career insight" value="Match + Gap" accent="cyan" /><MiniCard title="Next action" value="30d • 6m • 1y" accent="emerald" /></div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                ['01', 'Build one skill profile', 'Resume, certificates, ongoing courses, and manual updates are combined into one student record.'],
                ['02', 'See your career readiness', 'Compare career matches, missing skills, regulated requirements, and current salary evidence.'],
                ['03', 'Avoid duplicate learning', 'Courses already in progress are recognized before new learning recommendations are made.'],
                ['04', 'Keep your progress', 'Reports, plans, verification results, and career findings are saved for later review.']
              ].map(([number, title, body]) => <div key={number} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex gap-4"><span className="text-sm font-extrabold text-indigo-500">{number}</span><div><h3 className="font-bold text-slate-900">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-500">{body}</p></div></div></div>)}
            </div>
          </div>

          <div className="flex items-center justify-center lg:justify-end">
            <div className="w-full max-w-xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.35)] sm:p-8">
              <div className="mb-7 flex items-center justify-between gap-4"><div><p className="text-sm font-bold text-indigo-600">{panelEyebrow}</p><h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">{panelTitle}</h2></div><div className="rounded-2xl bg-indigo-50 p-3 text-indigo-600"><svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3 4 7l8 4 8-4-8-4Z"/><path d="M6 10v5c0 2 2.7 4 6 4s6-2 6-4v-5"/></svg></div></div>

              {successMessage && <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{successMessage}</div>}
              {error && <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}

              {isVerify ? (
                <form onSubmit={handleVerifyCode} className="space-y-4">
                  <p className="text-sm leading-6 text-slate-600">Supabase may show both a confirmation link and a verification code in the same email. Either method can verify your account. To use the code, enter it below.</p>
                  <Input label="Email address" name="email" value={formData.email} onChange={handleInputChange} type="email" required placeholder="you@example.com" autoComplete="email" />
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-slate-700">Verification code <span className="text-rose-500">*</span></span>
                    <input value={verificationCode} onChange={(e) => { setVerificationCode(e.target.value.replace(/\s+/g, '')); setError(null); }} inputMode="numeric" autoComplete="one-time-code" required placeholder="Enter code from email" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-xl font-bold tracking-[0.25em] text-slate-900 shadow-sm focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
                  </label>
                  <button disabled={loading} className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3.5 font-bold text-white shadow-lg shadow-indigo-200 disabled:opacity-60">{loading ? 'Verifying…' : 'Verify email with code'}</button>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button type="button" disabled={loading} onClick={handleResendVerification} className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-700 disabled:opacity-60">Resend verification email</button>
                    <button type="button" onClick={() => changeMode('login')} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">Back to sign in</button>
                  </div>
                </form>
              ) : isReset ? (
                <form onSubmit={handlePasswordReset} className="space-y-4">
                  <p className="text-sm leading-6 text-slate-600">Enter the email address used for your Skills Pathfinder account. We will send a secure recovery link so you can choose a new password.</p>
                  <Input label="Email address" name="email" value={formData.email} onChange={handleInputChange} type="email" required placeholder="you@example.com" autoComplete="email" />
                  <button disabled={loading} className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3.5 font-bold text-white shadow-lg shadow-indigo-200 disabled:opacity-60">{loading ? 'Sending…' : 'Send password reset link'}</button>
                  <button type="button" onClick={() => changeMode('login')} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">Back to sign in</button>
                </form>
              ) : (
                <form onSubmit={isLogin ? handleSignIn : handleSignUp} className="space-y-4">
                  {!isLogin && <Input label="Full name" name="fullName" value={formData.fullName} onChange={handleInputChange} required placeholder="Your full name" autoComplete="name" />}
                  <Input label="Email address" name="email" value={formData.email} onChange={handleInputChange} type="email" required placeholder="you@example.com" autoComplete="email" />
                  <label className="block"><div className="mb-1.5 flex items-center justify-between gap-3"><span className="text-sm font-semibold text-slate-700">Password <span className="text-rose-500">*</span></span>{isLogin && <button type="button" onClick={() => changeMode('reset')} className="text-xs font-bold text-indigo-600 hover:text-indigo-800">Forgot password?</button>}</div><div className="relative"><input type={showPassword ? 'text' : 'password'} name="password" value={formData.password} onChange={handleInputChange} required minLength={8} autoComplete={isLogin ? 'current-password' : 'new-password'} placeholder={isLogin ? 'Enter your password' : 'At least 8 characters'} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-20 shadow-sm transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /><button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute inset-y-0 right-3 my-auto h-8 rounded-lg px-2 text-xs font-bold text-slate-500 hover:bg-slate-100">{showPassword ? 'Hide' : 'Show'}</button></div></label>

                  {!isLogin && <details className="group rounded-xl border border-slate-200 bg-slate-50"><summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-slate-700"><div className="flex items-center justify-between"><span>Contact information <span className="font-normal text-slate-400">(optional)</span></span><span className="transition group-open:rotate-180">⌄</span></div></summary><div className="grid gap-4 border-t border-slate-200 p-4"><Input label="Phone" name="phone" value={formData.phone} onChange={handleInputChange} type="tel" placeholder="Phone number" autoComplete="tel" /><Input label="Street address" name="address" value={formData.address} onChange={handleInputChange} placeholder="Street address" autoComplete="street-address" /><div className="grid gap-4 sm:grid-cols-2"><Input label="City" name="city" value={formData.city} onChange={handleInputChange} placeholder="City" /><Input label="State" name="state" value={formData.state} onChange={handleInputChange} placeholder="State" /></div><Input label="ZIP code" name="zipCode" value={formData.zipCode} onChange={handleInputChange} placeholder="ZIP code" /></div></details>}
                  <button disabled={loading} className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3.5 font-bold text-white shadow-lg shadow-indigo-200 transition hover:-translate-y-0.5 hover:from-indigo-700 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-60">{loading ? 'Please wait...' : isLogin ? 'Sign in to Skills Pathfinder' : 'Create my account'}</button>
                </form>
              )}

              {!isReset && !isVerify && <div className="mt-6 border-t border-slate-200 pt-5 text-center text-sm text-slate-500">{isLogin ? 'New to Skills Pathfinder?' : 'Already have an account?'}{' '}<button onClick={switchMode} className="font-bold text-indigo-600 hover:text-indigo-800">{isLogin ? 'Create an account' : 'Sign in'}</button></div>}
              <p className="mt-5 text-center text-xs leading-5 text-slate-400">Career guidance is informational. Regulated professions can require specific education, examinations, licensing, or supervised experience.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Auth;
