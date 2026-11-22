import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Armchair,
  BookOpen,
  CheckCircle2,
  Clock,
  RefreshCw,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { BatchCourseSelector } from '../../components/common/BatchCourseSelector';
import { InteractiveSeatPicker } from '../../components/common/InteractiveSeatPicker';
import {
  fetchPublicRegistrationCatalog,
  type PublicRegistrationCatalog,
} from '../../lib/adminSessionToken';
import { DOUBLE_SHIFT_PRESETS } from '../../services/seatService';
import {
  getDefaultMonthlyFee,
  submitStudentSeatShiftChangeRequest,
  subscribeOwnApprovalRequests,
} from '../../services/approvalService';
import {
  SHIFT_DEFINITIONS,
  type HallName,
  type SeatMode,
  type ShiftType,
  type StudentApprovalRequestRecord,
} from '../../types/domain';

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

export function StudentSeatRequestPage() {
  const { studentProfile, firebaseUser } = useAuth();
  const [catalog, setCatalog] = useState<PublicRegistrationCatalog>({ seats: [], batches: [] });
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [requests, setRequests] = useState<StudentApprovalRequestRecord[]>([]);

  const [seatMode, setSeatMode] = useState<SeatMode>(studentProfile?.seatMode || 'fixed');
  const [shiftType, setShiftType] = useState<ShiftType>(studentProfile?.shiftType || 'morning');
  const [doublePresetId, setDoublePresetId] = useState('morning_noon');
  const [selectedSeatId, setSelectedSeatId] = useState(studentProfile?.seatId || '');
  const [selectedHall, setSelectedHall] = useState<HallName>(studentProfile?.hall || 'Hall 1');
  const [batchId, setBatchId] = useState(studentProfile?.batchId || '');
  const [batchName, setBatchName] = useState(studentProfile?.batchName || '');
  const [reason, setReason] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadCatalog = async () => {
    setLoadingCatalog(true);
    try {
      const data = await fetchPublicRegistrationCatalog();
      setCatalog(data);
    } catch {
      // ignore transient error
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    void loadCatalog();
  }, []);

  useEffect(() => {
    if (!studentProfile) return;
    setSeatMode(studentProfile.seatMode);
    setShiftType(studentProfile.shiftType);
    setSelectedSeatId(studentProfile.seatId || '');
    setSelectedHall(studentProfile.hall || 'Hall 1');
    setBatchId(studentProfile.batchId || '');
    setBatchName(studentProfile.batchName || '');
  }, [studentProfile?.id]);

  useEffect(() => {
    if (!studentProfile) return;
    const uid = studentProfile.uid || firebaseUser?.uid || studentProfile.id;
    return subscribeOwnApprovalRequests(uid, setRequests);
  }, [studentProfile?.id, studentProfile?.uid, firebaseUser?.uid]);

  const hasPendingRequest = useMemo(
    () => requests.some((r) => r.status === 'pending'),
    [requests],
  );

  const estimatedFee = useMemo(
    () => getDefaultMonthlyFee(shiftType, seatMode),
    [shiftType, seatMode],
  );

  if (!studentProfile) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if ((seatMode === 'fixed' || seatMode === 'non_fixed') && !selectedSeatId) {
      setErrorMsg('Please pick an available seat on the map, or switch to Unseated mode.');
      return;
    }

    const nothingChanged =
      seatMode === studentProfile.seatMode &&
      shiftType === studentProfile.shiftType &&
      (seatMode === 'unseated' ? '' : selectedSeatId) === (studentProfile.seatId || '') &&
      batchName.trim() === (studentProfile.batchName || '');

    if (nothingChanged) {
      setErrorMsg('Please change at least your Seat, Shift Timing, Seat Mode, or Course/Batch before submitting.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitStudentSeatShiftChangeRequest(studentProfile, {
        requestedSeatMode: seatMode,
        requestedHall: seatMode === 'unseated' ? 'Unassigned' : selectedHall,
        requestedSeatId: seatMode === 'unseated' ? '' : selectedSeatId,
        requestedShiftType: shiftType,
        doublePresetId: shiftType === 'double' ? doublePresetId : 'morning_noon',
        batchId: batchId || (batchName.trim() ? 'other' : ''),
        batchName: batchName.trim(),
        reason: reason.trim(),
      });
      setSuccessMsg(
        `Request ${res.referenceNo} submitted! Your seat/shift change is now in the Admin Approval Queue and will take effect once approved.`,
      );
      setReason('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to submit change request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Seat, Shift & Course Change Request
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Select a new available seat, shift timing, or exam batch. All changes require Admin approval.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadCatalog()}
          disabled={loadingCatalog}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loadingCatalog ? 'animate-spin' : ''}`} />
          Refresh Seat Availability
        </button>
      </div>

      {/* Current Allocation Summary */}
      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Current Seat
          </p>
          <p className="mt-1 text-base font-bold text-[#0E2A47] dark:text-[#F6D57A]">
            {studentProfile.seatId || 'Unseated'}
          </p>
          <p className="text-xs text-slate-500">{studentProfile.hall}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Current Shift
          </p>
          <p className="mt-1 text-base font-bold capitalize">
            {studentProfile.shiftType.replace('_', ' ')}
          </p>
          <p className="text-xs capitalize text-slate-500">
            {studentProfile.seatMode.replace('_', ' ')} mode
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Current Course / Batch
          </p>
          <p className="mt-1 text-sm font-bold">
            {studentProfile.batchName || 'Not Selected'}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Current Monthly Fee
          </p>
          <p className="mt-1 text-base font-bold">
            ₹{Number(studentProfile.monthlyFee || 0).toLocaleString('en-IN')}/mo
          </p>
        </div>
      </div>

      {/* Policy Banner */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p>
          <strong>Admin Approval Policy:</strong> Submitting this form does not immediately change your active seat or shift. The Av_eSAFE Library Admin desk will review availability, confirm any fee adjustment, and send you a portal popup notification once approved.
        </p>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Request Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              <Clock className="h-4 w-4 text-[#0E2A47] dark:text-[#DFB55B]" />
              Requested Shift Timing, Seat Mode & Course
            </h2>
            <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              Est. New Plan Fee: ₹{estimatedFee.toLocaleString('en-IN')}/mo
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Seat Mode
              </label>
              <select
                value={seatMode}
                onChange={(e) => {
                  const next = e.target.value as SeatMode;
                  setSeatMode(next);
                  if (next === 'unseated') {
                    setSelectedSeatId('');
                    setSelectedHall('Unassigned');
                  } else if (selectedHall === 'Unassigned') {
                    setSelectedHall('Hall 1');
                  }
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="fixed">Fixed Seat (Dedicated)</option>
                <option value="non_fixed">Non-Fixed (Shift-Shared)</option>
                <option value="unseated">Unseated / Flexible</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Shift Timing
              </label>
              <select
                value={shiftType}
                onChange={(e) => setShiftType(e.target.value as ShiftType)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                {SHIFT_DEFINITIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} ({s.window})
                  </option>
                ))}
              </select>
            </div>

            {shiftType === 'double' && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Double Shift Window
                </label>
                <select
                  value={doublePresetId}
                  onChange={(e) => setDoublePresetId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  {DOUBLE_SHIFT_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="mt-4">
            <BatchCourseSelector
              batches={catalog.batches}
              batchId={batchId}
              batchName={batchName}
              label="Exam Batch / Course (Keep Current or Change)"
              onChange={({ batchId: nextId, batchName: nextName }) => {
                setBatchId(nextId);
                setBatchName(nextName);
              }}
            />
          </div>
        </div>

        {/* Visual Seat Picker */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
            <Armchair className="h-4 w-4 text-[#0E2A47] dark:text-[#DFB55B]" />
            Pick Available Seat (Hall 1 / Hall 2)
          </h2>

          <InteractiveSeatPicker
            seats={catalog.seats}
            shiftType={shiftType}
            doublePresetId={doublePresetId}
            seatMode={seatMode}
            selectedSeatId={selectedSeatId}
            currentSeatId={studentProfile.seatId || ''}
            onSelectSeat={(code, hall) => {
              setSelectedSeatId(code);
              setSelectedHall(hall);
            }}
          />

          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Reason / Note for Admin (Optional)
            </label>
            <input
              type="text"
              maxLength={400}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Moving to Morning + Noon double shift for upcoming exam, prefer window row…"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            {hasPendingRequest ? (
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                You already have a pending request awaiting Admin review below.
              </p>
            ) : (
              <span className="text-xs text-slate-500">
                Changes take effect only after Admin approval.
              </span>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0E2A47] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#173d66] disabled:opacity-60 dark:bg-[#C99A2E] dark:text-slate-950"
            >
              <Send className="h-4 w-4" />
              {submitting ? 'Submitting Request…' : 'Send Change Request for Admin Approval'}
            </button>
          </div>
        </div>
      </form>

      {/* Request History */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
          <BookOpen className="h-4 w-4 text-[#0E2A47] dark:text-[#DFB55B]" />
          My Seat & Shift Change Requests ({requests.length})
        </h2>

        {requests.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-xs text-slate-500 dark:border-slate-800">
            No change requests submitted yet.
          </p>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <div
                key={req.id}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs font-bold text-slate-500">
                      {req.referenceNo}
                    </span>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {req.currentSeatId || 'Unseated'} ({(req.currentShiftType || '').replace('_', ' ')}) →{' '}
                      <span className="text-[#0E2A47] dark:text-[#F6D57A]">
                        {req.requestedSeatId || 'Unseated'} ({req.requestedShiftType.replace('_', ' ')})
                      </span>
                    </p>
                  </div>
                  <span
                    className={`rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${
                      req.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : req.status === 'rejected'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    }`}
                  >
                    {req.status === 'pending' ? 'Pending Admin Approval' : req.status}
                  </span>
                </div>
                {req.batchName && (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Course / Batch: <strong>{req.batchName}</strong>
                  </p>
                )}
                {req.reason && (
                  <p className="mt-1 text-xs text-slate-500">Your note: {req.reason}</p>
                )}
                {req.reviewNote && (
                  <p className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                    <strong>Admin Response:</strong> {req.reviewNote}
                  </p>
                )}
                <p className="mt-2 text-[11px] text-slate-400">Submitted {formatTs(req.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
