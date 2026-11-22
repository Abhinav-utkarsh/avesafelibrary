import { deleteApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { auth } from './firebase';

const SECONDARY_APP_NAME = 'avesafe-account-provisioner';

/**
 * Deterministic Firestore document key for /admin_invites/{inviteId}.
 * Must match `email.lower().replace('[^a-z0-9]', '_')` in firestore.rules.
 */
export function buildAdminInviteKey(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
}

function mapProvisioningError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';

  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists in Firebase Authentication. You can send them a Password Reset email instead, or pre-approve them via Google Sign-In.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password is too weak. Use at least 8 characters with letters and numbers.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not yet enabled in Firebase Authentication Console. Open Firebase Console → Authentication → Sign-in method → Enable Email/Password, or use Google Sign-In pre-approval.';
    case 'auth/too-many-requests':
      return 'Too many account requests right now. Please wait a minute and try again.';
    default:
      return error instanceof Error ? error.message : 'Unable to create login account.';
  }
}

function getOrCreateSecondaryApp(): FirebaseApp {
  const existing = getApps().find((a) => a.name === SECONDARY_APP_NAME);
  if (existing) return existing;
  return initializeApp(firebaseConfig, SECONDARY_APP_NAME);
}

/**
 * Generates a readable, strong temporary password for student or admin onboarding.
 */
export function generateTemporaryPassword(length = 10): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '@#$!';
  const all = upper + lower + digits;

  const bytes = new Uint32Array(length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 100000);
    }
  }

  const chars: string[] = [
    upper[bytes[0] % upper.length],
    lower[bytes[1] % lower.length],
    digits[bytes[2] % digits.length],
    symbols[bytes[3] % symbols.length],
  ];

  for (let i = 4; i < length; i += 1) {
    chars.push(all[bytes[i] % all.length]);
  }

  return chars.join('');
}

/**
 * Provisions a real Firebase Authentication Email + Password user using a secondary
 * Firebase App instance so the currently signed-in Super Admin / Admin stays logged in.
 */
export async function provisionEmailPasswordAccount(params: {
  email: string;
  password: string;
  displayName?: string;
  sendVerificationEmail?: boolean;
}): Promise<{ uid: string; email: string }> {
  const normalizedEmail = params.email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error('Email address is required.');
  }
  if (!params.password || params.password.length < 6) {
    throw new Error('Password must be at least 6 characters.');
  }

  const secondaryApp = getOrCreateSecondaryApp();
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      normalizedEmail,
      params.password,
    );

    if (params.displayName?.trim()) {
      await updateProfile(credential.user, {
        displayName: params.displayName.trim().slice(0, 120),
      }).catch(() => undefined);
    }

    if (params.sendVerificationEmail) {
      await sendEmailVerification(credential.user).catch(() => undefined);
    }

    const uid = credential.user.uid;
    await signOut(secondaryAuth).catch(() => undefined);
    return { uid, email: normalizedEmail };
  } catch (err) {
    await signOut(secondaryAuth).catch(() => undefined);
    throw new Error(mapProvisioningError(err));
  } finally {
    // Keep app clean if idle; ignore cleanup errors
    await deleteApp(secondaryApp).catch(() => undefined);
  }
}

/**
 * Sends a real Firebase Auth password reset link to an existing email account.
 */
export async function sendAccountPasswordReset(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    throw new Error('Please enter a valid email address.');
  }
  try {
    await sendPasswordResetEmail(auth, normalized);
  } catch (err) {
    throw new Error(mapProvisioningError(err));
  }
}
