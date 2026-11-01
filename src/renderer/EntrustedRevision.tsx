import { useRef, useState } from 'react';
import type { AttentionControlItem } from '../shared/attention-control';
import { formatDateTime, fromTimeInput, timeZoneLabel, toTimeInput } from './time';
import { uiError } from './ui';

/** A local draft over one exact mandate. The host owns the saved agreement. */
export function EntrustedRevision({ item, timeZone, pending, sourceName, onSave, onCancel }: {
  item: AttentionControlItem;
  timeZone: string;
  pending: boolean;
  sourceName: (source: string) => string;
  onSave: (base: AttentionControlItem, changes: { sources: string[]; until: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const [base, setBase] = useState(item);
  const [sources, setSources] = useState(item.sources.filter(source => item.availableSources.includes(source)));
  const [finite, setFinite] = useState(!!item.until);
  const [until, setUntil] = useState(toTimeInput(item.until || undefined, timeZone));
  const [problem, setProblem] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const changed = base.revision !== item.revision || base.controlVersion !== item.controlVersion;
  const options = [...new Set([...base.sourceBoundary, ...item.sourceBoundary])];
  let proposed: string | null | undefined;
  try { proposed = finite ? fromTimeInput(until, timeZone, base.until || undefined) : null; } catch { /* Preserve the exact civil draft until save. */ }
  const equal = proposed === base.until && [...sources].sort().join('\n') === [...base.sources].sort().join('\n');

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending || changed) return;
    setProblem('');
    try {
      const nextUntil = finite ? fromTimeInput(until, timeZone, base.until || undefined) : null;
      if (finite && !nextUntil) throw new Error('Choose when to stop watching this.');
      if (!sources.length) throw new Error('Keep at least one allowed source. To stop completely, cancel editing and choose Stop watching.');
      if (sources.some(source => !item.availableSources.includes(source))) throw new Error('Some sources cannot be used right now. Remove them from this scope.');
      await onSave(base, { sources, until: nextUntil || null });
    } catch (error) { setProblem(uiError(error)); }
  }

  return <form className="entrusted-revision" aria-labelledby="entrusted-revision-title" onSubmit={event => void save(event)} onKeyDown={event => {
    if (event.key === 'Escape' && !pending) { event.preventDefault(); event.stopPropagation(); onCancel(); }
  }}>
    <h3 id="entrusted-revision-title" ref={heading} tabIndex={-1}>Edit agreement</h3>
    <fieldset disabled={pending}><legend>Allowed sources</legend>
      <div className="entrusted-source-choices">{options.map(source => <label key={source}>
        <input type="checkbox" checked={sources.includes(source)} disabled={!item.availableSources.includes(source) && !sources.includes(source)}
          onChange={event => setSources(current => event.target.checked ? [...current, source] : current.filter(value => value !== source))} />
        <span>{sourceName(source)}{!item.availableSources.includes(source) && <small>Currently unavailable</small>}</span>
      </label>)}</div>
    </fieldset>
    <fieldset disabled={pending}><legend>End time</legend>
      <label className="entrusted-deadline-choice"><input type="radio" name={`attention-until-${item.id}`} checked={finite} onChange={() => setFinite(true)} />Set an end time</label>
      {finite && <div className="entrusted-deadline-input"><input type="datetime-local" step="1" aria-label="Watching end time" value={until} onChange={event => setUntil(event.target.value)} /><span>{timeZoneLabel(timeZone)}</span></div>}
      <label className="entrusted-deadline-choice"><input type="radio" name={`attention-until-${item.id}`} checked={!finite} onChange={() => setFinite(false)} />No end time</label>
      {item.maximumUntil && <p>The parent agreement ends at  {formatDateTime(item.maximumUntil, timeZone)}.</p>}
    </fieldset>
    <div className="entrusted-revision-comparison"><span>{base.until ? formatDateTime(base.until, timeZone) : 'No end time'}</span><span aria-hidden="true">→</span><strong>{proposed ? formatDateTime(proposed, timeZone) : proposed === null ? 'No end time' : 'Choose end time'}</strong></div>
    {!!item.pauseRules.length && <p className="entrusted-contract-note">Pause agreements remain in effect.</p>}
    {changed && <div className="entrusted-revision-conflict" role="alert"><p>This request has changed. Your edits remain here; review the current agreement first: {item.sources.map(sourceName).join(', ')}; {item.until ? `Until ${formatDateTime(item.until, timeZone)}` : 'No end time'}.</p>
      {item.canRevise && <button type="button" className="text-button" onClick={() => { setBase(item); setProblem(''); }}>Continue editing the current agreement</button>}</div>}
    {!item.canRevise && <p className="entrusted-problem" role="alert">This agreement cannot be edited right now. Your writing remains here.</p>}
    {problem && <p className="entrusted-problem" role="alert">{problem}</p>}
    <div className="entrusted-revision-actions"><button type="submit" className="primary-button" disabled={pending || changed || !item.canRevise || equal}>{pending ? 'Saving…' : 'Save agreement'}</button><button type="button" className="subtle-button" disabled={pending} onClick={onCancel}>Cancel</button></div>
  </form>;
}
