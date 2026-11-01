import { createHash } from 'node:crypto';
import * as z from 'zod';
import type { Action } from '../../shared/types';
import { HarnessError } from '../../shared/harness';
import { calendarDate } from '../../shared/calendar';
import { expandAgenda } from './calendar';
import { addDate, dateInZone, canonical } from '../runtime/semantics';
import { planningDayBounds } from './planning-days';
import type { PlanningRetainedContext, RetainedBoundaryCoverage } from './planning-intent-contract';

const instant = z.string().datetime({ offset: true });
const minutes = z.number().int().min(0).max(1440);
const id = z.string().min(1).max(160);
const windowSchema = z.object({ start: instant, end: instant }).strict();
const duration = z.object({ min: minutes, max: minutes }).strict();
const condition = z.object({ condition: z.string().min(1).max(300), status: z.enum(['satisfied', 'unknown', 'unavailable']), sourceId: id.optional(), sourceVersion: z.string().max(160).optional() }).strict();
const taskSchema = z.object({
  id, title: z.string().min(1).max(160), detail: z.string().max(1200).default(''),
  durationMinutes: duration.describe("Remaining workload range. Reserve max; min does not permit omitting work. Unknown estimates need evidence rather than a silent default."),
  splittable: z.boolean().default(false), minimumChunkMinutes: z.number().int().min(1).max(1440).optional(),
  maximumChunkMinutes: z.number().int().min(1).max(1440).optional().describe("The block maximum chosen for this discussion, not medical advice. Splitting requires splittable=true, preserving restMinutes between blocks and total workload. If absent, continuous thinking is not forcibly interrupted."),
  dependsOn: z.array(id).max(30).default([]), earliestStart: instant.optional(), deadline: instant.optional(),
  allowedWindows: z.array(windowSchema).max(64).optional(), preferredWindows: z.array(windowSchema).max(32).default([]),
  placeId: id.optional(), effort: z.enum(['low', 'medium', 'high']).optional(),
  priority: z.number().int().min(0).max(10).default(0).describe("An explicit priority order for this discussion, not a personality or value score."),
  setupMinutes: minutes.default(0), cleanupMinutes: minutes.default(0),
  conditions: z.array(condition).max(12).default([]), sourceId: id.optional(), sourceVersion: z.string().max(160).optional(),
}).strict();

export const planningDraftInput = z.object({
  from: instant, to: instant, timeZone: z.string().max(100).default('America/Los_Angeles'),
  scheduleWindows: z.array(windowSchema).max(64).optional().describe("The overall window available for new work, setup, cleanup, travel and rest. Gaps are not guessed to be sleep or busy time. Omitting it calculates within the full review window without proving real availability; [] explicitly adds no occupancy. Task allowedWindows may further restrict tasks or resources."),
  tasks: z.array(taskSchema).max(30), completedTaskIds: z.array(id).max(100).default([]),
  busy: z.array(z.object({ start: instant, end: instant.nullable(), sourceId: id, sourceVersion: z.string().max(160).optional(), title: z.string().max(160).optional(), placeId: id.optional() }).strict()).max(500).default([]),
  sourceCoverage: z.array(z.object({ sourceId: id.describe("user-declared/current denotes only an explicit current statement, not external-connector coverage."), status: z.enum(['complete', 'partial', 'not_checked']), sourceVersion: z.string().max(160).optional(), reason: z.string().max(300).optional() }).strict()).max(30).default([]).describe("Each entry states actual coverage of a source included here. current or user-declared refers to tasks, windows and conditions supplied in the current statement. complete means the supplied content was fully included in this calculation, not that unread external commitments are empty or available. local-agenda covers only local records; it alone, or omitting this field, preserves undeclared external conditions. A current statement does not erase external partial/not_checked states or real uncertainty."),
  conditions: z.array(condition).max(20).default([]),
  protectedWindows: z.array(windowSchema.extend({ reason: z.string().min(1).max(300) }).strict()).max(64).default([]),
  restMinutes: z.number().int().min(0).max(120).default(10).describe("Extra rest between work blocks, without subtracting it from travel. Adjustable by the user; not a medical rule."),
  transitionMinutes: duration.default({ min: 0, max: 0 }).describe("Default transition cost at every entering and leaving boundary; an explicit directed place-pair cost takes precedence."),
  travelTimes: z.array(z.object({ fromPlaceId: id, toPlaceId: id, minutes: duration, sourceId: id, sourceVersion: z.string().max(160).optional() }).strict()).max(200).default([]),
  startPlaceId: id.optional(), endPlaceId: id.optional(),
  maxScheduledMinutes: z.number().int().min(0).max(44640).default(240).describe("Workload maximum for this window. A finite default budget is not a judgment of personal ability."),
  reserveMinutes: z.number().int().min(0).max(44640).default(30).describe("Minimum free time preserved in this window, without creating a task or completion obligation."),
  dailyBudgets: z.array(z.object({
    date: calendarDate,
    maxScheduledMinutes: z.number().min(0).max(44640).optional().describe("Maximum new net work minutes on this local date, alongside the overall limit. It excludes existing commitments, setup, cleanup, travel and rest and is not total daily workload. Fractional minutes can be retained during cross-midnight recovery."),
    reserveMinutes: z.number().int().min(0).max(44640).optional().describe("Minimum unallocated time in the intersection of this local date and window after existing busy time, protected windows and complete new occupancy. It is not assumed to be sleep or real-world availability."),
  }).strict().refine(value => value.maxScheduledMinutes !== undefined || value.reserveMinutes !== undefined, "A daily budget needs a work maximum or a free-time minimum.")).max(32).default([]).describe("Only daily limits explicitly chosen here, calculated by timeZone natural days and actual minutes across midnight. Dates not listed receive no default limit."),
  energyWindows: z.array(windowSchema.extend({ capacity: z.enum(['low', 'medium', 'high']), sourceId: id, sourceVersion: z.string().max(160).optional() }).strict()).max(64).default([]),
}).strict();

type Input = z.infer<typeof planningDraftInput>;
type Task = Input['tasks'][number];
type Interval = { start: number; end: number };
type PlanningDay = Interval & { date: string; budget?: Input['dailyBudgets'][number] };
type Occupied = Interval & { id: string; kind: 'fixed' | 'protected' | 'task' | 'support'; title?: string; placeId?: string; unknownEnd?: boolean;
  retained?: boolean; taskId?: string; segment?: number; workId?: string };
type Cost = { minutes: number; minMinutes: number; unknown: string[]; sources: string[] };
type Transfer = Interval & { fromId: string | null; toId: string | null; travel: Cost; restMinutes: number;
  fromWorkId?: string; toWorkId?: string; fromTaskId?: string; toTaskId?: string; fromSegment?: number; toSegment?: number; fromPlaceId?: string; toPlaceId?: string };
type Candidate = { start: number; end: number; reservedStart: number; reservedEnd: number; before: Cost; after: Cost; restBefore: number; restAfter: number; preferred: boolean; unknown: string[] };
const minute = 60000;
const maxSegments = 256;
const iso = (time: number) => new Date(time).toISOString();
const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const unique = (items: string[]) => [...new Set(items)];
const overlap = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

/** Includes additions/deletions and actual payload, not only the revision of a moved object. */
export function calendarPlanFingerprint(items: Action[]) {
  return hash([...items].sort((a, b) => a.id.localeCompare(b.id)));
}
export function assertDraftCalendarCurrent(items: Action[], expectedFingerprint: string) {
  if (calendarPlanFingerprint(items) !== expectedFingerprint) throw new HarnessError('planning_stale', "The calendar changed after this plan was generated. Recheck its whole window; nothing was written.");
}

function asInterval(value: { start: string; end: string }, label: string): Interval {
  const start = Date.parse(value.start), end = Date.parse(value.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new HarnessError('planning_window', `${label} has an invalid start/end range.`);
  return { start, end };
}
function merge(intervals: Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const item of [...intervals].sort((a, b) => a.start - b.start || a.end - b.end)) {
    const last = result.at(-1);
    if (last && item.start <= last.end) last.end = Math.max(last.end, item.end);
    else result.push({ ...item });
  }
  return result;
}
function freeIntervals(occupied: Interval[], bounds: Interval): Interval[] {
  const result: Interval[] = [];
  let cursor = bounds.start;
  for (const item of merge(occupied.filter(item => overlap(item, bounds)))) {
    if (item.start > cursor) result.push({ start: cursor, end: Math.min(item.start, bounds.end) });
    cursor = Math.max(cursor, item.end);
  }
  if (cursor < bounds.end) result.push({ start: cursor, end: bounds.end });
  return result;
}
function intersect(a: Interval, b: Interval): Interval | undefined {
  const start = Math.max(a.start, b.start), end = Math.min(a.end, b.end);
  return end > start ? { start, end } : undefined;
}
const intervalMinutes = (interval: Interval, bounds: Interval) => Math.max(0, Math.min(interval.end, bounds.end) - Math.max(interval.start, bounds.start)) / minute;
const workMinutesIn = (work: Interval[], bounds: Interval) => work.reduce((sum, value) => sum + intervalMinutes(value, bounds), 0);
const inBounds = (intervals: Interval[], bounds: Interval) => intervals.flatMap(value => { const clipped = intersect(value, bounds); return clipped ? [clipped] : []; });
const freeWithin = (occupied: Interval[], domain: Interval[], bounds: Interval) => inBounds(domain, bounds).flatMap(value => freeIntervals(occupied, value));
const totalMinutes = (intervals: Interval[]) => intervals.reduce((sum, value) => sum + (value.end - value.start) / minute, 0);
const freeMinutesIn = (occupied: Interval[], bounds: Interval, domain: Interval[]) => totalMinutes(freeWithin(occupied, domain, bounds));

function scheduleDomain(input: Input, bounds: Interval) {
  return input.scheduleWindows === undefined ? [bounds] : inBounds(merge(input.scheduleWindows.map(value => asInterval(value, "available window"))), bounds);
}

function planningDays(input: Input, bounds: Interval): PlanningDay[] {
  if (new Set(input.dailyBudgets.map(value => value.date)).size !== input.dailyBudgets.length)
    throw new HarnessError('planning_day_budget', "This local date has multiple budgets. Reconcile the intended choice first.");
  const result: PlanningDay[] = [];
  const lastDate = dateInZone(iso(bounds.end - 1), input.timeZone);
  for (let date = dateInZone(iso(bounds.start), input.timeZone); date <= lastDate; date = addDate(date, 1)) {
    const day = planningDayBounds(date, input.timeZone), clipped = intersect(bounds, { start: Date.parse(day.from), end: Date.parse(day.to) });
    if (clipped) result.push({ ...clipped, date, budget: input.dailyBudgets.find(value => value.date === date) });
  }
  if (input.dailyBudgets.some(value => !result.some(day => day.date === value.date)))
    throw new HarnessError('planning_day_budget', "The daily budget date is outside this time zone's planning window. Check the date.");
  return result;
}

/** The largest contiguous productive prefix allowed by every declared day cap. */
function dailyWorkCapacity(start: number, length: number, days: PlanningDay[], work: Interval[]) {
  let end = start + length * minute;
  for (const day of days) {
    if (day.budget?.maxScheduledMinutes === undefined || start >= day.end || end <= day.start) continue;
    const available = Math.max(0, day.budget.maxScheduledMinutes - workMinutesIn(work, day));
    if (intervalMinutes({ start, end }, day) > available) end = Math.min(end, Math.max(start, day.start) + available * minute);
  }
  return Math.max(0, Math.floor((end - start) / minute + 1e-8));
}
function validateInput(input: Input) {
  const bounds = asInterval({ start: input.from, end: input.to }, "planning");
  if (bounds.end - bounds.start > 31 * 86400000) throw new HarnessError('planning_window', "One multi-task calculation covers at most 31 days. Use bounded windows while preserving actual conditions.");
  try { new Intl.DateTimeFormat('en', { timeZone: input.timeZone }); } catch { throw new HarnessError('time_zone', "The planning time zone is invalid."); }
  if (new Set(input.tasks.map(task => task.id)).size !== input.tasks.length) throw new HarnessError('planning_task_id', "Task IDs are duplicated, making plans and dependencies ambiguous.");
  if (input.tasks.some(task => input.completedTaskIds.includes(task.id))) throw new HarnessError('planning_task_state', "The same task cannot be both awaiting scheduling and completed.");
  for (const value of [input.transitionMinutes, ...input.tasks.map(task => task.durationMinutes), ...input.travelTimes.map(item => item.minutes)])
    if (value.max < value.min) throw new HarnessError('planning_duration', "The duration maximum cannot be less than its minimum.");
  for (const task of input.tasks) {
    if (task.durationMinutes.min < 1 || task.minimumChunkMinutes && task.minimumChunkMinutes > task.durationMinutes.max) throw new HarnessError('planning_duration', "Task duration must be positive, and the minimum block cannot exceed the total maximum duration.");
    if (task.maximumChunkMinutes && task.maximumChunkMinutes < (task.minimumChunkMinutes || (task.splittable ? Math.min(30, task.durationMinutes.max) : 1)))
      throw new HarnessError('planning_chunk', "The block maximum is below the minimum block. Adjust the actual choice rather than silently shorten meaningful work.");
    if (task.earliestStart && task.deadline && Date.parse(task.deadline) <= Date.parse(task.earliestStart)) throw new HarnessError('planning_window', "The task deadline must follow its earliest start.");
    for (const value of [...task.allowedWindows || [], ...task.preferredWindows]) asInterval(value, "task window");
  }
  for (const value of [...input.protectedWindows, ...input.energyWindows]) asInterval(value, "protected or energy window");
  for (const value of input.busy) if (value.end) asInterval({ start: value.start, end: value.end }, "external busy interval");
  const pairs = input.travelTimes.map(item => `${item.fromPlaceId}\0${item.toPlaceId}`);
  if (new Set(pairs).size !== pairs.length) throw new HarnessError('planning_travel', "Conflicting transition costs were supplied for the same directed place pair. Choose one current version first.");
  return bounds;
}

function travelCost(input: Input, from: string | undefined, to: string | undefined): Cost {
  if (from && to && from === to) return { minutes: 0, minMinutes: 0, unknown: [], sources: [] };
  const known = from && to ? input.travelTimes.find(item => item.fromPlaceId === from && item.toPlaceId === to) : undefined;
  if (known) return { minutes: known.minutes.max, minMinutes: known.minutes.min, unknown: known.sourceVersion ? [] : ["The transition basis has no version. Recheck before adoption."], sources: [known.sourceId] };
  return { minutes: input.transitionMinutes.max, minMinutes: input.transitionMinutes.min,
    unknown: from || to ? ["Complete directed route evidence is missing. This calculation uses the declared default transition cost."] : [], sources: [] };
}

function sourceIssues(input: Input, issues: unknown[]): string[] {
  const declared = input.sourceCoverage.filter(value => value.sourceId !== 'local-agenda');
  return unique([
    ...(!declared.length ? ["Other calendar sources have no declared coverage. Local blank space does not prove real availability."] : declared.filter(value => value.status !== 'complete').map(value => value.reason || `${value.sourceId} is not fully covered.`)),
    ...input.conditions.filter(value => value.status !== 'satisfied').map(value => value.condition),
    ...(issues.length ? ["The local calendar has an unknown end time or an occurrence that could not be expanded."] : []),
    ...input.busy.filter(value => !value.sourceVersion).map(value => `${value.sourceId}The busy interval has no version. Recheck before adoption.`),
    ...input.energyWindows.filter(value => !value.sourceVersion).map(value => `${value.sourceId}The energy basis has no version. Recheck the current state before adoption.`),
  ]);
}

function dependencyCycles(tasks: Task[]): Set<string> {
  const byId = new Map(tasks.map(task => [task.id, task]));
  const visited = new Set<string>(), visiting: string[] = [], cycles = new Set<string>();
  const visit = (taskId: string) => {
    const cycleAt = visiting.indexOf(taskId);
    if (cycleAt >= 0) { for (const value of visiting.slice(cycleAt)) cycles.add(value); return; }
    if (visited.has(taskId)) return;
    visiting.push(taskId);
    for (const dependency of byId.get(taskId)?.dependsOn || []) if (byId.has(dependency)) visit(dependency);
    visiting.pop(); visited.add(taskId);
  };
  for (const task of tasks) visit(task.id);
  return cycles;
}

function boundaryRequirements(input: Input, left: Occupied | undefined, right: Occupied | undefined, bounds: Interval, coverage: RetainedBoundaryCoverage[]) {
  const fromPlaceId = left ? left.placeId : input.startPlaceId, toPlaceId = right ? right.placeId : input.endPlaceId;
  const travel = travelCost(input, fromPlaceId, toPlaceId), rest = left?.kind === 'task' && right?.kind === 'task' ? input.restMinutes : 0;
  const start = Math.max(bounds.start, left?.end ?? bounds.start), end = Math.min(bounds.end, right?.start ?? bounds.end);
  const endpointMatches = (workId: string | undefined, taskId: string | undefined, endpoint: Occupied | undefined) =>
    endpoint?.kind === 'task' ? !!(workId && workId === endpoint.workId || taskId && taskId === endpoint.taskId) : !workId && !taskId;
  // New writes use the clipped gap above. Verified saved support keeps its
  // original geometry, including future seconds before the aligned new horizon.
  const covered = coverage.filter(value => Date.parse(value.start) >= (left?.end ?? -Infinity) && Date.parse(value.end) <= (right?.start ?? Infinity)
    && endpointMatches(value.fromWorkId, value.fromTaskId, left) && endpointMatches(value.toWorkId, value.toTaskId, right));
  const restCovered = covered.reduce((sum, value) => sum + value.restMinutes, 0);
  const travelCovered = covered.filter(value => value.fromPlaceId === fromPlaceId && value.toPlaceId === toPlaceId).reduce((sum, value) => sum + value.travelMinutes, 0);
  return { start, end, travel: { ...travel, minutes: Math.max(0, travel.minutes - travelCovered), minMinutes: Math.max(0, travel.minMinutes - travelCovered) },
    restMinutes: Math.max(0, rest - restCovered) };
}

/** Reserve each shared boundary once. Stored support stays occupied and only
 * supplies exact coverage; it never becomes a fictitious intermediate place. */
function transferReservations(input: Input, occupied: Occupied[], bounds: Interval, domain: Interval[], coverage: RetainedBoundaryCoverage[]): Transfer[] | undefined {
  const sequence = occupied.filter(value => value.kind !== 'protected' && value.kind !== 'support').sort((a, b) => a.start - b.start || a.end - b.end);
  const result: Transfer[] = [];
  for (let index = 0; index <= sequence.length; index++) {
    const left = sequence[index - 1], right = sequence[index];
    if (left?.kind !== 'task' && right?.kind !== 'task') continue;
    const { start, end, travel, restMinutes } = boundaryRequirements(input, left, right, bounds, coverage);
    const length = (travel.minutes + restMinutes) * minute;
    if (!length) continue;
    if (end < start) return undefined;
    const gaps = freeWithin(occupied.filter(value => value.kind === 'protected' || value.kind === 'support'), domain, { start, end });
    const free = [...gaps].reverse().find(value => value.end - value.start >= length);
    if (!free) return undefined;
    result.push({ start: free.end - length, end: free.end, fromId: left?.id || null, toId: right?.id || null, travel, restMinutes,
      ...(left?.workId ? { fromWorkId: left.workId } : {}), ...(right?.workId ? { toWorkId: right.workId } : {}),
      ...(left?.taskId ? { fromTaskId: left.taskId, fromSegment: left.segment } : {}), ...(right?.taskId ? { toTaskId: right.taskId, toSegment: right.segment } : {}),
      ...((left ? left.placeId : input.startPlaceId) ? { fromPlaceId: left ? left.placeId : input.startPlaceId } : {}),
      ...((right ? right.placeId : input.endPlaceId) ? { toPlaceId: right ? right.placeId : input.endPlaceId } : {}) });
  }
  return result;
}

function candidates(task: Task, remaining: number, workBudget: number, earliest: number, input: Input, occupied: Occupied[], bounds: Interval, days: PlanningDay[], work: Interval[], domain: Interval[], coverage: RetainedBoundaryCoverage[]): Candidate[] {
  const taskBounds = { start: Math.max(bounds.start, earliest, task.earliestStart ? Date.parse(task.earliestStart) : bounds.start), end: Math.min(bounds.end, task.deadline ? Date.parse(task.deadline) : bounds.end) };
  const allowed = task.allowedWindows === undefined ? [taskBounds] : merge(task.allowedWindows.map(value => asInterval(value, "task window"))).flatMap(value => { const intersection = intersect(value, taskBounds); return intersection ? [intersection] : []; });
  const levels = { low: 1, medium: 2, high: 3 };
  const energy = input.energyWindows.map(value => ({ ...asInterval(value, "energy window"), ...value, start: Date.parse(value.start), end: Date.parse(value.end) }));
  const unsuitable = task.effort ? energy.filter(value => levels[value.capacity] < levels[task.effort!]) : [];
  const free = freeWithin([...occupied, ...unsuitable], domain, taskBounds);
  const preferences = task.preferredWindows.map(value => asInterval(value, "preferred window"));
  const result: Candidate[] = [];
  for (const gap of free) {
    const previous = occupied.filter(value => value.end <= gap.start && value.kind !== 'protected' && value.kind !== 'support').sort((a, b) => b.end - a.end)[0];
    const next = occupied.filter(value => value.start >= gap.end && value.kind !== 'protected' && value.kind !== 'support').sort((a, b) => a.start - b.start)[0];
    const placeholder: Occupied = { id: 'candidate', kind: 'task', taskId: task.id, start: gap.start, end: gap.end, placeId: task.placeId };
    const entering = boundaryRequirements(input, previous, { ...placeholder, end: gap.start }, bounds, coverage);
    const leaving = boundaryRequirements(input, { ...placeholder, start: gap.end }, next, bounds, coverage);
    const before = entering.travel, after = leaving.travel, restBefore = entering.restMinutes, restAfter = leaving.restMinutes;
    const earliestCore = gap.start + (before.minutes + restBefore + task.setupMinutes) * minute;
    const latestCore = gap.end - (after.minutes + restAfter + task.cleanupMinutes) * minute;
    for (const valid of allowed) {
      // A declared availability window includes preparation and cleanup, not only productive minutes.
      const usable = intersect({ start: earliestCore, end: latestCore }, { start: valid.start + task.setupMinutes * minute, end: valid.end - task.cleanupMinutes * minute });
      if (!usable) continue;
      // Include preferred starts and boundaries of known energy; all choices are checked again below.
      const dayStarts = input.dailyBudgets.length ? days.flatMap(day => [day.start, day.end,
        ...(day.budget?.maxScheduledMinutes !== undefined ? [day.end - Math.max(0, day.budget.maxScheduledMinutes - workMinutesIn(work, day)) * minute] : [])])
        .filter(value => value >= usable.start && value < usable.end) : [];
      const starts = unique([String(usable.start), ...preferences.filter(value => overlap(value, usable)).map(value => String(Math.max(usable.start, value.start))), ...energy.filter(value => overlap(value, usable)).map(value => String(Math.max(usable.start, value.start))), ...dayStarts.map(String)]).map(Number);
      for (const start of starts) {
        const capacity = Math.floor((usable.end - start) / minute);
        let length = task.splittable ? Math.min(remaining, capacity, workBudget, task.maximumChunkMinutes ?? Infinity) : remaining;
        const dailyCapacity = dailyWorkCapacity(start, length, days, work);
        if (task.splittable) length = Math.min(length, dailyCapacity);
        else if (dailyCapacity < length) continue;
        const minimum = task.minimumChunkMinutes || (task.splittable ? Math.min(30, task.durationMinutes.max) : task.durationMinutes.max);
        if (task.splittable && remaining > length && remaining - length < minimum) length = remaining - minimum;
        if (length < minimum || length > capacity) continue;
        const end = start + length * minute;
        const knownEnergy = task.effort ? merge(energy.filter(value => levels[value.capacity] >= levels[task.effort!]).map(value => ({ start: value.start, end: value.end }))).some(value => value.start <= start && value.end >= end) : true;
        result.push({ start, end, reservedStart: start - task.setupMinutes * minute, reservedEnd: end + task.cleanupMinutes * minute,
          before, after, restBefore, restAfter, preferred: preferences.some(value => value.start <= start && value.end >= end),
          unknown: unique([...before.unknown, ...after.unknown, ...task.conditions.filter(value => value.status === 'unknown').map(value => value.condition), ...(knownEnergy ? [] : ["There is no current self-report of energy for this period. The arrangement still needs confirmation."])]) });
      }
    }
  }
  return result.sort((a, b) => Number(b.preferred) - Number(a.preferred) || a.unknown.length - b.unknown.length || a.start - b.start || b.end - a.end);
}

/** Constructive, bounded and read-only: failure to place is not a proof of global infeasibility. */
export function draftCalendarPlan(items: Action[], raw: unknown, retained?: PlanningRetainedContext) {
  const input = planningDraftInput.parse(raw), bounds = validateInput(input);
  const days = planningDays(input, bounds), domain = scheduleDomain(input, bounds);
  const retainedRecordIds = new Set([...(retained?.work || []), ...(retained?.boundaries || [])].flatMap(value => value.recordIds));
  const coverage = retained?.boundaries || [];
  for (const value of [...(retained?.work || []), ...coverage]) {
    if (!value.recordIds.length || value.recordVersions.length !== value.recordIds.length || value.recordVersions.some(version => {
      const row = items.find(item => item.id === version.id);
      return !value.recordIds.includes(version.id) || !row || row.done || row.planning?.state !== 'accepted' || (row.revision || 1) !== version.revision;
    })) throw new HarnessError('planning_retained_changed', "Saved occupancy changed or lacks a current version. No new plan was generated.");
  }
  // Only accepted time commitments constrain a plan, including their unresolved
  // occurrences. Look outside the window for transfers crossing its edges.
  const expansion = expandAgenda(items.filter(item => !item.done && (!item.planning || item.planning.state === 'accepted')
    && (!item.kind || ['event', 'time_block'].includes(item.kind))), iso(bounds.start - 1440 * minute), iso(bounds.end + 1440 * minute), input.timeZone);
  const issues = [...expansion.issues];
  const occupied: Occupied[] = [];
  const localSources: { sourceId: string; sourceVersion: string; occurrenceId: string }[] = [];
  for (const row of expansion.items) {
    const item = row as unknown as Action & { occurrenceId: string; endsAt?: string | null; dateBounds?: { from: string; to: string } };
    if (retainedRecordIds.has(item.id)) { localSources.push({ sourceId: item.id, sourceVersion: String(item.revision || 1), occurrenceId: item.occurrenceId }); continue; }
    if (item.planning && item.planning.state !== 'accepted' || item.kind && !['event', 'time_block'].includes(item.kind)) continue;
    const allDay = item.allDayDate ? planningDayBounds(item.allDayDate, item.timeZone || input.timeZone) : undefined;
    const start = Date.parse(allDay?.from || item.startsAt || '');
    if (!Number.isFinite(start)) continue;
    const unknownEnd = !allDay && !item.durationMinutes;
    const end = allDay ? Date.parse(allDay.to) : item.durationMinutes ? start + item.durationMinutes * minute : bounds.end;
    // The numeric end only reserves conservative accounting space. Keep the
    // original uncertainty so a view never presents it as an observed end.
    occupied.push({ id: item.occurrenceId, kind: 'fixed', title: item.title, start, end, placeId: item.planning?.placeId, ...(unknownEnd ? { unknownEnd: true } : {}) });
    if (unknownEnd && start < bounds.end && !issues.some(issue => issue.status === 'unknown_end' && issue.id === item.id && Date.parse(String(issue.startsAt)) === start))
      issues.push({ id: item.id, occurrenceId: item.occurrenceId, status: 'unknown_end', startsAt: iso(start) });
    localSources.push({ sourceId: item.id, sourceVersion: String(item.revision || 1), occurrenceId: item.occurrenceId });
  }
  // Unknown-duration occurrences preceding the requested window are reported as issues, not items.
  for (const issue of expansion.issues) if (issue.status === 'unknown_end' && typeof issue.startsAt === 'string') {
    const item = items.find(value => value.id === issue.id);
    if (item && (!item.planning || item.planning.state === 'accepted') && (!item.kind || ['event', 'time_block'].includes(item.kind))) occupied.push({ id: String(issue.id), kind: 'fixed', title: item.title, start: Date.parse(issue.startsAt), end: bounds.end, placeId: item.planning?.placeId, unknownEnd: true });
  }
  for (const value of input.busy) occupied.push({ id: value.sourceId, kind: 'fixed', title: value.title, start: Date.parse(value.start), end: value.end ? Date.parse(value.end) : bounds.end, placeId: value.placeId, ...(value.end === null ? { unknownEnd: true } : {}) });
  for (const value of retained?.work || []) occupied.push({ ...asInterval({ start: value.reservedStart, end: value.reservedEnd }, "saved work"), id: value.id,
    kind: 'task', retained: true, workId: value.id, taskId: value.taskId, segment: value.segment, placeId: value.placeId,
    title: items.find(item => value.recordIds.includes(item.id))?.title || "saved work schedule" });
  for (const value of coverage) occupied.push({ ...asInterval(value, "saved boundary"), id: value.id, kind: 'support', retained: true, title: "saved travel and rest" });
  const protectedWindows = input.protectedWindows.flatMap(value => inBounds(domain, asInterval(value, "protected window"))
    .map(window => ({ start: iso(window.start), end: iso(window.end), reason: value.reason })));
  for (const [index, value] of protectedWindows.entries()) occupied.push({ ...asInterval(value, "protected window"), id: `protected:${index}`, kind: 'protected' });
  const baseOccupied = occupied.map(value => ({ ...value }));
  const initialFreeMinutes = freeMinutesIn(occupied, bounds, domain);
  const baseUnknown = sourceIssues(input, issues);
  if (input.busy.some(value => value.end === null)) baseUnknown.push("An external busy interval has an unknown end. It conservatively occupies time through the window's end.");
  if (input.scheduleWindows !== undefined && input.protectedWindows.some(value => {
    const requested = intersect(asInterval(value, "protected window"), bounds);
    return requested && totalMinutes(inBounds(domain, requested)) < (requested.end - requested.start) / minute - 1e-8;
  })) baseUnknown.push("Some protected time is outside the available window and was not included in this plan's adoption units. The original request was not marked saved; handle it separately or adjust the scope.");
  const cycles = dependencyCycles(input.tasks), completed = new Set(input.completedTaskIds);
  const byId = new Map(input.tasks.map(value => [value.id, value])), finished = new Map<string, number>((retained?.scheduledTasks || []).map(value => [value.taskId, Date.parse(value.reservedEnd)]));
  const blocks: { taskId: string; title: string; start: string; end: string; durationMinutes: number; reservedStart: string; reservedEnd: string; placeId?: string; segment: number; preferred: boolean; conditions: string[]; travelBefore: Cost; travelAfter: Cost; restBeforeMinutes: number; restAfterMinutes: number }[] = [];
  const unscheduled: { taskId: string; title: string; remainingMinutes: number; code: string; reason: string; dependencyIds?: string[] }[] = [];
  const fail = (task: Task, remaining: number, code: string, reason: string, dependencyIds?: string[]) => unscheduled.push({ taskId: task.id, title: task.title, remainingMinutes: remaining, code, reason, ...(dependencyIds ? { dependencyIds } : {}) });
  let workMinutes = 0;
  const pending = [...input.tasks].sort((a, b) => b.priority - a.priority || (a.deadline ? Date.parse(a.deadline) : bounds.end) - (b.deadline ? Date.parse(b.deadline) : bounds.end) || a.id.localeCompare(b.id));
  while (pending.length) {
    const index = pending.findIndex(task => cycles.has(task.id) || task.dependsOn.every(value => completed.has(value) || finished.has(value) || !pending.some(other => other.id === value)));
    const task = pending.splice(index >= 0 ? index : 0, 1)[0];
    const missing = task.dependsOn.filter(value => !byId.has(value) && !completed.has(value) && !finished.has(value));
    const blocked = task.dependsOn.filter(value => !completed.has(value) && !finished.has(value));
    if (cycles.has(task.id)) { fail(task, task.durationMinutes.max, 'dependency_cycle', "Prerequisite tasks form a cycle. Clarify their actual order.", task.dependsOn); continue; }
    if (missing.length) { fail(task, task.durationMinutes.max, 'dependency_missing', "A prerequisite task was not supplied and has no completion evidence.", missing); continue; }
    if (blocked.length) { fail(task, task.durationMinutes.max, 'dependency_unplaced', "A prerequisite is not fully scheduled. Dependent work was not moved ahead of it.", blocked); continue; }
    const unavailable = [...input.conditions, ...task.conditions].filter(value => value.status === 'unavailable');
    if (unavailable.length) { fail(task, task.durationMinutes.max, 'condition_unavailable', unavailable.map(value => value.condition).join('；')); continue; }
    if (!task.splittable && task.maximumChunkMinutes && task.durationMinutes.max > task.maximumChunkMinutes) {
      fail(task, task.durationMinutes.max, 'split_permission_required', "Total work exceeds this block maximum, but splitting is not allowed. The full workload remains; adjust the maximum or explicitly allow splitting."); continue;
    }
    let remaining = task.durationMinutes.max, lastEnd = Math.max(bounds.start, ...task.dependsOn.map(value => finished.get(value) || bounds.start)), segment = 0;
    while (remaining > 0) {
      if (blocks.length >= maxSegments) { fail(task, remaining, 'segment_limit', "This plan reached its calculation limit of 256 work blocks. Remaining workload is preserved. Use a shorter window or longer valid blocks."); break; }
      if (workMinutes >= input.maxScheduledMinutes) { fail(task, remaining, 'budget_or_reserve', "This window's workload limit was reached. Remaining tasks stay open without an added catch-up obligation."); break; }
      const scheduledWork = blocks.map(block => ({ start: Date.parse(block.start), end: Date.parse(block.end) }));
      const options = candidates(task, remaining, input.maxScheduledMinutes - workMinutes, lastEnd, input, occupied, bounds, days, scheduledWork, domain, coverage);
      if (!options.length) { fail(task, remaining, 'no_placement_found', `Given the available window, current commitments, task windows, energy limits, continuous duration${input.dailyBudgets.length ? ", daily work budgets" : ''} and transition costs, this construction found no suitable slot. It is not proof of global infeasibility.`); break; }
      const fits = (value: Candidate) => {
        const length = (value.end - value.start) / minute;
        const projectedOccupied: Occupied[] = [...occupied, { start: value.reservedStart, end: value.reservedEnd, id: `${task.id}:${segment + 1}`, kind: 'task', taskId: task.id, segment: segment + 1, placeId: task.placeId }];
        const transfers = transferReservations(input, projectedOccupied, bounds, domain, coverage);
        if (!transfers) return { fits: false, freeDeficit: Infinity };
        const projected = freeMinutesIn([...projectedOccupied, ...transfers], bounds, domain);
        const dailyDeficit = Math.max(0, ...days.filter(day => day.budget).flatMap(day => [
          (day.budget!.reserveMinutes ?? 0) - freeMinutesIn([...projectedOccupied, ...transfers], day, domain),
          day.budget!.maxScheduledMinutes === undefined ? 0 : workMinutesIn([...scheduledWork, value], day) - day.budget!.maxScheduledMinutes,
        ]));
        return { fits: workMinutes + length <= input.maxScheduledMinutes && projected >= input.reserveMinutes && dailyDeficit <= 1e-8,
          freeDeficit: Math.max(0, input.reserveMinutes - projected, workMinutes + length - input.maxScheduledMinutes, dailyDeficit) };
      };
      let candidate: Candidate | undefined;
      for (const option of options) {
        const check = fits(option);
        if (check.fits) { candidate = option; break; }
        if (!task.splittable || !Number.isFinite(check.freeDeficit)) continue;
        const minimum = task.minimumChunkMinutes || Math.min(30, task.durationMinutes.max);
        if (input.dailyBudgets.length) {
          const resized = (length: number) => ({ ...option, end: option.start + length * minute, reservedEnd: option.start + (length + task.cleanupMinutes) * minute });
          if (!fits(resized(minimum)).fits) continue;
          // A bounded prefix search can free several local dates, unlike simply
          // subtracting one day's deficit from the tail of a multi-day block.
          let low = minimum, high = Math.floor((option.end - option.start) / minute);
          while (low < high) {
            const middle = Math.ceil((low + high) / 2);
            if (fits(resized(middle)).fits) low = middle; else high = middle - 1;
          }
          if (remaining > low && remaining - low < minimum) low = remaining - minimum;
          if (low >= minimum && fits(resized(low)).fits) { candidate = resized(low); break; }
          continue;
        }
        let length = (option.end - option.start) / minute - Math.ceil(check.freeDeficit);
        if (remaining > length && remaining - length < minimum) length = remaining - minimum;
        if (length < minimum) continue;
        const shorter = { ...option, end: option.start + length * minute, reservedEnd: option.start + (length + task.cleanupMinutes) * minute };
        if (fits(shorter).fits) { candidate = shorter; break; }
      }
      if (!candidate) { fail(task, remaining, 'budget_or_reserve', "This window's or day's work limit and required free time cannot accommodate this block. Rest and free time were not filled."); break; }
      const length = (candidate.end - candidate.start) / minute;
      blocks.push({ taskId: task.id, title: task.title, start: iso(candidate.start), end: iso(candidate.end), durationMinutes: length,
        reservedStart: iso(candidate.reservedStart), reservedEnd: iso(candidate.reservedEnd), ...(task.placeId ? { placeId: task.placeId } : {}), segment: ++segment,
        preferred: candidate.preferred, conditions: candidate.unknown, travelBefore: candidate.before, travelAfter: candidate.after, restBeforeMinutes: candidate.restBefore, restAfterMinutes: candidate.restAfter });
      occupied.push({ start: candidate.reservedStart, end: candidate.reservedEnd, id: `${task.id}:${segment}`, kind: 'task', taskId: task.id, segment, placeId: task.placeId });
      workMinutes += length; remaining -= length; lastEnd = candidate.reservedEnd;
    }
    if (remaining === 0) finished.set(task.id, lastEnd);
  }
  blocks.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const remainingTransfers = transferReservations(input, occupied, bounds, domain, coverage);
  if (!remainingTransfers && retained?.work.length)
    throw new HarnessError('planning_retained_boundary_unfit', "The current scope cannot fit required travel or rest around saved work. Original occupancy remains. Adjust the conditions before a new plan; its boundaries were not omitted.");
  const transfers = remainingTransfers || [];
  // Inserting a task changes neighbours; expose the final boundaries, never stale candidate routes.
  const sequence = occupied.filter(value => value.kind !== 'protected' && value.kind !== 'support').sort((a, b) => a.start - b.start || a.end - b.end);
  for (const block of blocks) {
    const index = sequence.findIndex(value => value.kind === 'task' && !value.retained && value.taskId === block.taskId && value.segment === block.segment);
    const previous = sequence[index - 1], next = sequence[index + 1];
    const entering = boundaryRequirements(input, previous, sequence[index], bounds, coverage), leaving = boundaryRequirements(input, sequence[index], next, bounds, coverage);
    block.travelBefore = entering.travel; block.travelAfter = leaving.travel;
    block.restBeforeMinutes = entering.restMinutes; block.restAfterMinutes = leaving.restMinutes;
    block.conditions = unique([...block.conditions.filter(value => !value.startsWith("place")), ...block.travelBefore.unknown, ...block.travelAfter.unknown]);
  }
  const daySummaries = days.map(day => {
    const scheduledMinutes = workMinutesIn(blocks.map(block => ({ start: Date.parse(block.start), end: Date.parse(block.end) })), day);
    const eligible = inBounds(domain, day), eligibleMinutes = totalMinutes(eligible);
    const freeMinutes = freeMinutesIn([...occupied, ...transfers], day, domain), initialFreeMinutes = freeMinutesIn(baseOccupied, day, domain);
    const reserveShortfallMinutes = Math.max(0, (day.budget?.reserveMinutes ?? 0) - freeMinutes);
    return { date: day.date, from: iso(day.start), to: iso(day.end), timeZone: input.timeZone,
      budget: day.budget || null, scheduledMinutes, initialFreeMinutes, freeMinutes,
      eligibleWindows: eligible.map(value => ({ start: iso(value.start), end: iso(value.end) })), eligibleMinutes,
      outsideScopeMinutes: Math.max(0, (day.end - day.start) / minute - eligibleMinutes), occupiedMinutes: eligibleMinutes - freeMinutes,
      reserveShortfallMinutes, status: reserveShortfallMinutes > 1e-8 ? 'existing_commitments_exceed_reserve' : 'within_declared_budget',
      meaning: "Work duration counts actual new work placed here, split across each local date at midnight. Occupancy and free time cover only the period under discussion, with existing commitments, protected time, setup, cleanup, travel and rest reserved. Time outside it stays with the user's life; this calculation makes no claim about what happens then." };
  });
  const allUnknown = unique([...baseUnknown, ...blocks.flatMap(value => value.conditions),
    ...(freeMinutesIn([...occupied, ...transfers], bounds, domain) + 1e-8 < input.reserveMinutes
      ? ["The available window cannot preserve the requested total free time after complete occupancy. Adjust the window, original events or free-time requirement first."] : []),
    ...daySummaries.filter(day => day.reserveShortfallMinutes > 1e-8).map(day => `${day.date}After existing occupancy and protection, the available window cannot preserve the requested free time. It was not expanded and commitments were not moved automatically. Adjust the window, events or free-time choice.`)]);
  const calendarFingerprint = calendarPlanFingerprint(items);
  const sourceRevisions = [...localSources, ...[
    ...input.busy, ...input.travelTimes, ...input.energyWindows, ...input.tasks.filter(value => value.sourceId),
    ...input.sourceCoverage.filter(value => !['local-agenda', 'user-declared', 'current'].includes(value.sourceId)),
    ...input.conditions.filter(value => value.sourceId), ...input.tasks.flatMap(value => value.conditions.filter(condition => condition.sourceId)),
  ].map(value => ({ sourceId: value.sourceId!, sourceVersion: value.sourceVersion || null, occurrenceId: null }))];
  return {
    window: { from: input.from, to: input.to, timeZone: input.timeZone },
    scheduleCoverage: { mode: input.scheduleWindows === undefined ? 'horizon_only' : 'provided_windows',
      windows: domain.map(value => ({ start: iso(value.start), end: iso(value.end) })),
      meaning: input.scheduleWindows === undefined ? "No specific available periods were supplied, so this calculates within the period being reviewed. Discuss whether calendar gaps actually suit the user." : "This calculation stays inside the agreed periods being reviewed, including work, setup, cleanup, travel and rest. Other time remains unchanged and receives no additional protected event." },
    strategy: 'dependency_ready_priority_deadline_constructive', optimality: 'not_claimed', limits: { maxWorkSegments: maxSegments },
    calendarFingerprint, planFingerprint: hash({ input, calendarFingerprint }), sourceRevisions,
    sourceCoverage: [{ sourceId: 'local-agenda', status: issues.length === 0 ? 'complete' : 'partial', reason: "These are confirmed local events that occupy time. Other commitments and today's energy still depend on the user's current information." }, ...input.sourceCoverage.filter(value => value.sourceId !== 'local-agenda')],
    effectivePreferences: { restMinutes: input.restMinutes, transitionMinutes: input.transitionMinutes, maxScheduledMinutes: input.maxScheduledMinutes, reserveMinutes: input.reserveMinutes, dailyBudgets: input.dailyBudgets,
      taskRhythms: input.tasks.filter(task => task.maximumChunkMinutes !== undefined || task.minimumChunkMinutes !== undefined).map(task => ({ taskId: task.id, splittable: task.splittable, minimumChunkMinutes: task.minimumChunkMinutes ?? (task.splittable ? Math.min(30, task.durationMinutes.max) : task.durationMinutes.max), maximumChunkMinutes: task.maximumChunkMinutes ?? null })) },
    blocks, unscheduled, fixedCommitments: baseOccupied.filter(value => value.kind === 'fixed' || value.retained).map(value => ({ ...value, start: iso(value.start), end: iso(value.end) })),
    protectedWindows, transitions: transfers.map(value => ({ ...value, start: iso(value.start), end: iso(value.end) })),
    freeWindows: freeWithin([...occupied, ...transfers], domain, bounds).map(value => ({ start: iso(value.start), end: iso(value.end), minutes: (value.end - value.start) / minute, meaning: "These openings remain inside the agreed available window after reserving existing events and complete travel and rest. Their suitability still depends on the conditions supplied here." })),
    initialFreeMinutes, scheduledMinutes: workMinutes, daySummaries, conditions: allUnknown, issues,
    feasibility: !blocks.length && unscheduled.length ? 'no_plan_constructed' : allUnknown.length ? 'conditional' : unscheduled.length ? 'partial_for_declared_sources' : 'verified_for_declared_sources',
    completeness: unscheduled.length ? 'partial' : 'all_tasks_placed', accepted: false, applied: false,
    acceptanceProposals: blocks.map(block => ({ taskId: block.taskId, segment: block.segment, dependsOn: byId.get(block.taskId)!.dependsOn,
      capability: 'local.agenda.save', arguments: { title: block.title, detail: byId.get(block.taskId)!.detail, kind: 'time_block', startsAt: block.start, durationMinutes: block.durationMinutes, timeZone: input.timeZone, planning: { state: 'accepted', flexibility: 'movable', ...(block.placeId ? { placeId: block.placeId } : {}) } },
      applied: false, requiresAuthorization: true, requiresPlanRevalidation: true,
    })),
    acceptanceContract: "This draft is not in the calendar. After the user chooses it, or when an existing explicit instruction already authorizes it, the app rechecks calendar and source changes, reviews the whole plan, and saves steps in order. If interrupted, describe accurately which steps were saved and which were not.",
  };
}
