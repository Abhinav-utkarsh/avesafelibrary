import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpRight,
  Bell,
  Check,
  CheckCircle2,
  Crown,
  Database,
  Download,
  FileText,
  KeyRound,
  Plus,
  Save,
  Search,
  Settings,
  Shield,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { firebaseProjectMeta } from '../../lib/firebase';
import { fetchSystemHealth } from '../../lib/api';
import { ADMIN_ROLE_CATALOG, formatAdminRoleLabel } from '../../lib/rolePermissions';
import { subscribeStudents, getDaysUntilExpiry } from '../../services/studentService';
import { subscribeNotifications } from '../../services/communicationService';
import {
  createAdminAccountRecord,
  createAdminSelfNotification,
  deleteAdminAccountRecord,
  deleteAdminNotification,
  markAdminNotificationRead,
  saveLibrarySettings,
  subscribeAdminRoster,
  subscribeAuditLogs,
  subscribeLibrarySettings,
  updateAdminAccountRecord,
  type AuditLogEntry,
} from '../../services/adminSettingsService';
import {
  NOTIFICATION_TYPES,
  type AdminProfile,
  type AdminRole,
  type LibrarySettings,
  type NotificationRecord,
  type NotificationType,
  type StudentRecord,
  type SystemHealthResponse,
} from '../../types/domain';

type SettingsTab = 'policies' | 'admins' | 'notifications' | 'audit';

const DEFAULT_SETTINGS: LibrarySettings = {
  libraryName: 'Av_eSAFE Library',
  location: 'Electronic City, Bangalore',
  hall1Capacity: 80,
  hall2Capacity: 40,
  operatingHours: '24/7',
  gracePeriodDays: 5,
  antiPassbackMinutes: 10,
  allowDemoAutoExpiry: true,
};

function formatTimestamp(ts?: { toDate: () => Date }): string {
  if (!ts || typeof ts.toDate !== 'function') return 'Just now';
  return ts.toDate().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function escapeCsvCell(value: string | number | undefined | null): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function AdminSettingsPage() {
  const { adminProfile, backendSession, isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('policies');

  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [settings, setSettings] = useState<LibrarySettings>(DEFAULT_SETTINGS);
  const [savingSettings, setSavingSettings] = useState(false);

  const [admins, setAdmins] = useState<AdminProfile[]>([]);
  const [newAdminUid, setNewAdminUid] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<AdminRole>('manager');
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [updatingAdminUid, setUpdatingAdminUid] = useState<string | null>(null);
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);

  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [allNotifications, setAllNotifications] = useState<NotificationRecord[]>([]);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteMessage, setNoteMessage] = useState('');
  const [noteType, setNoteType] = useState<NotificationType>('info');
  const [savingNote, setSavingNote] = useState(false);

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditResourceFilter, setAuditResourceFilter] = useState('all');

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  useEffect(() => {
    fetchSystemHealth()
      .then(setHealth)
      .catch(() => {
        // Ignore transient health errors
      });
  }, []);

  useEffect(() => {
    const u1 = subscribeLibrarySettings((data) => {
      if (data) {
        const normalizedLocation =
          !data.location || /narkatiaganj|bihar/i.test(data.location)
            ? 'Electronic City, Bangalore'
            : data.location;
        setSettings({
          ...data,
          libraryName:
            !data.libraryName || data.libraryName === 'Nirvana Library'
              ? 'Av_eSAFE Library'
              : data.libraryName,
          location: normalizedLocation,
        });
      }
    });
    const u2 = subscribeAdminRoster(setAdmins);
    const u3 = subscribeStudents(setStudents);
    const u4 = subscribeNotifications(setAllNotifications);
    const u5 = subscribeAuditLogs(setAuditLogs, 250);

    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
    };
  }, []);

  const adminNotifications = useMemo(
    () => allNotifications.filter((n) => n.recipientRole === 'admin'),
    [allNotifications],
  );

  const liveOperationalAlerts = useMemo(() => {
    const alerts: { id: string; level: 'warn' | 'info'; title: string; detail: string }[] = [];
    const pendingStudents = students.filter((s) => Number(s.pendingAmount || 0) > 0);
    if (pendingStudents.length > 0) {
      const total = pendingStudents.reduce((s, r) => s + Number(r.pendingAmount || 0), 0);
      alerts.push({
        id: 'pending-dues',
        level: 'warn',
        title: `${pendingStudents.length} student${pendingStudents.length === 1 ? '' : 's'} with pending dues`,
        detail: `Total outstanding balance: ₹${total.toLocaleString('en-IN')}. Follow up via Fee Collection or Notices.`,
      });
    }

    const expiringSoon = students.filter((s) => {
      if (s.status === 'inactive' || s.status === 'suspended') return false;
      const d = getDaysUntilExpiry(s.membershipExpiry);
      return d !== null && d <= 5;
    });
    if (expiringSoon.length > 0) {
      alerts.push({
        id: 'expiring-soon',
        level: 'warn',
        title: `${expiringSoon.length} membership${expiringSoon.length === 1 ? '' : 's'} expiring within 5 days or overdue`,
        detail: 'Renew memberships or send bulk renewal reminders before grace periods lapse.',
      });
    }

    const unseated = students.filter(
      (s) => (s.seatMode === 'unseated' || !s.seatId) && s.status !== 'inactive',
    );
    if (unseated.length > 0) {
      alerts.push({
        id: 'unseated-queue',
        level: 'info',
        title: `${unseated.length} student${unseated.length === 1 ? '' : 's'} awaiting seat assignment`,
        detail: 'Open the 120-Seat Interactive Map to assign Hall 1 or Hall 2 seats.',
      });
    }

    return alerts;
  }, [students]);

  const auditResources = useMemo(() => {
    const set = new Set<string>();
    for (const log of auditLogs) set.add(log.resourceType);
    return Array.from(set).sort();
  }, [auditLogs]);

  const filteredAuditLogs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return auditLogs.filter((log) => {
      if (auditResourceFilter !== 'all' && log.resourceType !== auditResourceFilter) return false;
      if (q) {
        const hay = `${log.action} ${log.resourceType} ${log.summary} ${log.actorEmail || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [auditLogs, auditSearch, auditResourceFilter]);

  const handleSavePolicies = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    setFeedback(null);
    setSavingSettings(true);
    try {
      await saveLibrarySettings(
        {
          libraryName: settings.libraryName,
          location: settings.location,
          operatingHours: settings.operatingHours,
          gracePeriodDays: settings.gracePeriodDays,
          antiPassbackMinutes: settings.antiPassbackMinutes,
          allowDemoAutoExpiry: settings.allowDemoAutoExpiry,
        },
        adminProfile,
      );
      setFeedback({
        type: 'success',
        text: 'Library policies saved to Firestore and logged to audit trail.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to save settings.',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile || !isSuperAdmin) return;
    setFeedback(null);
    setAddingAdmin(true);
    try {
      await createAdminAccountRecord(
        {
          uid: newAdminUid,
          email: newAdminEmail,
          fullName: newAdminName,
          role: newAdminRole,
          branch: settings.location || 'Electronic City, Bangalore',
          phone: '',
          active: true,
        },
        adminProfile,
      );
      setNewAdminUid('');
      setNewAdminEmail('');
      setNewAdminName('');
      setNewAdminRole('manager');
      setFeedback({
        type: 'success',
        text: 'Administrator record added. They can now sign in with their Firebase account.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to add administrator.',
      });
    } finally {
      setAddingAdmin(false);
    }
  };

  const handleUpdateAdmin = async (
    target: AdminProfile,
    nextRole: AdminRole,
    nextActive: boolean,
  ) => {
    if (!adminProfile || !isSuperAdmin) return;
    setFeedback(null);
    setUpdatingAdminUid(target.uid);
    try {
      await updateAdminAccountRecord(
        target,
        {
          fullName: target.fullName,
          role: nextRole,
          branch: target.branch || '',
          phone: target.phone || '',
          active: nextActive,
        },
        adminProfile,
      );
      setFeedback({
        type: 'success',
        text: `Updated access policy for ${target.email}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update admin user.',
      });
    } finally {
      setUpdatingAdminUid(null);
    }
  };

  const handleDeleteAdmin = async (target: AdminProfile) => {
    if (!adminProfile || !isSuperAdmin) return;
    setFeedback(null);
    setUpdatingAdminUid(target.uid);
    try {
      await deleteAdminAccountRecord(target, adminProfile);
      setConfirmDeleteUid(null);
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
      setUpdatingAdminUid(null);
    }
  };

  const handleCreateAdminNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    setFeedback(null);
    setSavingNote(true);
    try {
      await createAdminSelfNotification(
        { title: noteTitle, message: noteMessage, type: noteType },
        adminProfile,
      );
      setNoteTitle('');
      setNoteMessage('');
      setNoteType('info');
      setFeedback({ type: 'success', text: 'Admin notification saved.' });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to create notification.',
      });
    } finally {
      setSavingNote(false);
    }
  };

  const handleExportAuditCsv = () => {
    const headers = ['Timestamp', 'Actor Email', 'Role', 'Action', 'Resource', 'Resource ID', 'Summary'];
    const rows = filteredAuditLogs.map((log) =>
      [
        log.timestamp?.toDate ? log.timestamp.toDate().toISOString() : '',
        log.actorEmail || log.actorUid,
        log.actorRole,
        log.action,
        log.resourceType,
        log.resourceId || '',
        log.summary,
      ].map(escapeCsvCell),
    );
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `av_esafe-audit-logs.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Settings, Access Control &amp; Audit Logs
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Configure Av_eSAFE Library security policies, manage administrator roles, review system alerts, and inspect immutable audit logs.
        </p>
      </div>

      {feedback && (
        <div
          className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${
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
          <span className="flex-1">{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-medium underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Workspace Tab Container */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 pt-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-6">
          {(
            [
              { id: 'policies', label: 'Library Policies', icon: Settings },
              { id: 'admins', label: `Admin Roster (${admins.length})`, icon: Users },
              {
                id: 'notifications',
                label: `Notifications (${liveOperationalAlerts.length + adminNotifications.filter((n) => !n.read).length})`,
                icon: Bell,
              },
              { id: 'audit', label: `Audit Logs (${auditLogs.length})`, icon: FileText },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3.5 inline-flex items-center gap-2 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? 'border-[#0B1F3A] dark:border-sky-400 text-[#0B1F3A] dark:text-sky-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* TAB 1: Library Policies */}
        {activeTab === 'policies' && (
          <div className="p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form onSubmit={handleSavePolicies} className="lg:col-span-7 space-y-4">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Operational &amp; Security Policy Rules
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Library Name
                  </label>
                  <input
                    type="text"
                    required
                    value={settings.libraryName}
                    onChange={(e) => setSettings({ ...settings, libraryName: e.target.value })}
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Operating Hours
                  </label>
                  <input
                    type="text"
                    required
                    value={settings.operatingHours}
                    onChange={(e) => setSettings({ ...settings, operatingHours: e.target.value })}
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Location
                </label>
                <input
                  type="text"
                  required
                  value={settings.location}
                  onChange={(e) => setSettings({ ...settings, location: e.target.value })}
                  className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Fee Grace Period (0–30 Days)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={settings.gracePeriodDays}
                    onChange={(e) =>
                      setSettings({ ...settings, gracePeriodDays: Number(e.target.value) })
                    }
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Anti-Passback Window (0–120 Min)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={settings.antiPassbackMinutes}
                    onChange={(e) =>
                      setSettings({ ...settings, antiPassbackMinutes: Number(e.target.value) })
                    }
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={settings.allowDemoAutoExpiry}
                  onChange={(e) =>
                    setSettings({ ...settings, allowDemoAutoExpiry: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-slate-300 text-[#0B1F3A]"
                />
                Automatically flag demo trial registrations as expired after trial ends
              </label>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="inline-flex items-center gap-2 px-5 min-h-[42px] rounded-xl bg-[#0B1F3A] hover:bg-[#143058] dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {savingSettings ? 'Saving Policies...' : 'Save Library Policies'}
                </button>
              </div>
            </form>

            {/* Infrastructure & Security Posture */}
            <div className="lg:col-span-5 space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />
                  Security &amp; Infrastructure Posture
                </h3>
                <dl className="space-y-2.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5" />
                      Backend Auth Verification
                    </dt>
                    <dd className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {backendSession?.verified ? 'Active (Admin SDK)' : 'Pending'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5" />
                      Firebase Project
                    </dt>
                    <dd className="font-mono text-slate-800 dark:text-slate-200">
                      {firebaseProjectMeta.projectId}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500 dark:text-slate-400">Seat Capacity Policy</dt>
                    <dd className="font-mono text-slate-800 dark:text-slate-200">
                      Hall 1: 80 · Hall 2: 40 (120)
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500 dark:text-slate-400">Smart Door Hardware</dt>
                    <dd className="font-medium text-amber-700 dark:text-amber-400">
                      {health?.integrations.smartDoorHardware === 'configured'
                        ? 'Configured'
                        : 'Not Configured (Simulator Only)'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Admin Roster */}
        {activeTab === 'admins' && (
          <div className="p-5 sm:p-6 space-y-6">
            {isSuperAdmin ? (
              <>
                <div className="p-4 rounded-xl bg-[#0B1F3A] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Crown className="w-5 h-5 text-[#DFB55B] shrink-0 mt-0.5" />
                    <div>
                      <p className="font-display text-sm font-semibold">
                        Super Admin Console Available
                      </p>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Create new Admin logins with Email &amp; Password, pre-approve Google accounts, manage pending invites, and review the full Role Access Matrix.
                      </p>
                    </div>
                  </div>
                  <Link
                    to="/super-admin"
                    className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-4 py-2 rounded-xl bg-[#C89B3C] hover:bg-[#B4831D] text-slate-950 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
                  >
                    Open Super Admin Console
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                <form
                  onSubmit={handleAddAdmin}
                  className="p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-4"
                >
                  <div className="flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />
                    <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                      Quick Authorize Existing Firebase UID
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Link an existing Firebase Auth UID directly to an Av_eSAFE Library staff role, or use the Super Admin Console above to provision a brand-new Email &amp; Password account.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <input
                      type="text"
                      required
                      value={newAdminUid}
                      onChange={(e) => setNewAdminUid(e.target.value)}
                      placeholder="Firebase Auth UID"
                      className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white"
                    />
                    <input
                      type="email"
                      required
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      placeholder="Email address"
                      className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                    />
                    <input
                      type="text"
                      required
                      value={newAdminName}
                      onChange={(e) => setNewAdminName(e.target.value)}
                      placeholder="Full name"
                      className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                    />
                    <div className="flex items-center gap-2">
                      <select
                        value={newAdminRole}
                        onChange={(e) => setNewAdminRole(e.target.value as AdminRole)}
                        aria-label="New admin role"
                        className="flex-1 min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                      >
                        {ADMIN_ROLE_CATALOG.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.shortLabel}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        disabled={addingAdmin}
                        className="px-4 min-h-[40px] rounded-xl bg-[#0B1F3A] hover:bg-[#143058] dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {addingAdmin ? 'Adding...' : 'Authorize'}
                      </button>
                    </div>
                  </div>
                </form>
              </>
            ) : (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
                <Shield className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    View-Only Roster · Super Admin Governance Active
                  </p>
                  <p className="mt-0.5">
                    Only the Owner / Founder (Super Admin) can add, modify roles, suspend, or remove administrator accounts.
                  </p>
                </div>
              </div>
            )}

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/60">
                    <th className="py-3 px-4">Administrator</th>
                    <th className="py-3 px-4">UID</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Access Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {admins.map((adm) => {
                    const isSelf = adm.uid === adminProfile?.uid;
                    const isFounder = adm.email.toLowerCase() === 'abhinavutkarsh3@gmail.com';
                    const locked = !isSuperAdmin || isSelf || isFounder;
                    return (
                      <tr key={adm.uid}>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {adm.fullName} {isSelf && <span className="text-sky-600">(You)</span>}
                          </p>
                          <p className="text-slate-500 dark:text-slate-400">{adm.email}</p>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400">
                          {adm.uid.slice(0, 14)}…
                        </td>
                        <td className="py-3 px-4">
                          {isSuperAdmin ? (
                            <select
                              value={adm.role}
                              disabled={locked || updatingAdminUid === adm.uid}
                              onChange={(e) =>
                                handleUpdateAdmin(adm, e.target.value as AdminRole, adm.active)
                              }
                              aria-label={`Change role for ${adm.fullName}`}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 disabled:opacity-50"
                            >
                              {ADMIN_ROLE_CATALOG.map((role) => (
                                <option key={role.id} value={role.id}>
                                  {role.shortLabel}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {formatAdminRoleLabel(adm.role)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
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
                        <td className="py-3 px-4 text-right">
                          {isSuperAdmin ? (
                            confirmDeleteUid === adm.uid ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={updatingAdminUid === adm.uid}
                                  onClick={() => void handleDeleteAdmin(adm)}
                                  className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                                >
                                  Confirm Remove
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteUid(null)}
                                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={locked || updatingAdminUid === adm.uid}
                                  onClick={() => handleUpdateAdmin(adm, adm.role, !adm.active)}
                                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                                >
                                  {adm.active ? 'Suspend' : 'Reactivate'}
                                </button>
                                {!locked && (
                                  <button
                                    type="button"
                                    disabled={updatingAdminUid === adm.uid}
                                    onClick={() => setConfirmDeleteUid(adm.uid)}
                                    aria-label={`Remove ${adm.fullName}`}
                                    className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )
                          ) : (
                            <span className="text-[11px] text-slate-400">Super Admin only</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: Notifications Center */}
        {activeTab === 'notifications' && (
          <div className="p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-5">
              <div className="space-y-3">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Live Operational Alerts
                </h2>
                {liveOperationalAlerts.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                    All operational checks are clear right now.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {liveOperationalAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={`p-4 rounded-xl border text-xs ${
                          alert.level === 'warn'
                            ? 'bg-amber-50 dark:bg-amber-950/35 border-amber-200 dark:border-amber-800'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {alert.title}
                        </p>
                        <p className="text-slate-600 dark:text-slate-300 mt-1">{alert.detail}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Saved Desk Reminders ({adminNotifications.length})
                </h2>
                {adminNotifications.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No saved internal admin notifications yet.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    {adminNotifications.map((notif) => (
                      <div
                        key={notif.id}
                        className={`p-4 flex items-start justify-between gap-3 ${
                          notif.read ? 'bg-white dark:bg-slate-900' : 'bg-sky-50/50 dark:bg-sky-950/20'
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white">
                            {notif.title}
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-300">
                            {notif.message}
                          </p>
                          <p className="font-mono text-[11px] text-slate-400">
                            {formatTimestamp(notif.createdAt)} · {notif.read ? 'Read' : 'Unread'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {!notif.read && (
                            <button
                              type="button"
                              onClick={() => markAdminNotificationRead(notif)}
                              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                              aria-label="Mark read"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => adminProfile && deleteAdminNotification(notif, adminProfile)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            aria-label="Delete notification"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <form
              onSubmit={handleCreateAdminNote}
              className="lg:col-span-5 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 space-y-4 h-fit"
            >
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Add Desk Shift Reminder
              </h3>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Category
                </label>
                <select
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value as NotificationType)}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                >
                  {NOTIFICATION_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={140}
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="e.g., Verify inverter battery before night shift"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Details
                </label>
                <textarea
                  required
                  minLength={2}
                  maxLength={600}
                  rows={3}
                  value={noteMessage}
                  onChange={(e) => setNoteMessage(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <button
                type="submit"
                disabled={savingNote}
                className="w-full min-h-[40px] rounded-xl bg-[#0B1F3A] hover:bg-[#143058] dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {savingNote ? 'Saving...' : 'Save Admin Notification'}
              </button>
            </form>
          </div>
        )}

        {/* TAB 4: Immutable Audit Logs */}
        {activeTab === 'audit' && (
          <div className="p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-1 flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="Search action, actor email, or summary..."
                    className="w-full min-h-[40px] pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <select
                  value={auditResourceFilter}
                  onChange={(e) => setAuditResourceFilter(e.target.value)}
                  aria-label="Filter audit logs by resource"
                  className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200"
                >
                  <option value="all">All Collections</option>
                  {auditResources.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleExportAuditCsv}
                disabled={filteredAuditLogs.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Export Audit CSV
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/60">
                    <th className="py-2.5 px-4">Timestamp</th>
                    <th className="py-2.5 px-4">Actor</th>
                    <th className="py-2.5 px-4">Action</th>
                    <th className="py-2.5 px-4">Resource</th>
                    <th className="py-2.5 px-4">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {filteredAuditLogs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-10 text-center text-slate-500 dark:text-slate-400"
                      >
                        No audit entries match your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredAuditLogs.map((log) => (
                      <tr
                        key={log.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="py-2.5 px-4 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {formatTimestamp(log.timestamp)}
                        </td>
                        <td className="py-2.5 px-4">
                          <p className="font-medium text-slate-900 dark:text-white">
                            {log.actorEmail || log.actorUid.slice(0, 10)}
                          </p>
                          <p className="text-[11px] text-slate-400 capitalize">
                            {log.actorRole.replace('_', ' ')}
                          </p>
                        </td>
                        <td className="py-2.5 px-4 font-mono font-semibold text-[#0B1F3A] dark:text-sky-400 whitespace-nowrap">
                          {log.action}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-300">
                          {log.resourceType}
                        </td>
                        <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300 max-w-md">
                          {log.summary}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
