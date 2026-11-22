// Staff API: list confirmation links and make new ones. Never writes to Ostendo.
import { NextRequest, NextResponse } from 'next/server';
import { friendlyError } from '@/lib/firebase';
import { createLink, listLinks, newToken, statusOf, storeConfigured, type StoredLink } from '@/lib/confirmStore';
import type { ConfirmOrder } from '@/lib/confirmRules';
import { getFollowUpData } from '@/lib/followup';
import { getOrderLines } from '@/lib/orderLines';
import { OstendoError } from '@/lib/ostendo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const headers = { 'Cache-Control': 'no-store' };
const NOT_SET_UP = 'Firebase is not set up for this app yet, so links cannot be saved.';

export async function GET() {
  if (!storeConfigured()) return NextResponse.json({ error: NOT_SET_UP, links: [] }, { status: 503, headers });
  try {
    const now = new Date();
    const links = (await listLinks())
      .map((l) => ({ ...l, status: statusOf(l, now) }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json({ links }, { headers });
  } catch (e) {
    return NextResponse.json({ error: friendlyError(e), links: [] }, { status: 502, headers });
  }
}

export async function POST(req: NextRequest) {
  if (!storeConfigured()) return NextResponse.json({ error: NOT_SET_UP }, { status: 503, headers });
  const body = (await req.json().catch(() => null)) as
    | { customer?: string; days?: number }
    | null;
  const customer = body?.customer?.trim() ?? '';
  const days = [7, 14, 21, 30].includes(Number(body?.days)) ? Number(body?.days) : 14;
  if (!customer) return NextResponse.json({ error: 'Choose a customer' }, { status: 400, headers });

  let orders: ConfirmOrder[];
  try {
    const data = await getFollowUpData();
    const rows = data.rows
      .filter((r) => r.kind === 'inprogress' && r.customer === customer)
      .sort((a, b) => (a.required ?? '9999').localeCompare(b.required ?? '9999'));
    if (rows.length === 0)
      return NextResponse.json({ error: `${customer} has no in-progress orders right now` }, { status: 400, headers });
    orders = [];
    // One small read per order, one after another, the same way the details panel loads items.
    for (const r of rows) {
      const lines = await getOrderLines(r.number);
      orders.push({
        number: r.number,
        po: r.po,
        description: r.description,
        required: r.required,
        lines: lines.map((l) => ({ code: l.code, description: l.description, qty: l.qty, unit: l.unit })),
      });
    }
  } catch (e) {
    const msg = e instanceof OstendoError ? e.message : 'Could not read the orders from Ostendo';
    return NextResponse.json({ error: msg }, { status: 502, headers });
  }

  const now = new Date();
  const link: StoredLink = {
    token: newToken(),
    customer,
    // No contact is recorded: the customer types their own name when they submit.
    contactName: '',
    contactEmail: '',
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + days * 86_400_000).toISOString(),
    cancelled: false,
    orders,
    response: null,
  };
  try {
    await createLink(link);
  } catch (e) {
    return NextResponse.json({ error: friendlyError(e) }, { status: 502, headers });
  }
  return NextResponse.json({ link: { ...link, status: statusOf(link) } }, { headers });
}
