import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface StoredAdminEntry {
  uid: string;
  email: string;
  fullName?: string;
  role: string;
  branch?: string;
  phone?: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface StoredAdminCredential {
  uid: string;
  email: string;
  fullName: string;
  role: string;
  branch: string;
  phone: string;
  active: boolean;
  salt: string;
  passwordHash: string;
  updatedAt: string;
  updatedBy: string;
}

export interface StoredStudentCredential {
  studentId: string;
  registrationNo: string;
  email: string;
  salt: string;
  passwordHash: string;
  updatedAt: string;
  updatedBy: string;
}

export interface PendingRegistrationPassword {
  referenceNo: string;
  email: string;
  salt: string;
  passwordHash: string;
  createdAt: string;
}

export interface SerializedRecord {
  id: string;
  [key: string]: unknown;
}

export type PendingStudentActionType =
  | 'profile_update'
  | 'notification_read'
  | 'payment_proof_create'
  | 'ticket_create'
  | 'ticket_close'
  | 'approval_request_create'
  | 'admin_approval_update'
  | 'admin_student_upsert'
  | 'admin_batch_upsert'
  | 'admin_notice_create'
  | 'admin_notification_create';

export interface PendingStudentAction {
  id: string;
  type: PendingStudentActionType;
  studentId: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

interface PersistedPortalStore {
  version: 2;
  authorizedAdmins: StoredAdminEntry[];
  adminCredentials: Record<string, StoredAdminCredential>;
  credentials: Record<string, StoredStudentCredential>;
  pendingRegistrationPasswords: Record<string, PendingRegistrationPassword>;
  students: Record<string, SerializedRecord>;
  seats: SerializedRecord[];
  batches: SerializedRecord[];
  payments: SerializedRecord[];
  memberships: SerializedRecord[];
  expenses: SerializedRecord[];
  attendance: SerializedRecord[];
  notices: SerializedRecord[];
  notifications: SerializedRecord[];
  verifications: SerializedRecord[];
  tickets: SerializedRecord[];
  messageTemplates: SerializedRecord[];
  approvalRequests: SerializedRecord[];
  auditLogs: SerializedRecord[];
  libraryInfo: Record<string, unknown> | null;
  pendingActions: PendingStudentAction[];
  lastSyncedAt: string | null;
}

export interface StudentSessionPayload {
  sub: string; // studentId
  reg: string;
  email: string;
  kind?: 'student';
  iat: number;
  exp: number;
}

export interface AdminSessionPayload {
  sub: string; // admin uid
  email: string;
  role: string;
  fullName: string;
  kind: 'admin';
  iat: number;
  exp: number;
}

export type BaseShiftSlot = 'morning' | 'noon' | 'evening' | 'night';

export interface PublicSeatAvailabilityItem {
  seatCode: string;
  hall: 'Hall 1' | 'Hall 2';
  seatNumber: number;
  rowLabel: string;
  seatType: 'fixed' | 'non_fixed';
  status: 'available' | 'occupied' | 'partial' | 'maintenance';
  occupiedSlots: BaseShiftSlot[];
  isFixedOccupied: boolean;
}

const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = IS_SERVERLESS
  ? path.resolve(os.tmpdir(), 'avesafe-library-data')
  : path.resolve(process.cwd(), '.data');
const STORE_PATH = path.resolve(DATA_DIR, 'student-portal-store.json');

// Session signing key: uses STUDENT_SESSION_SECRET if configured; on serverless falls back
// to a stable project-scoped seed so tokens stay valid across cold starts until configured.
const SESSION_SECRET: Buffer = process.env.STUDENT_SESSION_SECRET
  ? crypto.createHash('sha256').update(process.env.STUDENT_SESSION_SECRET).digest()
  : IS_SERVERLESS
    ? crypto
        .createHash('sha256')
        .update(
          `avesafe:${process.env.VERCEL_PROJECT_ID || process.env.VERCEL_URL || 'vercel'}:${process.env.ADMIN_BOOTSTRAP_EMAIL || 'abhinavutkarsh3@gmail.com'}`,
        )
        .digest()
    : crypto.randomBytes(32);

const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 hours

// Sliding-window brute-force limiter: max 10 failed attempts per 15 minutes
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 10;
const failedLoginMap = new Map<string, number[]>();

const ALL_BASE_SLOTS: BaseShiftSlot[] = ['morning', 'noon', 'evening', 'night'];

const DOUBLE_PRESET_SLOTS: Record<string, BaseShiftSlot[]> = {
  morning_noon: ['morning', 'noon'],
  noon_evening: ['noon', 'evening'],
  evening_night: ['evening', 'night'],
  morning_evening: ['morning', 'evening'],
};

const SHIFT_FEE_TABLE: Record<string, { fixed: number; non_fixed: number }> = {
  morning: { non_fixed: 500, fixed: 650 },
  noon: { non_fixed: 500, fixed: 650 },
  evening: { non_fixed: 550, fixed: 700 },
  night: { non_fixed: 550, fixed: 700 },
  double: { non_fixed: 900, fixed: 1100 },
  triple: { non_fixed: 1200, fixed: 1450 },
  all_shifts: { non_fixed: 1500, fixed: 1800 },
};

export function getRequiredShiftSlots(shiftType: string, doublePresetId = 'morning_noon'): BaseShiftSlot[] {
  switch (shiftType) {
    case 'morning':
      return ['morning'];
    case 'noon':
      return ['noon'];
    case 'evening':
      return ['evening'];
    case 'night':
      return ['night'];
    case 'double':
      return DOUBLE_PRESET_SLOTS[doublePresetId] || ['morning', 'noon'];
    case 'triple':
      return ['morning', 'noon', 'evening'];
    case 'all_shifts':
      return ['morning', 'noon', 'evening', 'night'];
    default:
      return ['morning'];
  }
}

export function computeStandardMonthlyFee(shiftType: string, seatMode: string): number {
  const row = SHIFT_FEE_TABLE[shiftType] || SHIFT_FEE_TABLE.morning;
  return seatMode === 'fixed' ? row.fixed : row.non_fixed;
}

function buildDefault120Seats(): SerializedRecord[] {
  const seats: SerializedRecord[] = [];
  for (let i = 1; i <= 80; i++) {
    const seatCode = `H1-${String(i).padStart(2, '0')}`;
    const rowLetter = String.fromCharCode(65 + Math.floor((i - 1) / 10));
    seats.push({
      id: seatCode,
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
    });
  }
  for (let i = 1; i <= 40; i++) {
    const seatCode = `H2-${String(i).padStart(2, '0')}`;
    const rowLetter = String.fromCharCode(65 + Math.floor((i - 1) / 10));
    seats.push({
      id: seatCode,
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
    });
  }
  return seats;
}

function createEmptyStore(): PersistedPortalStore {
  return {
    version: 2,
    authorizedAdmins: [],
    adminCredentials: {},
    credentials: {},
    pendingRegistrationPasswords: {},
    students: {},
    seats: [],
    batches: [],
    payments: [],
    memberships: [],
    expenses: [],
    attendance: [],
    notices: [],
    notifications: [],
    verifications: [],
    tickets: [],
    messageTemplates: [],
    approvalRequests: [],
    auditLogs: [],
    libraryInfo: null,
    pendingActions: [],
    lastSyncedAt: null,
  };
}

function assertConfinedPath(targetPath: string): void {
  const resolved = path.resolve(targetPath);
  if (!resolved.startsWith(DATA_DIR + path.sep)) {
    throw new Error('Storage path escapes confined data directory.');
  }
}

function loadStoreFromDisk(): PersistedPortalStore {
  try {
    assertConfinedPath(STORE_PATH);
    if (!fs.existsSync(STORE_PATH)) {
      return createEmptyStore();
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistedPortalStore>;
    return {
      ...createEmptyStore(),
      ...parsed,
      version: 2,
      authorizedAdmins: Array.isArray(parsed.authorizedAdmins) ? parsed.authorizedAdmins : [],
      adminCredentials:
        parsed.adminCredentials && typeof parsed.adminCredentials === 'object'
          ? parsed.adminCredentials
          : {},
      credentials:
        parsed.credentials && typeof parsed.credentials === 'object' ? parsed.credentials : {},
      pendingRegistrationPasswords:
        parsed.pendingRegistrationPasswords && typeof parsed.pendingRegistrationPasswords === 'object'
          ? parsed.pendingRegistrationPasswords
          : {},
      students: parsed.students && typeof parsed.students === 'object' ? parsed.students : {},
      seats: Array.isArray(parsed.seats) ? parsed.seats : [],
      batches: Array.isArray(parsed.batches) ? parsed.batches : [],
      payments: Array.isArray(parsed.payments) ? parsed.payments : [],
      memberships: Array.isArray(parsed.memberships) ? parsed.memberships : [],
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      attendance: Array.isArray(parsed.attendance) ? parsed.attendance : [],
      notices: Array.isArray(parsed.notices) ? parsed.notices : [],
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
      verifications: Array.isArray(parsed.verifications) ? parsed.verifications : [],
      tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
      messageTemplates: Array.isArray(parsed.messageTemplates) ? parsed.messageTemplates : [],
      approvalRequests: Array.isArray(parsed.approvalRequests) ? parsed.approvalRequests : [],
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
      pendingActions: Array.isArray(parsed.pendingActions) ? parsed.pendingActions : [],
    };
  } catch {
    return createEmptyStore();
  }
}

const store: PersistedPortalStore = loadStoreFromDisk();

function persistStore(): void {
  try {
    assertConfinedPath(STORE_PATH);
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    }
    const tmpPath = path.resolve(DATA_DIR, `student-portal-store.${process.pid}.tmp`);
    assertConfinedPath(tmpPath);
    fs.writeFileSync(tmpPath, JSON.stringify(store), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmpPath, STORE_PATH);
  } catch (err) {
    console.error('Unable to persist student portal store:', err);
  }
}

// ============================================================================
// Password Hashing (scrypt + constant-time verification)
// ============================================================================
export function hashStudentPassword(password: string): { salt: string; passwordHash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return { salt, passwordHash: derived.toString('hex') };
}

export function verifyStudentPassword(
  password: string,
  salt: string,
  storedHashHex: string,
): boolean {
  try {
    const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
    const stored = Buffer.from(storedHashHex, 'hex');
    if (derived.length !== stored.length) return false;
    return crypto.timingSafeEqual(derived, stored);
  } catch {
    return false;
  }
}

// ============================================================================
// Signed Session Tokens (HMAC-SHA256)
// ============================================================================
function signHmacPayload(payload: object): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${sig}`;
}

function verifyHmacPayload<T extends { sub?: unknown; exp?: unknown }>(token: string): T | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encodedPayload, providedSig] = parts;
    if (!encodedPayload || !providedSig) return null;

    const expectedSig = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(encodedPayload)
      .digest('base64url');

    const a = Buffer.from(providedSig, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }

    const decoded = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as T;

    if (!decoded || typeof decoded.sub !== 'string' || typeof decoded.exp !== 'number') {
      return null;
    }
    if (decoded.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function signStudentSessionToken(params: {
  studentId: string;
  registrationNo: string;
  email: string;
}): { token: string; expiresAt: string } {
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + SESSION_TTL_SECONDS;
  const payload: StudentSessionPayload = {
    sub: params.studentId,
    reg: params.registrationNo,
    email: params.email,
    kind: 'student',
    iat: nowSec,
    exp: expSec,
  };
  return {
    token: signHmacPayload(payload),
    expiresAt: new Date(expSec * 1000).toISOString(),
  };
}

export function verifyStudentSessionToken(token: string): StudentSessionPayload | null {
  const decoded = verifyHmacPayload<StudentSessionPayload>(token);
  if (!decoded || decoded.kind === ('admin' as unknown)) return null;
  return decoded;
}

export function signAdminSessionToken(params: {
  uid: string;
  email: string;
  role: string;
  fullName: string;
}): { token: string; expiresAt: string } {
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + SESSION_TTL_SECONDS;
  const payload: AdminSessionPayload = {
    sub: params.uid,
    email: params.email,
    role: params.role,
    fullName: params.fullName,
    kind: 'admin',
    iat: nowSec,
    exp: expSec,
  };
  return {
    token: signHmacPayload(payload),
    expiresAt: new Date(expSec * 1000).toISOString(),
  };
}

export function verifyAdminSessionToken(token: string): AdminSessionPayload | null {
  const decoded = verifyHmacPayload<AdminSessionPayload>(token);
  if (!decoded || decoded.kind !== 'admin') return null;
  return decoded;
}

// ============================================================================
// Brute-Force Rate Limiting
// ============================================================================
export function checkLoginRateLimit(key: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const cutoff = now - LOGIN_WINDOW_MS;
  const entries = (failedLoginMap.get(key) || []).filter((ts) => ts > cutoff);
  if (entries.length === 0) {
    failedLoginMap.delete(key);
    return { allowed: true, retryAfterSec: 0 };
  }
  failedLoginMap.set(key, entries);
  if (entries.length >= MAX_FAILED_ATTEMPTS) {
    const oldest = entries[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + LOGIN_WINDOW_MS - now) / 1000));
    return { allowed: false, retryAfterSec };
  }
  return { allowed: true, retryAfterSec: 0 };
}

export function recordFailedLogin(key: string): void {
  const now = Date.now();
  const cutoff = now - LOGIN_WINDOW_MS;
  const entries = (failedLoginMap.get(key) || []).filter((ts) => ts > cutoff);
  entries.push(now);
  failedLoginMap.set(key, entries);
}

export function clearLoginFailures(key: string): void {
  failedLoginMap.delete(key);
}

// ============================================================================
// Helper: Seat Occupancy & Availability Projection (Strictly Non-PII)
// ============================================================================
function getEffectiveSeats(): SerializedRecord[] {
  return store.seats.length > 0 ? store.seats : buildDefault120Seats();
}

function projectSeatAvailability(seat: SerializedRecord): PublicSeatAvailabilityItem {
  const seatType = seat.seatType === 'fixed' ? 'fixed' : 'non_fixed';
  const rawStatus = String(seat.status || 'available');
  const status: PublicSeatAvailabilityItem['status'] =
    rawStatus === 'occupied' || rawStatus === 'partial' || rawStatus === 'maintenance'
      ? rawStatus
      : 'available';

  const occupiedSlots: BaseShiftSlot[] = [];
  const shiftSlots =
    seat.shiftSlots && typeof seat.shiftSlots === 'object'
      ? (seat.shiftSlots as Record<string, unknown>)
      : {};

  for (const slot of ALL_BASE_SLOTS) {
    if (shiftSlots[slot]) {
      occupiedSlots.push(slot);
    }
  }

  const isFixedOccupied =
    (seatType === 'fixed' && Boolean(seat.assignedStudentId)) ||
    status === 'occupied';

  if (isFixedOccupied && occupiedSlots.length < 4) {
    return {
      seatCode: String(seat.seatCode || seat.id),
      hall: seat.hall === 'Hall 2' ? 'Hall 2' : 'Hall 1',
      seatNumber: Number(seat.seatNumber || 0),
      rowLabel: String(seat.rowLabel || 'Row A'),
      seatType,
      status,
      occupiedSlots: [...ALL_BASE_SLOTS],
      isFixedOccupied: true,
    };
  }

  return {
    seatCode: String(seat.seatCode || seat.id),
    hall: seat.hall === 'Hall 2' ? 'Hall 2' : 'Hall 1',
    seatNumber: Number(seat.seatNumber || 0),
    rowLabel: String(seat.rowLabel || 'Row A'),
    seatType,
    status,
    occupiedSlots,
    isFixedOccupied: false,
  };
}

// ============================================================================
// Store Operations
// ============================================================================
export const studentPortalStore = {
  // --------------------------------------------------------------------------
  // Admin Auth & Super Admin Password Provisioning
  // --------------------------------------------------------------------------
  isAuthorizedAdmin(uid: string, email: string): boolean {
    const normalizedEmail = email.trim().toLowerCase();
    const inSynced = store.authorizedAdmins.some(
      (a) =>
        a.active &&
        (a.uid === uid || (normalizedEmail && a.email.trim().toLowerCase() === normalizedEmail)),
    );
    if (inSynced) return true;
    return Object.values(store.adminCredentials).some(
      (a) =>
        a.active &&
        (a.uid === uid || (normalizedEmail && a.email.trim().toLowerCase() === normalizedEmail)),
    );
  },

  isSuperAdmin(uid: string, email: string): boolean {
    const normalizedEmail = email.trim().toLowerCase();
    const syncedMatch = store.authorizedAdmins.find(
      (a) =>
        a.active &&
        (a.uid === uid || (normalizedEmail && a.email.trim().toLowerCase() === normalizedEmail)),
    );
    if (syncedMatch) return syncedMatch.role === 'super_admin';
    const credMatch = Object.values(store.adminCredentials).find(
      (a) =>
        a.active &&
        (a.uid === uid || (normalizedEmail && a.email.trim().toLowerCase() === normalizedEmail)),
    );
    return credMatch?.role === 'super_admin';
  },

  setAdminPassword(params: {
    uid: string;
    email: string;
    fullName: string;
    role: string;
    branch?: string;
    phone?: string;
    active?: boolean;
    password: string;
    updatedBy: string;
  }): { uid: string; email: string; role: string; updatedAt: string } {
    const normalizedEmail = params.email.trim().toLowerCase();
    const { salt, passwordHash } = hashStudentPassword(params.password);
    const updatedAt = new Date().toISOString();

    store.adminCredentials[params.uid] = {
      uid: params.uid,
      email: normalizedEmail,
      fullName: params.fullName.trim(),
      role: params.role,
      branch: (params.branch || 'Electronic City, Bangalore').trim(),
      phone: (params.phone || '').trim(),
      active: params.active !== false,
      salt,
      passwordHash,
      updatedAt,
      updatedBy: params.updatedBy,
    };

    // Keep authorizedAdmins mirror synchronized immediately
    const existingIdx = store.authorizedAdmins.findIndex(
      (a) => a.uid === params.uid || a.email.toLowerCase() === normalizedEmail,
    );
    const syncedEntry: StoredAdminEntry = {
      uid: params.uid,
      email: normalizedEmail,
      fullName: params.fullName.trim(),
      role: params.role,
      branch: (params.branch || 'Electronic City, Bangalore').trim(),
      phone: (params.phone || '').trim(),
      active: params.active !== false,
      updatedAt,
    };
    if (existingIdx >= 0) {
      store.authorizedAdmins[existingIdx] = {
        ...store.authorizedAdmins[existingIdx],
        ...syncedEntry,
      };
    } else {
      store.authorizedAdmins.unshift(syncedEntry);
    }

    persistStore();
    return { uid: params.uid, email: normalizedEmail, role: params.role, updatedAt };
  },

  removeAdminPassword(uid: string): boolean {
    let removed = false;
    if (uid in store.adminCredentials) {
      delete store.adminCredentials[uid];
      removed = true;
    }
    store.authorizedAdmins = store.authorizedAdmins.filter((a) => a.uid !== uid);
    if (removed) persistStore();
    return removed;
  },

  getAdminPasswordUids(): Record<string, { email: string; updatedAt: string }> {
    const out: Record<string, { email: string; updatedAt: string }> = {};
    for (const [uid, cred] of Object.entries(store.adminCredentials)) {
      out[uid] = { email: cred.email, updatedAt: cred.updatedAt };
    }
    return out;
  },

  findAdminCredentialByEmail(email: string): StoredAdminCredential | null {
    const lower = email.trim().toLowerCase();
    if (!lower) return null;
    for (const cred of Object.values(store.adminCredentials)) {
      if (cred.email.toLowerCase() === lower) {
        return cred;
      }
    }
    return null;
  },

  getAdminProfileByUid(uid: string): StoredAdminEntry | null {
    const synced = store.authorizedAdmins.find((a) => a.uid === uid);
    if (synced) return synced;
    const cred = store.adminCredentials[uid];
    if (!cred) return null;
    return {
      uid: cred.uid,
      email: cred.email,
      fullName: cred.fullName,
      role: cred.role,
      branch: cred.branch,
      phone: cred.phone,
      active: cred.active,
      updatedAt: cred.updatedAt,
    };
  },

  // --------------------------------------------------------------------------
  // Student Password Auth
  // --------------------------------------------------------------------------
  setStudentPassword(params: {
    studentId: string;
    registrationNo: string;
    email: string;
    password: string;
    updatedBy: string;
    studentSnapshot?: SerializedRecord;
  }): { email: string; registrationNo: string; updatedAt: string } {
    const normalizedEmail = params.email.trim().toLowerCase();
    const normalizedReg = params.registrationNo.trim().toUpperCase();
    const { salt, passwordHash } = hashStudentPassword(params.password);
    const updatedAt = new Date().toISOString();

    store.credentials[params.studentId] = {
      studentId: params.studentId,
      registrationNo: normalizedReg,
      email: normalizedEmail,
      salt,
      passwordHash,
      updatedAt,
      updatedBy: params.updatedBy,
    };

    if (params.studentSnapshot) {
      store.students[params.studentId] = {
        ...store.students[params.studentId],
        ...params.studentSnapshot,
        id: params.studentId,
        email: normalizedEmail || String(params.studentSnapshot.email || ''),
        registrationNo: normalizedReg || String(params.studentSnapshot.registrationNo || ''),
      };
    } else if (store.students[params.studentId]) {
      store.students[params.studentId] = {
        ...store.students[params.studentId],
        email: normalizedEmail,
      };
    }

    persistStore();
    return { email: normalizedEmail, registrationNo: normalizedReg, updatedAt };
  },

  activateRegistrationPassword(params: {
    referenceNo: string;
    studentId: string;
    registrationNo: string;
    email: string;
    updatedBy: string;
    studentSnapshot?: SerializedRecord;
  }): boolean {
    const refKey = params.referenceNo.trim().toUpperCase();
    const pending = store.pendingRegistrationPasswords[refKey];
    if (!pending) return false;

    const normalizedEmail = (params.email || pending.email || '').trim().toLowerCase();
    const normalizedReg = params.registrationNo.trim().toUpperCase();
    const updatedAt = new Date().toISOString();

    store.credentials[params.studentId] = {
      studentId: params.studentId,
      registrationNo: normalizedReg,
      email: normalizedEmail,
      salt: pending.salt,
      passwordHash: pending.passwordHash,
      updatedAt,
      updatedBy: params.updatedBy,
    };

    if (params.studentSnapshot) {
      store.students[params.studentId] = {
        ...store.students[params.studentId],
        ...params.studentSnapshot,
        id: params.studentId,
        email: normalizedEmail,
        registrationNo: normalizedReg,
      };
    }

    delete store.pendingRegistrationPasswords[refKey];
    persistStore();
    return true;
  },

  removeStudentPassword(studentId: string): boolean {
    if (!(studentId in store.credentials)) return false;
    delete store.credentials[studentId];
    persistStore();
    return true;
  },

  getCredentialStatus(studentId: string): {
    hasPassword: boolean;
    email: string;
    registrationNo: string;
    updatedAt: string | null;
  } {
    const cred = store.credentials[studentId];
    if (!cred) {
      return { hasPassword: false, email: '', registrationNo: '', updatedAt: null };
    }
    return {
      hasPassword: true,
      email: cred.email,
      registrationNo: cred.registrationNo,
      updatedAt: cred.updatedAt,
    };
  },

  findCredentialByIdentifier(identifier: string): StoredStudentCredential | null {
    const trimmed = identifier.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    const upper = trimmed.toUpperCase();

    for (const cred of Object.values(store.credentials)) {
      if (cred.email && cred.email.toLowerCase() === lower) {
        return cred;
      }
      if (cred.registrationNo && cred.registrationNo.toUpperCase() === upper) {
        return cred;
      }
    }
    return null;
  },

  getStudentById(studentId: string): SerializedRecord | null {
    return store.students[studentId] || null;
  },

  verifyAndChangePassword(studentId: string, currentPassword: string, newPassword: string): boolean {
    const cred = store.credentials[studentId];
    if (!cred) return false;
    if (!verifyStudentPassword(currentPassword, cred.salt, cred.passwordHash)) {
      return false;
    }
    const { salt, passwordHash } = hashStudentPassword(newPassword);
    store.credentials[studentId] = {
      ...cred,
      salt,
      passwordHash,
      updatedAt: new Date().toISOString(),
      updatedBy: `student:${studentId}`,
    };
    persistStore();
    return true;
  },

  // --------------------------------------------------------------------------
  // Seat Availability & Approval Requests (Public Registration & Seat Change)
  // --------------------------------------------------------------------------
  getPublicSeatAvailability(): PublicSeatAvailabilityItem[] {
    return getEffectiveSeats()
      .map(projectSeatAvailability)
      .sort((a, b) => a.seatNumber - b.seatNumber);
  },

  getPublicActiveBatches(): Array<{
    id: string;
    name: string;
    code: string;
    category: string;
    targetExam: string;
  }> {
    return store.batches
      .filter((b) => b.active !== false)
      .map((b) => ({
        id: String(b.id),
        name: String(b.name || ''),
        code: String(b.code || ''),
        category: String(b.category || 'general'),
        targetExam: String(b.targetExam || ''),
      }));
  },

  checkSeatAvailableForRequest(params: {
    seatCode: string;
    seatMode: string;
    shiftType: string;
    doublePresetId?: string;
    excludeStudentId?: string;
  }): { ok: true; hall: 'Hall 1' | 'Hall 2' } | { ok: false; error: string } {
    const seats = getEffectiveSeats();
    const seat = seats.find(
      (s) => String(s.seatCode || s.id).toUpperCase() === params.seatCode.trim().toUpperCase(),
    );
    if (!seat) {
      return { ok: false, error: `Seat ${params.seatCode} does not exist in Av_eSAFE Library.` };
    }
    if (seat.status === 'maintenance') {
      return { ok: false, error: `Seat ${params.seatCode} is currently under maintenance.` };
    }

    const hall: 'Hall 1' | 'Hall 2' = seat.hall === 'Hall 2' ? 'Hall 2' : 'Hall 1';
    const shiftSlots =
      seat.shiftSlots && typeof seat.shiftSlots === 'object'
        ? (seat.shiftSlots as Record<string, { studentId?: string } | undefined>)
        : {};

    const assignedId = String(seat.assignedStudentId || '');
    const isMine = Boolean(params.excludeStudentId && assignedId === params.excludeStudentId);

    if (params.seatMode === 'fixed') {
      if (assignedId && !isMine) {
        return { ok: false, error: `Seat ${params.seatCode} is already assigned as a fixed seat.` };
      }
      const otherSlotHolder = ALL_BASE_SLOTS.find(
        (sl) => shiftSlots[sl] && shiftSlots[sl]?.studentId !== params.excludeStudentId,
      );
      if (otherSlotHolder) {
        return {
          ok: false,
          error: `Seat ${params.seatCode} already has a shift occupant in ${otherSlotHolder} shift and cannot be booked as Fixed 24h.`,
        };
      }
      return { ok: true, hall };
    }

    // Non-fixed seat mode
    if (seat.seatType === 'fixed' && assignedId && !isMine) {
      return {
        ok: false,
        error: `Seat ${params.seatCode} is currently reserved as a Fixed 24h seat.`,
      };
    }

    const requiredSlots = getRequiredShiftSlots(params.shiftType, params.doublePresetId);
    for (const slot of requiredSlots) {
      const occupant = shiftSlots[slot];
      if (occupant && occupant.studentId !== params.excludeStudentId) {
        return {
          ok: false,
          error: `Seat ${params.seatCode} is already occupied during the ${slot} shift. Please pick another available seat.`,
        };
      }
    }

    return { ok: true, hall };
  },

  createPublicRegistrationRequest(input: {
    fullName: string;
    phone: string;
    email?: string;
    gender?: string;
    dateOfBirth?: string;
    guardianName?: string;
    guardianPhone?: string;
    address?: string;
    batchId?: string;
    batchName?: string;
    requestedSeatMode: 'fixed' | 'non_fixed' | 'unseated';
    requestedHall: 'Hall 1' | 'Hall 2' | 'Unassigned';
    requestedSeatId?: string;
    requestedShiftType: string;
    doublePresetId?: string;
    portalPassword?: string;
    reason?: string;
  }): { ok: true; record: SerializedRecord } | { ok: false; error: string } {
    let resolvedHall: 'Hall 1' | 'Hall 2' | 'Unassigned' = input.requestedHall;
    let resolvedSeatId = (input.requestedSeatId || '').trim().toUpperCase();

    if (input.requestedSeatMode === 'unseated') {
      resolvedHall = 'Unassigned';
      resolvedSeatId = '';
    } else if (resolvedSeatId) {
      const check = this.checkSeatAvailableForRequest({
        seatCode: resolvedSeatId,
        seatMode: input.requestedSeatMode,
        shiftType: input.requestedShiftType,
        doublePresetId: input.doublePresetId,
      });
      if (!check.ok) {
        return { ok: false, error: check.error };
      }
      resolvedHall = check.hall;
    }

    const nowIso = new Date().toISOString();
    const year = new Date().getFullYear();
    const rand = String(Math.floor(1000 + Math.random() * 9000));
    const referenceNo = `APP-${year}-${rand}`;
    const recordId = `req_${crypto.randomUUID().slice(0, 12)}`;
    const estimatedMonthlyFee = computeStandardMonthlyFee(
      input.requestedShiftType,
      input.requestedSeatMode,
    );

    const hasPortalPassword = Boolean(input.portalPassword && input.portalPassword.length >= 6);
    if (hasPortalPassword && input.portalPassword) {
      const { salt, passwordHash } = hashStudentPassword(input.portalPassword);
      store.pendingRegistrationPasswords[referenceNo] = {
        referenceNo,
        email: (input.email || '').trim().toLowerCase(),
        salt,
        passwordHash,
        createdAt: nowIso,
      };
    }

    const record: SerializedRecord = {
      id: recordId,
      referenceNo,
      requestType: 'new_registration',
      status: 'pending',
      fullName: input.fullName.trim(),
      phone: input.phone.trim(),
      email: (input.email || '').trim().toLowerCase(),
      ...(input.gender ? { gender: input.gender } : {}),
      dateOfBirth: (input.dateOfBirth || '').trim(),
      guardianName: (input.guardianName || '').trim(),
      guardianPhone: (input.guardianPhone || '').trim(),
      address: (input.address || '').trim(),
      batchId: (input.batchId || '').trim(),
      batchName: (input.batchName || '').trim(),
      requestedHall: resolvedHall,
      requestedSeatId: resolvedSeatId,
      requestedSeatMode: input.requestedSeatMode,
      requestedShiftType: input.requestedShiftType,
      doublePresetId: input.doublePresetId || '',
      estimatedMonthlyFee,
      hasPortalPassword,
      reason: (input.reason || '').trim(),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    store.approvalRequests = [record, ...store.approvalRequests];
    store.pendingActions.push({
      id: `act_${crypto.randomUUID()}`,
      type: 'approval_request_create',
      studentId: '',
      createdAt: nowIso,
      payload: record,
    });
    persistStore();
    return { ok: true, record };
  },

  getPublicApplicationStatus(referenceNo: string): Record<string, unknown> | null {
    const norm = referenceNo.trim().toUpperCase();
    if (!norm) return null;
    const found = store.approvalRequests.find(
      (r) => String(r.referenceNo || '').toUpperCase() === norm,
    );
    if (!found) return null;
    // Strictly non-PII status summary
    return {
      referenceNo: found.referenceNo,
      requestType: found.requestType,
      status: found.status,
      registrationNo: found.approvedRegistrationNo || found.registrationNo || '',
      requestedHall: found.requestedHall,
      requestedSeatId: found.requestedSeatId || '',
      requestedSeatMode: found.requestedSeatMode,
      requestedShiftType: found.requestedShiftType,
      batchName: found.batchName || '',
      estimatedMonthlyFee: found.estimatedMonthlyFee,
      reviewNote: found.reviewNote || '',
      createdAt: found.createdAt,
      updatedAt: found.updatedAt,
    };
  },

  createStudentChangeRequest(
    studentId: string,
    input: {
      requestedSeatMode: 'fixed' | 'non_fixed' | 'unseated';
      requestedHall: 'Hall 1' | 'Hall 2' | 'Unassigned';
      requestedSeatId?: string;
      requestedShiftType: string;
      doublePresetId?: string;
      batchId?: string;
      batchName?: string;
      reason?: string;
    },
  ): { ok: true; record: SerializedRecord } | { ok: false; error: string } {
    const profile = store.students[studentId];
    if (!profile) {
      return { ok: false, error: 'Student enrollment record not found.' };
    }

    let resolvedHall: 'Hall 1' | 'Hall 2' | 'Unassigned' = input.requestedHall;
    let resolvedSeatId = (input.requestedSeatId || '').trim().toUpperCase();

    if (input.requestedSeatMode === 'unseated') {
      resolvedHall = 'Unassigned';
      resolvedSeatId = '';
    } else if (resolvedSeatId) {
      const check = this.checkSeatAvailableForRequest({
        seatCode: resolvedSeatId,
        seatMode: input.requestedSeatMode,
        shiftType: input.requestedShiftType,
        doublePresetId: input.doublePresetId,
        excludeStudentId: studentId,
      });
      if (!check.ok) {
        return { ok: false, error: check.error };
      }
      resolvedHall = check.hall;
    }

    const nowIso = new Date().toISOString();
    const year = new Date().getFullYear();
    const rand = String(Math.floor(1000 + Math.random() * 9000));
    const referenceNo = `CHG-${year}-${rand}`;
    const recordId = `req_${crypto.randomUUID().slice(0, 12)}`;
    const estimatedMonthlyFee = computeStandardMonthlyFee(
      input.requestedShiftType,
      input.requestedSeatMode,
    );

    const record: SerializedRecord = {
      id: recordId,
      referenceNo,
      requestType: 'seat_shift_change',
      status: 'pending',
      studentId,
      studentUid: String(profile.uid || studentId),
      registrationNo: String(profile.registrationNo || ''),
      fullName: String(profile.fullName || ''),
      phone: String(profile.phone || ''),
      email: String(profile.email || ''),
      batchId: input.batchId !== undefined ? input.batchId : String(profile.batchId || ''),
      batchName: input.batchName !== undefined ? input.batchName : String(profile.batchName || ''),
      currentHall: String(profile.hall || 'Unassigned'),
      currentSeatId: String(profile.seatId || ''),
      currentSeatMode: String(profile.seatMode || 'unseated'),
      currentShiftType: String(profile.shiftType || 'morning'),
      requestedHall: resolvedHall,
      requestedSeatId: resolvedSeatId,
      requestedSeatMode: input.requestedSeatMode,
      requestedShiftType: input.requestedShiftType,
      doublePresetId: input.doublePresetId || '',
      estimatedMonthlyFee,
      reason: (input.reason || '').trim(),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    store.approvalRequests = [record, ...store.approvalRequests];
    store.pendingActions.push({
      id: `act_${crypto.randomUUID()}`,
      type: 'approval_request_create',
      studentId,
      createdAt: nowIso,
      payload: record,
    });
    persistStore();
    return { ok: true, record };
  },

  // --------------------------------------------------------------------------
  // Admin Snapshot Sync (Firestore <-> Backend Mirror)
  // --------------------------------------------------------------------------
  syncAdminSnapshot(payload: {
    admins?: StoredAdminEntry[];
    students?: SerializedRecord[];
    seats?: SerializedRecord[];
    batches?: SerializedRecord[];
    payments?: SerializedRecord[];
    memberships?: SerializedRecord[];
    expenses?: SerializedRecord[];
    attendance?: SerializedRecord[];
    notices?: SerializedRecord[];
    notifications?: SerializedRecord[];
    verifications?: SerializedRecord[];
    tickets?: SerializedRecord[];
    messageTemplates?: SerializedRecord[];
    approvalRequests?: SerializedRecord[];
    auditLogs?: SerializedRecord[];
    libraryInfo?: Record<string, unknown> | null;
  }): { syncedAt: string; pendingActions: PendingStudentAction[] } {
    if (Array.isArray(payload.admins)) {
      store.authorizedAdmins = payload.admins.map((a) => ({
        uid: String(a.uid || ''),
        email: String(a.email || '').trim().toLowerCase(),
        fullName: String(a.fullName || ''),
        role: String(a.role || 'staff'),
        branch: String(a.branch || 'Electronic City, Bangalore'),
        phone: String(a.phone || ''),
        active: Boolean(a.active),
        createdAt: typeof a.createdAt === 'string' ? a.createdAt : undefined,
        updatedAt: typeof a.updatedAt === 'string' ? a.updatedAt : undefined,
      }));
      // Synchronize active/role flags onto adminCredentials so suspended/deleted admins lose password access immediately
      const syncedByUid = new Map(store.authorizedAdmins.map((a) => [a.uid, a]));
      for (const [uid, cred] of Object.entries(store.adminCredentials)) {
        const synced = syncedByUid.get(uid);
        if (synced) {
          store.adminCredentials[uid] = {
            ...cred,
            fullName: synced.fullName || cred.fullName,
            role: synced.role,
            branch: synced.branch || cred.branch,
            phone: synced.phone ?? cred.phone,
            active: synced.active,
          };
        }
      }
    }

    if (Array.isArray(payload.students)) {
      const nextMap: Record<string, SerializedRecord> = {};
      for (const st of payload.students) {
        if (!st || typeof st.id !== 'string') continue;
        nextMap[st.id] = st;
        const existingCred = store.credentials[st.id];
        if (existingCred) {
          const nextEmail =
            typeof st.email === 'string' ? st.email.trim().toLowerCase() : existingCred.email;
          const nextReg =
            typeof st.registrationNo === 'string'
              ? st.registrationNo.trim().toUpperCase()
              : existingCred.registrationNo;
          if (nextEmail !== existingCred.email || nextReg !== existingCred.registrationNo) {
            store.credentials[st.id] = {
              ...existingCred,
              email: nextEmail,
              registrationNo: nextReg,
            };
          }
        }
      }
      store.students = nextMap;
    }

    if (Array.isArray(payload.seats)) store.seats = payload.seats;
    if (Array.isArray(payload.batches)) store.batches = payload.batches;
    if (Array.isArray(payload.payments)) store.payments = payload.payments;
    if (Array.isArray(payload.memberships)) store.memberships = payload.memberships;
    if (Array.isArray(payload.expenses)) store.expenses = payload.expenses;
    if (Array.isArray(payload.attendance)) store.attendance = payload.attendance;
    if (Array.isArray(payload.notices)) store.notices = payload.notices;
    if (Array.isArray(payload.notifications)) store.notifications = payload.notifications;
    if (Array.isArray(payload.verifications)) store.verifications = payload.verifications;
    if (Array.isArray(payload.tickets)) store.tickets = payload.tickets;
    if (Array.isArray(payload.messageTemplates)) store.messageTemplates = payload.messageTemplates;
    if (Array.isArray(payload.auditLogs)) store.auditLogs = payload.auditLogs;
    if (Array.isArray(payload.approvalRequests)) {
      // Merge: keep any un-flushed local requests whose referenceNo isn't in Firestore yet
      const firestoreRefs = new Set(
        payload.approvalRequests.map((r) => String(r.referenceNo || '').toUpperCase()),
      );
      const pendingLocalOnly = store.approvalRequests.filter(
        (r) =>
          String(r.id || '').startsWith('req_') &&
          !firestoreRefs.has(String(r.referenceNo || '').toUpperCase()),
      );
      store.approvalRequests = [...pendingLocalOnly, ...payload.approvalRequests];
    }
    if (payload.libraryInfo !== undefined) store.libraryInfo = payload.libraryInfo;

    store.lastSyncedAt = new Date().toISOString();
    persistStore();
    return {
      syncedAt: store.lastSyncedAt,
      pendingActions: store.pendingActions,
    };
  },

  acknowledgePendingActions(actionIds: string[]): number {
    if (actionIds.length === 0) return 0;
    const idSet = new Set(actionIds);
    const before = store.pendingActions.length;
    store.pendingActions = store.pendingActions.filter((a) => !idSet.has(a.id));
    const removed = before - store.pendingActions.length;
    if (removed > 0) {
      persistStore();
    }
    return removed;
  },

  // --------------------------------------------------------------------------
  // Password-Authenticated Admin Portal Bundle & Mutations
  // --------------------------------------------------------------------------
  getAdminPortalBundle() {
    return {
      admins: store.authorizedAdmins,
      students: Object.values(store.students),
      seats: getEffectiveSeats(),
      batches: store.batches,
      payments: store.payments,
      memberships: store.memberships,
      expenses: store.expenses,
      attendance: store.attendance,
      notices: store.notices,
      notifications: store.notifications,
      verifications: store.verifications,
      tickets: store.tickets,
      messageTemplates: store.messageTemplates,
      approvalRequests: store.approvalRequests,
      auditLogs: store.auditLogs,
      libraryInfo: store.libraryInfo,
      lastSyncedAt: store.lastSyncedAt,
    };
  },

  applyPasswordAdminAction(
    actor: { uid: string; email: string; role: string; fullName: string },
    actionType:
      | 'admin_notice_create'
      | 'admin_notification_create'
      | 'admin_batch_upsert'
      | 'admin_student_upsert'
      | 'admin_approval_update',
    payload: Record<string, unknown>,
  ): SerializedRecord {
    const nowIso = new Date().toISOString();
    const recordId = String(payload.id || `admact_${crypto.randomUUID().slice(0, 12)}`);
    const record: SerializedRecord = {
      ...payload,
      id: recordId,
      updatedAt: nowIso,
      createdAt: payload.createdAt || nowIso,
    };

    if (actionType === 'admin_notice_create') {
      store.notices = [record, ...store.notices];
    } else if (actionType === 'admin_notification_create') {
      store.notifications = [record, ...store.notifications];
    } else if (actionType === 'admin_batch_upsert') {
      const idx = store.batches.findIndex((b) => b.id === recordId);
      if (idx >= 0) store.batches[idx] = { ...store.batches[idx], ...record };
      else store.batches = [record, ...store.batches];
    } else if (actionType === 'admin_student_upsert') {
      store.students[recordId] = { ...store.students[recordId], ...record };
    } else if (actionType === 'admin_approval_update') {
      store.approvalRequests = store.approvalRequests.map((r) =>
        r.id === recordId || r.referenceNo === record.referenceNo ? { ...r, ...record } : r,
      );
    }

    store.pendingActions.push({
      id: `act_${crypto.randomUUID()}`,
      type: actionType,
      studentId: String(payload.studentId || ''),
      createdAt: nowIso,
      payload: { ...record, _actorUid: actor.uid, _actorEmail: actor.email, _actorRole: actor.role },
    });
    persistStore();
    return record;
  },

  // --------------------------------------------------------------------------
  // Student Self-Service Portal Bundle & Actions
  // --------------------------------------------------------------------------
  getStudentPortalBundle(studentId: string) {
    const profile = store.students[studentId] || null;
    if (!profile) return null;

    const uid = typeof profile.uid === 'string' ? profile.uid : '';
    const matchesStudent = (rec: SerializedRecord): boolean => {
      if (rec.studentId === studentId) return true;
      if (uid && rec.studentUid === uid) return true;
      return false;
    };

    const payments = store.payments.filter(matchesStudent);
    const memberships = store.memberships.filter(matchesStudent);
    const attendance = store.attendance.filter(matchesStudent);
    const notices = store.notices.filter((n) => n.published === true);
    const notifications = store.notifications.filter(
      (n) =>
        n.recipientRole === 'student' &&
        (n.studentId === studentId ||
          n.recipientUid === studentId ||
          (uid && n.recipientUid === uid)),
    );
    const verifications = store.verifications.filter(matchesStudent);
    const tickets = store.tickets.filter(matchesStudent);
    const approvalRequests = store.approvalRequests.filter(matchesStudent);

    return {
      profile,
      payments,
      memberships,
      attendance,
      notices,
      notifications,
      verifications,
      tickets,
      approvalRequests,
      seatAvailability: this.getPublicSeatAvailability(),
      batches: this.getPublicActiveBatches(),
      libraryInfo: store.libraryInfo,
    };
  },

  applyStudentProfileUpdate(
    studentId: string,
    updates: {
      gender?: string;
      dateOfBirth?: string;
      profilePhotoUrl?: string;
      removePhoto?: boolean;
    },
  ): SerializedRecord | null {
    const existing = store.students[studentId];
    if (!existing) return null;

    const nowIso = new Date().toISOString();
    const next: SerializedRecord = { ...existing, updatedAt: nowIso };
    if (updates.gender !== undefined) next.gender = updates.gender;
    if (updates.dateOfBirth !== undefined) next.dateOfBirth = updates.dateOfBirth;
    if (updates.removePhoto) {
      next.profilePhotoUrl = '';
      next.profilePhotoUpdatedAt = nowIso;
    } else if (updates.profilePhotoUrl !== undefined) {
      next.profilePhotoUrl = updates.profilePhotoUrl;
      next.profilePhotoUpdatedAt = nowIso;
    }

    store.students[studentId] = next;
    store.pendingActions.push({
      id: `act_${crypto.randomUUID()}`,
      type: 'profile_update',
      studentId,
      createdAt: nowIso,
      payload: {
        ...(updates.gender ? { gender: updates.gender } : {}),
        ...(typeof updates.dateOfBirth === 'string' ? { dateOfBirth: updates.dateOfBirth } : {}),
        ...(updates.removePhoto
          ? { profilePhotoUrl: '' }
          : updates.profilePhotoUrl !== undefined
            ? { profilePhotoUrl: updates.profilePhotoUrl }
            : {}),
      },
    });
    persistStore();
    return next;
  },

  markNotificationsRead(studentId: string, notificationIds: string[]): number {
    const profile = store.students[studentId];
    if (!profile) return 0;
    const uid = typeof profile.uid === 'string' ? profile.uid : '';
    const idSet = new Set(notificationIds);
    const nowIso = new Date().toISOString();
    let updated = 0;

    store.notifications = store.notifications.map((n) => {
      const isMine =
        n.recipientRole === 'student' &&
        (n.studentId === studentId ||
          n.recipientUid === studentId ||
          (uid && n.recipientUid === uid));
      if (isMine && idSet.has(n.id) && !n.read) {
        updated += 1;
        store.pendingActions.push({
          id: `act_${crypto.randomUUID()}`,
          type: 'notification_read',
          studentId,
          createdAt: nowIso,
          payload: { notificationId: n.id },
        });
        return { ...n, read: true, updatedAt: nowIso };
      }
      return n;
    });

    if (updated > 0) persistStore();
    return updated;
  },

  addStudentPaymentProof(
    studentId: string,
    input: {
      billingMonth: string;
      amount: number;
      paymentMethod: string;
      utrReference: string;
      payerName: string;
      notes: string;
    },
  ): SerializedRecord | null {
    const profile = store.students[studentId];
    if (!profile) return null;

    const nowIso = new Date().toISOString();
    const recordId = `opv_${crypto.randomUUID().slice(0, 12)}`;
    const record: SerializedRecord = {
      id: recordId,
      studentId,
      studentUid: String(profile.uid || studentId),
      studentName: String(profile.fullName || ''),
      registrationNo: String(profile.registrationNo || ''),
      phone: String(profile.phone || ''),
      billingMonth: input.billingMonth,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      utrReference: input.utrReference.toUpperCase(),
      payerName: input.payerName,
      notes: input.notes,
      status: 'pending',
      submittedByRole: 'student',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    store.verifications = [record, ...store.verifications];
    store.pendingActions.push({
      id: `act_${crypto.randomUUID()}`,
      type: 'payment_proof_create',
      studentId,
      createdAt: nowIso,
      payload: record,
    });
    persistStore();
    return record;
  },

  addStudentTicket(
    studentId: string,
    input: {
      category: string;
      priority: string;
      subject: string;
      description: string;
    },
  ): SerializedRecord | null {
    const profile = store.students[studentId];
    if (!profile) return null;

    const nowIso = new Date().toISOString();
    const recordId = `tkt_${crypto.randomUUID().slice(0, 12)}`;
    const suffix = String(Date.now()).slice(-4);
    const ticketNo = `TKT-${new Date().getFullYear()}-${suffix}`;
    const record: SerializedRecord = {
      id: recordId,
      ticketNo,
      studentId,
      studentUid: String(profile.uid || studentId),
      studentName: String(profile.fullName || ''),
      registrationNo: String(profile.registrationNo || ''),
      phone: String(profile.phone || ''),
      category: input.category,
      priority: input.priority,
      subject: input.subject,
      description: input.description,
      status: 'open',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    store.tickets = [record, ...store.tickets];
    store.pendingActions.push({
      id: `act_${crypto.randomUUID()}`,
      type: 'ticket_create',
      studentId,
      createdAt: nowIso,
      payload: record,
    });
    persistStore();
    return record;
  },

  closeStudentTicket(studentId: string, ticketId: string): boolean {
    const profile = store.students[studentId];
    if (!profile) return false;
    const uid = typeof profile.uid === 'string' ? profile.uid : '';
    const nowIso = new Date().toISOString();
    let closed = false;

    store.tickets = store.tickets.map((t) => {
      const isMine =
        t.studentId === studentId || t.studentUid === studentId || (uid && t.studentUid === uid);
      if (isMine && t.id === ticketId) {
        closed = true;
        store.pendingActions.push({
          id: `act_${crypto.randomUUID()}`,
          type: 'ticket_close',
          studentId,
          createdAt: nowIso,
          payload: { ticketId },
        });
        return { ...t, status: 'closed', updatedAt: nowIso };
      }
      return t;
    });

    if (closed) persistStore();
    return closed;
  },
};
