import { useId, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { PlanningComparisonView, PlanningWorkRhythm } from '../../shared/planning-conversation';
import './planning-comparison.css';

type Branch = PlanningComparisonView['branches'][number];
export interface PlanningComparisonHeaderProps {
  comparison: PlanningComparisonView;
  activeBranchId?: string;
  onPreviewBranch: (branchId: string) => void;
  disabled?: boolean;
}
function duration(value: number) {
  const minutes = Math.round(value);
  if (minutes < 1) return 'Less than a minute';
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
}
function windowName(comparison: PlanningComparisonView) {
  const format = (value: string) => new Date(value).toLocaleDateString('en-US', {
    timeZone: comparison.window.timeZone, month: 'long', day: 'numeric',
  });
  const start = format(comparison.window.from), end = format(new Date(Date.parse(comparison.window.to) - 1).toISOString());
  return start === end ? start : `${start} — ${end}`;
}

/** One shared day can be viewed in several ways. The branches return to one
 * composer; the scene stack owns the actual timeline and all time arithmetic. */
export function PlanningComparisonHeader({ comparison, activeBranchId, onPreviewBranch,
  disabled = false }: PlanningComparisonHeaderProps) {
  const headingId = useId();
  const [local, setLocal] = useState<{ comparisonId: string; branchId: string }>();
  const active = comparison.branches.find(branch => branch.branchId === activeBranchId)
    || comparison.branches.find(branch => local?.comparisonId === comparison.comparisonId && branch.branchId === local.branchId)
    || comparison.branches[0];
  if (!active || comparison.branches.length < 2) return null;
  const preview = (branch: Branch) => {
    setLocal({ comparisonId: comparison.comparisonId, branchId: branch.branchId });
    onPreviewBranch(branch.branchId);
  };
  const move = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const choices = [...event.currentTarget.closest('.planning-comparison-branches')!.querySelectorAll<HTMLButtonElement>('[data-preview-branch]')];
    const current = choices.indexOf(event.currentTarget), next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1
      : Math.max(0, Math.min(choices.length - 1, current + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1)));
    event.preventDefault();
    choices[next]?.focus({ preventScroll: true }); choices[next]?.click();
  };
  const showChanges = comparison.branches.some(branch => branch.metrics.changedObjects > 0);
  const showFree = new Set(comparison.branches.map(branch => branch.metrics.largestFreeWindowMinutes)).size > 1;
  const showWork = new Set(comparison.branches.map(branch => branch.metrics.longestWorkMinutes)).size > 1;
  const rhythmFacts = (rhythm: PlanningWorkRhythm) => {
    const setupDiffers = new Set(comparison.branches.flatMap(branch => branch.workRhythms?.filter(value => value.taskId === rhythm.taskId)
      .map(value => value.setupCleanupMinutes) || [])).size > 1;
    return <div className="planning-comparison-rhythm" key={rhythm.taskId}>
      <span>{rhythm.title}</span>
      <p>{!rhythm.complete || !rhythm.matchesRequest
        ? `Trial: ${duration(rhythm.scheduledMinutes)} scheduled of the complete ${duration(rhythm.requestedMinutes)} requested`
        : rhythm.segments.length > 3 ? <>Total {duration(rhythm.scheduledMinutes)} in {rhythm.segments.length} sessions</>
          : <>{rhythm.segments.map(segment => duration(segment.workMinutes)).join(' + ')}{rhythm.segments.length === 1 ? ' uninterrupted' : ' in separate sessions'}</>}
        {setupDiffers && <small>Preparation and cleanup total {duration(rhythm.setupCleanupMinutes)}</small>}
      </p>
    </div>;
  };
  const singleDay = !windowName(comparison).includes(' — ');
  const dateKey = new Intl.DateTimeFormat('sv-SE', { timeZone: comparison.window.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = singleDay && dateKey.format(new Date(comparison.window.from)) === dateKey.format(new Date());
  const distinctUnscheduled = new Set(comparison.branches.map(branch => JSON.stringify(branch.unscheduled || []))).size > 1;
  return <section className="planning-comparison-header" aria-labelledby={headingId}
    data-comparison-id={comparison.comparisonId} style={{ '--planning-branch-count': comparison.branches.length } as CSSProperties}>
    <header className="planning-comparison-heading">
      <h3 id={headingId}>{singleDay ? `${today ? 'Today' : 'The same day'}, ${comparison.branches.length === 2 ? 'two' : 'several'} possibilities` : 'The same days, different possibilities'}</h3><span>{windowName(comparison)}</span>
    </header>
    <div className="planning-comparison-branches" role="group" aria-label="Choose a version to compare">
      {comparison.branches.map(branch => <article className={`planning-comparison-branch${active.branchId === branch.branchId ? ' is-active' : ''}`}
        key={branch.branchId}>
        <button type="button" data-preview-branch={branch.branchId} aria-pressed={active.branchId === branch.branchId}
          disabled={disabled} onKeyDown={move} onClick={() => preview(branch)} className="planning-comparison-preview">
          <strong><span className="planning-comparison-choice" aria-hidden="true" />{branch.title}</strong><span className="planning-comparison-intent">{branch.intent}</span>
        </button>
        {(showChanges || showFree || showWork && !branch.workRhythms?.length) && <dl className="planning-comparison-differences">
          {showChanges && <div><dt>Original events</dt><dd>{branch.metrics.changedObjects
            ? [branch.metrics.changedObjects > branch.metrics.removedObjects ? `Adjust ${branch.metrics.changedObjects - branch.metrics.removedObjects} events` : '',
              branch.metrics.removedObjects ? `Remove ${branch.metrics.removedObjects} events` : ''].filter(Boolean).join(' · ') : 'All preserved'}</dd></div>}
          {showFree && <div><dt>Longest open interval</dt><dd>{branch.metrics.largestFreeWindowMinutes > 0 ? duration(branch.metrics.largestFreeWindowMinutes) : 'No open interval in this version'}</dd></div>}
          {showWork && !branch.workRhythms?.length && <div><dt>Uninterrupted work</dt><dd>{branch.metrics.longestWorkMinutes > 0 ? duration(branch.metrics.longestWorkMinutes) : 'No new work in this version'}</dd></div>}
        </dl>}
        {!!branch.workRhythms?.length && <div className="planning-comparison-rhythms">
          {branch.workRhythms.slice(0, 2).map(rhythmFacts)}
          {branch.workRhythms.length > 2 && <details><summary>{branch.workRhythms.length - 2} more work rhythms</summary>
            {branch.workRhythms.slice(2).map(rhythmFacts)}
          </details>}
        </div>}
        {!!branch.removed?.length && <p className="planning-comparison-left-for-later">Not kept in this version: {branch.removed.map(item => `${item.title}${item.occurrenceDate ? ` (${item.occurrenceDate} occurrence)` : ''}`).join(', ')}</p>}
        {distinctUnscheduled && !!branch.unscheduled?.length && <p className="planning-comparison-left-for-later">
          {branch.unscheduled.length <= 2 ? branch.unscheduled.map(item => item.title).join(', ') : `${branch.unscheduled.length} events`}, saved for further discussion
        </p>}
      </article>)}
    </div>
    <svg className="planning-comparison-joining" viewBox="0 0 1000 44" preserveAspectRatio="none" aria-hidden="true">
        {comparison.branches.map((branch, index) => {
          const start = (index + .5) * 1000 / comparison.branches.length;
          return <path key={branch.branchId} d={`M ${start} 0 C ${start} 30, 500 8, 500 44`}
            className={branch.branchId === active.branchId ? 'is-active' : undefined} />;
        })}
    </svg>
  </section>;
}
