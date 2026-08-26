import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const PasswordRecovery = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const updatePassword = async (event) => {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Use at least 8 characters for your new password.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setSuccess(true);
      setPassword('');
      setConfirmPassword('');
      await supabase.auth.signOut();
      window.history.replaceState({}, document.title, '/');
    } catch (err) {
      setError(err?.message || 'Your password could not be updated. Request a new recovery link and try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-100 text-2xl text-emerald-700">✓</div>
          <h1 className="mt-5 text-2xl font-extrabold text-slate-950">Password updated</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Your new password is ready. Sign in again to continue to your Skills Pathfinder workspace.</p>
          <a href="/" className="mt-6 inline-flex w-full justify-center rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white hover:bg-indigo-700">Return to sign in</a>
        </section>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl sm:p-8">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">Skills Pathfinder account recovery</p>
          <h1 className="mt-2 text-2xl font-extrabold text-slate-950">Choose a new password</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Enter a new password for your account. For security, you will sign in again after it is changed.</p>
        </div>
        {error && <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
        <form onSubmit={updatePassword} className="space-y-4">
          <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">New password</span><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required autoComplete="new-password" className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="At least 8 characters" /></label>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">Confirm new password</span><input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required autoComplete="new-password" className="w-full rounded-xl border border-slate-200 px-4 py-3 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" placeholder="Enter it again" /></label>
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} /> Show passwords</label>
          <button disabled={loading} className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3.5 font-bold text-white shadow-lg shadow-indigo-200 disabled:opacity-60">{loading ? 'Updating…' : 'Update password'}</button>
        </form>
        <a href="/" className="mt-5 block text-center text-sm font-bold text-indigo-600 hover:text-indigo-800">Cancel and return to sign in</a>
      </section>
    </main>
  );
};

export default PasswordRecovery;
