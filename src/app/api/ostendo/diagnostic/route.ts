// TEMPORARY structure-only diagnostic. Delete once the job and quote tables are confirmed.
// Disabled on production unless ENABLE_OSTENDO_DIAGNOSTIC=true. Preview URLs are behind Vercel login.
import { NextRequest, NextResponse } from 'next/server';
import { profileTable } from '@/lib/diagnostic';
import { checkSettings, OstendoError } from '@/lib/ostendo';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function enabled(): boolean {
  return process.env.VERCEL_ENV !== 'production' || process.env.ENABLE_OSTENDO_DIAGNOSTIC === 'true';
}

export async function GET(req: NextRequest) {
  if (!enabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const headers = { 'Cache-Control': 'no-store' };
  const table = req.nextUrl.searchParams.get('table')?.trim();
  if (!table) {
    try {
      checkSettings();
      return NextResponse.json({ settings: 'ok', environment: process.env.VERCEL_ENV ?? 'local' }, { headers });
    } catch (e) {
      return NextResponse.json({ settings: 'problem', error: (e as OstendoError).message }, { headers });
    }
  }
  if (!/^[A-Z0-9_$]+$/i.test(table)) return NextResponse.json({ error: 'Invalid table name' }, { status: 400 });
  const condition = req.nextUrl.searchParams.get('condition') ?? undefined;
  const result = await profileTable(table, condition);
  return NextResponse.json(result, { headers });
}
