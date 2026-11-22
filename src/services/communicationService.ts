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
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { z } from 'zod';
import { db } from '../lib/firebase';
import {
  dispatchAdminPortalAction,
  isPasswordAdminSessionActive,
  subscribePasswordAdminBundle,
} from '../lib/adminSessionToken';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import { getDaysUntilExpiry } from './studentService';
import type {
  AdminProfile,
  NoticeAudience,
  NoticeCategory,
  NoticePriority,
  NoticeRecord,
  NotificationRecord,
  NotificationType,
  StudentRecord,
} from '../types/domain';

export const NOTICE_CATEGORY_VALUES = [
  'general',
  'fee_reminder',
  'schedule',
  'maintenance',
  'exam_alert',
] as const;

export const NOTICE_PRIORITY_VALUES = ['normal', 'important', 'urgent'] as const;

export const NOTICE_AUDIENCE_VALUES = [
  'all',
  'hall_1',
  'hall_2',
  'unseated',
  'expiring',
] as const;

export const NOTIFICATION_TYPE_VALUES = [
  'info',
  'fee_due',
  'expiry',
  'seat',
  'security',
  'door',
  'birthday',
  'ticket',
] as const;

export type BroadcastCohort =
  | 'all_active'
  | 'pending_fees'
  | 'expiring_7d'
  | 'hall_1'
  | 'hall_2'
  | 'unseated'
  | 'demo_trials'
  | 'birthdays_month';

export const BROADCAST_COHORTS: { id: BroadcastCohort; label: string; description: string }[] = [
  { id: 'all_active', label: 'All Active Students', description: 'Active & demo members' },
  { id: 'pending_fees', label: 'Pending Fees Only', description: 'Balance greater than ₹0' },
  { id: 'expiring_7d', label: 'Expiring Within 7 Days', description: 'Upcoming or overdue renewals' },
  { id: 'hall_1', label: 'Hall 1 Students', description: 'Assigned to Hall 1 (80 seats)' },
  { id: 'hall_2', label: 'Hall 2 Students', description: 'Assigned to Hall 2 (40 seats)' },
  { id: 'unseated', label: 'Unseated Students', description: 'Awaiting seat assignment' },
  { id: 'demo_trials', label: 'Demo Trial Students', description: 'Trial admissions for conversion' },
  { id: 'birthdays_month', label: 'Birthdays This Month', description: 'Students celebrating this month' },
];

export const noticeFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'Notice title must be at least 3 characters.')
    .max(160, 'Notice title must be under 160 characters.'),
  body: z
    .string()
    .trim()
    .min(3, 'Notice body must be at least 3 characters.')
    .max(2000, 'Notice body must be under 2000 characters.'),
  category: z.enum(NOTICE_CATEGORY_VALUES),
  priority: z.enum(NOTICE_PRIORITY_VALUES),
  audience: z.enum(NOTICE_AUDIENCE_VALUES),
  published: z.boolean().default(true),
});

export type NoticeFormInput = z.infer<typeof noticeFormSchema>;

export const bulkNotificationSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, 'Title must be at least 2 characters.')
    .max(140, 'Title must be under 140 characters.'),
  message: z
    .string()
    .trim()
    .min(2, 'Message must be at least 2 characters.')
    .max(600, 'Message must be under 600 characters.'),
  type: z.enum(NOTIFICATION_TYPE_VALUES),
});

export type BulkNotificationInput = z.infer<typeof bulkNotificationSchema>;

const VALID_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

export function isValidFirestoreId(val?: string): val is string {
  return typeof val === 'string' && val.length >= 1 && val.length <= 128 && VALID_ID_REGEX.test(val);
}

export function filterStudentsByCohort(
  students: StudentRecord[],
  cohort: BroadcastCohort,
): StudentRecord[] {
  switch (cohort) {
    case 'all_active':
      return students.filter((s) => s.status === 'active' || s.status === 'demo');
    case 'pending_fees':
      return students.filter((s) => Number(s.pendingAmount || 0) > 0);
    case 'expiring_7d':
      return students.filter((s) => {
        const days = getDaysUntilExpiry(s.membershipExpiry);
        return days !== null && days <= 7 && s.status !== 'inactive' && s.status !== 'suspended';
      });
    case 'hall_1':
      return students.filter((s) => s.hall === 'Hall 1');
    case 'hall_2':
      return students.filter((s) => s.hall === 'Hall 2');
    case 'unseated':
      return students.filter((s) => s.seatMode === 'unseated' || !s.seatId);
    case 'demo_trials':
      return students.filter((s) => s.status === 'demo' || s.admissionType === 'demo');
    case 'birthdays_month': {
      const currentMonth = new Date().getMonth() + 1;
      return students.filter((s) => {
        if (!s.dateOfBirth) return false;
        const parts = s.dateOfBirth.split('-');
        return parts.length === 3 && Number(parts[1]) === currentMonth;
      });
    }
    default:
      return students;
  }
}

export function personalizeMessageForStudent(template: string, student: StudentRecord): string {
  return template
    .replace(/\{name\}/gi, student.fullName)
    .replace(/\{regNo\}/gi, student.registrationNo)
    .replace(/\{seat\}/gi, student.seatId || 'Unassigned')
    .replace(/\{hall\}/gi, student.hall)
    .replace(/\{pending\}/gi, `₹${Number(student.pendingAmount || 0).toLocaleString('en-IN')}`)
    .replace(/\{expiry\}/gi, student.membershipExpiry || 'N/A');
}

async function appendCommunicationAudit(
  actor: AdminProfile,
  action: string,
  resourceType: 'notices' | 'notifications' | 'message_templates' | 'student_tickets',
  resourceId: string,
  summary: string,
): Promise<void> {
  try {
    await addDoc(collection(db, 'audit_logs'), {
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: action.slice(0, 80),
      resourceType,
      resourceId: resourceId.slice(0, 128),
      summary: summary.slice(0, 400),
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'audit_logs');
  }
}

export function subscribeNotices(onData: (notices: NoticeRecord[]) => void): Unsubscribe {
  if (isPasswordAdminSessionActive()) {
    return subscribePasswordAdminBundle((bundle) => {
      onData(bundle.notices || []);
    });
  }
  const q = query(collection(db, 'notices'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: NoticeRecord[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<NoticeRecord, 'id'>),
      }));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notices');
    },
  );
}

export function subscribeNotifications(
  onData: (notifications: NotificationRecord[]) => void,
): Unsubscribe {
  if (isPasswordAdminSessionActive()) {
    return subscribePasswordAdminBundle((bundle) => {
      onData(bundle.notifications || []);
    });
  }
  const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: NotificationRecord[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<NotificationRecord, 'id'>),
      }));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    },
  );
}

export async function createNoticeRecord(
  rawInput: NoticeFormInput,
  actor: AdminProfile,
): Promise<{ id: string }> {
  const parsed = noticeFormSchema.parse(rawInput);

  if (isPasswordAdminSessionActive()) {
    const rec = await dispatchAdminPortalAction('admin_notice_create', {
      title: parsed.title,
      body: parsed.body,
      category: parsed.category,
      priority: parsed.priority,
      audience: parsed.audience,
      published: parsed.published,
    });
    return { id: String(rec.id || `ntc_${Date.now()}`) };
  }

  try {
    const docRef = await addDoc(collection(db, 'notices'), {
      title: parsed.title,
      body: parsed.body,
      category: parsed.category as NoticeCategory,
      priority: parsed.priority as NoticePriority,
      audience: parsed.audience as NoticeAudience,
      published: parsed.published,
      publishedBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await appendCommunicationAudit(
      actor,
      parsed.published ? 'PUBLISH_NOTICE' : 'CREATE_NOTICE_DRAFT',
      'notices',
      docRef.id,
      `${parsed.published ? 'Published' : 'Drafted'} notice "${parsed.title}" for audience ${parsed.audience} (${parsed.priority}).`,
    );

    return { id: docRef.id };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'notices');
  }
}

export async function updateNoticeRecord(
  noticeId: string,
  rawInput: NoticeFormInput,
  actor: AdminProfile,
): Promise<void> {
  const parsed = noticeFormSchema.parse(rawInput);

  try {
    // Exact affectedKeys allowlist in firestore.rules: ['title', 'body', 'category', 'priority', 'audience', 'published', 'updatedAt']
    await updateDoc(doc(db, 'notices', noticeId), {
      title: parsed.title,
      body: parsed.body,
      category: parsed.category as NoticeCategory,
      priority: parsed.priority as NoticePriority,
      audience: parsed.audience as NoticeAudience,
      published: parsed.published,
      updatedAt: serverTimestamp(),
    });

    await appendCommunicationAudit(
      actor,
      'UPDATE_NOTICE',
      'notices',
      noticeId,
      `Updated notice "${parsed.title}" (${parsed.published ? 'published' : 'draft'}).`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `notices/${noticeId}`);
  }
}

export async function toggleNoticePublished(
  notice: NoticeRecord,
  actor: AdminProfile,
): Promise<void> {
  const nextPublished = !notice.published;
  try {
    await updateDoc(doc(db, 'notices', notice.id), {
      published: nextPublished,
      updatedAt: serverTimestamp(),
    });

    await appendCommunicationAudit(
      actor,
      nextPublished ? 'PUBLISH_NOTICE' : 'UNPUBLISH_NOTICE',
      'notices',
      notice.id,
      `${nextPublished ? 'Published' : 'Unpublished'} notice "${notice.title}".`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `notices/${notice.id}`);
  }
}

export async function deleteNoticeRecord(
  notice: NoticeRecord,
  actor: AdminProfile,
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'notices', notice.id));
    await appendCommunicationAudit(
      actor,
      'DELETE_NOTICE',
      'notices',
      notice.id,
      `Deleted notice "${notice.title}".`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `notices/${notice.id}`);
  }
}

/**
 * Dispatches personalized in-app notifications (and login popups!) to all targeted students,
 * supporting BOTH Google-linked students (via student.uid) and Password-login students (via student.id).
 */
export async function dispatchBulkStudentNotifications(
  students: StudentRecord[],
  rawInput: BulkNotificationInput,
  actor: AdminProfile,
): Promise<{ sentCount: number; skippedUnlinked: number }> {
  const parsed = bulkNotificationSchema.parse(rawInput);

  const reachableStudents = students.filter(
    (s) => isValidFirestoreId(s.uid) || isValidFirestoreId(s.id),
  );
  const skippedUnlinked = students.length - reachableStudents.length;

  if (reachableStudents.length === 0) {
    throw new Error(
      'No valid student records found in the selected cohort.',
    );
  }

  if (isPasswordAdminSessionActive()) {
    for (const student of reachableStudents) {
      const recipientUid = isValidFirestoreId(student.uid) ? student.uid : student.id;
      const personalizedMsg = personalizeMessageForStudent(parsed.message, student).slice(0, 600);
      await dispatchAdminPortalAction('admin_notification_create', {
        recipientUid,
        recipientRole: 'student',
        title: parsed.title.slice(0, 140),
        message: personalizedMsg.length >= 2 ? personalizedMsg : parsed.message,
        type: parsed.type,
      });
    }
    return { sentCount: reachableStudents.length, skippedUnlinked };
  }

  try {
    const chunkSize = 400;
    for (let i = 0; i < reachableStudents.length; i += chunkSize) {
      const slice = reachableStudents.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      for (const student of slice) {
        const recipientUid = isValidFirestoreId(student.uid) ? student.uid : student.id;
        const notifRef = doc(collection(db, 'notifications'));
        const personalizedMsg = personalizeMessageForStudent(parsed.message, student).slice(0, 600);
        batch.set(notifRef, {
          recipientUid,
          recipientRole: 'student',
          title: parsed.title.slice(0, 140),
          message: personalizedMsg.length >= 2 ? personalizedMsg : parsed.message,
          type: parsed.type as NotificationType,
          read: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }

    await appendCommunicationAudit(
      actor,
      'DISPATCH_BULK_NOTIFICATIONS',
      'notifications',
      'bulk',
      `Dispatched "${parsed.title}" (${parsed.type}) to ${reachableStudents.length} student portal account${reachableStudents.length === 1 ? '' : 's'}.`,
    );

    return { sentCount: reachableStudents.length, skippedUnlinked };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'notifications');
  }
}

export async function deleteNotificationRecord(
  notification: NotificationRecord,
  actor: AdminProfile,
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'notifications', notification.id));
    await appendCommunicationAudit(
      actor,
      'DELETE_NOTIFICATION',
      'notifications',
      notification.id,
      `Removed notification "${notification.title}".`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `notifications/${notification.id}`);
  }
}

export async function sendSingleStudentNotification(
  student: StudentRecord,
  input: BulkNotificationInput,
  actor: AdminProfile,
): Promise<void> {
  const parsed = bulkNotificationSchema.parse(input);
  const recipientUid = isValidFirestoreId(student.uid) ? student.uid : student.id;
  if (!isValidFirestoreId(recipientUid)) {
    throw new Error(
      `${student.fullName} does not have a valid portal identifier. Use the WhatsApp button to message them directly.`,
    );
  }

  const personalizedMsg = personalizeMessageForStudent(parsed.message, student).slice(0, 600);

  if (isPasswordAdminSessionActive()) {
    await dispatchAdminPortalAction('admin_notification_create', {
      recipientUid,
      recipientRole: 'student',
      title: parsed.title.slice(0, 140),
      message: personalizedMsg.length >= 2 ? personalizedMsg : parsed.message,
      type: parsed.type,
    });
    return;
  }

  try {
    const docRef = await addDoc(collection(db, 'notifications'), {
      recipientUid,
      recipientRole: 'student',
      title: parsed.title.slice(0, 140),
      message: personalizedMsg.length >= 2 ? personalizedMsg : parsed.message,
      type: parsed.type as NotificationType,
      read: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await appendCommunicationAudit(
      actor,
      'SEND_STUDENT_NOTIFICATION',
      'notifications',
      docRef.id,
      `Sent "${parsed.title}" (${parsed.type}) to ${student.fullName} (${student.registrationNo}).`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'notifications');
  }
}

// ============================================================================
// MESSAGE TEMPLATES CRUD
// ============================================================================

export const MESSAGE_TEMPLATE_CATEGORY_VALUES = [
  'fee',
  'renewal',
  'birthday',
  'general',
  'ticket',
  'welcome',
] as const;

export const messageTemplateSchema = z.object({
  name: z.string().trim().min(2, 'Template name must be at least 2 characters.').max(100),
  category: z.enum(MESSAGE_TEMPLATE_CATEGORY_VALUES),
  title: z.string().trim().min(2, 'Title must be at least 2 characters.').max(140),
  body: z.string().trim().min(5, 'Template message must be at least 5 characters.').max(1000),
});

export type MessageTemplateInput = z.infer<typeof messageTemplateSchema>;

export const STARTER_MESSAGE_TEMPLATES: MessageTemplateInput[] = [
  {
    name: 'Monthly Fee Due Reminder',
    category: 'fee',
    title: 'Monthly Library Fee Reminder',
    body: 'Dear {name} ({regNo}), your pending Av_eSAFE Library fee balance is {pending}. Kindly clear your dues at the Electronic City, Bangalore desk or via UPI to keep your seat ({seat}) active.',
  },
  {
    name: 'Early Membership Renewal Alert',
    category: 'renewal',
    title: 'Membership Renewal Upcoming',
    body: 'Hello {name}, your Av_eSAFE Library membership ({hall}, Seat {seat}) expires on {expiry}. Renew early to retain uninterrupted 24/7 access and your reserved seat.',
  },
  {
    name: 'Remaining Balance Follow-Up',
    category: 'fee',
    title: 'Remaining Fee Balance Notice',
    body: 'Hi {name} ({regNo}), thank you for your recent partial payment. A remaining balance of {pending} is currently due on your Av_eSAFE Library account. Kindly settle it at your earliest convenience.',
  },
  {
    name: 'Warm Birthday Wish',
    category: 'birthday',
    title: 'Happy Birthday from Av_eSAFE Library!',
    body: 'Happy Birthday, {name}! Wishing you a wonderful year ahead filled with sharp focus, good health, and grand success in all your exams and goals. — Team Av_eSAFE Library, Electronic City, Bangalore.',
  },
  {
    name: 'Welcome New Member',
    category: 'welcome',
    title: 'Welcome to Av_eSAFE Library',
    body: 'Welcome {name} ({regNo}) to Av_eSAFE Library, Electronic City, Bangalore! Your seat ({seat}, {hall}) is ready. Sign in to the Student Portal anytime to view your receipts, attendance, and notices.',
  },
  {
    name: 'Support Ticket Resolution Follow-Up',
    category: 'ticket',
    title: 'Update on Your Support Request',
    body: 'Hello {name}, our desk team at Av_eSAFE Library has updated your support request. Please check your Student Portal or reply here if you need any further help with {hall} / Seat {seat}.',
  },
];

export function subscribeMessageTemplates(
  onData: (templates: import('../types/domain').MessageTemplateRecord[]) => void,
): Unsubscribe {
  if (isPasswordAdminSessionActive()) {
    return subscribePasswordAdminBundle((bundle) => {
      onData(bundle.messageTemplates || []);
    });
  }
  const q = query(collection(db, 'message_templates'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<import('../types/domain').MessageTemplateRecord, 'id'>),
      }));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'message_templates');
    },
  );
}

export async function createMessageTemplate(
  rawInput: MessageTemplateInput,
  actor: AdminProfile,
): Promise<{ id: string }> {
  const parsed = messageTemplateSchema.parse(rawInput);
  try {
    const docRef = await addDoc(collection(db, 'message_templates'), {
      name: parsed.name,
      category: parsed.category,
      title: parsed.title,
      body: parsed.body,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await appendCommunicationAudit(
      actor,
      'CREATE_MESSAGE_TEMPLATE',
      'message_templates',
      docRef.id,
      `Created message template "${parsed.name}" (${parsed.category}).`,
    );
    return { id: docRef.id };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'message_templates');
  }
}

export async function updateMessageTemplate(
  templateId: string,
  rawInput: MessageTemplateInput,
  actor: AdminProfile,
): Promise<void> {
  const parsed = messageTemplateSchema.parse(rawInput);
  try {
    await updateDoc(doc(db, 'message_templates', templateId), {
      name: parsed.name,
      category: parsed.category,
      title: parsed.title,
      body: parsed.body,
      updatedAt: serverTimestamp(),
    });
    await appendCommunicationAudit(
      actor,
      'UPDATE_MESSAGE_TEMPLATE',
      'message_templates',
      templateId,
      `Updated message template "${parsed.name}".`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `message_templates/${templateId}`);
  }
}

export async function deleteMessageTemplate(
  template: import('../types/domain').MessageTemplateRecord,
  actor: AdminProfile,
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'message_templates', template.id));
    await appendCommunicationAudit(
      actor,
      'DELETE_MESSAGE_TEMPLATE',
      'message_templates',
      template.id,
      `Deleted message template "${template.name}".`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `message_templates/${template.id}`);
  }
}

export async function seedStarterMessageTemplates(actor: AdminProfile): Promise<number> {
  try {
    const batch = writeBatch(db);
    for (const tpl of STARTER_MESSAGE_TEMPLATES) {
      const ref = doc(collection(db, 'message_templates'));
      batch.set(ref, {
        name: tpl.name,
        category: tpl.category,
        title: tpl.title,
        body: tpl.body,
        createdBy: actor.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    await appendCommunicationAudit(
      actor,
      'SEED_MESSAGE_TEMPLATES',
      'message_templates',
      'starter_pack',
      `Installed ${STARTER_MESSAGE_TEMPLATES.length} starter message templates.`,
    );
    return STARTER_MESSAGE_TEMPLATES.length;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'message_templates');
  }
}

// ============================================================================
// BIRTHDAY WISHES HELPERS
// ============================================================================

export interface BirthdayStatusInfo {
  isToday: boolean;
  daysUntil: number;
  isThisMonth: boolean;
  formattedDate: string;
  ageTurning: number | null;
}

export function getBirthdayStatus(dateOfBirth?: string): BirthdayStatusInfo | null {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null;
  const [yStr, mStr, dStr] = dateOfBirth.split('-');
  const birthYear = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  if (!month || !day || month > 12 || day > 31) return null;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let nextBday = new Date(now.getFullYear(), month - 1, day);
  if (nextBday.getTime() < todayStart.getTime()) {
    nextBday = new Date(now.getFullYear() + 1, month - 1, day);
  }
  const daysUntil = Math.round((nextBday.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
  const isToday = daysUntil === 0;
  const isThisMonth = month === now.getMonth() + 1;
  const ageTurning = birthYear > 1920 ? nextBday.getFullYear() - birthYear : null;
  const formattedDate = new Date(2000, month - 1, day).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  });

  return { isToday, daysUntil, isThisMonth, formattedDate, ageTurning };
}

export async function updateStudentBirthdayInline(
  student: StudentRecord,
  dateOfBirth: string,
  actor: AdminProfile,
): Promise<void> {
  if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    throw new Error('Date of birth must be a valid YYYY-MM-DD date.');
  }
  try {
    await updateDoc(doc(db, 'students', student.id), {
      dateOfBirth,
      updatedAt: serverTimestamp(),
    });
    await appendCommunicationAudit(
      actor,
      'UPDATE_STUDENT_DOB',
      'notifications',
      student.id,
      `Updated date of birth for ${student.fullName} (${student.registrationNo}) to ${dateOfBirth || 'cleared'}.`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `students/${student.id}`);
  }
}

// ============================================================================
// STUDENT TICKETS CRUD
// ============================================================================

export const TICKET_CATEGORY_VALUES = [
  'seat',
  'fee',
  'facility',
  'smart_door',
  'shift',
  'other',
] as const;

export const TICKET_PRIORITY_VALUES = ['normal', 'high', 'urgent'] as const;
export const TICKET_STATUS_VALUES = ['open', 'in_progress', 'resolved', 'closed'] as const;

export const createTicketSchema = z.object({
  category: z.enum(TICKET_CATEGORY_VALUES),
  priority: z.enum(TICKET_PRIORITY_VALUES),
  subject: z.string().trim().min(3, 'Subject must be at least 3 characters.').max(140),
  description: z.string().trim().min(5, 'Description must be at least 5 characters.').max(1500),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export function generateTicketNo(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'T');
  return `TKT-${yy}${mm}-${suffix}`;
}

export function subscribeAllStudentTickets(
  onData: (tickets: import('../types/domain').StudentTicketRecord[]) => void,
): Unsubscribe {
  if (isPasswordAdminSessionActive()) {
    return subscribePasswordAdminBundle((bundle) => {
      onData(bundle.tickets || []);
    });
  }
  const q = query(collection(db, 'student_tickets'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<import('../types/domain').StudentTicketRecord, 'id'>),
      }));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'student_tickets');
    },
  );
}

export async function createStudentTicketRecord(
  rawInput: CreateTicketInput,
  student: Pick<StudentRecord, 'id' | 'uid' | 'fullName' | 'registrationNo' | 'phone'>,
  actor?: AdminProfile | null,
): Promise<{ id: string; ticketNo: string }> {
  const parsed = createTicketSchema.parse(rawInput);
  const ticketNo = generateTicketNo();

  try {
    const docRef = await addDoc(collection(db, 'student_tickets'), {
      ticketNo,
      studentId: student.id,
      studentUid: student.uid || '',
      studentName: student.fullName.slice(0, 120),
      registrationNo: (student.registrationNo || '').slice(0, 40),
      phone: (student.phone || '').slice(0, 20),
      category: parsed.category,
      priority: parsed.priority,
      subject: parsed.subject,
      description: parsed.description,
      status: 'open',
      adminReply: '',
      repliedBy: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (actor) {
      await appendCommunicationAudit(
        actor,
        'CREATE_STUDENT_TICKET',
        'student_tickets',
        docRef.id,
        `Logged ticket ${ticketNo} ("${parsed.subject}") for ${student.fullName}.`,
      );
    }

    return { id: docRef.id, ticketNo };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'student_tickets');
  }
}

export async function updateStudentTicketAdmin(
  ticket: import('../types/domain').StudentTicketRecord,
  updates: {
    status: import('../types/domain').TicketStatus;
    priority: import('../types/domain').TicketPriority;
    adminReply: string;
  },
  actor: AdminProfile,
): Promise<void> {
  const safeReply = updates.adminReply.trim().slice(0, 1000);
  try {
    await updateDoc(doc(db, 'student_tickets', ticket.id), {
      status: updates.status,
      priority: updates.priority,
      adminReply: safeReply,
      repliedBy: actor.uid,
      updatedAt: serverTimestamp(),
    });

    // Notify portal-linked student automatically
    if (isValidFirestoreId(ticket.studentUid)) {
      await addDoc(collection(db, 'notifications'), {
        recipientUid: ticket.studentUid,
        recipientRole: 'student',
        title: `Ticket ${ticket.ticketNo} · ${updates.status.replace('_', ' ').toUpperCase()}`,
        message: safeReply
          ? `Admin response to "${ticket.subject}": ${safeReply.slice(0, 480)}`
          : `Your support ticket "${ticket.subject}" status is now ${updates.status.replace('_', ' ')}.`,
        type: 'ticket',
        read: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(() => {
        // Non-blocking
      });
    }

    await appendCommunicationAudit(
      actor,
      'UPDATE_STUDENT_TICKET',
      'student_tickets',
      ticket.id,
      `Updated ticket ${ticket.ticketNo} (${ticket.studentName}) to ${updates.status}.`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `student_tickets/${ticket.id}`);
  }
}

export async function deleteStudentTicketRecord(
  ticket: import('../types/domain').StudentTicketRecord,
  actor: AdminProfile,
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'student_tickets', ticket.id));
    await appendCommunicationAudit(
      actor,
      'DELETE_STUDENT_TICKET',
      'student_tickets',
      ticket.id,
      `Deleted ticket ${ticket.ticketNo} (${ticket.studentName}).`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `student_tickets/${ticket.id}`);
  }
}

