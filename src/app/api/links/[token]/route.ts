// Staff API: one link's full details and answers, cancel it, or delete it.
import { NextRequest, NextResponse } from 'next/server';
import { friendlyError } from '@/lib/firebase';
import { cancelLink, deleteLink, getLink, statusOf, storeConfigured, TOKEN } from '@/lib/confirmStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const headers = { 'Cache-Control': 'no-store' };
type Ctx = { params: Promise<{ token: string }> };

async function guard(ctx: Ctx) {
  const { token } = await ctx.params;
  if (!storeConfigured()) return { error: NextResponse.json({ error: 'Firebase is not set up' }, { status: 503, headers }) };
  if (!TOKEN.test(token)) return { error: NextResponse.json({ error: 'Not found' }, { status: 404, headers }) };
  return { token };
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if (g.error) return g.error;
  try {
    const link = await getLink(g.token);
    if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404, headers });
    return NextResponse.json({ link: { ...link, status: statusOf(link) } }, { headers });
  } catch (e) {
    return NextResponse.json({ error: friendlyError(e) }, { status: 502, headers });
  }
}

/** { action: 'cancel' } stops the link working. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if (g.error) return g.error;
  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  if (body?.action !== 'cancel') return NextResponse.json({ error: 'Unknown action' }, { status: 400, headers });
  try {
    await cancelLink(g.token);
    return NextResponse.json({ ok: true }, { headers });
  } catch (e) {
    return NextResponse.json({ error: friendlyError(e) }, { status: 502, headers });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const g = await guard(ctx);
  if (g.error) return g.error;
  try {
    await deleteLink(g.token);
    return NextResponse.json({ ok: true }, { headers });
  } catch (e) {
    return NextResponse.json({ error: friendlyError(e) }, { status: 502, headers });
  }
}
