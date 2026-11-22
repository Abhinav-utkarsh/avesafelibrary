import { z } from 'zod';

export const SHIFT_VALUES = [
  'morning',
  'noon',
  'evening',
  'night',
  'double',
  'triple',
  'all_shifts',
] as const;

export const accessEvaluationSchema = z.object({
  mode: z.enum(['simulator', 'hardware']),
  deviceId: z.string().trim().min(2).max(64),
  deviceStatus: z.enum(['not_configured', 'online', 'offline', 'maintenance']).default('online'),
  antiPassbackEnabled: z.boolean().default(true),
  direction: z.enum(['entry', 'exit']),
  fingerprintId: z.string().trim().max(64).optional().default(''),
  student: z
    .object({
      id: z.string().min(1).max(128),
      fullName: z.string().min(1).max(120),
      registrationNo: z.string().min(1).max(40),
      status: z.enum(['active', 'expired', 'demo', 'suspended', 'inactive']),
      shiftType: z.enum(SHIFT_VALUES),
      seatId: z.string().max(40).optional().default(''),
      hall: z.string().max(40).optional().default('Unassigned'),
      membershipExpiry: z.string().max(40).optional().default(''),
      pendingAmount: z.number().min(0).max(500000).default(0),
      monthlyFee: z.number().min(0).max(100000).default(0),
    })
    .nullable(),
  isCurrentlyInside: z.boolean().default(false),
  minutesSinceLastEvent: z.number().min(0).nullable().optional().default(null),
  policy: z
    .object({
      gracePeriodDays: z.number().int().min(0).max(30).default(5),
      antiPassbackMinutes: z.number().int().min(0).max(120).default(10),
    })
    .default({ gracePeriodDays: 5, antiPassbackMinutes: 10 }),
  /** Optional HH:MM override strictly allowed in simulator mode to test shift windows */
  simulatedTimeHHMM: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
});

export type AccessEvaluationInput = z.infer<typeof accessEvaluationSchema>;

export interface PolicyCheckStep {
  rule: string;
  passed: boolean;
  detail: string;
}

export interface AccessEvaluationResult {
  mode: 'simulator' | 'hardware';
  deviceId: string;
  direction: 'entry' | 'exit';
  decision: 'GRANTED' | 'DENIED';
  reason: string;
  evaluatedAt: string;
  evaluatedLocalTime: string;
  attendanceAction: 'CHECK_IN' | 'CHECK_OUT' | 'NONE';
  checks: PolicyCheckStep[];
  hardwareSignals: {
    relayAction: 'PULSE_UNLOCK_5S' | 'KEEP_LOCKED';
    doorLockState: 'UNLOCKED_TEMP' | 'LOCKED';
    lcdLine1: string;
    lcdLine2: string;
    led: 'GREEN' | 'RED';
    buzzer: 'SINGLE_BEEP' | 'TRIPLE_ERROR_BEEP';
  };
}

function getCurrentIstHourMinute(): { hour: number; minute: number; label: string } {
  const now = new Date();
  // India Standard Time (UTC+05:30) for Av_eSAFE Library, Electronic City, Bangalore
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist = new Date(utcMs + 5.5 * 3600000);
  const hour = ist.getHours();
  const minute = ist.getMinutes();
  return {
    hour,
    minute,
    label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} IST`,
  };
}

function isWithinShiftWindow(
  shiftType: (typeof SHIFT_VALUES)[number],
  hour: number,
): { allowed: boolean; windowLabel: string } {
  switch (shiftType) {
    case 'morning':
      return { allowed: hour >= 6 && hour < 12, windowLabel: '06:00–12:00' };
    case 'noon':
      return { allowed: hour >= 12 && hour < 18, windowLabel: '12:00–18:00' };
    case 'evening':
      return { allowed: hour >= 16 && hour < 22, windowLabel: '16:00–22:00' };
    case 'night':
      return { allowed: hour >= 22 || hour < 6, windowLabel: '22:00–06:00' };
    case 'double':
      return { allowed: hour >= 6 && hour < 22, windowLabel: '06:00–22:00 (12h Flex)' };
    case 'triple':
      return { allowed: hour >= 5 || hour < 23, windowLabel: '18h Extended' };
    case 'all_shifts':
      return { allowed: true, windowLabel: '24/7 Full Access' };
    default:
      return { allowed: false, windowLabel: 'Unknown Shift' };
  }
}

function daysUntilIsoExpiry(expiryIso?: string): number | null {
  if (!expiryIso) return null;
  const parsed = new Date(`${expiryIso}T23:59:59`);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.ceil((parsed.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function buildResult(
  input: AccessEvaluationInput,
  decision: 'GRANTED' | 'DENIED',
  reason: string,
  checks: PolicyCheckStep[],
  evaluatedLocalTime: string,
): AccessEvaluationResult {
  const shortName = (input.student?.fullName || 'UNKNOWN').slice(0, 16).toUpperCase();
  const attendanceAction: 'CHECK_IN' | 'CHECK_OUT' | 'NONE' =
    decision === 'GRANTED'
      ? input.direction === 'entry'
        ? 'CHECK_IN'
        : 'CHECK_OUT'
      : 'NONE';

  return {
    mode: input.mode,
    deviceId: input.deviceId,
    direction: input.direction,
    decision,
    reason: reason.slice(0, 200),
    evaluatedAt: new Date().toISOString(),
    evaluatedLocalTime,
    attendanceAction,
    checks,
    hardwareSignals:
      decision === 'GRANTED'
        ? {
            relayAction: 'PULSE_UNLOCK_5S',
            doorLockState: 'UNLOCKED_TEMP',
            lcdLine1: input.direction === 'entry' ? 'WELCOME AV_ESAFE' : 'EXIT APPROVED',
            lcdLine2: shortName,
            led: 'GREEN',
            buzzer: 'SINGLE_BEEP',
          }
        : {
            relayAction: 'KEEP_LOCKED',
            doorLockState: 'LOCKED',
            lcdLine1: 'ACCESS DENIED',
            lcdLine2: reason.slice(0, 16).toUpperCase(),
            led: 'RED',
            buzzer: 'TRIPLE_ERROR_BEEP',
          },
  };
}

/**
 * Authoritative server-side access decision engine shared by Live Hardware and Isolated Simulator.
 */
export function evaluateDoorAccess(rawInput: AccessEvaluationInput): AccessEvaluationResult {
  const input = accessEvaluationSchema.parse(rawInput);
  const checks: PolicyCheckStep[] = [];

  let evalHour: number;
  let evaluatedLocalTime: string;
  if (input.mode === 'simulator' && input.simulatedTimeHHMM) {
    const [hStr] = input.simulatedTimeHHMM.split(':');
    evalHour = Number(hStr);
    evaluatedLocalTime = `${input.simulatedTimeHHMM} (Simulated IST)`;
  } else {
    const ist = getCurrentIstHourMinute();
    evalHour = ist.hour;
    evaluatedLocalTime = ist.label;
  }

  // 1. Device health check
  if (input.deviceStatus === 'offline' || input.deviceStatus === 'maintenance') {
    checks.push({
      rule: 'Controller Availability',
      passed: false,
      detail: `Device ${input.deviceId} is currently marked ${input.deviceStatus}.`,
    });
    return buildResult(
      input,
      'DENIED',
      `Device ${input.deviceId} in ${input.deviceStatus} mode`,
      checks,
      evaluatedLocalTime,
    );
  }
  checks.push({
    rule: 'Controller Availability',
    passed: true,
    detail: `Controller ${input.deviceId} ready (${input.mode}).`,
  });

  // 2. Identity & Fingerprint match
  if (!input.student) {
    checks.push({
      rule: 'Biometric Identity Match',
      passed: false,
      detail: 'No student profile matched the scanned R307 fingerprint template.',
    });
    return buildResult(
      input,
      'DENIED',
      'Unrecognized fingerprint template',
      checks,
      evaluatedLocalTime,
    );
  }
  checks.push({
    rule: 'Biometric Identity Match',
    passed: true,
    detail: `Matched ${input.student.fullName} (${input.student.registrationNo}).`,
  });

  // 3. Account status check (exits always permitted for currently inside students after identity match)
  if (input.direction === 'exit') {
    if (input.antiPassbackEnabled && !input.isCurrentlyInside) {
      checks.push({
        rule: 'Anti-Passback (Exit)',
        passed: false,
        detail: `${input.student.fullName} is not currently marked inside.`,
      });
      return buildResult(
        input,
        'DENIED',
        'Anti-passback: No active entry on record',
        checks,
        evaluatedLocalTime,
      );
    }
    checks.push({
      rule: 'Exit Clearance',
      passed: true,
      detail: 'Normal exit cleared (note: physical emergency exit always bypasses software).',
    });
    return buildResult(
      input,
      'GRANTED',
      `Exit authorized for ${input.student.fullName}`,
      checks,
      evaluatedLocalTime,
    );
  }

  // Entry-specific checks
  if (
    input.student.status === 'suspended' ||
    input.student.status === 'inactive' ||
    input.student.status === 'expired'
  ) {
    checks.push({
      rule: 'Account Standing',
      passed: false,
      detail: `Student status is "${input.student.status}".`,
    });
    return buildResult(
      input,
      'DENIED',
      `Account ${input.student.status}`,
      checks,
      evaluatedLocalTime,
    );
  }
  checks.push({
    rule: 'Account Standing',
    passed: true,
    detail: `Account active (${input.student.status}).`,
  });

  // 4. Membership expiry + fee grace period check
  const daysLeft = daysUntilIsoExpiry(input.student.membershipExpiry);
  const grace = input.policy.gracePeriodDays;
  if (daysLeft !== null && daysLeft < -grace) {
    checks.push({
      rule: 'Membership & Grace Policy',
      passed: false,
      detail: `Expired ${Math.abs(daysLeft)}d ago (exceeds ${grace}d grace period).`,
    });
    return buildResult(
      input,
      'DENIED',
      `Membership expired (${Math.abs(daysLeft)}d overdue)`,
      checks,
      evaluatedLocalTime,
    );
  }
  if (daysLeft !== null && daysLeft < 0 && input.student.pendingAmount > 0) {
    checks.push({
      rule: 'Membership & Grace Policy',
      passed: false,
      detail: `Expired ${Math.abs(daysLeft)}d ago with ₹${input.student.pendingAmount} unpaid dues.`,
    });
    return buildResult(
      input,
      'DENIED',
      `Pending dues ₹${input.student.pendingAmount} past expiry`,
      checks,
      evaluatedLocalTime,
    );
  }
  checks.push({
    rule: 'Membership & Grace Policy',
    passed: true,
    detail:
      daysLeft === null
        ? 'No expiry restriction set.'
        : daysLeft >= 0
          ? `Valid (${daysLeft}d remaining; grace ${grace}d).`
          : `Within ${grace}d grace window (${Math.abs(daysLeft)}d past expiry).`,
  });

  // 5. Shift window validation
  const shiftCheck = isWithinShiftWindow(input.student.shiftType, evalHour);
  if (!shiftCheck.allowed) {
    checks.push({
      rule: 'Shift Window Validation',
      passed: false,
      detail: `${input.student.shiftType} shift permits ${shiftCheck.windowLabel}; evaluated at ${evaluatedLocalTime}.`,
    });
    return buildResult(
      input,
      'DENIED',
      `Outside ${input.student.shiftType} shift (${shiftCheck.windowLabel})`,
      checks,
      evaluatedLocalTime,
    );
  }
  checks.push({
    rule: 'Shift Window Validation',
    passed: true,
    detail: `Inside ${input.student.shiftType} shift window (${shiftCheck.windowLabel}).`,
  });

  // 6. Anti-passback enforcement
  if (input.antiPassbackEnabled) {
    if (input.isCurrentlyInside) {
      checks.push({
        rule: 'Anti-Passback Guard',
        passed: false,
        detail: `${input.student.fullName} is already marked inside; exit required before re-entry.`,
      });
      return buildResult(
        input,
        'DENIED',
        'Anti-passback: Already checked in',
        checks,
        evaluatedLocalTime,
      );
    }

    if (
      typeof input.minutesSinceLastEvent === 'number' &&
      input.policy.antiPassbackMinutes > 0 &&
      input.minutesSinceLastEvent < input.policy.antiPassbackMinutes
    ) {
      checks.push({
        rule: 'Anti-Passback Cooldown',
        passed: false,
        detail: `Last gate event was ${input.minutesSinceLastEvent}m ago (minimum ${input.policy.antiPassbackMinutes}m cooldown).`,
      });
      return buildResult(
        input,
        'DENIED',
        `Anti-passback cooldown (${input.policy.antiPassbackMinutes}m)`,
        checks,
        evaluatedLocalTime,
      );
    }
  }
  checks.push({
    rule: 'Anti-Passback Guard',
    passed: true,
    detail: input.antiPassbackEnabled
      ? 'No active inside session or cooldown violation.'
      : 'Anti-passback disabled on this controller.',
  });

  return buildResult(
    input,
    'GRANTED',
    `Entry authorized · ${input.student.hall} ${input.student.seatId || 'Unseated'}`,
    checks,
    evaluatedLocalTime,
  );
}
