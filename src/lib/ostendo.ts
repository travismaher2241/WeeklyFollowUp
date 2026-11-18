// Read-only Ostendo client. SERVER-SIDE ONLY: never import this from a client component.
// Follows the Plasgain Ostendo handover guide (18/11/2026):
// - only ever GET /tabledata
// - https + host plasgain.southeastit.com.au + port 8843 guard
// - 45s timeout, no redirects, HTTP-200 error page detection
// - never log the URL, scrub the key from every message

const ALLOWED_HOST = 'plasgain.southeastit.com.au';
const ALLOWED_PORT = '8843';
const TIMEOUT_MS = 45_000;

export type OstendoRow = Record<string, unknown>;

export class OstendoError extends Error {
  /** "settings" and "key" errors should not be retried. */
  constructor(message: string, public kind: 'settings' | 'key' | 'ostendo' | 'network') {
    super(sanitize(message));
    this.name = 'OstendoError';
  }
}

export function sanitize(msg: string): string {
  const key = process.env.OSTENDO_API_KEY?.trim();
  let out = key ? msg.split(key).join('[REDACTED]') : msg;
  if (key) out = out.split(encodeURIComponent(key)).join('[REDACTED]');
  return out
    .replace(/apikey=[^&\s]+/gi, 'apikey=[REDACTED]')
    .replace(/bearer\s+[a-z0-9_.-]+/gi, 'Bearer [REDACTED]');
}

function encodeOstendoQueryParam(value: string): string {
  return encodeURIComponent(value)
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

/** Throws a settings error unless both env vars exist and the URL passes the host/port/https guard. */
export function checkSettings(): URL {
  const rawUrl = process.env.OSTENDO_API_URL?.trim();
  const key = process.env.OSTENDO_API_KEY?.trim();
  if (!rawUrl) throw new OstendoError('OSTENDO_API_URL is not set in Vercel', 'settings');
  if (!key) throw new OstendoError('OSTENDO_API_KEY is not set in Vercel', 'settings');
  let base: URL;
  try {
    base = new URL(rawUrl);
  } catch {
    throw new OstendoError('OSTENDO_API_URL is not a valid web address', 'settings');
  }
  if (base.protocol !== 'https:') throw new OstendoError('OSTENDO_API_URL must start with https://', 'settings');
  if (base.hostname.toLowerCase() !== ALLOWED_HOST)
    throw new OstendoError(`OSTENDO_API_URL host must be ${ALLOWED_HOST}`, 'settings');
  if (base.port !== ALLOWED_PORT) throw new OstendoError(`OSTENDO_API_URL port must be ${ALLOWED_PORT}`, 'settings');
  return base;
}

function buildOstendoTableUrl(table: string, condition?: string): string {
  const base = checkSettings();
  if (!/^[A-Z0-9_$]+$/i.test(table)) throw new OstendoError('Invalid table name', 'settings');
  const path = base.pathname.replace(/\/+$/, '');
  const parts = [
    'configuration=0',
    `tablename=${encodeURIComponent(table.toUpperCase())}`,
    `apikey=${encodeURIComponent(process.env.OSTENDO_API_KEY!.trim())}`,
    'format=json',
  ];
  if (condition?.trim()) {
    const norm = condition.trim().replace(/\s*([=><!]+)\s*/g, '$1').replace(/\s+/g, ' ');
    parts.push(`condition=${encodeOstendoQueryParam(norm)}`);
  }
  return `${base.origin}${path}/tabledata?${parts.join('&')}`;
}

function extractRows(json: unknown, table: string): OstendoRow[] {
  if (Array.isArray(json)) return json as OstendoRow[];
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    const key = Object.keys(obj).find((k) => [table.toUpperCase(), 'DATA', 'ROWS'].includes(k.toUpperCase()));
    if (key) return Array.isArray(obj[key]) ? (obj[key] as OstendoRow[]) : [obj[key] as OstendoRow];
    if (Object.keys(obj).length) return [obj];
  }
  return [];
}

export interface OstendoReadResult {
  rows: OstendoRow[];
  bytes: number;
  ms: number;
}

// Simple in-process lock so this server instance never runs two Ostendo reads at once.
let queue: Promise<unknown> = Promise.resolve();

export function readOstendoTable(table: string, condition?: string): Promise<OstendoReadResult> {
  const run = queue.then(() => readOnce(table, condition));
  queue = run.catch(() => undefined);
  return run;
}

async function readOnce(table: string, condition?: string): Promise<OstendoReadResult> {
  const url = buildOstendoTableUrl(table, condition);
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json, text/plain, */*' },
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === 'TimeoutError' || name === 'AbortError')
      throw new OstendoError('Ostendo took longer than 45 seconds (try again later, or use a filter)', 'network');
    throw new OstendoError('Could not reach Ostendo (connection problem, try again later)', 'network');
  }
  const text = await res.text();
  const ms = Date.now() - started;
  if (res.status >= 300 && res.status < 400) throw new OstendoError(`Ostendo redirect ${res.status}`, 'ostendo');
  if (res.status === 401 || res.status === 403) throw new OstendoError('Ostendo rejected the API key', 'key');
  const t = text.trim();
  if (t.startsWith('<') || /invalid\s*api\s*key|access\s*denied|unauthori[sz]ed/i.test(t.slice(0, 500))) {
    const kind = /invalid\s*api\s*key|access\s*denied|unauthori[sz]ed/i.test(t.slice(0, 500)) ? 'key' : 'ostendo';
    throw new OstendoError(`Ostendo error: ${t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200)}`, kind);
  }
  if (!res.ok) throw new OstendoError(`Ostendo HTTP ${res.status}: ${t.slice(0, 200)}`, 'ostendo');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new OstendoError(`Ostendo returned something that isn't JSON: ${t.slice(0, 120)}`, 'ostendo');
  }
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const o = json as Record<string, unknown>;
    const err = o.ERROR || o.error || o.FAULT || o.fault || o.errorMessage;
    if (err) throw new OstendoError(`Ostendo error: ${typeof err === 'string' ? err : JSON.stringify(err)}`, 'ostendo');
  }
  return { rows: extractRows(json, table), bytes: Buffer.byteLength(text), ms };
}

/** Trim a value to text; empty means "not filled". */
export function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}
