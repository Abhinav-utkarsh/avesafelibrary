import React, { useMemo, useState } from 'react';
import { LifeBuoy, Plus, Search, Trash2, X } from 'lucide-react';
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type AdminProfile,
  type StudentRecord,
  type StudentTicketRecord,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from '../../../types/domain';
import {
  createStudentTicketRecord,
  deleteStudentTicketRecord,
  updateStudentTicketAdmin,
} from '../../../services/communicationService';
import { buildTicketFollowUpWhatsApp } from '../../../lib/whatsapp';
import { StudentAvatar } from '../../common/StudentAvatar';
import { WhatsAppButton } from '../../common/WhatsAppButton';

interface StudentTicketsPanelProps {
  tickets: StudentTicketRecord[];
  students: StudentRecord[];
  adminProfile: AdminProfile | null;
  onFeedback: (type: 'success' | 'error', message: string) => void;
}

export function StudentTicketsPanel({
  tickets,
  students,
  adminProfile,
  onFeedback,
}: StudentTicketsPanelProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Log desk ticket modal
  const [createOpen, setCreateOpen] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [category, setCategory] = useState<TicketCategory>('facility');
  const [priority, setPriority] = useState<TicketPriority>('normal');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // Manage / Reply modal
  const [selectedTicket, setSelectedTicket] = useState<StudentTicketRecord | null>(null);
  const [replyStatus, setReplyStatus] = useState<TicketStatus>('in_progress');
  const [replyPriority, setReplyPriority] = useState<TicketPriority>('normal');
  const [adminReply, setAdminReply] = useState('');
  const [savingReply, setSavingReply] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  const counts = useMemo(() => {
    const open = tickets.filter((t) => t.status === 'open').length;
    const inProgress = tickets.filter((t) => t.status === 'in_progress').length;
    const resolved = tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length;
    return { open, inProgress, resolved };
  }, [tickets]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tickets.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (!q) return true;
      return `${t.ticketNo} ${t.studentName} ${t.subject} ${t.description} ${t.category}`
        .toLowerCase()
        .includes(q);
    });
  }, [tickets, statusFilter, searchQuery]);

  const openManageModal = (ticket: StudentTicketRecord) => {
    setSelectedTicket(ticket);
    setReplyStatus(ticket.status);
    setReplyPriority(ticket.priority);
    setAdminReply(ticket.adminReply || '');
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    const st = studentMap.get(studentId);
    if (!st) {
      onFeedback('error', 'Please select a student.');
      return;
    }
    setCreating(true);
    try {
      const res = await createStudentTicketRecord(
        { category, priority, subject, description },
        st,
        adminProfile,
      );
      setCreateOpen(false);
      setStudentId('');
      setSubject('');
      setDescription('');
      onFeedback('success', `Logged support ticket ${res.ticketNo} for ${st.fullName}.`);
    } catch (err) {
      onFeedback('error', err instanceof Error ? err.message : 'Unable to create ticket.');
    } finally {
      setCreating(false);
    }
  };

  const handleSaveReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !adminProfile) return;
    setSavingReply(true);
    try {
      await updateStudentTicketAdmin(
        selectedTicket,
        { status: replyStatus, priority: replyPriority, adminReply },
        adminProfile,
      );
      setSelectedTicket(null);
      onFeedback('success', `Updated ticket ${selectedTicket.ticketNo} (${replyStatus.replace('_', ' ')}).`);
    } catch (err) {
      onFeedback('error', err instanceof Error ? err.message : 'Unable to update ticket.');
    } finally {
      setSavingReply(false);
    }
  };

  const handleDelete = async (ticket: StudentTicketRecord) => {
    if (!adminProfile) return;
    try {
      await deleteStudentTicketRecord(ticket, adminProfile);
      setConfirmDeleteId(null);
      onFeedback('success', `Deleted ticket ${ticket.ticketNo}.`);
    } catch (err) {
      onFeedback('error', err instanceof Error ? err.message : 'Unable to delete ticket.');
    }
  };

  return (
    <div className="p-5 space-y-5">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
          <p className="text-xs text-slate-500 dark:text-slate-400">Open Tickets</p>
          <p className="font-mono text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
            {counts.open}
          </p>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
          <p className="text-xs text-slate-500 dark:text-slate-400">In Progress</p>
          <p className="font-mono text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {counts.inProgress}
          </p>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
          <p className="text-xs text-slate-500 dark:text-slate-400">Resolved / Closed</p>
          <p className="font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">
            {counts.resolved}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-[#0B1F3A] text-white dark:bg-sky-500 dark:text-slate-950'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            All ({tickets.length})
          </button>
          {TICKET_STATUSES.map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => setStatusFilter(st.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                statusFilter === st.id
                  ? 'bg-[#0B1F3A] text-white dark:bg-sky-500 dark:text-slate-950'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ticket no, student, subject..."
              className="w-full min-h-[38px] pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
            />
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 rounded-xl bg-[#0B1F3A] hover:bg-[#143058] dark:bg-sky-500 dark:text-slate-950 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Log Desk Ticket
          </button>
        </div>
      </div>

      {/* Tickets List */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center space-y-2 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
          <LifeBuoy className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            No support tickets in this queue
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Tickets raised by students from the Student Portal or logged by staff at reception appear here in real time.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {filtered.map((t) => {
            const stu = studentMap.get(t.studentId);
            const phone = stu?.phone || t.phone;
            const catLabel = TICKET_CATEGORIES.find((c) => c.id === t.category)?.label || t.category;
            const statusColor =
              t.status === 'resolved' || t.status === 'closed'
                ? 'text-emerald-700 dark:text-emerald-400'
                : t.status === 'in_progress'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-rose-600 dark:text-rose-400';

            return (
              <div
                key={t.id}
                className="p-4 sm:p-5 bg-white dark:bg-slate-900 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                      <span className="font-mono font-bold text-[#0B1F3A] dark:text-sky-400">
                        {t.ticketNo}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className={`font-semibold uppercase ${statusColor}`}>
                        {t.status.replace('_', ' ')}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-600 dark:text-slate-300 font-medium">
                        {catLabel}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="capitalize text-slate-500 dark:text-slate-400">
                        {t.priority} priority
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 pt-0.5">
                      <StudentAvatar
                        name={t.studentName}
                        photoUrl={stu?.profilePhotoUrl}
                        gender={stu?.gender}
                        size="xs"
                      />
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {t.studentName}
                      </span>
                      {t.registrationNo && (
                        <span className="font-mono text-[11px] text-slate-400">
                          ({t.registrationNo})
                        </span>
                      )}
                    </div>

                    <h3 className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white pt-0.5">
                      {t.subject}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                      {t.description}
                    </p>

                    {t.adminReply && (
                      <div className="mt-2 p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/60 text-xs text-slate-700 dark:text-slate-200">
                        <span className="font-semibold text-[#0B1F3A] dark:text-sky-400">
                          Desk Response:{' '}
                        </span>
                        {t.adminReply}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <WhatsAppButton
                      phone={phone}
                      message={buildTicketFollowUpWhatsApp(t)}
                      size="xs"
                      variant="solid"
                      label="WhatsApp"
                    />
                    <button
                      type="button"
                      onClick={() => openManageModal(t)}
                      className="min-h-[30px] px-3 rounded-lg bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#143058] text-white text-xs font-semibold cursor-pointer"
                    >
                      Reply / Update
                    </button>
                    {confirmDeleteId === t.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDelete(t)}
                          className="min-h-[30px] px-2.5 rounded-lg bg-rose-600 text-white text-xs font-semibold cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="min-h-[30px] px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-500 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(t.id)}
                        aria-label={`Delete ticket ${t.ticketNo}`}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
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

      {/* Log Desk Ticket Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => setCreateOpen(false)}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
          />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-[#0B1F3A] dark:text-white">
                Log Student Support Ticket
              </h3>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateTicket} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Student *
                </label>
                <select
                  required
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                >
                  <option value="">Select student...</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName} ({s.registrationNo})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as TicketCategory)}
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
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TicketPriority)}
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
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Seat power socket / AC cooling request"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Details *
                </label>
                <textarea
                  required
                  minLength={5}
                  maxLength={1500}
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="min-h-[40px] px-5 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reply / Status Update Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => setSelectedTicket(null)}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
          />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold text-[#0B1F3A] dark:text-white">
                  Respond to {selectedTicket.ticketNo}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedTicket.studentName} · {selectedTicket.subject}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveReply} className="p-6 space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 text-xs text-slate-700 dark:text-slate-300">
                {selectedTicket.description}
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Ticket Status
                  </label>
                  <select
                    value={replyStatus}
                    onChange={(e) => setReplyStatus(e.target.value as TicketStatus)}
                    className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  >
                    {TICKET_STATUSES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Priority
                  </label>
                  <select
                    value={replyPriority}
                    onChange={(e) => setReplyPriority(e.target.value as TicketPriority)}
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
                  Admin Reply (auto-notifies student in portal)
                </label>
                <textarea
                  rows={4}
                  maxLength={1000}
                  value={adminReply}
                  onChange={(e) => setAdminReply(e.target.value)}
                  placeholder="Write resolution details or next steps for the student..."
                  className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <WhatsAppButton
                  phone={studentMap.get(selectedTicket.studentId)?.phone || selectedTicket.phone}
                  message={buildTicketFollowUpWhatsApp({ ...selectedTicket, adminReply })}
                  size="sm"
                  variant="outline"
                  label="Follow Up on WhatsApp"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTicket(null)}
                    className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingReply}
                    className="min-h-[40px] px-5 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {savingReply ? 'Saving...' : 'Save & Notify'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
