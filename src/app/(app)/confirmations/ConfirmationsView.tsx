'use client';

import { useCallback, useEffect, useState } from 'react';
import { isLocked, type ConfirmResponse, type LinkStatus } from '@/lib/confirmRules';
import type { LinkSummary, StoredLink } from '@/lib/confirmStore';
import { showDate } from '@/lib/rules';

export interface CustomerOption {
  name: string;
  orders: number;
  contacts: { name: string; email: string }[];
}

type Row = LinkSummary & { status: LinkStatus };
type Full = StoredLink & { status: LinkStatus };

const STATUS: Record<LinkStatus, [string, string]> = {
  waiting: ['Waiting for customer', 'amber'],
  submitted: ['Answered', 'green'],
  expired: ['Expired', 'grey'],
  cancelled: ['Cancelled', 'grey'],
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const day = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { timeZone: 'Australia/Melbourne', day: '2-digit', month: '2-digit', year: 'numeric' });
const linkUrl = (token: string) => `${window.location.origin}/confirm/${token}`;

function mailto(l: { contactEmail: string; contactName: string; customer: string; token: string; expiresAt: string }) {
  const first = l.contactName.split(' ')[0] || 'there';
  const body = `Hi ${first},

Please confirm the delivery dates for your current ${l.customer} orders with Plasgain using the link below. For each order you can confirm the date, choose a new date, or let us know the date is unknown.

${linkUrl(l.token)}

Please note: confirmed deliveries cannot be delayed or altered within 48 hours (2 business days) of the confirmed delivery date.

The link is for you only and expires on ${day(l.expiresAt)}.

Thank you`;
  return `mailto:${encodeURIComponent(l.contactEmail)}?subject=${encodeURIComponent('Please confirm your delivery dates - Plasgain')}&body=${encodeURIComponent(body)}`;
}

function StatusPill({ s }: { s: LinkStatus }) {
  return <span className={`pill ${STATUS[s][1]}`}>{STATUS[s][0]}</span>;
}

function CopyButton({ token, label = 'Copy link' }: { token: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="secondary small-btn"
      onClick={async (e) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(linkUrl(token)).catch(() => undefined);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}

export default function ConfirmationsView({ customers, ostendoError, today }: { customers: CustomerOption[]; ostendoError: string; today: string }) {
  const [links, setLinks] = useState<Row[]>([]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [days, setDays] = useState(14);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [created, setCreated] = useState<Full | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | LinkStatus>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/links', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not load the links');
      setLinks(j.links);
      setLoadError('');
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const picked = customers.find((c) => c.name === customer);

  function chooseCustomer(name: string) {
    setCustomer(name);
    setCreated(null);
    const c = customers.find((x) => x.name === name);
    const first = c?.contacts.find((x) => x.name) ?? c?.contacts[0];
    setContactName(first?.name ?? '');
    setContactEmail(first?.email ?? '');
  }

  async function create() {
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer, contactName, contactEmail, days }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not make the link');
      setCreated(j.link);
      load();
    } catch (e) {
      setCreateError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const shown = links.filter((l) => filter === 'all' || l.status === filter);
  const counts = (s: LinkStatus) => links.filter((l) => l.status === s).length;

  return (
    <main>
      <header className="top">
        <div>
          <h1>Delivery confirmations</h1>
          <p className="muted sub">Send a customer a private link to confirm the delivery dates of their in-progress orders.</p>
        </div>
      </header>

      <div className="card create-card">
        <h2>Make a customer link</h2>
        {ostendoError && <p className="notice bad">Couldn&apos;t load customers from Ostendo: {ostendoError}</p>}
        <div className="filters create-fields">
          <label>
            Customer (in-progress orders)
            <select value={customer} onChange={(e) => chooseCustomer(e.target.value)}>
              <option value="">Choose a customer</option>
              {customers.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.orders})
                </option>
              ))}
            </select>
          </label>
          <label>
            Contact name
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} list="contact-names" placeholder="Who is this link for?" />
            <datalist id="contact-names">
              {picked?.contacts.filter((c) => c.name).map((c) => <option key={c.name + c.email} value={c.name} />)}
            </datalist>
          </label>
          <label>
            Contact email (optional)
            <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} list="contact-emails" placeholder="name@company.com.au" />
            <datalist id="contact-emails">
              {picked?.contacts.filter((c) => c.email).map((c) => <option key={c.email} value={c.email} />)}
            </datalist>
          </label>
          <label>
            Link works for
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="short-select">
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={21}>21 days</option>
              <option value={30}>30 days</option>
            </select>
          </label>
          <button type="button" onClick={create} disabled={!customer || !contactName.trim() || creating}>
            {creating ? 'Making link...' : 'Make link'}
          </button>
        </div>
        {creating && <p className="muted small">Reading {picked?.orders ?? ''} orders and their items from Ostendo. This can take a few seconds per order.</p>}
        {createError && <p className="notice bad">{createError}</p>}
        {created && (
          <div className="created">
            <p>
              <strong>Link ready for {created.contactName}</strong> at {created.customer}, with {created.orders.length} order
              {created.orders.length === 1 ? '' : 's'}. It expires on {day(created.expiresAt)}.
            </p>
            <div className="link-box">
              <code>{linkUrl(created.token)}</code>
            </div>
            <div className="row">
              <CopyButton token={created.token} />
              {created.contactEmail && (
                <a className="button-link small-link" href={mailto(created)}>
                  Write the email
                </a>
              )}
              <a className="button-link secondary-link small-link" href={`/confirm/${created.token}`} target="_blank" rel="noreferrer">
                Preview what they see
              </a>
            </div>
            <p className="muted small">Nothing is sent automatically. Paste the link into your own email to {created.contactName}.</p>
          </div>
        )}
      </div>

      <section>
        <h2>
          Customer responses <span className="muted small">{counts('submitted')} answered, {counts('waiting')} waiting</span>
        </h2>
        <div className="row resp-filter">
          {(['all', 'submitted', 'waiting', 'expired', 'cancelled'] as const).map((f) => (
            <button key={f} type="button" className={filter === f ? 'small-btn' : 'secondary small-btn'} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : STATUS[f][0]}
            </button>
          ))}
          <button type="button" className="link" onClick={load}>
            {loading ? 'Loading...' : 'Reload'}
          </button>
        </div>
        {loadError && <p className="notice bad">{loadError}</p>}
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Contact</th>
                <th>Sent</th>
                <th>Expires</th>
                <th>Status</th>
                <th>Answered</th>
                <th className="num">Orders</th>
                <th>Changes</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => (
                <tr key={l.token} className="clickable" onClick={() => setOpen(l.token)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(l.token)}>
                  <td className="ordno">{l.customer}</td>
                  <td>{l.contactName}</td>
                  <td>{day(l.createdAt)}</td>
                  <td>{day(l.expiresAt)}</td>
                  <td><StatusPill s={l.status} /></td>
                  <td>{when(l.submittedAt)}</td>
                  <td className="num">{l.orderCount}</td>
                  <td>{l.status === 'submitted' ? (l.changes ? <span className="pill red">{l.changes} to update</span> : <span className="muted">None</span>) : ''}</td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted">{loading ? 'Loading...' : 'No links yet.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {open && <LinkDrawer token={open} today={today} onClose={() => setOpen(null)} onChanged={load} />}
    </main>
  );
}

function Answer({ r, required }: { r: ConfirmResponse['rows'][number] | undefined; required: string | null }) {
  if (!r) return <span className="muted">No answer</span>;
  if (r.answer === 'correct') return <span className="ok">✓ Date is correct</span>;
  if (r.answer === 'locked') return <span className="muted">🔒 Locked (inside 48 hours)</span>;
  if (r.answer === 'new-date')
    return (
      <span>
        <strong className="bad">New date {showDate(r.newDate ?? null)}</strong> <span className="muted">(was {showDate(required) || 'not set'})</span>
      </span>
    );
  return <strong className="bad">Date unknown</strong>;
}

function LinkDrawer({ token, today, onClose, onChanged }: { token: string; today: string; onClose: () => void; onChanged: () => void }) {
  const [link, setLink] = useState<Full | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);

  useEffect(() => {
    fetch(`/api/links/${token}`, { cache: 'no-store' })
      .then(async (res) => {
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || 'Could not load this link');
        setLink(j.link);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  async function act(method: 'PATCH' | 'DELETE') {
    setBusy(true);
    const res = await fetch(`/api/links/${token}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'PATCH' ? JSON.stringify({ action: 'cancel' }) : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || 'That did not work');
      return;
    }
    onChanged();
    onClose();
  }

  const answers = new Map((link?.response?.rows ?? []).map((r) => [r.number, r]));

  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer wide" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <h2>{link?.customer ?? 'Loading...'}</h2>
            {link && (
              <p className="muted small">
                For {link.contactName}
                {link.contactEmail && ` (${link.contactEmail})`} · sent {when(link.createdAt)} · expires {day(link.expiresAt)}
              </p>
            )}
          </div>
          <button className="secondary icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        {error && <p className="notice bad">{error}</p>}
        {link && (
          <>
            <div className="row drawer-status">
              <StatusPill s={link.status} />
              {link.response && (
                <span className="small">
                  Submitted by <strong>{link.response.name}</strong> on {when(link.response.submittedAt)}
                </span>
              )}
            </div>
            {link.status === 'submitted' && (
              <p className="notice">Update any changed dates in Ostendo yourself. This app never changes Ostendo.</p>
            )}
            <table className="lines-table resp-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>PO</th>
                  <th>Date on link</th>
                  <th>Customer&apos;s answer</th>
                </tr>
              </thead>
              <tbody>
                {link.orders.map((o) => {
                  const r = answers.get(o.number);
                  const changed = r?.answer === 'new-date' || r?.answer === 'unknown';
                  return (
                    <tr key={o.number} className={changed ? 'changed' : ''}>
                      <td className="line-code">{o.number}</td>
                      <td>{o.po}</td>
                      <td>
                        {showDate(o.required) || <span className="muted">Not set</span>}
                        {!link.response && isLocked(o.required, today) && <div className="muted small">🔒 locked now</div>}
                      </td>
                      <td>
                        {link.response ? <Answer r={r} required={o.required} /> : <span className="muted">Waiting</span>}
                        {r?.note && <div className="resp-note">“{r.note}”</div>}
                        <div className="muted small">{o.description}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="row drawer-actions">
              {link.status === 'waiting' && (
                <>
                  <CopyButton token={link.token} />
                  {link.contactEmail && (
                    <a className="button-link secondary-link small-link" href={mailto(link)}>
                      Write the email again
                    </a>
                  )}
                  <a className="button-link secondary-link small-link" href={`/confirm/${link.token}`} target="_blank" rel="noreferrer">
                    Preview
                  </a>
                  <button className="secondary small-btn" disabled={busy} onClick={() => act('PATCH')}>
                    Cancel link
                  </button>
                </>
              )}
              {link.status !== 'waiting' &&
                (sure ? (
                  <>
                    <span className="small">Delete this link and its answers for good?</span>
                    <button className="danger small-btn" disabled={busy} onClick={() => act('DELETE')}>
                      Yes, delete
                    </button>
                    <button className="secondary small-btn" onClick={() => setSure(false)}>
                      Keep it
                    </button>
                  </>
                ) : (
                  <button className="secondary small-btn" onClick={() => setSure(true)}>
                    Delete this record
                  </button>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
