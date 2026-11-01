import * as z from 'zod';
import { companionManageInput, companionReadInput } from '../../shared/companion-continuity';
import { companionSessionReadSchema, companionSessionWriteSchema } from '../../shared/companion-session';
import { studyCompanionInput } from '../../shared/study-companion';
import { HarnessError, type WorkRecord, type WorkSourceBinding, type WorkSourceRef } from '../../shared/harness';
import type { DiscussionModuleRef } from '../../shared/discussion-scene';
import type { RunSession, RuntimeCoordinator } from './coordinator';
import type { StudyCompanionContext } from './study-companion';
import { canonical, codePointSlice } from './semantics';
import { resolveSourceQuote } from './source-quote';

export interface LifeCollaborationDefinition {
  name: string;
  description: string;
  schema: z.ZodType;
  grant?: string;
  mutates?: boolean;
}

export const definitions: LifeCollaborationDefinition[] = [
  { name: 'read_companion', grant: 'evidence:read', schema: companionReadInput,
    description: "Recover an unfinished shared topic, expression, or the person's feedback about your expression. Search by name or read an exact address. Conversation can continue without a next step, task, or deadline. Reading does not require resumption or turn an old feeling or single comment into a lasting personal judgment." },
  { name: 'manage_companion', grant: 'work:write', mutates: true, schema: companionManageInput,
    description: "Keep an entry for worthwhile topics, expressions actually used together, and the person's real feedback. Revise, continue, park, or end under today's words. Original user statements establish the meaning; your suggestion alone does not establish shared use. Preserve concrete relationship provenance without affection scores or mood profiles. An explicit wish to reuse a conversational method can use manage_method with conversation purpose. Persona core, calendars, and background contact retain separate choices." },
  { name: 'read_companion_session', grant: 'evidence:read', schema: companionSessionReadSchema,
    description: "Recover where you reached on the same work, the help wanted then, remaining material, and a small return step. Open originals through their sources before continuing today's work. Actual attempts and results establish progress. To stop shared work, reading current state suffices." },
  { name: 'manage_companion_session', grant: 'work:write', mutates: true, schema: companionSessionWriteSchema,
    description: "Start, checkpoint, park, resume, or finish an existing shared matter. Listen, organize, hint, or do according to the current request. This tracks shared-work progress; calendars, fixed reminders, and business actions retain their original owners." },
  { name: 'read_study_companion', grant: 'evidence:read', schema: studyCompanionInput.options[1],
    description: "Open the original problem, earlier attempt, and explained steps on the same study page, including earlier process pages. Use for content recovery without changing its method or stopping point." },
  { name: 'study_companion', grant: 'evidence:read', mutates: true, schema: studyCompanionInput,
    description: "Keep the original problem, the person's attempt, and this lesson on one study page with a return point. Recover or create a shared matter through update_collaboration.frame; its id is matterId, while a separately registered request has its own id. source retains the complete current save/correction request; the problem has its own real source in an actually read chat passage, note, or file page. Revise the same page, change help, park, or finish while retaining history. Save or present the native study view as needed. A finite quadratic a*x²+b*x+c can accompany it when appropriate, with coefficients and input controlling height and slope together. Distinguish the real problem from an illustrative example. Small hint, guided step, and full explanation follow the depth actually requested." },
];
export const lifeCollaborationToolDefinitions = definitions;
const names = new Set(definitions.map(definition => definition.name));
export type LifeCollaborationHost = Pick<RuntimeCoordinator,
  'repo' | 'policy' | 'context' | 'companionContinuity' | 'companionSessions' | 'studyCompanion' | 'scenes' | 'store'>;

function exactPermits(host: LifeCollaborationHost, session: RunSession, source: WorkSourceRef) {
  const handle = session.ingress.contract.scope;
  try {
    host.policy.validate(handle);
    host.repo.resolveWorkSourceBinding(handle, [source]);
    const view = session.attentionEvidenceViews?.[source.eventId];
    if (!view) return true;
    const event = host.repo.evidence(handle, source.eventId);
    return !!event && event.contentVersion === source.contentVersion && view.contentVersion === source.contentVersion
      && view.sourceStart <= source.start && view.sourceEnd >= source.end
      && codePointSlice(event.text, view.sourceStart, view.sourceEnd) === view.quote;
  } catch (error) { if (error instanceof HarnessError) return false; throw error; }
}

function inConversation(record: WorkRecord, sessionId: string) {
  return record.data.sessionId === sessionId || Array.isArray(record.data.sessionIds) && record.data.sessionIds.includes(sessionId);
}

/** Check cited fragments and actual old replies before a writer can preserve
 * them. This is range enforcement; the main model still understands meaning. */
function checkInputSources(host: LifeCollaborationHost, session: RunSession, input: unknown) {
  if (!input || typeof input !== 'object') return;
  if (Array.isArray(input)) { for (const value of input) checkInputSources(host, session, value); return; }
  const value = input as Record<string, unknown>, handle = session.ingress.contract.scope;
  if (typeof value.eventId === 'string' && typeof value.quote === 'string') {
    const event = host.repo.evidence(handle, value.eventId), source = event && resolveSourceQuote(event, value);
    if (!source || !exactPermits(host, session, { eventId: source.eventId, contentVersion: source.contentVersion, start: source.start, end: source.end }))
      throw new HarnessError('life_source_scope', "Only the original passage permitted for shared viewing in this round is returned.");
  }
  if (typeof value.messageId === 'string' && typeof value.quote === 'string'
    && typeof value.start === 'number' && typeof value.end === 'number') {
    const reply = host.repo.learningAssistantSource(handle, { messageId: value.messageId, start: value.start, end: value.end, quote: value.quote });
    if (!reply || reply.sourceRefs.some(source => !exactPermits(host, session, source)))
      throw new HarnessError('life_source_scope', "Some sources used by the old reply are not fully readable this round. Return to permitted fragments.");
  }
  if (Array.isArray(value.learningProcessRefs)) for (const linked of value.learningProcessRefs) {
    const ref = linked as { id?: unknown; revision?: unknown }, record = typeof ref.id === 'string' ? host.repo.work(handle, 'experience', ref.id)[0] : undefined;
    if (!record || record.revision !== ref.revision || !record.sourceBinding
      || record.sourceBinding.refs.some(source => !exactPermits(host, session, source)))
      throw new HarnessError('life_source_scope', "This attempt process exceeds the currently opened scope. Return through the original matter to the permitted portion.");
  }
  for (const nested of Object.values(value)) checkInputSources(host, session, nested);
}

function modulePointer(record: WorkRecord): DiscussionModuleRef | undefined {
  if (!record.sourceBinding || typeof record.data.matterId !== 'string') return;
  const owner = record.data.type === 'companion_session' ? 'co_work'
    : record.data.type === 'study_companion' ? 'study_companion' : undefined;
  if (!owner) return;
  return { owner, id: record.id, revision: record.revision, matterId: record.data.matterId, sourceBinding: record.sourceBinding };
}

/** The outer coordinator owns verifyReadPurpose when ingress requires it and
 * changed() after a successful write. Existing manage_method remains the only
 * local-delegation gate for saving a future conversational habit. */
export function executeLifeCollaborationTool(
  host: LifeCollaborationHost, session: RunSession, name: string, raw: unknown, signal: AbortSignal,
): Promise<unknown> | undefined {
  if (!names.has(name)) return undefined;
  return execute();
  async function execute() {
    signal.throwIfAborted();
    const contract = session.ingress.contract, handle = contract.scope, scope = host.policy.require(handle, 'evidence:read');
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self' || !scope.sources.includes('work:self'))
      throw new HarnessError('life_scope', "This shared topic or study material was not opened in this round. The current conversation can continue.");
    const pack = session.pack;
    if (!pack) throw new HarnessError('context_missing', "Reconnect this conversation before returning to the shared passage.");
    const permits = (ref: WorkSourceRef) => exactPermits(host, session, ref), allowCrossSession = contract.memoryMode === 'relevant';
    const persona = host.store.settings().persona;
    const readScope = { sessionId: session.sessionId, allowCrossSession, persona };
    const observations = (session.observations || []).filter(observation => !!observation.toolCallId
      && session.deliveredObservationIds?.has(observation.toolCallId));
    const studyContext: StudyCompanionContext = { sessionId: session.sessionId,
      ...(!allowCrossSession ? { restrictToSessionId: session.sessionId } : {}), observations,
      noteSources: pack.receipt.noteSources || [], signal, permits };
    const definition = definitions.find(item => item.name === name)!;
    const args = definition.schema.parse(raw) as Record<string, any>;
    const writing = name.startsWith('manage_') || name === 'study_companion' && args.operation !== 'read';
    if (writing && (session.ephemeral || scope.child || session.background))
      throw new HarnessError('life_retention', "Work together in the current conversation without separately retaining relationship or study records for later recovery.");
    if (writing) {
      host.policy.require(handle, 'work:write');
      checkInputSources(host, session, args);
    }
    const permittedRecords = (records: WorkRecord[]) => records.filter(record => record.sourceBinding
      && record.sourceBinding.refs.every(permits) && (allowCrossSession || inConversation(record, session.sessionId)));
    const ensureMatter = (matterId: string) => {
      const matter = host.repo.work(handle, 'episode', matterId)[0];
      if (!matter && host.repo.work(handle, undefined, matterId)[0]?.data.type === 'request_item')
        throw new HarnessError('life_matter_kind', "This needs the shared study matter; the supplied object is a separately registered request. Recover or create the shared matter before attaching the page.");
      if (!matter || matter.data.type !== 'collaboration_frame' || !allowCrossSession && !inConversation(matter, session.sessionId)
        || matter.sourceBinding && matter.sourceBinding.refs.some(ref => !permits(ref)))
        throw new HarnessError('life_matter_scope', "Prior context for this matter is not open this round. Return to permitted content.");
      return matter;
    };
    const admit = (value: unknown, records: WorkRecord[] = [], bindings: WorkSourceBinding[] = [], options: {
      history?: boolean;
    } = {}) => {
      signal.throwIfAborted(); host.policy.validate(handle);
      for (const record of records) {
        if (!record.sourceBinding || record.sourceBinding.refs.some(ref => !permits(ref)))
          throw new HarnessError('life_changed', "The earlier content changed. Recover from the current starting point.");
        if (record.data.type === 'collaboration_frame') host.companionContinuity.assertCurrent(handle, record.id, record.revision);
        else if (record.data.type === 'companion_session') host.companionSessions.assertCurrent(handle, record.id, record.revision, String(record.data.matterId), permits);
        else if (record.data.type === 'study_companion') host.studyCompanion.assertCurrent(handle, record.id, record.revision, studyContext);
        else throw new HarnessError('life_owner', "Open this material through its original reading entry.");
      }
      if (bindings.some(binding => binding.refs.some(ref => !permits(ref))))
        throw new HarnessError('life_source_scope', "Some sources used by this reply are unreadable this round. The old body was not returned.");
      const text = canonical(value), bytes = Buffer.byteLength(text), tokens = Math.ceil(Array.from(text).length / 1.4);
      host.context.recordWorkSources(pack, records);
      host.context.recordWorkSourceBindings(pack, bindings);
      if (options.history) pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), 'history:self'])];
      pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
      host.repo.saveReceipt(handle, pack.receipt);
      return value;
    };

    if (name === 'read_companion') {
      const { providedRecords, assistantSourceBindings: _allReplyBindings, ...view } = host.companionContinuity.restore(handle, args, readScope);
      const allowed = permittedRecords(providedRecords), allowedIds = new Set(allowed.map(record => record.id));
      const items = view.items.filter(item => allowedIds.has(item.id));
      // Reply bindings are independent of the user's own feedback. Withhold a
      // target outside this projection without losing the permitted feedback.
      const replyBindings: WorkSourceBinding[] = [];
      let withheldTarget = false;
      const visibleItems = items.map(item => {
        const target = item.replyTarget;
        if (!target || typeof target.quote !== 'string' || typeof target.messageId !== 'string'
          || typeof target.start !== 'number' || typeof target.end !== 'number') return item;
        const original = host.repo.learningAssistantSource(handle, { messageId: target.messageId,
          start: target.start, end: target.end, quote: target.quote });
        if (!original || original.sourceRefs.some(source => !permits(source))) {
          withheldTarget = true;
          return { ...item, replyTarget: null };
        }
        replyBindings.push(host.repo.resolveWorkSourceBinding(handle, original.sourceRefs));
        return item;
      });
      const projected = { ...view, items: visibleItems,
        ...(view.items.length && !visibleItems.length ? { status: 'unavailable',
          meaning: "The topic position was found, but permitted context is insufficient to open its body. Continue the current conversation." } : {}),
        coverage: { ...view.coverage, returned: visibleItems.length, someUnavailable: visibleItems.length !== view.items.length || withheldTarget } };
      return admit(projected, allowed, replyBindings, { history: replyBindings.length > 0 });
    }
    if (name === 'manage_companion') {
      if (!['remember', 'pause', 'close'].includes(args.operation)) {
        const prior = host.companionContinuity.restore(handle, { id: args.id, includeInactive: true }, readScope);
        if (!permittedRecords(prior.providedRecords).length) throw new HarnessError('life_matter_scope', "This topic cannot be recovered through this round's permitted context yet.");
      }
      const { records, ...result } = host.companionContinuity.manage(handle, { sessionId: session.sessionId, ephemeral: session.ephemeral, persona }, args);
      const read = { tool: 'read_companion', arguments: { id: result.id, expectedRevision: result.revision, includeInactive: true } };
      return admit({ ...result, read }, permittedRecords(records));
    }
    if (name === 'read_companion_session' || name === 'manage_companion_session') {
      if (!args.metadataOnly && args.operation !== 'stop') ensureMatter(args.matterId);
      if (writing && !['begin', 'stop'].includes(args.operation)) {
        const prior = host.companionSessions.read(handle, { matterId: args.matterId, id: args.id }, permits);
        if (!permittedRecords(prior.records).length) throw new HarnessError('life_matter_scope', "Sources used at the old stopping point are not fully readable this round. Return to a permitted original.");
      }
      const result = writing ? host.companionSessions.write(handle, session.sessionId, args as z.infer<typeof companionSessionWriteSchema>)
        : host.companionSessions.read(handle, args as z.infer<typeof companionSessionReadSchema>, permits);
      const { records, scene, checkpoint: _storedCheckpoint, ...view } = result as {
        records: WorkRecord[]; scene?: unknown; checkpoint?: unknown; id?: string; revision?: number; status: string; [key: string]: unknown;
      };
      const allowed = permittedRecords(records), pointer = allowed[0] ? modulePointer(allowed[0]) : undefined;
      const visible = records.length && !allowed.length ? { status: 'not_available', matterId: args.matterId,
        meaning: "The previous stopping position remains, but some sources are unreadable this round. The body was not returned." }
        : { ...view, ...(scene ? { coWork: scene } : {}), ...(pointer ? { discussionModule: pointer } : {}) };
      return admit(visible, allowed, [], { history: allowed.some(record => Array.isArray(record.data.sourceIds) && record.data.sourceIds.includes('history:self')) });
    }

    // Only real tool replies already delivered across a model boundary may
    // establish what material the actor has read or seen. Calls in flight and
    // same-batch siblings are deliberately excluded.
    if (args.matterId) ensureMatter(args.matterId);
    const result = await host.studyCompanion.execute(handle, args as z.infer<typeof studyCompanionInput>, studyContext);
    signal.throwIfAborted(); host.policy.validate(handle);
    const { records, ...view } = result;
    const allowed = permittedRecords(records), ids = new Set(allowed.map(record => record.id));
    const items = view.items.filter(item => ids.has(item.id));
    const pointers = allowed.flatMap(record => { const pointer = modulePointer(record); return pointer ? [pointer] : []; });
    return admit({ ...view, items, ...(pointers.length ? { discussionModules: pointers } : {}),
      ...(view.items.length !== items.length && 'coverage' in view
        ? { coverage: { ...view.coverage, someUnavailable: true } } : {}),
      ...(view.items.length && !items.length ? { status: 'unavailable',
        meaning: "The page address was found, but its body cannot return this round. Check saving through the original learning matter; the current conversation remains available." } : {}) }, allowed);
  }
}
