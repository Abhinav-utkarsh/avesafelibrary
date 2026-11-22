import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CalendarPlus,
  CheckCircle2,
  RefreshCw,
  Search,
  X,
  XCircle,
} from 'lucide-react';
import {
  SHIFT_DEFINITIONS,
  type MembershipRecord,
  type MembershipStatus,
  type ShiftType,
  type StudentRecord,
} from '../../types/domain';
import {
  cancelMembershipPlan,
  computeEffectiveMembershipStatus,
  createMembershipPlan,
  renewMembershipPlan,
  subscribeMemberships,
} from '../../services/membershipService';
import {
  addDaysIsoDate,
  getDaysUntilExpiry,
  subscribeStudents,
} from '../../services/studentService';
import { useAuth } from '../../context/AuthContext';
import { StudentAvatar } from '../../components/common/StudentAvatar';

type MembershipTab = 'all' | 'active' | 'expiring_soon' | 'expired' | 'cancelled';

function getSuggestedFee(shiftType: ShiftType, seatMode: 'fixed' | 'non_fixed'): number {
  const def = SHIFT_DEFINITIONS.find((s) => s.id === shiftType) || SHIFT_DEFINITIONS[0];
  return seatMode === 'fixed' ? def.defaultFeeFixed : def.defaultFeeNonFixed;
}

function addDaysToIso(baseIso: string, days: number): string {
  const base = new Date(`${baseIso}T12:00:00`);
  const start = Number.isNaN(base.getTime()) || base.getTime() < Date.now() ? new Date() : base;
  start.setDate(start.getDate() + days);
  return start.toISOString().slice(0, 10);
}

export function AdminMembershipsPage() {
  const { adminProfile } = useAuth();

  const [memberships, setMemberships] = useState<MembershipRecord[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<MembershipTab>('all');
  const [shiftFilter, setShiftFilter] = useState<ShiftType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Create Modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [shiftType, setShiftType] = useState<ShiftType>('morning');
  const [seatMode, setSeatMode] = useState<'fixed' | 'non_fixed'>('non_fixed');
  const [startDate, setStartDate] = useState(addDaysIsoDate(0));
  const [endDate, setEndDate] = useState(addDaysIsoDate(30));
  const [monthlyFee, setMonthlyFee] = useState<number>(500);
  const [addFeeToPending, setAddFeeToPending] = useState(true);

  // Renew Modal state
  const [renewTarget, setRenewTarget] = useState<MembershipRecord | null>(null);
  const [renewEndDate, setRenewEndDate] = useState('');
  const [renewFee, setRenewFee] = useState<number>(500);
  const [renewAddDue, setRenewAddDue] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const unsubMemberships = subscribeMemberships((list) => {
      setMemberships(list);
      setLoading(false);
    });
    const unsubStudents = subscribeStudents(setStudents);
    return () => {
      unsubMemberships();
      unsubStudents();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const studentMap = useMemo(() => {
    const map = new Map<string, StudentRecord>();
    students.forEach((s) => map.set(s.id, s));
    return map;
  }, [students]);

  const enrichedMemberships = useMemo(() => {
    return memberships.map((m) => ({
      ...m,
      effectiveStatus: computeEffectiveMembershipStatus(m.status, m.endDate),
      daysLeft: getDaysUntilExpiry(m.endDate),
    }));
  }, [memberships]);

  const tabCounts = useMemo(() => {
    const counts: Record<MembershipTab, number> = {
      all: enrichedMemberships.length,
      active: 0,
      expiring_soon: 0,
      expired: 0,
      cancelled: 0,
    };
    enrichedMemberships.forEach((m) => {
      counts[m.effectiveStatus]++;
    });
    return counts;
  }, [enrichedMemberships]);

  const filteredMemberships = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedMemberships.filter((m) => {
      if (activeTab !== 'all' && m.effectiveStatus !== activeTab) return false;
      if (shiftFilter !== 'all' && m.shiftType !== shiftFilter) return false;
      if (q) {
        const hay = `${m.studentName} ${m.seatId || ''} ${m.shiftType}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [enrichedMemberships, activeTab, shiftFilter, searchQuery]);

  const openCreateModal = () => {
    setModalError(null);
    setStudentId('');
    setShiftType('morning');
    setSeatMode('non_fixed');
    setStartDate(addDaysIsoDate(0));
    setEndDate(addDaysIsoDate(30));
    setMonthlyFee(getSuggestedFee('morning', 'non_fixed'));
    setAddFeeToPending(true);
    setCreateOpen(true);
  };

  const handleStudentChange = (nextStudentId: string) => {
    setStudentId(nextStudentId);
    const st = students.find((s) => s.id === nextStudentId);
    if (st) {
      const mode = st.seatMode === 'fixed' ? 'fixed' : 'non_fixed';
      setShiftType(st.shiftType);
      setSeatMode(mode);
      setMonthlyFee(st.monthlyFee > 0 ? st.monthlyFee : getSuggestedFee(st.shiftType, mode));
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    const targetStudent = students.find((s) => s.id === studentId);
    if (!targetStudent) {
      setModalError('Please select a registered student.');
      return;
    }

    setSubmitting(true);
    setModalError(null);
    try {
      await createMembershipPlan(
        {
          studentId: targetStudent.id,
          shiftType,
          seatMode,
          seatId: targetStudent.seatId || '',
          startDate,
          endDate,
          monthlyFee,
          addFeeToPending,
        },
        targetStudent,
        adminProfile,
      );
      setToast(`Created ${shiftType.replace('_', ' ')} membership for ${targetStudent.fullName}.`);
      setCreateOpen(false);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Unable to create membership.');
    } finally {
      setSubmitting(false);
    }
  };

  const openRenewModal = (m: MembershipRecord) => {
    setModalError(null);
    setRenewTarget(m);
    setRenewEndDate(addDaysToIso(m.endDate, 30));
    setRenewFee(m.monthlyFee);
    setRenewAddDue(true);
  };

  const handleRenewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile || !renewTarget) return;
    setSubmitting(true);
    setModalError(null);
    try {
      await renewMembershipPlan(renewTarget, renewEndDate, renewFee, renewAddDue, adminProfile);
      setToast(`Renewed ${renewTarget.studentName} through ${renewEndDate}.`);
      setRenewTarget(null);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Unable to renew membership.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (m: MembershipRecord) => {
    if (!adminProfile) return;
    try {
      await cancelMembershipPlan(m, adminProfile);
      setToast(`Cancelled membership for ${m.studentName}.`);
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Unable to cancel membership.');
    }
  };

  const statusColor = (status: MembershipStatus) => {
    switch (status) {
      case 'active':
        return 'text-emerald-700 dark:text-emerald-400';
      case 'expiring_soon':
        return 'text-amber-600 dark:text-amber-400';
      case 'expired':
        return 'text-red-600 dark:text-red-400';
      case 'cancelled':
        return 'text-slate-500 dark:text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Morning, Noon, Evening, Night, Double, Triple & All Shifts (24/7)
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0B1F3A] dark:text-white mt-1">
            Memberships & Shifts
          </h1>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] dark:hover:bg-blue-500 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
        >
          <CalendarPlus className="w-4 h-4" />
          New Membership Plan
        </button>
      </div>

      {toast && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* 7-Shift Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {SHIFT_DEFINITIONS.map((def) => {
          const activeInShift = students.filter(
            (s) => (s.status === 'active' || s.status === 'demo') && s.shiftType === def.id,
          ).length;
          return (
            <button
              key={def.id}
              type="button"
              onClick={() => setShiftFilter((prev) => (prev === def.id ? 'all' : def.id))}
              className={`p-3.5 rounded-2xl border text-left transition-colors cursor-pointer ${
                shiftFilter === def.id
                  ? 'bg-[#0B1F3A] dark:bg-blue-600 border-[#0B1F3A] dark:border-blue-600 text-white'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-[#0B1F3A] dark:hover:border-blue-500'
              }`}
            >
              <p
                className={`text-xs font-semibold truncate ${
                  shiftFilter === def.id ? 'text-white' : 'text-slate-900 dark:text-white'
                }`}
              >
                {def.label.replace(' (24/7)', '')}
              </p>
              <p
                className={`font-mono tabular-nums text-xl font-bold mt-1.5 ${
                  shiftFilter === def.id ? 'text-white' : 'text-[#0B1F3A] dark:text-blue-400'
                }`}
              >
                {activeInShift}
              </p>
              <p
                className={`font-mono text-[10px] mt-1 truncate ${
                  shiftFilter === def.id ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                ₹{def.defaultFeeNonFixed} / ₹{def.defaultFeeFixed}
              </p>
            </button>
          );
        })}
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {(
            [
              { id: 'all', label: 'All Plans' },
              { id: 'active', label: 'Active' },
              { id: 'expiring_soon', label: 'Expiring Soon' },
              { id: 'expired', label: 'Expired' },
              { id: 'cancelled', label: 'Cancelled' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-2 ${
                activeTab === t.id
                  ? 'bg-[#0B1F3A] dark:bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              <span>{t.label}</span>
              <span
                className={`font-mono text-[11px] ${
                  activeTab === t.id ? 'text-blue-200' : 'text-slate-400'
                }`}
              >
                {tabCounts[t.id]}
              </span>
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search student or seat..."
            className="w-full min-h-[40px] pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* Memberships Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((r) => (
              <div key={r} className="h-11 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : filteredMemberships.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="font-display text-base font-semibold text-slate-900 dark:text-white">
              {memberships.length === 0
                ? 'No membership contracts created yet'
                : 'No memberships match your current filter'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Create a shift membership plan for any enrolled student to track validity windows, renewals, and monthly billing rates.
            </p>
            {memberships.length === 0 && (
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 text-white text-xs font-semibold hover:bg-[#132E54] cursor-pointer"
              >
                <CalendarPlus className="w-4 h-4" />
                Create First Membership
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3.5 px-5">Student</th>
                  <th className="py-3.5 px-4">Shift & Seat Mode</th>
                  <th className="py-3.5 px-4">Validity Window</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Monthly Fee</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                {filteredMemberships.map((m) => {
                  const def = SHIFT_DEFINITIONS.find((s) => s.id === m.shiftType);
                  const stObj = studentMap.get(m.studentId);
                  return (
                    <tr
                      key={m.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3 min-w-0">
                          <StudentAvatar
                            name={m.studentName}
                            photoUrl={stObj?.profilePhotoUrl}
                            gender={stObj?.gender}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-white truncate">
                              {m.studentName}
                            </p>
                            <p className="font-mono text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              Seat: {m.seatId || 'Unassigned'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                          {def?.label || m.shiftType}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 capitalize mt-0.5">
                          {m.seatMode.replace('_', ' ')} seat
                        </p>
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-xs">
                        <p className="text-slate-800 dark:text-slate-200">
                          {m.startDate} → {m.endDate}
                        </p>
                        {m.daysLeft !== null && m.effectiveStatus !== 'cancelled' && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {m.daysLeft < 0
                              ? `Overdue ${Math.abs(m.daysLeft)} days`
                              : `${m.daysLeft} days remaining`}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-xs font-semibold capitalize ${statusColor(m.effectiveStatus)}`}
                        >
                          {m.effectiveStatus.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                        ₹{m.monthlyFee.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {m.effectiveStatus !== 'cancelled' && (
                            <>
                              <button
                                type="button"
                                onClick={() => openRenewModal(m)}
                                className="inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-[#0B1F3A] dark:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Renew
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleCancel(m)}
                                aria-label={`Cancel membership for ${m.studentName}`}
                                className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                              >
                                <XCircle className="w-4 h-4" />
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

      {/* Create Membership Modal */}
      <AnimatePresence>
        {createOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCreateOpen(false)}
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
                  Create Membership Plan
                </h2>
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  aria-label="Close modal"
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
                {modalError && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
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
                    onChange={(e) => handleStudentChange(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="">Select enrolled student...</option>
                    {students.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.fullName} ({st.registrationNo})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Shift Plan
                    </label>
                    <select
                      value={shiftType}
                      onChange={(e) => {
                        const next = e.target.value as ShiftType;
                        setShiftType(next);
                        setMonthlyFee(getSuggestedFee(next, seatMode));
                      }}
                      className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                    >
                      {SHIFT_DEFINITIONS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Seat Mode
                    </label>
                    <select
                      value={seatMode}
                      onChange={(e) => {
                        const next = e.target.value as 'fixed' | 'non_fixed';
                        setSeatMode(next);
                        setMonthlyFee(getSuggestedFee(shiftType, next));
                      }}
                      className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                    >
                      <option value="non_fixed">Non-Fixed Seat</option>
                      <option value="fixed">Fixed Reserved Seat</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Start Date
                    </label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Expiry Date
                    </label>
                    <input
                      type="date"
                      required
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Monthly Fee (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100000}
                    required
                    value={monthlyFee}
                    onChange={(e) => setMonthlyFee(Number(e.target.value))}
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                  />
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={addFeeToPending}
                    onChange={(e) => setAddFeeToPending(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  Add ₹{monthlyFee.toLocaleString('en-IN')} to student's pending dues balance
                </label>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="min-h-[40px] px-5 py-2 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                  >
                    {submitting ? 'Saving...' : 'Activate Membership'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Renew Membership Modal */}
      <AnimatePresence>
        {renewTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setRenewTarget(null)}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 12 }}
              className="relative z-10 w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-[#0B1F3A] dark:text-white">
                  Renew Membership
                </h2>
                <button
                  type="button"
                  onClick={() => setRenewTarget(null)}
                  aria-label="Close renew modal"
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleRenewSubmit} className="p-6 space-y-4">
                {modalError && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                    {modalError}
                  </div>
                )}

                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Extending <span className="font-semibold text-slate-900 dark:text-white">{renewTarget.studentName}</span> ({renewTarget.shiftType.replace('_', ' ')}). Current expiry: <span className="font-mono">{renewTarget.endDate}</span>.
                </p>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    New Expiry Date
                  </label>
                  <input
                    type="date"
                    required
                    value={renewEndDate}
                    onChange={(e) => setRenewEndDate(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Renewal Monthly Fee (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100000}
                    required
                    value={renewFee}
                    onChange={(e) => setRenewFee(Number(e.target.value))}
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                  />
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={renewAddDue}
                    onChange={(e) => setRenewAddDue(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  Add ₹{renewFee.toLocaleString('en-IN')} renewal charge to pending dues
                </label>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setRenewTarget(null)}
                    className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="min-h-[40px] px-5 py-2 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                  >
                    {submitting ? 'Renewing...' : 'Confirm Renewal'}
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
