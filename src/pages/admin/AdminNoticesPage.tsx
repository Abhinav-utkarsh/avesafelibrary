import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Bell,
  Cake,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  LifeBuoy,
  Megaphone,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { AnimatedCounter } from '../../components/common/AnimatedCounter';
import { StudentAvatar } from '../../components/common/StudentAvatar';
import { WhatsAppButton } from '../../components/common/WhatsAppButton';
import { subscribeStudents } from '../../services/studentService';
import {
  BROADCAST_COHORTS,
  createNoticeRecord,
  deleteNoticeRecord,
  dispatchBulkStudentNotifications,
  filterStudentsByCohort,
  getBirthdayStatus,
  isValidFirestoreId,
  personalizeMessageForStudent,
  subscribeAllStudentTickets,
  subscribeMessageTemplates,
  subscribeNotices,
  subscribeNotifications,
  toggleNoticePublished,
  updateNoticeRecord,
  type BroadcastCohort,
  type NoticeFormInput,
} from '../../services/communicationService';
import {
  NOTICE_AUDIENCES,
  NOTICE_CATEGORIES,
  NOTICE_PRIORITIES,
  NOTIFICATION_TYPES,
  type MessageTemplateRecord,
  type NoticeAudience,
  type NoticeCategory,
  type NoticePriority,
  type NoticeRecord,
  type NotificationRecord,
  type NotificationType,
  type StudentRecord,
  type StudentTicketRecord,
} from '../../types/domain';
import { MessageTemplatesPanel } from '../../components/admin/communication/MessageTemplatesPanel';
import { BirthdayWishesPanel } from '../../components/admin/communication/BirthdayWishesPanel';
import { StudentTicketsPanel } from '../../components/admin/communication/StudentTicketsPanel';
import { NotificationsCenterPanel } from '../../components/admin/communication/NotificationsCenterPanel';

type CommunicationSection =
  | 'notices'
  | 'bulk'
  | 'templates'
  | 'birthdays'
  | 'tickets'
  | 'notifications';

const VALID_SECTIONS: CommunicationSection[] = [
  'notices',
  'bulk',
  'templates',
  'birthdays',
  'tickets',
  'notifications',
];

const SECTION_META: Record<
  CommunicationSection,
  { label: string; subtitle: string; icon: React.ComponentType<{ className?: string }> }
> = {
  notices: {
    label: 'Notices',
    subtitle: 'Publish library announcements to the Student Portal and share directly via WhatsApp.',
    icon: Megaphone,
  },
  bulk: {
    label: 'Bulk Messaging',
    subtitle: 'Dispatch targeted portal alerts and open one-click personalized WhatsApp chats per student.',
    icon: Send,
  },
  templates: {
    label: 'Message Templates',
    subtitle: 'Manage reusable Av_eSAFE Library message templates with live student variable preview.',
    icon: FileText,
  },
  birthdays: {
    label: 'Birthday Wishes',
    subtitle: 'Celebrate today’s and upcoming student birthdays with one-click WhatsApp & Portal greetings.',
    icon: Cake,
  },
  tickets: {
    label: 'Student Tickets',
    subtitle: 'Track, reply to, and resolve student desk requests with direct WhatsApp follow-up.',
    icon: LifeBuoy,
  },
  notifications: {
    label: 'Notifications',
    subtitle: 'Central log of all student alerts plus an individual direct notification & WhatsApp sender.',
    icon: Bell,
  },
};

interface QuickTemplate {
  id: string;
  label: string;
  cohort: BroadcastCohort;
  type: NotificationType;
  title: string;
  message: string;
}

const QUICK_TEMPLATES: QuickTemplate[] = [
  {
    id: 'fee_due',
    label: 'Fee Due Reminder',
    cohort: 'pending_fees',
    type: 'fee_due',
    title: 'Monthly Library Fee Reminder',
    message:
      'Dear {name} ({regNo}), your pending Av_eSAFE Library fee balance is {pending}. Kindly clear your dues at the Electronic City, Bangalore desk to keep your seat ({seat}) active.',
  },
  {
    id: 'expiry_alert',
    label: 'Membership Renewal Alert',
    cohort: 'expiring_7d',
    type: 'expiry',
    title: 'Membership Renewal Upcoming',
    message:
      'Hello {name}, your Av_eSAFE Library membership ({hall}, Seat {seat}) expires on {expiry}. Please renew early to retain uninterrupted 24/7 access.',
  },
  {
    id: 'unseated_update',
    label: 'Seat Allocation Check-In',
    cohort: 'unseated',
    type: 'seat',
    title: 'Seat Assignment Available at Desk',
    message:
      'Dear {name} ({regNo}), please visit the Av_eSAFE Library front desk to confirm your preferred shift and Hall 1 / Hall 2 seat assignment.',
  },
  {
    id: 'general_announcement',
    label: 'General Study Hall Update',
    cohort: 'all_active',
    type: 'info',
    title: 'Av_eSAFE Library Operations Notice',
    message:
      'Hello {name}, please maintain strict silence in {hall} and sign in/out properly at every visit. Thank you for keeping Av_eSAFE Library productive.',
  },
];

const DEFAULT_NOTICE_FORM: NoticeFormInput = {
  title: '',
  body: '',
  category: 'general',
  priority: 'normal',
  audience: 'all',
  published: true,
};

function formatDateTime(ts?: { toDate: () => Date }): string {
  if (!ts || typeof ts.toDate !== 'function') return 'Just now';
  return ts.toDate().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
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

export function AdminNoticesPage() {
  const { adminProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawSection = searchParams.get('section') as CommunicationSection | null;
  const activeSection: CommunicationSection =
    rawSection && VALID_SECTIONS.includes(rawSection) ? rawSection : 'notices';

  const setActiveSection = (section: CommunicationSection) => {
    setSearchParams({ section });
  };

  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [notices, setNotices] = useState<NoticeRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [templates, setTemplates] = useState<MessageTemplateRecord[]>([]);
  const [tickets, setTickets] = useState<StudentTicketRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [noticeFilter, setNoticeFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | NoticePriority>('all');
  const [noticeShareStudentId, setNoticeShareStudentId] = useState<string>('');

  // Notice Composer Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<NoticeRecord | null>(null);
  const [noticeForm, setNoticeForm] = useState<NoticeFormInput>(DEFAULT_NOTICE_FORM);
  const [savingNotice, setSavingNotice] = useState(false);
  const [confirmDeleteNoticeId, setConfirmDeleteNoticeId] = useState<string | null>(null);

  // Bulk Communication state
  const [selectedCohort, setSelectedCohort] = useState<BroadcastCohort>('pending_fees');
  const [bulkTitle, setBulkTitle] = useState(QUICK_TEMPLATES[0].title);
  const [bulkMessage, setBulkMessage] = useState(QUICK_TEMPLATES[0].message);
  const [bulkType, setBulkType] = useState<NotificationType>(QUICK_TEMPLATES[0].type);
  const [dispatching, setDispatching] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  useEffect(() => {
    let sDone = false;
    let nDone = false;
    let nfDone = false;
    const checkDone = () => {
      if (sDone && nDone && nfDone) setLoading(false);
    };

    const unsubStudents = subscribeStudents((data) => {
      setStudents(data);
      sDone = true;
      checkDone();
    });
    const unsubNotices = subscribeNotices((data) => {
      setNotices(data);
      nDone = true;
      checkDone();
    });
    const unsubNotifications = subscribeNotifications((data) => {
      setNotifications(data);
      nfDone = true;
      checkDone();
    });
    const unsubTemplates = subscribeMessageTemplates(setTemplates);
    const unsubTickets = subscribeAllStudentTickets(setTickets);

    return () => {
      unsubStudents();
      unsubNotices();
      unsubNotifications();
      unsubTemplates();
      unsubTickets();
    };
  }, []);

  const publishedCount = useMemo(() => notices.filter((n) => n.published).length, [notices]);
  const openTicketsCount = useMemo(
    () => tickets.filter((t) => t.status === 'open' || t.status === 'in_progress').length,
    [tickets],
  );
  const birthdaysSoonCount = useMemo(() => {
    return students.filter((s) => {
      const info = getBirthdayStatus(s.dateOfBirth);
      return info !== null && info.daysUntil <= 7;
    }).length;
  }, [students]);
  const studentNotifications = useMemo(
    () => notifications.filter((n) => n.recipientRole === 'student'),
    [notifications],
  );
  const unreadStudentNotifs = useMemo(
    () => studentNotifications.filter((n) => !n.read).length,
    [studentNotifications],
  );

  const filteredNotices = useMemo(() => {
    return notices.filter((n) => {
      if (noticeFilter === 'published' && !n.published) return false;
      if (noticeFilter === 'draft' && n.published) return false;
      if (priorityFilter !== 'all' && n.priority !== priorityFilter) return false;
      return true;
    });
  }, [notices, noticeFilter, priorityFilter]);

  const noticeShareStudent = useMemo(() => {
    if (noticeShareStudentId) {
      return students.find((s) => s.id === noticeShareStudentId) || students[0] || null;
    }
    return students[0] || null;
  }, [students, noticeShareStudentId]);

  const cohortStudents = useMemo(
    () => filterStudentsByCohort(students, selectedCohort),
    [students, selectedCohort],
  );

  const linkedCohortStudents = useMemo(
    () => cohortStudents.filter((s) => isValidFirestoreId(s.uid)),
    [cohortStudents],
  );

  const unlinkedCohortCount = cohortStudents.length - linkedCohortStudents.length;

  const openCreateModal = () => {
    setEditingNotice(null);
    setNoticeForm(DEFAULT_NOTICE_FORM);
    setModalOpen(true);
  };

  const openEditModal = (notice: NoticeRecord) => {
    setEditingNotice(notice);
    setNoticeForm({
      title: notice.title,
      body: notice.body,
      category: notice.category,
      priority: notice.priority,
      audience: notice.audience,
      published: notice.published,
    });
    setModalOpen(true);
  };

  const handleSaveNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    setFeedback(null);
    setSavingNotice(true);
    try {
      if (editingNotice) {
        await updateNoticeRecord(editingNotice.id, noticeForm, adminProfile);
        setFeedback({ type: 'success', message: `Updated notice "${noticeForm.title}".` });
      } else {
        await createNoticeRecord(noticeForm, adminProfile);
        setFeedback({
          type: 'success',
          message: noticeForm.published
            ? `Published notice "${noticeForm.title}" to the Student Portal (displays in Notices and as a login popup on students' landing page).`
            : `Saved draft notice "${noticeForm.title}".`,
        });
      }
      setModalOpen(false);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to save notice.',
      });
    } finally {
      setSavingNotice(false);
    }
  };

  const handleTogglePublished = async (notice: NoticeRecord) => {
    if (!adminProfile) return;
    setFeedback(null);
    try {
      await toggleNoticePublished(notice, adminProfile);
      setFeedback({
        type: 'success',
        message: notice.published
          ? `Moved "${notice.title}" to drafts.`
          : `Published "${notice.title}" to students.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to update notice visibility.',
      });
    }
  };

  const handleDeleteNotice = async (notice: NoticeRecord) => {
    if (!adminProfile) return;
    setFeedback(null);
    try {
      await deleteNoticeRecord(notice, adminProfile);
      setConfirmDeleteNoticeId(null);
      setFeedback({ type: 'success', message: `Deleted notice "${notice.title}".` });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to delete notice.',
      });
    }
  };

  const applyTemplate = (tpl: QuickTemplate) => {
    setSelectedCohort(tpl.cohort);
    setBulkType(tpl.type);
    setBulkTitle(tpl.title);
    setBulkMessage(tpl.message);
  };

  const applySavedTemplateToBulk = (tpl: MessageTemplateRecord) => {
    const cohortMap: Record<MessageTemplateRecord['category'], BroadcastCohort> = {
      fee: 'pending_fees',
      renewal: 'expiring_7d',
      birthday: 'birthdays_month',
      welcome: 'all_active',
      ticket: 'all_active',
      general: 'all_active',
    };
    const typeMap: Record<MessageTemplateRecord['category'], NotificationType> = {
      fee: 'fee_due',
      renewal: 'expiry',
      birthday: 'birthday',
      welcome: 'info',
      ticket: 'ticket',
      general: 'info',
    };
    setSelectedCohort(cohortMap[tpl.category]);
    setBulkType(typeMap[tpl.category]);
    setBulkTitle(tpl.title);
    setBulkMessage(tpl.body.slice(0, 600));
    setActiveSection('bulk');
    setFeedback({
      type: 'success',
      message: `Loaded template "${tpl.name}" into Bulk Messaging.`,
    });
  };

  const handleDispatchBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    setFeedback(null);
    setDispatching(true);
    try {
      const result = await dispatchBulkStudentNotifications(
        cohortStudents,
        { title: bulkTitle, message: bulkMessage, type: bulkType },
        adminProfile,
      );
      setFeedback({
        type: 'success',
        message: `Delivered in-app alert & login popup to ${result.sentCount} student${
          result.sentCount === 1 ? '' : 's'
        }. You can also open direct WhatsApp chats below.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to dispatch notifications.',
      });
    } finally {
      setDispatching(false);
    }
  };

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((curr) => (curr === key ? null : curr));
      }, 2000);
    } catch {
      setFeedback({ type: 'error', message: 'Clipboard copy was blocked by browser permissions.' });
    }
  };

  const handleExportCohortContactsCsv = () => {
    const headers = [
      'Registration No',
      'Full Name',
      'Phone',
      'Email',
      'Hall',
      'Seat',
      'Pending Amount',
      'Membership Expiry',
      'Portal Linked',
      'Personalized Message',
    ];
    const rows = cohortStudents.map((stu) =>
      [
        stu.registrationNo,
        stu.fullName,
        stu.phone,
        stu.email || '',
        stu.hall,
        stu.seatId || 'Unseated',
        stu.pendingAmount,
        stu.membershipExpiry || '',
        isValidFirestoreId(stu.uid) ? 'Yes' : 'No',
        personalizeMessageForStudent(bulkMessage, stu),
      ].map(escapeCsvCell),
    );
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `av_esafe-broadcast-${selectedCohort}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const priorityAccent = (priority: NoticePriority) => {
    if (priority === 'urgent') return 'text-rose-600 dark:text-rose-400';
    if (priority === 'important') return 'text-amber-600 dark:text-amber-400';
    return 'text-slate-500 dark:text-slate-400';
  };

  const sectionInfo = SECTION_META[activeSection];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Communication Hub · Direct Student Portal &amp; WhatsApp Workflows
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0B1F3A] dark:text-white mt-1">
            {sectionInfo.label}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            {sectionInfo.subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 min-h-[42px] rounded-xl bg-[#0B1F3A] hover:bg-[#143058] dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          New Notice
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Published Notices</span>
            <Megaphone className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />
          </div>
          <div className="mt-3 font-mono text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
            <AnimatedCounter value={publishedCount} />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Live in Student Portal
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Open Student Tickets</span>
            <LifeBuoy className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="mt-3 font-mono text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
            <AnimatedCounter value={openTicketsCount} />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Active desk requests
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Birthdays (Next 7d)</span>
            <Cake className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-3 font-mono text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
            <AnimatedCounter value={birthdaysSoonCount} />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Ready for WhatsApp wishes
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Unread Alerts</span>
            <Bell className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="mt-3 font-mono text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
            <AnimatedCounter value={unreadStudentNotifs} />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Of {studentNotifications.length} student alerts sent
          </p>
        </div>
      </div>

      {/* Feedback */}
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
          <span className="flex-1">{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-medium underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Workspace Container with 6 Section Tabs */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-4 pt-3 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
          <div className="inline-flex items-center gap-5 min-w-max">
            {VALID_SECTIONS.map((sec) => {
              const Icon = SECTION_META[sec].icon;
              const isActive = activeSection === sec;
              const badge =
                sec === 'notices'
                  ? notices.length
                  : sec === 'templates'
                    ? templates.length
                    : sec === 'birthdays'
                      ? birthdaysSoonCount
                      : sec === 'tickets'
                        ? openTicketsCount
                        : sec === 'notifications'
                          ? unreadStudentNotifs
                          : null;

              return (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setActiveSection(sec)}
                  className={`pb-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap ${
                    isActive
                      ? 'border-[#0B1F3A] dark:border-sky-400 text-[#0B1F3A] dark:text-sky-400'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{SECTION_META[sec].label}</span>
                  {badge !== null && badge > 0 && (
                    <span className="font-mono text-[11px] opacity-75">({badge})</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ================================================================ */}
        {/* SECTION 1: NOTICES                                               */}
        {/* ================================================================ */}
        {activeSection === 'notices' && (
          <div className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {(['all', 'published', 'draft'] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setNoticeFilter(status)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer ${
                      noticeFilter === status
                        ? 'bg-[#0B1F3A] text-white dark:bg-sky-500 dark:text-slate-950'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Select student for direct WhatsApp notice share"
                  value={noticeShareStudent?.id || ''}
                  onChange={(e) => setNoticeShareStudentId(e.target.value)}
                  className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 max-w-[210px]"
                >
                  {students.length === 0 ? (
                    <option value="">No students</option>
                  ) : (
                    students.map((s) => (
                      <option key={s.id} value={s.id}>
                        WhatsApp to: {s.fullName}
                      </option>
                    ))
                  )}
                </select>

                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value as 'all' | NoticePriority)}
                  aria-label="Filter notices by priority"
                  className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200"
                >
                  <option value="all">All Priorities</option>
                  {NOTICE_PRIORITIES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} Priority
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loading ? (
              <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                Loading notices...
              </div>
            ) : filteredNotices.length === 0 ? (
              <div className="py-12 text-center">
                <Megaphone className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  No notices in this view
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Create a library notice to broadcast shift changes, exam schedules, or fee dates.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                {filteredNotices.map((notice) => {
                  const catLabel =
                    NOTICE_CATEGORIES.find((c) => c.id === notice.category)?.label ||
                    notice.category;
                  const audLabel =
                    NOTICE_AUDIENCES.find((a) => a.id === notice.audience)?.label ||
                    notice.audience;
                  const shareText = `Av_eSAFE Library Notice: ${notice.title}\n\n${notice.body}`;

                  return (
                    <div
                      key={notice.id}
                      className="p-4 sm:p-5 bg-white dark:bg-slate-900 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                            <span
                              className={`font-semibold uppercase tracking-wide ${priorityAccent(notice.priority)}`}
                            >
                              {notice.priority}
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-600 dark:text-slate-300 font-medium">
                              {catLabel}
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-500 dark:text-slate-400">
                              Audience: {audLabel}
                            </span>
                            <span className="text-slate-400">·</span>
                            <span
                              className={
                                notice.published
                                  ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                                  : 'text-slate-500 dark:text-slate-400'
                              }
                            >
                              {notice.published ? 'Published' : 'Draft'}
                            </span>
                          </div>
                          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                            {notice.title}
                          </h3>
                          <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                            {notice.body}
                          </p>
                          <p className="text-xs font-mono text-slate-400 pt-1">
                            Posted {formatDateTime(notice.createdAt)}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          {noticeShareStudent && (
                            <WhatsAppButton
                              phone={noticeShareStudent.phone}
                              message={shareText}
                              size="xs"
                              variant="outline"
                              label="WhatsApp"
                              title={`Send notice on WhatsApp to ${noticeShareStudent.fullName}`}
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => handleTogglePublished(notice)}
                            title={notice.published ? 'Unpublish to draft' : 'Publish notice'}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            {notice.published ? (
                              <>
                                <EyeOff className="w-3.5 h-3.5" />
                                Unpublish
                              </>
                            ) : (
                              <>
                                <Eye className="w-3.5 h-3.5" />
                                Publish
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditModal(notice)}
                            aria-label={`Edit ${notice.title}`}
                            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {confirmDeleteNoticeId === notice.id ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleDeleteNotice(notice)}
                                className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteNoticeId(null)}
                                className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteNoticeId(notice.id)}
                              aria-label={`Delete ${notice.title}`}
                              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* SECTION 2: BULK MESSAGING                                        */}
        {/* ================================================================ */}
        {activeSection === 'bulk' && (
          <div className="p-5 space-y-6">
            {/* Quick + Saved Templates */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Quick &amp; Saved Message Templates
                </p>
                <button
                  type="button"
                  onClick={() => setActiveSection('templates')}
                  className="text-xs font-semibold text-[#0B1F3A] dark:text-sky-400 hover:underline cursor-pointer"
                >
                  Manage Templates ({templates.length})
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {QUICK_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className="text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[#0B1F3A] dark:hover:border-sky-400 bg-slate-50/60 dark:bg-slate-950/60 transition-colors cursor-pointer"
                  >
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      {tpl.label}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      Cohort: {BROADCAST_COHORTS.find((c) => c.id === tpl.cohort)?.label}
                    </p>
                  </button>
                ))}
                {templates.slice(0, 4).map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applySavedTemplateToBulk(tpl)}
                    className="text-left p-3 rounded-xl border border-blue-200/70 dark:border-blue-900/60 hover:border-[#0B1F3A] dark:hover:border-sky-400 bg-blue-50/40 dark:bg-blue-950/20 transition-colors cursor-pointer"
                  >
                    <p className="text-xs font-semibold text-[#0B1F3A] dark:text-sky-300 truncate">
                      {tpl.name}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      Saved · {tpl.category}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Composer Form */}
              <form
                onSubmit={handleDispatchBulk}
                className="lg:col-span-7 space-y-4 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    Targeted Alert &amp; WhatsApp Composer
                  </h2>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    {cohortStudents.length} matched · {linkedCohortStudents.length} Google-linked
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Target Cohort
                    </label>
                    <select
                      value={selectedCohort}
                      onChange={(e) => setSelectedCohort(e.target.value as BroadcastCohort)}
                      className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                    >
                      {BROADCAST_COHORTS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Notification Type
                    </label>
                    <select
                      value={bulkType}
                      onChange={(e) => setBulkType(e.target.value as NotificationType)}
                      className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                    >
                      {NOTIFICATION_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Alert Title
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={140}
                    value={bulkTitle}
                    onChange={(e) => setBulkTitle(e.target.value)}
                    placeholder="e.g., Monthly Fee Due Reminder"
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Message Body
                    </label>
                    <span className="font-mono text-[11px] text-slate-400">
                      {bulkMessage.length}/600
                    </span>
                  </div>
                  <textarea
                    required
                    minLength={2}
                    maxLength={600}
                    rows={4}
                    value={bulkMessage}
                    onChange={(e) => setBulkMessage(e.target.value)}
                    className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                    Placeholders supported:{' '}
                    <code className="font-mono">{'{name}'}</code>,{' '}
                    <code className="font-mono">{'{regNo}'}</code>,{' '}
                    <code className="font-mono">{'{seat}'}</code>,{' '}
                    <code className="font-mono">{'{hall}'}</code>,{' '}
                    <code className="font-mono">{'{pending}'}</code>,{' '}
                    <code className="font-mono">{'{expiry}'}</code>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-2">
                  <button
                    type="submit"
                    disabled={dispatching || cohortStudents.length === 0}
                    className="inline-flex items-center gap-2 px-4 min-h-[42px] rounded-xl bg-[#0B1F3A] hover:bg-[#143058] dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    {dispatching
                      ? 'Dispatching...'
                      : `Send In-App Alert & Popup (${cohortStudents.length})`}
                  </button>

                  <button
                    type="button"
                    onClick={() => copyText('template', bulkMessage)}
                    className="inline-flex items-center gap-1.5 px-3.5 min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    {copiedKey === 'template' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    Copy Message
                  </button>

                  <button
                    type="button"
                    disabled={cohortStudents.length === 0}
                    onClick={() =>
                      copyText(
                        'phones',
                        cohortStudents.map((s) => s.phone).join(', '),
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                  >
                    {copiedKey === 'phones' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    Copy Phones ({cohortStudents.length})
                  </button>

                  <button
                    type="button"
                    disabled={cohortStudents.length === 0}
                    onClick={handleExportCohortContactsCsv}
                    className="inline-flex items-center gap-1.5 px-3.5 min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                  </button>
                </div>
              </form>

              {/* Cohort Reach Breakdown & Per-Student WhatsApp Redirect List */}
              <div className="lg:col-span-5 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col">
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Matched Recipients ({cohortStudents.length})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  All {cohortStudents.length} students receive portal alerts &amp; login popups ({linkedCohortStudents.length} Google · {unlinkedCohortCount} Password/Desk) — click WhatsApp for direct chat.
                </p>

                <div className="mt-4 flex-1 max-h-[380px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {cohortStudents.length === 0 ? (
                    <p className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                      No students match this cohort right now.
                    </p>
                  ) : (
                    cohortStudents.map((stu) => {
                      const personalized = personalizeMessageForStudent(bulkMessage, stu);
                      const isLinked = isValidFirestoreId(stu.uid);

                      return (
                        <div
                          key={stu.id}
                          className="py-2.5 flex items-center justify-between gap-2.5"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <StudentAvatar
                              name={stu.fullName}
                              gender={stu.gender}
                              photoUrl={stu.profilePhotoUrl}
                              size="xs"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                {stu.fullName}{' '}
                                <span className="font-mono font-normal text-slate-400">
                                  ({stu.registrationNo})
                                </span>
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                {stu.phone} · {isLinked ? 'Portal Linked' : 'Phone Only'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => copyText(`stu-${stu.id}`, personalized)}
                              className="min-h-[30px] px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              {copiedKey === `stu-${stu.id}` ? 'Copied' : 'Copy'}
                            </button>
                            <WhatsAppButton
                              phone={stu.phone}
                              message={personalized}
                              size="xs"
                              variant="solid"
                              label="WhatsApp"
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* SECTION 3: MESSAGE TEMPLATES                                     */}
        {/* ================================================================ */}
        {activeSection === 'templates' && (
          <MessageTemplatesPanel
            templates={templates}
            students={students}
            adminProfile={adminProfile}
            onUseInBulk={applySavedTemplateToBulk}
            onFeedback={(type, message) => setFeedback({ type, message })}
          />
        )}

        {/* ================================================================ */}
        {/* SECTION 4: BIRTHDAY WISHES                                       */}
        {/* ================================================================ */}
        {activeSection === 'birthdays' && (
          <BirthdayWishesPanel
            students={students}
            adminProfile={adminProfile}
            onFeedback={(type, message) => setFeedback({ type, message })}
          />
        )}

        {/* ================================================================ */}
        {/* SECTION 5: STUDENT TICKETS                                       */}
        {/* ================================================================ */}
        {activeSection === 'tickets' && (
          <StudentTicketsPanel
            tickets={tickets}
            students={students}
            adminProfile={adminProfile}
            onFeedback={(type, message) => setFeedback({ type, message })}
          />
        )}

        {/* ================================================================ */}
        {/* SECTION 6: NOTIFICATIONS CENTER                                  */}
        {/* ================================================================ */}
        {activeSection === 'notifications' && (
          <NotificationsCenterPanel
            notifications={notifications}
            students={students}
            adminProfile={adminProfile}
            onFeedback={(type, message) => setFeedback({ type, message })}
          />
        )}
      </div>

      {/* Create / Edit Notice Modal */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setModalOpen(false)}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.16 }}
              className="relative z-10 w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  {editingNotice ? 'Edit Library Notice' : 'Publish New Notice'}
                </h2>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  aria-label="Close modal"
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveNotice} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Notice Title
                  </label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    maxLength={160}
                    value={noticeForm.title}
                    onChange={(e) => setNoticeForm({ ...noticeForm, title: e.target.value })}
                    placeholder="e.g., Hall 1 AC Servicing Window — Sunday 2 PM"
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Category
                    </label>
                    <select
                      value={noticeForm.category}
                      onChange={(e) =>
                        setNoticeForm({ ...noticeForm, category: e.target.value as NoticeCategory })
                      }
                      className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                    >
                      {NOTICE_CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Priority
                    </label>
                    <select
                      value={noticeForm.priority}
                      onChange={(e) =>
                        setNoticeForm({ ...noticeForm, priority: e.target.value as NoticePriority })
                      }
                      className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                    >
                      {NOTICE_PRIORITIES.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Target Audience
                    </label>
                    <select
                      value={noticeForm.audience}
                      onChange={(e) =>
                        setNoticeForm({ ...noticeForm, audience: e.target.value as NoticeAudience })
                      }
                      className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                    >
                      {NOTICE_AUDIENCES.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Announcement Details
                    </label>
                    <span className="font-mono text-[11px] text-slate-400">
                      {noticeForm.body.length}/2000
                    </span>
                  </div>
                  <textarea
                    required
                    minLength={3}
                    maxLength={2000}
                    rows={5}
                    value={noticeForm.body}
                    onChange={(e) => setNoticeForm({ ...noticeForm, body: e.target.value })}
                    placeholder="Write clear instructions or announcement details for students..."
                    className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                  />
                </div>

                <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={noticeForm.published}
                    onChange={(e) => setNoticeForm({ ...noticeForm, published: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-[#0B1F3A] focus:ring-[#0B1F3A]"
                  />
                  Publish immediately to the Student Mobile Portal
                </label>

                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingNotice}
                    className="px-5 min-h-[42px] rounded-xl bg-[#0B1F3A] hover:bg-[#143058] dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {savingNotice
                      ? 'Saving...'
                      : editingNotice
                        ? 'Save Changes'
                        : noticeForm.published
                          ? 'Publish Notice'
                          : 'Save Draft'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
