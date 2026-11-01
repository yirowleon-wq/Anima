import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { CalendarArrowUp, Check, ChevronDown, X } from 'lucide-react';
import type { CalendarExportResult } from '../shared/calendar-export';
import { fromTimeInput, timeZoneLabel } from './time';
import { uiError } from './ui';

function nextDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** The native picker writes a finite snapshot; opening this sheet does not read an account. */
export function CalendarHandoff({ date, timeZone }: { date: string; timeZone: string }) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const live = useRef(true);
  const returnAfterSave = useRef(false);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(date);
  const [through, setThrough] = useState(() => nextDate(date, 6));
  const [includeDetails, setIncludeDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CalendarExportResult>();
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    if (!open && !busy && returnAfterSave.current) { returnAfterSave.current = false; trigger.current?.focus(); }
  }, [open, busy]);
  function close(returnFocus = false) {
    if (busy) return;
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }
  useEffect(() => { if (open) firstField.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!busy && !root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        if (!busy) { setOpen(false); trigger.current?.focus(); }
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); };
  }, [open, busy]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(''); setResult(undefined);
    try {
      if (!from || !through || from > through) throw new Error('Choose start and end dates to export these events.');
      const start = fromTimeInput(`${from}T00:00`, timeZone)!;
      const end = fromTimeInput(`${nextDate(through, 1)}T00:00`, timeZone)!;
      if (Date.parse(end) - Date.parse(start) > 366 * 86400000) throw new Error('Export up to one year at a time. Choose a shorter date range.');
      setBusy(true);
      const response = await window.anima.exportCalendar({ from: start, to: end, timeZone, includeDetails });
      if (!live.current) return;
      if (response.saved) {
        returnAfterSave.current = true; setResult(response); setOpen(false);
      } else if (response.omitted || response.reasons.length) {
        setError(response.reasons.join(' '));
      }
    } catch (problem) { if (live.current) setError(uiError(problem)); }
    finally { if (live.current) setBusy(false); }
  }
  return <div className="calendar-handoff" ref={root}>
    <button ref={trigger} type="button" className="text-button calendar-handoff-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={id} disabled={busy} onClick={() => {
      if (open) { close(); return; }
      setFrom(date); setThrough(nextDate(date, 6)); setError(''); setResult(undefined); setOpen(true);
    }}><CalendarArrowUp size={16} />Export to calendar<ChevronDown size={13} /></button>
    {open && <section className="calendar-handoff-sheet" role="dialog" aria-modal="false" aria-labelledby={`${id}-title`} id={id}>
      <div className="calendar-handoff-heading"><h2 id={`${id}-title`}>Take your agenda with you</h2><button type="button" className="icon-button" aria-label="Close calendar export" disabled={busy} onClick={() => close(true)}><X size={17} /></button></div>
      <p>Choose dates to export your saved events to your usual calendar.</p>
      <form onSubmit={event => void save(event)}>
        <div className="calendar-handoff-dates">
          <label>From<input ref={firstField} type="date" aria-label="Calendar export start date" value={from} onChange={event => setFrom(event.target.value)} required disabled={busy} /></label>
          <label>Through<input type="date" aria-label="Calendar export end date" value={through} min={from || undefined} onChange={event => setThrough(event.target.value)} required disabled={busy} /></label>
        </div>
        <small className="calendar-handoff-zone">{timeZoneLabel(timeZone)} · End date included</small>
        <label className="calendar-handoff-details"><input type="checkbox" checked={includeDetails} onChange={event => setIncludeDetails(event.target.checked)} disabled={busy} />Include my notes</label>
        <p className="calendar-handoff-copy">This is a copy of the current agenda. Export again after making changes.</p>
        {error && <p className="calendar-handoff-error" role="alert">{error}</p>}
        <div className="calendar-handoff-actions"><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Choose where to save…' : 'Save calendar file'}</button><button type="button" className="text-button" disabled={busy} onClick={() => close(true)}>Cancel export</button></div>
      </form>
    </section>}
    {result?.saved && <div className="calendar-handoff-result" role="status"><Check size={16} /><div><p>Calendar file saved. Events:  {result.count} events.</p>{result.omitted > 0 && <small>{result.reasons.join(' ') || `${result.omitted} events have no confirmed time and were omitted.`}</small>}</div><button type="button" className="icon-button" aria-label="Dismiss calendar file notice" onClick={() => setResult(undefined)}><X size={14} /></button></div>}
  </div>;
}
