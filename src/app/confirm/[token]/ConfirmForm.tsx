'use client';

import { useState } from 'react';
import {
  earliestNewDate,
  isLocked,
  latestNewDate,
  RULE_TEXT,
  SALES_EMAIL,
  type Answer,
  type ConfirmOrder,
  type ConfirmResponse,
  type PublicLink,
} from '@/lib/confirmRules';
import { showDate } from '@/lib/rules';
import DatePicker from './DatePicker';

interface Draft {
  answer?: Answer;
  newDate?: string;
  note?: string;
}

const longDate = (iso: string | null) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
};

function complete(d: Draft | undefined): boolean {
  if (!d?.answer) return false;
  if (d.answer === 'new-date') return !!d.newDate;
  if (d.answer === 'unknown') return !!d.note?.trim();
  return true;
}

function Items({ o }: { o: ConfirmOrder }) {
  if (o.lines.length === 0) return null;
  return (
    <ul className="co-items">
      {o.lines.map((l, i) => (
        <li key={i}>
          <span className="co-qty">
            {l.qty ?? ''} {l.unit}
          </span>
          <span>
            {l.code && <strong>{l.code}</strong>} {l.description}
          </span>
        </li>
      ))}
    </ul>
  );
}

function OrderHead({ o }: { o: ConfirmOrder }) {
  return (
    <div className="co-head">
      <div>
        <div className="co-po">{o.po ? `Your PO: ${o.po}` : 'No PO number'}</div>
        <div className="co-ref">Plasgain order {o.number}</div>
      </div>
    </div>
  );
}

export default function ConfirmForm({ token, data }: { token: string; data: PublicLink }) {
  const today = data.today;
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [name, setName] = useState(data.contactName);
  const [understood, setUnderstood] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState<ConfirmResponse | null>(data.response);
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const min = earliestNewDate(today);
  const max = latestNewDate(today);
  const open = data.orders.filter((o) => !isLocked(o.required, today));
  const locked = data.orders.filter((o) => isLocked(o.required, today));
  const answered = open.filter((o) => complete(drafts[o.number])).length;
  const ready = answered === open.length && name.trim() !== '' && understood;

  const set = (n: string, d: Partial<Draft>) => setDrafts((prev) => ({ ...prev, [n]: { ...prev[n], ...d } }));

  async function submit() {
    setSending(true);
    setError('');
    try {
      const res = await fetch(`/api/confirm/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          understood,
          rows: open.map((o) => ({ number: o.number, ...drafts[o.number] })),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Sorry, something went wrong. Please try again.');
      setResponse(j.response);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (response) return <Submitted data={data} response={response} />;

  return (
    <>
      <div className="co-intro">
        <h1>{data.customer}</h1>
        <p>
          Please check the delivery date for each of your confirmed orders below. Tell us if a date is correct, if you
          need a new date, or if you don&apos;t know yet. Then press <strong>Submit</strong> at the bottom.
        </p>
      </div>

      <div className="rule-box" role="note">
        <div className="rule-icon" aria-hidden="true">!</div>
        <div>
          <strong>Important: the 48-hour rule</strong>
          <p>{RULE_TEXT}</p>
          <p className="small">
            Weekends don&apos;t count. For example, a Monday delivery is locked from the Thursday before. Orders already
            inside this window are shown as locked below.
          </p>
        </div>
      </div>

      <div className="co-list">
        {open.map((o) => {
          const d = drafts[o.number] ?? {};
          const past = !!o.required && o.required < today;
          return (
            <section key={o.number} className={`co-card${complete(d) ? ' done' : ''}`}>
              <OrderHead o={o} />
              {o.description && <p className="co-desc">{o.description}</p>}
              <Items o={o} />
              <div className="co-date">
                <span className="muted">Confirmed delivery date</span>
                <strong>{o.required ? longDate(o.required) : 'Not set yet'}</strong>
                {past && <span className="pill red">This date has passed</span>}
              </div>
              <div className="co-choices" role="radiogroup" aria-label={`Delivery date for ${o.po || o.number}`}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={d.answer === 'correct'}
                  className={`choice${d.answer === 'correct' ? ' on' : ''}`}
                  onClick={() => set(o.number, { answer: 'correct' })}
                  disabled={!o.required}
                  title={o.required ? undefined : 'There is no date to confirm yet'}
                >
                  <span className="choice-mark" aria-hidden="true">✓</span> Date is correct
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={d.answer === 'new-date'}
                  className={`choice${d.answer === 'new-date' ? ' on' : ''}`}
                  onClick={() => {
                    set(o.number, { answer: 'new-date' });
                    setPickerFor(o.number);
                  }}
                >
                  <span className="choice-mark" aria-hidden="true">📅</span> I need a new date
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={d.answer === 'unknown'}
                  className={`choice${d.answer === 'unknown' ? ' on' : ''}`}
                  onClick={() => set(o.number, { answer: 'unknown' })}
                >
                  <span className="choice-mark" aria-hidden="true">?</span> Date unknown
                </button>
              </div>
              {d.answer === 'new-date' && (
                <div className="co-extra">
                  <div className="row">
                    <span>New delivery date:</span>
                    <strong>{d.newDate ? longDate(d.newDate) : <span className="muted">not chosen</span>}</strong>
                    <button type="button" className="secondary small-btn" onClick={() => setPickerFor(pickerFor === o.number ? null : o.number)}>
                      {d.newDate ? 'Change' : 'Choose a date'}
                    </button>
                  </div>
                  {pickerFor === o.number && (
                    <DatePicker
                      value={d.newDate}
                      min={min}
                      max={max}
                      onPick={(v) => {
                        set(o.number, { newDate: v });
                        setPickerFor(null);
                      }}
                    />
                  )}
                  <p className="small muted">
                    Weekdays only. The earliest date you can choose is {showDate(min)}.
                  </p>
                  <label className="co-note">
                    Anything we should know? (optional)
                    <textarea maxLength={1000} rows={2} value={d.note ?? ''} onChange={(e) => set(o.number, { note: e.target.value })} />
                  </label>
                </div>
              )}
              {d.answer === 'unknown' && (
                <div className="co-extra">
                  <label className="co-note">
                    What would you like us to do with this order?
                    <textarea
                      maxLength={1000}
                      rows={3}
                      placeholder="For example: hold the order until we confirm, deliver part of it, or call me."
                      value={d.note ?? ''}
                      onChange={(e) => set(o.number, { note: e.target.value })}
                    />
                  </label>
                </div>
              )}
            </section>
          );
        })}

        {locked.length > 0 && (
          <>
            <h2 className="co-sub">Locked: inside the 48-hour window</h2>
            {locked.map((o) => (
              <section key={o.number} className="co-card locked">
                <OrderHead o={o} />
                {o.description && <p className="co-desc">{o.description}</p>}
                <Items o={o} />
                <div className="co-date">
                  <span className="muted">Confirmed delivery date</span>
                  <strong>{longDate(o.required)}</strong>
                  <span className="pill grey">🔒 Locked, can&apos;t be changed</span>
                </div>
              </section>
            ))}
          </>
        )}
        {data.orders.length === 0 && <div className="card">There are no orders to confirm on this link.</div>}
      </div>

      {data.orders.length > 0 && (
        <div className="card co-submit">
          <label className="co-name">
            Your name
            <input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
          <label className="co-check">
            <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
            <span>I understand that confirmed deliveries cannot be delayed or altered within 48 hours (2 business days) of the confirmed delivery date.</span>
          </label>
          {error && <p className="notice bad">{error}</p>}
          <div className="row co-submit-row">
            <button type="button" onClick={submit} disabled={!ready || sending}>
              {sending ? 'Submitting...' : 'Submit'}
            </button>
            <span className="muted small">
              {answered} of {open.length} orders answered
              {answered === open.length && (!name.trim() ? ' · enter your name' : !understood ? ' · tick the box above' : '')}
            </span>
          </div>
          <p className="small muted">
            You can submit once. If anything changes afterwards, email <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>.
            This link expires on {new Date(data.expiresAt).toLocaleDateString('en-AU', { timeZone: 'Australia/Melbourne', day: 'numeric', month: 'long', year: 'numeric' })}.
          </p>
        </div>
      )}
    </>
  );
}

function Submitted({ data, response }: { data: PublicLink; response: ConfirmResponse }) {
  const byNo = new Map(data.orders.map((o) => [o.number, o]));
  return (
    <>
      <div className="card co-thanks">
        <div className="thanks-icon" aria-hidden="true">✓</div>
        <div>
          <h1>Thank you, your answers have been sent</h1>
          <p>
            Submitted by {response.name} on{' '}
            {new Date(response.submittedAt).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', dateStyle: 'long', timeStyle: 'short' })}.
          </p>
          <p>
            <strong>Need to change anything?</strong> This page is now locked. Please email{' '}
            <a href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent(`Delivery date change - ${data.customer}`)}`}>{SALES_EMAIL}</a>.
          </p>
          <p className="small muted">{RULE_TEXT}</p>
        </div>
      </div>
      <h2 className="co-sub">Your answers</h2>
      <div className="co-list">
        {response.rows.map((r) => {
          const o = byNo.get(r.number);
          if (!o) return null;
          return (
            <section key={r.number} className="co-card compact">
              <OrderHead o={o} />
              {o.description && <p className="co-desc">{o.description}</p>}
              <div className="co-answer">
                {r.answer === 'correct' && <>✓ Date is correct: <strong>{showDate(o.required)}</strong></>}
                {r.answer === 'locked' && <>🔒 Locked (inside 48 hours): <strong>{showDate(o.required)}</strong></>}
                {r.answer === 'new-date' && (
                  <>
                    📅 New date requested: <strong>{showDate(r.newDate ?? null)}</strong>{' '}
                    <span className="muted">(was {showDate(o.required) || 'not set'})</span>
                  </>
                )}
                {r.answer === 'unknown' && <>? Date unknown</>}
              </div>
              {r.note && <p className="co-desc">“{r.note}”</p>}
            </section>
          );
        })}
      </div>
    </>
  );
}
