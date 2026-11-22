import { apiRequest } from './api';
import { hydrateRecordTimestamps, serializeRecordForMirror } from './studentSessionToken';
import type {
  AdminProfile,
  AdminRole,
  AttendanceRecord,
  BatchRecord,
  ExpenseRecord,
  HallName,
  LibrarySettings,
  MembershipRecord,
  MessageTemplateRecord,
  NoticeRecord,
  NotificationRecord,
  OnlinePaymentVerificationRecord,
  PaymentRecord,
  PublicSeatAvailability,
  SeatMode,
  SeatRecord,
  ShiftType,
  StudentApprovalRequestRecord,
  StudentGender,
  StudentRecord,
  StudentTicketRecord,
} from '../types/domain';
import type { AuditLogEntry } from '../services/adminSettingsService';

// Strictly held in JS memory — NEVER persisted to localStorage or sessionStorage.
let inMemoryAdminBearerToken: string | null = null;

export function getAdminSessionToken(): string | null {
  return inMemoryAdminBearerToken;
}

export function setAdminSessionToken(token: string | null): void {
  inMemoryAdminBearerToken = token;
}

export function isPasswordAdminSessionActive(): boolean {
  return Boolean(inMemoryAdminBearerToken);
}

export class AdminApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ============================================================================
// Admin Email + Password Authentication (/api/admin-auth)
// ============================================================================
export interface AdminPasswordLoginResponse {
  ok: true;
  token: string;
  expiresAt: string;
  admin: AdminProfile;
}

export async function loginAdminWithPassword(
  email: string,
  password: string,
): Promise<AdminPasswordLoginResponse> {
  const response = await fetch('/api/admin-auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    token?: string;
    expiresAt?: string;
    admin?: Record<string, unknown>;
    error?: string;
    message?: string;
  };

  if (!response.ok || !payload.ok || !payload.token || !payload.admin) {
    const isBackendDown =
      !payload.error && (response.status === 404 || response.status >= 500);
    throw new AdminApiError(
      payload.message ||
        (isBackendDown
          ? 'Admin login API server is unavailable on this deployment. Redeploy with Vercel API routes enabled or sign in with Google.'
          : 'Invalid administrator email or password.'),
      response.status,
      payload.error || (isBackendDown ? 'BACKEND_UNAVAILABLE' : 'ADMIN_LOGIN_FAILED'),
    );
  }

  return {
    ok: true,
    token: payload.token,
    expiresAt: payload.expiresAt || '',
    admin: hydrateRecordTimestamps<AdminProfile>(payload.admin),
  };
}

export async function setAdminPortalPassword(params: {
  uid: string;
  email: string;
  fullName: string;
  role: AdminRole;
  branch?: string;
  phone?: string;
  active?: boolean;
  password: string;
}): Promise<{ ok: boolean; uid: string; email: string; updatedAt: string }> {
  return apiRequest('/api/admin-auth/set-password', {
    method: 'POST',
    requireAuth: true,
    body: JSON.stringify({
      uid: params.uid,
      email: params.email.trim().toLowerCase(),
      fullName: params.fullName.trim(),
      role: params.role,
      branch: params.branch || 'Electronic City, Bangalore',
      phone: params.phone || '',
      active: params.active ?? true,
      password: params.password,
    }),
  });
}

export async function getAdminPasswordStatuses(): Promise<
  Array<{ uid: string; email: string; updatedAt: string }>
> {
  const res = await apiRequest<{
    ok: boolean;
    passwords: Array<{ uid: string; email: string; updatedAt: string }>;
  }>('/api/admin-auth/status', {
    method: 'GET',
    requireAuth: true,
  });
  return res.passwords || [];
}

export async function removeAdminPortalPassword(uid: string): Promise<{ ok: boolean }> {
  return apiRequest(`/api/admin-auth/password/${encodeURIComponent(uid)}`, {
    method: 'DELETE',
    requireAuth: true,
  });
}

export async function activateRegistrationStudentPassword(params: {
  referenceNo: string;
  studentId: string;
  registrationNo: string;
  email: string;
  studentSnapshot?: StudentRecord;
}): Promise<{ ok: boolean; activated: boolean }> {
  return apiRequest('/api/student-auth/activate-registration-password', {
    method: 'POST',
    requireAuth: true,
    body: JSON.stringify({
      referenceNo: params.referenceNo,
      studentId: params.studentId,
      registrationNo: params.registrationNo,
      email: params.email.trim().toLowerCase(),
      studentSnapshot: params.studentSnapshot
        ? serializeRecordForMirror(params.studentSnapshot as unknown as Record<string, unknown>)
        : undefined,
    }),
  });
}

// ============================================================================
// Password-Authenticated Admin Portal Bundle (/api/admin-portal)
// ============================================================================
export interface AdminPortalBundle {
  admins: AdminProfile[];
  students: StudentRecord[];
  seats: SeatRecord[];
  batches: BatchRecord[];
  payments: PaymentRecord[];
  memberships: MembershipRecord[];
  expenses: ExpenseRecord[];
  attendance: AttendanceRecord[];
  notices: NoticeRecord[];
  notifications: NotificationRecord[];
  verifications: OnlinePaymentVerificationRecord[];
  tickets: StudentTicketRecord[];
  messageTemplates: MessageTemplateRecord[];
  approvalRequests: StudentApprovalRequestRecord[];
  auditLogs: AuditLogEntry[];
  libraryInfo: LibrarySettings | null;
}

const adminBundleListeners = new Set<(bundle: AdminPortalBundle) => void>();
let cachedAdminBundle: AdminPortalBundle | null = null;
let cachedAdminBundleFingerprint: string | null = null;
let adminPollTimer: number | null = null;
let inflightAdminFetch: Promise<AdminPortalBundle | null> | null = null;

function notifyAdminBundleListeners(bundle: AdminPortalBundle): void {
  cachedAdminBundle = bundle;
  for (const listener of adminBundleListeners) {
    listener(bundle);
  }
}

export function clearCachedAdminBundle(): void {
  cachedAdminBundle = null;
  cachedAdminBundleFingerprint = null;
  if (adminPollTimer !== null) {
    window.clearInterval(adminPollTimer);
    adminPollTimer = null;
  }
}

export async function fetchAdminPortalBundle(): Promise<AdminPortalBundle | null> {
  if (!getAdminSessionToken()) return null;
  if (inflightAdminFetch) return inflightAdminFetch;

  inflightAdminFetch = apiRequest<{
    ok: boolean;
    admins: Record<string, unknown>[];
    students: Record<string, unknown>[];
    seats: Record<string, unknown>[];
    batches: Record<string, unknown>[];
    payments: Record<string, unknown>[];
    memberships: Record<string, unknown>[];
    expenses: Record<string, unknown>[];
    attendance: Record<string, unknown>[];
    notices: Record<string, unknown>[];
    notifications: Record<string, unknown>[];
    verifications: Record<string, unknown>[];
    tickets: Record<string, unknown>[];
    messageTemplates: Record<string, unknown>[];
    approvalRequests: Record<string, unknown>[];
    auditLogs: Record<string, unknown>[];
    libraryInfo: Record<string, unknown> | null;
  }>('/api/admin-portal/bundle', { method: 'GET', requireAuth: true })
    .then((raw) => {
      const fingerprint = JSON.stringify(raw);
      if (cachedAdminBundle && fingerprint === cachedAdminBundleFingerprint) {
        return cachedAdminBundle;
      }
      cachedAdminBundleFingerprint = fingerprint;
      const hydrated: AdminPortalBundle = {
        admins: (raw.admins || []).map((r) => hydrateRecordTimestamps<AdminProfile>(r)),
        students: (raw.students || []).map((r) => hydrateRecordTimestamps<StudentRecord>(r)),
        seats: (raw.seats || []).map((r) => hydrateRecordTimestamps<SeatRecord>(r)),
        batches: (raw.batches || []).map((r) => hydrateRecordTimestamps<BatchRecord>(r)),
        payments: (raw.payments || []).map((r) => hydrateRecordTimestamps<PaymentRecord>(r)),
        memberships: (raw.memberships || []).map((r) => hydrateRecordTimestamps<MembershipRecord>(r)),
        expenses: (raw.expenses || []).map((r) => hydrateRecordTimestamps<ExpenseRecord>(r)),
        attendance: (raw.attendance || []).map((r) => hydrateRecordTimestamps<AttendanceRecord>(r)),
        notices: (raw.notices || []).map((r) => hydrateRecordTimestamps<NoticeRecord>(r)),
        notifications: (raw.notifications || []).map((r) =>
          hydrateRecordTimestamps<NotificationRecord>(r),
        ),
        verifications: (raw.verifications || []).map((r) =>
          hydrateRecordTimestamps<OnlinePaymentVerificationRecord>(r),
        ),
        tickets: (raw.tickets || []).map((r) => hydrateRecordTimestamps<StudentTicketRecord>(r)),
        messageTemplates: (raw.messageTemplates || []).map((r) =>
          hydrateRecordTimestamps<MessageTemplateRecord>(r),
        ),
        approvalRequests: (raw.approvalRequests || []).map((r) =>
          hydrateRecordTimestamps<StudentApprovalRequestRecord>(r),
        ),
        auditLogs: (raw.auditLogs || []).map((r) => hydrateRecordTimestamps<AuditLogEntry>(r)),
        libraryInfo: raw.libraryInfo
          ? hydrateRecordTimestamps<LibrarySettings>(raw.libraryInfo)
          : null,
      };
      notifyAdminBundleListeners(hydrated);
      return hydrated;
    })
    .catch(() => cachedAdminBundle)
    .finally(() => {
      inflightAdminFetch = null;
    });

  return inflightAdminFetch;
}

export function subscribePasswordAdminBundle(
  onData: (bundle: AdminPortalBundle) => void,
): () => void {
  adminBundleListeners.add(onData);
  if (cachedAdminBundle) {
    onData(cachedAdminBundle);
  }
  void fetchAdminPortalBundle();

  if (adminPollTimer === null && typeof window !== 'undefined') {
    adminPollTimer = window.setInterval(() => {
      if (adminBundleListeners.size > 0 && getAdminSessionToken()) {
        void fetchAdminPortalBundle();
      }
    }, 12000);
  }

  return () => {
    adminBundleListeners.delete(onData);
    if (adminBundleListeners.size === 0 && adminPollTimer !== null) {
      window.clearInterval(adminPollTimer);
      adminPollTimer = null;
    }
  };
}

export async function dispatchAdminPortalAction(
  actionType:
    | 'admin_notice_create'
    | 'admin_notification_create'
    | 'admin_batch_upsert'
    | 'admin_student_upsert'
    | 'admin_approval_update',
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await apiRequest<{ ok: boolean; record: Record<string, unknown> }>(
    '/api/admin-portal/action',
    {
      method: 'POST',
      requireAuth: true,
      body: JSON.stringify({ actionType, payload }),
    },
  );
  await fetchAdminPortalBundle();
  return res.record;
}

// ============================================================================
// Public Student Self-Registration & Seat Availability Catalog (/api/student-public)
// ============================================================================
export interface PublicRegistrationCatalog {
  seats: PublicSeatAvailability[];
  batches: Array<{
    id: string;
    name: string;
    code: string;
    category: string;
    targetExam?: string;
    active: boolean;
  }>;
}

export async function fetchPublicRegistrationCatalog(): Promise<PublicRegistrationCatalog> {
  const res = await apiRequest<{
    ok: boolean;
    seats: PublicSeatAvailability[];
    batches: PublicRegistrationCatalog['batches'];
  }>('/api/student-public/catalog', {
    method: 'GET',
    requireAuth: false,
  });
  return {
    seats: res.seats || [],
    batches: res.batches || [],
  };
}

export interface PublicStudentRegistrationInput {
  fullName: string;
  phone: string;
  email?: string;
  gender?: StudentGender;
  dateOfBirth?: string;
  guardianName?: string;
  guardianPhone?: string;
  address?: string;
  batchId?: string;
  batchName: string;
  requestedSeatMode: SeatMode;
  requestedHall: HallName;
  requestedSeatId?: string;
  requestedShiftType: ShiftType;
  doublePresetId?: string;
  portalPassword: string;
  reason?: string;
}

export interface PublicRegistrationResponse {
  ok: boolean;
  referenceNo: string;
  status: string;
  request: {
    id: string;
    referenceNo: string;
    status: string;
    requestedHall: HallName;
    requestedSeatId: string;
    requestedSeatMode: SeatMode;
    requestedShiftType: ShiftType;
    batchName: string;
    estimatedMonthlyFee: number;
    createdAt: string;
  };
}

export async function submitPublicStudentRegistration(
  input: PublicStudentRegistrationInput,
): Promise<PublicRegistrationResponse> {
  return apiRequest<PublicRegistrationResponse>('/api/student-public/register', {
    method: 'POST',
    requireAuth: false,
    body: JSON.stringify(input),
  });
}

export interface PublicApplicationStatusResponse {
  referenceNo: string;
  requestType: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedHall: string;
  requestedSeatId: string;
  requestedSeatMode: string;
  requestedShiftType: string;
  batchName: string;
  estimatedMonthlyFee: number;
  reviewNote: string;
  approvedRegistrationNo: string;
  createdAt: string;
  updatedAt: string;
}

export async function checkPublicApplicationStatus(
  referenceNo: string,
): Promise<PublicApplicationStatusResponse> {
  const res = await apiRequest<{ ok: boolean; application: PublicApplicationStatusResponse }>(
    `/api/student-public/application-status/${encodeURIComponent(referenceNo.trim().toUpperCase())}`,
    {
      method: 'GET',
      requireAuth: false,
    },
  );
  return res.application;
}
