import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckCircle2,
  Download,
  Edit3,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  type ExpenseCategory,
  type ExpenseRecord,
  type PaymentMethod,
  type PaymentRecord,
} from '../../types/domain';
import {
  createExpenseRecord,
  deleteExpenseRecord,
  getCurrentBillingMonth,
  subscribeExpenses,
  subscribePayments,
  updateExpenseRecord,
} from '../../services/financeService';
import { useAuth } from '../../context/AuthContext';
import { AnimatedCounter } from '../../components/common/AnimatedCounter';

function escapeCsv(val: string | number | undefined): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function AdminExpensesPage() {
  const { adminProfile } = useAuth();

  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('electricity');
  const [amount, setAmount] = useState<number>(0);
  const [vendor, setVendor] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('upi');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const unsubExpenses = subscribeExpenses((list) => {
      setExpenses(list);
      setLoading(false);
    });
    const unsubPayments = subscribePayments(setPayments);
    return () => {
      unsubExpenses();
      unsubPayments();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const currentMonth = getCurrentBillingMonth();

  const metrics = useMemo(() => {
    const thisMonthExpenses = expenses
      .filter((e) => e.expenseDate.startsWith(currentMonth))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const thisMonthRevenue = payments
      .filter((p) => p.billingMonth === currentMonth)
      .reduce((sum, p) => sum + (Number(p.amountPaid) || 0), 0);
    const netSurplus = thisMonthRevenue - thisMonthExpenses;

    const byCategory = EXPENSE_CATEGORIES.map((cat) => ({
      ...cat,
      total: expenses
        .filter((e) => e.category === cat.id)
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    }))
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total);

    return {
      thisMonthExpenses,
      totalExpenses,
      thisMonthRevenue,
      netSurplus,
      byCategory,
    };
  }, [expenses, payments, currentMonth]);

  const filteredExpenses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return expenses.filter((e) => {
      if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
      if (!q) return true;
      return `${e.title} ${e.vendor || ''} ${e.category} ${e.expenseDate} ${e.notes || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [expenses, categoryFilter, searchQuery]);

  const openModal = (expense?: ExpenseRecord) => {
    setModalError(null);
    if (expense) {
      setEditingExpense(expense);
      setTitle(expense.title);
      setCategory(expense.category);
      setAmount(expense.amount);
      setVendor(expense.vendor || '');
      setPaymentMethod(expense.paymentMethod);
      setExpenseDate(expense.expenseDate);
      setNotes(expense.notes || '');
    } else {
      setEditingExpense(null);
      setTitle('');
      setCategory('electricity');
      setAmount(0);
      setVendor('');
      setPaymentMethod('upi');
      setExpenseDate(new Date().toISOString().slice(0, 10));
      setNotes('');
    }
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    setModalError(null);
    setSubmitting(true);
    try {
      const payload = { title, category, amount, vendor, paymentMethod, expenseDate, notes };
      if (editingExpense) {
        await updateExpenseRecord(editingExpense.id, payload, adminProfile);
        setToast(`Updated expense "${title}".`);
      } else {
        await createExpenseRecord(payload, adminProfile);
        setToast(`Recorded expense "${title}" (₹${amount.toLocaleString('en-IN')}).`);
      }
      setModalOpen(false);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Unable to save expense.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async (expense: ExpenseRecord) => {
    if (!adminProfile) return;
    try {
      await deleteExpenseRecord(expense, adminProfile);
      setDeletingId(null);
      setToast(`Deleted expense "${expense.title}".`);
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Unable to delete expense.');
    }
  };

  const handleExportCsv = () => {
    const headers = ['Date', 'Title', 'Category', 'Vendor', 'Payment Method', 'Amount', 'Notes'];
    const rows = filteredExpenses.map((e) => [
      e.expenseDate,
      e.title,
      e.category,
      e.vendor || '',
      e.paymentMethod,
      e.amount,
      e.notes || '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `av_esafe-expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setToast(`Exported ${filteredExpenses.length} expense records to CSV.`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Admin-Only Operating Ledger · Real-Time Net Surplus Calculation
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0B1F3A] dark:text-white mt-1">
            Expense Management
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={filteredExpenses.length === 0}
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => openModal()}
            className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] dark:hover:bg-blue-500 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Record Expense
          </button>
        </div>
      </div>

      {toast && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Expenses ({currentMonth})
          </p>
          <p className="text-2xl font-bold text-[#0B1F3A] dark:text-white mt-1.5">
            <AnimatedCounter value={metrics.thisMonthExpenses} prefix="₹" />
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Current month outflow</p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Fee Revenue ({currentMonth})
          </p>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1.5">
            <AnimatedCounter value={metrics.thisMonthRevenue} prefix="₹" />
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">From fee collections</p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Net Operating Balance ({currentMonth})
          </p>
          <p
            className={`text-2xl font-bold mt-1.5 font-mono tabular-nums ${
              metrics.netSurplus >= 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {metrics.netSurplus >= 0 ? '+₹' : '-₹'}
            {Math.abs(metrics.netSurplus).toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {metrics.netSurplus >= 0 ? 'Net surplus' : 'Net deficit'}
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">All-Time Expenses</p>
          <p className="text-2xl font-bold text-[#0B1F3A] dark:text-white mt-1.5">
            <AnimatedCounter value={metrics.totalExpenses} prefix="₹" />
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
            {expenses.length} recorded entries
          </p>
        </div>
      </div>

      {/* Category Distribution (when expenses exist) */}
      {metrics.byCategory.length > 0 && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            Expense Breakdown by Category
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {metrics.byCategory.map((item) => {
              const pct =
                metrics.totalExpenses > 0
                  ? Math.round((item.total / metrics.totalExpenses) * 100)
                  : 0;
              return (
                <div key={item.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                      {item.label}
                    </span>
                    <span className="font-mono tabular-nums text-slate-900 dark:text-white font-semibold">
                      ₹{item.total.toLocaleString('en-IN')} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#0B1F3A] dark:bg-blue-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search & Category Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search expense title, vendor, or notes..."
            className="w-full min-h-[42px] pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <select
          aria-label="Filter expense category"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as ExpenseCategory | 'all')}
          className="min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
        >
          <option value="all">All Categories</option>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Expense Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((r) => (
              <div key={r} className="h-11 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="font-display text-base font-semibold text-slate-900 dark:text-white">
              {expenses.length === 0 ? 'No operating expenses recorded yet' : 'No matching expenses'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Log electricity bills, hall rent, internet, staff salaries, and maintenance costs to track true monthly net surplus.
            </p>
            {expenses.length === 0 && (
              <button
                type="button"
                onClick={() => openModal()}
                className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 text-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Record First Expense
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3.5 px-5">Date</th>
                  <th className="py-3.5 px-4">Title & Vendor</th>
                  <th className="py-3.5 px-4">Category & Mode</th>
                  <th className="py-3.5 px-4 text-right">Amount</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                {filteredExpenses.map((exp) => {
                  const catLabel =
                    EXPENSE_CATEGORIES.find((c) => c.id === exp.category)?.label || exp.category;
                  const modeLabel =
                    PAYMENT_METHODS.find((m) => m.id === exp.paymentMethod)?.label ||
                    exp.paymentMethod;
                  return (
                    <tr
                      key={exp.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-5 font-mono tabular-nums text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {exp.expenseDate}
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-slate-900 dark:text-white">{exp.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {exp.vendor || 'General vendor'}
                          {exp.notes ? ` · ${exp.notes}` : ''}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300">
                        {catLabel} · {modeLabel}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        ₹{exp.amount.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        {deletingId === exp.id ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleConfirmDelete(exp)}
                              className="min-h-[32px] px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold cursor-pointer"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingId(null)}
                              className="min-h-[32px] px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openModal(exp)}
                              aria-label={`Edit ${exp.title}`}
                              className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-[#0B1F3A] dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingId(exp.id)}
                              aria-label={`Delete ${exp.title}`}
                              className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Expense Modal */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setModalOpen(false)}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 12 }}
              className="relative z-10 w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-[#0B1F3A] dark:text-white">
                  {editingExpense ? 'Edit Expense' : 'Record Operating Expense'}
                </h2>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  aria-label="Close expense modal"
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {modalError && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                    {modalError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Expense Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Monthly Electricity Bill (NBPDCL)"
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Category *
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                      className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                    >
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Amount (₹) *
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={1000000}
                      required
                      value={amount}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Expense Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={expenseDate}
                      onChange={(e) => setExpenseDate(e.target.value)}
                      className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Payment Mode
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
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Vendor / Payee (optional)
                  </label>
                  <input
                    type="text"
                    maxLength={120}
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                    placeholder="e.g. JioFiber / Building Owner"
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Notes (optional)
                  </label>
                  <input
                    type="text"
                    maxLength={300}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Bill number or description"
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  />
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="min-h-[40px] px-5 py-2 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                  >
                    {submitting ? 'Saving...' : editingExpense ? 'Save Changes' : 'Record Expense'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
