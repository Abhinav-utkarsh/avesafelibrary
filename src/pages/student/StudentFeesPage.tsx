import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Download,
  FileText,
  Lock,
  Receipt,
  Search,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { FeeReceiptModal } from '../../components/common/FeeReceiptModal';
import { FeeInvoiceModal } from '../../components/common/FeeInvoiceModal';
import {
  subscribeOwnOnlineVerifications,
  subscribeOwnPayments,
  subscribeOwnStudentProfile,
} from '../../services/studentPortalService';
import {
  getCurrentBillingMonth,
  submitOnlinePaymentVerification,
} from '../../services/financeService';
import { submitStudentPaymentProofViaApi } from '../../lib/studentSessionToken';
import {
  ONLINE_PAYMENT_METHODS,
  PAYMENT_METHODS,
  type OnlinePaymentMethod,
  type OnlinePaymentVerificationRecord,
  type PaymentRecord,
  type StudentRecord,
} from '../../types/domain';

function formatPaymentDate(ts?: { toDate: () => Date }): string {
  if (!ts || typeof ts.toDate !== 'function') return 'Recorded';
  return ts.toDate().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function StudentFeesPage() {
  const { firebaseUser, studentProfile, studentAuthMode } = useAuth();
  const [liveProfile, setLiveProfile] = useState<StudentRecord | null>(studentProfile);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [verifications, setVerifications] = useState<OnlinePaymentVerificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentRecord | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  // Submit Online Payment Proof modal state
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [billingMonth, setBillingMonth] = useState(getCurrentBillingMonth());
  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<OnlinePaymentMethod>('upi');
  const [utrReference, setUtrReference] = useState('');
  const [payerName, setPayerName] = useState('');
  const [notes, setNotes] = useState('');
  const [submittingProof, setSubmittingProof] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);
  const [proofSuccess, setProofSuccess] = useState<string | null>(null);

  useEffect(() => {
    if ((!firebaseUser && studentAuthMode !== 'password') || !studentProfile) return;
    const uid = firebaseUser?.uid || studentProfile.uid || studentProfile.id;
    const unsubProfile = subscribeOwnStudentProfile(studentProfile.id, (docData) => {
      if (docData) setLiveProfile(docData);
    });
    const unsubPayments = subscribeOwnPayments(uid, (list) => {
      setPayments(list);
      setLoading(false);
    });
    const unsubVerifications = subscribeOwnOnlineVerifications(
      uid,
      setVerifications,
    );

    return () => {
      unsubProfile();
      unsubPayments();
      unsubVerifications();
    };
  }, [firebaseUser, studentProfile, studentAuthMode]);

  const profile = liveProfile || studentProfile;

  const totalPaid = useMemo(
    () => payments.reduce((sum, p) => sum + Number(p.amountPaid || 0), 0),
    [payments],
  );

  const filteredPayments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter(
      (p) =>
        p.receiptNo.toLowerCase().includes(q) ||
        p.billingMonth.toLowerCase().includes(q) ||
        p.paymentMethod.toLowerCase().includes(q) ||
        (p.notes || '').toLowerCase().includes(q),
    );
  }, [payments, searchQuery]);

  const openProofModal = () => {
    if (!profile) return;
    setProofError(null);
    setBillingMonth(getCurrentBillingMonth());
    setAmount(profile.pendingAmount > 0 ? profile.pendingAmount : profile.monthlyFee || 0);
    setPaymentMethod('upi');
    setUtrReference('');
    setPayerName('');
    setNotes('');
    setProofModalOpen(true);
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || (!firebaseUser && studentAuthMode !== 'password')) return;
    setProofError(null);
    setSubmittingProof(true);
    try {
      if (studentAuthMode === 'password') {
        await submitStudentPaymentProofViaApi({
          billingMonth,
          amount,
          paymentMethod,
          utrReference,
          payerName,
          notes,
        });
      } else if (firebaseUser) {
        await submitOnlinePaymentVerification(
          {
            studentId: profile.id,
            billingMonth,
            amount,
            paymentMethod,
            utrReference,
            payerName,
            notes,
          },
          {
            id: profile.id,
            uid: firebaseUser.uid,
            fullName: profile.fullName,
            registrationNo: profile.registrationNo,
            phone: profile.phone,
          },
          'student',
        );
      }
      setProofModalOpen(false);
      setProofSuccess(
        `Submitted UTR ${utrReference.trim().toUpperCase()} for ₹${Number(amount).toLocaleString('en-IN')}. Once verified by the admin desk, your official A4 receipt will appear automatically.`,
      );
    } catch (err) {
      setProofError(err instanceof Error ? err.message : 'Unable to submit payment proof.');
    } finally {
      setSubmittingProof(false);
    }
  };

  if (!profile) {
    return (
      <div className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
        Loading your fee ledger...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Fees, Invoices &amp; Receipts
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Track pending dues, submit UPI/Bank UTR proofs for verification, and download A4 receipts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={openProofModal}
            className="inline-flex items-center justify-center gap-2 min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-[#0B1F3A] dark:text-sky-400 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-4 h-4" />
            Submit Online Payment Proof
          </button>
          <button
            type="button"
            onClick={() => setInvoiceOpen(true)}
            className="inline-flex items-center justify-center gap-2 min-h-[42px] px-4 py-2 rounded-xl bg-[#0B1F3A] dark:bg-sky-500 hover:bg-[#132E54] dark:hover:bg-sky-400 text-white dark:text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            <FileText className="w-4 h-4" />
            Fee Bill / Invoice
          </button>
        </div>
      </div>

      {proofSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{proofSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setProofSuccess(null)}
            className="underline font-semibold cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Balance Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div
          className={`rounded-2xl p-5 border ${
            profile.pendingAmount > 0
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
              : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider">
            <span
              className={
                profile.pendingAmount > 0
                  ? 'text-amber-800 dark:text-amber-300'
                  : 'text-emerald-800 dark:text-emerald-300'
              }
            >
              Pending Balance
            </span>
            {profile.pendingAmount > 0 ? (
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            )}
          </div>
          <p
            className={`font-mono text-3xl font-bold mt-2 tabular-nums ${
              profile.pendingAmount > 0
                ? 'text-amber-950 dark:text-amber-100'
                : 'text-emerald-950 dark:text-emerald-100'
            }`}
          >
            ₹{Number(profile.pendingAmount || 0).toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5">
            {profile.pendingAmount > 0
              ? 'Pay at desk or submit UPI UTR proof above'
              : 'All dues cleared'}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Monthly Plan Fee</span>
            <CreditCard className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />
          </div>
          <p className="font-mono text-3xl font-bold text-slate-900 dark:text-white mt-2 tabular-nums">
            ₹{Number(profile.monthlyFee || 0).toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
            Expiry: {profile.membershipExpiry || 'Not scheduled'}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Total Paid</span>
            <Receipt className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="font-mono text-3xl font-bold text-slate-900 dark:text-white mt-2 tabular-nums">
            ₹{totalPaid.toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
            Across {payments.length} verified receipt{payments.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {/* Online Payment Verification Submissions */}
      {verifications.length > 0 && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />
              My Online Payment Verifications ({verifications.length})
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {verifications.map((item) => (
              <div
                key={item.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="space-y-0.5">
                  <p className="font-mono font-bold text-slate-900 dark:text-white">
                    UTR: {item.utrReference} · ₹{Number(item.amount || 0).toLocaleString('en-IN')}
                  </p>
                  <p className="text-slate-500 dark:text-slate-400">
                    {item.billingMonth} · {item.paymentMethod.toUpperCase()}
                    {item.payerName ? ` · ${item.payerName}` : ''}
                    {item.receiptNo ? ` · Receipt ${item.receiptNo}` : ''}
                  </p>
                  {item.reviewNote && (
                    <p className="text-slate-600 dark:text-slate-300">{item.reviewNote}</p>
                  )}
                </div>
                <span
                  className={`font-semibold uppercase tracking-wide shrink-0 ${
                    item.status === 'approved'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : item.status === 'rejected'
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {item.status === 'pending' ? 'Pending Verification' : item.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Admin-controlled Financial Policy Notice */}
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
        <Lock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <span>
          Financial records are immutable and admin-verified. After sending a UPI or Bank Transfer, submit your UTR reference above for fast verification and automatic A4 receipt issuance.
        </span>
      </div>

      {/* Payment History */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Payment History ({filteredPayments.length})
          </h2>
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search receipt or month..."
              className="w-full min-h-[40px] pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            Loading payment history...
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="py-12 px-4 text-center">
            <Receipt className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              No payment receipts found
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Receipts appear here automatically once recorded or verified by the Av_eSAFE Library desk.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredPayments.map((payment) => {
              const methodLabel =
                PAYMENT_METHODS.find((m) => m.id === payment.paymentMethod)?.label ||
                payment.paymentMethod;

              return (
                <div
                  key={payment.id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="font-mono text-sm font-bold text-[#0B1F3A] dark:text-sky-400">
                        {payment.receiptNo}
                      </span>
                      <span className="text-slate-300 dark:text-slate-700">·</span>
                      <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                        {payment.billingMonth}
                      </span>
                      <span className="text-slate-300 dark:text-slate-700">·</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {formatPaymentDate(payment.paidAt)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Mode: <span className="font-medium">{methodLabel}</span>
                      {payment.discount > 0 && (
                        <> · Discount: ₹{payment.discount.toLocaleString('en-IN')}</>
                      )}{' '}
                      · Remaining due: ₹{payment.dueAmount.toLocaleString('en-IN')}
                    </p>
                    {payment.notes && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{payment.notes}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                    <span className="font-mono text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                      ₹{payment.amountPaid.toLocaleString('en-IN')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedReceipt(payment)}
                      className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Receipt
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Submit Online Payment Proof Modal */}
      {proofModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => setProofModalOpen(false)}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-[#0B1F3A] dark:text-white">
                Submit Online Payment Proof
              </h3>
              <button
                type="button"
                onClick={() => setProofModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmitProof} className="p-5 space-y-4">
              {proofError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                  {proofError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Billing Month *
                  </label>
                  <input
                    type="month"
                    required
                    value={billingMonth}
                    onChange={(e) => setBillingMonth(e.target.value)}
                    className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Amount Paid (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={500000}
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Payment Mode *
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as OnlinePaymentMethod)}
                    className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
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
                    UTR / Ref No *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={4}
                    maxLength={80}
                    value={utrReference}
                    onChange={(e) => setUtrReference(e.target.value)}
                    placeholder="12-digit UTR"
                    className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Payer Name / App (optional)
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  placeholder="e.g. GPay / PhonePe / Parent Name"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Remarks (optional)
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional note for desk administrator"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setProofModalOpen(false)}
                  className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingProof}
                  className="min-h-[40px] px-5 rounded-xl bg-[#0B1F3A] dark:bg-sky-500 dark:text-slate-950 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {submittingProof ? 'Submitting...' : 'Submit for Verification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <FeeReceiptModal
        payment={selectedReceipt}
        student={profile}
        onClose={() => setSelectedReceipt(null)}
      />
      <FeeInvoiceModal
        student={invoiceOpen ? profile : null}
        payment={null}
        onClose={() => setInvoiceOpen(false)}
      />
    </div>
  );
}
