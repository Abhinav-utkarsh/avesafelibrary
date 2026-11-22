import {
  addDoc,
  collection,
  deleteDoc,
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
  ExpenseCategory,
  ExpenseRecord,
  PaymentMethod,
  PaymentRecord,
  StudentRecord,
} from '../types/domain';

export const PAYMENT_METHOD_VALUES = ['cash', 'upi', 'bank_transfer', 'card'] as const;
export const EXPENSE_CATEGORY_VALUES = [
  'electricity',
  'rent',
  'internet',
  'maintenance',
  'staff',
  'water',
  'equipment',
  'other',
] as const;

export const collectFeeSchema = z.object({
  studentId: z.string().min(1, 'Please select a student.'),
  billingMonth: z
    .string()
    .trim()
    .min(4, 'Billing month is required.')
    .max(20, 'Billing month too long.'),
  amountPaid: z.coerce
    .number()
    .min(0, 'Amount paid cannot be negative.')
    .max(500000, 'Amount exceeds limit.'),
  discount: z.coerce
    .number()
    .min(0, 'Discount cannot be negative.')
    .max(100000, 'Discount exceeds limit.'),
  paymentMethod: z.enum(PAYMENT_METHOD_VALUES),
  idempotencyKey: z
    .string()
    .min(6)
    .max(128)
    .regex(/^[a-zA-Z0-9_\-]+$/, 'Invalid idempotency key.'),
  notes: z.string().trim().max(300, 'Notes must be under 300 characters.').optional().default(''),
  extendExpiry30Days: z.boolean().default(false),
});

export type CollectFeeInput = z.infer<typeof collectFeeSchema>;

export const expenseFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, 'Expense title must be at least 2 characters.')
    .max(140, 'Expense title must be under 140 characters.'),
  category: z.enum(EXPENSE_CATEGORY_VALUES),
  amount: z.coerce
    .number()
    .positive('Expense amount must be greater than zero.')
    .max(1000000, 'Expense amount exceeds limit.'),
  vendor: z.string().trim().max(120, 'Vendor name too long.').optional().default(''),
  paymentMethod: z.enum(PAYMENT_METHOD_VALUES),
  expenseDate: z.string().trim().min(8, 'Expense date is required.').max(40),
  notes: z.string().trim().max(300, 'Notes must be under 300 characters.').optional().default(''),
});

export type ExpenseFormInput = z.infer<typeof expenseFormSchema>;

export function getCurrentBillingMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function generateReceiptNo(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase().replace(/[^A-Z0-9]/g, '9');
  return `RCP-${yy}${mm}-${suffix}`;
}

export function generateIdempotencyKey(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 7).toUpperCase().replace(/[^A-Z0-9]/g, 'A');
  return `PAY_${ts}_${rnd}`;
}

function add30DaysFromBase(baseIso?: string): string {
  const parsed = baseIso ? new Date(`${baseIso}T12:00:00`) : null;
  const start =
    parsed && !Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now()
      ? parsed
      : new Date();
  start.setDate(start.getDate() + 30);
  return start.toISOString().slice(0, 10);
}

async function appendFinanceAudit(
  actor: AdminProfile,
  action: string,
  resourceType: 'payments' | 'expenses',
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

export function subscribePayments(onData: (payments: PaymentRecord[]) => void): Unsubscribe {
  if (isPasswordAdminSessionActive()) {
    return subscribePasswordAdminBundle((bundle) => {
      onData(bundle.payments || []);
    });
  }
  const q = query(collection(db, 'payments'), orderBy('paidAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: PaymentRecord[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<PaymentRecord, 'id'>),
      }));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'payments');
    },
  );
}

export function subscribeExpenses(onData: (expenses: ExpenseRecord[]) => void): Unsubscribe {
  if (isPasswordAdminSessionActive()) {
    return subscribePasswordAdminBundle((bundle) => {
      onData(bundle.expenses || []);
    });
  }
  const q = query(collection(db, 'expenses'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: ExpenseRecord[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<ExpenseRecord, 'id'>),
      }));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'expenses');
    },
  );
}

/**
 * Transactional fee collection with deterministic idempotency document key to prevent duplicate payments.
 */
export async function collectFeeTransaction(
  rawInput: CollectFeeInput,
  actor: AdminProfile,
): Promise<PaymentRecord> {
  const parsed = collectFeeSchema.parse(rawInput);

  if (parsed.amountPaid === 0 && parsed.discount === 0) {
    throw new Error('Enter an amount paid or a discount greater than ₹0.');
  }

  const paymentDocId = parsed.idempotencyKey;
  const receiptNo = generateReceiptNo();
  let createdRecord: PaymentRecord | null = null;

  try {
    await runTransaction(db, async (tx) => {
      const paymentRef = doc(db, 'payments', paymentDocId);
      const studentRef = doc(db, 'students', parsed.studentId);

      const [existingPaySnap, studentSnap] = await Promise.all([
        tx.get(paymentRef),
        tx.get(studentRef),
      ]);

      if (existingPaySnap.exists()) {
        throw new Error('Duplicate payment prevented: this transaction has already been recorded.');
      }
      if (!studentSnap.exists()) {
        throw new Error('Selected student record could not be found.');
      }

      const student = studentSnap.data() as StudentRecord;
      const currentPending = Math.max(0, Number(student.pendingAmount) || 0);
      const remainingDue = Math.max(0, currentPending - parsed.amountPaid - parsed.discount);

      const paymentPayload = {
        receiptNo,
        studentId: parsed.studentId,
        studentUid: student.uid || '',
        studentName: student.fullName,
        membershipId: '',
        billingMonth: parsed.billingMonth,
        amountPaid: Number(parsed.amountPaid),
        discount: Number(parsed.discount),
        dueAmount: remainingDue,
        paymentMethod: parsed.paymentMethod as PaymentMethod,
        idempotencyKey: parsed.idempotencyKey,
        notes: parsed.notes || '',
        collectedBy: actor.uid,
        paidAt: serverTimestamp(),
      };

      tx.set(paymentRef, paymentPayload);

      const studentUpdates: Record<string, unknown> = {
        pendingAmount: remainingDue,
        updatedAt: serverTimestamp(),
      };

      if (parsed.extendExpiry30Days) {
        studentUpdates.membershipExpiry = add30DaysFromBase(student.membershipExpiry);
        studentUpdates.status = 'active';
      }

      tx.update(studentRef, studentUpdates);

      createdRecord = {
        id: paymentDocId,
        receiptNo,
        studentId: parsed.studentId,
        studentUid: student.uid || '',
        studentName: student.fullName,
        membershipId: '',
        billingMonth: parsed.billingMonth,
        amountPaid: Number(parsed.amountPaid),
        discount: Number(parsed.discount),
        dueAmount: remainingDue,
        paymentMethod: parsed.paymentMethod,
        idempotencyKey: parsed.idempotencyKey,
        notes: parsed.notes || '',
        collectedBy: actor.uid,
      };
    });

    if (!createdRecord) {
      throw new Error('Transaction did not produce a receipt record.');
    }

    const receipt: PaymentRecord = createdRecord;
    await appendFinanceAudit(
      actor,
      'COLLECT_FEE',
      'payments',
      receipt.id,
      `Collected ₹${receipt.amountPaid} (discount ₹${receipt.discount}, remaining due ₹${receipt.dueAmount}) from ${receipt.studentName} for ${receipt.billingMonth} [${receipt.receiptNo}].`,
    );

    return receipt;
  } catch (err) {
    if (err instanceof Error && !err.message.includes('Missing or insufficient permissions')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.CREATE, `payments/${paymentDocId}`);
  }
}

export async function createExpenseRecord(
  rawInput: ExpenseFormInput,
  actor: AdminProfile,
): Promise<{ id: string }> {
  const parsed = expenseFormSchema.parse(rawInput);
  try {
    const docRef = await addDoc(collection(db, 'expenses'), {
      title: parsed.title,
      category: parsed.category as ExpenseCategory,
      amount: Number(parsed.amount),
      vendor: parsed.vendor || '',
      paymentMethod: parsed.paymentMethod as PaymentMethod,
      expenseDate: parsed.expenseDate,
      notes: parsed.notes || '',
      recordedBy: actor.uid,
      createdAt: serverTimestamp(),
    });

    await appendFinanceAudit(
      actor,
      'CREATE_EXPENSE',
      'expenses',
      docRef.id,
      `Recorded expense "${parsed.title}" (${parsed.category}) of ₹${parsed.amount} via ${parsed.paymentMethod}.`,
    );

    return { id: docRef.id };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'expenses');
  }
}

export async function updateExpenseRecord(
  expenseId: string,
  rawInput: ExpenseFormInput,
  actor: AdminProfile,
): Promise<void> {
  const parsed = expenseFormSchema.parse(rawInput);
  try {
    // Matches firestore.rules exact affectedKeys allowlist on expenses
    await updateDoc(doc(db, 'expenses', expenseId), {
      title: parsed.title,
      category: parsed.category as ExpenseCategory,
      amount: Number(parsed.amount),
      vendor: parsed.vendor || '',
      paymentMethod: parsed.paymentMethod as PaymentMethod,
      expenseDate: parsed.expenseDate,
      notes: parsed.notes || '',
    });

    await appendFinanceAudit(
      actor,
      'UPDATE_EXPENSE',
      'expenses',
      expenseId,
      `Updated expense "${parsed.title}" (${parsed.category}) to ₹${parsed.amount}.`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `expenses/${expenseId}`);
  }
}

export async function deleteExpenseRecord(
  expense: ExpenseRecord,
  actor: AdminProfile,
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'expenses', expense.id));
    await appendFinanceAudit(
      actor,
      'DELETE_EXPENSE',
      'expenses',
      expense.id,
      `Deleted expense "${expense.title}" (₹${expense.amount}).`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `expenses/${expense.id}`);
  }
}

// ============================================================================
// MANAGE FEES, MONTHLY BILLING CYCLE, EARLY EXPIRY & ONLINE PAYMENT VERIFICATION
// ============================================================================

export async function updateStudentFeeSettings(
  student: StudentRecord,
  updates: {
    monthlyFee: number;
    pendingAmount: number;
    membershipExpiry?: string;
  },
  actor: AdminProfile,
): Promise<void> {
  const safeMonthly = Math.max(0, Math.min(100000, Math.round(Number(updates.monthlyFee) || 0)));
  const safePending = Math.max(0, Math.min(500000, Math.round(Number(updates.pendingAmount) || 0)));
  const payload: Record<string, unknown> = {
    monthlyFee: safeMonthly,
    pendingAmount: safePending,
    updatedAt: serverTimestamp(),
  };
  if (typeof updates.membershipExpiry === 'string') {
    payload.membershipExpiry = updates.membershipExpiry.slice(0, 40);
  }

  try {
    await updateDoc(doc(db, 'students', student.id), payload);
    await appendFinanceAudit(
      actor,
      'UPDATE_STUDENT_FEE_PLAN',
      'payments',
      student.id,
      `Updated fee plan for ${student.fullName} (${student.registrationNo}): Monthly ₹${safeMonthly}, Pending ₹${safePending}${
        updates.membershipExpiry ? `, Expiry ${updates.membershipExpiry}` : ''
      }.`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `students/${student.id}`);
  }
}

export async function extendStudentMembershipDays(
  student: StudentRecord,
  daysToAdd: number,
  actor: AdminProfile,
): Promise<string> {
  const parsed = student.membershipExpiry ? new Date(`${student.membershipExpiry}T12:00:00`) : null;
  const start =
    parsed && !Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now() ? parsed : new Date();
  start.setDate(start.getDate() + Math.max(1, Math.min(365, Math.round(daysToAdd))));
  const nextExpiry = start.toISOString().slice(0, 10);

  try {
    await updateDoc(doc(db, 'students', student.id), {
      membershipExpiry: nextExpiry,
      status: 'active',
      updatedAt: serverTimestamp(),
    });
    await appendFinanceAudit(
      actor,
      'EXTEND_MEMBERSHIP_EXPIRY',
      'payments',
      student.id,
      `Extended membership expiry for ${student.fullName} (${student.registrationNo}) by +${daysToAdd} days to ${nextExpiry}.`,
    );
    return nextExpiry;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `students/${student.id}`);
  }
}

export async function postBulkMonthlyFees(
  targetStudents: StudentRecord[],
  billingMonth: string,
  actor: AdminProfile,
): Promise<{ updatedCount: number; totalPosted: number }> {
  const eligible = targetStudents.filter(
    (s) => s.status === 'active' && Number(s.monthlyFee || 0) > 0,
  );
  if (eligible.length === 0) {
    throw new Error('No active students with a monthly fee greater than ₹0 were selected.');
  }

  let totalPosted = 0;
  try {
    for (const student of eligible) {
      const addAmount = Number(student.monthlyFee || 0);
      const nextPending = Math.min(500000, Math.max(0, Number(student.pendingAmount || 0)) + addAmount);
      await updateDoc(doc(db, 'students', student.id), {
        pendingAmount: nextPending,
        updatedAt: serverTimestamp(),
      });
      totalPosted += addAmount;
    }

    await appendFinanceAudit(
      actor,
      'POST_MONTHLY_FEE_CYCLE',
      'payments',
      billingMonth,
      `Posted ${billingMonth} monthly fee dues for ${eligible.length} active student${
        eligible.length === 1 ? '' : 's'
      } totaling ₹${totalPosted.toLocaleString('en-IN')}.`,
    );

    return { updatedCount: eligible.length, totalPosted };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'students');
  }
}

export const ONLINE_PAYMENT_METHOD_VALUES = ['upi', 'bank_transfer', 'card'] as const;

export const onlineVerificationSchema = z.object({
  studentId: z.string().min(1, 'Please select a student.'),
  billingMonth: z.string().trim().min(4, 'Billing month is required.').max(20),
  amount: z.coerce
    .number()
    .positive('Amount must be greater than ₹0.')
    .max(500000, 'Amount exceeds limit.'),
  paymentMethod: z.enum(ONLINE_PAYMENT_METHOD_VALUES),
  utrReference: z
    .string()
    .trim()
    .min(4, 'UTR / Transaction reference must be at least 4 characters.')
    .max(80, 'UTR / Transaction reference is too long.'),
  payerName: z.string().trim().max(120).optional().default(''),
  notes: z.string().trim().max(300).optional().default(''),
});

export type OnlineVerificationInput = z.infer<typeof onlineVerificationSchema>;

export function subscribeOnlinePaymentVerifications(
  onData: (items: import('../types/domain').OnlinePaymentVerificationRecord[]) => void,
): Unsubscribe {
  if (isPasswordAdminSessionActive()) {
    return subscribePasswordAdminBundle((bundle) => {
      onData(bundle.verifications || []);
    });
  }
  const q = query(collection(db, 'online_payment_verifications'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<import('../types/domain').OnlinePaymentVerificationRecord, 'id'>),
      }));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'online_payment_verifications');
    },
  );
}

export async function submitOnlinePaymentVerification(
  rawInput: OnlineVerificationInput,
  student: Pick<StudentRecord, 'id' | 'uid' | 'fullName' | 'registrationNo' | 'phone'>,
  submittedByRole: 'student' | 'admin',
  actor?: AdminProfile | null,
): Promise<{ id: string }> {
  const parsed = onlineVerificationSchema.parse(rawInput);

  try {
    const docRef = await addDoc(collection(db, 'online_payment_verifications'), {
      studentId: student.id,
      studentUid: student.uid || '',
      studentName: student.fullName.slice(0, 120),
      registrationNo: (student.registrationNo || '').slice(0, 40),
      phone: (student.phone || '').slice(0, 20),
      billingMonth: parsed.billingMonth,
      amount: Number(parsed.amount),
      paymentMethod: parsed.paymentMethod,
      utrReference: parsed.utrReference.toUpperCase(),
      payerName: (parsed.payerName || '').slice(0, 120),
      notes: (parsed.notes || '').slice(0, 300),
      status: 'pending',
      receiptNo: '',
      reviewedBy: '',
      reviewNote: '',
      submittedByRole,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (submittedByRole === 'admin' && actor) {
      await appendFinanceAudit(
        actor,
        'LOG_ONLINE_PAYMENT_VERIFICATION',
        'payments',
        docRef.id,
        `Logged online payment verification (UTR ${parsed.utrReference.toUpperCase()}) of ₹${parsed.amount} for ${student.fullName}.`,
      );
    }

    return { id: docRef.id };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'online_payment_verifications');
  }
}

/**
 * Atomically approves an online payment verification, issues an official immutable Payment receipt,
 * deducts student pendingAmount, optionally extends expiry by +30 days, and notifies the student.
 */
export async function approveOnlinePaymentVerification(
  verification: import('../types/domain').OnlinePaymentVerificationRecord,
  options: { extendExpiry30Days: boolean; discount?: number; reviewNote?: string },
  actor: AdminProfile,
): Promise<PaymentRecord> {
  if (verification.status !== 'pending') {
    throw new Error(`This payment verification is already ${verification.status}.`);
  }

  const discountVal = Math.max(0, Math.min(100000, Number(options.discount || 0)));
  const paymentDocId = `VER_${verification.id.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 40)}`;
  const receiptNo = generateReceiptNo();
  let createdReceipt: PaymentRecord | null = null;

  try {
    await runTransaction(db, async (tx) => {
      const verificationRef = doc(db, 'online_payment_verifications', verification.id);
      const paymentRef = doc(db, 'payments', paymentDocId);
      const studentRef = doc(db, 'students', verification.studentId);

      const [verSnap, paySnap, studentSnap] = await Promise.all([
        tx.get(verificationRef),
        tx.get(paymentRef),
        tx.get(studentRef),
      ]);

      if (!verSnap.exists()) {
        throw new Error('Verification record no longer exists.');
      }
      if (verSnap.data().status !== 'pending') {
        throw new Error('This online payment has already been reviewed.');
      }
      if (paySnap.exists()) {
        throw new Error('A receipt has already been issued for this verification.');
      }
      if (!studentSnap.exists()) {
        throw new Error('Linked student record could not be found.');
      }

      const student = studentSnap.data() as StudentRecord;
      const currentPending = Math.max(0, Number(student.pendingAmount) || 0);
      const remainingDue = Math.max(0, currentPending - Number(verification.amount) - discountVal);
      const combinedNotes = [
        `UTR: ${verification.utrReference}`,
        verification.payerName ? `Payer: ${verification.payerName}` : '',
        options.reviewNote ? options.reviewNote.trim() : '',
      ]
        .filter(Boolean)
        .join(' · ')
        .slice(0, 300);

      tx.set(paymentRef, {
        receiptNo,
        studentId: verification.studentId,
        studentUid: student.uid || '',
        studentName: student.fullName,
        membershipId: '',
        billingMonth: verification.billingMonth,
        amountPaid: Number(verification.amount),
        discount: discountVal,
        dueAmount: remainingDue,
        paymentMethod: verification.paymentMethod as PaymentMethod,
        idempotencyKey: paymentDocId,
        notes: combinedNotes,
        collectedBy: actor.uid,
        paidAt: serverTimestamp(),
      });

      const studentUpdates: Record<string, unknown> = {
        pendingAmount: remainingDue,
        updatedAt: serverTimestamp(),
      };
      if (options.extendExpiry30Days) {
        studentUpdates.membershipExpiry = add30DaysFromBase(student.membershipExpiry);
        studentUpdates.status = 'active';
      }
      tx.update(studentRef, studentUpdates);

      tx.update(verificationRef, {
        status: 'approved',
        receiptNo,
        reviewedBy: actor.uid,
        reviewNote: (options.reviewNote || 'Verified & receipt issued').slice(0, 300),
        updatedAt: serverTimestamp(),
      });

      createdReceipt = {
        id: paymentDocId,
        receiptNo,
        studentId: verification.studentId,
        studentUid: student.uid || '',
        studentName: student.fullName,
        membershipId: '',
        billingMonth: verification.billingMonth,
        amountPaid: Number(verification.amount),
        discount: discountVal,
        dueAmount: remainingDue,
        paymentMethod: verification.paymentMethod as PaymentMethod,
        idempotencyKey: paymentDocId,
        notes: combinedNotes,
        collectedBy: actor.uid,
      };
    });

    if (!createdReceipt) {
      throw new Error('Failed to issue receipt.');
    }

    const receipt: PaymentRecord = createdReceipt;

    // Notify portal-linked student automatically
    if (receipt.studentUid && /^[a-zA-Z0-9_\-]+$/.test(receipt.studentUid)) {
      await addDoc(collection(db, 'notifications'), {
        recipientUid: receipt.studentUid,
        recipientRole: 'student',
        title: `Online Payment Verified (${receipt.receiptNo})`,
        message: `Your online payment of ₹${receipt.amountPaid.toLocaleString('en-IN')} (UTR: ${verification.utrReference}) for ${receipt.billingMonth} has been verified. Remaining due: ₹${receipt.dueAmount.toLocaleString('en-IN')}.`,
        type: 'fee_due',
        read: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(() => {
        // Non-blocking notification
      });
    }

    await appendFinanceAudit(
      actor,
      'APPROVE_ONLINE_PAYMENT',
      'payments',
      receipt.id,
      `Verified online payment UTR ${verification.utrReference} (₹${receipt.amountPaid}) for ${receipt.studentName} and issued ${receipt.receiptNo}.`,
    );

    return receipt;
  } catch (err) {
    if (err instanceof Error && !err.message.includes('Missing or insufficient permissions')) {
      throw err;
    }
    handleFirestoreError(err, OperationType.UPDATE, `online_payment_verifications/${verification.id}`);
  }
}

export async function rejectOnlinePaymentVerification(
  verification: import('../types/domain').OnlinePaymentVerificationRecord,
  reviewNote: string,
  actor: AdminProfile,
): Promise<void> {
  const safeReason = reviewNote.trim().slice(0, 300) || 'UTR reference could not be matched in bank statement.';
  try {
    await updateDoc(doc(db, 'online_payment_verifications', verification.id), {
      status: 'rejected',
      reviewedBy: actor.uid,
      reviewNote: safeReason,
      updatedAt: serverTimestamp(),
    });

    if (verification.studentUid && /^[a-zA-Z0-9_\-]+$/.test(verification.studentUid)) {
      await addDoc(collection(db, 'notifications'), {
        recipientUid: verification.studentUid,
        recipientRole: 'student',
        title: 'Online Payment Verification Needs Attention',
        message: `Your payment submission of ₹${Number(verification.amount).toLocaleString('en-IN')} (UTR: ${verification.utrReference}) could not be verified: ${safeReason}`,
        type: 'fee_due',
        read: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(() => {
        // Non-blocking
      });
    }

    await appendFinanceAudit(
      actor,
      'REJECT_ONLINE_PAYMENT',
      'payments',
      verification.id,
      `Rejected online payment UTR ${verification.utrReference} (₹${verification.amount}) for ${verification.studentName}: ${safeReason}`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `online_payment_verifications/${verification.id}`);
  }
}

