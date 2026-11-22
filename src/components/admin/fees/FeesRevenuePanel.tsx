import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PAYMENT_METHODS, type PaymentRecord, type StudentRecord } from '../../../types/domain';
import { AnimatedCounter } from '../../common/AnimatedCounter';

interface FeesRevenuePanelProps {
  payments: PaymentRecord[];
  students: StudentRecord[];
}

const CHART_COLORS = ['#0B1F3A', '#2563EB', '#16A34A', '#C89B3C', '#6366F1'];

export function FeesRevenuePanel({ payments, students }: FeesRevenuePanelProps) {
  const analytics = useMemo(() => {
    const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amountPaid || 0), 0);
    const totalDiscounts = payments.reduce((sum, p) => sum + Number(p.discount || 0), 0);
    const totalPending = students.reduce((sum, s) => sum + Number(s.pendingAmount || 0), 0);
    const avgTicket = payments.length > 0 ? Math.round(totalRevenue / payments.length) : 0;

    // Monthly revenue series (last 8 billing months present)
    const monthMap = new Map<string, { month: string; collected: number; receipts: number; discount: number }>();
    for (const p of payments) {
      const m = p.billingMonth || 'Unknown';
      const entry = monthMap.get(m) || { month: m, collected: 0, receipts: 0, discount: 0 };
      entry.collected += Number(p.amountPaid || 0);
      entry.discount += Number(p.discount || 0);
      entry.receipts += 1;
      monthMap.set(m, entry);
    }
    const monthlySeries = Array.from(monthMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-8);

    // Payment method distribution
    const methodSeries = PAYMENT_METHODS.map((m) => {
      const matched = payments.filter((p) => p.paymentMethod === m.id);
      return {
        name: m.label,
        value: matched.reduce((s, p) => s + Number(p.amountPaid || 0), 0),
        count: matched.length,
      };
    }).filter((item) => item.value > 0);

    // Hall-wise revenue attribution
    const studentById = new Map(students.map((s) => [s.id, s]));
    const hallBuckets: Record<string, { hall: string; collected: number; pending: number }> = {
      'Hall 1': { hall: 'Hall 1 (80 Seats)', collected: 0, pending: 0 },
      'Hall 2': { hall: 'Hall 2 (40 Seats)', collected: 0, pending: 0 },
      Unassigned: { hall: 'Unseated / Flex', collected: 0, pending: 0 },
    };
    for (const p of payments) {
      const hall = studentById.get(p.studentId)?.hall || 'Unassigned';
      hallBuckets[hall].collected += Number(p.amountPaid || 0);
    }
    for (const s of students) {
      const hall = s.hall || 'Unassigned';
      hallBuckets[hall].pending += Number(s.pendingAmount || 0);
    }
    const hallSeries = Object.values(hallBuckets);

    return {
      totalRevenue,
      totalDiscounts,
      totalPending,
      avgTicket,
      monthlySeries,
      methodSeries,
      hallSeries,
    };
  }, [payments, students]);

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Gross Fee Revenue</p>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1.5">
            <AnimatedCounter value={analytics.totalRevenue} prefix="₹" />
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Across {payments.length} verified receipts
          </p>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Outstanding Receivables</p>
          <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1.5">
            <AnimatedCounter value={analytics.totalPending} prefix="₹" />
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Collectible pending balances</p>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Average Receipt Value</p>
          <p className="text-2xl font-bold text-[#0B1F3A] dark:text-white mt-1.5">
            <AnimatedCounter value={analytics.avgTicket} prefix="₹" />
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Per fee transaction</p>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Concessions / Discounts</p>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1.5">
            <AnimatedCounter value={analytics.totalDiscounts} prefix="₹" />
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Granted across receipts</p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <section className="lg:col-span-7 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="mb-4">
            <h2 className="font-display text-base font-bold text-[#0B1F3A] dark:text-white">
              Monthly Revenue Collection
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Real-time INR fee collection grouped by billing month
            </p>
          </div>

          {analytics.monthlySeries.length === 0 ? (
            <div className="h-[260px] flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
              Collect fee receipts to populate monthly revenue trends.
            </div>
          ) : (
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.monthlySeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={(v) => `₹${v}`}
                  />
                  <Tooltip
                    formatter={(val) => [`₹${Number(val || 0).toLocaleString('en-IN')}`, 'Collected']}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="collected" fill="#0B1F3A" radius={[8, 8, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="lg:col-span-5 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="mb-4">
            <h2 className="font-display text-base font-bold text-[#0B1F3A] dark:text-white">
              Payment Mode Mix
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Share of Cash, UPI / QR, Bank Transfer, and Card inflows
            </p>
          </div>

          {analytics.methodSeries.length === 0 ? (
            <div className="h-[260px] flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
              No payment mode breakdown available yet.
            </div>
          ) : (
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analytics.methodSeries}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={84}
                    paddingAngle={3}
                  >
                    {analytics.methodSeries.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val) => [`₹${Number(val || 0).toLocaleString('en-IN')}`, 'Amount']}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* Hall-wise Collected vs Pending */}
      <section className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div className="mb-4">
          <h2 className="font-display text-base font-bold text-[#0B1F3A] dark:text-white">
            Hall-wise Collected vs. Pending Receivables
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Compares realized fee collections against outstanding balances across Hall 1, Hall 2, and Unseated members
          </p>
        </div>

        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.hallSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="hall" tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `₹${v}`} />
              <Tooltip
                formatter={(val, name) => [
                  `₹${Number(val || 0).toLocaleString('en-IN')}`,
                  name === 'collected' ? 'Collected' : 'Pending Due',
                ]}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="collected" name="Collected" fill="#16A34A" radius={[6, 6, 0, 0]} maxBarSize={42} />
              <Bar dataKey="pending" name="Pending Due" fill="#E11D48" radius={[6, 6, 0, 0]} maxBarSize={42} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
