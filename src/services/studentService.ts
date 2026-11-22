import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { z } from 'zod';
import { db } from '../lib/firebase';
import {
  isPasswordAdminSessionActive,
  subscribePasswordAdminBundle,
} from '../lib/adminSessionToken';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import { syncStudentCardVerification } from './idCardService';
import type {
  AdminProfile,
  AdmissionType,
  HallName,
  SeatMode,
  ShiftType,
  StudentGender,
  StudentRecord,
  StudentStatus,
} from '../types/domain';

export const SHIFT_VALUES = [
  'morning',
  'noon',
  'evening',
  'night',
  'double',
  'triple',
  'all_shifts',
] as const;

export const HALL_VALUES = ['Hall 1', 'Hall 2', 'Unassigned'] as const;
export const SEAT_MODE_VALUES = ['fixed', 'non_fixed', 'unseated'] as const;
export const ADMISSION_VALUES = ['regular', 'quick', 'demo'] as const;
export const STUDENT_STATUS_VALUES = [
  'active',
  'expired',
  'demo',
  'suspended',
  'inactive',
] as const;
export const GENDER_VALUES = ['male', 'female', 'other', 'prefer_not_to_say'] as const;

export const studentFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters.')
    .max(120, 'Full name must be under 120 characters.'),
  phone: z
    .string()
    .trim()
    .min(10, 'Phone number must be at least 10 digits.')
    .max(20, 'Phone number must be under 20 characters.')
    .regex(/^[0-9+\-\s()]+$/, 'Phone number contains invalid characters.'),
  email: z
    .string()
    .trim()
    .max(160, 'Email must be under 160 characters.')
    .refine((val) => val === '' || z.string().email().safeParse(val).success, {
      message: 'Please enter a valid email address or leave blank.',
    })
    .optional()
    .default(''),
  gender: z
    .union([z.enum(GENDER_VALUES), z.literal('')])
    .optional()
    .default(''),
  guardianName: z.string().trim().max(120, 'Guardian name too long.').optional().default(''),
  guardianPhone: z.string().trim().max(20, 'Guardian phone too long.').optional().default(''),
  address: z.string().trim().max(300, 'Address must be under 300 characters.').optional().default(''),
  dateOfBirth: z
    .string()
    .trim()
    .max(20, 'Invalid date of birth.')
    .refine((val) => val === '' || /^\d{4}-\d{2}-\d{2}$/.test(val), {
      message: 'Date of birth must be in YYYY-MM-DD format.',
    })
    .optional()
    .default(''),
  batchId: z.string().trim().max(128).optional().default(''),
  batchName: z.string().trim().max(100).optional().default(''),
  admissionType: z.enum(ADMISSION_VALUES),
  status: z.enum(STUDENT_STATUS_VALUES),
  seatMode: z.enum(SEAT_MODE_VALUES),
  seatId: z.string().trim().max(40).optional().default(''),
  hall: z.enum(HALL_VALUES),
  shiftType: z.enum(SHIFT_VALUES),
  membershipExpiry: z.string().trim().max(40).optional().default(''),
  monthlyFee: z.coerce
    .number()
    .min(0, 'Monthly fee cannot be negative.')
    .max(100000, 'Monthly fee exceeds limit.'),
  pendingAmount: z.coerce
    .number()
    .min(0, 'Pending amount cannot be negative.')
    .max(500000, 'Pending amount exceeds limit.'),
  fingerprintTemplateId: z.string().trim().max(64).optional().default(''),
});

export type StudentFormInput = z.infer<typeof studentFormSchema>;

export interface AuditLogSummary {
  id: string;
  actorEmail?: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  summary: string;
  timestampMs: number;
}

export function generateRegistrationNo(admissionType: AdmissionType): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const prefix = admissionType === 'demo' ? 'DEMO' : 'NL';
  return `${prefix}-${yy}${mm}-${suffix}`;
}

export function addDaysIsoDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function getDaysUntilExpiry(expiryIso?: string): number | null {
  if (!expiryIso) return null;
  const parsed = new Date(`${expiryIso}T23:59:59`);
  if (Number.isNaN(parsed.getTime())) return null;
  const diffMs = parsed.getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

async function writeAuditLog(
  actor: AdminProfile,
  action: string,
  resourceType: string,
  resourceId: string,
  summary: string,
): Promise<void> {
  try {
    await addDoc(collection(db, 'audit_logs'), {
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: action.slice(0, 80),
      resourceType: resourceType.slice(0, 60),
      resourceId: resourceId.slice(0, 128),
      summary: summary.slice(0, 400),
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'audit_logs');
  }
}

export async function createStudentRecord(
  rawInput: StudentFormInput,
  actor: AdminProfile,
  initialUid = '',
): Promise<{ id: string; registrationNo: string }> {
  const parsed = studentFormSchema.parse(rawInput);
  const registrationNo = generateRegistrationNo(parsed.admissionType);

  const normalizedEmail = (parsed.email || '').trim().toLowerCase();
  const normalizedSeatMode: SeatMode = parsed.seatMode;
  const normalizedHall: HallName = normalizedSeatMode === 'unseated' ? 'Unassigned' : parsed.hall;
  const normalizedSeatId = normalizedSeatMode === 'unseated' ? '' : (parsed.seatId || '').trim().toUpperCase();

  const payload: Record<string, unknown> = {
    uid: initialUid.trim(),
    registrationNo,
    fullName: parsed.fullName,
    phone: parsed.phone,
    email: normalizedEmail,
    guardianName: parsed.guardianName || '',
    guardianPhone: parsed.guardianPhone || '',
    address: parsed.address || '',
    dateOfBirth: parsed.dateOfBirth || '',
    batchId: parsed.batchId || '',
    batchName: parsed.batchName || '',
    admissionType: parsed.admissionType,
    status: parsed.status,
    seatMode: normalizedSeatMode,
    seatId: normalizedSeatId,
    hall: normalizedHall,
    shiftType: parsed.shiftType as ShiftType,
    membershipExpiry: parsed.membershipExpiry || '',
    monthlyFee: Number(parsed.monthlyFee),
    pendingAmount: Number(parsed.pendingAmount),
    fingerprintTemplateId: parsed.fingerprintTemplateId || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (parsed.gender) {
    payload.gender = parsed.gender as StudentGender;
  }

  try {
    const docRef = await addDoc(collection(db, 'students'), payload);
    const actionName =
      parsed.admissionType === 'demo'
        ? 'DEMO_REGISTER_STUDENT'
        : parsed.admissionType === 'quick'
          ? 'QUICK_REGISTER_STUDENT'
          : 'CREATE_STUDENT';

    await writeAuditLog(
      actor,
      actionName,
      'students',
      docRef.id,
      `Registered ${parsed.fullName} (${registrationNo}) via ${parsed.admissionType} admission (${parsed.shiftType} shift${parsed.batchName ? `, batch: ${parsed.batchName}` : ''}).`,
    );

    return { id: docRef.id, registrationNo };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'students');
  }
}

export async function updateStudentRecord(
  studentId: string,
  rawInput: StudentFormInput,
  actor: AdminProfile,
  existingStudent?: Pick<StudentRecord, 'cardNumber' | 'registrationNo'>,
): Promise<void> {
  const parsed = studentFormSchema.parse(rawInput);
  const normalizedEmail = (parsed.email || '').trim().toLowerCase();
  const normalizedHall: HallName = parsed.seatMode === 'unseated' ? 'Unassigned' : parsed.hall;
  const normalizedSeatId = parsed.seatMode === 'unseated' ? '' : (parsed.seatId || '').trim().toUpperCase();

  const updatePayload: Record<string, unknown> = {
    fullName: parsed.fullName,
    phone: parsed.phone,
    email: normalizedEmail,
    guardianName: parsed.guardianName || '',
    guardianPhone: parsed.guardianPhone || '',
    address: parsed.address || '',
    dateOfBirth: parsed.dateOfBirth || '',
    batchId: parsed.batchId || '',
    batchName: parsed.batchName || '',
    admissionType: parsed.admissionType,
    status: parsed.status,
    seatMode: parsed.seatMode,
    seatId: normalizedSeatId,
    hall: normalizedHall,
    shiftType: parsed.shiftType,
    membershipExpiry: parsed.membershipExpiry || '',
    monthlyFee: Number(parsed.monthlyFee),
    pendingAmount: Number(parsed.pendingAmount),
    fingerprintTemplateId: parsed.fingerprintTemplateId || '',
    updatedAt: serverTimestamp(),
  };
  if (parsed.gender) {
    updatePayload.gender = parsed.gender as StudentGender;
  }

  try {
    await updateDoc(doc(db, 'students', studentId), updatePayload);
    if (existingStudent?.cardNumber && existingStudent?.registrationNo) {
      await syncStudentCardVerification({
        cardNumber: existingStudent.cardNumber,
        registrationNo: existingStudent.registrationNo,
        fullName: parsed.fullName,
        seatMode: parsed.seatMode,
        shiftType: parsed.shiftType,
        hall: normalizedHall,
        seatId: normalizedSeatId,
        membershipExpiry: parsed.membershipExpiry || '',
        status: parsed.status,
      }).catch(() => undefined);
    }
    await writeAuditLog(
      actor,
      'UPDATE_STUDENT',
      'students',
      studentId,
      `Updated student profile for ${parsed.fullName} (status: ${parsed.status}, shift: ${parsed.shiftType}${parsed.batchName ? `, batch: ${parsed.batchName}` : ''}).`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `students/${studentId}`);
  }
}

export async function updateStudentCredentialsRecord(
  student: StudentRecord,
  updates: { email?: string; uid?: string },
  actor: AdminProfile,
  auditSummary?: string,
): Promise<void> {
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (typeof updates.email === 'string') {
    payload.email = updates.email.trim().toLowerCase();
  }
  if (typeof updates.uid === 'string') {
    payload.uid = updates.uid.trim();
  }

  try {
    await updateDoc(doc(db, 'students', student.id), payload);
    await writeAuditLog(
      actor,
      'UPDATE_STUDENT_CREDENTIALS',
      'students',
      student.id,
      auditSummary ||
        `Updated portal login credentials for ${student.fullName} (${student.registrationNo}).`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `students/${student.id}`);
  }
}

export async function updateStudentStatus(
  studentId: string,
  studentName: string,
  status: StudentStatus,
  actor: AdminProfile,
  existingStudent?: StudentRecord,
): Promise<void> {
  try {
    await updateDoc(doc(db, 'students', studentId), {
      status,
      updatedAt: serverTimestamp(),
    });
    if (existingStudent?.cardNumber) {
      await syncStudentCardVerification({
        ...existingStudent,
        status,
      }).catch(() => undefined);
    }
    await writeAuditLog(
      actor,
      'UPDATE_STUDENT_STATUS',
      'students',
      studentId,
      `Changed status for ${studentName} to ${status}.`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `students/${studentId}`);
  }
}

export async function convertDemoStudentToRegular(
  student: StudentRecord,
  monthlyFee: number,
  membershipExpiry: string,
  actor: AdminProfile,
): Promise<void> {
  try {
    await updateDoc(doc(db, 'students', student.id), {
      admissionType: 'regular',
      status: 'active',
      monthlyFee: Math.max(0, Number(monthlyFee)),
      pendingAmount: Math.max(0, Number(monthlyFee)),
      membershipExpiry,
      updatedAt: serverTimestamp(),
    });
    if (student.cardNumber) {
      await syncStudentCardVerification({
        ...student,
        status: 'active',
        membershipExpiry,
      }).catch(() => undefined);
    }
    await writeAuditLog(
      actor,
      'CONVERT_DEMO_STUDENT',
      'students',
      student.id,
      `Converted demo student ${student.fullName} (${student.registrationNo}) to regular membership (₹${monthlyFee}/mo, expires ${membershipExpiry}).`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `students/${student.id}`);
  }
}

export async function deleteStudentRecord(
  studentId: string,
  studentName: string,
  registrationNo: string,
  actor: AdminProfile,
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'students', studentId));
    await writeAuditLog(
      actor,
      'DELETE_STUDENT',
      'students',
      studentId,
      `Deleted student record for ${studentName} (${registrationNo}).`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `students/${studentId}`);
  }
}

export function subscribeStudents(
  onData: (students: StudentRecord[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  if (isPasswordAdminSessionActive()) {
    return subscribePasswordAdminBundle((bundle) => {
      onData(bundle.students || []);
    });
  }
  const q = query(collection(db, 'students'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: StudentRecord[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<StudentRecord, 'id'>),
      }));
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.LIST, 'students');
    },
  );
}

export function subscribeInsideCount(onData: (count: number) => void): Unsubscribe {
  if (isPasswordAdminSessionActive()) {
    return subscribePasswordAdminBundle((bundle) => {
      onData((bundle.attendance || []).filter((a) => a.isInside).length);
    });
  }
  const q = query(collection(db, 'attendance'), where('isInside', '==', true));
  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.size);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'attendance');
    },
  );
}

export function subscribeCurrentMonthCollections(
  onData: (totalCollected: number, paymentCount: number) => void,
): Unsubscribe {
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (isPasswordAdminSessionActive()) {
    return subscribePasswordAdminBundle((bundle) => {
      const monthPays = (bundle.payments || []).filter((p) => p.billingMonth === currentMonthKey);
      const sum = monthPays.reduce((acc, p) => acc + (Number(p.amountPaid) || 0), 0);
      onData(sum, monthPays.length);
    });
  }
  const q = query(collection(db, 'payments'), where('billingMonth', '==', currentMonthKey));
  return onSnapshot(
    q,
    (snapshot) => {
      let sum = 0;
      snapshot.docs.forEach((d) => {
        const amount = Number(d.data().amountPaid || 0);
        if (Number.isFinite(amount)) sum += amount;
      });
      onData(sum, snapshot.size);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'payments');
    },
  );
}

export function subscribeRecentAuditLogs(onData: (logs: AuditLogSummary[]) => void): Unsubscribe {
  if (isPasswordAdminSessionActive()) {
    return subscribePasswordAdminBundle((bundle) => {
      const logs: AuditLogSummary[] = (bundle.auditLogs || []).slice(0, 8).map((d) => ({
        id: d.id,
        actorEmail: d.actorEmail,
        actorRole: d.actorRole || 'admin',
        action: d.action || 'ACTION',
        resourceType: d.resourceType || 'system',
        resourceId: d.resourceId,
        summary: d.summary || '',
        timestampMs:
          d.timestamp && typeof d.timestamp.toMillis === 'function'
            ? d.timestamp.toMillis()
            : Date.now(),
      }));
      onData(logs);
    });
  }
  const q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const logs: AuditLogSummary[] = snapshot.docs.slice(0, 8).map((docSnap) => {
        const d = docSnap.data();
        const ts = d.timestamp && typeof d.timestamp.toMillis === 'function' ? d.timestamp.toMillis() : Date.now();
        return {
          id: docSnap.id,
          actorEmail: d.actorEmail,
          actorRole: d.actorRole || 'admin',
          action: d.action || 'ACTION',
          resourceType: d.resourceType || 'system',
          resourceId: d.resourceId,
          summary: d.summary || '',
          timestampMs: ts,
        };
      });
      onData(logs);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'audit_logs');
    },
  );
}
