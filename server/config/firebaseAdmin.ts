import { getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { serverEnv } from './env.ts';

let adminApp: App | null = null;

function getFirebaseAdminApp(): App | null {
  if (!serverEnv.firebase?.projectId) {
    return null;
  }
  if (!adminApp) {
    adminApp = getApps().length
      ? getApp()
      : initializeApp({
          projectId: serverEnv.firebase.projectId,
        });
  }
  return adminApp;
}

export const adminSdkStatus = {
  initialized: Boolean(getFirebaseAdminApp()),
  tokenVerificationReady: Boolean(serverEnv.firebase?.projectId),
  // Starter Tier projects do not allow service-account IAM writes to Firestore;
  // server-side ID token verification works on all projects without IAM.
  serverFirestoreMode: 'client_sdk_with_hardened_rules' as const,
};

export async function verifyFirebaseIdToken(idToken: string): Promise<DecodedIdToken> {
  const app = getFirebaseAdminApp();
  if (!app) {
    throw new Error('Firebase project configuration is missing.');
  }
  // Uses verifyIdToken(token) without checkRevoked so it operates securely on all projects.
  return getAuth(app).verifyIdToken(idToken);
}
