import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, ChevronDown, FileText, LoaderCircle, MoreHorizontal, X } from 'lucide-react';
import type { CompanionSceneProjection } from '../../shared/companion-session';
import type { CompanionFollowupReference, CompanionSourceTarget } from '../../shared/companion-source';
import type { LocalSearchLocator } from '../../shared/search';
import { RichText } from '../RichText';
import { uiError } from '../ui';
import { openCompanionSource, type CompanionOpenedSource } from './companion-session-source';
import './companion-session.css';

export interface CompanionSessionViewProps {
  projection: CompanionSceneProjection;
  /** Prepare normal conversation text. The parent retains the exact module
   * focus; this view never invokes a tool or changes the working record. */
  onContinue: (text: string, projection: CompanionSceneProjection, reference: CompanionFollowupReference) => void;
  onOpenDocument?: (locator: Extract<LocalSearchLocator, { kind: 'material' }>) => void;
  /** Real current UI intent, never inferred from a word in the transcript. */
  isResuming?: boolean;
  boundaryKey?: string;
  disabled?: boolean;
}

const helpNames: Record<CompanionSceneProjection['helpMode'], string> = {
  listen: 'Listen first', organize: 'Organize together', hint: 'A little hint', do: 'Help directly',
};
const stateNames: Record<CompanionSceneProjection['state'], string> = {
  active: 'Continue together', held: 'Keep on this device', finished: 'Keep this part', stopped: 'Put this aside',
};

/** A small continuation on the original discussion paper, not a new task or
 * timer. Every action returns to the ordinary composer with its owner focus. */
export function CompanionSessionView({ projection, onContinue, onOpenDocument, isResuming = false, boundaryKey,
  disabled = false }: CompanionSessionViewProps) {
  const headingId = useId(), sourceId = useId(), point = projection.returnPoint.trim();
  const explanation = projection.workingExplanation.trim();
  const obstacle = projection.currentObstacle?.trim();
  const next = projection.nextStep?.trim();
  const closed = projection.state === 'finished' || projection.state === 'stopped';
  const canChange = projection.controls.canFinish || projection.controls.canStop;
  const [readingTarget, setReadingTarget] = useState<CompanionSourceTarget>();
  const [original, setOriginal] = useState<CompanionOpenedSource>();
  const [opening, setOpening] = useState(false), [sourceError, setSourceError] = useState('');
  const request = useRef(0), sourcePanel = useRef<HTMLElement>(null), originalButton = useRef<HTMLButtonElement | undefined>(undefined);
  const seenBoundary = useRef<string | undefined>(undefined);
  const resetReading = () => { request.current++; setReadingTarget(undefined); setOriginal(undefined); setOpening(false); setSourceError(''); };
  useEffect(() => {
    resetReading();
    return () => { request.current++; };
  }, [projection.id, projection.revision, boundaryKey]);
  useEffect(() => window.anima.onEvent(event => {
    if (event.type !== 'state') return;
    const next = `${event.state.privacyEpoch}:${event.state.policyRevision}:${event.state.presentation?.mode || 'private'}`;
    if (seenBoundary.current === undefined || seenBoundary.current !== next || event.state.presentation?.mode === 'public') resetReading();
    seenBoundary.current = next;
  }), []);
  const continueWith = (text: string, target?: CompanionSourceTarget) => onContinue(text, projection, {
    kind: 'co_work', id: projection.id, revision: projection.revision, matterId: projection.matterId,
    ...(projection.historySource ? { snapshot: projection.historySource } : {}),
    ...(target ? { target } : {}),
  });
  const sourceSelected = (kind: CompanionSourceTarget['kind'], index: number) => readingTarget?.kind === kind && readingTarget.index === index;
  async function openSource(target: CompanionSourceTarget, trigger?: HTMLButtonElement) {
    const current = ++request.current;
    if (trigger) originalButton.current = trigger;
    setReadingTarget(target); setOriginal(undefined); setOpening(true); setSourceError('');
    requestAnimationFrame(() => { if (current === request.current) sourcePanel.current?.focus({ preventScroll: true }); });
    try {
      const value = await openCompanionSource(window.anima, { id: projection.id, revision: projection.revision,
        matterId: projection.matterId, target, ...(projection.historySource ? { snapshot: projection.historySource } : {}) });
      if (current === request.current) setOriginal(value);
    } catch (error) { if (current === request.current) setSourceError(uiError(error)); }
    finally { if (current === request.current) setOpening(false); }
  }
  function closeSource() { resetReading(); originalButton.current?.focus({ preventScroll: true }); }
  return <section className="companion-session" aria-labelledby={headingId}
    data-companion-id={projection.id} data-companion-state={projection.state} data-resuming={isResuming || undefined}>
    <header className="companion-session-heading">
      <div className="companion-session-heading-copy">
        <h4 id={headingId}>{stateNames[projection.state]}</h4>
        {!closed && <span className="companion-session-help">{helpNames[projection.helpMode]}</span>}
      </div>
      {canChange && <details className="companion-session-more"
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false; }}
        onKeyDown={event => {
          if (event.key !== 'Escape') return;
          event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false;
          event.currentTarget.querySelector('summary')?.focus();
        }}>
        <summary aria-label="More shared work options"><MoreHorizontal size={17} aria-hidden="true" /></summary>
        <div>
          {projection.controls.canFinish && <button type="button" disabled={disabled}
            onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open');
              continueWith('Keep this part and finish this shared work session.'); }}>Keep this part</button>}
          {projection.controls.canStop && <button type="button" disabled={disabled}
            onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open');
              continueWith('Stop this session and leave the earlier material at its original location.'); }}>Stop this session</button>}
        </div>
      </details>}
    </header>

    <div className={`companion-session-desk${readingTarget ? ' is-reading' : ''}`}>
    <div className="companion-session-working">
    {explanation && explanation !== point && <div className="companion-session-context"><RichText text={explanation} /></div>}
    {obstacle && obstacle !== explanation && obstacle !== point
      && <div className="companion-session-obstacle"><RichText text={obstacle} /></div>}
    <blockquote className="companion-session-return"><RichText text={point} /></blockquote>
    {next && next !== point && next !== explanation && next !== obstacle
      && <div className="companion-session-next"><RichText text={next} /></div>}

    {projection.materials.length > 0 && <details className="companion-session-materials">
      <summary>Original material<ChevronDown size={14} aria-hidden="true" /></summary>
      <ul>{projection.materials.map((material, index) => <li key={`${material.kind}:${index}`}>
        <button type="button" aria-expanded={sourceSelected('material', index)} aria-controls={sourceId}
          onClick={event => void openSource({ kind: 'material', index }, event.currentTarget)}>
          <FileText size={16} aria-hidden="true" /><span>{material.label}</span><ArrowUpRight size={14} aria-hidden="true" />
        </button>
      </li>)}</ul>
    </details>}

    {(projection.attempts.length > 0 || projection.learningProcessRefs.length > 0) && <details className="companion-session-attempts">
      <summary>Earlier attempts<ChevronDown size={14} aria-hidden="true" /></summary>
      <div>
        {projection.attempts.map((attempt, index) => <button type="button" key={`${attempt.source.eventId}:${attempt.source.start}:${attempt.source.end}`}
          aria-expanded={sourceSelected('attempt', index)} aria-controls={sourceId}
          onClick={event => void openSource({ kind: 'attempt', index }, event.currentTarget)}>
          <BookOpen size={15} aria-hidden="true" />{projection.attempts.length === 1 ? 'Review that step' : `Attempt ${index + 1}`}
        </button>)}
        {projection.learningProcessRefs.length > 0 && <button type="button" disabled={disabled}
          onClick={() => continueWith('Review the earlier attempts for this work and the help used then.')}>
          <BookOpen size={15} aria-hidden="true" />Review earlier attempts
        </button>}
      </div>
    </details>}

    {!closed && (projection.controls.canResume || projection.controls.canHold) && <footer className="companion-session-actions">
      {projection.controls.canResume && <button type="button" className={`companion-session-continue${isResuming ? ' is-prominent' : ''}`} disabled={disabled}
        onClick={() => continueWith('I want to continue this together. Find where we last stopped first.')}>Continue here<ArrowUpRight size={15} aria-hidden="true" /></button>}
      {projection.controls.canHold && <button type="button" className="companion-session-hold" disabled={disabled}
        onClick={() => continueWith('Pause this shared work and preserve where we stopped.')}>Put aside for now</button>}
    </footer>}
    {projection.history && projection.historySource && <footer className="companion-session-actions">
      <button type="button" className="companion-session-hold" disabled={disabled}
        onClick={() => continueWith('I want to continue from the saved position on this page. Reread the current work first, then look at the next step together.')}>
        Continue from the saved position<ArrowUpRight size={15} aria-hidden="true" />
      </button>
    </footer>}
    </div>
    {readingTarget && <aside className="companion-session-source" id={sourceId} tabIndex={-1} ref={sourcePanel}
      aria-label={original?.title || 'Open original material'} aria-busy={opening}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeSource(); } }}>
      <header><div><span>{original?.origin === 'user_statement' ? 'What you wrote then' : original?.origin === 'assistant_history' ? 'The explanation from then' : 'Original material'}</span>
        {original && <h5>{original.title}{original.page ? ` · p. ${original.page}` : ''}</h5>}</div>
        <button type="button" className="companion-session-source-close" aria-label="Close original text and return to the stopping point" onClick={closeSource}><X size={16} aria-hidden="true" /></button>
      </header>
      {opening && <div className="companion-session-source-loading" role="status"><LoaderCircle size={17} aria-hidden="true" />Opening original text…</div>}
      {sourceError && <div className="companion-session-source-error"><p role="alert">{sourceError}</p>
        <button type="button" onClick={() => void openSource(readingTarget)}>Reopen</button></div>}
      {original && <>
        <div className="companion-session-source-body">
          {original.image && <img src={original.image.dataUrl} width={original.image.width} height={original.image.height} alt={`${original.title}${original.page ? ` · p. ${original.page}` : ''} — original page`} />}
          {original.text && <pre>{original.text}</pre>}
        </div>
        <footer>
          <button type="button" disabled={disabled} onClick={() => continueWith('I want to continue with the source passage just opened.', readingTarget)}>Continue from this passage<ArrowUpRight size={14} aria-hidden="true" /></button>
          {original.document && onOpenDocument && <button type="button" onClick={() => onOpenDocument(original.document!)}>Open complete material</button>}
        </footer>
      </>}
    </aside>}
    </div>
  </section>;
}
