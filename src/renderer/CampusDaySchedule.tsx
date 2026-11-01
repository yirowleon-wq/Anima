import { useEffect, useRef, useState } from 'react';
import { BookOpen, ChevronDown, RefreshCw } from 'lucide-react';
import type { CampusScheduleBlock, CampusScheduleResult } from '../shared/campus-calendar';
import { formatDateTime, fromTimeInput, toTimeInput } from './time';

type CampusRead =
  | { key: string; status: 'loading' | 'error' }
  | { key: string; status: 'ready'; result: CampusScheduleResult; readAt: string };

/** Private results belong only to this explicit selection and visible day. */
export function useCampusDaySchedule({ date, nextDate, timeZone, active, boundary }: {
  date: string; nextDate: string; timeZone: string; active: boolean; boundary: string;
}) {
  const [selection, setSelection] = useState({ boundary, enabled: false });
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<CampusRead>();
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  const generation = useRef(0);
  const enabled = selection.boundary === boundary && selection.enabled;
  const key = enabled && active && visible ? JSON.stringify([boundary, date, nextDate, timeZone, attempt]) : '';
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    const request = ++generation.current;
    setRead(undefined);
    if (!key) return;
    setRead({ key, status: 'loading' });
    void (async () => {
      try {
        const from = fromTimeInput(`${date}T00:00`, timeZone);
        const to = fromTimeInput(`${nextDate}T00:00`, timeZone);
        if (!from || !to) throw new Error('No date is available to read.');
        const result = await window.anima.campusSchedule({ from, to, timeZone });
        if (generation.current === request) setRead({ key, status: 'ready', result, readAt: new Date().toISOString() });
      } catch {
        if (generation.current === request) setRead({ key, status: 'error' });
      }
    })();
    return () => { generation.current++; };
  }, [key, date, nextDate, timeZone]);
  const current = key && read?.key === key ? read : undefined;
  return {
    enabled,
    loading: !!key && (!current || current.status === 'loading'),
    failed: current?.status === 'error',
    result: current?.status === 'ready' ? current.result : undefined,
    readAt: current?.status === 'ready' ? current.readAt : undefined,
    toggle: () => setSelection({ boundary, enabled: !enabled }),
    reload: () => setAttempt(value => value + 1),
  };
}

type CampusDayRead = ReturnType<typeof useCampusDaySchedule>;
const resourceLabels: Record<string, string> = {
  classes: 'Class', exams: 'Exam', cancelled_classes: 'Cancelled and rescheduled classes', calendar_pending: 'Time not yet set',
};

function coverageLabel(coverage: unknown) {
  if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)) return 'Coverage has not been checked';
  const value = coverage as Record<string, unknown>;
  return value.complete === true ? 'This saved record has been read completely' : 'This saved record has incomplete coverage';
}

function gapLabel(result: CampusScheduleResult) {
  if (result.pendingCount) return `${result.pendingCount} campus events have times still awaiting publication or review.`;
  if (result.scheduleQuality.some(quality => quality.status === 'unavailable' ||
    !quality.generatedAllResolvableRules || quality.unresolvedRuleCount > 0)) return 'Some class times still need review.';
  if (!result.coverage.completeForSavedSnapshot) return 'Some schedule coverage still needs review.';
  if (!result.items.length) return 'The saved schedule lists no classes or exams for this day.';
  return '';
}

export function CampusDayControls({ campus, dayVisible, timeZone }: {
  campus: CampusDayRead; dayVisible: boolean; timeZone: string;
}) {
  const result = campus.result;
  const unread = result?.status === 'not_read';
  const note = !campus.enabled ? '' : !dayVisible ? 'The schedule is selected and appears in the day view.'
    : campus.loading ? 'Reading this day’s schedule…' : campus.failed || unread ? 'The schedule could not be read right now.'
    : result ? gapLabel(result) : '';
  return (
    <div className="today-campus-tools">
      <div className="today-campus-controls">
        <button type="button" className="today-campus-toggle" aria-pressed={campus.enabled} onClick={campus.toggle}>
          <BookOpen size={16} strokeWidth={1.6} />Include class schedule
          {campus.enabled && <span className="today-campus-selected" aria-hidden="true" />}
        </button>
        {result && result.snapshots.length > 0 && (
          <details className="today-campus-source">
            <summary>View source<ChevronDown size={13} /></summary>
            <div className="today-campus-source-body">
              <p className="today-campus-source-title">Imported academic records · saved schedule</p>
              {campus.readAt && <p>Viewed on  {formatDateTime(campus.readAt, timeZone, { year: 'numeric' })}</p>}
              {result.snapshots.map(snapshot => (
                <div className="today-campus-source-entry" key={`${snapshot.bundleId}:${snapshot.resource}:${snapshot.version}`}>
                  <strong>{resourceLabels[snapshot.resource] || 'Campus events'}</strong>
                  <span>{snapshot.collectedAt ? `Collected on  ${formatDateTime(snapshot.collectedAt, timeZone, { year: 'numeric' })}` : 'Collection time not provided'}{snapshot.selection === 'historical' ? ' · Historical saved record' : ''}</span>
                  <span>{coverageLabel(snapshot.coverage)}</span>
                </div>
              ))}
              {result.scheduleQuality.map(quality => (
                <p className="today-campus-quality" key={quality.bundleId}>
                  {quality.status === 'unavailable' ? 'Class occurrence coverage has not been checked.' : <>
                    {quality.generatedAllResolvableRules && quality.unresolvedRuleCount === 0 ? 'All occurrences with resolvable times are listed.' : `Some schedule rules have unresolved times${quality.unresolvedRuleCount > 0 ? ` (${quality.unresolvedRuleCount} items)` : ''}.`}
                    {quality.calendarOfficiallyCrosschecked ? ' Cross-checked against the official academic calendar.' : ' Not cross-checked against the official academic calendar.'}
                    {!quality.allFutureDatesFinal && ' Later dates may still be rescheduled.'}
                  </>}
                </p>
              ))}
              <p>{result.coverage.completeForSavedSnapshot ? 'All events for this day in the saved record were read.' : 'Some coverage remains unverified.'}A saved record is not live institutional confirmation or attendance evidence. Unlisted times are not necessarily free.</p>
              {result.cancelledCount != null && result.cancelledCount > 0 && <p>Excluded according to saved cancellations:  {result.cancelledCount} items.</p>}
              <button type="button" className="text-button" onClick={campus.reload}><RefreshCw size={12} />Reload</button>
            </div>
          </details>
        )}
      </div>
      {note && <p className="today-campus-note" role="status">{note}{dayVisible && (campus.failed || unread) && <button type="button" className="text-button" onClick={campus.reload}>Retry</button>}</p>}
    </div>
  );
}

export function CampusScheduleRow({ item, date, timeZone }: {
  item: CampusScheduleBlock; date: string; timeZone: string;
}) {
  const start = toTimeInput(item.start, timeZone);
  const end = item.end ? toTimeInput(item.end, timeZone) : '';
  const clock = (value: string) => <>
    {value.slice(0, 10) !== date && <span className="today-campus-time-date">
      {new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', ...(value.slice(0, 4) !== date.slice(0, 4) ? { year: 'numeric' as const } : {}), month: 'short', day: 'numeric' })}
    </span>}
    {value.slice(11, 16)}
  </>;
  return (
    <article className="today-item is-campus">
      <div className="today-item-time">
        <span>{clock(start)}</span>
        <small>{end ? clock(end) : 'End not set'}</small>
      </div>
      <div className="today-item-paper">
        <span className="today-campus-book" aria-hidden="true"><BookOpen size={18} strokeWidth={1.5} /></span>
        <div className="today-item-content">
          <strong>{item.title}</strong>
          {item.location && <span className="today-item-detail">{item.location}</span>}
        </div>
        <span className="today-campus-kind">{item.kind === 'exam' ? 'Exam' : 'Class'}</span>
      </div>
    </article>
  );
}
