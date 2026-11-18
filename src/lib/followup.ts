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
  salesperson: string;
  /** yyyy-mm-dd. Orders: ORDERDATE. Quotes: ORDERDATE (the quote date). Source text is m/d/yyyy. */
  entered: string | null;
  /** yyyy-mm-dd, REQUIREDDATE. Null when Ostendo has a placeholder (1900/2099) or blank. */
  required: string | null;
  /** ORIGINALORDERAMOUNT: the order total excluding GST. */
  valueExGst: number | null;
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

function mapRow(r: OstendoRow, kind: ListKind): FollowUpRow {
  return {
    id: cell(r.SYSUNIQUEID) || cell(r.ORDERNUMBER),
    kind,
    number: cell(r.ORDERNUMBER),
    description: cell(r.ORDERDESCRIPTION),
    customer: cell(r.CUSTOMER),
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
export const getFollowUpData = unstable_cache(load, ['jobheader-followup-v2'], { revalidate: 3600, tags: ['followup'] });
