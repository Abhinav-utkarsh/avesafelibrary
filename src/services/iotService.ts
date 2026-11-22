import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { z } from 'zod';
import { auth, db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import type {
  AccessLogRecord,
  AdminProfile,
  DoorState,
  IoTDeviceMode,
  IoTDeviceRecord,
  IoTDeviceStatus,
  StudentRecord,
} from '../types/domain';

export const iotDeviceFormSchema = z.object({
  deviceCode: z
    .string()
    .trim()
    .min(3, 'Device code must be at least 3 characters.')
    .max(64)
    .regex(/^[a-zA-Z0-9_\-]+$/, 'Use letters, numbers, hyphens, or underscores only.'),
  name: z.string().trim().min(2, 'Device name is required.').max(120),
  location: z.string().trim().min(2, 'Location is required.').max(120),
  mode: z.enum(['simulator', 'hardware']),
  status: z.enum(['not_configured', 'online', 'offline', 'maintenance']),
  doorState: z.enum(['locked', 'unlocked', 'ajar', 'emergency_override']),
  firmwareVersion: z.string().trim().max(40).optional().default(''),
  antiPassbackEnabled: z.boolean().default(true),
});

export type IoTDeviceFormInput = z.infer<typeof iotDeviceFormSchema>;

export interface IoTDiagnosticsResponse {
  hardwareStatus: string;
  hmacKeyConfigured: boolean;
  replayProtection: {
    algorithm: string;
    clockSkewToleranceSeconds: number;
    activeNonceCacheEntries: number;
    canonicalFormat: string;
  };
  emergencyExitPolicy: {
    softwareIndependent: boolean;
    wiringRequirement: string;
  };
  hardwareArchitecture: { component: string; role: string }[];
  timestamp: string;
}

export interface SimulatorAuthorizationResponse {
  simulatedOnly: boolean;
  physicalHardwareActuated: boolean;
  result: {
    mode: 'simulator' | 'hardware';
    deviceId: string;
    direction: 'entry' | 'exit';
    decision: 'GRANTED' | 'DENIED';
    reason: string;
    evaluatedAt: string;
    evaluatedLocalTime: string;
    attendanceAction: 'CHECK_IN' | 'CHECK_OUT' | 'NONE';
    checks: { rule: string; passed: boolean; detail: string }[];
    hardwareSignals: {
      relayAction: 'PULSE_UNLOCK_5S' | 'KEEP_LOCKED';
      doorLockState: 'UNLOCKED_TEMP' | 'LOCKED';
      lcdLine1: string;
      lcdLine2: string;
      led: 'GREEN' | 'RED';
      buzzer: 'SINGLE_BEEP' | 'TRIPLE_ERROR_BEEP';
    };
  };
}

export interface HmacSelfTestResponse {
  executedAt: string;
  ephemeralKeyBits: number;
  checks: { name: string; passed: boolean; detail: string }[];
  allPassed: boolean;
}

async function getBearerHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in to access Smart Door diagnostics.');
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function fetchIoTDiagnostics(): Promise<IoTDiagnosticsResponse> {
  const headers = await getBearerHeaders();
  const res = await fetch('/api/iot/diagnostics', { headers });
  if (!res.ok) {
    throw new Error('Failed to load Smart Door diagnostics from backend.');
  }
  return (await res.json()) as IoTDiagnosticsResponse;
}

export async function runServerHmacSelfTest(): Promise<HmacSelfTestResponse> {
  const headers = await getBearerHeaders();
  const res = await fetch('/api/iot/simulator/hmac-test', {
    method: 'POST',
    headers,
  });
  if (!res.ok) {
    throw new Error('Failed to execute HMAC-SHA256 & replay self-test.');
  }
  return (await res.json()) as HmacSelfTestResponse;
}

export async function authorizeSimulatorScan(payload: {
  deviceId: string;
  deviceStatus: IoTDeviceStatus;
  antiPassbackEnabled: boolean;
  direction: 'entry' | 'exit';
  fingerprintId?: string;
  student: StudentRecord | null;
  isCurrentlyInside: boolean;
  minutesSinceLastEvent: number | null;
  policy: {
    gracePeriodDays: number;
    antiPassbackMinutes: number;
  };
  simulatedTimeHHMM?: string;
}): Promise<SimulatorAuthorizationResponse> {
  const headers = await getBearerHeaders();
  const res = await fetch('/api/iot/simulator/authorize', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      mode: 'simulator',
      deviceId: payload.deviceId,
      deviceStatus: payload.deviceStatus,
      antiPassbackEnabled: payload.antiPassbackEnabled,
      direction: payload.direction,
      fingerprintId: payload.fingerprintId || '',
      student: payload.student
        ? {
            id: payload.student.id,
            fullName: payload.student.fullName,
            registrationNo: payload.student.registrationNo,
            status: payload.student.status,
            shiftType: payload.student.shiftType,
            seatId: payload.student.seatId || '',
            hall: payload.student.hall,
            membershipExpiry: payload.student.membershipExpiry || '',
            pendingAmount: Number(payload.student.pendingAmount || 0),
            monthlyFee: Number(payload.student.monthlyFee || 0),
          }
        : null,
      isCurrentlyInside: payload.isCurrentlyInside,
      minutesSinceLastEvent: payload.minutesSinceLastEvent,
      policy: payload.policy,
      simulatedTimeHHMM: payload.simulatedTimeHHMM || undefined,
    }),
  });

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(errBody.message || 'Simulator authorization request failed.');
  }
  return (await res.json()) as SimulatorAuthorizationResponse;
}

async function appendIoTAudit(
  actor: AdminProfile,
  action: string,
  resourceId: string,
  summary: string,
): Promise<void> {
  try {
    await addDoc(collection(db, 'audit_logs'), {
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: action.slice(0, 80),
      resourceType: 'iot_devices',
      resourceId: resourceId.slice(0, 128),
      summary: summary.slice(0, 400),
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'audit_logs');
  }
}

export function subscribeIoTDevices(onData: (devices: IoTDeviceRecord[]) => void): Unsubscribe {
  const q = query(collection(db, 'iot_devices'), orderBy('updatedAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: IoTDeviceRecord[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<IoTDeviceRecord, 'id'>),
      }));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'iot_devices');
    },
  );
}

export function subscribeAccessLogs(
  onData: (logs: AccessLogRecord[]) => void,
  maxItems = 150,
): Unsubscribe {
  const q = query(collection(db, 'access_logs'), orderBy('timestamp', 'desc'), limit(maxItems));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: AccessLogRecord[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<AccessLogRecord, 'id'>),
      }));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'access_logs');
    },
  );
}

export async function registerIoTDevice(
  rawInput: IoTDeviceFormInput,
  actor: AdminProfile,
): Promise<{ id: string }> {
  const parsed = iotDeviceFormSchema.parse(rawInput);
  // Enforce honest hardware status: physical hardware starts as not_configured unless manually set
  const safeStatus: IoTDeviceStatus =
    parsed.mode === 'hardware' && parsed.status === 'online' ? 'not_configured' : parsed.status;

  try {
    const ref = await addDoc(collection(db, 'iot_devices'), {
      deviceCode: parsed.deviceCode,
      name: parsed.name,
      location: parsed.location,
      mode: parsed.mode as IoTDeviceMode,
      status: safeStatus,
      doorState: parsed.doorState as DoorState,
      firmwareVersion: parsed.firmwareVersion || (parsed.mode === 'simulator' ? 'SIM-1.0' : 'UNPROVISIONED'),
      antiPassbackEnabled: parsed.antiPassbackEnabled,
      updatedAt: serverTimestamp(),
    });

    await appendIoTAudit(
      actor,
      'REGISTER_IOT_DEVICE',
      ref.id,
      `Registered ${parsed.mode} controller "${parsed.name}" (${parsed.deviceCode}) at ${parsed.location}.`,
    );

    return { id: ref.id };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'iot_devices');
  }
}

export async function updateIoTDevice(
  device: IoTDeviceRecord,
  updates: {
    name?: string;
    location?: string;
    mode?: IoTDeviceMode;
    status?: IoTDeviceStatus;
    doorState?: DoorState;
    firmwareVersion?: string;
    antiPassbackEnabled?: boolean;
  },
  actor: AdminProfile,
): Promise<void> {
  try {
    // Matches firestore.rules exact affectedKeys allowlist on iot_devices (deviceCode immutable)
    await updateDoc(doc(db, 'iot_devices', device.id), {
      name: updates.name ?? device.name,
      location: updates.location ?? device.location,
      mode: updates.mode ?? device.mode,
      status: updates.status ?? device.status,
      doorState: updates.doorState ?? device.doorState,
      firmwareVersion: updates.firmwareVersion ?? (device.firmwareVersion || ''),
      antiPassbackEnabled: updates.antiPassbackEnabled ?? device.antiPassbackEnabled,
      updatedAt: serverTimestamp(),
    });

    await appendIoTAudit(
      actor,
      'UPDATE_IOT_DEVICE',
      device.id,
      `Updated controller ${device.deviceCode}: status=${updates.status ?? device.status}, antiPassback=${updates.antiPassbackEnabled ?? device.antiPassbackEnabled}.`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `iot_devices/${device.id}`);
  }
}

export async function deleteIoTDevice(
  device: IoTDeviceRecord,
  actor: AdminProfile,
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'iot_devices', device.id));
    await appendIoTAudit(
      actor,
      'DELETE_IOT_DEVICE',
      device.id,
      `Removed controller ${device.deviceCode} (${device.name}).`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `iot_devices/${device.id}`);
  }
}

export async function recordAccessLogEntry(entry: {
  deviceId: string;
  mode: IoTDeviceMode;
  studentId?: string;
  studentName?: string;
  fingerprintId?: string;
  direction: 'entry' | 'exit';
  decision: 'GRANTED' | 'DENIED';
  reason: string;
}): Promise<{ id: string }> {
  try {
    const ref = await addDoc(collection(db, 'access_logs'), {
      deviceId: entry.deviceId.slice(0, 128),
      mode: entry.mode,
      studentId: (entry.studentId || '').slice(0, 128),
      studentName: (entry.studentName || 'Unknown').slice(0, 120),
      fingerprintId: (entry.fingerprintId || '').slice(0, 64),
      direction: entry.direction,
      decision: entry.decision,
      reason: entry.reason.slice(0, 200),
      timestamp: serverTimestamp(),
    });
    return { id: ref.id };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'access_logs');
  }
}
