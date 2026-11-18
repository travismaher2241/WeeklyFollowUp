'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FollowUpData, FollowUpRow, ListKind } from '@/lib/followup';
import {
  addDays,
  daysBetween,
  FOLLOW_UP_LABEL,
  inProgressColour,
  OLD_QUOTE_LABEL,
  openOrderFlag,
  quoteFlag,
  showDate,
} from '@/lib/rules';

const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
const TAB_LABEL: Record<ListKind, string> = { open: 'Open', inprogress: 'In progress', quote: 'Quotes' };

function byDate(get: (r: FollowUpRow) => string | null) {
  return (a: FollowUpRow, b: FollowUpRow) => (get(a) ?? '9999').localeCompare(get(b) ?? '9999');
}

function Value({ v }: { v: number | null }) {
  return <td className="num">{v === null ? '' : money.format(v)}</td>;
}

/** The date each list puts on its calendar. */
function calendarDate(r: FollowUpRow): string | null {
  return r.kind === 'quote' ? r.followUpDate : r.required;
}

export default function FollowUpView({ data, today }: { data: FollowUpData; today: string }) {
  const [customer, setCustomer] = useState('');
  const [salesperson, setSalesperson] = useState('');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<ListKind>('open');
  const [selected, setSelected] = useState<FollowUpRow | null>(null);

  const customers = useMemo(
    () => [...new Set(data.rows.map((r) => r.customer).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [data],
  );
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

  const tabs: [ListKind, number, number][] = [
    ['open', open.length, open.filter((x) => x.flag).length],
    ['inprogress', inProgress.length, inProgress.filter((x) => x.colour).length],
    ['quote', quotes.length, quotes.filter((x) => x.flag === 'follow-up').length],
  ];

  // The calendar follows the customer and salesperson filters, but not the 'needs attention' tick box.
  const tabRows = shown.filter((r) => r.kind === tab);

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

  const rowProps = (r: FollowUpRow) => ({
    onClick: () => setSelected(r),
    onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && setSelected(r),
    tabIndex: 0,
    title: 'Click for details',
  });

  return (
    <main>
      <header className="top">
        <div>
          <h1>Weekly Follow-Up</h1>
          <p className="muted sub">
            From Ostendo, as of {fetched} (Melbourne time). Updates hourly.{' '}
            <button className="link" onClick={refresh} disabled={refreshing}>
              {refreshing ? 'Refreshing...' : 'Refresh now'}
            </button>
          </p>
        </div>
        <nav className="tabs" role="tablist">
          {tabs.map(([key, count, attention]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? 'tab active' : 'tab'}
              onClick={() => setTab(key)}
            >
              {TAB_LABEL[key]} <span className="count">{count}</span>
              {attention > 0 && (
                <span className="dot" title="Need attention">
                  {attention}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

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

      <Calendar
        rows={tabRows}
        today={today}
        title={tab === 'quote' ? 'Quote follow-ups, next 2 weeks' : 'Due out, next 2 weeks'}
        note={tab === 'quote' ? 'By the follow-up date set on the quote in Ostendo.' : 'By required date.'}
        onPick={setSelected}
      />

      {tab === 'open' && (
        <section>
          <h2>
            Open orders <span className="muted small">{open.filter((x) => x.flag).length} need follow-up</span>
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
                  <tr key={r.id} className="clickable" {...rowProps(r)}>
                    <td className="ordno">{r.number}</td>
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
      )}

      {tab === 'inprogress' && (
        <section>
          <h2>
            In-progress orders{' '}
            <span className="muted small">
              {inProgress.filter((x) => x.colour === 'red').length} overdue,{' '}
              {inProgress.filter((x) => x.colour === 'yellow').length} due within 2 weeks
            </span>
          </h2>
          <p className="legend">
            <span className="swatch red" /> Required date has passed <span className="swatch yellow" /> Due within 2
            weeks
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
                  <tr key={r.id} className={`clickable${colour ? ` row-${colour}` : ''}`} {...rowProps(r)}>
                    <td className="ordno">{r.number}</td>
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
      )}

      {tab === 'quote' && (
        <section>
          <h2>
            Outstanding quotes{' '}
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
                  <tr key={r.id} className="clickable" {...rowProps(r)}>
                    <td className="ordno">{r.number}</td>
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
      )}

      {selected && <Details row={selected} today={today} onClose={() => setSelected(null)} />}
    </main>
  );
}

function Calendar({
  rows,
  today,
  title,
  note,
  onPick,
}: {
  rows: FollowUpRow[];
  today: string;
  title: string;
  note: string;
  onPick: (r: FollowUpRow) => void;
}) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const byDay = new Map<string, FollowUpRow[]>();
  for (const r of rows) {
    const d = calendarDate(r);
    if (d && d >= days[0] && d <= days[13]) byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return {
      weekday: dt.toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'UTC' }),
      day: dt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
      weekend: dt.getUTCDay() === 0 || dt.getUTCDay() === 6,
    };
  };
  return (
    <section className="calendar">
      <h2>
        {title} <span className="muted small">{note}</span>
      </h2>
      <div className="cal-grid">
        {days.map((d) => {
          const f = fmt(d);
          const items = byDay.get(d) ?? [];
          return (
            <div key={d} className={`cal-day${d === today ? ' today' : ''}${f.weekend ? ' weekend' : ''}`}>
              <div className="cal-head">
                <span>{d === today ? 'Today' : f.weekday}</span>
                <span className="muted">{f.day}</span>
              </div>
              {items.map((r) => (
                <button key={r.id} className="cal-item" onClick={() => onPick(r)} title={`${r.customer}: ${r.description}`}>
                  {r.number}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Details({ row, today, onClose }: { row: FollowUpRow; today: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isQuote = row.kind === 'quote';
  const summary: [string, string][] = [
    ['Customer', row.customer],
    [isQuote ? 'Quote date' : 'Entered', showDate(row.entered)],
    ...(isQuote
      ? ([['Age', row.entered ? `${daysBetween(row.entered, today)} days` : '']] as [string, string][])
      : ([['Required', showDate(row.required) || 'Not set']] as [string, string][])),
  ];

  return (
    <div className="overlay" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-label={`Details for ${row.number}`} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <div className="muted small">{isQuote ? 'Quote' : `${TAB_LABEL[row.kind]} order`}</div>
            <h2 style={{ margin: 0 }}>{row.number}</h2>
          </div>
          <button className="secondary" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        {row.description && <p>{row.description}</p>}
        <dl>
          {[...summary, ...row.details].filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="dl-row">
              <dt>{k}</dt>
              <dd>
                {k === 'Email' ? (
                  <a href={`mailto:${v}`}>{v}</a>
                ) : k === 'Phone' || k === 'Mobile' ? (
                  <a href={`tel:${v.replace(/\s/g, '')}`}>{v}</a>
                ) : (
                  v
                )}
              </dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
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
