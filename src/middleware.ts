import { NextRequest, NextResponse } from 'next/server';
import { isStaff, SESSION_COOKIE } from '@/lib/auth';

// Customers only ever reach their own link page and its submit API. Everything else is staff-only.
const PUBLIC = [/^\/confirm\/[A-Za-z0-9_-]+\/?$/, /^\/api\/confirm\/[A-Za-z0-9_-]+\/?$/, /^\/login\/?$/, /^\/api\/login\/?$/];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (PUBLIC.some((re) => re.test(path))) return NextResponse.next();

  if (!(await isStaff(req.cookies.get(SESSION_COOKIE)?.value))) {
    if (path.startsWith('/api/')) return NextResponse.json({ error: 'Please sign in' }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = path === '/' ? '' : `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }

  // Hide the temporary diagnostic page on production unless explicitly switched on.
  if (path.startsWith('/diagnostic') && process.env.VERCEL_ENV === 'production' && process.env.ENABLE_OSTENDO_DIAGNOSTIC !== 'true') {
    return new NextResponse('Not found', { status: 404 });
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|plasgain-logo.png).*)'] };
