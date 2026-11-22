import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Check, CheckCheck, CheckCircle2, LifeBuoy, Megaphone, Plus, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getDaysUntilExpiry } from '../../services/studentService';
import {
  closeOwnStudentTicket,
  markAllStudentNotificationsRead,
  markStudentNotificationRead,
  subscribeOwnNotifications,
  subscribeOwnStudentProfile,
  subscribeOwnTickets,
  subscribePublishedNotices,
} from '../../services/studentPortalService';
import { createStudentTicketRecord } from '../../services/communicationService';
import { createStudentTicketViaApi } from '../../lib/studentSessionToken';
import {
  NOTICE_AUDIENCES,
  NOTICE_CATEGORIES,
  NOTIFICATION_TYPES,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type NoticeRecord,
  type NotificationRecord,
  type StudentRecord,
  type StudentTicketRecord,
  type TicketCategory,
  type TicketPriority,
} from '../../types/domain';

type FeedTab = 'notifications' | 'notices' | 'tickets';

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

export function StudentNoticesPage() {
  const { firebaseUser, studentProfile, studentAuthMode } = useAuth();
  const [liveProfile, setLiveProfile] = useState<StudentRecord | null>(studentProfile);
  const [notices, setNotices] = useState<NoticeRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [tickets, setTickets] = useState<StudentTicketRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FeedTab>('notifications');
  const [showAllLibraryNotices, setShowAllLibraryNotices] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  // Raise Support Ticket state
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [ticketCategory, setTicketCategory] = useState<TicketCategory>('facility');
  const [ticketPriority, setTicketPriority] = useState<TicketPriority>('normal');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [submittingTicket, setSubmittingTicket] = useState(false);
  const [closingTicketId, setClosingTicketId] = useState<string | null>(null);
  const [ticketFeedback, setTicketFeedback] = useState<string | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);

  useEffect(() => {
    if ((!firebaseUser && studentAuthMode !== 'password') || !studentProfile) return;
    const uid = firebaseUser?.uid || studentProfile.uid || studentProfile.id;
    let nDone = false;
    let nfDone = false;
    const markDone = () => {
      if (nDone && nfDone) setLoading(false);
    };

    const unsubProfile = subscribeOwnStudentProfile(studentProfile.id, (docData) => {
      if (docData) setLiveProfile(docData);
    });
    const unsubNotices = subscribePublishedNotices((list) => {
      setNotices(list);
      nDone = true;
      markDone();
    });
    const unsubNotifications = subscribeOwnNotifications(uid, (list) => {
      setNotifications(list);
      nfDone = true;
      markDone();
    });
    const unsubTickets = subscribeOwnTickets(uid, setTickets);

    return () => {
      unsubProfile();
      unsubNotices();
      unsubNotifications();
      unsubTickets();
    };
  }, [firebaseUser, studentProfile, studentAuthMode]);

  const profile = liveProfile || studentProfile;
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );
  const activeTicketsCount = useMemo(
    () => tickets.filter((t) => t.status === 'open' || t.status === 'in_progress').length,
    [tickets],
  );

  const daysUntilExpiry = useMemo(
    () => getDaysUntilExpiry(profile?.membershipExpiry),
    [profile?.membershipExpiry],
  );

  const visibleNotices = useMemo(() => {
    if (showAllLibraryNotices || !profile) return notices;
    return notices.filter((n) => {
      if (n.audience === 'all') return true;
      if (n.audience === 'hall_1') return profile.hall === 'Hall 1';
      if (n.audience === 'hall_2') return profile.hall === 'Hall 2';
      if (n.audience === 'unseated') return profile.seatMode === 'unseated' || !profile.seatId;
      if (n.audience === 'expiring') return daysUntilExpiry !== null && daysUntilExpiry <= 7;
      return true;
    });
  }, [notices, profile, showAllLibraryNotices, daysUntilExpiry]);

  const handleMarkRead = async (notifId: string) => {
    setMarkingId(notifId);
    try {
      await markStudentNotificationRead(notifId);
    } finally {
      setMarkingId(null);
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await markAllStudentNotificationsRead(notifications);
    } finally {
      setMarkingAll(false);
    }
  };

  const handleRaiseTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || (!firebaseUser && studentAuthMode !== 'password')) return;
    setTicketError(null);
    setSubmittingTicket(true);
    try {
      const res =
        studentAuthMode === 'password'
          ? await createStudentTicketViaApi({
              category: ticketCategory,
              priority: ticketPriority,
              subject: ticketSubject,
              description: ticketDescription,
            })
          : await createStudentTicketRecord(
              {
                category: ticketCategory,
                priority: ticketPriority,
                subject: ticketSubject,
                description: ticketDescription,
              },
              {
                id: profile.id,
                uid: firebaseUser!.uid,
                fullName: profile.fullName,
                registrationNo: profile.registrationNo,
                phone: profile.phone,
              },
            );
      setTicketModalOpen(false);
      setTicketSubject('');
      setTicketDescription('');
      setActiveTab('tickets');
      setTicketFeedback(`Support ticket ${res.ticketNo} submitted to the Av_eSAFE Library desk.`);
    } catch (err) {
      setTicketError(err instanceof Error ? err.message : 'Unable to submit ticket.');
    } finally {
      setSubmittingTicket(false);
    }
  };

  const handleCloseTicket = async (ticketId: string) => {
    setClosingTicketId(ticketId);
    try {
      await closeOwnStudentTicket(ticketId);
    } finally {
      setClosingTicketId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Notices, Alerts &amp; Support
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Personal reminders, library announcements, and direct helpdesk tickets at Av_eSAFE Library.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setTicketError(null);
            setTicketModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 rounded-xl bg-[#0B1F3A] dark:bg-sky-500 hover:bg-[#132E54] dark:hover:bg-sky-400 text-white dark:text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Raise Support Ticket
        </button>
      </div>

      {ticketFeedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{ticketFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setTicketFeedback(null)}
            className="underline font-semibold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Segmented Tabs */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-5 pt-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-5 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('notifications')}
              className={`pb-3.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'notifications'
                  ? 'border-[#0B1F3A] dark:border-sky-400 text-[#0B1F3A] dark:text-sky-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400'
              }`}
            >
              My Alerts ({unreadCount} unread)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('notices')}
              className={`pb-3.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'notices'
                  ? 'border-[#0B1F3A] dark:border-sky-400 text-[#0B1F3A] dark:text-sky-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400'
              }`}
            >
              Library Notices ({visibleNotices.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tickets')}
              className={`pb-3.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'tickets'
                  ? 'border-[#0B1F3A] dark:border-sky-400 text-[#0B1F3A] dark:text-sky-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400'
              }`}
            >
              Support Tickets ({activeTicketsCount > 0 ? `${activeTicketsCount} active` : tickets.length})
            </button>
          </div>

          {activeTab === 'notifications' && unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={markingAll}
              className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0B1F3A] dark:text-sky-400 hover:underline disabled:opacity-50 cursor-pointer"
            >
              <CheckCheck className="w-4 h-4" />
              {markingAll ? 'Updating...' : 'Mark All Read'}
            </button>
          )}

          {activeTab === 'notices' && notices.length > visibleNotices.length && (
            <button
              type="button"
              onClick={() => setShowAllLibraryNotices((prev) => !prev)}
              className="mb-3 text-xs font-medium text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
            >
              {showAllLibraryNotices ? 'Relevant to Me Only' : `Show All (${notices.length})`}
            </button>
          )}
        </div>

        {/* Personal Notifications */}
        {activeTab === 'notifications' && (
          <div>
            {loading ? (
              <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                Loading your notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <Bell className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  No personal notifications yet
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Fee reminders, renewal alerts, and seat updates will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {notifications.map((notif) => {
                  const typeLabel =
                    NOTIFICATION_TYPES.find((t) => t.id === notif.type)?.label || notif.type;
                  return (
                    <div
                      key={notif.id}
                      className={`p-4 sm:p-5 transition-colors ${
                        notif.read
                          ? 'bg-white dark:bg-slate-900'
                          : 'bg-sky-50/50 dark:bg-sky-950/20'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 text-[11px] font-semibold uppercase tracking-wide">
                            <span
                              className={
                                notif.type === 'fee_due' || notif.type === 'expiry'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : notif.type === 'security'
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-[#0B1F3A] dark:text-sky-400'
                              }
                            >
                              {typeLabel}
                            </span>
                            <span className="text-slate-300 dark:text-slate-700">·</span>
                            <span className="font-mono font-normal text-slate-500 dark:text-slate-400 normal-case">
                              {formatDateTime(notif.createdAt)}
                            </span>
                            {!notif.read && (
                              <>
                                <span className="text-slate-300 dark:text-slate-700">·</span>
                                <span className="text-sky-700 dark:text-sky-400">Unread</span>
                              </>
                            )}
                          </div>
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                            {notif.title}
                          </h3>
                          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                            {notif.message}
                          </p>
                        </div>

                        {!notif.read && (
                          <button
                            type="button"
                            onClick={() => handleMarkRead(notif.id)}
                            disabled={markingId === notif.id}
                            className="inline-flex items-center gap-1 px-3 min-h-[36px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            {markingId === notif.id ? '...' : 'Mark Read'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Library Notices */}
        {activeTab === 'notices' && (
          <div>
            {loading ? (
              <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                Loading notices...
              </div>
            ) : visibleNotices.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <Megaphone className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  No published notices right now
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleNotices.map((notice) => {
                  const catLabel =
                    NOTICE_CATEGORIES.find((c) => c.id === notice.category)?.label ||
                    notice.category;
                  const audLabel =
                    NOTICE_AUDIENCES.find((a) => a.id === notice.audience)?.label ||
                    notice.audience;

                  return (
                    <article key={notice.id} className="p-4 sm:p-5 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-x-2 text-[11px] font-semibold uppercase tracking-wide">
                        <span
                          className={
                            notice.priority === 'urgent'
                              ? 'text-rose-600 dark:text-rose-400'
                              : notice.priority === 'important'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-slate-500 dark:text-slate-400'
                          }
                        >
                          {notice.priority}
                        </span>
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        <span className="text-slate-600 dark:text-slate-300">{catLabel}</span>
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        <span className="text-slate-500 dark:text-slate-400 normal-case font-normal">
                          {audLabel}
                        </span>
                      </div>
                      <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                        {notice.title}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                        {notice.body}
                      </p>
                      <p className="font-mono text-[11px] text-slate-400 pt-1">
                        {formatDateTime(notice.createdAt)}
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Support Tickets */}
        {activeTab === 'tickets' && (
          <div>
            {tickets.length === 0 ? (
              <div className="py-12 px-4 text-center space-y-2">
                <LifeBuoy className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  No support tickets submitted yet
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Need a seat change, Wi-Fi/AC help, or a billing query resolved? Raise a ticket above.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {tickets.map((t) => {
                  const catLabel =
                    TICKET_CATEGORIES.find((c) => c.id === t.category)?.label || t.category;
                  const statusColor =
                    t.status === 'resolved' || t.status === 'closed'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : t.status === 'in_progress'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-rose-600 dark:text-rose-400';

                  return (
                    <div key={t.id} className="p-4 sm:p-5 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-x-2 text-[11px] font-semibold uppercase tracking-wide">
                          <span className="font-mono text-[#0B1F3A] dark:text-sky-400">
                            {t.ticketNo}
                          </span>
                          <span className="text-slate-300 dark:text-slate-700">·</span>
                          <span className={statusColor}>{t.status.replace('_', ' ')}</span>
                          <span className="text-slate-300 dark:text-slate-700">·</span>
                          <span className="text-slate-500 dark:text-slate-400 normal-case font-medium">
                            {catLabel}
                          </span>
                        </div>
                        {t.status !== 'closed' && (
                          <button
                            type="button"
                            disabled={closingTicketId === t.id}
                            onClick={() => handleCloseTicket(t.id)}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                          >
                            {closingTicketId === t.id ? 'Closing...' : 'Mark Closed'}
                          </button>
                        )}
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        {t.subject}
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                        {t.description}
                      </p>
                      {t.adminReply && (
                        <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/60 text-xs text-slate-700 dark:text-slate-200">
                          <span className="font-semibold text-[#0B1F3A] dark:text-sky-400">
                            Av_eSAFE Desk Reply:{' '}
                          </span>
                          {t.adminReply}
                        </div>
                      )}
                      <p className="font-mono text-[11px] text-slate-400">
                        Submitted {formatDateTime(t.createdAt)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Raise Support Ticket Modal */}
      {ticketModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => setTicketModalOpen(false)}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-[#0B1F3A] dark:text-white">
                Raise Support Ticket
              </h3>
              <button
                type="button"
                onClick={() => setTicketModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleRaiseTicket} className="p-5 space-y-4">
              {ticketError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                  {ticketError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Category
                  </label>
                  <select
                    value={ticketCategory}
                    onChange={(e) => setTicketCategory(e.target.value as TicketCategory)}
                    className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  >
                    {TICKET_CATEGORIES.map((c) => (
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
                    value={ticketPriority}
                    onChange={(e) => setTicketPriority(e.target.value as TicketPriority)}
                    className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  >
                    {TICKET_PRIORITIES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Subject *
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={140}
                  value={ticketSubject}
                  onChange={(e) => setTicketSubject(e.target.value)}
                  placeholder="e.g. Request to shift to Hall 1 morning batch"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Description *
                </label>
                <textarea
                  required
                  minLength={5}
                  maxLength={1500}
                  rows={4}
                  value={ticketDescription}
                  onChange={(e) => setTicketDescription(e.target.value)}
                  placeholder="Describe your request clearly so our Electronic City desk can help quickly..."
                  className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTicketModalOpen(false)}
                  className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingTicket}
                  className="min-h-[40px] px-5 rounded-xl bg-[#0B1F3A] dark:bg-sky-500 dark:text-slate-950 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {submittingTicket ? 'Submitting...' : 'Submit Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
