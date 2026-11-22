import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  isPasswordAdminSessionActive,
  subscribePasswordAdminBundle,
} from '../lib/adminSessionToken';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import type {
  AdminProfile,
  BaseShiftSlot,
  SeatRecord,
  SeatShiftOccupant,
  SeatStatus,
  ShiftType,
  StudentRecord,
} from '../types/domain';

export const BASE_SHIFT_SLOTS: { id: BaseShiftSlot; short: string; label: string; window: string }[] = [
  { id: 'morning', short: 'M', label: 'Morning', window: '06:00 AM – 12:00 PM' },
  { id: 'noon', short: 'N', label: 'Noon', window: '12:00 PM – 06:00 PM' },
  { id: 'evening', short: 'E', label: 'Evening', window: '04:00 PM – 10:00 PM' },
  { id: 'night', short: 'Nt', label: 'Night', window: '10:00 PM – 06:00 AM' },
];

export const DOUBLE_SHIFT_PRESETS: { id: string; label: string; slots: BaseShiftSlot[] }[] = [
  { id: 'morning_noon', label: 'Morning + Noon', slots: ['morning', 'noon'] },
  { id: 'noon_evening', label: 'Noon + Evening', slots: ['noon', 'evening'] },
  { id: 'evening_night', label: 'Evening + Night', slots: ['evening', 'night'] },
  { id: 'morning_evening', label: 'Morning + Evening', slots: ['morning', 'evening'] },
];

export function getSlotsForShiftType(
  shiftType: ShiftType,
  doublePresetId = 'morning_noon',
): BaseShiftSlot[] {
  switch (shiftType) {
    case 'morning':
      return ['morning'];
    case 'noon':
      return ['noon'];
    case 'evening':
      return ['evening'];
    case 'night':
      return ['night'];
    case 'double': {
      const preset = DOUBLE_SHIFT_PRESETS.find((p) => p.id === doublePresetId);
      return preset ? preset.slots : ['morning', 'noon'];
    }
    case 'triple':
      return ['morning', 'noon', 'evening'];
    case 'all_shifts':
      return ['morning', 'noon', 'evening', 'night'];
  }
}

function computeNonFixedStatus(slots: Partial<Record<BaseShiftSlot, SeatShiftOccupant>>): SeatStatus {
  const occupiedCount = BASE_SHIFT_SLOTS.filter((s) => Boolean(slots[s.id])).length;
  if (occupiedCount === 0) return 'available';
  if (occupiedCount >= BASE_SHIFT_SLOTS.length) return 'occupied';
  return 'partial';
}

async function appendSeatAudit(
  actor: AdminProfile,
  action: string,
  seatId: string,
  summary: string,
): Promise<void> {
  try {
    await addDoc(collection(db, 'audit_logs'), {
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: action.slice(0, 80),
      resourceType: 'seats',
      resourceId: seatId.slice(0, 128),
      summary: summary.slice(0, 400),
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'audit_logs');
  }
}

export function subscribeSeats(onData: (seats: SeatRecord[]) => void): Unsubscribe {
  if (isPasswordAdminSessionActive()) {
    return subscribePasswordAdminBundle((bundle) => {
      const sorted = [...(bundle.seats || [])].sort((a, b) => a.seatNumber - b.seatNumber);
      onData(sorted);
    });
  }
  const q = query(collection(db, 'seats'), orderBy('seatNumber', 'asc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const seats: SeatRecord[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<SeatRecord, 'id'>),
      }));
      onData(seats);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'seats');
    },
  );
}

/**
 * Idempotently initializes all 120 physical seats (Hall 1: H1-01..H1-80, Hall 2: H2-01..H2-40).
 * Never overwrites existing seats.
 */
export async function initializeLibrarySeats(actor: AdminProfile): Promise<{ createdCount: number }> {
  try {
    const existingSnap = await getDocs(collection(db, 'seats'));
    const existingIds = new Set(existingSnap.docs.map((d) => d.id));

    const batch = writeBatch(db);
    let createdCount = 0;

    // Hall 1: 80 seats (Rows A-H, 10 seats per row)
    for (let i = 1; i <= 80; i++) {
      const seatCode = `H1-${String(i).padStart(2, '0')}`;
      if (existingIds.has(seatCode)) continue;
      const rowLetter = String.fromCharCode(65 + Math.floor((i - 1) / 10));
      batch.set(doc(db, 'seats', seatCode), {
        seatCode,
        hall: 'Hall 1',
        seatNumber: i,
        rowLabel: `Row ${rowLetter}`,
        seatType: i <= 40 ? 'fixed' : 'non_fixed',
        status: 'available',
        assignedStudentUid: '',
        assignedStudentId: '',
        assignedStudentName: '',
        shiftSlots: {},
        updatedAt: serverTimestamp(),
      });
      createdCount++;
    }

    // Hall 2: 40 seats (Rows A-D, 10 seats per row)
    for (let i = 1; i <= 40; i++) {
      const seatCode = `H2-${String(i).padStart(2, '0')}`;
      if (existingIds.has(seatCode)) continue;
      const rowLetter = String.fromCharCode(65 + Math.floor((i - 1) / 10));
      batch.set(doc(db, 'seats', seatCode), {
        seatCode,
        hall: 'Hall 2',
        seatNumber: 80 + i,
        rowLabel: `Row ${rowLetter}`,
        seatType: i <= 20 ? 'fixed' : 'non_fixed',
        status: 'available',
        assignedStudentUid: '',
        assignedStudentId: '',
        assignedStudentName: '',
        shiftSlots: {},
        updatedAt: serverTimestamp(),
      });
      createdCount++;
    }

    if (createdCount > 0) {
      await batch.commit();
      await appendSeatAudit(
        actor,
        'INITIALIZE_SEATS',
        'ALL_120',
        `Initialized ${createdCount} seat documents across Hall 1 (80) and Hall 2 (40).`,
      );
    }

    return { createdCount };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'seats');
  }
}

export interface AssignSeatInput {
  seatId: string;
  studentId: string;
  seatMode: 'fixed' | 'non_fixed';
  shiftType: ShiftType;
  doublePresetId?: string;
}

/**
 * Transactional seat assignment with conflict guard & automatic prior-seat release on transfer.
 */
export async function assignSeatTransaction(
  input: AssignSeatInput,
  actor: AdminProfile,
): Promise<{ transferredFrom?: string; seatCode: string; studentName: string }> {
  const requiredSlots = getSlotsForShiftType(input.shiftType, input.doublePresetId);
  let auditSummary = '';
  let transferredFrom: string | undefined;
  let studentNameOut = '';

  try {
    await runTransaction(db, async (tx) => {
      const seatRef = doc(db, 'seats', input.seatId);
      const studentRef = doc(db, 'students', input.studentId);

      const [seatSnap, studentSnap] = await Promise.all([tx.get(seatRef), tx.get(studentRef)]);

      if (!seatSnap.exists()) {
        throw new Error(`Seat ${input.seatId} does not exist. Initialize the 120-seat layout first.`);
      }
      if (!studentSnap.exists()) {
        throw new Error('Selected student record could not be found.');
      }

      const seat = { id: seatSnap.id, ...(seatSnap.data() as Omit<SeatRecord, 'id'>) };
      const student = { id: studentSnap.id, ...(studentSnap.data() as Omit<StudentRecord, 'id'>) };
      studentNameOut = student.fullName;

      if (seat.status === 'maintenance') {
        throw new Error(`Seat ${seat.seatCode} is currently locked for maintenance.`);
      }

      // Check previous seat if student is transferring
      const prevSeatId = student.seatId && student.seatId !== input.seatId ? student.seatId : '';
      let prevSeatSnap = null;
      if (prevSeatId) {
        const prevRef = doc(db, 'seats', prevSeatId);
        const snap = await tx.get(prevRef);
        if (snap.exists()) {
          prevSeatSnap = snap;
          transferredFrom = prevSeatId;
        }
      }

      const existingSlots: Partial<Record<BaseShiftSlot, SeatShiftOccupant>> = {
        ...(seat.shiftSlots || {}),
      };

      // Remove this same student's older slots on the SAME seat before re-checking
      for (const slotKey of Object.keys(existingSlots) as BaseShiftSlot[]) {
        if (existingSlots[slotKey]?.studentId === student.id) {
          delete existingSlots[slotKey];
        }
      }

      const hasOtherSlotOccupants = Object.values(existingSlots).some(
        (occ) => occ && occ.studentId !== student.id,
      );

      if (input.seatMode === 'fixed') {
        if (seat.assignedStudentId && seat.assignedStudentId !== student.id) {
          throw new Error(
            `Seat ${seat.seatCode} is already reserved (Fixed) by ${seat.assignedStudentName || 'another student'}.`,
          );
        }
        if (hasOtherSlotOccupants) {
          throw new Error(
            `Seat ${seat.seatCode} has active shared-shift occupants. Release existing shift occupants before assigning as a Fixed seat.`,
          );
        }
      } else {
        // Non-fixed shared seat conflict check
        if (
          seat.seatType === 'fixed' &&
          seat.assignedStudentId &&
          seat.assignedStudentId !== student.id
        ) {
          throw new Error(
            `Seat ${seat.seatCode} is a Fixed seat occupied by ${seat.assignedStudentName || 'another student'}.`,
          );
        }
        for (const slot of requiredSlots) {
          const occupant = existingSlots[slot];
          if (occupant && occupant.studentId !== student.id) {
            throw new Error(
              `Shift conflict on ${seat.seatCode}: ${slot} shift is already assigned to ${occupant.studentName}.`,
            );
          }
        }
      }

      // Release student from previous seat atomically (if transferring)
      if (prevSeatSnap) {
        const prevSeat = prevSeatSnap.data() as Omit<SeatRecord, 'id'>;
        const prevSlots: Partial<Record<BaseShiftSlot, SeatShiftOccupant>> = {
          ...(prevSeat.shiftSlots || {}),
        };
        for (const key of Object.keys(prevSlots) as BaseShiftSlot[]) {
          if (prevSlots[key]?.studentId === student.id) {
            delete prevSlots[key];
          }
        }
        const clearingFixedOwner = prevSeat.assignedStudentId === student.id;
        const nextPrevStatus: SeatStatus =
          prevSeat.status === 'maintenance'
            ? 'maintenance'
            : prevSeat.seatType === 'fixed'
              ? clearingFixedOwner
                ? 'available'
                : prevSeat.status
              : computeNonFixedStatus(prevSlots);

        tx.update(prevSeatSnap.ref, {
          assignedStudentId: clearingFixedOwner ? '' : (prevSeat.assignedStudentId || ''),
          assignedStudentUid: clearingFixedOwner ? '' : (prevSeat.assignedStudentUid || ''),
          assignedStudentName: clearingFixedOwner ? '' : (prevSeat.assignedStudentName || ''),
          shiftSlots: prevSlots,
          status: nextPrevStatus,
          updatedAt: serverTimestamp(),
        });
      }

      // Write target seat
      if (input.seatMode === 'fixed') {
        tx.update(seatRef, {
          seatType: 'fixed',
          status: 'occupied',
          assignedStudentId: student.id,
          assignedStudentUid: student.uid || '',
          assignedStudentName: student.fullName,
          shiftSlots: {},
          updatedAt: serverTimestamp(),
        });
      } else {
        const occupantRecord: SeatShiftOccupant = {
          studentId: student.id,
          studentUid: student.uid || '',
          studentName: student.fullName,
          registrationNo: student.registrationNo,
          shiftType: input.shiftType,
        };
        for (const slot of requiredSlots) {
          existingSlots[slot] = occupantRecord;
        }
        const nextStatus = computeNonFixedStatus(existingSlots);
        const firstOccupant = Object.values(existingSlots)[0];
        tx.update(seatRef, {
          seatType: 'non_fixed',
          status: nextStatus,
          assignedStudentId: firstOccupant?.studentId || '',
          assignedStudentUid: firstOccupant?.studentUid || '',
          assignedStudentName: firstOccupant?.studentName || '',
          shiftSlots: existingSlots,
          updatedAt: serverTimestamp(),
        });
      }

      // Synchronize student record
      tx.update(studentRef, {
        seatMode: input.seatMode,
        seatId: seat.seatCode,
        hall: seat.hall,
        shiftType: input.shiftType,
        updatedAt: serverTimestamp(),
      });

      auditSummary = transferredFrom
        ? `Transferred ${student.fullName} (${student.registrationNo}) from ${transferredFrom} to ${seat.seatCode} (${input.seatMode}, ${input.shiftType}).`
        : `Assigned ${student.fullName} (${student.registrationNo}) to ${seat.seatCode} (${input.seatMode}, ${input.shiftType}).`;
    });

    await appendSeatAudit(
      actor,
      transferredFrom ? 'TRANSFER_SEAT' : 'ASSIGN_SEAT',
      input.seatId,
      auditSummary,
    );

    return { transferredFrom, seatCode: input.seatId, studentName: studentNameOut };
  } catch (err) {
    if (err instanceof Error && !err.message.includes('Missing or insufficient permissions')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `seats/${input.seatId}`);
  }
}

/**
 * Releases a student from a seat atomically and marks the student as unseated.
 */
export async function releaseSeatTransaction(
  seatId: string,
  studentId: string,
  actor: AdminProfile,
): Promise<{ studentName: string }> {
  let releasedName = 'Student';

  try {
    await runTransaction(db, async (tx) => {
      const seatRef = doc(db, 'seats', seatId);
      const studentRef = doc(db, 'students', studentId);

      const [seatSnap, studentSnap] = await Promise.all([tx.get(seatRef), tx.get(studentRef)]);
      if (!seatSnap.exists()) {
        throw new Error(`Seat ${seatId} not found.`);
      }

      const seat = seatSnap.data() as Omit<SeatRecord, 'id'>;
      const nextSlots: Partial<Record<BaseShiftSlot, SeatShiftOccupant>> = {
        ...(seat.shiftSlots || {}),
      };

      for (const key of Object.keys(nextSlots) as BaseShiftSlot[]) {
        if (nextSlots[key]?.studentId === studentId) {
          releasedName = nextSlots[key]?.studentName || releasedName;
          delete nextSlots[key];
        }
      }

      if (seat.assignedStudentId === studentId && seat.assignedStudentName) {
        releasedName = seat.assignedStudentName;
      }

      if (seat.seatType === 'fixed') {
        tx.update(seatRef, {
          status: seat.status === 'maintenance' ? 'maintenance' : 'available',
          assignedStudentId: '',
          assignedStudentUid: '',
          assignedStudentName: '',
          shiftSlots: {},
          updatedAt: serverTimestamp(),
        });
      } else {
        const remaining = Object.values(nextSlots);
        const nextPrimary = remaining[0];
        tx.update(seatRef, {
          status: seat.status === 'maintenance' ? 'maintenance' : computeNonFixedStatus(nextSlots),
          assignedStudentId: nextPrimary?.studentId || '',
          assignedStudentUid: nextPrimary?.studentUid || '',
          assignedStudentName: nextPrimary?.studentName || '',
          shiftSlots: nextSlots,
          updatedAt: serverTimestamp(),
        });
      }

      if (studentSnap.exists()) {
        const stData = studentSnap.data() as StudentRecord;
        releasedName = stData.fullName || releasedName;
        if (stData.seatId === seatId) {
          tx.update(studentRef, {
            seatMode: 'unseated',
            seatId: '',
            hall: 'Unassigned',
            updatedAt: serverTimestamp(),
          });
        }
      }
    });

    await appendSeatAudit(
      actor,
      'RELEASE_SEAT',
      seatId,
      `Released ${releasedName} from seat ${seatId} and moved student to unseated queue.`,
    );

    return { studentName: releasedName };
  } catch (err) {
    if (err instanceof Error && !err.message.includes('Missing or insufficient permissions')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `seats/${seatId}`);
  }
}

export async function toggleSeatMaintenanceTransaction(
  seatId: string,
  enableMaintenance: boolean,
  actor: AdminProfile,
): Promise<void> {
  try {
    await runTransaction(db, async (tx) => {
      const seatRef = doc(db, 'seats', seatId);
      const seatSnap = await tx.get(seatRef);
      if (!seatSnap.exists()) throw new Error(`Seat ${seatId} not found.`);

      const seat = seatSnap.data() as Omit<SeatRecord, 'id'>;
      const hasOccupant =
        Boolean(seat.assignedStudentId) ||
        Object.keys(seat.shiftSlots || {}).length > 0;

      if (enableMaintenance && hasOccupant) {
        throw new Error('Release all assigned students before putting this seat under maintenance.');
      }

      tx.update(seatRef, {
        status: enableMaintenance ? 'maintenance' : 'available',
        updatedAt: serverTimestamp(),
      });
    });

    await appendSeatAudit(
      actor,
      enableMaintenance ? 'SEAT_MAINTENANCE_ON' : 'SEAT_MAINTENANCE_OFF',
      seatId,
      `${enableMaintenance ? 'Locked' : 'Restored'} seat ${seatId} ${enableMaintenance ? 'for maintenance' : 'to available'}.`,
    );
  } catch (err) {
    if (err instanceof Error && !err.message.includes('Missing or insufficient permissions')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.UPDATE, `seats/${seatId}`);
  }
}

export async function toggleSeatTypeTransaction(
  seatId: string,
  nextSeatType: 'fixed' | 'non_fixed',
  actor: AdminProfile,
): Promise<void> {
  try {
    await runTransaction(db, async (tx) => {
      const seatRef = doc(db, 'seats', seatId);
      const seatSnap = await tx.get(seatRef);
      if (!seatSnap.exists()) throw new Error(`Seat ${seatId} not found.`);

      const seat = seatSnap.data() as Omit<SeatRecord, 'id'>;
      const hasOccupant =
        Boolean(seat.assignedStudentId) ||
        Object.keys(seat.shiftSlots || {}).length > 0;

      if (hasOccupant) {
        throw new Error('Release current occupant(s) before changing seat mode between Fixed and Non-Fixed.');
      }

      tx.update(seatRef, {
        seatType: nextSeatType,
        updatedAt: serverTimestamp(),
      });
    });

    await appendSeatAudit(
      actor,
      'UPDATE_SEAT_TYPE',
      seatId,
      `Switched seat ${seatId} type to ${nextSeatType.replace('_', ' ')}.`,
    );
  } catch (err) {
    if (err instanceof Error && !err.message.includes('Missing or insufficient permissions')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.UPDATE, `seats/${seatId}`);
  }
}
