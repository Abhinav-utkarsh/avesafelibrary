import { AnimatePresence, motion } from 'motion/react';
import { Download, Printer, ShieldCheck, X } from 'lucide-react';
import { BrandMark } from './BrandMark';
import {
  downloadFeeInvoicePdf,
  formatInrUi,
  getPaymentShiftDetails,
  LIBRARY_BRAND,
  type FeeInvoicePayload,
} from '../../lib/pdfDocuments';
import type { PaymentRecord, StudentRecord } from '../../types/domain';

interface FeeInvoiceModalProps {
  student: StudentRecord | null;
  payment?: PaymentRecord | null;
  onClose: () => void;
}

export function buildInvoiceFromStudent(
  student: StudentRecord,
  payment?: PaymentRecord | null,
): FeeInvoicePayload {
  const now = new Date();
  const ym =
    payment?.billingMonth ||
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const cleanReg = (student.registrationNo || student.id.slice(0, 6)).replace(/[^A-Z0-9]/gi, '').slice(-5).toUpperCase();
  const invoiceNo = `INV-${ym.replace('-', '')}-${cleanReg}`;
  const invoiceDate =
    payment?.paidAt && typeof payment.paidAt.toDate === 'function'
      ? payment.paidAt.toDate().toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : now.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });

  const dueDate = student.membershipExpiry || new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const details = getPaymentShiftDetails(student);
  const monthlyFee = Number(student.monthlyFee || 0);
  const discount = Number(payment?.discount || 0);
  const amountPaid = Number(payment?.amountPaid || 0);
  const pendingBalance = payment ? Number(payment.dueAmount || 0) : Number(student.pendingAmount || 0);

  const items: { description: string; period: string; amount: number }[] = [];

  if (monthlyFee > 0) {
    items.push({
      description: `Library Study Seat Subscription — ${details.planLabel} (${details.shiftLabel})`,
      period: ym,
      amount: monthlyFee,
    });
  }

  // If student carries arrears exceeding a single monthly fee (when generating bill without specific receipt)
  const priorArrears = !payment ? Math.max(0, pendingBalance - monthlyFee) : 0;
  if (priorArrears > 0) {
    items.push({
      description: 'Previous Outstanding Balance Carried Forward',
      period: 'Prior Cycles',
      amount: priorArrears,
    });
  }

  if (items.length === 0) {
    items.push({
      description: `Library Membership Fee — ${details.shiftLabel}`,
      period: ym,
      amount: amountPaid + pendingBalance + discount,
    });
  }

  const subtotal = items.reduce((sum, i) => sum + i.amount, 0);
  const totalPayable = Math.max(0, subtotal - discount);
  const effectivePaid = payment ? amountPaid : Math.max(0, totalPayable - pendingBalance);

  return {
    invoiceNo,
    invoiceDate,
    dueDate,
    billingPeriod: ym,
    student,
    items,
    subtotal,
    discount,
    totalPayable,
    amountPaid: effectivePaid,
    outstandingBalance: pendingBalance,
  };
}

export function FeeInvoiceModal({ student, payment, onClose }: FeeInvoiceModalProps) {
  if (!student) return null;

  const invoice = buildInvoiceFromStudent(student, payment);
  const details = getPaymentShiftDetails(student);
  const isSettled = invoice.outstandingBalance <= 0;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-[#061326]/70 backdrop-blur-xs no-print"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 14 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="relative z-10 w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl"
        >
          {/* Sticky Action Bar */}
          <div className="no-print sticky top-0 z-20 px-5 py-3.5 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display text-sm font-bold text-[#0B1F3A] dark:text-white">
                Professional A4 Fee Invoice / Bill
              </p>
              <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                {invoice.invoiceNo} · Billing Period {invoice.billingPeriod}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => downloadFeeInvoicePdf(invoice)}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-2 rounded-xl bg-[#0B1F3A] dark:bg-sky-500 hover:bg-[#132E54] dark:hover:bg-sky-400 text-white dark:text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Download PDF (A4)
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                Print A4
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close invoice"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Authentic A4 Invoice Sheet */}
          <div className="p-4 sm:p-7 bg-slate-100/80 dark:bg-slate-950/60">
            <article
              id="nirvana-printable-invoice"
              className="mx-auto bg-white text-slate-900 border border-slate-200 shadow-sm rounded-sm overflow-hidden"
            >
              {/* Navy Letterhead */}
              <header className="bg-[#0B1F3A] text-white px-6 sm:px-8 py-6 border-b-4 border-[#C89B3C]">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <BrandMark size="lg" inverted />
                    <div>
                      <h2 className="font-display text-xl font-bold tracking-tight text-white">
                        {LIBRARY_BRAND.name}
                      </h2>
                      <p className="text-xs text-slate-300 mt-0.5">{LIBRARY_BRAND.subtitle}</p>
                      <p className="text-[11px] text-slate-300/90 mt-2">{LIBRARY_BRAND.address}</p>
                      <p className="text-[11px] text-slate-300/90">{LIBRARY_BRAND.contact}</p>
                    </div>
                  </div>

                  <div className="sm:text-right shrink-0">
                    <p className="font-display text-xs font-bold uppercase tracking-widest text-[#DFB55B]">
                      Fee Invoice / Statement
                    </p>
                    <p className="font-mono text-lg font-bold text-white mt-1 tabular-nums">
                      {invoice.invoiceNo}
                    </p>
                    <p className="font-mono text-xs text-slate-300 mt-1">
                      Invoice Date: {invoice.invoiceDate}
                    </p>
                    <p className="font-mono text-xs text-slate-300">
                      Due Date: {invoice.dueDate}
                    </p>
                  </div>
                </div>
              </header>

              <div className="p-6 sm:p-8 space-y-6">
                {/* Bill To & Membership Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 border border-slate-200 rounded-md space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#0B1F3A]">
                      Bill To (Student)
                    </p>
                    <p className="font-display text-base font-bold text-slate-900">
                      {student.fullName}
                    </p>
                    <p className="text-xs text-slate-600 font-mono">
                      Student ID: <span className="text-slate-900 font-medium">{details.registrationNo}</span>
                    </p>
                    <p className="text-xs text-slate-600 font-mono">
                      Phone: <span className="text-slate-900">{details.phone}</span>
                    </p>
                    <p className="text-xs text-slate-600 truncate">
                      Email: <span className="text-slate-900">{details.email}</span>
                    </p>
                  </div>

                  <div className="p-4 border border-slate-200 rounded-md space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#0B1F3A]">
                      Membership &amp; Billing Details
                    </p>
                    <p className="text-xs text-slate-600">
                      Plan: <span className="font-semibold text-slate-900">{details.planLabel}</span>
                    </p>
                    <p className="text-xs text-slate-600">
                      Shift: <span className="font-semibold text-slate-900">{details.shiftLabel}</span>
                    </p>
                    <p className="text-xs text-slate-600">
                      Seat Allocation: <span className="font-mono font-semibold text-slate-900">{details.seatInfo}</span>
                    </p>
                    <p className="text-xs text-slate-600">
                      Billing Period: <span className="font-mono font-semibold text-slate-900">{invoice.billingPeriod}</span>
                    </p>
                  </div>
                </div>

                {/* Itemized Fee Breakdown Table */}
                <div className="border border-slate-200 rounded-md overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#0B1F3A] text-white text-[11px] uppercase tracking-wider">
                        <th className="py-2.5 px-3 font-semibold w-10 text-center">#</th>
                        <th className="py-2.5 px-4 font-semibold">Itemized Fee Description</th>
                        <th className="py-2.5 px-4 font-semibold text-center">Billing Period</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Amount (INR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs sm:text-sm">
                      {invoice.items.map((item, idx) => (
                        <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/70' : ''}>
                          <td className="py-3 px-3 text-center font-mono text-xs text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-900">
                            {item.description}
                          </td>
                          <td className="py-3 px-4 text-center font-mono text-xs text-slate-600">
                            {item.period}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                            {formatInrUi(item.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Payment Instructions + Totals Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-start avoid-break">
                  <div className="sm:col-span-7 p-4 bg-slate-50 border border-slate-200 rounded-md space-y-2 text-xs text-slate-700">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#0B1F3A]">
                      Payment Instructions
                    </p>
                    <ul className="space-y-1.5 list-disc list-inside text-slate-600">
                      <li>
                        <strong>Desk Payment:</strong> Pay via Cash or Card at Av_eSAFE Library Reception, Electronic City, Bangalore.
                      </li>
                      <li>
                        <strong>UPI / QR:</strong> Scan the official library QR at desk and quote Student ID{' '}
                        <span className="font-mono font-semibold text-slate-900">{details.registrationNo}</span>.
                      </li>
                      <li>
                        <strong>Receipt Verification:</strong> Collect your official digital receipt immediately after payment.
                      </li>
                    </ul>
                    <p className="pt-1 font-semibold">
                      Statement Status:{' '}
                      <span className={isSettled ? 'text-emerald-700' : 'text-rose-700'}>
                        {isSettled ? 'SETTLED / NO DUES' : 'OUTSTANDING BALANCE DUE'}
                      </span>
                    </p>
                  </div>

                  <div className="sm:col-span-5 p-4 bg-slate-50 border border-slate-200 rounded-md space-y-2 text-xs">
                    <div className="flex justify-between gap-2 text-slate-600">
                      <span>Subtotal</span>
                      <span className="font-mono tabular-nums font-medium text-slate-900">
                        {formatInrUi(invoice.subtotal)}
                      </span>
                    </div>
                    {invoice.discount > 0 && (
                      <div className="flex justify-between gap-2 text-emerald-700">
                        <span>Discount</span>
                        <span className="font-mono tabular-nums font-semibold">
                          - {formatInrUi(invoice.discount)}
                        </span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-slate-200 flex justify-between gap-2 font-semibold text-slate-900">
                      <span>Total Payable</span>
                      <span className="font-mono tabular-nums">
                        {formatInrUi(invoice.totalPayable)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2 text-emerald-700">
                      <span>Amount Paid</span>
                      <span className="font-mono tabular-nums font-semibold">
                        {formatInrUi(invoice.amountPaid)}
                      </span>
                    </div>
                    <div className="pt-2 border-t border-slate-300 flex justify-between gap-2 text-sm font-bold">
                      <span className="text-[#0B1F3A]">Outstanding Balance</span>
                      <span
                        className={`font-mono tabular-nums ${
                          isSettled ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {formatInrUi(invoice.outstandingBalance)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Terms & Conditions + Authorized Signatory */}
                <div className="pt-4 border-t border-slate-200 space-y-4 avoid-break">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#0B1F3A] mb-1.5">
                      Terms &amp; Conditions
                    </p>
                    <ol className="text-[11px] text-slate-600 space-y-1 list-decimal list-inside leading-relaxed">
                      <li>
                        Monthly fees are payable in advance on or before the renewal date to retain allocated seating and Smart Door access.
                      </li>
                      <li>
                        Fixed seats remain reserved exclusively for the member; Non-Fixed seats are valid strictly during the enrolled shift window.
                      </li>
                      <li>
                        Fees once paid are non-refundable and non-transferable. All records are governed by Av_eSAFE Library&apos;s verified ledger.
                      </li>
                    </ol>
                  </div>

                  <div className="pt-6 flex items-end justify-between gap-4">
                    <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#0B1F3A]" />
                      Generated from verified Firestore ledger
                    </div>
                    <div className="w-52 text-right border-t border-slate-400 pt-2">
                      <p className="text-xs font-semibold text-slate-800">Authorized Signatory</p>
                      <p className="text-[11px] text-slate-500">Av_eSAFE Library · Electronic City, Bangalore</p>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
