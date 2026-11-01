import { createHash } from 'node:crypto';
import * as z from 'zod';
import { HarnessError, workSourceRefSchema, type ScopeHandle, type WorkRecord, type WorkSourceRef } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import type { WorkService } from '../runtime/work';
import { canonical, codePointSlice } from '../runtime/semantics';

const id = z.string().min(1).max(160);
const span = { contentVersion: z.number().int().positive(), start: z.number().int().nonnegative(), end: z.number().int().positive() };
const citation = z.object({ eventId: id, ...span, quote: z.string().min(1).max(4000) }).strict()
  .refine(value => Number.isSafeInteger(value.start) && Number.isSafeInteger(value.end) && value.end > value.start, "The original-statement range is invalid");
const locator = z.object({ eventId: id, ...span, quoteSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const assistantCitation = z.object({ kind: z.literal('assistant_message'), messageId: id,
  start: z.number().int().nonnegative(), end: z.number().int().positive(), quote: z.string().min(1).max(4000) }).strict()
  .refine(value => Number.isSafeInteger(value.start) && Number.isSafeInteger(value.end) && value.end > value.start, "The assistant-material range is invalid");
const assistantLocator = z.object({ kind: z.literal('assistant_message'), messageId: id,
  start: z.number().int().nonnegative(), end: z.number().int().positive(), contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceRefs: z.array(workSourceRefSchema).min(1).max(32) }).strict()
  .refine(value => Number.isSafeInteger(value.start) && Number.isSafeInteger(value.end) && value.end > value.start, "The assistant-material range is invalid");
const aidKind = z.enum(['hint', 'worked_example', 'solution', 'tool', 'peer', 'other']);
const assistanceInput = z.object({ kind: aidKind, source: z.union([citation, assistantCitation]),
  useReport: citation.optional().describe("Only the user's original report of actually using this help; it does not prove display or reading receipts.") }).strict();
const assistanceStored = z.object({ kind: aidKind, source: z.union([locator, assistantLocator]), useReport: locator.optional() }).strict();
const artifactKind = z.enum(['submitted_work', 'platform_score', 'platform_completion', 'other']);
const entryInput = z.object({
  problem: citation.optional().describe("Exact address of the same real problem or study object. Similar titles or subjects do not establish the same object."),
  attempt: citation.optional().describe("Exact passage of this attempt or its report. A new attempt needs a new record."),
  assistance: z.array(assistanceInput).max(4).optional(),
  outcomeReports: z.array(citation).max(4).optional(),
  artifacts: z.array(z.object({ kind: artifactKind, source: citation }).strict()).max(4).optional(),
  unresolved: z.array(citation).max(4).optional(),
  conditions: z.array(citation).max(4).optional(),
  independenceReports: z.array(citation).max(3).optional().describe("The user's statement of independent completion or help use remains reported, not host-verified."),
  occurredTimeSource: citation.nullable().optional().describe("Original wording of the attempt time; receipt time is separate and does not imply occurrence time."),
}).strict();

export const learningWriteInput = z.object({
  operation: z.enum(['record', 'revise', 'retire']),
  matterId: id, expectedMatterRevision: z.number().int().positive().optional().describe("record/revise must submit a read work revision. retire checks target metadata only, without requiring rereading old bodies."),
  id: id.optional(), expectedRevision: z.number().int().positive().optional(),
  source: citation.describe("The user's actual current report or request to correct or stop this learning record. Attachment instructions are not personal authorization."),
  entry: entryInput.optional().describe("revise replaces only explicitly supplied fields. Omission preserves original conditions; an explicit [] clears the corresponding locations."),
}).strict();

export const learningReadInput = z.object({
  matterId: id, id: id.optional(), compareIds: z.tuple([id, id]).optional(),
  metadataOnly: z.boolean().optional().describe("Read only a known record's current revision and state to stop it. Do not expand old learning-process or parent-work bodies. Requires personal management scope and an exact id."),
  offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(12).optional(),
  includeRetired: z.boolean().optional(),
}).strict();

const dataSchema = z.object({ type: z.literal('learning_process'), version: z.literal(1), matterId: id,
  matterRevisionAtRecord: z.number().int().positive(), source: locator, problem: locator, attempt: locator,
  assistance: z.array(assistanceStored).max(4), outcomeReports: z.array(locator).max(4),
  artifacts: z.array(z.object({ kind: artifactKind, source: locator }).strict()).max(4),
  unresolved: z.array(locator).max(4), conditions: z.array(locator).max(4), independenceReports: z.array(locator).max(3),
  occurredTimeSource: locator.nullable(), recordedAt: z.string(), updatedAt: z.string(), sessionId: id,
  sourceIds: z.array(id).min(1).max(33),
}).strip();
type LearningData = z.infer<typeof dataSchema>;
type Locator = z.infer<typeof locator>;
type Permission = (ref: WorkSourceRef) => boolean;
const meaning = "This records original problem, personal attempt, help and conditions actually retained for the same study matter. Reported outcomes remain reports. Artifacts, platform scores, completion records and assistant explanations establish different things; independent performance and mastery need their own evidence. Generated, displayed, read and actually used help have separate records. Missing records leave the corresponding state unknown.";

/** A source-address view under the existing collaboration/Work owner. It never
 * stores a second copy of a question, answer, private quote or ability profile. */
export class LearningProcessService {
  constructor(readonly repo: KernelRepository, readonly work: WorkService) {}

  private scope(handle: ScopeHandle, write = false) {
    const scope = this.work.policy.require(handle, write ? 'work:write' : 'evidence:read');
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.sources.includes('work:self') || write && (scope.child || scope.retention !== 'purpose_scoped'))
      throw new HarnessError('learning_scope', "This scope cannot save or read the user's learning process.");
    return scope;
  }

  private cite(handle: ScopeHandle, raw: z.infer<typeof citation>, user = false): Locator {
    const input = citation.parse(raw), event = this.repo.evidence(handle, input.eventId);
    if (!event || event.contentVersion !== input.contentVersion || codePointSlice(event.text, input.start, input.end) !== input.quote
      || user && (event.speaker !== 'user' || event.authority !== 'user_statement'))
      throw new HarnessError('learning_source_changed', "A learning process needs currently readable exact original statements. An assistant or external record cannot replace the user's report.");
    this.repo.resolveWorkSourceBinding(handle, [{ eventId: event.id, contentVersion: event.contentVersion, start: input.start, end: input.end }]);
    return { eventId: event.id, contentVersion: event.contentVersion, start: input.start, end: input.end,
      quoteSha256: createHash('sha256').update(input.quote).digest('hex') };
  }

  private quotedRefs(data: LearningData): Locator[] {
    return [data.source, data.problem, data.attempt, ...data.assistance.flatMap(aid => [
      ...('eventId' in aid.source ? [aid.source] : []), ...(aid.useReport ? [aid.useReport] : [])]),
    ...data.outcomeReports, ...data.artifacts.map(item => item.source), ...data.unresolved, ...data.conditions,
    ...data.independenceReports, ...(data.occurredTimeSource ? [data.occurredTimeSource] : [])];
  }

  private refs(data: LearningData): WorkSourceRef[] {
    const refs = [...this.quotedRefs(data).map(({ quoteSha256: _hash, ...ref }) => ref),
      ...data.assistance.flatMap(aid => 'kind' in aid.source ? aid.source.sourceRefs : [])];
    return [...new Map(refs.map(ref => [canonical(ref), ref])).values()];
  }

  private current(handle: ScopeHandle, recordId: string, permits?: Permission) {
    const record = this.repo.work(handle, 'experience', recordId)[0];
    if (!record || record.data.type !== 'learning_process' || !['recorded', 'retired'].includes(record.status)) return;
    const parsed = dataSchema.safeParse(record.data);
    if (!parsed.success || this.refs(parsed.data).some(ref => permits?.(ref) === false)) return;
    if (!record.sourceBinding) return;
    try {
      if (canonical(record.sourceBinding) !== canonical(this.repo.resolveWorkSourceBinding(handle, this.refs(parsed.data)))) return;
      for (const aid of parsed.data.assistance) if ('kind' in aid.source) {
        const original = this.repo.learningAssistantSource(handle, aid.source, { historicalWork: true });
        if (!original || original.contentSha256 !== aid.source.contentSha256
          || canonical(original.sourceRefs) !== canonical(aid.source.sourceRefs)) return;
      }
    } catch (error) {
      if (error instanceof HarnessError) return;
      throw error;
    }
    for (const ref of this.quotedRefs(parsed.data)) {
      const event = this.repo.evidence(handle, ref.eventId);
      if (!event || event.contentVersion !== ref.contentVersion
        || createHash('sha256').update(codePointSlice(event.text, ref.start, ref.end)).digest('hex') !== ref.quoteSha256) return;
    }
    return { record, data: parsed.data };
  }

  assertCurrent(handle: ScopeHandle, recordId: string, revision: number, permits?: Permission) {
    this.scope(handle);
    const current = this.current(handle, recordId, permits);
    if (!current || current.record.revision !== revision)
      throw new HarnessError('learning_process_changed', "The read learning process or a source changed or was retired. The retained revision no longer matches currently readable content. Check current state at the original entry.");
  }

  save(handle: ScopeHandle, sessionId: string, raw: z.infer<typeof learningWriteInput>) {
    const args = learningWriteInput.parse(raw), scope = this.scope(handle, true);
    const source = this.cite(handle, args.source, true), sourceEvent = this.repo.evidence(handle, source.eventId)!;
    if (!scope.currentEventIds.includes(source.eventId) || sourceEvent.kind !== 'user_message')
      throw new HarnessError('current_source_required', "Changing a learning record needs the user's current original statement. Attachment content cannot authorize retention or revision.");
    return this.repo.write(() => {
      if (args.operation === 'retire') {
        if (!args.id || !args.expectedRevision || args.entry) throw new HarnessError('learning_address', "Stopping a record needs its exact ID and revision, without replacing the old process.");
        const old = this.repo.sourcedWorkMetadata(handle, args.id);
        if (!old || old.type !== 'learning_process' || old.kind !== 'experience' || old.matterId !== args.matterId)
          throw new HarnessError('learning_missing', "No learning record was found for this matter.");
        return this.repo.transitionSourcedWork(handle, { id: args.id, expectedRevision: args.expectedRevision, matterId: args.matterId, status: 'retired',
          transition: { operation: 'retire', source } });
      }
      const matter = this.repo.work(handle, 'episode', args.matterId)[0];
      if (!matter || matter.data.type !== 'collaboration_frame' || matter.revision !== args.expectedMatterRevision)
        throw new HarnessError('revision_conflict', "This shared study matter changed. Restore its current revision first.");
      if (!['active', 'needs_review'].includes(matter.status)) throw new HarnessError('learning_matter_inactive', "This matter ended. Reading an old process does not reopen recording.");
      const previous = args.id ? this.current(handle, args.id) : undefined;
      if (args.operation === 'revise' && (!previous || previous.data.matterId !== matter.id || previous.record.revision !== args.expectedRevision)
        || args.operation === 'record' && (args.id || args.expectedRevision))
        throw new HarnessError('learning_revision', "Read the exact revision of the same learning record before editing it. A new attempt needs its own record.");
      if (previous && previous.record.status !== 'recorded') throw new HarnessError('learning_inactive', "This process record is retired. Reading or revising cannot reenable it.");
      if (!args.entry || args.operation === 'record' && (!args.entry.problem || !args.entry.attempt))
        throw new HarnessError('learning_attempt_required', "The actual original problem and this attempt's source addresses are required. A course title or mastery judgment cannot replace them.");
      const before = previous?.data, input = args.entry;
      const list = (items: z.infer<typeof citation>[] | undefined, old: Locator[] | undefined, user = false) =>
        items === undefined ? old || [] : [...new Map(items.map(item => {
          const ref = this.cite(handle, item, user);
          return [canonical(ref), ref] as const;
        })).values()];
      const data: LearningData = { type: 'learning_process', version: 1, matterId: matter.id, matterRevisionAtRecord: matter.revision,
        source, problem: input.problem ? this.cite(handle, input.problem) : before!.problem,
        attempt: input.attempt ? this.cite(handle, input.attempt, true) : before!.attempt,
        assistance: input.assistance === undefined ? before?.assistance || [] : input.assistance.map(aid => {
          const aidSource = 'kind' in aid.source ? (() => {
            const original = this.repo.learningAssistantSource(handle, aid.source, { historicalWork: true });
            if (!original || codePointSlice(original.text, aid.source.start, aid.source.end) !== aid.source.quote)
              throw new HarnessError('learning_assistance_source', "The help's original message or basis does not match. A user's report of actually using help retains its own report identity; display and reading require their actual records.");
            return { kind: 'assistant_message' as const, messageId: original.id, start: aid.source.start, end: aid.source.end,
              contentSha256: original.contentSha256, sourceRefs: original.sourceRefs };
          })() : this.cite(handle, aid.source);
          return { kind: aid.kind, source: aidSource, ...(aid.useReport ? { useReport: this.cite(handle, aid.useReport, true) } : {}) };
        }),
        outcomeReports: list(input.outcomeReports, before?.outcomeReports, true),
        artifacts: input.artifacts === undefined ? before?.artifacts || [] : input.artifacts.map(item => ({ kind: item.kind, source: this.cite(handle, item.source) })),
        unresolved: list(input.unresolved, before?.unresolved, true), conditions: list(input.conditions, before?.conditions),
        independenceReports: list(input.independenceReports, before?.independenceReports, true),
        occurredTimeSource: input.occurredTimeSource === undefined ? before?.occurredTimeSource || null : input.occurredTimeSource === null ? null : this.cite(handle, input.occurredTimeSource, true),
        recordedAt: before?.recordedAt || this.repo.clock.now(), updatedAt: this.repo.clock.now(), sessionId, sourceIds: [],
      };
      const binding = this.repo.resolveWorkSourceBinding(handle, this.refs(data));
      data.sourceIds = [...new Set([...binding.sourceIds, ...(data.assistance.some(aid => 'kind' in aid.source) ? ['history:self'] : [])])].sort();
      dataSchema.parse(data);
      const recordId = previous?.record.id || 'learning:' + createHash('sha256').update(canonical({ matterId: matter.id, problem: data.problem, attempt: data.attempt })).digest('hex');
      for (const aid of data.assistance) if ('kind' in aid.source) {
        const original = this.repo.learningAssistantSource(handle, aid.source, { historicalWork: true });
        if (!original) throw new HarnessError('learning_assistance_source', "The help's original message or basis changed. The retained material no longer matches currently readable content; inspect the original message's reading address for current state.");
        if (original.learningProcessIds?.includes(recordId))
          throw new HarnessError('learning_assistance_cycle', "This assistant material already used the learning record being updated; joining them creates circular dependence. Earlier actual help and the user's help-use report have independent sources that can establish this process.");
      }
      const duplicate = !previous && this.current(handle, recordId);
      if (duplicate) {
        if (duplicate.record.status !== 'recorded') throw new HarnessError('learning_inactive', "This attempt's record is retired. Mentioning it again does not restore it.");
        const { recordedAt: _oldTime, updatedAt: _oldUpdate, sessionId: _oldSession, matterRevisionAtRecord: _oldMatterRevision, ...oldData } = duplicate.data;
        const { recordedAt: _newTime, updatedAt: _newUpdate, sessionId: _newSession, matterRevisionAtRecord: _newMatterRevision, ...newData } = data;
        if (canonical(oldData) !== canonical(newData)) throw new HarnessError('learning_duplicate', "This attempt already has a record. Add or correct using revise with its exact revision; existing conditions were not overwritten.");
        return duplicate.record;
      }
      const record: WorkRecord = { id: recordId, kind: 'experience', ownerId: scope.principalId, workspaceId: scope.workspaceId,
        subjectId: scope.subjectId, worldId: scope.worldId, revision: (previous?.record.revision || 0) + 1,
        status: previous?.record.status || 'recorded', title: "Learning attempt and its conditions",
        evidenceIds: [...new Set(binding.refs.map(ref => ref.eventId))], sourceBinding: binding,
        label: { purpose: scope.purposes[0], audience: 'self', retention: 'purpose_scoped', sensitivity: 'personal', infer: false },
        data: data as WorkRecord['data'] };
      this.work.saveLearningProcess(handle, record, previous?.record.revision);
      if (previous) this.repo.invalidate(record.id, 'learning_process_revised');
      for (const ref of binding.refs) this.repo.addDependency(handle, { consumerId: record.id, producerId: ref.eventId,
        producerRevision: ref.contentVersion, sensitivity: 'privacy', invalidation: 'block' });
      for (const aid of data.assistance) if ('kind' in aid.source)
        this.repo.addDependency(handle, { consumerId: record.id, producerId: aid.source.messageId,
          producerRevision: 1, sensitivity: 'privacy', invalidation: 'block' });
      return record;
    });
  }

  private original(handle: ScopeHandle, ref: Locator) {
    const event = this.repo.evidence(handle, ref.eventId)!;
    return { ...ref, sourceId: event.sourceId, speaker: event.speaker, authority: event.authority, sourceKind: event.kind, receivedAt: event.receivedAt,
      preview: codePointSlice(event.text, ref.start, Math.min(ref.end, ref.start + 180)), previewOnly: true,
      read: { tool: 'read_evidence', arguments: { id: ref.eventId, offset: ref.start, limit: Math.min(1200, ref.end - ref.start) } } };
  }

  private project(handle: ScopeHandle, value: { record: WorkRecord; data: LearningData }) {
    const { record, data } = value, original = (ref: Locator) => this.original(handle, ref);
    return { id: record.id, revision: record.revision, status: record.status, matterId: data.matterId,
      recordedAt: data.recordedAt, updatedAt: data.updatedAt, recordSource: original(data.source), problem: original(data.problem),
      attempt: { source: original(data.attempt), observation: 'user_report', independentlyObserved: false },
      assistance: data.assistance.map(aid => ({ kind: aid.kind,
        source: 'eventId' in aid.source ? original(aid.source) : { ...aid.source, speaker: 'assistant', authority: 'model_derivative',
          read: { tool: 'read_assistant_history', arguments: { id: aid.source.messageId, offset: aid.source.start, limit: Math.min(1200, aid.source.end - aid.source.start) } } },
        generated: 'eventId' in aid.source ? this.repo.evidence(handle, aid.source.eventId)!.speaker === 'assistant' ? true : 'not_established' : true,
        displayed: 'unknown', readByLearner: 'unknown', actualUse: aid.useReport ? 'user_reported' : 'unknown',
        ...(aid.useReport ? { useReport: original(aid.useReport) } : {}) })),
      outcomeReports: data.outcomeReports.map(ref => ({ source: original(ref), observation: 'user_report', externallyVerified: false })),
      artifacts: data.artifacts.map(item => {
        const event = this.repo.evidence(handle, item.source.eventId)!;
        return { kind: item.kind, source: original(item.source), sourceRecordOnly: true,
          observation: event.kind === 'file_import' ? 'imported_record' : event.speaker === 'user' ? 'user_report'
            : event.speaker === 'external' ? 'external_record' : 'model_derivative',
          externallyVerified: false, authorship: 'not_established', independentPerformance: 'not_established', mastery: 'not_established' };
      }),
      unresolved: data.unresolved.map(original), conditions: data.conditions.map(original),
      independenceReports: data.independenceReports.map(ref => ({ source: original(ref), observation: 'user_report', independentlyVerified: false })),
      time: { actualAttemptTime: 'not_established', originalTimeStatement: data.occurredTimeSource ? original(data.occurredTimeSource) : null,
        receivedAt: this.repo.evidence(handle, data.attempt.eventId)!.receivedAt, receivedTimeIsAttemptTime: false },
      coverage: { assistanceHistory: 'not_established', conditionsComplete: 'not_established', independentPerformance: 'not_established', mastery: 'not_established' },
    };
  }

  read(handle: ScopeHandle, raw: z.infer<typeof learningReadInput>, permits?: Permission) {
    this.scope(handle);
    const args = learningReadInput.parse(raw);
    if (args.metadataOnly) {
      if (!args.id || args.compareIds) throw new HarnessError('learning_read_address', "Management metadata reads exactly one identified record.");
      const metadata = this.repo.sourcedWorkMetadata(handle, args.id);
      const current = metadata?.type === 'learning_process' && metadata.kind === 'experience' && metadata.matterId === args.matterId ? metadata : undefined;
      return { status: current ? 'fresh' : 'not_found', matterId: args.matterId,
        ...(current ? { control: { id: current.id, revision: current.revision, status: current.status } } : {}),
        records: [] as WorkRecord[], meaning: "Read only the known learning record's management metadata to retire its current revision. Old bodies were not expanded, and no learning or source use was restored." };
    }
    if (args.id && args.compareIds || args.compareIds && args.compareIds[0] === args.compareIds[1])
      throw new HarnessError('learning_read_address', "Exact reading and two-attempt comparison are distinct. A record cannot establish growth by comparison with itself.");
    const limit = args.limit || 6, offset = args.offset || 0;
    const selected = args.compareIds || (args.id ? [args.id] : undefined);
    const records = selected ? selected.flatMap(recordId => this.repo.workData(handle, ['learning_process'], { id: recordId, matterId: args.matterId, limit: 1 }))
      : this.repo.workData(handle, ['learning_process'], { matterId: args.matterId, statuses: args.includeRetired ? undefined : ['recorded'], offset, limit: limit + 1 });
    const page = selected ? records : records.slice(0, limit), values = page.flatMap(record => {
      const current = this.current(handle, record.id, permits);
      return current && current.data.matterId === args.matterId && (args.includeRetired || current.record.status !== 'retired') ? [current] : [];
    });
    const nextOffset = !selected && records.length > limit ? offset + limit : null;
    let comparison: Record<string, unknown> | undefined;
    if (args.compareIds) {
      const ordered = args.compareIds.map(recordId => values.find(value => value.record.id === recordId));
      const sameOrigin = (left: Locator, right: Locator) => {
        const a = this.repo.evidence(handle, left.eventId), b = this.repo.evidence(handle, right.eventId);
        return !!a && !!b && this.repo.sameSourceOrigin(a, left, b, right);
      };
      const [left, right] = ordered;
      if (!left || !right) comparison = { status: 'not_available', growthEstablished: false, reason: "One side is unreadable. Missing records do not prove there was no attempt or help." };
      else {
        const sameProblem = sameOrigin(left.data.problem, right.data.problem);
        const sameAttemptReport = sameOrigin(left.data.attempt, right.data.attempt);
        const covers = (a: Locator[], b: Locator[]) => a.every(ref => b.some(other => sameOrigin(ref, other)));
        const sameConditions = left.data.conditions.length > 0 && right.data.conditions.length > 0
          && covers(left.data.conditions, right.data.conditions) && covers(right.data.conditions, left.data.conditions);
        comparison = { status: sameAttemptReport ? 'same_attempt_report' : sameProblem ? 'same_problem_process_view' : 'comparability_not_established', ids: args.compareIds,
          sameProblemOrigin: sameProblem, recordedConditions: sameConditions ? 'same_original_conditions' : 'comparability_not_established',
          attemptSources: sameAttemptReport ? 'same_original_report' : 'separate_original_reports', twoIndependentAttemptsEstablished: false,
          conditionsComplete: 'not_established', chronologicalAttemptOrder: 'not_established', assistanceHistoryComplete: 'not_established',
          growthEstablished: false, independentPerformance: 'not_established', mastery: 'not_established',
          meaning: sameAttemptReport ? "Both records derive from the same attempt report. They establish a relationship within that report, not independent evidence of two actual attempts or growth."
            : sameProblem && sameConditions ? "Compare two sourced attempt reports, help and artifacts for the same original problem under recorded conditions. Different addresses do not establish independent performance, complete conditions/help, growth or mastery; each needs evidence."
            : "These sourced processes are shown together, but their problem identity or recorded conditions do not yet match. Original problems and conditions can establish a valid comparison; scores, counts or one difficulty show only part of it." };
      }
    }
    return { status: values.length ? 'fresh' : 'not_found', matterId: args.matterId, items: values.map(value => this.project(handle, value)),
      ...(comparison ? { comparison } : {}), coverage: { nextOffset, complete: nextOffset === null,
        meaning: "This page covers part of the matter in the currently readable scope. Other attempts, help or conditions may remain. This is a preview; exact source addresses support further reading.",
        ...(nextOffset === null ? {} : { read: { tool: 'read_learning', arguments: { ...args, offset: nextOffset } } }) }, meaning,
      records: values.map(value => value.record) };
  }
}
