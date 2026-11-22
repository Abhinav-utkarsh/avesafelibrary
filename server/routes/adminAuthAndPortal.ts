import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { verifyBearerFirebaseUser } from '../middleware/auth.ts';
import {
  checkLoginRateLimit,
  clearLoginFailures,
  recordFailedLogin,
  signAdminSessionToken,
  studentPortalStore,
  verifyAdminSessionToken,
  verifyStudentPassword,
  type AdminSessionPayload,
} from '../services/studentPasswordStore.ts';

declare global {
  namespace Express {
    interface Request {
      adminSession?: AdminSessionPayload;
    }
  }
}

export const adminAuthRouter = Router();
export const adminPortalRouter = Router();
export const studentPublicRouter = Router();

/**
 * Verifies EITHER a Firebase ID token (Bootstrap/Google Super Admin) OR
 * an HMAC-SHA256 signed Admin session token, and optionally requires super_admin role.
 */
async function authenticateAdminRequest(
  req: Request,
  res: Response,
  next: NextFunction,
  requireSuperAdminOnly: boolean,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Missing Authorization Bearer token.',
    });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();

  // 1. Check signed Password-Admin session token first
  const localAdmin = verifyAdminSessionToken(token);
  if (localAdmin) {
    const profile = studentPortalStore.getAdminProfileByUid(localAdmin.sub);
    if (!profile || !profile.active) {
      res.status(403).json({
        error: 'ADMIN_DISABLED',
        message: 'Your administrator account is inactive or has been removed.',
      });
      return;
    }
    if (requireSuperAdminOnly && profile.role !== 'super_admin') {
      res.status(403).json({
        error: 'SUPER_ADMIN_REQUIRED',
        message: 'Only the Super Admin (Owner / Founder) can perform this action.',
      });
      return;
    }
    req.adminSession = {
      ...localAdmin,
      role: profile.role,
      fullName: profile.fullName || localAdmin.fullName,
    };
    next();
    return;
  }

  // 2. Fall back to Firebase ID token verification
  try {
    const fbUser = await verifyBearerFirebaseUser(token);
    const isSuper =
      fbUser.isBootstrapAdmin || studentPortalStore.isSuperAdmin(fbUser.uid, fbUser.email);
    const isAnyAdmin =
      isSuper || studentPortalStore.isAuthorizedAdmin(fbUser.uid, fbUser.email);

    if (!isAnyAdmin) {
      res.status(403).json({
        error: 'ADMIN_REQUIRED',
        message: 'Administrator authorization is required.',
      });
      return;
    }
    if (requireSuperAdminOnly && !isSuper) {
      res.status(403).json({
        error: 'SUPER_ADMIN_REQUIRED',
        message: 'Only the Super Admin (Owner / Founder) can manage administrator credentials.',
      });
      return;
    }

    req.authUser = fbUser;
    req.adminSession = {
      sub: fbUser.uid,
      email: fbUser.email,
      role: isSuper ? 'super_admin' : 'admin',
      fullName: fbUser.name || fbUser.email,
      kind: 'admin',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    next();
  } catch {
    res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Session token is invalid or expired. Please sign in again.',
    });
  }
}

function requireAnyAdmin(req: Request, res: Response, next: NextFunction): void {
  void authenticateAdminRequest(req, res, next, false);
}

function requireSuperAdminAuth(req: Request, res: Response, next: NextFunction): void {
  void authenticateAdminRequest(req, res, next, true);
}

// ============================================================================
// SCHEMAS
// ============================================================================
const AdminLoginSchema = z.object({
  email: z.string().trim().email('Enter a valid administrator email.').max(160),
  password: z.string().min(1, 'Enter your password.').max(128),
});

const SetAdminPasswordSchema = z.object({
  uid: z.string().trim().min(3).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().trim().email('Enter a valid administrator email.').max(160),
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(['super_admin', 'branch_manager', 'manager', 'accounts', 'admin', 'staff']),
  branch: z.string().trim().max(120).optional().default('Electronic City, Bangalore'),
  phone: z.string().trim().max(20).optional().default(''),
  active: z.boolean().optional().default(true),
  password: z.string().min(6, 'Password must be at least 6 characters.').max(128),
});

const AdminPortalActionSchema = z.object({
  actionType: z.enum([
    'admin_notice_create',
    'admin_notification_create',
    'admin_batch_upsert',
    'admin_student_upsert',
    'admin_approval_update',
  ]),
  payload: z.record(z.string(), z.unknown()),
});

const PublicRegistrationSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters.').max(120),
  phone: z
    .string()
    .trim()
    .min(10, 'Phone number must be at least 10 digits.')
    .max(20)
    .regex(/^[0-9+\-\s()]{10,20}$/, 'Enter a valid 10-digit phone number.'),
  email: z
    .string()
    .trim()
    .max(160)
    .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address.')
    .optional()
    .default(''),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  dateOfBirth: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Date of birth must be YYYY-MM-DD.')
    .optional()
    .default(''),
  guardianName: z.string().trim().max(120).optional().default(''),
  guardianPhone: z.string().trim().max(20).optional().default(''),
  address: z.string().trim().max(300).optional().default(''),
  batchId: z.string().trim().max(128).optional().default(''),
  batchName: z.string().trim().min(2, 'Please select a batch/course or enter one manually.').max(100),
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
  portalPassword: z
    .string()
    .min(6, 'Portal password must be at least 6 characters.')
    .max(128),
  reason: z.string().trim().max(500).optional().default(''),
});

// ============================================================================
// ADMIN EMAIL + PASSWORD AUTH ROUTES (/api/admin-auth)
// ============================================================================
adminAuthRouter.post('/login', (req, res) => {
  const parsed = AdminLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Enter your email and password.',
    });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  const password = parsed.data.password;
  const rateKey = `admin:${req.ip || 'unknown'}:${email}`;

  const rateCheck = checkLoginRateLimit(rateKey);
  if (!rateCheck.allowed) {
    res.status(429).json({
      error: 'TOO_MANY_ATTEMPTS',
      message: `Too many failed login attempts. Try again in ${Math.ceil(rateCheck.retryAfterSec / 60)} minute(s).`,
    });
    return;
  }

  const cred = studentPortalStore.findAdminCredentialByEmail(email);
  if (!cred) {
    recordFailedLogin(rateKey);
    res.status(404).json({
      error: 'NO_ADMIN_CREDENTIAL',
      message:
        'No Admin password login found for this email. Ask the Super Admin to create your Email + Password account or sign in with Google.',
    });
    return;
  }

  if (!cred.active) {
    res.status(403).json({
      error: 'ADMIN_DISABLED',
      message: 'This administrator account is suspended. Contact the Owner / Super Admin.',
    });
    return;
  }

  if (!verifyStudentPassword(password, cred.salt, cred.passwordHash)) {
    recordFailedLogin(rateKey);
    res.status(401).json({
      error: 'INVALID_CREDENTIALS',
      message: 'Incorrect password. Please check the credentials assigned by the Super Admin.',
    });
    return;
  }

  clearLoginFailures(rateKey);
  const { token, expiresAt } = signAdminSessionToken({
    uid: cred.uid,
    email: cred.email,
    role: cred.role,
    fullName: cred.fullName,
  });

  res.json({
    ok: true,
    token,
    expiresAt,
    admin: {
      uid: cred.uid,
      email: cred.email,
      fullName: cred.fullName,
      role: cred.role,
      branch: cred.branch,
      phone: cred.phone,
      active: cred.active,
    },
  });
});

adminAuthRouter.post('/set-password', requireSuperAdminAuth, (req, res) => {
  const parsed = SetAdminPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Invalid admin password details.',
    });
    return;
  }

  const result = studentPortalStore.setAdminPassword({
    ...parsed.data,
    updatedBy: req.adminSession!.email || req.adminSession!.sub,
  });

  res.json({ ok: true, ...result });
});

adminAuthRouter.get('/status', requireSuperAdminAuth, (_req, res) => {
  res.json({
    ok: true,
    passwords: studentPortalStore.getAdminPasswordUids(),
  });
});

adminAuthRouter.delete('/password/:uid', requireSuperAdminAuth, (req, res) => {
  const uid = String(req.params.uid || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) {
    res.status(400).json({ error: 'INVALID_ID', message: 'Invalid admin UID.' });
    return;
  }
  const removed = studentPortalStore.removeAdminPassword(uid);
  res.json({ ok: true, removed });
});

// ============================================================================
// PASSWORD-ADMIN PORTAL BUNDLE & MUTATION ROUTES (/api/admin-portal)
// ============================================================================
adminPortalRouter.get('/bundle', requireAnyAdmin, (_req, res) => {
  res.json({
    ok: true,
    ...studentPortalStore.getAdminPortalBundle(),
  });
});

adminPortalRouter.post('/action', requireAnyAdmin, (req, res) => {
  const parsed = AdminPortalActionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Invalid admin portal action payload.',
    });
    return;
  }

  const actor = req.adminSession!;
  const record = studentPortalStore.applyPasswordAdminAction(
    {
      uid: actor.sub,
      email: actor.email,
      role: actor.role,
      fullName: actor.fullName,
    },
    parsed.data.actionType,
    parsed.data.payload,
  );

  res.status(201).json({ ok: true, record });
});

// ============================================================================
// PUBLIC STUDENT SELF-REGISTRATION & SEAT AVAILABILITY (/api/student-public)
// ============================================================================
studentPublicRouter.get('/catalog', (_req, res) => {
  // Strictly non-PII seat availability + active batches/courses
  res.json({
    ok: true,
    seats: studentPortalStore.getPublicSeatAvailability(),
    batches: studentPortalStore.getPublicActiveBatches(),
  });
});

studentPublicRouter.post('/register', (req, res) => {
  const rateKey = `pubreg:${req.ip || 'unknown'}`;
  const rateCheck = checkLoginRateLimit(rateKey);
  if (!rateCheck.allowed) {
    res.status(429).json({
      error: 'TOO_MANY_REQUESTS',
      message: 'Too many registration submissions. Please try again shortly.',
    });
    return;
  }

  const parsed = PublicRegistrationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message || 'Please check the registration fields.',
    });
    return;
  }

  const created = studentPortalStore.createPublicRegistrationRequest(parsed.data);
  if (!created.ok) {
    res.status(409).json({
      error: 'SEAT_UNAVAILABLE',
      message: created.error,
    });
    return;
  }

  res.status(201).json({
    ok: true,
    referenceNo: created.record.referenceNo,
    status: created.record.status,
    request: {
      id: created.record.id,
      referenceNo: created.record.referenceNo,
      status: created.record.status,
      requestedHall: created.record.requestedHall,
      requestedSeatId: created.record.requestedSeatId,
      requestedSeatMode: created.record.requestedSeatMode,
      requestedShiftType: created.record.requestedShiftType,
      batchName: created.record.batchName,
      estimatedMonthlyFee: created.record.estimatedMonthlyFee,
      createdAt: created.record.createdAt,
    },
  });
});

studentPublicRouter.get('/application-status/:refNo', (req, res) => {
  const refNo = String(req.params.refNo || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{4,40}$/.test(refNo)) {
    res.status(400).json({
      error: 'INVALID_REFERENCE',
      message: 'Enter a valid application reference number (e.g., APP-2026-1234).',
    });
    return;
  }

  const status = studentPortalStore.getPublicApplicationStatus(refNo);
  if (!status) {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: `No application found with reference ${refNo}.`,
    });
    return;
  }

  res.json({ ok: true, application: status });
});
