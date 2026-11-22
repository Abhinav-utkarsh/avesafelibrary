/**
 * Nirvana Library Management System — Firestore Rules Security Test Matrix (Phase 0 TDD)
 * Verifies the "Dirty Dozen" adversarial payloads against firestore.rules.
 * Run with Firebase Emulator Suite (`@firebase/rules-unit-testing`) when testing locally.
 */

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  actor: 'anonymous' | 'unverified_admin' | 'student_a' | 'admin';
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated student profile read',
    actor: 'anonymous',
    operation: 'get',
    path: 'students/STU-001',
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified email spoofing bootstrap admin',
    actor: 'unverified_admin',
    operation: 'get',
    path: 'settings/library_config',
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Student attempting self-assigned admin creation',
    actor: 'student_a',
    operation: 'create',
    path: 'admins/student_a_uid',
    payload: {
      uid: 'student_a_uid',
      email: 'student@example.com',
      fullName: 'Malicious User',
      role: 'super_admin',
      active: true,
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Cross-student PII read (Student A reading Student B)',
    actor: 'student_a',
    operation: 'get',
    path: 'students/STU-002',
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Blanket student collection scrape without owner filter',
    actor: 'student_a',
    operation: 'list',
    path: 'students',
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Shadow ghost field injection during student creation',
    actor: 'admin',
    operation: 'create',
    path: 'students/STU-999',
    payload: {
      registrationNo: 'NL-999',
      fullName: 'Test Student',
      phone: '9876543210',
      admissionType: 'regular',
      status: 'active',
      seatMode: 'unseated',
      hall: 'Unassigned',
      shiftType: 'morning',
      monthlyFee: 600,
      pendingAmount: 0,
      isSuperUser: true, // Ghost field
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Student forging a fee payment receipt',
    actor: 'student_a',
    operation: 'create',
    path: 'payments/PAY-FORGED',
    payload: {
      receiptNo: 'RCP-FORGED',
      studentId: 'STU-001',
      studentUid: 'student_a_uid',
      studentName: 'Student A',
      billingMonth: '2026-11',
      amountPaid: 600,
      discount: 0,
      dueAmount: 0,
      paymentMethod: 'upi',
      idempotencyKey: 'forged-key-01',
      collectedBy: 'student_a_uid',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Tampering with immutable payment record',
    actor: 'admin',
    operation: 'update',
    path: 'payments/PAY-001',
    payload: { amountPaid: 0 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Deleting append-only audit log entry',
    actor: 'admin',
    operation: 'delete',
    path: 'audit_logs/LOG-001',
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Document ID poisoning with illegal characters',
    actor: 'admin',
    operation: 'create',
    path: 'notices/evil$notice..path',
    payload: {
      title: 'Invalid ID Notice',
      body: 'Payload with invalid document ID.',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Student modifying notification message instead of read flag only',
    actor: 'student_a',
    operation: 'update',
    path: 'notifications/NOTIF-001',
    payload: {
      title: 'Forged Title',
      read: true,
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Backdating expense timestamp instead of server request.time',
    actor: 'admin',
    operation: 'create',
    path: 'expenses/EXP-BACKDATED',
    payload: {
      title: 'Electricity Bill',
      category: 'electricity',
      amount: 4500,
      paymentMethod: 'upi',
      expenseDate: '2026-11-01',
      recordedBy: 'admin_uid',
      createdAt: '2020-01-01T00:00:00Z',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
];
