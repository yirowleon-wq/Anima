import { randomUUID, createHash } from 'node:crypto';
import * as z from 'zod';
import { HarnessError, workSourceRefSchema, type EvidenceEvent, type ScopeHandle, type WorkRecord, type WorkSourceRef } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import type { PolicyKernel } from './policy';
import { codePointSlice, canonical } from './semantics';
import type { WorkflowRequirement, WorkflowSkill } from './skills';
import { personalMethodUsageSchema, type PersonalMethodUsage } from '../../shared/companion-continuity';
import { methodAssistanceInputSchema, methodWorkAnchorInputSchema, personalMethodConditionsSchema,
  personalMethodSourcesSchema, type PersonalMethodSources, type PersonalMethodGuidanceReference } from '../../shared/personal-method';
import { methodWorkHelpInputSchema } from '../../shared/method-work-help';
import type { MethodWorkHelpOwner, PreparedMethodWorkHelp } from './method-work-help';

const refSchema = z.object({ eventId: z.string().min(1).max(160), contentVersion: z.number().int().positive(),
  start: z.number().int().nonnegative(), end: z.number().int().positive(), quote: z.string().min(1).max(18000) }).strict();
const authorizationSchema = refSchema.extend({ quote: z.string().min(1).max(2000) });
const requirementSchema = z.object({ kind: z.enum(['tool', 'capability']), name: z.string().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_.:-]*$/),
  purpose: z.string().min(1).max(500), optional: z.boolean().optional(), coverageNote: z.string().max(600).optional() }).strict();
const methodSchema = z.object({ name: z.string().min(1).max(120), description: z.string().min(1).max(1200),
  instructions: z.string().min(1).max(18000), requirements: z.array(requirementSchema).max(24),
  usage: personalMethodUsageSchema.default('work').describe("work saves a way of doing work; conversation saves a way of relating the person wants to reuse. requirements may be empty for a method using text alone."),
  conditions: personalMethodConditionsSchema.optional().describe("Begin with the help that actually mattered: when it fits and how to adapt when they want another approach today. Organize it yourself; they can speak naturally.") }).strict()
  .refine(value => new Set(value.requirements.map(item => item.kind + ':' + item.name)).size === value.requirements.length, "Declare each method requirement only once.");
const instructionEditSchema = z.object({ start: z.number().int().nonnegative(), end: z.number().int().positive(),
  quote: z.string().min(1).max(18000), text: z.string().max(18000),
}).strict().refine(value => value.end > value.start, "Identify the original sentences to change first.");
// An amendment names only the parts that changed. In particular, omitting
// conditions or requirements cannot erase them or reset the method's usage.
const methodRevisionSchema = z.object({
  name: methodSchema.shape.name.optional(), description: methodSchema.shape.description.optional(),
  instructions: methodSchema.shape.instructions.optional().describe("For a full instruction rewrite, provide the complete new body. Use instructionEdits for a few sentences, preserving the rest."),
  requirements: methodSchema.shape.requirements.optional(),
  instructionEdits: z.array(instructionEditSchema).min(1).max(12).optional()
    .describe("For a local instruction change, identify original text in current instructions and its replacement. Other text stays. start/end are zero-based Unicode code points (😀 counts as one), with exclusive end. All edits address the same pre-edit revision. Empty text deletes that range."),
  usage: personalMethodUsageSchema.optional(), conditions: personalMethodConditionsSchema.partial().optional(),
}).strict().refine(value => Object.entries(value).some(([key, part]) => part !== undefined
  && (key !== 'conditions' || Object.values(part).some(field => field !== undefined))), "Specify the part to change; other content remains.")
  .refine(value => value.instructions === undefined || value.instructionEdits === undefined, "Choose either a complete rewrite or local sentence edits so the change is unambiguous.")
  .describe("Supply only the intended local changes. conditions may include a single field; instructionEdits replaces selected sentences while preserving the rest. Supply the complete method for a full rewrite.");
const methodId = z.string().regex(/^personal:[0-9a-f-]{36}$/);
export const personalMethodInput = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('save'), method: methodSchema, source: authorizationSchema, supports: z.array(refSchema).max(16).default([]),
    assistance: z.array(methodAssistanceInputSchema).max(4).default([]), workAssistance: z.array(methodWorkHelpInputSchema).max(4).default([]),
    workAnchors: z.array(methodWorkAnchorInputSchema).max(4).default([]) }).strict(),
  z.object({ operation: z.literal('revise'), id: methodId, expectedRevision: z.number().int().positive(),
    revisionMode: z.enum(['amend', 'replace']).default('amend').describe("amend changes only specified parts; replace rewrites the full method. Handle that distinction yourself without making the person fill a form."),
    method: methodRevisionSchema, source: authorizationSchema, supports: z.array(refSchema).max(16).default([]),
    assistance: z.array(methodAssistanceInputSchema).max(4).default([]), workAssistance: z.array(methodWorkHelpInputSchema).max(4).default([]),
    workAnchors: z.array(methodWorkAnchorInputSchema).max(4).default([]) }).strict(),
  z.object({ operation: z.literal('disable'), id: methodId, expectedRevision: z.number().int().positive(), source: authorizationSchema }).strict(),
]);
type MethodInput = z.infer<typeof personalMethodInput>;
interface MethodSession { events: EvidenceEvent[]; ephemeral: boolean; restrictToSessionId?: string;
  permits?: (ref: WorkSourceRef) => boolean }
type MethodReadContext = Pick<MethodSession, 'restrictToSessionId' | 'permits'>;
type PersonalMethodCatalogEntry = WorkflowSkill & { usage: PersonalMethodUsage; personalMethod: PersonalMethodGuidanceReference };
const ownershipReceiptSchema = z.object({ version: z.literal(1), ownerId: z.string(), workspaceId: z.string(),
  methodId, methodRevision: z.number().int().positive(), operation: z.enum(['save', 'revise', 'disable']),
  source: workSourceRefSchema, sourceQuoteSha256: z.string().regex(/^[a-f0-9]{64}$/),
  changedFields: z.array(z.string().min(1).max(100)).max(12), reviewDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  legacyOperationId: z.string().regex(/^personal-method:[a-f0-9]{64}$/).optional(),
  recordedAt: z.string().datetime().optional(),
}).strict().refine(value => !!value.reviewDigest !== !!value.legacyOperationId);
export interface PersonalMethodOwnership {
  receiptId: string; methodId: string; methodRevision: number; operation: 'save' | 'revise' | 'disable';
  source: WorkSourceRef; changedFields: string[]; reviewDigest?: string; legacyOperationId?: string; recordedAt?: string;
}

/** User-chosen procedural text in the existing work store. No executable plugin,
 * account permission, user fact, scheduler or independent agent is installed. */
export class PersonalMethodService {
  workHelpOwner?: MethodWorkHelpOwner;
  constructor(readonly repo: KernelRepository, readonly policy: PolicyKernel) {
    repo.verifyPersonalMethodSources = (handle, raw) => this.sourcesReadable(handle, raw);
  }
  get revision() { return this.repo.getMeta<number>('personal_methods_revision', 0); }

  /** Existing operation receipts identify an accepted procedural choice. They
   * contain no method prose and grant no access to an old method body. */
  ownership(handle: ScopeHandle, refs: readonly WorkSourceRef[]): PersonalMethodOwnership[] {
    const scope = this.policy.validate(handle);
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.grants.includes('evidence:read') || !refs.length || this.repo.hasFence('work:self')) return [];
    const eventIds = [...new Set(refs.map(ref => ref.eventId))];
    const rows = this.repo.db.prepare(`SELECT id,result FROM h_operations WHERE kind='personal_method_choice'
      AND json_extract(result,'$.ownerId')=? AND json_extract(result,'$.workspaceId')=?
      AND json_extract(result,'$.source.eventId') IN (SELECT value FROM json_each(?))`)
      .all(scope.principalId, scope.workspaceId, JSON.stringify(eventIds));
    return rows.flatMap(row => {
      let stored: unknown;
      try { stored = JSON.parse(String(row.result)); } catch (error) { if (error instanceof SyntaxError) return []; throw error; }
      const parsed = ownershipReceiptSchema.safeParse(stored);
      if (!parsed.success) return [];
      const receipt = parsed.data, ref = receipt.source;
      if (!scope.sources.includes('work:self') && !scope.currentEventIds.includes(ref.eventId)) return [];
      if (!refs.some(selected => selected.eventId === ref.eventId && selected.contentVersion === ref.contentVersion
        && selected.start < ref.end && selected.end > ref.start)) return [];
      const source = this.repo.evidence(handle, ref.eventId);
      if (!source || !['active', 'redacted'].includes(source.status) || source.contentVersion !== ref.contentVersion
        || source.subjectId !== scope.principalId || source.worldId !== 'real' || source.speaker !== 'user'
        || source.authority !== 'user_statement' || source.parentEventId
        || !this.repo.citationMetadata(handle, { ...ref, role: 'authorization' })
        || createHash('sha256').update(codePointSlice(source.text, ref.start, ref.end)).digest('hex') !== receipt.sourceQuoteSha256) return [];
      // This metadata read does not unfold a method whose source is no longer
      // available. The accepted choice still has its own original address.
      // Recovery with only this current source may identify its own accepted
      // choice; it still cannot read any working text or regain an old scope.
      const method = this.repo.db.prepare(`SELECT r.revision FROM h_work r WHERE r.owner=? AND r.workspace=?
        AND r.subject=? AND r.world='real' AND r.audience='self' AND r.id=? AND r.kind='recipe_candidate'
        AND r.purpose IN (SELECT value FROM json_each(?)) AND (r.expires_at IS NULL OR julianday(r.expires_at)>julianday(?))
        AND json_extract(r.payload,'$.data.type')='personal_method'`).get(scope.principalId, scope.workspaceId,
        scope.principalId, receipt.methodId.slice('personal:'.length), JSON.stringify(scope.purposes), this.repo.clock.now());
      if (!method || Number(method.revision) < receipt.methodRevision || this.repo.hasFence(receipt.methodId.slice('personal:'.length), 'work:self')) return [];
      return [{ receiptId: String(row.id), methodId: receipt.methodId, methodRevision: receipt.methodRevision,
        operation: receipt.operation, source: ref, changedFields: receipt.changedFields,
        ...(receipt.recordedAt ? { recordedAt: receipt.recordedAt } : {}),
        ...(receipt.reviewDigest ? { reviewDigest: receipt.reviewDigest } : { legacyOperationId: receipt.legacyOperationId! }) }];
    }).sort((a, b) => a.receiptId.localeCompare(b.receiptId));
  }

  private recordOwnership(handle: ScopeHandle, input: MethodInput, id: string, revision: number,
    proof: { reviewDigest: string } | { legacyOperationId: string }) {
    const scope = this.owner(handle, true), { quote, ...source } = input.source;
    const changedFields = input.operation === 'disable' ? ['status'] : Object.entries(input.method)
      .filter(([, value]) => value !== undefined).flatMap(([field, value]) => field === 'conditions' && value && typeof value === 'object'
        ? Object.keys(value).map(key => 'conditions.' + key) : [field === 'instructionEdits' ? 'instructions' : field]);
    const receipt = ownershipReceiptSchema.parse({ version: 1, ownerId: scope.principalId, workspaceId: scope.workspaceId,
      methodId: id, methodRevision: revision, operation: input.operation, source,
      sourceQuoteSha256: createHash('sha256').update(quote).digest('hex'), changedFields, ...proof, recordedAt: this.repo.clock.now() });
    const { recordedAt: _recordedAt, ...identity } = receipt;
    const receiptId = 'personal-method-choice:' + createHash('sha256').update(canonical(identity)).digest('hex');
    if (!this.repo.operation(receiptId)) this.repo.completeOperation(receiptId, 'personal_method_choice', receipt);
  }

  /** Host recovery of a pre-receipt save. The complete original input must
   * reproduce the existing operation hash; this records no new approval and
   * changes neither method text nor source restrictions. */
  recoverSavedOwnership(handle: ScopeHandle, raw: unknown): PersonalMethodOwnership[] {
    const input = personalMethodInput.parse(raw), scope = this.owner(handle, true);
    if (input.operation !== 'save' || input.workAssistance.length || input.workAnchors.length)
      throw new HarnessError('method_ownership_recovery', "The original method's complete adoption provenance was not found. Preserve its existing record.");
    const operationId = 'personal-method:' + createHash('sha256').update(canonical({ owner: scope.principalId, workspace: scope.workspaceId, input })).digest('hex');
    const oldOperation = this.repo.operation<{ id: string; revision: number }>(operationId);
    const rememberedOwner = !oldOperation ? this.ownership(handle, [input.source]).find(receipt => receipt.legacyOperationId === operationId
      && receipt.operation === 'save' && receipt.methodRevision === 1) : undefined;
    const original = oldOperation || (rememberedOwner ? { id: rememberedOwner.methodId, revision: rememberedOwner.methodRevision } : undefined);
    if (!original || !methodId.safeParse(original.id).success || original.revision !== 1
      || oldOperation && !this.repo.db.prepare("SELECT 1 FROM h_operations WHERE id=? AND kind='personal_method'").get(operationId))
      throw new HarnessError('method_ownership_recovery', "This content does not match the method actually saved then. Historical choices were not reconstructed.");
    const verify = () => {
      if (this.repo.hasFence(original.id.slice('personal:'.length), 'work:self'))
        throw new HarnessError('method_ownership_recovery', "That method was set aside. Its original record remains.");
      const metadata = this.repo.sourcedWorkMetadata(handle, original.id.slice('personal:'.length));
      if (!metadata || metadata.type !== 'personal_method' || metadata.kind !== 'recipe_candidate'
        || this.repo.hasFence(original.id.slice('personal:'.length), 'work:self'))
        throw new HarnessError('method_ownership_recovery', "The original method is no longer here. Preserve its historical record.");
      for (const ref of [input.source, ...input.supports]) {
        const source = this.repo.evidence(handle, ref.eventId);
        if (!source || source.contentVersion !== ref.contentVersion || source.speaker !== 'user'
          || source.authority !== 'user_statement' || source.subjectId !== scope.principalId || source.worldId !== 'real'
          || source.parentEventId || !this.repo.citationMetadata(handle, { ...ref, role: 'authorization' })
          || codePointSlice(source.text, ref.start, ref.end) !== ref.quote)
          throw new HarnessError('method_ownership_recovery', "An original passage changed. Continue from currently readable content.");
      }
      for (const source of input.assistance) if (!this.repo.personalMethodAssistantSource(handle, source))
        throw new HarnessError('method_ownership_recovery', "The help actually supplied then is unreadable. It was not reconstructed from an old copy.");
      if (oldOperation ? canonical(this.repo.operation(operationId)) !== canonical(original)
        : this.repo.operation(operationId) !== undefined || !this.ownership(handle, [input.source])
          .some(receipt => canonical(receipt) === canonical(rememberedOwner)))
        throw new HarnessError('method_ownership_recovery', "The original adoption record just changed. Leave it with its owner.");
    };
    return this.repo.write(() => {
      verify();
      this.recordOwnership(handle, input, original.id, original.revision, { legacyOperationId: operationId });
      return this.ownership(handle, [input.source]);
    });
  }

  async prepareWorkHelp(handle: ScopeHandle, session: MethodSession, raw: unknown, signal?: AbortSignal) {
    const input = personalMethodInput.parse(raw);
    this.authorization(handle, session, input.source);
    if (session.ephemeral) throw new HarnessError('personal_method_retention', "This round's words are not retained. Help this way now without saving a long-term method.");
    const prepared: PreparedMethodWorkHelp[] = [];
    for (const source of input.operation === 'disable' ? [] : input.workAssistance) {
      if (!this.workHelpOwner) throw new HarnessError('personal_method_help_owner', "The earlier help cannot be opened now. Attend to the current step.");
      prepared.push(await this.workHelpOwner.prepare(handle, source, { permits: session.permits,
        restrictToSessionId: session.restrictToSessionId, signal }));
      this.authorization(handle, session, input.source);
    }
    return prepared;
  }

  private owner(handle: ScopeHandle, write = false) {
    const scope = write ? this.policy.require(handle, 'work:write') : this.policy.validate(handle);
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || write && (scope.child || scope.retention !== 'purpose_scoped') || !scope.sources.includes('work:self'))
      throw new HarnessError('personal_method_scope', "Help now; organize a personal method when saving and rereading become available.");
    return scope;
  }
  private authorization(handle: ScopeHandle, session: MethodSession, ref: z.infer<typeof refSchema>) {
    const scope = this.owner(handle, true), event = session.events.find(value => value.id === ref.eventId);
    if (!event || !scope.currentEventIds.includes(event.id) || event.speaker !== 'user'
      || !['user_message', 'user_control'].includes(event.kind) || event.parentEventId
      || event.subjectId !== scope.principalId || event.worldId !== 'real' || event.status !== 'active' || event.authority !== 'user_statement'
      || session.permits?.(ref) === false || session.restrictToSessionId && event.sessionId !== session.restrictToSessionId
      || event.contentVersion !== ref.contentVersion || ref.end <= ref.start || codePointSlice(event.text, ref.start, ref.end) !== ref.quote)
      throw new HarnessError('personal_method_source', "The current statement choosing to save, edit, or retire this method has not been found. Help according to the present wish first.");
    // The current statement can change while the bounded intent verifier runs.
    // Even metadata-only stopping rechecks its own new authorization, without
    // reopening the old method or inheriting that method's former sources.
    if (!session.ephemeral) {
      this.repo.resolveWorkSourceBinding(handle, [{ eventId: ref.eventId, contentVersion: ref.contentVersion, start: ref.start, end: ref.end }]);
      const current = this.repo.evidence(handle, ref.eventId);
      if (!current || current.status !== 'active' || codePointSlice(current.text, ref.start, ref.end) !== ref.quote)
        throw new HarnessError('personal_method_source', "The original statement about this method changed. Continue from its current meaning.");
    }
    return event;
  }
  private metadata(handle: ScopeHandle, id: string, revision: number) {
    if (this.repo.hasFence(id.slice('personal:'.length), 'work:self'))
      throw new HarnessError('personal_method_missing', "This method is set aside. Attend to the present need.");
    const current = this.repo.sourcedWorkMetadata(handle, id.slice('personal:'.length));
    if (!current || current.type !== 'personal_method' || current.kind !== 'recipe_candidate')
      throw new HarnessError('personal_method_missing', "This personal work method does not exist or was deleted.");
    if (current.revision !== revision) throw new HarnessError('revision_conflict', "This method has a newer revision. The supplied edit address does not match it.");
    return current;
  }
  private support(handle: ScopeHandle, session: MethodSession, input: Exclude<MethodInput, { operation: 'disable' }>, prepared: readonly PreparedMethodWorkHelp[]) {
    if (prepared.length !== input.workAssistance.length || prepared.some((value, index) => canonical(value.input) !== canonical(input.workAssistance[index])
      || this.workHelpOwner?.verify(handle, value.proof) !== true || !this.refsPermitted(handle, value.proof.sourceBinding.refs, session)))
      throw new HarnessError('personal_method_help_proof', "The original help page cannot be fully opened. Begin with material actually read today.");
    const assistance = input.assistance.map(source => {
      const original = this.repo.personalMethodAssistantSource(handle, { ...source,
        ...(session.restrictToSessionId ? { sessionId: session.restrictToSessionId } : {}) });
      if (!original || !this.refsPermitted(handle, original.sourceRefs, session))
        throw new HarnessError('personal_method_assistance', "The earlier help cannot be fully recovered. Attend to today's step first.");
      return { stored: { messageId: source.messageId, start: source.start, end: source.end,
        contentSha256: original.contentSha256, sourceRefs: original.sourceRefs },
        review: { ...source, origin: 'actual_assistant_help_not_authorization' as const } };
    });
    const anchors = input.workAnchors.map(source => {
      const record = this.repo.work(handle, source.kind === 'collaboration_frame' ? 'episode' : 'experience', source.id)[0];
      if (!record || record.revision !== source.revision || record.data.type !== source.kind || !record.sourceBinding
        || !this.refsPermitted(handle, record.sourceBinding.refs, session)
        || session.restrictToSessionId && record.data.sessionId !== session.restrictToSessionId
          && !(Array.isArray(record.data.sessionIds) && record.data.sessionIds.includes(session.restrictToSessionId))
        || source.kind === 'learning_process' && !this.repo.learningProcessReadable(handle, record.id, record.revision))
        throw new HarnessError('personal_method_practice', "The original shared matter changed. Open its current page before deciding which useful method to retain.");
      return { id: record.id, revision: record.revision, kind: source.kind,
        matterId: source.kind === 'collaboration_frame' ? record.id : String(record.data.matterId), sourceBinding: record.sourceBinding };
    });
    let previous: WorkRecord | undefined;
    if (input.operation === 'revise' && input.revisionMode === 'amend') {
      previous = this.repo.work(handle, 'recipe_candidate', input.id.slice('personal:'.length))[0];
      if (!previous || previous.revision !== input.expectedRevision || previous.data.type !== 'personal_method' || !previous.sourceBinding
        || this.repo.hasFence(previous.id, 'work:self')
        || !this.refsPermitted(handle, previous.sourceBinding.refs, session)
        || !this.supportPermitted(handle, previous.data.methodSources, session))
        throw new HarnessError('personal_method_changed', "The original method is not fully readable. Preserve other conditions; the desired approach can still help now.");
    }
    const prior = previous?.data.methodSources ? personalMethodSourcesSchema.parse(previous.data.methodSources) : undefined;
    const inherited = prepared.flatMap(value => value.inheritedSources);
    const inheritedBindings = [...(prior?.methodBinding?.refs || []), ...inherited.flatMap(value => value.methodBinding?.refs || [])];
    const sources: PersonalMethodSources = personalMethodSourcesSchema.parse({ version: 1,
      ...(inheritedBindings.length ? { methodBinding: this.repo.resolveWorkSourceBinding(handle, inheritedBindings) } : {}),
      workAssistance: [...new Map([...(prior?.workAssistance || []), ...inherited.flatMap(value => value.workAssistance), ...prepared.map(value => value.proof)]
        .map(value => [canonical(value), value])).values()],
      assistance: [...new Map([...(prior?.assistance || []), ...inherited.flatMap(value => value.assistance), ...assistance.map(value => value.stored)]
        .map(value => [canonical(value), value])).values()],
      anchors: [...new Map([...(prior?.anchors || []), ...inherited.flatMap(value => value.anchors), ...anchors]
        .map(value => [canonical(value), value])).values()] });
    if (!this.supportPermitted(handle, sources, session) || !this.sourcesReadable(handle, sources))
      throw new HarnessError('personal_method_help_changed', "Provenance for the earlier help changed. Continue from currently readable material.");
    return { sources, assistance: assistance.map(value => value.review),
      workAssistance: prepared.map(value => ({ ...value.input, origin: 'actual_owner_help_not_authorization' as const })), previous };
  }

  sourcesReadable(handle: ScopeHandle, raw: unknown): boolean {
    const parsed = personalMethodSourcesSchema.safeParse(raw);
    if (!parsed.success) return false;
    return (!parsed.data.methodBinding || this.repo.workBindingsReadable(handle, [parsed.data.methodBinding]))
      && parsed.data.workAssistance.every(source => this.workHelpOwner?.verify(handle, source) === true)
      && parsed.data.anchors.every(anchor => !this.repo.hasFence(anchor.id)
      && this.repo.workBindingsReadable(handle, [anchor.sourceBinding]))
      && parsed.data.assistance.every(source => {
        const current = this.repo.personalMethodAssistantSource(handle, source);
        return !!current && canonical(current.sourceRefs) === canonical(source.sourceRefs);
      });
  }

  private refsPermitted(handle: ScopeHandle, refs: readonly WorkSourceRef[], context: MethodReadContext) {
    return refs.every(ref => context.permits?.(ref) !== false && (!context.restrictToSessionId
      || this.repo.evidence(handle, ref.eventId)?.sessionId === context.restrictToSessionId));
  }

  private supportPermitted(handle: ScopeHandle, raw: unknown, context: MethodReadContext) {
    if (raw === undefined) return true;
    const parsed = personalMethodSourcesSchema.safeParse(raw);
    return parsed.success && this.refsPermitted(handle, [...parsed.data.assistance.flatMap(source => source.sourceRefs),
      ...parsed.data.workAssistance.flatMap(source => source.sourceBinding.refs),
      ...parsed.data.anchors.flatMap(anchor => anchor.sourceBinding.refs), ...(parsed.data.methodBinding?.refs || [])], context);
  }

  private binding(handle: ScopeHandle, input: Exclude<MethodInput, { operation: 'disable' }>, sources: PersonalMethodSources, session: MethodSession, previous?: WorkRecord) {
    const refs = [input.source, ...input.supports];
    const binding = this.repo.resolveWorkSourceBinding(handle, [...refs.map(({ quote: _quote, ...ref }) => ref),
      ...sources.assistance.flatMap(source => source.sourceRefs), ...sources.workAssistance.flatMap(source => source.sourceBinding.refs),
      ...sources.anchors.flatMap(anchor => anchor.sourceBinding.refs), ...(sources.methodBinding?.refs || []), ...(previous?.sourceBinding?.refs || [])]);
    if (!this.refsPermitted(handle, binding.refs, session))
      throw new HarnessError('personal_method_support', "Currently readable content is insufficient to organize this method. Other old words remain with their owners.");
    for (const ref of refs) {
      const event = this.repo.evidence(handle, ref.eventId);
      if (!event || event.contentVersion !== ref.contentVersion || codePointSlice(event.text, ref.start, ref.end) !== ref.quote
        || session.permits?.(ref) === false || session.restrictToSessionId && event.sessionId !== session.restrictToSessionId)
        throw new HarnessError('personal_method_support', "The passage used by this method changed. Continue from its current meaning.");
    }
    return binding;
  }

  private amendInstructions(original: string, edits: z.infer<typeof instructionEditSchema>[]) {
    const points = Array.from(original), sorted = [...edits].sort((a, b) => a.start - b.start);
    let end = 0, text = '';
    for (const edit of sorted) {
      if (edit.start < end || edit.end > points.length || points.slice(edit.start, edit.end).join('') !== edit.quote)
        throw new HarnessError('personal_method_instruction_changed', "The intended sentences do not match the current method revision. Other steps remain. Open the current method and identify the affected passage.");
      text += points.slice(end, edit.start).join('') + edit.text;
      end = edit.end;
    }
    return text + points.slice(end).join('');
  }

  private method(input: Exclude<MethodInput, { operation: 'disable' }>, previous?: WorkRecord) {
    if (input.operation !== 'revise') return methodSchema.parse(input.method);
    if (input.revisionMode === 'replace') {
      if (input.method.instructionEdits)
        throw new HarnessError('personal_method_amendment', "Use amend for a few sentences; supply a complete new method for a full rewrite.");
      return methodSchema.parse(input.method);
    }
    if (!previous) throw new HarnessError('personal_method_changed', "The original method is not fully readable. Attend to the intended current change first.");
    const original = methodSchema.parse(previous.data.method);
    const { instructionEdits, ...fields } = input.method;
    const changes = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
    const conditions = input.method.conditions && Object.fromEntries(Object.entries(input.method.conditions).filter(([, value]) => value !== undefined));
    return methodSchema.parse({ ...original, ...changes,
      ...(instructionEdits ? { instructions: this.amendInstructions(original.instructions, instructionEdits) } : {}),
      ...(conditions ? { conditions: { ...original.conditions, ...conditions } } : {}) });
  }

  private review<T extends object>(preview: T) {
    return { ...preview, reviewDigest: createHash('sha256').update(canonical(preview)).digest('hex') };
  }

  preview(handle: ScopeHandle, session: MethodSession, raw: unknown, known: (requirement: WorkflowRequirement) => boolean,
    prepared: readonly PreparedMethodWorkHelp[] = []) {
    const input = personalMethodInput.parse(raw);
    this.authorization(handle, session, input.source);
    if (session.ephemeral) throw new HarnessError('personal_method_retention', "These words remain only in the current exchange. Help this way now and save a reusable method when the person wants it retained.");
    if (input.operation === 'disable') {
      const current = this.metadata(handle, input.id, input.expectedRevision);
      return this.review({ targetKind: 'personal_method', operation: input.operation, current, source: input.source,
        meaning: "The method's current state is shown here. If they want it retired, disable it under this request. Earlier words and independent agreements remain." });
    }
    const current = input.operation === 'revise' ? this.metadata(handle, input.id, input.expectedRevision) : undefined;
    const support = this.support(handle, session, input, prepared), method = this.method(input, support.previous);
    if ((input.assistance.length || input.workAssistance.length) && !method.conditions)
      throw new HarnessError('personal_method_conditions', "Reflect on what helped and write when it fits and how to follow today's wish for another approach. Handle the organization yourself.");
    const unknown = method.requirements.filter(requirement => !known(requirement));
    if (unknown.length) throw new HarnessError('personal_method_requirement', "A helper required by this method is unavailable. Describe what actual available tools can do and retain a usable method.");
    const binding = this.binding(handle, input, support.sources, session, support.previous);
    return this.review({ targetKind: 'personal_method', operation: input.operation, current, method,
      source: input.source, supports: input.supports, assistance: support.assistance, workAssistance: support.workAssistance,
      ...(session.events.find(event => event.id === input.source.eventId)?.sourceContext
        ? { authorizationContext: session.events.find(event => event.id === input.source.eventId)!.sourceContext } : {}),
      workAnchors: support.sources.anchors, binding,
      methodSources: support.sources,
      ...(input.operation === 'revise' ? { revisionMode: input.revisionMode,
        methodChanges: input.method,
        ...(support.previous ? { previousMethod: methodSchema.parse(support.previous.data.method), previousBinding: support.previous.sourceBinding } : {}) } : {}),
      digest: createHash('sha256').update(canonical({ method, binding })).digest('hex'),
      meaning: "This method is organized under the current request with its provenance. A local edit preserves other steps and conditions completely in this revision. Check whether it captures the intended change." });
  }

  /** The host captures this identity before asking whether the displayed
   * proposal matches the person's choice. Approval covers that proposal only. */
  save(handle: ScopeHandle, session: MethodSession, raw: unknown, known: (requirement: WorkflowRequirement) => boolean,
    prepared: readonly PreparedMethodWorkHelp[] = [], reviewedDigest: string) {
    const input = personalMethodInput.parse(raw), scope = this.owner(handle, true);
    return this.repo.write(() => {
      const preview = this.preview(handle, session, input, known, prepared);
      if (typeof reviewedDigest !== 'string' || preview.reviewDigest !== reviewedDigest)
        throw new HarnessError('personal_method_review_changed', "This method differs from what was just reviewed together. Inspect the change first; the original method remains.");
      const now = this.repo.clock.now();
      const operationId = 'personal-method:' + createHash('sha256').update(canonical({ owner: scope.principalId, workspace: scope.workspaceId, input })).digest('hex');
      if (input.operation === 'save') {
        const previous = this.repo.operation<{ id: string; revision: number }>(operationId);
        if (previous) {
          const current = this.repo.sourcedWorkMetadata(handle, previous.id.slice('personal:'.length));
          return { id: previous.id, revision: current?.revision ?? previous.revision,
            status: current?.status || 'unavailable', guidanceOnly: true as const, repeated: true,
            meaning: "This method was already saved. Its current state is shown; retain the same original." };
        }
      }
      if (input.operation === 'disable') {
        const current = this.metadata(handle, input.id, input.expectedRevision), revision = current.revision + 1;
        // Metadata-only stop remains possible after the original method source
        // becomes unreadable. It cannot resume or replace that old source.
        this.repo.db.prepare(`UPDATE h_work SET status='disabled',revision=?,payload=json_set(payload,
          '$.status','disabled','$.revision',?,'$.data.updatedAt',?) WHERE id=? AND revision=?`)
          .run(revision, revision, now, current.id, current.revision);
        this.repo.outbox('work_changed', current.id);
        this.repo.setMeta('personal_methods_revision', this.revision + 1);
        this.repo.invalidate(current.id, 'personal_method_disabled');
        this.recordOwnership(handle, input, input.id, revision, { reviewDigest: reviewedDigest });
        return { id: input.id, revision, status: 'disabled' as const, guidanceOnly: true as const,
          meaning: "This method is retired. Future help follows present wishes; independent methods and agreements remain." };
      }
      const current = input.operation === 'revise' ? this.metadata(handle, input.id, input.expectedRevision) : undefined;
      const id = current?.id || randomUUID(), support = this.support(handle, session, input, prepared), binding = this.binding(handle, input, support.sources, session, support.previous);
      const method = this.method(input, support.previous);
      const sourceSessionId = session.events.find(event => event.id === input.source.eventId)?.sessionId;
      const record: WorkRecord = { id, kind: 'recipe_candidate', ownerId: scope.principalId, workspaceId: scope.workspaceId,
        subjectId: scope.subjectId, worldId: scope.worldId, revision: current ? current.revision + 1 : 1,
        status: current?.status === 'disabled' ? 'disabled' : 'active', title: method.name,
        evidenceIds: [...new Set(binding.refs.map(ref => ref.eventId))], sourceBinding: binding,
        label: { purpose: scope.purposes[0], audience: 'self', retention: 'purpose_scoped', sensitivity: 'personal', infer: false },
        data: { type: 'personal_method', method, methodSources: support.sources,
          recordedAt: typeof support.previous?.data.recordedAt === 'string' ? support.previous.data.recordedAt : now, updatedAt: now,
          sourceIds: [...new Set([...binding.sourceIds, ...(support.sources.assistance.length
            || support.sources.workAssistance.some(source => source.owner === 'companion_session') ? ['history:self'] : [])])],
          ...(sourceSessionId ? { sessionId: sourceSessionId } : {}) } };
      this.repo.saveSourcedWork(handle, record, current?.revision);
      for (const source of support.sources.assistance) this.repo.addDependency(handle, { consumerId: record.id,
        producerId: source.messageId, producerRevision: 1, sensitivity: 'privacy', invalidation: 'block' });
      for (const source of support.sources.workAssistance) if (source.owner === 'companion_session')
        for (const [producerId, producerRevision] of [[source.messageId, 1], [source.sceneId, source.sceneRevision],
          ...source.assistantMaterials.map(material => [material.messageId, 1] as const)] as const)
          this.repo.addDependency(handle, { consumerId: record.id, producerId, producerRevision, sensitivity: 'privacy', invalidation: 'block' });
      if (input.operation === 'save') this.repo.completeOperation(operationId, 'personal_method', { id: 'personal:' + id, revision: record.revision });
      this.recordOwnership(handle, input, 'personal:' + id, record.revision, { reviewDigest: reviewedDigest });
      this.repo.setMeta('personal_methods_revision', this.revision + 1);
      if (current) this.repo.invalidate(id, 'personal_method_revised');
      return { id: 'personal:' + id, revision: record.revision, status: record.status, guidanceOnly: true as const,
        name: method.name, methodDigest: createHash('sha256').update(canonical(method)).digest('hex'),
        ...(record.status === 'active' ? { read: { tool: 'read_skill', id: 'personal:' + id } } : {}),
        meaning: record.status === 'disabled'
          ? "The requested edit is saved while the method remains in its original retired state. Today's help follows today's wishes."
          : input.operation === 'revise'
          ? "The edit is saved. Independent methods remain. Reuse this revision when appropriate, while following today's desired collaboration."
          : "The method and its original reasons are saved together. Borrow it naturally when suitable, adapting when the person wants to act independently or change approach." };
    });
  }

  readHelp(handle: ScopeHandle, address: { id: string; revision: number; index: number }, context: MethodReadContext = {}) {
    this.owner(handle);
    if (this.repo.hasFence(address.id.slice('personal:'.length), 'work:self'))
      throw new HarnessError('personal_method_changed', "This method is set aside. Attend to the present need.");
    const current = this.repo.work(handle, 'recipe_candidate', address.id.slice('personal:'.length))[0];
    if (!current || current.revision !== address.revision || current.status !== 'active' || current.data.type !== 'personal_method'
      || this.repo.hasFence(current.id, 'work:self')
      || !current.sourceBinding || !this.refsPermitted(handle, current.sourceBinding.refs, context)
      || !this.supportPermitted(handle, current.data.methodSources, context))
      throw new HarnessError('personal_method_changed', "The method changed or is unreadable this round. Help according to the present need.");
    const sources = personalMethodSourcesSchema.parse(current.data.methodSources), proof = sources.workAssistance[address.index];
    const text = proof && this.workHelpOwner?.read(handle, proof, context);
    if (text === undefined) throw new HarnessError('personal_method_help_changed', "The original help is unreadable. Discuss the currently available method text under today's needs.");
    return { data: { methodId: address.id, methodRevision: current.revision, origin: 'actual_assistant_help_not_user_approval' as const,
      owner: proof.owner, matterId: proof.matterId, text, coverage: { start: proof.start, end: proof.end },
      interpretation: 'original_help_excerpt_not_current_work_or_authorization' as const }, record: current,
      sources: { ...sources, methodBinding: current.sourceBinding } };
  }

  private currentHelpReference(handle: ScopeHandle, context: MethodReadContext,
    suggested?: PersonalMethodGuidanceReference['forCurrentHelp']): PersonalMethodGuidanceReference['forCurrentHelp'] {
    const scope = this.policy.validate(handle);
    const latest = suggested ? undefined : [...scope.currentEventIds].reverse().map(id => this.repo.evidence(handle, id))
      .find(event => event?.speaker === 'user' && event.authority === 'user_statement' && !event.parentEventId
        && ['user_message', 'user_control'].includes(event.kind) && event.status === 'active' && Array.from(event.text).length > 0);
    const checked = workSourceRefSchema.safeParse(suggested?.source || (latest ? { eventId: latest.id,
      contentVersion: latest.contentVersion, start: 0, end: Array.from(latest.text).length } : undefined));
    if (!checked.success) return undefined;
    const source = checked.data, event = this.repo.evidence(handle, source.eventId);
    if (!event || !scope.currentEventIds.includes(event.id) || event.speaker !== 'user' || event.authority !== 'user_statement'
      || event.parentEventId || !['user_message', 'user_control'].includes(event.kind) || event.status !== 'active'
      || event.contentVersion !== source.contentVersion || source.end > Array.from(event.text).length
      || !this.refsPermitted(handle, [source], context)) return undefined;
    return { source, ...(suggested?.matterId ? { matterId: suggested.matterId } : {}) };
  }

  private guidanceReference(handle: ScopeHandle, record: WorkRecord, context: MethodReadContext,
    currentHelp?: PersonalMethodGuidanceReference['forCurrentHelp'] | false): PersonalMethodGuidanceReference {
    const choices = this.ownership(handle, record.sourceBinding!.refs)
      .filter(choice => choice.methodId === 'personal:' + record.id && choice.methodRevision <= record.revision
        && choice.operation !== 'disable' && this.refsPermitted(handle, [choice.source], context))
      .sort((a, b) => b.methodRevision - a.methodRevision);
    // The newest choice explains this version; the original save remains a
    // way back to why it was wanted. Intermediate edits stay at their owner.
    const selected = [choices[0], choices.find(choice => choice.operation === 'save')]
      .filter((choice, index, values): choice is PersonalMethodOwnership => !!choice && values.findIndex(value => value?.receiptId === choice.receiptId) === index);
    const forCurrentHelp = currentHelp === false ? undefined : this.currentHelpReference(handle, context, currentHelp);
    return { workId: record.id, revision: record.revision, sourceIds: record.sourceBinding!.sourceIds,
      ...(forCurrentHelp ? { forCurrentHelp } : {}),
      choices: selected.map(choice => ({ revision: choice.methodRevision, operation: choice.operation as 'save' | 'revise',
        source: choice.source, changedFields: choice.changedFields,
        read: { tool: 'read_evidence', arguments: { id: choice.source.eventId, expectedVersion: choice.source.contentVersion, offset: choice.source.start,
          limit: choice.source.end - choice.source.start } } })) };
  }

  catalog(handle: ScopeHandle, selected: { id?: string; revision?: number; usage?: PersonalMethodUsage; sessionId?: string;
    permits?: MethodSession['permits'] } = {}): PersonalMethodCatalogEntry[] {
    const scope = this.policy.validate(handle);
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.sources.includes('work:self') || !scope.grants.includes('evidence:read') || this.repo.hasFence('work:self')) return [];
    const result: PersonalMethodCatalogEntry[] = [];
    const { usage, permits, ...address } = selected;
    const context = { permits, restrictToSessionId: selected.sessionId };
    for (let offset = 0; ; offset += 100) {
      const rows = this.repo.workData(handle, ['personal_method'], { ...address, statuses: ['active'], limit: 100, offset });
      for (const record of rows) {
        const method = methodSchema.safeParse(record.data.method);
        if (!method.success || record.kind !== 'recipe_candidate' || !record.sourceBinding || usage && method.data.usage !== usage
          || this.repo.hasFence(record.id, 'work:self')
          || !this.refsPermitted(handle, record.sourceBinding.refs, context) || !this.supportPermitted(handle, record.data.methodSources, context)) continue;
        result.push({ id: 'personal:' + record.id, version: String(record.revision), ...method.data,
          supportingHelp: record.data.methodSources ? (() => {
            const sources = personalMethodSourcesSchema.parse(record.data.methodSources);
            return { assistance: sources.assistance.map(source => ({ messageId: source.messageId, start: source.start, end: source.end,
              read: { tool: 'read_assistant_history', arguments: { id: source.messageId, offset: source.start, limit: source.end - source.start } } })),
              workAssistance: sources.workAssistance.map((source, index) => ({ owner: source.owner, id: source.id, revision: source.revision,
                matterId: source.matterId, start: source.start, end: source.end,
                read: { tool: 'read_method_help', arguments: { id: 'personal:' + record.id, revision: record.revision, index } } })),
              work: sources.anchors.map(anchor => ({ id: anchor.id, revision: anchor.revision, matterId: anchor.matterId, kind: anchor.kind,
                read: anchor.kind === 'learning_process' ? { tool: 'read_learning', arguments: { matterId: anchor.matterId, id: anchor.id } }
                  : { tool: 'restore_collaboration', arguments: { id: anchor.id } } })) };
          })() : undefined,
          personalMethod: this.guidanceReference(handle, record, context) });
      }
      if (rows.length < 100) break;
    }
    return result;
  }

  /** Few conditional discovery heads. Instructions still come from read_skill;
   * the main assistant judges relevance without a scenario keyword router. */
  cues(handle: ScopeHandle, options: { limit?: number; permits?: MethodSession['permits']; forCurrentHelp?: { source: WorkSourceRef; matterId?: string } } = {}) {
    const scope = this.policy.validate(handle), limit = Math.min(6, Math.max(1, options.limit ?? 4));
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.sources.includes('work:self') || !scope.grants.includes('evidence:read') || this.repo.hasFence('work:self')) return { items: [], records: [], moreMayExist: false };
    // Keep the projection small without letting a page of conversational or
    // excluded methods hide every working method behind it. A bounded scan
    // can still end before the catalogue; discovery remains available then.
    const available: { record: WorkRecord; method: z.infer<typeof methodSchema> }[] = [];
    const pageSize = 20, scanLimit = 100;
    let moreMayExist = false;
    for (let offset = 0; offset < scanLimit; offset += pageSize) {
      const rows = this.repo.workData(handle, ['personal_method'], { statuses: ['active'], limit: pageSize, offset });
      for (const record of rows) {
        const method = methodSchema.safeParse(record.data.method);
        if (!method.success || record.kind !== 'recipe_candidate' || method.data.usage !== 'work' || !record.sourceBinding
          || this.repo.hasFence(record.id, 'work:self')
          || !this.refsPermitted(handle, record.sourceBinding.refs, options)
          || !this.supportPermitted(handle, record.data.methodSources, options)) continue;
        available.push({ record, method: method.data });
        if (available.length > limit) break;
      }
      moreMayExist = available.length > limit || rows.length === pageSize;
      if (available.length > limit || rows.length < pageSize) break;
    }
    const picked = available.slice(0, limit);
    const forCurrentHelp = this.currentHelpReference(handle, options, options.forCurrentHelp);
    return { items: picked.map(({ record, method }) => ({ id: 'personal:' + record.id, revision: record.revision, name: method.name,
      description: Array.from(method.description).slice(0, 300).join(''),
      ...(method.conditions ? { conditions: { when: Array.from(method.conditions.when).slice(0, 240).join(''),
        adaptToCurrent: Array.from(method.conditions.adaptToCurrent).slice(0, 240).join(''),
        ...(method.conditions.avoidWhen ? { avoidWhen: Array.from(method.conditions.avoidWhen).slice(0, 200).join('') } : {}) } } : {}),
      instructionsRead: false,
      conditionsComplete: !method.conditions || Array.from(method.conditions.when).length <= 240 && Array.from(method.conditions.adaptToCurrent).length <= 240
        && (!method.conditions.avoidWhen || Array.from(method.conditions.avoidWhen).length <= 200),
      personalMethod: this.guidanceReference(handle, record, options, forCurrentHelp || false),
      read: { tool: 'read_skill', arguments: { id: 'personal:' + record.id } },
      ...(forCurrentHelp ? { readForCurrentHelp: { tool: 'read_skill', arguments: { id: 'personal:' + record.id, forCurrentHelp } } } : {}) })),
      records: picked.map(value => value.record), moreMayExist };
  }
}
