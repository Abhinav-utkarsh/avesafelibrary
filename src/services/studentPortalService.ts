import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { apiRequest } from '../lib/api';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import {
  closeStudentTicketViaApi,
  isPasswordStudentSessionActive,
  markStudentNotificationsReadViaApi,
  subscribePasswordStudentBundle,
  updateStudentPortalProfileViaApi,
} from '../lib/studentSessionToken';
import type {
  AttendanceRecord,
  LibrarySettings,
  MembershipRecord,
  NoticeRecord,
  NotificationRecord,
  OnlinePaymentVerificationRecord,
  PaymentRecord,
  StudentGender,
  StudentRecord,
  StudentTicketRecord,
} from '../types/domain';

function toMillisSafe(ts?: { toMillis?: () => number }): number {
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
}

export function subscribeOwnStudentProfile(
  studentDocId: string,
  onData: (student: StudentRecord | null) => void,
): Unsubscribe {
  if (isPasswordStudentSessionActive()) {
    return subscribePasswordStudentBundle((bundle) => {
      onData(bundle.profile || null);
    });
  }

  const ref = doc(db, 'students', studentDocId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData({ id: snap.id, ...(snap.data() as Omit<StudentRecord, 'id'>) });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, `students/${studentDocId}`);
    },
  );
}

export function subscribeOwnMemberships(
  studentUid: string,
  onData: (memberships: MembershipRecord[]) => void,
): Unsubscribe {
  if (isPasswordStudentSessionActive()) {
    return subscribePasswordStudentBundle((bundle) => {
      const sorted = [...bundle.memberships].sort((a, b) =>
        (b.startDate || '').localeCompare(a.startDate || ''),
      );
      onData(sorted);
    });
  }

  const q = query(collection(db, 'memberships'), where('studentUid', '==', studentUid));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: MembershipRecord[] = snapshot.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<MembershipRecord, 'id'>),
        }))
        .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'memberships');
    },
  );
}

export function subscribeOwnPayments(
  studentUid: string,
  onData: (payments: PaymentRecord[]) => void,
): Unsubscribe {
  if (isPasswordStudentSessionActive()) {
    return subscribePasswordStudentBundle((bundle) => {
      const sorted = [...bundle.payments].sort(
        (a, b) => toMillisSafe(b.paidAt) - toMillisSafe(a.paidAt),
      );
      onData(sorted);
    });
  }

  const q = query(collection(db, 'payments'), where('studentUid', '==', studentUid));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: PaymentRecord[] = snapshot.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PaymentRecord, 'id'>),
        }))
        .sort((a, b) => toMillisSafe(b.paidAt) - toMillisSafe(a.paidAt));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'payments');
    },
  );
}

export function subscribeOwnAttendance(
  studentUid: string,
  onData: (records: AttendanceRecord[]) => void,
): Unsubscribe {
  if (isPasswordStudentSessionActive()) {
    return subscribePasswordStudentBundle((bundle) => {
      const sorted = [...bundle.attendance].sort(
        (a, b) => toMillisSafe(b.entryTime) - toMillisSafe(a.entryTime),
      );
      onData(sorted);
    });
  }

  const q = query(collection(db, 'attendance'), where('studentUid', '==', studentUid));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: AttendanceRecord[] = snapshot.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AttendanceRecord, 'id'>),
        }))
        .sort((a, b) => toMillisSafe(b.entryTime) - toMillisSafe(a.entryTime));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'attendance');
    },
  );
}

export function subscribePublishedNotices(
  onData: (notices: NoticeRecord[]) => void,
): Unsubscribe {
  if (isPasswordStudentSessionActive()) {
    return subscribePasswordStudentBundle((bundle) => {
      const sorted = [...bundle.notices].sort(
        (a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt),
      );
      onData(sorted);
    });
  }

  const q = query(collection(db, 'notices'), where('published', '==', true));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: NoticeRecord[] = snapshot.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<NoticeRecord, 'id'>),
        }))
        .sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notices');
    },
  );
}

export function subscribeOwnNotifications(
  studentUid: string,
  onData: (notifications: NotificationRecord[]) => void,
): Unsubscribe {
  if (isPasswordStudentSessionActive()) {
    return subscribePasswordStudentBundle((bundle) => {
      const sorted = [...bundle.notifications].sort(
        (a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt),
      );
      onData(sorted);
    });
  }

  const q = query(collection(db, 'notifications'), where('recipientUid', '==', studentUid));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: NotificationRecord[] = snapshot.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<NotificationRecord, 'id'>),
        }))
        .sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    },
  );
}

export function subscribeLibraryInfo(
  onData: (settings: LibrarySettings | null) => void,
): Unsubscribe {
  if (isPasswordStudentSessionActive()) {
    return subscribePasswordStudentBundle((bundle) => {
      onData(bundle.libraryInfo || null);
    });
  }

  const ref = doc(db, 'settings', 'library_config');
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(snap.data() as LibrarySettings);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/library_config');
    },
  );
}

/**
 * Student-allowed update on own notification: ONLY ['read', 'updatedAt'] per firestore.rules.
 */
export async function markStudentNotificationRead(notificationId: string): Promise<void> {
  if (isPasswordStudentSessionActive()) {
    await markStudentNotificationsReadViaApi([notificationId]);
    return;
  }

  try {
    await updateDoc(doc(db, 'notifications', notificationId), {
      read: true,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

export async function markAllStudentNotificationsRead(
  notifications: NotificationRecord[],
): Promise<number> {
  const unread = notifications.filter((n) => !n.read);
  if (unread.length === 0) return 0;

  if (isPasswordStudentSessionActive()) {
    await markStudentNotificationsReadViaApi(unread.map((n) => n.id));
    return unread.length;
  }

  try {
    const chunkSize = 400;
    for (let i = 0; i < unread.length; i += chunkSize) {
      const slice = unread.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      for (const notif of slice) {
        batch.update(doc(db, 'notifications', notif.id), {
          read: true,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
    return unread.length;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'notifications');
  }
}

interface ValidatePhotoResponse {
  ok: boolean;
  validatedPhotoUrl: string;
  mimeType: string;
  sizeBytes: number;
  validatedAt: string;
}

/**
 * Student-allowed self-service profile update:
 * Works seamlessly for both Firebase Google Sign-In and Admin-set Password sessions.
 */
export async function updateOwnStudentProfile(
  studentId: string,
  studentUid: string,
  changes: {
    gender?: StudentGender | '';
    dateOfBirth?: string;
    photoDataUrl?: string;
    removePhoto?: boolean;
  },
  onProgress?: (percent: number) => void,
): Promise<void> {
  if (isPasswordStudentSessionActive()) {
    onProgress?.(35);
    await updateStudentPortalProfileViaApi({
      gender: changes.gender,
      dateOfBirth: changes.dateOfBirth,
      photoDataUrl: changes.photoDataUrl,
      removePhoto: changes.removePhoto,
    });
    onProgress?.(100);
    return;
  }

  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (changes.gender) {
    payload.gender = changes.gender;
  }
  if (typeof changes.dateOfBirth === 'string') {
    payload.dateOfBirth = changes.dateOfBirth.slice(0, 20);
  }

  onProgress?.(20);

  if (changes.removePhoto) {
    await apiRequest<{ ok: boolean }>('/api/students/profile-photo/authorize', {
      method: 'DELETE',
      requireAuth: true,
      body: JSON.stringify({ studentId, studentUid }),
    });
    onProgress?.(60);
    payload.profilePhotoUrl = '';
    payload.profilePhotoUpdatedAt = serverTimestamp();
  } else if (changes.photoDataUrl) {
    const validated = await apiRequest<ValidatePhotoResponse>(
      '/api/students/profile-photo/validate',
      {
        method: 'POST',
        requireAuth: true,
        body: JSON.stringify({
          studentId,
          studentUid,
          photoDataUrl: changes.photoDataUrl,
        }),
      },
    );
    onProgress?.(70);
    payload.profilePhotoUrl = validated.validatedPhotoUrl;
    payload.profilePhotoUpdatedAt = serverTimestamp();
  }

  try {
    await updateDoc(doc(db, 'students', studentId), payload);
    onProgress?.(100);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `students/${studentId}`);
  }
}

export function subscribeOwnOnlineVerifications(
  studentUid: string,
  onData: (items: OnlinePaymentVerificationRecord[]) => void,
): Unsubscribe {
  if (isPasswordStudentSessionActive()) {
    return subscribePasswordStudentBundle((bundle) => {
      const sorted = [...bundle.verifications].sort(
        (a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt),
      );
      onData(sorted);
    });
  }

  const q = query(
    collection(db, 'online_payment_verifications'),
    where('studentUid', '==', studentUid),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: OnlinePaymentVerificationRecord[] = snapshot.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<OnlinePaymentVerificationRecord, 'id'>),
        }))
        .sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'online_payment_verifications');
    },
  );
}

export function subscribeOwnTickets(
  studentUid: string,
  onData: (items: StudentTicketRecord[]) => void,
): Unsubscribe {
  if (isPasswordStudentSessionActive()) {
    return subscribePasswordStudentBundle((bundle) => {
      const sorted = [...bundle.tickets].sort(
        (a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt),
      );
      onData(sorted);
    });
  }

  const q = query(collection(db, 'student_tickets'), where('studentUid', '==', studentUid));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: StudentTicketRecord[] = snapshot.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<StudentTicketRecord, 'id'>),
        }))
        .sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'student_tickets');
    },
  );
}

export async function closeOwnStudentTicket(ticketId: string): Promise<void> {
  if (isPasswordStudentSessionActive()) {
    await closeStudentTicketViaApi(ticketId);
    return;
  }

  try {
    await updateDoc(doc(db, 'student_tickets', ticketId), {
      status: 'closed',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `student_tickets/${ticketId}`);
  }
}
