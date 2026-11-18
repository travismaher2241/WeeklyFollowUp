'use client';
// TEMPORARY page: runs the structure-only Ostendo check one table at a time
// and builds a text report to copy and paste back to Claude. Shows no customer data.

import { useState } from 'react';

const DEFAULT_TABLES = [
  '__TABLE_LIST__',
  'JOBHEADER',
  'JOBORDERHEADER',
  'JOBORDERS',
  'SALESORDERHEADER',
  'SALESQUOTEHEADER',
  'QUOTEHEADER',
  'QUOTATIONHEADER',
  'JOBQUOTEHEADER',
  'ESTIMATEHEADER',
  'SALESHEADER',
];

type Col = {
  column: string;
  filledPct: number;
  distinct: number;
  kind: string;
  values?: { value: string; count: number }[];
  dateShape?: string;
  dateRange?: string;
  customerMatchPct?: number;
};
type Result = {
  table: string;
  ok: boolean;
  error?: string;
  rows?: number;
  kb?: number;
  seconds?: number;
  columns?: Col[];
  tableNames?: string[];
  totalTables?: number;
};

function toText(r: Result): string {
  if (!r.ok) return `## ${r.table}: FAILED (${r.error})`;
  if (r.tableNames) {
    return `## TABLE LIST: ${r.totalTables} tables, ${r.tableNames.length} look relevant\n${r.tableNames.join(', ') || '(none matched)'}`;
  }
  const lines = [`## ${r.table}: ${r.rows} rows, ${r.kb} KB, ${r.seconds}s`];
  for (const c of r.columns ?? []) {
    let s = `- ${c.column} [${c.kind}] ${c.filledPct}% filled, ${c.distinct} distinct`;
    if (c.dateShape) s += `, looks like "${c.dateShape}"`;
    if (c.dateRange) s += `, ${c.dateRange}`;
    if (c.customerMatchPct !== undefined) s += `, ${c.customerMatchPct}% match a customer`;
    if (c.values) s += `\n    values: ${c.values.map((v) => `${v.value} (${v.count})`).join(', ')}`;
    lines.push(s);
  }
  return lines.join('\n');
}

export default function DiagnosticPage() {
  const [tables, setTables] = useState(DEFAULT_TABLES.join(', '));
  const [condition, setCondition] = useState('');
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [copied, setCopied] = useState(false);

  async function run() {
    setRunning(true);
    setResults([]);
    setCopied(false);
    const settings = await fetch('/api/ostendo/diagnostic', { cache: 'no-store' })
      .then((r) => r.json())
      .catch(() => ({ settings: 'problem', error: 'Could not reach this app' }));
    if (settings.settings !== 'ok') {
      setStatus(`Settings problem: ${settings.error ?? 'unknown'}`);
      setRunning(false);
      return;
    }
    const list = tables.split(/[\s,]+/).map((t) => t.trim().toUpperCase()).filter(Boolean);
    const done: Result[] = [];
    // One table at a time, on purpose: Ostendo is Plasgain's live system.
    for (const [i, t] of list.entries()) {
      setStatus(`Checking ${t} (${i + 1} of ${list.length})...`);
      const qs = new URLSearchParams({ table: t });
      if (condition.trim() && t !== '__TABLE_LIST__') qs.set('condition', condition.trim());
      const r: Result = await fetch(`/api/ostendo/diagnostic?${qs}`, { cache: 'no-store' })
        .then((res) => res.json())
        .catch(() => ({ table: t, ok: false, error: 'The check timed out or the app could not be reached' }));
      done.push(r);
      setResults([...done]);
    }
    setStatus(`Finished. ${done.filter((d) => d.ok).length} of ${done.length} tables could be read.`);
    setRunning(false);
  }

  const report = results.map(toText).join('\n\n');

  return (
    <main>
      <h1>Ostendo structure check</h1>
      <p className="muted">
        This reads Ostendo one table at a time and shows only the shape of each table: how many rows, the column
        names, how full each column is, and the list of status values. It never shows customer names, amounts or
        other row data. It doesn't change anything in Ostendo.
      </p>

      <div className="card">
        <label>
          <strong>Tables to check</strong> (separated by commas)
          <textarea rows={3} value={tables} onChange={(e) => setTables(e.target.value)} disabled={running} />
        </label>
        <label style={{ display: 'block', marginTop: 12 }}>
          <strong>Optional filter</strong> <span className="muted">(leave blank unless Claude asks for one)</span>
          <input value={condition} onChange={(e) => setCondition(e.target.value)} disabled={running} />
        </label>
        <div className="row" style={{ marginTop: 12 }}>
          <button onClick={run} disabled={running}>
            {running ? 'Running...' : 'Run the check'}
          </button>
          <span>{status}</span>
        </div>
      </div>

      {results.length > 0 && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>Results to paste back to Claude</strong>
            <button
              className="secondary"
              disabled={running}
              onClick={() =>
                navigator.clipboard.writeText(report).then(() => setCopied(true), () => setCopied(false))
              }
            >
              {copied ? 'Copied' : 'Copy results'}
            </button>
          </div>
          <textarea readOnly rows={24} value={report} style={{ marginTop: 8 }} />
        </div>
      )}
    </main>
  );
}
