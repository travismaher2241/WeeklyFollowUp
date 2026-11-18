// Structure-only profiling of Ostendo tables. SERVER-SIDE ONLY.
// Returns row counts, column names, fill %, and distinct values ONLY for status-like
// and yes/no columns. It never returns customer names, amounts or any other row data.

import { cell, OstendoError, OstendoRow, readOstendoTable } from './ostendo';

const STATUS_NAME = /(STATUS|STAGE|STYLE|TYPE|CATEGORY|PRIORITY|CLOSED|COMPLETE|OUTCOME|RESULT|WON|LOST|SOURCE|CLASS)/;
const NOT_STATUS_NAME = /(ADDRESS|CITY|POSTAL|POSTCODE|PHONE|EMAIL|NAME|DESC|NOTE|MEMO|COMMENT|REF|NUMBER|NO$|CODE|ID$)/;
const LINK_NAME = /(CUSTOMER|COMPANY|CLIENT|DEBTOR|ACCOUNT)/;
const DATE_VALUE = /^\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4}/;
const YES_NO = new Set(['YES', 'NO', 'TRUE', 'FALSE', 'Y', 'N', 'T', 'F', '0', '1']);
const MAX_DISTINCT_SHOWN = 40;

export interface ColumnProfile {
  column: string;
  filledPct: number;
  distinct: number;
  kind: 'empty' | 'date' | 'number' | 'yes/no' | 'text';
  /** Only for status-like or yes/no columns with few distinct values. */
  values?: { value: string; count: number }[];
  /** Only for date columns: the shape of the text (digits replaced by 9), and earliest/latest year-month. */
  dateShape?: string;
  dateRange?: string;
  /** Only for customer-link-like columns: % of filled values that match CUSTOMERMASTER.CUSTOMER. */
  customerMatchPct?: number;
}

export interface TableProfile {
  table: string;
  ok: boolean;
  error?: string;
  rows?: number;
  kb?: number;
  seconds?: number;
  columns?: ColumnProfile[];
  /** For __TABLE_LIST__ only: matching table names (structure, not data). */
  tableNames?: string[];
  totalTables?: number;
}

let customerCache: { at: number; set: Set<string> } | null = null;

async function customerCodes(): Promise<Set<string> | null> {
  if (customerCache && Date.now() - customerCache.at < 15 * 60_000) return customerCache.set;
  try {
    const { rows } = await readOstendoTable('CUSTOMERMASTER');
    const set = new Set(rows.map((r) => cell(r.CUSTOMER).toUpperCase()).filter(Boolean));
    if (set.size === 0) return null;
    customerCache = { at: Date.now(), set };
    return set;
  } catch {
    return null;
  }
}

/** Parse d/m/yyyy (optionally with time) into "yyyy-mm" for range display. */
function yearMonth(v: string): string | null {
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}`;
  const iso = v.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  return null;
}

function profileRows(rows: OstendoRow[], customers: Set<string> | null): ColumnProfile[] {
  const names = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) names.add(k);
  const total = rows.length || 1;
  const out: ColumnProfile[] = [];
  for (const column of [...names].sort()) {
    const values = rows.map((r) => cell(r[column])).filter(Boolean);
    const counts = new Map<string, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    const p: ColumnProfile = {
      column,
      filledPct: Math.round((values.length / total) * 1000) / 10,
      distinct: counts.size,
      kind: 'text',
    };
    const upper = column.toUpperCase();
    if (values.length === 0) p.kind = 'empty';
    else if (values.every((v) => YES_NO.has(v.toUpperCase()))) p.kind = 'yes/no';
    else if (values.every((v) => DATE_VALUE.test(v))) p.kind = 'date';
    else if (values.every((v) => /^-?\d+(\.\d+)?$/.test(v.replace(/,/g, '')))) p.kind = 'number';

    const statusLike = STATUS_NAME.test(upper) && !NOT_STATUS_NAME.test(upper.replace(STATUS_NAME, ''));
    if ((p.kind === 'yes/no' || (statusLike && p.kind === 'text')) && counts.size <= MAX_DISTINCT_SHOWN) {
      p.values = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
    }
    if (p.kind === 'date') {
      p.dateShape = values[0].replace(/\d/g, '9');
      const yms = values.map(yearMonth).filter((x): x is string => !!x).sort();
      if (yms.length) p.dateRange = `${yms[0]} to ${yms[yms.length - 1]}`;
    }
    if (customers && LINK_NAME.test(upper) && p.kind === 'text') {
      const hits = values.filter((v) => customers.has(v.toUpperCase())).length;
      p.customerMatchPct = Math.round((hits / values.length) * 1000) / 10;
    }
    out.push(p);
  }
  return out;
}

const TABLE_KEYWORDS = /(JOB|QUOTE|QUOTATION|SALES|ORDER|ESTIMAT|TENDER|PROJECT|OPPORTUN)/;

export async function profileTable(table: string, condition?: string): Promise<TableProfile> {
  const t = table.trim().toUpperCase();
  try {
    if (t === '__TABLE_LIST__') {
      const { rows, ms } = await readOstendoTable('RDB$RELATIONS');
      const all = rows.map((r) => cell(r['RDB$RELATION_NAME'])).filter((n) => n && !n.startsWith('RDB$') && !n.startsWith('MON$'));
      return {
        table: t,
        ok: true,
        totalTables: all.length,
        tableNames: all.filter((n) => TABLE_KEYWORDS.test(n)).sort(),
        seconds: Math.round(ms / 100) / 10,
      };
    }
    const { rows, bytes, ms } = await readOstendoTable(t, condition);
    const linkCols = rows.length && Object.keys(rows[0]).some((k) => LINK_NAME.test(k.toUpperCase()));
    const customers = linkCols ? await customerCodes() : null;
    return {
      table: t,
      ok: true,
      rows: rows.length,
      kb: Math.round(bytes / 1024),
      seconds: Math.round(ms / 100) / 10,
      columns: profileRows(rows, customers),
    };
  } catch (e) {
    const msg = e instanceof OstendoError ? e.message : 'Unexpected error while reading this table';
    return { table: t, ok: false, error: msg };
  }
}
