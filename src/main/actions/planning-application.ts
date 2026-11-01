import { createHash, randomUUID } from 'node:crypto';
import * as z from 'zod';
import type { Action } from '../../shared/types';
import { HarnessError, type ScopeData } from '../../shared/harness';
import { canonical } from '../runtime/semantics';
import { calendarPlanFingerprint, draftCalendarPlan, planningDraftInput } from './planning-draft';
import { planningDayBounds } from './planning-days';
import type { PlanningHostContext, PlanningManifest } from './planning-intent-contract';
import { campusConstraintSummary, type PlanningCampusConstraints, type PlanningCampusPort } from './planning-campus';

export const planningPlanRefSchema = z.object({ planId: z.string().uuid(), blockId: z.string().min(1).max(160) }).strict();
export const planningRecoveryInput = z.object({ planId: z.string().uuid() }).strict();
export type PlanningPlanRef = z.infer<typeof planningPlanRefSchema>;
type Input = z.infer<typeof planningDraftInput>;
type Draft = ReturnType<typeof draftCalendarPlan>;
type SaveArguments = { title: string; detail: string; kind: 'time_block'; startsAt: string; durationMinutes: number; timeZone: string; planning: { state: 'accepted'; flexibility: 'fixed' | 'movable'; placeId?: string }; planRef: PlanningPlanRef };
type Unit = { blockId: string; kind: 'work' | 'transition' | 'protected'; taskId?: string; segment?: number; boundaryIndex?: number; arguments: SaveArguments };
type SourceRevision = { sourceId: string; sourceVersion: string | null };
type Owner = Pick<ScopeData, 'principalId' | 'workspaceId' | 'deviceId' | 'subjectId' | 'worldId' | 'audience'>;
type Ticket = {
  scope: ScopeData; input: Input; output: Draft; units: Unit[]; sources: SourceRevision[];
  createdAt: string;
  expiresAt: number; fingerprint: string; itemDigests: Map<string, string>; applied: { blockId: string; recordId: string }[];
  invalidatedReason?: string;
  progressUncertain?: boolean;
  hasPreparations?: boolean;
  /** Host continuation constraint; ordinary historical drafts keep their original semantics. */
  futureOnly?: boolean;
  hostContext?: PlanningHostContext;
  campus?: PlanningCampusConstraints;
};
const minute = 60000;
const ttl = 15 * minute;
const sameOwner = (a: Owner, b: Owner) => (['principalId', 'workspaceId', 'deviceId', 'subjectId', 'worldId', 'audience'] as const).every(key => a[key] === b[key]);
const digestItems = (items: Action[]) => new Map(items.map(item => [item.id, canonical(item)]));

/** Short-lived validation ledger. No raw draft, scope or source is persisted. Restart invalidates every ticket. */
export class PlanningApplicationService {
  private readonly tickets = new Map<string, Ticket>();
  // Only owner and irreversible parameter digests survive ticket expiry, bounded to 50 plans in this process.
  // This catches detached copies, not arbitrary semantic rewrites, and intentionally does not survive restart.
  private readonly recentProposals = new Map<string, { owner: Owner; keys: Set<string> }>();
  private intentValidator?: (scope: ScopeData, context: PlanningHostContext, planId: string) => void;
  private campusPort?: PlanningCampusPort;
  constructor(private readonly clock: () => string, private readonly currentSourceVersion?: (sourceId: string, scope: ScopeData) => string | number | null | undefined) {}

  setIntentValidator(validate: (scope: ScopeData, context: PlanningHostContext, planId: string) => void) { this.intentValidator = validate; }
  setCampusPort(port: PlanningCampusPort) { this.campusPort = port; }
  async readCampus(scope: ScopeData, from: string, to: string, signal: AbortSignal) {
    if (scope.worldId !== 'real' || scope.subjectId !== scope.principalId || scope.audience !== 'self' || scope.child) return null;
    return this.campusPort?.read(scope, from, to, signal) || null;
  }
  campusCurrent(scope: ScopeData, snapshot: PlanningCampusConstraints) {
    try { return this.campusPort?.current(scope, snapshot) === true; } catch { return false; }
  }

  /** Internal routing metadata only; never supplies an intent or restores a ticket. */
  hasIntentBinding(planId: string) { return !!this.tickets.get(planId)?.hostContext; }

  exportTicket(scope: ScopeData, planId: string) {
    const ticket = this.ticket(planId);
    this.validateScope(ticket, scope); this.validateIntent(ticket, scope, planId);
    return { planId, input: structuredClone(ticket.input), output: structuredClone(ticket.output),
      manifest: this.manifest(planId, ticket), expiresAt: new Date(ticket.expiresAt).toISOString(),
      hasPreparations: !!ticket.hasPreparations || !!ticket.applied.length || !!ticket.progressUncertain,
      ...(ticket.hostContext ? { intentRef: structuredClone(ticket.hostContext.intent) } : {}) };
  }

  /** The caller receives the original remaining units, never model-retyped parameters. */
  proposal(scope: ScopeData, currentItems: Action[], planId: string) {
    const ticket = this.ticket(planId);
    this.validateScope(ticket, scope); this.validateIntent(ticket, scope, planId);
    const units = ticket.units.slice(ticket.applied.length);
    if (!units.length) throw new HarnessError('planning_complete', "These plan steps were already adopted. The current calendar holds the actual records.");
    this.validateSave(scope, units[0].arguments.planRef, units[0].arguments, currentItems);
    return { planId, expiresAt: new Date(ticket.expiresAt).toISOString(), units: units.map(unit => {
      const block = unit.kind === 'work' ? ticket.output.blocks.find(value => value.taskId === unit.taskId && value.segment === unit.segment) : undefined;
      return { ...structuredClone(unit), ...(block ? { work: { start: block.start, end: block.end, minutes: block.durationMinutes,
        setupMinutes: (Date.parse(block.start) - Date.parse(block.reservedStart)) / minute,
        cleanupMinutes: (Date.parse(block.reservedEnd) - Date.parse(block.end)) / minute } } : {}) };
    }) };
  }

  bindIntent(scope: ScopeData, planId: string, context: PlanningHostContext) {
    const ticket = this.ticket(planId); this.validateScope(ticket, scope);
    if (!ticket.hostContext && (ticket.hasPreparations || ticket.applied.length || ticket.progressUncertain))
      throw new HarnessError('planning_intent_prepared', "This plan already has prepared or adopted actions tied to their original basis. A new intent can start a new plan from the current calendar; it does not reassign the old actions.");
    if (ticket.hostContext && canonical(ticket.hostContext.intent) !== canonical(context.intent))
      throw new HarnessError('planning_intent_binding', "This plan is already linked to a different intent revision. Its old ticket cannot be rebound.");
    const previous = ticket.hostContext; ticket.hostContext = structuredClone(context);
    try { this.validateIntent(ticket, scope, planId); } catch (error) { ticket.hostContext = previous; throw error; }
    this.invalidatePreviousIntentTickets(planId, context);
    return { planId, intent: structuredClone(context.intent) };
  }

  preparationBinding(scope: ScopeData, rawRef: unknown, args: unknown) {
    const ref = planningPlanRefSchema.parse(rawRef), ticket = this.ticket(ref.planId);
    this.validateScope(ticket, scope); this.validateIntent(ticket, scope, ref.planId);
    const unit = ticket.units.find(value => value.blockId === ref.blockId);
    if (!unit || canonical(args) !== canonical(unit.arguments)) throw new HarnessError('planning_parameters_changed', "The action parameters are not the original host plan's complete save unit.");
    return ticket.hostContext ? { intentRef: structuredClone(ticket.hostContext.intent), specDigest: ticket.hostContext.intent.specDigest,
      manifest: this.manifest(ref.planId, ticket) } : null;
  }

  /** Called by the real preparation hook; this never records successful adoption. */
  markPrepared(scope: ScopeData, planId: string) {
    const ticket = this.ticket(planId); this.validateScope(ticket, scope);
    ticket.hasPreparations = true;
  }

  prepare(scope: ScopeData, items: Action[], raw: unknown, hostContext?: PlanningHostContext, campus?: PlanningCampusConstraints | null,
    options: { futureOnly?: boolean } = {}) {
    const now = this.now();
    this.prune(now);
    if (scope.worldId !== 'real' || scope.audience !== 'self' || scope.subjectId !== scope.principalId || scope.child || !scope.sources.includes('local-agenda'))
      throw new HarnessError('planning_scope', "A schedule plan needs permission to read the user's real-world local calendar.");
    if (hostContext && calendarPlanFingerprint(items) !== hostContext.allocationBasis.calendarFingerprint)
      throw new HarnessError('planning_stale', "The current calendar does not match the recovery basis. No new ticket was created.");
    const input = planningDraftInput.parse(raw);
    if (campus && !this.campusCurrent(scope, campus))
      throw new HarnessError('planning_campus_changed', "The saved campus snapshot or reading scope changed. The old snapshot was not reused for this calculation. Currently readable records can support a new calculation.");
    const currentInput = campus ? planningDraftInput.parse({ ...input, busy: [...input.busy, ...campus.busy],
      sourceCoverage: [...input.sourceCoverage, campus.coverage] }) : input;
    const output = draftCalendarPlan(items, currentInput, hostContext?.retained), planId = randomUUID();
    const units = this.units(planId, input, output);
    const sources = this.sourceRevisions(input);
    const ticket: Ticket = { scope: structuredClone(scope), input, output, units, sources, createdAt: new Date(now).toISOString(),
      expiresAt: Math.min(now + ttl, Date.parse(scope.expiresAt)), fingerprint: output.calendarFingerprint,
      itemDigests: digestItems(items), applied: [], ...(hostContext ? { hostContext: structuredClone(hostContext) } : {}), ...(campus ? { campus } : {}),
      ...(options.futureOnly ? { futureOnly: true } : {}) };
    if (!Number.isFinite(ticket.expiresAt) || ticket.expiresAt <= now) throw new HarnessError('planning_expired', "The reading scope expired or its expiry is unknown. No adoption ticket was created. A fresh calendar-reading scope can support another calculation.");
    while (this.tickets.size >= 50) this.tickets.delete(this.tickets.keys().next().value!);
    this.tickets.set(planId, ticket);
    if (hostContext) this.invalidatePreviousIntentTickets(planId, hostContext);
    const owner: Owner = { principalId: scope.principalId, workspaceId: scope.workspaceId, deviceId: scope.deviceId, subjectId: scope.subjectId, worldId: scope.worldId, audience: scope.audience };
    const keys = new Set(units.map(unit => this.proposalKey(unit.arguments)!));
    for (const block of output.blocks) keys.add(this.proposalKey({ title: block.title, startsAt: block.start, kind: 'time_block' })!);
    while (this.recentProposals.size >= 50) this.recentProposals.delete(this.recentProposals.keys().next().value!);
    this.recentProposals.set(planId, { owner, keys });
    const adoptionBlockers = this.adoptionBlockers(ticket, scope);
    return {
      ...output, planId, expiresAt: new Date(ticket.expiresAt).toISOString(),
      ...(campus ? { campusCalendar: campusConstraintSummary(campus) } : {}),
      adoption: { status: adoptionBlockers.length ? 'blocked' : units.length ? 'ready_for_authorized_steps' : 'nothing_to_apply', blockers: adoptionBlockers,
        atomic: false, completedSteps: 0, totalSteps: units.length, restartBehavior: 'ticket_invalidated_recompute_required' },
      acceptanceProposals: units.map((unit, index) => ({ ...unit, capability: 'local.agenda.save', order: index + 1, applied: false, requiresAuthorization: true, requiresPlanRevalidation: true })),
      acceptanceContract: "This draft has not been written to the calendar. acceptanceProposals contains complete save units in order, with planRef linking each step to this calculation. Work units include setup and cleanup; travel, rest and protected free time have their own occupancy. Through an already authorized adoption entry, the host rechecks original parameters, current calendar, identity, policy, expiry and source versions before committing each transaction. Some steps may therefore be saved while others remain unsaved. Changed conditions or an app restart can invalidate the ticket. The current calendar can support a new calculation. Continue discussing or adopting based on the actual result and current wishes; the draft itself grants no execution permission.",
    };
  }

  /** Reject common copies that strip their planRef; invoke for every ordinary local save too. */
  assertNoDetachedProposal(scope: ScopeData, raw: unknown) {
    if (!raw || typeof raw !== 'object') return;
    const args = raw as Record<string, unknown>;
    if (args.planRef !== undefined) { planningPlanRefSchema.parse(args.planRef); return; } // The normal plan guard validates a supplied reference.
    const key = this.proposalKey(args);
    if (key && [...this.recentProposals.values()].some(value => sameOwner(value.owner, scope) && value.keys.has(key)))
      throw new HarnessError('planning_reference_required', "This event matches a proposal in the current planning draft but lacks planRef linking it to the original calculation. The complete parameters and reference jointly establish occupancy checks. An expired draft can be recalculated from the current calendar; this detached copy was not saved.");
  }

  /** Invoke both at preparation and immediately inside the eventual calendar transaction. */
  validateSave(scope: ScopeData, rawRef: unknown, args: unknown, currentItems: Action[]) {
    const ref = planningPlanRefSchema.parse(rawRef), ticket = this.ticket(ref.planId);
    this.validateScope(ticket, scope);
    this.validateIntent(ticket, scope, ref.planId);
    const blockers = this.adoptionBlockers(ticket, scope);
    if (blockers.length) throw new HarnessError('planning_conditions_unverified', blockers.join('；'));
    if (calendarPlanFingerprint(currentItems) !== ticket.fingerprint) {
      ticket.invalidatedReason = 'calendar_changed';
      throw new HarnessError('planning_stale', "The calendar changed after the previous step. This old ticket was not used to submit another step. Earlier successful saves retain their actual records; continue from a new calculation of the current calendar.");
    }
    const next = ticket.units[ticket.applied.length];
    if (!next || next.blockId !== ref.blockId) throw new HarnessError('planning_order', "This step was already adopted or is not the plan's next step. The original order includes setup, travel, rest and protected occupancy. It was not submitted in a different order.");
    if (canonical(args) !== canonical(next.arguments)) throw new HarnessError('planning_parameters_changed', "These save parameters differ from the complete occupancy that was calculated. The old ticket does not support them. Use the current wishes and calendar as the basis for a new plan.");
    if ((ticket.hostContext || ticket.futureOnly) && Date.parse(next.arguments.startsAt) < this.now()) {
      if (ticket.futureOnly) ticket.invalidatedReason = 'continuation_started';
      throw new HarnessError(ticket.hostContext ? 'planning_intent_past' : 'planning_continuation_past', "This occupancy already started or passed and was not submitted as a future event. Elapsed time does not establish how much work was done. Actual progress and the remaining future window can support further planning.");
    }
    return { planId: ref.planId, blockId: ref.blockId, status: 'validated', atomic: false,
      completedSteps: ticket.applied.length, totalSteps: ticket.units.length, nextOrder: ticket.applied.length + 1 };
  }

  /** Call only after the outer SQLite transaction successfully commits. Failure must not erase its success receipt. */
  committed(rawRef: unknown, currentItems: Action[]) {
    const ref = planningPlanRefSchema.parse(rawRef), ticket = this.ticket(ref.planId);
    const unit = ticket.units[ticket.applied.length];
    if (!unit || unit.blockId !== ref.blockId) throw new HarnessError('planning_order', "The reported step does not match the step this plan ledger is awaiting. The ledger cannot establish its adoption result; the current calendar retains actual saves.");
    const current = digestItems(currentItems);
    const matches = currentItems.filter(item => !ticket.itemDigests.has(item.id) && Object.entries(unit.arguments)
      .every(([key, value]) => canonical((item as unknown as Record<string, unknown>)[key]) === canonical(value)));
    // A concurrent change after a successful commit invalidates the remaining plan,
    // but must not hide the exact step that is already present in the real calendar.
    if (matches.length === 1) ticket.applied.push({ blockId: ref.blockId, recordId: matches[0].id });
    else ticket.progressUncertain = true;
    if (current.size !== ticket.itemDigests.size + 1 || [...ticket.itemDigests].some(([id, value]) => current.get(id) !== value)) {
      ticket.invalidatedReason = 'commit_mismatch';
      throw new HarnessError('planning_commit_mismatch', "Calendar changes after submission extend beyond this step, so the ticket no longer supports further adoption. Precisely matched successful saves remain recorded. Other changes follow the current calendar and can support recalculation.");
    }
    if (matches.length !== 1) {
      ticket.invalidatedReason = 'commit_mismatch';
      throw new HarnessError('planning_commit_mismatch', "Saved occupancy does not match the plan. Further adoption has stopped.");
    }
    ticket.itemDigests = current;
    ticket.fingerprint = calendarPlanFingerprint(currentItems);
    return { planId: ref.planId, status: ticket.applied.length === ticket.units.length ? 'applied' : 'partially_applied', atomic: false,
      completedSteps: ticket.applied.length, totalSteps: ticket.units.length, applied: structuredClone(ticket.applied),
      nextBlockId: ticket.units[ticket.applied.length]?.blockId || null };
  }

  /** A progress receipt, not permission to write. Unknown/expired ledgers never imply zero completed writes. */
  progress(rawRef: unknown) {
    const ref = planningPlanRefSchema.parse(rawRef), ticket = this.tickets.get(ref.planId);
    if (!ticket) return { planId: ref.planId, status: 'unavailable', progressKnown: false, atomic: false,
      completedSteps: null, totalSteps: null, applied: [], nextBlockId: null,
      reason: "This in-process ticket is absent; an app restart also removes it. Total and saved step counts remain unknown. The current calendar can show actual saves; a missing ticket does not establish zero saves." };
    const expired = ticket.expiresAt <= this.now();
    const status = expired ? 'expired' : ticket.invalidatedReason ? 'invalidated' : ticket.applied.length === ticket.units.length ? 'applied' : ticket.applied.length ? 'partially_applied' : 'not_applied';
    const result = { planId: ref.planId, status, progressKnown: !ticket.progressUncertain, completedStepsIsLowerBound: !!ticket.progressUncertain, atomic: false,
      completedSteps: ticket.applied.length, totalSteps: ticket.units.length, applied: structuredClone(ticket.applied),
      nextBlockId: expired || ticket.invalidatedReason ? null : ticket.units[ticket.applied.length]?.blockId || null,
      reason: expired ? "The plan ticket expired. Saved records retain their actual states. Further scheduling needs the current calendar and a new calculation." : ticket.invalidatedReason || null };
    if (expired) this.tickets.delete(ref.planId);
    return result;
  }

  /** Read the durable calendar after interruption. A stored planRef proves a row exists, never that an entire plan succeeded. */
  recover(scope: ScopeData, currentItems: Action[], raw: unknown) {
    const { planId } = planningRecoveryInput.parse(raw), now = this.now();
    if (scope.worldId !== 'real' || scope.audience !== 'self' || scope.subjectId !== scope.principalId || scope.child || !scope.sources.includes('local-agenda') || !Number.isFinite(Date.parse(scope.expiresAt)) || Date.parse(scope.expiresAt) <= now)
      throw new HarnessError('planning_scope', "Restoring a plan needs currently valid permission to read the user's real-world local calendar.");
    const ticket = this.tickets.get(planId);
    if (ticket && !sameOwner(ticket.scope, scope)) throw new HarnessError('planning_scope', "The plan belongs to another identity or world and cannot be read or restored.");
    const observed = currentItems.flatMap(item => {
      const ref = planningPlanRefSchema.safeParse((item as Action & { planRef?: unknown }).planRef);
      return ref.success && ref.data.planId === planId ? [{ recordId: item.id, blockId: ref.data.blockId, title: item.title,
        startsAt: item.startsAt ?? null, durationMinutes: item.durationMinutes ?? null, revision: item.revision ?? 1,
        done: item.done === true, planningState: item.planning?.state ?? 'unknown' }] : [];
    }).sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)) || a.recordId.localeCompare(b.recordId));
    let ledgerReadable = !!ticket, boundaryReason: string | null = null;
    if (ticket) {
      try { this.validateScope(ticket, scope); this.validateIntent(ticket, scope, planId); } catch { ledgerReadable = false; boundaryReason = "The ticket's intent, sources or reading scope changed, or continued applicability cannot be confirmed. This result contains only currently readable calendar records. It does not restore old sources or the draft."; }
    }
    const known = ledgerReadable ? ticket : undefined;
    const changed = known?.applied.flatMap<{ blockId: string; recordId: string; status: 'missing' | 'changed' }>(applied => {
      const item = currentItems.find(value => value.id === applied.recordId), unit = known.units.find(value => value.blockId === applied.blockId)!;
      if (!item) return [{ ...applied, status: 'missing' as const }];
      if (item.done || item.planning?.state !== 'accepted' || !this.unitMatches(item, unit)) return [{ ...applied, status: 'changed' as const }];
      return [];
    }) ?? [];
    const duplicates = [...new Set(observed.map(value => value.blockId))].filter(blockId => observed.filter(value => value.blockId === blockId).length > 1);
    const unrecorded = known ? observed.filter(value => !known.applied.some(applied => applied.recordId === value.recordId && applied.blockId === value.blockId)).map(value => value.recordId) : [];
    const blockers = known ? this.adoptionBlockers(known, scope) : [];
    const calendarChanged = !!known && calendarPlanFingerprint(currentItems) !== known.fingerprint;
    const expired = !!known && known.expiresAt <= now;
    const nextUnit = known?.units[known.applied.length];
    const nextStarted = !!(known?.hostContext || known?.futureOnly) && !!nextUnit && Date.parse(nextUnit.arguments.startsAt) < now;
    const resumable = !!known && !expired && !known.invalidatedReason && !known.progressUncertain && !changed.length && !duplicates.length && !unrecorded.length && !calendarChanged && !blockers.length && !nextStarted;
    const next = resumable ? known.units[known.applied.length] : undefined;
    // A continuation is computed from exact committed work, not from the number of saved rows: rest and setup are not work.
    const remainingRequest = known && !changed.length && !duplicates.length && !unrecorded.length && !known.progressUncertain ? this.remainingRequest(known) : null;
    return { planId, observed, observedCount: observed.length, calendarFingerprint: calendarPlanFingerprint(currentItems),
      evidence: known ? 'current_calendar_and_process_ledger' : 'current_calendar_only',
      totalSteps: known?.units.length ?? null, completedSteps: known?.applied.length ?? null,
      changedSteps: changed, duplicateBlockIds: duplicates, unrecordedRowIds: unrecorded,
      status: !known ? 'observed_only_recompute_required' : changed.length || duplicates.length || unrecorded.length || known.progressUncertain ? 'review_required' :
        known.applied.length === known.units.length && !calendarChanged ? 'all_steps_present' : next ? 'can_continue_authorized_steps' : 'recompute_required',
      nextProposal: next ? { ...structuredClone(next), capability: 'local.agenda.save', order: known!.applied.length + 1, requiresAuthorization: true, requiresPlanRevalidation: true } : null,
      remainingRequest, blockers: [...blockers, ...(calendarChanged ? ["Other calendar changes mean the original ticket no longer matches. Further adoption needs a new calculation."] : []), ...(expired ? ["The original ticket expired."] : []),
        ...(nextStarted ? ["The next occupancy already started or passed and is no longer a future step that can be continued directly. Actual progress and the future window still need checking."] : []), ...(boundaryReason ? [boundaryReason] : [])],
      applied: false, atomic: false,
      recoveryContract: "This result reads the current calendar without writing it. observed lists actual records. Without a readable complete ticket, total steps, saved steps and omissions may remain unknown; an empty list cannot prove nothing was saved. If present, nextProposal is a step still supported by the current ticket; saving uses the original authorization and stepwise checks. Expiry, changes or restart remove the old parameters' adoption authority. If present, remainingRequest is a recalculation starting point that subtracts precisely saved net work once, preserving original workload, saved events, dependency times and budgets. Its times, sources and real-world conditions still come from the original request and were not freshly verified here. A null value means the remaining amount cannot be computed reliably. Continue from current progress and wishes; current time, calendar and readable sources can support a fresh planning.draft. Scheduled time remains a plan; completion needs separate evidence.",
    };
  }

  private unitMatches(item: Action, unit: Unit) {
    return Object.entries(unit.arguments).every(([key, value]) => canonical((item as unknown as Record<string, unknown>)[key]) === canonical(value));
  }

  private remainingRequest(ticket: Ticket): Input | null {
    const lastApplied = ticket.units[ticket.applied.length - 1];
    // If interruption happened before its rest/transfer, arithmetic on remaining work alone cannot preserve that boundary.
    // Recovery still exposes the exact next unit while its live ticket is valid; after invalidation a fresh plan must repair it.
    if (lastApplied?.kind === 'work' && (ticket.input.restMinutes > 0 || ticket.input.transitionMinutes.max > 0 || ticket.input.travelTimes.length > 0)) return null;
    const acceptedWork = ticket.units.filter(unit => unit.kind === 'work' && ticket.applied.some(applied => applied.blockId === unit.blockId));
    const scheduled = new Map<string, { minutes: number; end: number }>();
    const scheduledBlocks: Draft['blocks'] = [];
    for (const unit of acceptedWork) {
      const block = ticket.output.blocks.find(value => value.taskId === unit.taskId && value.segment === unit.segment)!;
      const previous = scheduled.get(block.taskId) || { minutes: 0, end: 0 };
      // One work segment can have several calendar units when setup/cleanup makes its reservation exceed 24 hours.
      if (acceptedWork.some(other => other !== unit && other.taskId === unit.taskId && other.segment === unit.segment && other.blockId.localeCompare(unit.blockId) < 0)) continue;
      const segmentUnits = ticket.units.filter(other => other.kind === 'work' && other.taskId === unit.taskId && other.segment === unit.segment);
      if (!segmentUnits.every(other => acceptedWork.includes(other))) return null;
      scheduledBlocks.push(block);
      scheduled.set(block.taskId, { minutes: previous.minutes + block.durationMinutes, end: Math.max(previous.end, Date.parse(block.reservedEnd)) });
    }
    const fullyScheduled = new Set(ticket.input.tasks.filter(task => (scheduled.get(task.id)?.minutes || 0) === task.durationMinutes.max).map(task => task.id));
    const tasks = ticket.input.tasks.filter(task => !fullyScheduled.has(task.id)).map(task => {
      const accepted = scheduled.get(task.id), minutes = accepted?.minutes || 0;
      const priorEnds = task.dependsOn.filter(value => fullyScheduled.has(value)).map(value => scheduled.get(value)!.end);
      const prefixEnd = lastApplied ? Date.parse(lastApplied.arguments.startsAt) + lastApplied.arguments.durationMinutes * minute : 0;
      const earliest = Math.max(task.earliestStart ? Date.parse(task.earliestStart) : Date.parse(ticket.input.from), accepted?.end || 0, prefixEnd, ...priorEnds);
      return { ...structuredClone(task), durationMinutes: { min: Math.max(1, task.durationMinutes.min - minutes), max: task.durationMinutes.max - minutes },
        earliestStart: new Date(earliest).toISOString(), dependsOn: task.dependsOn.filter(value => !fullyScheduled.has(value)) };
    });
    if (!tasks.length) return null;
    return { ...structuredClone(ticket.input), tasks,
      dailyBudgets: ticket.input.dailyBudgets.map(budget => {
        if (budget.maxScheduledMinutes === undefined) return structuredClone(budget);
        const bounds = planningDayBounds(budget.date, ticket.input.timeZone);
        const scheduledMinutes = scheduledBlocks.reduce((sum, block) => sum + Math.max(0,
          Math.min(Date.parse(block.end), Date.parse(bounds.to)) - Math.max(Date.parse(block.start), Date.parse(bounds.from))) / minute, 0);
        // Existing adopted work is now calendar busy. It must also consume the
        // original plan's net-work allowance when only the remainder is redrafted.
        return { ...budget, maxScheduledMinutes: Math.max(0, budget.maxScheduledMinutes - scheduledMinutes) };
      }),
      maxScheduledMinutes: Math.max(0, ticket.input.maxScheduledMinutes - [...scheduled.values()].reduce((sum, value) => sum + value.minutes, 0)) };
  }

  private now() {
    const now = Date.parse(this.clock());
    if (!Number.isFinite(now)) throw new HarnessError('planning_clock', "The plan's validity could not be checked. Nothing was saved.");
    return now;
  }
  private validateIntent(ticket: Ticket, scope: ScopeData, planId: string) {
    if (!ticket.hostContext) return;
    if (!this.intentValidator) throw new HarnessError('planning_intent_validator_missing', "Persistent-intent verification is not connected. Linked tickets cannot be adopted or exported.");
    this.intentValidator(scope, ticket.hostContext, planId);
    if (ticket.hostContext.retained.work.some(value => Date.parse(value.reservedStart) < this.now())
      || ticket.hostContext.retained.boundaries.some(value => Date.parse(value.start) < this.now()))
      throw new HarnessError('planning_retained_started', "Previously saved occupancy already started or passed. Check actual progress before adopting from an old remainder.");
  }
  private invalidatePreviousIntentTickets(planId: string, context: PlanningHostContext) {
    for (const [id, ticket] of this.tickets) if (id !== planId && ticket.hostContext?.intent.id === context.intent.id)
      ticket.invalidatedReason = 'intent_replanned';
  }

  private manifest(planId: string, ticket: Ticket): PlanningManifest {
    const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
    const groups = ticket.output.blocks.map(block => ({ id: digest({ planId, taskId: block.taskId, segment: block.segment }),
      taskId: block.taskId, segment: block.segment, start: block.start, end: block.end, reservedStart: block.reservedStart, reservedEnd: block.reservedEnd,
      durationMinutes: block.durationMinutes, unitIds: ticket.units.filter(unit => unit.kind === 'work' && unit.taskId === block.taskId && unit.segment === block.segment).map(unit => unit.blockId),
      ...(block.placeId ? { placeId: block.placeId } : {}) }));
    const group = (taskId?: string, segment?: number) => groups.find(value => value.taskId === taskId && value.segment === segment)?.id;
    const boundaries = ticket.output.transitions.map((boundary, index) => ({ id: digest({ planId, boundary: index }),
      start: boundary.start, end: boundary.end, restMinutes: boundary.restMinutes, travelMinutes: boundary.travel.minutes,
      ...(boundary.fromWorkId || group(boundary.fromTaskId, boundary.fromSegment) ? { fromWorkId: boundary.fromWorkId || group(boundary.fromTaskId, boundary.fromSegment) } : {}),
      ...(boundary.toWorkId || group(boundary.toTaskId, boundary.toSegment) ? { toWorkId: boundary.toWorkId || group(boundary.toTaskId, boundary.toSegment) } : {}),
      ...(boundary.fromTaskId ? { fromTaskId: boundary.fromTaskId } : {}), ...(boundary.toTaskId ? { toTaskId: boundary.toTaskId } : {}),
      ...(boundary.fromPlaceId ? { fromPlaceId: boundary.fromPlaceId } : {}), ...(boundary.toPlaceId ? { toPlaceId: boundary.toPlaceId } : {}),
      unitIds: ticket.units.filter(unit => unit.kind === 'transition' && unit.boundaryIndex === index).map(unit => unit.blockId) }));
    const result: PlanningManifest = { version: 1, planId, createdAt: ticket.createdAt,
      timeZone: ticket.input.timeZone, inputDigest: digest(ticket.input), calendarFingerprint: ticket.output.calendarFingerprint,
      allocationBasis: ticket.hostContext?.allocationBasis || { calendarFingerprint: ticket.output.calendarFingerprint, groupIds: [] },
      units: ticket.units.map((unit, index) => ({ blockId: unit.blockId, kind: unit.kind, order: index + 1, start: unit.arguments.startsAt,
        end: new Date(Date.parse(unit.arguments.startsAt) + unit.arguments.durationMinutes * minute).toISOString(),
        argumentKeys: Object.keys(unit.arguments).sort(), argumentsDigest: digest(unit.arguments),
        ...(unit.kind === 'work' ? { groupId: group(unit.taskId, unit.segment) } : {}),
        ...(unit.boundaryIndex !== undefined ? { boundaryId: boundaries[unit.boundaryIndex].id } : {}) })),
      groups, boundaries, sourceVersions: structuredClone(ticket.sources) };
    if (result.units.length > 2048 || Buffer.byteLength(canonical(result), 'utf8') > 256 * 1024)
      throw new HarnessError('planning_manifest_budget', "The complete adoption manifest exceeds the current persistence budget. It was not retained, and no truncated copy was kept as complete proof.");
    return result;
  }
  private proposalKey(args: Record<string, unknown>) {
    if (typeof args.title !== 'string' || typeof args.startsAt !== 'string' || !Number.isFinite(Date.parse(args.startsAt))) return undefined;
    return createHash('sha256').update(canonical({ title: args.title.trim(), startsAt: Date.parse(args.startsAt), kind: args.kind || 'time_block' })).digest('hex');
  }
  private prune(now: number) { for (const [key, value] of this.tickets) if (value.expiresAt <= now) this.tickets.delete(key); }
  private ticket(id: string) {
    const ticket = this.tickets.get(id);
    if (!ticket) throw new HarnessError('planning_ticket_missing', "This plan ticket is absent; an app restart also invalidates it. Its old parameters have no ticket support. The current calendar can provide a real starting point for a new plan.");
    if (ticket.expiresAt <= this.now()) { this.tickets.delete(id); throw new HarnessError('planning_expired', "The plan ticket expired. Further steps need a new calculation; earlier successful saves remain intact."); }
    if (ticket.invalidatedReason) throw new HarnessError('planning_stale', "This ticket no longer supports adoption. Replan from the actual calendar and current wishes; earlier results retain their actual records.");
    return ticket;
  }
  private validateScope(ticket: Ticket, scope: ScopeData) {
    if (!sameOwner(ticket.scope, scope) || scope.child || scope.retention === 'session_only')
      throw new HarnessError('planning_scope', "The plan's identity, world or retention policy does not permit this save.");
    if (scope.privacyEpoch !== ticket.scope.privacyEpoch || scope.policyRevision !== ticket.scope.policyRevision || ticket.scope.sources.some(source => !scope.sources.includes(source)))
      throw new HarnessError('planning_policy_changed', "The current reading scope or privacy policy differs from the ticket's. It cannot support this adoption; the current permitted scope can support a new plan.");
    if (Date.parse(scope.expiresAt) <= this.now() || !Number.isFinite(Date.parse(scope.expiresAt))) throw new HarnessError('planning_expired', "The current scope expired. Nothing was saved.");
  }
  private sourceRevisions(input: Input): SourceRevision[] {
    return [...input.busy, ...input.travelTimes, ...input.energyWindows, ...input.sourceCoverage.filter(value => !['local-agenda', 'user-declared', 'current'].includes(value.sourceId)), ...input.tasks.filter(value => value.sourceId), ...input.conditions.filter(value => value.sourceId), ...input.tasks.flatMap(value => value.conditions.filter(condition => condition.sourceId))]
      .map(value => ({ sourceId: value.sourceId!, sourceVersion: value.sourceVersion || null }));
  }
  private adoptionBlockers(ticket: Ticket, scope: ScopeData): string[] {
    const blockers = [...ticket.output.conditions];
    if (ticket.campus) {
      try {
        if (!this.campusPort?.current(scope, ticket.campus)) blockers.push("The saved campus snapshot, account or reading scope changed. The old snapshot no longer supports further adoption. Readable campus records and the user's saved calendar can support a new calculation.");
      } catch { blockers.push("Campus events could not be confirmed. Check current records before continuing the old plan."); }
    }
    if (!ticket.output.blocks.length && !ticket.hostContext?.retained.work.length)
      blockers.push("No adoptable work schedule was constructed this time.");
    if (scope.retention === 'session_only') blockers.push("Session-only retention does not permit writing to a lasting calendar.");
    const checked = new Map<string, string | number | null | undefined>();
    for (const source of ticket.sources) {
      if (!scope.sources.includes(source.sourceId)) { blockers.push(`Source ${source.sourceId} is outside the current reading scope.`); continue; }
      if (source.sourceVersion === null) { blockers.push(`Source ${source.sourceId} has no verifiable version.`); continue; }
      if (source.sourceId === 'campus:academic-account') {
        try {
          if (this.campusPort?.currentVersion(scope, source.sourceVersion) !== true)
            blockers.push("The current saved campus version cannot yet be confirmed against the original basis. A new calculation still needs currently readable campus records.");
        } catch { blockers.push("The current saved campus version could not be checked. Connect the current record first."); }
        continue;
      }
      let current: string | number | null | undefined;
      if (checked.has(source.sourceId)) current = checked.get(source.sourceId);
      else {
        try { current = this.currentSourceVersion?.(source.sourceId, scope); } catch { current = undefined; }
        checked.set(source.sourceId, current);
      }
      if (current === undefined || current === null) blockers.push(`Source ${source.sourceId} cannot have its current version rechecked, so a dependent plan cannot be adopted.`);
      else if (String(current) !== source.sourceVersion) blockers.push(`Source ${source.sourceId} changed version. Its old version no longer supports adoption; currently readable content can support a new plan.`);
    }
    return [...new Set(blockers)];
  }

  private units(planId: string, input: Input, draft: Draft): Unit[] {
    const units: Unit[] = [];
    const add = (blockId: string, kind: Unit['kind'], title: string, detail: string, start: string, end: string, placeId?: string, taskId?: string, segment?: number, boundaryIndex?: number) => {
      const from = Date.parse(start), to = Date.parse(end);
      // The existing save contract accepts at most 24 hours; preserve longer reservations as consecutive units.
      for (let cursor = from, part = 0; cursor < to; part++) {
        const next = Math.min(to, cursor + 1440 * minute), durationMinutes = (next - cursor) / minute;
        if (!Number.isInteger(durationMinutes) || durationMinutes < 1) throw new HarnessError('planning_precision', "The plan includes sub-minute occupancy that the calendar's whole-minute precision cannot fully save. It was not shortened. Recalculate with aligned boundaries to obtain complete save units.");
        const id = `${blockId}:${part}`;
        units.push({ blockId: id, kind, ...(taskId ? { taskId, segment } : {}), ...(boundaryIndex !== undefined ? { boundaryIndex } : {}), arguments: {
          title: title.slice(0, 160), detail: detail.slice(0, 1500), kind: 'time_block', startsAt: new Date(cursor).toISOString(), durationMinutes, timeZone: input.timeZone,
          planning: { state: 'accepted', flexibility: kind === 'work' ? 'movable' : 'fixed', ...(placeId ? { placeId } : {}) }, planRef: { planId, blockId: id },
        } });
        cursor = next;
      }
    };
    for (const block of draft.blocks) {
      const task = input.tasks.find(value => value.id === block.taskId)!;
      const reservation = task.setupMinutes || task.cleanupMinutes ? `Work from ${block.start} to ${block.end}; this occupancy also includes ${task.setupMinutes} minutes of setup and ${task.cleanupMinutes} minutes of rest.` : '';
      add(`work:${input.tasks.indexOf(task)}:${block.segment}`, 'work', block.title, [task.detail, reservation].filter(Boolean).join('\n'), block.reservedStart, block.reservedEnd, block.placeId, block.taskId, block.segment);
    }
    for (const [index, transfer] of draft.transitions.entries()) add(`transition:${index}`, 'transition', transfer.travel.minutes && transfer.restMinutes ? "Travel and rest" : transfer.travel.minutes ? "Travel" : "Rest",
      `Includes ${transfer.travel.minutes} minutes of travel and ${transfer.restMinutes} minutes of rest.`, transfer.start, transfer.end, undefined, undefined, undefined, index);
    // Merge protection overlaps and omit portions already occupied by accepted commitments.
    const bounds = { start: Date.parse(input.from), end: Date.parse(input.to) };
    const protection = draft.protectedWindows.map(value => ({ start: Math.max(bounds.start, Date.parse(value.start)), end: Math.min(bounds.end, Date.parse(value.end)), reasons: [value.reason] })).filter(value => value.end > value.start).sort((a, b) => a.start - b.start);
    const merged: typeof protection = [];
    for (const value of protection) {
      const previous = merged.at(-1);
      if (previous && value.start <= previous.end) { previous.end = Math.max(previous.end, value.end); previous.reasons.push(...value.reasons); }
      else merged.push({ ...value });
    }
    for (const [index, window] of merged.entries()) {
      let available = [{ start: window.start, end: window.end }];
      for (const fixed of draft.fixedCommitments) {
        const a = Date.parse(fixed.start), b = Date.parse(fixed.end);
        available = available.flatMap(value => b <= value.start || a >= value.end ? [value] : [
          ...(a > value.start ? [{ start: value.start, end: a }] : []), ...(b < value.end ? [{ start: b, end: value.end }] : []),
        ]);
      }
      for (const [part, value] of available.entries()) add(`protected:${index}:${part}`, 'protected', "Free time", [...new Set(window.reasons)].join('；'), new Date(value.start).toISOString(), new Date(value.end).toISOString());
    }
    return units.sort((a, b) => Date.parse(a.arguments.startsAt) - Date.parse(b.arguments.startsAt) || a.blockId.localeCompare(b.blockId));
  }
}
