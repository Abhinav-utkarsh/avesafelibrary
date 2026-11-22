import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { apiRequest } from '../lib/api';
import {
  SHIFT_DEFINITIONS,
  type AdminRole,
  type CardReprintEntry,
  type CardVerificationResponse,
  type IdCardRecord,
  type StudentRecord,
} from '../types/domain';

interface ActorInfo {
  uid: string;
  email: string;
  role: AdminRole;
}

interface PrepareCardResponse {
  ok: boolean;
  cardNumber: string;
  studentId: string;
  registrationNo: string;
  verificationPath: string;
  verificationUrl: string;
  preparedAt: string;
}

export function getShiftDisplayLabel(shiftType: string): string {
  return SHIFT_DEFINITIONS.find((s) => s.id === shiftType)?.label || shiftType;
}

export function buildCardVerificationUrl(cardNumber: string): string {
  const clean = cardNumber.trim().toUpperCase();
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/verify/${encodeURIComponent(clean)}`;
  }
  return `/verify/${encodeURIComponent(clean)}`;
}

export function subscribeIdCards(
  onData: (cards: IdCardRecord[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(db, 'id_cards'), orderBy('issuedAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const records: IdCardRecord[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<IdCardRecord, 'id'>),
      }));
      onData(records);
    },
    (err) => {
      onError?.(err as Error);
    },
  );
}

/**
 * Calls backend to generate a collision-resistant unique card number and clean verification URL.
 */
export async function prepareIdCardMetadata(student: StudentRecord): Promise<PrepareCardResponse> {
  return apiRequest<PrepareCardResponse>('/api/id-cards/prepare', {
    method: 'POST',
    requireAuth: true,
    body: JSON.stringify({
      studentId: student.id,
      registrationNo: student.registrationNo,
      origin: typeof window !== 'undefined' ? window.location.origin : undefined,
    }),
  });
}

/**
 * Public non-PII card verification lookup backed by Express + Firestore REST /card_verifications/{cardNumber}.
 */
export async function verifyIdCardPublic(cardNumber: string): Promise<CardVerificationResponse> {
  return apiRequest<CardVerificationResponse>(
    `/api/id-cards/verify/${encodeURIComponent(cardNumber.trim().toUpperCase())}`,
    {
      method: 'GET',
      requireAuth: false,
    },
  );
}

/**
 * Atomically issues a new student ID card (or reissues one, superseding/invalidating any prior card).
 * Prevents duplicate card numbers and writes both /id_cards/{cardNumber} (admin history)
 * and /card_verifications/{cardNumber} (non-PII public lookup) + updates /students/{studentId}.
 */
export async function issueOrReissueStudentIdCard(
  student: StudentRecord,
  actor: ActorInfo,
  options: { reissueReason?: string } = {},
): Promise<{ cardNumber: string; verificationUrl: string; supersededCardNumber?: string }> {
  // Prepare unique card number via backend; retry once in the vanishingly rare case of collision
  let prepared = await prepareIdCardMetadata(student);
  const existingCheck = await getDoc(doc(db, 'id_cards', prepared.cardNumber));
  if (existingCheck.exists()) {
    prepared = await prepareIdCardMetadata(student);
  }

  const cardNumber = prepared.cardNumber;
  const previousCardNumber =
    student.cardNumber && student.cardNumber !== cardNumber ? student.cardNumber : undefined;

  const batch = writeBatch(db);

  // If student already had a previous card, mark it superseded so old QR codes stop validating
  if (previousCardNumber) {
    const prevCardRef = doc(db, 'id_cards', previousCardNumber);
    const prevCardSnap = await getDoc(prevCardRef);
    if (prevCardSnap.exists()) {
      batch.update(prevCardRef, {
        status: 'superseded',
        revokedReason: options.reissueReason?.trim() || `Superseded by reissued card ${cardNumber}`,
        revokedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const prevVerifyRef = doc(db, 'card_verifications', previousCardNumber);
    const prevVerifySnap = await getDoc(prevVerifyRef);
    if (prevVerifySnap.exists()) {
      batch.update(prevVerifyRef, {
        cardStatus: 'superseded',
        updatedAt: serverTimestamp(),
      });
    }
  }

  const idCardPayload: Record<string, unknown> = {
    cardNumber,
    studentId: student.id,
    registrationNo: student.registrationNo,
    studentName: student.fullName,
    membershipType: student.seatMode,
    shiftType: student.shiftType,
    hall: student.hall,
    status: 'active',
    issuedBy: actor.uid,
    issuedAt: serverTimestamp(),
    reprintCount: 0,
    reprintHistory: [],
    updatedAt: serverTimestamp(),
  };
  if (student.seatId) idCardPayload.seatId = student.seatId;
  if (student.membershipExpiry) idCardPayload.validUntil = student.membershipExpiry;

  const verificationPayload: Record<string, unknown> = {
    cardNumber,
    registrationNo: student.registrationNo,
    studentName: student.fullName,
    membershipType: student.seatMode,
    shiftLabel: getShiftDisplayLabel(student.shiftType),
    hall: student.hall,
    studentStatus: student.status,
    cardStatus: 'active',
    issuedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (student.seatId) verificationPayload.seatId = student.seatId;
  if (student.membershipExpiry) verificationPayload.membershipExpiry = student.membershipExpiry;

  batch.set(doc(db, 'id_cards', cardNumber), idCardPayload);
  batch.set(doc(db, 'card_verifications', cardNumber), verificationPayload);
  batch.update(doc(db, 'students', student.id), {
    cardNumber,
    cardIssuedAt: serverTimestamp(),
    cardStatus: 'active',
    updatedAt: serverTimestamp(),
  });

  const auditRef = doc(collection(db, 'audit_logs'));
  batch.set(auditRef, {
    actorUid: actor.uid,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: previousCardNumber ? 'REISSUE_ID_CARD' : 'ISSUE_ID_CARD',
    resourceType: 'id_card',
    resourceId: cardNumber,
    summary: previousCardNumber
      ? `Reissued ID card ${cardNumber} for ${student.fullName} (${student.registrationNo}), superseding ${previousCardNumber}`
      : `Issued ID card ${cardNumber} for ${student.fullName} (${student.registrationNo})`,
    timestamp: serverTimestamp(),
  });

  await batch.commit();

  return {
    cardNumber,
    verificationUrl: buildCardVerificationUrl(cardNumber),
    supersededCardNumber: previousCardNumber,
  };
}

/**
 * Records a reprint of an existing ID card (updates reprintCount + bounded reprintHistory + audit log).
 */
export async function recordIdCardReprint(
  card: IdCardRecord,
  actor: ActorInfo,
  reason = 'Standard card reprint',
): Promise<void> {
  const existingHistory = Array.isArray(card.reprintHistory) ? card.reprintHistory : [];
  const nextEntry: CardReprintEntry = {
    reprintedAt: new Date().toISOString(),
    reprintedBy: actor.email || actor.uid,
    reason: reason.trim().slice(0, 120) || 'Standard card reprint',
  };
  const boundedHistory = [nextEntry, ...existingHistory].slice(0, 25);

  const batch = writeBatch(db);
  batch.update(doc(db, 'id_cards', card.cardNumber), {
    reprintCount: Math.min(500, (card.reprintCount || 0) + 1),
    reprintHistory: boundedHistory,
    updatedAt: serverTimestamp(),
  });

  const auditRef = doc(collection(db, 'audit_logs'));
  batch.set(auditRef, {
    actorUid: actor.uid,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: 'REPRINT_ID_CARD',
    resourceType: 'id_card',
    resourceId: card.cardNumber,
    summary: `Reprinted ID card ${card.cardNumber} for ${card.studentName} (reprint #${(card.reprintCount || 0) + 1})`,
    timestamp: serverTimestamp(),
  });

  await batch.commit();
}

/**
 * Revokes an active ID card immediately so any QR scan returns REVOKED.
 */
export async function revokeStudentIdCard(
  card: IdCardRecord,
  actor: ActorInfo,
  reason: string,
): Promise<void> {
  const cleanReason = reason.trim().slice(0, 200) || 'Revoked by administrator';
  const batch = writeBatch(db);

  batch.update(doc(db, 'id_cards', card.cardNumber), {
    status: 'revoked',
    revokedReason: cleanReason,
    revokedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const verifyRef = doc(db, 'card_verifications', card.cardNumber);
  const verifySnap = await getDoc(verifyRef);
  if (verifySnap.exists()) {
    batch.update(verifyRef, {
      cardStatus: 'revoked',
      updatedAt: serverTimestamp(),
    });
  }

  const studentRef = doc(db, 'students', card.studentId);
  const studentSnap = await getDoc(studentRef);
  if (studentSnap.exists() && studentSnap.data()?.cardNumber === card.cardNumber) {
    batch.update(studentRef, {
      cardStatus: 'revoked',
      updatedAt: serverTimestamp(),
    });
  }

  const auditRef = doc(collection(db, 'audit_logs'));
  batch.set(auditRef, {
    actorUid: actor.uid,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: 'REVOKE_ID_CARD',
    resourceType: 'id_card',
    resourceId: card.cardNumber,
    summary: `Revoked ID card ${card.cardNumber} for ${card.studentName}: ${cleanReason}`,
    timestamp: serverTimestamp(),
  });

  await batch.commit();
}

/**
 * Keeps /card_verifications/{cardNumber} and /id_cards/{cardNumber} in sync whenever an admin
 * updates a student's name, membership status, expiry date, shift, hall, or seat assignment.
 */
export async function syncStudentCardVerification(
  student: Pick<
    StudentRecord,
    'cardNumber' | 'registrationNo' | 'fullName' | 'seatMode' | 'shiftType' | 'hall' | 'seatId' | 'membershipExpiry' | 'status'
  >,
): Promise<void> {
  if (!student.cardNumber) return;

  const verifyRef = doc(db, 'card_verifications', student.cardNumber);
  const verifySnap = await getDoc(verifyRef);
  if (!verifySnap.exists()) return;

  const batch = writeBatch(db);

  const verifyUpdate: Record<string, unknown> = {
    registrationNo: student.registrationNo,
    studentName: student.fullName,
    membershipType: student.seatMode,
    shiftLabel: getShiftDisplayLabel(student.shiftType),
    hall: student.hall,
    seatId: student.seatId || '',
    membershipExpiry: student.membershipExpiry || '',
    studentStatus: student.status,
    updatedAt: serverTimestamp(),
  };
  batch.update(verifyRef, verifyUpdate);

  const cardRef = doc(db, 'id_cards', student.cardNumber);
  const cardSnap = await getDoc(cardRef);
  if (cardSnap.exists()) {
    batch.update(cardRef, {
      studentName: student.fullName,
      membershipType: student.seatMode,
      shiftType: student.shiftType,
      hall: student.hall,
      seatId: student.seatId || '',
      validUntil: student.membershipExpiry || '',
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();
}
