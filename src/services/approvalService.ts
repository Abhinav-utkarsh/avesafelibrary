import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  activateRegistrationStudentPassword,
  dispatchAdminPortalAction,
  isPasswordAdminSessionActive,
  subscribePasswordAdminBundle,
} from '../lib/adminSessionToken';
import {
  isPasswordStudentSessionActive,
  submitStudentChangeRequestViaApi,
  subscribePasswordStudentBundle,
} from '../lib/studentSessionToken';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import { assignSeatTransaction } from './seatService';
import { addDaysIsoDate, createStudentRecord } from './studentService';
import { isValidFirestoreId } from './communicationService';
import {
  SHIFT_DEFINITIONS,
  type AdminProfile,
  type HallName,
  type SeatMode,
  type ShiftType,
  type StudentApprovalRequestRecord,
  type StudentRecord,
} from '../types/domain';

export function getDefaultMonthlyFee(shiftType: ShiftType, seatMode: SeatMode): number {
  const def = SHIFT_DEFINITIONS.find((s) => s.id === shiftType) || SHIFT_DEFINITIONS[0];
  return seatMode === 'fixed' ? def.defaultFeeFixed : def.defaultFeeNonFixed;
}

function toMillisSafe(ts?: { toMillis?: () => number }): number {
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
}

function sortApprovalRequestsStable(
  items: StudentApprovalRequestRecord[],
): StudentApprovalRequestRecord[] {
  const fallbackMs = Date.now();
  return [...items].sort((a, b) => {
    const diff = (toMillisSafe(b.createdAt) || fallbackMs) - (toMillisSafe(a.createdAt) || fallbackMs);
    if (diff !== 0) return diff;
    return (a.id || a.referenceNo).localeCompare(b.id || b.referenceNo);
  });
}

export function subscribeAllApprovalRequests(
  onData: (requests: StudentApprovalRequestRecord[]) => void,
): Unsubscribe {
  if (isPasswordAdminSessionActive()) {
    return subscribePasswordAdminBundle((bundle) => {
      onData(sortApprovalRequestsStable(bundle.approvalRequests || []));
    });
  }

  const q = collection(db, 'student_approval_requests');
  return onSnapshot(
    q,
    (snapshot) => {
      const list: StudentApprovalRequestRecord[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<StudentApprovalRequestRecord, 'id'>),
      }));
      onData(sortApprovalRequestsStable(list));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'student_approval_requests');
    },
  );
}

export function subscribeOwnApprovalRequests(
  studentUid: string,
  onData: (requests: StudentApprovalRequestRecord[]) => void,
): Unsubscribe {
  if (isPasswordStudentSessionActive()) {
    return subscribePasswordStudentBundle((bundle) => {
      const sorted = [...(bundle.approvalRequests || [])].sort(
        (a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt),
      );
      onData(sorted);
    });
  }

  if (!studentUid) {
    onData([]);
    return () => undefined;
  }

  const q = query(
    collection(db, 'student_approval_requests'),
    where('studentUid', '==', studentUid),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: StudentApprovalRequestRecord[] = snapshot.docs
        .map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<StudentApprovalRequestRecord, 'id'>),
        }))
        .sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'student_approval_requests');
    },
  );
}

export interface SubmitSeatShiftChangeInput {
  requestedSeatMode: SeatMode;
  requestedHall: HallName;
  requestedSeatId?: string;
  requestedShiftType: ShiftType;
  doublePresetId?: string;
  batchId?: string;
  batchName?: string;
  reason?: string;
}

/**
 * Existing student requests a Seat, Shift, Seat Mode, or Batch/Course change.
 * ALWAYS goes strictly to Admin Approval Queue — never modifies /students or /seats directly.
 */
export async function submitStudentSeatShiftChangeRequest(
  student: StudentRecord,
  input: SubmitSeatShiftChangeInput,
): Promise<{ id: string; referenceNo: string }> {
  if (isPasswordStudentSessionActive()) {
    return submitStudentChangeRequestViaApi(input);
  }

  if (!student.uid) {
    throw new Error('Unable to verify your student account session. Please sign in again.');
  }

  const now = new Date();
  const referenceNo = `CHG-${now.getFullYear()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const requestedSeatId =
    input.requestedSeatMode === 'unseated'
      ? ''
      : (input.requestedSeatId || '').trim().toUpperCase();
  const requestedHall: HallName =
    input.requestedSeatMode === 'unseated' ? 'Unassigned' : input.requestedHall;
  const estimatedMonthlyFee = getDefaultMonthlyFee(
    input.requestedShiftType,
    input.requestedSeatMode,
  );

  try {
    const docRef = await addDoc(collection(db, 'student_approval_requests'), {
      referenceNo,
      requestType: 'seat_shift_change',
      status: 'pending',
      studentId: student.id,
      studentUid: student.uid,
      registrationNo: student.registrationNo || '',
      fullName: student.fullName,
      phone: student.phone,
      email: student.email || '',
      ...(student.gender ? { gender: student.gender } : {}),
      dateOfBirth: student.dateOfBirth || '',
      guardianName: student.guardianName || '',
      guardianPhone: student.guardianPhone || '',
      address: student.address || '',
      batchId: (input.batchId ?? student.batchId ?? '').slice(0, 128),
      batchName: (input.batchName ?? student.batchName ?? '').slice(0, 100),
      currentHall: student.hall,
      currentSeatId: student.seatId || '',
      currentSeatMode: student.seatMode,
      currentShiftType: student.shiftType,
      requestedHall,
      requestedSeatId,
      requestedSeatMode: input.requestedSeatMode,
      requestedShiftType: input.requestedShiftType,
      doublePresetId: input.doublePresetId || 'morning_noon',
      estimatedMonthlyFee,
      hasPortalPassword: false,
      reason: (input.reason || '').trim().slice(0, 500),
      reviewedBy: '',
      reviewNote: '',
      approvedStudentId: '',
      approvedRegistrationNo: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id: docRef.id, referenceNo };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'student_approval_requests');
  }
}

async function appendApprovalAudit(
  actor: AdminProfile,
  action: string,
  resourceId: string,
  summary: string,
): Promise<void> {
  if (isPasswordAdminSessionActive()) return;
  try {
    await addDoc(collection(db, 'audit_logs'), {
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: action.slice(0, 80),
      resourceType: 'student_approval_requests',
      resourceId: resourceId.slice(0, 128),
      summary: summary.slice(0, 400),
      timestamp: serverTimestamp(),
    });
  } catch {
    // Non-blocking audit
  }
}

/**
 * Admin approves either:
 * 1) A public `new_registration` application: creates official Student record, assigns requested seat
 *    atomically if chosen, activates applicant's pre-hashed portal password, marks request approved,
 *    and sends a Welcome popup notification.
 * 2) An existing student's `seat_shift_change` request: executes atomic `assignSeatTransaction`
 *    (if a seat is requested) or releases old seat, updates student's shift/mode/fee/batch,
 *    marks request approved, and sends a confirmation popup notification.
 */
export async function approveStudentApprovalRequest(
  request: StudentApprovalRequestRecord,
  actor: AdminProfile,
  options?: { reviewNote?: string; monthlyFeeOverride?: number; assignSeatNow?: boolean },
): Promise<{ studentId: string; registrationNo: string; seatWarning?: string }> {
  if (request.status !== 'pending') {
    throw new Error(`This request is already ${request.status}.`);
  }

  const reviewNote = (options?.reviewNote || 'Approved by Admin').trim().slice(0, 400);
  const monthlyFee =
    typeof options?.monthlyFeeOverride === 'number' && options.monthlyFeeOverride >= 0
      ? options.monthlyFeeOverride
      : Number(request.estimatedMonthlyFee) ||
        getDefaultMonthlyFee(request.requestedShiftType, request.requestedSeatMode);

  if (isPasswordAdminSessionActive()) {
    // Password-authenticated Admin queues approval decision; Google Admin sync commits full Firestore transaction
    await dispatchAdminPortalAction('admin_approval_update', {
      id: request.id,
      status: 'approved',
      reviewedBy: actor.uid,
      reviewNote,
    });
    return {
      studentId: request.studentId || request.id,
      registrationNo: request.registrationNo || request.referenceNo,
      seatWarning:
        'Approved via Password-Admin session. Sign in with Google Admin to run atomic seat transactions if needed.',
    };
  }

  let seatWarning: string | undefined;

  if (request.requestType === 'new_registration') {
    const expiryIso = addDaysIsoDate(30);
    const created = await createStudentRecord(
      {
        fullName: request.fullName,
        phone: request.phone,
        email: request.email || '',
        gender: (request.gender as '' | 'male' | 'female' | 'other' | 'prefer_not_to_say') || '',
        guardianName: request.guardianName || '',
        guardianPhone: request.guardianPhone || '',
        address: request.address || '',
        dateOfBirth: request.dateOfBirth || '',
        batchId: request.batchId || '',
        batchName: request.batchName || '',
        admissionType: 'regular',
        status: 'active',
        seatMode: request.requestedSeatMode,
        seatId: '',
        hall: request.requestedSeatMode === 'unseated' ? 'Unassigned' : request.requestedHall,
        shiftType: request.requestedShiftType,
        membershipExpiry: expiryIso,
        monthlyFee,
        pendingAmount: monthlyFee,
        fingerprintTemplateId: '',
      },
      actor,
    );

    if (
      options?.assignSeatNow !== false &&
      request.requestedSeatId &&
      (request.requestedSeatMode === 'fixed' || request.requestedSeatMode === 'non_fixed')
    ) {
      try {
        await assignSeatTransaction(
          {
            seatId: request.requestedSeatId,
            studentId: created.id,
            seatMode: request.requestedSeatMode,
            shiftType: request.requestedShiftType,
            doublePresetId: request.doublePresetId || 'morning_noon',
          },
          actor,
        );
      } catch (seatErr) {
        seatWarning =
          seatErr instanceof Error
            ? `Student created (${created.registrationNo}), but requested seat ${request.requestedSeatId} could not be locked automatically: ${seatErr.message}. Please assign another seat from Seat Map.`
            : 'Student created, please assign seat manually from Seat Map.';
      }
    }

    // Activate applicant's pre-hashed portal password so they can sign in immediately
    if (request.hasPortalPassword) {
      await activateRegistrationStudentPassword({
        referenceNo: request.referenceNo,
        studentId: created.id,
        registrationNo: created.registrationNo,
        email: request.email || '',
        studentSnapshot: {
          id: created.id,
          uid: '',
          registrationNo: created.registrationNo,
          fullName: request.fullName,
          phone: request.phone,
          email: request.email || '',
          gender: request.gender || undefined,
          dateOfBirth: request.dateOfBirth || '',
          batchId: request.batchId || '',
          batchName: request.batchName || '',
          admissionType: 'regular',
          status: 'active',
          seatMode: request.requestedSeatMode,
          seatId: seatWarning ? '' : request.requestedSeatId || '',
          hall: seatWarning ? 'Unassigned' : request.requestedHall,
          shiftType: request.requestedShiftType,
          membershipExpiry: expiryIso,
          monthlyFee,
          pendingAmount: monthlyFee,
        },
      }).catch(() => undefined);
    }

    await updateDoc(doc(db, 'student_approval_requests', request.id), {
      status: 'approved',
      reviewedBy: actor.uid,
      reviewNote: seatWarning ? `${reviewNote} (Seat note: manual assignment needed)` : reviewNote,
      approvedStudentId: created.id,
      approvedRegistrationNo: created.registrationNo,
      updatedAt: serverTimestamp(),
    });

    // Send Welcome popup notification matched by student doc ID
    await addDoc(collection(db, 'notifications'), {
      recipientUid: created.id,
      recipientRole: 'student',
      title: `Welcome to Av_eSAFE Library! (${created.registrationNo})`,
      message: `Your online registration (${request.referenceNo}) is approved! Registration ID: ${created.registrationNo}${!seatWarning && request.requestedSeatId ? ` · Seat ${request.requestedSeatId} (${request.requestedHall})` : ''}${request.batchName ? ` · Course: ${request.batchName}` : ''}.`,
      type: 'seat',
      read: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }).catch(() => undefined);

    await appendApprovalAudit(
      actor,
      'APPROVE_STUDENT_REGISTRATION',
      request.id,
      `Approved online registration ${request.referenceNo} for ${request.fullName} → ${created.registrationNo}.`,
    );

    return {
      studentId: created.id,
      registrationNo: created.registrationNo,
      seatWarning,
    };
  }

  // Case 2: Existing student's seat / shift / batch change request
  if (!request.studentId) {
    throw new Error('This change request is missing a linked student record.');
  }

  if (
    request.requestedSeatId &&
    (request.requestedSeatMode === 'fixed' || request.requestedSeatMode === 'non_fixed')
  ) {
    await assignSeatTransaction(
      {
        seatId: request.requestedSeatId,
        studentId: request.studentId,
        seatMode: request.requestedSeatMode,
        shiftType: request.requestedShiftType,
        doublePresetId: request.doublePresetId || 'morning_noon',
      },
      actor,
    );
  }

  const studentUpdates: Record<string, unknown> = {
    shiftType: request.requestedShiftType,
    seatMode: request.requestedSeatMode,
    monthlyFee,
    updatedAt: serverTimestamp(),
  };
  if (request.requestedSeatMode === 'unseated') {
    studentUpdates.seatId = '';
    studentUpdates.hall = 'Unassigned';
  }
  if (request.batchName) {
    studentUpdates.batchId = request.batchId || '';
    studentUpdates.batchName = request.batchName;
  }

  await updateDoc(doc(db, 'students', request.studentId), studentUpdates);

  await updateDoc(doc(db, 'student_approval_requests', request.id), {
    status: 'approved',
    reviewedBy: actor.uid,
    reviewNote,
    approvedStudentId: request.studentId,
    approvedRegistrationNo: request.registrationNo || '',
    updatedAt: serverTimestamp(),
  });

  const recipientUid = isValidFirestoreId(request.studentUid)
    ? request.studentUid
    : request.studentId;

  await addDoc(collection(db, 'notifications'), {
    recipientUid,
    recipientRole: 'student',
    title: `Seat / Shift Change Approved (${request.referenceNo})`,
    message: `Your request has been approved by Admin! Updated plan: ${request.requestedShiftType.replace('_', ' ').toUpperCase()} shift${request.requestedSeatId ? ` · Seat ${request.requestedSeatId} (${request.requestedHall})` : ' · Unseated'}${request.batchName ? ` · Course: ${request.batchName}` : ''}.${reviewNote ? ` Note: ${reviewNote}` : ''}`,
    type: 'seat',
    read: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }).catch(() => undefined);

  await appendApprovalAudit(
    actor,
    'APPROVE_SEAT_SHIFT_CHANGE',
    request.id,
    `Approved seat/shift change ${request.referenceNo} for ${request.fullName} (${request.registrationNo}) → ${request.requestedSeatId || 'Unseated'} / ${request.requestedShiftType}.`,
  );

  return {
    studentId: request.studentId,
    registrationNo: request.registrationNo || request.referenceNo,
  };
}

export async function rejectStudentApprovalRequest(
  request: StudentApprovalRequestRecord,
  reviewNote: string,
  actor: AdminProfile,
): Promise<void> {
  if (request.status !== 'pending') {
    throw new Error(`This request is already ${request.status}.`);
  }

  const safeReason =
    reviewNote.trim().slice(0, 400) ||
    'Requested seat or shift could not be accommodated at this time. Please choose another available option.';

  if (isPasswordAdminSessionActive()) {
    await dispatchAdminPortalAction('admin_approval_update', {
      id: request.id,
      status: 'rejected',
      reviewedBy: actor.uid,
      reviewNote: safeReason,
    });
    return;
  }

  try {
    await updateDoc(doc(db, 'student_approval_requests', request.id), {
      status: 'rejected',
      reviewedBy: actor.uid,
      reviewNote: safeReason,
      updatedAt: serverTimestamp(),
    });

    if (request.requestType === 'seat_shift_change' && request.studentId) {
      const recipientUid = isValidFirestoreId(request.studentUid)
        ? request.studentUid
        : request.studentId;
      await addDoc(collection(db, 'notifications'), {
        recipientUid,
        recipientRole: 'student',
        title: `Seat / Shift Change Request Update (${request.referenceNo})`,
        message: `Your seat/shift change request could not be approved: ${safeReason}`,
        type: 'seat',
        read: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(() => undefined);
    }

    await appendApprovalAudit(
      actor,
      'REJECT_APPROVAL_REQUEST',
      request.id,
      `Rejected ${request.requestType} request ${request.referenceNo} for ${request.fullName}: ${safeReason}`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `student_approval_requests/${request.id}`);
  }
}
