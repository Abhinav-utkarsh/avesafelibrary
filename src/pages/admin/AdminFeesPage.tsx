import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  AlertTriangle,
  CalendarPlus,
  CalendarRange,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileText,
  History,
  Receipt,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import {
  PAYMENT_METHODS,
  type OnlinePaymentVerificationRecord,
  type PaymentMethod,
  type PaymentRecord,
  type StudentRecord,
} from '../../types/domain';
import {
  collectFeeTransaction,
  extendStudentMembershipDays,
  generateIdempotencyKey,
  getCurrentBillingMonth,
  subscribeOnlinePaymentVerifications,
  subscribePayments,
} from '../../services/financeService';
import { getDaysUntilExpiry, subscribeStudents } from '../../services/studentService';
import { useAuth } from '../../context/AuthContext';
import { AnimatedCounter } from '../../components/common/AnimatedCounter';
import { FeeReceiptModal } from '../../components/common/FeeReceiptModal';
import { FeeInvoiceModal } from '../../components/common/FeeInvoiceModal';
import { StudentAvatar } from '../../components/common/StudentAvatar';
import { WhatsAppButton } from '../../components/common/WhatsAppButton';
import {
  buildEarlyExpiryWhatsApp,
  buildFeeReminderWhatsApp,
  buildReceiptShareWhatsApp,
  buildRemainingDueWhatsApp,
} from '../../lib/whatsapp';
import { FeesManagePanel } from '../../components/admin/fees/FeesManagePanel';
import { FeesRevenuePanel } from '../../components/admin/fees/FeesRevenuePanel';
import { FeesOnlineVerificationPanel } from '../../components/admin/fees/FeesOnlineVerificationPanel';

type FeeSection =
  | 'manage'
  | 'collect'
  | 'pending'
  | 'early_expiry'
  | 'remaining_due'
  | 'revenue'
  | 'monthly_fee'
  | 'history'
  | 'online_verification';

const VALID_SECTIONS: FeeSection[] = [
  'manage',
  'collect',
  'pending',
  'early_expiry',
  'remaining_due',
  'revenue',
  'monthly_fee',
  'history',
  'online_verification',
];

const SECTION_META: Record<
  FeeSection,
  { label: string; subtitle: string; icon: React.ComponentType<{ className?: string }> }
> = {
  manage: {
    label: 'Manage Fees',
    subtitle: 'Configure student monthly fee plans, adjust dues, and post monthly billing cycles.',
    icon: SlidersHorizontal,
  },
  collect: {
    label: 'Collect Fee',
    subtitle: 'Reception fee collection counter with duplicate-month guard and instant A4 receipt.',
    icon: CreditCard,
  },
  pending: {
    label: 'Pending Fees',
    subtitle: 'Students carrying outstanding fee balances with one-click WhatsApp reminders.',
    icon: AlertCircle,
  },
  early_expiry: {
    label: 'Early Expiry',
    subtitle: 'Track memberships expiring soon or already overdue and renew proactively.',
    icon: Clock,
  },
  remaining_due: {
    label: 'Remaining Due',
    subtitle: 'Monitor partial payments and residual fee balances awaiting final settlement.',
    icon: Wallet,
  },
  revenue: {
    label: 'Revenue',
    subtitle: 'Real-time monthly collection trends, payment mode mix, and hall-wise receivables.',
    icon: TrendingUp,
  },
  monthly_fee: {
    label: 'Monthly Fee',
    subtitle: 'Month-by-month billing status matrix tracking Paid, Partial, and Unpaid members.',
    icon: CalendarRange,
  },
  history: {
    label: 'Payment History',
    subtitle: 'Immutable official receipts ledger with A4 invoices, CSV export, and WhatsApp share.',
    icon: History,
  },
  online_verification: {
    label: 'Online Payment Verification',
    subtitle: 'Verify student UPI / Bank Transfer UTR proofs and issue official receipts atomically.',
    icon: ShieldCheck,
  },
};

function escapeCsv(val: string | number | undefined): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function AdminFeesPage() {
  const { adminProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawSection = searchParams.get('section') as FeeSection | null;
  const activeSection: FeeSection =
    rawSection && VALID_SECTIONS.includes(rawSection) ? rawSection : 'pending';

  const setActiveSection = (section: FeeSection) => {
    setSearchParams({ section });
  };

  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [verifications, setVerifications] = useState<OnlinePaymentVerificationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState<PaymentMethod | 'all'>('all');
  const [historyMonthFilter, setHistoryMonthFilter] = useState<string>('');
  const [expiryWindow, setExpiryWindow] = useState<'expired' | '3' | '7' | '15'>('15');
  const [extendingId, setExtendingId] = useState<string | null>(null);

  // Collect Fee Form state (shared by embedded Collect Counter & Quick Collect Modal)
  const [collectOpen, setCollectOpen] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [counterStudentSearch, setCounterStudentSearch] = useState('');
  const [billingMonth, setBillingMonth] = useState(getCurrentBillingMonth());
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('upi');
  const [notes, setNotes] = useState('');
  const [extendExpiry30Days, setExtendExpiry30Days] = useState(true);
  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey());
  const [allowDuplicateMonthOverride, setAllowDuplicateMonthOverride] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<PaymentRecord | null>(null);
  const [activeInvoice, setActiveInvoice] = useState<{
    student: StudentRecord;
    payment?: PaymentRecord | null;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const unsubStudents = subscribeStudents(setStudents);
    const unsubPayments = subscribePayments((list) => {
      setPayments(list);
      setLoading(false);
    });
    const unsubVerifications = subscribeOnlinePaymentVerifications(setVerifications);
    return () => {
      unsubStudents();
      unsubPayments();
      unsubVerifications();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const currentMonth = getCurrentBillingMonth();

  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  const latestPaymentByStudent = useMemo(() => {
    const map = new Map<string, PaymentRecord>();
    for (const p of payments) {
      if (!map.has(p.studentId)) {
        map.set(p.studentId, p);
      }
    }
    return map;
  }, [payments]);

  const totalPaidByStudent = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payments) {
      map.set(p.studentId, (map.get(p.studentId) || 0) + Number(p.amountPaid || 0));
    }
    return map;
  }, [payments]);

  const stats = useMemo(() => {
    const totalCollectedAllTime = payments.reduce((sum, p) => sum + (Number(p.amountPaid) || 0), 0);
    const thisMonthCollected = payments
      .filter((p) => p.billingMonth === currentMonth)
      .reduce((sum, p) => sum + (Number(p.amountPaid) || 0), 0);
    const pendingStudents = students
      .filter((s) => Number(s.pendingAmount) > 0)
      .sort((a, b) => Number(b.pendingAmount) - Number(a.pendingAmount));
    const totalPending = pendingStudents.reduce((sum, s) => sum + (Number(s.pendingAmount) || 0), 0);

    const earlyExpiryStudents = students
      .filter((s) => {
        if (s.status === 'inactive' || s.status === 'suspended') return false;
        const d = getDaysUntilExpiry(s.membershipExpiry);
        return d !== null && d <= 15;
      })
      .sort((a, b) => {
        const da = getDaysUntilExpiry(a.membershipExpiry) ?? 999;
        const db = getDaysUntilExpiry(b.membershipExpiry) ?? 999;
        return da - db;
      });

    const pendingVerificationsCount = verifications.filter((v) => v.status === 'pending').length;

    return {
      totalCollectedAllTime,
      thisMonthCollected,
      totalPending,
      pendingCount: pendingStudents.length,
      receiptCount: payments.length,
      pendingStudents,
      earlyExpiryStudents,
      pendingVerificationsCount,
    };
  }, [payments, students, verifications, currentMonth]);

  const selectedStudentObj = useMemo(
    () => students.find((s) => s.id === studentId) || null,
    [students, studentId],
  );

  const existingSameMonthPayment = useMemo(() => {
    if (!studentId || !billingMonth) return null;
    return (
      payments.find((p) => p.studentId === studentId && p.billingMonth === billingMonth) || null
    );
  }, [payments, studentId, billingMonth]);

  const projectedRemainingDue = useMemo(() => {
    if (!selectedStudentObj) return 0;
    const base = Math.max(0, Number(selectedStudentObj.pendingAmount) || 0);
    return Math.max(0, base - (Number(amountPaid) || 0) - (Number(discount) || 0));
  }, [selectedStudentObj, amountPaid, discount]);

  const filteredPending = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return stats.pendingStudents.filter((s) => {
      if (!q) return true;
      return `${s.fullName} ${s.registrationNo} ${s.phone} ${s.seatId || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [stats.pendingStudents, searchQuery]);

  const filteredEarlyExpiry = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return stats.earlyExpiryStudents.filter((s) => {
      const days = getDaysUntilExpiry(s.membershipExpiry);
      if (days === null) return false;
      if (expiryWindow === 'expired' && days >= 0) return false;
      if (expiryWindow === '3' && days > 3) return false;
      if (expiryWindow === '7' && days > 7) return false;
      if (expiryWindow === '15' && days > 15) return false;
      if (!q) return true;
      return `${s.fullName} ${s.registrationNo} ${s.phone} ${s.seatId || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [stats.earlyExpiryStudents, expiryWindow, searchQuery]);

  const remainingDueRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return stats.pendingStudents
      .map((s) => {
        const lastPayment = latestPaymentByStudent.get(s.id) || null;
        const paidLifetime = totalPaidByStudent.get(s.id) || 0;
        const paidThisMonth = payments
          .filter((p) => p.studentId === s.id && p.billingMonth === currentMonth)
          .reduce((acc, p) => acc + Number(p.amountPaid || 0), 0);
        const isPartial = paidThisMonth > 0 || (lastPayment !== null && lastPayment.dueAmount > 0);
        return { student: s, lastPayment, paidLifetime, paidThisMonth, isPartial };
      })
      .filter((row) => {
        if (!q) return true;
        const s = row.student;
        return `${s.fullName} ${s.registrationNo} ${s.phone} ${s.seatId || ''}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        if (a.isPartial !== b.isPartial) return a.isPartial ? -1 : 1;
        return Number(b.student.pendingAmount) - Number(a.student.pendingAmount);
      });
  }, [stats.pendingStudents, latestPaymentByStudent, totalPaidByStudent, payments, currentMonth, searchQuery]);

  const filteredPayments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return payments.filter((p) => {
      if (methodFilter !== 'all' && p.paymentMethod !== methodFilter) return false;
      if (historyMonthFilter && p.billingMonth !== historyMonthFilter) return false;
      if (!q) return true;
      return `${p.receiptNo} ${p.studentName} ${p.billingMonth} ${p.paymentMethod} ${p.notes || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [payments, methodFilter, historyMonthFilter, searchQuery]);

  const counterFilteredStudents = useMemo(() => {
    const q = counterStudentSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      `${s.fullName} ${s.registrationNo} ${s.phone} ${s.seatId || ''}`.toLowerCase().includes(q),
    );
  }, [students, counterStudentSearch]);

  const prepareCollectForm = (prefillStudent?: StudentRecord) => {
    setModalError(null);
    setAllowDuplicateMonthOverride(false);
    setIdempotencyKey(generateIdempotencyKey());
    setBillingMonth(getCurrentBillingMonth());
    setDiscount(0);
    setPaymentMethod('upi');
    setNotes('');
    setExtendExpiry30Days(true);

    if (prefillStudent) {
      setStudentId(prefillStudent.id);
      setAmountPaid(
        prefillStudent.pendingAmount > 0 ? prefillStudent.pendingAmount : prefillStudent.monthlyFee,
      );
    } else {
      setStudentId('');
      setAmountPaid(0);
    }
  };

  const openCollectModal = (prefillStudent?: StudentRecord) => {
    prepareCollectForm(prefillStudent);
    setCollectOpen(true);
  };

  const handleSelectStudent = (nextId: string) => {
    setStudentId(nextId);
    setAllowDuplicateMonthOverride(false);
    setModalError(null);
    const st = students.find((s) => s.id === nextId);
    if (st) {
      setAmountPaid(st.pendingAmount > 0 ? st.pendingAmount : st.monthlyFee);
    } else {
      setAmountPaid(0);
    }
  };

  const handleCollectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    setModalError(null);

    if (!studentId) {
      setModalError('Please select a student.');
      return;
    }

    if (existingSameMonthPayment && !allowDuplicateMonthOverride) {
      setModalError(
        `A payment (${existingSameMonthPayment.receiptNo}) already exists for ${billingMonth}. Confirm the installment checkbox below if you intend to record an additional payment for the same month.`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const receipt = await collectFeeTransaction(
        {
          studentId,
          billingMonth,
          amountPaid,
          discount,
          paymentMethod,
          idempotencyKey,
          notes,
          extendExpiry30Days,
        },
        adminProfile,
      );
      setCollectOpen(false);
      setActiveReceipt(receipt);
      setIdempotencyKey(generateIdempotencyKey());
      setAllowDuplicateMonthOverride(false);
      setNotes('');
      setDiscount(0);
      setToast(`Issued receipt ${receipt.receiptNo} for ₹${receipt.amountPaid.toLocaleString('en-IN')}.`);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Unable to record fee payment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickExtend30 = async (student: StudentRecord) => {
    if (!adminProfile) return;
    setExtendingId(student.id);
    try {
      const nextDate = await extendStudentMembershipDays(student, 30, adminProfile);
      setToast(`Extended ${student.fullName}'s membership by +30 days (Valid until ${nextDate}).`);
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Unable to extend membership.');
    } finally {
      setExtendingId(null);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Receipt No',
      'Student Name',
      'Billing Month',
      'Amount Paid',
      'Discount',
      'Remaining Due',
      'Payment Method',
      'Idempotency Key',
      'Notes',
    ];
    const rows = filteredPayments.map((p) => [
      p.receiptNo,
      p.studentName,
      p.billingMonth,
      p.amountPaid,
      p.discount,
      p.dueAmount,
      p.paymentMethod,
      p.idempotencyKey,
      p.notes || '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `av_esafe-payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setToast(`Exported ${filteredPayments.length} payment records to CSV.`);
  };

  const sectionInfo = SECTION_META[activeSection];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Payment &amp; Fees · Av_eSAFE Library, Electronic City, Bangalore
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0B1F3A] dark:text-white mt-1">
            {sectionInfo.label}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
            {sectionInfo.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={filteredPayments.length === 0}
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => openCollectModal()}
            className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] dark:hover:bg-blue-500 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            <CreditCard className="w-4 h-4" />
            Quick Collect Fee
          </button>
        </div>
      </div>

      {toast && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{toast}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-xs font-semibold underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Horizontal Section Bar (mirrors all 9 Sidebar Sub-items) */}
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          {VALID_SECTIONS.map((sec) => {
            const Icon = SECTION_META[sec].icon;
            const isActive = activeSection === sec;
            const countBadge =
              sec === 'pending'
                ? stats.pendingCount
                : sec === 'early_expiry'
                  ? stats.earlyExpiryStudents.length
                  : sec === 'online_verification'
                    ? stats.pendingVerificationsCount
                    : sec === 'history'
                      ? payments.length
                      : null;

            return (
              <button
                key={sec}
                type="button"
                onClick={() => setActiveSection(sec)}
                className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-white dark:bg-slate-800 text-[#0B1F3A] dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{SECTION_META[sec].label}</span>
                {countBadge !== null && countBadge > 0 && (
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.5 rounded-md ${
                      sec === 'online_verification' && countBadge > 0
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        : 'bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {countBadge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Global KPI Strip (shown on ledger overview tabs) */}
      {(activeSection === 'pending' ||
        activeSection === 'history' ||
        activeSection === 'early_expiry' ||
        activeSection === 'remaining_due') && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Collected ({currentMonth})
            </p>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1.5">
              <AnimatedCounter value={stats.thisMonthCollected} prefix="₹" />
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Current billing cycle</p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">Pending Fee Balances</p>
            <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1.5">
              <AnimatedCounter value={stats.totalPending} prefix="₹" />
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
              Across {stats.pendingCount} students
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">Early Expiry Alerts (≤15d)</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1.5">
              <AnimatedCounter value={stats.earlyExpiryStudents.length} />
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Expiring soon or expired</p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">Official Receipts Issued</p>
            <p className="text-2xl font-bold text-[#0B1F3A] dark:text-white mt-1.5">
              <AnimatedCounter value={stats.receiptCount} />
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              ₹{stats.totalCollectedAllTime.toLocaleString('en-IN')} all-time ledger
            </p>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECTION 1 & 7: MANAGE FEES & MONTHLY FEE                              */}
      {/* ==================================================================== */}
      {(activeSection === 'manage' || activeSection === 'monthly_fee') && (
        <FeesManagePanel
          mode={activeSection}
          students={students}
          payments={payments}
          adminProfile={adminProfile}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onCollectFee={(st) => openCollectModal(st)}
          onOpenInvoice={(st) => setActiveInvoice({ student: st, payment: null })}
          onNotify={(msg) => setToast(msg)}
        />
      )}

      {/* ==================================================================== */}
      {/* SECTION 2: COLLECT FEE (DEDICATED COUNTER)                            */}
      {/* ==================================================================== */}
      {activeSection === 'collect' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-bold text-[#0B1F3A] dark:text-white">
                  Reception Fee Collection Counter
                </h2>
                <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Idempotency Key: {idempotencyKey}
                </p>
              </div>
              <button
                type="button"
                onClick={() => prepareCollectForm()}
                className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                Reset Form
              </button>
            </div>

            <form onSubmit={handleCollectSubmit} className="p-6 space-y-4">
              {modalError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300"
                >
                  {modalError}
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Find &amp; Select Student *
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={counterStudentSearch}
                    onChange={(e) => setCounterStudentSearch(e.target.value)}
                    placeholder="Filter student dropdown by name, reg no, phone, seat..."
                    className="w-full min-h-[38px] pl-10 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <select
                  required
                  value={studentId}
                  onChange={(e) => handleSelectStudent(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                >
                  <option value="">Select student ({counterFilteredStudents.length})...</option>
                  {counterFilteredStudents.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.fullName} ({st.registrationNo}) — Due ₹{st.pendingAmount} · Monthly ₹{st.monthlyFee}
                    </option>
                  ))}
                </select>
              </div>

              {selectedStudentObj && (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <StudentAvatar
                      name={selectedStudentObj.fullName}
                      photoUrl={selectedStudentObj.profilePhotoUrl}
                      gender={selectedStudentObj.gender}
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {selectedStudentObj.fullName}
                      </p>
                      <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                        {selectedStudentObj.registrationNo} · {selectedStudentObj.phone} ·{' '}
                        {selectedStudentObj.seatId || 'Unseated'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <WhatsAppButton
                      phone={selectedStudentObj.phone}
                      message={buildFeeReminderWhatsApp(selectedStudentObj)}
                      size="xs"
                      variant="outline"
                    />
                    <button
                      type="button"
                      onClick={() => setActiveInvoice({ student: selectedStudentObj, payment: null })}
                      className="min-h-[30px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      Fee Bill
                    </button>
                  </div>
                </div>
              )}

              {existingSameMonthPayment && (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 space-y-2">
                  <div className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Receipt{' '}
                      <span className="font-mono font-semibold">
                        {existingSameMonthPayment.receiptNo}
                      </span>{' '}
                      (₹{existingSameMonthPayment.amountPaid}) already exists for{' '}
                      <span className="font-mono">{billingMonth}</span>.
                    </span>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowDuplicateMonthOverride}
                      onChange={(e) => setAllowDuplicateMonthOverride(e.target.checked)}
                      className="w-4 h-4 rounded"
                    />
                    Confirm additional / balance installment for {billingMonth}
                  </label>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    Payment Mode *
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Amount Paid (₹) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={500000}
                    required
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(Number(e.target.value))}
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Discount (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100000}
                    value={discount}
                    onChange={(e) => setDiscount(Number(e.target.value))}
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {selectedStudentObj && (
                <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/60 flex items-center justify-between text-xs font-mono tabular-nums">
                  <span className="text-slate-700 dark:text-slate-300">
                    Current Pending: ₹{selectedStudentObj.pendingAmount.toLocaleString('en-IN')}
                  </span>
                  <span className="font-bold text-[#0B1F3A] dark:text-sky-400">
                    Projected Remaining Due: ₹{projectedRemainingDue.toLocaleString('en-IN')}
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Notes / UTR Reference (optional)
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. GPay / PhonePe UTR or desk receipt remark"
                  className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={extendExpiry30Days}
                  onChange={(e) => setExtendExpiry30Days(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                Extend student membership expiry by +30 days and set status Active
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] dark:hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer transition-colors"
              >
                {submitting ? 'Processing Payment...' : 'Record Payment & Issue A4 Receipt'}
              </button>
            </form>
          </div>

          {/* Right column: Recent Receipts with Instant WhatsApp Share */}
          <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold text-[#0B1F3A] dark:text-white">
                  Recent Counter Receipts
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Reprint or send receipt confirmation on WhatsApp
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSection('history')}
                className="text-xs font-semibold text-[#0B1F3A] dark:text-sky-400 hover:underline cursor-pointer"
              >
                View All
              </button>
            </div>

            {payments.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-10 text-center">
                No receipts issued yet.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {payments.slice(0, 7).map((p) => {
                  const matched = studentById.get(p.studentId);
                  return (
                    <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <StudentAvatar
                          name={p.studentName}
                          photoUrl={matched?.profilePhotoUrl}
                          gender={matched?.gender}
                          size="xs"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {p.studentName}
                          </p>
                          <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {p.receiptNo} · ₹{p.amountPaid.toLocaleString('en-IN')} · {p.billingMonth}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <WhatsAppButton
                          phone={matched?.phone}
                          message={buildReceiptShareWhatsApp(p)}
                          size="xs"
                          variant="outline"
                          label=""
                          title="Share receipt summary via WhatsApp"
                        />
                        <button
                          type="button"
                          onClick={() => setActiveReceipt(p)}
                          className="min-h-[30px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-[#0B1F3A] dark:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          A4
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECTION 3: PENDING FEES                                               */}
      {/* ==================================================================== */}
      {activeSection === 'pending' && (
        <div className="space-y-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search student, ID, phone, or seat..."
              className="w-full min-h-[40px] pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            {loading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map((r) => (
                  <div key={r} className="h-11 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
                ))}
              </div>
            ) : filteredPending.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <p className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  No pending fee balances
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  All enrolled students currently have zero overdue balance.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <th className="py-3.5 px-5">Student</th>
                      <th className="py-3.5 px-4">Phone &amp; Seat</th>
                      <th className="py-3.5 px-4">Expiry</th>
                      <th className="py-3.5 px-4 text-right">Monthly Plan</th>
                      <th className="py-3.5 px-4 text-right">Pending Due</th>
                      <th className="py-3.5 px-5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                    {filteredPending.map((st) => (
                      <tr
                        key={st.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3.5 px-5">
                          <div className="flex items-center gap-3 min-w-0">
                            <StudentAvatar
                              name={st.fullName}
                              photoUrl={st.profilePhotoUrl}
                              gender={st.gender}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 dark:text-white truncate">
                                {st.fullName}
                              </p>
                              <p className="font-mono text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {st.registrationNo}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-mono tabular-nums text-xs text-slate-800 dark:text-slate-200">
                            {st.phone}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {st.seatId ? `${st.hall} · ${st.seatId}` : 'Unseated'}
                          </p>
                        </td>
                        <td className="py-3.5 px-4 font-mono tabular-nums text-xs text-slate-600 dark:text-slate-300">
                          {st.membershipExpiry || '—'}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          ₹{st.monthlyFee.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400">
                          ₹{st.pendingAmount.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3.5 px-5 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <WhatsAppButton
                              phone={st.phone}
                              message={buildFeeReminderWhatsApp(st)}
                              size="xs"
                              variant="outline"
                            />
                            <button
                              type="button"
                              onClick={() => setActiveInvoice({ student: st, payment: null })}
                              className="inline-flex items-center gap-1 min-h-[30px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium cursor-pointer whitespace-nowrap"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              Bill
                            </button>
                            <button
                              type="button"
                              onClick={() => openCollectModal(st)}
                              className="inline-flex items-center gap-1 min-h-[30px] px-3 rounded-lg bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                            >
                              Collect
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECTION 4: EARLY EXPIRY                                               */}
      {/* ==================================================================== */}
      {activeSection === 'early_expiry' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-fit">
              {(
                [
                  { id: '15', label: 'Within 15 Days' },
                  { id: '7', label: 'Within 7 Days' },
                  { id: '3', label: 'Urgent (≤3d)' },
                  { id: 'expired', label: 'Already Expired' },
                ] as const
              ).map((win) => (
                <button
                  key={win.id}
                  type="button"
                  onClick={() => setExpiryWindow(win.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    expiryWindow === win.id
                      ? 'bg-white dark:bg-slate-900 text-[#0B1F3A] dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {win.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search expiring members..."
                className="w-full min-h-[40px] pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            {filteredEarlyExpiry.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <Clock className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
                <p className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  No memberships expiring in this window
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  All active memberships in this timeframe are comfortably up to date.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <th className="py-3.5 px-5">Student</th>
                      <th className="py-3.5 px-4">Seat &amp; Phone</th>
                      <th className="py-3.5 px-4">Expiry Date</th>
                      <th className="py-3.5 px-4">Urgency</th>
                      <th className="py-3.5 px-4 text-right">Monthly / Due</th>
                      <th className="py-3.5 px-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                    {filteredEarlyExpiry.map((st) => {
                      const days = getDaysUntilExpiry(st.membershipExpiry);
                      const urgencyText =
                        days === null
                          ? 'Unknown'
                          : days < 0
                            ? `Expired ${Math.abs(days)}d ago`
                            : days === 0
                              ? 'Expires Today'
                              : `${days} day${days === 1 ? '' : 's'} left`;
                      const urgencyColor =
                        days !== null && days <= 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : days !== null && days <= 3
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-sky-700 dark:text-sky-400';

                      return (
                        <tr
                          key={st.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3.5 px-5">
                            <div className="flex items-center gap-3 min-w-0">
                              <StudentAvatar
                                name={st.fullName}
                                photoUrl={st.profilePhotoUrl}
                                gender={st.gender}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900 dark:text-white truncate">
                                  {st.fullName}
                                </p>
                                <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                                  {st.registrationNo}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-xs">
                            <p className="font-mono text-slate-800 dark:text-slate-200">{st.phone}</p>
                            <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                              {st.seatId ? `${st.hall} · ${st.seatId}` : 'Unseated'}
                            </p>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-xs text-slate-700 dark:text-slate-300">
                            {st.membershipExpiry}
                          </td>
                          <td className={`py-3.5 px-4 font-mono text-xs font-bold ${urgencyColor}`}>
                            {urgencyText}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs">
                            <p className="font-semibold text-slate-900 dark:text-white">
                              ₹{st.monthlyFee.toLocaleString('en-IN')}/mo
                            </p>
                            <p className="text-slate-500 dark:text-slate-400">
                              Due ₹{st.pendingAmount.toLocaleString('en-IN')}
                            </p>
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <WhatsAppButton
                                phone={st.phone}
                                message={buildEarlyExpiryWhatsApp(st, days)}
                                size="xs"
                                variant="solid"
                                label="Remind"
                              />
                              <button
                                type="button"
                                disabled={extendingId === st.id}
                                onClick={() => handleQuickExtend30(st)}
                                className="inline-flex items-center gap-1 min-h-[30px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                              >
                                <CalendarPlus className="w-3.5 h-3.5" />
                                {extendingId === st.id ? '...' : '+30d'}
                              </button>
                              <button
                                type="button"
                                onClick={() => openCollectModal(st)}
                                className="inline-flex items-center min-h-[30px] px-3 rounded-lg bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                              >
                                Renew
                              </button>
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
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECTION 5: REMAINING DUE                                              */}
      {/* ==================================================================== */}
      {activeSection === 'remaining_due' && (
        <div className="space-y-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search student with remaining balance..."
              className="w-full min-h-[40px] pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            {remainingDueRows.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <Wallet className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
                <p className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Zero remaining fee balances
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No students carry partial or residual balances right now.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <th className="py-3.5 px-5">Student</th>
                      <th className="py-3.5 px-4">Last Receipt</th>
                      <th className="py-3.5 px-4 text-right">Paid ({currentMonth})</th>
                      <th className="py-3.5 px-4 text-right">Remaining Due</th>
                      <th className="py-3.5 px-4">Settlement Progress</th>
                      <th className="py-3.5 px-5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                    {remainingDueRows.map(({ student: st, lastPayment, paidThisMonth, isPartial }) => {
                      const denom = Math.max(st.monthlyFee, paidThisMonth + st.pendingAmount, 1);
                      const pct = Math.min(100, Math.round((paidThisMonth / denom) * 100));

                      return (
                        <tr
                          key={st.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3.5 px-5">
                            <div className="flex items-center gap-3 min-w-0">
                              <StudentAvatar
                                name={st.fullName}
                                photoUrl={st.profilePhotoUrl}
                                gender={st.gender}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900 dark:text-white truncate">
                                  {st.fullName}
                                </p>
                                <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                                  {st.registrationNo} · {isPartial ? 'Partial Balance' : 'Unpaid Due'}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-xs">
                            {lastPayment ? (
                              <>
                                <p className="font-mono font-semibold text-[#0B1F3A] dark:text-sky-400">
                                  {lastPayment.receiptNo}
                                </p>
                                <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                  ₹{lastPayment.amountPaid.toLocaleString('en-IN')} ({lastPayment.billingMonth})
                                </p>
                              </>
                            ) : (
                              <span className="text-slate-400">No prior receipt</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
                            ₹{paidThisMonth.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400">
                            ₹{st.pendingAmount.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3.5 px-4 w-44">
                            <div className="space-y-1">
                              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                <div
                                  className="h-full bg-emerald-600 rounded-full"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                {pct}% settled · Plan ₹{st.monthlyFee.toLocaleString('en-IN')}
                              </p>
                            </div>
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <WhatsAppButton
                                phone={st.phone}
                                message={buildRemainingDueWhatsApp(st)}
                                size="xs"
                                variant="solid"
                                label="WhatsApp Due"
                              />
                              <button
                                type="button"
                                onClick={() => openCollectModal(st)}
                                className="inline-flex items-center min-h-[30px] px-3 rounded-lg bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                              >
                                Clear Balance
                              </button>
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
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECTION 6: REVENUE ANALYTICS                                          */}
      {/* ==================================================================== */}
      {activeSection === 'revenue' && (
        <FeesRevenuePanel payments={payments} students={students} />
      )}

      {/* ==================================================================== */}
      {/* SECTION 8: PAYMENT HISTORY                                            */}
      {/* ==================================================================== */}
      {activeSection === 'history' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search receipt no, student, UTR..."
                className="w-full min-h-[40px] pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <input
              type="month"
              aria-label="Filter by billing month"
              value={historyMonthFilter}
              onChange={(e) => setHistoryMonthFilter(e.target.value)}
              className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-mono text-slate-700 dark:text-slate-200"
            />
            {historyMonthFilter && (
              <button
                type="button"
                onClick={() => setHistoryMonthFilter('')}
                className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                All Months
              </button>
            )}

            <select
              aria-label="Filter by payment method"
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value as PaymentMethod | 'all')}
              className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200"
            >
              <option value="all">All Methods</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            {filteredPayments.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <p className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  No payment receipts match these filters
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Adjust the search or collect a fee payment to issue an official A4 receipt.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <th className="py-3.5 px-5">Receipt No</th>
                      <th className="py-3.5 px-4">Student</th>
                      <th className="py-3.5 px-4">Month &amp; Mode</th>
                      <th className="py-3.5 px-4 text-right">Amount Paid</th>
                      <th className="py-3.5 px-4 text-right">Discount / Due</th>
                      <th className="py-3.5 px-5 text-right">Documents &amp; Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                    {filteredPayments.map((p) => {
                      const modeLabel =
                        PAYMENT_METHODS.find((m) => m.id === p.paymentMethod)?.label || p.paymentMethod;
                      const matched = studentById.get(p.studentId);
                      return (
                        <tr
                          key={p.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3.5 px-5">
                            <p className="font-mono text-xs font-bold text-[#0B1F3A] dark:text-blue-400">
                              {p.receiptNo}
                            </p>
                            <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {p.paidAt && typeof p.paidAt.toDate === 'function'
                                ? p.paidAt.toDate().toLocaleDateString('en-IN')
                                : 'Just now'}
                            </p>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <StudentAvatar
                                name={p.studentName}
                                photoUrl={matched?.profilePhotoUrl}
                                gender={matched?.gender}
                                size="xs"
                              />
                              <span className="font-semibold text-slate-900 dark:text-white truncate">
                                {p.studentName}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300">
                            <span className="font-mono">{p.billingMonth}</span> · {modeLabel}
                            {p.notes && (
                              <p className="text-[11px] text-slate-400 truncate max-w-[200px]">
                                {p.notes}
                              </p>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                            ₹{p.amountPaid.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400">
                            Disc ₹{p.discount} · Due ₹{p.dueAmount}
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <WhatsAppButton
                                phone={matched?.phone}
                                message={buildReceiptShareWhatsApp(p)}
                                size="xs"
                                variant="outline"
                                label="WhatsApp"
                              />
                              {matched && (
                                <button
                                  type="button"
                                  onClick={() => setActiveInvoice({ student: matched, payment: p })}
                                  className="inline-flex items-center gap-1 min-h-[30px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                                >
                                  <Receipt className="w-3.5 h-3.5" />
                                  Invoice
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setActiveReceipt(p)}
                                className="inline-flex items-center gap-1 min-h-[30px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-[#0B1F3A] dark:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                Receipt
                              </button>
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
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECTION 9: ONLINE PAYMENT VERIFICATION                                */}
      {/* ==================================================================== */}
      {activeSection === 'online_verification' && (
        <FeesOnlineVerificationPanel
          verifications={verifications}
          students={students}
          adminProfile={adminProfile}
          onApprovedReceipt={(receipt) => setActiveReceipt(receipt)}
          onNotify={(msg) => setToast(msg)}
        />
      )}

      {/* Quick Collect Fee Modal (accessible from every section) */}
      <AnimatePresence>
        {collectOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCollectOpen(false)}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 12 }}
              className="relative z-10 w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-lg font-bold text-[#0B1F3A] dark:text-white">
                    Collect Student Fee
                  </h2>
                  <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Idempotency Guard: {idempotencyKey}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCollectOpen(false)}
                  aria-label="Close modal"
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCollectSubmit} className="p-6 space-y-4">
                {modalError && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300"
                  >
                    {modalError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Student *
                  </label>
                  <select
                    required
                    value={studentId}
                    onChange={(e) => handleSelectStudent(e.target.value)}
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

                {existingSameMonthPayment && (
                  <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 space-y-2">
                    <div className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        Receipt{' '}
                        <span className="font-mono font-semibold">
                          {existingSameMonthPayment.receiptNo}
                        </span>{' '}
                        (₹{existingSameMonthPayment.amountPaid}) was already recorded for{' '}
                        <span className="font-mono">{billingMonth}</span>.
                      </span>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowDuplicateMonthOverride}
                        onChange={(e) => setAllowDuplicateMonthOverride(e.target.checked)}
                        className="w-4 h-4 rounded"
                      />
                      Confirm additional / partial installment for {billingMonth}
                    </label>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      Payment Mode *
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                      className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Amount Paid (₹) *
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={500000}
                      required
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(Number(e.target.value))}
                      className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Discount (₹)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100000}
                      value={discount}
                      onChange={(e) => setDiscount(Number(e.target.value))}
                      className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                {selectedStudentObj && (
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 flex items-center justify-between gap-3 text-xs font-mono tabular-nums">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <StudentAvatar
                        name={selectedStudentObj.fullName}
                        photoUrl={selectedStudentObj.profilePhotoUrl}
                        gender={selectedStudentObj.gender}
                        size="xs"
                      />
                      <span className="text-slate-600 dark:text-slate-300 truncate">
                        Current Due: ₹{selectedStudentObj.pendingAmount.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <span className="font-semibold text-[#0B1F3A] dark:text-blue-400 shrink-0">
                      Remaining: ₹{projectedRemainingDue.toLocaleString('en-IN')}
                    </span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Notes / UPI Reference (optional)
                  </label>
                  <input
                    type="text"
                    maxLength={300}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. PhonePe UTR or reception note"
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  />
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={extendExpiry30Days}
                    onChange={(e) => setExtendExpiry30Days(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  Extend student membership expiry by +30 days and set status Active
                </label>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setCollectOpen(false)}
                    className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="min-h-[40px] px-5 py-2 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                  >
                    {submitting ? 'Processing...' : 'Record Payment & Issue Receipt'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Official A4 Receipt Modal */}
      <FeeReceiptModal
        payment={activeReceipt}
        student={
          activeReceipt ? students.find((s) => s.id === activeReceipt.studentId) || null : null
        }
        onClose={() => setActiveReceipt(null)}
      />

      {/* Official A4 Invoice / Fee Bill Modal */}
      <FeeInvoiceModal
        student={activeInvoice?.student || null}
        payment={activeInvoice?.payment || null}
        onClose={() => setActiveInvoice(null)}
      />
    </div>
  );
}
