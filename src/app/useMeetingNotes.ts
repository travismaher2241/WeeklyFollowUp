'use client';
// Meeting notes on the client. Uses the shared database when it is set up,
// otherwise keeps notes in this browser. Never touches Ostendo.
import { useCallback, useEffect, useRef, useState } from 'react';

export interface MeetingNote {
  number: string;
  note: string;
  addedAt: string;
  updatedAt: string;
}
export type NotesMode = 'loading' | 'shared' | 'local' | 'error';

const LOCAL_KEY = 'weekly-follow-up:meeting-notes:v1';

function readLocal(): Record<string, MeetingNote> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
  } catch {
    return {};
  }
}
function writeLocal(n: Record<string, MeetingNote>) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(n));
  } catch {
    // storage blocked: notes last until the page is closed
  }
}

export function useMeetingNotes() {
  const [notes, setNotes] = useState<Record<string, MeetingNote>>({});
  const [mode, setMode] = useState<NotesMode>('loading');
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const modeRef = useRef<NotesMode>('loading');

  useEffect(() => {
    fetch('/api/notes', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: { mode: NotesMode; notes: Record<string, MeetingNote> }) => {
        const m = j.mode === 'shared' ? 'shared' : j.mode === 'error' ? 'error' : 'local';
        modeRef.current = m;
        setMode(m);
        setNotes(m === 'shared' ? j.notes : readLocal());
      })
      .catch(() => {
        modeRef.current = 'error';
        setMode('error');
      });
  }, []);

  const send = useCallback(async (body: object, method = 'POST') => {
    setSaving('saving');
    try {
      const r = await fetch('/api/notes', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'POST' ? JSON.stringify(body) : undefined,
      });
      setSaving(r.ok ? 'saved' : 'failed');
    } catch {
      setSaving('failed');
    }
  }, []);

  const update = useCallback(
    (fn: (prev: Record<string, MeetingNote>) => Record<string, MeetingNote>) => {
      setNotes((prev) => {
        const next = fn(prev);
        if (modeRef.current === 'local') writeLocal(next);
        return next;
      });
    },
    [],
  );

  const toggle = useCallback(
    (number: string, on: boolean) => {
      const now = new Date().toISOString();
      const entry: MeetingNote = { number, note: '', addedAt: now, updatedAt: now };
      update((prev) => {
        const next = { ...prev };
        if (on) next[number] = prev[number] ?? entry;
        else delete next[number];
        return next;
      });
      if (modeRef.current === 'shared') send(on ? { number, note: '', addedAt: now, selected: true } : { number, selected: false });
    },
    [send, update],
  );

  const setNote = useCallback(
    (number: string, note: string) => {
      const now = new Date().toISOString();
      let addedAt = now;
      update((prev) => {
        addedAt = prev[number]?.addedAt ?? now;
        return { ...prev, [number]: { number, note, addedAt, updatedAt: now } };
      });
      if (modeRef.current === 'shared') {
        clearTimeout(timers.current[number]);
        setSaving('saving');
        timers.current[number] = setTimeout(() => send({ number, note, addedAt, selected: true }), 700);
      }
    },
    [send, update],
  );

  const clearAll = useCallback(() => {
    update(() => ({}));
    if (modeRef.current === 'shared') send({}, 'DELETE');
  }, [send, update]);

  return { notes, mode, saving, toggle, setNote, clearAll };
}
