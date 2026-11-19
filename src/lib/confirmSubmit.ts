// Checks a customer's submitted answers against their link. SERVER-SIDE ONLY.
import { isLocked, validNewDate, type ConfirmResponse, type RowAnswer } from './confirmRules';
import { statusOf, SubmitError, type StoredLink } from './confirmStore';
import { todayMelbourne } from './rules';

export interface SubmitBody {
  name?: unknown;
  understood?: unknown;
  rows?: unknown;
}

export function checkSubmission(body: SubmitBody, link: StoredLink, now = new Date()): ConfirmResponse {
  const status = statusOf(link, now);
  if (status === 'submitted') throw new SubmitError('These answers have already been submitted.');
  if (status === 'expired') throw new SubmitError('This link has expired.');
  if (status === 'cancelled') throw new SubmitError('This link is no longer active.');

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  if (!name) throw new SubmitError('Please enter your name.');
  if (body.understood !== true) throw new SubmitError('Please tick the box to confirm you understand the 48-hour rule.');

  const given = new Map<string, Record<string, unknown>>();
  if (Array.isArray(body.rows))
    for (const r of body.rows)
      if (r && typeof r === 'object' && typeof (r as { number?: unknown }).number === 'string')
        given.set((r as { number: string }).number, r as Record<string, unknown>);

  const today = todayMelbourne(now);
  const rows: RowAnswer[] = link.orders.map((o) => {
    if (isLocked(o.required, today)) return { number: o.number, answer: 'locked' };
    const r = given.get(o.number);
    const label = o.po || o.number;
    if (!r) throw new SubmitError(`Please answer every order (${label} is missing).`);
    if (r.answer === 'correct') return { number: o.number, answer: 'correct' };
    if (r.answer === 'new-date') {
      const d = typeof r.newDate === 'string' ? r.newDate : '';
      if (!validNewDate(d, today))
        throw new SubmitError(`The new date for ${label} must be a weekday at least 3 business days from today.`);
      const note = typeof r.note === 'string' ? r.note.trim().slice(0, 1000) : '';
      return note ? { number: o.number, answer: 'new-date', newDate: d, note } : { number: o.number, answer: 'new-date', newDate: d };
    }
    if (r.answer === 'unknown') {
      const note = typeof r.note === 'string' ? r.note.trim().slice(0, 1000) : '';
      if (!note) throw new SubmitError(`Please tell us what you would like us to do with ${label}.`);
      return { number: o.number, answer: 'unknown', note };
    }
    throw new SubmitError(`Please answer every order (${label} is missing).`);
  });
  return { name, submittedAt: now.toISOString(), rows };
}
