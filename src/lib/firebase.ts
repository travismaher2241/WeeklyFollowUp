// Shared Firebase Admin setup. SERVER-SIDE ONLY. Credentials come from Vercel settings:
// FIREBASE_SERVICE_ACCOUNT (whole JSON) or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const APP_NAME = 'weekly-follow-up';

interface Credentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

function credentials(): Credentials | null {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (json) {
    try {
      const j = JSON.parse(json);
      if (j.project_id && j.client_email && j.private_key)
        return { projectId: j.project_id, clientEmail: j.client_email, privateKey: j.private_key };
    } catch {
      return null;
    }
  }
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  if (projectId && clientEmail && privateKey) return { projectId, clientEmail, privateKey };
  return null;
}

export function firebaseConfigured(): boolean {
  return credentials() !== null;
}

function app(): App {
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) return existing;
  const c = credentials();
  if (!c) throw new Error('Firebase is not set up');
  return initializeApp({ credential: cert(c), projectId: c.projectId }, APP_NAME);
}

export function db(): Firestore {
  return getFirestore(app());
}

/** Turns Firestore errors into a plain message, and logs the reason (never the credentials). */
export function friendlyError(e: unknown): string {
  const msg = String((e as { code?: unknown; message?: unknown })?.code ?? '') + ' ' + String((e as Error)?.message ?? '');
  console.error('[firebase] error:', msg.replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, '[key]').slice(0, 400));
  if (/has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) return 'Cloud Firestore is not switched on for this Firebase project yet.';
  if (/database.*does not exist|NOT_FOUND/i.test(msg)) return 'This Firebase project has no Firestore database yet.';
  if (/DECODER|PEM|private key|invalid_grant|JWT/i.test(msg)) return 'The Firebase key in Vercel looks incomplete or out of date. Generate a new key and paste the whole file again.';
  if (/RESOURCE_EXHAUSTED|quota/i.test(msg)) return "Firebase's free daily limit has been reached. It will work again after it resets (about 7pm Melbourne time).";
  if (/PERMISSION_DENIED|UNAUTHENTICATED/i.test(msg)) return "Firebase rejected the app's credentials. Check the Firebase settings in Vercel.";
  return 'Could not reach Firebase. Try again in a moment.';
}
