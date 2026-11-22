import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import {
  SHIFT_DEFINITIONS,
  type PaymentRecord,
  type StudentRecord,
} from '../../types/domain';
import {
  getDaysUntilExpiry,
  subscribeCurrentMonthCollections,
  subscribeInsideCount,
  subscribeRecentAuditLogs,
  subscribeStudents,
  type AuditLogSummary,
} from '../../services/studentService';
import { subscribePayments } from '../../services/financeService';
import { AnimatedCounter } from '../../components/common/AnimatedCounter';
import {
  StudentAdmissionModal,
  type AdmissionModalMode,
} from '../../components/admin/StudentAdmissionModal';
import { StudentDetailDrawer } from '../../components/admin/StudentDetailDrawer';
import { StudentAvatar } from '../../components/common/StudentAvatar';
import { useTheme } from '../../context/ThemeContext';

function buildRecentMonths(count: number): { key: string; label: string }[] {
  const now = new Date();
  const out: { key: string; label: string }[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    out.push({ key, label });
  }
  return out;
}

export function AdminDashboardPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [insideCount, setInsideCount] = useState(0);
  const [monthCollected, setMonthCollected] = useState(0);
  const [monthPaymentsCount, setMonthPaymentsCount] = useState(0);
  const [auditLogs, setAuditLogs] = useState<AuditLogSummary[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<AdmissionModalMode>('regular');
  const [editingStudent, setEditingStudent] = useState<StudentRecord | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentRecord | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const unsubStudents = subscribeStudents((list) => {
      setStudents(list);
      setLoadingStudents(false);
    });
    const unsubPayments = subscribePayments(setPayments);
    const unsubInside = subscribeInsideCount(setInsideCount);
    const unsubCollections = subscribeCurrentMonthCollections((sum, count) => {
      setMonthCollected(sum);
      setMonthPaymentsCount(count);
    });
    const unsubAudit = subscribeRecentAuditLogs(setAuditLogs);

    return () => {
      unsubStudents();
      unsubPayments();
      unsubInside();
      unsubCollections();
      unsubAudit();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const liveSelectedStudent = useMemo(() => {
    if (!selectedStudent) return null;
    return students.find((s) => s.id === selectedStudent.id) || null;
  }, [selectedStudent, students]);

  const metrics = useMemo(() => {
    const activeStudents = students.filter((s) => s.status === 'active');
    const demoStudents = students.filter((s) => s.status === 'demo' || s.admissionType === 'demo');
    const expiredStudents = students.filter((s) => s.status === 'expired');

    const seatedActive = students.filter(
      (s) => (s.status === 'active' || s.status === 'demo') && s.seatMode !== 'unseated',
    );
    const hall1Occupied = seatedActive.filter((s) => s.hall === 'Hall 1').length;
    const hall2Occupied = seatedActive.filter((s) => s.hall === 'Hall 2').length;
    const totalOccupied = hall1Occupied + hall2Occupied;

    const unseatedCount = students.filter(
      (s) =>
        (s.status === 'active' || s.status === 'demo') &&
        (s.seatMode === 'unseated' || s.hall === 'Unassigned'),
    ).length;

    const totalPendingDues = students.reduce((acc, s) => acc + (Number(s.pendingAmount) || 0), 0);
    const studentsWithDues = students.filter((s) => Number(s.pendingAmount) > 0).length;
    const totalCollectedAllTime = payments.reduce((acc, p) => acc + Number(p.amountPaid || 0), 0);

    const expiringSoon = students
      .filter((s) => {
        if (s.status === 'inactive' || s.status === 'suspended') return false;
        const days = getDaysUntilExpiry(s.membershipExpiry);
        return days !== null && days <= 7;
      })
      .sort((a, b) => (a.membershipExpiry || '').localeCompare(b.membershipExpiry || ''));

    const shiftChartData = SHIFT_DEFINITIONS.map((def) => ({
      name: def.label.replace(' (24/7)', '').replace(' Shift', ''),
      count: students.filter(
        (s) => (s.status === 'active' || s.status === 'demo') && s.shiftType === def.id,
      ).length,
    }));

    const hallChartData = [
      { name: 'Hall 1', occupied: hall1Occupied, capacity: 80 },
      { name: 'Hall 2', occupied: hall2Occupied, capacity: 40 },
    ];

    const seatModeSummary = {
      fixed: students.filter((s) => s.seatMode === 'fixed').length,
      nonFixed: students.filter((s) => s.seatMode === 'non_fixed').length,
      unseated: students.filter((s) => s.seatMode === 'unseated').length,
    };

    // 6-Month Fee Collection Trend & Admissions Trend (100% real Firestore data)
    const months = buildRecentMonths(6);
    const feeMap = new Map<string, number>();
    for (const p of payments) {
      const m =
        /^\d{4}-\d{2}/.test(p.billingMonth || '')
          ? p.billingMonth.slice(0, 7)
          : p.paidAt?.toDate
            ? `${p.paidAt.toDate().getFullYear()}-${String(p.paidAt.toDate().getMonth() + 1).padStart(2, '0')}`
            : '';
      if (m) feeMap.set(m, (feeMap.get(m) || 0) + Number(p.amountPaid || 0));
    }

    const admissionMap = new Map<string, number>();
    for (const st of students) {
      if (st.createdAt && typeof st.createdAt.toDate === 'function') {
        const d = st.createdAt.toDate();
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        admissionMap.set(ym, (admissionMap.get(ym) || 0) + 1);
      }
    }

    const feeTrendData = months.map((m) => ({
      month: m.label,
      collected: feeMap.get(m.key) || 0,
      admissions: admissionMap.get(m.key) || 0,
    }));

    const totalLedgerGross = totalCollectedAllTime + totalPendingDues;
    const collectedRatio =
      totalLedgerGross > 0 ? Math.round((totalCollectedAllTime / totalLedgerGross) * 100) : 0;

    return {
      totalStudents: students.length,
      activeCount: activeStudents.length,
      demoCount: demoStudents.length,
      expiredCount: expiredStudents.length,
      hall1Occupied,
      hall2Occupied,
      totalOccupied,
      occupancyPercent: Math.min(100, Math.round((totalOccupied / 120) * 100)),
      unseatedCount,
      totalPendingDues,
      totalCollectedAllTime,
      collectedRatio,
      studentsWithDues,
      expiringSoon,
      shiftChartData,
      hallChartData,
      seatModeSummary,
      feeTrendData,
    };
  }, [students, payments]);

  const openAdmission = (mode: AdmissionModalMode, student?: StudentRecord) => {
    setEditingStudent(student || null);
    setModalMode(mode);
    setModalOpen(true);
  };

  const axisColor = isDark ? '#94A3B8' : '#64748B';
  const gridColor = isDark ? '#1E293B' : '#E2E8F0';
  const primaryBarColor = isDark ? '#38BDF8' : '#0B1F3A';

  return (
    <div className="space-y-7">
      {/* Header + Primary Admission Actions */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Av_eSAFE Library · Electronic City, Bangalore · Live Operations
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0B1F3A] dark:text-white mt-1">
            Operations Dashboard
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => openAdmission('demo')}
            className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-all hover:-translate-y-0.5 active:translate-y-0 cursor-pointer whitespace-nowrap"
          >
            <Clock className="w-3.5 h-3.5 text-[#C89B3C]" />
            Demo Trial
          </button>
          <button
            type="button"
            onClick={() => openAdmission('quick')}
            className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-all hover:-translate-y-0.5 active:translate-y-0 cursor-pointer whitespace-nowrap"
          >
            <Zap className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            Quick Register
          </button>
          <button
            type="button"
            onClick={() => openAdmission('regular')}
            className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl bg-[#0B1F3A] dark:bg-sky-500 hover:bg-[#132E54] dark:hover:bg-sky-400 text-white dark:text-slate-950 text-xs font-semibold shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0 cursor-pointer whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" />
            Add Student
          </button>
        </div>
      </div>

      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2.5"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toast}</span>
        </motion.div>
      )}

      {/* 6 Live KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {[
          {
            key: 'students',
            title: 'Total Enrolled Students',
            icon: <Users className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />,
            value: <AnimatedCounter value={metrics.totalStudents} />,
            sub: `${metrics.activeCount} active · ${metrics.demoCount} demo · ${metrics.expiredCount} expired`,
            href: undefined,
          },
          {
            key: 'occupancy',
            title: 'Seat Allocation (120 Capacity)',
            icon: <Building2 className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />,
            value: (
              <span className="inline-flex items-baseline gap-2">
                <span>
                  <AnimatedCounter value={metrics.totalOccupied} />
                  <span className="text-base font-normal text-slate-400"> / 120</span>
                </span>
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                  ({metrics.occupancyPercent}%)
                </span>
              </span>
            ),
            sub: `Hall 1: ${metrics.hall1Occupied}/80 · Hall 2: ${metrics.hall2Occupied}/40`,
            href: '/admin/seats',
          },
          {
            key: 'unseated',
            title: 'Unseated Students',
            icon: <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 group-hover:text-[#0B1F3A] dark:group-hover:text-sky-400 transition-all" />,
            value: <AnimatedCounter value={metrics.unseatedCount} />,
            sub: 'Awaiting Hall 1 or Hall 2 seat assignment',
            href: '/admin/students?view=unseated',
          },
          {
            key: 'inside',
            title: 'Currently Inside Library',
            icon: <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
            value: <AnimatedCounter value={insideCount} />,
            sub: 'Live checked-in attendance sessions',
            href: '/admin/attendance',
          },
          {
            key: 'dues',
            title: 'Pending Fee Dues',
            icon: <CreditCard className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
            value: <AnimatedCounter value={metrics.totalPendingDues} prefix="₹" />,
            sub: `${metrics.studentsWithDues} due accounts · This month: ₹${monthCollected.toLocaleString('en-IN')} (${monthPaymentsCount})`,
            href: '/admin/fees',
          },
          {
            key: 'expiring',
            title: 'Expiring Within 7 Days',
            icon: <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
            value: <AnimatedCounter value={metrics.expiringSoon.length} />,
            sub: 'Memberships due for renewal or overdue',
            href: '/admin/students?view=expiring',
          },
        ].map((card, idx) => {
          const inner = (
            <>
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>{card.title}</span>
                {card.icon}
              </div>
              {loadingStudents && card.key !== 'inside' ? (
                <div className="h-8 w-24 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse mt-3" />
              ) : (
                <div className="text-3xl font-bold font-mono tabular-nums text-[#0B1F3A] dark:text-white mt-2">
                  {card.value}
                </div>
              )}
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-mono tabular-nums">
                {card.sub}
              </p>
            </>
          );

          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: idx * 0.035, ease: [0.16, 1, 0.3, 1] }}
            >
              {card.href ? (
                <Link
                  to={card.href}
                  className="group block p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 surface-card hover:border-[#0B1F3A]/40 dark:hover:border-sky-500/50 transition-all"
                >
                  {inner}
                </Link>
              ) : (
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 surface-card">
                  {inner}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Primary Charts Row: Fee Collection Trend Line + Pending vs Collected */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 surface-card">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />
                6-Month Fee Collection Trend
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Monthly verified fee inflows from Firestore payment receipts (INR)
              </p>
            </div>
            <Link
              to="/admin/analytics"
              className="text-xs font-semibold text-[#0B1F3A] dark:text-sky-400 hover:underline whitespace-nowrap"
            >
              Full Reports
            </Link>
          </div>

          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={metrics.feeTrendData}
                margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: axisColor, fontSize: 12 }}
                  axisLine={{ stroke: gridColor }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: axisColor, fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value) => [
                    `₹${Number(value ?? 0).toLocaleString('en-IN')}`,
                    'Collected',
                  ]}
                  contentStyle={{
                    backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                    borderColor: isDark ? '#1E293B' : '#E2E8F0',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="collected"
                  name="Fee Collected"
                  stroke={isDark ? '#38BDF8' : '#0B1F3A'}
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: isDark ? '#38BDF8' : '#0B1F3A' }}
                  activeDot={{ r: 6, fill: '#C89B3C' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pending vs Collected Fee Visualization */}
        <div className="lg:col-span-4 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 surface-card flex flex-col justify-between space-y-5">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Collected vs Pending Fees
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Real-time collection recovery across the ledger
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Collection Recovery</p>
                <p className="font-mono text-3xl font-bold text-[#0B1F3A] dark:text-white tabular-nums mt-0.5">
                  {metrics.collectedRatio}%
                </p>
              </div>
              <span className="font-mono text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
                Verified Ledger
              </span>
            </div>

            <div className="h-3.5 w-full rounded-full bg-amber-100 dark:bg-amber-950/60 overflow-hidden flex">
              <div
                className="h-full bg-[#0B1F3A] dark:bg-sky-500 transition-all duration-500"
                style={{ width: `${metrics.collectedRatio}%` }}
              />
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#0B1F3A] dark:bg-sky-500" />
                  Total Collected (All Time)
                </span>
                <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                  ₹{metrics.totalCollectedAllTime.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" />
                  Pending Student Balances
                </span>
                <span className="font-mono tabular-nums font-bold text-amber-700 dark:text-amber-400">
                  ₹{metrics.totalPendingDues.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>

          <Link
            to="/admin/fees"
            className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-[#0B1F3A] dark:text-sky-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Manage Fee Ledger &amp; Invoices
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Secondary Charts Row: Shift Distribution + Hall Utilization */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 surface-card">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Active Enrollment by Shift Plan
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Real-time distribution across all 7 Av_eSAFE Library shifts
              </p>
            </div>
          </div>

          {!loadingStudents && students.length === 0 ? (
            <div className="h-60 flex flex-col items-center justify-center text-center px-4">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                No students registered yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                Add your first student via Full Admission, Quick Register, or Demo Trial to populate live shift analytics.
              </p>
              <button
                type="button"
                onClick={() => openAdmission('regular')}
                className="mt-4 inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl bg-[#0B1F3A] dark:bg-sky-500 text-white dark:text-slate-950 text-xs font-semibold hover:bg-[#132E54] transition-colors cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                Register First Student
              </button>
            </div>
          ) : (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={metrics.shiftChartData}
                  margin={{ top: 8, right: 12, left: -16, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: axisColor, fontSize: 12 }}
                    axisLine={{ stroke: gridColor }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: axisColor, fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(11,31,58,0.04)' }}
                    contentStyle={{
                      backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                      borderColor: isDark ? '#1E293B' : '#E2E8F0',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="count" name="Students" radius={[6, 6, 0, 0]} maxBarSize={42}>
                    {metrics.shiftChartData.map((entry, idx) => (
                      <Cell
                        key={entry.name}
                        fill={idx % 2 === 0 ? primaryBarColor : isDark ? '#60A5FA' : '#1D4ED8'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Hall Utilization & Seat Mode Breakdown */}
        <div className="lg:col-span-5 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 surface-card flex flex-col justify-between space-y-6">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Hall-Wise Seat Utilization
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Physical capacity across Hall 1 (80) and Hall 2 (40)
            </p>
          </div>

          <div className="space-y-4">
            {metrics.hallChartData.map((item) => {
              const pct = Math.min(100, Math.round((item.occupied / item.capacity) * 100));
              return (
                <div key={item.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {item.name}
                    </span>
                    <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {item.occupied} / {item.capacity} seats ({pct}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#0B1F3A] dark:bg-sky-500 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
              <p className="font-mono tabular-nums text-lg font-bold text-[#0B1F3A] dark:text-white">
                {metrics.seatModeSummary.fixed}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Fixed</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
              <p className="font-mono tabular-nums text-lg font-bold text-[#0B1F3A] dark:text-white">
                {metrics.seatModeSummary.nonFixed}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Non-Fixed</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
              <p className="font-mono tabular-nums text-lg font-bold text-[#0B1F3A] dark:text-white">
                {metrics.seatModeSummary.unseated}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Unseated</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Operational Row: Recent Admissions + Expiries & Audit Trail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 surface-card overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Recent Admissions
            </h2>
            <Link
              to="/admin/students"
              className="text-xs font-semibold text-[#0B1F3A] dark:text-sky-400 hover:underline whitespace-nowrap"
            >
              View All Students
            </Link>
          </div>

          {loadingStudents ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
              ))}
            </div>
          ) : students.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Admissions saved in Firestore will appear here in real time.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {students.slice(0, 6).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setSelectedStudent(st)}
                  className="w-full px-6 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-center justify-between gap-4 cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <StudentAvatar
                      name={st.fullName}
                      photoUrl={st.profilePhotoUrl}
                      gender={st.gender}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {st.fullName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        <span className="font-mono">{st.registrationNo}</span> ·{' '}
                        <span className="capitalize">{st.shiftType.replace('_', ' ')}</span> ·{' '}
                        {st.seatMode === 'unseated'
                          ? 'Unseated'
                          : `${st.hall}${st.seatId ? ` (${st.seatId})` : ''}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold capitalize text-slate-800 dark:text-slate-200">
                      {st.status}
                    </p>
                    <p className="font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {st.pendingAmount > 0 ? `Due ₹${st.pendingAmount}` : `₹${st.monthlyFee}/mo`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Expiring Alerts + Live Audit Logs */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 surface-card overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Upcoming Renewals
              </h2>
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>

            {metrics.expiringSoon.length === 0 ? (
              <div className="p-6 text-xs text-slate-500 dark:text-slate-400">
                No memberships expiring within the next 7 days.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {metrics.expiringSoon.slice(0, 4).map((st) => {
                  const days = getDaysUntilExpiry(st.membershipExpiry);
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setSelectedStudent(st)}
                      className="w-full px-6 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <StudentAvatar
                          name={st.fullName}
                          photoUrl={st.profilePhotoUrl}
                          gender={st.gender}
                          size="xs"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                            {st.fullName}
                          </p>
                          <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                            Expires {st.membershipExpiry}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`font-mono text-xs font-semibold shrink-0 ${
                          days !== null && days < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {days !== null && days < 0
                          ? `${Math.abs(days)}d overdue`
                          : days === 0
                            ? 'Today'
                            : `${days}d left`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 surface-card overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Recent Audit Trail
              </h2>
            </div>

            {auditLogs.length === 0 ? (
              <div className="p-6 text-xs text-slate-500 dark:text-slate-400">
                Administrative actions will be recorded here automatically.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {auditLogs.slice(0, 5).map((log) => (
                  <div key={log.id} className="px-6 py-3 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-semibold text-[#0B1F3A] dark:text-sky-400">
                        {log.action}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {new Date(log.timestampMs).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {log.summary}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Admission & Edit Modal */}
      <StudentAdmissionModal
        open={modalOpen}
        initialMode={modalMode}
        editingStudent={editingStudent}
        onClose={() => setModalOpen(false)}
        onSuccess={(msg) => setToast(msg)}
      />

      {/* Detail Slide-over Drawer */}
      <StudentDetailDrawer
        student={liveSelectedStudent}
        onClose={() => setSelectedStudent(null)}
        onEdit={(st) => {
          setSelectedStudent(null);
          openAdmission('edit', st);
        }}
        onActionComplete={(msg) => setToast(msg)}
      />
    </div>
  );
}
