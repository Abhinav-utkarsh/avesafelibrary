import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { z } from 'zod';
import { ArrowLeft, Eye, EyeOff, Lock, Mail, UserCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ThemeToggle } from '../../components/common/ThemeToggle';
import { BrandMark } from '../../components/common/BrandMark';

const studentLoginSchema = z.object({
  email: z.string().trim().min(2, 'Please enter your registered email or Registration ID.'),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
});

export function StudentLoginPage() {
  const {
    firebaseUser,
    role,
    studentAuthMode,
    roleLoading,
    authError,
    clearAuthError,
    signInWithGoogle,
    signInWithEmail,
    logout,
    refreshRoleState,
  } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if ((firebaseUser || studentAuthMode === 'password') && !roleLoading && role === 'student') {
      navigate('/student/home', { replace: true });
    }
  }, [firebaseUser, studentAuthMode, role, roleLoading, navigate]);

  const handleGoogleSignIn = async () => {
    setFormError(null);
    clearAuthError();
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    clearAuthError();

    const parsed = studentLoginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message || 'Please check your credentials.');
      return;
    }

    setSubmitting(true);
    try {
      await signInWithEmail(parsed.data.email, parsed.data.password, { portal: 'student' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = formError || authError;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="px-4 sm:px-6 py-4 flex items-center justify-between max-w-5xl w-full mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-2 min-h-[44px] text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-[#0B1F3A] dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Home
        </Link>
        <ThemeToggle compact />
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 surface-elevated"
        >
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-4">
              <BrandMark size="md" />
              <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Av_eSAFE Library · Student Access
              </p>
            </div>
            <h1 className="font-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
              Student Mobile Portal
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Sign in with the email registered at Av_eSAFE Library reception to view your seat, fee bills, receipts, and attendance.
            </p>
          </div>

          {firebaseUser && !roleLoading && role !== 'student' ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800/70 text-sm space-y-1.5">
                <p className="font-semibold text-slate-900 dark:text-white">
                  {role === 'admin'
                    ? 'Signed in with an Administrator account'
                    : 'No active student enrollment found'}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Verified email: <span className="font-mono">{firebaseUser.email}</span>.{' '}
                  {role === 'admin'
                    ? 'You can open the Admin Portal directly or sign out to test a student account.'
                    : 'Ask the Av_eSAFE Library reception desk to link this email to your student admission record.'}
                </p>
              </div>

              <div className="flex flex-col gap-2.5">
                {role === 'admin' && (
                  <Link
                    to="/admin/dashboard"
                    className="w-full min-h-[48px] inline-flex items-center justify-center rounded-xl bg-[#0B1F3A] dark:bg-blue-600 text-white text-sm font-semibold hover:bg-[#132E54] transition-colors"
                  >
                    Open Admin Portal
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => void refreshRoleState()}
                  className="w-full min-h-[48px] rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Refresh Enrollment Status
                </button>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="w-full min-h-[48px] rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {displayError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 leading-relaxed"
                >
                  {displayError}
                </div>
              )}

              <button
                type="button"
                disabled={submitting || roleLoading}
                onClick={handleGoogleSignIn}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] dark:hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
              >
                <UserCheck className="w-4 h-4" />
                {submitting || roleLoading ? 'Checking enrollment...' : 'Continue with Google'}
              </button>

              <div className="relative flex items-center py-0.5">
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
                <span className="shrink mx-3 text-xs text-slate-400">or email / ID &amp; password</span>
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
              </div>

              <form onSubmit={handleEmailSubmit} className="space-y-4" noValidate>
                <div>
                  <label
                    htmlFor="student-email"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Registered Email or Registration ID
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="student-email"
                      type="text"
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="student@email.com or ST-2026-0001"
                      className="w-full min-h-[48px] pl-10 pr-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="student-password"
                      className="text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Password
                    </label>
                    <Link
                      to="/student/forgot-password"
                      className="text-xs font-medium text-[#0B1F3A] dark:text-blue-400 hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="student-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full min-h-[48px] pl-10 pr-12 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || roleLoading}
                  className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-60 text-slate-900 dark:text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  {submitting ? 'Signing In...' : 'Sign In with Password'}
                </button>
              </form>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-center space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  New to Av_eSAFE Library? Pick an available seat &amp; shift online:
                </p>
                <Link
                  to="/student/register"
                  className="w-full min-h-[44px] inline-flex items-center justify-center rounded-xl bg-[#C99A2E]/15 border border-[#C99A2E]/40 text-[#0B1F3A] dark:text-[#DFB55B] hover:bg-[#C99A2E]/25 text-xs font-bold transition-colors"
                >
                  Register Online &amp; Select Available Seat
                </Link>
              </div>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
