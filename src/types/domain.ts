import type { Timestamp } from 'firebase/firestore';

export type AdminRole =
  | 'super_admin'
  | 'branch_manager'
  | 'manager'
  | 'accounts'
  | 'admin'
  | 'staff';

export type ShiftType =
  | 'morning'
  | 'noon'
  | 'evening'
  | 'night'
  | 'double'
  | 'triple'
  | 'all_shifts';

export type SeatMode = 'fixed' | 'non_fixed' | 'unseated';
export type HallName = 'Hall 1' | 'Hall 2' | 'Unassigned';
export type AdmissionType = 'regular' | 'quick' | 'demo';
export type StudentStatus = 'active' | 'expired' | 'demo' | 'suspended' | 'inactive';
export type StudentGender = 'male' | 'female' | 'other' | 'prefer_not_to_say';
export type StudentCardStatus = 'none' | 'active' | 'revoked' | 'expired';

export const GENDER_OPTIONS: { id: StudentGender; label: string }[] = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'other', label: 'Other' },
  { id: 'prefer_not_to_say', label: 'Prefer not to say' },
];

export type BatchCategory =
  | 'upsc'
  | 'bpsc'
  | 'railway'
  | 'banking'
  | 'ssc'
  | 'state_psc'
  | 'defence'
  | 'teaching'
  | 'neet_jee'
  | 'ca_commerce'
  | 'law_judiciary'
  | 'it_tech'
  | 'college_school'
  | 'general'
  | 'other';

export const BATCH_CATEGORIES: { id: BatchCategory; label: string }[] = [
  { id: 'upsc', label: 'UPSC / Civil Services (IAS / IPS)' },
  { id: 'bpsc', label: 'BPSC / Bihar Civil Services' },
  { id: 'railway', label: 'Railway (RRB NTPC / Group D / ALP / JE)' },
  { id: 'banking', label: 'Banking & Insurance (IBPS / SBI / RBI / LIC)' },
  { id: 'ssc', label: 'SSC (CGL / CHSL / CPO / GD / MTS)' },
  { id: 'state_psc', label: 'State PSC (KPSC / UPPSC / MPPSC)' },
  { id: 'defence', label: 'Defence & Police (NDA / CDS / AFCAT / SI)' },
  { id: 'teaching', label: 'Teaching Exams (CTET / TET / KVS / UGC NET)' },
  { id: 'neet_jee', label: 'Medical & Engineering (NEET / JEE / CUET)' },
  { id: 'ca_commerce', label: 'CA / CS / CMA / CAT / MBA' },
  { id: 'law_judiciary', label: 'Law & Judiciary (CLAT / Judicial Services)' },
  { id: 'it_tech', label: 'IT / GATE / Coding & Tech Placements' },
  { id: 'college_school', label: 'College / Degree / Board Exams' },
  { id: 'general', label: 'General Self-Study' },
  { id: 'other', label: 'Other / Custom Course' },
];

export interface BatchRecord {
  id: string;
  name: string;
  code: string;
  category: BatchCategory;
  targetExam?: string;
  description?: string;
  active: boolean;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface AdminProfile {
  uid: string;
  email: string;
  fullName: string;
  role: AdminRole;
  branch?: string;
  phone?: string;
  active: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface AdminInviteRecord {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
  branch?: string;
  phone?: string;
  active: boolean;
  invitedBy: string;
  claimedByUid?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface StudentRecord {
  id: string;
  uid?: string;
  registrationNo: string;
  fullName: string;
  phone: string;
  email?: string;
  guardianName?: string;
  guardianPhone?: string;
  address?: string;
  dateOfBirth?: string;
  gender?: StudentGender;
  batchId?: string;
  batchName?: string;
  profilePhotoUrl?: string;
  profilePhotoUpdatedAt?: Timestamp;
  cardNumber?: string;
  cardIssuedAt?: Timestamp;
  cardStatus?: StudentCardStatus;
  admissionType: AdmissionType;
  status: StudentStatus;
  seatMode: SeatMode;
  seatId?: string;
  hall: HallName;
  shiftType: ShiftType;
  membershipExpiry?: string;
  monthlyFee: number;
  pendingAmount: number;
  fingerprintTemplateId?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface LibrarySettings {
  libraryName: string;
  location: string;
  hall1Capacity: number;
  hall2Capacity: number;
  operatingHours: string;
  gracePeriodDays: number;
  antiPassbackMinutes: number;
  allowDemoAutoExpiry: boolean;
  updatedAt?: Timestamp;
}

export interface BackendSessionInfo {
  verified: boolean;
  user: {
    uid: string;
    email: string;
    name: string;
    emailVerified: boolean;
    isBootstrapAdmin: boolean;
    expiresAt: string;
  };
  verifiedAt: string;
}

export interface SystemHealthResponse {
  service: string;
  status: string;
  timestamp: string;
  library: {
    name: string;
    location: string;
    operatingHours: string;
    capacity: {
      totalSeats: number;
      hall1Seats: number;
      hall2Seats: number;
    };
  };
  integrations: {
    firebaseConfigured: boolean;
    tokenVerificationReady: boolean;
    smartDoorHardware: 'configured' | 'not_configured_simulator_only';
  };
}

export interface ShiftCatalogItem {
  id: ShiftType;
  label: string;
  window: string;
  hours: number;
  defaultFeeNonFixed: number;
  defaultFeeFixed: number;
}

export type BaseShiftSlot = 'morning' | 'noon' | 'evening' | 'night';

export type SeatStatus = 'available' | 'occupied' | 'partial' | 'maintenance';

export interface SeatShiftOccupant {
  studentId: string;
  studentUid?: string;
  studentName: string;
  registrationNo?: string;
  shiftType: ShiftType;
}

export interface SeatRecord {
  id: string;
  seatCode: string;
  hall: 'Hall 1' | 'Hall 2';
  seatNumber: number;
  rowLabel: string;
  seatType: 'fixed' | 'non_fixed';
  status: SeatStatus;
  assignedStudentUid?: string;
  assignedStudentId?: string;
  assignedStudentName?: string;
  shiftSlots?: Partial<Record<BaseShiftSlot, SeatShiftOccupant>>;
  updatedAt?: Timestamp;
}

export type MembershipStatus = 'active' | 'expiring_soon' | 'expired' | 'cancelled';

export interface MembershipRecord {
  id: string;
  studentId: string;
  studentUid?: string;
  studentName: string;
  shiftType: ShiftType;
  seatMode: 'fixed' | 'non_fixed';
  seatId?: string;
  startDate: string;
  endDate: string;
  monthlyFee: number;
  status: MembershipStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type PaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'card';

export interface PaymentRecord {
  id: string;
  receiptNo: string;
  studentId: string;
  studentUid?: string;
  studentName: string;
  membershipId?: string;
  billingMonth: string;
  amountPaid: number;
  discount: number;
  dueAmount: number;
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
  notes?: string;
  collectedBy: string;
  paidAt?: Timestamp;
}

export type ExpenseCategory =
  | 'electricity'
  | 'rent'
  | 'internet'
  | 'maintenance'
  | 'staff'
  | 'water'
  | 'equipment'
  | 'other';

export interface ExpenseRecord {
  id: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  vendor?: string;
  paymentMethod: PaymentMethod;
  expenseDate: string;
  notes?: string;
  recordedBy: string;
  createdAt?: Timestamp;
}

export const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'cash', label: 'Cash' },
  { id: 'upi', label: 'UPI / QR' },
  { id: 'bank_transfer', label: 'Bank Transfer' },
  { id: 'card', label: 'Card' },
];

export const EXPENSE_CATEGORIES: { id: ExpenseCategory; label: string }[] = [
  { id: 'electricity', label: 'Electricity' },
  { id: 'rent', label: 'Rent & Lease' },
  { id: 'internet', label: 'Internet / Wi-Fi' },
  { id: 'staff', label: 'Staff Salary' },
  { id: 'maintenance', label: 'Maintenance & AC' },
  { id: 'water', label: 'Drinking Water' },
  { id: 'equipment', label: 'Furniture & Hardware' },
  { id: 'other', label: 'Other' },
];

export const SHIFT_DEFINITIONS: ShiftCatalogItem[] = [
  { id: 'morning', label: 'Morning', window: '06:00 AM – 12:00 PM', hours: 6, defaultFeeNonFixed: 500, defaultFeeFixed: 650 },
  { id: 'noon', label: 'Noon', window: '12:00 PM – 06:00 PM', hours: 6, defaultFeeNonFixed: 500, defaultFeeFixed: 650 },
  { id: 'evening', label: 'Evening', window: '04:00 PM – 10:00 PM', hours: 6, defaultFeeNonFixed: 550, defaultFeeFixed: 700 },
  { id: 'night', label: 'Night', window: '10:00 PM – 06:00 AM', hours: 8, defaultFeeNonFixed: 550, defaultFeeFixed: 700 },
  { id: 'double', label: 'Double Shift', window: '12 Hours Consecutive', hours: 12, defaultFeeNonFixed: 900, defaultFeeFixed: 1100 },
  { id: 'triple', label: 'Triple Shift', window: '18 Hours Extended', hours: 18, defaultFeeNonFixed: 1200, defaultFeeFixed: 1450 },
  { id: 'all_shifts', label: 'All Shifts (24/7)', window: '24-Hour Full Access', hours: 24, defaultFeeNonFixed: 1500, defaultFeeFixed: 1800 },
];

export type AttendanceSource = 'manual' | 'smart_door' | 'simulator';

export interface AttendanceRecord {
  id: string;
  studentId: string;
  studentUid?: string;
  studentName: string;
  date: string;
  entryTime?: Timestamp;
  exitTime?: Timestamp;
  durationMinutes?: number;
  isInside: boolean;
  source: AttendanceSource;
  deviceId?: string;
  updatedAt?: Timestamp;
}

export type NoticeCategory =
  | 'general'
  | 'fee_reminder'
  | 'schedule'
  | 'maintenance'
  | 'exam_alert';

export type NoticePriority = 'normal' | 'important' | 'urgent';

export type NoticeAudience = 'all' | 'hall_1' | 'hall_2' | 'unseated' | 'expiring';

export interface NoticeRecord {
  id: string;
  title: string;
  body: string;
  category: NoticeCategory;
  priority: NoticePriority;
  audience: NoticeAudience;
  published: boolean;
  publishedBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type NotificationType =
  | 'info'
  | 'fee_due'
  | 'expiry'
  | 'seat'
  | 'security'
  | 'door'
  | 'birthday'
  | 'ticket';

export interface NotificationRecord {
  id: string;
  recipientUid: string;
  recipientRole: 'admin' | 'student';
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export const NOTICE_CATEGORIES: { id: NoticeCategory; label: string }[] = [
  { id: 'general', label: 'General Notice' },
  { id: 'fee_reminder', label: 'Fee Reminder' },
  { id: 'schedule', label: 'Schedule & Shifts' },
  { id: 'maintenance', label: 'Facility & Maintenance' },
  { id: 'exam_alert', label: 'Exam Alert' },
];

export const NOTICE_PRIORITIES: { id: NoticePriority; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'important', label: 'Important' },
  { id: 'urgent', label: 'Urgent' },
];

export const NOTICE_AUDIENCES: { id: NoticeAudience; label: string }[] = [
  { id: 'all', label: 'All Students' },
  { id: 'hall_1', label: 'Hall 1 (80 Seats)' },
  { id: 'hall_2', label: 'Hall 2 (40 Seats)' },
  { id: 'unseated', label: 'Unseated Students' },
  { id: 'expiring', label: 'Expiring Soon (≤ 7 Days)' },
];

export const NOTIFICATION_TYPES: { id: NotificationType; label: string }[] = [
  { id: 'info', label: 'General Update' },
  { id: 'fee_due', label: 'Fee Due Reminder' },
  { id: 'expiry', label: 'Membership Expiry' },
  { id: 'seat', label: 'Seat & Hall Update' },
  { id: 'security', label: 'Policy & Security' },
  { id: 'door', label: 'Smart Door Notice' },
  { id: 'birthday', label: 'Birthday Greeting' },
  { id: 'ticket', label: 'Support Ticket Update' },
];

export type IoTDeviceMode = 'simulator' | 'hardware';
export type IoTDeviceStatus = 'not_configured' | 'online' | 'offline' | 'maintenance';
export type DoorState = 'locked' | 'unlocked' | 'ajar' | 'emergency_override';

export interface IoTDeviceRecord {
  id: string;
  deviceCode: string;
  name: string;
  location: string;
  mode: IoTDeviceMode;
  status: IoTDeviceStatus;
  doorState: DoorState;
  firmwareVersion?: string;
  antiPassbackEnabled: boolean;
  updatedAt?: Timestamp;
}

export interface AccessLogRecord {
  id: string;
  deviceId: string;
  mode: IoTDeviceMode;
  studentId?: string;
  studentName?: string;
  fingerprintId?: string;
  direction: 'entry' | 'exit';
  decision: 'GRANTED' | 'DENIED';
  reason: string;
  timestamp?: Timestamp;
}

export type IdCardStatus = 'active' | 'revoked' | 'superseded';

export interface CardReprintEntry {
  reprintedAt: string;
  reprintedBy: string;
  reason?: string;
}

export interface IdCardRecord {
  id: string;
  cardNumber: string;
  studentId: string;
  registrationNo: string;
  studentName: string;
  membershipType: SeatMode;
  shiftType: ShiftType;
  hall: HallName;
  seatId?: string;
  validUntil?: string;
  status: IdCardStatus;
  issuedBy: string;
  issuedAt?: Timestamp;
  reprintCount: number;
  reprintHistory?: CardReprintEntry[];
  revokedReason?: string;
  revokedAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CardVerificationRecord {
  cardNumber: string;
  registrationNo: string;
  studentName: string;
  membershipType: SeatMode;
  shiftLabel: string;
  hall: HallName;
  seatId?: string;
  membershipExpiry?: string;
  studentStatus: StudentStatus;
  cardStatus: IdCardStatus;
  issuedAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type CardVerificationVerdict = 'VALID' | 'EXPIRED' | 'INACTIVE' | 'REVOKED' | 'INVALID';

export interface CardVerificationResponse {
  verdict: CardVerificationVerdict;
  valid: boolean;
  reason: string;
  checkedAt: string;
  card?: {
    cardNumber: string;
    registrationNo: string;
    studentName: string;
    membershipType: SeatMode;
    shiftLabel: string;
    hall: HallName;
    seatId?: string;
    membershipExpiry?: string;
    studentStatus: StudentStatus;
    cardStatus: IdCardStatus;
  };
}

export type OnlinePaymentMethod = 'upi' | 'bank_transfer' | 'card';
export type OnlinePaymentStatus = 'pending' | 'approved' | 'rejected';

export interface OnlinePaymentVerificationRecord {
  id: string;
  studentId: string;
  studentUid?: string;
  studentName: string;
  registrationNo?: string;
  phone?: string;
  billingMonth: string;
  amount: number;
  paymentMethod: OnlinePaymentMethod;
  utrReference: string;
  payerName?: string;
  notes?: string;
  status: OnlinePaymentStatus;
  receiptNo?: string;
  reviewedBy?: string;
  reviewNote?: string;
  submittedByRole: 'student' | 'admin';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export const ONLINE_PAYMENT_METHODS: { id: OnlinePaymentMethod; label: string }[] = [
  { id: 'upi', label: 'UPI / QR (GPay, PhonePe, Paytm)' },
  { id: 'bank_transfer', label: 'IMPS / NEFT / Bank Transfer' },
  { id: 'card', label: 'Online Card / NetBanking' },
];

export type MessageTemplateCategory =
  | 'fee'
  | 'renewal'
  | 'birthday'
  | 'general'
  | 'ticket'
  | 'welcome';

export interface MessageTemplateRecord {
  id: string;
  name: string;
  category: MessageTemplateCategory;
  title: string;
  body: string;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export const MESSAGE_TEMPLATE_CATEGORIES: { id: MessageTemplateCategory; label: string }[] = [
  { id: 'fee', label: 'Fee & Dues' },
  { id: 'renewal', label: 'Early Renewal & Expiry' },
  { id: 'birthday', label: 'Birthday Wishes' },
  { id: 'welcome', label: 'Welcome & Onboarding' },
  { id: 'ticket', label: 'Ticket & Support' },
  { id: 'general', label: 'General Broadcast' },
];

export type TicketCategory = 'seat' | 'fee' | 'facility' | 'smart_door' | 'shift' | 'other';
export type TicketPriority = 'normal' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface StudentTicketRecord {
  id: string;
  ticketNo: string;
  studentId: string;
  studentUid?: string;
  studentName: string;
  registrationNo?: string;
  phone?: string;
  category: TicketCategory;
  priority: TicketPriority;
  subject: string;
  description: string;
  status: TicketStatus;
  adminReply?: string;
  repliedBy?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export const TICKET_CATEGORIES: { id: TicketCategory; label: string }[] = [
  { id: 'seat', label: 'Seat / Hall Issue' },
  { id: 'fee', label: 'Fee / Receipt Query' },
  { id: 'facility', label: 'AC / Wi-Fi / Facility' },
  { id: 'smart_door', label: 'Smart Door / ID Card' },
  { id: 'shift', label: 'Shift Change Request' },
  { id: 'other', label: 'Other Support' },
];

export const TICKET_PRIORITIES: { id: TicketPriority; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'high', label: 'High' },
  { id: 'urgent', label: 'Urgent' },
];

export const TICKET_STATUSES: { id: TicketStatus; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' },
];

export type StudentApprovalRequestType = 'new_registration' | 'seat_shift_change';
export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected';

export interface PublicSeatAvailability {
  seatCode: string;
  hall: 'Hall 1' | 'Hall 2';
  seatNumber: number;
  rowLabel: string;
  seatType: 'fixed' | 'non_fixed';
  status: SeatStatus;
  occupiedSlots: BaseShiftSlot[];
  isFixedOccupied: boolean;
}

export interface StudentApprovalRequestRecord {
  id: string;
  referenceNo: string;
  requestType: StudentApprovalRequestType;
  status: ApprovalRequestStatus;
  // Linked student (present for seat_shift_change, and populated after approval for new_registration)
  studentId?: string;
  studentUid?: string;
  registrationNo?: string;
  // Applicant / Student details
  fullName: string;
  phone: string;
  email?: string;
  gender?: StudentGender;
  dateOfBirth?: string;
  guardianName?: string;
  guardianPhone?: string;
  address?: string;
  // Batch / Course details
  batchId?: string;
  batchName?: string;
  // Current allocation (for seat_shift_change)
  currentHall?: HallName;
  currentSeatId?: string;
  currentSeatMode?: SeatMode;
  currentShiftType?: ShiftType;
  // Requested allocation
  requestedHall: HallName;
  requestedSeatId?: string;
  requestedSeatMode: SeatMode;
  requestedShiftType: ShiftType;
  doublePresetId?: string;
  estimatedMonthlyFee: number;
  // Metadata
  hasPortalPassword?: boolean;
  reason?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewNote?: string;
  approvedStudentId?: string;
  approvedRegistrationNo?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}





