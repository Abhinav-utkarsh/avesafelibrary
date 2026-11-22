import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  DoorClosed,
  DoorOpen,
  Download,
  Fingerprint,
  KeyRound,
  Lock,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Trash2,
  Unlock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { subscribeStudents } from '../../services/studentService';
import {
  checkInStudent,
  checkOutAttendanceRecord,
  subscribeAttendanceRecords,
} from '../../services/attendanceService';
import { subscribeLibrarySettings } from '../../services/adminSettingsService';
import {
  authorizeSimulatorScan,
  deleteIoTDevice,
  fetchIoTDiagnostics,
  recordAccessLogEntry,
  registerIoTDevice,
  runServerHmacSelfTest,
  subscribeAccessLogs,
  subscribeIoTDevices,
  updateIoTDevice,
  type HmacSelfTestResponse,
  type IoTDiagnosticsResponse,
  type SimulatorAuthorizationResponse,
} from '../../services/iotService';
import {
  SHIFT_DEFINITIONS,
  type AccessLogRecord,
  type AttendanceRecord,
  type IoTDeviceMode,
  type IoTDeviceRecord,
  type IoTDeviceStatus,
  type LibrarySettings,
  type StudentRecord,
} from '../../types/domain';

type DoorTab = 'simulator' | 'devices' | 'logs' | 'protocol';

function formatTimestamp(ts?: { toDate: () => Date }): string {
  if (!ts || typeof ts.toDate !== 'function') return 'Just now';
  return ts.toDate().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
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

export function AdminSmartDoorPage() {
  const { adminProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<DoorTab>('simulator');

  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [settings, setSettings] = useState<LibrarySettings | null>(null);
  const [devices, setDevices] = useState<IoTDeviceRecord[]>([]);
  const [accessLogs, setAccessLogs] = useState<AccessLogRecord[]>([]);
  const [diagnostics, setDiagnostics] = useState<IoTDiagnosticsResponse | null>(null);

  // Simulator controls
  const [simDeviceCode, setSimDeviceCode] = useState('SIM-GATE-01');
  const [simStudentId, setSimStudentId] = useState<string>('');
  const [simDirection, setSimDirection] = useState<'entry' | 'exit'>('entry');
  const [simTimeOverride, setSimTimeOverride] = useState<string>('');
  const [simAntiPassback, setSimAntiPassback] = useState(true);
  const [simSyncAttendance, setSimSyncAttendance] = useState(true);
  const [simRunning, setSimRunning] = useState(false);
  const [simOutput, setSimOutput] = useState<SimulatorAuthorizationResponse | null>(null);

  // HMAC Self-Test state
  const [hmacTesting, setHmacTesting] = useState(false);
  const [hmacReport, setHmacReport] = useState<HmacSelfTestResponse | null>(null);

  // Device Registration Form
  const [devCode, setDevCode] = useState('');
  const [devName, setDevName] = useState('');
  const [devLocation, setDevLocation] = useState('Main Entrance · Hall 1');
  const [devMode, setDevMode] = useState<IoTDeviceMode>('simulator');
  const [devAntiPassback, setDevAntiPassback] = useState(true);
  const [addingDevice, setAddingDevice] = useState(false);
  const [confirmDeleteDeviceId, setConfirmDeleteDeviceId] = useState<string | null>(null);

  // Access log filters
  const [logSearch, setLogSearch] = useState('');
  const [logModeFilter, setLogModeFilter] = useState<'all' | IoTDeviceMode>('all');
  const [logDecisionFilter, setLogDecisionFilter] = useState<'all' | 'GRANTED' | 'DENIED'>('all');

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  useEffect(() => {
    const u1 = subscribeStudents(setStudents);
    const u2 = subscribeAttendanceRecords(setAttendance);
    const u3 = subscribeLibrarySettings(setSettings);
    const u4 = subscribeIoTDevices(setDevices);
    const u5 = subscribeAccessLogs(setAccessLogs, 150);

    fetchIoTDiagnostics()
      .then(setDiagnostics)
      .catch(() => {
        // Ignore transient diagnostics fetch error
      });

    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
    };
  }, []);

  const simulatorDevices = useMemo(
    () => devices.filter((d) => d.mode === 'simulator'),
    [devices],
  );

  const selectedSimStudent = useMemo(
    () => students.find((s) => s.id === simStudentId) || null,
    [students, simStudentId],
  );

  const activeAttendanceForSelected = useMemo(() => {
    if (!selectedSimStudent) return null;
    return attendance.find((a) => a.studentId === selectedSimStudent.id && a.isInside) || null;
  }, [attendance, selectedSimStudent]);

  const minutesSinceLastEventForSelected = useMemo(() => {
    if (!selectedSimStudent) return null;
    const latest = accessLogs.find((l) => l.studentId === selectedSimStudent.id);
    if (!latest?.timestamp?.toMillis) return null;
    return Math.max(0, Math.floor((Date.now() - latest.timestamp.toMillis()) / 60000));
  }, [accessLogs, selectedSimStudent]);

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return accessLogs.filter((log) => {
      if (logModeFilter !== 'all' && log.mode !== logModeFilter) return false;
      if (logDecisionFilter !== 'all' && log.decision !== logDecisionFilter) return false;
      if (q) {
        const hay = `${log.studentName || ''} ${log.deviceId} ${log.reason} ${log.fingerprintId || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [accessLogs, logModeFilter, logDecisionFilter, logSearch]);

  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    setFeedback(null);
    setSimRunning(true);

    try {
      const matchedSimDevice = simulatorDevices.find((d) => d.deviceCode === simDeviceCode);
      const response = await authorizeSimulatorScan({
        deviceId: simDeviceCode,
        deviceStatus: matchedSimDevice?.status || 'online',
        antiPassbackEnabled: simAntiPassback,
        direction: simDirection,
        fingerprintId: selectedSimStudent?.fingerprintTemplateId || (selectedSimStudent ? `FP-${selectedSimStudent.registrationNo}` : 'FP-UNKNOWN'),
        student: selectedSimStudent,
        isCurrentlyInside: Boolean(activeAttendanceForSelected),
        minutesSinceLastEvent: minutesSinceLastEventForSelected,
        policy: {
          gracePeriodDays: settings?.gracePeriodDays ?? 5,
          antiPassbackMinutes: settings?.antiPassbackMinutes ?? 10,
        },
        simulatedTimeHHMM: simTimeOverride || undefined,
      });

      setSimOutput(response);

      // Persist immutable access_logs record explicitly marked mode: 'simulator'
      await recordAccessLogEntry({
        deviceId: response.result.deviceId,
        mode: 'simulator',
        studentId: selectedSimStudent?.id || '',
        studentName: selectedSimStudent?.fullName || 'Unrecognized Biometric',
        fingerprintId:
          selectedSimStudent?.fingerprintTemplateId ||
          (selectedSimStudent ? `FP-${selectedSimStudent.registrationNo}` : 'FP-UNKNOWN'),
        direction: response.result.direction,
        decision: response.result.decision,
        reason: response.result.reason,
      });

      // Optionally synchronize Attendance record tagged source: 'simulator'
      if (simSyncAttendance && response.result.decision === 'GRANTED' && selectedSimStudent) {
        if (response.result.attendanceAction === 'CHECK_IN') {
          await checkInStudent(selectedSimStudent, adminProfile, 'simulator', response.result.deviceId);
        } else if (
          response.result.attendanceAction === 'CHECK_OUT' &&
          activeAttendanceForSelected
        ) {
          await checkOutAttendanceRecord(activeAttendanceForSelected, adminProfile);
        }
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Simulation failed.',
      });
    } finally {
      setSimRunning(false);
    }
  };

  const handleRunHmacTest = async () => {
    setFeedback(null);
    setHmacTesting(true);
    try {
      const report = await runServerHmacSelfTest();
      setHmacReport(report);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to run HMAC self-test.',
      });
    } finally {
      setHmacTesting(false);
    }
  };

  const handleRegisterDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminProfile) return;
    setFeedback(null);
    setAddingDevice(true);
    try {
      await registerIoTDevice(
        {
          deviceCode: devCode.toUpperCase(),
          name: devName,
          location: devLocation,
          mode: devMode,
          status: devMode === 'simulator' ? 'online' : 'not_configured',
          doorState: 'locked',
          firmwareVersion: devMode === 'simulator' ? 'SIM-1.0' : 'UNPROVISIONED',
          antiPassbackEnabled: devAntiPassback,
        },
        adminProfile,
      );
      setDevCode('');
      setDevName('');
      setFeedback({
        type: 'success',
        text:
          devMode === 'hardware'
            ? 'Hardware controller placeholder registered as "not_configured" until physical ESP32 provisioning.'
            : 'Isolated simulator controller registered.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to register device.',
      });
    } finally {
      setAddingDevice(false);
    }
  };

  const handleExportLogsCsv = () => {
    const headers = ['Timestamp', 'Mode', 'Device ID', 'Student', 'Fingerprint ID', 'Direction', 'Decision', 'Reason'];
    const rows = filteredLogs.map((l) =>
      [
        l.timestamp?.toDate ? l.timestamp.toDate().toISOString() : '',
        l.mode,
        l.deviceId,
        l.studentName || '',
        l.fingerprintId || '',
        l.direction,
        l.decision,
        l.reason,
      ].map(escapeCsvCell),
    );
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `av_esafe-smart-door-access-logs.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Smart Door &amp; Biometric IoT Control
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          ESP32 + R307 fingerprint access architecture, HMAC-SHA256 replay-protected backend, diagnostics, and strictly isolated hardware simulator.
        </p>
      </div>

      {/* Hardware Separation & Fail-Safe Emergency Exit Mandate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800 space-y-1.5">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-semibold text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              Live Hardware Status:{' '}
              {diagnostics?.hmacKeyConfigured
                ? 'HMAC Key Configured (Awaiting ESP32 Heartbeat)'
                : 'Not Configured — Isolated Simulator Only'}
            </span>
          </div>
          <p className="text-xs text-amber-800 dark:text-amber-300/90 leading-relaxed">
            No physical ESP32 door lock is currently verified online. Simulator actions execute the real server-side authorization policy engine and log events strictly tagged{' '}
            <code className="font-mono font-semibold">mode: simulator</code> without actuating physical hardware.
          </p>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 dark:bg-slate-900 border border-slate-700 text-slate-100 space-y-1.5">
          <div className="flex items-center gap-2 text-emerald-300 font-semibold text-sm">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>Hardwired Fail-Safe Emergency Exit Mandate</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            The physical emergency exit switch (NC break-glass / push-to-exit button) is wired directly in series with the 12V magnetic lock power supply. It releases the door immediately on press or power loss—<strong>100% independent of ESP32 firmware, Wi-Fi/internet, Express server, and Firebase.</strong>
          </p>
        </div>
      </div>

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
          <span className="flex-1">{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-medium underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Workspace Tabs */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 pt-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-6">
          {(
            [
              { id: 'simulator', label: 'Hardware Simulator (Isolated)', icon: Fingerprint },
              { id: 'devices', label: `Devices & Diagnostics (${devices.length})`, icon: Cpu },
              { id: 'logs', label: `Access Logs (${accessLogs.length})`, icon: Activity },
              { id: 'protocol', label: 'ESP32 Security & Wiring', icon: KeyRound },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3.5 inline-flex items-center gap-2 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? 'border-[#0B1F3A] dark:border-sky-400 text-[#0B1F3A] dark:text-sky-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* TAB 1: Isolated Hardware Simulator */}
        {activeTab === 'simulator' && (
          <div className="p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form onSubmit={handleRunSimulation} className="lg:col-span-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Simulate R307 Biometric Scan
                </h2>
                <span className="font-mono text-[11px] uppercase tracking-wider text-amber-700 dark:text-amber-400 font-semibold">
                  SIMULATOR MODE
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Simulated Controller
                  </label>
                  <select
                    value={simDeviceCode}
                    onChange={(e) => setSimDeviceCode(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white"
                  >
                    <option value="SIM-GATE-01">SIM-GATE-01 (Virtual Entrance)</option>
                    {simulatorDevices.map((d) => (
                      <option key={d.id} value={d.deviceCode}>
                        {d.deviceCode} ({d.name})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Direction
                  </label>
                  <select
                    value={simDirection}
                    onChange={(e) => setSimDirection(e.target.value as 'entry' | 'exit')}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="entry">Entry (Outside → Inside)</option>
                    <option value="exit">Exit (Inside → Outside)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Fingerprint Identity to Simulate
                </label>
                <select
                  value={simStudentId}
                  onChange={(e) => setSimStudentId(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                >
                  <option value="">Unrecognized Fingerprint (Test Denial)</option>
                  {students.map((s) => {
                    const shift = SHIFT_DEFINITIONS.find((sh) => sh.id === s.shiftType)?.label || s.shiftType;
                    return (
                      <option key={s.id} value={s.id}>
                        {s.fullName} ({s.registrationNo}) · {shift} · {s.status}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Optional Simulated Time (IST)
                  </label>
                  <input
                    type="time"
                    value={simTimeOverride}
                    onChange={(e) => setSimTimeOverride(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Leave blank to use live India Standard Time (IST).
                  </p>
                </div>

                <div className="space-y-2.5 pt-6">
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={simAntiPassback}
                      onChange={(e) => setSimAntiPassback(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    Enforce Anti-Passback ({settings?.antiPassbackMinutes ?? 10}m)
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={simSyncAttendance}
                      onChange={(e) => setSimSyncAttendance(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    Sync Attendance on Grant (tagged <code className="font-mono">simulator</code>)
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={simRunning}
                className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 px-5 rounded-xl bg-[#0B1F3A] hover:bg-[#143058] dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Fingerprint className="w-4 h-4" />
                {simRunning ? 'Authorizing on Server...' : 'Simulate Biometric Gate Scan'}
              </button>
            </form>

            {/* Virtual ESP32 + LCD + Relay Telemetry Display */}
            <div className="lg:col-span-6 space-y-4">
              <div className="rounded-2xl bg-slate-950 text-slate-100 p-5 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-slate-400">
                    VIRTUAL HARDWARE BENCH · NO PHYSICAL RELAY
                  </span>
                  <span
                    className={`font-mono font-bold ${
                      !simOutput
                        ? 'text-slate-400'
                        : simOutput.result.decision === 'GRANTED'
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                    }`}
                  >
                    {simOutput ? simOutput.result.decision : 'STANDBY'}
                  </span>
                </div>

                {/* 16x2 I2C LCD Screen Simulation */}
                <div className="rounded-xl bg-[#0B2B1E] border-2 border-[#1A4D38] p-4 font-mono text-emerald-300 tracking-widest">
                  <p className="text-sm font-bold leading-snug">
                    {simOutput ? simOutput.result.hardwareSignals.lcdLine1 : 'AV_ESAFE LIBRARY'}
                  </p>
                  <p className="text-sm leading-snug mt-1">
                    {simOutput ? simOutput.result.hardwareSignals.lcdLine2 : 'SCAN FINGER...  '}
                  </p>
                </div>

                {/* Simulated Actuator Indicators */}
                <div className="grid grid-cols-3 gap-2.5 text-xs font-mono">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <p className="text-[10px] text-slate-400 uppercase">MagLock Relay</p>
                    <p className="mt-1 font-semibold flex items-center gap-1.5">
                      {simOutput?.result.hardwareSignals.relayAction === 'PULSE_UNLOCK_5S' ? (
                        <>
                          <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">UNLOCK 5S</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5 text-slate-400" />
                          <span>LOCKED</span>
                        </>
                      )}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <p className="text-[10px] text-slate-400 uppercase">Status LED</p>
                    <p
                      className={`mt-1 font-semibold ${
                        simOutput?.result.hardwareSignals.led === 'GREEN'
                          ? 'text-emerald-400'
                          : simOutput?.result.hardwareSignals.led === 'RED'
                            ? 'text-rose-400'
                            : 'text-slate-400'
                      }`}
                    >
                      {simOutput ? simOutput.result.hardwareSignals.led : 'IDLE'}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <p className="text-[10px] text-slate-400 uppercase">Piezo Buzzer</p>
                    <p className="mt-1 font-semibold text-slate-200 truncate">
                      {simOutput
                        ? simOutput.result.hardwareSignals.buzzer === 'SINGLE_BEEP'
                          ? '1x BEEP'
                          : '3x ERROR'
                        : 'SILENT'}
                    </p>
                  </div>
                </div>

                {/* Step-by-step Server Policy Evaluation */}
                {simOutput && (
                  <div className="pt-3 border-t border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <span>BACKEND RULE EVALUATION</span>
                      <span>{simOutput.result.evaluatedLocalTime}</span>
                    </div>
                    <ul className="space-y-1.5 text-xs">
                      {simOutput.result.checks.map((chk) => (
                        <li key={chk.rule} className="flex items-start gap-2">
                          <span
                            className={`font-mono font-bold shrink-0 ${
                              chk.passed ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {chk.passed ? '[PASS]' : '[FAIL]'}
                          </span>
                          <span className="text-slate-300">
                            <strong className="text-white">{chk.rule}:</strong> {chk.detail}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Devices & Diagnostics */}
        {activeTab === 'devices' && (
          <div className="p-5 sm:p-6 space-y-6">
            {/* HMAC Self-Test Card */}
            <div className="p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />
                    Cryptographic HMAC-SHA256 &amp; Replay Protection Self-Test
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Executes live server-side verification using an ephemeral 256-bit key (signature validity, tamper rejection, ±30s skew, nonce replay).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRunHmacTest}
                  disabled={hmacTesting}
                  className="px-4 min-h-[40px] rounded-xl bg-[#0B1F3A] hover:bg-[#143058] dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {hmacTesting ? 'Running Self-Test...' : 'Run Live HMAC Self-Test'}
                </button>
              </div>

              {hmacReport && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                  {hmacReport.checks.map((c) => (
                    <div
                      key={c.name}
                      className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                    >
                      <p className="font-semibold text-slate-900 dark:text-white flex items-center justify-between gap-2">
                        <span>{c.name}</span>
                        <span
                          className={`font-mono ${
                            c.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'
                          }`}
                        >
                          {c.passed ? 'PASS' : 'FAIL'}
                        </span>
                      </p>
                      <p className="text-slate-500 dark:text-slate-400 mt-1">{c.detail}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Register Device Form */}
            <form
              onSubmit={handleRegisterDevice}
              className="p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4"
            >
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Register Smart Door Controller
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <input
                  type="text"
                  required
                  value={devCode}
                  onChange={(e) => setDevCode(e.target.value)}
                  placeholder="Code (e.g., ESP32-MAIN-01)"
                  className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  required
                  value={devName}
                  onChange={(e) => setDevName(e.target.value)}
                  placeholder="Controller name"
                  className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  required
                  value={devLocation}
                  onChange={(e) => setDevLocation(e.target.value)}
                  placeholder="Location (Hall 1 / Hall 2)"
                  className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
                />
                <div className="flex items-center gap-2">
                  <select
                    value={devMode}
                    onChange={(e) => setDevMode(e.target.value as IoTDeviceMode)}
                    aria-label="Device mode"
                    className="flex-1 min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
                  >
                    <option value="simulator">Simulator Mode</option>
                    <option value="hardware">Hardware Placeholder</option>
                  </select>
                  <button
                    type="submit"
                    disabled={addingDevice}
                    className="px-4 min-h-[40px] rounded-xl bg-[#0B1F3A] hover:bg-[#143058] dark:bg-sky-500 dark:hover:bg-sky-400 dark:text-slate-950 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {addingDevice ? '...' : 'Register'}
                  </button>
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={devAntiPassback}
                  onChange={(e) => setDevAntiPassback(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300"
                />
                Enable Anti-Passback on this controller
              </label>
            </form>

            {/* Device Table */}
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/60">
                    <th className="py-2.5 px-4">Controller</th>
                    <th className="py-2.5 px-4">Mode</th>
                    <th className="py-2.5 px-4">Location</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Anti-Passback</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {devices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-500 dark:text-slate-400">
                        No controllers registered yet. Use the form above to register a virtual simulator or physical hardware placeholder.
                      </td>
                    </tr>
                  ) : (
                    devices.map((dev) => (
                      <tr key={dev.id}>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-900 dark:text-white">{dev.name}</p>
                          <p className="font-mono text-slate-500 dark:text-slate-400">
                            {dev.deviceCode} · {dev.firmwareVersion || '—'}
                          </p>
                        </td>
                        <td className="py-3 px-4 font-mono uppercase text-slate-700 dark:text-slate-300">
                          {dev.mode}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                          {dev.location}
                        </td>
                        <td className="py-3 px-4">
                          <select
                            value={dev.status}
                            onChange={(e) =>
                              adminProfile &&
                              updateIoTDevice(
                                dev,
                                { status: e.target.value as IoTDeviceStatus },
                                adminProfile,
                              )
                            }
                            aria-label={`Status for ${dev.name}`}
                            className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200"
                          >
                            <option value="not_configured">Not Configured</option>
                            {dev.mode === 'simulator' && <option value="online">Online (Sim)</option>}
                            <option value="offline">Offline</option>
                            <option value="maintenance">Maintenance</option>
                          </select>
                        </td>
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() =>
                              adminProfile &&
                              updateIoTDevice(
                                dev,
                                { antiPassbackEnabled: !dev.antiPassbackEnabled },
                                adminProfile,
                              )
                            }
                            className={`text-xs font-semibold cursor-pointer ${
                              dev.antiPassbackEnabled
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-slate-500'
                            }`}
                          >
                            {dev.antiPassbackEnabled ? 'Enabled' : 'Disabled'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {confirmDeleteDeviceId === dev.id ? (
                            <span className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!adminProfile) return;
                                  await deleteIoTDevice(dev, adminProfile);
                                  setConfirmDeleteDeviceId(null);
                                }}
                                className="text-rose-600 font-semibold hover:underline cursor-pointer"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteDeviceId(null)}
                                className="text-slate-500 hover:underline cursor-pointer"
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteDeviceId(dev.id)}
                              aria-label={`Remove ${dev.name}`}
                              className="text-slate-400 hover:text-rose-600 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5 inline" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: Access Logs */}
        {activeTab === 'logs' && (
          <div className="p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-1 flex-wrap items-center gap-2.5">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Search student, device, or reason..."
                    className="w-full min-h-[40px] pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <select
                  value={logModeFilter}
                  onChange={(e) => setLogModeFilter(e.target.value as 'all' | IoTDeviceMode)}
                  aria-label="Filter access logs by mode"
                  className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200"
                >
                  <option value="all">All Modes</option>
                  <option value="simulator">Simulator Only</option>
                  <option value="hardware">Live Hardware Only</option>
                </select>
                <select
                  value={logDecisionFilter}
                  onChange={(e) =>
                    setLogDecisionFilter(e.target.value as 'all' | 'GRANTED' | 'DENIED')
                  }
                  aria-label="Filter access logs by decision"
                  className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200"
                >
                  <option value="all">All Decisions</option>
                  <option value="GRANTED">GRANTED</option>
                  <option value="DENIED">DENIED</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleExportLogsCsv}
                disabled={filteredLogs.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/60">
                    <th className="py-2.5 px-4">Timestamp</th>
                    <th className="py-2.5 px-4">Mode / Device</th>
                    <th className="py-2.5 px-4">Student</th>
                    <th className="py-2.5 px-4">Direction</th>
                    <th className="py-2.5 px-4">Decision</th>
                    <th className="py-2.5 px-4">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-500 dark:text-slate-400">
                        No access log records match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="py-2.5 px-4 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {formatTimestamp(log.timestamp)}
                        </td>
                        <td className="py-2.5 px-4 font-mono">
                          <span className="text-slate-900 dark:text-white font-semibold">
                            {log.deviceId}
                          </span>
                          <span className="text-slate-400 ml-1.5 uppercase text-[10px]">
                            [{log.mode}]
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-800 dark:text-slate-200">
                          {log.studentName || 'Unknown'}
                        </td>
                        <td className="py-2.5 px-4 capitalize text-slate-600 dark:text-slate-300">
                          {log.direction === 'entry' ? (
                            <span className="inline-flex items-center gap-1">
                              <DoorOpen className="w-3.5 h-3.5" /> Entry
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <DoorClosed className="w-3.5 h-3.5" /> Exit
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-mono font-bold">
                          <span
                            className={
                              log.decision === 'GRANTED'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }
                          >
                            {log.decision}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                          {log.reason}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: ESP32 Security Protocol & Hardware Architecture */}
        {activeTab === 'protocol' && (
          <div className="p-5 sm:p-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />
                  Hardware Component Blueprint
                </h2>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {(diagnostics?.hardwareArchitecture || []).map((item) => (
                    <div key={item.component} className="py-2.5">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {item.component}
                      </p>
                      <p className="text-slate-600 dark:text-slate-300 mt-0.5">{item.role}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[#0B1F3A] dark:text-sky-400" />
                  HMAC-SHA256 Signing &amp; Replay Contract
                </h2>
                <dl className="space-y-2.5 text-xs">
                  <div>
                    <dt className="font-semibold text-slate-800 dark:text-slate-200">
                      Live Hardware Endpoints
                    </dt>
                    <dd className="font-mono text-slate-600 dark:text-slate-300 mt-0.5">
                      POST /api/iot/hardware/authorize
                      <br />
                      POST /api/iot/hardware/heartbeat
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-800 dark:text-slate-200">
                      Required Headers
                    </dt>
                    <dd className="font-mono text-slate-600 dark:text-slate-300 mt-0.5">
                      X-Device-Id · X-Timestamp (Unix sec) · X-Nonce (12–64 chars) · X-Signature (64-hex HMAC-SHA256)
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-800 dark:text-slate-200">
                      Canonical String
                    </dt>
                    <dd className="font-mono text-[11px] p-2.5 rounded-lg bg-slate-950 text-sky-300 mt-1 overflow-x-auto">
                      METHOD + &quot;\n&quot; + PATH + &quot;\n&quot; + X-Device-Id + &quot;\n&quot; + X-Timestamp + &quot;\n&quot; + X-Nonce + &quot;\n&quot; + SHA256(rawBody)
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-800 dark:text-slate-200">
                      Replay &amp; Skew Enforcement
                    </dt>
                    <dd className="text-slate-600 dark:text-slate-300 mt-0.5">
                      Rejects requests outside ±{diagnostics?.replayProtection.clockSkewToleranceSeconds ?? 30}s clock skew (HTTP 401) and blocks duplicate nonces (HTTP 409). Constant-time comparison via <code className="font-mono">crypto.timingSafeEqual</code>.
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-800 dark:text-slate-200">
                      Server Provisioning Variable
                    </dt>
                    <dd className="text-slate-600 dark:text-slate-300 mt-0.5">
                      Set <code className="font-mono">IOT_HMAC_SECRET_KEY</code> (≥ 16 random bytes) in server environment secrets before connecting live ESP32 controllers.
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
