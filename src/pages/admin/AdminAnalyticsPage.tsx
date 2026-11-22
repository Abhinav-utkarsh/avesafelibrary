import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  Building2,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { AnimatedCounter } from '../../components/common/AnimatedCounter';
import { ReportStudioSection } from '../../components/admin/ReportStudioSection';
import { useTheme } from '../../context/ThemeContext';
import { subscribeStudents, getDaysUntilExpiry } from '../../services/studentService';
import { subscribeSeats } from '../../services/seatService';
import { subscribeExpenses, subscribePayments } from '../../services/financeService';
import { subscribeAttendanceRecords } from '../../services/attendanceService';
import {
  EXPENSE_CATEGORIES,
  SHIFT_DEFINITIONS,
  type AttendanceRecord,
  type ExpenseRecord,
  type PaymentRecord,
  type SeatRecord,
  type StudentRecord,
} from '../../types/domain';

type HorizonOption = '6m' | '12m' | 'all';

const PIE_COLORS = [
  '#0B1F3A',
  '#2563EB',
  '#0EA5E9',
  '#10B981',
  '#C89B3C',
  '#6366F1',
  '#EC4899',
  '#64748B',
];

function buildRecentMonthKeys(count: number): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function buildRecentDayKeys(count: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    keys.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}`,
    );
  }
  return keys;
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

export function AdminAnalyticsPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [seats, setSeats] = useState<SeatRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [horizon, setHorizon] = useState<HorizonOption>('6m');

  useEffect(() => {
    const u1 = subscribeStudents(setStudents);
    const u2 = subscribeSeats(setSeats);
    const u3 = subscribePayments(setPayments);
    const u4 = subscribeExpenses(setExpenses);
    const u5 = subscribeAttendanceRecords(setAttendance);
    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
    };
  }, []);

  const axisColor = isDark ? '#94A3B8' : '#64748B';
  const gridColor = isDark ? '#1E293B' : '#E2E8F0';
  const tooltipStyle = {
    backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
    borderColor: isDark ? '#1E293B' : '#CBD5E1',
    borderRadius: '12px',
    fontSize: '12px',
    color: isDark ? '#F8FAFC' : '#0F172A',
  };

  // Core Financial Aggregates
  const totalRevenue = useMemo(
    () => payments.reduce((sum, p) => sum + Number(p.amountPaid || 0), 0),
    [payments],
  );
  const totalExpenses = useMemo(
    () => expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0),
    [expenses],
  );
  const netSurplus = totalRevenue - totalExpenses;
  const totalPendingDues = useMemo(
    () => students.reduce((sum, s) => sum + Number(s.pendingAmount || 0), 0),
    [students],
  );
  const collectionEfficiency = useMemo(() => {
    const gross = totalRevenue + totalPendingDues;
    if (gross === 0) return 0;
    return Math.round((totalRevenue / gross) * 100);
  }, [totalRevenue, totalPendingDues]);

  // Occupancy Metrics (120 seats: Hall 1 = 80, Hall 2 = 40)
  const occupancy = useMemo(() => {
    const h1Seats = seats.filter((s) => s.hall === 'Hall 1');
    const h2Seats = seats.filter((s) => s.hall === 'Hall 2');
    const h1Used = h1Seats.filter((s) => s.status === 'occupied' || s.status === 'partial').length;
    const h2Used = h2Seats.filter((s) => s.status === 'occupied' || s.status === 'partial').length;
    const h1Avail = Math.max(0, 80 - h1Used);
    const h2Avail = Math.max(0, 40 - h2Used);
    const totalUsed = h1Used + h2Used;
    const unseatedActive = students.filter(
      (s) =>
        (s.seatMode === 'unseated' || !s.seatId) &&
        s.status !== 'inactive' &&
        s.status !== 'suspended',
    ).length;

    return {
      h1Used,
      h2Used,
      totalUsed,
      rate: Math.round((totalUsed / 120) * 100),
      h1Rate: Math.round((h1Used / 80) * 100),
      h2Rate: Math.round((h2Used / 40) * 100),
      unseatedActive,
      hallComparison: [
        { hall: 'Hall 1 (80)', occupied: h1Used, available: h1Avail },
        { hall: 'Hall 2 (40)', occupied: h2Used, available: h2Avail },
      ],
    };
  }, [seats, students]);

  // Monthly P&L + Fee Trend + Admissions Series
  const monthlySeries = useMemo(() => {
    let monthKeys: string[];
    if (horizon === '6m') {
      monthKeys = buildRecentMonthKeys(6);
    } else if (horizon === '12m') {
      monthKeys = buildRecentMonthKeys(12);
    } else {
      const allKeys = new Set<string>(buildRecentMonthKeys(6));
      for (const p of payments) {
        if (/^\d{4}-\d{2}/.test(p.billingMonth || '')) {
          allKeys.add(p.billingMonth.slice(0, 7));
        }
      }
      for (const e of expenses) {
        if (/^\d{4}-\d{2}/.test(e.expenseDate || '')) {
          allKeys.add(e.expenseDate.slice(0, 7));
        }
      }
      for (const st of students) {
        if (st.createdAt && typeof st.createdAt.toDate === 'function') {
          const d = st.createdAt.toDate();
          allKeys.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }
      }
      monthKeys = Array.from(allKeys).sort();
    }

    const revByMonth = new Map<string, number>();
    for (const p of payments) {
      const m =
        /^\d{4}-\d{2}/.test(p.billingMonth || '')
          ? p.billingMonth.slice(0, 7)
          : p.paidAt?.toDate
            ? `${p.paidAt.toDate().getFullYear()}-${String(p.paidAt.toDate().getMonth() + 1).padStart(2, '0')}`
            : '';
      if (m) revByMonth.set(m, (revByMonth.get(m) || 0) + Number(p.amountPaid || 0));
    }

    const expByMonth = new Map<string, number>();
    for (const e of expenses) {
      const m = /^\d{4}-\d{2}/.test(e.expenseDate || '') ? e.expenseDate.slice(0, 7) : '';
      if (m) expByMonth.set(m, (expByMonth.get(m) || 0) + Number(e.amount || 0));
    }

    const admByMonth = new Map<string, number>();
    for (const st of students) {
      if (st.createdAt && typeof st.createdAt.toDate === 'function') {
        const d = st.createdAt.toDate();
        const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        admByMonth.set(m, (admByMonth.get(m) || 0) + 1);
      }
    }

    return monthKeys.map((ym) => {
      const revenue = revByMonth.get(ym) || 0;
      const expense = expByMonth.get(ym) || 0;
      return {
        monthKey: ym,
        month: formatMonthLabel(ym),
        revenue,
        expense,
        net: revenue - expense,
        admissions: admByMonth.get(ym) || 0,
      };
    });
  }, [payments, expenses, students, horizon]);

  // Shift / Membership Distribution & MRR
  const shiftAnalytics = useMemo(() => {
    return SHIFT_DEFINITIONS.map((def) => {
      const matching = students.filter(
        (s) => s.shiftType === def.id && s.status !== 'inactive' && s.status !== 'suspended',
      );
      const mrr = matching.reduce((sum, s) => sum + Number(s.monthlyFee || 0), 0);
      return {
        shift: def.label.replace(' (24/7)', '').replace(' Shift', ''),
        students: matching.length,
        mrr,
      };
    });
  }, [students]);

  // Pending vs Collected Pie Data
  const feeSplitData = useMemo(() => {
    return [
      { name: 'Collected Fees', value: totalRevenue, color: isDark ? '#38BDF8' : '#0B1F3A' },
      { name: 'Pending Dues', value: totalPendingDues, color: '#F59E0B' },
    ].filter((d) => d.value > 0);
  }, [totalRevenue, totalPendingDues, isDark]);

  // Expense Category Breakdown
  const expenseByCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const e of expenses) {
      totals.set(e.category, (totals.get(e.category) || 0) + Number(e.amount || 0));
    }
    return EXPENSE_CATEGORIES.map((cat) => ({
      name: cat.label,
      value: totals.get(cat.id) || 0,
    }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [expenses]);

  // 14-Day Attendance Trend
  const attendanceTrend = useMemo(() => {
    const days = buildRecentDayKeys(14);
    const byDay = new Map<string, { visits: number; studyHours: number }>();
    for (const d of days) byDay.set(d, { visits: 0, studyHours: 0 });
    for (const rec of attendance) {
      const bucket = byDay.get(rec.date);
      if (bucket) {
        bucket.visits += 1;
        bucket.studyHours += Number(rec.durationMinutes || 0) / 60;
      }
    }
    return days.map((d) => {
      const b = byDay.get(d)!;
      return {
        day: d.slice(5),
        visits: b.visits,
        studyHours: Number(b.studyHours.toFixed(1)),
      };
    });
  }, [attendance]);

  // Predictions & 30-Day Cohort Forecast (100% grounded in live Firestore records)
  const forecast = useMemo(() => {
    const activeEligible = students.filter(
      (s) => s.status === 'active' || s.status === 'demo' || s.status === 'expired',
    );
    const renewingWithin30d = activeEligible.filter((s) => {
      const days = getDaysUntilExpiry(s.membershipExpiry);
      return days !== null && days >= -7 && days <= 30;
    });
    const scheduledRenewalPool = renewingWithin30d.reduce(
      (sum, s) => sum + Number(s.monthlyFee || 0),
      0,
    );
    const activeMonthlyRunRate = students
      .filter((s) => s.status === 'active')
      .reduce((sum, s) => sum + Number(s.monthlyFee || 0), 0);

    const activeExpenseMonths = monthlySeries.filter((m) => m.expense > 0);
    const avgMonthlyExpense =
      activeExpenseMonths.length > 0
        ? Math.round(
            activeExpenseMonths.reduce((sum, m) => sum + m.expense, 0) /
              activeExpenseMonths.length,
          )
        : 0;

    const conservativeInflow = Math.round(scheduledRenewalPool * 0.75 + totalPendingDues * 0.6);
    const expectedInflow = Math.round(scheduledRenewalPool * 0.9 + totalPendingDues * 0.85);

    const atRiskStudents = students
      .filter((s) => {
        if (s.status === 'inactive' || s.status === 'suspended') return false;
        const days = getDaysUntilExpiry(s.membershipExpiry);
        return (days !== null && days <= 7) || Number(s.pendingAmount || 0) > 0;
      })
      .sort((a, b) => {
        const da = getDaysUntilExpiry(a.membershipExpiry) ?? 999;
        const db = getDaysUntilExpiry(b.membershipExpiry) ?? 999;
        return da - db;
      })
      .slice(0, 8);

    return {
      renewingCount: renewingWithin30d.length,
      scheduledRenewalPool,
      activeMonthlyRunRate,
      avgMonthlyExpense,
      conservativeInflow,
      expectedInflow,
      expectedNet30d: expectedInflow - avgMonthlyExpense,
      atRiskStudents,
    };
  }, [students, monthlySeries, totalPendingDues]);

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="no-print flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Av_eSAFE Library · Electronic City, Bangalore · Financial &amp; Operational Intelligence
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0B1F3A] dark:text-white mt-0.5">
            Analytics, Forecasting &amp; A4 Reports
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Interactive charts, 30-day cashflow forecasting, and downloadable A4 financial documents powered by verified Firestore data.
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 w-fit">
          {(['6m', '12m', 'all'] as const).map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHorizon(h)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                horizon === h
                  ? 'bg-[#0B1F3A] text-white dark:bg-sky-500 dark:text-slate-950'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {h === '6m' ? '6 Months' : h === '12m' ? '12 Months' : 'All Time'}
            </button>
          ))}
        </div>
      </div>

      {/* Executive KPI Strip */}
      <div className="no-print grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          {
            label: 'Net Operating Surplus',
            icon: <Wallet className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />,
            value: (
              <span
                className={
                  netSurplus >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }
              >
                {netSurplus < 0 ? '-' : ''}₹<AnimatedCounter value={Math.abs(netSurplus)} />
              </span>
            ),
            sub: `In: ₹${totalRevenue.toLocaleString('en-IN')} · Out: ₹${totalExpenses.toLocaleString('en-IN')}`,
          },
          {
            label: 'Seat Utilization',
            icon: <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />,
            value: (
              <>
                <AnimatedCounter value={occupancy.rate} />%
              </>
            ),
            sub: `H1: ${occupancy.h1Used}/80 (${occupancy.h1Rate}%) · H2: ${occupancy.h2Used}/40 (${occupancy.h2Rate}%)`,
          },
          {
            label: 'Expected 30d Inflow',
            icon: <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
            value: (
              <>
                ₹<AnimatedCounter value={forecast.expectedInflow} />
              </>
            ),
            sub: `${forecast.renewingCount} renewals + ₹${totalPendingDues.toLocaleString('en-IN')} pending`,
          },
          {
            label: 'Collection Efficiency',
            icon: <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
            value: (
              <>
                <AnimatedCounter value={collectionEfficiency} />%
              </>
            ),
            sub: `Active MRR: ₹${forecast.activeMonthlyRunRate.toLocaleString('en-IN')}/mo`,
          },
        ].map((kpi, idx) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: idx * 0.04 }}
            className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 surface-card"
          >
            <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <span>{kpi.label}</span>
              {kpi.icon}
            </div>
            <p className="mt-3 font-mono text-3xl font-bold text-[#0B1F3A] dark:text-white tabular-nums">
              {kpi.value}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-mono">{kpi.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Charts Row 1: Monthly Revenue vs Expenses Bar + Fee Collection Trend Line */}
      <div className="no-print grid grid-cols-1 lg:grid-cols-12 gap-5">
        <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 surface-card">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Monthly Revenue vs Operating Expenses
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-4">
            Verified fee receipts compared against logged operating costs (INR)
          </p>

          <div className="h-[270px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: axisColor }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value) => [`₹${Number(value ?? 0).toLocaleString('en-IN')}`, '']}
                  contentStyle={tooltipStyle}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar
                  dataKey="revenue"
                  name="Fee Revenue"
                  fill={isDark ? '#38BDF8' : '#0B1F3A'}
                  radius={[6, 6, 0, 0]}
                />
                <Bar dataKey="expense" name="Expenses" fill="#F59E0B" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 surface-card">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Fee Collection &amp; Net Surplus Trend
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-4">
            Monthly fee inflow trajectory versus net operating surplus
          </p>
          <div className="h-[270px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlySeries} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: axisColor }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value) => [`₹${Number(value ?? 0).toLocaleString('en-IN')}`, '']}
                  contentStyle={tooltipStyle}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name="Collected"
                  stroke={isDark ? '#38BDF8' : '#0B1F3A'}
                  strokeWidth={2.5}
                  dot={{ r: 3.5 }}
                />
                <Line
                  type="monotone"
                  dataKey="net"
                  name="Net Surplus"
                  stroke="#10B981"
                  strokeWidth={2.2}
                  dot={{ r: 3.5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Charts Row 2: Student Admissions Trend + Pending vs Collected + Expense Pie */}
      <div className="no-print grid grid-cols-1 lg:grid-cols-12 gap-5">
        <section className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 surface-card">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Student Admissions Trend
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-4">
            New student enrollments registered per month
          </p>
          <div className="h-[230px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySeries} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: axisColor }} tickLine={false} />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: axisColor }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar
                  dataKey="admissions"
                  name="New Admissions"
                  fill="#2563EB"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={36}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 surface-card flex flex-col">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Pending vs Collected Fees
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-3">
            All-time collected revenue vs current pending balances
          </p>
          {feeSplitData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-500 py-12">
              No fee transactions or balances recorded yet.
            </div>
          ) : (
            <>
              <div className="h-[175px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={feeSplitData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={44}
                      outerRadius={72}
                      paddingAngle={3}
                    >
                      {feeSplitData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val) => `₹${Number(val ?? 0).toLocaleString('en-IN')}`}
                      contentStyle={tooltipStyle}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-1.5 text-xs">
                {feeSplitData.map((d) => (
                  <div key={d.name} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: d.color }}
                      />
                      {d.name}
                    </span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                      ₹{d.value.toLocaleString('en-IN')}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 surface-card flex flex-col">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Expense Category Breakdown
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-3">
            Share of total operating spend
          </p>

          {expenseByCategory.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400 py-12">
              No operating expenses recorded yet.
            </div>
          ) : (
            <>
              <div className="h-[175px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseByCategory}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={44}
                      outerRadius={72}
                      paddingAngle={2}
                    >
                      {expenseByCategory.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val) => `₹${Number(val ?? 0).toLocaleString('en-IN')}`}
                      contentStyle={tooltipStyle}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-1.5 text-xs">
                {expenseByCategory.slice(0, 4).map((item, idx) => (
                  <div key={item.name} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                      />
                      {item.name}
                    </span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                      ₹{item.value.toLocaleString('en-IN')}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      {/* Charts Row 3: Hall-Wise Seat Utilization + Membership Distribution + 14-Day Attendance */}
      <div className="no-print grid grid-cols-1 lg:grid-cols-12 gap-5">
        <section className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 surface-card">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Hall-Wise Seat Utilization
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-4">
            Occupied vs open desks in Hall 1 (80) &amp; Hall 2 (40)
          </p>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={occupancy.hallComparison}
                margin={{ top: 4, right: 12, left: -12, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="hall" tick={{ fontSize: 11, fill: axisColor }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar
                  dataKey="occupied"
                  name="Occupied"
                  stackId="a"
                  fill={isDark ? '#38BDF8' : '#0B1F3A'}
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="available"
                  name="Available"
                  stackId="a"
                  fill={isDark ? '#1E293B' : '#CBD5E1'}
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 surface-card">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Membership Distribution &amp; MRR
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-4">
            Active students &amp; monthly fee pool across all 7 shifts
          </p>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={shiftAnalytics} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="shift" tick={{ fontSize: 10, fill: axisColor }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value, name) => [
                    name === 'Monthly Fee Pool'
                      ? `₹${Number(value ?? 0).toLocaleString('en-IN')}`
                      : String(value ?? ''),
                    String(name ?? ''),
                  ]}
                  contentStyle={tooltipStyle}
                />
                <Bar dataKey="mrr" name="Monthly Fee Pool" fill="#2563EB" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 surface-card">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            14-Day Attendance Trend
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-4">
            Daily recorded visits and logged study hours
          </p>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={attendanceTrend} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: axisColor }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Area
                  type="monotone"
                  dataKey="visits"
                  name="Visits"
                  stroke={isDark ? '#38BDF8' : '#0B1F3A'}
                  fill={isDark ? '#38BDF8' : '#0B1F3A'}
                  fillOpacity={0.16}
                />
                <Area
                  type="monotone"
                  dataKey="studyHours"
                  name="Study Hours"
                  stroke="#10B981"
                  fill="#10B981"
                  fillOpacity={0.18}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Forecasting & Retention Intelligence */}
      <div className="no-print grid grid-cols-1 lg:grid-cols-12 gap-5">
        <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-4 surface-card">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              30-Day Cashflow &amp; Renewal Forecast
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Deterministic projection computed from scheduled expiry cohorts, pending balances, and historical expense burn.
            </p>
          </div>

          <dl className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-600 dark:text-slate-400">
                Renewals Due (Next 30 Days · {forecast.renewingCount} students)
              </dt>
              <dd className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                ₹{forecast.scheduledRenewalPool.toLocaleString('en-IN')}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-600 dark:text-slate-400">Outstanding Dues Recoverable</dt>
              <dd className="font-mono font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                ₹{totalPendingDues.toLocaleString('en-IN')}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-600 dark:text-slate-400">
                Conservative Inflow (75% renewal / 60% dues)
              </dt>
              <dd className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                ₹{forecast.conservativeInflow.toLocaleString('en-IN')}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-600 dark:text-slate-400">
                Expected Inflow (90% renewal / 85% dues)
              </dt>
              <dd className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                ₹{forecast.expectedInflow.toLocaleString('en-IN')}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-600 dark:text-slate-400">
                Avg Monthly Operating Expense Burn
              </dt>
              <dd className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                ₹{forecast.avgMonthlyExpense.toLocaleString('en-IN')}
              </dd>
            </div>
            <div className="py-3 flex justify-between gap-4 font-semibold">
              <dt className="text-slate-900 dark:text-white">Projected 30-Day Net Position</dt>
              <dd
                className={`font-mono tabular-nums ${
                  forecast.expectedNet30d >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {forecast.expectedNet30d < 0 ? '-' : '+'}₹
                {Math.abs(forecast.expectedNet30d).toLocaleString('en-IN')}
              </dd>
            </div>
          </dl>

          {occupancy.unseatedActive > 0 && (
            <p className="text-xs text-slate-600 dark:text-slate-300 pt-1">
              Capacity Signal: <strong>{occupancy.unseatedActive}</strong> active student
              {occupancy.unseatedActive === 1 ? ' is' : 's are'} currently unseated while{' '}
              <strong>{120 - occupancy.totalUsed}</strong> seats remain available across Hall 1 &amp; Hall 2.
            </p>
          )}
        </section>

        <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-4 surface-card">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Priority Retention &amp; Follow-Up Queue
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Students expiring within 7 days or carrying pending balances
            </p>
          </div>

          {forecast.atRiskStudents.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-10 text-center">
              No immediate retention risks detected in the current student roster.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {forecast.atRiskStudents.map((stu) => {
                const days = getDaysUntilExpiry(stu.membershipExpiry);
                return (
                  <div
                    key={stu.id}
                    className="py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white truncate">
                        {stu.fullName}{' '}
                        <span className="font-mono font-normal text-slate-400">
                          ({stu.registrationNo})
                        </span>
                      </p>
                      <p className="text-slate-500 dark:text-slate-400">
                        {stu.hall} · {stu.seatId || 'Unseated'} · Expiry:{' '}
                        {stu.membershipExpiry || 'None'}
                      </p>
                    </div>
                    <div className="text-right shrink-0 font-mono">
                      {stu.pendingAmount > 0 && (
                        <p className="text-rose-600 dark:text-rose-400 font-semibold">
                          Due ₹{stu.pendingAmount.toLocaleString('en-IN')}
                        </p>
                      )}
                      {days !== null && days <= 7 && (
                        <p className="text-amber-700 dark:text-amber-400">
                          {days < 0 ? `Expired ${Math.abs(days)}d ago` : `In ${days}d`}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Professional 7-Report A4 Document Studio */}
      <ReportStudioSection
        students={students}
        seats={seats}
        payments={payments}
        expenses={expenses}
        attendance={attendance}
      />
    </div>
  );
}
