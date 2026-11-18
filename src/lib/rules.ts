// Follow-up rules and date helpers. Pure functions, safe to use on server or in the browser.
// All "today" calculations use Melbourne time.

/** Rename this to change the label on quotes older than 3 months. */
export const OLD_QUOTE_LABEL = 'Aged quote';
export const FOLLOW_UP_LABEL = 'Follow-up required';

export const TIME_ZONE = 'Australia/Melbourne';

/** Today's date in Melbourne as yyyy-mm-dd. */
export function todayMelbourne(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/**
 * Ostendo dates look like "18/11/2026" or "18/11/2026 9:41:07 AM" (d/m/yyyy).
 * Returns yyyy-mm-dd, or null if blank or a placeholder (Ostendo uses 1900 and 2099 for "not set").
 */
export function parseOstendoDate(v: string): string | null {
  const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const year = Number(y);
  if (year < 1990 || year > 2090) return null;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function toUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** Adds calendar months, clamping to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export type OpenFlag = 'follow-up' | null;
export type InProgressColour = 'red' | 'yellow' | null;
export type QuoteFlag = 'follow-up' | 'old' | null;

/** Open orders: required date in the past means follow-up required. */
export function openOrderFlag(required: string | null, today: string): OpenFlag {
  return required && required < today ? 'follow-up' : null;
}

/** InProgress orders: past = red, within 2 weeks = yellow, otherwise no colour. */
export function inProgressColour(required: string | null, today: string): InProgressColour {
  if (!required) return null;
  if (required < today) return 'red';
  if (daysBetween(today, required) <= 14) return 'yellow';
  return null;
}

/** Quotes: under 2 weeks old = no flag, 2 weeks to 3 months = follow-up, over 3 months = old. */
export function quoteFlag(quoteDate: string | null, today: string): QuoteFlag {
  if (!quoteDate) return null;
  if (daysBetween(quoteDate, today) < 14) return null;
  if (addMonths(quoteDate, 3) >= today) return 'follow-up';
  return 'old';
}

/** dd/mm/yyyy for display. */
export function showDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
