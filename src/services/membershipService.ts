import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
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
  MembershipRecord,
  MembershipStatus,
  ShiftType,
  StudentRecord,
} from '../types/domain';
import { SHIFT_VALUES } from './studentService';

export const membershipCreateSchema = z.object({
  studentId: z.string().min(1, 'Please select a student.'),
  shiftType: z.enum(SHIFT_VALUES),
  seatMode: z.enum(['fixed', 'non_fixed']),
  seatId: z.string().trim().max(40).optional().default(''),
  startDate: z.string().min(8, 'Start date is required.').max(40),
  endDate: z.string().min(8, 'End date is required.').max(40),
  monthlyFee: z.coerce.number().min(0).max(100000),
  addFeeToPending: z.boolean().default(true),
});

export type MembershipCreateInput = z.infer<typeof membershipCreateSchema>;

export function computeEffectiveMembershipStatus(
  rawStatus: MembershipStatus,
  endDate: string,
): MembershipStatus {
  if (rawStatus === 'cancelled') return 'cancelled';
  const parsed = new Date(`${endDate}T23:59:59`);
  if (Number.isNaN(parsed.getTime())) return rawStatus;
  const days = Math.ceil((parsed.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return 'expired';
  if (days <= 7) return 'expiring_soon';
  return 'active';
}

export function subscribeMemberships(onData: (list: MembershipRecord[]) => void): Unsubscribe {
  if (isPasswordAdminSessionActive()) {
    return subscribePasswordAdminBundle((bundle) => {
      onData(bundle.memberships || []);
    });
  }
  const q = query(collection(db, 'memberships'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const records: MembershipRecord[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<MembershipRecord, 'id'>),
      }));
      onData(records);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'memberships');
    },
  );
}

async function appendMembershipAudit(
  actor: AdminProfile,
  action: string,
  membershipId: string,
  summary: string,
): Promise<void> {
  try {
    await addDoc(collection(db, 'audit_logs'), {
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: action.slice(0, 80),
      resourceType: 'memberships',
      resourceId: membershipId.slice(0, 128),
      summary: summary.slice(0, 400),
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'audit_logs');
  }
}

export async function createMembershipPlan(
  rawInput: MembershipCreateInput,
  student: StudentRecord,
  actor: AdminProfile,
): Promise<{ id: string }> {
  const parsed = membershipCreateSchema.parse(rawInput);
  if (parsed.endDate < parsed.startDate) {
    throw new Error('End date must be on or after the start date.');
  }

  const membershipRef = doc(collection(db, 'memberships'));
  const studentRef = doc(db, 'students', student.id);
  const initialStatus = computeEffectiveMembershipStatus('active', parsed.endDate);

  try {
    await runTransaction(db, async (tx) => {
      const stSnap = await tx.get(studentRef);
      if (!stSnap.exists()) {
        throw new Error('Selected student no longer exists.');
      }
      const stData = stSnap.data() as StudentRecord;

      tx.set(membershipRef, {
        studentId: student.id,
        studentUid: stData.uid || '',
        studentName: stData.fullName,
        shiftType: parsed.shiftType as ShiftType,
        seatMode: parsed.seatMode,
        seatId: parsed.seatId || stData.seatId || '',
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        monthlyFee: Number(parsed.monthlyFee),
        status: initialStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const nextPending = parsed.addFeeToPending
        ? Math.min(500000, (Number(stData.pendingAmount) || 0) + Number(parsed.monthlyFee))
        : Number(stData.pendingAmount) || 0;

      tx.update(studentRef, {
        admissionType: stData.admissionType === 'demo' ? 'regular' : stData.admissionType,
        status: initialStatus === 'expired' ? 'expired' : 'active',
        shiftType: parsed.shiftType,
        seatMode: stData.seatId ? parsed.seatMode : stData.seatMode,
        monthlyFee: Number(parsed.monthlyFee),
        pendingAmount: nextPending,
        membershipExpiry: parsed.endDate,
        updatedAt: serverTimestamp(),
      });
    });

    await appendMembershipAudit(
      actor,
      'CREATE_MEMBERSHIP',
      membershipRef.id,
      `Created ${parsed.shiftType} (${parsed.seatMode}) membership for ${student.fullName} from ${parsed.startDate} to ${parsed.endDate} (₹${parsed.monthlyFee}/mo).`,
    );

    return { id: membershipRef.id };
  } catch (err) {
    if (err instanceof Error && !err.message.includes('Missing or insufficient permissions')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.CREATE, 'memberships');
  }
}

export async function renewMembershipPlan(
  membership: MembershipRecord,
  newEndDate: string,
  monthlyFee: number,
  addFeeToPending: boolean,
  actor: AdminProfile,
): Promise<void> {
  if (newEndDate < membership.startDate) {
    throw new Error('Renewal expiry date cannot precede the start date.');
  }

  const membershipRef = doc(db, 'memberships', membership.id);
  const studentRef = doc(db, 'students', membership.studentId);

  try {
    await runTransaction(db, async (tx) => {
      const [mSnap, stSnap] = await Promise.all([tx.get(membershipRef), tx.get(studentRef)]);
      if (!mSnap.exists()) throw new Error('Membership record not found.');

      tx.update(membershipRef, {
        endDate: newEndDate,
        monthlyFee: Number(monthlyFee),
        status: 'active',
        updatedAt: serverTimestamp(),
      });

      if (stSnap.exists()) {
        const stData = stSnap.data() as StudentRecord;
        const nextPending = addFeeToPending
          ? Math.min(500000, (Number(stData.pendingAmount) || 0) + Number(monthlyFee))
          : Number(stData.pendingAmount) || 0;

        tx.update(studentRef, {
          status: 'active',
          membershipExpiry: newEndDate,
          monthlyFee: Number(monthlyFee),
          pendingAmount: nextPending,
          updatedAt: serverTimestamp(),
        });
      }
    });

    await appendMembershipAudit(
      actor,
      'RENEW_MEMBERSHIP',
      membership.id,
      `Renewed ${membership.studentName} (${membership.shiftType}) through ${newEndDate} at ₹${monthlyFee}/mo.`,
    );
  } catch (err) {
    if (err instanceof Error && !err.message.includes('Missing or insufficient permissions')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.UPDATE, `memberships/${membership.id}`);
  }
}

export async function cancelMembershipPlan(
  membership: MembershipRecord,
  actor: AdminProfile,
): Promise<void> {
  try {
    await updateDoc(doc(db, 'memberships', membership.id), {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
    await appendMembershipAudit(
      actor,
      'CANCEL_MEMBERSHIP',
      membership.id,
      `Cancelled ${membership.shiftType} membership for ${membership.studentName}.`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `memberships/${membership.id}`);
  }
}
