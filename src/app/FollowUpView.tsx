'use client';

import { useMemo, useState } from 'react';
import type { FollowUpData, FollowUpRow } from '@/lib/followup';
import {
  daysBetween,
  FOLLOW_UP_LABEL,
  inProgressColour,
  OLD_QUOTE_LABEL,
  openOrderFlag,
  quoteFlag,
  showDate,
} from '@/lib/rules';

const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });

function byDate(get: (r: FollowUpRow) => string | null) {
  return (a: FollowUpRow, b: FollowUpRow) => (get(a) ?? '9999').localeCompare(get(b) ?? '9999');
}

function Value({ v }: { v: number | null }) {
  return <td className="num">{v === null ? '' : money.format(v)}</td>;
}

export default function FollowUpView({ data, today }: { data: FollowUpData; today: string }) {
  const [customer, setCustomer] = useState('');
  const [salesperson, setSalesperson] = useState('');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const customers = useMemo(() => [...new Set(data.rows.map((r) => r.customer).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [data]);
  const reps = useMemo(() => [...new Set(data.rows.map((r) => r.salesperson).filter(Boolean))].sort(), [data]);

  const shown = data.rows.filter(
    (r) => (!customer || r.customer === customer) && (!salesperson || r.salesperson === salesperson),
  );

  const open = shown
    .filter((r) => r.kind === 'open')
    .map((r) => ({ r, flag: openOrderFlag(r.required, today) }))
    .filter((x) => !flaggedOnly || x.flag)
    .sort((a, b) => byDate((r) => r.required)(a.r, b.r));

  const inProgress = shown
    .filter((r) => r.kind === 'inprogress')
    .map((r) => ({ r, colour: inProgressColour(r.required, today) }))
    .filter((x) => !flaggedOnly || x.colour)
    .sort((a, b) => byDate((r) => r.required)(a.r, b.r));

  const quotes = shown
    .filter((r) => r.kind === 'quote')
    .map((r) => ({ r, flag: quoteFlag(r.entered, today) }))
    .filter((x) => !flaggedOnly || x.flag)
    .sort((a, b) => byDate((r) => r.entered)(a.r, b.r));

  async function refresh() {
    setRefreshing(true);
    await fetch('/api/refresh', { method: 'POST' }).catch(() => undefined);
    window.location.reload();
  }

  const fetched = new Date(data.fetchedAt).toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <main>
      <h1>Weekly Follow-Up</h1>
      <p className="muted">
        Job orders and quotes from Ostendo, as of {fetched} (Melbourne time). Updates hourly.{' '}
        <button className="link" onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Refreshing...' : 'Refresh now'}
        </button>
      </p>

      <div className="card filters">
        <label>
          Customer
          <select value={customer} onChange={(e) => setCustomer(e.target.value)}>
            <option value="">All customers</option>
            {customers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Salesperson
          <select value={salesperson} onChange={(e) => setSalesperson(e.target.value)}>
            <option value="">Everyone</option>
            {reps.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
          Only show ones that need attention
        </label>
        {(customer || salesperson || flaggedOnly) && (
          <button
            className="secondary"
            onClick={() => {
              setCustomer('');
              setSalesperson('');
              setFlaggedOnly(false);
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      <section>
        <h2>
          Open orders <span className="count">{open.length}</span>{' '}
          <span className="muted small">{open.filter((x) => x.flag).length} need follow-up</span>
        </h2>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Description</th>
                <th>Entered</th>
                <th>Required</th>
                <th className="num">Value ex GST</th>
                <th>Flag</th>
              </tr>
            </thead>
            <tbody>
              {open.map(({ r, flag }) => (
                <tr key={r.id}>
                  <td>{r.number}</td>
                  <td>{r.customer}</td>
                  <td className="desc">{r.description}</td>
                  <td>{showDate(r.entered)}</td>
                  <td>{showDate(r.required) || <span className="muted">Not set</span>}</td>
                  <Value v={r.valueExGst} />
                  <td>{flag && <span className="pill red">{FOLLOW_UP_LABEL}</span>}</td>
                </tr>
              ))}
              {open.length === 0 && <Empty cols={7} />}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>
          In-progress orders <span className="count">{inProgress.length}</span>{' '}
          <span className="muted small">
            {inProgress.filter((x) => x.colour === 'red').length} overdue,{' '}
            {inProgress.filter((x) => x.colour === 'yellow').length} due within 2 weeks
          </span>
        </h2>
        <p className="legend">
          <span className="swatch red" /> Required date has passed <span className="swatch yellow" /> Due within 2 weeks
        </p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Description</th>
                <th>Entered</th>
                <th>Required</th>
                <th className="num">Value ex GST</th>
              </tr>
            </thead>
            <tbody>
              {inProgress.map(({ r, colour }) => (
                <tr key={r.id} className={colour ? `row-${colour}` : undefined}>
                  <td>{r.number}</td>
                  <td>{r.customer}</td>
                  <td className="desc">{r.description}</td>
                  <td>{showDate(r.entered)}</td>
                  <td>{showDate(r.required) || <span className="muted">Not set</span>}</td>
                  <Value v={r.valueExGst} />
                </tr>
              ))}
              {inProgress.length === 0 && <Empty cols={6} />}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>
          Outstanding quotes <span className="count">{quotes.length}</span>{' '}
          <span className="muted small">
            {quotes.filter((x) => x.flag === 'follow-up').length} need follow-up,{' '}
            {quotes.filter((x) => x.flag === 'old').length} over 3 months old
          </span>
        </h2>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Quote</th>
                <th>Customer</th>
                <th>Description</th>
                <th>Quote date</th>
                <th className="num">Age</th>
                <th className="num">Value ex GST</th>
                <th>Flag</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map(({ r, flag }) => (
                <tr key={r.id}>
                  <td>{r.number}</td>
                  <td>{r.customer}</td>
                  <td className="desc">{r.description}</td>
                  <td>{showDate(r.entered)}</td>
                  <td className="num">{r.entered ? `${daysBetween(r.entered, today)} days` : ''}</td>
                  <Value v={r.valueExGst} />
                  <td>
                    {flag === 'follow-up' && <span className="pill red">{FOLLOW_UP_LABEL}</span>}
                    {flag === 'old' && <span className="pill grey">{OLD_QUOTE_LABEL}</span>}
                  </td>
                </tr>
              ))}
              {quotes.length === 0 && <Empty cols={7} />}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Empty({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="muted">
        Nothing to show.
      </td>
    </tr>
  );
}
