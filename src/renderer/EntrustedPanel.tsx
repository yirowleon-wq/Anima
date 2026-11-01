import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, CalendarDays, ChevronDown, ChevronRight, MessageCircle, Pause, RotateCcw, Sprout } from 'lucide-react';
import { attentionSourceName as sourceName, type AttentionControlItem } from '../shared/attention-control';
import type { State } from '../shared/types';
import type { PreparationView } from '../shared/presentation';
import { PreparationShelf } from './LifePanels';
import { DEFAULT_TIME_ZONE, formatDateTime, timeZoneLabel } from './time';
import { uiError } from './ui';
import './entrusted-detail.css';
import { EntrustedRevision } from './EntrustedRevision';

const api = window.anima;
const stateNames: Record<AttentionControlItem['status'], string> = {
  active: 'Keeping an eye on this', paused: 'Put aside for now', ended: 'No longer watching this',
  expired: 'This agreement has ended', unavailable: 'Paused until the conditions are available',
};
function stateDescription(item: AttentionControlItem) {
  if (item.status === 'ended') return 'This will no longer be checked proactively. We can make a new agreement when you want.';
  if (item.status === 'expired') return 'The agreed end time has arrived. We can discuss it again if needed.';
  if (item.unavailableReason === 'source_permission') return 'The sources needed for this are unavailable. Further checking has paused.';
  if (item.unavailableReason === 'permission_retracted') return 'Permission to use the original sources was withdrawn. Make a new agreement before watching this again.';
  if (item.unavailableReason === 'parent_inactive') return 'The related agreement has paused or ended, so this has paused too.';
  if (item.status === 'paused') return 'This is put aside. You can continue from here when you want.';
  return 'New changes will be reviewed within the scope you agreed to.';
}

export function EntrustedPanel({ onResume, onChanged, preparations, onState, onContinue, timeZone = DEFAULT_TIME_ZONE }: { onResume: (sessionId: string) => void; onChanged: () => void; preparations: PreparationView[]; onState: (state: State) => void; onContinue: (text: string) => void; timeZone?: string }) {
  const [items, setItems] = useState<AttentionControlItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pastOpen, setPastOpen] = useState(false);
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const zone = timeZone;
  const generation = useRef(0);
  const mounted = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async (next?: string, retain?: AttentionControlItem) => {
    const request = ++generation.current;
    setLoading(true); setError('');
    try {
      const result = await api.attentionList({ ...(next ? { cursor: next } : {}), limit: 30 });
      if (!mounted.current || generation.current !== request) return;
      const incoming = retain && !result.items.some(item => item.id === retain.id) ? [...result.items, retain] : result.items;
      setItems(current => next ? [...current.filter(item => !incoming.some(added => added.id === item.id)), ...incoming] : incoming);
      setCursor(result.nextCursor); setLoaded(true);
      setSelectedId(current => current && (next || incoming.some(item => item.id === current)) ? current : (result.items.find(item => item.status === 'active') || result.items[0])?.id || '');
    } catch (problem) {
      if (mounted.current && generation.current === request) setError(uiError(problem));
    } finally {
      if (mounted.current && generation.current === request) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; generation.current++; };
  }, [load]);

  useEffect(() => {
    if (pending) return;
    const now = Date.now();
    const nextBoundary = items.flatMap(item => ['active', 'paused', 'unavailable'].includes(item.status)
      ? [item.until, ...item.pauseRules.map(rule => rule.until)] : [])
      .filter((at): at is string => !!at).map(at => Date.parse(at)).filter(at => Number.isFinite(at) && at > now).sort((a, b) => a - b)[0];
    if (!nextBoundary) return;
    const timer = window.setTimeout(() => void load(), Math.min(nextBoundary - now + 150, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [items, pending, load]);

  const selected = items.find(item => item.id === selectedId);
  const ongoing = items.filter(item => ['active', 'unavailable'].includes(item.status));
  const past = items.filter(item => !['active', 'unavailable'].includes(item.status));
  const selectedInPast = !!selected && past.some(item => item.id === selected.id);
  const otherPreparations = preparations.filter(item => !items.some(focus => focus.id === item.matterId));
  const relatedPreparations = selected?.status === 'active' ? preparations.filter(item => item.matterId === selected.id) : [];
  const when = (value: string) => formatDateTime(value, zone, { year: 'numeric' });

  async function revise(base: AttentionControlItem, changes: { sources: string[]; until: string | null }) {
    if (pending) return;
    setPending(base.id); setError(''); setNotice('');
    try {
      const updated = await api.attentionChange({ id: base.id, expectedRevision: base.revision, expectedControlVersion: base.controlVersion, operation: 'revise', changes });
      if (!mounted.current) return;
      setItems(current => current.map(item => item.id === updated.id ? updated : item));
      setEditingId(''); setNotice('This will follow the updated agreement.'); onChanged();
      await load(undefined, updated);
      requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
    } catch (problem) {
      await load();
      throw problem;
    } finally { if (mounted.current) setPending(''); }
  }

  async function change(operation: 'pause' | 'resume' | 'stop', rule?: AttentionControlItem['pauseRules'][number]) {
    if (!selected || pending) return;
    const target = selected;
    setPending(target.id); setError(''); setNotice('');
    try {
      const updated = await api.attentionChange({ id: target.id, expectedRevision: target.revision,
        expectedControlVersion: target.controlVersion, operation,
        ...(rule ? { ruleId: rule.id, ruleRevision: rule.revision } : {}) });
      if (!mounted.current) return;
      setItems(current => current.map(item => item.id === updated.id ? updated : item));
      if (!['active', 'unavailable'].includes(updated.status)) setPastOpen(true);
      setNotice(operation === 'pause' ? 'Put aside until you want to continue.' : operation === 'stop' ? 'This will no longer be watched.' : updated.status === 'active' ? 'Continuing under the original agreement.' : 'This pause has been lifted. Other agreements remain in effect.');
      onChanged();
      await load(undefined, updated);
      requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
    } catch (problem) {
      if (mounted.current) {
        const reason = uiError(problem);
        // Read back the current contract after a conflict; never retry a mutation automatically.
        await load();
        if (mounted.current) setError(reason);
      }
    } finally { if (mounted.current) setPending(''); }
  }

  function choice(item: AttentionControlItem) {
    return <button key={item.id} type="button" className="entrusted-choice" aria-pressed={selectedId === item.id}
      disabled={!!pending || !!editingId && editingId !== item.id} onClick={() => { setSelectedId(item.id); setNotice(''); setError(''); setMobileListOpen(false); requestAnimationFrame(() => heading.current?.focus({ preventScroll: true })); }}>
      <span className="entrusted-choice-mark" aria-hidden="true">{item.status === 'paused' ? <Pause size={20} /> : item.status === 'expired' || item.status === 'ended' ? <CalendarDays size={20} /> : <Sprout size={22} />}</span>
      <span className="entrusted-choice-copy"><strong>{item.title}</strong><small>{item.status === 'active' ? (item.until ? `Until ${formatDateTime(item.until, zone)}` : 'Under our agreement') : stateNames[item.status]}</small></span>
      <ChevronRight size={15} aria-hidden="true" />
    </button>;
  }

  if (!loaded && loading) return <div className="entrusted-opening" role="status"><Sprout size={24} strokeWidth={1.4} /><p>Opening your ongoing requests…</p></div>;
  if (!loaded) return <section className="entrusted-start" aria-label="Your ongoing requests"><span className="entrusted-state-mark" aria-hidden="true"><BookOpen size={28} strokeWidth={1.35} /></span><div><h3>These agreements could not be opened</h3><p role="alert">{error}</p><button type="button" className="subtle-button" onClick={() => void load()}>Review</button></div></section>;
  if (!items.length) return <><section className="entrusted-start" aria-label="Your ongoing requests">
    <span className="entrusted-state-mark" aria-hidden="true"><Sprout size={30} strokeWidth={1.35} /></span>
    <div><h3>Is there something you would like me to watch for?</h3><p>Tell me in chat what to watch for. We can agree when to stop and how to let you know.</p></div>
    {error && <div role="alert" className="entrusted-problem"><p>{error}</p><button type="button" className="text-button" disabled={loading} onClick={() => void load()}><RotateCcw size={15} />Look again</button></div>}
  </section>{!!otherPreparations.length && <PreparationShelf inline items={otherPreparations} timeZone={zone} onState={onState} onContinue={onContinue} />}</>;

  return <><section className="entrusted-workspace" aria-label="Ongoing requests" aria-busy={!!pending}>
    <nav className={`entrusted-list ${mobileListOpen ? 'is-open' : ''}`} aria-label="Select an ongoing request">
      <div className="entrusted-list-heading"><span className="entrusted-list-label">Things to watch for</span><button type="button" className="entrusted-list-toggle" aria-expanded={mobileListOpen} aria-controls="entrusted-choices" onClick={() => setMobileListOpen(value => !value)}>Choose another request<ChevronDown size={16} /></button><button type="button" className="icon-button" aria-label="Review ongoing requests" title="Review" disabled={loading || !!pending || !!editingId} onClick={() => void load()}><RotateCcw size={15} /></button></div>
      <div className="entrusted-choices" id="entrusted-choices"><div className="entrusted-current-list">{ongoing.map(choice)}</div>
      {!!past.length && <details className="entrusted-past" open={pastOpen || selectedInPast} onToggle={event => setPastOpen(event.currentTarget.open)}>
        <summary><ChevronDown size={16} />Agreements put aside<span>{past.length}</span></summary>
        <div>{past.map(choice)}</div>
      </details>}
      {cursor && <button type="button" className="text-button entrusted-more" disabled={loading || !!pending} onClick={() => void load(cursor)}>{loading ? 'Looking through…' : 'View earlier requests'}</button>}</div>
    </nav>
    {selected && <div className="entrusted-detail" aria-labelledby="entrusted-detail-title">
      <header className="entrusted-detail-heading"><h2 id="entrusted-detail-title" ref={heading} tabIndex={-1}>{selected.title}</h2>
        <p><CalendarDays size={16} aria-hidden="true" />{selected.until ? `Until ${when(selected.until)}` : 'No agreed end date'}<span aria-hidden="true"> · </span>{selected.channel === 'in_app' ? 'Tell you in chat' : 'May also use a system notification'}</p>
      </header>
      <div className="entrusted-detail-paper">
        <div className="entrusted-state-copy"><span className="entrusted-state-mark" aria-hidden="true">{selected.status === 'paused' ? <Pause size={28} strokeWidth={1.4} /> : selected.status === 'expired' || selected.status === 'ended' ? <CalendarDays size={28} strokeWidth={1.4} /> : <Sprout size={29} strokeWidth={1.4} />}</span>
          <div><h3>{relatedPreparations.length ? 'Something to look at together' : stateNames[selected.status]}</h3><p>{relatedPreparations.length ? 'The material prepared for this is below. Open it whenever you want.' : stateDescription(selected)}</p></div>
        </div>
        {!!relatedPreparations.length && <div className="entrusted-materials"><PreparationShelf key={selected.id} inline items={relatedPreparations} timeZone={zone} onState={onState} onContinue={onContinue} /></div>}
        {editingId === selected.id ? <EntrustedRevision item={selected} timeZone={zone} pending={!!pending} sourceName={sourceName} onSave={revise} onCancel={() => { setEditingId(''); requestAnimationFrame(() => heading.current?.focus({ preventScroll: true })); }} /> : <><div className="entrusted-agreement-edit">{selected.canRevise && <button type="button" className="text-button" disabled={!!pending} onClick={() => { setEditingId(selected.id); setNotice(''); setError(''); requestAnimationFrame(() => document.getElementById('entrusted-revision-title')?.focus({ preventScroll: true })); }}>Edit agreement</button>}</div><details className="entrusted-agreement" open>
          <summary>Scope and agreement<ChevronDown size={16} /></summary>
          <dl><div><dt><BookOpen size={19} />Allowed sources</dt><dd>{selected.sources.length ? [...new Set(selected.sources.map(sourceName))].join(', ') : 'No source scope is available yet'}</dd></div>
            <div><dt><CalendarDays size={19} />End time</dt><dd>{selected.until ? <><time dateTime={selected.until}>{when(selected.until)}</time><small>{timeZoneLabel(zone)}</small></> : 'No agreed end date; stop at any time'}</dd></div>
            <div><dt><MessageCircle size={19} />How to reach you</dt><dd>{selected.channel === 'in_app' ? 'In chat' : 'Here, with optional system notifications'}</dd></div></dl>
          {selected.status === 'paused' && selected.pauseRules.some(rule => rule.until) && <p className="entrusted-pause-until">This pause agreement: {selected.pauseRules.filter(rule => rule.until).map(rule => `Until ${when(rule.until!)}`).join('; ')}.</p>}
        </details></>}
        <div className="entrusted-detail-actions">
          {selected.canPause && <button type="button" className="primary-button" disabled={!!pending} onClick={() => void change('pause')}>Put aside for now</button>}
          {selected.pauseRules.filter(rule => rule.resumable).map((rule, index, resumable) => <button key={rule.id} type="button" className="primary-button" disabled={!!pending} onClick={() => void change('resume', rule)}>{resumable.length === 1 ? 'Continue watching' : rule.until ? `Resume from pause ending ${formatDateTime(rule.until, zone)}` : `Resume pause ${index + 1}`}</button>)}
          {selected.sessionId && <button type="button" className="subtle-button" disabled={!!pending} onClick={() => onResume(selected.sessionId!)}>{selected.status === 'expired' || selected.status === 'ended' ? 'Discuss this again' : 'Return to that conversation'}</button>}
          {selected.canStop && <button type="button" className="text-button entrusted-stop" disabled={!!pending} onClick={() => void change('stop')}>Stop watching</button>}
        </div>
        {selected.status === 'paused' && !selected.pauseRules.some(rule => rule.resumable) && !selected.unavailableReason && <p className="entrusted-contract-note">Other pause agreements remain. Tell me in chat if you want to change the arrangement.</p>}
        <details className="entrusted-about"><summary>About this request</summary><p>Return to that conversation to change what is watched or how you are notified. Pausing or stopping also pauses derived requests; independent agreements remain in effect.</p><p>Watching continues only while Anima is running and the allowed sources remain available.</p></details>
        {notice && <p className="entrusted-notice" role="status">{notice}</p>}
        {error && <p className="entrusted-problem" role="alert">{error}</p>}
      </div>
    </div>}
  </section>{!!otherPreparations.length && <div className="entrusted-other-materials"><PreparationShelf inline items={otherPreparations} timeZone={zone} onState={onState} onContinue={onContinue} /></div>}</>;
}
