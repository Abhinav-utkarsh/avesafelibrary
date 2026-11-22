import { useMemo, useState } from 'react';
import { CalendarPlus, Check, Edit3, Receipt, Search, X } from 'lucide-react';
import {
  SHIFT_DEFINITIONS,
  type AdminProfile,
  type PaymentRecord,
  type StudentRecord,
} from '../../../types/domain';
import {
  getCurrentBillingMonth,
  postBulkMonthlyFees,
  updateStudentFeeSettings,
} from '../../../services/financeService';
import { StudentAvatar } from '../../common/StudentAvatar';
import { WhatsAppButton } from '../../common/WhatsAppButton';
import { buildFeeReminderWhatsApp } from '../../../lib/whatsapp';

interface FeesManagePanelProps {
  mode: 'manage' | 'monthly_fee';
  students: StudentRecord[];
  payments: PaymentRecord[];
  adminProfile: AdminProfile | null;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  onCollectFee: (student: StudentRecord) => void;
  onOpenInvoice: (student: StudentRecord) => void;
  onNotify: (msg: string) => void;
}

export function FeesManagePanel({
  mode,
  students,
  payments,
  adminProfile,
  searchQuery,
  onSearchChange,
  onCollectFee,
  onOpenInvoice,
  onNotify,
}: FeesManagePanelProps) {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentBillingMonth());
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'partial' | 'unpaid'>('all');
  const [shiftFilter, setShiftFilter] = useState<string>('all');

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMonthly, setEditMonthly] = useState<number>(0);
  const [editPending, setEditPending] = useState<number>(0);
  const [editExpiry, setEditExpiry] = useState<string>('');
  const [savingId, setSavingId] = useState<string | null>(null);

  // Bulk monthly cycle posting state
  const [confirmBulkPost, setConfirmBulkPost] = useState(false);
  const [postingBulk, setPostingBulk] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  const paidByStudentForMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payments) {
      if (p.billingMonth === selectedMonth) {
        map.set(p.studentId, (map.get(p.studentId) || 0) + Number(p.amountPaid || 0));
      }
    }
    return map;
  }, [payments, selectedMonth]);

  const rows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return students
      .filter((s) => {
        if (shiftFilter !== 'all' && s.shiftType !== shiftFilter) return false;
        if (q) {
          const hay = `${s.fullName} ${s.registrationNo} ${s.phone} ${s.seatId || ''} ${s.hall}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (mode === 'monthly_fee' && statusFilter !== 'all') {
          const paidThisMonth = paidByStudentForMonth.get(s.id) || 0;
          const expected = Number(s.monthlyFee || 0);
          const monthStatus =
            expected === 0 || paidThisMonth >= expected
              ? 'paid'
              : paidThisMonth > 0
                ? 'partial'
                : 'unpaid';
          if (monthStatus !== statusFilter) return false;
        }
        return true;
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [students, searchQuery, shiftFilter, statusFilter, mode, paidByStudentForMonth]);

  const monthlySummary = useMemo(() => {
    const activeStudents = students.filter((s) => s.status === 'active');
    const expectedMrr = activeStudents.reduce((s, r) => s + Number(r.monthlyFee || 0), 0);
    const collectedForMonth = payments
      .filter((p) => p.billingMonth === selectedMonth)
      .reduce((s, p) => s + Number(p.amountPaid || 0), 0);
    const paidStudentsCount = activeStudents.filter((s) => {
      const paid = paidByStudentForMonth.get(s.id) || 0;
      return Number(s.monthlyFee || 0) > 0 && paid >= Number(s.monthlyFee || 0);
    }).length;
    const unpaidActiveCount = activeStudents.filter((s) => {
      const paid = paidByStudentForMonth.get(s.id) || 0;
      return Number(s.monthlyFee || 0) > 0 && paid === 0;
    }).length;
    return {
      activeCount: activeStudents.length,
      expectedMrr,
      collectedForMonth,
      paidStudentsCount,
      unpaidActiveCount,
      collectionPct: expectedMrr > 0 ? Math.min(100, Math.round((collectedForMonth / expectedMrr) * 100)) : 0,
    };
  }, [students, payments, selectedMonth, paidByStudentForMonth]);

  const startEdit = (student: StudentRecord) => {
    setPanelError(null);
    setEditingId(student.id);
    setEditMonthly(Number(student.monthlyFee || 0));
    setEditPending(Number(student.pendingAmount || 0));
    setEditExpiry(student.membershipExpiry || '');
  };

  const handleSaveEdit = async (student: StudentRecord) => {
    if (!adminProfile) return;
    setPanelError(null);
    setSavingId(student.id);
    try {
      await updateStudentFeeSettings(
        student,
        { monthlyFee: editMonthly, pendingAmount: editPending, membershipExpiry: editExpiry },
        adminProfile,
      );
      setEditingId(null);
      onNotify(`Updated fee plan for ${student.fullName} (Monthly ₹${editMonthly.toLocaleString('en-IN')}, Due ₹${editPending.toLocaleString('en-IN')}).`);
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Unable to save fee changes.');
    } finally {
      setSavingId(null);
    }
  };

  const handlePostCycle = async () => {
    if (!adminProfile) return;
    setPanelError(null);
    setPostingBulk(true);
    try {
      const activeUnpaid = students.filter(
        (s) => s.status === 'active' && Number(s.monthlyFee || 0) > 0,
      );
      const res = await postBulkMonthlyFees(activeUnpaid, selectedMonth, adminProfile);
      setConfirmBulkPost(false);
      onNotify(
        `Posted ${selectedMonth} monthly dues for ${res.updatedCount} active students (₹${res.totalPosted.toLocaleString('en-IN')} added to pending ledger).`,
      );
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Unable to post monthly fee cycle.');
    } finally {
      setPostingBulk(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Expected Monthly Recurring</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-[#0B1F3A] dark:text-white mt-1">
            ₹{monthlySummary.expectedMrr.toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {monthlySummary.activeCount} active fee plans
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Collected for {selectedMonth}</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">
            ₹{monthlySummary.collectedForMonth.toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
            {monthlySummary.collectionPct}% of monthly target
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Paid ({selectedMonth})</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {monthlySummary.paidStudentsCount}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Settled monthly cycle</p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Unpaid ({selectedMonth})</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {monthlySummary.unpaidActiveCount}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Active members pending</p>
        </div>
      </div>

      {panelError && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
          {panelError}
        </div>
      )}

      {/* Action Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search student, reg no, phone..."
              className="w-full min-h-[40px] pl-10 pr-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
            />
          </div>

          <input
            type="month"
            aria-label="Select billing month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-mono text-slate-700 dark:text-slate-200"
          />

          <select
            aria-label="Filter by shift"
            value={shiftFilter}
            onChange={(e) => setShiftFilter(e.target.value)}
            className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200"
          >
            <option value="all">All Shifts</option>
            {SHIFT_DEFINITIONS.map((sh) => (
              <option key={sh.id} value={sh.id}>
                {sh.label}
              </option>
            ))}
          </select>

          {mode === 'monthly_fee' && (
            <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              {(['all', 'unpaid', 'partial', 'paid'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer ${
                    statusFilter === st
                      ? 'bg-white dark:bg-slate-900 text-[#0B1F3A] dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          )}
        </div>

        {mode === 'manage' && (
          <div className="flex items-center gap-2">
            {confirmBulkPost ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                <span className="text-xs text-amber-900 dark:text-amber-200">
                  Post {selectedMonth} dues to {monthlySummary.activeCount} active students?
                </span>
                <button
                  type="button"
                  disabled={postingBulk}
                  onClick={handlePostCycle}
                  className="px-3 py-1 rounded-lg bg-[#0B1F3A] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {postingBulk ? 'Posting...' : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmBulkPost(false)}
                  className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmBulkPost(true)}
                className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-[#0B1F3A] dark:text-sky-400 transition-colors cursor-pointer whitespace-nowrap"
              >
                <CalendarPlus className="w-4 h-4" />
                Post {selectedMonth} Monthly Cycle
              </button>
            )}
          </div>
        )}
      </div>

      {/* Ledger Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500 dark:text-slate-400">
            No students match the selected fee filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3.5 px-5">Student</th>
                  <th className="py-3.5 px-4">Shift &amp; Seat</th>
                  <th className="py-3.5 px-4 text-right">Monthly Fee</th>
                  {mode === 'monthly_fee' ? (
                    <th className="py-3.5 px-4 text-right">Paid ({selectedMonth})</th>
                  ) : (
                    <th className="py-3.5 px-4">Expiry</th>
                  )}
                  <th className="py-3.5 px-4 text-right">Pending Due</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                {rows.map((st) => {
                  const isEditing = editingId === st.id;
                  const shiftLabel =
                    SHIFT_DEFINITIONS.find((s) => s.id === st.shiftType)?.label || st.shiftType;
                  const paidMonth = paidByStudentForMonth.get(st.id) || 0;
                  const monthState =
                    st.monthlyFee === 0 || paidMonth >= st.monthlyFee
                      ? 'Paid'
                      : paidMonth > 0
                        ? 'Partial'
                        : 'Unpaid';

                  return (
                    <tr
                      key={st.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-5">
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
                              {st.registrationNo} · {st.status}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{shiftLabel}</p>
                        <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                          {st.seatId ? `${st.hall} · ${st.seatId}` : 'Unseated'} ·{' '}
                          {st.seatMode === 'fixed' ? 'Fixed' : 'Non-Fixed'}
                        </p>
                      </td>

                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            max={100000}
                            value={editMonthly}
                            onChange={(e) => setEditMonthly(Number(e.target.value))}
                            className="w-24 px-2 py-1 rounded-lg border border-blue-500 bg-white dark:bg-slate-950 text-right text-xs"
                          />
                        ) : (
                          <span className="font-semibold text-slate-900 dark:text-white">
                            ₹{Number(st.monthlyFee || 0).toLocaleString('en-IN')}
                          </span>
                        )}
                      </td>

                      {mode === 'monthly_fee' ? (
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                          <span
                            className={
                              monthState === 'Paid'
                                ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                                : monthState === 'Partial'
                                  ? 'font-semibold text-amber-600 dark:text-amber-400'
                                  : 'text-slate-500 dark:text-slate-400'
                            }
                          >
                            ₹{paidMonth.toLocaleString('en-IN')} · {monthState}
                          </span>
                        </td>
                      ) : (
                        <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600 dark:text-slate-300">
                          {isEditing ? (
                            <input
                              type="date"
                              value={editExpiry}
                              onChange={(e) => setEditExpiry(e.target.value)}
                              className="px-2 py-1 rounded-lg border border-blue-500 bg-white dark:bg-slate-950 text-xs"
                            />
                          ) : (
                            st.membershipExpiry || '—'
                          )}
                        </td>
                      )}

                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {isEditing ? (
                          <input
                            type="number"
                            min={0}
                            max={500000}
                            value={editPending}
                            onChange={(e) => setEditPending(Number(e.target.value))}
                            className="w-24 px-2 py-1 rounded-lg border border-blue-500 bg-white dark:bg-slate-950 text-right text-xs"
                          />
                        ) : (
                          <span
                            className={
                              Number(st.pendingAmount) > 0
                                ? 'font-bold text-rose-600 dark:text-rose-400'
                                : 'text-emerald-700 dark:text-emerald-400 font-medium'
                            }
                          >
                            ₹{Number(st.pendingAmount || 0).toLocaleString('en-IN')}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-5 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                disabled={savingId === st.id}
                                onClick={() => handleSaveEdit(st)}
                                className="inline-flex items-center gap-1 min-h-[32px] px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="min-h-[32px] px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => startEdit(st)}
                                title="Edit fee plan & due"
                                className="inline-flex items-center gap-1 min-h-[32px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => onOpenInvoice(st)}
                                title="View Fee Bill / Invoice"
                                className="inline-flex items-center gap-1 min-h-[32px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                              >
                                <Receipt className="w-3.5 h-3.5" />
                                Bill
                              </button>
                              <WhatsAppButton
                                phone={st.phone}
                                message={buildFeeReminderWhatsApp(st)}
                                size="xs"
                                variant="outline"
                              />
                              <button
                                type="button"
                                onClick={() => onCollectFee(st)}
                                className="inline-flex items-center min-h-[32px] px-2.5 rounded-lg bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                              >
                                Collect
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
    </div>
  );
}
