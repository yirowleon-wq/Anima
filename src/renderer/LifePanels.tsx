import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Monitor,
  RotateCcw,
  MapPin,
  X,
} from 'lucide-react';
import type { Action, State } from '../shared/types';
import type { AgendaChangePreview, AgendaFocus, AgendaPreviewChangeInput, AgendaReference } from '../shared/agenda';
import { calendarCommitment } from '../shared/calendar';
import type { LetterFocusContext } from '../shared/reflective-letter';
import type {
  MatterSelectionInput,
  PreparationView,
  PreparationFocusContext,
  SharedMatterView,
  SurfaceView,
} from '../shared/presentation';
import { Modal, uiError } from './ui';
import { RichText } from './RichText';
import { LetterMessage } from './LetterMessage';
import {
  DEFAULT_TIME_ZONE,
  formatDateTime,
  fromTimeInput,
  timeZoneLabel,
  toTimeInput,
} from './time';

const api = window.anima;
const errorText = uiError;

export function AgendaEditor({
  original,
  current,
  timeZone = DEFAULT_TIME_ZONE,
  initialStartsAt,
  initialDurationMinutes,
  restoreRequestId,
  initialOccurrenceDate,
  embedded = false,
  boundary,
  includeCampus = false,
  onDiscuss,
  onOpenOrigin,
  onMap,
  onTrialChange,
  calendarVersionKey,
  onReload,
  onState,
  onSaved,
  onClose,
}: {
  original: Action;
  current?: Action;
  timeZone?: string;
  /** A trial position, never a replacement for the original object/revision. */
  initialStartsAt?: string;
  initialDurationMinutes?: number | null;
  restoreRequestId?: number;
  initialOccurrenceDate?: string;
  embedded?: boolean;
  boundary?: Required<Pick<State, 'privacyEpoch' | 'policyRevision' | 'sourceBoundary'>>;
  includeCampus?: boolean;
  onDiscuss?: (focus: AgendaFocus, label: string) => void;
  onOpenOrigin?: (record: AgendaReference) => void;
  onMap?: (id: string) => void;
  onTrialChange?: (startsAt?: string, durationMinutes?: number | null) => void;
  calendarVersionKey?: string;
  onReload?: (item: Action) => void;
  onState: (state: State) => void;
  onSaved?: (saved: Action, previous: Action, timing?: { before?: string; after?: string;
    occurrenceDate?: string; kind: 'time_change' | 'other' }) => void;
  onClose: () => void;
}) {
  const zone = original.timeZone || timeZone;
  const originalCivil = toTimeInput(original.startsAt, zone);
  const anchorDate = initialOccurrenceDate || original.allDayDate || originalCivil.slice(0, 10);
  const [repeatScope, setRepeatScope] = useState<'once' | 'series'>(
    original.recurrence ? 'once' : 'series',
  );
  const [occurrenceDate, setOccurrenceDate] = useState(anchorDate);
  const firstException = original.exceptions?.find((item) => item.onDate === anchorDate);
  const draftInstant = !original.allDayDate ? initialStartsAt : undefined;
  const [title, setTitle] = useState(original.title);
  const [detail, setDetail] = useState(firstException?.detail ?? original.detail);
  const [time, setTime] = useState(
    draftInstant || firstException?.startsAt ? toTimeInput(draftInstant || firstException?.startsAt, zone)
      : original.recurrence && original.startsAt ? `${anchorDate}T${originalCivil.slice(11)}` : originalCivil,
  );
  const [allDayDate, setAllDayDate] = useState(original.allDayDate || '');
  const [duration, setDuration] = useState(
    initialDurationMinutes === null || initialDurationMinutes === undefined && firstException?.durationMinutes === null
      ? ''
      : String(initialDurationMinutes ?? firstException?.durationMinutes ?? original.durationMinutes ?? ''),
  );
  const lastRestore = useRef(restoreRequestId);
  useEffect(() => {
    if (restoreRequestId === undefined || lastRestore.current === restoreRequestId) return;
    lastRestore.current = restoreRequestId;
    setTime(initialStartsAt || firstException?.startsAt ? toTimeInput(initialStartsAt || firstException?.startsAt, zone)
      : original.recurrence && original.startsAt ? `${anchorDate}T${originalCivil.slice(11)}` : originalCivil);
    setDuration(initialDurationMinutes === null || initialDurationMinutes === undefined && firstException?.durationMinutes === null ? ''
      : String(initialDurationMinutes ?? firstException?.durationMinutes ?? original.durationMinutes ?? ''));
  }, [restoreRequestId, initialStartsAt, initialDurationMinutes, zone]);
  const [pending, setPending] = useState(false);
  const editorLive = useRef(true);
  useLayoutEffect(() => {
    editorLive.current = true;
    return () => { editorLive.current = false; };
  }, []);
  const [error, setError] = useState('');
  const [base] = useState(original);
  const titleId = useId();
  const [preview, setPreview] = useState<AgendaChangePreview>();
  const [previewError, setPreviewError] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const previewGeneration = useRef(0);
  const trialCallback = useRef(onTrialChange);
  trialCallback.current = onTrialChange;
  const once = !!original.recurrence && repeatScope === 'once';
  const previousException = original.exceptions?.find((item) => item.onDate === occurrenceDate);
  const cancelledOccurrence = once && !!(current ? current.exceptions?.find(item => item.onDate === occurrenceDate) : previousException)?.cancelled;
  const changed = !!current && (current.revision || 1) !== (base.revision || 1);
  const personalEdits = title !== original.title || detail !== (once ? previousException?.detail ?? original.detail : original.detail)
    || allDayDate !== (original.allDayDate || '');

  const editDrafts = useRef<Record<string, { time: string; detail: string; duration: string }>>({});
  function rememberDraft() {
    editDrafts.current[once ? `once:${occurrenceDate}` : 'series'] = { time, detail, duration };
  }
  function restoreDraft(key: string, date?: string) {
    const exception = date ? original.exceptions?.find((item) => item.onDate === date) : undefined;
    const saved = editDrafts.current[key];
    setTime(
      saved?.time ??
        (exception?.startsAt
          ? toTimeInput(exception.startsAt, zone)
          : date && original.startsAt
            ? `${date}T${originalCivil.slice(11)}`
            : originalCivil),
    );
    setDetail(saved?.detail ?? exception?.detail ?? original.detail);
    setDuration(
      saved?.duration ??
        (exception?.durationMinutes === null
          ? ''
          : String(exception?.durationMinutes ?? original.durationMinutes ?? '')),
    );
  }
  function chooseOccurrence(date: string) {
    rememberDraft();
    setOccurrenceDate(date);
    restoreDraft(`once:${date}`, date);
    setError('');
  }
  function chooseScope(value: 'once' | 'series') {
    rememberDraft();
    setRepeatScope(value);
    restoreDraft(
      value === 'once' ? `once:${occurrenceDate}` : 'series',
      value === 'once' ? occurrenceDate : undefined,
    );
    setError('');
  }
  function timeDescription(civil: string, minutes?: number, date?: string, instantHint?: string) {
    if (date) return `${date.replaceAll('-', '.')} · All day`;
    if (!civil) return 'No time selected';
    let end = '';
    try {
      const instant = fromTimeInput(civil, zone, instantHint || original.startsAt);
      if (instant && minutes) {
        const endCivil = toTimeInput(new Date(Date.parse(instant) + minutes * 60000).toISOString(), zone);
        end = ` — ${endCivil.slice(0, 10) !== civil.slice(0, 10) ? `${endCivil.slice(0, 10)} ` : ''}${endCivil.slice(11, 16)}`;
      }
    } catch {
      /* An incomplete or ambiguous draft is explained by the existing save validation. */
    }
    return `${civil.slice(0, 10)} ${civil.slice(11, 16)}${end}`;
  }
  function endDescription(start: string, end: string) {
    return toTimeInput(start, zone).slice(0, 10) === toTimeInput(end, zone).slice(0, 10)
      ? toTimeInput(end, zone).slice(11, 16) : formatDateTime(end, zone);
  }
  const beforeCivil =
    once && original.startsAt
      ? previousException?.startsAt
        ? toTimeInput(previousException.startsAt, zone)
        : `${occurrenceDate}T${originalCivil.slice(11)}`
      : originalCivil;
  const beforeDuration =
    once && previousException?.durationMinutes === null
      ? undefined
      : once
        ? (previousException?.durationMinutes ?? original.durationMinutes)
        : original.durationMinutes;
  let currentInstant: string | undefined;
  try { currentInstant = !original.allDayDate ? fromTimeInput(time, zone, draftInstant || previousException?.startsAt || original.startsAt) : undefined; }
  catch { /* Keep the editable civil value; the form explains it on save. */ }
  const originalInstant = beforeCivil ? (() => { try { return fromTimeInput(beforeCivil, zone, previousException?.startsAt || original.startsAt); } catch { return undefined; } })() : undefined;
  const trialInstant = currentInstant && (currentInstant !== originalInstant || Number(duration) !== (beforeDuration || 0)) ? currentInstant : undefined;
  function assessmentInput(): AgendaPreviewChangeInput | undefined {
    if (!boundary || !current || changed || cancelledOccurrence || (!original.allDayDate && !currentInstant)
      || !title.trim() || duration && (!Number.isInteger(Number(duration)) || Number(duration) < 1 || Number(duration) > 1440)) return;
    const changes = once ? { ...(currentInstant ? { startsAt: currentInstant } : {}),
      ...(!original.allDayDate ? { durationMinutes: duration ? Number(duration) : null } : {}), detail }
      : { title: title.trim(), detail, ...(original.allDayDate ? { allDayDate } : {
        ...(currentInstant ? { startsAt: currentInstant } : {}), durationMinutes: duration ? Number(duration) : null }) };
    return { record: { id: base.id, revision: base.revision || 1, ...(once ? { occurrenceDate } : {}) },
      changes, timeZone: zone, includeCampus, ...boundary };
  }
  useEffect(() => { trialCallback.current?.(trialInstant, Number.isInteger(Number(duration))
    && Number(duration) > 0 && Number(duration) <= 1440 ? Number(duration) : null); }, [trialInstant, duration]);
  useEffect(() => {
    const request = ++previewGeneration.current;
    setPreview(undefined); setPreviewError(''); setPreviewing(false);
    const input = assessmentInput();
    if (!input) return;
    setPreviewing(true);
    void api.agendaPreviewChange(input).then(value => {
      if (previewGeneration.current === request) setPreview(value);
    }).catch(caught => {
      if (previewGeneration.current === request) setPreviewError(errorText(caught));
    }).finally(() => { if (previewGeneration.current === request) setPreviewing(false); });
    return () => { previewGeneration.current++; };
  }, [current?.revision, currentInstant, once, occurrenceDate, title, detail, duration, allDayDate, zone, includeCampus, calendarVersionKey,
    cancelledOccurrence, boundary?.privacyEpoch, boundary?.policyRevision, boundary?.sourceBoundary]);

  async function save(cancelOccurrence = false) {
    setPending(true);
    setError('');
    try {
      const version = base;
      if (!version) throw new Error('This event was removed. Your writing remains here.');
      if (!current || changed) throw new Error('This event has changed. Review the current version; your trial position remains here.');
      const input = !cancelOccurrence && assessmentInput();
      if (input) {
        const fresh = await api.agendaPreviewChange(input);
        if (!preview?.assessmentKey || !fresh.assessmentKey || fresh.assessmentKey !== preview.assessmentKey) {
          if (editorLive.current) setPreview(fresh);
          throw new Error('Review this trial position alongside nearby events before saving.');
        }
      }
      const startsAt = original.allDayDate || cancelOccurrence
        ? undefined
        : fromTimeInput(time, zone, draftInstant || previousException?.startsAt || original.startsAt);
      let item: Action;
      if (once) {
        const previous = (version.exceptions || []).find((entry) => entry.onDate === occurrenceDate);
        const exception = cancelOccurrence ? { ...previous, onDate: occurrenceDate, cancelled: true } : {
          ...previous,
          onDate: occurrenceDate,
          cancelled: cancelOccurrence,
          ...(startsAt ? { startsAt } : {}),
          ...(!original.allDayDate ? { durationMinutes: duration ? Number(duration) : null } : {}),
          detail,
        };
        item = {
          ...version,
          exceptions: [
            ...(version.exceptions || []).filter((entry) => entry.onDate !== occurrenceDate),
            exception,
          ],
        };
      } else {
        item = {
          ...version,
          title: title.trim(),
          detail,
          startsAt,
          timeZone: zone,
          ...(original.allDayDate ? { allDayDate } : {}),
          durationMinutes: duration ? Number(duration) : undefined,
        };
      }
      const next = await api.action({ action: 'save', item });
      onState(next);
      const saved = next.agenda.find(entry => entry.id === item.id);
      if (saved) onSaved?.(saved, version, { before: originalInstant, after: startsAt,
        ...(once ? { occurrenceDate } : {}), kind: trialInstant && !cancelOccurrence && !cancelledOccurrence ? 'time_change' : 'other' });
      if (editorLive.current) onClose();
    } catch (caught) {
      if (!editorLive.current) return;
      setError(errorText(caught));
      try {
        onState(await api.state());
      } catch {
        /* The edit remains available if refreshing is also unavailable. */
      }
    } finally {
      if (editorLive.current) setPending(false);
    }
  }
  const form = (
      <form
        className="panel-body"
        onKeyDown={event => {
          if (event.key === 'Escape' && !pending) { event.preventDefault(); event.stopPropagation(); onClose(); }
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className={`field-label ${embedded ? 'agenda-title-field' : ''}`}>
          <span>This event</span>
          <input
            autoFocus={!embedded}
            data-agenda-field="title" aria-label="Event title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={160}
            disabled={once || pending}
          />
        </label>
        {!!original.recurrence && (
          <fieldset className="agenda-edit-repeat">
            <legend>What would you like to change?</legend>
            <label>
              <input
                type="radio"
                name="repeat-scope"
                checked={repeatScope === 'once'}
                disabled={pending}
                onChange={() => chooseScope('once')}
              />
              This occurrence only
            </label>
            <label>
              <input
                type="radio"
                name="repeat-scope"
                checked={repeatScope === 'series'}
                disabled={pending}
                onChange={() => chooseScope('series')}
              />
              Entire recurring series
            </label>
            {once ? (
              <label className="field-label">
                Which occurrence
                <input
                  type="date"
                  aria-label="Choose recurring event occurrence date"
                  value={occurrenceDate}
                  disabled={pending}
                  onChange={(event) => chooseOccurrence(event.target.value)}
                  required
                />
              </label>
            ) : (
              <p>The title, start time, and details apply to the series. Individual exceptions are preserved.</p>
            )}
          </fieldset>
        )}
        {(original.allDayDate ? !once && allDayDate !== original.allDayDate
          : time !== beforeCivil || (duration ? Number(duration) : undefined) !== beforeDuration) && <div className="agenda-edit-comparison" aria-label="Compare previous and proposed times">
          <div>
            <span className="sr-only">Before</span>
            <strong>
              {timeDescription(
                beforeCivil,
                beforeDuration,
                original.allDayDate ? (once ? occurrenceDate : original.allDayDate) : undefined,
                previousException?.startsAt || original.startsAt,
              )}
            </strong>
          </div>
          <span aria-hidden="true">→</span>
          <div>
            <span className="sr-only">{trialInstant ? 'Try this time' : 'Now'}</span>
            <strong>
              {timeDescription(
                time,
                duration ? Number(duration) : undefined,
                original.allDayDate ? (once ? occurrenceDate : allDayDate) : undefined,
                draftInstant || previousException?.startsAt || original.startsAt,
              )}
            </strong>
          </div>
        </div>}
        {original.allDayDate ? (
          once ? (
            <p className="agenda-all-day">This is an all-day event. You can edit this occurrence’s details separately.</p>
          ) : (
            <label className="field-label">
              Date
              <input
                type="date"
                aria-label="Event date"
                value={allDayDate}
                disabled={pending}
                onChange={(event) => setAllDayDate(event.target.value)}
                required
              />
            </label>
          )
        ) : (
          <div className="agenda-edit-time-fields">
            <label className="field-label">
              When · {timeZoneLabel(zone)}
              <input
                type="datetime-local"
                step="1"
                data-agenda-field="start" aria-label="Event start time"
                value={time}
                disabled={pending}
                onChange={(event) => setTime(event.target.value)}
                required={!!original.startsAt}
              />
            </label>
            <label className="field-label">
              {original.planRef ? 'Complete occupied time' : 'Duration'} ·  min
              <input
                type="number"
                aria-label="Event duration"
                min="1"
                max="1440"
                placeholder="Not set"
                value={duration}
                disabled={pending}
                onChange={(event) => setDuration(event.target.value)}
                required={!once && !!original.durationMinutes}
              />
            </label>
          </div>
        )}
        <details className="agenda-edit-details" open={!embedded || !!(firstException?.detail || original.detail) || undefined}>
        <summary>Details<ChevronDown size={13} /></summary>
        <label className="field-label">
          <span className={embedded ? 'sr-only' : ''}>Additional details</span>
          <textarea
            aria-label="Event details"
            value={detail}
            disabled={pending}
            onChange={(event) => setDetail(event.target.value)}
            rows={embedded ? 2 : 3}
            maxLength={1500}
          />
        </label>
        </details>
        <div className="agenda-edit-assessment" aria-busy={previewing}>
          {preview?.occupancy && <details className="agenda-sandbox-occupancy"><summary>Original preparation and travel<ChevronDown size={12} /></summary>
            <div>{preview.occupancy.parts.map(part => <p key={`${part.kind}:${part.start}`}>
              <span>{{ setup: 'Preparation', work: 'Work', cleanup: 'Cleanup' }[part.kind]}</span>
              <time>{formatDateTime(part.start, zone)} — {endDescription(part.start, part.end)}</time>
            </p>)}
            {preview.occupancy.related.map(part => <p key={part.record.id}><span>{part.title}</span>
              <time>{formatDateTime(part.start, zone)} — {endDescription(part.start, part.end)}</time></p>)}
            {!preview.occupancy.relatedComplete && <p>Related time blocks also need review.</p>}
            </div>
          </details>}
          {!!preview?.conflicts.length && <div className="agenda-edit-conflicts" role="status">
            <p>{preview.conflicts.some(conflict => conflict.uncertain) ? 'Review this time alongside these events' : 'This time overlaps these events'}</p>
            {preview.conflicts.map(conflict => <div key={`${conflict.occurrenceId || conflict.id}:${conflict.start}`}>
              <strong>{conflict.title}</strong><span>{formatDateTime(conflict.start, zone)}{conflict.end ? ` — ${endDescription(conflict.start, conflict.end)}` : ' onward, end not set'}</span>
              {conflict.uncertain && <span>The end time is unknown, so there may be a conflict.</span>}
              {conflict.overlapStart && conflict.overlapEnd && <span className="agenda-conflict-overlap">Overlaps at {toTimeInput(conflict.overlapStart, zone).slice(11, 16)} — {endDescription(conflict.overlapStart, conflict.overlapEnd)}</span>}
            </div>)}
          </div>}
          {!!preview?.alternatives?.length && <div className="agenda-sandbox-alternatives" role="group" aria-label="Try another time">
            {preview.alternatives.map(alternative => <button type="button" key={alternative.startsAt}
              disabled={pending || changed} onClick={() => setTime(toTimeInput(alternative.startsAt, zone))}>
              <span>{alternative.direction === 'earlier' ? 'Move the complete block earlier' : 'Move the complete block later'}</span>
              <strong>{toTimeInput(alternative.startsAt, zone).slice(11, 16)} — {endDescription(alternative.startsAt, alternative.end)}</strong>
              <ChevronRight size={15} aria-hidden="true" />
            </button>)}
          </div>}
          {previewError && <p className="agenda-preview-error" role="status">{previewError}</p>}
          {preview && <details className="agenda-preview-sources"><summary>View agenda scope<ChevronDown size={12} /></summary>
            <div><p>{formatDateTime(preview.window.from, zone)} — {formatDateTime(preview.window.to, zone)}</p>
              {preview.recurringScope === 'series' && <p>This shows events near the start date. Other dates in the series need separate review.</p>}
              {preview.sourceCoverage.map(source => <p key={source.sourceId}>{source.sourceId === 'local-agenda' ? 'Local agenda' : 'Selected class schedule'}{source.status === 'complete' ? '' : ' · Some coverage remains unread'}</p>)}
              {preview.unknown.map((value, index) => <p key={index}>{value}</p>)}</div>
          </details>}
        </div>
        {original.planning?.placeId && onMap && <button type="button" className="text-button agenda-place-link" disabled={pending}
          onClick={() => onMap(original.planning!.placeId!)}><MapPin size={15} />View on map<ArrowUpRight size={14} /></button>}
        {(error || changed || cancelledOccurrence || !current) && (
          <div className="inline-problem" role="alert">
            <p>
              {error ||
                (!current ? 'This event was removed. Your writing is preserved.' : cancelledOccurrence
                  ? 'This occurrence was cancelled. The series remains on other dates.'
                  : 'This event was edited elsewhere. Your writing is preserved below.')}
            </p>
            {changed && current && (
              <p>
                Current event: {current.title} ·{' '}
                {cancelledOccurrence ? 'This occurrence is cancelled' : current.allDayDate
                  ? `${current.allDayDate} · All day`
                  : current.startsAt
                    ? formatDateTime(current.startsAt, current.timeZone || timeZone)
                    : 'Time not set'}
              </p>
            )}
            {changed && current && onReload && <button type="button" className="text-button" disabled={pending}
              onClick={() => onReload(current)}>Review current version<ArrowUpRight size={14} /></button>}
          </div>
        )}
        <div className="field-buttons">
          <button
            className="primary-button"
            disabled={pending || !title.trim() || !current || changed || previewing || !!previewError}
          >
            {pending ? 'Saving…' : cancelledOccurrence ? 'Restore this occurrence' : trialInstant
              ? calendarCommitment(original).occupiesTime ? 'Accept this time' : 'Save this time' : 'Save'}
          </button>
          <button type="button" className="text-button" onClick={onClose} disabled={pending}>
            {trialInstant ? 'Put back for now' : 'Cancel'}
          </button>
        </div>
        {onDiscuss && <button type="button" className="text-button agenda-discuss-link" disabled={pending || !current || changed || personalEdits
          || !!duration && (!Number.isInteger(Number(duration)) || Number(duration) < 1 || Number(duration) > 1440)}
          onClick={() => {
            if (!current) return;
            const focus: AgendaFocus = { record: { id: current.id, revision: current.revision || 1, ...(once ? { occurrenceDate } : {}) },
              ...(trialInstant ? { trial: { proposedStart: trialInstant, durationMinutes: duration ? Number(duration) : null } } : {}) };
            onDiscuss(focus, `${original.title}${focus.trial ? ` · ${formatDateTime(trialInstant!, zone)} · ${duration ? `${Number(duration)} min` : 'End not set'}Trial` : ''}`);
          }}>{trialInstant && preview?.occupancy && (preview.occupancy.related.length > 0 || preview.occupancy.multipleWorkUnits)
            ? 'Discuss with preparation and travel' : trialInstant && original.planRef ? 'Review the complete occupied block'
              : trialInstant ? 'Discuss this trial position' : 'Discuss this event'}<ArrowUpRight size={14} /></button>}
        {onOpenOrigin && <button type="button" className="text-button agenda-origin-link" disabled={pending || !current || changed || personalEdits}
          title={personalEdits ? 'Save or cancel changes before returning to the original conversation' : 'Return to the conversation where this event was discussed'}
          onClick={() => { if (current) onOpenOrigin({ id: current.id, revision: current.revision || 1, ...(once ? { occurrenceDate } : {}) }); }}>
          <BookOpen size={14} aria-hidden="true" />Original conversation</button>}
        {once && !cancelledOccurrence && <button type="button" className="text-button agenda-cancel-once" disabled={pending || !current || changed}
          onClick={() => void save(true)}>Cancel this occurrence</button>}
      </form>
  );
  return embedded ? <section className="agenda-editor agenda-editor-inline" aria-labelledby={titleId}>
    <header className="agenda-inline-heading"><h2 className="sr-only" id={titleId}>{original.title}</h2>
      <button type="button" className="icon-button" aria-label="Close event" disabled={pending} onClick={onClose}><X size={17} /></button></header>
    {form}</section> : <Modal title="Edit event" onClose={() => { if (!pending) onClose(); }} className="agenda-editor">{form}</Modal>;
}

export function PreparationShelf({
  items,
  inline = false,
  timeZone = DEFAULT_TIME_ZONE,
  onState,
  onContinue,
  onBodyVisibility,
  quoteAsMessageBody = false,
  openRequest,
}: {
  items: PreparationView[];
  inline?: boolean;
  timeZone?: string;
  onState: (state: State) => void;
  onContinue: (text: string, context?: LetterFocusContext | PreparationFocusContext) => void;
  onBodyVisibility?: (body: string | undefined) => void;
  quoteAsMessageBody?: boolean;
  openRequest?: { id: string; revision: number; helpRecordId?: string; requestId: number };
}) {
  const [expanded, setExpanded] = useState(inline),
    [visibleCount, setVisibleCount] = useState(5),
    [opened, setOpened] = useState<string | undefined>(inline ? items[0]?.id : undefined),
    [pending, setPending] = useState(''),
    [error, setError] = useState('');
  const shown = useRef(new Set<string>()),
    content = useRef<HTMLDivElement>(null);
  const requested = useRef<number | undefined>(undefined), scrolled = useRef<number | undefined>(undefined);
  const current = items.find((item) => item.id === opened);
  useLayoutEffect(() => {
    if (!openRequest || requested.current === openRequest.requestId) return;
    const index = items.findIndex(item => item.id === openRequest.id && item.revision === openRequest.revision && item.helpRecordId === openRequest.helpRecordId);
    if (index < 0) return;
    requested.current = openRequest.requestId;
    setExpanded(true);
    setVisibleCount(count => Math.max(count, index + 1));
    setOpened(openRequest.id);
    void act(items[index], 'opened');
  }, [openRequest, items]);
  useEffect(() => {
    if (!openRequest || scrolled.current === openRequest.requestId || !expanded || !content.current
      || current?.id !== openRequest.id || current.revision !== openRequest.revision || current.helpRecordId !== openRequest.helpRecordId) return;
    scrolled.current = openRequest.requestId;
    content.current.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    content.current.focus({ preventScroll: true });
  }, [openRequest, expanded, current?.id, current?.revision, current?.helpRecordId, visibleCount]);
  const bodyVisibility = useRef(onBodyVisibility);
  bodyVisibility.current = onBodyVisibility;
  const visibleBody = expanded && items.slice(0, visibleCount).some(item => item === current)
    ? current?.body : undefined;
  useLayoutEffect(() => {
    const report = bodyVisibility.current;
    report?.(visibleBody);
    return () => report?.(undefined);
  }, [current?.id, current?.revision, current?.helpRecordId, visibleBody]);
  useEffect(() => {
    if (!expanded || !current || !content.current) return;
    const key = `${current.id}:${current.revision}`;
    let visible = false;
    const expose = () => {
        if (!visible || document.hidden || !document.hasFocus() || shown.current.has(key)) return;
        shown.current.add(key);
        void api
          .helpAction({
            id: current.id,
            expectedRevision: current.revision,
            operation: 'displayed',
          })
          .then(onState)
          .catch((error) => { shown.current.delete(key); setError(errorText(error)); });
    };
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries.some(entry => entry.isIntersecting && entry.intersectionRect.height >= Math.min(60, entry.boundingClientRect.height));
        expose();
      },
      { threshold: 0 },
    );
    observer.observe(content.current);
    window.addEventListener('focus', expose); document.addEventListener('visibilitychange', expose);
    return () => { observer.disconnect(); window.removeEventListener('focus', expose); document.removeEventListener('visibilitychange', expose); };
  }, [current?.id, current?.revision, expanded]);
  if (!items.length) return null;
  async function act(
    item: PreparationView,
    operation: 'opened' | 'dismiss' | 'once' | 'stop_topic',
  ) {
    setPending(operation);
    setError('');
    try {
      onState(
        await api.helpAction({
          id: item.id,
          expectedRevision: item.revision,
          operation,
        }),
      );
      if (operation === 'dismiss' || operation === 'stop_topic') setOpened(undefined);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setPending('');
    }
  }
  return (
    <section
      className={`preparation-shelf ${expanded ? 'is-open' : ''} ${inline ? 'is-inline' : ''} ${items.some(item => item.reflectiveLetter) ? 'has-letter' : ''}`}
      aria-label="Material prepared for you"
    >
      <button
        className="shelf-trigger"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <BookOpen size={15} />
        <span>Prepared for you</span>
        <ChevronDown size={14} />
      </button>
      {expanded && (
        <div className="shelf-list">
          {items.slice(0, visibleCount).map((item) => (
            <div className={`preparation-row ${item.reflectiveLetter ? 'is-letter' : ''}`} key={item.id}>
              {!(inline && item.reflectiveLetter && item.id === opened) && (
              <button
                className="preparation-title"
                aria-expanded={item.id === opened}
                onClick={() => {
                  const next = item.id !== opened;
                  setOpened(next ? item.id : undefined);
                  if (next) void act(item, 'opened');
                }}
              >
                <span>{item.title}</span>
                <ChevronRight size={15} />
              </button>
              )}
              {item.id === opened && (
                <div className="preparation-body" ref={content} tabIndex={-1}>
                  {item.reflectiveLetter ? (
                    <LetterMessage letter={item.reflectiveLetter} pending={!!pending} onContinue={onContinue}
                      onDismiss={() => act(item, 'dismiss')} onOpenSource={() => void act(item, 'opened')} />
                  ) : (
                    <>
                  <div className="markdown" data-primary-help-prose={quoteAsMessageBody ? '' : undefined}>
                    <RichText text={item.body} />
                  </div>
                  <details className="material-detail">
                    <summary>When this preparation is useful</summary>
                    <p>
                      Here for reference, without adding it to your agenda. Valid through {' '}
                      {new Date(item.expiresAt).toLocaleString('en-US', {
                        timeZone,
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      . If the circumstances change, its relevance will be reviewed.
                    </p>
                    {item.sources?.map((source, i) => (
                      <p key={i}>
                        {source.label}
                        {source.at ? ` · ${formatDateTime(source.at, timeZone)}` : ''}
                      </p>
                    ))}
                  </details>
                  <div className="preparation-actions">
                    <button
                      className="text-button"
                      onClick={() => onContinue('', { preparationReference: { id: item.id, revision: item.revision,
                        ...(item.helpRecordId ? { helpRecordId: item.helpRecordId } : {}) }, focusLabel: item.title })}
                    >
                      Discuss this event
                      <ArrowUpRight size={13} />
                    </button>
                    <button
                      className="text-button"
                      disabled={!!pending}
                      onClick={() => void act(item, 'dismiss')}
                    >
                      Put this away for now
                    </button>
                    <details className="quiet-menu">
                      <summary>Future follow-up</summary>
                      <button disabled={!!pending} onClick={() => void act(item, 'once')}>
                        Mention this only once
                      </button>
                      <button disabled={!!pending} onClick={() => void act(item, 'stop_topic')}>
                        Do not bring this up proactively
                      </button>
                    </details>
                  </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          {items.length > visibleCount && (
            <button className="text-button" onClick={() => setVisibleCount((count) => count + 5)}>
              More material
            </button>
          )}
          {error && (
            <p className="inline-problem" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export interface MatterInteraction {
  choice?: string;
  baseRevision?: number;
  undo?: MatterSelectionInput;
  notice?: string;
  pending?: boolean;
  error?: string;
}
export type MatterInteractionUpdate =
  MatterInteraction | ((current: MatterInteraction) => MatterInteraction);

export function MatterCard({
  matter,
  onState,
  onPresent,
  onMap,
  interaction,
  onInteraction,
}: {
  matter: SharedMatterView;
  onState: (state: State) => void;
  onPresent: () => void;
  onMap?: (id: string) => void;
  interaction?: MatterInteraction;
  onInteraction: (value: MatterInteractionUpdate) => void;
}) {
  const choice = interaction?.choice ?? matter.selectedOptionId ?? '';
  const { undo, notice, pending, error } = interaction || {};
  const changedElsewhere =
    interaction?.choice !== undefined && interaction.baseRevision !== matter.revision;
  const selection = matter.options.find((option) => option.id === matter.selectedOptionId);
  async function change(input: MatterSelectionInput) {
    if (pending) return;
    onInteraction((current) => ({ ...current, pending: true, error: '' }));
    try {
      const result = await api.changeMatterSelection(input);
      onState(result.state);
      onInteraction({
        pending: true,
        undo: result.undo,
        notice: input.optionId
          ? 'This choice is saved for now. It has not been added to the agenda.'
          : 'No choice for now. The other content remains.',
      });
    } catch (error) {
      onInteraction((current) => ({ ...current, error: errorText(error) }));
      onState(await api.state());
    } finally {
      onInteraction((current) => ({ ...current, pending: false }));
    }
  }
  return (
    <section className="matter-card" aria-label={`Under discussion: ${matter.title}`}>
      <div className="matter-heading">
        <span>Under discussion</span>
        <strong>{matter.title}</strong>
      </div>
      {matter.needsReview && (
        <p className="matter-review-note">
          This has changed, so the original suggestion may no longer fit. Choose again below.
        </p>
      )}
      <div className="matter-choice">
        <label>
          Current choice
          <select
            aria-label={`${matter.title} choices`}
            value={choice}
            disabled={pending}
            onChange={(event) =>
              onInteraction({
                ...interaction,
                choice: event.target.value,
                baseRevision: matter.revision,
                error: '',
              })
            }
          >
            <option value="">Not decided yet</option>
            {matter.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.placeLabel || option.title}
              </option>
            ))}
          </select>
        </label>
        {choice !== (matter.selectedOptionId || '') && (
          <button
            className="primary-button"
            disabled={pending}
            onClick={() =>
              void change({
                id: matter.id,
                expectedRevision: matter.revision,
                optionId: choice || null,
              })
            }
          >
            {pending ? 'Saving choice…' : changedElsewhere ? 'Reviewed changes: keep this choice' : 'Keep this choice'}
          </button>
        )}
      </div>
      {changedElsewhere && !error && (
        <p className="inline-problem">
          This has just been edited. Your choice remains here; review the changes before deciding whether to keep it.
        </p>
      )}
      {error ? (
        <p className="inline-problem" role="alert">
          {error} Your choice remains above. Try again when ready.
        </p>
      ) : (
        notice && (
          <div className="inline-receipt" role="status">
            <Check size={13} />
            <span>{notice}</span>
            {undo && (
              <button onClick={() => void change(undo)} disabled={pending}>
                <RotateCcw size={12} />
                Undo
              </button>
            )}
          </div>
        )
      )}
      <div className="matter-actions">
        {selection?.placeId && onMap && (
          <button className="text-button" onClick={() => onMap(selection.placeId!)}>
            View on map
            <ArrowUpRight size={13} />
          </button>
        )}
        <button className="text-button" disabled={pending} onClick={onPresent}>
          <Monitor size={14} />
          Present this choice
        </button>
      </div>
    </section>
  );
}

export function DisplayReview({
  surface,
  onStart,
  onClose,
}: {
  surface: SurfaceView;
  onStart: () => Promise<void>;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title="Present only this content" onClose={onClose} className="display-review">
      <div className="panel-body">
        <p className="panel-intro">
          Private conversations and other pages leave the screen while presenting. You can end the presentation at any time.
        </p>
        <div className="display-review-content markdown">
          {surface.artifacts.map((item) => (
            <RichText key={item.id} text={item.body} publicSurface />
          ))}
        </div>
        {surface.notice && <p role="alert">{surface.notice}</p>}
        {error && (
          <p className="inline-problem" role="alert">
            {error}
          </p>
        )}
        <div className="field-buttons">
          <button
            className="primary-button"
            disabled={pending || !surface.artifacts.length}
            onClick={() => {
              setPending(true);
              void onStart()
                .catch((error) => setError(errorText(error)))
                .finally(() => setPending(false));
            }}
          >
            {pending ? 'Switching…' : 'start presenting'}
          </button>
          <button className="text-button" onClick={onClose}>
            Return to private chat
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function PublicDisplay({
  surface,
  onEnd,
  notice,
}: {
  surface: SurfaceView;
  onEnd: () => Promise<void>;
  notice?: string;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  return (
    <div className="public-display">
      <header>
        <span>
          <Monitor size={16} />
          Presenting
        </span>
        <button
          className="subtle-button"
          disabled={pending}
          onClick={() => {
            setPending(true);
            void onEnd()
              .catch((error) => setError(errorText(error)))
              .finally(() => setPending(false));
          }}
        >
          <X size={16} />
          End presentation
        </button>
      </header>
      <main tabIndex={-1}>
        {notice && <p role="status">{notice}</p>}
        <div className="public-paper markdown">
          {surface.artifacts.map((item) => (
            <RichText key={item.id} text={item.body} publicSurface />
          ))}
          {!surface.artifacts.length && (
            <p>{surface.notice || 'No presentation content is selected. End the presentation, then choose content.'}</p>
          )}
        </div>
        {!!surface.artifacts.length && (
          <button
            className="text-button"
            onClick={() =>
              void api
                .copyText(surface.artifacts.map((item) => item.body).join('\n\n'))
                .catch((error) => setError(errorText(error)))
            }
          >
            <Copy size={14} />
            Copy presentation content
          </button>
        )}
        {error && (
          <p className="inline-problem" role="alert">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
