// Reads the lines (items and quantities) of one order or quote from Ostendo's JOBLINES table.
// SERVER-SIDE ONLY. Read once, only when someone opens that order in the app.
import { unstable_cache } from 'next/cache';
import { cell, readOstendoTable } from './ostendo';

export interface OrderLine {
  line: number;
  code: string;
  description: string;
  qty: number | null;
  unit: string;
  /** REMAININGQTY: still to be supplied. */
  remaining: number | null;
}

function num(v: unknown): number | null {
  const s = cell(v).replace(/[,\s]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Order numbers as Ostendo writes them, e.g. PD7943. */
export const ORDER_NUMBER = /^[A-Za-z0-9#\-\/ .]{1,40}$/;

async function load(order: string): Promise<OrderLine[]> {
  const { rows } = await readOstendoTable('JOBLINES', `ORDERNUMBER='${order.replace(/'/g, "''")}'`);
  return rows
    .filter((r) => cell(r.ORDERNUMBER) === order) // belt and braces if the filter is ignored
    .map((r) => ({
      line: num(r.LINENUMBER) ?? 0,
      code: cell(r.LINECODE),
      description: cell(r.LINEDESCRIPTION),
      qty: num(r.ORDERQTY),
      unit: cell(r.LINEUNIT),
      remaining: num(r.REMAININGQTY),
    }))
    .sort((a, b) => a.line - b.line);
}

/** Cached for 10 minutes per order, so reopening an order doesn't hit Ostendo again. */
export const getOrderLines = unstable_cache(load, ['joblines-v1'], { revalidate: 600, tags: ['followup'] });
