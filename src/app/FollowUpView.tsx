'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMeetingNotes } from './useMeetingNotes';
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
type View = ListKind | 'meeting';
const TAB_LABEL: Record<View, string> = { open: 'Open', inprogress: 'In progress', quote: 'Quotes', meeting: 'Meeting' };

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
  const [tab, setTab] = useState<View>('open');
  const [selected, setSelected] = useState<FollowUpRow | null>(null);
  const meeting = useMeetingNotes();
  const [confirmClear, setConfirmClear] = useState(false);
  const [picking, setPicking] = useState(false);
  const isOrder = (r: FollowUpRow) => r.kind === 'open' || r.kind === 'inprogress';
  // Which rows belong to the current tab. The Meeting tab holds the orders picked for the review meeting.
  const inView = (r: FollowUpRow) => (tab === 'meeting' ? isOrder(r) && !!meeting.notes[r.number] : r.kind === tab);

  // Only customers that appear in the current tab (and salesperson, if one is chosen).
  // The chosen customer stays in the list so switching tabs never loses the selection.
  const customers = useMemo(() => {
    const set = new Set(
      data.rows
        .filter((r) => inView(r) && (!salesperson || r.salesperson === salesperson))
        .map((r) => r.customer)
        .filter(Boolean),
    );
    if (customer) set.add(customer);
    return [...set].sort((a, b) => a.localeCompare(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, tab, salesperson, customer, meeting.notes]);
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

  const meetingRows = shown
    .filter((r) => isOrder(r) && meeting.notes[r.number])
    .sort(byDate((r) => r.required));
  const liveNumbers = new Set(data.rows.filter(isOrder).map((r) => r.number));
  // Picked orders that are no longer Open or InProgress in Ostendo (finished, closed, or renumbered).
  const goneNotes = Object.values(meeting.notes).filter((n) => !liveNumbers.has(n.number));
  const meetingCount = Object.keys(meeting.notes).length;

  const tabs: [View, number, number][] = [
    ['open', open.length, open.filter((x) => x.flag).length],
    ['inprogress', inProgress.length, inProgress.filter((x) => x.colour).length],
    ['quote', quotes.length, quotes.filter((x) => x.flag === 'follow-up').length],
    ['meeting', meetingCount, 0],
  ];

  // The calendar follows the customer and salesperson filters, but not the 'needs attention' tick box.
  const tabRows = shown.filter(inView);

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

  // The filters, customer list and download live in the layout's sidebar.
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById('sidebar-slot')), []);

  const sidebar = (
    <div className="side-panel">
      <div className="side-section">
        <div className="side-label">Filters</div>
        <label className="side-field">
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
        <label className="side-field">
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
        <label className="side-check">
          <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
          Only show ones that need attention
        </label>
        {(customer || salesperson || flaggedOnly) && (
          <button
            className="side-clear"
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

      <CustomerList
        rows={data.rows.filter((r) => inView(r) && (!salesperson || r.salesperson === salesperson))}
        today={today}
        selected={customer}
        onPick={setCustomer}
        noun={tab === 'quote' ? 'quotes' : 'orders'}
      />

      <div className="side-section side-bottom">
        {tab === 'quote' ? (
          <a
            className={customer ? 'button-link' : 'button-link disabled'}
            href={customer ? `/api/export?customer=${encodeURIComponent(customer)}&type=quotes` : undefined}
            aria-disabled={!customer}
            title={customer ? "Download this customer's outstanding quotes" : 'Choose a customer first'}
          >
            Download quotes spreadsheet
          </a>
        ) : (
          <button
            className="side-download"
            disabled={!customer}
            onClick={() => setPicking(true)}
            title={customer ? 'Choose which orders go in the spreadsheet' : 'Choose a customer first'}
          >
            Download orders spreadsheet
          </button>
        )}
        {!customer && <div className="side-hint">Choose a customer to download their {tab === 'quote' ? 'quotes' : 'orders'}.</div>}
      </div>
    </div>
  );

  const rowProps = (r: FollowUpRow) => ({
    onClick: () => setSelected(r),
    onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && setSelected(r),
    tabIndex: 0,
    title: 'Click for details',
  });

  return (
    <main>
      {slot && createPortal(sidebar, slot)}
      {picking && customer && tab !== 'quote' && (
        <PickOrders
          customer={customer}
          rows={data.rows.filter((r) => (r.kind === 'open' || r.kind === 'inprogress') && r.customer === customer)}
          today={today}
          onClose={() => setPicking(false)}
        />
      )}
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

      <Calendar
        rows={tabRows}
        today={today}
        title={tab === 'quote' ? 'Quote follow-ups, this week and next' : 'Due out, this week and next'}
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
                  <th className="pick" title="Tick to add to the review meeting">Meeting</th>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Purchase order</th>
                  <th>Description</th>
                  <th>Entered</th>
                  <th>Required</th>
                  <th className="num">Value ex GST</th>
                  <th>Flag</th>
                </tr>
              </thead>
              <tbody>
                {open.map(({ r, flag }) => (
                  <tr key={r.id} className={`clickable${meeting.notes[r.number] ? ' picked' : ''}`} {...rowProps(r)}>
                    <td className="pick" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Add ${r.number} to the meeting`}
                        checked={!!meeting.notes[r.number]}
                        onChange={(e) => meeting.toggle(r.number, e.target.checked)}
                      />
                    </td>
                    <td className="ordno">{r.number}</td>
                    <td>{r.customer}</td>
                    <td>{r.po}</td>
                    <td className="desc">{r.description}</td>
                    <td>{showDate(r.entered)}</td>
                    <td>{showDate(r.required) || <span className="muted">Not set</span>}</td>
                    <Value v={r.valueExGst} />
                    <td>{flag && <span className="pill red">{FOLLOW_UP_LABEL}</span>}</td>
                  </tr>
                ))}
                {open.length === 0 && <Empty cols={9} />}
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
                  <th className="pick" title="Tick to add to the review meeting">Meeting</th>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Purchase order</th>
                  <th>Description</th>
                  <th>Entered</th>
                  <th>Required</th>
                  <th className="num">Value ex GST</th>
                </tr>
              </thead>
              <tbody>
                {inProgress.map(({ r, colour }) => (
                  <tr key={r.id} className={`clickable${colour ? ` row-${colour}` : ''}${meeting.notes[r.number] ? ' picked' : ''}`} {...rowProps(r)}>
                    <td className="pick" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Add ${r.number} to the meeting`}
                        checked={!!meeting.notes[r.number]}
                        onChange={(e) => meeting.toggle(r.number, e.target.checked)}
                      />
                    </td>
                    <td className="ordno">{r.number}</td>
                    <td>{r.customer}</td>
                    <td>{r.po}</td>
                    <td className="desc">{r.description}</td>
                    <td>{showDate(r.entered)}</td>
                    <td>{showDate(r.required) || <span className="muted">Not set</span>}</td>
                    <Value v={r.valueExGst} />
                  </tr>
                ))}
                {inProgress.length === 0 && <Empty cols={8} />}
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

      {tab === 'meeting' && (
        <section>
          <h2>
            Open Sales Order Review Meeting{' '}
            <span className="muted small">
              {meetingCount} order{meetingCount === 1 ? '' : 's'} picked.{' '}
              {meeting.mode === 'shared' && (meeting.saving === 'saving' ? 'Saving...' : meeting.saving === 'failed' ? `Last change did not save. ${meeting.error}` : 'All changes saved.')}
            </span>
          </h2>
          {meeting.mode === 'local' && (
            <p className="notice">Notes are being saved in this browser only until Firebase is connected.</p>
          )}
          {meeting.mode === 'error' && <p className="notice bad">Couldn&apos;t load the saved notes. {meeting.error || 'Reload the page to try again.'}</p>}
          <p className="legend">Tick orders on the Open or In progress tabs to add them here. Notes stay until you remove them or clear the list. They are never written to Ostendo.</p>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Purchase order</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Required</th>
                  <th className="num">Value ex GST</th>
                  <th className="note-col">Meeting notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {meetingRows.map((r) => (
                  <tr key={r.id} className={`${inProgressColour(r.required, today) === 'red' || openOrderFlag(r.required, today) ? 'row-red' : ''}`}>
                    <td className="ordno clickable-cell" onClick={() => setSelected(r)}>{r.number}</td>
                    <td>{r.customer}</td>
                    <td>{r.po}</td>
                    <td className="desc">{r.description}</td>
                    <td>{TAB_LABEL[r.kind]}</td>
                    <td>{showDate(r.required) || <span className="muted">Not set</span>}</td>
                    <Value v={r.valueExGst} />
                    <td className="note-col">
                      <textarea
                        className="note-box"
                        rows={2}
                        placeholder="What was said..."
                        value={meeting.notes[r.number]?.note ?? ''}
                        onChange={(e) => meeting.setNote(r.number, e.target.value)}
                      />
                    </td>
                    <td>
                      <button className="secondary icon-btn" onClick={() => meeting.toggle(r.number, false)} title="Remove from the meeting" aria-label={`Remove ${r.number} from the meeting`}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
                {!customer && !salesperson && goneNotes.map((n) => (
                  <tr key={`gone-${n.number}`} className="gone">
                    <td className="ordno">{n.number}</td>
                    <td colSpan={6} className="muted">No longer open or in progress in Ostendo.</td>
                    <td className="note-col">
                      <textarea className="note-box" rows={2} value={n.note} onChange={(e) => meeting.setNote(n.number, e.target.value)} />
                    </td>
                    <td>
                      <button className="secondary icon-btn" onClick={() => meeting.toggle(n.number, false)} title="Remove from the meeting" aria-label={`Remove ${n.number} from the meeting`}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
                {meetingRows.length === 0 && (customer || salesperson || goneNotes.length === 0) && (
                  <tr>
                    <td colSpan={9} className="muted">
                      {meetingCount === 0 ? 'No orders picked yet. Tick orders on the Open or In progress tabs.' : 'No picked orders match the filters.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {meetingCount > 0 && (
            <div className="row" style={{ marginTop: 12 }}>
              {!confirmClear ? (
                <button className="secondary" onClick={() => setConfirmClear(true)}>
                  Clear meeting list
                </button>
              ) : (
                <>
                  <span>Remove all {meetingCount} orders and their notes?</span>
                  <button className="danger" onClick={() => { meeting.clearAll(); setConfirmClear(false); }}>
                    Yes, clear everything
                  </button>
                  <button className="secondary" onClick={() => setConfirmClear(false)}>
                    Cancel
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {selected && <Details row={selected} today={today} onClose={() => setSelected(null)} />}
    </main>
  );
}

function needsAttention(r: FollowUpRow, today: string): boolean {
  if (r.kind === 'open') return !!openOrderFlag(r.required, today);
  if (r.kind === 'inprogress') return !!inProgressColour(r.required, today);
  return quoteFlag(r.entered, today) === 'follow-up';
}

function CustomerList({
  rows,
  today,
  selected,
  onPick,
  noun,
}: {
  rows: FollowUpRow[];
  today: string;
  selected: string;
  onPick: (c: string) => void;
  noun: string;
}) {
  const counts = new Map<string, { total: number; attention: number }>();
  for (const r of rows) {
    if (!r.customer) continue;
    const c = counts.get(r.customer) ?? { total: 0, attention: 0 };
    c.total += 1;
    if (needsAttention(r, today)) c.attention += 1;
    counts.set(r.customer, c);
  }
  const list = [...counts.entries()].sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]));
  return (
    <aside className="cust-list">
      <div className="cust-head">
        <span>Customers</span>
        <span className="muted small">{list.length}</span>
      </div>
      <button className={`cust-item${selected ? '' : ' active'}`} onClick={() => onPick('')}>
        <span className="cust-name">All customers</span>
        <span className="count">{rows.length}</span>
      </button>
      <div className="cust-scroll">
        {list.map(([name, c]) => (
          <button
            key={name}
            className={`cust-item${selected === name ? ' active' : ''}`}
            onClick={() => onPick(selected === name ? '' : name)}
            title={`${name}: ${c.total} outstanding ${noun}${c.attention ? `, ${c.attention} need attention` : ''}`}
          >
            <span className="cust-name">{name}</span>
            {c.attention > 0 && <span className="dot">{c.attention}</span>}
            <span className="count">{c.total}</span>
          </button>
        ))}
      </div>
    </aside>
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
  // Two working weeks, Monday to Friday, starting on this week's Monday.
  const dow = new Date(today + 'T00:00:00Z').getUTCDay(); // 0 = Sun
  const monday = addDays(today, dow === 0 ? -6 : 1 - dow);
  const days = [0, 1, 2, 3, 4, 7, 8, 9, 10, 11].map((i) => addDays(monday, i));
  const lastDay = addDays(monday, 13);
  // Anything due on a weekend is shown on the Friday before it.
  const byDay = new Map<string, { r: FollowUpRow; weekend?: string }[]>();
  for (const r of rows) {
    const d = calendarDate(r);
    if (!d || d < monday || d > lastDay) continue;
    const wd = new Date(d + 'T00:00:00Z').getUTCDay();
    const slot = wd === 6 ? addDays(d, -1) : wd === 0 ? addDays(d, -2) : d;
    const weekend = wd === 6 ? 'Sat' : wd === 0 ? 'Sun' : undefined;
    byDay.set(slot, [...(byDay.get(slot) ?? []), { r, weekend }]);
  }
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return {
      weekday: dt.toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'UTC' }),
      day: dt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
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
            <div key={d} className={`cal-day${d === today ? ' today' : ''}${d < today ? ' past' : ''}`}>
              <div className="cal-head">
                <span>{d === today ? 'Today' : f.weekday}</span>
                <span className="muted">{f.day}</span>
              </div>
              {items.map(({ r, weekend }) => (
                <button key={r.id} className="cal-item" onClick={() => onPick(r)} title={`${r.customer}: ${r.description}`}>
                  {r.number}
                  {weekend && <span className="muted"> ({weekend})</span>}
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
        <OrderLines order={row.number} isQuote={isQuote} />
      </aside>
    </div>
  );
}

type Line = { line: number; code: string; description: string; qty: number | null; unit: string; remaining: number | null };

/** Items on the order. Fetched from Ostendo only when this order is opened. */
function OrderLines({ order, isQuote }: { order: string; isQuote: boolean }) {
  const [state, setState] = useState<{ lines?: Line[]; error?: string }>({});
  useEffect(() => {
    let live = true;
    setState({});
    fetch(`/api/order-lines?order=${encodeURIComponent(order)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => live && setState(j.lines ? { lines: j.lines } : { error: j.error ?? 'Could not load the items' }))
      .catch(() => live && setState({ error: 'Could not load the items' }));
    return () => {
      live = false;
    };
  }, [order]);

  const qty = (n: number | null) => (n === null ? '' : n.toLocaleString('en-AU', { maximumFractionDigits: 3 }));
  const showRemaining = !isQuote && (state.lines ?? []).some((l) => l.remaining !== null && l.remaining !== l.qty);

  return (
    <section className="lines">
      <h3>Items {isQuote ? 'quoted' : 'on this order'}</h3>
      {!state.lines && !state.error && <p className="muted small">Loading items from Ostendo...</p>}
      {state.error && <p className="bad small">{state.error}</p>}
      {state.lines && state.lines.length === 0 && <p className="muted small">No items found for this {isQuote ? 'quote' : 'order'}.</p>}
      {state.lines && state.lines.length > 0 && (
        <table className="lines-table">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Qty</th>
              {showRemaining && <th className="num">To supply</th>}
            </tr>
          </thead>
          <tbody>
            {state.lines.map((l) => (
              <tr key={l.line}>
                <td>
                  <div className="line-code">{l.code}</div>
                  {l.description && l.description !== l.code && <div className="muted small">{l.description}</div>}
                </td>
                <td className="num">
                  {qty(l.qty)} {l.qty !== null && l.unit}
                </td>
                {showRemaining && <td className="num">{qty(l.remaining)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Monday of the week containing a yyyy-mm-dd date. */
function mondayOf(iso: string): string {
  const wd = new Date(iso + 'T00:00:00Z').getUTCDay();
  return addDays(iso, wd === 0 ? -6 : 1 - wd);
}

/** Choose which of a customer's orders go in the spreadsheet before downloading it. */
function PickOrders({ customer, rows, today, onClose }: { customer: string; rows: FollowUpRow[]; today: string; onClose: () => void }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => (a.required ?? '9999').localeCompare(b.required ?? '9999')), [rows]);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(rows.map((r) => r.id)));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // "Next week" starts next Monday. Weekend dates count with the week before, as on the calendar.
  const nextMonday = addDays(mondayOf(today), 7);
  const weeks = (n: number) => {
    const end = addDays(nextMonday, 7 * n - 1);
    setChosen(new Set(sorted.filter((r) => r.required && r.required >= nextMonday && r.required <= end).map((r) => r.id)));
  };
  const range = (n: number) => `${showDate(nextMonday).slice(0, 5)} to ${showDate(addDays(nextMonday, 7 * n - 3)).slice(0, 5)}`;
  const toggle = (id: string) =>
    setChosen((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const ids = sorted.filter((r) => chosen.has(r.id)).map((r) => r.id);
  const href = `/api/export?customer=${encodeURIComponent(customer)}&orders=${ids.map(encodeURIComponent).join(',')}`;

  return (
    <div className="overlay center" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="Choose orders for the spreadsheet" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <div className="muted small">Orders spreadsheet</div>
            <h2 style={{ margin: 0 }}>{customer}</h2>
          </div>
          <button className="secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
        <div className="pick-quick">
          <span className="muted small">Tick:</span>
          <button className="secondary small-btn" onClick={() => weeks(1)} title={range(1)}>
            Next week ({range(1)})
          </button>
          <button className="secondary small-btn" onClick={() => weeks(2)} title={range(2)}>
            Next 2 weeks
          </button>
          <button className="secondary small-btn" onClick={() => weeks(3)} title={range(3)}>
            Next 3 weeks
          </button>
          <button className="secondary small-btn" onClick={() => setChosen(new Set(sorted.map((r) => r.id)))}>
            All
          </button>
          <button className="secondary small-btn" onClick={() => setChosen(new Set())}>
            None
          </button>
        </div>
        <div className="pick-list">
          <table>
            <thead>
              <tr>
                <th />
                <th>Order</th>
                <th>Purchase order</th>
                <th>Description</th>
                <th>Status</th>
                <th>Required</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const colour = r.kind === 'inprogress' ? inProgressColour(r.required, today) : null;
                return (
                  <tr key={r.id} className={chosen.has(r.id) ? 'picked' : ''} onClick={() => toggle(r.id)}>
                    <td>
                      <input type="checkbox" checked={chosen.has(r.id)} onChange={() => toggle(r.id)} onClick={(e) => e.stopPropagation()} aria-label={`Include ${r.number}`} />
                    </td>
                    <td>{r.number}</td>
                    <td>{r.po}</td>
                    <td className="wrap">{r.description}</td>
                    <td>{TAB_LABEL[r.kind]}</td>
                    <td>{r.required ? <span className={colour ? `pill ${colour}` : ''}>{showDate(r.required)}</span> : <span className="muted">Not set</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="pick-foot">
          <span className="muted small">
            {ids.length} of {sorted.length} orders ticked
          </span>
          <a className={ids.length ? 'button-link' : 'button-link disabled'} href={ids.length ? href : undefined} aria-disabled={!ids.length} onClick={() => ids.length && setTimeout(onClose, 300)}>
            Download spreadsheet
          </a>
        </div>
      </div>
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
