import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Crown,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  RefreshCw,
  Shield,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  createAdminAccountRecord,
  createAdminInviteRecord,
  deleteAdminAccountRecord,
  deleteAdminInviteRecord,
  provisionAdminAccountWithPassword,
  subscribeAdminInvites,
  subscribeAdminRoster,
  updateAdminAccountRecord,
} from '../../services/adminSettingsService';
import { subscribeStudents } from '../../services/studentService';
import { subscribeBatches } from '../../services/batchService';
import { generateTemporaryPassword } from '../../lib/authProvisioning';
import {
  getAdminPasswordStatuses,
  setAdminPortalPassword,
} from '../../lib/adminSessionToken';
import {
  ADMIN_ROLE_CATALOG,
  formatAdminRoleLabel,
  getRoleTextColor,
} from '../../lib/rolePermissions';
import { WhatsAppButton } from '../../components/common/WhatsAppButton';
import type {
  AdminInviteRecord,
  AdminProfile,
  AdminRole,
  BatchRecord,
  StudentRecord,
} from '../../types/domain';

type AddAdminMode = 'password' | 'google_invite' | 'uid';

interface ProvisionedCredentials {
  fullName: string;
  email: string;
  password: string;
  role: AdminRole;
  phone?: string;
}

export function SuperAdminConsolePage() {
  const { adminProfile } = useAuth();

  const [admins, setAdmins] = useState<AdminProfile[]>([]);
  const [invites, setInvites] = useState<AdminInviteRecord[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Admin form state
  const [addMode, setAddMode] = useState<AddAdminMode>('password');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(() => generateTemporaryPassword(10));
  const [showPassword, setShowPassword] = useState(true);
  const [manualUid, setManualUid] = useState('');
  const [role, setRole] = useState<AdminRole>('manager');
  const [branch, setBranch] = useState('Electronic City, Bangalore');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Credentials slip after creating email+password admin
  const [provisionedCreds, setProvisionedCreds] = useState<ProvisionedCredentials | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  // Row operations state
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);
  const [passwordAdminUids, setPasswordAdminUids] = useState<Set<string>>(() => new Set());
  const [resetTarget, setResetTarget] = useState<AdminProfile | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(true);
  const [savingResetPassword, setSavingResetPassword] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  const refreshPasswordStatuses = async () => {
    try {
      const items = await getAdminPasswordStatuses();
      setPasswordAdminUids(new Set(items.map((item) => item.uid)));
    } catch {
      // Ignore transient status fetch failure
    }
  };

  useEffect(() => {
    const u1 = subscribeAdminRoster((list) => {
      setAdmins(list);
      setLoading(false);
    });
    const u2 = subscribeAdminInvites(setInvites);
    const u3 = subscribeStudents(setStudents);
    const u4 = subscribeBatches(setBatches);
    void refreshPasswordStatuses();
    return () => {
      u1();
      u2();
      u3();
      u4();
    };
  }, []);

  const activeAdminsCount = useMemo(() => admins.filter((a) => a.active).length, [admins]);
  const pendingInvites = useMemo(() => invites.filter((i) => i.active), [invites]);
  const activeBatchesCount = useMemo(() => batches.filter((b) => b.active).length, [batches]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const adm of admins) {
      counts[adm.role] = (counts[adm.role] || 0) + 1;
    }
    return counts;
  }, [admins]);

  const resetForm = () => {
    setFullName('');
    setEmail('');
    setPassword(generateTemporaryPassword(10));
    setManualUid('');
    setPhone('');
    setRole('manager');
    setBranch('Electronic City, Bangalore');
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    setFeedback(null);
    setProvisionedCreds(null);
    setSubmitting(true);

    try {
      if (addMode === 'password') {
        await provisionAdminAccountWithPassword(
          {
            fullName,
            email,
            password,
            role,
            branch,
            phone,
          },
          adminProfile,
        );
        setProvisionedCreds({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          password,
          role,
          phone: phone.trim(),
        });
        setFeedback({
          type: 'success',
          text: `Created ${formatAdminRoleLabel(role)} account for ${fullName.trim()}. They can sign in immediately with the email & password below.`,
        });
        void refreshPasswordStatuses();
        resetForm();
      } else if (addMode === 'google_invite') {
        await createAdminInviteRecord(
          {
            fullName,
            email,
            role,
            branch,
            phone,
          },
          adminProfile,
        );
        setFeedback({
          type: 'success',
          text: `Pre-approved ${email.trim().toLowerCase()} as ${formatAdminRoleLabel(role)}. They can now sign in with Google on the Admin Portal.`,
        });
        resetForm();
      } else {
        await createAdminAccountRecord(
          {
            uid: manualUid,
            fullName,
            email,
            role,
            branch,
            phone,
            active: true,
          },
          adminProfile,
        );
        setFeedback({
          type: 'success',
          text: `Authorized existing Firebase user ${email.trim().toLowerCase()} as ${formatAdminRoleLabel(role)}.`,
        });
        resetForm();
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to add administrator.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateRoleOrStatus = async (
    target: AdminProfile,
    nextRole: AdminRole,
    nextActive: boolean,
  ) => {
    if (!adminProfile) return;
    setFeedback(null);
    setBusyUid(target.uid);
    try {
      await updateAdminAccountRecord(
        target,
        {
          fullName: target.fullName,
          role: nextRole,
          branch: target.branch || 'Electronic City, Bangalore',
          phone: target.phone || '',
          active: nextActive,
        },
        adminProfile,
      );
      setFeedback({
        type: 'success',
        text: `Updated ${target.fullName} → ${formatAdminRoleLabel(nextRole)} (${nextActive ? 'Active' : 'Suspended'}).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update administrator.',
      });
    } finally {
      setBusyUid(null);
    }
  };

  const handleDeleteAdmin = async (target: AdminProfile) => {
    if (!adminProfile) return;
    setFeedback(null);
    setBusyUid(target.uid);
    try {
      await deleteAdminAccountRecord(target, adminProfile);
      setConfirmDeleteUid(null);
      void refreshPasswordStatuses();
      setFeedback({
        type: 'success',
        text: `Removed administrator access for ${target.fullName} (${target.email}).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to delete administrator.',
      });
    } finally {
      setBusyUid(null);
    }
  };

  const openResetPasswordModal = (target: AdminProfile) => {
    setResetTarget(target);
    setResetPasswordValue(generateTemporaryPassword(10));
    setShowResetPassword(true);
    setFeedback(null);
  };

  const handleSaveResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    if (resetPasswordValue.trim().length < 6) {
      setFeedback({ type: 'error', text: 'Admin password must be at least 6 characters.' });
      return;
    }
    setSavingResetPassword(true);
    setFeedback(null);
    try {
      await setAdminPortalPassword({
        uid: resetTarget.uid,
        email: resetTarget.email,
        fullName: resetTarget.fullName,
        role: resetTarget.role,
        branch: resetTarget.branch || 'Electronic City, Bangalore',
        phone: resetTarget.phone || '',
        password: resetPasswordValue.trim(),
        active: resetTarget.active,
      });
      setProvisionedCreds({
        fullName: resetTarget.fullName,
        email: resetTarget.email.trim().toLowerCase(),
        password: resetPasswordValue.trim(),
        role: resetTarget.role,
        phone: resetTarget.phone || '',
      });
      setFeedback({
        type: 'success',
        text: `Updated login password for ${resetTarget.fullName} (${resetTarget.email}). They can sign in immediately on the Admin Portal.`,
      });
      setResetTarget(null);
      void refreshPasswordStatuses();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update administrator password.',
      });
    } finally {
      setSavingResetPassword(false);
    }
  };

  const handleRevokeInvite = async (invite: AdminInviteRecord) => {
    if (!adminProfile) return;
    setFeedback(null);
    try {
      await deleteAdminInviteRecord(invite, adminProfile);
      setFeedback({
        type: 'success',
        text: `Revoked Google Sign-In invite for ${invite.email}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to revoke invitation.',
      });
    }
  };

  const handleCopyCredentials = async () => {
    if (!provisionedCreds) return;
    const text = [
      `Av_eSAFE Library — Admin Portal Login`,
      `Name: ${provisionedCreds.fullName}`,
      `Role: ${formatAdminRoleLabel(provisionedCreds.role)}`,
      `Login URL: ${window.location.origin}/admin/login`,
      `Email: ${provisionedCreds.email}`,
      `Temporary Password: ${provisionedCreds.password}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCreds(true);
      window.setTimeout(() => setCopiedCreds(false), 2500);
    } catch {
      setFeedback({ type: 'error', text: 'Could not copy automatically. Copy directly from the card.' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Founder / Super Admin Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-[#B4831D] dark:text-[#DFB55B] flex items-center gap-1.5">
            <Crown className="w-3.5 h-3.5" />
            Owner / Founder Command Center · Super Admin Only
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0B1F3A] dark:text-white mt-1">
            Super Admin &amp; Role Governance
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Add or delete administrators, assign Branch Manager, Manager, Accounts, or Desk Staff roles, and control organization-wide access.
          </p>
        </div>
      </div>

      {/* Executive KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Active Administrators</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-[#0B1F3A] dark:text-white mt-1.5">
            {activeAdminsCount}
            <span className="text-sm font-normal text-slate-400 ml-1">/ {admins.length}</span>
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {roleCounts.super_admin || 0} Super Admin · {(roleCounts.branch_manager || 0) + (roleCounts.manager || 0)} Managers
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Pending Google Invites</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-[#0B1F3A] dark:text-white mt-1.5">
            {pendingInvites.length}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Auto-activates on first sign-in
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total Library Students</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-[#0B1F3A] dark:text-white mt-1.5">
            {students.length}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {students.filter((s) => Boolean(s.uid)).length} with linked portal login
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Active Exam Batches</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-[#0B1F3A] dark:text-white mt-1.5">
            {activeBatchesCount}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Electronic City, Bangalore
          </p>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className={`flex items-start gap-3 px-4 py-3.5 rounded-xl border text-xs ${
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
          <span className="flex-1 leading-relaxed">{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="font-semibold underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Newly Provisioned Credentials Slip */}
      {provisionedCreds && (
        <div className="p-5 rounded-2xl bg-[#0B1F3A] text-white border border-[#1E3A5F] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wider text-[#DFB55B]">
                Account Ready · Immediate Login Active
              </p>
              <h2 className="font-display text-lg font-bold mt-0.5">
                {provisionedCreds.fullName} ({formatAdminRoleLabel(provisionedCreds.role)})
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopyCredentials()}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-semibold text-white transition-colors cursor-pointer"
              >
                {copiedCreds ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedCreds ? 'Copied' : 'Copy Credentials'}
              </button>
              {provisionedCreds.phone && (
                <WhatsAppButton
                  phone={provisionedCreds.phone}
                  message={`Hello ${provisionedCreds.fullName},\n\nYour Av_eSAFE Library Admin Portal account (${formatAdminRoleLabel(provisionedCreds.role)}) is ready:\n\nPortal: ${window.location.origin}/admin/login\nEmail: ${provisionedCreds.email}\nPassword: ${provisionedCreds.password}\n\nPlease sign in and update your password if needed.`}
                  label="Send via WhatsApp"
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-white/8 rounded-xl p-3.5 font-mono">
            <div>
              <span className="text-slate-300 block text-[10px] uppercase">Login Email</span>
              <span className="text-white break-all">{provisionedCreds.email}</span>
            </div>
            <div>
              <span className="text-slate-300 block text-[10px] uppercase">Password</span>
              <span className="text-[#DFB55B] font-semibold">{provisionedCreds.password}</span>
            </div>
            <div>
              <span className="text-slate-300 block text-[10px] uppercase">Assigned Role</span>
              <span className="text-white">{formatAdminRoleLabel(provisionedCreds.role)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Add Administrator Panel */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />
              Add New Administrator / Staff Account
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Create an instant Email &amp; Password login (without signing you out) or pre-approve a Google Sign-In email.
            </p>
          </div>

          <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 gap-1 self-start">
            {(
              [
                { id: 'password', label: 'Email & Password' },
                { id: 'google_invite', label: 'Google Pre-Approve' },
                { id: 'uid', label: 'Existing UID' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setAddMode(tab.id);
                  setFeedback(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  addMode === tab.id
                    ? 'bg-white dark:bg-slate-900 text-[#0B1F3A] dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleAddAdmin} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Rajesh Sharma"
                className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {addMode === 'google_invite' ? 'Google Email Address *' : 'Login Email Address *'}
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="manager@avesafelibrary.in"
                className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Assigned Role *
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as AdminRole)}
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {ADMIN_ROLE_CATALOG.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            {addMode === 'password' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Initial Password * (min 6 chars)
                </label>
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full min-h-[42px] pl-3.5 pr-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
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
              </div>
            )}

            {addMode === 'uid' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Firebase Auth UID *
                </label>
                <input
                  type="text"
                  required
                  value={manualUid}
                  onChange={(e) => setManualUid(e.target.value)}
                  placeholder="Paste Firebase Auth UID"
                  className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Branch / Location
              </label>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="Electronic City, Bangalore"
                className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                WhatsApp / Contact Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Optional 10-digit mobile"
                className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {addMode === 'password'
                ? 'Creates an instant server-verified Email & Password Admin login and writes their role in /admins/{uid} immediately.'
                : addMode === 'google_invite'
                  ? 'Grants role automatically the first time this person signs in with their Google account.'
                  : 'Links an existing Firebase Auth UID directly to the admin registry.'}
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 min-h-[42px] px-5 py-2 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] dark:hover:bg-blue-500 disabled:opacity-55 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <ShieldCheck className="w-4 h-4" />
              {submitting
                ? 'Provisioning...'
                : addMode === 'password'
                  ? 'Create Admin Account'
                  : addMode === 'google_invite'
                    ? 'Pre-Approve Google Admin'
                    : 'Authorize Admin UID'}
            </button>
          </div>
        </form>
      </section>

      {/* Active Admin Directory */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
              <Users className="w-4 h-4" />
              Registered Administrators ({admins.length})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Assign roles, suspend access, send password resets, or remove administrator accounts.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50/80 dark:bg-slate-950/60">
                  <th className="py-3 px-5">Administrator</th>
                  <th className="py-3 px-4">Branch &amp; Contact</th>
                  <th className="py-3 px-4">Assigned Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-5 text-right">Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {admins.map((adm) => {
                  const isSelf = adm.uid === adminProfile?.uid;
                  const isBootstrapOwner =
                    adm.email.toLowerCase() === 'abhinavutkarsh3@gmail.com';
                  const isBusy = busyUid === adm.uid;

                  return (
                    <tr
                      key={adm.uid}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/35 transition-colors"
                    >
                      <td className="py-3.5 px-5">
                        <p className="font-semibold text-slate-900 dark:text-white text-sm">
                          {adm.fullName}
                          {isSelf && (
                            <span className="ml-2 font-mono text-[11px] text-sky-600 dark:text-sky-400">
                              (You)
                            </span>
                          )}
                          {isBootstrapOwner && (
                            <span className="ml-2 font-mono text-[11px] text-[#B4831D] dark:text-[#DFB55B]">
                              · Founder
                            </span>
                          )}
                        </p>
                        <p className="text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2">
                          <span>{adm.email}</span>
                          {passwordAdminUids.has(adm.uid) && (
                            <span className="font-mono text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                              · Password Ready
                            </span>
                          )}
                        </p>
                      </td>

                      <td className="py-3.5 px-4">
                        <p className="text-slate-800 dark:text-slate-200">
                          {adm.branch || 'Electronic City, Bangalore'}
                        </p>
                        <p className="font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                          {adm.phone || `UID: ${adm.uid.slice(0, 12)}…`}
                        </p>
                      </td>

                      <td className="py-3.5 px-4">
                        <select
                          aria-label={`Role for ${adm.fullName}`}
                          value={adm.role}
                          disabled={isSelf || isBootstrapOwner || isBusy}
                          onChange={(e) =>
                            void handleUpdateRoleOrStatus(
                              adm,
                              e.target.value as AdminRole,
                              adm.active,
                            )
                          }
                          className={`min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-semibold ${getRoleTextColor(adm.role)} disabled:opacity-60`}
                        >
                          {ADMIN_ROLE_CATALOG.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.shortLabel}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={
                            adm.active
                              ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                              : 'text-rose-600 dark:text-rose-400 font-semibold'
                          }
                        >
                          {adm.active ? 'Active' : 'Suspended'}
                        </span>
                      </td>

                      <td className="py-3.5 px-5 text-right">
                        {confirmDeleteUid === adm.uid ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleDeleteAdmin(adm)}
                              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer"
                            >
                              Confirm Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteUid(null)}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => openResetPasswordModal(adm)}
                              title="Set or Reset Admin Login Password"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                              {passwordAdminUids.has(adm.uid) ? 'Password' : 'Set Password'}
                            </button>

                            <button
                              type="button"
                              disabled={isSelf || isBootstrapOwner || isBusy}
                              onClick={() =>
                                void handleUpdateRoleOrStatus(adm, adm.role, !adm.active)
                              }
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                            >
                              {adm.active ? 'Suspend' : 'Activate'}
                            </button>

                            <button
                              type="button"
                              disabled={isSelf || isBootstrapOwner || isBusy}
                              onClick={() => setConfirmDeleteUid(adm.uid)}
                              aria-label={`Delete ${adm.fullName}`}
                              title="Delete Admin"
                              className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-35 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Pending Google Sign-In Invitations */}
      {pendingInvites.length > 0 && (
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="font-display text-sm font-bold text-[#0B1F3A] dark:text-white flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Pending Google Sign-In Invitations ({pendingInvites.length})
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {pendingInvites.map((inv) => (
              <div
                key={inv.id}
                className="px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {inv.fullName}{' '}
                    <span className={`ml-1.5 ${getRoleTextColor(inv.role)}`}>
                      · {formatAdminRoleLabel(inv.role)}
                    </span>
                  </p>
                  <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                    {inv.email} · {inv.branch || 'Electronic City, Bangalore'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRevokeInvite(inv)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-medium cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Revoke Invite
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Role Access Permissions Reference */}
      <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />
          <h2 className="font-display text-base font-bold text-[#0B1F3A] dark:text-white">
            Role Access Matrix
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ADMIN_ROLE_CATALOG.map((def) => (
            <div
              key={def.id}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <p className={`text-xs font-bold uppercase tracking-wider ${getRoleTextColor(def.id)}`}>
                  {def.shortLabel}
                </p>
                <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                  {roleCounts[def.id] || 0} assigned
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {def.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Set / Reset Admin Password Modal */}
      {resetTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Set Admin Password"
        >
          <form
            onSubmit={handleSaveResetPassword}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <p className="font-mono text-[11px] uppercase tracking-wider text-[#B4831D] dark:text-[#DFB55B]">
                Instant Admin Portal Credentials
              </p>
              <h3 className="font-display text-base font-bold text-[#0B1F3A] dark:text-white mt-0.5">
                Set Password for {resetTarget.fullName}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {resetTarget.email} · {formatAdminRoleLabel(resetTarget.role)}
              </p>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  New Admin Login Password * (min 6 chars)
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showResetPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={resetPasswordValue}
                      onChange={(e) => setResetPasswordValue(e.target.value)}
                      className="w-full min-h-[42px] pl-3.5 pr-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPassword((v) => !v)}
                      aria-label={showResetPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setResetPasswordValue(generateTemporaryPassword(10))}
                    title="Generate strong password"
                    className="min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                  Activates immediately on the Admin Portal login page without needing email verification.
                </p>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="min-h-[38px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingResetPassword}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-4 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] dark:hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                {savingResetPassword ? 'Saving...' : 'Save Password'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
