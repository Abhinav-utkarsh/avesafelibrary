import { useMemo, useState } from 'react';
import {
  Calendar,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
} from 'lucide-react';
import { BrandMark } from '../common/BrandMark';
import {
  downloadLibraryReportPdf,
  formatInrPdf,
  formatInrUi,
  LIBRARY_BRAND,
  type ReportTypeId,
} from '../../lib/pdfDocuments';
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  SHIFT_DEFINITIONS,
  type AttendanceRecord,
  type ExpenseRecord,
  type PaymentRecord,
  type SeatRecord,
  type StudentRecord,
} from '../../types/domain';

interface ReportStudioSectionProps {
  students: StudentRecord[];
  seats: SeatRecord[];
  payments: PaymentRecord[];
  expenses: ExpenseRecord[];
  attendance: AttendanceRecord[];
}

const REPORT_TYPES: { id: ReportTypeId; label: string; subtitle: string }[] = [
  {
    id: 'admissions',
    label: 'Student Admissions',
    subtitle: 'Complete enrolled student register with seat allocation, shift plan, and status.',
  },
  {
    id: 'fee_collection',
    label: 'Fee Collection',
    subtitle: 'Verified official fee receipts ledger with payment methods, discounts, and inflows.',
  },
  {
    id: 'pending_payments',
    label: 'Pending Payments',
    subtitle: 'Outstanding student fee dues register prioritized for desk follow-up.',
  },
  {
    id: 'attendance',
    label: 'Attendance Log',
    subtitle: 'Recorded student check-ins, study hours, and access source verification.',
  },
  {
    id: 'seat_utilization',
    label: 'Seat Utilization',
    subtitle: 'Hall 1 (80) and Hall 2 (40) desk allocation, fixed vs shared status, and availability.',
  },
  {
    id: 'expenses',
    label: 'Operating Expenses',
    subtitle: 'Categorized library expenditures across utilities, rent, maintenance, and staffing.',
  },
  {
    id: 'monthly_financial',
    label: 'Monthly Financial Performance',
    subtitle: 'Month-by-month revenue, operating expenses, and net operating surplus summary.',
  },
];

function escapeCsvCell(value: string | number | undefined | null): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function getIsoDate(ts?: { toDate: () => Date }): string {
  if (!ts || typeof ts.toDate !== 'function') return '';
  const d = ts.toDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function withinDateRange(isoDate: string, fromDate: string, toDate: string): boolean {
  if (!fromDate && !toDate) return true;
  if (!isoDate) return true;
  if (fromDate && isoDate < fromDate) return false;
  if (toDate && isoDate > toDate) return false;
  return true;
}

export function ReportStudioSection({
  students,
  seats,
  payments,
  expenses,
  attendance,
}: ReportStudioSectionProps) {
  const [reportType, setReportType] = useState<ReportTypeId>('monthly_financial');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  const dateRangeLabel = useMemo(() => {
    if (!fromDate && !toDate) return 'All Recorded Dates';
    if (fromDate && toDate) return `${fromDate} to ${toDate}`;
    if (fromDate) return `From ${fromDate}`;
    return `Up to ${toDate}`;
  }, [fromDate, toDate]);

  const applyPreset = (preset: 'month' | '30d' | '6m' | 'all') => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    if (preset === 'all') {
      setFromDate('');
      setToDate('');
      return;
    }
    if (preset === 'month') {
      setFromDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
      setToDate(todayStr);
      return;
    }
    if (preset === '30d') {
      const start = new Date(now.getTime() - 30 * 86400000);
      setFromDate(start.toISOString().slice(0, 10));
      setToDate(todayStr);
      return;
    }
    const start6m = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    setFromDate(start6m.toISOString().slice(0, 10));
    setToDate(todayStr);
  };

  const reportData = useMemo(() => {
    const meta = REPORT_TYPES.find((r) => r.id === reportType) || REPORT_TYPES[0];

    if (reportType === 'admissions') {
      const filtered = students.filter((s) =>
        withinDateRange(getIsoDate(s.createdAt), fromDate, toDate),
      );
      const activeCount = filtered.filter((s) => s.status === 'active').length;
      const demoCount = filtered.filter((s) => s.status === 'demo' || s.admissionType === 'demo').length;
      const totalMrr = filtered.reduce((sum, s) => sum + Number(s.monthlyFee || 0), 0);

      return {
        meta,
        kpisUi: [
          { label: 'Total Admissions', value: String(filtered.length) },
          { label: 'Active Members', value: String(activeCount) },
          { label: 'Demo Trials', value: String(demoCount) },
          { label: 'Monthly Fee Value', value: formatInrUi(totalMrr) },
        ],
        kpisPdf: [
          { label: 'Total Admissions', value: String(filtered.length) },
          { label: 'Active Members', value: String(activeCount) },
          { label: 'Demo Trials', value: String(demoCount) },
          { label: 'Monthly Fee Value', value: formatInrPdf(totalMrr) },
        ],
        columns: ['Reg No', 'Student Name', 'Phone', 'Shift', 'Seat / Hall', 'Status', 'Monthly Fee'],
        rightAlignedCols: [6],
        rowsUi: filtered.map((s) => [
          s.registrationNo,
          s.fullName,
          s.phone,
          SHIFT_DEFINITIONS.find((d) => d.id === s.shiftType)?.label || s.shiftType,
          s.seatId ? `${s.hall} (${s.seatId})` : 'Unseated',
          s.status.toUpperCase(),
          formatInrUi(s.monthlyFee),
        ]),
        rowsPdf: filtered.map((s) => [
          s.registrationNo,
          s.fullName,
          s.phone,
          SHIFT_DEFINITIONS.find((d) => d.id === s.shiftType)?.label || s.shiftType,
          s.seatId ? `${s.hall} (${s.seatId})` : 'Unseated',
          s.status.toUpperCase(),
          formatInrPdf(s.monthlyFee),
        ]),
      };
    }

    if (reportType === 'fee_collection') {
      const filtered = payments.filter((p) => {
        const d = getIsoDate(p.paidAt) || (p.billingMonth ? `${p.billingMonth}-01` : '');
        return withinDateRange(d, fromDate, toDate);
      });
      const sumPaid = filtered.reduce((acc, p) => acc + Number(p.amountPaid || 0), 0);
      const sumDisc = filtered.reduce((acc, p) => acc + Number(p.discount || 0), 0);
      const upiCount = filtered.filter((p) => p.paymentMethod === 'upi').length;

      return {
        meta,
        kpisUi: [
          { label: 'Total Collected', value: formatInrUi(sumPaid) },
          { label: 'Receipts Issued', value: String(filtered.length) },
          { label: 'Total Discounts', value: formatInrUi(sumDisc) },
          { label: 'UPI / Digital Txns', value: String(upiCount) },
        ],
        kpisPdf: [
          { label: 'Total Collected', value: formatInrPdf(sumPaid) },
          { label: 'Receipts Issued', value: String(filtered.length) },
          { label: 'Total Discounts', value: formatInrPdf(sumDisc) },
          { label: 'UPI / Digital Txns', value: String(upiCount) },
        ],
        columns: ['Receipt No', 'Date', 'Student', 'Billing Month', 'Mode', 'Discount', 'Paid'],
        rightAlignedCols: [5, 6],
        rowsUi: filtered.map((p) => [
          p.receiptNo,
          getIsoDate(p.paidAt) || p.billingMonth,
          p.studentName,
          p.billingMonth,
          PAYMENT_METHODS.find((m) => m.id === p.paymentMethod)?.label || p.paymentMethod,
          formatInrUi(p.discount),
          formatInrUi(p.amountPaid),
        ]),
        rowsPdf: filtered.map((p) => [
          p.receiptNo,
          getIsoDate(p.paidAt) || p.billingMonth,
          p.studentName,
          p.billingMonth,
          PAYMENT_METHODS.find((m) => m.id === p.paymentMethod)?.label || p.paymentMethod,
          formatInrPdf(p.discount),
          formatInrPdf(p.amountPaid),
        ]),
      };
    }

    if (reportType === 'pending_payments') {
      const filtered = students
        .filter((s) => Number(s.pendingAmount || 0) > 0)
        .filter((s) => withinDateRange(s.membershipExpiry || getIsoDate(s.createdAt), fromDate, toDate))
        .sort((a, b) => Number(b.pendingAmount || 0) - Number(a.pendingAmount || 0));
      const totalDue = filtered.reduce((acc, s) => acc + Number(s.pendingAmount || 0), 0);
      const highestDue = filtered.length > 0 ? Number(filtered[0].pendingAmount || 0) : 0;

      return {
        meta,
        kpisUi: [
          { label: 'Total Outstanding', value: formatInrUi(totalDue) },
          { label: 'Students With Dues', value: String(filtered.length) },
          { label: 'Highest Single Balance', value: formatInrUi(highestDue) },
          {
            label: 'Average Due',
            value: formatInrUi(filtered.length ? Math.round(totalDue / filtered.length) : 0),
          },
        ],
        kpisPdf: [
          { label: 'Total Outstanding', value: formatInrPdf(totalDue) },
          { label: 'Students With Dues', value: String(filtered.length) },
          { label: 'Highest Single Balance', value: formatInrPdf(highestDue) },
          {
            label: 'Average Due',
            value: formatInrPdf(filtered.length ? Math.round(totalDue / filtered.length) : 0),
          },
        ],
        columns: ['Reg No', 'Student Name', 'Phone', 'Seat', 'Expiry', 'Monthly Fee', 'Pending Due'],
        rightAlignedCols: [5, 6],
        rowsUi: filtered.map((s) => [
          s.registrationNo,
          s.fullName,
          s.phone,
          s.seatId ? `${s.hall} · ${s.seatId}` : 'Unseated',
          s.membershipExpiry || '—',
          formatInrUi(s.monthlyFee),
          formatInrUi(s.pendingAmount),
        ]),
        rowsPdf: filtered.map((s) => [
          s.registrationNo,
          s.fullName,
          s.phone,
          s.seatId ? `${s.hall} · ${s.seatId}` : 'Unseated',
          s.membershipExpiry || '—',
          formatInrPdf(s.monthlyFee),
          formatInrPdf(s.pendingAmount),
        ]),
      };
    }

    if (reportType === 'attendance') {
      const filtered = attendance.filter((a) => withinDateRange(a.date, fromDate, toDate));
      const totalMinutes = filtered.reduce((sum, a) => sum + Number(a.durationMinutes || 0), 0);
      const uniqueStudents = new Set(filtered.map((a) => a.studentId)).size;
      const activeInside = filtered.filter((a) => a.isInside).length;

      return {
        meta,
        kpisUi: [
          { label: 'Total Sessions', value: String(filtered.length) },
          { label: 'Unique Students', value: String(uniqueStudents) },
          { label: 'Total Study Hours', value: `${(totalMinutes / 60).toFixed(1)} hrs` },
          { label: 'Currently Inside', value: String(activeInside) },
        ],
        kpisPdf: [
          { label: 'Total Sessions', value: String(filtered.length) },
          { label: 'Unique Students', value: String(uniqueStudents) },
          { label: 'Total Study Hours', value: `${(totalMinutes / 60).toFixed(1)} hrs` },
          { label: 'Currently Inside', value: String(activeInside) },
        ],
        columns: ['Date', 'Student Name', 'Entry', 'Exit', 'Duration', 'Source', 'Status'],
        rightAlignedCols: [4],
        rowsUi: filtered.map((a) => [
          a.date,
          a.studentName,
          a.entryTime?.toDate
            ? a.entryTime.toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
            : '—',
          a.exitTime?.toDate
            ? a.exitTime.toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
            : a.isInside
              ? 'Active'
              : '—',
          `${Math.round(Number(a.durationMinutes || 0))} mins`,
          a.source.replace('_', ' '),
          a.isInside ? 'INSIDE' : 'COMPLETED',
        ]),
        rowsPdf: filtered.map((a) => [
          a.date,
          a.studentName,
          a.entryTime?.toDate
            ? a.entryTime.toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
            : '—',
          a.exitTime?.toDate
            ? a.exitTime.toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
            : a.isInside
              ? 'Active'
              : '—',
          `${Math.round(Number(a.durationMinutes || 0))} mins`,
          a.source.replace('_', ' '),
          a.isInside ? 'INSIDE' : 'COMPLETED',
        ]),
      };
    }

    if (reportType === 'seat_utilization') {
      const h1 = seats.filter((s) => s.hall === 'Hall 1');
      const h2 = seats.filter((s) => s.hall === 'Hall 2');
      const used = seats.filter((s) => s.status === 'occupied' || s.status === 'partial').length;
      const avail = seats.filter((s) => s.status === 'available').length;
      const maint = seats.filter((s) => s.status === 'maintenance').length;
      const pct = seats.length > 0 ? Math.round((used / seats.length) * 100) : 0;

      const sortedSeats = [...seats].sort((a, b) => a.seatCode.localeCompare(b.seatCode));
      const getOccupantsLabel = (seat: SeatRecord) => {
        if (seat.seatType === 'fixed' && seat.assignedStudentName) return seat.assignedStudentName;
        const slotNames = Object.entries(seat.shiftSlots || {})
          .filter(([, occ]) => Boolean(occ))
          .map(([slot, occ]) => `${slot[0].toUpperCase()}: ${occ?.studentName}`);
        return slotNames.length > 0 ? slotNames.join(' | ') : 'Available';
      };

      return {
        meta,
        kpisUi: [
          { label: 'Total Configured', value: `${seats.length} (H1:${h1.length} / H2:${h2.length})` },
          { label: 'Occupied / Shared', value: `${used} (${pct}%)` },
          { label: 'Available Seats', value: String(avail) },
          { label: 'Maintenance Locked', value: String(maint) },
        ],
        kpisPdf: [
          { label: 'Total Configured', value: `${seats.length} (H1:${h1.length} / H2:${h2.length})` },
          { label: 'Occupied / Shared', value: `${used} (${pct}%)` },
          { label: 'Available Seats', value: String(avail) },
          { label: 'Maintenance Locked', value: String(maint) },
        ],
        columns: ['Seat Code', 'Hall', 'Row', 'Mode', 'Status', 'Assigned Occupant(s)'],
        rightAlignedCols: [],
        rowsUi: sortedSeats.map((s) => [
          s.seatCode,
          s.hall,
          s.rowLabel,
          s.seatType === 'fixed' ? 'Fixed' : 'Non-Fixed',
          s.status.toUpperCase(),
          getOccupantsLabel(s),
        ]),
        rowsPdf: sortedSeats.map((s) => [
          s.seatCode,
          s.hall,
          s.rowLabel,
          s.seatType === 'fixed' ? 'Fixed' : 'Non-Fixed',
          s.status.toUpperCase(),
          getOccupantsLabel(s),
        ]),
      };
    }

    if (reportType === 'expenses') {
      const filtered = expenses.filter((e) => withinDateRange(e.expenseDate, fromDate, toDate));
      const totalExp = filtered.reduce((acc, e) => acc + Number(e.amount || 0), 0);
      const topCat = EXPENSE_CATEGORIES.map((c) => ({
        label: c.label,
        val: filtered.filter((e) => e.category === c.id).reduce((s, e) => s + Number(e.amount || 0), 0),
      })).sort((a, b) => b.val - a.val)[0];

      return {
        meta,
        kpisUi: [
          { label: 'Total Expenses', value: formatInrUi(totalExp) },
          { label: 'Expense Entries', value: String(filtered.length) },
          { label: 'Top Category', value: topCat && topCat.val > 0 ? topCat.label : 'None' },
          {
            label: 'Avg Entry',
            value: formatInrUi(filtered.length ? Math.round(totalExp / filtered.length) : 0),
          },
        ],
        kpisPdf: [
          { label: 'Total Expenses', value: formatInrPdf(totalExp) },
          { label: 'Expense Entries', value: String(filtered.length) },
          { label: 'Top Category', value: topCat && topCat.val > 0 ? topCat.label : 'None' },
          {
            label: 'Avg Entry',
            value: formatInrPdf(filtered.length ? Math.round(totalExp / filtered.length) : 0),
          },
        ],
        columns: ['Date', 'Expense Title', 'Category', 'Vendor', 'Mode', 'Amount'],
        rightAlignedCols: [5],
        rowsUi: filtered.map((e) => [
          e.expenseDate,
          e.title,
          EXPENSE_CATEGORIES.find((c) => c.id === e.category)?.label || e.category,
          e.vendor || '—',
          PAYMENT_METHODS.find((m) => m.id === e.paymentMethod)?.label || e.paymentMethod,
          formatInrUi(e.amount),
        ]),
        rowsPdf: filtered.map((e) => [
          e.expenseDate,
          e.title,
          EXPENSE_CATEGORIES.find((c) => c.id === e.category)?.label || e.category,
          e.vendor || '—',
          PAYMENT_METHODS.find((m) => m.id === e.paymentMethod)?.label || e.paymentMethod,
          formatInrPdf(e.amount),
        ]),
      };
    }

    // Default: monthly_financial
    const monthSet = new Set<string>();
    const revByMonth = new Map<string, { sum: number; count: number }>();
    const expByMonth = new Map<string, { sum: number; count: number }>();

    for (const p of payments) {
      const d = getIsoDate(p.paidAt) || (p.billingMonth ? `${p.billingMonth}-01` : '');
      if (!withinDateRange(d, fromDate, toDate)) continue;
      const ym = /^\d{4}-\d{2}/.test(p.billingMonth || '') ? p.billingMonth.slice(0, 7) : d.slice(0, 7);
      if (!ym) continue;
      monthSet.add(ym);
      const cur = revByMonth.get(ym) || { sum: 0, count: 0 };
      cur.sum += Number(p.amountPaid || 0);
      cur.count += 1;
      revByMonth.set(ym, cur);
    }

    for (const e of expenses) {
      if (!withinDateRange(e.expenseDate, fromDate, toDate)) continue;
      const ym = /^\d{4}-\d{2}/.test(e.expenseDate || '') ? e.expenseDate.slice(0, 7) : '';
      if (!ym) continue;
      monthSet.add(ym);
      const cur = expByMonth.get(ym) || { sum: 0, count: 0 };
      cur.sum += Number(e.amount || 0);
      cur.count += 1;
      expByMonth.set(ym, cur);
    }

    const sortedMonths = Array.from(monthSet).sort().reverse();
    const totalRev = sortedMonths.reduce((s, m) => s + (revByMonth.get(m)?.sum || 0), 0);
    const totalExp = sortedMonths.reduce((s, m) => s + (expByMonth.get(m)?.sum || 0), 0);
    const net = totalRev - totalExp;
    const margin = totalRev > 0 ? Math.round((net / totalRev) * 100) : 0;

    return {
      meta,
      kpisUi: [
        { label: 'Total Fee Revenue', value: formatInrUi(totalRev) },
        { label: 'Total Operating Cost', value: formatInrUi(totalExp) },
        { label: 'Net Operating Surplus', value: formatInrUi(net) },
        { label: 'Operating Margin', value: `${margin}%` },
      ],
      kpisPdf: [
        { label: 'Total Fee Revenue', value: formatInrPdf(totalRev) },
        { label: 'Total Operating Cost', value: formatInrPdf(totalExp) },
        { label: 'Net Operating Surplus', value: formatInrPdf(net) },
        { label: 'Operating Margin', value: `${margin}%` },
      ],
      columns: ['Billing Month', 'Receipts', 'Fee Revenue', 'Expense Entries', 'Expenses', 'Net Surplus'],
      rightAlignedCols: [1, 2, 3, 4, 5],
      rowsUi: sortedMonths.map((ym) => {
        const rev = revByMonth.get(ym) || { sum: 0, count: 0 };
        const exp = expByMonth.get(ym) || { sum: 0, count: 0 };
        return [
          ym,
          rev.count,
          formatInrUi(rev.sum),
          exp.count,
          formatInrUi(exp.sum),
          formatInrUi(rev.sum - exp.sum),
        ];
      }),
      rowsPdf: sortedMonths.map((ym) => {
        const rev = revByMonth.get(ym) || { sum: 0, count: 0 };
        const exp = expByMonth.get(ym) || { sum: 0, count: 0 };
        return [
          ym,
          rev.count,
          formatInrPdf(rev.sum),
          exp.count,
          formatInrPdf(exp.sum),
          formatInrPdf(rev.sum - exp.sum),
        ];
      }),
    };
  }, [reportType, fromDate, toDate, students, seats, payments, expenses, attendance]);

  const handleDownloadPdf = () => {
    downloadLibraryReportPdf({
      reportType,
      title: `${reportData.meta.label} Report`,
      subtitle: reportData.meta.subtitle,
      dateRangeLabel,
      kpis: reportData.kpisPdf,
      columns: reportData.columns,
      rows: reportData.rowsPdf,
      rightAlignedCols: reportData.rightAlignedCols,
      summaryNote:
        'All figures in this report are computed strictly from live, verified Firestore database records of Av_eSAFE Library, Electronic City, Bangalore.',
    });
  };

  const handleExportCsv = () => {
    const csv = [
      reportData.columns.map(escapeCsvCell).join(','),
      ...reportData.rowsPdf.map((row) => row.map(escapeCsvCell).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `av_esafe-${reportType}-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generatedToday = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 surface-card overflow-hidden">
      {/* Studio Controls Header */}
      <div className="no-print p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Official A4 Business Documents · 7 Report Templates
            </p>
            <h2 className="font-display text-lg sm:text-xl font-bold text-[#0B1F3A] dark:text-white mt-0.5 flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#C89B3C]" />
              Financial &amp; Operational Report Center
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              Print A4
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-[#0B1F3A] dark:bg-sky-500 hover:bg-[#132E54] dark:hover:bg-sky-400 text-white dark:text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Download A4 PDF
            </button>
          </div>
        </div>

        {/* Report Type Selector Pills (Interactive Buttons) */}
        <div className="flex flex-wrap gap-2">
          {REPORT_TYPES.map((rt) => {
            const active = rt.id === reportType;
            return (
              <button
                key={rt.id}
                type="button"
                onClick={() => setReportType(rt.id)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap border ${
                  active
                    ? 'bg-[#0B1F3A] dark:bg-sky-500 text-white dark:text-slate-950 border-[#0B1F3A] dark:border-sky-500 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {rt.label}
              </button>
            );
          })}
        </div>

        {/* Date Range Filter Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-500 dark:text-slate-400">
              <Calendar className="w-3.5 h-3.5" />
              Date Range:
            </span>
            <input
              type="date"
              aria-label="Report start date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-xs text-slate-800 dark:text-slate-200"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              aria-label="Report end date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-xs text-slate-800 dark:text-slate-200"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'month', label: 'This Month' },
                { id: '30d', label: 'Last 30d' },
                { id: '6m', label: 'Last 6M' },
                { id: 'all', label: 'All Time' },
              ] as const
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className="min-h-[32px] px-2.5 rounded-lg text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Live A4 Printable Report Document Preview */}
      <div className="p-4 sm:p-6 bg-slate-100/70 dark:bg-slate-950/60">
        <article
          id="nirvana-printable-report"
          className="bg-white text-slate-900 border border-slate-200 rounded-sm shadow-xs overflow-hidden"
        >
          {/* Formal Navy & Gold Report Letterhead */}
          <header className="bg-[#0B1F3A] text-white px-6 py-5 border-b-4 border-[#C89B3C]">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <BrandMark size="md" inverted />
                <div>
                  <h3 className="font-display text-lg font-bold tracking-tight text-white">
                    {LIBRARY_BRAND.name}
                  </h3>
                  <p className="text-[11px] text-slate-300">{LIBRARY_BRAND.shortContact}</p>
                  <p className="text-[11px] text-slate-300/80 mt-0.5">{LIBRARY_BRAND.address}</p>
                </div>
              </div>

              <div className="sm:text-right shrink-0">
                <p className="font-display text-xs font-bold uppercase tracking-widest text-[#DFB55B]">
                  {reportData.meta.label} Report
                </p>
                <p className="font-mono text-xs text-slate-200 mt-1">
                  Period: {dateRangeLabel}
                </p>
                <p className="font-mono text-[11px] text-slate-300 mt-0.5">
                  Generated: {generatedToday} · {reportData.rowsUi.length} rows
                </p>
              </div>
            </div>
          </header>

          <div className="p-6 space-y-5">
            <p className="text-xs text-slate-600">{reportData.meta.subtitle}</p>

            {/* Summary KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 avoid-break">
              {reportData.kpisUi.map((kpi) => (
                <div
                  key={kpi.label}
                  className="p-3.5 rounded-md bg-slate-50 border border-slate-200"
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {kpi.label}
                  </p>
                  <p className="font-mono text-base sm:text-lg font-bold text-[#0B1F3A] tabular-nums mt-1">
                    {kpi.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Report Data Table */}
            <div className="border border-slate-200 rounded-md overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#0B1F3A] text-white text-[11px] uppercase tracking-wider">
                    {reportData.columns.map((col, idx) => (
                      <th
                        key={col}
                        className={`py-2.5 px-3.5 font-semibold whitespace-nowrap ${
                          reportData.rightAlignedCols.includes(idx) ? 'text-right' : 'text-left'
                        }`}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {reportData.rowsUi.length === 0 ? (
                    <tr>
                      <td
                        colSpan={reportData.columns.length}
                        className="py-10 px-4 text-center text-slate-500"
                      >
                        No database records match this report and date range.
                      </td>
                    </tr>
                  ) : (
                    reportData.rowsUi.slice(0, 50).map((row, rIdx) => (
                      <tr key={rIdx} className={rIdx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}>
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className={`py-2.5 px-3.5 whitespace-nowrap ${
                              reportData.rightAlignedCols.includes(cIdx)
                                ? 'text-right font-mono tabular-nums font-semibold text-slate-900'
                                : 'text-slate-700'
                            }`}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {reportData.rowsUi.length > 50 && (
              <p className="no-print text-[11px] text-slate-500 italic">
                Showing first 50 rows in live preview. Click &ldquo;Download A4 PDF&rdquo; or &ldquo;Export CSV&rdquo; to include all {reportData.rowsUi.length} records with automatic pagination.
              </p>
            )}

            {/* Formal Report Footer */}
            <footer className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
              <span>{LIBRARY_BRAND.name} · Official Management Report · Verified Live Database</span>
              <span className="font-mono">A4 Document · Generated {generatedToday}</span>
            </footer>
          </div>
        </article>
      </div>
    </section>
  );
}
