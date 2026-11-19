// Items and quantities for one order, fetched only when the order is opened in the app.
import { NextRequest, NextResponse } from 'next/server';
import { OstendoError } from '@/lib/ostendo';
import { getOrderLines, ORDER_NUMBER } from '@/lib/orderLines';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' };
  const order = req.nextUrl.searchParams.get('order')?.trim() ?? '';
  if (!ORDER_NUMBER.test(order)) return NextResponse.json({ error: 'Invalid order number' }, { status: 400, headers });
  try {
    return NextResponse.json({ lines: await getOrderLines(order) }, { headers });
  } catch (e) {
    const msg = e instanceof OstendoError ? e.message : 'Unexpected error while reading the order lines';
    return NextResponse.json({ error: msg }, { status: 502, headers });
  }
}
