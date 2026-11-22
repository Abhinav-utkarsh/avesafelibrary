import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Armchair,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  KeyRound,
  MessageCircle,
  Search,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { buildWhatsAppUrl } from '../../lib/whatsapp';
import {
  approveStudentApprovalRequest,
  rejectStudentApprovalRequest,
  subscribeAllApprovalRequests,
} from '../../services/approvalService';
import { subscribeSeats } from '../../services/seatService';
import type { SeatRecord, StudentApprovalRequestRecord } from '../../types/domain';

function formatTs(ts?: { toDate?: () => Date }): string {
  if (!ts || typeof ts.toDate !== 'function') return 'Just now';
  return ts.toDate().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getRequestSignature(req: StudentApprovalRequestRecord): string {
  const updatedMs =
    req.updatedAt && typeof req.updatedAt.toMillis === 'function' ? req.updatedAt.toMillis() : 0;
  const createdMs =
    req.createdAt && typeof req.createdAt.toMillis === 'function' ? req.createdAt.toMillis() : 0;
  return [
    req.id || req.referenceNo,
    req.referenceNo,
    req.status,
    req.requestType,
    req.fullName,
    req.phone,
    req.requestedHall,
    req.requestedSeatId || '',
    req.requestedSeatMode,
    req.requestedShiftType,
    req.batchName || '',
    String(req.estimatedMonthlyFee || 0),
    req.reviewNote || '',
    req.approvedRegistrationNo || '',
    String(createdMs),
    String(updatedMs),
  ].join('|');
}

function areRequestListsEqual(
  prev: StudentApprovalRequestRecord[],
  next: StudentApprovalRequestRecord[],
): boolean {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    if (getRequestSignature(prev[i]) !== getRequestSignature(next[i])) {
      return false;
    }
  }
  return true;
}

function areSeatStatusMapsEqual(prev: SeatRecord[], next: SeatRecord[]): boolean {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    if (prev[i].seatCode !== next[i].seatCode || prev[i].status !== next[i].status) {
      return false;
    }
  }
  return true;
}

interface ApprovalRequestCardProps {
  req: StudentApprovalRequestRecord;
  seatStatus?: string;
  reviewNote: string;
  feeValue: string;
  isProcessing: boolean;
  onReviewNoteChange: (reqId: string, value: string) => void;
  onFeeOverrideChange: (reqId: string, value: string) => void;
  onApprove: (req: StudentApprovalRequestRecord) => void;
  onReject: (req: StudentApprovalRequestRecord) => void;
}

const ApprovalRequestCard = React.memo(function ApprovalRequestCard({
  req,
  seatStatus,
  reviewNote,
  feeValue,
  isProcessing,
  onReviewNoteChange,
  onFeeOverrideChange,
  onApprove,
  onReject,
}: ApprovalRequestCardProps) {
  const isNew = req.requestType === 'new_registration';
  const waUrl = useMemo(
    () =>
      buildWhatsAppUrl(
        req.phone,
        `Hello ${req.fullName}, regarding your Av_eSAFE Library request (${req.referenceNo})…`,
      ),
    [req.phone, req.fullName, req.referenceNo],
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      {/* Top row */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3.5 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              isNew
                ? 'bg-[#0E2A47]/10 text-[#0E2A47] dark:bg-[#C99A2E]/20 dark:text-[#F6D57A]'
                : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
            }`}
          >
            {isNew ? <UserPlus className="h-5 w-5" /> : <Armchair className="h-5 w-5" />}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{req.fullName}</h3>
              <span className="font-mono text-xs text-slate-500">{req.referenceNo}</span>
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  isNew
                    ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                    : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                }`}
              >
                {isNew ? 'New Student Registration' : 'Seat / Shift Change'}
              </span>
              {req.hasPortalPassword && isNew && (
                <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  <KeyRound className="h-3 w-3" />
                  Portal Password Ready
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {req.phone}
              {req.email ? ` · ${req.email}` : ''}
              {req.registrationNo ? ` · Existing ID: ${req.registrationNo}` : ''}
              {' · '}Submitted {formatTs(req.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {waUrl && (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </a>
          )}
          <span
            className={`rounded-md px-2.5 py-1 text-xs font-bold uppercase ${
              req.status === 'approved'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                : req.status === 'rejected'
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
            }`}
          >
            {req.status}
          </span>
        </div>
      </div>

      {/* Details comparison */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {!isNew && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-950/60">
            <p className="font-bold uppercase tracking-wider text-slate-400">Current Allocation</p>
            <p className="mt-1.5 text-sm font-bold text-slate-800 dark:text-slate-200">
              Seat: {req.currentSeatId || 'Unseated'} ({req.currentHall || 'Unassigned'})
            </p>
            <p className="mt-0.5 capitalize text-slate-600 dark:text-slate-400">
              Shift: {(req.currentShiftType || '').replace('_', ' ')} · Mode:{' '}
              {(req.currentSeatMode || '').replace('_', ' ')}
            </p>
          </div>
        )}

        <div
          className={`rounded-xl border border-[#0E2A47]/20 bg-[#0E2A47]/5 p-3.5 text-xs dark:border-[#C99A2E]/30 dark:bg-[#C99A2E]/10 ${
            isNew ? 'md:col-span-2' : ''
          }`}
        >
          <p className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[#0E2A47] dark:text-[#F6D57A]">
            {!isNew && <ArrowRight className="h-3.5 w-3.5" />}
            Requested Allocation & Course
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <span className="text-[11px] text-slate-500">Seat & Hall</span>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {req.requestedSeatId || 'Unseated'}{' '}
                <span className="font-normal text-slate-500">({req.requestedHall})</span>
              </p>
              {seatStatus && (
                <span className="text-[10px] font-semibold uppercase text-slate-500">
                  Live Seat Status: {seatStatus}
                </span>
              )}
            </div>
            <div>
              <span className="text-[11px] text-slate-500">Shift & Mode</span>
              <p className="text-sm font-bold capitalize text-slate-900 dark:text-white">
                {req.requestedShiftType.replace('_', ' ')}
              </p>
              <p className="text-[11px] capitalize text-slate-500">
                {req.requestedSeatMode.replace('_', ' ')}
              </p>
            </div>
            <div>
              <span className="text-[11px] text-slate-500">Course / Batch</span>
              <p className="flex items-center gap-1 text-sm font-bold text-slate-900 dark:text-white">
                <BookOpen className="h-3.5 w-3.5 text-[#C99A2E]" />
                {req.batchName || 'General'}
              </p>
            </div>
            <div>
              <span className="text-[11px] text-slate-500">Monthly Fee</span>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                ₹{Number(req.estimatedMonthlyFee || 0).toLocaleString('en-IN')}/mo
              </p>
            </div>
          </div>

          {isNew && (req.dateOfBirth || req.gender || req.guardianName || req.address) && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-200/70 pt-2 text-[11px] text-slate-600 dark:border-slate-800 dark:text-slate-300">
              {req.gender && (
                <span className="capitalize">Gender: {req.gender.replace('_', ' ')}</span>
              )}
              {req.dateOfBirth && <span>DOB: {req.dateOfBirth}</span>}
              {req.guardianName && (
                <span>
                  Guardian: {req.guardianName}{' '}
                  {req.guardianPhone ? `(${req.guardianPhone})` : ''}
                </span>
              )}
              {req.address && <span>Address: {req.address}</span>}
            </div>
          )}

          {req.reason && (
            <p className="mt-2 text-xs italic text-slate-600 dark:text-slate-300">
              Student note: &ldquo;{req.reason}&rdquo;
            </p>
          )}
        </div>
      </div>

      {/* Action bar for pending requests */}
      {req.status === 'pending' ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-end dark:border-slate-800">
          <div className="flex-1">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Admin Review Note (Shown to Student)
            </label>
            <input
              type="text"
              value={reviewNote}
              onChange={(e) => onReviewNoteChange(req.id, e.target.value)}
              placeholder="Optional approval welcome note or rejection reason…"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-[#0E2A47] focus:outline-none dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div className="w-full sm:w-36">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Monthly Fee (₹)
            </label>
            <input
              type="number"
              min={0}
              max={100000}
              value={feeValue}
              onChange={(e) => onFeeOverrideChange(req.id, e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold focus:border-[#0E2A47] focus:outline-none dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => onReject(req)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3.5 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60 dark:border-rose-900 dark:bg-slate-950 dark:text-rose-400"
            >
              <XCircle className="h-4 w-4" />
              Reject
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => onApprove(req)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" />
              {isProcessing ? 'Processing…' : 'Approve & Activate'}
            </button>
          </div>
        </div>
      ) : (
        req.reviewNote && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-300">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span>
              <strong>Admin Decision Note:</strong> {req.reviewNote}
            </span>
          </div>
        )
      )}
    </div>
  );
});

export function AdminApprovalsPage() {
  const { adminProfile } = useAuth();
  const adminProfileRef = useRef(adminProfile);
  adminProfileRef.current = adminProfile;

  const [requests, setRequests] = useState<StudentApprovalRequestRecord[]>([]);
  const [seats, setSeats] = useState<SeatRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'registrations' | 'changes' | 'history'>(
    'pending',
  );
  const [search, setSearch] = useState('');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [feeOverrides, setFeeOverrides] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    whatsappUrl?: string | null;
  } | null>(null);

  const reviewNotesRef = useRef(reviewNotes);
  reviewNotesRef.current = reviewNotes;
  const feeOverridesRef = useRef(feeOverrides);
  feeOverridesRef.current = feeOverrides;

  const handleRequestsUpdate = useCallback((incoming: StudentApprovalRequestRecord[]) => {
    setRequests((prev) => (areRequestListsEqual(prev, incoming) ? prev : incoming));
  }, []);

  const handleSeatsUpdate = useCallback((incoming: SeatRecord[]) => {
    setSeats((prev) => (areSeatStatusMapsEqual(prev, incoming) ? prev : incoming));
  }, []);

  useEffect(() => {
    const unsubReqs = subscribeAllApprovalRequests(handleRequestsUpdate);
    const unsubSeats = subscribeSeats(handleSeatsUpdate);
    return () => {
      unsubReqs();
      unsubSeats();
    };
  }, [handleRequestsUpdate, handleSeatsUpdate]);

  const seatStatusMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of seats) map.set(s.seatCode, s.status);
    return map;
  }, [seats]);

  const counts = useMemo(() => {
    const pending = requests.filter((r) => r.status === 'pending');
    return {
      pendingTotal: pending.length,
      pendingRegistrations: pending.filter((r) => r.requestType === 'new_registration').length,
      pendingChanges: pending.filter((r) => r.requestType === 'seat_shift_change').length,
      completed: requests.filter((r) => r.status !== 'pending').length,
    };
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (activeTab === 'pending' && r.status !== 'pending') return false;
      if (
        activeTab === 'registrations' &&
        (r.status !== 'pending' || r.requestType !== 'new_registration')
      ) {
        return false;
      }
      if (
        activeTab === 'changes' &&
        (r.status !== 'pending' || r.requestType !== 'seat_shift_change')
      ) {
        return false;
      }
      if (activeTab === 'history' && r.status === 'pending') return false;
      if (!q) return true;
      return (
        r.fullName.toLowerCase().includes(q) ||
        r.phone.toLowerCase().includes(q) ||
        r.referenceNo.toLowerCase().includes(q) ||
        (r.registrationNo || '').toLowerCase().includes(q) ||
        (r.batchName || '').toLowerCase().includes(q) ||
        (r.requestedSeatId || '').toLowerCase().includes(q)
      );
    });
  }, [requests, activeTab, search]);

  const handleReviewNoteChange = useCallback((reqId: string, value: string) => {
    setReviewNotes((prev) => ({ ...prev, [reqId]: value }));
  }, []);

  const handleFeeOverrideChange = useCallback((reqId: string, value: string) => {
    setFeeOverrides((prev) => ({ ...prev, [reqId]: value }));
  }, []);

  const handleApprove = useCallback(async (req: StudentApprovalRequestRecord) => {
    const currentAdmin = adminProfileRef.current;
    if (!currentAdmin) return;
    setProcessingId(req.id);
    setFeedback(null);
    try {
      const note = reviewNotesRef.current[req.id] || '';
      const rawFee = feeOverridesRef.current[req.id];
      const feeOverride =
        rawFee !== undefined && rawFee.trim() !== '' && Number.isFinite(Number(rawFee))
          ? Number(rawFee)
          : undefined;

      const res = await approveStudentApprovalRequest(req, currentAdmin, {
        reviewNote: note,
        monthlyFeeOverride: feeOverride,
      });

      const waMsg =
        req.requestType === 'new_registration'
          ? `Hello ${req.fullName}, congratulations! Your Av_eSAFE Library registration (${req.referenceNo}) has been APPROVED.\nRegistration ID: ${res.registrationNo}\nSeat: ${req.requestedSeatId || 'Unseated'} (${req.requestedHall})\nShift: ${req.requestedShiftType.replace('_', ' ')}\nCourse: ${req.batchName || 'General'}\nYou can now sign in to the Student Portal using your Registration ID or email and chosen password.`
          : `Hello ${req.fullName} (${res.registrationNo}), your seat/shift change request (${req.referenceNo}) at Av_eSAFE Library has been APPROVED! Updated allocation: ${req.requestedSeatId || 'Unseated'} (${req.requestedHall}) · ${req.requestedShiftType.replace('_', ' ')} shift.`;

      setFeedback({
        type: 'success',
        message: res.seatWarning
          ? res.seatWarning
          : req.requestType === 'new_registration'
            ? `Approved ${req.fullName}! Official Registration ID: ${res.registrationNo}${req.hasPortalPassword ? ' (Portal password activated)' : ''}.`
            : `Approved seat & shift change for ${req.fullName} (${res.registrationNo}) → ${req.requestedSeatId || 'Unseated'} / ${req.requestedShiftType}.`,
        whatsappUrl: buildWhatsAppUrl(req.phone, waMsg),
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Approval failed.',
      });
    } finally {
      setProcessingId(null);
    }
  }, []);

  const handleReject = useCallback(async (req: StudentApprovalRequestRecord) => {
    const currentAdmin = adminProfileRef.current;
    if (!currentAdmin) return;
    setProcessingId(req.id);
    setFeedback(null);
    try {
      const note =
        reviewNotesRef.current[req.id] ||
        'Requested seat/shift could not be approved at this time. Please contact the desk or pick another available seat.';
      await rejectStudentApprovalRequest(req, note, currentAdmin);
      setFeedback({
        type: 'success',
        message: `Rejected request ${req.referenceNo} (${req.fullName}).`,
        whatsappUrl: buildWhatsAppUrl(
          req.phone,
          `Hello ${req.fullName}, regarding your Av_eSAFE Library request (${req.referenceNo}): ${note}`,
        ),
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to reject request.',
      });
    } finally {
      setProcessingId(null);
    }
  }, []);

  const tabs = useMemo(
    () =>
      [
        { id: 'pending', label: `All Pending (${counts.pendingTotal})` },
        { id: 'registrations', label: `New Registrations (${counts.pendingRegistrations})` },
        { id: 'changes', label: `Seat/Shift Changes (${counts.pendingChanges})` },
        { id: 'history', label: `History (${counts.completed})` },
      ] as const,
    [counts],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Student Approvals Queue
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Review & approve online student registrations and existing student seat/shift/course change requests.
          </p>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
            Pending Action
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-900 dark:text-amber-200">
            {counts.pendingTotal}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            New Registrations
          </p>
          <p className="mt-1 text-2xl font-bold text-[#0E2A47] dark:text-white">
            {counts.pendingRegistrations}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Seat / Shift Changes
          </p>
          <p className="mt-1 text-2xl font-bold text-indigo-700 dark:text-indigo-400">
            {counts.pendingChanges}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Completed History
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-400">
            {counts.completed}
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          {feedback.whatsappUrl && (
            <a
              href={feedback.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Send Confirmation on WhatsApp
            </a>
          )}
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === tab.id
                  ? 'bg-[#0E2A47] text-white dark:bg-[#C99A2E] dark:text-slate-950'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, ref, seat…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs focus:border-[#0E2A47] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
      </div>

      {/* Request Cards */}
      {filteredRequests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <ClipboardCheck className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
          <h3 className="mt-3 text-base font-bold text-slate-700 dark:text-slate-200">
            No requests in this queue
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            When students register online or request a seat/shift change from the Student Portal, their request appears here instantly.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRequests.map((req) => {
            const stableKey = req.id || req.referenceNo;
            return (
              <ApprovalRequestCard
                key={stableKey}
                req={req}
                seatStatus={req.requestedSeatId ? seatStatusMap.get(req.requestedSeatId) : undefined}
                reviewNote={reviewNotes[req.id] || ''}
                feeValue={feeOverrides[req.id] ?? String(req.estimatedMonthlyFee || 0)}
                isProcessing={processingId === req.id}
                onReviewNoteChange={handleReviewNoteChange}
                onFeeOverrideChange={handleFeeOverrideChange}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
