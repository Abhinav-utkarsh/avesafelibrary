import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  LogIn,
  LogOut,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AnimatedCounter } from '../../components/common/AnimatedCounter';
import { StudentAvatar } from '../../components/common/StudentAvatar';
import { subscribeStudents, getDaysUntilExpiry } from '../../services/studentService';
import {
  checkInStudent,
  checkOutAllInsideRecords,
  checkOutAttendanceRecord,
  computeElapsedMinutes,
  formatDurationMinutes,
  getLocalIsoDate,
  subscribeAttendanceRecords,
} from '../../services/attendanceService';
import {
  SHIFT_DEFINITIONS,
  type AttendanceRecord,
  type AttendanceSource,
  type StudentRecord,
} from '../../types/domain';

type ActiveTab = 'inside' | 'history';

const SOURCE_LABELS: Record<AttendanceSource, string> = {
  manual: 'Manual Desk',
  smart_door: 'Smart Door',
  simulator: 'Hardware Simulator',
};

function formatTimeStamp(ts?: { toDate: () => Date }): string {
  if (!ts || typeof ts.toDate !== 'function') return 'Just now';
  return ts.toDate().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function escapeCsvCell(value: string | number | undefined | null): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function AdminAttendancePage() {
  const { adminProfile } = useAuth();
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<ActiveTab>('inside');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [deskSearch, setDeskSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [dateFilter, setDateFilter] = useState<string>(getLocalIsoDate());
  const [sourceFilter, setSourceFilter] = useState<'all' | AttendanceSource>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'inside' | 'completed'>('all');

  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [bulkCheckoutConfirm, setBulkCheckoutConfirm] = useState(false);
  const [bulkCheckingOut, setBulkCheckingOut] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let studentsLoaded = false;
    let attendanceLoaded = false;
    const markReady = () => {
      if (studentsLoaded && attendanceLoaded) setLoading(false);
    };

    const unsubStudents = subscribeStudents((data) => {
      setStudents(data);
      studentsLoaded = true;
      markReady();
    });

    const unsubAttendance = subscribeAttendanceRecords((data) => {
      setRecords(data);
      attendanceLoaded = true;
      markReady();
    });

    return () => {
      unsubStudents();
      unsubAttendance();
    };
  }, []);

  const studentById = useMemo(() => {
    const map = new Map<string, StudentRecord>();
    for (const s of students) map.set(s.id, s);
    return map;
  }, [students]);

  const insideRecords = useMemo(() => records.filter((r) => r.isInside), [records]);

  const insideStudentIds = useMemo(
    () => new Set(insideRecords.map((r) => r.studentId)),
    [insideRecords],
  );

  const todayIso = getLocalIsoDate();

  const todayRecords = useMemo(
    () => records.filter((r) => r.date === todayIso),
    [records, todayIso],
  );

  const todayCompleted = useMemo(
    () => todayRecords.filter((r) => !r.isInside),
    [todayRecords],
  );

  const avgDurationToday = useMemo(() => {
    const withDuration = todayCompleted.filter((r) => typeof r.durationMinutes === 'number');
    if (withDuration.length === 0) return 0;
    const total = withDuration.reduce((sum, r) => sum + (r.durationMinutes || 0), 0);
    return Math.round(total / withDuration.length);
  }, [todayCompleted]);

  const hallBreakdown = useMemo(() => {
    let hall1 = 0;
    let hall2 = 0;
    let unassigned = 0;
    for (const rec of insideRecords) {
      const stu = studentById.get(rec.studentId);
      if (stu?.hall === 'Hall 1') hall1 += 1;
      else if (stu?.hall === 'Hall 2') hall2 += 1;
      else unassigned += 1;
    }
    return { hall1, hall2, unassigned };
  }, [insideRecords, studentById]);

  const eligibleCheckInStudents = useMemo(() => {
    const q = deskSearch.trim().toLowerCase();
    return students
      .filter((s) => !insideStudentIds.has(s.id) && s.status !== 'suspended' && s.status !== 'inactive')
      .filter((s) => {
        if (!q) return true;
        return (
          s.fullName.toLowerCase().includes(q) ||
          s.registrationNo.toLowerCase().includes(q) ||
          (s.seatId || '').toLowerCase().includes(q) ||
          s.phone.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [students, insideStudentIds, deskSearch]);

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId) || null,
    [students, selectedStudentId],
  );

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return records.filter((rec) => {
      if (dateFilter && rec.date !== dateFilter) return false;
      if (sourceFilter !== 'all' && rec.source !== sourceFilter) return false;
      if (statusFilter === 'inside' && !rec.isInside) return false;
      if (statusFilter === 'completed' && rec.isInside) return false;
      if (q) {
        const stu = studentById.get(rec.studentId);
        const hay = `${rec.studentName} ${stu?.registrationNo || ''} ${stu?.seatId || ''} ${rec.date}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [records, dateFilter, sourceFilter, statusFilter, historySearch, studentById]);

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile || !selectedStudent) return;
    setFeedback(null);
    setSubmittingId(selectedStudent.id);
    try {
      await checkInStudent(selectedStudent, adminProfile, 'manual');
      setFeedback({
        type: 'success',
        message: `${selectedStudent.fullName} (${selectedStudent.registrationNo}) checked in successfully.`,
      });
      setSelectedStudentId('');
      setDeskSearch('');
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to record entry.',
      });
    } finally {
      setSubmittingId(null);
    }
  };

  const handleCheckOut = async (record: AttendanceRecord) => {
    if (!adminProfile) return;
    setFeedback(null);
    setSubmittingId(record.id);
    try {
      await checkOutAttendanceRecord(record, adminProfile);
      setFeedback({
        type: 'success',
        message: `${record.studentName} checked out and session duration saved.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to record exit.',
      });
    } finally {
      setSubmittingId(null);
    }
  };

  const handleBulkCheckout = async () => {
    if (!adminProfile) return;
    setFeedback(null);
    setBulkCheckingOut(true);
    try {
      const count = await checkOutAllInsideRecords(insideRecords, adminProfile);
      setBulkCheckoutConfirm(false);
      setFeedback({
        type: 'success',
        message: `Checked out ${count} student${count === 1 ? '' : 's'} currently inside.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to complete batch check-out.',
      });
    } finally {
      setBulkCheckingOut(false);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Date',
      'Student Name',
      'Registration No',
      'Hall',
      'Seat',
      'Entry Time',
      'Exit Time',
      'Duration (min)',
      'Status',
      'Source',
      'Device ID',
    ];
    const rows = filteredHistory.map((rec) => {
      const stu = studentById.get(rec.studentId);
      const entryIso = rec.entryTime?.toDate ? rec.entryTime.toDate().toISOString() : '';
      const exitIso = rec.exitTime?.toDate ? rec.exitTime.toDate().toISOString() : '';
      return [
        rec.date,
        rec.studentName,
        stu?.registrationNo || '',
        stu?.hall || '',
        stu?.seatId || 'Unseated',
        entryIso,
        exitIso,
        rec.isInside ? '' : rec.durationMinutes ?? '',
        rec.isInside ? 'Inside' : 'Checked Out',
        SOURCE_LABELS[rec.source] || rec.source,
        rec.deviceId || '',
      ].map(escapeCsvCell);
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `av_esafe-attendance-${dateFilter || 'all'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const insideRatio = Math.min(100, Math.round((insideRecords.length / 120) * 100));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Attendance &amp; Live Inside Monitor
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Real-time hall occupancy across 120 seats, desk check-in/out controls, and unified entry/exit history.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredHistory.length === 0}
            className="inline-flex items-center gap-2 px-4 min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>Currently Inside</span>
            <Users className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
              <AnimatedCounter value={insideRecords.length} />
            </span>
            <span className="font-mono text-sm text-slate-500 dark:text-slate-400">/ 120 seats</span>
          </div>
          <div className="mt-3">
            <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-[#0B1F3A] dark:bg-sky-400 transition-all duration-300"
                style={{ width: `${insideRatio}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 font-mono tabular-nums">
              Hall 1: {hallBreakdown.hall1}/80 · Hall 2: {hallBreakdown.hall2}/40
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>Today&apos;s Entries</span>
            <LogIn className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-3 font-mono text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
            <AnimatedCounter value={todayRecords.length} />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Recorded on {todayIso}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>Completed Visits Today</span>
            <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="mt-3 font-mono text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
            <AnimatedCounter value={todayCompleted.length} />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Entry and exit paired
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>Avg Session Today</span>
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-3 font-mono text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
            {avgDurationToday > 0 ? formatDurationMinutes(avgDurationToday) : '0m'}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Across completed visits today
          </p>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span className="flex-1">{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-medium underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Quick Desk Check-In Panel */}
      <form
        onSubmit={handleCheckIn}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Front Desk Manual Check-In
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Duplicate-entry protection prevents checking in a student who is already marked inside.
            </p>
          </div>
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
            {eligibleCheckInStudents.length} eligible outside
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-4 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={deskSearch}
              onChange={(e) => setDeskSearch(e.target.value)}
              placeholder="Filter student by name, reg no, seat..."
              className="w-full min-h-[44px] pl-10 pr-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]/20 dark:focus:ring-sky-400/20"
            />
          </div>

          <div className="md:col-span-5">
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              aria-label="Select student to check in"
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]/20 dark:focus:ring-sky-400/20"
            >
              <option value="">Select student to check in...</option>
              {eligibleCheckInStudents.map((stu) => {
                const shift = SHIFT_DEFINITIONS.find((sh) => sh.id === stu.shiftType)?.label || stu.shiftType;
                return (
                  <option key={stu.id} value={stu.id}>
                    {stu.fullName} ({stu.registrationNo}) · {stu.seatId || 'Unseated'} · {shift}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={!selectedStudent || submittingId !== null}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 rounded-xl bg-[#0B1F3A] hover:bg-[#143058] dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              {submittingId === selectedStudent?.id ? 'Checking In...' : 'Record Entry'}
            </button>
          </div>
        </div>

        {/* Selected Student Context Strip */}
        {selectedStudent && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-600 dark:text-slate-300">
            <div className="flex items-center gap-2.5">
              <StudentAvatar
                name={selectedStudent.fullName}
                gender={selectedStudent.gender}
                photoUrl={selectedStudent.profilePhotoUrl}
                size="xs"
              />
              <span className="font-semibold text-slate-900 dark:text-white">
                {selectedStudent.fullName}
              </span>
            </div>
            <span>
              <strong className="text-slate-900 dark:text-white">Hall/Seat:</strong>{' '}
              {selectedStudent.hall} · {selectedStudent.seatId || 'Unseated'}
            </span>
            <span>
              <strong className="text-slate-900 dark:text-white">Shift:</strong>{' '}
              {SHIFT_DEFINITIONS.find((s) => s.id === selectedStudent.shiftType)?.label ||
                selectedStudent.shiftType}
            </span>
            <span>
              <strong className="text-slate-900 dark:text-white">Status:</strong>{' '}
              <span className="capitalize">{selectedStudent.status}</span>
            </span>
            {selectedStudent.pendingAmount > 0 && (
              <span className="text-amber-700 dark:text-amber-300 font-medium">
                Pending Fee: ₹{selectedStudent.pendingAmount.toLocaleString('en-IN')}
              </span>
            )}
            {(() => {
              const days = getDaysUntilExpiry(selectedStudent.membershipExpiry);
              if (days !== null && days < 0) {
                return (
                  <span className="text-rose-600 dark:text-rose-400 font-medium">
                    Membership expired {Math.abs(days)}d ago ({selectedStudent.membershipExpiry})
                  </span>
                );
              }
              if (days !== null && days <= 5) {
                return (
                  <span className="text-amber-700 dark:text-amber-300 font-medium">
                    Expires in {days}d ({selectedStudent.membershipExpiry})
                  </span>
                );
              }
              return null;
            })()}
          </div>
        )}
      </form>

      {/* Main Tab Switcher */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 pt-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setActiveTab('inside')}
              className={`pb-3.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'inside'
                  ? 'border-[#0B1F3A] dark:border-sky-400 text-[#0B1F3A] dark:text-sky-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Currently Inside ({insideRecords.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`pb-3.5 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'history'
                  ? 'border-[#0B1F3A] dark:border-sky-400 text-[#0B1F3A] dark:text-sky-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Entry &amp; Exit Ledger ({records.length})
            </button>
          </div>

          {activeTab === 'inside' && insideRecords.length > 0 && (
            <div className="pb-3 flex items-center gap-2">
              {bulkCheckoutConfirm ? (
                <>
                  <span className="text-xs text-slate-600 dark:text-slate-300">
                    Check out all {insideRecords.length} inside?
                  </span>
                  <button
                    type="button"
                    onClick={handleBulkCheckout}
                    disabled={bulkCheckingOut}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {bulkCheckingOut ? 'Processing...' : 'Confirm All Exit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkCheckoutConfirm(false)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setBulkCheckoutConfirm(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Check Out All
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tab 1: Currently Inside */}
        {activeTab === 'inside' && (
          <div className="p-5">
            {loading ? (
              <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                Loading live inside roster...
              </div>
            ) : insideRecords.length === 0 ? (
              <div className="py-12 text-center">
                <Users className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  No students currently marked inside
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Use the Front Desk Check-In bar above to record arrivals or wait for Smart Door sync.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="py-3 pr-4">Student</th>
                      <th className="py-3 px-4">Hall &amp; Seat</th>
                      <th className="py-3 px-4">Shift</th>
                      <th className="py-3 px-4">Entry Time</th>
                      <th className="py-3 px-4">Elapsed</th>
                      <th className="py-3 px-4">Source</th>
                      <th className="py-3 pl-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                    {insideRecords.map((rec) => {
                      const stu = studentById.get(rec.studentId);
                      const entryMs = rec.entryTime?.toMillis ? rec.entryTime.toMillis() : nowMs;
                      const elapsed = computeElapsedMinutes(entryMs, nowMs);
                      const shiftLabel = stu
                        ? SHIFT_DEFINITIONS.find((s) => s.id === stu.shiftType)?.label || stu.shiftType
                        : '—';

                      return (
                        <tr
                          key={rec.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3.5 pr-4">
                            <div className="flex items-center gap-3">
                              <StudentAvatar
                                name={rec.studentName}
                                gender={stu?.gender}
                                photoUrl={stu?.profilePhotoUrl}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <p className="font-medium text-slate-900 dark:text-white truncate">
                                  {rec.studentName}
                                </p>
                                <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                                  {stu?.registrationNo || rec.studentId.slice(0, 10)}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                            <span className="font-medium">{stu?.hall || 'Unassigned'}</span>
                            <span className="text-slate-400 mx-1.5">·</span>
                            <span className="font-mono text-xs">{stu?.seatId || 'Unseated'}</span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 text-xs">
                            {shiftLabel}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums">
                            {formatTimeStamp(rec.entryTime)}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                            {formatDurationMinutes(elapsed)}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-400">
                            {SOURCE_LABELS[rec.source] || rec.source}
                          </td>
                          <td className="py-3.5 pl-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleCheckOut(rec)}
                              disabled={submittingId === rec.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                              {submittingId === rec.id ? 'Saving...' : 'Mark Exit'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Entry & Exit Ledger */}
        {activeTab === 'history' && (
          <div className="p-5 space-y-4">
            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search student or seat..."
                  className="w-full min-h-[40px] pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  aria-label="Filter by date"
                  className="flex-1 min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100"
                />
                {dateFilter && (
                  <button
                    type="button"
                    onClick={() => setDateFilter('')}
                    className="px-2.5 min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    All Dates
                  </button>
                )}
              </div>

              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as 'all' | AttendanceSource)}
                aria-label="Filter by attendance source"
                className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="all">All Sources</option>
                <option value="manual">Manual Desk</option>
                <option value="smart_door">Smart Door</option>
                <option value="simulator">Hardware Simulator</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'inside' | 'completed')}
                aria-label="Filter by session status"
                className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="all">All Sessions</option>
                <option value="inside">Currently Inside</option>
                <option value="completed">Checked Out</option>
              </select>
            </div>

            {loading ? (
              <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                Loading attendance ledger...
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  No attendance entries match the selected filters
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Try clearing the date filter or switching to All Dates.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="py-3 pr-4">Date</th>
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-4">Entry</th>
                      <th className="py-3 px-4">Exit</th>
                      <th className="py-3 px-4">Duration</th>
                      <th className="py-3 px-4">Source</th>
                      <th className="py-3 pl-4 text-right">State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                    {filteredHistory.map((rec) => {
                      const stu = studentById.get(rec.studentId);
                      return (
                        <tr
                          key={rec.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3 pr-4 font-mono text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                            {rec.date}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <StudentAvatar
                                name={rec.studentName}
                                gender={stu?.gender}
                                photoUrl={stu?.profilePhotoUrl}
                                size="xs"
                              />
                              <div className="min-w-0">
                                <p className="font-medium text-slate-900 dark:text-white truncate">
                                  {rec.studentName}
                                </p>
                                <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                                  {stu?.registrationNo || '—'} · {stu?.seatId || 'Unseated'}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums">
                            {formatTimeStamp(rec.entryTime)}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums">
                            {rec.isInside ? '—' : formatTimeStamp(rec.exitTime)}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums">
                            {rec.isInside
                              ? formatDurationMinutes(
                                  computeElapsedMinutes(
                                    rec.entryTime?.toMillis ? rec.entryTime.toMillis() : nowMs,
                                    nowMs,
                                  ),
                                )
                              : formatDurationMinutes(rec.durationMinutes)}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">
                            {SOURCE_LABELS[rec.source] || rec.source}
                          </td>
                          <td className="py-3 pl-4 text-right">
                            {rec.isInside ? (
                              <button
                                type="button"
                                onClick={() => handleCheckOut(rec)}
                                disabled={submittingId === rec.id}
                                className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                              >
                                Inside · Mark Exit
                              </button>
                            ) : (
                              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                Checked Out
                              </span>
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
        )}
      </div>
    </div>
  );
}
