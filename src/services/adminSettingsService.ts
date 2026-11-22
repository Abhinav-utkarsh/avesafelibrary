import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { z } from 'zod';
import { db } from '../lib/firebase';
import { buildAdminInviteKey } from '../lib/authProvisioning';
import {
  isPasswordAdminSessionActive,
  removeAdminPortalPassword,
  setAdminPortalPassword,
  subscribePasswordAdminBundle,
} from '../lib/adminSessionToken';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import type {
  AdminInviteRecord,
  AdminProfile,
  AdminRole,
  LibrarySettings,
  NotificationRecord,
  NotificationType,
} from '../types/domain';

export const ADMIN_ROLE_VALUES = [
  'super_admin',
  'branch_manager',
  'manager',
  'accounts',
  'admin',
  'staff',
] as const;

export const librarySettingsSchema = z.object({
  libraryName: z.string().trim().min(2, 'Library name required.').max(140),
  location: z.string().trim().min(2, 'Location required.').max(200),
  operatingHours: z.string().trim().min(2, 'Operating hours required.').max(40),
  gracePeriodDays: z.coerce.number().int().min(0).max(30),
  antiPassbackMinutes: z.coerce.number().int().min(0).max(120),
  allowDemoAutoExpiry: z.boolean(),
});

export type LibrarySettingsInput = z.infer<typeof librarySettingsSchema>;

export const createAdminSchema = z.object({
  uid: z
    .string()
    .trim()
    .min(6, 'Firebase Auth UID must be at least 6 characters.')
    .max(128)
    .regex(/^[a-zA-Z0-9_\-]+$/, 'UID may only contain letters, numbers, underscores, and hyphens.'),
  email: z.string().trim().email('Enter a valid email address.').max(160),
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters.').max(120),
  role: z.enum(ADMIN_ROLE_VALUES),
  branch: z.string().trim().max(120).optional().default('Electronic City, Bangalore'),
  phone: z.string().trim().max(20).optional().default(''),
  active: z.boolean().default(true),
});

export type CreateAdminInput = z.infer<typeof createAdminSchema>;

export const provisionAdminPasswordSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.').max(160),
  password: z.string().min(6, 'Password must be at least 6 characters.').max(128),
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters.').max(120),
  role: z.enum(ADMIN_ROLE_VALUES),
  branch: z.string().trim().max(120).optional().default('Electronic City, Bangalore'),
  phone: z.string().trim().max(20).optional().default(''),
});

export type ProvisionAdminPasswordInput = z.infer<typeof provisionAdminPasswordSchema>;

export const createAdminInviteSchema = z.object({
  email: z.string().trim().email('Enter a valid Google email address.').max(160),
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters.').max(120),
  role: z.enum(ADMIN_ROLE_VALUES),
  branch: z.string().trim().max(120).optional().default('Electronic City, Bangalore'),
  phone: z.string().trim().max(20).optional().default(''),
});

export type CreateAdminInviteInput = z.infer<typeof createAdminInviteSchema>;

export const updateAdminSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(ADMIN_ROLE_VALUES),
  branch: z.string().trim().max(120).optional().default(''),
  phone: z.string().trim().max(20).optional().default(''),
  active: z.boolean(),
});

export type UpdateAdminInput = z.infer<typeof updateAdminSchema>;

export const adminNoteSchema = z.object({
  title: z.string().trim().min(2, 'Title is required.').max(140),
  message: z.string().trim().min(2, 'Message is required.').max(600),
  type: z.enum(['info', 'fee_due', 'expiry', 'seat', 'security', 'door', 'birthday', 'ticket']),
});

export type AdminNoteInput = z.infer<typeof adminNoteSchema>;

export interface AuditLogEntry {
  id: string;
  actorUid: string;
  actorEmail?: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  summary: string;
  timestamp?: Timestamp;
}

async function appendSettingsAudit(
  actor: AdminProfile,
  action: string,
  resourceType: 'settings' | 'admins' | 'admin_invites' | 'notifications',
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

export function subscribeLibrarySettings(
  onData: (settings: LibrarySettings | null) => void,
): Unsubscribe {
  if (isPasswordAdminSessionActive()) {
    return subscribePasswordAdminBundle((bundle) => {
      onData(bundle.libraryInfo || null);
    });
  }
  return onSnapshot(
    doc(db, 'settings', 'library_config'),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(snap.data() as LibrarySettings);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/library_config');
    },
  );
}

export async function saveLibrarySettings(
  rawInput: LibrarySettingsInput,
  actor: AdminProfile,
): Promise<void> {
  const parsed = librarySettingsSchema.parse(rawInput);
  try {
    await setDoc(doc(db, 'settings', 'library_config'), {
      libraryName: parsed.libraryName,
      location: parsed.location,
      hall1Capacity: 80,
      hall2Capacity: 40,
      operatingHours: parsed.operatingHours,
      gracePeriodDays: parsed.gracePeriodDays,
      antiPassbackMinutes: parsed.antiPassbackMinutes,
      allowDemoAutoExpiry: parsed.allowDemoAutoExpiry,
      updatedAt: serverTimestamp(),
    });

    await appendSettingsAudit(
      actor,
      'UPDATE_LIBRARY_POLICIES',
      'settings',
      'library_config',
      `Updated policies: grace ${parsed.gracePeriodDays}d, anti-passback ${parsed.antiPassbackMinutes}m, demo auto-expiry ${parsed.allowDemoAutoExpiry ? 'ON' : 'OFF'}.`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'settings/library_config');
  }
}

export function subscribeAdminRoster(onData: (admins: AdminProfile[]) => void): Unsubscribe {
  if (isPasswordAdminSessionActive()) {
    return subscribePasswordAdminBundle((bundle) => {
      onData(bundle.admins || []);
    });
  }
  const q = query(collection(db, 'admins'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: AdminProfile[] = snapshot.docs.map((d) => ({
        ...(d.data() as AdminProfile),
        uid: d.id,
      }));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'admins');
    },
  );
}

export function subscribeAdminInvites(
  onData: (invites: AdminInviteRecord[]) => void,
): Unsubscribe {
  if (isPasswordAdminSessionActive()) {
    onData([]);
    return () => undefined;
  }
  const q = query(collection(db, 'admin_invites'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: AdminInviteRecord[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<AdminInviteRecord, 'id'>),
      }));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'admin_invites');
    },
  );
}

export async function createAdminAccountRecord(
  rawInput: CreateAdminInput,
  actor: AdminProfile,
): Promise<void> {
  const parsed = createAdminSchema.parse(rawInput);
  try {
    await setDoc(doc(db, 'admins', parsed.uid), {
      uid: parsed.uid,
      email: parsed.email.toLowerCase(),
      fullName: parsed.fullName,
      role: parsed.role as AdminRole,
      branch: parsed.branch || 'Electronic City, Bangalore',
      phone: parsed.phone || '',
      active: parsed.active,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await appendSettingsAudit(
      actor,
      'ADD_ADMIN_USER',
      'admins',
      parsed.uid,
      `Added ${parsed.role} account for ${parsed.fullName} (${parsed.email.toLowerCase()}).`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `admins/${parsed.uid}`);
  }
}

/**
 * Super Admin action: creates an Admin profile in /admins/{uid} and registers
 * an scrypt-hashed Email + Password credential on the server so the Admin can
 * immediately sign in with Email + Password (without requiring Firebase Console setup).
 */
export async function provisionAdminAccountWithPassword(
  rawInput: ProvisionAdminPasswordInput,
  actor: AdminProfile,
): Promise<{ uid: string; email: string }> {
  const parsed = provisionAdminPasswordSchema.parse(rawInput);
  const normalizedEmail = parsed.email.toLowerCase();
  const generatedUid = `adm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  if (!isPasswordAdminSessionActive()) {
    await createAdminAccountRecord(
      {
        uid: generatedUid,
        email: normalizedEmail,
        fullName: parsed.fullName,
        role: parsed.role,
        branch: parsed.branch || 'Electronic City, Bangalore',
        phone: parsed.phone || '',
        active: true,
      },
      actor,
    );
  }

  await setAdminPortalPassword({
    uid: generatedUid,
    email: normalizedEmail,
    fullName: parsed.fullName,
    role: parsed.role,
    branch: parsed.branch || 'Electronic City, Bangalore',
    phone: parsed.phone || '',
    active: true,
    password: parsed.password,
  });

  return { uid: generatedUid, email: normalizedEmail };
}

/**
 * Super Admin action: pre-approves an Admin by Google email so they claim their
 * exact role automatically on first Google Sign-In.
 */
export async function createAdminInviteRecord(
  rawInput: CreateAdminInviteInput,
  actor: AdminProfile,
): Promise<{ id: string }> {
  const parsed = createAdminInviteSchema.parse(rawInput);
  const normalizedEmail = parsed.email.toLowerCase();
  const inviteId = buildAdminInviteKey(normalizedEmail);

  try {
    await setDoc(doc(db, 'admin_invites', inviteId), {
      email: normalizedEmail,
      fullName: parsed.fullName,
      role: parsed.role as AdminRole,
      branch: parsed.branch || 'Electronic City, Bangalore',
      phone: parsed.phone || '',
      active: true,
      invitedBy: actor.uid,
      claimedByUid: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await appendSettingsAudit(
      actor,
      'CREATE_ADMIN_INVITE',
      'admin_invites',
      inviteId,
      `Pre-approved Google Sign-In for ${parsed.fullName} (${normalizedEmail}) with role ${parsed.role}.`,
    );

    return { id: inviteId };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `admin_invites/${inviteId}`);
  }
}

export async function deleteAdminInviteRecord(
  invite: AdminInviteRecord,
  actor: AdminProfile,
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'admin_invites', invite.id));
    await appendSettingsAudit(
      actor,
      'DELETE_ADMIN_INVITE',
      'admin_invites',
      invite.id,
      `Revoked admin invitation for ${invite.email}.`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `admin_invites/${invite.id}`);
  }
}

export async function updateAdminAccountRecord(
  target: AdminProfile,
  rawInput: UpdateAdminInput,
  actor: AdminProfile,
): Promise<void> {
  const parsed = updateAdminSchema.parse(rawInput);
  if (target.uid === actor.uid && (!parsed.active || parsed.role !== 'super_admin')) {
    throw new Error('You cannot deactivate or demote your own Super Admin account.');
  }

  try {
    await updateDoc(doc(db, 'admins', target.uid), {
      fullName: parsed.fullName,
      role: parsed.role as AdminRole,
      branch: parsed.branch ?? target.branch ?? '',
      phone: parsed.phone ?? target.phone ?? '',
      active: parsed.active,
      updatedAt: serverTimestamp(),
    });

    await appendSettingsAudit(
      actor,
      'UPDATE_ADMIN_USER',
      'admins',
      target.uid,
      `Updated ${target.email}: role=${parsed.role}, active=${parsed.active}.`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `admins/${target.uid}`);
  }
}

export async function deleteAdminAccountRecord(
  target: AdminProfile,
  actor: AdminProfile,
): Promise<void> {
  if (target.uid === actor.uid) {
    throw new Error('You cannot delete your own active Super Admin account.');
  }
  if (target.email.toLowerCase() === 'abhinavutkarsh3@gmail.com') {
    throw new Error('The primary Founder / Bootstrap Super Admin account cannot be deleted.');
  }

  try {
    await removeAdminPortalPassword(target.uid).catch(() => undefined);
    if (!isPasswordAdminSessionActive()) {
      await deleteDoc(doc(db, 'admins', target.uid));
      await appendSettingsAudit(
        actor,
        'DELETE_ADMIN_USER',
        'admins',
        target.uid,
        `Deleted administrator access for ${target.fullName} (${target.email}, previous role: ${target.role}).`,
      );
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `admins/${target.uid}`);
  }
}

export function subscribeAuditLogs(
  onData: (logs: AuditLogEntry[]) => void,
  maxItems = 250,
): Unsubscribe {
  if (isPasswordAdminSessionActive()) {
    return subscribePasswordAdminBundle((bundle) => {
      onData((bundle.auditLogs || []).slice(0, maxItems));
    });
  }
  const q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(maxItems));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: AuditLogEntry[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<AuditLogEntry, 'id'>),
      }));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'audit_logs');
    },
  );
}

export async function createAdminSelfNotification(
  rawInput: AdminNoteInput,
  actor: AdminProfile,
): Promise<void> {
  const parsed = adminNoteSchema.parse(rawInput);
  try {
    const ref = await addDoc(collection(db, 'notifications'), {
      recipientUid: actor.uid,
      recipientRole: 'admin',
      title: parsed.title,
      message: parsed.message,
      type: parsed.type as NotificationType,
      read: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await appendSettingsAudit(
      actor,
      'CREATE_ADMIN_NOTIFICATION',
      'notifications',
      ref.id,
      `Created internal admin alert "${parsed.title}" (${parsed.type}).`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'notifications');
  }
}

export async function markAdminNotificationRead(notif: NotificationRecord): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notif.id), {
      read: true,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `notifications/${notif.id}`);
  }
}

export async function deleteAdminNotification(
  notif: NotificationRecord,
  actor: AdminProfile,
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'notifications', notif.id));
    await appendSettingsAudit(
      actor,
      'DELETE_ADMIN_NOTIFICATION',
      'notifications',
      notif.id,
      `Dismissed admin notification "${notif.title}".`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `notifications/${notif.id}`);
  }
}
