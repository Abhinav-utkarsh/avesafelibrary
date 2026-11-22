import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Lock,
  RefreshCw,
  Unlock,
  UserCheck,
  UserMinus,
  Wrench,
} from 'lucide-react';
import {
  SHIFT_DEFINITIONS,
  type BaseShiftSlot,
  type SeatRecord,
  type ShiftType,
  type StudentRecord,
} from '../../types/domain';
import {
  assignSeatTransaction,
  BASE_SHIFT_SLOTS,
  DOUBLE_SHIFT_PRESETS,
  initializeLibrarySeats,
  releaseSeatTransaction,
  subscribeSeats,
  toggleSeatMaintenanceTransaction,
  toggleSeatTypeTransaction,
} from '../../services/seatService';
import { subscribeStudents } from '../../services/studentService';
import { useAuth } from '../../context/AuthContext';
import { AnimatedCounter } from '../../components/common/AnimatedCounter';
import { StudentAvatar } from '../../components/common/StudentAvatar';

export function AdminSeatMapPage() {
  const { adminProfile } = useAuth();

  const [seats, setSeats] = useState<SeatRecord[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);

  const [activeHall, setActiveHall] = useState<'Hall 1' | 'Hall 2'>('Hall 1');
  const [seatTypeFilter, setSeatTypeFilter] = useState<'all' | 'fixed' | 'non_fixed'>('all');
  const [shiftLens, setShiftLens] = useState<'all' | BaseShiftSlot>('all');
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);

  // Assignment form state
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [assignSeatMode, setAssignSeatMode] = useState<'fixed' | 'non_fixed'>('fixed');
  const [assignShiftType, setAssignShiftType] = useState<ShiftType>('morning');
  const [doublePresetId, setDoublePresetId] = useState('morning_noon');

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const unsubSeats = subscribeSeats((list) => {
      setSeats(list);
      setLoading(false);
    });
    const unsubStudents = subscribeStudents(setStudents);
    return () => {
      unsubSeats();
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

  const selectedSeat = useMemo(() => {
    if (!selectedSeatId) return null;
    return seats.find((s) => s.id === selectedSeatId) || null;
  }, [seats, selectedSeatId]);

  useEffect(() => {
    if (!selectedSeat) return;
    setActionError(null);
    setAssignSeatMode(selectedSeat.seatType);
  }, [selectedSeatId, selectedSeat?.seatType]);

  const handleStudentSelect = (studentId: string) => {
    setSelectedStudentId(studentId);
    const st = students.find((s) => s.id === studentId);
    if (st) {
      setAssignShiftType(st.shiftType);
      if (st.seatMode === 'fixed' || st.seatMode === 'non_fixed') {
        setAssignSeatMode(st.seatMode);
      }
    }
  };

  const unseatedStudents = useMemo(
    () =>
      students.filter(
        (s) =>
          (s.status === 'active' || s.status === 'demo') &&
          (s.seatMode === 'unseated' || !s.seatId),
      ),
    [students],
  );

  const seatedStudents = useMemo(
    () =>
      students.filter(
        (s) =>
          (s.status === 'active' || s.status === 'demo') &&
          Boolean(s.seatId) &&
          s.seatMode !== 'unseated',
      ),
    [students],
  );

  const stats = useMemo(() => {
    const total = seats.length;
    const available = seats.filter((s) => s.status === 'available').length;
    const partial = seats.filter((s) => s.status === 'partial').length;
    const occupied = seats.filter((s) => s.status === 'occupied').length;
    const maintenance = seats.filter((s) => s.status === 'maintenance').length;
    const hall1Occupied = seats.filter(
      (s) => s.hall === 'Hall 1' && (s.status === 'occupied' || s.status === 'partial'),
    ).length;
    const hall2Occupied = seats.filter(
      (s) => s.hall === 'Hall 2' && (s.status === 'occupied' || s.status === 'partial'),
    ).length;

    return {
      total,
      available,
      partial,
      occupied,
      maintenance,
      hall1Occupied,
      hall2Occupied,
    };
  }, [seats]);

  const hallSeatsByRow = useMemo(() => {
    const filtered = seats.filter((s) => {
      if (s.hall !== activeHall) return false;
      if (seatTypeFilter !== 'all' && s.seatType !== seatTypeFilter) return false;
      return true;
    });

    const grouped = new Map<string, SeatRecord[]>();
    for (const seat of filtered) {
      const existing = grouped.get(seat.rowLabel) || [];
      existing.push(seat);
      grouped.set(seat.rowLabel, existing);
    }
    return Array.from(grouped.entries());
  }, [seats, activeHall, seatTypeFilter]);

  const handleInitializeSeats = async () => {
    if (!adminProfile) return;
    setInitializing(true);
    setActionError(null);
    try {
      const res = await initializeLibrarySeats(adminProfile);
      setToast(
        res.createdCount > 0
          ? `Initialized ${res.createdCount} seats across Hall 1 (80) and Hall 2 (40).`
          : 'All 120 library seats are already initialized.',
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to initialize seats.');
    } finally {
      setInitializing(false);
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile || !selectedSeat) return;
    if (!selectedStudentId) {
      setActionError('Please select a student to assign to this seat.');
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      const result = await assignSeatTransaction(
        {
          seatId: selectedSeat.id,
          studentId: selectedStudentId,
          seatMode: assignSeatMode,
          shiftType: assignShiftType,
          doublePresetId,
        },
        adminProfile,
      );
      setToast(
        result.transferredFrom
          ? `Transferred ${result.studentName} from ${result.transferredFrom} to ${result.seatCode}.`
          : `Assigned ${result.studentName} to seat ${result.seatCode}.`,
      );
      setSelectedStudentId('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Seat assignment failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleReleaseOccupant = async (seatId: string, studentId: string) => {
    if (!adminProfile) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await releaseSeatTransaction(seatId, studentId, adminProfile);
      setToast(`Released ${res.studentName} from seat ${seatId}.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to release seat.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleMaintenance = async () => {
    if (!adminProfile || !selectedSeat) return;
    setBusy(true);
    setActionError(null);
    const nextState = selectedSeat.status !== 'maintenance';
    try {
      await toggleSeatMaintenanceTransaction(selectedSeat.id, nextState, adminProfile);
      setToast(
        nextState
          ? `Locked seat ${selectedSeat.seatCode} for maintenance.`
          : `Restored seat ${selectedSeat.seatCode} to available.`,
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to update maintenance state.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleSeatType = async (nextType: 'fixed' | 'non_fixed') => {
    if (!adminProfile || !selectedSeat || selectedSeat.seatType === nextType) return;
    setBusy(true);
    setActionError(null);
    try {
      await toggleSeatTypeTransaction(selectedSeat.id, nextType, adminProfile);
      setToast(`Switched ${selectedSeat.seatCode} to ${nextType.replace('_', ' ')} mode.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to switch seat mode.');
    } finally {
      setBusy(false);
    }
  };

  function getSeatVisualState(seat: SeatRecord): {
    tileClass: string;
    lensLabel?: string;
  } {
    const isSelected = seat.id === selectedSeatId;
    const ring = isSelected ? 'ring-2 ring-blue-600 ring-offset-2 dark:ring-offset-slate-950' : '';

    if (seat.status === 'maintenance') {
      return {
        tileClass: `bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 ${ring}`,
        lensLabel: 'MNT',
      };
    }

    // Shift lens mode highlights whether this exact shift slot is free or taken
    if (shiftLens !== 'all') {
      const slotTaken =
        (seat.seatType === 'fixed' && Boolean(seat.assignedStudentId)) ||
        Boolean(seat.shiftSlots?.[shiftLens]);
      if (slotTaken) {
        return {
          tileClass: `bg-[#0B1F3A] dark:bg-blue-900/80 border-[#0B1F3A] dark:border-blue-700 text-white ${ring}`,
          lensLabel: 'Busy',
        };
      }
      return {
        tileClass: `bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 ${ring}`,
        lensLabel: 'Open',
      };
    }

    if (seat.status === 'occupied') {
      return {
        tileClass: `bg-[#0B1F3A] dark:bg-blue-700 border-[#0B1F3A] dark:border-blue-600 text-white ${ring}`,
      };
    }
    if (seat.status === 'partial') {
      return {
        tileClass: `bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-200 ${ring}`,
      };
    }
    return {
      tileClass: `bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-[#0B1F3A] dark:hover:border-blue-500 ${ring}`,
    };
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Transactional Seat Allocation · Hall 1 (80) & Hall 2 (40)
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0B1F3A] dark:text-white mt-1">
            Interactive 120-Seat Map
          </h1>
        </div>

        {seats.length < 120 && !loading && (
          <button
            type="button"
            disabled={initializing}
            onClick={() => void handleInitializeSeats()}
            className="inline-flex items-center gap-2 min-h-[42px] px-4 py-2 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] dark:hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            <Building2 className="w-4 h-4" />
            {initializing ? 'Initializing 120 Seats...' : 'Initialize 120 Library Seats'}
          </button>
        )}
      </div>

      {toast && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Configured Seats</p>
          <p className="text-2xl font-bold text-[#0B1F3A] dark:text-white mt-1">
            <AnimatedCounter value={stats.total} suffix=" / 120" />
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Available</p>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">
            <AnimatedCounter value={stats.available} />
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Shared (Partial)</p>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 mt-1">
            <AnimatedCounter value={stats.partial} />
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Full / Fixed</p>
          <p className="text-2xl font-bold text-[#0B1F3A] dark:text-blue-400 mt-1">
            <AnimatedCounter value={stats.occupied} />
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Maintenance</p>
          <p className="text-2xl font-bold text-slate-600 dark:text-slate-300 mt-1">
            <AnimatedCounter value={stats.maintenance} />
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Unseated Queue</p>
          <p className="text-2xl font-bold text-[#0B1F3A] dark:text-white mt-1">
            <AnimatedCounter value={unseatedStudents.length} />
          </p>
        </div>
      </div>

      {/* Empty Setup State if seats have not been initialized yet */}
      {!loading && seats.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-4">
          <Building2 className="w-8 h-8 text-[#0B1F3A] dark:text-blue-400 mx-auto" />
          <div className="space-y-1">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Initialize Av_eSAFE Library Seat Layout
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
              Generate all 120 physical study desks in Cloud Firestore — Hall 1 (H1-01 to H1-80) and Hall 2 (H2-01 to H2-40) — split evenly between Fixed and Non-Fixed seats (changeable anytime).
            </p>
          </div>
          <button
            type="button"
            disabled={initializing}
            onClick={() => void handleInitializeSeats()}
            className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${initializing ? 'animate-spin' : ''}`} />
            {initializing ? 'Creating 120 Seats...' : 'Create 120 Seats in Firestore'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left 8 Columns: Hall Map & Controls */}
          <div className="xl:col-span-8 space-y-4">
            {/* Toolbar: Hall Switcher + Shift Availability Lens + Seat Type */}
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                {(
                  [
                    { id: 'Hall 1', label: `Hall 1 (${stats.hall1Occupied}/80)` },
                    { id: 'Hall 2', label: `Hall 2 (${stats.hall2Occupied}/40)` },
                  ] as const
                ).map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setActiveHall(h.id)}
                    className={`relative min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      activeHall === h.id
                        ? 'text-[#0B1F3A] dark:text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {activeHall === h.id && (
                      <motion.span
                        layoutId="seatmap-hall-tab"
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                        className="absolute inset-0 rounded-lg bg-white dark:bg-slate-900 shadow-xs"
                      />
                    )}
                    <span className="relative z-10">{h.label}</span>
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filter seat mode"
                  value={seatTypeFilter}
                  onChange={(e) =>
                    setSeatTypeFilter(e.target.value as 'all' | 'fixed' | 'non_fixed')
                  }
                  className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="all">All Seat Types</option>
                  <option value="fixed">Fixed Seats Only</option>
                  <option value="non_fixed">Non-Fixed Seats Only</option>
                </select>

                <select
                  aria-label="Check availability for shift"
                  value={shiftLens}
                  onChange={(e) => setShiftLens(e.target.value as 'all' | BaseShiftSlot)}
                  className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="all">Overview: All Shifts</option>
                  {BASE_SHIFT_SLOTS.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      Shift Lens: {slot.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Accessible Legend (No hue-only signaling) */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-slate-600 dark:text-slate-400">
              <span>Legend:</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700" />
                Available
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-amber-100 dark:bg-amber-950 border border-amber-400" />
                Partial (Shared Shifts)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-[#0B1F3A] dark:bg-blue-700" />
                Full / Fixed Occupied
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-slate-300 dark:bg-slate-700" />
                Maintenance
              </span>
              <span className="font-mono text-[11px] text-slate-500">
                F = Fixed · NF = Non-Fixed · Bars = M/N/E/Nt
              </span>
            </div>

            {/* Visual Seat Grid by Row */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
              {loading ? (
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                  {Array.from({ length: 40 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="h-14 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse"
                    />
                  ))}
                </div>
              ) : (
                hallSeatsByRow.map(([rowLabel, rowSeats]) => (
                  <div key={rowLabel} className="space-y-2">
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {rowLabel}
                    </p>
                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-10 gap-2">
                      {rowSeats.map((seat) => {
                        const { tileClass, lensLabel } = getSeatVisualState(seat);
                        return (
                          <motion.button
                            key={seat.id}
                            type="button"
                            whileHover={{ y: -2, scale: 1.03 }}
                            whileTap={{ scale: 0.96 }}
                            transition={{ duration: 0.14 }}
                            onClick={() => setSelectedSeatId(seat.id)}
                            title={`${seat.seatCode} · ${seat.seatType.replace('_', ' ')} · ${seat.status}`}
                            className={`p-2 rounded-xl border text-left transition-colors cursor-pointer flex flex-col justify-between min-h-[60px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${tileClass}`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono text-[11px] font-bold leading-none">
                                {seat.seatCode.split('-')[1]}
                              </span>
                              <span className="font-mono text-[9px] opacity-80 leading-none">
                                {lensLabel || (seat.seatType === 'fixed' ? 'F' : 'NF')}
                              </span>
                            </div>

                            {/* 4-Shift Occupancy Micro-Bars */}
                            <div className="grid grid-cols-4 gap-0.5 mt-2" aria-hidden="true">
                              {BASE_SHIFT_SLOTS.map((slot) => {
                                const filled =
                                  seat.status === 'maintenance'
                                    ? false
                                    : seat.seatType === 'fixed'
                                      ? Boolean(seat.assignedStudentId)
                                      : Boolean(seat.shiftSlots?.[slot.id]);
                                return (
                                  <span
                                    key={slot.id}
                                    className={`h-1.5 rounded-xs ${
                                      filled
                                        ? seat.status === 'occupied'
                                          ? 'bg-sky-300'
                                          : 'bg-[#0B1F3A] dark:bg-sky-400'
                                        : 'bg-current opacity-15'
                                    }`}
                                  />
                                );
                              })}
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right 4 Columns: Seat Inspector & Transactional Assignment Panel */}
          <div className="xl:col-span-4 xl:sticky xl:top-20 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5">
            {!selectedSeat ? (
              <div className="py-10 text-center space-y-2">
                <Building2 className="w-7 h-7 text-slate-400 mx-auto" />
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Select a Seat to Inspect
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Click any desk tile in Hall 1 or Hall 2 to view shift occupants, toggle Fixed/Non-Fixed mode, lock maintenance, or assign/transfer a student transactionally.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {selectedSeat.hall} · {selectedSeat.rowLabel}
                    </p>
                    <h2 className="font-display font-mono text-2xl font-bold text-[#0B1F3A] dark:text-white mt-0.5">
                      {selectedSeat.seatCode}
                    </h2>
                    <p className="text-xs text-slate-600 dark:text-slate-300 capitalize mt-1">
                      Mode: {selectedSeat.seatType.replace('_', ' ')} · Status: {selectedSeat.status}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleToggleMaintenance()}
                    className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      selectedSeat.status === 'maintenance'
                        ? 'border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    {selectedSeat.status === 'maintenance' ? 'Restore' : 'Maintenance'}
                  </button>
                </div>

                {actionError && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-start gap-2"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{actionError}</span>
                  </div>
                )}

                {/* Seat Mode Switch (when vacant) */}
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Seat Mode Configuration
                  </span>
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleToggleSeatType('fixed')}
                      className={`min-h-[36px] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        selectedSeat.seatType === 'fixed'
                          ? 'bg-white dark:bg-slate-900 text-[#0B1F3A] dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Fixed (24/7)
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleToggleSeatType('non_fixed')}
                      className={`min-h-[36px] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        selectedSeat.seatType === 'non_fixed'
                          ? 'bg-white dark:bg-slate-900 text-[#0B1F3A] dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      Non-Fixed (Shared)
                    </button>
                  </div>
                </div>

                {/* Current Occupant(s) */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Current Occupants
                  </p>

                  {selectedSeat.seatType === 'fixed' ? (
                    selectedSeat.assignedStudentId ? (
                      (() => {
                        const occStudent = studentMap.get(selectedSeat.assignedStudentId);
                        return (
                          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <StudentAvatar
                                name={selectedSeat.assignedStudentName || 'Student'}
                                photoUrl={occStudent?.profilePhotoUrl}
                                gender={occStudent?.gender}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                  {selectedSeat.assignedStudentName}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  Fixed Exclusive Reservation (All Shifts)
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void handleReleaseOccupant(
                                  selectedSeat.id,
                                  selectedSeat.assignedStudentId!,
                                )
                              }
                              className="inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer shrink-0"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                              Release
                            </button>
                          </div>
                        );
                      })()
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                        Seat is currently vacant and ready for Fixed assignment.
                      </p>
                    )
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                      {BASE_SHIFT_SLOTS.map((slot) => {
                        const occupant = selectedSeat.shiftSlots?.[slot.id];
                        const occStudent = occupant ? studentMap.get(occupant.studentId) : undefined;
                        return (
                          <div
                            key={slot.id}
                            className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs bg-white dark:bg-slate-900"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {occupant && (
                                <StudentAvatar
                                  name={occupant.studentName}
                                  photoUrl={occStudent?.profilePhotoUrl}
                                  gender={occStudent?.gender}
                                  size="xs"
                                />
                              )}
                              <div className="min-w-0">
                                <span className="font-semibold text-slate-800 dark:text-slate-200">
                                  {slot.label}
                                </span>
                                <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  {occupant
                                    ? `${occupant.studentName} (${occupant.shiftType.replace('_', ' ')})`
                                    : 'Available'}
                                </span>
                              </div>
                            </div>
                            {occupant && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void handleReleaseOccupant(selectedSeat.id, occupant.studentId)
                                }
                                className="min-h-[30px] px-2 py-1 rounded-lg text-[11px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer shrink-0"
                              >
                                Release
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Transactional Assign / Transfer Form */}
                {selectedSeat.status !== 'maintenance' && (
                  <form
                    onSubmit={handleAssignSubmit}
                    className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3.5"
                  >
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      Assign or Transfer Student
                    </p>

                    <div>
                      <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                        Select Student
                      </label>
                      <select
                        value={selectedStudentId}
                        onChange={(e) => handleStudentSelect(e.target.value)}
                        className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      >
                        <option value="">Choose a student...</option>
                        {unseatedStudents.length > 0 && (
                          <optgroup label={`Unseated Students (${unseatedStudents.length})`}>
                            {unseatedStudents.map((st) => (
                              <option key={st.id} value={st.id}>
                                {st.fullName} ({st.registrationNo} · {st.shiftType})
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {seatedStudents.length > 0 && (
                          <optgroup label={`Transfer Currently Seated (${seatedStudents.length})`}>
                            {seatedStudents.map((st) => (
                              <option key={st.id} value={st.id}>
                                {st.fullName} (Currently {st.seatId})
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                          Assign As
                        </label>
                        <select
                          value={assignSeatMode}
                          onChange={(e) =>
                            setAssignSeatMode(e.target.value as 'fixed' | 'non_fixed')
                          }
                          className="w-full min-h-[40px] px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                        >
                          <option value="fixed">Fixed Seat</option>
                          <option value="non_fixed">Non-Fixed Seat</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                          Shift Plan
                        </label>
                        <select
                          value={assignShiftType}
                          onChange={(e) => setAssignShiftType(e.target.value as ShiftType)}
                          className="w-full min-h-[40px] px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                        >
                          {SHIFT_DEFINITIONS.map((def) => (
                            <option key={def.id} value={def.id}>
                              {def.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {assignSeatMode === 'non_fixed' && assignShiftType === 'double' && (
                      <div>
                        <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                          Double Shift Slot Pair
                        </label>
                        <select
                          value={doublePresetId}
                          onChange={(e) => setDoublePresetId(e.target.value)}
                          className="w-full min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                        >
                          {DOUBLE_SHIFT_PRESETS.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={busy || !selectedStudentId}
                      className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-[#0B1F3A] dark:bg-blue-600 hover:bg-[#132E54] dark:hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <UserCheck className="w-4 h-4" />
                      {busy ? 'Running Transaction...' : `Assign to ${selectedSeat.seatCode}`}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
