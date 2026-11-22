import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  Cake,
  CheckCheck,
  ExternalLink,
  Megaphone,
  Sparkles,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  markAllStudentNotificationsRead,
  subscribeOwnNotifications,
  subscribePublishedNotices,
} from '../../services/studentPortalService';
import { getDaysUntilExpiry } from '../../services/studentService';
import type { NoticeRecord, NotificationRecord } from '../../types/domain';

function getSeenNoticesStorageKey(studentId: string): string {
  return `avesafe_seen_notices_${studentId}`;
}

function loadSeenNoticeIds(studentId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(getSeenNoticesStorageKey(studentId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function saveSeenNoticeIds(studentId: string, ids: Set<string>): void {
  try {
    window.localStorage.setItem(
      getSeenNoticesStorageKey(studentId),
      JSON.stringify(Array.from(ids).slice(-200)),
    );
  } catch {
    // Ignore storage quota errors
  }
}

function formatTs(ts?: { toDate?: () => Date }): string {
  if (!ts || typeof ts.toDate !== 'function') return 'Just now';
  return ts.toDate().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function StudentLoginPopupModal() {
  const { studentProfile, firebaseUser } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [notices, setNotices] = useState<NoticeRecord[]>([]);
  const [seenNoticeIds, setSeenNoticeIds] = useState<Set<string>>(() => new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);

  const studentId = studentProfile?.id || '';
  const queryUid = studentProfile?.uid || firebaseUser?.uid || studentId;

  useEffect(() => {
    if (!studentId) return;
    setSeenNoticeIds(loadSeenNoticeIds(studentId));
    setDismissedIds(new Set());
  }, [studentId]);

  useEffect(() => {
    if (!studentId) return;
    const unsubNotifs = subscribeOwnNotifications(queryUid, setNotifications);
    const unsubNotices = subscribePublishedNotices(setNotices);
    return () => {
      unsubNotifs();
      unsubNotices();
    };
  }, [studentId, queryUid]);

  const unreadNotifications = useMemo(
    () =>
      notifications
        .filter((n) => !n.read && !dismissedIds.has(`notif:${n.id}`))
        .sort((a, b) => {
          // Prioritize Birthday Wishes first!
          if (a.type === 'birthday' && b.type !== 'birthday') return -1;
          if (b.type === 'birthday' && a.type !== 'birthday') return 1;
          return 0;
        }),
    [notifications, dismissedIds],
  );

  const getNoticeSeenKey = (n: NoticeRecord): string => {
    const updatedMs =
      n.updatedAt && typeof n.updatedAt.toMillis === 'function' ? n.updatedAt.toMillis() : '';
    return updatedMs ? `${n.id}:${updatedMs}` : n.id;
  };

  const unseenRelevantNotices = useMemo(() => {
    if (!studentProfile) return [];
    const daysLeft = getDaysUntilExpiry(studentProfile.membershipExpiry);
    return notices.filter((n) => {
      if (!n.published) return false;
      const seenKey = getNoticeSeenKey(n);
      if (seenNoticeIds.has(seenKey) || dismissedIds.has(`notice:${seenKey}`)) return false;
      if (n.audience === 'all') return true;
      if (n.audience === 'hall_1') return studentProfile.hall === 'Hall 1';
      if (n.audience === 'hall_2') return studentProfile.hall === 'Hall 2';
      if (n.audience === 'unseated') return !studentProfile.seatId || studentProfile.seatMode === 'unseated';
      if (n.audience === 'expiring') return daysLeft !== null && daysLeft <= 7;
      return true;
    });
  }, [notices, studentProfile, seenNoticeIds, dismissedIds]);

  const birthdayWishes = useMemo(
    () => unreadNotifications.filter((n) => n.type === 'birthday'),
    [unreadNotifications],
  );
  const otherUnreadNotifications = useMemo(
    () => unreadNotifications.filter((n) => n.type !== 'birthday'),
    [unreadNotifications],
  );

  const totalItems = unreadNotifications.length + unseenRelevantNotices.length;
  const isOpen = Boolean(studentProfile) && totalItems > 0;

  if (!isOpen || !studentProfile) return null;

  const markAllSeenAndClose = async (goToNotices = false) => {
    setSubmitting(true);
    try {
      const nextSeen = new Set(seenNoticeIds);
      const nextDismissed = new Set(dismissedIds);
      for (const n of unseenRelevantNotices) {
        const seenKey = getNoticeSeenKey(n);
        nextSeen.add(seenKey);
        nextDismissed.add(`notice:${seenKey}`);
      }
      for (const notif of unreadNotifications) {
        nextDismissed.add(`notif:${notif.id}`);
      }
      saveSeenNoticeIds(studentProfile.id, nextSeen);
      setSeenNoticeIds(nextSeen);
      setDismissedIds(nextDismissed);

      if (unreadNotifications.length > 0) {
        await markAllStudentNotificationsRead(unreadNotifications).catch(() => undefined);
      }

      if (goToNotices) {
        navigate('/student/notices');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const hasBirthday = birthdayWishes.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="New Notices and Wishes"
    >
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div
          className={`relative px-5 py-4 text-white ${
            hasBirthday
              ? 'bg-gradient-to-r from-[#0E2A47] via-[#173d66] to-[#B4831D]'
              : 'bg-[#0E2A47]'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                {hasBirthday ? (
                  <Cake className="h-5 w-5 text-[#F6D57A]" />
                ) : (
                  <Megaphone className="h-5 w-5 text-[#F6D57A]" />
                )}
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#F6D57A]">
                  Av_eSAFE Library · Electronic City
                </p>
                <h2 className="text-base font-bold leading-snug">
                  {hasBirthday
                    ? `Happy Birthday, ${studentProfile.fullName.split(' ')[0]}!`
                    : `You Have ${totalItems} New Update${totalItems === 1 ? '' : 's'}`}
                </h2>
              </div>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void markAllSeenAndClose(false)}
              aria-label="Close popup"
              className="rounded-lg p-1.5 text-white/80 transition hover:bg-white/15 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Birthday Wishes Banner */}
          {birthdayWishes.map((wish) => (
            <div
              key={wish.id}
              className="rounded-xl border-2 border-[#C99A2E]/60 bg-gradient-to-br from-amber-50 via-yellow-50/60 to-white p-4 shadow-xs dark:border-[#C99A2E]/50 dark:from-[#C99A2E]/15 dark:via-slate-900 dark:to-slate-900"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#9A6F14] dark:text-[#F6D57A]">
                  <Sparkles className="h-3.5 w-3.5" />
                  Birthday Wishes
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {formatTs(wish.createdAt)}
                </span>
              </div>
              <h3 className="text-sm font-bold text-[#0E2A47] dark:text-white">{wish.title}</h3>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                {wish.message}
              </p>
            </div>
          ))}

          {/* Personal Notifications */}
          {otherUnreadNotifications.length > 0 && (
            <div className="space-y-2.5">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Bell className="h-3.5 w-3.5" />
                Personal Alerts ({otherUnreadNotifications.length})
              </p>
              {otherUnreadNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-800/60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {notif.title}
                    </h4>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {formatTs(notif.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {notif.message}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Published Library Notices */}
          {unseenRelevantNotices.length > 0 && (
            <div className="space-y-2.5">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Megaphone className="h-3.5 w-3.5" />
                New Library Notices ({unseenRelevantNotices.length})
              </p>
              {unseenRelevantNotices.map((notice) => (
                <div
                  key={notice.id}
                  className={`rounded-xl border p-3.5 ${
                    notice.priority === 'urgent'
                      ? 'border-rose-200 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/30'
                      : notice.priority === 'important'
                        ? 'border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20'
                        : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {notice.priority === 'urgent' && (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                      )}
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {notice.title}
                      </h4>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {formatTs(notice.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {notice.body}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-200 bg-slate-50 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-950/60">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void markAllSeenAndClose(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View All in Notices
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void markAllSeenAndClose(false)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0E2A47] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#173d66] disabled:opacity-60 dark:bg-[#C99A2E] dark:text-slate-950 dark:hover:bg-[#d7a93e]"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            {submitting ? 'Saving…' : 'Mark Read & Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
