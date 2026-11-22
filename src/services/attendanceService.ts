import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { z } from 'zod';
import { db } from '../lib/firebase';
import {
  isPasswordAdminSessionActive,
  subscribePasswordAdminBundle,
} from '../lib/adminSessionToken';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import type {
  AdminProfile,
  AttendanceRecord,
  AttendanceSource,
  StudentRecord,
} from '../types/domain';

export const ATTENDANCE_SOURCES = ['manual', 'smart_door', 'simulator'] as const;

export const checkInSchema = z.object({
  studentId: z.string().min(1, 'Please select a student to check in.').max(128),
  source: z.enum(ATTENDANCE_SOURCES).default('manual'),
  deviceId: z.string().trim().max(64).optional().default(''),
});

export type CheckInInput = z.infer<typeof checkInSchema>;

export function getLocalIsoDate(dateObj = new Date()): string {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDurationMinutes(minutes?: number): string {
  if (typeof minutes !== 'number' || Number.isNaN(minutes) || minutes < 0) {
    return '—';
  }
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${String(mins).padStart(2, '0')}m`;
}

export function computeElapsedMinutes(entryMs?: number, nowMs = Date.now()): number {
  if (!entryMs || Number.isNaN(entryMs)) return 0;
  const diffMins = Math.round((nowMs - entryMs) / 60000);
  return Math.min(1440, Math.max(0, diffMins));
}

async function appendAttendanceAudit(
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
      resourceType: 'attendance',
      resourceId: resourceId.slice(0, 128),
      summary: summary.slice(0, 400),
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'audit_logs');
  }
}

export function subscribeAttendanceRecords(
  onData: (records: AttendanceRecord[]) => void,
): Unsubscribe {
  if (isPasswordAdminSessionActive()) {
    return subscribePasswordAdminBundle((bundle) => {
      onData(bundle.attendance || []);
    });
  }
  const q = query(collection(db, 'attendance'), orderBy('entryTime', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: AttendanceRecord[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<AttendanceRecord, 'id'>),
      }));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'attendance');
    },
  );
}

/**
 * Records a student's library entry with strict duplicate-inside protection.
 */
export async function checkInStudent(
  student: StudentRecord,
  actor: AdminProfile,
  source: AttendanceSource = 'manual',
  deviceId = '',
): Promise<{ id: string }> {
  const parsed = checkInSchema.parse({
    studentId: student.id,
    source,
    deviceId,
  });

  if (student.status === 'suspended' || student.status === 'inactive') {
    throw new Error(
      `Check-in blocked: ${student.fullName} is currently marked as ${student.status}. Update their status first.`,
    );
  }

  try {
    // Query by studentId (single-field index, zero composite index needed) to enforce duplicate-entry guard
    const existingSnap = await getDocs(
      query(collection(db, 'attendance'), where('studentId', '==', parsed.studentId)),
    );
    const activeInside = existingSnap.docs.find((d) => d.data().isInside === true);
    if (activeInside) {
      throw new Error(
        `Duplicate entry prevented: ${student.fullName} is already checked in. Record their exit first.`,
      );
    }

    const todayIso = getLocalIsoDate();
    const payload: Record<string, unknown> = {
      studentId: student.id,
      studentUid: student.uid || '',
      studentName: student.fullName.slice(0, 120),
      date: todayIso,
      entryTime: serverTimestamp(),
      isInside: true,
      source: parsed.source,
      deviceId: parsed.deviceId || '',
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, 'attendance'), payload);

    await appendAttendanceAudit(
      actor,
      'ATTENDANCE_CHECK_IN',
      docRef.id,
      `Checked in ${student.fullName} (${student.registrationNo}) via ${parsed.source}.`,
    );

    return { id: docRef.id };
  } catch (err) {
    if (err instanceof Error && !err.message.includes('Missing or insufficient permissions')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.CREATE, 'attendance');
  }
}

/**
 * Checks out an active inside attendance record, calculating clamped session duration.
 */
export async function checkOutAttendanceRecord(
  record: AttendanceRecord,
  actor: AdminProfile,
): Promise<void> {
  if (!record.isInside) {
    throw new Error(`${record.studentName} is already checked out.`);
  }

  const entryMs = record.entryTime?.toMillis ? record.entryTime.toMillis() : Date.now();
  const durationMinutes = computeElapsedMinutes(entryMs, Date.now());

  try {
    // Exact affectedKeys allowlist in firestore.rules: ['exitTime', 'durationMinutes', 'isInside', 'updatedAt']
    await updateDoc(doc(db, 'attendance', record.id), {
      exitTime: serverTimestamp(),
      durationMinutes,
      isInside: false,
      updatedAt: serverTimestamp(),
    });

    await appendAttendanceAudit(
      actor,
      'ATTENDANCE_CHECK_OUT',
      record.id,
      `Checked out ${record.studentName} after ${formatDurationMinutes(durationMinutes)}.`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `attendance/${record.id}`);
  }
}

/**
 * Batch check-out utility for closing all active inside sessions at desk handover or emergency reset.
 */
export async function checkOutAllInsideRecords(
  insideRecords: AttendanceRecord[],
  actor: AdminProfile,
): Promise<number> {
  const active = insideRecords.filter((r) => r.isInside);
  if (active.length === 0) return 0;

  try {
    const nowMs = Date.now();
    const chunkSize = 400;
    for (let i = 0; i < active.length; i += chunkSize) {
      const slice = active.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      for (const rec of slice) {
        const entryMs = rec.entryTime?.toMillis ? rec.entryTime.toMillis() : nowMs;
        const durationMinutes = computeElapsedMinutes(entryMs, nowMs);
        batch.update(doc(db, 'attendance', rec.id), {
          exitTime: serverTimestamp(),
          durationMinutes,
          isInside: false,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }

    await appendAttendanceAudit(
      actor,
      'ATTENDANCE_BULK_CHECK_OUT',
      'bulk',
      `Checked out ${active.length} active inside student${active.length === 1 ? '' : 's'} in batch.`,
    );

    return active.length;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'attendance');
  }
}
