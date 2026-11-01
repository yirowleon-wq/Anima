import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { BookOpen, Check, ChevronRight, CircleAlert, FileText, Image as ImageIcon, Layers, Link2, LoaderCircle, MessageSquareText, Minus, PanelsTopLeft, Pause, Pencil, RotateCcw, X } from 'lucide-react';
import type { Action, Bridge, Message, ReplySourceAddress, ReplySourceDisplay, ReplySourcePage, RuntimeOverview, State, Step } from '../shared/types';
import type { Condition, EvidenceEvent, MemoryView } from '../shared/harness';
import { IconButton, Modal, Switch, uiError } from './ui';
import { DEFAULT_TIME_ZONE, formatDateTime, fromTimeInput, toTimeInput } from './time';
import './entrusted.css';
import './keep-source-details.css';
import { EntrustedPanel } from './EntrustedPanel';

const api = window.anima;
export const failureText = uiError;
const date = (v?: string) => (v ? formatDateTime(v) : '');
const localTime = toTimeInput;
function processingUnavailable(state: State) {
  if (!state.settings.memoryEnabled) return 'Memory is off. Turn it on before continuing to organize it.';
  if (state.settings.mode !== 'luna')
    return `Enable ${state.modelRuntime?.displayName || 'a model connection'} in Connections before continuing to organize memory.`;
  return '';
}
function processingLine(item: RuntimeOverview['processing'][number]) {
  if (item.pending)
    return `${item.pending} original messages remain to organize${item.failed ? `; ${item.failed} could not be read clearly` : ''}`;
  return item.failed ? `${item.failed} original messages could not be organized` : 'Some original messages still need review';
}
const names: Record<string, string> = {
  schedule: 'Class schedule',
  exams: 'Exam',
  sports: 'Activity records',
  weather: 'Weather',
  origin: 'Starting place',
  precise_origin: 'Precise starting point',
  financial_coverage: 'Available funds',
  food_service_status: 'Food service hours',
  independent_performance: 'Evidence of independent work',
  'destination.eligibility': 'Destination entrance',
  transport: 'Transportation',
  device: 'Available equipment',
  location: 'Place',
  'running.today_allowed': 'Whether to run today',
};
export const needName = (key: string) =>
  names[key] ||
  (/device|computer|equipment/.test(key)
    ? 'Available equipment'
    : /origin|location|route/.test(key)
      ? 'Places and routes'
      : /weather/.test(key)
        ? 'Weather for the relevant time'
        : /time|deadline/.test(key)
          ? 'Time constraints'
          : /permission|grant/.test(key)
            ? 'Permission to use'
            : 'Relevant conditions');
const knowledge: Record<string, string> = {
  fresh: 'Sources available',
  stale: 'This source may have changed',
  partial: 'Only part was found',
  unknown: 'Not yet known',
  not_queried: 'Not read this time',
  not_found: 'Not found yet',
  unsupported: 'Not available to read yet',
  forbidden: 'Not permitted for this request',
  conflict: 'Sources disagree',
  failed: 'This lookup did not succeed',
  known_absent: 'Checked: no such record',
  cancelled: 'Lookup stopped',
};
const operationReason = (reason: string) =>
  ({
    local_transaction_not_committed: 'This event could not be saved on the device.',
    local_transaction_rolled_back: 'This change was not saved. The original event is unchanged.',
    receipt_unavailable: 'No definite result has been received from the other service.',
  })[reason] || reason;
const sourceName = (e: EvidenceEvent) =>
  e.fileName ||
  {
    'history:self': 'Original conversation',
    'profile:self': 'Your edits on the memory page',
    'work:self': 'Your feedback',
    'campus:academic-account': 'Imported academic records',
    'campus:local': 'Imported campus material',
    'local-agenda': 'Local agenda',
  }[e.sourceId] ||
  (e.imageSource ? 'Your imported image' : e.kind === 'user_message' ? 'Original words in conversation' : e.kind === 'file_import' ? 'Your imported file' : 'Source record');
function readableEvidenceText(event: EvidenceEvent) {
  if (event.kind === 'user_control') return '';
  // Authored JSON can be the person's actual words. Import/tool envelopes
  // are records about a source and must not masquerade as its readable body.
  if (event.kind !== 'user_message' && /^[\[{]/.test(event.text.trim())) {
    try {
      const value: unknown = JSON.parse(event.text);
      if (value !== null && typeof value === 'object') return '';
    } catch { /* An ordinary passage may begin with a bracket. */ }
  }
  return event.text;
}
export function EvidencePreview({ eventId }: { eventId: string }) {
  const [record, setEvidence] = useState<{ eventId: string; value: EvidenceEvent | null }>(),
    [error, setError] = useState<{ eventId: string; text: string }>();
  useEffect(() => {
    let current = true;
    setEvidence(undefined);
    setError(undefined);
    api
      .evidence(eventId)
      .then((v) => {
        if (current) setEvidence({ eventId, value: v });
      })
      .catch((e) => {
        if (current) setError({ eventId, text: failureText(e) });
      });
    return () => {
      current = false;
    };
  }, [eventId]);
  const e = record?.eventId === eventId ? record.value : undefined;
  if (error?.eventId === eventId)
    return (
      <p className="harness-inline-error" role="alert">
        {error.text}
      </p>
    );
  if (e === undefined) return <p className="harness-muted">Opening original text…</p>;
  if (!e || e.status === 'deleted') return <p className="harness-muted">This source was deleted or is outside the permitted viewing scope.</p>;
  return (
    <div className="evidence-preview">
      <div>
        <FileText size={14} />
        <strong>{sourceName(e)}</strong>
        <time>{date(e.receivedAt)}</time>
      </div>
      <p>{readableEvidenceText(e) || 'This record has no body text that can be displayed directly.'}</p>
      {e.status === 'redacted' && <small>Deleted passages are no longer displayed</small>}
    </div>
  );
}
function sourcePosition(ranges: ReplySourceDisplay['reading']['ranges']) {
  return ranges.flatMap(range => {
    const page = range.page === undefined ? '' : `p. ${range.page}`;
    if (range.unit === 'page_image') return page ? [`${page}${range.crop ? 'Image crop' : 'Image'}`] : [];
    if (range.unit === 'program_source' || range.unit === 'program_outline' || range.unit === 'program_states') {
      if (range.start === undefined || range.end === undefined) return [];
      const label = range.unit === 'program_source' ? 'Creation source' : range.unit === 'program_outline' ? 'Creation structure' : 'Interaction conditions';
      return [`${label} ${range.start + 1}–${range.end} ${range.unit === 'program_source' ? 'characters' : 'items'}`];
    }
    const passage = range.start === undefined || range.end === undefined ? ''
      : `Characters ${range.start + 1}–${range.end}`;
    const position = [page, passage].filter(Boolean).join(' · ');
    return position ? [position] : [];
  }).join('; ');
}
export type ReplySourceOpener = (address: ReplySourceAddress) => void | Promise<void>;
export function ReplyEvidence({ message, onOpenSource }: { message: Message; onOpenSource?: ReplySourceOpener }) {
  const [open, setOpen] = useState(false), [reload, setReload] = useState(0);
  const [sources, setSources] = useState<{ key: string; page: ReplySourcePage }>();
  const [problem, setProblem] = useState<{ key: string; text: string }>();
  const [opening, setOpening] = useState<{ key: string; sourceId: string }>();
  const [openProblem, setOpenProblem] = useState<{ key: string; sourceId: string; text: string }>();
  const [morePending, setMorePending] = useState(''), [moreProblem, setMoreProblem] = useState<{ key: string; text: string }>();
  const generation = useRef(0);
  const r = message.contextReceipt, s = message.scopeSummary;
  const sourceKey = JSON.stringify({
    session: message.sessionId, message: message.id, status: message.status,
    boundary: message.presentationBoundaryKey, epoch: r?.privacyEpoch, policy: r?.policyRevision,
    evidence: r?.providedEvidenceIds, reads: r?.materialReads, images: r?.imageRequests,
    notes: r?.noteSources, programs: r?.interactiveProgramSources, programReads: r?.interactiveProgramReads,
    works: r?.assistantWorkSources, reload,
  });
  useEffect(() => {
    if (!open) return;
    let current = true;
    const request = ++generation.current;
    setSources(undefined); setProblem(undefined); setOpenProblem(undefined); setOpening(undefined);
    setMorePending(''); setMoreProblem(undefined);
    if (typeof api.replySources !== 'function') {
      setProblem({ key: sourceKey, text: 'This source cannot be opened in the current window.' });
      return;
    }
    api.replySources({ sessionId: message.sessionId, messageId: message.id, limit: 4 })
      .then(page => { if (current) setSources({ key: sourceKey, page }); })
      .catch(error => { if (current) setProblem({ key: sourceKey, text: failureText(error) }); });
    return () => { current = false; if (generation.current === request) generation.current++; };
  }, [open, sourceKey]);
  if (!r && !s) return null;
  const page = sources?.key === sourceKey ? sources.page : undefined;
  const sourceError = problem?.key === sourceKey ? problem.text : '';
  const scope = s?.memoryMode === 'current_sources_only' ? 'Only this message and its attachments may be used'
    : s?.memoryMode === 'none' ? 'Memory is not used for this turn' : '';
  async function openSource(source: ReplySourceDisplay) {
    if (!source.address || !onOpenSource) return;
    const key = sourceKey, sourceId = source.id;
    setOpening({ key, sourceId }); setOpenProblem(undefined);
    try { await onOpenSource(source.address); }
    catch (error) { setOpenProblem({ key, sourceId, text: failureText(error) }); }
    finally { setOpening(value => value?.key === key && value.sourceId === sourceId ? undefined : value); }
  }
  async function moreSources() {
    if (!page || page.nextOffset === null || morePending === sourceKey) return;
    const key = sourceKey, request = generation.current, previous = page;
    setMorePending(key); setMoreProblem(undefined);
    try {
      const next = await api.replySources({ sessionId: message.sessionId, messageId: message.id, offset: previous.nextOffset!, limit: 4 });
      if (generation.current !== request) return;
      if (next.privacyEpoch !== previous.privacyEpoch || next.policyRevision !== previous.policyRevision
        || next.sourceBoundary !== previous.sourceBoundary) { setReload(value => value + 1); return; }
      setSources(value => value?.key === key ? { key, page: { ...next,
        items: [...new Map([...value.page.items, ...next.items].map(item => [item.id, item])).values()] } } : value);
    } catch (error) {
      if (generation.current === request) setMoreProblem({ key, text: failureText(error) });
    } finally {
      if (generation.current === request) setMorePending(value => value === key ? '' : value);
    }
  }
  return (
    <div className="reply-evidence keep-reply-evidence">
      <button type="button" className="icon-button evidence-toggle" aria-label="Sources and scope" title="Sources and scope" aria-expanded={open}
        aria-controls={`reply-sources-${message.id}`} onClick={() => setOpen(value => !value)}>
        <BookOpen size={18} aria-hidden="true" />
      </button>
      {open && <div className="evidence-detail keep-source-details" id={`reply-sources-${message.id}`}>
        {(scope || s?.retention === 'session_only') && <p className="harness-muted">
          {scope}{scope && s?.retention === 'session_only' ? ' · ' : ''}
          {s?.retention === 'session_only' ? 'This conversation is not retained' : ''}
        </p>}
        {!page && !sourceError && <p className="harness-muted" role="status">Opening sources…</p>}
        {sourceError && <div className="keep-source-error" role="alert">
          <p>{sourceError}</p><button type="button" className="text-button" onClick={() => setReload(value => value + 1)}>Open again</button>
        </div>}
        {!!page?.items.length && <ul className="keep-source-list" aria-label="Sources and reading status">
          {page.items.map(source => {
            const position = sourcePosition(source.reading.ranges);
            const pending = opening?.key === sourceKey && opening.sourceId === source.id;
            const error = openProblem?.key === sourceKey && openProblem.sourceId === source.id ? openProblem.text : '';
            const recoverInConversation = source.availability === 'unavailable' && source.address?.kind === 'conversation';
            const SourceIcon = source.kind === 'conversation' ? MessageSquareText : source.kind === 'image' ? ImageIcon
              : source.kind === 'notebook' ? BookOpen : source.kind === 'interactive' ? PanelsTopLeft
                : source.kind === 'scene' ? Layers : source.kind === 'other' ? Link2 : FileText;
            const label = <><SourceIcon size={14} aria-hidden="true" /><span>{source.title}</span></>;
            return <li key={source.id} className={source.availability === 'unavailable' ? 'is-unavailable' : undefined}>
              {source.address && onOpenSource
                ? <button type="button" className="text-button evidence-source-button keep-source-open" disabled={pending} aria-busy={pending}
                    aria-label={recoverInConversation ? `Return to the original message for ${source.title}` : `Open ${source.title}`}
                    onClick={() => void openSource(source)}>{label}{pending
                      ? <LoaderCircle size={12} className="spin" aria-hidden="true" />
                      : <ChevronRight size={12} aria-hidden="true" />}</button>
                : <div className="keep-source-name">{label}</div>}
              {recoverInConversation && <p className="keep-source-position">Check in the original message</p>}
              {position && <p className="keep-source-position">{position}</p>}
              {source.statusText && <p className="keep-source-status">{source.statusText}</p>}
              {source.unavailableReason && <p className="keep-source-status">{source.unavailableReason}</p>}
              {error && <p className="harness-inline-error" role="alert">{error}</p>}
            </li>;
          })}
        </ul>}
        {page?.nextOffset !== undefined && page.nextOffset !== null && <button type="button"
          className="text-button keep-source-more" disabled={morePending === sourceKey} onClick={() => void moreSources()}>
          {morePending === sourceKey ? 'Opening…' : 'View more sources'}
        </button>}
        {moreProblem?.key === sourceKey && <p className="harness-inline-error" role="alert">{moreProblem.text}</p>}
        {page?.unavailableReason && <p className="harness-muted">{page.unavailableReason}</p>}
        {page && !page.items.length && !page.unavailableReason && <p className="harness-muted">This reply has no directly openable sources right now.</p>}
        {!!r?.needResults.length && <ul className="need-list">
          {r.needResults.map((need, index) => <li key={need.key + index}>
            <span>{needName(need.key)}</span><span>{knowledge[need.status] || 'Not yet known'}</span>
          </li>)}
        </ul>}
        {s?.release && <div className="release-summary">
          <strong>Draft usage scope</strong>
          <p>Recipient: {s.release.recipient} · Purpose: {s.release.purpose}</p>
          <p>Tone: {s.release.tone}</p>
          {!!s.release.allowedFacts.length && <p>Allowed facts: {s.release.allowedFacts.join(', ')}</p>}
          <p>The draft has not been sent.</p>
        </div>}
      </div>}
    </div>
  );
}
// Older saved steps have no public projection. Only known action labels are
// retained; their raw detail/scope may contain host instructions, not dialogue.
const legacyProcessTitles = new Set([
  'Review agenda', 'View map', 'Find relevant material', 'Present the result',
  'Edit event', 'Check event outcome', 'Undo event', 'Open study sheet', 'Rehearse together',
  'Compare plans', 'Check weather', 'Look up classes and agenda', 'Look up grades and units',
  'Look up campus information', 'Search earlier records', 'Plan route and timing', 'Find place location',
  'View full campus map', 'View map details', 'Read note content', 'Find related notes',
  'View note list', 'Read earlier note versions', 'Create note', 'Edit note content',
  'Remove this note', 'Restore this note', 'Undo note changes', 'Organize notes',
  'Check agenda', 'Add event', 'Edit event', 'Organize agenda', 'Review original image',
  'Check original messages', 'Review previous understanding', 'Review shared experiences',
  'Prepare a discovery', 'Write a letter',
]);
function publicProcessStep(step: Step) {
  if (step.userFacing) return { id: step.id, ...step.userFacing };
  return legacyProcessTitles.has(step.title)
    ? { id: step.id, title: step.title, status: step.status, detail: undefined, coverage: undefined }
    : null;
}
export function ChatProcess({ message }: { message: Message }) {
  const [open, setOpen] = useState(false);
  // set_plan obligations are internal run bookkeeping, not adopted user
  // tasks or proof that a business action finished.
  const steps = message.steps.flatMap(step => {
    const visible = publicProcessStep(step);
    return visible ? [visible] : [];
  });
  const current = message.status === 'running' ? steps.filter(step => step.status === 'running').at(-1) : undefined;
  const hasDetails = steps.length > 0;
  const running = message.status === 'running';
  const unfinished = steps.some(step => step.status === 'blocked');
  if (!running && !hasDetails) return null;
  const label = running ? current?.title || 'Replying'
    : message.status === 'cancelled' ? 'Progress before stopping'
      : message.status === 'error' || unfinished ? 'View progress' : 'View activity';
  return (
    <div className={`chat-process${running ? ' is-running' : ''}`}>
      {hasDetails ? (
        <button type="button" className="icon-button chat-process-toggle" aria-label={label} title={label} aria-expanded={open}
          aria-controls={`chat-process-${message.id}`} onClick={() => setOpen(value => !value)}>
          {running ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : unfinished ? <CircleAlert size={18} aria-hidden="true" /> : <Layers size={18} aria-hidden="true" />}
          <span className="sr-only" role={running ? 'status' : undefined}>{label}</span>
        </button>
      ) : <p className="chat-process-activity" role="status" aria-label={label} title={label}><LoaderCircle size={18} className="spin" aria-hidden="true" /></p>}
      {open && hasDetails && (
        <div id={`chat-process-${message.id}`} className="chat-process-details">
          {!!steps.length && <ul className="chat-process-items" aria-label="Actual activity">
            {steps.map(step => <li key={step.id} className={`is-${step.status}`}>
              {step.status === 'running' && running ? <LoaderCircle size={13} className="spin" aria-hidden="true" />
                : step.status === 'done' ? <Check size={13} aria-hidden="true" />
                  : step.status === 'cancelled' || step.status === 'running' ? <Minus size={13} aria-hidden="true" /> : <CircleAlert size={13} aria-hidden="true" />}
              <div><span className="sr-only">{step.status === 'running' ? running ? 'In progress: ' : 'Completion unconfirmed: ' : step.status === 'cancelled' ? 'Stopped: ' : step.status === 'blocked' ? 'Incomplete: ' : step.coverage === 'partial' ? 'Partially read: ' : 'Step completed: '}</span>
                <span>{step.title}</span>
                {step.detail ? <p>{step.detail}</p> : step.coverage === 'partial' ? <p>Only part of this source was read.</p> : null}
              </div>
            </li>)}
          </ul>}
        </div>
      )}
    </div>
  );
}
export type TurnControls = NonNullable<Parameters<Bridge['send']>[0]['controls']>;
export function ScopeSettings({
  value,
  onChange,
  onClose,
}: {
  value: TurnControls;
  onChange: (v: TurnControls) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Your boundaries for this message" onClose={onClose} className="scope-panel">
      <div className="panel-body">
        <p className="panel-intro">Choose what Anima may use and retain for your next message.</p>
        <label className="field-label">
          Who answers this message
          <select
            aria-label="Processing for this turn"
            value={value.transmission || 'cloud_allowed'}
            onChange={(e) =>
              onChange({
                ...value,
                transmission: e.target.value as TurnControls['transmission'],
              })
            }
          >
            <option value="cloud_allowed">Use my selected online model</option>
            <option value="local_only">Keep on this device; do not send to a model</option>
          </select>
        </label>
        {value.transmission === 'local_only' && (
          <p className="scope-explanation">No offline model is available on this device. This content will not be uploaded or receive a model reply.</p>
        )}
        <label className="field-label">
          What may be used
          <select
            aria-label="Source scope for this turn"
            value={value.memoryMode || 'relevant'}
            onChange={(e) =>
              onChange({
                ...value,
                memoryMode: e.target.value as TurnControls['memoryMode'],
              })
            }
          >
            <option value="relevant">Use relevant sources as needed</option>
            <option value="current_sources_only">Only this message and its attachments</option>
            <option value="none">Do not use personal memory or history</option>
          </select>
        </label>
        <label className="field-label">
          How to retain this message
          <select
            aria-label="Retention for this turn"
            value={value.retention || 'purpose_scoped'}
            onChange={(e) =>
              onChange({
                ...value,
                retention: e.target.value as TurnControls['retention'],
              })
            }
          >
            <option value="purpose_scoped">Keep the conversation and learn about me over time</option>
            <option value="history_no_inference">Keep the conversation without inferring lasting preferences</option>
            <option value="session_only">Do not retain this turn</option>
          </select>
        </label>
        <label className="field-label">
          Who the reply is for
          <select
            aria-label="Audience for this turn"
            value={value.audience || 'self'}
            onChange={(e) =>
              onChange({
                ...value,
                audience: e.target.value as TurnControls['audience'],
              })
            }
          >
            <option value="self">Only me</option>
            <option value="group">Draft for a group</option>
            <option value="public">Draft for a public audience</option>
          </select>
        </label>
        {value.retention === 'session_only' && (
          <p className="scope-explanation">
            This message and its attachments will not be kept in history or used to infer lasting preferences. Events you explicitly ask Anima to save remain on this device. If you choose an online reply, permitted content is still sent to the model.
          </p>
        )}
        {value.audience && value.audience !== 'self' && (
          <p className="scope-explanation">Only content you permit for that audience is used. Nothing is sent automatically.</p>
        )}
        <button className="primary-button" onClick={onClose}>
          Apply to next message
        </button>
      </div>
    </Modal>
  );
}
function describeCondition(c: Condition): string {
  if (c.op === 'all' && !c.terms.length) return 'Usually applies';
  if (c.op === 'unknown') return 'Some conditions remain unclear';
  if (c.op === 'all' || c.op === 'any')
    return c.terms.map(describeCondition).join(c.op === 'all' ? ', and ' : ', or ');
  if (c.op === 'not') return 'Not satisfied: ' + describeCondition(c.term);
  if (c.op === 'compare') {
    const v = c.value;
    return `${needName(c.predicate)} ${({ eq: 'equals', ne: 'does not equal', lt: 'less than', lte: 'at most', gt: 'greater than', gte: 'at least' } as Record<string, string>)[c.comparator] || c.comparator} ${'value' in v ? String(v.value) : 'Not known yet'}${'unit' in v ? ' ' + v.unit : ''}`;
  }
  return 'Has additional conditions';
}
export function UnderstandingPanel({
  state,
  onState,
  busy,
}: {
  state: State;
  onState: (s: State) => void;
  busy: boolean;
}) {
  const date = (value?: string) => value ? formatDateTime(value, state.settings.timeZone) : '';
  const localTime = (value?: string) => toTimeInput(value, state.settings.timeZone);
  const editForm = useRef<HTMLFormElement>(null);
  const [data, setData] = useState<RuntimeOverview>(),
    [error, setError] = useState(''),
    [status, setStatus] = useState(''),
    [pending, setPending] = useState('');
  const [text, setText] = useState(''),
    [edit, setEdit] = useState<MemoryView>(),
    [operation, setOperation] = useState<'CORRECT' | 'SUPERSEDE' | 'ADD_EXCEPTION'>('CORRECT'),
    [from, setFrom] = useState(''),
    [until, setUntil] = useState(''),
    [filter, setFilter] = useState('all'),
    [source, setSource] = useState('');
  useEffect(() => {
    let mounted = true;
    api
      .runtimeOverview()
      .then((v) => {
        if (mounted) setData(v);
      })
      .catch((e) => {
        if (mounted) setError(failureText(e));
      });
    return () => {
      mounted = false;
    };
  }, [state]);
  async function act(name: string, fn: () => Promise<void>) {
    if (pending) return;
    setPending(name);
    setError('');
    setStatus('');
    try {
      await fn();
      setData(await api.runtimeOverview());
    } catch (e) {
      setError(failureText(e));
    } finally {
      setPending('');
    }
  }
  function editMemory(m: MemoryView) {
    setEdit(m);
    setText(m.text);
    setOperation('CORRECT');
    setFrom(localTime(m.validFrom));
    setUntil(localTime(m.validTo));
    setError('');
    requestAnimationFrame(() => editForm.current?.querySelector('textarea')?.focus());
  }
  const priority: Record<string, number> = {
    active: 0,
    candidate: 1,
    disputed: 1,
    inactive: 2,
    expired: 3,
  };
  const memories = [...(data?.memories || [])].sort(
      (a, b) => (priority[a.status] ?? 4) - (priority[b.status] ?? 4),
    ),
    visible = memories.filter(
      (m) =>
        filter === 'all' ||
        (filter === 'active' && m.status === 'active') ||
        (filter === 'pending' && ['candidate', 'disputed'].includes(m.status)) ||
        (filter === 'inactive' && ['inactive', 'expired'].includes(m.status)),
    );
  return (
    <section className="understanding-panel">
      <div className="settings-lede">
        <p className="panel-intro">The understandings that may affect future conversations are here. Correct, disable, or delete them at any time.</p>
      </div>
      <Switch
        checked={state.settings.memoryEnabled}
        label="Remember preferences I explicitly share"
        detail="When on, relevant conversations may use earlier chats and understandings. When off, those memories are not used and no new understandings are formed."
        disabled={!!pending || (busy && !state.settings.memoryEnabled)}
        onChange={(v) =>
          void act('toggle', async () => {
            onState(await api.saveSettings({ memoryEnabled: v }));
          })
        }
      />
      <div className="understanding-heading">
        <div>
          <strong>Saved understandings</strong>
          <small>{memories.length ? `${memories.length}records` : 'No records yet'}</small>
        </div>
        <select aria-label="Filter understanding status" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All states</option>
          <option value="active">In use</option>
          <option value="pending">Awaiting confirmation</option>
          <option value="inactive">Disabled or expired</option>
        </select>
      </div>
      <div className="memory-list">
        {visible.map((m) => (
          <div className={`memory-item understanding-item ${m.status}`} key={m.id}>
            <div className="understanding-content">
              <div className="understanding-meta">
                <span>
                  {(
                    {
                      active: 'In use',
                      candidate: 'Awaiting confirmation',
                      disputed: 'Needs review',
                      inactive: 'Disabled',
                      expired: 'Expired',
                    } as Record<string, string>
                  )[m.status] || 'No longer used'}
                </span>
                <small>
                  {m.verification === 'verified'
                    ? 'Supported by original text'
                    : m.verification === 'unverified'
                      ? 'Older record · original text unverified'
                      : 'Not verified'}
                </small>
              </div>
              <p>{m.text}</p>
              <div className="understanding-limits">
                {m.status === 'candidate' || m.status === 'disputed'
                  ? 'Applicable scope needs confirmation'
                  : m.status === 'inactive'
                    ? 'Original conditions preserved; not currently used'
                    : describeCondition(JSON.parse(m.conditions))}
                {m.validFrom ? ` · ${date(m.validFrom)} onward` : ''}
                {m.validTo ? ` · Until ${date(m.validTo)}` : ''}
              </div>
              <div className="understanding-buttons">
                <button className="memory-source" onClick={() => setSource(source === m.id ? '' : m.id)}>
                  View original words
                  <ChevronRight size={12} />
                </button>
                <button
                  className="text-button"
                  aria-label={`Edit memory: ${m.text}`}
                  onClick={() => editMemory(m)}
                >
                  <Pencil size={13} />
                  Correct
                </button>
                {m.status !== 'inactive' && (
                  <button
                    className="text-button"
                    disabled={!!pending}
                    onClick={() =>
                      void act('deactivate', async () => {
                        onState(await api.memory({ action: 'deactivate', id: m.id }));
                        setStatus('Disabled. The original words remain available to review.');
                      })
                    }
                  >
                    <Pause size={12} />
                    Disable
                  </button>
                )}
                <IconButton
                  label={`Delete memory: ${m.text}`}
                  disabled={!!pending}
                  onClick={() =>
                    void act('delete', async () => {
                      onState(await api.memory({ action: 'delete', id: m.id }));
                      setStatus('This understanding and its derived content were removed. Earlier suggestions need review.');
                    })
                  }
                >
                  <X size={14} />
                </IconButton>
              </div>
              {source === m.id &&
                (m.evidenceIds.length ? (
                  m.evidenceIds.map((id) => <EvidencePreview key={id} eventId={id} />)
                ) : (
                  <p className="memory-quote">The original words cannot be located. This record is not treated as verified understanding.</p>
                ))}
            </div>
          </div>
        ))}
      </div>
      {!visible.length && (
        <p className="memory-empty">
          {memories.length ? 'No records in this state.' : 'Start talking. Understanding can grow when it is useful.'}
        </p>
      )}
      <form
        ref={editForm}
        className="memory-form"
        onSubmit={(e) => {
          e.preventDefault();
          void act('save', async () => {
            onState(
              await api.memory({
                action: 'save',
                id: edit?.id,
                expectedRevision: edit?.revision,
                text: text.trim(),
                operation: edit ? operation : undefined,
                conditions: edit ? JSON.parse(edit.conditions) : undefined,
                validFrom: fromTimeInput(from, state.settings.timeZone),
                validTo: fromTimeInput(until, state.settings.timeZone),
              }),
            );
            setText('');
            setEdit(undefined);
            setFrom('');
            setUntil('');
            setStatus('Saved. The updated understanding applies from the next turn.');
          });
        }}
      >
        <div className="form-heading">
          <strong>{edit ? 'Edit understanding' : 'Add an understanding'}</strong>
          <small>{edit ? 'This change applies from the next turn' : 'Save only what you explicitly say'}</small>
        </div>
        <label className="field-label">
          {edit ? 'Edit this understanding' : 'Tell Anima something about you'}
          <textarea
            aria-label="Preference text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={4000}
            rows={3}
            placeholder="For example: I usually prefer uninterrupted study, but today I want to rest."
          />
        </label>
        {edit && (
          <label className="field-label">
            What kind of change is this?
            <select
              aria-label="Understanding change type"
              value={operation}
              onChange={(e) => setOperation(e.target.value as typeof operation)}
            >
              <option value="CORRECT">Correct an earlier misunderstanding</option>
              <option value="SUPERSEDE">Circumstances changed from a specified time</option>
              <option value="ADD_EXCEPTION">Keep the original and add this exception</option>
            </select>
          </label>
        )}
        <details className="understanding-time" open={!!edit || undefined}>
          <summary>
            Valid period <span>Optional; a one-day exception needs an end time</span>
          </summary>
          <div className="understanding-dates">
            <label className="field-label">
              Start time
              <input
                aria-label="Understanding valid from"
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                required={operation === 'SUPERSEDE' && !!edit}
              />
            </label>
            <label className="field-label">
              End time
              <input
                aria-label="Understanding valid until"
                type="datetime-local"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                min={from || undefined}
                required={operation === 'ADD_EXCEPTION' && !!edit}
              />
            </label>
          </div>
        </details>
        <div className="field-buttons">
          <button className="primary-button" disabled={!!pending || !text.trim()}>
            {pending === 'save' && <LoaderCircle size={14} className="spin" />}
            {edit ? 'Save changes' : 'Remember this'}
          </button>
          {edit && (
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setEdit(undefined);
                setText('');
                setFrom('');
                setUntil('');
                setError('');
              }}
            >
              Cancel changes
            </button>
          )}
        </div>
      </form>
      {error && (
        <p role="alert" className="harness-inline-error">
          {error}
          <button className="text-button" onClick={() => void api.runtimeOverview().then(setData)}>
            Refresh records
          </button>
        </p>
      )}
      {status && (
        <p role="status" className="harness-inline-status">
          {status}
        </p>
      )}
      {!!data?.processing.length && (
        <details className="processing-overview">
          <summary>
            Original messages still to organize <span>{data.processing.length}records</span>
          </summary>
          {processingUnavailable(state) && <p className="harness-muted">{processingUnavailable(state)}</p>}
          {data.processing.map((p) => (
            <div className="processing-row" key={p.eventId}>
              <div>
                <span>{p.fileName || date(p.receivedAt)}</span>
                <small>
                  {processingLine(p)}
                </small>
              </div>
              <button
                className="text-button"
                disabled={!!pending || busy || !!processingUnavailable(state)}
                onClick={() =>
                  void act('retry', async () => {
                    setData(await api.retryProcessing(p.eventId));
                  })
                }
              >
                <RotateCcw size={13} />
                Retry organizing
              </button>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
export function FeedbackControl({ messageId }: { messageId: string }) {
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState(''),
    [response, setResponse] = useState<'accepted' | 'declined'>('declined'),
    [status, setStatus] = useState(''),
    [pending, setPending] = useState(false);
  return (
    <div className="feedback-control">
      <button className="icon-button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Give feedback on this reply" title="Give feedback on this reply">
        <MessageSquareText size={18} aria-hidden="true" />
      </button>
      {open && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            try {
              await api.feedback({
                recommendationId: messageId,
                response,
                ...(reason.trim() ? { reason: reason.trim() } : {}),
              });
              setStatus('Noted. Thank you for telling me.');
              setOpen(false);
            } catch (error) {
              setStatus(failureText(error));
            } finally {
              setPending(false);
            }
          }}
        >
          <label className="field-label">
            How did this fit?
            <select value={response} onChange={(e) => setResponse(e.target.value as typeof response)}>
              <option value="declined">Not a good fit</option>
              <option value="accepted">Helpful to me</option>
            </select>
          </label>
          <label className="field-label">
            Reason <small>Optional</small>
            <input
              aria-label="Reason for feedback"
              value={reason}
              maxLength={1200}
              onChange={(e) => setReason(e.target.value)}
              placeholder="For example: Today I would like more open space."
            />
          </label>
          <button className="subtle-button" disabled={pending}>
            Tell Anima
          </button>
        </form>
      )}
      {status && (
        <span className="harness-muted" role="status">
          {status}
        </span>
      )}
    </div>
  );
}
export function WorkAndReceipts({
  onResume,
  onChanged,
  onAttention,
  agenda,
  preparations,
  onState,
  onContinue,
  timeZone,
}: {
  onResume: (sessionId: string) => void;
  onChanged: () => void;
  onAttention?: (count: number) => void;
  agenda: Action[];
  preparations: import('../shared/presentation').PreparationView[];
  onState: (state: State) => void;
  onContinue: (text: string) => void;
  timeZone: string;
}) {
  const [data, setData] = useState<RuntimeOverview>(),
    [error, setError] = useState(''),
    [pending, setPending] = useState('');
  const date = (value?: string) => value ? formatDateTime(value, timeZone) : '';
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  useEffect(() => {
    if (data)
      onAttention?.(
        data.actions.filter((a) =>
          [
            'outcome_unknown',
            'unresolved',
            'cancel_requested',
            'cannot_cancel',
            'cancellation_unknown',
            'failed_confirmed',
          ].includes(a.action.status),
        ).length,
      );
  }, [data, onAttention]);
  useEffect(() => {
    api
      .runtimeOverview()
      .then(setData)
      .catch((e) => setError(failureText(e)));
  }, []);
  async function action(id: string, fn: () => Promise<RuntimeOverview>) {
    setPending(id);
    setError('');
    try {
      setData(await fn());
      onChanged();
    } catch (e) {
      setError(failureText(e));
    } finally {
      setPending('');
    }
  }
  const goals = data?.work.filter((w) => w.kind === 'goal') || [],
    episodes =
      data?.work.filter(
        (w) =>
          w.kind === 'episode' &&
          (w.data.sessionId || w.data.lastSessionId) &&
          (w.data.nextSmallQuestion || w.data.type === 'collaboration_frame'),
      ) || [],
    unknown =
      data?.actions.filter((a) =>
        [
          'outcome_unknown',
          'unresolved',
          'cancel_requested',
          'cannot_cancel',
          'cancellation_unknown',
        ].includes(a.action.status),
      ) || [],
    localSaved =
      data?.actions.filter(
        ({ action: a, receipts }) =>
          agenda.some(item => (item.effectActionId || item.id) === a.id) &&
          a.executionTier === 'direct_local' &&
          a.status === 'succeeded' &&
          receipts.at(-1)?.status === 'confirmed_success' &&
          receipts.at(-1)?.localStatus === 'local_saved',
      ) || [],
    failed = data?.actions.filter(({ action: a }) => a.status === 'failed_confirmed') || [];
  const adoptedPreparations = data?.work.filter((w) => w.kind === 'task' && w.data.adoptionItemId) || [];
  return (
    <div className="work-receipts">
      <EntrustedPanel onResume={onResume} onChanged={onChanged} preparations={preparations} onState={onState} onContinue={onContinue} timeZone={timeZone} />
      {!!goals.length && (
        <section className="entrusted-goals">
          <h3>Things we are working on</h3>
          {goals.map((g) => (
            <div className={`work-row entrusted-goal entrusted-goal-${g.status}`} key={g.id}>
              <div className="work-row-heading">
                <strong>{g.title}</strong>
                <span>
                  {(
                    {
                      proposed: 'If you would like',
                      active: 'Continuing together',
                      paused: 'Pause for a while',
                      cancelled: 'Stop following up',
                    } as Record<string, string>
                  )[g.status] || 'Needs another look'}
                </span>
              </div>
              {typeof g.data.reason === 'string' && <p>{g.data.reason}</p>}
              {g.status !== 'cancelled' && (
                <div className="field-buttons">
                  <button
                    className="subtle-button"
                    disabled={!!pending}
                    onClick={() =>
                      void action(g.id, () =>
                        api.goal({
                          id: g.id,
                          expectedRevision: g.revision,
                          status: g.status === 'active' ? 'paused' : 'active',
                        }),
                      )
                    }
                  >
                    {g.status === 'active'
                      ? 'Pause for a while'
                      : g.status === 'proposed'
                        ? 'Work on this together'
                        : 'Continue this'}
                  </button>
                  <button
                    className="text-button"
                    disabled={!!pending}
                    onClick={() =>
                      void action(g.id, () =>
                        api.goal({
                          id: g.id,
                          expectedRevision: g.revision,
                          status: 'cancelled',
                        }),
                      )
                    }
                  >
                    Stop following up
                  </button>
                </div>
              )}
              {g.status === 'paused' && (
                <small>Review the current plan when you want to continue. Earlier reminders will not reactivate themselves.</small>
              )}
              {!!g.evidenceIds.length && (
                <details className="entrusted-source">
                  <summary>Where this began</summary>
                  {g.evidenceIds.map((id) => (
                    <EvidencePreview key={id} eventId={id} />
                  ))}
                </details>
              )}
            </div>
          ))}
        </section>
      )}
      {!!episodes.length && (
        <section>
          <h3>Threads to continue</h3>
          {episodes.map((e) => {
            const sessionIds = Array.isArray(e.data.sessionIds)
              ? e.data.sessionIds.filter((value): value is string => typeof value === 'string')
              : [];
            const resumeSession =
              (typeof e.data.lastSessionId === 'string' && e.data.lastSessionId) ||
              sessionIds.at(-1) ||
              String(e.data.sessionId);
            return (
              <button key={e.id} className="resume-work" onClick={() => onResume(resumeSession)}>
                <span>
                  <strong>{e.title}</strong>
                  <small>
                    {String(
                      e.data.nextSmallQuestion || e.data.nextStep || e.data.question || 'Return to the last conversation',
                    )}
                  </small>
                </span>
                <ChevronRight size={15} />
              </button>
            );
          })}
        </section>
      )}
      {!!unknown.length && (
        <section className="work-needs-care">
          <h3>Results that need checking</h3>
          {unknown.map(({ action: a, receipts }) => (
            <div className="work-row" key={a.id}>
              <strong>{String(a.arguments.title || 'This request')}</strong>
              <p>
                {a.status === 'cannot_cancel'
                  ? 'The other service cannot undo this action. Its effects may remain; check the original app.'
                  : a.status === 'unresolved'
                    ? 'Anima cannot confirm whether this completed. Check the original app before retrying to avoid a duplicate action.'
                    : ['cancel_requested', 'cancellation_unknown'].includes(a.status)
                      ? 'The undo is unconfirmed. Check the original result before continuing to avoid duplicates.'
                      : 'Completion is unconfirmed. Check the result before deciding whether to retry.'}
              </p>
              {['outcome_unknown', 'cancel_requested'].includes(a.status) ? (
                <button
                  className="subtle-button"
                  disabled={!!pending}
                  onClick={() => void action(a.id, () => api.reconcileAction(a.id))}
                >
                  {pending === a.id ? 'Checking result…' : 'Check result'}
                </button>
              ) : (
                <span className="receipt-manual-check">Check in the original app</span>
              )}
              <small>
                {receipts.at(-1)?.observedAt
                  ? `Last checked: ${date(receipts.at(-1)?.observedAt)}`
                  : 'No definite result received yet'}
                {a.simulated ? ' · From a simulated environment' : ''}
              </small>
            </div>
          ))}
        </section>
      )}
      {!!failed.length && (
        <section className="work-needs-care">
          <h3>Requests that did not finish</h3>
          {failed.map(({ action: a, receipts }) => (
            <div className="work-row action-receipt-row" key={a.id}>
              <div className="work-row-heading">
                <strong>{String(a.arguments.title || 'This request')}</strong>
                <span>Not completed</span>
              </div>
              <p>
                This did not finish. The requested action has not been completed.
                {receipts.at(-1)?.reason ? ` ${operationReason(receipts.at(-1)!.reason!)}` : ''}
              </p>
              <small>{a.simulated ? 'This comes from a simulated environment.' : 'Return to the original conversation to try again.'}</small>
            </div>
          ))}
        </section>
      )}
      {!!data?.worlds.length && (
        <section className="world-review">
          <h3>Turn ideas into preparation</h3>
          <p className="harness-muted">Choose the parts you want to prepare. This does not decide for you or take external action.</p>
          {data.worlds.map((w) => (
            <details key={w.worldId}>
              <summary>
                {w.status === 'stale' ? 'Circumstances changed. Review this idea first' : 'Choose things to prepare from this idea'}
              </summary>
              {w.items.map((item) => (
                <label className="world-item" key={item.id}>
                  <input
                    type="checkbox"
                    aria-label="Choose this idea for preparation"
                    checked={selectedItems.includes(item.id)}
                    disabled={w.status === 'stale' || !!pending}
                    onChange={(e) =>
                      setSelectedItems((ids) =>
                        e.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id),
                      )
                    }
                  />
                  <span>
                    <strong>
                      {typeof item.proposed === 'string' ? item.proposed : JSON.stringify(item.proposed)}
                    </strong>
                    <small>Select to add to preparation</small>
                  </span>
                </label>
              ))}
              <button
                className="subtle-button"
                disabled={
                  w.status === 'stale' || !!pending || !w.items.some((i) => selectedItems.includes(i.id))
                }
                onClick={() =>
                  void action(w.worldId, async () => {
                    const result = await api.adoptWorld({
                      id: w.worldId,
                      itemIds: w.items.filter((i) => selectedItems.includes(i.id)).map((i) => i.id),
                      expectedBaseRevision: w.baseRevision,
                      expectedPrivacyEpoch: data.privacyEpoch,
                    });
                    setSelectedItems([]);
                    return result;
                  })
                }
              >
                Prepare for these
              </button>
            </details>
          ))}
        </section>
      )}
      {!!adoptedPreparations.length && (
        <section>
          <h3>In preparation</h3>
          {adoptedPreparations.map((w) => (
            <div className="work-row" key={w.id}>
              <strong>{w.title}</strong>
              <small>Saved from your idea; no action has begun</small>
            </div>
          ))}
        </section>
      )}
      {!!localSaved.length && (
        <details className="work-history">
          <summary>
            Recently saved events <span>{localSaved.length} items</span>
          </summary>
          {localSaved.map(({ action: a, receipts }) => {
            const item = agenda.find(item => (item.effectActionId || item.id) === a.id)!;
            const observedAt = receipts.at(-1)?.observedAt;
            return (
              <div className="work-row action-receipt-row" key={a.id}>
                <div className="work-row-heading">
                  <strong>{item.title}</strong>
                  <span>Saved on this device</span>
                </div>
                <p>
                  {observedAt ? `Saved on ${date(observedAt)}.` : 'This event is saved.'}
                </p>
                <div className="field-buttons">
                  <button
                    className="text-button"
                    disabled={!!pending}
                    onClick={() =>
                      void action(a.id, async () => {
                        await api.action({ action: 'delete', item });
                        return api.runtimeOverview();
                      })
                    }
                  >
                    {pending === a.id ? 'Removing from agenda…' : 'Remove from agenda'}
                  </button>
                </div>
                {a.simulated && <small>This comes from a simulated environment.</small>}
              </div>
            );
          })}
        </details>
      )}
      <details className="delivery-details">
        <summary>How reminders arrive and data is stored</summary>
        <p>
          Reminders are checked only while Anima is running.
          {data?.notifications.submitted
            ? 'This device can submit system notifications. Anima cannot tell whether you saw them.'
            : 'System notifications are unavailable on this device right now.'}
        </p>
        <p>The conversation database is not fully encrypted at rest. Keys are protected by the operating system. Keep exported files secure.</p>
      </details>
      {error && (
        <p role="alert" className="harness-inline-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function SourcePermissions({ onState }: { onState: (s: State) => void }) {
  const [revoked, setRevoked] = useState<string[]>(),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    api
      .runtimeOverview()
      .then((v) => setRevoked(v.revoked))
      .catch((e) => setError(failureText(e)));
  }, []);
  async function change(enabled: boolean) {
    setPending(true);
    setError('');
    try {
      const next = await api.permission({ scope: 'campus:read', enabled });
      setRevoked(next.revoked);
      onState(await api.state());
    } catch (e) {
      setError(failureText(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="source-permissions">
      <Switch
        checked={revoked ? !revoked.includes('campus:read') : false}
        onChange={(v) => void change(v)}
        label="Use campus material when needed"
        detail="Turning this off stops the current lookup. Imported campus records remain local; any model use still follows the source permissions for that request."
        disabled={pending || !revoked}
      />
      {error && (
        <p role="alert" className="harness-inline-error">
          {error}
        </p>
      )}
    </section>
  );
}

/** User-facing memory view. Internal lifecycle/verification labels stay behind
 * the source disclosure; the first scan answers only what can change a reply. */
export function MemoryPanel({
  state,
  onState,
  busy,
}: {
  state: State;
  onState: (s: State) => void;
  busy: boolean;
}) {
  const date = (value?: string) => value ? formatDateTime(value, state.settings.timeZone) : '';
  const localTime = (value?: string) => toTimeInput(value, state.settings.timeZone);
  const editForm = useRef<HTMLFormElement>(null);
  const [data, setData] = useState<RuntimeOverview>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [source, setSource] = useState('');
  const [text, setText] = useState('');
  const [edit, setEdit] = useState<MemoryView>();
  const [operation, setOperation] = useState<'CORRECT' | 'SUPERSEDE' | 'ADD_EXCEPTION'>('CORRECT');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');

  useEffect(() => {
    let mounted = true;
    api
      .runtimeOverview()
      .then((value) => {
        if (mounted) setData(value);
      })
      .catch((value) => {
        if (mounted) setError(failureText(value));
      });
    return () => {
      mounted = false;
    };
  }, [state]);

  async function act(name: string, fn: () => Promise<void>) {
    if (pending) return;
    setPending(name);
    setError('');
    setNotice('');
    try {
      await fn();
      setData(await api.runtimeOverview());
    } catch (value) {
      setError(failureText(value));
    } finally {
      setPending('');
    }
  }

  function editMemory(memory: MemoryView) {
    setEdit(memory);
    setText(memory.text);
    setOperation('CORRECT');
    setFrom(localTime(memory.validFrom));
    setUntil(localTime(memory.validTo));
    setEditorOpen(true);
    setError('');
    requestAnimationFrame(() => editForm.current?.querySelector('textarea')?.focus());
  }

  function clearEditor() {
    setEdit(undefined);
    setText('');
    setFrom('');
    setUntil('');
    setEditorOpen(false);
  }

  const memories = data?.memories || [];
  const current = memories.filter((memory) => memory.status === 'active');
  const needsDecision = memories.filter((memory) => ['candidate', 'disputed'].includes(memory.status));
  const archived = memories.filter((memory) => !['active', 'candidate', 'disputed'].includes(memory.status));

  function renderMemory(memory: MemoryView, group: 'current' | 'decision' | 'archived') {
    const temporal = [
      memory.validFrom ? `From ${date(memory.validFrom)}` : '',
      memory.validTo ? `Until ${date(memory.validTo)}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const condition = (() => {
      try {
        const parsed = JSON.parse(memory.conditions) as Condition;
        return parsed.op === 'all' && !parsed.terms.length ? '' : describeCondition(parsed);
      } catch {
        return '';
      }
    })();
    return (
      <article className={`memory-item memory-item-${group}`} key={memory.id}>
        <div className="memory-item-main">
          {group === 'decision' && <div className="memory-item-kicker">Your decision needed</div>}
          <p className="memory-item-text">{memory.text}</p>
          {(condition || temporal) && (
            <p className="memory-item-context">
              {condition || 'Applies during the specified period'}
              {temporal ? ` · ${temporal}` : ''}
            </p>
          )}
          <div className="memory-item-actions">
            <button
              className="memory-source"
              onClick={() => setSource(source === memory.id ? '' : memory.id)}
            >
              Why this understanding
              <ChevronRight size={12} />
            </button>
            {group === 'decision' && (
              <button
                className="text-button"
                disabled={!!pending}
                onClick={() =>
                  void act('keep', async () => {
                    onState(
                      await api.memory({
                        action: 'save',
                        id: memory.id,
                        expectedRevision: memory.revision,
                        text: memory.text,
                        operation: 'CORRECT',
                        conditions: JSON.parse(memory.conditions),
                        validFrom: memory.validFrom,
                        validTo: memory.validTo,
                      }),
                    );
                    setNotice('Kept. It will be used only when relevant.');
                  })
                }
              >
                Keep and use
              </button>
            )}
            {group !== 'archived' && (
              <button className="text-button" onClick={() => editMemory(memory)}>
                <Pencil size={13} />
                Correct
              </button>
            )}
            {group === 'current' && (
              <button
                className="text-button"
                disabled={!!pending}
                onClick={() =>
                  void act('deactivate', async () => {
                    onState(await api.memory({ action: 'deactivate', id: memory.id }));
                    setNotice('Disabled. The original words remain in the disabled content.');
                  })
                }
              >
                Disable for now
              </button>
            )}
            {group === 'decision' && (
              <button
                className="text-button"
                disabled={!!pending}
                onClick={() =>
                  void act('deactivate', async () => {
                    onState(await api.memory({ action: 'deactivate', id: memory.id }));
                    setNotice('Disabled for now. It will not be treated as confirmed understanding.');
                  })
                }
              >
                Do not use for now
              </button>
            )}
            <IconButton
              label={`Delete: ${memory.text}`}
              disabled={!!pending}
              onClick={() =>
                void act('delete', async () => {
                  onState(await api.memory({ action: 'delete', id: memory.id }));
                  setNotice('This understanding and its related local derived content were deleted.');
                })
              }
            >
              <X size={14} />
            </IconButton>
          </div>
          {source === memory.id && (
            <div className="memory-source-reveal">
              {memory.evidenceIds.length ? (
                memory.evidenceIds.map((id) => <EvidencePreview key={id} eventId={id} />)
              ) : (
                <p className="memory-quote">No original passage can be located. This will not be treated as verified evidence.</p>
              )}
              <p className="memory-source-meta">
                {memory.verification === 'verified' ? 'Source verified' : 'Source needs review'} · Recorded on {' '}
                {date(memory.createdAt)}
              </p>
            </div>
          )}
        </div>
      </article>
    );
  }

  return (
    <section className="memory-panel-v2">
      <p className="panel-intro">This is what may affect later conversations. You can change it at any time.</p>
      <Switch
        checked={state.settings.memoryEnabled}
        label="Let Anima use these understandings"
        detail="When on, relevant conversations may use earlier chats and understandings. When off, those memories are not used and no new understandings are formed."
        disabled={!!pending || (busy && !state.settings.memoryEnabled)}
        onChange={(value) =>
          void act('toggle', async () => {
            onState(await api.saveSettings({ memoryEnabled: value }));
          })
        }
      />

      {current.length > 0 && (
        <section className="memory-group memory-group-current">
          <div className="memory-group-heading">
            <h3>Currently used in replies</h3>
            <small>{current.length}records</small>
          </div>
          <div className="memory-list">{current.map((memory) => renderMemory(memory, 'current'))}</div>
        </section>
      )}

      {needsDecision.length > 0 && (
        <section className="memory-group memory-group-decision">
          <div className="memory-group-heading">
            <h3>Your decision needed</h3>
            <small>Not treated as confirmed understanding</small>
          </div>
          <div className="memory-list">{needsDecision.map((memory) => renderMemory(memory, 'decision'))}</div>
        </section>
      )}

      {archived.length > 0 && (
        <details className="memory-group memory-group-archived">
          <summary className="memory-group-heading">
            <h3>Disabled content</h3>
            <small>{archived.length}records</small>
          </summary>
          <div className="memory-list">{archived.map((memory) => renderMemory(memory, 'archived'))}</div>
        </details>
      )}

      {!memories.length && (
        <p className="memory-empty">No understandings need managing yet. Start talking; understanding can grow when useful.</p>
      )}

      <details
        className="memory-editor"
        open={editorOpen}
        onClick={(event) => {
          if ((event.target as HTMLElement).tagName === 'SUMMARY') {
            event.preventDefault();
            setEditorOpen((open) => !open);
          }
        }}
      >
        <summary>
          <span>{edit ? 'Edit understanding' : 'Add an understanding'}</span>
          <small>{edit ? 'Applies from the next turn after saving' : 'Save only what you explicitly say'}</small>
        </summary>
        <form
          ref={editForm}
          onSubmit={(event) => {
            event.preventDefault();
            void act('save', async () => {
              onState(
                await api.memory({
                  action: 'save',
                  id: edit?.id,
                  expectedRevision: edit?.revision,
                  text: text.trim(),
                  operation: edit ? operation : undefined,
                  conditions: edit ? JSON.parse(edit.conditions) : undefined,
                  validFrom: fromTimeInput(from, state.settings.timeZone),
                  validTo: fromTimeInput(until, state.settings.timeZone),
                }),
              );
              clearEditor();
              setNotice('Saved. The next turn will use the updated understanding.');
            });
          }}
        >
          <label className="field-label">
            {edit ? 'Revised wording' : 'Tell Anima something about you'}
            <textarea
              aria-label="Preference text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={4000}
              rows={3}
              placeholder="For example: I usually prefer uninterrupted study, but today I want to rest."
            />
          </label>
          {edit && (
            <label className="field-label">
              Change type
              <select
                aria-label="Understanding change type"
                value={operation}
                onChange={(event) => setOperation(event.target.value as typeof operation)}
              >
                <option value="CORRECT">Correct an earlier misunderstanding</option>
                <option value="SUPERSEDE">Circumstances changed from a specified time</option>
                <option value="ADD_EXCEPTION">Keep the original and add this exception</option>
              </select>
            </label>
          )}
          <details className="understanding-time" open={!!edit || undefined}>
            <summary>
              Valid period <span>Optional</span>
            </summary>
            <div className="understanding-dates">
              <label className="field-label">
                Start time
                <input
                  aria-label="Understanding valid from"
                  type="datetime-local"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  required={operation === 'SUPERSEDE' && !!edit}
                />
              </label>
              <label className="field-label">
                End time
                <input
                  aria-label="Understanding valid until"
                  type="datetime-local"
                  value={until}
                  onChange={(event) => setUntil(event.target.value)}
                  min={from || undefined}
                  required={operation === 'ADD_EXCEPTION' && !!edit}
                />
              </label>
            </div>
          </details>
          <div className="field-buttons">
            <button className="primary-button" disabled={!!pending || !text.trim()}>
              {pending === 'save' && <LoaderCircle size={14} className="spin" />}
              {edit ? 'Save changes' : 'Remember this'}
            </button>
            {edit && (
              <button className="text-button" type="button" onClick={clearEditor}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </details>

      {error && (
        <p role="alert" className="harness-inline-error">
          {error}
          <button className="text-button" onClick={() => void api.runtimeOverview().then(setData)}>
            Refresh
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="harness-inline-status">
          {notice}
        </p>
      )}
      {!!data?.processing.length && (
        <details className="processing-overview">
          <summary>
            Content still to organize <span>{data.processing.length}records</span>
          </summary>
          {processingUnavailable(state) && <p className="harness-muted">{processingUnavailable(state)}</p>}
          {data.processing.map((item) => (
            <div className="processing-row" key={item.eventId}>
              <div>
                <span>{item.fileName || date(item.receivedAt)}</span>
                <small>{processingLine(item)}</small>
              </div>
              <button
                className="text-button"
                disabled={!!pending || busy || !!processingUnavailable(state)}
                onClick={() =>
                  void act('retry', async () => {
                    setData(await api.retryProcessing(item.eventId));
                  })
                }
              >
                <RotateCcw size={13} />
                Retry
              </button>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}

/** A deliberately quiet memory surface: one question per view, one expanded
 * item at a time. Lifecycle terminology belongs in the detail action, not in
 * the first scan. */
export interface MemoryWorkspaceState {
  timeZone?: string;
  editorOpen: boolean;
  text: string;
  edit?: MemoryView;
  previous?: string;
  operation: 'CORRECT' | 'SUPERSEDE' | 'ADD_EXCEPTION';
  from: string;
  until: string;
  error: string;
  notice: string;
  pending: string;
}

export const emptyMemoryWorkspace = (): MemoryWorkspaceState => ({
  editorOpen: false,
  text: '',
  operation: 'CORRECT',
  from: '',
  until: '',
  error: '',
  notice: '',
  pending: '',
});

export function MemoryPanelSimple({
  state,
  onState,
  busy,
  workspace,
  onWorkspace,
}: {
  state: State;
  onState: (s: State) => void;
  busy: boolean;
  workspace: MemoryWorkspaceState;
  onWorkspace: Dispatch<SetStateAction<MemoryWorkspaceState>>;
}) {
  const date = (value?: string) => value ? formatDateTime(value, state.settings.timeZone) : '';
  const localTime = (value?: string) => toTimeInput(value, state.settings.timeZone);
  const editForm = useRef<HTMLFormElement>(null);
  const [data, setData] = useState<RuntimeOverview>();
  const [expandedId, setExpandedId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const { error, notice, pending, editorOpen, text, edit, previous, operation, from, until } = workspace;
  const change = <K extends keyof MemoryWorkspaceState>(key: K, value: MemoryWorkspaceState[K]) =>
    onWorkspace((current) => ({ ...current, [key]: value }));
  const setError = (value: string) => change('error', value);
  const setNotice = (value: string) => change('notice', value);
  const setPending = (value: string) => change('pending', value);

  useEffect(() => {
    let mounted = true;
    api
      .runtimeOverview()
      .then((value) => mounted && setData(value))
      .catch((value) => mounted && setError(failureText(value)));
    return () => {
      mounted = false;
    };
  }, [state]);

  async function act(name: string, fn: () => Promise<void>) {
    if (pending) return;
    setPending(name);
    setError('');
    setNotice('');
    try {
      await fn();
      setData(await api.runtimeOverview());
    } catch (value) {
      setError(failureText(value));
    } finally {
      setPending('');
    }
  }

  function openEditor(memory?: MemoryView, sayAgain = false) {
    onWorkspace((current) => ({
      ...current,
      edit: sayAgain ? undefined : memory,
      previous: sayAgain ? memory?.text : undefined,
      text: sayAgain ? '' : memory?.text || '',
      operation: 'CORRECT',
      timeZone: state.settings.timeZone || DEFAULT_TIME_ZONE,
      from: sayAgain ? '' : localTime(memory?.validFrom),
      until: sayAgain ? '' : localTime(memory?.validTo),
      editorOpen: true,
      error: '',
      notice: '',
    }));
    setExpandedId('');
    requestAnimationFrame(() => editForm.current?.querySelector('textarea')?.focus());
  }
  function closeEditor() {
    onWorkspace((current) => ({
      ...current,
      edit: undefined,
      previous: undefined,
      text: '',
      from: '',
      until: '',
      editorOpen: false,
    }));
  }

  const memories = data?.memories || [];
  const current = memories.filter((memory) => memory.status === 'active');
  const decision = memories.filter((memory) => ['candidate', 'disputed'].includes(memory.status));
  const archived = memories.filter((memory) => !['active', 'candidate', 'disputed'].includes(memory.status));

  function contextLine(memory: MemoryView) {
    let condition = '';
    try {
      const parsed = JSON.parse(memory.conditions) as Condition;
      condition = parsed.op === 'all' && !parsed.terms.length ? '' : describeCondition(parsed);
    } catch {
      /* keep the first scan quiet when old data has no condition */
    }
    const times = [
      memory.validFrom ? `From ${date(memory.validFrom)}` : '',
      memory.validTo ? `Until ${date(memory.validTo)}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    return [condition, times].filter(Boolean).join(' · ');
  }

  function row(memory: MemoryView, kind: 'current' | 'decision' | 'archived') {
    const expanded = expandedId === memory.id;
    const sourceOpen = sourceId === memory.id;
    const line = contextLine(memory);
    return (
      <article className={`memory-row memory-row-${kind}`} key={memory.id}>
        <button
          type="button"
          className="memory-row-summary"
          aria-expanded={expanded}
          onClick={() => {
            setExpandedId(expanded ? '' : memory.id);
            setSourceId('');
          }}
        >
          <span className="memory-row-copy">
            <strong>{memory.text}</strong>
            {kind === 'archived' && <small>{memory.status === 'expired' ? 'This period has ended' : 'Put aside; not used in replies'}</small>}
            {kind === 'current' && memory.validTo && <small>Until {date(memory.validTo)}</small>}
          </span>
          <ChevronRight size={15} className={expanded ? 'rotated' : ''} />
        </button>
        {expanded && (
          <div className="memory-row-detail">
            {line && <p className="memory-row-context">{line}</p>}
            <button
              className="memory-detail-source"
              type="button"
              onClick={() => setSourceId(sourceOpen ? '' : memory.id)}
            >
              {sourceOpen ? 'Close source' : 'View source'}
              <ChevronRight size={13} className={sourceOpen ? 'rotated' : ''} />
            </button>
            {sourceOpen && (
              <div className="memory-source-reveal">
                {memory.evidenceIds.length ? (
                  memory.evidenceIds.map((id) => <EvidencePreview key={id} eventId={id} />)
                ) : (
                  <p className="memory-quote">The original words cannot be found, so this is not treated as confirmed evidence.</p>
                )}
                <p className="memory-source-meta">
                  {memory.verification !== 'verified' ? 'Original words still need review · ' : ''}Saved on {' '}
                  {date(memory.createdAt)}
                </p>
              </div>
            )}
            <div className="memory-detail-actions">
              {kind === 'archived' && (
                <button className="memory-detail-action" disabled={!!pending} onClick={() => openEditor(memory, true)}>
                  <Pencil size={13} />Say it again
                </button>
              )}
              {kind === 'decision' && (
                <button
                  className="memory-detail-action primary"
                  disabled={!!pending}
                  onClick={() =>
                    void act('keep', async () => {
                      onState(
                        await api.memory({
                          action: 'save',
                          id: memory.id,
                          expectedRevision: memory.revision,
                          text: memory.text,
                          operation: 'CORRECT',
                          conditions: JSON.parse(memory.conditions),
                          validFrom: memory.validFrom,
                          validTo: memory.validTo,
                        }),
                      );
                      setNotice('Remembered. It will be used when relevant.');
                      setExpandedId('');
                    })
                  }
                >
                  Remember it this way
                </button>
              )}
              {kind !== 'archived' && (
                <button
                  className="memory-detail-action"
                  onClick={() => openEditor(memory)}
                  disabled={!!pending}
                >
                  <Pencil size={13} />
                  Reword
                </button>
              )}
              {kind === 'current' && (
                <button
                  className="memory-detail-action"
                  disabled={!!pending}
                  onClick={() =>
                    void act('deactivate', async () => {
                      onState(
                        await api.memory({
                          action: 'deactivate',
                          id: memory.id,
                        }),
                      );
                      setNotice('Put aside. It will not be used in future replies.');
                      setExpandedId('');
                    })
                  }
                >
                  Do not use this one
                </button>
              )}
              {kind === 'decision' && (
                <button
                  className="memory-detail-action"
                  disabled={!!pending}
                  onClick={() =>
                    void act('deactivate', async () => {
                      onState(
                        await api.memory({
                          action: 'deactivate',
                          id: memory.id,
                        }),
                      );
                      setNotice('Put aside. It will not be treated as confirmed understanding.');
                      setExpandedId('');
                    })
                  }
                >
                  Do not use for now
                </button>
              )}
              <button
                className="memory-detail-action danger"
                disabled={!!pending}
                onClick={() =>
                  void act('delete', async () => {
                    onState(await api.memory({ action: 'delete', id: memory.id }));
                    setNotice('This understanding and its derived local content were deleted together.');
                    setExpandedId('');
                  })
                }
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </article>
    );
  }

  return (
    <section className="memory-panel-simple">
      <Switch
        checked={state.settings.memoryEnabled}
        label="Let Anima learn about me over time"
        disabled={!!pending || (busy && !state.settings.memoryEnabled)}
        onChange={(value) =>
          void act('toggle', async () => {
            onState(await api.saveSettings({ memoryEnabled: value }));
          })
        }
      />
      <div className={`memory-layout ${editorOpen ? 'is-editing' : ''}`}>
      <div className="memory-records">
      {!!current.length && (
        <section className="memory-group-simple">
          <h3 className="sr-only">Current remembered content</h3>
          {current.map((memory) => row(memory, 'current'))}
        </section>
      )}
      {!!(decision.length || archived.length || data?.processing.length) && (
        <details className="memory-more-simple">
          <summary>
            <span>Other content</span>
            <small>{decision.length + archived.length + (data?.processing.length || 0)}records</small>
          </summary>
          <div className="memory-more-content">
            {!!decision.length && (
              <section className="memory-subgroup memory-review-simple">
                <h3>Does this understanding fit?</h3>
                <p className="memory-subgroup-intro">It will be used in later replies only after you accept it.</p>
                <div>{decision.map((memory) => row(memory, 'decision'))}</div>
              </section>
            )}
            {!!archived.length && (
              <section className="memory-subgroup memory-archive-simple">
                <h3>Put aside</h3>
                <div>{archived.map((memory) => row(memory, 'archived'))}</div>
              </section>
            )}
            {!!data?.processing.length && (
              <section className="memory-subgroup processing-overview">
                <h3>Not fully organized</h3>
                {processingUnavailable(state) && <p className="harness-muted">{processingUnavailable(state)}</p>}
                {data.processing.map((item) => (
                  <div className="processing-row" key={item.eventId}>
                    <div>
                      <span>{item.fileName || date(item.receivedAt)}</span>
                      <small>
                        {processingLine(item)}
                      </small>
                    </div>
                    <button
                      className="text-button"
                      disabled={!!pending || busy || !!processingUnavailable(state)}
                      onClick={() =>
                        void act('retry', async () => {
                          setData(await api.retryProcessing(item.eventId));
                        })
                      }
                    >
                      <RotateCcw size={13} />
                      Read again
                    </button>
                  </div>
                ))}
              </section>
            )}
          </div>
        </details>
      )}
      {!memories.length && <p className="memory-empty">No records about you have been saved yet.</p>}
      </div>
      <div className={`memory-editor-simple ${editorOpen ? 'open' : ''}`}>
        {!editorOpen ? (
          <button
            type="button"
            className="memory-add-trigger"
            onClick={() => openEditor()}
            disabled={!!pending}
          >
            <span>Tell Anima something</span>
            <ChevronRight size={15} />
          </button>
        ) : (
          <form
            ref={editForm}
            onSubmit={(event) => {
              event.preventDefault();
              void act('save', async () => {
                onState(
                  await api.memory({
                    action: 'save',
                    id: edit?.id,
                    expectedRevision: edit?.revision,
                    text: text.trim(),
                    operation: edit ? operation : undefined,
                    conditions: edit ? JSON.parse(edit.conditions) : undefined,
                    validFrom: fromTimeInput(from, workspace.timeZone || state.settings.timeZone),
                    validTo: fromTimeInput(until, workspace.timeZone || state.settings.timeZone),
                  }),
                );
                closeEditor();
                setNotice('Saved');
              });
            }}
          >
            <div className="memory-editor-heading">
              <strong>{edit ? 'Make this understanding fit you better.' : 'What would you like me to remember?'}</strong>
              <button type="button" className="text-button" onClick={closeEditor} disabled={!!pending}>
                Cancel
              </button>
            </div>
            {previous && <div className="memory-previous"><small>Earlier, you said</small><p>{previous}</p><span>If this still matters, tell me again in your own words today.</span></div>}
            <label className="field-label">
              {edit ? 'What you mean now' : 'Tell Anima something about you'}
              <textarea
                aria-label="Preference text"
                value={text}
                onChange={(event) => change('text', event.target.value)}
                disabled={!!pending}
                maxLength={4000}
                rows={3}
                placeholder="For example: I usually prefer uninterrupted study, but today I want to rest."
              />
            </label>
            {edit && (
              <fieldset className="memory-change-options" disabled={!!pending}>
                <legend>What kind of change is this?</legend>
                {([
                  ['CORRECT', 'The earlier understanding was wrong', 'Use this statement to correct the earlier understanding.'],
                  ['SUPERSEDE', 'Things are different from now on', 'Preserve the past and apply the change from your selected time.'],
                  ['ADD_EXCEPTION', 'Only this time', 'Keep the usual preference. This exception has its own end time.'],
                ] as const).map(([value, label, detail]) => (
                  <label key={value} className={operation === value ? 'selected' : ''}>
                    <input type="radio" name="memory-change" value={value} checked={operation === value}
                      onChange={() => change('operation', value)} />
                    <span><strong>{label}</strong><small>{detail}</small></span>
                  </label>
                ))}
              </fieldset>
            )}
            <details className="understanding-time" open={!!edit || undefined}>
              <summary>
                {edit && operation === 'ADD_EXCEPTION' ? 'When this exception ends' : edit && operation === 'SUPERSEDE' ? 'When the change begins' : 'Valid period'}
                {(!edit || operation === 'CORRECT') && <span>Optional</span>}
              </summary>
              <p className="field-label">{workspace.timeZone || state.settings.timeZone || DEFAULT_TIME_ZONE}</p>
              <div className="understanding-dates">
                <label className="field-label">
                  Start time
                  <input
                    aria-label="Understanding valid from"
                    type="datetime-local"
                    value={from}
                    onChange={(event) => change('from', event.target.value)}
                    disabled={!!pending}
                    required={operation === 'SUPERSEDE' && !!edit}
                  />
                </label>
                <label className="field-label">
                  End time
                  <input
                    aria-label="Understanding valid until"
                    type="datetime-local"
                    value={until}
                    onChange={(event) => change('until', event.target.value)}
                    disabled={!!pending}
                    min={from || undefined}
                    required={operation === 'ADD_EXCEPTION' && !!edit}
                  />
                </label>
              </div>
            </details>
            <button className="primary-button" disabled={!!pending || !text.trim()}>
              {pending === 'save' && <LoaderCircle size={14} className="spin" />}
              {edit ? operation === 'ADD_EXCEPTION' ? 'Remember this exception' : 'Use the updated understanding' : 'Remember this'}
            </button>
          </form>
        )}
      </div>
      </div>
      {error && (
        <p role="alert" className="harness-inline-error">
          {error}
          <button className="text-button" onClick={() => void api.runtimeOverview().then(setData)}>
            Refresh
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="harness-inline-status">
          {notice}
        </p>
      )}
    </section>
  );
}
