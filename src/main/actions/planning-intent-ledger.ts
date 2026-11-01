import { createHash } from 'node:crypto';
import type { EffectAction } from '../../shared/harness';
import { addDate, canonical, dateInZone } from '../runtime/semantics';
import { calendarPlanFingerprint, planningDraftInput } from './planning-draft';
import { planningDayBounds } from './planning-days';
import { expandAgenda } from './calendar';
import { planningIntentSpecSchema, type PlanningAdoptionInput, type PlanningAdoptionProjection, type PlanningAttemptRecord,
  type PlanningDraftRequest, type PlanningIntentSpec, type PlanningManifestUnit, type PlanningRefreshRequirement,
  type PlanningReplanMaterialization, type PlanningRetainedContext, type PlanningUnitObservation } from './planning-intent-contract';

const minute = 60000;
const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const iso = (value: number) => new Date(value).toISOString();
const emptyRetained = (): PlanningRetainedContext => ({ work: [], boundaries: [], scheduledTasks: [] });
const unique = <T>(values: T[]) => [...new Map(values.map(value => [canonical(value), value])).values()];
const validRange = (start: string, end: string) => Number.isFinite(Date.parse(start)) && Number.isFinite(Date.parse(end)) && Date.parse(end) > Date.parse(start);
const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) => Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);

/** Persist the interpretation and its envelope, never a stale copy of current facts. */
export function normalizePlanningIntentSpec(raw: PlanningDraftRequest): PlanningIntentSpec {
  const input = planningDraftInput.parse(raw);
  const { busy, energyWindows, travelTimes, sourceCoverage, conditions, tasks, completedTaskIds, ...request } = input;
  const requiredRefresh: PlanningRefreshRequirement[] = [];
  const source = (kind: PlanningRefreshRequirement['kind'], value: { sourceId?: string; sourceVersion?: string }, taskId?: string) => {
    requiredRefresh.push({ kind, ...(value.sourceId ? { sourceId: value.sourceId, sourceVersion: value.sourceVersion ?? null } : {}), ...(taskId ? { taskId } : {}) });
  };
  for (const value of busy) source('busy', value);
  for (const value of energyWindows) source('energy', value);
  for (const value of travelTimes) source('travel', value);
  for (const value of sourceCoverage) if (!['local-agenda', 'current', 'user-declared'].includes(value.sourceId) || value.status !== 'complete') source('source_coverage', value);
  const coverageMode = sourceCoverage.some(value => ['current', 'user-declared'].includes(value.sourceId) && value.status === 'complete')
    && sourceCoverage.every(value => value.status === 'complete') ? 'retained_local_interpretation' : 'unestablished';
  if (coverageMode === 'unestablished' && !requiredRefresh.some(value => value.kind === 'source_coverage')) requiredRefresh.push({ kind: 'source_coverage' });
  const retainCondition = (value: typeof conditions[number], taskId?: string) => requiredRefresh.push({ kind: 'condition', condition: value.condition,
    ...(taskId ? { taskId } : {}), ...(value.sourceId ? { sourceId: value.sourceId, sourceVersion: value.sourceVersion ?? null } : {}) });
  conditions.forEach(value => retainCondition(value));
  const staticTasks = tasks.map(({ sourceId, sourceVersion, conditions: taskConditions, ...task }) => {
    if (sourceId) source('task_source', { sourceId, sourceVersion }, task.id);
    taskConditions.forEach(value => retainCondition(value, task.id));
    return task;
  });
  completedTaskIds.forEach(taskId => requiredRefresh.push({ kind: 'completion', taskId }));
  return planningIntentSpecSchema.parse({ version: 1, interpretation: 'model_interpretation_with_method_defaults',
    request: { ...request, tasks: staticTasks, completedTaskIds: [] }, requiredRefresh: unique(requiredRefresh), coverageMode });
}

const actionDigest = (action: EffectAction) => hash({ capability: action.capability, capabilityContract: action.capabilityContract,
  arguments: action.arguments, audience: action.audience, revision: action.revision, worldId: action.worldId,
  validUntil: action.validUntil, dependencies: action.dependencies });

/** The caller supplies one complete, currently authorized snapshot. Opaque links are
 * registered in the preparation transaction; their absence alone is not a receipt. */
export function projectPlanningAdoption(input: PlanningAdoptionInput): PlanningAdoptionProjection {
  const result: PlanningAdoptionProjection = { status: 'ready', reasons: [], observations: [], retained: emptyRetained(),
    taskMinutes: [], dailyMinutes: [], allocatedMinutes: 0, calendarFingerprint: calendarPlanFingerprint(input.calendar) };
  const review = (reason: string) => { result.status = 'needs_review'; result.reasons.push(reason); };
  const now = Date.parse(input.now), request = input.spec.request;
  if (!Number.isFinite(now)) { review("The current time is unconfirmed. Remaining scheduling lacks a time origin."); return result; }
  const seenAttempts = new Map<string, PlanningAttemptRecord>();
  const observations = new Map<string, PlanningUnitObservation>();
  const key = (planId: string, blockId: string) => `${planId}\0${blockId}`;
  const recordOwners = new Map<string, string>(), actionOwners = new Map<string, string>();
  const attempts: PlanningAttemptRecord[] = [];
  const previousSpecs: PlanningAttemptRecord[] = [];
  for (const attempt of input.attempts) {
    const previous = seenAttempts.get(attempt.planId);
    if (previous) { if (canonical(previous) !== canonical(attempt)) review("Conflicting persistent records exist for the same planning identity."); continue; }
    seenAttempts.set(attempt.planId, attempt);
    const observed = input.links.some(value => value.planId === attempt.planId) || input.calendar.some(value => value.planRef?.planId === attempt.planId);
    if (attempt.intentId !== input.intentId) {
      if (observed) review("An adoption record belongs to another intent. The current specification cannot deduct those events from its remaining workload.");
      continue;
    }
    if (attempt.specDigest !== input.specDigest) {
      if (observed) previousSpecs.push(attempt);
      continue;
    }
    if (attempt.manifest.version !== 1 || attempt.manifest.planId !== attempt.planId || attempt.manifest.timeZone !== request.timeZone) {
      review("The planning record's identity, version or time zone cannot be verified."); continue;
    }
    attempts.push(attempt);
  }
  for (const link of input.links) if (!seenAttempts.has(link.planId)) review("An action link lacks its original planning record. This does not establish that it was unsaved.");

  const observe = (planId: string, unit: PlanningManifestUnit): PlanningUnitObservation => {
    const base = { planId, blockId: unit.blockId };
    const fail = (status: PlanningUnitObservation['status'], reason: string, extra: Partial<PlanningUnitObservation> = {}) => ({ ...base, status, reason, ...extra });
    const links = unique(input.links.filter(value => value.planId === planId && value.blockId === unit.blockId));
    const rows = input.calendar.filter(value => value.planRef?.planId === planId && value.planRef.blockId === unit.blockId);
    if (rows.length > 1 || new Set(links.map(value => value.actionId)).size > 1) return fail('duplicate', "One adoption unit has multiple calendar objects or action links.");
    if (!links.length) {
      if (rows.length || input.actions.some(value => canonical(value.arguments.planRef) === canonical({ planId, blockId: unit.blockId })))
        return fail('unavailable', "A business object or action was observed without an atomically saved linkage proof.");
      return { ...base, status: 'never_prepared' };
    }
    const extra = { actionId: links[0].actionId };
    const actions = input.actions.filter(value => value.id === extra.actionId);
    if (actions.length !== 1) return fail('unavailable', "The original action's current proof is unavailable.", extra);
    const action = actions[0], args = action.arguments;
    // Revising the same action keeps its immutable older links. Only its
    // currently exact revision can prove the eventual saved invocation.
    const link = links.find(value => value.actionRevision === action.revision && value.actionDigest === action.digest);
    if (!link || actionDigest(action) !== action.digest)
      return fail('changed', "The original action revision or complete parameter signature changed.", extra);
    if (action.capability !== 'local.agenda.save' || action.effect !== 'local_write' || action.simulated || action.worldId !== 'real' || action.audience !== 'self'
      || !action.capabilityContract || action.capabilityContract.capabilityName !== action.capability)
      return fail('unavailable', "The original action is not a verifiable real local save.", extra);
    if (!validRange(unit.start, unit.end) || !Number.isInteger((Date.parse(unit.end) - Date.parse(unit.start)) / minute)
      || !unit.argumentKeys.length || new Set(unit.argumentKeys).size !== unit.argumentKeys.length
      || canonical([...unit.argumentKeys].sort()) !== canonical(Object.keys(args).sort()) || hash(args) !== unit.argumentsDigest
      || canonical(args.planRef) !== canonical({ planId, blockId: unit.blockId }) || Date.parse(String(args.startsAt)) !== Date.parse(unit.start)
      || args.durationMinutes !== (Date.parse(unit.end) - Date.parse(unit.start)) / minute)
      return fail('changed', "The adoption unit differs from the original action's complete occupancy parameters.", extra);
    const nonDispatch = action.nonDispatchProof;
    const confirmedBeforeDispatch = action.reason === 'cancelled_before_dispatch' || !!nonDispatch
      && nonDispatch.actionId === action.id && nonDispatch.actionRevision === action.revision && nonDispatch.actionDigest === action.digest
      && Number.isFinite(Date.parse(nonDispatch.observedAt));
    if (action.status === 'cancelled' && confirmedBeforeDispatch && !action.compensation
      && !input.actionAttempts.some(value => value.actionId === action.id) && !input.receipts.some(value => value.actionId === action.id)
      && !rows.length && !input.calendar.some(value => value.id === action.id || value.effectActionId === action.id))
      return { ...base, ...extra, status: 'not_adopted', reason: "The host explicitly cancelled before dispatch and rechecked that no dispatch or business-save proof exists." };
    const dispatches = input.actionAttempts.filter(value => value.actionId === action.id);
    const receipts = input.receipts.filter(value => value.actionId === action.id);
    if (['failed_confirmed', 'cancelled'].includes(action.status) && !action.compensation && !rows.length
      && !input.calendar.some(value => value.id === action.id || value.effectActionId === action.id)
      && dispatches.length > 0 && new Set(dispatches.map(value => value.id)).size === dispatches.length
      && receipts.length === dispatches.length && dispatches.every(dispatch => {
        const receipt = receipts.filter(value => value.attemptId === dispatch.id);
        return dispatch.status === 'failed_confirmed' && dispatch.idempotencyKey === action.idempotencyKey
          && receipt.length === 1 && receipt[0].status === 'confirmed_failure' && receipt[0].sourceId === action.sourceId
          && !receipt[0].externalRecordId && !receipt[0].localStatus && Number.isFinite(Date.parse(receipt[0].observedAt))
          && ['local_transaction_rolled_back', 'local_transaction_not_committed'].includes(receipt[0].reason || '');
      })) return { ...base, ...extra, status: 'not_adopted', reason: "Every dispatch of the original local save has a definitive not-submitted receipt, and no corresponding calendar object exists now." };
    if (action.status !== 'succeeded') return fail(['awaiting_approval', 'approved', 'dispatching', 'outcome_unknown', 'unresolved', 'cancel_requested', 'cancellation_unknown'].includes(action.status)
      ? 'pending' : 'unavailable', "The original action has no confirmed success yet. Its own dispatches and receipts establish this save's result; unknown cannot be counted as either scheduled or unscheduled.", extra);
    const successes = unique(input.receipts.filter(value => value.actionId === action.id && value.status === 'confirmed_success' && value.localStatus === 'local_saved'));
    if (successes.length > 1) return fail('duplicate', "The original action has multiple successful submission proofs. Adoption cannot be uniquely determined, and these records were not deducted twice.", extra);
    const receipt = successes[0];
    if (!receipt || !receipt.externalRecordId || receipt.sourceId !== action.sourceId || !Number.isFinite(Date.parse(receipt.observedAt)))
      return fail('unavailable', "A local success receipt pointing to a real calendar object is missing.", extra);
    const successDispatches = input.actionAttempts.filter(value => value.id === receipt.attemptId);
    if (successDispatches.length !== 1 || successDispatches[0].actionId !== action.id || successDispatches[0].idempotencyKey !== action.idempotencyKey || successDispatches[0].status !== 'succeeded')
      return fail('unavailable', "The success receipt lacks a matching actual dispatch record.", extra);
    const undo = action.compensation;
    if (!undo?.applied || undo.targetId !== receipt.externalRecordId || !Number.isSafeInteger(undo.expectedRevision) || undo.expectedRevision < 1)
      return fail('unavailable', "The original saved object and successful write revision cannot be checked.", extra);
    const current = input.calendar.filter(value => value.id === receipt.externalRecordId);
    const saved = { ...extra, recordId: receipt.externalRecordId, recordRevision: undo.expectedRevision };
    if (!current.length) return fail('deleted', "The successfully saved calendar object no longer exists.", saved);
    if (current.length !== 1) return fail('duplicate', "The success receipt corresponds to multiple current objects.", saved);
    const row = current[0];
    if (row.done) return fail('done_marked', "The calendar object is marked complete, which describes that object's state. Actual task progress still needs evidence; workload was not automatically deducted from this marker.", saved);
    if (!Number.isSafeInteger(row.revision) || !Number.isSafeInteger(input.calendarRevisions[row.id]) || input.calendarRevisions[row.id] < 1)
      return fail('unavailable', "The current calendar object's revision or revision high-water mark is unavailable.", saved);
    if (row.revision !== undo.expectedRevision || input.calendarRevisions[row.id] !== undo.expectedRevision || row.effectActionId !== action.id
      || row.approvalDigest !== action.digest || row.saved !== true || row.planning?.state !== 'accepted'
      || canonical(row.planRef) !== canonical({ planId, blockId: unit.blockId })
      || hash(Object.fromEntries(unit.argumentKeys.map(name => [name, (row as unknown as Record<string, unknown>)[name]]))) !== unit.argumentsDigest)
      return fail('changed', "The current calendar object, parameters or revision differs from the original successful save.", saved);
    const owner = key(planId, unit.blockId);
    if (recordOwners.has(row.id) && recordOwners.get(row.id) !== owner || actionOwners.has(action.id) && actionOwners.get(action.id) !== owner)
      return fail('duplicate', "Multiple adoption units reference the same actual object or action.", saved);
    recordOwners.set(row.id, owner); actionOwners.set(action.id, owner);
    if (Date.parse(unit.start) < now) return fail('partial', "Saved occupancy already started or passed and is no longer wholly future. Elapsed time does not establish work done; remaining work still needs actual progress evidence.", saved);
    return { ...base, ...saved, status: 'intact' };
  };
  const unallocated = (status: PlanningUnitObservation['status'] | undefined) => status === 'never_prepared' || status === 'not_adopted';
  for (const attempt of previousSpecs) {
    const { planId, manifest } = attempt, ids = new Set(manifest.units.map(unit => unit.blockId));
    const completeManifest = manifest.version === 1 && manifest.planId === planId && ids.size === manifest.units.length
      && !input.links.some(value => value.planId === planId && !ids.has(value.blockId))
      && !input.calendar.some(value => value.planRef?.planId === planId && !ids.has(value.planRef.blockId));
    const previous = completeManifest ? manifest.units.map(unit => observe(planId, unit)) : [];
    result.observations.push(...previous);
    // A different specification cannot inherit adopted work. A host-proven
    // cancellation of every prepared unit, however, has no work to inherit.
    if (!completeManifest || !previous.some(value => value.status === 'not_adopted') || previous.some(value => !unallocated(value.status)))
      review("Adoption records belong to an old intent specification, and the available proof cannot establish that all its units were unadopted. They cannot be reliably folded into this specification's remaining work.");
  }

  for (const attempt of attempts) {
    const { manifest, planId } = attempt;
    const ids = new Set<string>();
    for (const unit of manifest.units) {
      const identity = key(planId, unit.blockId);
      if (ids.has(unit.blockId)) { review("The planning record has duplicate adoption units."); continue; }
      ids.add(unit.blockId);
      const observation = observe(planId, unit);
      result.observations.push(observation); observations.set(identity, observation);
      if (observation.status !== 'intact' && !unallocated(observation.status)) review(`${observation.reason}（${unit.blockId}）`);
    }
    if (input.links.some(value => value.planId === planId && !ids.has(value.blockId)) || input.calendar.some(value => value.planRef?.planId === planId && !ids.has(value.planRef.blockId)))
      review("An action link or calendar object lies outside the original planning units.");
  }

  const recordVersions = (planId: string, unitIds: string[]) => unitIds.map(id => observations.get(key(planId, id))!)
    .map(value => ({ id: value.recordId!, revision: value.recordRevision! }));
  const complete = (planId: string, ids: string[]) => ids.length > 0 && ids.every(id => observations.get(key(planId, id))?.status === 'intact');
  const tiles = (planId: string, ids: string[], start: string, end: string) => {
    const manifest = seenAttempts.get(planId)!.manifest, units = ids.map(id => manifest.units.find(unit => unit.blockId === id));
    if (!validRange(start, end) || new Set(ids).size !== ids.length || units.some(unit => !unit || !validRange(unit.start, unit.end))) return false;
    const sorted = (units as PlanningManifestUnit[]).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    return sorted.length > 0 && Date.parse(sorted[0].start) === Date.parse(start) && Date.parse(sorted.at(-1)!.end) === Date.parse(end)
      && sorted.every((unit, index) => index === 0 || Date.parse(sorted[index - 1].end) === Date.parse(unit.start));
  };
  const groupIds = new Set<string>(), boundaryIds = new Set<string>(), unitGroups = new Set<string>(), unitBoundaries = new Set<string>();
  for (const { planId, manifest } of attempts) {
    for (const group of manifest.groups) {
      if (groupIds.has(group.id)) { review("Different work groups reuse the same identity."); continue; }
      groupIds.add(group.id);
      const task = request.tasks.find(value => value.id === group.taskId);
      const groupUnits = manifest.units.filter(unit => unit.groupId === group.id);
      if (!task || !Number.isSafeInteger(group.segment) || group.segment < 1 || !validRange(group.start, group.end)
        || !Number.isSafeInteger(group.durationMinutes) || group.durationMinutes < 1 || group.durationMinutes !== (Date.parse(group.end) - Date.parse(group.start)) / minute
        || Date.parse(group.reservedStart) > Date.parse(group.start) || Date.parse(group.reservedEnd) < Date.parse(group.end)
        || !tiles(planId, group.unitIds, group.reservedStart, group.reservedEnd)
        || canonical(groupUnits.map(value => value.blockId).sort()) !== canonical([...group.unitIds].sort()) || groupUnits.some(value => value.kind !== 'work')) {
        review("A work group's complete occupancy, net-work range or task ownership cannot be checked."); continue;
      }
      for (const id of group.unitIds) {
        const identity = key(planId, id);
        if (unitGroups.has(identity)) review("Multiple work groups reference one adoption unit.");
        unitGroups.add(identity);
      }
      if (!complete(planId, group.unitIds)) {
        if (group.unitIds.some(id => !unallocated(observations.get(key(planId, id))?.status))) review("Only part of this work group's occupancy or proof remains. The complete arrangement is unconfirmed, so this portion was not deducted from net workload.");
        continue;
      }
      if (Date.parse(group.reservedStart) < now || Date.parse(group.reservedStart) < Date.parse(request.from) || Date.parse(group.reservedEnd) > Date.parse(request.to)) {
        review("This work group is no longer complete future occupancy inside the original planning scope."); continue;
      }
      const versions = recordVersions(planId, group.unitIds);
      result.retained.work.push({ id: group.id, taskId: group.taskId, segment: group.segment, start: group.start, end: group.end,
        reservedStart: group.reservedStart, reservedEnd: group.reservedEnd, durationMinutes: group.durationMinutes,
        recordIds: versions.map(value => value.id), recordVersions: versions, ...(group.placeId ? { placeId: group.placeId } : {}) });
    }
    for (const boundary of manifest.boundaries) {
      if (boundaryIds.has(boundary.id)) { review("Different rest or travel boundaries reuse the same identity."); continue; }
      boundaryIds.add(boundary.id);
      const units = manifest.units.filter(unit => unit.boundaryId === boundary.id);
      if (!Number.isFinite(boundary.restMinutes) || !Number.isFinite(boundary.travelMinutes) || boundary.restMinutes < 0 || boundary.travelMinutes < 0
        || !tiles(planId, boundary.unitIds, boundary.start, boundary.end) || (Date.parse(boundary.end) - Date.parse(boundary.start)) / minute !== boundary.restMinutes + boundary.travelMinutes
        || canonical(units.map(value => value.blockId).sort()) !== canonical([...boundary.unitIds].sort()) || units.some(value => value.kind !== 'transition')) {
        review("The complete rest or travel boundary cannot be checked."); continue;
      }
      for (const id of boundary.unitIds) {
        const identity = key(planId, id);
        if (unitBoundaries.has(identity)) review("Multiple rest or travel boundaries reference one adoption unit.");
        unitBoundaries.add(identity);
      }
      if (!complete(planId, boundary.unitIds)) {
        if (boundary.unitIds.some(id => !unallocated(observations.get(key(planId, id))?.status))) review("Only part of this rest or travel boundary's occupancy or proof remains.");
        continue;
      }
      const versions = recordVersions(planId, boundary.unitIds), { unitIds: _unitIds, ...coverage } = boundary;
      result.retained.boundaries.push({ ...coverage, recordIds: versions.map(value => value.id), recordVersions: versions });
    }
    if (manifest.units.some(unit => unit.kind === 'work' && !unitGroups.has(key(planId, unit.blockId)))) review("A net-work adoption unit has no complete work group.");
    if (manifest.units.some(unit => unit.kind === 'transition' && !unitBoundaries.has(key(planId, unit.blockId)))) review("A rest or travel adoption unit has no complete boundary.");
  }
  const occupied = attempts.flatMap(attempt => attempt.manifest.units.filter(unit => observations.get(key(attempt.planId, unit.blockId))?.status === 'intact'))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  let lastEnd = -Infinity;
  for (const unit of occupied) {
    if (Date.parse(unit.start) < lastEnd) review("Adopted work, rest, travel or protected time overlaps. The current arrangement does not support a conflict-free continuation.");
    lastEnd = Math.max(lastEnd, Date.parse(unit.end));
  }
  if (occupied.length) {
    const ownRecords = new Set(result.observations.filter(value => value.status === 'intact').map(value => value.recordId!));
    const otherCalendar = input.calendar.filter(value => !ownRecords.has(value.id) && !value.done
      && (!value.planning || value.planning.state === 'accepted') && (!value.kind || ['event', 'time_block'].includes(value.kind)));
    try {
      const from = occupied[0].start, to = iso(lastEnd), expansion = expandAgenda(otherCalendar, from, to, request.timeZone);
      if (expansion.issues.length) review("Other current calendar occupancy is not fully expanded. It remains unknown whether saved work, rest, travel and protected time are conflict-free.");
      for (const row of expansion.items) {
        const dateBounds = typeof row.allDayDate === 'string' ? planningDayBounds(row.allDayDate, String(row.timeZone || request.timeZone))
          : row.dateBounds as { from: string; to: string } | undefined;
        const start = dateBounds?.from || String(row.startsAt || ''), startTime = Date.parse(start);
        const end = dateBounds?.to || (typeof row.durationMinutes === 'number' ? iso(startTime + row.durationMinutes * minute) : to);
        if (!Number.isFinite(startTime) || !validRange(start, end)) { review("The current calendar contains an occupancy range that cannot be checked."); continue; }
        if (occupied.some(unit => overlaps(unit, { start, end }))) review("Other current calendar events conflict with adopted work, rest, travel or protected occupancy.");
      }
    } catch {
      review("Other calendar boundaries are unconfirmed. Reading actual current events can supply the missing planning basis.");
    }
  }
  const work = result.retained.work.sort((a, b) => Date.parse(a.reservedStart) - Date.parse(b.reservedStart) || a.id.localeCompare(b.id));
  const retainedIds = new Set(work.map(value => value.id));
  for (const { manifest } of attempts) if (new Set(manifest.allocationBasis.groupIds).size !== manifest.allocationBasis.groupIds.length
    || manifest.allocationBasis.groupIds.some(id => !retainedIds.has(id) || manifest.groups.some(group => group.id === id)))
    review("A previously scheduled work group needed for recalculation is missing, changed or duplicated.");
  for (const task of request.tasks) {
    const groups = work.filter(value => value.taskId === task.id);
    if (!groups.length) continue;
    const minutes = groups.reduce((sum, value) => sum + value.durationMinutes, 0), reservedEnd = iso(Math.max(...groups.map(value => Date.parse(value.reservedEnd))));
    if (minutes > task.durationMinutes.max) review("Scheduled net work exceeds the original task's workload. Remaining work was not automatically computed from inconsistent quantities.");
    result.taskMinutes.push({ taskId: task.id, minutes, reservedEnd });
    if (minutes === task.durationMinutes.max) result.retained.scheduledTasks.push({ taskId: task.id, reservedEnd });
    result.allocatedMinutes += minutes;
  }
  const daily = new Map<string, number>();
  for (const group of work) {
    const last = dateInZone(iso(Date.parse(group.end) - 1), request.timeZone);
    for (let date = dateInZone(group.start, request.timeZone); date <= last; date = addDate(date, 1)) {
      const bounds = planningDayBounds(date, request.timeZone);
      const minutes = Math.max(0, Math.min(Date.parse(group.end), Date.parse(bounds.to)) - Math.max(Date.parse(group.start), Date.parse(bounds.from))) / minute;
      if (minutes > 0) daily.set(date, (daily.get(date) || 0) + minutes);
    }
  }
  result.dailyMinutes = [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([date, minutes]) => ({ date, minutes }));
  if (result.allocatedMinutes > request.maxScheduledMinutes) review("Scheduled net work exceeds the original plan's overall budget.");
  for (const budget of request.dailyBudgets) if (budget.maxScheduledMinutes !== undefined && (daily.get(budget.date) || 0) > budget.maxScheduledMinutes + 1e-8)
    review("Scheduled net work exceeds the original plan's daily budget.");
  result.reasons = [...new Set(result.reasons)];
  return result;
}

/** Start from the original envelope once. Adopted work stays scheduled, never completed. */
export function materializePlanningIntent(spec: PlanningIntentSpec, adoption: PlanningAdoptionProjection, options: { now: string }): PlanningReplanMaterialization {
  const retained = structuredClone(adoption.retained), requiredRefresh = structuredClone(spec.requiredRefresh);
  const finish = (status: PlanningReplanMaterialization['status'], reasons: string[], request: PlanningDraftRequest | null = null): PlanningReplanMaterialization =>
    ({ status, request, retained, reasons: [...new Set(reasons)], requiredRefresh });
  if (adoption.status !== 'ready') return finish('needs_review', adoption.reasons);
  if (spec.request.completedTaskIds.length && !requiredRefresh.some(value => value.kind === 'completion'))
    spec.request.completedTaskIds.forEach(taskId => requiredRefresh.push({ kind: 'completion', taskId }));
  if (spec.coverageMode !== 'retained_local_interpretation' && !requiredRefresh.some(value => value.kind === 'source_coverage')) requiredRefresh.push({ kind: 'source_coverage' });
  if (requiredRefresh.length) return finish('required_refresh', ["The original plan retains its explanations and methods, including parts dependent on real sources, conditions or completion. requiredRefresh lists these gaps. Old satisfied flags or source versions are not today's answers; currently readable facts can support the next arrangement."]);
  const original = structuredClone(spec.request), now = Date.parse(options.now);
  if (!Number.isFinite(now)) return finish('needs_review', ["The current time cannot be verified."]);
  const from = Math.max(Date.parse(original.from), (Math.floor(now / minute) + 1) * minute), to = Date.parse(original.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return finish('no_future_domain', ["The original planning window has no future time left for this continuation, and its agreed dates stay unchanged. Discuss a new window from current wishes; the work was not marked complete."]);
  // Alignment limits new writes. A saved reservation can legitimately begin
  // in the few future seconds before that aligned lower bound.
  if (retained.work.some(value => Date.parse(value.reservedStart) < now) || retained.boundaries.some(value => Date.parse(value.start) < now))
    return finish('needs_review', ["Adopted occupancy already started or passed and is not wholly inside the future window. It retains the original scheduling fact, but actual progress is unknown, so it cannot reliably be counted as purely future occupancy."]);
  const clip = <T extends { start: string; end: string }>(values: T[]): T[] => values.flatMap(value => {
    const start = Math.max(from, Date.parse(value.start)), end = Math.min(to, Date.parse(value.end));
    return end > start ? [{ ...value, start: iso(start), end: iso(end) }] : [];
  });
  const scheduleWindows = original.scheduleWindows === undefined ? undefined : clip(original.scheduleWindows);
  if (scheduleWindows?.length === 0) return finish('no_future_domain', ["The declared available windows have no future intersection. They still define the scope; the whole date range did not become available. Discuss another period if that suits current wishes."]);
  const tasks: PlanningDraftRequest['tasks'] = [];
  for (const task of original.tasks) {
    const allocation = adoption.taskMinutes.find(value => value.taskId === task.id), allocated = allocation?.minutes || 0;
    if (allocated > task.durationMinutes.max || allocated < 0) return finish('needs_review', ["Scheduled net work does not match the original task workload."]);
    if (allocated === task.durationMinutes.max) continue;
    const max = task.durationMinutes.max - allocated;
    if (task.minimumChunkMinutes && max < task.minimumChunkMinutes) return finish('needs_review', ["Remaining net work is shorter than the agreed minimum continuous block. Both conditions cannot continue together. The original constraints remain; no duration was changed here."]);
    const earliest = allocation ? Math.max(task.earliestStart ? Date.parse(task.earliestStart) : from, Date.parse(allocation.reservedEnd)) : undefined;
    if (earliest !== undefined && task.deadline && earliest >= Date.parse(task.deadline)) return finish('needs_review', ["The remainder after scheduled work can no longer meet the original task deadline."]);
    tasks.push({ ...task, durationMinutes: { min: Math.max(1, task.durationMinutes.min - allocated), max }, conditions: [],
      ...(earliest === undefined ? {} : { earliestStart: iso(earliest) }),
      ...(task.allowedWindows === undefined ? {} : { allowedWindows: clip(task.allowedWindows) }), preferredWindows: clip(task.preferredWindows) });
  }
  const maxScheduledMinutes = original.maxScheduledMinutes - adoption.allocatedMinutes;
  if (maxScheduledMinutes < 0) return finish('needs_review', ["Scheduled net work exceeds the original overall budget."]);
  const firstDate = dateInZone(iso(from), original.timeZone), lastDate = dateInZone(iso(to - 1), original.timeZone);
  const dailyBudgets = original.dailyBudgets.filter(value => value.date >= firstDate && value.date <= lastDate).map(value => ({ ...value,
    ...(value.maxScheduledMinutes === undefined ? {} : { maxScheduledMinutes: value.maxScheduledMinutes - (adoption.dailyMinutes.find(day => day.date === value.date)?.minutes || 0) }) }));
  if (dailyBudgets.some(value => value.maxScheduledMinutes !== undefined && value.maxScheduledMinutes < -1e-8)) return finish('needs_review', ["Scheduled net work exceeds the original daily budget."]);
  const request = planningDraftInput.parse({ ...original, from: iso(from), to: original.to, tasks, completedTaskIds: [],
    ...(scheduleWindows === undefined ? {} : { scheduleWindows }), protectedWindows: clip(original.protectedWindows),
    dailyBudgets: dailyBudgets.map(value => ({ ...value, ...(value.maxScheduledMinutes === undefined ? {} : { maxScheduledMinutes: Math.max(0, value.maxScheduledMinutes) }) })),
    maxScheduledMinutes, busy: [], travelTimes: [], energyWindows: [], conditions: [], sourceCoverage: [{ sourceId: 'user-declared', status: 'complete',
      reason: "This continues planning explanations and method defaults still supported by legitimate original statements: how tasks and conditions were understood then. Actual local calendar records are supplied separately. Retaining an explanation does not freshly verify external facts, energy or every real commitment. Judge its relevance using sources actually read this time." }] });
  return finish('ready', [], request);
}
