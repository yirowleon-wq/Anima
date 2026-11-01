import { createHash } from 'node:crypto';
import * as z from 'zod';
import type { Action } from '../../shared/types';
import { HarnessError, type WorkSourceBinding } from '../../shared/harness';
import type { PlanningComparisonView, PlanningWorkRhythm } from '../../shared/planning-conversation';
import { localCalendarChangeSchema } from '../../shared/calendar';
import { canonical } from '../runtime/semantics';
import { expandAgenda, normalizeCalendarInput, projectCalendarChange } from './calendar';
import { calendarCommitment, previewCalendarPlan } from './planning';
import { calendarPlanFingerprint, draftCalendarPlan, planningDraftInput } from './planning-draft';

const id = z.string().min(1).max(160);
const instant = z.string().datetime({ offset: true });
const window = z.object({ start: instant, end: instant }).strict();
const workRhythm = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('continuous') }).strict(),
  z.object({ kind: z.literal('split'), maximumChunkMinutes: z.number().int().min(1).max(1440) }).strict(),
]).describe("This branch schedules the same complete workload. Continuous work does not exceed the original block maximum. Splitting is used only when originally allowed, with genuinely shorter blocks and full setup and cleanup for each. It creates no lasting preference or calendar protection.");
const activity = z.object({
  id, title: z.string().min(1).max(160), detail: z.string().max(1200).default(''),
  startsAt: instant, durationMinutes: z.number().int().min(1).max(1440),
  kind: z.enum(['event', 'time_block']).default('event'), placeId: id.optional(),
  state: z.enum(['invitation', 'wish', 'proposed']).default('proposed')
    .describe("An activity not yet accepted. Only this branch calculates its occupancy if attended; real commitments remain unchanged."),
}).strict();
export const planningAlternativeInput = z.object({
  id, title: z.string().min(1).max(160), intent: z.string().min(1).max(1200),
  changes: z.array(localCalendarChangeSchema).max(12).default([]),
  additions: z.array(activity).max(8).default([]),
  taskPreferences: z.array(z.object({ taskId: id, priority: z.number().int().min(0).max(10).optional(),
    preferredWindows: z.array(window).max(32).optional(), rhythm: workRhythm.optional() }).strict()).max(30).default([]),
  additionalProtectedWindows: z.array(window.extend({ reason: z.string().min(1).max(300) }).strict()).max(32).default([])
    .describe("Only the periods explicitly discussed for protection in this comparison. They are not accepted calendar protection. Do not invent protected windows to manufacture splitting. Use taskPreferences.rhythm for continuous or split work, preserving task windows and workload."),
}).strict();
export const planningComparisonInput = z.object({
  draft: planningDraftInput,
  preserveActionIds: z.array(id).max(100).default([]).describe("Original events explicitly protected in this discussion. A branch cannot delete or modify them."),
  alternatives: z.array(planningAlternativeInput).min(2).max(4),
}).strict();
export type PlanningComparisonInput = z.infer<typeof planningComparisonInput>;
export type PlanningAlternativeInput = z.infer<typeof planningAlternativeInput>;
export type PlanningDraftRequest = z.infer<typeof planningDraftInput>;
export interface PlanningComparisonStep {
  id: string;
  order: number;
  kind: 'change' | 'addition';
  capability: 'local.agenda.change' | 'local.agenda.save';
  arguments: Record<string, any>;
  targetId?: string;
  expectedRevision?: number;
  beforeState?: string;
  requiresAuthorization: true;
}
export interface PlanningComparisonBranch {
  id: string;
  title: string;
  intent: string;
  draftRequest: PlanningDraftRequest;
  draft: ReturnType<typeof draftCalendarPlan> | null;
  changes: { targetId: string; expectedRevision: number; operation: string; occurrenceDate?: string; cancelled?: boolean; before: Action; after: Action | null }[];
  additions: { id: string; state: string; title: string; start: string; end: string; hypothetical: true }[];
  preserved: { id: string; revision: number; title: string }[];
  steps: PlanningComparisonStep[];
  checks: ReturnType<typeof previewCalendarPlan>['alternatives'];
  metrics: { changedObjects: number; removedObjects: number; proposedActivities: number; scheduledMinutes: number;
    unscheduledTasks: number; longestWorkMinutes: number; largestFreeWindowMinutes: number; occupiedMinutes: number };
  feasibility: string;
  issues: string[];
  workRhythms: PlanningWorkRhythm[];
  accepted: false;
  applied: false;
}
export function removesCalendarOccupancy(change: PlanningComparisonBranch['changes'][number]) {
  return !change.after || !!change.cancelled
    || calendarCommitment(change.before).state === 'accepted' && calendarCommitment(change.after).state !== 'accepted';
}
const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const unique = <T>(items: T[], key: (item: T) => string) => [...new Map(items.map(item => [key(item), item])).values()];
const reserved = (item: Action) => item.startsAt && item.durationMinutes
  ? { start: item.startsAt, end: new Date(Date.parse(item.startsAt) + item.durationMinutes * 60000).toISOString() } : null;

export function comparisonSteps(input: PlanningComparisonInput, alternative: PlanningAlternativeInput): PlanningComparisonStep[] {
  return [
    ...alternative.changes.map((change, index) => ({ id: 'change:' + change.targetId, order: index + 1,
      kind: 'change' as const, capability: 'local.agenda.change' as const, arguments: structuredClone(change),
      targetId: change.targetId, expectedRevision: change.expectedRevision, requiresAuthorization: true as const })),
    ...alternative.additions.map((value, index) => ({ id: 'addition:' + value.id, order: alternative.changes.length + index + 1,
      kind: 'addition' as const, capability: 'local.agenda.save' as const,
      arguments: normalizeCalendarInput({ title: value.title, detail: value.detail, kind: value.kind,
        startsAt: value.startsAt, durationMinutes: value.durationMinutes, timeZone: input.draft.timeZone,
        planning: { state: 'accepted' as const, flexibility: 'fixed' as const, ...(value.placeId ? { placeId: value.placeId } : {}) } }, input.draft.timeZone),
      beforeState: value.state, requiresAuthorization: true as const })),
  ];
}

/** Each alternative can vary proposed trade-offs, never silently shrink work,
 * remove a prerequisite, relax a deadline, or borrow an undeclared time window. */
export function alternativeDraft(input: PlanningComparisonInput, alternative: PlanningAlternativeInput): PlanningDraftRequest {
  if (new Set(alternative.taskPreferences.map(value => value.taskId)).size !== alternative.taskPreferences.length
    || alternative.taskPreferences.some(value => !input.draft.tasks.some(task => task.id === value.taskId)))
    throw new HarnessError('planning_comparison_task', "The branch references missing or duplicate tasks. Original workload and conditions were not rewritten.");
  return planningDraftInput.parse({ ...input.draft,
    tasks: input.draft.tasks.map(task => {
      const preference = alternative.taskPreferences.find(value => value.taskId === task.id);
      const rhythm = preference?.rhythm;
      if (rhythm?.kind === 'continuous' && task.maximumChunkMinutes !== undefined && task.maximumChunkMinutes < task.durationMinutes.max)
        throw new HarnessError('planning_comparison_rhythm', `「${task.title} cannot fit continuously under its original block maximum. Discuss that limit first; a comparison cannot relax it.`);
      if (rhythm?.kind === 'split' && (!task.splittable
        || rhythm.maximumChunkMinutes >= task.durationMinutes.max
        || rhythm.maximumChunkMinutes > (task.maximumChunkMinutes ?? task.durationMinutes.max)
        || rhythm.maximumChunkMinutes < (task.minimumChunkMinutes ?? Math.min(30, task.durationMinutes.max))))
        throw new HarnessError('planning_comparison_rhythm', `「${task.title} can be split only if originally allowed, preserving the minimum block and block maximum. Total workload stays the same.`);
      return { ...task, ...(preference?.priority !== undefined ? { priority: preference.priority } : {}),
        ...(preference?.preferredWindows !== undefined ? { preferredWindows: preference.preferredWindows } : {}),
        ...(rhythm?.kind === 'continuous' ? { splittable: false } : {}),
        ...(rhythm?.kind === 'split' ? { maximumChunkMinutes: rhythm.maximumChunkMinutes } : {}) };
    }),
    protectedWindows: [...input.draft.protectedWindows, ...alternative.additionalProtectedWindows] });
}

/** Per-task placement facts only. The original planner retains the day ledger,
 * shared rest/transfers and all preparation; no cognitive cost is invented. */
export function describeWorkRhythms(input: PlanningComparisonInput, alternative: PlanningAlternativeInput,
  draft: Pick<ReturnType<typeof draftCalendarPlan>, 'blocks'>): PlanningWorkRhythm[] {
  return alternative.taskPreferences.flatMap(preference => {
    if (!preference.rhythm) return [];
    const task = input.draft.tasks.find(value => value.id === preference.taskId)!;
    const segments = draft.blocks.filter(block => block.taskId === task.id).map(block => ({
      start: block.start, end: block.end, workMinutes: block.durationMinutes,
      setupMinutes: (Date.parse(block.start) - Date.parse(block.reservedStart)) / 60000,
      cleanupMinutes: (Date.parse(block.reservedEnd) - Date.parse(block.end)) / 60000,
    }));
    const scheduledMinutes = segments.reduce((sum, segment) => sum + segment.workMinutes, 0);
    const requested = preference.rhythm;
    return [{ taskId: task.id, title: task.title, requested, requestedMinutes: task.durationMinutes.max,
      scheduledMinutes, segments, setupCleanupMinutes: segments.reduce((sum, segment) => sum + segment.setupMinutes + segment.cleanupMinutes, 0),
      complete: scheduledMinutes === task.durationMinutes.max,
      matchesRequest: requested.kind === 'continuous' ? segments.length === 1
        : segments.length >= 2 && segments.every(segment => segment.workMinutes <= requested.maximumChunkMinutes) }];
  });
}

export function planningBranchUsable(branch: PlanningComparisonBranch) {
  return !!branch.draft && branch.feasibility !== 'not_feasible'
    && branch.draft.completeness === 'all_tasks_placed' && !branch.draft.unscheduled.length
    && branch.workRhythms.every(rhythm => rhythm.complete && rhythm.matchesRequest);
}

/** Read-only projections of existing calendar changes and conditional activities.
 * The accepted flag inside a hypothetical copy is used solely for arithmetic. */
function projectAlternative(items: Action[], input: PlanningComparisonInput, alternative: PlanningAlternativeInput) {
  if (new Set(alternative.changes.map(change => change.targetId)).size !== alternative.changes.length
    || new Set(alternative.additions.map(value => value.id)).size !== alternative.additions.length)
    throw new HarnessError('planning_comparison_identity', "This branch changes the same object or declares the same activity more than once, so its complete plan is ambiguous.");
  if (alternative.changes.some(change => input.preserveActionIds.includes(change.targetId)))
    throw new HarnessError('planning_comparison_preserve', "This branch changes an event explicitly protected for this discussion. Choose another tradeoff.");
  let projected = structuredClone(items);
  const changes: PlanningComparisonBranch['changes'] = [];
  for (const change of alternative.changes) {
    if (change.operation !== 'change_occurrence' && (change.occurrenceDate || change.cancelled !== undefined))
      throw new HarnessError('planning_comparison_occurrence', "A specific occurrence date and cancellation of that occurrence apply only to change_occurrence, not as an ineffective bypass in an ordinary update.");
    const before = items.find(item => item.id === change.targetId);
    if (!before || (before.revision || 1) !== change.expectedRevision)
      throw new HarnessError('revision_conflict', "The original event referenced by this branch changed. Read its current version first.");
    const originalWindow = expandAgenda([before], input.draft.from, input.draft.to, input.draft.timeZone);
    if (before.done || !originalWindow.items.length && !originalWindow.issues.length)
      throw new HarnessError('planning_comparison_window', "This event is outside the current life window. Events outside it and completed items were not pulled into replanning.");
    if (change.operation === 'change_occurrence' && !originalWindow.items.some(row => row.originalDate === change.occurrenceDate)
      && !originalWindow.issues.some(row => row.date === change.occurrenceDate))
      throw new HarnessError('planning_comparison_window', "The occurrence being changed is outside this scope. Another occurrence in the series does not authorize including it.");
    if (change.changes?.done !== undefined)
      throw new HarnessError('planning_comparison_completion', "Rescheduling cannot mark a task complete or erase its real completion state.");
    // A recurring series is larger than this bounded conversation. Its real
    // occurrence can be changed without pretending the rest was assessed.
    if (before.recurrence && change.operation !== 'change_occurrence')
      throw new HarnessError('planning_comparison_series', "This comparison covers one occurrence. A whole-series change needs a separate check of its complete scope.");
    const after = change.operation === 'delete' ? null : projectCalendarChange(before, change, input.draft.timeZone);
    if (after && canonical(after) === canonical(before))
      throw new HarnessError('planning_comparison_no_change', "This edit leaves the original event unchanged. Keep it rather than generate a duplicate action.");
    const previousDuration = change.operation === 'change_occurrence'
      ? before.exceptions?.find(value => value.onDate === change.occurrenceDate)?.durationMinutes ?? before.durationMinutes : before.durationMinutes;
    if (after && change.changes?.durationMinutes !== undefined && change.changes.durationMinutes !== previousDuration)
      throw new HarnessError('planning_comparison_duration', "This branch changes the event's full duration. Discuss workload, setup or rest separately from the original request; do not silently shorten them while rescheduling.");
    if (after && change.cancelled !== true) {
      const occurrences = expandAgenda([after], input.draft.from, input.draft.to, input.draft.timeZone).items
        .filter(row => change.operation !== 'change_occurrence' || row.originalDate === change.occurrenceDate);
      const complete = occurrences.length > 0 && occurrences.every(row => {
        const day = row.dateBounds as { from?: string; to?: string } | undefined;
        const start = typeof row.startsAt === 'string' ? row.startsAt : day?.from;
        const end = typeof row.endsAt === 'string' ? row.endsAt : day?.to;
        return !!start && Date.parse(start) >= Date.parse(input.draft.from) && (!end || Date.parse(end) <= Date.parse(input.draft.to));
      });
      if (!complete) throw new HarnessError('planning_comparison_window', "The entire moved occurrence is outside this discussion window. Expand the window first rather than hide outside occupancy to make a plan fit.");
    }
    projected = projected.filter(item => item.id !== before.id);
    if (after) projected.push(after);
    changes.push({ targetId: before.id, expectedRevision: before.revision || 1, operation: change.operation,
      ...(change.occurrenceDate ? { occurrenceDate: change.occurrenceDate } : {}), ...(change.cancelled !== undefined ? { cancelled: change.cancelled } : {}), before, after });
  }
  const additions = alternative.additions.map(value => {
    const start = Date.parse(value.startsAt), end = start + value.durationMinutes * 60000;
    if (start < Date.parse(input.draft.from) || end > Date.parse(input.draft.to))
      throw new HarnessError('planning_comparison_window', "The proposed activity is outside the discussion window. Expand the actual scope before comparing it.");
    const arguments_ = normalizeCalendarInput({ title: value.title, detail: value.detail, kind: value.kind,
      startsAt: value.startsAt, durationMinutes: value.durationMinutes, timeZone: input.draft.timeZone,
      planning: { state: 'accepted' as const, flexibility: 'fixed' as const, ...(value.placeId ? { placeId: value.placeId } : {}) } }, input.draft.timeZone);
    const projection: Action = { ...arguments_, id: 'comparison:' + alternative.id + ':' + value.id, done: false };
    if (items.some(item => item.id === projection.id))
      throw new HarnessError('planning_comparison_identity', "The proposed activity conflicts with an existing object identifier. The original event was not overwritten.");
    projected.push(projection);
    return { input: value, projection, arguments: arguments_ };
  });
  return { projected, changes, additions };
}

/** Complete alternatives share one actual agenda and the same original task
 * specification. Semantic value judgements stay with the main assistant. */
export function compareCalendarPlans(items: Action[], raw: unknown) {
  const input = planningComparisonInput.parse(raw);
  if (new Set(input.alternatives.map(value => value.id)).size !== input.alternatives.length)
    throw new HarnessError('planning_comparison_identity', "Each comparison branch needs a stable, distinct identifier.");
  if (input.preserveActionIds.some(id => !items.some(item => item.id === id)))
    throw new HarnessError('planning_comparison_preserve', "A protected original event is no longer in the calendar. Check it first.");
  const branches: PlanningComparisonBranch[] = [], duplicates: { id: string; sameAs: string }[] = [];
  const results = new Map<string, string>();
  for (const alternative of input.alternatives) {
    const draftRequest = alternativeDraft(input, alternative);
    try {
      const projected = projectAlternative(items, input, alternative), checks: PlanningComparisonBranch['checks'] = [];
      const preview = { from: input.draft.from, to: input.draft.to, timeZone: input.draft.timeZone,
        busy: input.draft.busy.map(({ start, end, sourceId, sourceVersion }) => ({ start, end, sourceId, ...(sourceVersion ? { sourceVersion } : {}) })),
        sourceCoverage: input.draft.sourceCoverage.map(({ sourceId, status, reason }) => ({ sourceId, status, ...(reason ? { reason } : {}) })),
        conditions: input.draft.conditions.map(({ condition, status, sourceId }) => ({ condition, status, ...(sourceId ? { sourceId } : {}) })),
        transitionMinutes: input.draft.transitionMinutes };
      for (const [index, change] of alternative.changes.entries()) {
        const target = projected.changes[index];
        const others = projected.projected.filter(item => item.id !== change.targetId);
        checks.push(...previewCalendarPlan([...others, target.before], { ...preview,
          alternatives: [{ label: alternative.title, change }] }).alternatives);
      }
      for (const addition of projected.additions)
        checks.push(...previewCalendarPlan(projected.projected.filter(item => item.id !== addition.projection.id), {
          ...preview, alternatives: [{ label: addition.input.title, save: addition.arguments }] }).alternatives);
      const constructed = draftCalendarPlan(projected.projected, draftRequest);
      const draft = { ...constructed, acceptanceProposals: [] as typeof constructed.acceptanceProposals,
        acceptanceContract: "This compares complete occupancy and provides no save parameters for extracting only core work. Once prerequisite actions actually finish, continue_planning uses the original planner to generate complete setup, work and rest save units with planRef." };
      const workRhythms = describeWorkRhythms(input, alternative, draft);
      const rhythmIssues = workRhythms.filter(rhythm => !rhythm.complete || !rhythm.matchesRequest).map(rhythm =>
        `「${rhythm.title} this time: ${rhythm.requested.kind === 'continuous' ? "continuous work" : "split work"}only constructed ${rhythm.scheduledMinutes}/${rhythm.requestedMinutes} minutes${rhythm.matchesRequest ? '' : "; the blocks do not yet satisfy this choice"}. Continue discussing; different workloads are not two complete ways of living through the window, and this is not proof of global infeasibility.`);
      // Final feasibility alone does not make every intermediate edit safe.
      // Move an occupying original first; a cyclic swap needs another proposal,
      // rather than presenting sequential actions as an atomic calendar write.
      const moving = new Set(alternative.changes.map(change => change.targetId));
      const dependencies = new Map(alternative.changes.map(change => {
        const originalCheck = previewCalendarPlan(items, { ...preview, alternatives: [{ label: alternative.title, change }] }).alternatives[0];
        return [change.targetId, new Set(originalCheck.conflicts.flatMap(conflict => moving.has(conflict.objectId)
          && conflict.objectId !== change.targetId ? [conflict.objectId] : []))] as const;
      }));
      const ordered: string[] = [], waiting = new Set(alternative.changes.map(change => change.targetId));
      while (waiting.size) {
        const ready = [...waiting].find(id => [...dependencies.get(id)!].every(dependency => !waiting.has(dependency)));
        if (!ready) break;
        ordered.push(ready); waiting.delete(ready);
      }
      const sequencingIssues = waiting.size ? ["These events occupy one another's next positions. Moving them individually would create intermediate conflicts. Discuss a real temporary slot or another plan; this is not an atomic group edit."] : [];
      const steps = comparisonSteps(input, alternative).sort((left, right) => {
        const position = (step: PlanningComparisonStep) => step.kind === 'change' ? ordered.indexOf(step.targetId!) : ordered.length + step.order;
        return position(left) - position(right);
      }).map((step, index) => ({ ...step, order: index + 1 }));
      const signature = hash({ calendar: projected.projected.map(item => ({ ...item,
        ...(item.id.startsWith('comparison:') ? { id: undefined } : {}) })).sort((a, b) => canonical(a).localeCompare(canonical(b))),
        blocks: draft.blocks.map(({ preferred: _preferred, ...block }) => block),
        protectedWindows: draft.protectedWindows, freeWindows: draft.freeWindows, unscheduled: draft.unscheduled });
      const sameAs = results.get(signature);
      if (sameAs) { duplicates.push({ id: alternative.id, sameAs }); continue; }
      results.set(signature, alternative.id);
      const changed = new Set(projected.changes.map(value => value.targetId));
      const originalOccurrences = expandAgenda(items.filter(item => !item.done), input.draft.from, input.draft.to, input.draft.timeZone);
      const visibleOriginals = new Set([...originalOccurrences.items.map(item => String(item.id)), ...originalOccurrences.issues.map(item => String(item.id))]);
      const violations = unique(checks.flatMap(check => check.violations), value => value);
      const unknown = unique(checks.flatMap(check => check.unknown), value => value);
      const occupiedMinutes = draft.daySummaries.reduce((sum, day) => sum + day.occupiedMinutes, 0);
      branches.push({ id: alternative.id, title: alternative.title, intent: alternative.intent, draftRequest, draft,
        changes: projected.changes, additions: projected.additions.map(value => ({ id: value.input.id, state: value.input.state,
          title: value.input.title, start: value.projection.startsAt!, end: reserved(value.projection)!.end, hypothetical: true as const })),
        preserved: items.filter(item => visibleOriginals.has(item.id) && !changed.has(item.id) && !item.done && calendarCommitment(item).state === 'accepted')
          .map(item => ({ id: item.id, revision: item.revision || 1, title: item.title })), steps, checks,
        metrics: { changedObjects: projected.changes.length, removedObjects: projected.changes.filter(removesCalendarOccupancy).length,
          proposedActivities: projected.additions.length, scheduledMinutes: draft.scheduledMinutes, unscheduledTasks: draft.unscheduled.length,
          longestWorkMinutes: Math.max(0, ...draft.blocks.map(value => value.durationMinutes)),
          largestFreeWindowMinutes: Math.max(0, ...draft.freeWindows.map(value => value.minutes)), occupiedMinutes },
        workRhythms,
        feasibility: violations.length || sequencingIssues.length ? 'not_feasible' : rhythmIssues.length ? 'requested_rhythm_not_constructed' : unknown.length ? 'conditional' : draft.feasibility,
        issues: unique([...violations, ...sequencingIssues, ...rhythmIssues, ...unknown, ...draft.conditions], value => value), accepted: false, applied: false });
    } catch (error) {
      if (!(error instanceof HarnessError)) throw error;
      branches.push({ id: alternative.id, title: alternative.title, intent: alternative.intent, draftRequest, draft: null,
        changes: [], additions: [], preserved: [], steps: [], checks: [], workRhythms: [],
        metrics: { changedObjects: 0, removedObjects: 0, proposedActivities: 0, scheduledMinutes: 0,
          unscheduledTasks: 0, longestWorkMinutes: 0, largestFreeWindowMinutes: 0, occupiedMinutes: 0 },
        feasibility: 'not_constructed', issues: [error.message], accepted: false, applied: false });
    }
  }
  const baseline = expandAgenda(items.filter(item => !item.done), input.draft.from, input.draft.to, input.draft.timeZone);
  return { window: { from: input.draft.from, to: input.draft.to, timeZone: input.draft.timeZone },
    baseline: { calendarFingerprint: calendarPlanFingerprint(items), occurrences: baseline.items, issues: baseline.issues },
    preserveActionIds: input.preserveActionIds, branches, duplicates,
    coverage: { requestedBranches: input.alternatives.length, distinctBranches: branches.filter(branch => branch.draft).length,
      usableBranches: branches.filter(planningBranchUsable).length,
      meaningfulComparison: branches.filter(planningBranchUsable).length >= 2,
      meaning: "Branches share the actual calendar and original task conditions. Identical outcomes are not renamed to inflate the comparison. Each branch describes a possibility, not an accepted life, an optimum or new action permission." },
    accepted: false as const, applied: false as const,
    continuation: "Continue discussing a branch or particular interval. Once adoption is explicit, process existing events and proposed activities through original actions, then continue planning from the actually updated calendar. Partial success stays in the same discussion and is not called atomic group completion." };
}
export type PlanningComparison = ReturnType<typeof compareCalendarPlans>;

export function planningComparisonView(comparison: PlanningComparison, context: {
  comparisonId: string; matterId?: string; matterRevision?: number; sourceIds?: string[]; sourceBinding?: WorkSourceBinding;
  options?: { branchId: string; id: string; revision: number }[];
}): PlanningComparisonView {
  return { comparisonId: context.comparisonId, ...(context.matterId ? { matterId: context.matterId, matterRevision: context.matterRevision } : {}),
    window: comparison.window, sourceIds: context.sourceIds || ['local-agenda'], ...(context.sourceBinding ? { sourceBinding: context.sourceBinding } : {}),
    branches: comparison.branches.map(branch => {
      const option = context.options?.find(value => value.branchId === branch.id);
      return { branchId: branch.id, title: branch.title, intent: branch.intent,
        ...(option ? { optionRef: { id: option.id, revision: option.revision } } : {}), planId: null, hypothetical: true,
        feasibility: branch.feasibility, issues: branch.issues, metrics: branch.metrics,
        ...(branch.workRhythms.length ? { workRhythms: branch.workRhythms } : {}),
        removed: branch.changes.filter(removesCalendarOccupancy).map(value => ({ id: value.targetId, title: value.before.title,
          ...(value.occurrenceDate ? { occurrenceDate: value.occurrenceDate } : {}) })),
        unscheduled: branch.draft?.unscheduled.map(value => ({ title: value.title, reason: value.reason })) || [] };
    }), selectionMeaning: 'continue_discussion_not_execution' };
}
