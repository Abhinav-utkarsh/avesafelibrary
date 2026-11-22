import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Download, Printer, ShieldCheck, X } from 'lucide-react';
import { BrandMark } from './BrandMark';
import {
  downloadFeeReceiptPdf,
  formatInrUi,
  getPaymentShiftDetails,
  LIBRARY_BRAND,
} from '../../lib/pdfDocuments';
import { PAYMENT_METHODS, type PaymentRecord, type StudentRecord } from '../../types/domain';

interface FeeReceiptModalProps {
  payment: PaymentRecord | null;
  student?: StudentRecord | null;
  onClose: () => void;
}

export function FeeReceiptModal({ payment, student, onClose }: FeeReceiptModalProps) {
  if (!payment) return null;

  const paidDate =
    payment.paidAt && typeof payment.paidAt.toDate === 'function'
      ? payment.paidAt.toDate().toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : new Date().toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });

  const methodLabel =
    PAYMENT_METHODS.find((m) => m.id === payment.paymentMethod)?.label || payment.paymentMethod;
  const details = getPaymentShiftDetails(student);
  const grossFee =
    details.monthlyFee > 0
      ? details.monthlyFee
      : Number(payment.amountPaid || 0) + Number(payment.discount || 0) + Number(payment.dueAmount || 0);
  const isPaidFull = Number(payment.dueAmount || 0) <= 0;

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
          {/* Sticky Action Toolbar */}
          <div className="no-print sticky top-0 z-20 px-5 py-3.5 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display text-sm font-bold text-[#0B1F3A] dark:text-white">
                Official A4 Fee Receipt
              </p>
              <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                {payment.receiptNo} · Ready for PDF Download &amp; A4 Printing
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => downloadFeeReceiptPdf(payment, student)}
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
                aria-label="Close receipt"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Authentic A4 Paper Document Sheet */}
          <div className="p-4 sm:p-7 bg-slate-100/80 dark:bg-slate-950/60">
            <article
              id="nirvana-printable-receipt"
              className="mx-auto bg-white text-slate-900 border border-slate-200 shadow-sm rounded-sm overflow-hidden"
            >
              {/* Official Navy Letterhead */}
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
                      Official Fee Receipt
                    </p>
                    <p className="font-mono text-lg font-bold text-white mt-1 tabular-nums">
                      {payment.receiptNo}
                    </p>
                    <p className="font-mono text-xs text-slate-300 mt-1">
                      Date: {paidDate}
                    </p>
                    <p className="font-mono text-xs text-slate-300">
                      Cycle: {payment.billingMonth}
                    </p>
                  </div>
                </div>
              </header>

              <div className="p-6 sm:p-8 space-y-6">
                {/* Payment Verification Status Strip */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-md">
                  <div className="flex items-center gap-2 text-xs">
                    <CheckCircle2
                      className={`w-4 h-4 ${isPaidFull ? 'text-emerald-700' : 'text-amber-700'}`}
                    />
                    <span className="font-semibold text-slate-500 uppercase tracking-wider">
                      Status:
                    </span>
                    <span
                      className={`font-display font-bold tracking-wide ${
                        isPaidFull ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {isPaidFull ? 'PAID IN FULL' : 'PARTIAL PAYMENT'}
                    </span>
                  </div>

                  <div className="font-mono text-[11px] text-slate-600 tabular-nums">
                    Txn Ref: <span className="font-semibold text-slate-900">{payment.idempotencyKey || payment.receiptNo}</span>
                  </div>
                </div>

                {/* Student & Membership Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 border border-slate-200 rounded-md space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#0B1F3A]">
                      Student Information
                    </p>
                    <p className="font-display text-base font-bold text-slate-900">
                      {payment.studentName}
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
                      Membership &amp; Payment Details
                    </p>
                    <p className="text-xs text-slate-600">
                      Membership Plan: <span className="font-semibold text-slate-900">{details.planLabel}</span>
                    </p>
                    <p className="text-xs text-slate-600">
                      Selected Shift: <span className="font-semibold text-slate-900">{details.shiftLabel}</span>
                    </p>
                    <p className="text-xs text-slate-600">
                      Allocated Seat: <span className="font-mono font-semibold text-slate-900">{details.seatInfo}</span>
                    </p>
                    <p className="text-xs text-slate-600">
                      Payment Method: <span className="font-semibold text-slate-900">{methodLabel}</span>
                    </p>
                  </div>
                </div>

                {/* Financial Breakdown Table */}
                <div className="border border-slate-200 rounded-md overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#0B1F3A] text-white text-[11px] uppercase tracking-wider">
                        <th className="py-2.5 px-4 font-semibold">Particulars / Description</th>
                        <th className="py-2.5 px-4 font-semibold text-center">Cycle / Date</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Amount (INR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs sm:text-sm">
                      <tr>
                        <td className="py-3 px-4 font-medium text-slate-900">
                          Library Membership Fee ({details.shiftLabel})
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-xs text-slate-600">
                          {payment.billingMonth}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                          {formatInrUi(grossFee)}
                        </td>
                      </tr>
                      {payment.discount > 0 && (
                        <tr className="bg-slate-50/70">
                          <td className="py-3 px-4 text-slate-700">Concession / Discount Applied</td>
                          <td className="py-3 px-4 text-center font-mono text-xs text-slate-500">
                            {payment.billingMonth}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                            - {formatInrUi(payment.discount)}
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td className="py-3 px-4 font-semibold text-slate-900">Amount Paid Today</td>
                        <td className="py-3 px-4 text-center font-mono text-xs text-slate-600">
                          {paidDate}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-emerald-700">
                          {formatInrUi(payment.amountPaid)}
                        </td>
                      </tr>
                      <tr className="bg-slate-50/70">
                        <td className="py-3 px-4 font-medium text-slate-700">
                          Pending Balance Remaining
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-xs text-slate-500">
                          Post-Payment
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono tabular-nums font-bold ${
                            payment.dueAmount > 0 ? 'text-rose-700' : 'text-slate-700'
                          }`}
                        >
                          {formatInrUi(payment.dueAmount)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Executive Total Received Band */}
                <div className="bg-[#0B1F3A] text-white rounded-md px-5 py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-slate-300">
                      Total Amount Received
                    </p>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Recorded by: <span className="font-medium text-white">{payment.collectedBy || 'Av_eSAFE Library Desk'}</span>
                    </p>
                  </div>
                  <p className="font-mono text-2xl font-bold tracking-tight tabular-nums text-white">
                    {formatInrUi(payment.amountPaid)}
                  </p>
                </div>

                {payment.notes && (
                  <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-4 py-2.5">
                    <span className="font-semibold text-slate-800">Remarks / Reference: </span>
                    {payment.notes}
                  </div>
                )}

                {/* Authorized Signature Section */}
                <div className="pt-8 grid grid-cols-2 gap-8 items-end avoid-break">
                  <div>
                    <div className="border-t border-slate-400 pt-2">
                      <p className="text-xs font-semibold text-slate-800">
                        Student / Guardian Signature
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Acknowledged receipt of payment
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 font-semibold mb-4">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Digitally Verified Ledger Entry
                    </div>
                    <div className="border-t border-slate-400 pt-2">
                      <p className="text-xs font-semibold text-slate-800">Authorized Signatory</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Av_eSAFE Library · Electronic City, Bangalore
                      </p>
                    </div>
                  </div>
                </div>

                {/* Document Footer */}
                <footer className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                  <span>
                    Fees paid are non-transferable. Retain this receipt for seat &amp; Smart Door verification.
                  </span>
                  <span className="font-mono">Av_eSAFE Library · Official Document</span>
                </footer>
              </div>
            </article>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
