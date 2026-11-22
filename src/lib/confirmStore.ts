// Customer delivery-confirmation links. SERVER-SIDE ONLY. Stored in Firebase Firestore, never in Ostendo.
// - deliveryConfirmLinks/{token}: one document per link, with the orders as they were when the link was made
//   and the customer's answers. The customer page reads only its own document (1 read).
// - deliveryConfirmApp/linkIndex: a single summary document so the staff list costs 1 read, not a collection scan.
import { randomBytes } from 'node:crypto';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { db, firebaseConfigured } from './firebase';
import type { ConfirmOrder, ConfirmResponse, LinkStatus } from './confirmRules';
import { changeCount } from './confirmRules';

const LINKS = 'deliveryConfirmLinks';
const INDEX = ['deliveryConfirmApp', 'linkIndex'] as const;

export const TOKEN = /^[A-Za-z0-9_-]{32}$/;

export interface StoredLink {
  token: string;
  customer: string;
  contactName: string;
  contactEmail: string;
  createdAt: string;
  expiresAt: string;
  cancelled: boolean;
  orders: ConfirmOrder[];
  response: ConfirmResponse | null;
}

export interface LinkSummary {
  token: string;
  customer: string;
  contactName: string;
  contactEmail: string;
  createdAt: string;
  expiresAt: string;
  cancelled: boolean;
  orderCount: number;
  submittedAt: string | null;
  /** The name the customer typed when they submitted. */
  submittedBy?: string;
  changes: number;
}

export function statusOf(l: { cancelled: boolean; expiresAt: string; submittedAt?: string | null; response?: ConfirmResponse | null }, now = new Date()): LinkStatus {
  if (l.response || l.submittedAt) return 'submitted';
  if (l.cancelled) return 'cancelled';
  if (new Date(l.expiresAt) <= now) return 'expired';
  return 'waiting';
}

function summary(l: StoredLink): LinkSummary {
  return {
    token: l.token,
    customer: l.customer,
    contactName: l.contactName,
    contactEmail: l.contactEmail,
    createdAt: l.createdAt,
    expiresAt: l.expiresAt,
    cancelled: l.cancelled,
    orderCount: l.orders.length,
    submittedAt: l.response?.submittedAt ?? null,
    submittedBy: l.response?.name ?? '',
    changes: changeCount(l.response),
  };
}

// Local testing only: an in-memory store, used when Firebase isn't set up and CONFIRM_STORE=memory outside production.
const g = globalThis as unknown as { __confirmMemory?: Map<string, StoredLink> };
const memory = (g.__confirmMemory ??= new Map<string, StoredLink>());
function useMemory(): boolean {
  return !firebaseConfigured() && process.env.CONFIRM_STORE === 'memory' && process.env.VERCEL_ENV !== 'production';
}

// A sample link for local testing (memory mode only): /confirm/localTestLinkForTryingThePage001
function seedMemory() {
  if (!useMemory() || memory.size) return;
  const t = new Date();
  const d = (n: number) => new Date(t.getTime() + n * 86_400_000).toISOString().slice(0, 10);
  memory.set('localTestLinkForTryingThePage001', {
    token: 'localTestLinkForTryingThePage001',
    customer: 'Sample Customer Pty Ltd',
    contactName: 'Sam Sample',
    contactEmail: 'sam@example.com',
    createdAt: t.toISOString(),
    expiresAt: new Date(t.getTime() + 14 * 86_400_000).toISOString(),
    cancelled: false,
    response: null,
    orders: [
      { number: 'PD8001', po: 'PO-4471', description: 'Clear acrylic sneeze guards', required: d(1), lines: [{ code: 'SG-900', description: 'Sneeze guard 900mm', qty: 12, unit: 'EA' }] },
      { number: 'PD8002', po: 'PO-4480', description: 'Polycarbonate machine guards', required: d(9), lines: [{ code: 'MG-2', description: 'Machine guard type 2', qty: 4, unit: 'EA' }, { code: 'FX-1', description: 'Fixing kit', qty: 4, unit: 'KIT' }] },
      { number: 'PD8003', po: '', description: 'Display stands, black', required: d(20), lines: [] },
      { number: 'PD8004', po: 'PO-4502', description: 'Overdue sample order', required: d(-3), lines: [] },
    ],
  });
}

export function storeConfigured(): boolean {
  seedMemory();
  return firebaseConfigured() || useMemory();
}

export function newToken(): string {
  return randomBytes(24).toString('base64url'); // 32 characters, 192 bits: not guessable
}

export async function createLink(l: StoredLink): Promise<void> {
  if (useMemory()) {
    memory.set(l.token, l);
    return;
  }
  const store = db();
  const batch = store.batch();
  batch.create(store.collection(LINKS).doc(l.token), l);
  batch.set(store.collection(INDEX[0]).doc(INDEX[1]), { links: { [l.token]: summary(l) } }, { merge: true });
  await batch.commit();
}

export async function getLink(token: string): Promise<StoredLink | null> {
  if (!TOKEN.test(token)) return null;
  if (useMemory()) return memory.get(token) ?? null;
  const snap = await db().collection(LINKS).doc(token).get();
  return snap.exists ? (snap.data() as StoredLink) : null;
}

export async function listLinks(): Promise<LinkSummary[]> {
  if (useMemory()) return [...memory.values()].map(summary);
  const snap = await db().collection(INDEX[0]).doc(INDEX[1]).get();
  const links = (snap.exists ? snap.get('links') : null) as Record<string, LinkSummary> | null;
  return Object.values(links ?? {});
}

export class SubmitError extends Error {}

/** Saves the customer's answers once. A second submit, or one after expiry or cancelling, is refused. */
export async function saveResponse(token: string, check: (l: StoredLink) => ConfirmResponse): Promise<StoredLink> {
  if (useMemory()) {
    const l = memory.get(token);
    if (!l) throw new SubmitError('This link is not valid.');
    const updated = { ...l, response: check(l) };
    memory.set(token, updated);
    return updated;
  }
  const store = db();
  const ref = store.collection(LINKS).doc(token);
  const updated = await store.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new SubmitError('This link is not valid.');
    const l = snap.data() as StoredLink;
    const response = check(l);
    tx.update(ref, { response });
    return { ...l, response };
  });
  await store
    .collection(INDEX[0])
    .doc(INDEX[1])
    .update(new FieldPath('links', token), summary(updated))
    .catch((e) => console.error('[confirm] index update failed', String(e).slice(0, 200)));
  return updated;
}

export async function cancelLink(token: string): Promise<void> {
  if (useMemory()) {
    const l = memory.get(token);
    if (l) memory.set(token, { ...l, cancelled: true });
    return;
  }
  const store = db();
  const batch = store.batch();
  batch.update(store.collection(LINKS).doc(token), { cancelled: true });
  batch.update(store.collection(INDEX[0]).doc(INDEX[1]), new FieldPath('links', token, 'cancelled'), true);
  await batch.commit();
}

/** Removes a link and its answers completely (staff only). */
export async function deleteLink(token: string): Promise<void> {
  if (useMemory()) {
    memory.delete(token);
    return;
  }
  const store = db();
  const batch = store.batch();
  batch.delete(store.collection(LINKS).doc(token));
  batch.update(store.collection(INDEX[0]).doc(INDEX[1]), new FieldPath('links', token), FieldValue.delete());
  await batch.commit();
}
