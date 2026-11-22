import React, { useMemo, useState } from 'react';
import { Bell, Search, Send, Trash2 } from 'lucide-react';
import {
  NOTIFICATION_TYPES,
  type AdminProfile,
  type NotificationRecord,
  type NotificationType,
  type StudentRecord,
} from '../../../types/domain';
import {
  deleteNotificationRecord,
  personalizeMessageForStudent,
  sendSingleStudentNotification,
} from '../../../services/communicationService';
import { StudentAvatar } from '../../common/StudentAvatar';
import { WhatsAppButton } from '../../common/WhatsAppButton';

interface NotificationsCenterPanelProps {
  notifications: NotificationRecord[];
  students: StudentRecord[];
  adminProfile: AdminProfile | null;
  onFeedback: (type: 'success' | 'error', message: string) => void;
}

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

export function NotificationsCenterPanel({
  notifications,
  students,
  adminProfile,
  onFeedback,
}: NotificationsCenterPanelProps) {
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | NotificationType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Direct Individual Notification Composer
  const [targetStudentId, setTargetStudentId] = useState('');
  const [notifType, setNotifType] = useState<NotificationType>('info');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const studentByUid = useMemo(() => {
    const map = new Map<string, StudentRecord>();
    for (const s of students) {
      map.set(s.id, s);
      if (s.uid) map.set(s.uid, s);
    }
    return map;
  }, [students]);

  const targetStudent = useMemo(
    () => students.find((s) => s.id === targetStudentId) || null,
    [students, targetStudentId],
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return notifications.filter((n) => {
      if (readFilter === 'unread' && n.read) return false;
      if (readFilter === 'read' && !n.read) return false;
      if (typeFilter !== 'all' && n.type !== typeFilter) return false;
      if (!q) return true;
      const recipient = studentByUid.get(n.recipientUid);
      return `${n.title} ${n.message} ${n.type} ${recipient?.fullName || ''} ${recipient?.registrationNo || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [notifications, readFilter, typeFilter, searchQuery, studentByUid]);

  const handleSendDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile || !targetStudent) return;
    setSending(true);
    try {
      await sendSingleStudentNotification(
        targetStudent,
        { title, message, type: notifType },
        adminProfile,
      );
      setTitle('');
      setMessage('');
      onFeedback('success', `Sent in-app notification to ${targetStudent.fullName}.`);
    } catch (err) {
      onFeedback('error', err instanceof Error ? err.message : 'Unable to send notification.');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (notif: NotificationRecord) => {
    if (!adminProfile) return;
    try {
      await deleteNotificationRecord(notif, adminProfile);
      setConfirmDeleteId(null);
      onFeedback('success', 'Removed notification from log.');
    } catch (err) {
      onFeedback('error', err instanceof Error ? err.message : 'Unable to delete notification.');
    }
  };

  const directWhatsAppPreview = targetStudent
    ? personalizeMessageForStudent(
        message.trim() || `${title.trim() || 'Hello {name}'}, message from Av_eSAFE Library.`,
        targetStudent,
      )
    : '';

  return (
    <div className="p-5 space-y-6">
      {/* Direct Notification Composer */}
      <form
        onSubmit={handleSendDirect}
        className="p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 space-y-3.5"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Send Individual Student Notification
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Deliver an instant portal alert or open that student&apos;s WhatsApp chat directly
            </p>
          </div>
          {targetStudent && (
            <WhatsAppButton
              phone={targetStudent.phone}
              message={directWhatsAppPreview}
              size="xs"
              variant="solid"
              label={`WhatsApp ${targetStudent.fullName.split(' ')[0]}`}
            />
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select
            required
            value={targetStudentId}
            onChange={(e) => setTargetStudentId(e.target.value)}
            className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
          >
            <option value="">Select student...</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName} ({s.registrationNo})
              </option>
            ))}
          </select>

          <select
            value={notifType}
            onChange={(e) => setNotifType(e.target.value as NotificationType)}
            className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
          >
            {NOTIFICATION_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>

          <input
            type="text"
            required
            minLength={2}
            maxLength={140}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Notification title..."
            className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            required
            minLength={2}
            maxLength={600}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write message (supports {name}, {regNo}, {seat}, {pending}, {expiry})..."
            className="flex-1 min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
          />
          <button
            type="submit"
            disabled={sending || !targetStudent}
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 rounded-xl bg-[#0B1F3A] dark:bg-sky-500 dark:text-slate-950 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5" />
            {sending ? 'Sending...' : 'Send Portal Alert'}
          </button>
        </div>
      </form>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'unread', 'read'] as const).map((rf) => (
            <button
              key={rf}
              type="button"
              onClick={() => setReadFilter(rf)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize cursor-pointer ${
                readFilter === rf
                  ? 'bg-[#0B1F3A] text-white dark:bg-sky-500 dark:text-slate-950'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {rf}
            </button>
          ))}

          <select
            aria-label="Filter by notification type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | NotificationType)}
            className="min-h-[34px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-200"
          >
            <option value="all">All Types</option>
            {NOTIFICATION_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notifications..."
            className="w-full min-h-[38px] pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
          />
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center space-y-2 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
          <Bell className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            No notifications match these filters
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/60">
                <th className="py-2.5 px-4">Recipient</th>
                <th className="py-2.5 px-4">Type</th>
                <th className="py-2.5 px-4">Message</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Sent</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {filtered.slice(0, 60).map((notif) => {
                const recipient = studentByUid.get(notif.recipientUid);
                return (
                  <tr key={notif.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-white">
                      <div className="flex items-center gap-2.5">
                        <StudentAvatar
                          name={recipient?.fullName || notif.recipientUid}
                          gender={recipient?.gender}
                          photoUrl={recipient?.profilePhotoUrl}
                          size="xs"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {recipient?.fullName || notif.recipientUid.slice(0, 10)}
                          </p>
                          {recipient && (
                            <p className="font-mono text-[10px] text-slate-400">
                              {recipient.registrationNo}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 capitalize text-slate-600 dark:text-slate-300">
                      {notif.type.replace('_', ' ')}
                    </td>
                    <td className="py-2.5 px-4 max-w-md">
                      <p className="font-semibold text-slate-800 dark:text-slate-100">
                        {notif.title}
                      </p>
                      <p className="text-slate-500 dark:text-slate-400 truncate">{notif.message}</p>
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={
                          notif.read
                            ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                            : 'text-amber-700 dark:text-amber-400 font-medium'
                        }
                      >
                        {notif.read ? 'Read' : 'Unread'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatDateTime(notif.createdAt)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        {recipient && (
                          <WhatsAppButton
                            phone={recipient.phone}
                            message={`${notif.title}\n\n${notif.message}`}
                            size="xs"
                            variant="outline"
                            label="WhatsApp"
                          />
                        )}
                        {confirmDeleteId === notif.id ? (
                          <span className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleDelete(notif)}
                              className="text-rose-600 font-semibold hover:underline cursor-pointer"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-slate-500 hover:underline cursor-pointer"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(notif.id)}
                            className="text-slate-400 hover:text-rose-600 cursor-pointer p-1"
                            aria-label="Remove notification"
                          >
                            <Trash2 className="w-3.5 h-3.5 inline" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
