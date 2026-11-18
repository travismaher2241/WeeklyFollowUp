import { NextRequest, NextResponse } from 'next/server';

// Hide the temporary diagnostic page on production unless explicitly switched on.
export function middleware(_req: NextRequest) {
  if (process.env.VERCEL_ENV === 'production' && process.env.ENABLE_OSTENDO_DIAGNOSTIC !== 'true') {
    return new NextResponse('Not found', { status: 404 });
  }
  return NextResponse.next();
}

export const config = { matcher: ['/diagnostic'] };
