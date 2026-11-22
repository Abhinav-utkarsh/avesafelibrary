import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export interface FirebaseAppletConfig {
  projectId: string;
  firestoreDatabaseId: string;
  apiKey?: string;
}

function loadFirebaseConfig(): FirebaseAppletConfig | null {
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.resolve(process.cwd(), 'firebase-applet-config.json'),
      path.resolve(currentDir, '../../firebase-applet-config.json'),
    ];
    for (const configPath of candidates) {
      if (!fs.existsSync(configPath)) continue;
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<FirebaseAppletConfig>;
      if (
        parsed.projectId &&
        parsed.projectId !== 'remixed-project-id' &&
        parsed.firestoreDatabaseId !== 'remixed-firestore-database-id'
      ) {
        return {
          projectId: parsed.projectId,
          firestoreDatabaseId: parsed.firestoreDatabaseId || '(default)',
          apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : undefined,
        };
      }
    }
  } catch {
    // Fall through to environment variable configuration
  }

  const envProjectId = (process.env.FIREBASE_PROJECT_ID || '').trim();
  if (envProjectId) {
    return {
      projectId: envProjectId,
      firestoreDatabaseId: (process.env.FIREBASE_DATABASE_ID || '(default)').trim(),
    };
  }
  return null;
}

export const serverEnv = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  adminBootstrapEmail: (process.env.ADMIN_BOOTSTRAP_EMAIL || 'abhinavutkarsh3@gmail.com').trim().toLowerCase(),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  iotHmacConfigured: Boolean(process.env.IOT_HMAC_SECRET_KEY && process.env.IOT_HMAC_SECRET_KEY.length >= 16),
  firebase: loadFirebaseConfig(),
};
