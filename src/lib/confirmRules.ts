// The delivery-confirmation rules. Pure functions, safe on server and in the browser.
// "48 hours" counts business days (Monday to Friday) only. Public holidays are not counted out.
import { addDays, todayMelbourne } from './rules';

export const SALES_EMAIL = 'light-sales@plasgain.com.au';
export const LOCK_BUSINESS_DAYS = 2;
export const RULE_TEXT =
  'Confirmed deliveries cannot be delayed or altered within 48 hours (2 business days) of the confirmed delivery date.';

/** 0 = Sunday ... 6 = Saturday, for a yyyy-mm-dd date. */
export function weekday(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isBusinessDay(iso: string): boolean {
  const w = weekday(iso);
  return w !== 0 && w !== 6;
}

/** Moves n business days forward (or back for negative n). Starting on a weekend counts from the weekend day. */
export function addBusinessDays(iso: string, n: number): string {
  let d = iso;
  const step = n >= 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    d = addDays(d, step);
    if (isBusinessDay(d)) left--;
  }
  return d;
}

/**
 * A delivery is locked (no changes) once it is 2 business days away or closer, up to and including the day itself.
 * For a Monday delivery that is from Thursday on. A date already in the past is not locked: it is shown as overdue.
 */
export function isLocked(required: string | null, today: string = todayMelbourne()): boolean {
  if (!required) return false;
  return required >= today && required <= addBusinessDays(today, LOCK_BUSINESS_DAYS);
}

/** The earliest date a customer may pick as a new delivery date: the first business day outside the 48-hour window. */
export function earliestNewDate(today: string = todayMelbourne()): string {
  return addBusinessDays(today, LOCK_BUSINESS_DAYS + 1);
}

/** The latest date offered in the picker (about a year out). */
export function latestNewDate(today: string = todayMelbourne()): string {
  return addDays(today, 366);
}

export function validNewDate(iso: string, today: string = todayMelbourne()): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && isBusinessDay(iso) && iso >= earliestNewDate(today) && iso <= latestNewDate(today);
}

export type Answer = 'correct' | 'new-date' | 'unknown';

/** What the customer sees for one order. No prices, ever. */
export interface ConfirmOrder {
  number: string;
  po: string;
  description: string;
  /** yyyy-mm-dd, or null when Ostendo has no date set. */
  required: string | null;
  lines: { code: string; description: string; qty: number | null; unit: string }[];
}

export interface RowAnswer {
  number: string;
  answer: Answer | 'locked';
  newDate?: string;
  note?: string;
}

export interface ConfirmResponse {
  name: string;
  submittedAt: string;
  rows: RowAnswer[];
}

export type LinkStatus = 'waiting' | 'submitted' | 'expired' | 'cancelled';

/** The public view of a link, as the customer page receives it. */
export interface PublicLink {
  customer: string;
  contactName: string;
  expiresAt: string;
  status: LinkStatus;
  orders: ConfirmOrder[];
  response: ConfirmResponse | null;
  /** The Melbourne date the page was built for, so locks match the server. */
  today: string;
}

/** Number of rows where the customer asked for something other than "date is correct". */
export function changeCount(r: ConfirmResponse | null): number {
  return r ? r.rows.filter((x) => x.answer === 'new-date' || x.answer === 'unknown').length : 0;
}
