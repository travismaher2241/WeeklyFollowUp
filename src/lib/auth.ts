// Staff sign-in for the internal pages. Works in middleware (edge) and route handlers.
// The whole app is public on the internet so customers can open their links, so every staff page and API
// needs the APP_PASSWORD set in Vercel. The session cookie is an HMAC of a fixed label keyed by that password,
// so changing the password signs everyone out.
export const SESSION_COOKIE = 'pg_staff';
export const SESSION_DAYS = 30;

export function appPassword(): string | null {
  const p = process.env.APP_PASSWORD?.trim();
  return p && p.length >= 8 ? p : null;
}

function b64url(buf: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sessionValue(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode('plasgain-delivery-confirm-staff-v1')));
}

export function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isStaff(cookie: string | undefined): Promise<boolean> {
  const p = appPassword();
  if (!p || !cookie) return false;
  return sameText(cookie, await sessionValue(p));
}
