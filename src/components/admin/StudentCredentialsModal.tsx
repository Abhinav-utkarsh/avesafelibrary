import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  RefreshCw,
  Trash2,
  Unlink,
  UserCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { generateTemporaryPassword } from '../../lib/authProvisioning';
import {
  getStudentPortalPasswordStatus,
  removeStudentPortalPassword,
  setStudentPortalPassword,
} from '../../lib/studentSessionToken';
import { updateStudentCredentialsRecord } from '../../services/studentService';
import { StudentAvatar } from '../common/StudentAvatar';
import { WhatsAppButton } from '../common/WhatsAppButton';
import type { StudentRecord } from '../../types/domain';

interface StudentCredentialsModalProps {
  student: StudentRecord | null;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

export function StudentCredentialsModal({
  student,
  onClose,
  onSuccess,
}: StudentCredentialsModalProps) {
  const { adminProfile } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasPortalPassword, setHasPortalPassword] = useState(false);
  const [passwordUpdatedAt, setPasswordUpdatedAt] = useState<string | null>(null);
  const [createdSlip, setCreatedSlip] = useState<{
    email: string;
    registrationNo: string;
    password: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  useEffect(() => {
    if (!student) return;
    setEmail(student.email || '');
    setPassword(generateTemporaryPassword(10));
    setShowPassword(true);
    setCreatedSlip(null);
    setFeedback(null);
    setCopied(false);
    setHasPortalPassword(false);
    setPasswordUpdatedAt(null);

    let active = true;
    getStudentPortalPasswordStatus(student.id)
      .then((res) => {
        if (!active) return;
        setHasPortalPassword(Boolean(res.hasPassword));
        setPasswordUpdatedAt(res.updatedAt || null);
      })
      .catch(() => {
        // Ignore transient status fetch failure
      });

    return () => {
      active = false;
    };
  }, [student]);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student || !adminProfile) return;
    const trimmedEmail = email.trim().toLowerCase();
    if (trimmedEmail && !trimmedEmail.includes('@')) {
      setFeedback({ type: 'error', text: 'Please enter a valid student email address or leave blank.' });
      return;
    }
    if (!password || password.length < 6) {
      setFeedback({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      // 1. Update email in Firestore first if changed
      const updatedSnapshot: StudentRecord = {
        ...student,
        email: trimmedEmail || student.email || '',
      };
      if (trimmedEmail !== (student.email || '').trim().toLowerCase()) {
        await updateStudentCredentialsRecord(
          student,
          { email: trimmedEmail },
          adminProfile,
          `Updated portal email (${trimmedEmail || 'cleared'}) and set Student Portal password for ${student.fullName} (${student.registrationNo}).`,
        );
      }

      // 2. Hash & store password on backend using scrypt (works immediately for student login)
      const saved = await setStudentPortalPassword({
        studentId: student.id,
        registrationNo: student.registrationNo,
        email: trimmedEmail || student.email || '',
        password,
        studentSnapshot: updatedSnapshot,
      });

      setHasPortalPassword(true);
      setPasswordUpdatedAt(saved.updatedAt);
      setCreatedSlip({
        email: saved.email,
        registrationNo: saved.registrationNo,
        password,
      });
      setFeedback({
        type: 'success',
        text: `Portal password is active for ${student.fullName}. They can sign in immediately on the Student Portal using their ${saved.email ? 'Email or Registration ID' : 'Registration ID'} and this password.`,
      });
      onSuccess?.(`Set Student Portal password for ${student.fullName} (${student.registrationNo}).`);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to save student portal password.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEmailOnly = async () => {
    if (!student || !adminProfile) return;
    const trimmedEmail = email.trim().toLowerCase();
    if (trimmedEmail && !trimmedEmail.includes('@')) {
      setFeedback({ type: 'error', text: 'Enter a valid email address or leave blank.' });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await updateStudentCredentialsRecord(
        student,
        { email: trimmedEmail },
        adminProfile,
        `Updated portal email for ${student.fullName} (${student.registrationNo}) to ${trimmedEmail || '(cleared)'}.`,
      );
      setFeedback({
        type: 'success',
        text: trimmedEmail
          ? `Saved portal email ${trimmedEmail}. Student can sign in with Google or using the password set below.`
          : 'Cleared portal email on student record.',
      });
      onSuccess?.(`Updated portal email for ${student.fullName}.`);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update email.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRemovePassword = async () => {
    if (!student) return;
    setBusy(true);
    setFeedback(null);
    try {
      await removeStudentPortalPassword(student.id);
      setHasPortalPassword(false);
      setPasswordUpdatedAt(null);
      setCreatedSlip(null);
      setFeedback({
        type: 'success',
        text: `Removed Student Portal password for ${student.fullName}. They can still sign in with Google if their email is linked.`,
      });
      onSuccess?.(`Removed portal password for ${student.fullName}.`);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to remove portal password.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleUnlinkUid = async () => {
    if (!student || !adminProfile) return;
    setBusy(true);
    setFeedback(null);
    try {
      await updateStudentCredentialsRecord(
        student,
        { uid: '' },
        adminProfile,
        `Unlinked Google UID for ${student.fullName} (${student.registrationNo}).`,
      );
      setFeedback({
        type: 'success',
        text: 'Google account UID unlinked. The student can re-link on their next Google Sign-In or sign in with password.',
      });
      onSuccess?.(`Unlinked Google account for ${student.fullName}.`);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to unlink Google UID.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCopySlip = async () => {
    if (!createdSlip || !student) return;
    const lines = [
      `Av_eSAFE Library — Student Portal Login`,
      `Student: ${student.fullName} (${createdSlip.registrationNo})`,
      `Portal URL: ${window.location.origin}/student/login`,
      ...(createdSlip.email ? [`Email: ${createdSlip.email}`] : []),
      `Registration ID: ${createdSlip.registrationNo}`,
      `Password: ${createdSlip.password}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <AnimatePresence>
      {student && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <StudentAvatar
                  name={student.fullName}
                  photoUrl={student.profilePhotoUrl}
                  gender={student.gender}
                  size="md"
                />
                <div className="min-w-0">
                  <h2 className="font-display text-base font-bold text-[#0B1F3A] dark:text-white truncate">
                    Portal Login &amp; Credentials
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {student.fullName} · <span className="font-mono">{student.registrationNo}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close credentials modal"
                className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Current Portal Link Status */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-slate-500 dark:text-slate-400">Password Login Status</p>
                    <p
                      className={`font-semibold mt-0.5 flex items-center gap-1.5 ${
                        hasPortalPassword
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      {hasPortalPassword
                        ? `Active${passwordUpdatedAt ? ` · Set ${new Date(passwordUpdatedAt).toLocaleDateString('en-IN')}` : ''}`
                        : 'Not Set Yet'}
                    </p>
                  </div>
                  {hasPortalPassword && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleRemovePassword()}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Revoke Password
                    </button>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-slate-500 dark:text-slate-400">Google Account Link</p>
                    <p
                      className={`font-semibold mt-0.5 flex items-center gap-1.5 ${
                        student.uid
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      {student.uid ? 'Google Sign-In Linked' : 'Not Linked Yet'}
                    </p>
                  </div>
                  {student.uid && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleUnlinkUid()}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                      Unlink Google
                    </button>
                  )}
                </div>
              </div>

              {feedback && (
                <div
                  role="status"
                  className={`flex items-start gap-2.5 p-3.5 rounded-xl border text-xs ${
                    feedback.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                      : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                  }`}
                >
                  {feedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <span className="leading-relaxed">{feedback.text}</span>
                </div>
              )}

              {/* Newly Set Credentials Card */}
              {createdSlip && (
                <div className="p-4 rounded-xl bg-[#0B1F3A] text-white space-y-3">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-[#DFB55B]">
                    Student Login Active Immediately
                  </p>
                  <div className="space-y-1 text-xs font-mono">
                    {createdSlip.email && <p>Email: {createdSlip.email}</p>}
                    <p>Reg ID: {createdSlip.registrationNo}</p>
                    <p className="text-[#DFB55B] font-semibold">
                      Password: {createdSlip.password}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => void handleCopySlip()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold cursor-pointer"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copied' : 'Copy Details'}
                    </button>
                    {student.phone && (
                      <WhatsAppButton
                        phone={student.phone}
                        message={`Hello ${student.fullName},\n\nYour Av_eSAFE Library Student Portal login is ready:\n\nPortal: ${window.location.origin}/student/login\n${createdSlip.email ? `Email: ${createdSlip.email}\n` : ''}Reg ID: ${createdSlip.registrationNo}\nPassword: ${createdSlip.password}\n\nSign in anytime to view your seat, fee receipts, attendance, and ID card.`}
                        label="Share on WhatsApp"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Email + Password Setup Form */}
              <form onSubmit={handleSetPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Student Portal Email
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="student@gmail.com"
                        className="w-full min-h-[42px] pl-9 pr-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleSaveEmailOnly()}
                      className="min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                    >
                      Save Email
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {hasPortalPassword ? 'Set New Student Portal Password' : 'Set Student Portal Password'}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min 6 characters"
                        className="w-full min-h-[42px] pl-3.5 pr-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPassword(generateTemporaryPassword(10))}
                      title="Generate strong password"
                      className="min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                    Secured with server-side scrypt hashing. Student can sign in immediately on{' '}
                    <span className="font-mono">/student/login</span> using their Email or{' '}
                    <span className="font-mono">{student.registrationNo}</span>.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full inline-flex items-center justify-center gap-2 min-h-[42px] px-4 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] dark:hover:bg-blue-500 disabled:opacity-55 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <KeyRound className="w-4 h-4" />
                    {busy
                      ? 'Saving Password...'
                      : hasPortalPassword
                        ? 'Update Portal Password'
                        : 'Set & Activate Portal Password'}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
