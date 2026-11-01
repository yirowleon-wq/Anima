import { useState } from 'react';
import { ArrowUpRight, Check, ChevronRight, LoaderCircle } from 'lucide-react';
import type { Action, Bridge } from '../shared/types';
import { formatDateTime, timeZoneLabel } from './time';
import { uiError } from './ui';
import './planning-offer.css';

export function PlanningOfferCard({ action, effect, disabled, onSave, onView, onRefresh }: {
  action: Action;
  effect: Awaited<ReturnType<Bridge['actionState']>> | undefined;
  disabled: boolean;
  onSave: (item: Action) => Promise<{ ok: boolean; error?: string }>;
  onView: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const offer = effect?.action?.planningOffer || action.planningOffer!;
  const progress = effect?.planningOffer;
  const titles = [...new Set(offer.units.filter(unit => unit.kind === 'work').map(unit => unit.arguments.title))];
  const ready = progress?.status === 'ready' || progress?.status === 'partially_saved';
  const saved = progress?.status === 'saved';
  const clock = (at: string, zone: string) => formatDateTime(at, zone, { month: undefined, day: undefined });
  async function accept() {
    if (saving || !ready) return;
    setSaving(true); setError('');
    try { const result = await onSave(action); if (!result.ok) setError(result.error || 'This save has not completed.'); }
    catch (cause) { setError(uiError(cause, { operation: 'save' })); }
    finally { try { await onRefresh(); } finally { setSaving(false); } }
  }
  return <section className={`action-card planning-offer${saved ? ' is-saved' : ''}`} aria-label="Complete plan">
    <div className="action-eyebrow">{saved ? <Check size={14} aria-hidden="true" /> : <span className="status-dot suggestion" aria-hidden="true" />}
      {saved ? 'This plan is saved' : progress?.saved ? `Saved ${progress.saved} / ${progress.total} blocks` : 'This version of the plan'}</div>
    <h3>{titles.join(' · ')}</h3>
    <ol className="planning-offer-units">
      {offer.units.map(unit => {
        const args = unit.arguments, zone = args.timeZone;
        const end = new Date(Date.parse(args.startsAt) + args.durationMinutes * 60000).toISOString();
        return <li key={unit.blockId} className={`planning-offer-${unit.kind}`}>
          <div className="planning-offer-time"><span>{formatDateTime(args.startsAt, zone, { hour: undefined, minute: undefined })}</span>
            <time>{clock(args.startsAt, zone)} — {clock(end, zone)}</time></div>
          <div className="planning-offer-content"><strong>{args.title}</strong>
            {unit.work ? <p>{unit.work.minutes}  min{unit.work.setupMinutes || unit.work.cleanupMinutes ? 'Work' : ''}
              {unit.work.setupMinutes > 0 ? ` · Preparation ${unit.work.setupMinutes}  min` : ''}
              {unit.work.cleanupMinutes > 0 ? ` · Cleanup ${unit.work.cleanupMinutes}  min` : ''}</p>
              : <p>{args.durationMinutes}  min{args.detail ? ` · ${args.detail}` : ''}</p>}
          </div>
        </li>;
      })}
    </ol>
    <div className="planning-offer-footer"><small>{timeZoneLabel(offer.units[0].arguments.timeZone)}</small>
      <div className="action-buttons">
        {ready && <button className="primary-button" disabled={disabled || saving} onClick={() => void accept()}>
          {saving ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <ArrowUpRight size={15} aria-hidden="true" />}
          {saving ? 'Saving plan…' : progress?.saved ? 'Accept remaining events' : 'Accept this plan'}
        </button>}
        {(saved || !!progress?.saved) && <button className="text-button" onClick={onView}>View event<ChevronRight size={14} /></button>}
      </div>
    </div>
    {!progress && <p className="planning-offer-status" aria-live="polite">{effect === undefined ? 'Reviewing this plan…' : 'The current state of this plan could not be read.'}</p>}
    {progress?.status === 'recompute_required' && <div className="planning-offer-status">
      <p>{progress.saved ? 'Saved events remain. The rest needs to be discussed again.' : 'Times or events have changed. This version needs a new trial arrangement.'}</p>
      {progress.reason && <details><summary>View changes</summary><p>{progress.reason}</p></details>}
    </div>}
    {progress?.status === 'unknown' && <p className="planning-offer-status">{progress.reason}</p>}
    {progress?.status === 'stopped' && <p className="planning-offer-status">This proposal has been put away.</p>}
    {error && <p className="inline-problem" role="alert">{error}</p>}
  </section>;
}
