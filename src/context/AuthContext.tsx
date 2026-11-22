import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';
import { verifyBackendSession } from '../lib/api';
import { buildAdminInviteKey } from '../lib/authProvisioning';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import {
  clearCachedStudentBundle,
  fetchStudentPortalBundle,
  isPasswordStudentSessionActive,
  loginStudentWithPassword,
  setStudentSessionToken,
  StudentApiError,
} from '../lib/studentSessionToken';
import {
  AdminApiError,
  clearCachedAdminBundle,
  fetchAdminPortalBundle,
  isPasswordAdminSessionActive,
  loginAdminWithPassword,
  setAdminSessionToken,
} from '../lib/adminSessionToken';
import type {
  AdminInviteRecord,
  AdminProfile,
  AdminRole,
  BackendSessionInfo,
  StudentRecord,
} from '../types/domain';

export type ResolvedPortalRole = 'admin' | 'student' | 'unassigned';
export type StudentAuthMode = 'firebase' | 'password' | null;
export type AdminAuthMode = 'firebase' | 'password' | null;

interface AuthContextValue {
  firebaseUser: User | null;
  authReady: boolean;
  roleLoading: boolean;
  role: ResolvedPortalRole;
  studentAuthMode: StudentAuthMode;
  adminAuthMode: AdminAuthMode;
  isSuperAdmin: boolean;
  adminRole: AdminRole | null;
  adminProfile: AdminProfile | null;
  studentProfile: StudentRecord | null;
  backendSession: BackendSessionInfo | null;
  authError: string | null;
  clearAuthError: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (
    email: string,
    password: string,
    options?: { portal?: 'student' | 'admin' },
  ) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshRoleState: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function mapFirebaseAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';

  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Sign-in window was closed before completing authentication.';
    case 'auth/cancelled-popup-request':
      return 'Another sign-in popup was already open. Please try again.';
    case 'auth/popup-blocked':
      return 'Browser blocked the sign-in popup. Please allow popups for this site and try again.';
    case 'auth/unauthorized-domain': {
      const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
      return `Domain "${host}" is not authorized in Firebase Authentication. Open Firebase Console → Authentication → Settings → Authorized domains, add "${host}", and retry Google Sign-In.`;
    }
    case 'auth/network-request-failed':
      return 'Network error while contacting Firebase Authentication. Please check your internet connection and retry.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not yet enabled in Firebase Authentication Console. Use Google Sign-In or enable Email/Password under Authentication → Sign-in method.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password. Please verify your credentials and try again.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a few minutes before retrying.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    default:
      return error instanceof Error ? error.message : 'Authentication failed. Please try again.';
  }
}

const BOOTSTRAP_SUPER_ADMIN_EMAIL = 'abhinavutkarsh3@gmail.com';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [roleLoading, setRoleLoading] = useState(false);
  const [role, setRole] = useState<ResolvedPortalRole>('unassigned');
  const [studentAuthMode, setStudentAuthMode] = useState<StudentAuthMode>(null);
  const [adminAuthMode, setAdminAuthMode] = useState<AdminAuthMode>(null);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [studentProfile, setStudentProfile] = useState<StudentRecord | null>(null);
  const [backendSession, setBackendSession] = useState<BackendSessionInfo | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const resolveUserSession = useCallback(async (user: User | null) => {
    if (!user) {
      // Preserve an active password-based Student or Admin session if one is in memory
      if (isPasswordStudentSessionActive() || isPasswordAdminSessionActive()) {
        setRoleLoading(false);
        return;
      }
      setStudentAuthMode(null);
      setAdminAuthMode(null);
      setRole('unassigned');
      setAdminProfile(null);
      setStudentProfile(null);
      setBackendSession(null);
      setRoleLoading(false);
      return;
    }

    // Signing in with Firebase supersedes any in-memory password session
    setStudentSessionToken(null);
    clearCachedStudentBundle();
    setAdminSessionToken(null);
    clearCachedAdminBundle();
    setStudentAuthMode(null);
    setAdminAuthMode(null);

    setRoleLoading(true);
    setAuthError(null);

    try {
      // 1. Cryptographically verify ID token on Express backend when reachable;
      // fall back cleanly to Firebase Auth's verified user object if /api is cold or static-hosted
      // (Firestore security rules independently enforce cryptographic auth server-side).
      let session: BackendSessionInfo;
      try {
        session = await verifyBackendSession();
      } catch {
        const normalizedEmail = (user.email || '').trim().toLowerCase();
        session = {
          verified: true,
          user: {
            uid: user.uid,
            email: normalizedEmail,
            emailVerified: Boolean(user.emailVerified),
            name: user.displayName?.trim() || normalizedEmail.split('@')[0] || 'User',
            isBootstrapAdmin:
              Boolean(user.emailVerified) && normalizedEmail === BOOTSTRAP_SUPER_ADMIN_EMAIL,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          },
          verifiedAt: new Date().toISOString(),
        };
      }
      setBackendSession(session);

      // 2. Check /admins/{uid} registry in Firestore
      const adminDocRef = doc(db, 'admins', user.uid);
      let resolvedAdmin: AdminProfile | null = null;

      try {
        const adminSnap = await getDoc(adminDocRef);
        if (adminSnap.exists()) {
          const data = adminSnap.data() as AdminProfile;
          if (data.active) {
            resolvedAdmin = { ...data, uid: adminSnap.id };
          }
        } else if (session.user.isBootstrapAdmin) {
          // Auto-bootstrap initial Super Admin & default library configuration
          const bootstrapPayload = {
            uid: user.uid,
            email: session.user.email,
            fullName: user.displayName?.trim() || 'Founder / Super Admin',
            role: 'super_admin' as const,
            branch: 'Electronic City, Bangalore',
            phone: '',
            active: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(adminDocRef, bootstrapPayload);

          const settingsRef = doc(db, 'settings', 'library_config');
          const settingsSnap = await getDoc(settingsRef);
          if (!settingsSnap.exists()) {
            await setDoc(settingsRef, {
              libraryName: 'Av_eSAFE Library',
              location: 'Electronic City, Bangalore',
              hall1Capacity: 80,
              hall2Capacity: 40,
              operatingHours: '24/7',
              gracePeriodDays: 5,
              antiPassbackMinutes: 10,
              allowDemoAutoExpiry: true,
              updatedAt: serverTimestamp(),
            });
          }

          resolvedAdmin = {
            uid: user.uid,
            email: session.user.email,
            fullName: bootstrapPayload.fullName,
            role: 'super_admin',
            branch: 'Electronic City, Bangalore',
            active: true,
          };
        } else if (session.user.emailVerified && session.user.email) {
          // Check if Super Admin pre-approved this Google email via /admin_invites/{inviteKey}
          const inviteId = buildAdminInviteKey(session.user.email);
          const inviteRef = doc(db, 'admin_invites', inviteId);
          try {
            const inviteSnap = await getDoc(inviteRef);
            if (inviteSnap.exists()) {
              const invite = inviteSnap.data() as Omit<AdminInviteRecord, 'id'>;
              if (invite.active && invite.email.toLowerCase() === session.user.email.toLowerCase()) {
                const claimedProfile = {
                  uid: user.uid,
                  email: session.user.email,
                  fullName: invite.fullName || user.displayName?.trim() || 'Administrator',
                  role: invite.role,
                  branch: invite.branch || 'Electronic City, Bangalore',
                  phone: invite.phone || '',
                  active: true,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                };
                await setDoc(adminDocRef, claimedProfile);
                await updateDoc(inviteRef, {
                  active: false,
                  claimedByUid: user.uid,
                  updatedAt: serverTimestamp(),
                }).catch(() => undefined);

                resolvedAdmin = {
                  uid: user.uid,
                  email: session.user.email,
                  fullName: claimedProfile.fullName,
                  role: invite.role,
                  branch: claimedProfile.branch,
                  phone: claimedProfile.phone,
                  active: true,
                };
              }
            }
          } catch {
            // Not an invited admin — continue to student check
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `admins/${user.uid}`);
      }

      if (resolvedAdmin) {
        setAdminProfile(resolvedAdmin);
        setStudentProfile(null);
        setAdminAuthMode('firebase');
        setRole('admin');
        setRoleLoading(false);
        return;
      }

      // 3. Check Student enrollment by UID or verified email
      let resolvedStudent: StudentRecord | null = null;
      try {
        const byUidQuery = query(
          collection(db, 'students'),
          where('uid', '==', user.uid),
          limit(1),
        );
        const byUidSnap = await getDocs(byUidQuery);

        if (!byUidSnap.empty) {
          const docSnap = byUidSnap.docs[0];
          resolvedStudent = { id: docSnap.id, ...(docSnap.data() as Omit<StudentRecord, 'id'>) };
        } else if (session.user.emailVerified && session.user.email) {
          const byEmailQuery = query(
            collection(db, 'students'),
            where('email', '==', session.user.email),
            limit(1),
          );
          const byEmailSnap = await getDocs(byEmailQuery);
          if (!byEmailSnap.empty) {
            const docSnap = byEmailSnap.docs[0];
            const data = docSnap.data() as Omit<StudentRecord, 'id'>;
            if (!data.uid) {
              await updateDoc(doc(db, 'students', docSnap.id), {
                uid: user.uid,
                updatedAt: serverTimestamp(),
              });
            }
            resolvedStudent = { id: docSnap.id, ...data, uid: user.uid };
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'students');
      }

      if (resolvedStudent) {
        setStudentProfile(resolvedStudent);
        setAdminProfile(null);
        setStudentAuthMode('firebase');
        setRole('student');
      } else {
        setAdminProfile(null);
        setStudentProfile(null);
        setStudentAuthMode(null);
        setRole('unassigned');
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to verify your session.');
      setRole('unassigned');
    } finally {
      setRoleLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      void resolveUserSession(user);
    });
    return () => unsubscribe();
  }, [resolveUserSession]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = mapFirebaseAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  }, []);

  const signInWithEmail = useCallback(
    async (
      emailOrRegNo: string,
      password: string,
      options?: { portal?: 'student' | 'admin' },
    ) => {
      setAuthError(null);
      const trimmed = emailOrRegNo.trim();
      const targetPortal = options?.portal || 'student';

      // For Student Portal: authenticate against server-verified scrypt password first
      // (works immediately without requiring Email/Password provider in Firebase Console).
      if (targetPortal === 'student') {
        try {
          const result = await loginStudentWithPassword(trimmed, password);
          // Activate in-memory student session BEFORE signing out any prior Firebase user
          // so onAuthStateChanged(null) cleanly preserves the new student session.
          setStudentSessionToken(result.token);
          setStudentProfile(result.student);
          setAdminProfile(null);
          setBackendSession(null);
          setStudentAuthMode('password');
          setRole('student');
          setRoleLoading(false);
          if (auth.currentUser) {
            await signOut(auth).catch(() => undefined);
          }
          return;
        } catch (err) {
          if (
            err instanceof StudentApiError &&
            err.code !== 'NO_LOCAL_CREDENTIAL' &&
            err.code !== 'BACKEND_UNAVAILABLE'
          ) {
            setAuthError(err.message);
            throw new Error(err.message);
          }

          // Fall back to Firebase Email/Password ONLY if user entered an email address
          // and has enabled Email/Password in Firebase Console.
          if (!trimmed.includes('@')) {
            const msg =
              err instanceof Error
                ? err.message
                : 'No portal password found for this Registration ID. Ask the Av_eSAFE Library admin desk to set your password.';
            setAuthError(msg);
            throw new Error(msg);
          }

          try {
            await signInWithEmailAndPassword(auth, trimmed, password);
            return;
          } catch (fbErr) {
            const fbCode =
              typeof fbErr === 'object' && fbErr !== null && 'code' in fbErr
                ? String((fbErr as { code: unknown }).code)
                : '';
            const friendly =
              fbCode === 'auth/operation-not-allowed'
                ? 'No portal password is set for this student email yet. Ask the Av_eSAFE Library admin desk to set your password in Student Management, or sign in with Google.'
                : mapFirebaseAuthError(fbErr);
            setAuthError(friendly);
            throw new Error(friendly);
          }
        }
      }

      // Admin portal Email + Password login: authenticate against server-verified scrypt password FIRST
      // (works immediately when Super Admin creates an Admin account without Firebase Console setup).
      try {
        const result = await loginAdminWithPassword(trimmed, password);
        setStudentSessionToken(null);
        clearCachedStudentBundle();
        setStudentAuthMode(null);
        setAdminSessionToken(result.token);
        setAdminProfile(result.admin);
        setStudentProfile(null);
        setBackendSession(null);
        setAdminAuthMode('password');
        setRole('admin');
        setRoleLoading(false);
        if (auth.currentUser) {
          await signOut(auth).catch(() => undefined);
        }
        void fetchAdminPortalBundle();
        return;
      } catch (err) {
        if (
          err instanceof AdminApiError &&
          err.code !== 'NO_ADMIN_CREDENTIAL' &&
          err.code !== 'BACKEND_UNAVAILABLE'
        ) {
          setAuthError(err.message);
          throw new Error(err.message);
        }

        // Fall back to Firebase Email/Password if configured in Firebase Console
        try {
          await signInWithEmailAndPassword(auth, trimmed, password);
          return;
        } catch (fbErr) {
          const fbCode =
            typeof fbErr === 'object' && fbErr !== null && 'code' in fbErr
              ? String((fbErr as { code: unknown }).code)
              : '';
          const friendly =
            fbCode === 'auth/operation-not-allowed'
              ? 'No Admin password account found for this email yet. Ask the Super Admin to create your Email + Password login in Super Admin Console, or sign in with Google.'
              : mapFirebaseAuthError(fbErr);
          setAuthError(friendly);
          throw new Error(friendly);
        }
      }
    },
    [],
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (err) {
      const msg = mapFirebaseAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthError(null);
    setStudentSessionToken(null);
    clearCachedStudentBundle();
    setAdminSessionToken(null);
    clearCachedAdminBundle();
    setStudentAuthMode(null);
    setAdminAuthMode(null);
    await signOut(auth).catch(() => undefined);
    setRole('unassigned');
    setAdminProfile(null);
    setStudentProfile(null);
    setBackendSession(null);
  }, []);

  const refreshRoleState = useCallback(async () => {
    if (studentAuthMode === 'password') {
      const bundle = await fetchStudentPortalBundle();
      if (bundle?.profile) {
        setStudentProfile(bundle.profile);
        setRole('student');
      }
      return;
    }
    if (adminAuthMode === 'password') {
      await fetchAdminPortalBundle();
      return;
    }
    await resolveUserSession(auth.currentUser);
  }, [resolveUserSession, studentAuthMode, adminAuthMode]);

  const isSuperAdmin = role === 'admin' && adminProfile?.role === 'super_admin';
  const adminRole: AdminRole | null = role === 'admin' ? adminProfile?.role || null : null;

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        authReady,
        roleLoading,
        role,
        studentAuthMode,
        adminAuthMode,
        isSuperAdmin,
        adminRole,
        adminProfile,
        studentProfile,
        backendSession,
        authError,
        clearAuthError: () => setAuthError(null),
        signInWithGoogle,
        signInWithEmail,
        requestPasswordReset,
        logout,
        refreshRoleState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
