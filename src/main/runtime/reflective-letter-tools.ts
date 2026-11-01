import * as z from 'zod';
import { HarnessError, type WorkSourceRef } from '../../shared/harness';
import { reflectiveLetterReadInput, reflectiveLetterWriteInput } from '../../shared/reflective-letter';
import type { RunSession, RuntimeCoordinator } from './coordinator';
import type { ReflectiveLetterContext } from './reflective-letter';
import { canonical, codePointSlice } from './semantics';

export const reflectiveLetterToolDefinitions: {
  name: string; description: string; schema: z.ZodType; grant?: string; mutates?: boolean;
}[] = [
  { name: 'write_reflective_letter', grant: 'work:write', mutates: true, schema: reflectiveLetterWriteInput,
    description: "Write a private letter from a real current request or a valid existing entrusted matter explicitly including reflection. begin may use currentQuote for an exact unique host match in delivered current words, or a known source address, choosing one. Determine its window independently from actual relevant material and current request without guessing dates. After begin succeeds, copy the real opportunity address in data.compose.arguments and supply title/paragraphs/coverage for compose; never invent ID/revision. paragraphs[].citations separately cite original experiences; a letter request is not experience evidence. Recall concrete moments, changed tradeoffs, and overlooked details naturally through the current character, rather than a productivity report or personality assessment. Use recall_experience for deep reading; candidates and child directories need original rereads for factual paragraphs. Preserve sourceContext from rehearsal or expression editing: reflect on what was practiced without treating rehearsal lines as sent statements, real promises, or relationship outcomes. Distinguish memory, revisable reflection, wish, and care. With little material, write briefly without inventing shared memories. This saves no personal facts, schedule, or recurring notification." },
  { name: 'read_reflective_letter', grant: 'evidence:read', schema: reflectiveLetterReadInput,
    description: "Return to the same existing private letter using its exact opportunity ID. Current words, corrections, learning process, and source revisions must remain lawful. Rereading restores no old request or notification, proves no viewing, and does not make the letter independent personal-fact evidence." },
];
export const definitions = reflectiveLetterToolDefinitions;
const names = new Set(definitions.map(definition => definition.name));
export type ReflectiveLetterHost = Pick<RuntimeCoordinator, 'repo' | 'policy' | 'context' | 'reflectiveLetters' | 'store'>;
const sourceAddress = (ref: WorkSourceRef): WorkSourceRef => ({ eventId: ref.eventId,
  contentVersion: ref.contentVersion, start: ref.start, end: ref.end });

function permits(host: ReflectiveLetterHost, session: RunSession, ref: WorkSourceRef) {
  try {
    host.policy.validate(session.ingress.contract.scope);
    host.repo.resolveWorkSourceBinding(session.ingress.contract.scope, [ref]);
    const projection = session.attentionEvidenceViews?.[ref.eventId];
    if (!projection) return session.ingress.contract.memoryMode === 'relevant'
      || session.events.some(event => event.id === ref.eventId)
      || host.repo.evidence(session.ingress.contract.scope, ref.eventId)?.sessionId === session.sessionId;
    const event = host.repo.evidence(session.ingress.contract.scope, ref.eventId);
    return !!event && event.contentVersion === ref.contentVersion && projection.contentVersion === ref.contentVersion
      && projection.sourceStart <= ref.start && projection.sourceEnd >= ref.end
      && codePointSlice(event.text, projection.sourceStart, projection.sourceEnd) === projection.quote;
  } catch (error) { if (error instanceof HarnessError) return false; throw error; }
}

/** The same delivered-version/range snapshot is used before purpose review
 * and again before writing; repository reads only recheck that snapshot. */
export function reflectiveLetterContext(host: ReflectiveLetterHost, session: RunSession, signal: AbortSignal): ReflectiveLetterContext {
  const handle = session.ingress.contract.scope, scope = host.policy.require(handle, 'evidence:read');
  const pack = session.pack;
  if (!pack) throw new HarnessError('context_missing', "Reconnect this round's original words before writing the letter.");
  const currentRanges = session.events.flatMap(event => {
    if (!scope.currentEventIds.includes(event.id)) return [];
    const projection = session.attentionEvidenceViews?.[event.id];
    if (projection) return projection.contentVersion === event.contentVersion
      && codePointSlice(event.text, projection.sourceStart, projection.sourceEnd) === projection.quote
      ? [{ eventId: event.id, contentVersion: event.contentVersion, start: projection.sourceStart, end: projection.sourceEnd }] : [];
    return !session.background && event.text.length
      ? [{ eventId: event.id, contentVersion: event.contentVersion, start: 0, end: Array.from(event.text).length }] : [];
  });
  return { sessionId: session.sessionId, receipt: pack.receipt, currentRanges, currentEvents: session.events,
    observations: session.observations || [], deliveredObservationIds: session.deliveredObservationIds || new Set(),
    permits: ref => permits(host, session, ref), signal };
}

export function resolveReflectiveLetterRequest(host: ReflectiveLetterHost, session: RunSession, raw: unknown, signal: AbortSignal) {
  const args = reflectiveLetterWriteInput.parse(raw);
  return args.operation === 'begin'
    ? host.reflectiveLetters.resolveRequest(session.ingress.contract.scope, reflectiveLetterContext(host, session, signal), args) : args;
}

/** As with the other collaboration tools, unmatched names synchronously return
 * undefined. The caller owns ordinary read-purpose gates and changed(). */
export function executeReflectiveLetterTool(host: ReflectiveLetterHost, session: RunSession,
  name: string, raw: unknown, signal: AbortSignal): Promise<unknown> | undefined {
  if (!names.has(name)) return undefined;
  return execute();
  async function execute() {
    signal.throwIfAborted();
    const contract = session.ingress.contract, handle = contract.scope, scope = host.policy.require(handle, 'evidence:read');
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self' || !scope.sources.includes('work:self'))
      throw new HarnessError('letter_scope', "This letter is for the person privately. Do not carry private context into public or another person's conversation.");
    const pack = session.pack;
    if (!pack) throw new HarnessError('context_missing', "Reconnect this round's original words before writing the letter.");
    const args = name === 'read_reflective_letter' ? reflectiveLetterReadInput.parse(raw) : reflectiveLetterWriteInput.parse(raw);
    const writing = name === 'write_reflective_letter';
    if (writing && (session.ephemeral || scope.child || scope.retention !== 'purpose_scoped'))
      throw new HarnessError('letter_retention', "Reflect together in the current conversation without separately saving a private letter for later recovery.");
    if (writing) host.policy.require(handle, 'work:write');
    const context = reflectiveLetterContext(host, session, signal);
    const admit = (value: unknown, usage?: ReturnType<RuntimeCoordinator['reflectiveLetters']['usage']>) => {
      signal.throwIfAborted(); host.policy.validate(handle);
      const text = canonical(value), bytes = Buffer.byteLength(text), tokens = Math.ceil(Array.from(text).length / 1.4);
      if (usage) {
        if (usage.workSourceBindings.some(binding => binding.refs.some(ref => !context.permits!(ref))))
          throw new HarnessError('letter_source_forbidden', "Some evidence used by the letter no longer fits this use. Set the old letter aside.");
        if (usage.reflectiveLetterSources?.some(metadata => !host.reflectiveLetters.metadataReadable(handle, metadata, context.permits)))
          throw new HarnessError('letter_source_changed', "The letter's source material or experiences changed. Return to the original for its current meaning.");
        host.context.recordWorkSourceBindings(pack, usage.workSourceBindings);
        host.context.recordLearningProcesses(pack, usage.learningProcessVersions);
        host.context.recordReflectiveLetterSources(pack, usage.reflectiveLetterSources || []);
        host.context.recordNoteSources(pack, usage.noteSources);
        if (usage.materialReads.length) pack.receipt.materialReads = [...new Map([
          ...(pack.receipt.materialReads || []), ...usage.materialReads,
        ].map(read => [canonical(read), read])).values()];
      }
      pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
      host.repo.saveReceipt(handle, pack.receipt);
      return value;
    };
    if (args.operation === 'begin') {
      if (session.background) throw new HarnessError('letter_current_request', "A background letter follows the valid original request of an actually read opportunity. Old permission words do not become a new current request.");
      const result = host.reflectiveLetters.begin(handle, context, args);
      const value = admit(result, { workSourceBindings: [host.repo.resolveWorkSourceBinding(handle, [sourceAddress(result.data.request.source)])],
        learningProcessVersions: [], materialReads: [], reflectiveLetterSources: [], noteSources: [] });
      host.context.recordObjects(pack, [{ id: result.data.opportunityId, revision: result.data.revision }], 'work');
      host.repo.saveReceipt(handle, pack.receipt);
      return value;
    }
    if (args.operation === 'begin_for_opportunity') {
      const opportunity = host.repo.work(handle, undefined, args.opportunityId)[0];
      const inspected = (session.observations || []).some(observation => observation.tool === 'inspect_help' && !!observation.toolCallId
        && session.deliveredObservationIds?.has(observation.toolCallId) && (observation.result as any)?.discoveryOnly === false
        && Array.isArray((observation.result as any)?.items) && (observation.result as any).items.some((item: any) =>
          item?.opportunity?.id === args.opportunityId && item.opportunity.revision === args.expectedRevision
          && item?.mandate?.id === opportunity?.data.bindingId));
      if (!opportunity || contract.memoryMode !== 'relevant' && opportunity.data.sessionId !== session.sessionId
        || !inspected)
        throw new HarnessError('letter_mandate_not_read', "Read the actual opportunity and original request before judging whether the letter falls within permitted help.");
      const result = host.reflectiveLetters.issueForOpportunity(handle, args.opportunityId, args.expectedRevision, args.window, context.permits);
      const value = admit(result, { workSourceBindings: [host.repo.resolveWorkSourceBinding(handle, [sourceAddress(result.data.request.source)])],
        learningProcessVersions: [], materialReads: [], reflectiveLetterSources: [], noteSources: [] });
      host.context.recordObjects(pack, [{ id: result.data.opportunityId, revision: result.data.revision }], 'work');
      host.repo.saveReceipt(handle, pack.receipt);
      return value;
    }
    if (args.operation === 'compose') {
      // The original prepare transaction validates the draft and its sources.
      const result = host.reflectiveLetters.prepare(handle, context, args, { presentInConversation: !session.background });
      const { usage, conversationHelpRef, ...visible } = result as typeof result & {
        usage?: ReturnType<RuntimeCoordinator['reflectiveLetters']['usage']>;
        conversationHelpRef?: { id: string; revision: number; helpRecordId: string };
      };
      const admitted = admit(visible, usage);
      if (conversationHelpRef) {
        session.conversationHelpRefs = [...new Map([...(session.conversationHelpRefs || []), conversationHelpRef]
          .map(ref => [ref.id + ':' + ref.revision, ref])).values()];
      }
      if (result.letterPrepared) {
        host.context.recordObjects(pack, [{ id: result.id, revision: result.revision }], 'work');
        host.repo.saveReceipt(handle, pack.receipt);
      }
      return admitted;
    }
    const record = host.repo.work(handle, undefined, args.opportunityId)[0];
    if (record && contract.memoryMode !== 'relevant' && record.data.sessionId !== session.sessionId)
      throw new HarnessError('letter_session_scope', "This old letter was not opened within this round's permitted context.");
    const result = host.reflectiveLetters.read(handle, args, context.permits);
    const { usage, ...visible } = result as typeof result & { usage?: ReturnType<RuntimeCoordinator['reflectiveLetters']['usage']> };
    const admitted = admit(visible, usage);
    if (result.status === 'fresh' && result.letter) {
      host.context.recordObjects(pack, [{ id: result.letter.id, revision: result.letter.revision }], 'work');
      host.repo.saveReceipt(handle, pack.receipt);
    }
    return admitted;
  }
}
