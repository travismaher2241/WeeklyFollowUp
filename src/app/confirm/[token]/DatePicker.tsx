'use client';

import { useState } from 'react';
import { isBusinessDay } from '@/lib/confirmRules';

// A month calendar where only weekdays between min and max can be picked.
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export default function DatePicker({ value, min, max, onPick }: { value?: string; min: string; max: string; onPick: (v: string) => void }) {
  const start = value ?? min;
  const [ym, setYm] = useState(() => ({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 }));
  const first = new Date(Date.UTC(ym.y, ym.m, 1));
  const days = new Date(Date.UTC(ym.y, ym.m + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => iso(ym.y, ym.m, i + 1))];
  const monthKey = (y: number, m: number) => iso(y, m, 1).slice(0, 7);
  const canPrev = monthKey(ym.y, ym.m) > min.slice(0, 7);
  const canNext = monthKey(ym.y, ym.m) < max.slice(0, 7);
  const move = (n: number) => setYm(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));

  return (
    <div className="picker">
      <div className="picker-head">
        <button type="button" className="secondary small-btn" onClick={() => move(-1)} disabled={!canPrev} aria-label="Previous month">‹</button>
        <strong>{first.toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</strong>
        <button type="button" className="secondary small-btn" onClick={() => move(1)} disabled={!canNext} aria-label="Next month">›</button>
      </div>
      <div className="picker-grid">
        {WEEK.map((w) => (
          <div key={w} className="picker-dow">{w}</div>
        ))}
        {cells.map((c, i) =>
          c === null ? (
            <div key={`x${i}`} />
          ) : (
            <button
              key={c}
              type="button"
              className={`picker-day${c === value ? ' on' : ''}`}
              disabled={!isBusinessDay(c) || c < min || c > max}
              onClick={() => onPick(c)}
              aria-label={c}
            >
              {Number(c.slice(8))}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
