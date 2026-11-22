import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { z } from 'zod';
import {
  ArrowLeft,
  Crown,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { formatAdminRoleLabel } from '../../lib/rolePermissions';
import { ThemeToggle } from '../../components/common/ThemeToggle';
import { BrandMark } from '../../components/common/BrandMark';

const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid administrator email.'),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
});

interface AdminLoginPageProps {
  portalMode?: 'super_admin' | 'admin';
}

export function AdminLoginPage({ portalMode = 'admin' }: AdminLoginPageProps) {
  const {
    firebaseUser,
    adminAuthMode,
    role,
    isSuperAdmin,
    adminProfile,
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

  const isSuperPortal = portalMode === 'super_admin';
  const hasAdminSession = Boolean(firebaseUser) || adminAuthMode === 'password';

  useEffect(() => {
    if (!hasAdminSession || roleLoading) return;
    if (isSuperPortal) {
      if (isSuperAdmin) {
        navigate('/super-admin', { replace: true });
      }
    } else if (role === 'admin') {
      navigate('/admin/dashboard', { replace: true });
    }
  }, [hasAdminSession, role, isSuperAdmin, isSuperPortal, roleLoading, navigate]);

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

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message || 'Please check your credentials.');
      return;
    }

    setSubmitting(true);
    try {
      await signInWithEmail(parsed.data.email, parsed.data.password, { portal: 'admin' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = formError || authError;
  const signedInButWrongRole =
    hasAdminSession &&
    !roleLoading &&
    (isSuperPortal ? !isSuperAdmin : role !== 'admin');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between max-w-6xl w-full mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-[#0B1F3A] dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Portal Gateway
        </Link>
        <ThemeToggle compact />
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 surface-elevated"
        >
          <div className="mb-7">
            <div className="flex items-center gap-3 mb-4">
              <BrandMark size="md" />
              <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {isSuperPortal
                  ? 'Owner / Founder Console · Av_eSAFE Library'
                  : 'Av_eSAFE Library · Electronic City, Bangalore'}
              </p>
            </div>
            <h1 className="font-display text-2xl font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
              {isSuperPortal && <Crown className="w-5 h-5 text-[#C89B3C]" />}
              {isSuperPortal ? 'Super Admin Sign In' : 'Admin Portal Sign In'}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
              {isSuperPortal
                ? 'Strictly for the Av_eSAFE Library Owner / Founder to manage Admins, assign roles, and audit governance.'
                : 'For Branch Managers, Managers, Accounts officers, and Desk Staff. Sign in with Google or assigned credentials.'}
            </p>
          </div>

          {signedInButWrongRole ? (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-amber-900 dark:text-amber-200">
                    {isSuperPortal
                      ? 'Super Admin (Owner / Founder) privilege required'
                      : 'Administrator role required'}
                  </p>
                  <p className="text-amber-800 dark:text-amber-300/90 mt-1 text-xs leading-relaxed">
                    Signed in as <span className="font-mono">{firebaseUser?.email}</span>
                    {role === 'admin' && adminProfile
                      ? ` with role ${formatAdminRoleLabel(adminProfile.role)}. Open the Admin Portal instead.`
                      : ', which is not listed in the Av_eSAFE Library administrator registry.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                {role === 'admin' && (
                  <Link
                    to="/admin/dashboard"
                    className="w-full min-h-[44px] inline-flex items-center justify-center rounded-xl bg-[#0B1F3A] dark:bg-blue-600 text-white text-sm font-semibold hover:bg-[#132E54] transition-colors"
                  >
                    Open Admin Operations Portal
                  </Link>
                )}
                {role === 'student' && (
                  <Link
                    to="/student/home"
                    className="w-full min-h-[44px] inline-flex items-center justify-center rounded-xl bg-[#0B1F3A] dark:bg-blue-600 text-white text-sm font-semibold hover:bg-[#132E54] transition-colors"
                  >
                    Go to Student Portal
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => void refreshRoleState()}
                  className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Re-check Permissions
                </button>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="w-full min-h-[44px] rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                >
                  Sign Out &amp; Switch Account
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
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
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] dark:hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
              >
                {isSuperPortal ? (
                  <Crown className="w-4 h-4 text-[#DFB55B]" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                {submitting || roleLoading
                  ? 'Verifying session...'
                  : isSuperPortal
                    ? 'Continue with Google (Owner / Super Admin)'
                    : 'Continue with Google (Admin)'}
              </button>

              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
                <span className="shrink mx-3 text-xs text-slate-400">or email &amp; password</span>
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
              </div>

              <form onSubmit={handleEmailSubmit} className="space-y-4" noValidate>
                <div>
                  <label
                    htmlFor="admin-email"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    {isSuperPortal ? 'Founder / Super Admin Email' : 'Admin Email'}
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="admin-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@avesafelibrary.in"
                      className="w-full min-h-[44px] pl-10 pr-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="admin-password"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Password
                    </label>
                    <Link
                      to="/student/forgot-password"
                      className="text-xs font-medium text-[#0B1F3A] dark:text-sky-400 hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="admin-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full min-h-[44px] pl-10 pr-11 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || roleLoading}
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-60 text-slate-900 dark:text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  Sign In with Email
                </button>
              </form>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                {isSuperPortal ? (
                  <Link
                    to="/admin/login"
                    className="font-medium text-[#0B1F3A] dark:text-blue-400 hover:underline"
                  >
                    Admin Staff Portal
                  </Link>
                ) : (
                  <Link
                    to="/super-admin/login"
                    className="font-medium text-[#B4831D] dark:text-[#DFB55B] hover:underline"
                  >
                    Super Admin Console
                  </Link>
                )}
                <span>·</span>
                <Link
                  to="/student/login"
                  className="font-medium text-[#0B1F3A] dark:text-blue-400 hover:underline"
                >
                  Student Portal
                </Link>
              </div>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
