// PUBLIC: the customer's submit. Only touches the one link named by the unguessable token. Never reads or writes Ostendo.
import { NextRequest, NextResponse } from 'next/server';
import { friendlyError } from '@/lib/firebase';
import { saveResponse, storeConfigured, SubmitError, TOKEN } from '@/lib/confirmStore';
import { checkSubmission, type SubmitBody } from '@/lib/confirmSubmit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!TOKEN.test(token)) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404, headers });
  if (!storeConfigured()) return NextResponse.json({ error: 'Sorry, this page is not available right now.' }, { status: 503, headers });
  const text = await req.text();
  if (text.length > 100_000) return NextResponse.json({ error: 'Too much information sent.' }, { status: 413, headers });
  let body: SubmitBody;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 400, headers });
  }
  try {
    const link = await saveResponse(token, (l) => checkSubmission(body, l));
    return NextResponse.json({ ok: true, response: link.response }, { headers });
  } catch (e) {
    if (e instanceof SubmitError) return NextResponse.json({ error: e.message }, { status: 409, headers });
    friendlyError(e);
    return NextResponse.json({ error: 'Sorry, we could not save your answers. Please try again shortly.' }, { status: 502, headers });
  }
}
