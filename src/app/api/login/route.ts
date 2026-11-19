import { NextRequest, NextResponse } from 'next/server';
import { appPassword, sameText, SESSION_COOKIE, SESSION_DAYS, sessionValue } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === 'string' ? v : '';
  return s.startsWith('/') && !s.startsWith('//') ? s : '/';
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const next = safeNext(form?.get('next') ?? null);
  const given = String(form?.get('password') ?? '');
  const p = appPassword();
  const back = (err: string) => {
    const url = new URL('/login', req.url);
    url.searchParams.set('error', err);
    if (next !== '/') url.searchParams.set('next', next);
    return NextResponse.redirect(url, 303);
  };
  if (!p) return back('setup');
  if (!sameText(given, p)) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return back('wrong');
  }
  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(SESSION_COOKIE, await sessionValue(p), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  });
  return res;
}
