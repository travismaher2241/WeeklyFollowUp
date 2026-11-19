// Meeting notes storage. SERVER-SIDE ONLY. Notes live in the app's own Upstash Redis database
// (added through Vercel's Storage tab). Nothing here ever talks to Ostendo.

export interface MeetingNote {
  number: string;
  note: string;
  addedAt: string;
  updatedAt: string;
}

const KEY = 'meeting-notes:v1';

function settings(): { url: string; token: string } | null {
  const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').trim();
  const token = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  if (!url || !token) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !u.hostname.endsWith('.upstash.io')) return null;
  } catch {
    return null;
  }
  return { url: url.replace(/\/+$/, ''), token };
}

export function notesConfigured(): boolean {
  return settings() !== null;
}

async function redis(command: (string | number)[]): Promise<unknown> {
  const s = settings();
  if (!s) throw new Error('Notes storage is not set up');
  const res = await fetch(s.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => null)) as { result?: unknown; error?: string } | null;
  if (!res.ok || !json || json.error) throw new Error('Notes storage error');
  return json.result;
}

export async function listNotes(): Promise<Record<string, MeetingNote>> {
  const flat = (await redis(['HGETALL', KEY])) as string[] | null;
  const out: Record<string, MeetingNote> = {};
  for (let i = 0; flat && i < flat.length; i += 2) {
    try {
      out[flat[i]] = JSON.parse(flat[i + 1]) as MeetingNote;
    } catch {
      // skip a damaged entry rather than failing the whole list
    }
  }
  return out;
}

export async function saveNote(n: MeetingNote): Promise<void> {
  await redis(['HSET', KEY, n.number, JSON.stringify(n)]);
}

export async function removeNote(number: string): Promise<void> {
  await redis(['HDEL', KEY, number]);
}

export async function clearNotes(): Promise<void> {
  await redis(['DEL', KEY]);
}
