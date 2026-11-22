import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, Clock, LogIn, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  computeElapsedMinutes,
  formatDurationMinutes,
} from '../../services/attendanceService';
import { subscribeOwnAttendance } from '../../services/studentPortalService';
import type { AttendanceRecord, AttendanceSource } from '../../types/domain';

const SOURCE_LABELS: Record<AttendanceSource, string> = {
  manual: 'Front Desk',
  smart_door: 'Smart Door',
  simulator: 'Gate Test',
};

function formatTimeStamp(ts?: { toDate: () => Date }): string {
  if (!ts || typeof ts.toDate !== 'function') return '—';
  return ts.toDate().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function StudentAttendancePage() {
  const { firebaseUser, studentProfile, studentAuthMode } = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!firebaseUser && studentAuthMode !== 'password') return;
    const uid = firebaseUser?.uid || studentProfile?.uid || studentProfile?.id || '';
    if (!uid) return;
    const unsub = subscribeOwnAttendance(uid, (data) => {
      setRecords(data);
      setLoading(false);
    });
    return () => unsub();
  }, [firebaseUser, studentProfile, studentAuthMode]);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) {
      if (r.date && r.date.length >= 7) {
        set.add(r.date.slice(0, 7));
      }
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [records]);

  const filteredRecords = useMemo(() => {
    if (monthFilter === 'all') return records;
    return records.filter((r) => r.date.startsWith(monthFilter));
  }, [records, monthFilter]);

  const activeSession = useMemo(() => records.find((r) => r.isInside) || null, [records]);

  const metrics = useMemo(() => {
    let totalMins = 0;
    let completedCount = 0;
    for (const r of filteredRecords) {
      if (r.isInside) {
        const entryMs = r.entryTime?.toMillis ? r.entryTime.toMillis() : nowMs;
        totalMins += computeElapsedMinutes(entryMs, nowMs);
      } else if (typeof r.durationMinutes === 'number') {
        totalMins += r.durationMinutes;
        completedCount += 1;
      }
    }
    const avgMins = completedCount > 0 ? Math.round(totalMins / completedCount) : 0;
    return {
      visits: filteredRecords.length,
      totalMinutes: totalMins,
      avgMinutes: avgMins,
    };
  }, [filteredRecords, nowMs]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Attendance History
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Your personal library check-in, check-out, and study duration log.
        </p>
      </div>

      {/* Live Presence Banner */}
      {activeSession ? (
        <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-800 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <LogIn className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
                You are currently checked in
              </p>
              <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-0.5 font-mono">
                Entered at {formatTimeStamp(activeSession.entryTime)} ({activeSession.date}) ·{' '}
                {SOURCE_LABELS[activeSession.source] || activeSession.source}
              </p>
            </div>
          </div>
          <div className="font-mono text-lg font-bold text-emerald-800 dark:text-emerald-300 tabular-nums">
            {formatDurationMinutes(
              computeElapsedMinutes(
                activeSession.entryTime?.toMillis ? activeSession.entryTime.toMillis() : nowMs,
                nowMs,
              ),
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <LogOut className="w-5 h-5 text-slate-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Currently Outside Library
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {records[0]
                  ? `Last session recorded on ${records[0].date}`
                  : 'No visits recorded yet'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary Metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Visits
          </p>
          <p className="font-mono text-2xl font-bold text-slate-900 dark:text-white mt-1.5 tabular-nums">
            {metrics.visits}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Study Time
          </p>
          <p className="font-mono text-2xl font-bold text-slate-900 dark:text-white mt-1.5 tabular-nums">
            {formatDurationMinutes(metrics.totalMinutes)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Avg Session
          </p>
          <p className="font-mono text-2xl font-bold text-slate-900 dark:text-white mt-1.5 tabular-nums">
            {metrics.avgMinutes > 0 ? formatDurationMinutes(metrics.avgMinutes) : '—'}
          </p>
        </div>
      </div>

      {/* Entry / Exit Log */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarCheck2 className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />
            Entry &amp; Exit Log
          </h2>
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            aria-label="Filter attendance by month"
            className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-800 dark:text-slate-200"
          >
            <option value="all">All Months</option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            Loading attendance history...
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="py-12 px-4 text-center">
            <Clock className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              No attendance logs yet
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Your check-in and check-out records will sync here automatically.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredRecords.map((rec) => {
              const duration = rec.isInside
                ? computeElapsedMinutes(
                    rec.entryTime?.toMillis ? rec.entryTime.toMillis() : nowMs,
                    nowMs,
                  )
                : rec.durationMinutes;

              return (
                <div
                  key={rec.id}
                  className="p-4 sm:px-5 flex items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                        {rec.date}
                      </span>
                      <span className="text-slate-300 dark:text-slate-700">·</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {SOURCE_LABELS[rec.source] || rec.source}
                      </span>
                    </div>
                    <p className="font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                      In: {formatTimeStamp(rec.entryTime)} → Out:{' '}
                      {rec.isInside ? 'Active' : formatTimeStamp(rec.exitTime)}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p
                      className={`font-mono text-sm font-bold tabular-nums ${
                        rec.isInside
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {formatDurationMinutes(duration)}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {rec.isInside ? 'Inside Now' : 'Completed'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
