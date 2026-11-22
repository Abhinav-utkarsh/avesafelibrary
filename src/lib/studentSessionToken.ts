import { apiRequest } from './api';
import type {
  AttendanceRecord,
  BatchRecord,
  HallName,
  LibrarySettings,
  MembershipRecord,
  NoticeRecord,
  NotificationRecord,
  OnlinePaymentMethod,
  OnlinePaymentVerificationRecord,
  PaymentRecord,
  PublicSeatAvailability,
  SeatMode,
  ShiftType,
  StudentApprovalRequestRecord,
  StudentGender,
  StudentRecord,
  StudentTicketRecord,
  TicketCategory,
  TicketPriority,
} from '../types/domain';

// Strictly held in JS memory — NEVER persisted to localStorage or sessionStorage.
let inMemoryStudentBearerToken: string | null = null;

export function getStudentSessionToken(): string | null {
  return inMemoryStudentBearerToken;
}

export function setStudentSessionToken(token: string | null): void {
  inMemoryStudentBearerToken = token;
}

export function isPasswordStudentSessionActive(): boolean {
  return Boolean(inMemoryStudentBearerToken);
}

// ============================================================================
// Firestore Timestamp Serialization / Hydration Helpers
// ============================================================================
const TIMESTAMP_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'paidAt',
  'entryTime',
  'exitTime',
  'profilePhotoUpdatedAt',
  'cardIssuedAt',
  'verifiedAt',
  'resolvedAt',
  'timestamp',
]);

interface HydratedTimestamp {
  toDate: () => Date;
  toMillis: () => number;
  seconds: number;
  nanoseconds: number;
}

function makeTimestamp(ms: number): HydratedTimestamp {
  const safeMs = Number.isFinite(ms) ? ms : Date.now();
  return {
    toDate: () => new Date(safeMs),
    toMillis: () => safeMs,
    seconds: Math.floor(safeMs / 1000),
    nanoseconds: (safeMs % 1000) * 1_000_000,
  };
}

export function serializeRecordForMirror(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue;
    if (
      value !== null &&
      typeof value === 'object' &&
      'toMillis' in value &&
      typeof (value as { toMillis?: unknown }).toMillis === 'function'
    ) {
      out[key] = new Date((value as { toMillis: () => number }).toMillis()).toISOString();
    } else if (value instanceof Date) {
      out[key] = value.toISOString();
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function hydrateRecordTimestamps<T>(record: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...record };
  for (const key of Object.keys(out)) {
    const value = out[key];
    if (TIMESTAMP_FIELDS.has(key) && (typeof value === 'string' || typeof value === 'number')) {
      const ms = typeof value === 'number' ? value : Date.parse(value);
      if (Number.isFinite(ms)) {
        out[key] = makeTimestamp(ms);
      }
    }
  }
  return out as T;
}

// ============================================================================
// Student-Authenticated API Helper (In-Memory Bearer Token)
// ============================================================================
export class StudentApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function studentPortalApiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getStudentSessionToken();
  if (!token) {
    throw new StudentApiError('Student session is not active.', 401, 'STUDENT_UNAUTHORIZED');
  }

  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let code = 'REQUEST_FAILED';
    try {
      const payload = (await response.json()) as { message?: string; error?: string };
      if (payload.message) message = payload.message;
      if (payload.error) code = payload.error;
    } catch {
      // ignore non-JSON errors
    }
    throw new StudentApiError(message, response.status, code);
  }

  return (await response.json()) as T;
}

// ============================================================================
// Public Student Password Login
// ============================================================================
export interface StudentPasswordLoginResponse {
  ok: true;
  token: string;
  expiresAt: string;
  student: StudentRecord;
}

export async function loginStudentWithPassword(
  identifier: string,
  password: string,
): Promise<StudentPasswordLoginResponse> {
  const response = await fetch('/api/student-auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: identifier.trim(),
      password,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    token?: string;
    expiresAt?: string;
    student?: Record<string, unknown>;
    error?: string;
    message?: string;
  };

  if (!response.ok || !payload.ok || !payload.token || !payload.student) {
    const isBackendDown =
      !payload.error && (response.status === 404 || response.status >= 500);
    throw new StudentApiError(
      payload.message ||
        (isBackendDown
          ? 'Login API server is unavailable on this deployment. Redeploy with Vercel API routes enabled or sign in with Google.'
          : 'Invalid email or password.'),
      response.status,
      payload.error || (isBackendDown ? 'BACKEND_UNAVAILABLE' : 'LOGIN_FAILED'),
    );
  }

  return {
    ok: true,
    token: payload.token,
    expiresAt: payload.expiresAt || '',
    student: hydrateRecordTimestamps<StudentRecord>(payload.student),
  };
}

// ============================================================================
// Admin-Protected Credential Management Helpers
// ============================================================================
export async function setStudentPortalPassword(params: {
  studentId: string;
  registrationNo: string;
  email: string;
  password: string;
  studentSnapshot?: StudentRecord;
}): Promise<{ ok: boolean; email: string; registrationNo: string; updatedAt: string }> {
  return apiRequest('/api/student-auth/set-password', {
    method: 'POST',
    requireAuth: true,
    body: JSON.stringify({
      studentId: params.studentId,
      registrationNo: params.registrationNo,
      email: params.email.trim().toLowerCase(),
      password: params.password,
      studentSnapshot: params.studentSnapshot
        ? serializeRecordForMirror(params.studentSnapshot as unknown as Record<string, unknown>)
        : undefined,
    }),
  });
}

export async function getStudentPortalPasswordStatus(studentId: string): Promise<{
  ok: boolean;
  hasPassword: boolean;
  email: string;
  registrationNo: string;
  updatedAt: string | null;
}> {
  return apiRequest(`/api/student-auth/status/${encodeURIComponent(studentId)}`, {
    method: 'GET',
    requireAuth: true,
  });
}

export async function removeStudentPortalPassword(studentId: string): Promise<{ ok: boolean }> {
  return apiRequest(`/api/student-auth/password/${encodeURIComponent(studentId)}`, {
    method: 'DELETE',
    requireAuth: true,
  });
}

// ============================================================================
// Student Self-Service Portal Bundle & Mutation Helpers
// ============================================================================
export interface StudentPortalBundle {
  profile: StudentRecord;
  payments: PaymentRecord[];
  memberships: MembershipRecord[];
  attendance: AttendanceRecord[];
  notices: NoticeRecord[];
  notifications: NotificationRecord[];
  verifications: OnlinePaymentVerificationRecord[];
  tickets: StudentTicketRecord[];
  approvalRequests: StudentApprovalRequestRecord[];
  seatAvailability: PublicSeatAvailability[];
  batches: BatchRecord[];
  libraryInfo: LibrarySettings | null;
}

const bundleListeners = new Set<(bundle: StudentPortalBundle) => void>();
let cachedBundle: StudentPortalBundle | null = null;
let pollTimer: number | null = null;
let inflightFetch: Promise<StudentPortalBundle | null> | null = null;

function notifyBundleListeners(bundle: StudentPortalBundle): void {
  cachedBundle = bundle;
  for (const listener of bundleListeners) {
    listener(bundle);
  }
}

export function clearCachedStudentBundle(): void {
  cachedBundle = null;
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

export async function fetchStudentPortalBundle(): Promise<StudentPortalBundle | null> {
  if (!getStudentSessionToken()) return null;
  if (inflightFetch) return inflightFetch;

  inflightFetch = studentPortalApiRequest<{
    ok: boolean;
    profile: Record<string, unknown>;
    payments: Record<string, unknown>[];
    memberships: Record<string, unknown>[];
    attendance: Record<string, unknown>[];
    notices: Record<string, unknown>[];
    notifications: Record<string, unknown>[];
    verifications: Record<string, unknown>[];
    tickets: Record<string, unknown>[];
    approvalRequests?: Record<string, unknown>[];
    seatAvailability?: PublicSeatAvailability[];
    batches?: Record<string, unknown>[];
    libraryInfo: Record<string, unknown> | null;
  }>('/api/student-portal/me')
    .then((raw) => {
      const hydrated: StudentPortalBundle = {
        profile: hydrateRecordTimestamps<StudentRecord>(raw.profile),
        payments: (raw.payments || []).map((r) => hydrateRecordTimestamps<PaymentRecord>(r)),
        memberships: (raw.memberships || []).map((r) => hydrateRecordTimestamps<MembershipRecord>(r)),
        attendance: (raw.attendance || []).map((r) => hydrateRecordTimestamps<AttendanceRecord>(r)),
        notices: (raw.notices || []).map((r) => hydrateRecordTimestamps<NoticeRecord>(r)),
        notifications: (raw.notifications || []).map((r) =>
          hydrateRecordTimestamps<NotificationRecord>(r),
        ),
        verifications: (raw.verifications || []).map((r) =>
          hydrateRecordTimestamps<OnlinePaymentVerificationRecord>(r),
        ),
        tickets: (raw.tickets || []).map((r) => hydrateRecordTimestamps<StudentTicketRecord>(r)),
        approvalRequests: (raw.approvalRequests || []).map((r) =>
          hydrateRecordTimestamps<StudentApprovalRequestRecord>(r),
        ),
        seatAvailability: raw.seatAvailability || [],
        batches: (raw.batches || []).map((r) => hydrateRecordTimestamps<BatchRecord>(r)),
        libraryInfo: raw.libraryInfo
          ? hydrateRecordTimestamps<LibrarySettings>(raw.libraryInfo)
          : null,
      };
      notifyBundleListeners(hydrated);
      return hydrated;
    })
    .catch(() => cachedBundle)
    .finally(() => {
      inflightFetch = null;
    });

  return inflightFetch;
}

export function subscribePasswordStudentBundle(
  onData: (bundle: StudentPortalBundle) => void,
): () => void {
  bundleListeners.add(onData);
  if (cachedBundle) {
    onData(cachedBundle);
  }
  void fetchStudentPortalBundle();

  if (pollTimer === null && typeof window !== 'undefined') {
    pollTimer = window.setInterval(() => {
      if (bundleListeners.size > 0 && getStudentSessionToken()) {
        void fetchStudentPortalBundle();
      }
    }, 15000);
  }

  return () => {
    bundleListeners.delete(onData);
    if (bundleListeners.size === 0 && pollTimer !== null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  };
}

export async function updateStudentPortalProfileViaApi(changes: {
  gender?: StudentGender | '';
  dateOfBirth?: string;
  photoDataUrl?: string;
  removePhoto?: boolean;
}): Promise<StudentRecord> {
  const res = await studentPortalApiRequest<{ ok: boolean; profile: Record<string, unknown> }>(
    '/api/student-portal/profile',
    {
      method: 'PATCH',
      body: JSON.stringify(changes),
    },
  );
  const profile = hydrateRecordTimestamps<StudentRecord>(res.profile);
  await fetchStudentPortalBundle();
  return profile;
}

export async function changeOwnStudentPassword(
  currentPassword: string,
  newPassword: string,
): Promise<string> {
  const res = await studentPortalApiRequest<{ ok: boolean; message: string }>(
    '/api/student-portal/change-password',
    {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    },
  );
  return res.message;
}

export async function markStudentNotificationsReadViaApi(
  notificationIds: string[],
): Promise<void> {
  if (notificationIds.length === 0) return;
  await studentPortalApiRequest('/api/student-portal/notifications/read', {
    method: 'POST',
    body: JSON.stringify({ notificationIds }),
  });
  await fetchStudentPortalBundle();
}

export async function submitStudentPaymentProofViaApi(input: {
  billingMonth: string;
  amount: number;
  paymentMethod: OnlinePaymentMethod;
  utrReference: string;
  payerName: string;
  notes: string;
}): Promise<void> {
  await studentPortalApiRequest('/api/student-portal/payment-proof', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  await fetchStudentPortalBundle();
}

export async function createStudentTicketViaApi(input: {
  category: TicketCategory;
  priority: TicketPriority;
  subject: string;
  description: string;
}): Promise<{ id: string; ticketNo: string }> {
  const res = await studentPortalApiRequest<{ ok: boolean; id: string; ticketNo: string }>(
    '/api/student-portal/tickets',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
  await fetchStudentPortalBundle();
  return { id: res.id, ticketNo: res.ticketNo };
}

export async function closeStudentTicketViaApi(ticketId: string): Promise<void> {
  await studentPortalApiRequest(`/api/student-portal/tickets/${encodeURIComponent(ticketId)}/close`, {
    method: 'PATCH',
  });
  await fetchStudentPortalBundle();
}

export async function submitStudentChangeRequestViaApi(input: {
  requestedSeatMode: SeatMode;
  requestedHall: HallName;
  requestedSeatId?: string;
  requestedShiftType: ShiftType;
  doublePresetId?: string;
  batchId?: string;
  batchName?: string;
  reason?: string;
}): Promise<{ id: string; referenceNo: string }> {
  const res = await studentPortalApiRequest<{ ok: boolean; id: string; referenceNo: string }>(
    '/api/student-portal/change-request',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
  await fetchStudentPortalBundle();
  return { id: res.id, referenceNo: res.referenceNo };
}
