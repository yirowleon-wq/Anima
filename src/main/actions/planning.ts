import * as z from 'zod';
import type { Action } from '../../shared/types';
import { HarnessError } from '../../shared/harness';
import { calendarCommitment, calendarFieldsSchema, localCalendarChangeSchema } from '../../shared/calendar';
import { availableIntervals } from './availability';
import { expandAgenda, localStamp, normalizeCalendarInput, projectCalendarChange } from './calendar';
import { resolveLocalTime } from '../runtime/semantics';
import { planningDayBounds } from './planning-days';
export { planningDraftInput, draftCalendarPlan, calendarPlanFingerprint, assertDraftCalendarCurrent } from './planning-draft';
export { calendarCommitment } from '../../shared/calendar';

const instant = z.string().datetime({ offset: true });
const fields = z.object({
  ...calendarFieldsSchema.omit({ createNew: true }).shape,
  title: z.string().min(1).max(160), detail: z.string().max(1500).default(''),
  startsAt: instant.optional(), durationMinutes: z.number().int().min(1).max(1440).optional(),
}).strict();
export const planningPreviewInput = z.object({
  from: instant, to: instant, timeZone: z.string().max(100).default('America/Los_Angeles'),
  minimumBlockMinutes: z.number().int().min(1).max(1440).default(30),
  transitionMinutes: z.object({ min: z.number().min(0).max(1440), max: z.number().min(0).max(1440) }).strict().default({ min: 0, max: 0 }).describe("Transition cost on each side. Gap and plan checks separately reserve both entering and leaving costs, rather than one combined cost."),
  busy: z.array(z.object({ start: instant, end: instant.nullable(), sourceId: z.string().min(1).max(160), sourceVersion: z.string().max(160).optional() }).strict()).max(500).default([]),
  sourceCoverage: z.array(z.object({ sourceId: z.string().min(1).max(160), status: z.enum(['complete', 'partial', 'not_checked']), reason: z.string().max(300).optional() }).strict()).max(20).default([]),
  conditions: z.array(z.object({ condition: z.string().min(1).max(300), status: z.enum(['satisfied', 'unknown', 'unavailable']), sourceId: z.string().max(160).optional() }).strict()).max(20).default([]),
  alternatives: z.array(z.object({
    label: z.string().min(1).max(100),
    save: fields.optional(), change: localCalendarChangeSchema.optional(),
  }).strict().refine(value => !!value.save !== !!value.change, "Each option may add one event or modify one original object.")).max(3).default([]),
}).strict();

function intervalOf(item: Record<string, unknown>, timeZone: string) {
  const bounds = item.allDayDate ? planningDayBounds(String(item.allDayDate), String(item.timeZone || timeZone)) : undefined;
  const start = bounds?.from || (typeof item.startsAt === 'string' ? item.startsAt : undefined);
  if (!start) return undefined;
  return { start, end: bounds?.to || (typeof item.endsAt === 'string' ? item.endsAt : typeof item.durationMinutes === 'number' ? new Date(Date.parse(start) + item.durationMinutes * 60000).toISOString() : null) };
}
function busyOf(expanded: ReturnType<typeof expandAgenda>, timeZone: string, originals: Action[]) {
  const busy = expanded.items.filter(item => calendarCommitment(item as unknown as Action).occupiesTime)
    .flatMap(item => { const interval = intervalOf(item, timeZone); return interval ? [{ ...interval, id: String(item.id), revision: Number(item.revision || 1), occurrenceId: String(item.occurrenceId), flexibility: calendarCommitment(item as unknown as Action).flexibility }] : []; });
  for (const issue of expanded.issues) if (issue.status === 'unknown_end' && originals.some(item => item.id === issue.id && calendarCommitment(item).occupiesTime) && typeof issue.startsAt === 'string' && !busy.some(item => item.id === issue.id && item.start === issue.startsAt))
    busy.push({ id: String(issue.id), revision: originals.find(item => item.id === issue.id)?.revision || 1, occurrenceId: String(issue.id), start: issue.startsAt, end: null, flexibility: 'fixed' });
  return busy;
}
const commitmentIssues = (expanded: ReturnType<typeof expandAgenda>, items: Action[]) =>
  expanded.issues.filter(issue => items.some(item => item.id === issue.id && calendarCommitment(item).occupiesTime));
const overlaps = (a: { start: string; end: string | null }, b: { start: string; end: string | null }, until: string) =>
  Date.parse(a.start) < Date.parse(b.end || until) && Date.parse(b.start) < Date.parse(a.end || until);

/** Read-only calculation. A proposal is a version-bound input to the existing action approval path. */
export function previewCalendarPlan(items: Action[], raw: unknown) {
  const input = planningPreviewInput.parse(raw), fromMs = Date.parse(input.from), toMs = Date.parse(input.to);
  if (toMs <= fromMs || toMs - fromMs > 366 * 86400000) throw new HarnessError('time_window', "The planning range must be valid and no longer than one year.");
  try { new Intl.DateTimeFormat('en', { timeZone: input.timeZone }); } catch { throw new HarnessError('time_zone', "The planning time zone is invalid."); }
  const assessmentFrom = new Date(fromMs - input.transitionMinutes.max * 60000).toISOString();
  const assessmentTo = new Date(toMs + input.transitionMinutes.max * 60000).toISOString();
  const active = items.filter(item => !item.done), expanded = expandAgenda(active, assessmentFrom, assessmentTo, input.timeZone);
  const busy = busyOf(expanded, input.timeZone, active), sourceCoverage = [{ sourceId: 'local-agenda', status: commitmentIssues(expanded, active).length ? 'partial' : 'complete', reason: "Only accepted local occurrences that occupy time are included. This does not cover all campus or personal commitments or available energy." }, ...input.sourceCoverage.filter(source => source.sourceId !== 'local-agenda')];
  const gaps = availableIntervals({ ...input, busy: [...busy, ...input.busy], transitionBoundaryCount: 2 });
  const alternatives = input.alternatives.map(option => {
    let target: Action | undefined, proposed: Action | undefined;
    if (option.change) {
      target = items.find(item => item.id === option.change!.targetId);
      if (!target) throw new HarnessError('calendar_missing', "The plan's original event no longer exists. Read again first.");
      if ((target.revision || 1) !== option.change.expectedRevision) throw new HarnessError('revision_conflict', "The plan's original event revision changed.");
      proposed = option.change.operation === 'delete' ? undefined : projectCalendarChange(target, option.change, input.timeZone);
    } else {
      const normalized = normalizeCalendarInput(option.save!, input.timeZone);
      proposed = { ...normalized, id: 'new-proposal', done: false };
    }
    const remaining = active.filter(item => item.id !== target?.id);
    // Expanding the changed series also retains every untouched occurrence.
    const revisedItems = [...remaining, ...(proposed && !proposed.done ? [proposed] : [])];
    const revised = expandAgenda(revisedItems, assessmentFrom, assessmentTo, input.timeZone);
    const proposedOccurrences = proposed ? revised.items.filter(item => {
      if (item.id !== proposed.id || !calendarCommitment(item as unknown as Action).occupiesTime) return false;
      const interval = intervalOf(item, input.timeZone);
      return !!interval && Date.parse(interval.start) < toMs && Date.parse(interval.end || input.to) > fromMs;
    }) : [];
    const changedDate = option.change?.operation === 'change_occurrence' ? option.change.occurrenceDate : undefined;
    const affected = proposedOccurrences.filter(item => !changedDate || item.originalDate === changedDate);
    const revisedBusy = busyOf(revised, input.timeZone, revisedItems);
    const conflicts = affected.flatMap(item => {
      const interval = intervalOf(item, input.timeZone);
      if (!interval) return [];
      const padded = { start: new Date(Date.parse(interval.start) - input.transitionMinutes.max * 60000).toISOString(), end: interval.end ? new Date(Date.parse(interval.end) + input.transitionMinutes.max * 60000).toISOString() : null };
      return [...revisedBusy.filter(other => other.occurrenceId !== item.occurrenceId), ...input.busy.map(b => ({ ...b, id: b.sourceId, flexibility: 'fixed' }))].filter(other => overlaps(padded, other, input.to)).map(other => ({ proposedOccurrenceId: item.occurrenceId, objectId: other.id, flexibility: other.flexibility, start: other.start, end: other.end }));
    });
    const proposalBounds = proposed ? intervalOf(proposed as unknown as Record<string, unknown>, input.timeZone) : undefined;
    const expectedStart = proposalBounds ? Date.parse(proposalBounds.start) : undefined;
    const changedOccurrence = changedDate ? proposed?.exceptions?.find(item => item.onDate === changedDate) : undefined;
    const changedZone = proposed?.timeZone || input.timeZone;
    const changedStamp = changedDate && proposed?.startsAt ? `${changedDate}T${localStamp(proposed.startsAt, changedZone).slice(11)}` : undefined;
    const changedResolved = changedStamp ? resolveLocalTime(changedStamp, changedZone) : undefined;
    const changedAt = changedOccurrence?.startsAt || (changedResolved?.status === 'resolved' ? changedResolved.instants[0] : changedDate && proposed?.allDayDate ? planningDayBounds(changedDate, changedZone).from : undefined);
    const changedStart = changedAt ? Date.parse(changedAt) : undefined;
    const changedDuration = changedOccurrence?.durationMinutes === null ? undefined : changedOccurrence?.durationMinutes ?? proposed?.durationMinutes;
    const outsideWindow = (!proposed?.recurrence && expectedStart !== undefined && (expectedStart < fromMs || expectedStart >= toMs || !!proposalBounds?.end && Date.parse(proposalBounds.end) > toMs))
      || (changedStart !== undefined && (changedStart < fromMs || changedStart >= toMs || !!changedDuration && changedStart + changedDuration * 60000 > toMs));
    const unknown = [
      ...(!input.sourceCoverage.length ? ["Other schedule sources have no declared coverage. Calendar gaps do not prove real availability."] : input.sourceCoverage.filter(source => source.status !== 'complete').map(source => source.reason || `${source.sourceId} has incomplete coverage.`)),
      ...input.conditions.filter(condition => condition.status === 'unknown').map(condition => condition.condition),
      ...(commitmentIssues(revised, revisedItems).length || affected.some(item => !intervalOf(item, input.timeZone)?.end) ? ["There is an unknown end time or an occurrence that could not be expanded."] : []),
      ...(proposed && !calendarCommitment(proposed).occupiesTime ? ["This is still an invitation, wish or unaccepted proposal and does not occupy committed time."] : []),
      ...(proposed?.recurrence && !proposedOccurrences.length && !changedDate ? ["This review window contains no expanded occurrence of that series. It cannot establish conflicts on other dates."] : []),
    ];
    const violations = [...(conflicts.length ? ["Conflicts with accepted events or supplied busy periods. Movable events still require their own revision."] : []), ...(outsideWindow ? ["The event is outside this review window."] : []), ...input.conditions.filter(condition => condition.status === 'unavailable').map(condition => condition.condition)];
    return { label: option.label, targetId: target?.id || null, expectedTargetRevision: target ? target.revision || 1 : null,
      before: target || null, after: proposed || null, conflicts, unknown, violations,
      feasibility: violations.length ? 'not_feasible' : unknown.length ? 'conditional' : 'verified_for_declared_sources',
      proposal: { capability: option.change ? 'local.agenda.change' : 'local.agenda.save', arguments: option.change || option.save },
      applied: false, requiresAuthorization: true,
    };
  });
  return { window: { from: input.from, to: input.to, timeZone: input.timeZone }, sourceCoverage, busy, windows: gaps.windows, unknownEnds: gaps.unknownEnds,
    pending: expanded.items.filter(item => calendarCommitment(item as unknown as Action).state !== 'accepted'),
    acceptedMovable: expanded.items.filter(item => calendarCommitment(item as unknown as Action).state === 'accepted' && calendarCommitment(item as unknown as Action).flexibility === 'movable'),
    issues: expanded.issues, conditions: input.conditions, alternatives, applied: false,
    meaning: "This compares supplied time records with local events. Invitations and ideas remain proposals, and movable events remain intact. Each change stays linked to its original object and current revision. Explicitly accepted changes can be saved; alternatives still under comparison remain for the user to choose. Before saving, the app rechecks changes to the original event. Places, weather, required items and today's energy can be explored as relevant to the current choice." };
}
