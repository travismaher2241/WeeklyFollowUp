import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

// Clears the 1-hour cache so the next page load reads fresh data from Ostendo.
export async function POST() {
  revalidateTag('followup');
  return NextResponse.json({ ok: true });
}
