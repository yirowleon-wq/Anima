import { createHash } from 'node:crypto';
import * as z from 'zod';
import { HarnessError, workSourceBindingSchema, workSourceRefSchema, type EffectAction, type EffectReceipt, type ScopeHandle, type WorkRecord, type WorkSourceRef, type WorkSourceBinding } from '../../shared/harness';
import type { Action } from '../../shared/types';
import type { KernelRepository } from '../storage/repository';
import type { WorkService } from './work';
import { canonical, codePointSlice } from './semantics';
import { PlanningApplicationService, planningPlanRefSchema } from '../actions/planning-application';
import { calendarPlanFingerprint } from '../actions/planning-draft';
import { planningIntentSpecSchema, type PlanningIntentSpec, type PlanningHostContext, type PlanningIntentRef, type PlanningAttemptRecord, type PlanningAttemptBasis,
  type PlanningActionLink, type PlanningAdoptionInput, type PlanningManifest } from '../actions/planning-intent-contract';
import { normalizePlanningIntentSpec, projectPlanningAdoption, materializePlanningIntent } from '../actions/planning-intent-ledger';
import type { PlanningCampusConstraints } from '../actions/planning-campus';

const source = workSourceRefSchema.safeExtend({ quote: z.string().min(1).max(4000) });
const common = { source, supports: z.array(source).max(16).optional() };
const existing = { id: z.string().min(1).max(160), expectedRevision: z.number().int().positive() };
export const managePlanningIntentInput = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('keep'), planId: z.string().uuid(), ...common }).strict(),
  z.object({ operation: z.literal('update'), ...existing, planId: z.string().uuid(), ...common }).strict(),
  z.object({ operation: z.enum(['pause', 'resume', 'retire']), ...existing, ...common }).strict(),
]);
export const planningIntentReadInput = z.object({ id: z.string().min(1).max(160), expectedRevision: z.number().int().positive().optional(), sessionId: z.string().min(1).max(160).optional() }).strict();
export const planningIntentReplanInput = z.object(existing).strict();
export const planningIntentPageInput = z.object({ query: z.string().max(300).optional(), sessionId: z.string().min(1).max(160).optional(),
  relatedTo: z.string().min(1).max(160).optional(), statuses: z.array(z.enum(['active', 'paused', 'retired'])).min(1).max(3).optional(),
  offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(20).optional() }).strict();
export interface PlanningIntentSessionContext {
  currentEventIds: string[]; matterId?: string; sessionId?: string;
  /** Internal host verdict after independent delegation review; never model tool arguments. */
  verification?: { allowed: boolean; proposalDigest: string; basis: { id: string; quote: string }[]; dependentSourceIds?: string[] };
}
const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const data = (value: unknown): WorkRecord['data'] => JSON.parse(JSON.stringify(value));
const refsOf = (values: WorkSourceRef[]) => [...new Map(values.map(value => {
  const { eventId, contentVersion, start, end } = value;
  const ref = workSourceRefSchema.parse({ eventId, contentVersion, start, end }); return [canonical(ref), ref];
})).values()].sort((a, b) => canonical(a).localeCompare(canonical(b)));
const meaning = "This intent retains an original-source-supported task interpretation, time scope, workload, and method defaults for later discussion. It records how the matter was understood then, not a personal preference, current reality, or new calendar-execution approval. Original sources still govern current readability. Adoption records and the calendar retain their own real states; scheduled work is not automatically completed. Replanning deducts each verifiably still-retained scheduled unit of net work once from the original scope and budget, preserving setup, cleanup, rest, travel, and protected time. Missing source or progress proof returns a concrete gap. New planId and short tickets bind this simulation; later adoption follows existing authorization and stepwise saving checks. Recovering an intent restores neither old tickets nor approvals. Judge how to continue useful help or discuss unresolved conditions in the current situation.";

/** One source-bound WorkRecord owns the static intention. Tickets and actual
 * action/receipt/calendar facts retain their existing owners. */
export class PlanningIntentService {
  constructor(readonly repo: KernelRepository, readonly work: WorkService, readonly planning: PlanningApplicationService) {
    repo.bindPlanningAttemptVerifier((handle, intentId, basis) => this.assertAttemptBasis(handle, intentId, basis));
    planning.setIntentValidator((scope, context) => {
      const handle = this.work.policy.hostScope({ currentEventIds: scope.currentEventIds, purposes: scope.purposes });
      const current = this.work.policy.validate(handle);
      if (scope.principalId !== current.principalId || scope.workspaceId !== current.workspaceId || scope.subjectId !== current.subjectId
        || scope.worldId !== 'real' || scope.audience !== 'self' || scope.privacyEpoch !== current.privacyEpoch || scope.policyRevision !== current.policyRevision)
        throw new HarnessError('planning_intent_scope', "This planning intent belongs to another data owner.");
      // Rebuild only a narrower current read handle; no stored scope is revived.
      const narrowed = this.work.policy.narrow(handle, { sources: current.sources.filter(id => scope.sources.includes(id)),
        currentEventIds: current.currentEventIds.filter(id => scope.currentEventIds.includes(id)),
        grants: current.grants.filter(id => scope.grants.includes(id)), purposes: current.purposes.filter(id => scope.purposes.includes(id)) });
      this.assertIntentReference(narrowed, context.intent);
      this.assertAttemptBasis(narrowed, context.intent.id, context.attemptBasis);
    });
  }
  private scope(handle: ScopeHandle, calendar = false, write = false) {
    const scope = this.work.policy.require(handle, write ? 'work:write' : 'evidence:read');
    if (scope.child && (calendar || write) || scope.worldId !== 'real' || scope.subjectId !== scope.principalId || scope.audience !== 'self'
      || calendar && (!scope.sources.includes('local-agenda') || scope.retention === 'session_only')
      || write && (scope.retention !== 'purpose_scoped' || !scope.sources.includes('work:self')))
      throw new HarnessError('planning_intent_scope', "Planning intent needs the person's current valid real-world business scope.");
    return scope;
  }
  private record(handle: ScopeHandle, id: string, revision?: number, sessionId?: string) {
    this.scope(handle);
    const record = sessionId ? this.repo.workData(handle, ['planning_intent'], { id, sessionId, limit: 1 })[0] : this.repo.work(handle, 'plan', id)[0];
    if (!record || record.data.type !== 'planning_intent' || !record.sourceBinding)
      throw new HarnessError('planning_intent_missing', "This planning intent is not currently readable.");
    if (revision !== undefined && record.revision !== revision) throw new HarnessError('revision_conflict', "This planning intent updated; the request targets an old revision. A currently readable revision can support continuation.");
    const spec = planningIntentSpecSchema.parse(record.data.spec), specBasis = z.array(workSourceRefSchema).min(1).max(32).parse(record.data.specBasis);
    if (typeof record.data.specDigest !== 'string') throw new HarnessError('planning_intent_invalid', "This intent lacks a verifiable specification identity.");
    if (hash({ spec, refs: specBasis }) !== record.data.specDigest || specBasis.some(ref => !record.sourceBinding!.refs.some(bound => canonical(bound) === canonical(ref))))
      throw new HarnessError('planning_intent_invalid', "The intent specification does not match its original evidence identity.");
    return record;
  }
  private reference(record: WorkRecord): PlanningIntentRef {
    return { id: record.id, revision: record.revision, specDigest: String(record.data.specDigest) };
  }
  private assertIntentReference(handle: ScopeHandle, ref: PlanningIntentRef) {
    const record = this.record(handle, ref.id, ref.revision);
    if (record.status !== 'active' || record.data.specDigest !== ref.specDigest)
      throw new HarnessError('planning_intent_changed', "The original planning intent was parked, stopped, or changed. The old plan cannot be adopted further.");
    this.repo.readWorkSources(handle, record);
    return record;
  }
  private checkSources(handle: ScopeHandle, args: z.infer<typeof managePlanningIntentInput>, session: PlanningIntentSessionContext) {
    const scope = this.scope(handle, false, true);
    if (!session.currentEventIds.includes(args.source.eventId) || !scope.currentEventIds.includes(args.source.eventId))
      throw new HarnessError('planning_intent_current_source', "Retaining or changing this intent lacks current original-user support. Old content and the proposal itself do not create a request.");
    for (const [index, ref] of [args.source, ...(args.supports || [])].entries()) {
      const event = this.repo.evidence(handle, ref.eventId);
      if (!event || (index === 0 ? event.speaker !== 'user' || event.authority !== 'user_statement' : !['user', 'external'].includes(event.speaker)) || event.ownerId !== scope.principalId
        || event.subjectId !== scope.subjectId || event.worldId !== scope.worldId || event.contentVersion !== ref.contentVersion
        || codePointSlice(event.text, ref.start, ref.end) !== ref.quote)
        throw new HarnessError('unsupported_evidence', "The planning intent's original revision or exact range cannot be verified.");
    }
    return refsOf([args.source, ...(args.supports || [])]);
  }
  private assertBoundSources(sourceIds: string[], binding: Pick<WorkSourceBinding, 'sourceIds'>) {
    if (sourceIds.some(id => !['local-agenda', 'user-declared', 'current'].includes(id) && !binding.sourceIds.includes(id)))
      throw new HarnessError('planning_intent_unbound_source', "An actual source used by this plan lacks an exact currently usable supporting fragment. Its derived fields were not retained.");
  }
  private dependencyBinding(preview: { operation: string; binding: WorkSourceBinding; existingSpecSourceIds?: string[] }) {
    return { sourceIds: [...new Set([...preview.binding.sourceIds, ...(preview.operation === 'resume' ? preview.existingSpecSourceIds || [] : [])])] };
  }
  private sourceBoundSpec(handle: ScopeHandle, spec: PlanningIntentSpec, binding: WorkSourceBinding, manifest: PlanningManifest) {
    const scope = this.scope(handle), external = new Set(binding.sourceIds.filter(id => !['history:self', 'current', 'user-declared', 'local-agenda'].includes(id)));
    for (const ref of binding.refs) {
      const row = this.repo.db.prepare("SELECT source,json_extract(payload,'$.speaker') speaker FROM h_evidence WHERE id=? AND owner=? AND workspace=? AND version=?")
        .get(ref.eventId, scope.principalId, scope.workspaceId, ref.contentVersion);
      if (row?.speaker === 'external') external.add(String(row.source));
    }
    const requiredRefresh = [...spec.requiredRefresh];
    for (const sourceId of external) if (!requiredRefresh.some(value => value.kind === 'source_coverage' && value.sourceId === sourceId))
      requiredRefresh.push({ kind: 'source_coverage', sourceId, sourceVersion: manifest.sourceVersions.find(value => value.sourceId === sourceId)?.sourceVersion ?? null });
    return planningIntentSpecSchema.parse({ ...spec, requiredRefresh });
  }
  previewManage(handle: ScopeHandle, raw: unknown, session: PlanningIntentSessionContext) {
    const args = managePlanningIntentInput.parse(raw), refs = this.checkSources(handle, args, session);
    const binding = this.repo.resolveWorkSourceBinding(handle, refs);
    const stopping = args.operation === 'pause' || args.operation === 'retire';
    const metadata = stopping ? this.repo.sourcedWorkMetadata(handle, args.id) : undefined;
    if (stopping && (!metadata || metadata.kind !== 'plan' || metadata.type !== 'planning_intent'))
      throw new HarnessError('planning_intent_missing', "This planning intent is not currently manageable.");
    if (metadata && 'expectedRevision' in args && metadata.revision !== args.expectedRevision)
      throw new HarnessError('revision_conflict', "The intent updated and the targeted revision is no longer current. It was not changed through the old revision.");
    const old = args.operation === 'keep' || stopping ? undefined : this.record(handle, args.id, args.expectedRevision);
    if (args.operation === 'update' && old!.status !== 'active')
      throw new HarnessError('planning_intent_inactive', "This intent is not active for continued planning. A parked intent may resume under current original words; a stopped intent retains its stopped result, and a new one needs a clear present wish. Its specification was not changed.");
    const exported = args.operation === 'keep' || args.operation === 'update'
      ? this.planning.exportTicket(this.scope(handle, true), args.planId) : undefined;
    const spec = exported && this.sourceBoundSpec(handle, normalizePlanningIntentSpec(exported.input), binding, exported.manifest);
    if (exported && spec) {
      this.assertBoundSources(exported.manifest.sourceVersions.map(version => version.sourceId), binding);
      const expectedId = old?.id || 'planning-intent:' + hash({ source: binding.refs, planId: exported.planId });
      const existingRecord = old || this.repo.work(handle, 'plan', expectedId)[0];
      const digest = hash({ spec, refs: binding.refs });
      if (exported.intentRef && (exported.intentRef.id !== expectedId || exported.intentRef.specDigest !== digest
        || exported.intentRef.revision !== (args.operation === 'update' ? old!.revision + 1 : existingRecord?.revision || 1)))
        throw new HarnessError('planning_intent_binding', "This ticket belongs to another intent or revision and cannot be rebound for retention.");
      const scope = this.scope(handle, true);
      const prepared = this.repo.db.prepare(`SELECT 1 FROM h_actions WHERE owner=? AND workspace=? AND subject=? AND world=?
        AND json_extract(payload,'$.arguments.planRef.planId')=? LIMIT 1`).get(scope.principalId, scope.workspaceId, scope.subjectId, scope.worldId, exported.planId);
      if (!exported.intentRef && (exported.hasPreparations || prepared))
        throw new HarnessError('planning_intent_already_prepared', "This simulation already prepared actions under their original evidence. Old actions were not retroactively assigned to a retained intent. Current intent and calendar can support a new simulation and retention.");
    }
    if (session.matterId && !stopping) {
      const matter = this.repo.work(handle, 'episode', session.matterId)[0];
      if (!matter || matter.data.type !== 'collaboration_frame') throw new HarnessError('planning_intent_matter', "The linked matter is not a currently readable shared matter.");
    }
    const target = metadata ? { ...metadata, contentAvailable: false as const }
      : old ? { id: old.id, revision: old.revision, title: old.title, status: old.status, contentAvailable: true as const } : undefined;
    const proposal = { operation: args.operation, target,
      ...(spec ? { hostProposal: { planId: exported!.planId, spec, interpretation: spec.interpretation,
        dependentSourceIds: [...new Set(exported!.manifest.sourceVersions.map(version => version.sourceId))] } } : {}),
      source: args.source, supports: args.supports || [], binding,
      existingSpecSourceIds: args.operation === 'resume' ? old!.sourceBinding!.sourceIds : [],
      matterId: stopping ? null : session.matterId || old?.data.matterId || null };
    return { ...proposal, digest: hash(proposal) };
  }
  manage(handle: ScopeHandle, raw: unknown, session: PlanningIntentSessionContext) {
    const args = managePlanningIntentInput.parse(raw), preview = this.previewManage(handle, args, session), verification = session.verification;
    if (!verification?.allowed || verification.proposalDigest !== preview.digest || !verification.basis.some(basis =>
      basis.id === args.source.eventId && basis.quote.length > 0 && args.source.quote.includes(basis.quote)))
      throw new HarnessError('planning_intent_not_delegated', "The current original words have not confirmed an explicit request for this retention or change.");
    this.assertBoundSources(verification.dependentSourceIds || [], this.dependencyBinding(preview));
    const now = this.repo.clock.now(), currentSource = this.repo.evidence(handle, args.source.eventId)!;
    if (session.sessionId && currentSource.sessionId !== session.sessionId) throw new HarnessError('planning_intent_session', "The intent evidence does not belong to the current session.");
    const sessionId = currentSource.sessionId;
    const lastTransition = { operation: args.operation, source: refsOf([args.source])[0], at: now,
      quoteSha256: createHash('sha256').update(args.source.quote).digest('hex') };
    if (args.operation === 'pause' || args.operation === 'retire') {
      const operation = args.operation;
      const transition = this.repo.write(() => {
        const checked = this.previewManage(handle, args, session);
        if (checked.digest !== preview.digest) throw new HarnessError('planning_intent_changed', "The matter revision changed during verification.");
        this.assertBoundSources(verification.dependentSourceIds || [], this.dependencyBinding(checked));
        return this.repo.transitionSourcedWork(handle, { id: args.id, expectedRevision: args.expectedRevision,
          status: operation === 'pause' ? 'paused' : 'retired', transition: { operation, source: refsOf([args.source])[0] } });
      });
      return { operation: args.operation, transition: { ...transition, contentAvailable: false as const }, sources: [],
        meaning: "This plan's management state changed under the current wish; transition gives the actual result. Only management-required readable metadata was used. Old specification bodies, sources, and calendar-execution approval were not restored. Continue according to the current matter." };
    }
    const record = this.repo.write(() => {
      // Recheck all real references inside the same short writer transaction.
      const checked = this.previewManage(handle, args, session);
      if (checked.digest !== preview.digest) throw new HarnessError('planning_intent_changed', "The intent or draft changed during verification.");
      this.assertBoundSources(verification.dependentSourceIds || [], this.dependencyBinding(checked));
      const old = args.operation === 'keep' ? undefined : this.record(handle, args.id, args.expectedRevision);
      let next: WorkRecord;
      if (args.operation === 'keep' || args.operation === 'update') {
        const spec = preview.hostProposal!.spec, refs = preview.binding.refs;
        const specDigest = hash({ spec, refs }), id = old?.id || 'planning-intent:' + hash({ source: refs, planId: args.planId });
        const prior = !old && this.repo.work(handle, 'plan', id)[0];
        if (prior) {
          if (prior.data.type !== 'planning_intent' || prior.data.specDigest !== specDigest) throw new HarnessError('idempotency_conflict', "The same retention evidence already has a different intent.");
          return prior;
        }
        const scope = this.scope(handle, false, true);
        const title = spec.request.tasks.map(task => task.title).slice(0, 2).join('、').slice(0, 160) || "Retained planning intent";
        next = old ? { ...old, revision: old.revision + 1, title, sourceBinding: preview.binding, evidenceIds: [...new Set(refs.map(ref => ref.eventId))],
          data: data({ type: 'planning_intent', contractVersion: 1, spec, specDigest, specBasis: refs, recordedAt: old.data.recordedAt || now, updatedAt: now,
            ...(preview.matterId ? { matterId: preview.matterId } : {}), sessionId,
            sessionIds: [...new Set([...(typeof old.data.sessionId === 'string' && old.data.sessionId ? [old.data.sessionId] : []),
              ...(Array.isArray(old.data.sessionIds) ? old.data.sessionIds : []), ...(sessionId ? [sessionId] : [])])], retainedFromPlanId: args.planId,
            lastTransition }) }
          : { id, kind: 'plan', ownerId: scope.principalId, workspaceId: scope.workspaceId, subjectId: scope.subjectId, worldId: scope.worldId,
            revision: 1, status: 'active', title,
            evidenceIds: [...new Set(refs.map(ref => ref.eventId))], sourceBinding: preview.binding,
            label: { purpose: scope.purposes[0], audience: scope.audience, retention: scope.retention, sensitivity: 'personal', infer: false },
            data: data({ type: 'planning_intent', contractVersion: 1, spec, specDigest, specBasis: refs, recordedAt: now, updatedAt: now, sessionId,
              sessionIds: sessionId ? [sessionId] : [], ...(preview.matterId ? { matterId: preview.matterId } : {}), retainedFromPlanId: args.planId,
              lastTransition }) };
      } else {
        if (old!.status !== 'paused')
          throw new HarnessError('planning_intent_state', "The current intent state does not match this transition and was not changed. Its readable state distinguishes active, parked, and stopped.");
        const binding = this.repo.resolveWorkSourceBinding(handle, z.array(workSourceRefSchema).min(1).max(32).parse(old!.data.specBasis));
        next = { ...old!, revision: old!.revision + 1, status: 'active',
          sourceBinding: binding, evidenceIds: [...new Set(binding.refs.map(ref => ref.eventId))], data: data({ ...old!.data, updatedAt: now, sessionId,
            sessionIds: [...new Set([...(typeof old!.data.sessionId === 'string' && old!.data.sessionId ? [old!.data.sessionId] : []),
              ...(Array.isArray(old!.data.sessionIds) ? old!.data.sessionIds : []), ...(sessionId ? [sessionId] : [])])],
            lastTransition }) };
      }
      if (Buffer.byteLength(canonical(next.data), 'utf8') > 160_000) throw new HarnessError('planning_intent_budget', "This intent exceeds the durable-content budget and was not saved.");
      return this.work.savePlanningIntent(handle, next, old?.revision);
    });
    if (args.operation === 'keep' || args.operation === 'update') {
      const exported = this.planning.exportTicket(this.scope(handle, true), args.planId);
      const context: PlanningHostContext = { intent: this.reference(record), allocationBasis: { calendarFingerprint: exported.manifest.calendarFingerprint, groupIds: [] },
        retained: { work: [], boundaries: [], scheduledTasks: [] }, attemptBasis: [] };
      this.planning.bindIntent(this.scope(handle, true), args.planId, context);
    }
    return { operation: args.operation, ...this.read(handle, { id: record.id, expectedRevision: record.revision }) };
  }
  page(handle: ScopeHandle, raw: unknown = {}) {
    this.scope(handle);
    const args = planningIntentPageInput.parse(raw), limit = args.limit || 8, offset = args.offset || 0;
    const records = this.repo.workData(handle, ['planning_intent'], { query: args.query, sessionId: args.sessionId, matterId: args.relatedTo,
      statuses: args.statuses || ['active'], offset, limit: limit + 1, respectSourceBindings: true });
    return { items: records.slice(0, limit).map(record => ({ id: record.id, revision: record.revision, title: record.title, status: record.status,
      sourceBinding: record.sourceBinding, matterId: record.data.matterId, specDigest: record.data.specDigest, updatedAt: record.data.updatedAt })),
      nextOffset: records.length > limit ? offset + limit : null,
      coverage: { complete: records.length <= limit, meaning: "This is one page of planning intents under current source, purpose, and filters. nextOffset continues. An empty page establishes no matching return on this page, not absence in other scopes or pages." } };
  }
  read(handle: ScopeHandle, raw: unknown) {
    const args: z.infer<typeof planningIntentReadInput> = typeof raw === 'string' ? { id: raw } : planningIntentReadInput.parse(raw);
    const record = this.record(handle, args.id, args.expectedRevision, args.sessionId), sources = this.repo.readWorkSources(handle, record);
    const scope = this.scope(handle);
    const adoptionEvidence = !scope.child && scope.retention !== 'session_only' && scope.sources.includes('local-agenda') ? this.adoption(handle, record, this.currentCalendar())
      : { status: 'not_checked' as const, reason: "The intent was read, but the current scope did not expand calendar and action adoption proof. Whether or how much was saved is unverified here." };
    return { record, sources, spec: planningIntentSpecSchema.parse(record.data.spec), specDigest: String(record.data.specDigest), adoptionEvidence, meaning };
  }
  async replanWithCampus(handle: ScopeHandle, raw: unknown, signal: AbortSignal) {
    const args = planningIntentReplanInput.parse(raw), record = this.record(handle, args.id, args.expectedRevision);
    const spec = planningIntentSpecSchema.parse(record.data.spec);
    if (record.status !== 'active') throw new HarnessError('planning_intent_inactive', "This intent is parked or stopped; planning did not continue. Current words may resume a parked intent. A stopped intent retains its stopped result.");
    const currentItems = this.currentCalendar(), adoption = this.adoption(handle, record, currentItems);
    if ('evidenceCoverage' in adoption || materializePlanningIntent(spec, adoption, { now: this.repo.clock.now() }).status !== 'ready')
      return this.replan(handle, args, currentItems);
    const campus = await this.planning.readCampus(this.scope(handle, true), spec.request.from, spec.request.to, signal);
    signal.throwIfAborted();
    return this.replan(handle, args, this.currentCalendar(), campus);
  }
  replan(handle: ScopeHandle, raw: unknown, currentItems: Action[], campus?: PlanningCampusConstraints | null) {
    this.scope(handle, true);
    const args = planningIntentReplanInput.parse(raw), record = this.record(handle, args.id, args.expectedRevision);
    if (record.status !== 'active') throw new HarnessError('planning_intent_inactive', "This intent is parked or stopped; planning did not continue. Current words may resume a parked intent. A stopped intent retains its stopped result.");
    const adoption = this.adoption(handle, record, currentItems), spec = planningIntentSpecSchema.parse(record.data.spec);
    if ('evidenceCoverage' in adoption) return { status: 'needs_review' as const, intent: { ...this.reference(record), sourceBinding: record.sourceBinding },
      record, sources: this.repo.readWorkSources(handle, record), adoptionEvidence: adoption, reasons: adoption.reasons, applied: false, meaning };
    const materialized = materializePlanningIntent(spec, adoption, { now: this.repo.clock.now() });
    const sources = this.repo.readWorkSources(handle, record), intent = { ...this.reference(record), sourceBinding: record.sourceBinding };
    if (materialized.status !== 'ready' || !materialized.request) return { status: materialized.status, intent, record, sources, adoptionEvidence: adoption,
      reasons: materialized.reasons, requiredRefresh: materialized.requiredRefresh, applied: false, meaning };
    const context: PlanningHostContext = { intent: this.reference(record), allocationBasis: { calendarFingerprint: adoption.calendarFingerprint,
      groupIds: materialized.retained.work.map(anchor => anchor.id) }, retained: materialized.retained, attemptBasis: adoption.attemptBasis };
    const result = this.planning.prepare(this.scope(handle, true), currentItems, materialized.request, context, campus);
    return { ...result, intent, record, sources, planningInput: materialized.request, adoptionEvidence: adoption, applied: false, meaning };
  }
  private currentCalendar(): Action[] { return this.repo.db.prepare('SELECT payload FROM agenda').all().map(row => JSON.parse(String(row.payload)) as Action); }
  private attemptBindingReadable(handle: ScopeHandle, raw: unknown) {
    try {
      const binding = workSourceBindingSchema.parse(typeof raw === 'string' ? JSON.parse(raw) : raw);
      return canonical(binding) === canonical(this.repo.resolveWorkSourceBinding(handle, binding.refs));
    } catch (error) {
      if (error instanceof HarnessError || error instanceof SyntaxError || error instanceof Error && error.name === 'ZodError') return false;
      throw error;
    }
  }
  /** Read-only source/proof check, shared by execution and derived material gates. */
  assertAttemptBasis(handle: ScopeHandle, intentId: string, basis: PlanningAttemptBasis[]) {
    this.scope(handle);
    for (const expected of basis) {
      const metadata = this.repo.db.prepare('SELECT intent_id,spec_digest,source_binding,redacted FROM h_planning_intent_attempts WHERE plan_id=?').get(expected.planId);
      if (expected.intentId !== intentId || !metadata || metadata.intent_id !== expected.intentId || metadata.spec_digest !== expected.specDigest
        || Number(metadata.redacted) !== 0 || !this.attemptBindingReadable(handle, metadata.source_binding)
        || canonical(JSON.parse(String(metadata.source_binding))) !== canonical(expected.sourceBinding))
        throw new HarnessError('planning_intent_adoption_changed', "Original adoption sources for this recomputation changed or cannot be verified. Old results no longer support further adoption. Current permitted sources and actual save results can support replanning.");
      const content = this.repo.db.prepare('SELECT manifest FROM h_planning_intent_attempts WHERE plan_id=? AND intent_id=? AND redacted=0').get(expected.planId, intentId);
      if (!content || hash(JSON.parse(String(content.manifest))) !== expected.manifestDigest)
        throw new HarnessError('planning_intent_adoption_changed', "Original adoption proof changed. The current ticket no longer supports adoption; actual saved records can establish present arrangements.");
    }
  }
  private adoption(handle: ScopeHandle, record: WorkRecord, calendar: Action[]) {
    this.scope(handle, true); this.repo.readWorkSources(handle, record);
    // The parent's current binding cannot authorize an earlier specification.
    // Inspect only opaque metadata until every attempt's own sources pass.
    const rows = this.repo.db.prepare('SELECT plan_id,spec_digest,source_binding,redacted FROM h_planning_intent_attempts WHERE intent_id=? ORDER BY created_at,plan_id').all(record.id);
    if (rows.some(row => Number(row.redacted) !== 0 || !this.attemptBindingReadable(handle, row.source_binding)))
      return { status: 'needs_review' as const, evidenceCoverage: 'unavailable' as const, observations: [], allocatedMinutes: null,
        reasons: ["Some old adoption proof is outside scope or unverifiable, so saved workload remains unknown. Permitted sources, original receipts, and the calendar establish their own outcomes. Missing proof does not establish zero saved work."],
        calendarFingerprint: calendarPlanFingerprint(calendar) };
    const attemptBasis: PlanningAttemptBasis[] = [];
    const attempts: PlanningAttemptRecord[] = rows.map(row => {
      const content = this.repo.db.prepare('SELECT manifest,created_at FROM h_planning_intent_attempts WHERE plan_id=? AND intent_id=? AND redacted=0').get(String(row.plan_id), record.id);
      if (!content) throw new HarnessError('planning_intent_changed', "Planning adoption evidence changed during reading.");
      const manifest = JSON.parse(String(content.manifest)) as PlanningManifest;
      attemptBasis.push({ planId: String(row.plan_id), intentId: record.id, specDigest: String(row.spec_digest),
        manifestDigest: hash(manifest), sourceBinding: workSourceBindingSchema.parse(JSON.parse(String(row.source_binding))) });
      return { planId: String(row.plan_id), intentId: record.id, specDigest: String(row.spec_digest), manifest, createdAt: String(content.created_at) };
    });
    const links: PlanningActionLink[] = attempts.flatMap(attempt => this.repo.db.prepare('SELECT * FROM h_planning_intent_action_links WHERE plan_id=?').all(attempt.planId)
      .map(row => ({ planId: attempt.planId, blockId: String(row.block_id), actionId: String(row.action_id), actionRevision: Number(row.action_revision), actionDigest: String(row.action_digest) })));
    const ids = [...new Set(links.map(link => link.actionId))];
    const scope = this.scope(handle, true), actions: EffectAction[] = [], actionAttempts: PlanningAdoptionInput['actionAttempts'] = [], receipts: EffectReceipt[] = [];
    for (const id of ids) {
      const row = this.repo.db.prepare('SELECT payload FROM h_actions WHERE id=? AND owner=? AND workspace=? AND subject=? AND world=?').get(id, scope.principalId, scope.workspaceId, scope.subjectId, scope.worldId);
      if (!row) continue;
      actions.push(JSON.parse(String(row.payload)) as EffectAction);
      actionAttempts.push(...this.repo.db.prepare('SELECT id,action_id,idempotency_key,status FROM h_attempts WHERE action_id=?').all(id)
        .map(attempt => ({ id: String(attempt.id), actionId: id, idempotencyKey: String(attempt.idempotency_key), status: String(attempt.status) })));
      receipts.push(...this.repo.db.prepare('SELECT payload FROM h_receipts WHERE action_id=?').all(id).map(receipt => JSON.parse(String(receipt.payload)) as EffectReceipt));
    }
    const calendarRevisions: Record<string, number> = {};
    for (const item of calendar) calendarRevisions[item.id] = Number(this.repo.db.prepare('SELECT max(revision) revision FROM h_calendar_versions WHERE agenda_id=?').get(item.id)?.revision || item.revision || 1);
    return { ...projectPlanningAdoption({ intentId: record.id, specDigest: String(record.data.specDigest), spec: planningIntentSpecSchema.parse(record.data.spec),
      attempts, links, actions, actionAttempts, receipts, calendar, calendarRevisions, now: this.repo.clock.now() }), attemptBasis };
  }
  onPreparedAction(handle: ScopeHandle, action: EffectAction) {
    const old = this.linksForAction(action.id), parsed = planningPlanRefSchema.safeParse(action.arguments.planRef);
    if (old.length && (!parsed.success || old.some(link => link.planId !== parsed.data.planId || link.blockId !== parsed.data.blockId)))
      throw new HarnessError('planning_intent_detached_action', "An action already linked to a planning intent cannot remove or replace its original plan reference.");
    if (old.some(link => link.actionRevision === action.revision && link.actionDigest !== action.digest))
      throw new HarnessError('planning_intent_action_changed', "The same action revision already has a different complete argument identity.");
    if (!parsed.success) return;
    // Ordinary planner tickets keep their original effect-phase checks. This
    // hook owns only tickets explicitly bound to a persistent intention.
    if (!old.length && !this.planning.hasIntentBinding(parsed.data.planId)) return;
    const binding = this.planning.preparationBinding(this.scope(handle, true), parsed.data, action.arguments);
    this.planning.markPrepared(this.scope(handle, true), parsed.data.planId);
    if (!binding) { if (old.length) throw new HarnessError('planning_intent_ticket_missing', "The original plan link is unavailable. Old action preparation cannot be restored."); return; }
    const ref = binding.intentRef;
    this.assertActionOwner(handle, action);
    const intentRecord = this.assertIntentReference(handle, ref), sourceBinding = intentRecord.sourceBinding!;
    const manifest = binding.manifest, unit = manifest.units.find(value => value.blockId === parsed.data.blockId);
    if (!unit || hash(action.arguments) !== unit.argumentsDigest || action.capability !== 'local.agenda.save')
      throw new HarnessError('planning_intent_parameters', "Action arguments do not match the complete save unit of the host plan.");
    if (!this.repo.db.isTransaction) throw new HarnessError('planning_intent_transaction', "Plan-adoption linkage must share the action-preparation transaction.");
    const prior = this.repo.db.prepare('SELECT intent_id,spec_digest,source_binding,redacted FROM h_planning_intent_attempts WHERE plan_id=?').get(parsed.data.planId);
    if (prior && (prior.intent_id !== ref.id || prior.spec_digest !== ref.specDigest || Number(prior.redacted) !== 0
      || !this.attemptBindingReadable(handle, prior.source_binding) || canonical(JSON.parse(String(prior.source_binding))) !== canonical(sourceBinding)))
      throw new HarnessError('planning_intent_manifest_conflict', "This plan already has different durable ownership or a different host manifest.");
    if (prior) {
      const content = this.repo.db.prepare('SELECT manifest FROM h_planning_intent_attempts WHERE plan_id=? AND redacted=0').get(parsed.data.planId);
      if (!content || canonical(JSON.parse(String(content.manifest))) !== canonical(manifest))
        throw new HarnessError('planning_intent_manifest_conflict', "This plan already has a different host manifest.");
    } else this.repo.db.prepare('INSERT INTO h_planning_intent_attempts(plan_id,intent_id,spec_digest,manifest,created_at,source_binding,redacted) VALUES(?,?,?,?,?,?,0)')
      .run(parsed.data.planId, ref.id, ref.specDigest, JSON.stringify(manifest), this.repo.clock.now(), JSON.stringify(sourceBinding));
    this.repo.db.prepare('INSERT OR IGNORE INTO h_planning_intent_action_links(plan_id,block_id,action_id,action_revision,action_digest) VALUES(?,?,?,?,?)')
      .run(parsed.data.planId, parsed.data.blockId, action.id, action.revision, action.digest);
  }
  private linksForAction(id: string): PlanningActionLink[] {
    return this.repo.db.prepare('SELECT * FROM h_planning_intent_action_links WHERE action_id=?').all(id).map(row => ({ planId: String(row.plan_id),
      blockId: String(row.block_id), actionId: id, actionRevision: Number(row.action_revision), actionDigest: String(row.action_digest) }));
  }
  private assertActionOwner(handle: ScopeHandle, action: EffectAction) {
    const scope = this.work.policy.validate(handle);
    if (action.ownerId !== scope.principalId || action.workspaceId !== scope.workspaceId || action.subjectId !== scope.subjectId
      || action.worldId !== scope.worldId || action.audience !== scope.audience)
      throw new HarnessError('planning_intent_scope', "The action is outside the current planning source scope.");
    const current = this.repo.db.prepare('SELECT revision,payload FROM h_actions WHERE id=? AND owner=? AND workspace=?').get(action.id, scope.principalId, scope.workspaceId);
    if (!current || Number(current.revision) !== action.revision || (JSON.parse(String(current.payload)) as EffectAction).digest !== action.digest)
      throw new HarnessError('planning_intent_action_changed', "The actual prepared action identity or revision changed.");
  }
  assertActionCurrent(handle: ScopeHandle, action: EffectAction) {
    const links = this.linksForAction(action.id);
    if (!links.length) return;
    this.scope(handle, true);
    this.assertActionOwner(handle, action);
    const parsed = planningPlanRefSchema.safeParse(action.arguments.planRef);
    const link = parsed.success && links.find(value => value.planId === parsed.data.planId && value.blockId === parsed.data.blockId
      && value.actionRevision === action.revision && value.actionDigest === action.digest);
    if (!link) throw new HarnessError('planning_intent_detached_action', "The current action revision lacks its original plan link and cannot execute from old metadata.");
    const metadata = this.repo.db.prepare('SELECT intent_id,spec_digest,source_binding,redacted FROM h_planning_intent_attempts WHERE plan_id=?').get(link.planId);
    if (!metadata || Number(metadata.redacted) !== 0 || !this.attemptBindingReadable(handle, metadata.source_binding))
      throw new HarnessError('planning_intent_source_unavailable', "Original plan-adoption evidence cannot be verified. Old arguments cannot execute.");
    const binding = this.planning.preparationBinding(this.scope(handle, true), action.arguments.planRef, action.arguments), ref = binding?.intentRef;
    if (!metadata || !ref || metadata.intent_id !== ref.id || metadata.spec_digest !== ref.specDigest)
      throw new HarnessError('planning_intent_ticket_missing', "The original planning ticket is unavailable and no longer supports old action arguments. Current intent, permitted sources, and calendar can still support a new simulation.");
    this.assertIntentReference(handle, ref);
  }
}
