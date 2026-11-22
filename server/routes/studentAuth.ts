import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { verifyBearerFirebaseUser } from '../middleware/auth.ts';
import { validateProfilePhotoDataUrl } from '../services/cardVerificationPolicy.ts';
import {
  checkLoginRateLimit,
  clearLoginFailures,
  recordFailedLogin,
  signStudentSessionToken,
  studentPortalStore,
  verifyAdminSessionToken,
  verifyStudentPassword,
  verifyStudentSessionToken,
  type SerializedRecord,
  type StudentSessionPayload,
} from '../services/studentPasswordStore.ts';

declare global {
  namespace Express {
    interface Request {
      studentSession?: StudentSessionPayload;
    }
  }
}

export const studentAuthRouter = Router();
export const studentPortalRouter = Router();

async function requireAuthorizedAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required.' });
    return;
  }
  const token = authHeader.slice('Bearer '.length).trim();

  // Accept signed Password-Admin token too so password-authenticated admins can manage student passwords
  const localAdmin = verifyAdminSessionToken(token);
  if (localAdmin) {
    const profile = studentPortalStore.getAdminProfileByUid(localAdmin.sub);
    if (!profile || !profile.active) {
      res.status(403).json({
        error: 'ADMIN_DISABLED',
        message: 'Administrator account is inactive.',
      });
      return;
    }
    req.authUser = {
      uid: profile.uid,
      email: profile.email,
      name: profile.fullName || profile.email,
      emailVerified: true,
      isBootstrapAdmin: profile.role === 'super_admin',
      authTime: localAdmin.iat,
      expiresAt: localAdmin.exp,
    };
    next();
    return;
  }

  try {
    const user = await verifyBearerFirebaseUser(token);
    if (!user.isBootstrapAdmin && !studentPortalStore.isAuthorizedAdmin(user.uid, user.email)) {
      res.status(403).json({
        error: 'ADMIN_REQUIRED',
        message: 'Only active Av_eSAFE Library administrators can manage student credentials.',
      });
      return;
    }
    req.authUser = user;
    next();
  } catch {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or expired authentication token.' });
  }
}

function requireStudentSession(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'STUDENT_UNAUTHORIZED',
      message: 'Missing Student Portal session token.',
    });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const payload = verifyStudentSessionToken(token);
  if (!payload) {
    res.status(401).json({
      error: 'STUDENT_SESSION_EXPIRED',
      message: 'Your Student Portal session has expired. Please sign in again.',
    });
    return;
  }

  const student = studentPortalStore.getStudentById(payload.sub);
  if (!student) {
    res.status(401).json({
      error: 'STUDENT_NOT_FOUND',
      message: 'Student enrollment record not found. Contact the library desk.',
    });
    return;
  }

  if (student.status === 'suspended' || student.status === 'inactive') {
    res.status(403).json({
      error: 'ACCOUNT_DISABLED',
      message: `Your membership is currently ${String(student.status)}. Contact the Av_eSAFE Library front desk.`,
    });
    return;
  }

  req.studentSession = payload;
  next();
}

const LoginSchema = z.object({
  identifier: z.string().trim().min(2, 'Enter your registered email or Registration ID.').max(160),
  password: z.string().min(1, 'Enter your password.').max(128),
});

const SetPasswordSchema = z.object({
  studentId: z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  registrationNo: z.string().trim().min(2).max(40),
  email: z.string().trim().max(160).optional().default(''),
  password: z.string().min(6, 'Password must be at least 6 characters.').max(128),
  studentSnapshot: z.record(z.string(), z.unknown()).optional(),
});

const SyncSnapshotSchema = z.object({
  admins: z
    .array(
      z.object({
        uid: z.string().max(128),
        email: z.string().max(160),
        fullName: z.string().max(120).optional(),
        role: z.string().max(40),
        branch: z.string().max(120).optional(),
        phone: z.string().max(20).optional(),
        active: z.boolean(),
        createdAt: z.string().optional(),
        updatedAt: z.string().optional(),
      }),
    )
    .max(200)
    .optional(),
  students: z.array(z.record(z.string(), z.unknown())).max(2000).optional(),
  seats: z.array(z.record(z.string(), z.unknown())).max(300).optional(),
  batches: z.array(z.record(z.string(), z.unknown())).max(300).optional(),
  payments: z.array(z.record(z.string(), z.unknown())).max(5000).optional(),
  memberships: z.array(z.record(z.string(), z.unknown())).max(3000).optional(),
  expenses: z.array(z.record(z.string(), z.unknown())).max(3000).optional(),
  attendance: z.array(z.record(z.string(), z.unknown())).max(3000).optional(),
  notices: z.array(z.record(z.string(), z.unknown())).max(500).optional(),
  notifications: z.array(z.record(z.string(), z.unknown())).max(3000).optional(),
  verifications: z.array(z.record(z.string(), z.unknown())).max(2000).optional(),
  tickets: z.array(z.record(z.string(), z.unknown())).max(2000).optional(),
  messageTemplates: z.array(z.record(z.string(), z.unknown())).max(300).optional(),
  approvalRequests: z.array(z.record(z.string(), z.unknown())).max(2000).optional(),
  auditLogs: z.array(z.record(z.string(), z.unknown())).max(1000).optional(),
  libraryInfo: z.record(z.string(), z.unknown()).nullable().optional(),
});

const ActivateRegPasswordSchema = z.object({
  referenceNo: z.string().trim().min(4).max(40),
  studentId: z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  registrationNo: z.string().trim().min(2).max(40),
  email: z.string().trim().max(160).optional().default(''),
  studentSnapshot: z.record(z.string(), z.unknown()).optional(),
});

const AckActionsSchema = z.object({
  actionIds: z.array(z.string().min(1).max(128)).max(500),
});

const UpdateStudentProfileSchema = z.object({
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say', '']).optional(),
  dateOfBirth: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Date of birth must be YYYY-MM-DD.')
    .optional(),
  photoDataUrl: z.string().max(140000).optional(),
  removePhoto: z.boolean().optional(),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(6, 'New password must be at least 6 characters.').max(128),
});

const MarkNotificationsSchema = z.object({
  notificationIds: z.array(z.string().min(1).max(128)).min(1).max(200),
});

const PaymentProofSchema = z.object({
  billingMonth: z.string().trim().regex(/^\d{4}-\d{2}$/, 'Select a valid billing month.'),
  amount: z.coerce.number().min(1).max(500000),
  paymentMethod: z.enum(['upi', 'bank_transfer', 'card']),
  utrReference: z.string().trim().min(4).max(80),
  payerName: z.string().trim().max(120).optional().default(''),
  notes: z.string().trim().max(300).optional().default(''),
});

const CreateTicketSchema = z.object({
  category: z.enum(['seat', 'fee', 'facility', 'smart_door', 'shift', 'other']),
  priority: z.enum(['normal', 'high', 'urgent']),
  subject: z.string().trim().min(3).max(140),
  description: z.string().trim().min(5).max(1500),
});

const StudentChangeRequestSchema = z.object({
  requestedSeatMode: z.enum(['fixed', 'non_fixed', 'unseated']),
  requestedHall: z.enum(['Hall 1', 'Hall 2', 'Unassigned']),
  requestedSeatId: z.string().trim().max(40).optional().default(''),
  requestedShiftType: z.enum([
    'morning',
    'noon',
    'evening',
    'night',
    'double',
    'triple',
    'all_shifts',
  ]),
  doublePresetId: z.string().trim().max(40).optional().default('morning_noon'),
  batchId: z.string().trim().max(128).optional(),
  batchName: z.string().trim().max(100).optional(),
  reason: z.string().trim().max(500).optional().default(''),
});

// ============================================================================
// PUBLIC: Student Email / Registration No + Admin-Set Password Login
// ============================================================================
studentAuthRouter.post('/login', (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Enter your email/registration ID and password.',
    });
    return;
  }

  const identifier = parsed.data.identifier;
  const password = parsed.data.password;
  const rateKey = `${req.ip || 'unknown'}:${identifier.toLowerCase()}`;

  const rateCheck = checkLoginRateLimit(rateKey);
  if (!rateCheck.allowed) {
    res.status(429).json({
      error: 'TOO_MANY_ATTEMPTS',
      message: `Too many failed sign-in attempts. Please try again in ${Math.ceil(rateCheck.retryAfterSec / 60)} minute(s).`,
    });
    return;
  }

  const credential = studentPortalStore.findCredentialByIdentifier(identifier);
  if (!credential) {
    recordFailedLogin(rateKey);
    res.status(404).json({
      error: 'NO_LOCAL_CREDENTIAL',
      message:
        'No portal password found for this email or Registration ID. Ask the Av_eSAFE Library admin desk to set your password, or sign in with Google.',
    });
    return;
  }

  const valid = verifyStudentPassword(password, credential.salt, credential.passwordHash);
  if (!valid) {
    recordFailedLogin(rateKey);
    res.status(401).json({
      error: 'INVALID_CREDENTIALS',
      message: 'Incorrect password. Please check the password given by the admin desk and try again.',
    });
    return;
  }

  const student = studentPortalStore.getStudentById(credential.studentId);
  if (!student) {
    res.status(404).json({
      error: 'STUDENT_NOT_FOUND',
      message: 'Student record is not synced yet. Ask the admin desk to refresh and try again.',
    });
    return;
  }

  if (student.status === 'suspended' || student.status === 'inactive') {
    res.status(403).json({
      error: 'ACCOUNT_DISABLED',
      message: `Your library account is currently ${String(student.status)}. Contact the Av_eSAFE Library front desk.`,
    });
    return;
  }

  clearLoginFailures(rateKey);
  const { token, expiresAt } = signStudentSessionToken({
    studentId: credential.studentId,
    registrationNo: credential.registrationNo,
    email: credential.email,
  });

  res.json({
    ok: true,
    token,
    expiresAt,
    student,
  });
});

// ============================================================================
// ADMIN-PROTECTED: Set / Inspect / Remove Student Portal Passwords & Sync
// ============================================================================
studentAuthRouter.post('/set-password', requireAuthorizedAdmin, (req, res) => {
  const parsed = SetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Invalid password setup payload.',
    });
    return;
  }

  const { studentId, registrationNo, email, password, studentSnapshot } = parsed.data;
  const result = studentPortalStore.setStudentPassword({
    studentId,
    registrationNo,
    email,
    password,
    updatedBy: req.authUser!.email || req.authUser!.uid,
    studentSnapshot: studentSnapshot
      ? ({ ...studentSnapshot, id: studentId } as SerializedRecord)
      : undefined,
  });

  res.json({
    ok: true,
    studentId,
    ...result,
  });
});

studentAuthRouter.post('/activate-registration-password', requireAuthorizedAdmin, (req, res) => {
  const parsed = ActivateRegPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Invalid registration password activation payload.',
    });
    return;
  }

  const activated = studentPortalStore.activateRegistrationPassword({
    referenceNo: parsed.data.referenceNo,
    studentId: parsed.data.studentId,
    registrationNo: parsed.data.registrationNo,
    email: parsed.data.email,
    updatedBy: req.authUser!.email || req.authUser!.uid,
    studentSnapshot: parsed.data.studentSnapshot
      ? ({ ...parsed.data.studentSnapshot, id: parsed.data.studentId } as SerializedRecord)
      : undefined,
  });

  res.json({ ok: true, activated });
});

studentAuthRouter.get('/status/:studentId', requireAuthorizedAdmin, (req, res) => {
  const studentId = String(req.params.studentId || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(studentId)) {
    res.status(400).json({ error: 'INVALID_ID', message: 'Invalid student ID.' });
    return;
  }
  res.json({
    ok: true,
    ...studentPortalStore.getCredentialStatus(studentId),
  });
});

studentAuthRouter.delete('/password/:studentId', requireAuthorizedAdmin, (req, res) => {
  const studentId = String(req.params.studentId || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(studentId)) {
    res.status(400).json({ error: 'INVALID_ID', message: 'Invalid student ID.' });
    return;
  }
  const removed = studentPortalStore.removeStudentPassword(studentId);
  res.json({ ok: true, removed });
});

studentAuthRouter.post('/sync-snapshot', requireAuthorizedAdmin, (req, res) => {
  const parsed = SyncSnapshotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Invalid portal snapshot payload.',
    });
    return;
  }

  const result = studentPortalStore.syncAdminSnapshot({
    admins: parsed.data.admins,
    students: parsed.data.students as SerializedRecord[] | undefined,
    seats: parsed.data.seats as SerializedRecord[] | undefined,
    batches: parsed.data.batches as SerializedRecord[] | undefined,
    payments: parsed.data.payments as SerializedRecord[] | undefined,
    memberships: parsed.data.memberships as SerializedRecord[] | undefined,
    expenses: parsed.data.expenses as SerializedRecord[] | undefined,
    attendance: parsed.data.attendance as SerializedRecord[] | undefined,
    notices: parsed.data.notices as SerializedRecord[] | undefined,
    notifications: parsed.data.notifications as SerializedRecord[] | undefined,
    verifications: parsed.data.verifications as SerializedRecord[] | undefined,
    tickets: parsed.data.tickets as SerializedRecord[] | undefined,
    messageTemplates: parsed.data.messageTemplates as SerializedRecord[] | undefined,
    approvalRequests: parsed.data.approvalRequests as SerializedRecord[] | undefined,
    auditLogs: parsed.data.auditLogs as SerializedRecord[] | undefined,
    libraryInfo: parsed.data.libraryInfo,
  });

  res.json({
    ok: true,
    ...result,
  });
});

studentAuthRouter.post('/ack-actions', requireAuthorizedAdmin, (req, res) => {
  const parsed = AckActionsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid action IDs.' });
    return;
  }
  const cleared = studentPortalStore.acknowledgePendingActions(parsed.data.actionIds);
  res.json({ ok: true, cleared });
});

// ============================================================================
// STUDENT-PROTECTED: Self-Service Portal Data & Actions
// ============================================================================
studentPortalRouter.get('/me', requireStudentSession, (req, res) => {
  const bundle = studentPortalStore.getStudentPortalBundle(req.studentSession!.sub);
  if (!bundle) {
    res.status(404).json({ error: 'STUDENT_NOT_FOUND', message: 'Student profile not found.' });
    return;
  }
  res.json({ ok: true, ...bundle });
});

studentPortalRouter.patch('/profile', requireStudentSession, (req, res) => {
  const parsed = UpdateStudentProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Invalid profile update payload.',
    });
    return;
  }

  let validatedPhotoUrl: string | undefined;
  if (parsed.data.photoDataUrl && !parsed.data.removePhoto) {
    const check = validateProfilePhotoDataUrl(parsed.data.photoDataUrl);
    if (!check.ok) {
      res.status(400).json({ error: 'INVALID_IMAGE', message: check.error });
      return;
    }
    validatedPhotoUrl = check.normalizedDataUrl;
  }

  const updated = studentPortalStore.applyStudentProfileUpdate(req.studentSession!.sub, {
    gender: parsed.data.gender || undefined,
    dateOfBirth: parsed.data.dateOfBirth,
    profilePhotoUrl: validatedPhotoUrl,
    removePhoto: parsed.data.removePhoto,
  });

  if (!updated) {
    res.status(404).json({ error: 'STUDENT_NOT_FOUND', message: 'Student record not found.' });
    return;
  }

  res.json({ ok: true, profile: updated });
});

studentPortalRouter.post('/change-password', requireStudentSession, (req, res) => {
  const parsed = ChangePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Invalid password change payload.',
    });
    return;
  }

  const changed = studentPortalStore.verifyAndChangePassword(
    req.studentSession!.sub,
    parsed.data.currentPassword,
    parsed.data.newPassword,
  );

  if (!changed) {
    res.status(401).json({
      error: 'INVALID_CURRENT_PASSWORD',
      message: 'Current password is incorrect.',
    });
    return;
  }

  res.json({ ok: true, message: 'Your Student Portal password has been updated.' });
});

studentPortalRouter.post('/notifications/read', requireStudentSession, (req, res) => {
  const parsed = MarkNotificationsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid notification IDs.' });
    return;
  }
  const updated = studentPortalStore.markNotificationsRead(
    req.studentSession!.sub,
    parsed.data.notificationIds,
  );
  res.json({ ok: true, updated });
});

studentPortalRouter.post('/payment-proof', requireStudentSession, (req, res) => {
  const parsed = PaymentProofSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Invalid payment proof details.',
    });
    return;
  }
  const record = studentPortalStore.addStudentPaymentProof(req.studentSession!.sub, parsed.data);
  if (!record) {
    res.status(404).json({ error: 'STUDENT_NOT_FOUND', message: 'Student profile not found.' });
    return;
  }
  res.status(201).json({ ok: true, verification: record });
});

studentPortalRouter.post('/tickets', requireStudentSession, (req, res) => {
  const parsed = CreateTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Invalid support ticket details.',
    });
    return;
  }
  const ticket = studentPortalStore.addStudentTicket(req.studentSession!.sub, parsed.data);
  if (!ticket) {
    res.status(404).json({ error: 'STUDENT_NOT_FOUND', message: 'Student profile not found.' });
    return;
  }
  res.status(201).json({ ok: true, id: ticket.id, ticketNo: ticket.ticketNo, ticket });
});

studentPortalRouter.patch('/tickets/:ticketId/close', requireStudentSession, (req, res) => {
  const ticketId = String(req.params.ticketId || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(ticketId)) {
    res.status(400).json({ error: 'INVALID_ID', message: 'Invalid ticket ID.' });
    return;
  }
  const closed = studentPortalStore.closeStudentTicket(req.studentSession!.sub, ticketId);
  if (!closed) {
    res.status(404).json({ error: 'TICKET_NOT_FOUND', message: 'Support ticket not found.' });
    return;
  }
  res.json({ ok: true });
});

studentPortalRouter.post('/change-request', requireStudentSession, (req, res) => {
  const parsed = StudentChangeRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Please check your seat/shift change details.',
    });
    return;
  }

  const result = studentPortalStore.createStudentChangeRequest(req.studentSession!.sub, parsed.data);
  if (!result.ok) {
    res.status(409).json({
      error: 'SEAT_UNAVAILABLE',
      message: result.error,
    });
    return;
  }

  res.status(201).json({
    ok: true,
    id: result.record.id,
    referenceNo: result.record.referenceNo,
    request: result.record,
  });
});

