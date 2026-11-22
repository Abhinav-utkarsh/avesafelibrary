import React, { useMemo, useState } from 'react';
import { CheckCircle2, Plus, Search, ShieldCheck, X, XCircle } from 'lucide-react';
import {
  ONLINE_PAYMENT_METHODS,
  type AdminProfile,
  type OnlinePaymentMethod,
  type OnlinePaymentStatus,
  type OnlinePaymentVerificationRecord,
  type PaymentRecord,
  type StudentRecord,
} from '../../../types/domain';
import {
  approveOnlinePaymentVerification,
  getCurrentBillingMonth,
  rejectOnlinePaymentVerification,
  submitOnlinePaymentVerification,
} from '../../../services/financeService';
import { StudentAvatar } from '../../common/StudentAvatar';
import { WhatsAppButton } from '../../common/WhatsAppButton';

interface FeesOnlineVerificationPanelProps {
  verifications: OnlinePaymentVerificationRecord[];
  students: StudentRecord[];
  adminProfile: AdminProfile | null;
  onApprovedReceipt: (receipt: PaymentRecord) => void;
  onNotify: (msg: string) => void;
}

export function FeesOnlineVerificationPanel({
  verifications,
  students,
  adminProfile,
  onApprovedReceipt,
  onNotify,
}: FeesOnlineVerificationPanelProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | OnlinePaymentStatus>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [logModalOpen, setLogModalOpen] = useState(false);

  // Manual Desk Online Payment Log form
  const [studentId, setStudentId] = useState('');
  const [billingMonth, setBillingMonth] = useState(getCurrentBillingMonth());
  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<OnlinePaymentMethod>('upi');
  const [utrReference, setUtrReference] = useState('');
  const [payerName, setPayerName] = useState('');
  const [notes, setNotes] = useState('');
  const [submittingLog, setSubmittingLog] = useState(false);

  // Review modal state
  const [reviewItem, setReviewItem] = useState<OnlinePaymentVerificationRecord | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve');
  const [extendExpiry30Days, setExtendExpiry30Days] = useState(true);
  const [reviewNote, setReviewNote] = useState('');
  const [processingReview, setProcessingReview] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  const counts = useMemo(() => {
    const pending = verifications.filter((v) => v.status === 'pending').length;
    const approved = verifications.filter((v) => v.status === 'approved').length;
    const rejected = verifications.filter((v) => v.status === 'rejected').length;
    const pendingAmount = verifications
      .filter((v) => v.status === 'pending')
      .reduce((s, v) => s + Number(v.amount || 0), 0);
    return { pending, approved, rejected, pendingAmount };
  }, [verifications]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return verifications.filter((v) => {
      if (statusFilter !== 'all' && v.status !== statusFilter) return false;
      if (!q) return true;
      return `${v.studentName} ${v.registrationNo || ''} ${v.utrReference} ${v.payerName || ''} ${v.billingMonth}`
        .toLowerCase()
        .includes(q);
    });
  }, [verifications, statusFilter, searchQuery]);

  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    setErrorMsg(null);
    const target = studentMap.get(studentId);
    if (!target) {
      setErrorMsg('Please select a student.');
      return;
    }
    setSubmittingLog(true);
    try {
      await submitOnlinePaymentVerification(
        {
          studentId: target.id,
          billingMonth,
          amount,
          paymentMethod,
          utrReference,
          payerName,
          notes,
        },
        target,
        'admin',
        adminProfile,
      );
      setLogModalOpen(false);
      setUtrReference('');
      setPayerName('');
      setNotes('');
      onNotify(`Logged online transfer UTR ${utrReference.toUpperCase()} for verification.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to log online payment.');
    } finally {
      setSubmittingLog(false);
    }
  };

  const openReview = (item: OnlinePaymentVerificationRecord, action: 'approve' | 'reject') => {
    setErrorMsg(null);
    setReviewItem(item);
    setReviewAction(action);
    setExtendExpiry30Days(true);
    setReviewNote(
      action === 'approve'
        ? 'Verified against bank / UPI statement'
        : 'UTR reference not matched in bank statement',
    );
  };

  const handleConfirmReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewItem || !adminProfile) return;
    setErrorMsg(null);
    setProcessingReview(true);
    try {
      if (reviewAction === 'approve') {
        const receipt = await approveOnlinePaymentVerification(
          reviewItem,
          { extendExpiry30Days, reviewNote },
          adminProfile,
        );
        setReviewItem(null);
        onApprovedReceipt(receipt);
        onNotify(
          `Verified UTR ${reviewItem.utrReference} and issued official receipt ${receipt.receiptNo}.`,
        );
      } else {
        await rejectOnlinePaymentVerification(reviewItem, reviewNote, adminProfile);
        setReviewItem(null);
        onNotify(`Marked UTR ${reviewItem.utrReference} as rejected and notified student.`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to process verification.');
    } finally {
      setProcessingReview(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Awaiting Verification</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {counts.pending}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
            ₹{counts.pendingAmount.toLocaleString('en-IN')} pending check
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Verified &amp; Receipted</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">
            {counts.approved}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Posted to ledger</p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Rejected / Mismatched</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
            {counts.rejected}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Returned to student</p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400">Log Incoming Transfer</p>
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              setLogModalOpen(true);
            }}
            className="mt-2 inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] text-white text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Log Online UTR
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-fit">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer ${
                statusFilter === st
                  ? 'bg-white dark:bg-slate-900 text-[#0B1F3A] dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search UTR, student, payer..."
            className="w-full min-h-[40px] pl-10 pr-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
          />
        </div>
      </div>

      {/* Verification Queue Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <ShieldCheck className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
            <p className="font-display text-base font-semibold text-slate-900 dark:text-white">
              No online payment verifications in this queue
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Students can submit their UPI / Bank Transfer UTR directly from the Student Portal, or you can log an incoming transfer using &quot;Log Online UTR&quot;.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3.5 px-5">Student</th>
                  <th className="py-3.5 px-4">UTR / Mode &amp; Payer</th>
                  <th className="py-3.5 px-4">Month</th>
                  <th className="py-3.5 px-4 text-right">Amount</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                {filtered.map((item) => {
                  const matchedStudent = studentMap.get(item.studentId);
                  const phone = matchedStudent?.phone || item.phone;
                  const waMessage =
                    item.status === 'approved'
                      ? `Hello ${item.studentName}, your online payment of ₹${item.amount.toLocaleString('en-IN')} (UTR: ${item.utrReference}) at Av_eSAFE Library has been verified! Official Receipt: ${item.receiptNo || 'Issued'}.`
                      : item.status === 'rejected'
                        ? `Hello ${item.studentName}, regarding your submitted online payment of ₹${item.amount.toLocaleString('en-IN')} (UTR: ${item.utrReference}): ${item.reviewNote || 'please re-verify your UTR reference at the Electronic City desk.'}`
                        : `Hello ${item.studentName}, we received your online payment submission of ₹${item.amount.toLocaleString('en-IN')} (UTR: ${item.utrReference}) for ${item.billingMonth}. Could you please share the payment screenshot here for quick verification?`;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <StudentAvatar
                            name={item.studentName}
                            photoUrl={matchedStudent?.profilePhotoUrl}
                            gender={matchedStudent?.gender}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-white truncate">
                              {item.studentName}
                            </p>
                            <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                              {item.registrationNo || matchedStudent?.registrationNo || '—'} · via{' '}
                              {item.submittedByRole}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <p className="font-mono text-xs font-bold text-[#0B1F3A] dark:text-sky-400">
                          {item.utrReference}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {item.paymentMethod.toUpperCase()}
                          {item.payerName ? ` · ${item.payerName}` : ''}
                        </p>
                        {item.notes && (
                          <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[220px]">
                            {item.notes}
                          </p>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                        {item.billingMonth}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                        ₹{Number(item.amount || 0).toLocaleString('en-IN')}
                      </td>

                      <td className="py-3.5 px-4 text-xs">
                        <span
                          className={`font-semibold capitalize ${
                            item.status === 'approved'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : item.status === 'rejected'
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {item.status}
                        </span>
                        {item.receiptNo && (
                          <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {item.receiptNo}
                          </p>
                        )}
                        {item.reviewNote && (
                          <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[180px]">
                            {item.reviewNote}
                          </p>
                        )}
                      </td>

                      <td className="py-3.5 px-5 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <WhatsAppButton phone={phone} message={waMessage} size="xs" variant="outline" />
                          {item.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => openReview(item, 'approve')}
                                className="inline-flex items-center gap-1 min-h-[32px] px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Verify &amp; Receipt
                              </button>
                              <button
                                type="button"
                                onClick={() => openReview(item, 'reject')}
                                className="inline-flex items-center gap-1 min-h-[32px] px-2.5 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold cursor-pointer whitespace-nowrap"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Reject
                              </button>
                            </>
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

      {/* Log Online Payment Modal */}
      {logModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => setLogModalOpen(false)}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
          />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-[#0B1F3A] dark:text-white">
                Log Online Payment for Verification
              </h3>
              <button
                type="button"
                onClick={() => setLogModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleLogSubmit} className="p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Student *
                </label>
                <select
                  required
                  value={studentId}
                  onChange={(e) => {
                    setStudentId(e.target.value);
                    const st = studentMap.get(e.target.value);
                    if (st) setAmount(st.pendingAmount > 0 ? st.pendingAmount : st.monthlyFee);
                  }}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                >
                  <option value="">Select student...</option>
                  {students.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.fullName} ({st.registrationNo}) — Due ₹{st.pendingAmount}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Billing Month *
                  </label>
                  <input
                    type="month"
                    required
                    value={billingMonth}
                    onChange={(e) => setBillingMonth(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Amount (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={500000}
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Channel *
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as OnlinePaymentMethod)}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  >
                    {ONLINE_PAYMENT_METHODS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    UTR / Ref Number *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={4}
                    maxLength={80}
                    value={utrReference}
                    onChange={(e) => setUtrReference(e.target.value)}
                    placeholder="e.g. 432619824510"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Payer Name / App
                  </label>
                  <input
                    type="text"
                    maxLength={120}
                    value={payerName}
                    onChange={(e) => setPayerName(e.target.value)}
                    placeholder="e.g. PhonePe / Parent Account"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Notes
                  </label>
                  <input
                    type="text"
                    maxLength={300}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional reference note"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setLogModalOpen(false)}
                  className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingLog}
                  className="min-h-[40px] px-5 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {submittingLog ? 'Saving...' : 'Submit to Queue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review Confirm Modal */}
      {reviewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => setReviewItem(null)}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-[#0B1F3A] dark:text-white">
                {reviewAction === 'approve'
                  ? 'Approve & Issue Official Receipt'
                  : 'Reject Online Payment Proof'}
              </h3>
              <button
                type="button"
                onClick={() => setReviewItem(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleConfirmReview} className="p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                  {errorMsg}
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 space-y-1 text-xs">
                <p className="font-semibold text-slate-900 dark:text-white">
                  {reviewItem.studentName} · ₹{Number(reviewItem.amount).toLocaleString('en-IN')}
                </p>
                <p className="font-mono text-slate-600 dark:text-slate-300">
                  UTR: {reviewItem.utrReference} · Month: {reviewItem.billingMonth}
                </p>
              </div>

              {reviewAction === 'approve' && (
                <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={extendExpiry30Days}
                    onChange={(e) => setExtendExpiry30Days(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  Extend membership expiry by +30 days &amp; mark student Active
                </label>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {reviewAction === 'approve' ? 'Verification Note' : 'Rejection Reason *'}
                </label>
                <input
                  type="text"
                  required={reviewAction === 'reject'}
                  maxLength={300}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReviewItem(null)}
                  className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processingReview}
                  className={`min-h-[40px] px-5 rounded-xl text-white text-xs font-semibold cursor-pointer disabled:opacity-50 ${
                    reviewAction === 'approve'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {processingReview
                    ? 'Processing...'
                    : reviewAction === 'approve'
                      ? 'Verify & Issue Receipt'
                      : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
