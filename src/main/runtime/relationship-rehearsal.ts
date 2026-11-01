import { createHash, randomUUID } from 'node:crypto';
import * as z from 'zod';
import { HarnessError, type ScopeHandle, type WorkRecord, type WorkSourceRef } from '../../shared/harness';
import {
  rehearsalDataSchema, rehearsalReadInput, rehearsalRefSchema, rehearsalWriteInput,
  type RehearsalCitation, type RehearsalData, type RehearsalInteraction, type RehearsalLocator,
  type RehearsalRef, type RehearsalStoredTurn, type RehearsalView, type RehearsalWriteInput,
} from '../../shared/relationship-rehearsal';
import type { KernelRepository } from '../storage/repository';
import type { WorkService } from './work';
import { canonical, codePointSlice } from './semantics';
import { resolveSourceQuote } from './source-quote';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const address = (source: WorkSourceRef): WorkSourceRef => ({ eventId: source.eventId, contentVersion: source.contentVersion, start: source.start, end: source.end });
const meaning = "This is expression rehearsal within the same matter. The person's practice lines establish neither external speech, agreement, nor action. The other reply is always an assistant-simulated possibility, not a real relationship fact. Change the possibility, collect one sentence, or stop at any time without completing rounds.";
type Permission = (source: WorkSourceRef) => boolean;
type Current = { record: WorkRecord; data: RehearsalData; matter: WorkRecord };

/** The admission exists only in the host. Tool arguments cannot claim one. */
export interface RehearsalAdmission {
  ref: RehearsalRef;
  kind: RehearsalInteraction['kind'];
  sessionId: string;
  privacyEpoch: number;
  policyRevision: number;
}
export interface RehearsalContext {
  sessionId: string;
  allowCrossSession: boolean;
  permits?: Permission;
  admission?: RehearsalAdmission;
  signal?: AbortSignal;
}

/** A source-bound artifact of the existing collaboration frame. No model,
 * contact profile, external sender or separate conversation loop lives here. */
export class RelationshipRehearsalService {
  constructor(readonly repo: KernelRepository, readonly work: WorkService) {}
  idFor(matterId: string) { return 'rehearsal:' + hash(matterId); }

  private scope(handle: ScopeHandle, write = false) {
    const scope = this.work.policy.require(handle, write ? 'work:write' : 'evidence:read');
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.sources.includes('work:self') || write && (scope.child || scope.retention !== 'purpose_scoped'))
      throw new HarnessError('rehearsal_scope', "This rehearsal remains within the person's currently permitted shared-view scope.");
    return scope;
  }
  private cite(handle: ScopeHandle, input: RehearsalCitation, permits?: Permission): RehearsalLocator {
    const event = this.repo.evidence(handle, input.eventId), resolved = event && resolveSourceQuote(event, input);
    if (!event || !resolved || permits?.(address(resolved)) === false)
      throw new HarnessError('rehearsal_source_changed', "The original position of that statement changed. Reconnect a currently permitted position.");
    this.repo.resolveWorkSourceBinding(handle, [address(resolved)]);
    return { ...address(resolved), quoteSha256: hash(resolved.quote) };
  }
  private currentSource(handle: ScopeHandle, input: RehearsalCitation, context: RehearsalContext, recordId?: string): RehearsalLocator {
    const scope = this.scope(handle, true), event = this.repo.evidence(handle, input.eventId);
    const admission = context.admission;
    const admittedQuotation = event?.authority === 'quotation' && !!admission && admission.ref.id === recordId
      && admission.sessionId === context.sessionId && admission.privacyEpoch === scope.privacyEpoch
      && admission.policyRevision === scope.policyRevision;
    if (!event || event.speaker !== 'user' || event.kind !== 'user_message' || !scope.currentEventIds.includes(event.id)
      || event.authority !== 'user_statement' && !admittedQuotation)
      throw new HarnessError('rehearsal_current_source', "This step needs the person's actual current words. A simulated line cannot decide for them.");
    return this.cite(handle, input, context.permits);
  }
  private locatorCurrent(handle: ScopeHandle, source: RehearsalLocator, permits?: Permission) {
    if (permits?.(address(source)) === false) return false;
    const event = this.repo.evidence(handle, source.eventId);
    return !!event && event.contentVersion === source.contentVersion
      && codePointSlice(event.text, source.start, source.end).length > 0
      && hash(codePointSlice(event.text, source.start, source.end)) === source.quoteSha256;
  }
  private locators(data: RehearsalData): RehearsalLocator[] {
    return [data.startedBy, data.lastControl, ...data.intention.sources,
      ...data.boundaries.flatMap(boundary => boundary.sources), ...data.counterpart.premise.sources,
      ...data.turns.flatMap(turn => turn.actor === 'you' ? [turn.source, turn.controlSource] : [turn.requestedBy]),
      ...(data.lastAside ? [data.lastAside.requestedBy] : []), ...(data.expression ? [data.expression.requestedBy] : []),
      ...data.operations.map(operation => operation.source)];
  }
  private refs(data: RehearsalData): WorkSourceRef[] {
    const ranges = this.locators(data).map(address).sort((a, b) => a.eventId.localeCompare(b.eventId)
      || a.contentVersion - b.contentVersion || a.start - b.start || a.end - b.end);
    const result: WorkSourceRef[] = [];
    for (const range of ranges) {
      const prior = result.at(-1);
      if (prior && prior.eventId === range.eventId && prior.contentVersion === range.contentVersion && range.start <= prior.end)
        prior.end = Math.max(prior.end, range.end);
      else result.push({ ...range });
    }
    return result;
  }
  private path(data: RehearsalData) {
    const index = new Map(data.turns.map(turn => [turn.id, turn])), visited = new Set<string>(), result: RehearsalStoredTurn[] = [];
    let id = data.activeTurnId;
    while (id) {
      if (visited.has(id)) throw new HarnessError('rehearsal_path_changed', "Reconnect the current round's exchange position.");
      visited.add(id);
      const turn = index.get(id);
      if (!turn) throw new HarnessError('rehearsal_path_changed', "The preceding line of this round is incomplete.");
      result.push(turn); id = turn.parentId;
    }
    return result.reverse();
  }
  private current(handle: ScopeHandle, id: string, context: Pick<RehearsalContext, 'sessionId' | 'allowCrossSession' | 'permits'>): Current | undefined {
    const record = this.repo.workArtifactRecords(handle, 'relationship_rehearsal', { id, limit: 1 })[0];
    if (!record || record.kind !== 'plan' || !record.sourceBinding) return;
    const parsed = rehearsalDataSchema.safeParse(record.data);
    if (!parsed.success || record.status !== parsed.data.state || id !== this.idFor(parsed.data.matterId)
      || !context.allowCrossSession && !parsed.data.sessionIds.includes(context.sessionId)) return;
    const data = parsed.data, matter = this.repo.work(handle, 'episode', data.matterId)[0];
    if (!matter || matter.data.type !== 'collaboration_frame') return;
    try {
      const refs = this.refs(data);
      if (refs.some(ref => context.permits?.(ref) === false)
        || canonical(record.sourceBinding) !== canonical(this.repo.resolveWorkSourceBinding(handle, refs))
        || this.locators(data).some(source => !this.locatorCurrent(handle, source, context.permits))) return;
      this.path(data);
    } catch (error) { if (error instanceof HarnessError) return; throw error; }
    return { record, data, matter };
  }
  private userReport(handle: ScopeHandle, source: RehearsalCitation, context: RehearsalContext, recordId: string) {
    const event = this.repo.evidence(handle, source.eventId), scope = this.repo.scope(handle);
    const practiceControl = event?.authority === 'quotation' && context.admission?.ref.id === recordId
      && scope.currentEventIds.includes(source.eventId);
    if (!event || event.speaker !== 'user' || event.authority !== 'user_statement' && !practiceControl)
      throw new HarnessError('rehearsal_intention_source', "The intended meaning must follow actual original words, not the assistant's simulation.");
    return this.cite(handle, source, context.permits);
  }
  private supported(handle: ScopeHandle, input: { text: string; sources: RehearsalCitation[] }, context: RehearsalContext, recordId: string) {
    return { text: input.text, sources: input.sources.map(source => this.userReport(handle, source, context, recordId)) };
  }
  private premise(handle: ScopeHandle, input: Extract<RehearsalWriteInput, { operation: 'begin' }>['counterpart']['premise'], context: RehearsalContext, recordId: string) {
    return { text: input.text, origin: input.origin, sources: input.sources.map(source => input.origin === 'user_report_for_this_rehearsal'
      ? this.userReport(handle, source, context, recordId) : this.cite(handle, source, context.permits)) };
  }

  /** Read-only identity for the existing pre-storage boundary parser. */
  referenceIdentity(handle: ScopeHandle, sessionId: string, input: RehearsalInteraction) {
    const scope = this.scope(handle), ref = rehearsalRefSchema.parse(input.ref);
    // Before interpreting this new request's source limits, read only owner
    // identity. Old turns and their proof originals stay closed here.
    const row = this.repo.db.prepare(`SELECT id FROM h_work WHERE owner=? AND workspace=? AND subject=? AND world='real'
      AND audience='self' AND source='work:self' AND id=? AND revision=? AND kind='plan'
      AND json_extract(payload,'$.data.type')='relationship_rehearsal'
      AND json_extract(payload,'$.data.matterId')=?
      AND (json_extract(payload,'$.data.sessionId')=? OR EXISTS (
        SELECT 1 FROM json_each(json_extract(payload,'$.data.sessionIds')) WHERE value=?))`)
      .get(scope.principalId, scope.workspaceId, scope.principalId, ref.id, ref.revision, ref.matterId, sessionId, sessionId);
    if (!row) throw new HarnessError('rehearsal_reference_changed', "This rehearsal position changed.");
    return { activity: 'relationship_rehearsal' as const, actualExchange: false as const };
  }

  admit(handle: ScopeHandle, sessionId: string, input: RehearsalInteraction, allowCrossSession: boolean, permits?: Permission) {
    const scope = this.scope(handle), ref = rehearsalRefSchema.parse(input.ref);
    const current = this.current(handle, ref.id, { sessionId, allowCrossSession, permits });
    if (!current || current.record.revision !== ref.revision || current.data.matterId !== ref.matterId || current.data.activeTurnId !== ref.activeTurnId
      || ['closed', 'held'].includes(current.data.state) && !['resume', 'collect', 'reference'].includes(input.kind))
      throw new HarnessError('rehearsal_reference_changed', "The simulation changed. Return to its current round.");
    return { admission: { ref, kind: input.kind, sessionId, privacyEpoch: scope.privacyEpoch, policyRevision: scope.policyRevision } satisfies RehearsalAdmission,
      disableInference: true,
      sourceBinding: current.record.sourceBinding!, record: current.record, view: this.project(handle, current, 0, 12),
      meaning: "The new statement is real user input. The UI reference supplies rehearsal provenance only. Practice lines are not real promises or relationship facts; a genuine exit or separate request still follows the main assistant's full semantic interpretation and original limits." };
  }

  write(handle: ScopeHandle, context: RehearsalContext, raw: RehearsalWriteInput) {
    const input = rehearsalWriteInput.parse(raw), scope = this.scope(handle, true);
    context.signal?.throwIfAborted();
    const id = input.operation === 'begin' ? this.idFor(input.matterId) : input.id;
    const control = this.currentSource(handle, input.source, context, input.operation === 'begin' ? undefined : id);
    if (input.operation === 'pause' || input.operation === 'close') return this.stop(handle, context, input, control);
    return this.repo.write(() => {
      context.signal?.throwIfAborted(); this.scope(handle, true);
      const matter = this.repo.work(handle, 'episode', input.matterId)[0];
      if (!matter || matter.data.type !== 'collaboration_frame' || !['active', 'needs_review'].includes(matter.status))
        throw new HarnessError('rehearsal_matter_changed', "Clarify the actual matter the person wants to express before continuing rehearsal.");
      const old = this.current(handle, id, context), metadata = this.repo.sourcedWorkMetadata(handle, id);
      const key = hash(canonical({ operation: input.operation, source: address(control) }));
      if (old?.data.operations.some(operation => operation.key === key))
        return { status: 'unchanged' as const, view: this.project(handle, old), records: [old.record] };
      if (input.operation === 'begin') {
        if (matter.revision !== input.expectedMatterRevision) throw new HarnessError('revision_conflict', "The matter acquired a new meaning. Continue its current revision.");
        if (old?.data.state === 'active') return { status: 'already_started' as const,
          view: this.project(handle, old), records: [old.record],
          read: { tool: 'read_relationship_rehearsal' as const, arguments: { id: old.record.id, expectedRevision: old.record.revision } },
          meaning: "The same matter already has this readable rehearsal. Only its original revision was recovered; none was reopened, rewritten, or restored. Use original view.ref and actual current practice words for respond, then its returned present entry for display." };
        if (metadata) throw new HarnessError('rehearsal_exists', "This matter already has a simulation. Read and continue, try another possibility, or collect it without creating a parallel rehearsal.");
      } else if (!old || old.record.revision !== input.expectedRevision || old.data.matterId !== input.matterId
        || ['closed', 'held'].includes(old.data.state) && !['resume', 'collect', 'adjust'].includes(input.operation))
        throw new HarnessError('rehearsal_changed', "The simulation's starting point changed. Reconnect its current round.");
      if (context.admission && old && old.record.revision !== context.admission.ref.revision
        && old.data.lastControl.eventId !== control.eventId)
        throw new HarnessError('rehearsal_reference_changed', "Another new statement changed the rehearsal after selection. The old position cannot receive writes.");
      const now = this.repo.clock.now();
      let data: RehearsalData;
      if (input.operation === 'begin') {
        data = { type: 'relationship_rehearsal', version: 1, matterId: matter.id, state: 'active', sessionId: context.sessionId,
          sessionIds: [context.sessionId], startedBy: control, lastControl: control,
          intention: this.supported(handle, input.intention, context, id), boundaries: input.boundaries.map(boundary => this.supported(handle, boundary, context, id)),
          counterpart: { label: input.counterpart.label, premise: this.premise(handle, input.counterpart.premise, context, id) },
          turns: [], activeTurnId: null, lastAside: null, expression: null, operations: [], sourceIds: [], createdAt: now, updatedAt: now };
        if (input.opening) {
          const turn: RehearsalStoredTurn = { id: randomUUID(), parentId: null, actor: 'possible_other', origin: 'assistant_simulation',
            text: input.opening, requestedBy: control, alternativeOf: null, createdAt: now, basedOnRevision: 1 };
          data.turns.push(turn); data.activeTurnId = turn.id;
        }
      } else data = structuredClone(old!.data);
      data.sessionId = context.sessionId; data.sessionIds = [...new Set([...data.sessionIds, context.sessionId])];
      data.lastControl = control; data.updatedAt = now;
      if (input.operation === 'respond') {
        const source = this.currentSource(handle, input.userLine, context, id);
        if (source.eventId !== control.eventId) throw new HarnessError('rehearsal_line_not_current', "This line must be the person's actual current rehearsal words, not assistant-authored speech for them.");
        const user: RehearsalStoredTurn = { id: randomUUID(), parentId: data.activeTurnId, actor: 'you', origin: 'user_practice_not_actual_exchange',
          source, controlSource: control, createdAt: now, basedOnRevision: old!.record.revision };
        const other: RehearsalStoredTurn = { id: randomUUID(), parentId: user.id, actor: 'possible_other', origin: 'assistant_simulation',
          text: input.response, requestedBy: control, alternativeOf: null, createdAt: now, basedOnRevision: old!.record.revision };
        data.turns.push(user, other); data.activeTurnId = other.id;
      }
      if (input.operation === 'alternative') {
        const target = this.path(data).find(turn => turn.id === input.targetTurnId);
        if (!target || target.actor !== 'possible_other') throw new HarnessError('rehearsal_alternative_target', "An alternative must continue the simulated reply currently being viewed.");
        if (input.premise) data.counterpart.premise = this.premise(handle, input.premise, context, id);
        const alternative: RehearsalStoredTurn = { id: randomUUID(), parentId: target.parentId, actor: 'possible_other', origin: 'assistant_simulation',
          text: input.response, requestedBy: control, alternativeOf: target.id, createdAt: now, basedOnRevision: old!.record.revision };
        data.turns.push(alternative); data.activeTurnId = alternative.id;
      }
      if (input.operation === 'adjust') {
        if (!input.intention && !input.boundaries && !input.premise && input.aside === undefined)
          throw new HarnessError('rehearsal_adjustment_missing', "Use the actual intended change; do not create an empty new revision.");
        if (input.intention) data.intention = this.supported(handle, input.intention, context, id);
        if (input.boundaries) data.boundaries = input.boundaries.map(boundary => this.supported(handle, boundary, context, id));
        if (input.premise) data.counterpart.premise = this.premise(handle, input.premise, context, id);
      }
      if ('aside' in input && input.aside !== undefined) data.lastAside = input.aside ? { text: input.aside, requestedBy: control, at: now } : null;
      if (input.operation === 'resume') data.state = 'active';
      if (input.operation === 'collect') {
        data.expression = this.collect(handle, matter, data, input, control, old!.record.revision, now);
        data.state = 'held';
      }
      data.operations.push({ key, operation: input.operation, source: control, at: now });
      if (data.turns.length > 128 || data.operations.length > 128 || data.sessionIds.length > 128)
        throw new HarnessError('rehearsal_length', "This exchange is long. Focus on the sentence to retain now; earlier lines were not truncated.");
      const refs = this.refs(data);
      if (refs.length > 32) throw new HarnessError('rehearsal_sources', "This rehearsal already uses many original statements. Clarify the current sentence without discarding earlier meaning.");
      const binding = this.repo.resolveWorkSourceBinding(handle, refs);
      data.sourceIds = binding.sourceIds;
      rehearsalDataSchema.parse(data);
      const record: WorkRecord = { id, kind: 'plan', ownerId: scope.principalId, workspaceId: scope.workspaceId, subjectId: scope.subjectId,
        worldId: scope.worldId, revision: (old?.record.revision || 0) + 1, status: data.state, title: "Try a possible reply first",
        evidenceIds: [...new Set(binding.refs.map(ref => ref.eventId))], sourceBinding: binding,
        label: { purpose: scope.purposes[0], audience: 'self', retention: 'purpose_scoped', sensitivity: 'personal', infer: false },
        data: data as unknown as WorkRecord['data'] };
      this.repo.saveSourcedWork(handle, record, old?.record.revision);
      for (const ref of binding.refs) this.repo.addDependency(handle, { consumerId: id, producerId: ref.eventId,
        producerRevision: ref.contentVersion, sensitivity: 'privacy', invalidation: 'block' });
      return { status: 'saved' as const, view: this.project(handle, { record, data, matter }), records: [record], meaning };
    });
  }

  private collect(handle: ScopeHandle, matter: WorkRecord, data: RehearsalData,
    input: Extract<RehearsalWriteInput, { operation: 'collect' }>, source: RehearsalLocator, revision: number, now: string) {
    const path = this.path(data), ids = input.fromTurnIds || path.map(turn => turn.id);
    if (ids.some(id => !path.some(turn => turn.id === id))) throw new HarnessError('rehearsal_draft_source', "Collect only the actual rehearsed exchange; another hypothetical cannot become what just happened.");
    const refs = [source, data.startedBy, ...data.intention.sources, ...data.boundaries.flatMap(boundary => boundary.sources),
      ...data.counterpart.premise.sources, ...path.flatMap(turn => turn.actor === 'you' ? [turn.source, turn.controlSource] : [turn.requestedBy])].map(address);
    const unique = [...new Map(refs.map(ref => [canonical(ref), ref])).values()];
    const binding = this.repo.resolveWorkSourceBinding(handle, unique);
    const optionId = 'rehearsal-expression:' + hash(this.idFor(matter.id)), old = this.repo.work(handle, 'option', optionId)[0];
    const scope = this.scope(handle, true);
    if (old && (old.data.type !== 'rehearsal_expression' || old.data.matterId !== matter.id)) throw new HarnessError('rehearsal_expression_changed', "The expression address to collect changed.");
    const option: WorkRecord = { id: optionId, kind: 'option', ownerId: scope.principalId, workspaceId: scope.workspaceId, subjectId: scope.subjectId,
      worldId: scope.worldId, revision: (old?.revision || 0) + 1, status: 'proposed', title: "A sentence to consider saying",
      evidenceIds: [...new Set(binding.refs.map(ref => ref.eventId))], sourceBinding: binding,
      label: { purpose: scope.purposes[0], audience: 'self', retention: 'purpose_scoped', sensitivity: 'personal', infer: false },
      data: { type: 'rehearsal_expression', matterId: matter.id, episodeId: matter.id, rehearsalId: this.idFor(matter.id),
        basedOnRehearsalRevision: revision, text: input.expression, origin: 'assistant_draft_not_sent', proposalOnly: true,
        sourceIds: binding.sourceIds, createdAt: old?.data.createdAt || now, updatedAt: now, actualExchange: false, delivery: 'not_sent' } };
    this.repo.saveSourcedWork(handle, option, old?.revision);
    const optionIds = [...new Set([...(Array.isArray(matter.data.optionIds) ? matter.data.optionIds.filter((id): id is string => typeof id === 'string') : []), option.id])];
    if (optionIds.length > 64) throw new HarnessError('rehearsal_options', "This matter has many expression candidates. Original choices were neither overwritten nor deleted.");
    if (canonical(optionIds) !== canonical(matter.data.optionIds || []))
      this.work.update(handle, matter.id, matter.revision, { data: { ...matter.data, optionIds } });
    for (const ref of binding.refs) this.repo.addDependency(handle, { consumerId: option.id, producerId: ref.eventId,
      producerRevision: ref.contentVersion, sensitivity: 'privacy', invalidation: 'block' });
    return { optionId: option.id, revision: option.revision, requestedBy: source, fromTurnIds: ids,
      origin: 'assistant_draft_not_sent' as const, at: now };
  }

  private stop(handle: ScopeHandle, context: RehearsalContext,
    input: Extract<RehearsalWriteInput, { operation: 'pause' | 'resume' | 'close' }>, source: RehearsalLocator) {
    return this.repo.write(() => {
      context.signal?.throwIfAborted();
      const metadata = this.repo.sourcedWorkMetadata(handle, input.id);
      if (!metadata || metadata.kind !== 'plan' || metadata.type !== 'relationship_rehearsal' || metadata.matterId !== input.matterId
        || metadata.id !== this.idFor(input.matterId) || metadata.revision !== input.expectedRevision)
        throw new HarnessError('rehearsal_changed', "The rehearsal changed. Put it away under its current state.");
      if (metadata.status === 'closed' || metadata.status === 'held' && input.operation === 'pause')
        return { status: 'unchanged' as const, id: metadata.id, revision: metadata.revision, state: metadata.status, records: [] as WorkRecord[] };
      const state = input.operation === 'close' ? 'closed' : 'held', now = this.repo.clock.now();
      const lifecycle = { operation: input.operation, source, at: now };
      this.repo.db.prepare(`UPDATE h_work SET status=?,revision=revision+1,payload=json_set(payload,'$.status',?,'$.revision',revision+1,
        '$.data.state',?,'$.data.updatedAt',?,'$.data.lifecycleControl',json(?)) WHERE id=? AND revision=?`)
        .run(state, state, state, now, JSON.stringify(lifecycle), input.id, input.expectedRevision);
      this.repo.outbox('work_changed', input.id);
      return { status: 'saved' as const, id: input.id, revision: metadata.revision + 1, state, records: [] as WorkRecord[],
        meaning: "Only park or close this rehearsal. No original words, personal interpretation, external message, or real agreement was restored, changed, sent, or canceled." };
    });
  }

  private expression(handle: ScopeHandle, data: RehearsalData) {
    if (!data.expression) return null;
    const option = this.repo.work(handle, 'option', data.expression.optionId)[0];
    return option && option.revision === data.expression.revision && option.data.type === 'rehearsal_expression'
      && option.data.rehearsalId === this.idFor(data.matterId) && option.data.matterId === data.matterId
      && option.sourceBinding && this.repo.workBindingsReadable(handle, [option.sourceBinding]) && typeof option.data.text === 'string'
      ? { optionId: option.id, revision: option.revision, text: option.data.text, origin: 'assistant_draft_not_sent' as const } : null;
  }
  private project(handle: ScopeHandle, current: Current, offset = 0, limit = 16): RehearsalView {
    const { record, data } = current, path = this.path(data), end = Math.max(0, path.length - offset), start = Math.max(0, end - limit);
    return { id: record.id, revision: record.revision, matterId: data.matterId, state: data.state,
      ref: { id: record.id, revision: record.revision, matterId: data.matterId, activeTurnId: data.activeTurnId },
      intention: data.intention.text, boundaries: data.boundaries.map(boundary => boundary.text),
      counterpart: { label: data.counterpart.label, premise: data.counterpart.premise.text, premiseOrigin: data.counterpart.premise.origin },
      turns: path.slice(start, end).map(turn => ({ id: turn.id, actor: turn.actor, origin: turn.origin,
        text: turn.actor === 'you' ? codePointSlice(this.repo.evidence(handle, turn.source.eventId)!.text, turn.source.start, turn.source.end) : turn.text,
        alternativeCount: turn.actor === 'possible_other' ? data.turns.filter(candidate => candidate.actor === 'possible_other' && candidate.parentId === turn.parentId).length : 0 })),
      aside: data.lastAside?.text || null, expression: this.expression(handle, data),
      coverage: { offset, total: path.length, nextOffset: start > 0 ? offset + limit : null },
      sourceBinding: record.sourceBinding!, updatedAt: data.updatedAt, meaning };
  }
  /** Recheck this owner at a model boundary without publishing another turn or
   * treating its private record as generic Work. */
  assertCurrent(handle: ScopeHandle, id: string, expectedRevision: number,
    context: Pick<RehearsalContext, 'sessionId' | 'allowCrossSession' | 'permits'>): WorkRecord {
    this.scope(handle);
    const current = this.current(handle, id, context);
    if (!current || current.record.revision !== expectedRevision)
      throw new HarnessError('rehearsal_source_changed', "This rehearsal or its original words changed. Recover the currently permitted round through its original entry.");
    return current.record;
  }
  /** Address/time context only, for an owner version already supplied in this
   * turn. The caller proves that adoption; this owner rechecks the exact
   * version and all original sources without inferring real event times. */
  activityTiming(handle: ScopeHandle, id: string, expectedRevision: number,
    context: Pick<RehearsalContext, 'sessionId' | 'allowCrossSession' | 'permits'> & { timeZone: string }) {
    this.scope(handle);
    const current = this.current(handle, id, context);
    if (!current || current.record.revision !== expectedRevision)
      throw new HarnessError('rehearsal_source_changed', "The rehearsal revision or original words changed. Old references did not establish a new current timestamp.");
    const { record, data } = current;
    const refs = this.refs(data).map(ref => {
      const event = this.repo.evidence(handle, ref.eventId);
      if (!event || event.contentVersion !== ref.contentVersion || !Number.isFinite(Date.parse(event.receivedAt)))
        throw new HarnessError('rehearsal_source_changed', "An original-statement time in this rehearsal cannot currently be verified.");
      return { ...address(ref), receivedAt: event.receivedAt };
    });
    if (!refs.length || !Number.isFinite(Date.parse(data.createdAt)) || !Number.isFinite(Date.parse(data.updatedAt)))
      throw new HarnessError('rehearsal_timing_unknown', "The rehearsal time boundaries cannot be verified. Reconnect the original read entry without guessing dates.");
    const received = refs.map(ref => Date.parse(ref.receivedAt));
    const window = { from: new Date(Math.min(...received)).toISOString(),
      before: new Date(Math.max(...received) + 1).toISOString(), timeZone: context.timeZone };
    return { activity: 'relationship_rehearsal' as const, actualExchange: false as const,
      reference: { id: record.id, revision: record.revision, matterId: data.matterId, activeTurnId: data.activeTurnId },
      ownerCreatedAt: data.createdAt, ownerUpdatedAt: data.updatedAt,
      sourceReceived: { from: new Date(Math.min(...received)).toISOString(),
        beforeInclusive: new Date(Math.max(...received)).toISOString(), refs },
      reviewNavigation: { kind: 'source_received_window' as const, window, sourceRefs: refs.map(address),
        use: { tool: 'write_reflective_letter' as const, arguments: { operation: 'begin' as const, window } },
        meaning: "Copy use.arguments and add currentQuote from the real current letter request. This locates only the verified original statements' receipt interval; before is exclusive. It is not whole-window reading permission, an event-occurrence period, or continuous practice duration. Check purpose independently and cite actually read originals for each letter experience." },
      meaning: "These are actual original-receipt and rehearsal creation/update times, not event times, continuous practice duration, or permission to read the whole interval. Practice is not external communication. Determine a letter window and each experience source independently." };
  }
  read(handle: ScopeHandle, context: Pick<RehearsalContext, 'sessionId' | 'allowCrossSession' | 'permits'>, raw: z.infer<typeof rehearsalReadInput>) {
    const scope = this.scope(handle);
    const input = rehearsalReadInput.parse(raw), current = this.current(handle, input.id, context);
    if (!current) {
      const metadata = !scope.child && scope.grants.includes('work:write') ? this.repo.sourcedWorkMetadata(handle, input.id) : undefined;
      let known = !!metadata && metadata.kind === 'plan' && metadata.type === 'relationship_rehearsal'
        && typeof metadata.matterId === 'string' && metadata.id === this.idFor(metadata.matterId);
      if (known && !context.allowCrossSession) {
        try { this.referenceIdentity(handle, context.sessionId, { kind: 'reference', ref: { id: metadata!.id,
          revision: metadata!.revision, matterId: metadata!.matterId!, activeTurnId: null } }); }
        catch (error) { if (!(error instanceof HarnessError)) throw error; known = false; }
      }
      return { status: 'not_available' as const, view: null, records: [] as WorkRecord[],
        ...(known ? { control: { id: metadata!.id, revision: metadata!.revision, matterId: metadata!.matterId,
          sourceUnreadable: true, allowed: ['pause', 'close'], meaning: "Only close this item under the actual current stopping request. Do not restore original text, simulation, continuation state, or notifications." } } : {}),
        meaning: "This rehearsal or its original words cannot be expanded now. No old simulated copy was restored." };
    }
    if (input.expectedRevision !== undefined && current.record.revision !== input.expectedRevision)
      throw new HarnessError('revision_conflict', "This round moved forward. Reconnect its current revision.");
    return { status: 'fresh' as const, view: this.project(handle, current, input.offset || 0, input.limit || 16), records: [current.record] };
  }
}
