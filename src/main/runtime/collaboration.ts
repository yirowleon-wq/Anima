import { createHash } from 'node:crypto';
import * as z from 'zod';
import { HarnessError, type ScopeHandle, type WorkRecord } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import type { WorkService } from './work';
import type { ActionRuntime } from '../actions/runtime';
import type { BasisService } from './basis';
import { canonical, codePointSlice } from './semantics';
import { resolveRetainedSourceQuote, resolveSourceQuote, resolveUniqueQuoteRange } from './source-quote';
import type { OwnedArtifactProof, OwnedArtifactReference } from './study-companion';

const citation = z.object({
  eventId: z.string().max(160), quote: z.string().min(1).max(4000),
  contentVersion: z.number().int().positive().optional(),
  start: z.number().int().nonnegative().optional().describe("Absolute Unicode code-point start of quote in the original. Repeated quotations need an actual complete range or a longer unique exact quotation."),
  end: z.number().int().positive().optional(),
}).strict().superRefine((source, context) => {
  if (['contentVersion', 'start', 'end'].some(field => Object.hasOwn(source, field))
    && (source.contentVersion === undefined || source.start === undefined || source.end === undefined || source.end <= source.start))
    context.addIssue({ code: 'custom', path: ['start'], message: "An original position needs complete contentVersion/start/end, with end after start. An incomplete position cannot be searched again." });
});
const supportedText = z.object({ text: z.string().max(1200), source: citation }).strict();
export const collaborationInput = z.object({
  operation: z.enum(['frame', 'request', 'progress', 'repair', 'withdraw', 'choose', 'experience']),
  selectedOptionId: z.string().max(160).nullable().optional().describe("choose records an existing option ID explicitly selected by the person in this round; use null to withdraw selection. Recovery, comparison, questions, and assistant suggestions remain discussion. This step records choice only; calendar and actual actions proceed separately."),
  id: z.string().max(160).optional(), expectedRevision: z.number().int().positive().optional(),
  expectedOptionRevision: z.number().int().positive().optional().describe("The option revision just read when choosing. Even without chat retention, an independently retained business choice stays bound to this revision."),
  source: citation.optional(),
  title: z.string().min(1).max(160).optional(),
  expectedResult: z.string().max(1600).optional(),
  kind: z.enum(['answer', 'action', 'artifact']).optional().describe("An explanation, comparison, lesson, or shared continuation delivered in this reply is answer. A separately requested draft or reusable saved study work is artifact. A real business-state change such as calendar, reminder, or sending is action. Classify by the result actually requested."),
  frame: z.object({
    question: z.string().max(1200),
    confirmedFacts: z.array(supportedText).max(12),
    decisions: z.array(supportedText).max(12),
    tentativeUnderstanding: z.array(z.string().max(1200)).max(12),
    participation: z.array(z.string().max(600)).max(8),
    rejectedOptions: z.array(z.object({ title: z.string().max(300), reason: z.string().max(800), validWhen: z.string().max(600), source: citation }).strict()).max(12),
    nextStep: z.string().max(1000).nullable(),
  }).strict().optional(),
  status: z.enum(['in_progress', 'waiting_user', 'waiting_external', 'unfulfilled']).optional(),
  reason: z.string().max(1000).optional(),
  actionId: z.string().max(160).optional(),
  affectedIds: z.array(z.string().max(160)).max(24).optional(),
  experience: z.object({
    kind: z.enum(['rejection', 'attempt_report', 'outcome_report', 'reassessment']).describe("Record only the person's original stated reason or report. Intending to try is not trying; an assistant suggestion is not an outcome; a report does not become external verification."),
    optionId: z.string().min(1).max(160), expectedOptionRevision: z.number().int().positive(),
    validWhen: z.string().min(1).max(1000).optional().describe("An exact applicability condition within source.quote. Omit if not explicit; do not summarize or infer a permanent preference."),
    stopWhen: z.string().min(1).max(1000).optional().describe("An exact stopping or reconsideration condition within source.quote. Omit when unknown."),
    recheckAt: z.string().datetime({ offset: true }).nullable().optional().describe("Assistant-proposed reassessment metadata, not a user promise or event time. Creates no reminder. Omit without a suitable time."),
    reassesses: z.string().min(1).max(160).optional().describe("reassessment must identify an existing experience for the same matter and option. A new report does not automatically invalidate old conditions."),
  }).strict().optional(),
}).strict();
export const independentChoiceInput = z.object({
  operation: z.literal('choose'), id: z.string().min(1).max(160), expectedRevision: z.number().int().positive(),
  selectedOptionId: z.string().min(1).max(160), expectedOptionRevision: z.number().int().positive(), source: citation,
}).strict();
export type RequestState = 'pending' | 'in_progress' | 'waiting_user' | 'waiting_external' | 'answered' | 'succeeded' | 'unfulfilled' | 'withdrawn';

/** Open collaboration content uses the existing scoped WorkService and writer. */
export class CollaborationService {
  constructor(private repo: KernelRepository, private work: WorkService, private actions: ActionRuntime, private basis?: BasisService) {}

  private cite(scope: ScopeHandle, source: z.infer<typeof citation>) {
    const evidence = this.repo.evidence(scope, source.eventId);
    if (!evidence || evidence.speaker !== 'user')
      throw new HarnessError('unsupported_evidence', "This record has no corresponding original user statement.");
    const resolved = resolveSourceQuote(evidence, source);
    if (!resolved) throw new HarnessError('unsupported_evidence', "The quotation is not uniquely located, or its original changed. Include more exact context or use the complete original version and range.");
    return { event: evidence, source: resolved };
  }

  private experienceSource(scope: ScopeHandle, source: z.infer<typeof citation>) {
    this.work.policy.require(scope, 'evidence:read');
    const { event, source: resolved } = this.cite(scope, source), range = { start: resolved.start, end: resolved.end };
    const now = Date.parse(this.repo.clock.now());
    if (this.repo.sourceRestrictions(scope, event.id).some(restriction =>
      (!restriction.effectiveFrom || Date.parse(restriction.effectiveFrom) <= now) &&
      (restriction.predicate === '*' || restriction.rangeUnknown || restriction.ranges.some(span =>
        span.contentVersion !== event.contentVersion || span.start < range.end && span.end > range.start))))
      throw new HarnessError('experience_source_changed', "The interpretation of this passage was corrected and cannot be saved again as a current reason. Unaffected passages remain usable.");
    return { event, range };
  }

  private experiences(scope: ScopeHandle, frame: WorkRecord) {
    this.work.policy.require(scope, 'evidence:read');
    const entries = Array.isArray(frame.data.decisionExperiences) ? frame.data.decisionExperiences : [];
    return entries.flatMap(value => {
      const entry = value as Record<string, any>, source = entry.source as { eventId: string; contentVersion: number; start: number; end: number; quoteSha256?: string };
      // Check the original scope before returning any quote, option title or
      // condition. An unreadable old source is not recoverable from this copy.
      if (!source || typeof source.eventId !== 'string') return [];
      const event = this.repo.evidence(scope, source.eventId);
      if (!event) return [];
      const option = typeof entry.optionId === 'string' ? this.repo.work(scope, undefined, entry.optionId)[0] : undefined;
      if (!option || !(frame.data.optionIds as string[] || []).includes(option.id)) return [];
      const pointer = { id: entry.id, kind: entry.kind, optionId: entry.optionId, optionRevision: entry.optionRevision,
        reportedAt: entry.reportedAt, recordedAt: entry.recordedAt, ...(entry.reassesses ? { reassesses: entry.reassesses } : {}),
        requiresReassessment: true, verifiedOutcome: false };
      if (source.contentVersion !== event.contentVersion || !Number.isInteger(source.start) || !Number.isInteger(source.end)
        || source.start < 0 || source.end <= source.start || source.end > Array.from(event.text).length)
        return [{ ...pointer, reviewReason: 'source_changed', meaning: "This experience can still be identified, but its original text or position changed. Its reasons, conditions, and outcome were not expanded." }];
      const quote = codePointSlice(event.text, source.start, source.end);
      // Partial forgetting deliberately retains the source version and masks
      // only the deleted span. A locator must not reclassify that mask as a
      // fresh user report, nor suppress another intact span in the same event.
      if (!source.quoteSha256 || source.quoteSha256 !== createHash('sha256').update(quote).digest('hex'))
        return [{ ...pointer, reviewReason: 'source_changed', meaning: "The original words were deleted or changed. Only the experience address remains; its former body, reasons, and conditions were not returned." }];
      let reviewReason = 'current_conditions_unverified';
      try { this.experienceSource(scope, { eventId: event.id, quote, contentVersion: source.contentVersion, start: source.start, end: source.end }); }
      catch (error) {
        if (!(error instanceof HarnessError) || error.code !== 'experience_source_changed') throw error;
        return [{ ...pointer, reviewReason: 'source_changed', meaning: "The person later corrected this passage's meaning. Only the experience address is returned, without old reasons or conditions." }];
      }
      if (option.revision !== entry.optionRevision) reviewReason = 'option_changed';
      else if (typeof entry.recheckAt === 'string' && Date.parse(entry.recheckAt) <= Date.parse(this.repo.clock.now())) reviewReason = 'recheck_due';
      const condition = (span: unknown) => {
        const range = span as { start?: number; end?: number } | null;
        return range && Number.isInteger(range.start) && Number.isInteger(range.end) && range.start! >= source.start && range.end! <= source.end
          ? codePointSlice(event.text, range.start!, range.end!) : null;
      };
      return [{ ...pointer, source: { ...source, quote }, reportedText: quote, validWhen: condition(entry.validWhen), stopWhen: condition(entry.stopWhen),
        recheckAt: entry.recheckAt ?? null, reviewTimeOrigin: 'assistant_proposed_recheck', observation: 'user_report', currentOptionRevision: option.revision, currentOptionStatus: option.status, reviewReason,
        meaning: reviewReason === 'option_changed'
          ? "These are the reasons, conditions, and events stated then. Inspect what later changed in the option before judging whether the old reason still applies. Calendars and actual actions retain their owners."
          : reviewReason === 'recheck_due'
            ? "The proposed review time arrived. The earlier reasons, conditions, and events are here for reconsideration with current facts; actual outcomes retain their original records."
            : "These reasons, conditions, and events retain their historical context. Use current words and real records for later change. Without a new report, the original reasons still deserve careful reading." }];
    });
  }

  restore(scope: ScopeHandle, sessionId: string, query = '', offset = 0, limit = 8, relation: { relatedTo?: string; relatedOffset?: number } = {}) {
    this.work.policy.require(scope, 'evidence:read');
    const selected = relation.relatedTo ? this.repo.work(scope, undefined, relation.relatedTo).filter(record => record.data.type === 'collaboration_frame' || record.kind === 'goal') : undefined;
    const { items, total, nextOffset } = selected ? { items: selected, total: selected.length, nextOffset: null } : this.repo.collaborationPage(scope, sessionId, query, offset, limit);
    const optionIds = new Set(items.flatMap(record => Array.isArray(record.data.optionIds) ? record.data.optionIds : []));
    const basisUses = items.filter(record => record.kind === 'episode' || record.kind === 'goal').flatMap(record => this.basis?.read(scope, record.id) || []);
    const projected: WorkRecord[] = items.map(record => {
      if (record.data.type !== 'collaboration_frame') return record;
      const experiences = this.experiences(scope, record);
      return { ...record, data: { ...record.data,
        historicalInterpretations: Array.isArray(record.data.tentativeUnderstanding) ? record.data.tentativeUnderstanding : [], tentativeUnderstanding: [],
        interpretationUse: "These are interpretations reached together then, with their evidence. Continue from the current words about today's circumstances and wishes.",
        rejectionUse: "These original words explain why and under which conditions an option was declined. Some older records lack a matching current option; leave that relation unknown. Changed conditions can support fresh discussion.",
        decisionExperiences: experiences,
        decisionExperienceCoverage: { returned: experiences.length,
          meaning: "These are the currently readable experiences of the same option. Some originals are unavailable and retain only identifiable positions. Preserve gaps and individual records; capacity limits report the unsaved step." },
      } };
    });
    const relatedOptions = [...optionIds].flatMap(id => this.repo.work(scope, undefined, String(id)))
      .filter(record => record.data.type !== 'planning_intent');
    const parents = projected.filter(record => record.data.type === 'collaboration_frame' || record.kind === 'goal').map(record => record.id);
    const related = this.repo.relatedWorkPage(scope, parents, relation.relatedOffset || 0, limit);
    return { status: total ? 'fresh' : 'not_found', items: projected, basisUses, relatedOptions, relatedRecords: related.items, nextOffset,
      relatedCoverage: { parentIds: parents, totalMatches: related.total, nextOffset: related.nextOffset, complete: related.nextOffset === null,
        meaning: related.nextOffset === null
          ? "The relevant records available this time have been read through here, each with its source. Continue discussion from them; calendars and external actions remain unchanged."
          : "These records link to the current matter, with another page available. Read the context before continuing today's discussion; calendars and external actions remain unchanged." },
      decisionState: { recordedDecisions: projected.flatMap(record => Array.isArray(record.data.decisions) ? record.data.decisions : []), acceptedOptionIds: relatedOptions.filter(option => option.status === 'accepted').map(option => option.id),
        selectedOptionIds: projected.flatMap(record => typeof record.data.selectedOptionId === 'string' ? [record.data.selectedOptionId] : []),
        meaning: "Historical decisions retain their original options. Recovery or comparison first identifies the current matter; today's choice follows current words. Bring your judgment while keeping suggestions separate from actual user decisions." },
      coverage: { complete: nextOffset === null, totalMatches: total, returned: items.length,
        meaning: nextOffset === null ? "The discovered records have been read through this page. Follow each source for fuller necessary context."
          : "This is one page of discovered records. More remain in the same scope, with original source addresses." } };
  }

  requests(scope: ScopeHandle, sessionId: string, openOnly = false) {
    return this.repo.requestItems(scope, sessionId, openOnly);
  }

  /** The ephemeral source was verified in memory. Keep existing legitimate
   * evidence and only the independent choice; no new quotation/evidence row. */
  chooseIndependent(scope: ScopeHandle, id: string, revision: number, optionId: string, optionRevision: number) {
    const frame = this.repo.work(scope, 'episode', id)[0], option = this.repo.work(scope, undefined, optionId)[0];
    if (!frame || frame.data.type !== 'collaboration_frame' || frame.status !== 'active' || frame.revision !== revision
      || !option || option.revision !== optionRevision) throw new HarnessError('version_conflict', "The matter or option changed. The old choice was not saved.");
    const declaresParent = typeof option.data.episodeId === 'string' || typeof option.data.matterId === 'string';
    if (!(frame.data.optionIds as string[] || []).includes(option.id) || !['option', 'plan'].includes(option.kind)
      || declaresParent && option.data.episodeId !== frame.id && option.data.matterId !== frame.id || ['rejected', 'blocked', 'stale', 'cancelled'].includes(option.status))
      throw new HarnessError('choice_missing', "This option does not belong to a currently available matter. The choice was not saved.");
    const permitted = new Set(this.repo.scope(scope).sources.filter(source => source !== 'current'));
    for (const record of [frame, option]) if (Object.hasOwn(record.data, 'sourceIds')) {
      const sources = record.data.sourceIds;
      if (!Array.isArray(sources) || sources.some(source => typeof source !== 'string' || !permitted.has(source)))
        throw new HarnessError('source_forbidden', "A source used by this matter or option cannot be opened in this round.");
    }
    return this.repo.write(() => {
      this.repo.invalidate(frame.id, 'selection_changed');
      return this.work.update(scope, frame.id, frame.revision, { data: { ...frame.data, selectedOptionId: option.id,
        selection: { optionId: option.id, optionRevision: option.revision, selectedAt: this.repo.clock.now(),
          authorization: 'verified_independent_business_choice', currentConversationRetained: false, actualBusinessEffects: false },
      } });
    });
  }

  update(scope: ScopeHandle, sessionId: string, input: z.infer<typeof collaborationInput>) {
    const args = collaborationInput.parse(input);
    if (args.operation === 'experience') this.work.policy.require(scope, 'evidence:read');
    if (!args.source) throw new HarnessError('source_required', "Point to the original request; a suggestion cannot automatically become the person's task.");
    const { event: evidence, source } = this.cite(scope, args.source);
    args.source = source;
    const old = args.id ? this.repo.work(scope, undefined, args.id)[0] : undefined;
    if (args.id && (!old || !['collaboration_frame', 'request_item'].includes(String(old.data.type)))) throw new HarnessError('work_missing', "No related matter was found for this round.");
    if (old && args.expectedRevision !== old.revision) throw new HarnessError('version_conflict', "The matter changed. Read its current revision first.");
    if (args.operation === 'experience') {
      if (!old || old.data.type !== 'collaboration_frame' || !args.experience)
        throw new HarnessError('experience_required', "Read the same matter and existing option before recording its reason or report.");
      const input = args.experience, option = this.repo.work(scope, undefined, input.optionId)[0];
      if (!option || !['option', 'plan'].includes(option.kind) || !(old.data.optionIds as string[] || []).includes(option.id)
        || option.ownerId !== old.ownerId || option.workspaceId !== old.workspaceId || option.subjectId !== old.subjectId || option.worldId !== old.worldId
        || (typeof option.data.episodeId === 'string' || typeof option.data.matterId === 'string') && option.data.episodeId !== old.id && option.data.matterId !== old.id)
        throw new HarnessError('option_scope', "This option does not belong to the current matter. Its experience was not saved.");
      if (option.revision !== input.expectedOptionRevision) throw new HarnessError('version_conflict', "The option changed. Read its current revision first.");
      const history = Array.isArray(old.data.decisionExperiences) ? old.data.decisionExperiences : [];
      const previous = input.reassesses ? history.find(value => (value as Record<string, any>).id === input.reassesses) as Record<string, any> | undefined : undefined;
      if (input.kind === 'reassessment' && !previous || input.reassesses && (!previous || previous.optionId !== option.id))
        throw new HarnessError('experience_reference', "Reconsideration must address an existing experience for the same matter and option.");
      if (input.kind !== 'reassessment' && input.reassesses)
        throw new HarnessError('experience_reference', "Only a reassessment record can link to an old reason; an outcome report cannot overwrite an earlier experience.");
      const { event, range } = this.experienceSource(scope, args.source);
      const legacyId = 'experience:' + createHash('sha256').update(`${old.id}\0${option.id}\0${input.kind}\0${event.id}\0${event.contentVersion}\0${args.source.quote}`).digest('hex');
      const sameLegacy = history.find(value => {
        const entry = value as Record<string, any>, source = entry.source;
        return entry.id === legacyId && source?.eventId === event.id && source.contentVersion === event.contentVersion
          && source.start === range.start && source.end === range.end;
      }) as Record<string, any> | undefined;
      const id = sameLegacy?.id || 'experience:' + createHash('sha256').update(`${legacyId}\0${range.start}\0${range.end}`).digest('hex');
      const conditionRange = (text: string | undefined) => {
        if (!text) return null;
        const local = resolveUniqueQuoteRange(args.source!.quote, text);
        if (!local) throw new HarnessError('experience_condition_source', "Applicability and stopping conditions need unique exact positions in the selected original words. Expand the condition quotation; unknown conditions may remain empty.");
        return { start: range.start + local.start, end: range.start + local.end };
      };
      const entry = { id, kind: input.kind, optionId: option.id, optionRevision: option.revision,
        source: { eventId: event.id, ...range, contentVersion: event.contentVersion, receivedAt: event.receivedAt,
          quoteSha256: createHash('sha256').update(args.source.quote).digest('hex') },
        reportedAt: event.receivedAt,
        validWhen: conditionRange(input.validWhen), stopWhen: conditionRange(input.stopWhen),
        recheckAt: input.recheckAt ?? null, reviewTimeOrigin: 'assistant_proposed_recheck',
        ...(input.reassesses ? { reassesses: input.reassesses } : {}), observation: 'user_report', verifiedOutcome: false,
      };
      const duplicate = history.find(value => (value as Record<string, any>).id === id) as Record<string, any> | undefined;
      if (duplicate) {
        const { recordedAt: _recordedAt, ...prior } = duplicate;
        if (canonical(prior) !== canonical(entry)) throw new HarnessError('experience_conflict', "This experience's conditions or links differ. The old record was not overwritten. Use new original user words and a reassessment link for a new account.");
        return old;
      }
      if (history.length >= 64) throw new HarnessError('experience_capacity', "This matter already has 64 experiences. Original reasons and conditions remain; no record was overwritten or truncated and this one was not saved.");
      // The frame keeps only locators, never a second copy of private quotes
      // or conditions. Losing one report must not make unrelated work unreadable.
      return this.work.update(scope, old.id, old.revision, {
        data: { ...old.data, decisionExperiences: [...history, { ...entry, recordedAt: this.repo.clock.now() }] } });
    }
    if (args.operation === 'choose') {
      if (!old || old.data.type !== 'collaboration_frame' || args.selectedOptionId === undefined) throw new HarnessError('choice_required', "Read the current matter and its options before selecting.");
      const selectedOptionId = args.selectedOptionId;
      const option = args.selectedOptionId === null ? undefined : this.repo.work(scope, undefined, args.selectedOptionId)[0];
      if (args.selectedOptionId !== null && (!option || !(old.data.optionIds as string[] || []).includes(option.id) || !['option', 'plan'].includes(option.kind) || ['rejected', 'blocked', 'stale', 'cancelled'].includes(option.status))) throw new HarnessError('choice_missing', "This option changed or does not belong to the current matter.");
      if (option && args.expectedOptionRevision !== undefined && option.revision !== args.expectedOptionRevision)
        throw new HarnessError('version_conflict', "This option just changed. Read its current content before deciding how to continue.");
      return this.repo.write(() => {
        this.repo.invalidate(old.id, 'selection_changed');
        return this.work.update(scope, old.id, old.revision, { status: 'active', evidenceIds: [...new Set([...old.evidenceIds, evidence.id])], data: { ...old.data,
          selectedOptionId, selection: { optionId: selectedOptionId, optionRevision: option?.revision ?? null, sourceEventId: evidence.id, selectedAt: this.repo.clock.now(), actualBusinessEffects: false },
        } });
      });
    }
    if (args.operation === 'frame') {
      if (!args.frame) throw new HarnessError('frame_required', "Shared understanding content was not supplied.");
      const sources = [evidence.id];
      for (const item of [...args.frame.confirmedFacts, ...args.frame.decisions, ...args.frame.rejectedOptions]) {
        const { event, source } = this.cite(scope, item.source);
        sources.push(event.id); item.source = source;
      }
      const pointers = Object.fromEntries(['optionIds', 'lastDisplayedOptionIds', 'referencedOptionId', 'focusSequence', 'decisionExperiences'].filter(key => old?.data[key] !== undefined).map(key => [key, old!.data[key]]));
      const selection = old?.data.selection as { sourceEventId?: string } | undefined;
      if (selection?.sourceEventId && this.repo.evidence(scope, selection.sourceEventId)) {
        pointers.selectedOptionId = old!.data.selectedOptionId; pointers.selection = selection; sources.push(selection.sourceEventId);
      } else if ((old?.data.selection as { authorization?: string; optionId?: string })?.authorization === 'verified_independent_business_choice'
        && (old!.data.selection as { optionId?: string }).optionId === old!.data.selectedOptionId) {
        pointers.selectedOptionId = old!.data.selectedOptionId; pointers.selection = old!.data.selection;
      }
      const data = { ...pointers, type: 'collaboration_frame', sessionId, sessionIds: [...new Set([...(Array.isArray(old?.data.sessionIds) ? old.data.sessionIds : []), sessionId])], ...args.frame, source: { ...args.source, receivedAt: evidence.receivedAt, contentVersion: evidence.contentVersion } };
      return old ? this.work.update(scope, old.id, old.revision, { data, status: 'active', title: args.title || old.title, evidenceIds: [...new Set(sources)] })
        : this.work.create(scope, 'episode', args.title || args.frame.question.slice(0, 160), data, { status: 'active', evidenceIds: [...new Set(sources)] });
    }
    if (args.operation === 'request') {
      if (!args.title || !args.kind || !args.expectedResult) throw new HarnessError('request_incomplete', "The request still lacks a specific intended result.");
      if (args.status && !args.reason) throw new HarnessError('request_state_missing', "An unfinished item needs a concrete reason.");
      const legacyId = 'request:' + createHash('sha256').update(`${evidence.id}\0${args.source.quote}\0${args.expectedResult}`).digest('hex');
      const id = 'request:' + createHash('sha256').update(`${legacyId}\0${source.contentVersion}\0${source.start}\0${source.end}`).digest('hex');
      const existing = this.requests(scope, sessionId).find(record => record.id === id || record.id === legacyId
        && canonical(resolveRetainedSourceQuote(evidence, record.data.source)) === canonical(source));
      if (existing) return existing;
      return this.work.create(scope, 'task', args.title, {
        type: 'request_item', sessionId, sessionIds: [sessionId], requestKind: args.kind, source: { ...args.source, receivedAt: evidence.receivedAt, contentVersion: evidence.contentVersion },
        expectedResult: args.expectedResult, state: args.status || 'pending', ...(args.reason ? { reason: args.reason } : {}), resultRefs: [],
      }, { id, status: args.status || 'pending', evidenceIds: [evidence.id] });
    }
    if (!old) throw new HarnessError('work_missing', "Read the matter before updating it.");
    if (args.operation === 'repair') {
      const correctionSource = args.source, correctionReason = args.reason;
      if (!correctionSource || !correctionReason) throw new HarnessError('repair_reason_missing', "The interpretation being corrected is not identified.");
      return this.repo.write(() => {
        this.repo.invalidate(old.id, 'user_correction');
        for (const id of args.affectedIds || []) {
          const affected = this.repo.work(scope, undefined, id)[0];
          if (!affected && !this.actions.get(scope, id))
            throw new HarnessError('repair_scope', "The affected object is outside the current scope.");
          this.repo.invalidate(id, 'user_correction');
          // A corrected option must not remain selectable while the shared
          // matter awaits revalidation. Independent actions retain their own
          // approval and result state.
          if (affected && ['option', 'plan'].includes(affected.kind) && Array.isArray(old.data.optionIds)
            && old.data.optionIds.includes(id) && !['stale', 'rejected', 'cancelled'].includes(affected.status))
            this.work.update(scope, id, affected.revision, { status: 'stale' });
        }
        return this.work.update(scope, old.id, old.revision, { status: 'needs_review', data: { ...old.data, sessionId, tentativeUnderstanding: [], nextStep: null, decisionsNeedRevalidation: true, repair: { source: correctionSource, reason: correctionReason, at: this.repo.clock.now() }, state: 'in_progress' }, evidenceIds: [...new Set([...old.evidenceIds, evidence.id])] });
      });
    }
    if (args.operation === 'withdraw') {
      this.repo.invalidate(old.id, 'request_withdrawn');
      return this.work.update(scope, old.id, old.revision, { status: 'withdrawn', data: { ...old.data, state: 'withdrawn', reason: args.reason || args.source.quote } });
    }
    if (old.data.type === 'collaboration_frame') {
      if (!args.reason || !args.status) throw new HarnessError('progress_required', "Matter progress needs a description of the current change.");
      const options = new Set(Array.isArray(old.data.optionIds) ? old.data.optionIds : []);
      return this.repo.write(() => {
        for (const id of args.affectedIds || []) {
          const option = this.repo.work(scope, undefined, id)[0];
          if (!option || !options.has(id)) throw new HarnessError('option_scope', "The option to reassess does not belong to this matter.");
          this.work.update(scope, option.id, option.revision, { status: option.status === 'rejected' ? 'needs_review' : option.status,
            data: { ...option.data, reassessment: { reason: args.reason!, source: args.source!, at: this.repo.clock.now() }, adoptionUnchanged: true } });
        }
        return this.work.update(scope, old.id, old.revision, { status: 'active', evidenceIds: [...new Set([...old.evidenceIds, evidence.id])],
          data: { ...old.data, latestProgress: { source: args.source!, reason: args.reason!, at: this.repo.clock.now() }, nextStep: args.reason!, decisionsNeedRevalidation: !!args.affectedIds?.length } });
      });
    }
    if (old.data.type !== 'request_item') throw new HarnessError('request_required', "This object is not an explicit request.");
    const revisedRequest = args.expectedResult ? {
      ...old.data, expectedResult: args.expectedResult,
      source: { ...args.source, receivedAt: evidence.receivedAt, contentVersion: evidence.contentVersion },
      sourceHistory: [...(Array.isArray(old.data.sourceHistory) ? old.data.sourceHistory : []), old.data.source].slice(-8),
      ...(args.kind ? { requestKind: args.kind } : {}),
    } : old.data;
    const requestEvidence = [...new Set([...old.evidenceIds, evidence.id])];
    if (args.actionId) {
      const action = this.actions.get(scope, args.actionId);
      const receipts = this.actions.receipts(scope, args.actionId);
      if (!action || action.status !== 'succeeded' || !receipts.some(receipt => receipt.status === 'confirmed_success'))
        throw new HarnessError('receipt_required', "No record confirming this operation succeeded has been found.");
      // Receipt existence is necessary; exact request/parameter correspondence
      // is still checked against the final answer before closing the request.
      return this.work.update(scope, old.id, old.revision, { evidenceIds: requestEvidence, data: { ...revisedRequest, state: 'in_progress', proposedResultRefs: [args.actionId] } });
    }
    if (!args.status || !args.reason) throw new HarnessError('request_state_missing', "An unfinished item needs its concrete state and reason.");
    return this.work.update(scope, old.id, old.revision, { status: args.status, evidenceIds: requestEvidence, ...(args.title ? { title: args.title } : {}), data: { ...revisedRequest, state: args.status, reason: args.reason } });
  }

  /** Called only by the host's final review, never an acting-model tool. */
  finalize(scope: ScopeHandle, record: WorkRecord, state: 'answered' | 'succeeded', responseId: string, actionIds: string[] = [], resolution: {
    kind?: 'answer' | 'action' | 'artifact'; basisQuote?: string; artifactIds?: string[];
    artifacts?: import('../../shared/types').ReleaseArtifact[];
    ownedArtifacts?: OwnedArtifactReference[];
    ownedArtifactProofs?: OwnedArtifactProof[];
  } = {}) {
    let kind = String(record.data.requestKind), data = record.data;
    if (resolution.kind && resolution.kind !== kind) {
      const saved = record.data.source as { eventId?: unknown } | undefined;
      const event = typeof saved?.eventId === 'string' ? this.repo.evidence(scope, saved.eventId) : undefined;
      const retained = event && resolveRetainedSourceQuote(event, saved);
      if (!retained) throw new HarnessError('classification_evidence', "The original request revision or range changed. Old wording was not searched again.");
      const { source } = this.cite(scope, retained);
      const local = resolution.basisQuote && resolveUniqueQuoteRange(source.quote, resolution.basisQuote);
      if (!local) throw new HarnessError('classification_evidence', "Correcting a request category requires unique exact support in the original request passage.");
      const correctionSource = { ...source, quote: resolution.basisQuote!, start: source.start + local.start, end: source.start + local.end };
      this.cite(scope, correctionSource);
      data = { ...data, requestKind: resolution.kind,
        classificationCorrection: { from: kind, to: resolution.kind, quote: correctionSource.quote, source: correctionSource } };
      kind = resolution.kind;
    }
    if (kind === 'action' && state === 'answered') return this.work.update(scope, record.id, record.revision, { status: 'unfulfilled', data: { ...data, state: 'unfulfilled', reason: "The situation was explained; successful execution has not been verified.", resultRefs: [responseId] } });
    if (kind === 'action' && (state !== 'succeeded' || !actionIds.length || actionIds.some(id => !this.actions.receipts(scope, id).some(receipt => receipt.status === 'confirmed_success'))))
      throw new HarnessError('receipt_required', "This operation still lacks a success record and remains unfinished.");
    const artifacts = (resolution.artifactIds || []).map(id => resolution.artifacts?.find(artifact => artifact.id === id && artifact.privacyEpoch === this.repo.epoch && record.evidenceIds.includes(artifact.sourceMessageId)));
    const ownedArtifacts = [...new Map((resolution.ownedArtifacts || []).map(reference =>
      [canonical(reference), reference])).values()].map(reference => {
      const proof = resolution.ownedArtifactProofs?.find(value => value.reference.owner === reference.owner
        && value.reference.id === reference.id && value.reference.revision === reference.revision);
      if (!proof) throw new HarnessError('artifact_required', "This artifact has not been checked at its original saved location. Recover the version actually retained.");
      proof.assertCurrent();
      const saved = data.source as { eventId?: unknown } | undefined;
      const event = typeof saved?.eventId === 'string' ? this.repo.evidence(scope, saved.eventId) : undefined;
      const request = event && resolveRetainedSourceQuote(event, saved);
      const source = proof.reference.requestSource;
      // An old paper from another request cannot satisfy a new save merely
      // because its title or subject looks similar. The owner must retain the
      // actual save's user source, covering this request's exact source span.
      if (!request || source.eventId !== request.eventId || source.contentVersion !== request.contentVersion
        || source.start > request.start || source.end < request.end
        || !proof.reference.sourceBinding.refs.some(ref => canonical(ref) === canonical(source)))
        throw new HarnessError('artifact_request_source', "This artifact has not been matched to the current saving request's original passage. Check this request.");
      return { owner: reference.owner, id: reference.id, revision: reference.revision };
    });
    if (kind === 'artifact' && (artifacts.some(artifact => !artifact) || !artifacts.length && !ownedArtifacts.length))
      throw new HarnessError('artifact_required', "The artifact request is not yet matched to the content actually saved and delivered.");
    const finalState = kind === 'action' ? state : 'answered';
    return this.work.update(scope, record.id, record.revision, { status: finalState, data: { ...data, state: finalState,
      ...(ownedArtifacts.length ? { ownedArtifactRefs: ownedArtifacts } : {}),
      resultRefs: [responseId, ...actionIds, ...artifacts.filter(Boolean).map(artifact => `artifact:${artifact!.id}@${artifact!.revision}`),
        ...ownedArtifacts.map(reference => `owned:${reference.owner}:${reference.id}@${reference.revision}`)] } });
  }
}
