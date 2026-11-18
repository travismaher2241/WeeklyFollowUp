// Reads open orders, in-progress orders and outstanding quotes from Ostendo's JOBHEADER table.
// SERVER-SIDE ONLY. Column names confirmed by the structure check on 18/11/2026.
import { unstable_cache } from 'next/cache';
import { cell, OstendoError, OstendoRow, readOstendoTable } from './ostendo';
import { parseOstendoDate } from './rules';

export type ListKind = 'open' | 'inprogress' | 'quote';

export interface FollowUpRow {
  id: string;
  kind: ListKind;
  number: string;
  description: string;
  customer: string;
  /** PURCHASEREFERENCE: the customer's purchase order number. */
  po: string;
  salesperson: string;
  /** yyyy-mm-dd. Orders: ORDERDATE. Quotes: ORDERDATE (the quote date). Source text is m/d/yyyy. */
  entered: string | null;
  /** yyyy-mm-dd, REQUIREDDATE. Null when Ostendo has a placeholder (1900/2099) or blank. */
  required: string | null;
  /** ORIGINALORDERAMOUNT: the order total excluding GST. */
  valueExGst: number | null;
  /** Quotes only: QUOTEFOLLOWUPREQDATE, the follow-up date set in Ostendo. Used for the quotes calendar. */
  followUpDate: string | null;
  /** Quotes only: QUOTEEXPIRY. */
  expiry: string | null;
  /** Extra fields shown when you click an order. Label -> value, blanks left out. */
  details: [string, string][];
}

export interface FollowUpData {
  rows: FollowUpRow[];
  fetchedAt: string;
}

const STATUS_FOR: Record<ListKind, string> = { open: 'Open', inprogress: 'InProgress', quote: 'Quote' };

function num(v: unknown): number | null {
  const s = cell(v).replace(/[,$\s]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

function moneyText(v: unknown): string {
  const n = num(v);
  return n === null ? '' : money.format(n);
}

function dateText(v: unknown): string {
  const iso = parseOstendoDate(cell(v));
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function joinParts(...parts: unknown[]): string {
  return parts.map(cell).filter(Boolean).join(', ');
}

function buildDetails(r: OstendoRow, kind: ListKind): [string, string][] {
  const d: [string, string][] = [
    ['Contact', cell(r.ORDERCONTACT)],
    ['Phone', cell(r.ORDERPHONE)],
    ['Mobile', cell(r.ORDERMOBILE)],
    ['Email', cell(r.ORDEREMAIL)],
    ['Delivery address', joinParts(r.ORDERADDRESS1, r.ORDERADDRESS2, r.ORDERADDRESS3, r.ORDERCITY, r.ORDERSTATE, r.ORDERPOSTALCODE)],
    ['Salesperson', cell(r.SALESPERSON)],
    ['Job type', cell(r.JOBTYPE)],
    ['Customer PO / reference', cell(r.PURCHASEREFERENCE)],
    ['Value ex GST', moneyText(r.ORIGINALORDERAMOUNT)],
    ['GST', moneyText(r.ORIGINALTAXAMOUNT)],
    ['Value inc GST', moneyText(r.ORIGINALTOTALAMOUNT)],
    ['Credit terms', cell(r.CREDITTERM)],
  ];
  if (kind === 'quote') {
    d.push(
      ['Original quote date', dateText(r.ORIGINALQUOTEDATE)],
      ['Follow-up date (Ostendo)', dateText(r.QUOTEFOLLOWUPREQDATE)],
      ['Quote expiry', dateText(r.QUOTEEXPIRY)],
      ['Revision', cell(r.QUOTEREVISIONNO) === '0' ? '' : cell(r.QUOTEREVISIONNO)],
    );
  } else {
    d.push(
      ['Converted from quote on', dateText(r.QUOTECONVERTDATE)],
      ['Invoiced so far ex GST', num(r.INVOICEDNETTAMOUNT) ? moneyText(r.INVOICEDNETTAMOUNT) : ''],
      ['Workflow status', cell(r.WORKFLOWSTATUS)],
    );
  }
  d.push(
    ['Created in Ostendo by', joinParts(r.SYSUSERCREATED)],
    ['Notes', cell(r.ORDERNOTES).slice(0, 2000)],
    ['Work notes', cell(r.WORKNOTES).slice(0, 2000)],
  );
  return d.filter(([, v]) => v);
}

function mapRow(r: OstendoRow, kind: ListKind): FollowUpRow {
  return {
    followUpDate: kind === 'quote' ? parseOstendoDate(cell(r.QUOTEFOLLOWUPREQDATE)) : null,
    expiry: kind === 'quote' ? parseOstendoDate(cell(r.QUOTEEXPIRY)) : null,
    details: buildDetails(r, kind),
    id: cell(r.SYSUNIQUEID) || cell(r.ORDERNUMBER),
    kind,
    number: cell(r.ORDERNUMBER),
    description: cell(r.ORDERDESCRIPTION),
    customer: cell(r.CUSTOMER),
    po: cell(r.PURCHASEREFERENCE),
    salesperson: cell(r.SALESPERSON),
    entered: parseOstendoDate(cell(r.ORDERDATE)),
    required: parseOstendoDate(cell(r.REQUIREDDATE)),
    valueExGst: num(r.ORIGINALORDERAMOUNT),
  };
}

async function load(): Promise<FollowUpData> {
  const rows: FollowUpRow[] = [];
  // Three small filtered reads, one after another (never in parallel), instead of the whole 70 MB table.
  for (const kind of ['open', 'inprogress', 'quote'] as ListKind[]) {
    const { rows: raw } = await readOstendoTable('JOBHEADER', `ORDERSTATUS='${STATUS_FOR[kind]}'`);
    for (const r of raw) {
      if (cell(r.ORDERSTATUS) !== STATUS_FOR[kind]) continue; // belt and braces if the filter is ignored
      // Superseded quote revisions aren't the live quote, so leave them out.
      if (kind === 'quote' && cell(r.QUOTEREVISIONSTATUS) === 'Non Current') continue;
      rows.push(mapRow(r, kind));
    }
  }
  if (rows.length === 0) throw new OstendoError('Ostendo returned no orders or quotes at all, which looks wrong', 'ostendo');
  return { rows, fetchedAt: new Date().toISOString() };
}

/** Cached for 1 hour so Ostendo is read at most a few times an hour, whoever opens the page. */
export const getFollowUpData = unstable_cache(load, ['jobheader-followup-v5'], { revalidate: 3600, tags: ['followup'] });
