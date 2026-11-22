import type { AdminRole } from '../types/domain';

export type AdminSectionId =
  | 'super-admin'
  | 'dashboard'
  | 'approvals'
  | 'students'
  | 'batches'
  | 'memberships'
  | 'seats'
  | 'fees'
  | 'expenses'
  | 'attendance'
  | 'communication'
  | 'analytics'
  | 'smart-door'
  | 'settings';

export interface AdminRoleDefinition {
  id: AdminRole;
  label: string;
  shortLabel: string;
  tier: 'owner' | 'management' | 'finance' | 'operations';
  description: string;
  allowedSections: AdminSectionId[];
}

export const ADMIN_ROLE_CATALOG: AdminRoleDefinition[] = [
  {
    id: 'super_admin',
    label: 'Super Admin (Owner / Founder)',
    shortLabel: 'Super Admin',
    tier: 'owner',
    description:
      'Unrestricted founder control: add/delete Admins, assign roles, manage all branches, finances, students, batches, and security audit logs.',
    allowedSections: [
      'super-admin',
      'dashboard',
      'approvals',
      'students',
      'batches',
      'memberships',
      'seats',
      'fees',
      'expenses',
      'attendance',
      'communication',
      'analytics',
      'smart-door',
      'settings',
    ],
  },
  {
    id: 'branch_manager',
    label: 'Branch Manager',
    shortLabel: 'Branch Manager',
    tier: 'management',
    description:
      'Full day-to-day branch leadership: admissions, exam batches, 120-seat map, fee collection, expenses, communication, smart door, and analytics.',
    allowedSections: [
      'dashboard',
      'approvals',
      'students',
      'batches',
      'memberships',
      'seats',
      'fees',
      'expenses',
      'attendance',
      'communication',
      'analytics',
      'smart-door',
      'settings',
    ],
  },
  {
    id: 'manager',
    label: 'Manager',
    shortLabel: 'Manager',
    tier: 'management',
    description:
      'Student lifecycle, exam batches, shift plans, seat allocations, fee collection, attendance, notices/WhatsApp outreach, and reports.',
    allowedSections: [
      'dashboard',
      'approvals',
      'students',
      'batches',
      'memberships',
      'seats',
      'fees',
      'attendance',
      'communication',
      'analytics',
    ],
  },
  {
    id: 'accounts',
    label: 'Accounts & Finance',
    shortLabel: 'Accounts',
    tier: 'finance',
    description:
      'Focused financial control: fee collection, pending dues, online UTR verification, A4 receipts/invoices, expenses ledger, and revenue analytics.',
    allowedSections: ['dashboard', 'students', 'fees', 'expenses', 'analytics'],
  },
  {
    id: 'admin',
    label: 'General Admin',
    shortLabel: 'Admin',
    tier: 'management',
    description:
      'Standard operations administrator with access to students, batches, seats, fees, attendance, communication, and reports.',
    allowedSections: [
      'dashboard',
      'approvals',
      'students',
      'batches',
      'memberships',
      'seats',
      'fees',
      'expenses',
      'attendance',
      'communication',
      'analytics',
      'smart-door',
      'settings',
    ],
  },
  {
    id: 'staff',
    label: 'Desk / Reception Staff',
    shortLabel: 'Desk Staff',
    tier: 'operations',
    description:
      'Front-desk intake: register students, print ID cards, mark attendance, manage seat map, collect fees, and handle student tickets.',
    allowedSections: [
      'dashboard',
      'approvals',
      'students',
      'batches',
      'memberships',
      'seats',
      'fees',
      'attendance',
      'communication',
    ],
  },
];

export function getAdminRoleDefinition(role?: AdminRole | string): AdminRoleDefinition {
  return (
    ADMIN_ROLE_CATALOG.find((item) => item.id === role) ||
    ADMIN_ROLE_CATALOG.find((item) => item.id === 'staff')!
  );
}

export function formatAdminRoleLabel(role?: AdminRole | string): string {
  return getAdminRoleDefinition(role).shortLabel;
}

export function canAccessAdminSection(
  role: AdminRole | undefined,
  sectionId: AdminSectionId,
): boolean {
  if (!role) return false;
  if (role === 'super_admin') return true;
  const def = getAdminRoleDefinition(role);
  return def.allowedSections.includes(sectionId);
}

export function getRoleTextColor(role?: AdminRole | string): string {
  switch (role) {
    case 'super_admin':
      return 'text-[#B4831D] dark:text-[#DFB55B]';
    case 'branch_manager':
      return 'text-indigo-700 dark:text-indigo-400';
    case 'manager':
      return 'text-blue-700 dark:text-sky-400';
    case 'accounts':
      return 'text-emerald-700 dark:text-emerald-400';
    case 'admin':
      return 'text-slate-800 dark:text-slate-200';
    default:
      return 'text-slate-600 dark:text-slate-400';
  }
}
