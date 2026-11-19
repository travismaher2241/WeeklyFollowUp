// Meeting notes storage. SERVER-SIDE ONLY. Notes live in Firebase Firestore, in one document
// (weeklyFollowUp/meetingNotes) so each page load costs a single read on the free plan.
// Nothing here ever talks to Ostendo.
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { FieldPath, FieldValue, getFirestore } from 'firebase-admin/firestore';

export interface MeetingNote {
  number: string;
  note: string;
  addedAt: string;
  updatedAt: string;
}

const COLLECTION = 'weeklyFollowUp';
const DOC = 'meetingNotes';
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

export function notesConfigured(): boolean {
  return credentials() !== null;
}

function app(): App {
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) return existing;
  const c = credentials();
  if (!c) throw new Error('Firebase is not set up');
  return initializeApp({ credential: cert(c), projectId: c.projectId }, APP_NAME);
}

function ref() {
  return getFirestore(app()).collection(COLLECTION).doc(DOC);
}

/** Turns Firestore's quota error into a plain message. */
export function friendlyError(e: unknown): string {
  const msg = String((e as { code?: unknown; message?: unknown })?.code ?? '') + ' ' + String((e as Error)?.message ?? '');
  if (/RESOURCE_EXHAUSTED|quota/i.test(msg)) return "Firebase's free daily limit has been reached. Notes will work again after it resets (about 7pm Melbourne time).";
  if (/PERMISSION_DENIED|UNAUTHENTICATED/i.test(msg)) return 'Firebase rejected the app\'s credentials. Check the Firebase settings in Vercel.';
  return 'Could not reach Firebase. Try again in a moment.';
}

export async function listNotes(): Promise<Record<string, MeetingNote>> {
  const snap = await ref().get();
  const notes = (snap.exists ? snap.get('notes') : null) as Record<string, MeetingNote> | null;
  return notes ?? {};
}

export async function saveNote(n: MeetingNote): Promise<void> {
  const r = ref();
  try {
    await r.update(new FieldPath('notes', n.number), n);
  } catch (e) {
    // The document doesn't exist yet: create it.
    if ((e as { code?: number }).code === 5) await r.set({ notes: { [n.number]: n } }, { merge: true });
    else throw e;
  }
}

export async function removeNote(number: string): Promise<void> {
  try {
    await ref().update(new FieldPath('notes', number), FieldValue.delete());
  } catch (e) {
    if ((e as { code?: number }).code !== 5) throw e;
  }
}

export async function clearNotes(): Promise<void> {
  await ref().set({ notes: {} });
}
