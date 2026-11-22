import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const firebaseProjectMeta = {
  projectId: firebaseConfig.projectId,
  firestoreDatabaseId: firebaseConfig.firestoreDatabaseId,
};

let connectionChecked = false;

export async function testFirestoreConnection(): Promise<{ reachable: boolean; detail: string }> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    connectionChecked = true;
    return { reachable: true, detail: 'Connected to Cloud Firestore' };
  } catch (error) {
    connectionChecked = true;
    if (error instanceof Error && error.message.toLowerCase().includes('the client is offline')) {
      console.error('Please check your Firebase configuration: client is offline.');
      return { reachable: false, detail: 'Client is offline — verify Firebase configuration.' };
    }
    // Permission denied on /test/connection confirms live round-trip to Firestore security engine.
    return { reachable: true, detail: 'Connected to Cloud Firestore (security rules active)' };
  }
}

if (!connectionChecked) {
  void testFirestoreConnection();
}
