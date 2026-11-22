import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ThemeToggle } from '../../components/common/ThemeToggle';

const emailSchema = z.string().trim().email('Please enter a valid email address.');

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Enter a valid email.');
      return;
    }

    setSubmitting(true);
    try {
      await requestPasswordReset(parsed.data);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send reset link.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="px-4 sm:px-6 py-4 flex items-center justify-between max-w-5xl w-full mx-auto">
        <Link
          to="/student/login"
          className="inline-flex items-center gap-2 min-h-[44px] text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-[#0B1F3A] dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Student Login
        </Link>
        <ThemeToggle compact />
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8">
          <h1 className="font-display text-2xl font-bold text-[#0B1F3A] dark:text-white">
            Password Recovery
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 mb-6">
            Enter your registered email address to receive a Firebase password reset link.
          </p>

          {sent ? (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-900 dark:text-emerald-200 leading-relaxed">
                  Password reset instructions have been requested for{' '}
                  <span className="font-mono font-medium">{email}</span>. Check your inbox and spam folder.
                </div>
              </div>
              <Link
                to="/student/login"
                className="w-full min-h-[48px] inline-flex items-center justify-center rounded-xl bg-[#0B1F3A] dark:bg-blue-600 text-white text-sm font-semibold hover:bg-[#132E54] transition-colors"
              >
                Return to Student Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {error && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300"
                >
                  {error}
                </div>
              )}

              <div>
                <label
                  htmlFor="recovery-email"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Registered Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="recovery-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@email.com"
                    className="w-full min-h-[48px] pl-10 pr-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] dark:hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                {submitting ? 'Sending link...' : 'Send Reset Link'}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
