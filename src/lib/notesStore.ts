// Meeting notes storage. SERVER-SIDE ONLY. Notes live in Firebase Firestore, in one document
// (deliveryConfirmApp/meetingNotes) so each page load costs a single read on the free plan.
// This copy of the app keeps its own notes, separate from the live Weekly Follow-Up app's weeklyFollowUp/meetingNotes.
// Nothing here ever talks to Ostendo.
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { db, firebaseConfigured, friendlyError } from './firebase';

export { friendlyError };

export interface MeetingNote {
  number: string;
  note: string;
  addedAt: string;
  updatedAt: string;
}

const COLLECTION = 'deliveryConfirmApp';
const DOC = 'meetingNotes';

export function notesConfigured(): boolean {
  return firebaseConfigured();
}

function ref() {
  return db().collection(COLLECTION).doc(DOC);
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
