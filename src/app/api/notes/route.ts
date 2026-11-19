// Meeting notes API. Stores notes in the app's own database only; never writes to Ostendo.
import { NextRequest, NextResponse } from 'next/server';
import { clearNotes, listNotes, notesConfigured, removeNote, saveNote } from '@/lib/notesStore';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const NUMBER = /^[A-Za-z0-9#\-\/ .]{1,40}$/;

export async function GET() {
  if (!notesConfigured()) return NextResponse.json({ mode: 'local', notes: {} }, { headers });
  try {
    return NextResponse.json({ mode: 'shared', notes: await listNotes() }, { headers });
  } catch {
    return NextResponse.json({ mode: 'error', notes: {} }, { status: 502, headers });
  }
}

export async function POST(req: NextRequest) {
  if (!notesConfigured()) return NextResponse.json({ error: 'Notes storage is not set up' }, { status: 503, headers });
  const body = (await req.json().catch(() => null)) as
    | { number?: string; note?: string; selected?: boolean; addedAt?: string }
    | null;
  const number = body?.number?.trim() ?? '';
  if (!NUMBER.test(number)) return NextResponse.json({ error: 'Invalid order number' }, { status: 400, headers });
  try {
    if (body?.selected === false) {
      await removeNote(number);
    } else {
      const now = new Date().toISOString();
      await saveNote({
        number,
        note: String(body?.note ?? '').slice(0, 5000),
        addedAt: typeof body?.addedAt === 'string' ? body.addedAt : now,
        updatedAt: now,
      });
    }
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json({ error: 'Could not save the note' }, { status: 502, headers });
  }
}

export async function DELETE() {
  if (!notesConfigured()) return NextResponse.json({ error: 'Notes storage is not set up' }, { status: 503, headers });
  try {
    await clearNotes();
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json({ error: 'Could not clear the notes' }, { status: 502, headers });
  }
}
