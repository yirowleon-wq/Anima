import { createHash } from 'node:crypto';
import * as z from 'zod';
import {
  HarnessError, workSourceRefSchema, type ContextReceipt, type EvidenceEvent,
  type ScopeHandle, type WorkRecord, type WorkSourceRef,
} from '../../shared/harness';
import {
  reflectiveLetterDocumentSchema, reflectiveLetterMetadataSchema, reflectiveLetterDraftInput, reflectiveLetterReadInput,
  reflectiveLetterRequestInput, reflectiveLetterWindowSchema, reflectiveLetterSourceInput, letterReferenceSchema,
  type ReflectiveLetterCitation, type ReflectiveLetterDocument, type ReflectiveLetterDraftInput,
  type ReflectiveLetterLearningProof, type ReflectiveLetterMaterialProof,
  type ReflectiveLetterNoteProof,
  type ReflectiveLetterOriginalProof, type ReflectiveLetterProof, type ReflectiveLetterView,
  type ReflectiveLetterWindow, type ReflectiveLetterSourceInput, type ReflectiveLetterSourceView, type LetterReference,
} from '../../shared/reflective-letter';
import type { NotePage } from '../../shared/notes';
import type { NoteSourceProof } from '../../shared/notes-source';
import type { KernelRepository } from '../storage/repository';
import type { AttentionService } from './attention';
import type { WorkService } from './work';
import { canonical, codePointSlice } from './semantics';
import { resolveSourceQuote } from './source-quote';

interface Observation { tool: string; toolCallId?: string; requestedArguments?: unknown; result: unknown }
export interface ReflectiveLetterContext {
  sessionId: string;
  receipt: ContextReceipt;
  /** Host original ranges actually sent in the current user context. A scope's
   * currentEventIds alone, or an index preview, does not establish delivery. */
  currentRanges: readonly WorkSourceRef[];
  /** Immutable event versions actually supplied this turn, never refreshed
   * from a newer repository body just to locate the same words. */
  currentEvents?: readonly EvidenceEvent[];
  observations: readonly Observation[];
  /** Populated from messages actually supplied to the main model, not from
   * tool execution or model-authored observation IDs. */
  deliveredObservationIds: ReadonlySet<string>;
  permits?: (ref: WorkSourceRef) => boolean;
  signal?: AbortSignal;
}
export interface ReflectiveLetterDependencies {
  /** Current original resource identity, checked by its existing owner. This
   * is never an instruction to reload or download a resource. */
  materialCurrent?: (handle: ScopeHandle, proof: ReflectiveLetterMaterialProof) => boolean;
  readMaterial?: (handle: ScopeHandle, proof: ReflectiveLetterMaterialProof, signal: AbortSignal) => Promise<unknown>;
  readNote?: (handle: ScopeHandle, proof: ReflectiveLetterNoteProof) => NotePage;
}

const requestDataSchema = z.object({
  version: z.literal(1), window: reflectiveLetterWindowSchema,
  asOf: z.string().datetime({ offset: true }),
  source: workSourceRefSchema.safeExtend({ quoteSha256: z.string().regex(/^[a-f0-9]{64}$/) }),
  authorization: z.enum(['current_request', 'existing_mandate']),
}).strict();
type LetterRequest = z.infer<typeof requestDataSchema>;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const meaning = "This private letter is written in the current character. Life fragments come from actually read sources; interpretation remains revisable. Receipt time differs from event time. Wishes are not promises; generation is not display or reading. The letter saves no personal facts and schedules no recurring review.";
const preparedStatuses = ['prepared', 'question_ready', 'notification_queued'];
const activeOpportunityStatuses = ['candidate', 'waiting', ...preparedStatuses];

function covers(ref: WorkSourceRef, ranges: readonly WorkSourceRef[]) {
  let position = ref.start;
  for (const range of ranges.filter(range => range.eventId === ref.eventId && range.contentVersion === ref.contentVersion)
    .sort((a, b) => a.start - b.start || a.end - b.end)) {
    if (range.start > position) return false;
    position = Math.max(position, range.end);
    if (position >= ref.end) return true;
  }
  return false;
}
const address = (ref: WorkSourceRef): WorkSourceRef => ({ eventId: ref.eventId, contentVersion: ref.contentVersion, start: ref.start, end: ref.end });
const noteAddress = (proof: NoteSourceProof): NoteSourceProof => ({ id: proof.id, revision: proof.revision,
  sha256: proof.sha256, start: proof.start, end: proof.end });
const bodyOf = (paragraphs: { text: string }[]) => paragraphs.map(paragraph => paragraph.text).join('\n\n');

/** A private authored artifact under the existing attention opportunity. The
 * service never runs a model, edits a profile, or installs a periodic job. */
export class ReflectiveLetterService {
  constructor(readonly repo: KernelRepository, readonly work: WorkService,
    readonly attention: AttentionService, private dependencies: ReflectiveLetterDependencies = {}) {}

  private scope(handle: ScopeHandle, write = false) {
    const scope = this.work.policy.require(handle, write ? 'work:write' : 'evidence:read');
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.sources.includes('work:self') || write && (scope.child || scope.retention !== 'purpose_scoped'))
      throw new HarnessError('letter_scope', "Read and write this letter only within the person's currently permitted private scope.");
    return scope;
  }

  private currentOriginal(handle: ScopeHandle, ref: WorkSourceRef, permits?: ReflectiveLetterContext['permits']) {
    const parsed = workSourceRefSchema.parse(address(ref));
    if (permits?.(parsed) === false) throw new HarnessError('letter_source_forbidden', "This passage exceeds the exact fragments permitted for this review.");
    const binding = this.repo.resolveWorkSourceBinding(handle, [parsed]);
    const event = this.repo.evidence(handle, parsed.eventId);
    if (!event || event.contentVersion !== parsed.contentVersion)
      throw new HarnessError('letter_source_changed', "Original words supporting the letter changed. Reread them.");
    return { event, binding, quote: codePointSlice(event.text, parsed.start, parsed.end) };
  }

  /** Resolve only the current request's literal address. Meaning and reading
   * purpose are still decided by the original verifier after this step. */
  resolveRequest(handle: ScopeHandle, context: ReflectiveLetterContext, raw: z.infer<typeof reflectiveLetterRequestInput>) {
    const scope = this.scope(handle, true), input = reflectiveLetterRequestInput.parse(raw);
    context.signal?.throwIfAborted();
    if (input.source) return { operation: input.operation, source: input.source, window: input.window };
    const quote = input.currentQuote!;
    const candidates: { source: WorkSourceRef & { quote: string }; event: EvidenceEvent }[] = [];
    for (const snapshot of context.currentEvents || []) {
      if (!scope.currentEventIds.includes(snapshot.id) || snapshot.speaker !== 'user' || snapshot.authority !== 'user_statement') continue;
      const ranges = context.currentRanges.filter(range => range.eventId === snapshot.id && range.contentVersion === snapshot.contentVersion);
      if (!ranges.length) continue;
      // The original version must still be current; a correction elsewhere in
      // this message cannot silently re-sign its unchanged request sentence.
      const current = this.repo.evidence(handle, snapshot.id);
      if (!current || current.contentVersion !== snapshot.contentVersion || current.text !== snapshot.text)
        throw new HarnessError('letter_current_request_changed', "This round's original request changed. Reconnect current words before writing.");
      const points = Array.from(snapshot.text), selected = Array.from(quote);
      for (let start = 0; start + selected.length <= points.length; start++) {
        const end = start + selected.length;
        if (!covers({ eventId: snapshot.id, contentVersion: snapshot.contentVersion, start, end }, ranges)
          || selected.some((point, index) => points[start + index] !== point)) continue;
        const source = { eventId: snapshot.id, contentVersion: snapshot.contentVersion, start, end, quote };
        if (candidates.some(candidate => canonical(address(candidate.source)) === canonical(address(source))
          || this.repo.sameSourceOrigin(candidate.event, candidate.source, snapshot, source))) continue;
        candidates.push({ source, event: snapshot });
      }
    }
    if (candidates.length !== 1)
      throw new HarnessError('letter_current_quote', candidates.length
        ? "This quotation occurs more than once in the permitted scope. Supply a longer unique exact current letter request or an exact address of actually read original words."
        : "This quotation was not found in delivered current user words. Quote the actual current letter request; old or approximate wording will not substitute.");
    const source = candidates[0].source, resolved = this.currentOriginal(handle, source, context.permits);
    if (resolved.event.speaker !== 'user' || resolved.event.authority !== 'user_statement' || resolved.quote !== quote)
      throw new HarnessError('letter_current_request', "Writing this letter still needs the exact current user request.");
    return { operation: input.operation, source, window: input.window };
  }

  /** Start exactly one requested letter. The attention focus is its original
   * material owner, with no probe, recurring wake, or discovery after this
   * request. Quiet initiative preferences do not block a direct user request. */
  begin(handle: ScopeHandle, context: ReflectiveLetterContext, raw: z.infer<typeof reflectiveLetterRequestInput>) {
    const scope = this.scope(handle, true), input = this.resolveRequest(handle, context, raw);
    context.signal?.throwIfAborted();
    if (!scope.currentEventIds.includes(input.source.eventId) || !covers(input.source, context.currentRanges))
      throw new HarnessError('letter_current_request', "Starting this letter requires the person's request actually supplied this round.");
    const { event, quote } = this.currentOriginal(handle, input.source, context.permits);
    if (event.speaker !== 'user' || event.authority !== 'user_statement' || quote !== input.source.quote)
      throw new HarnessError('letter_current_request', "Old experiences, assistant suggestions, and attachment commands cannot replace the person's current request for reflection.");
    const now = this.repo.clock.now(), asOf = new Date(Math.min(Date.parse(now), Date.parse(input.window.before))).toISOString();
    if (Date.parse(input.window.from) >= Date.parse(asOf))
      throw new HarnessError('letter_future_window', "This review has no past interval to inspect yet. Do not describe a future period as lived experience.");
    const request: LetterRequest = { version: 1, window: input.window, asOf,
      source: { ...address(input.source), quoteSha256: sha(quote) }, authorization: 'current_request' };
    const key = sha(canonical({ source: request.source, window: request.window, sessionId: context.sessionId }));
    return this.repo.write(() => {
      context.signal?.throwIfAborted(); this.scope(handle, true);
      const focusId = 'letter-focus:' + key, opportunityId = 'letter:' + key;
      const previous = this.repo.work(handle, undefined, opportunityId)[0];
      if (previous) {
        if (!activeOpportunityStatuses.includes(previous.status))
          throw new HarnessError('letter_request_ended', "This letter ended. The old request will not restart.");
        return this.requestView(handle, this.opportunity(handle, previous.id, previous.revision));
      }
      this.currentOriginal(handle, input.source, context.permits);
      const sources = [...scope.sources];
      const focus = this.work.create(handle, 'window', "A letter for you", {
        type: 'attention_focus', sessionId: context.sessionId, matterId: null,
        rule: "Write one private reflective letter under the current original request, without starting a recurring review.",
        governingRule: quote, until: null, eventCategory: 'reflective_letter', sources, channel: 'in_app',
        source: { ...address(input.source), quote }, probe: null, publicProbeHash: null,
        wakeAt: [], completedWakes: [], discoveryPending: false, pendingProbe: false,
        nextScanAt: null, lastFingerprint: null, approvedAt: now, requestMode: 'on_request',
        meaning: "Owner of this requested artifact only; no recurring inquiry, future notification, or new action permission.",
      }, { id: focusId, status: 'active', evidenceIds: [event.id] });
      const opportunity = this.work.create(handle, 'window', "A letter for you", {
        type: 'help_opportunity', matterId: focus.id, bindingId: focus.id, sessionId: context.sessionId,
        watchId: 'request:' + key, category: 'reflective_letter',
        facts: { trigger: 'current_letter_request', receivedWindow: input.window, meaning: "The current request, not a newly discovered life fact." },
        fingerprint: key, noveltyKey: key,
        // This is an authored kept artifact, not an ongoing monitor grant.
        // Source withdrawal and explicit stopping continue to govern it.
        expiresAt: '9999-12-31T23:59:59.999Z', channel: 'in_app',
        scope: { sources, epoch: scope.privacyEpoch, policyRevision: scope.policyRevision },
        sourceIds: [], basisIds: [], artifact: null, choice: null, modelReason: null,
        reflectiveLetterRequest: request,
      }, { id: opportunityId, status: 'candidate', evidenceIds: [event.id] });
      for (const [consumerId, producerId, revision] of [[focus.id, event.id, event.contentVersion],
        [opportunity.id, focus.id, focus.revision], [opportunity.id, event.id, event.contentVersion]] as const)
        this.repo.addDependency(handle, { consumerId, producerId, producerRevision: revision, sensitivity: 'privacy', invalidation: 'block' });
      return this.requestView(handle, opportunity);
    });
  }

  /** An already valid review mandate can offer this same artifact type. The
   * caller remains responsible for deciding that the mandate actually asks
   * for reflection; no existing opportunity is reinterpreted by a keyword. */
  issueForOpportunity(handle: ScopeHandle, opportunityId: string, expectedRevision: number,
    window: ReflectiveLetterWindow, permits?: ReflectiveLetterContext['permits']) {
    this.scope(handle, true);
    const period = reflectiveLetterWindowSchema.parse(window), opportunity = this.opportunity(handle, opportunityId, expectedRevision);
    const binding = this.repo.work(handle, undefined, String(opportunity.data.bindingId))[0]!;
    if (binding.data.type !== 'attention_focus') throw new HarnessError('letter_mandate', "This review has no verifiable original entrusted request.");
    const source = binding.data.source as unknown;
    const eventId = source && typeof source === 'object' && 'eventId' in source ? String(source.eventId) : '';
    const event = this.repo.evidence(handle, eventId), exact = event && resolveSourceQuote(event, source);
    if (!event || !exact || event.speaker !== 'user' || event.authority !== 'user_statement')
      throw new HarnessError('letter_mandate', "The original request's user passage position changed. The old review cannot continue.");
    this.currentOriginal(handle, exact, permits);
    const asOf = new Date(Math.min(Date.parse(this.repo.clock.now()), Date.parse(period.before))).toISOString();
    if (Date.parse(period.from) >= Date.parse(asOf)) throw new HarnessError('letter_future_window', "A future window cannot be written as already lived experience.");
    const request: LetterRequest = { version: 1, window: period, asOf,
      source: { ...address(exact), quoteSha256: sha(exact.quote) }, authorization: 'existing_mandate' };
    if (opportunity.data.reflectiveLetterRequest) {
      const previous = requestDataSchema.parse(opportunity.data.reflectiveLetterRequest);
      if (canonical(previous.window) !== canonical(request.window) || canonical(previous.source) !== canonical(request.source))
        throw new HarnessError('letter_window_changed', "This letter is bound to its original review window. A different window needs a separate current opportunity.");
      return this.requestView(handle, opportunity);
    }
    if (opportunity.data.artifact) throw new HarnessError('letter_artifact_exists', "This opportunity already owns an artifact. A letter cannot overwrite it.");
    const next = this.work.update(handle, opportunity.id, opportunity.revision, { data: { ...opportunity.data, reflectiveLetterRequest: request } });
    return this.requestView(handle, next);
  }

  private opportunity(handle: ScopeHandle, id: string, revision?: number) {
    const opportunity = this.repo.work(handle, undefined, id)[0];
    if (!opportunity || opportunity.data.type !== 'help_opportunity' || !activeOpportunityStatuses.includes(opportunity.status)
      || Date.parse(String(opportunity.data.expiresAt)) <= Date.parse(this.repo.clock.now()))
      throw new HarnessError('letter_unavailable', "The letter's original opportunity stopped, expired, or became unreadable.");
    if (revision !== undefined && opportunity.revision !== revision)
      throw new HarnessError('revision_conflict', "This letter changed. Read its current revision.");
    let binding = this.repo.work(handle, undefined, String(opportunity.data.bindingId))[0];
    const visited = new Set<string>();
    while (binding) {
      if (visited.has(binding.id) || binding.status !== 'active'
        || binding.data.until && Date.parse(String(binding.data.until)) <= Date.parse(this.repo.clock.now()))
        throw new HarnessError('letter_mandate_ended', "The original review request stopped. The old letter cannot be published.");
      visited.add(binding.id);
      if (binding.data.type !== 'attention_focus' || !binding.data.matterId) break;
      binding = this.repo.work(handle, undefined, String(binding.data.matterId))[0];
    }
    if (!binding || this.attention.rules(handle, String(opportunity.data.bindingId), String((opportunity.data.facts as { objectId?: string })?.objectId || ''), opportunity.id)
      .some(rule => ['pause', 'stop'].includes(String(rule.data.operation))))
      throw new HarnessError('letter_mandate_ended', "This review is paused or stopped.");
    return opportunity;
  }

  private requestView(handle: ScopeHandle, opportunity: WorkRecord) {
    const request = requestDataSchema.parse(opportunity.data.reflectiveLetterRequest);
    const { event, quote } = this.currentOriginal(handle, request.source);
    if (sha(quote) !== request.source.quoteSha256) throw new HarnessError('letter_source_changed', "This review request changed.");
    return { status: 'fresh' as const, sourceId: event.sourceId, sourceIds: [event.sourceId],
      data: { type: 'reflective_letter_request', opportunityId: opportunity.id, revision: opportunity.revision,
        request, source: { ...address(request.source), sourceId: event.sourceId, quote },
        actualReadRanges: [address(request.source)],
        receivedWindow: request.window, asOf: request.asOf, coverage: 'selected_legal_sources_only',
        compose: { tool: 'write_reflective_letter' as const, arguments: {
          operation: 'compose' as const, opportunityId: opportunity.id, expectedRevision: opportunity.revision,
        } },
        guidance: "Build this letter from real fragments. Use recall_experience for independent deep reading when needed; directories and previews are not originals. Obtain actual fragments through reread before writing factual content. Address the person directly: respond to a concrete boundary, change, or detail and express why you care or what you think, rather than paraphrasing sources into a report. Structured citations and provenance establish source identity. For rehearsal, naturally say “during that practice” instead of repeatedly narrating reading or disclaiming reality. Never turn simulation into a real external exchange. Write through the current character: serious, enthusiastic, funny, brief, uncertain, or open to competing interpretations. Do not evaluate the person by output or require fixed sections." } };
  }

  private originalReadRanges(handle: ScopeHandle, context: ReflectiveLetterContext) {
    const ranges: WorkSourceRef[] = [...context.currentRanges];
    const delivered = context.observations.filter(observation => observation.toolCallId && context.deliveredObservationIds.has(observation.toolCallId));
    for (const observation of delivered) {
      if (observation.tool !== 'read_evidence') continue;
      const result = observation.result as { id?: unknown; version?: unknown; text?: unknown; actualReadRanges?: unknown; status?: unknown } | null;
      if (!result || typeof result.id !== 'string' || !Number.isSafeInteger(result.version) || typeof result.text !== 'string'
        || !Array.isArray(result.actualReadRanges) || ['unknown', 'forbidden', 'failed', 'stale'].includes(String(result.status))) continue;
      const event = this.repo.evidence(handle, result.id);
      if (!event || event.contentVersion !== result.version) continue;
      for (const value of result.actualReadRanges) {
        const parsed = workSourceRefSchema.safeParse(value);
        if (parsed.success && parsed.data.eventId === event.id && parsed.data.contentVersion === event.contentVersion
          && codePointSlice(event.text, parsed.data.start, parsed.data.end) === result.text) ranges.push(parsed.data);
      }
    }
    return { ranges, delivered };
  }

  private originalProof(handle: ScopeHandle, citation: WorkSourceRef & { quote: string }, request: LetterRequest,
    context: ReflectiveLetterContext, ranges: readonly WorkSourceRef[]): ReflectiveLetterOriginalProof {
    if (!covers(citation, ranges))
      throw new HarnessError('letter_original_not_read', "This life passage has not actually been supplied to the main assistant. Read its original address; candidate previews and inquiry directories are not original reads.");
    const { event, quote } = this.currentOriginal(handle, citation, context.permits);
    if (quote !== citation.quote) throw new HarnessError('letter_quote_changed', "The letter citation does not match the current original position.");
    return { kind: 'original', ...address(citation), quoteSha256: sha(quote), sourceId: event.sourceId,
      speaker: event.speaker, authority: event.authority, receivedAt: event.receivedAt,
      ...(event.sourceContext ? { sourceContext: event.sourceContext } : {}),
      receivedInWindow: Date.parse(event.receivedAt) >= Date.parse(request.window.from) && Date.parse(event.receivedAt) < Date.parse(request.asOf) };
  }

  private materialProof(handle: ScopeHandle, citation: Extract<ReflectiveLetterCitation, { kind: 'material' }>,
    context: ReflectiveLetterContext, delivered: readonly Observation[]): ReflectiveLetterMaterialProof {
    const observation = delivered.find(observation => observation.toolCallId === citation.observationId);
    const result = observation?.result as Record<string, any> | undefined, data = result?.data, source = data?.source;
    const args = observation?.requestedArguments as Record<string, any> | undefined;
    const capability = observation?.tool === 'look_up' ? args?.capability : observation?.tool;
    const coverage = data?.coverage;
    if (!observation || capability !== 'materials.read' || !['fresh', 'partial'].includes(result?.status)
      || typeof data?.text !== 'string' || !Number.isSafeInteger(coverage?.start) || !Number.isSafeInteger(coverage?.end)
      || Array.from(data.text).length !== coverage.end - coverage.start || source?.kind !== 'user_selected_file'
      || source.resourceId !== citation.resourceId || source.sha256 !== citation.sha256 || source.version !== citation.version
      || source.sourceEventId !== citation.sourceEventId || source.contentVersion !== citation.contentVersion || source.parentEventId !== citation.parentEventId
      || data.page !== citation.page || citation.start < coverage.start || citation.end > coverage.end
      || codePointSlice(data.text, citation.start - coverage.start, citation.end - coverage.start) !== citation.quote)
      throw new HarnessError('letter_material_not_read', "This material needs an actual original text-layer read this round with exact page/range. A directory, search preview, or prepared image is not a read.");
    if (!context.receipt.materialReads?.some(read => read.capability === 'materials.read' && read.resourceId === citation.resourceId
      && read.sha256 === citation.sha256 && read.version === citation.version && read.page === citation.page
      && read.sourceEventId === citation.sourceEventId && read.parentEventId === citation.parentEventId
      && Number.isSafeInteger(read.start) && Number.isSafeInteger(read.end) && Number(read.start) <= citation.start && Number(read.end) >= citation.end))
      throw new HarnessError('letter_material_not_delivered', "This material has no actual adopted read receipt for this round.");
    const events = [citation.sourceEventId, citation.parentEventId].map(id => this.repo.evidence(handle, id));
    if (events.some(event => !event || !event.text.length) || events[0]!.contentVersion !== citation.contentVersion
      || events[0]!.kind !== 'file_import' || events[0]!.parentEventId !== citation.parentEventId)
      throw new HarnessError('letter_material_changed', "The original file or authorized source changed.");
    const sourceEnvelopeRefs = events.map(event => ({ eventId: event!.id, contentVersion: event!.contentVersion, start: 0, end: Array.from(event!.text).length }));
    for (const ref of sourceEnvelopeRefs) this.currentOriginal(handle, ref, context.permits);
    const proof: ReflectiveLetterMaterialProof = { kind: 'material', resourceId: citation.resourceId, sha256: citation.sha256, version: citation.version,
      sourceEventId: citation.sourceEventId, contentVersion: citation.contentVersion, parentEventId: citation.parentEventId,
      ...(citation.page === undefined ? {} : { page: citation.page }), start: citation.start, end: citation.end,
      quoteSha256: sha(citation.quote), sourceId: String(source.sourceId), sourceEnvelopeRefs };
    if (!this.dependencies.materialCurrent?.(handle, proof))
      throw new HarnessError('letter_material_changed', "The material owner has not confirmed the original file remains readable. A letter copy did not restore it.");
    return proof;
  }

  private noteProof(handle: ScopeHandle, citation: Extract<ReflectiveLetterCitation, { kind: 'note' }>,
    context: ReflectiveLetterContext, delivered: readonly Observation[]): ReflectiveLetterNoteProof {
    const observation = delivered.find(observation => observation.toolCallId === citation.observationId && observation.tool === 'manage_note');
    const args = observation?.requestedArguments as { operation?: unknown } | undefined;
    const page = observation?.result as (NotePage & { sourceId?: unknown }) | undefined;
    if (args?.operation !== 'read' || page?.sourceId !== 'notes:self' || typeof page.body !== 'string'
      || page.note?.id !== citation.id || page.note.revision !== citation.revision || page.note.sha256 !== citation.sha256
      || !Number.isSafeInteger(page.offset) || !Number.isSafeInteger(page.end)
      || Array.from(page.body).length !== page.end - page.offset || citation.start < page.offset || citation.end > page.end
      || codePointSlice(page.body, citation.start - page.offset, citation.end - page.offset) !== citation.quote
      || !context.receipt.noteSources?.some(proof => proof.id === citation.id && proof.revision === citation.revision
        && proof.sha256 === citation.sha256 && proof.start <= citation.start && proof.end >= citation.end))
      throw new HarnessError('letter_note_not_read', "This note page needs actually read body text, revision, and position. A directory title cannot replace its original.");
    const proof: ReflectiveLetterNoteProof = { kind: 'note', sourceId: 'notes:self', id: citation.id,
      revision: citation.revision, sha256: citation.sha256, start: citation.start, end: citation.end, quoteSha256: sha(citation.quote) };
    if (!this.repo.noteSourcesReadable(handle, [noteAddress(proof)]))
      throw new HarnessError('letter_note_changed', "A note page cited by this letter is unreadable.");
    return proof;
  }

  private learningProof(handle: ScopeHandle, citation: Extract<ReflectiveLetterCitation, { kind: 'learning' }>, request: LetterRequest,
    context: ReflectiveLetterContext, ranges: readonly WorkSourceRef[], delivered: readonly Observation[]): ReflectiveLetterLearningProof {
    const provided = delivered.some(observation => observation.tool === 'read_learning'
      && Array.isArray((observation.result as any)?.items) && (observation.result as any).items.some((item: any) => item?.id === citation.id && item.revision === citation.revision));
    const record = this.repo.work(handle, 'experience', citation.id)[0];
    if (!provided || !context.receipt.learningProcessVersions?.some(ref => ref.id === citation.id && ref.revision === citation.revision)
      || !record || record.revision !== citation.revision || record.data.type !== 'learning_process' || record.status !== 'recorded'
      || !record.sourceBinding || !this.repo.learningProcessReadable(handle, record.id, record.revision))
      throw new HarnessError('letter_learning_not_read', "This learning experience needs an actually read still-valid original process. Courses, grades, previews, or assistant answers cannot establish growth.");
    const originals = citation.originals.map(ref => {
      if (!covers(ref, record.sourceBinding!.refs)) throw new HarnessError('letter_learning_source', "The cited words do not belong to this actual learning process.");
      return this.originalProof(handle, ref, request, context, ranges);
    });
    for (const ref of record.sourceBinding.refs) this.currentOriginal(handle, ref, context.permits);
    return { kind: 'learning', id: record.id, revision: record.revision, sourceBinding: record.sourceBinding,
      originals, observation: 'reported_process' };
  }

  validateDraft(handle: ScopeHandle, context: ReflectiveLetterContext, raw: ReflectiveLetterDraftInput) {
    this.scope(handle, true); context.signal?.throwIfAborted();
    const input = reflectiveLetterDraftInput.parse(raw), opportunity = this.opportunity(handle, input.opportunityId, input.expectedRevision);
    const request = requestDataSchema.parse(opportunity.data.reflectiveLetterRequest);
    const currentRequest = this.currentOriginal(handle, request.source, context.permits);
    if (sha(currentRequest.quote) !== request.source.quoteSha256) throw new HarnessError('letter_request_changed', "The original review request changed.");
    const { ranges, delivered } = this.originalReadRanges(handle, context);
    const paragraphs = input.paragraphs.map(paragraph => ({ kind: paragraph.kind, text: paragraph.text,
      sources: paragraph.citations.map(citation => citation.kind === 'original'
        ? this.originalProof(handle, citation, request, context, ranges) : citation.kind === 'material'
          ? this.materialProof(handle, citation, context, delivered) : citation.kind === 'note'
            ? this.noteProof(handle, citation, context, delivered) : this.learningProof(handle, citation, request, context, ranges, delivered)) }));
    const refs = [address(request.source), ...paragraphs.flatMap(paragraph => paragraph.sources.flatMap(proof => this.proofRefs(proof)))];
    const unique = [...new Map(refs.map(ref => [canonical(ref), ref])).values()];
    if (unique.length > 32) throw new HarnessError('letter_source_budget', "This letter uses too many independent sources. Keep genuinely important fragments with their conditions.");
    const binding = this.repo.resolveWorkSourceBinding(handle, unique);
    if (input.coverage.experienceCoverage === 'selected_fragments' && !paragraphs.some(paragraph => paragraph.sources.length))
      throw new HarnessError('letter_coverage', "Without read experiences, do not mark the letter as containing established life fragments.");
    const document: ReflectiveLetterDocument = { version: 1, title: input.title, window: request.window, asOf: request.asOf,
      request: request.source, authorization: request.authorization, paragraphs, sourceBinding: binding,
      coverage: input.coverage, createdAt: this.repo.clock.now(), meaning };
    const validated = reflectiveLetterDocumentSchema.parse(document);
    // Use only host-held observations actually delivered in this run. The
    // request read is enough for an honestly short, non-factual care letter.
    const materialReads = delivered.filter(observation => observation.tool === 'read_evidence'
      || observation.tool === 'read_learning' || observation.tool === 'materials.read'
      || observation.tool === 'manage_note' && (observation.requestedArguments as { operation?: unknown })?.operation === 'read'
      || observation.tool === 'look_up' && (observation.requestedArguments as any)?.capability === 'materials.read'
      || (observation.result as any)?.data?.type === 'reflective_letter_request'
        && (observation.result as any)?.data?.opportunityId === opportunity.id);
    const usedEvents = new Set(binding.refs.map(ref => ref.eventId));
    const observations = materialReads.filter(observation => {
      const result = observation.result as any;
      if (result?.data?.type === 'reflective_letter_request') return true;
      if (observation.tool === 'read_evidence') return usedEvents.has(result?.id);
      if (observation.tool === 'manage_note') return paragraphs.some(paragraph => paragraph.sources.some(proof =>
        proof.kind === 'note' && result?.note?.id === proof.id && result.note.revision === proof.revision && result.note.sha256 === proof.sha256));
      if (observation.tool === 'read_learning') return paragraphs.some(paragraph => paragraph.sources.some(proof => proof.kind === 'learning'
        && result?.items?.some((item: any) => item.id === proof.id && item.revision === proof.revision)));
      return paragraphs.some(paragraph => paragraph.sources.some(proof => proof.kind === 'material' && result?.data?.source?.resourceId === proof.resourceId));
    });
    return { opportunity, document: validated, artifact: { title: input.title, body: bodyOf(paragraphs) }, observations };
  }

  /** Commit through the original prepare path and annotate that same revision
   * inside one transaction. No second cooperation ledger or presentation ACK. */
  prepare(handle: ScopeHandle, context: ReflectiveLetterContext, raw: ReflectiveLetterDraftInput,
    options: { presentInConversation?: boolean } = {}) {
    return this.repo.write(() => {
      const value = this.validateDraft(handle, context, raw);
      if (value.opportunity.data.reflectiveLetter)
        throw new HarnessError('letter_already_prepared', "This letter was completed under its original request. A rewrite begins with a new current user request and does not overwrite the earlier delivered help.");
      if (!value.observations.length)
        throw new HarnessError('letter_material_not_delivered', "Actually deliver this request or relevant originals to the main assistant before saving the letter. Undelivered queries were not treated as evidence.");
      context.signal?.throwIfAborted();
      const decision = this.attention.decide(handle, { id: value.opportunity.id, expectedRevision: value.opportunity.revision,
        choice: 'prepare', reason: "A private reflection requested now, with concrete sources and revisable interpretation.",
        actionDescription: "This letter is written and retained in the person's application.", artifact: value.artifact,
        sourceToolCallIds: value.observations.slice(-12).map(observation => observation.toolCallId!),
        presentInConversation: options.presentInConversation !== false,
      }, value.observations);
      if (decision.choice !== 'prepare') return { ...decision, letterPrepared: false };
      const record = this.repo.work(handle, undefined, decision.id)[0];
      if (!record || record.revision !== decision.revision || !record.data.artifact)
        throw new HarnessError('letter_prepare_changed', "The original preparation changed. Another letter was not saved.");
      const sources = [...new Set([...(record.data.sourceIds as string[] || []), ...value.document.sourceBinding.sourceIds])];
      const grants = [...new Set([...(record.data.requiredGrants as string[] || []), ...value.document.sourceBinding.requiredGrants])];
      const evidenceIds = [...new Set([...record.evidenceIds, ...value.document.sourceBinding.refs.map(ref => ref.eventId)])];
      const provenance = { request: value.document.request, proofs: value.document.paragraphs.flatMap(paragraph => paragraph.sources) };
      const next: WorkRecord = { ...record, evidenceIds, data: { ...record.data, sourceIds: sources, requiredGrants: grants,
        reflectiveLetter: z.json().parse(value.document), reflectiveLetterPreparedRevision: record.revision,
        reflectiveLetterBinding: z.json().parse(value.document.sourceBinding),
        reflectiveLetterProvenance: z.json().parse(provenance) } };
      // This extends the artifact atomically with its original preparation,
      // without creating a revision the presentation reference never saw.
      this.repo.db.prepare('UPDATE h_work SET payload=? WHERE id=? AND revision=?').run(JSON.stringify(next), next.id, next.revision);
      const consumers = [next.id];
      if (typeof next.data.helpRecordId === 'string') {
        const help = this.repo.work(handle, undefined, next.data.helpRecordId)[0];
        if (!help || help.data.type !== 'cooperation_record') throw new HarnessError('letter_help_missing', "This letter lacks its original help record.");
        const enriched = { ...help, evidenceIds: [...new Set([...help.evidenceIds, ...evidenceIds])], data: { ...help.data,
          sourceIds: sources, requiredGrants: grants, reflectiveLetterBinding: z.json().parse(value.document.sourceBinding),
          reflectiveLetterProvenance: z.json().parse(provenance) } };
        this.repo.db.prepare('UPDATE h_work SET payload=? WHERE id=? AND revision=?').run(JSON.stringify(enriched), help.id, help.revision);
        consumers.push(help.id);
      }
      for (const consumerId of consumers) {
        for (const ref of value.document.sourceBinding.refs) this.repo.addDependency(handle, { consumerId,
          producerId: ref.eventId, producerRevision: ref.contentVersion, sensitivity: 'privacy', invalidation: 'block' });
        for (const proof of value.document.paragraphs.flatMap(paragraph => paragraph.sources)) if (proof.kind === 'learning')
          this.repo.addDependency(handle, { consumerId, producerId: proof.id, producerRevision: proof.revision, sensitivity: 'hard', invalidation: 'block' });
      }
      return { ...decision, letterPrepared: true, letter: this.projectRecord(handle, next),
        usage: this.usage(value.document), meaning };
    });
  }

  private proofRefs(proof: ReflectiveLetterProof): WorkSourceRef[] {
    return proof.kind === 'original' ? [address(proof)] : proof.kind === 'material' ? proof.sourceEnvelopeRefs : proof.kind === 'note' ? [] : proof.sourceBinding.refs;
  }

  private proofCurrent(handle: ScopeHandle, proof: ReflectiveLetterProof, permits?: ReflectiveLetterContext['permits']): boolean {
    if (proof.kind === 'note') return this.repo.noteSourcesReadable(handle, [noteAddress(proof)]);
    if (proof.kind === 'material') return proof.sourceEnvelopeRefs.every(ref => {
      this.currentOriginal(handle, ref, permits); return true;
    }) && this.dependencies.materialCurrent?.(handle, proof) === true;
    if (proof.kind === 'learning') {
      // The repository's metadata gate calls this path before selecting a
      // work body. Do not recurse through repo.work / workSourceFilter.
      const filter = this.repo.filter(handle);
      const current = this.repo.db.prepare(`SELECT json_extract(r.payload,'$.sourceBinding') AS binding FROM h_work r
        WHERE ${filter.sql} AND r.id=? AND r.revision=? AND r.status='recorded' AND r.kind='experience'
        AND json_extract(r.payload,'$.data.type')='learning_process'`).get(...filter.params, proof.id, proof.revision);
      return !!current && typeof current.binding === 'string' && canonical(JSON.parse(current.binding)) === canonical(proof.sourceBinding)
        && this.repo.learningProcessReadable(handle, proof.id, proof.revision)
        && proof.sourceBinding.refs.every(ref => { this.currentOriginal(handle, ref, permits); return true; })
        && proof.originals.every(original => this.proofCurrent(handle, original, permits));
    }
    const { event, quote } = this.currentOriginal(handle, proof, permits);
    return sha(quote) === proof.quoteSha256 && event.sourceId === proof.sourceId
      && canonical(event.sourceContext || null) === canonical(proof.sourceContext || null)
      && event.speaker === proof.speaker && event.authority === proof.authority && event.receivedAt === proof.receivedAt;
  }

  /** Metadata-only gate used by the repository before matching, paging or
   * returning any kept letter / cooperation body. It must never call work(). */
  metadataReadable(handle: ScopeHandle, raw: unknown, permits?: ReflectiveLetterContext['permits']): boolean {
    try {
      this.scope(handle);
      const metadata = reflectiveLetterMetadataSchema.parse(raw);
      if (!this.repo.workBindingsReadable(handle, [metadata.binding])) return false;
      const expected = this.repo.resolveWorkSourceBinding(handle, [...new Map([
        address(metadata.request), ...metadata.proofs.flatMap(proof => this.proofRefs(proof)),
      ].map(ref => [canonical(ref), ref])).values()]);
      if (canonical(expected) !== canonical(metadata.binding)) return false;
      for (const ref of metadata.binding.refs) this.currentOriginal(handle, ref, permits);
      const request = this.currentOriginal(handle, metadata.request, permits);
      return sha(request.quote) === metadata.request.quoteSha256
        && metadata.proofs.every(proof => this.proofCurrent(handle, proof, permits));
    } catch (error) {
      if (error instanceof HarnessError || error instanceof z.ZodError || error instanceof SyntaxError) return false;
      throw error;
    }
  }

  /** The host calls this before materials, history, scenes or exports expose a
   * saved body. A source change with the same contentVersion still fails. */
  recordReadable(handle: ScopeHandle, record: WorkRecord, permits?: ReflectiveLetterContext['permits']): boolean {
    if (!record.data.reflectiveLetter && !record.data.reflectiveLetterBinding) return true;
    try {
      const scope = this.scope(handle);
      if (record.ownerId !== scope.principalId || record.workspaceId !== scope.workspaceId || record.subjectId !== scope.subjectId
        || record.worldId !== scope.worldId || record.label.audience !== 'self') return false;
      const provenance = record.data.reflectiveLetterProvenance as { request?: unknown; proofs?: unknown } | undefined;
      if (!this.metadataReadable(handle, { binding: record.data.reflectiveLetterBinding,
        request: provenance?.request, proofs: provenance?.proofs }, permits)) return false;
      if (!record.data.reflectiveLetter) return true;
      const document = reflectiveLetterDocumentSchema.parse(record.data.reflectiveLetter);
      if (canonical(document.sourceBinding) !== canonical(record.data.reflectiveLetterBinding)) return false;
      const request = this.currentOriginal(handle, document.request, permits);
      return sha(request.quote) === document.request.quoteSha256
        && document.paragraphs.every(paragraph => paragraph.sources.every(proof => this.proofCurrent(handle, proof, permits)));
    } catch (error) {
      if (error instanceof HarnessError || error instanceof z.ZodError) return false;
      throw error;
    }
  }

  projectRecord(handle: ScopeHandle, record: WorkRecord, permits?: ReflectiveLetterContext['permits'], historical = false): ReflectiveLetterView | null {
    this.scope(handle);
    if (record.data.type !== 'help_opportunity' || !historical && !preparedStatuses.includes(record.status) || !this.recordReadable(handle, record, permits)) return null;
    const document = reflectiveLetterDocumentSchema.safeParse(record.data.reflectiveLetter);
    const artifact = record.data.artifact as { title?: unknown; body?: unknown } | null;
    if (!document.success || !historical && (!artifact || artifact.title !== document.data.title || artifact.body !== bodyOf(document.data.paragraphs))) return null;
    const current = this.repo.work(handle, undefined, record.id)[0];
    if (!current || current.revision !== record.revision || canonical(current.data.reflectiveLetter) !== canonical(record.data.reflectiveLetter)
      || !historical && canonical(current.data.artifact) !== canonical(artifact)) return null;
    return { id: record.id, revision: record.revision, kind: 'reflective_letter', title: document.data.title,
      body: bodyOf(document.data.paragraphs), window: document.data.window, asOf: document.data.asOf,
      paragraphs: document.data.paragraphs.map(paragraph => ({ kind: paragraph.kind, text: paragraph.text,
        sources: paragraph.sources.flatMap(proof => this.projectProof(handle, proof)) })),
      coverage: document.data.coverage, generatedAt: document.data.createdAt,
      displayed: 'not_established', readByUser: 'not_established', ...(historical && !preparedStatuses.includes(record.status) ? { historical: true as const } : {}), meaning };
  }

  private projectProof(handle: ScopeHandle, proof: ReflectiveLetterProof): ReflectiveLetterView['paragraphs'][number]['sources'] {
    if (proof.kind === 'note') return [{ label: "A passage in your note", read: { tool: 'manage_note', arguments: {
      operation: 'read', input: { id: proof.id, revision: proof.revision, offset: proof.start, limit: proof.end - proof.start } } } }];
    if (proof.kind === 'learning') return [{ label: "The learning process then", read: { tool: 'read_learning',
      arguments: { matterId: String(this.repo.work(handle, 'experience', proof.id)[0]!.data.matterId), id: proof.id } } }];
    if (proof.kind === 'material') return [{ label: "Material read then", read: { tool: 'look_up', arguments: {
      source: 'capability', capability: 'materials.read', arguments: { resourceId: proof.resourceId,
        ...(proof.page === undefined ? {} : { page: proof.page }), offset: proof.start, limit: Math.min(8000, proof.end - proof.start) } } } }];
    return [{ label: proof.sourceContext?.kind === 'relationship_rehearsal' ? "Original words in that rehearsal" : proof.sourceContext?.kind === 'shared_creation' ? "Original words during shared creation" : proof.speaker === 'user' ? "What you said then" : proof.speaker === 'external' ? "The source record then" : "The assistant's expression then",
      receivedAt: proof.receivedAt, read: { tool: 'read_evidence', arguments: { id: proof.eventId, offset: proof.start, limit: Math.min(1200, proof.end - proof.start) } } }];
  }

  read(handle: ScopeHandle, raw: z.infer<typeof reflectiveLetterReadInput>, permits?: ReflectiveLetterContext['permits']) {
    this.scope(handle);
    const input = reflectiveLetterReadInput.parse(raw), opportunity = this.retainedLetter(handle, input.opportunityId, input.expectedRevision);
    const letter = this.projectRecord(handle, opportunity, permits, true);
    return letter ? { status: 'fresh' as const, letter, usage: this.usage(reflectiveLetterDocumentSchema.parse(opportunity.data.reflectiveLetter)), meaning }
      : { status: 'unknown' as const, letter: null, reason: "The letter's evidence changed or is not actually prepared. No old body copy was restored." };
  }

  private retainedLetter(handle: ScopeHandle, id: string, revision?: number) {
    const record = this.repo.work(handle, undefined, id)[0];
    if (!record || record.data.type !== 'help_opportunity' || !record.data.reflectiveLetter)
      throw new HarnessError('letter_unavailable', "This letter cannot currently be opened.");
    if (revision !== undefined && record.revision !== revision) throw new HarnessError('revision_conflict', "The letter changed. Return to the currently retained version.");
    return record;
  }

  /** Original immutable document floor, independent of its envelope state. */
  private preparedRevision(id: string, currentRevision: number, raw: unknown, helpRecordId: unknown): number | undefined {
    if (raw !== undefined && raw !== null) return typeof raw === 'number' && Number.isSafeInteger(raw)
      && raw > 0 && raw <= currentRevision ? raw : undefined;
    // Earlier kept letters predate this scalar. Only an actual saved host
    // help reference can establish their original prepared revision.
    if (typeof helpRecordId !== 'string') return;
    const row = this.repo.db.prepare(`SELECT MIN(CAST(json_extract(h.value,'$.revision') AS INTEGER)) AS revision
      FROM messages m,json_each(m.payload,'$.helpRefs') h WHERE m.role='assistant'
      AND json_extract(h.value,'$.id')=? AND json_extract(h.value,'$.helpRecordId')=?
      AND json_type(h.value,'$.revision')='integer'`).get(id, helpRecordId);
    return typeof row?.revision === 'number' && Number.isSafeInteger(row.revision) && row.revision > 0
      && row.revision <= currentRevision ? row.revision : undefined;
  }

  /** Body-free identity for the existing new-input boundary parser. */
  referenceIdentity(handle: ScopeHandle, raw: LetterReference, sessionId: string) {
    this.scope(handle);
    const input = letterReferenceSchema.parse(raw), filter = this.repo.filter(handle);
    // Before the new utterance's source restrictions are understood, expose
    // only that this address belongs to an assistant letter in this thread.
    // Do not resolve its paragraph, proof originals or material bodies here.
    const row = this.repo.db.prepare(`SELECT r.id,r.revision,json_extract(r.payload,'$.data.reflectiveLetterPreparedRevision') AS prepared_revision,
      json_extract(r.payload,'$.data.helpRecordId') AS help_record_id FROM h_work r WHERE ${filter.sql} AND r.id=? AND r.revision>=?
      AND json_extract(r.payload,'$.data.type')='help_opportunity'
      AND json_type(r.payload,'$.data.reflectiveLetter')='object'
      AND json_extract(r.payload,'$.data.sessionId')=?`).get(...filter.params, input.opportunityId, input.revision, sessionId);
    const prepared = row && this.preparedRevision(String(row.id), Number(row.revision), row.prepared_revision, row.help_record_id);
    if (!row || prepared === undefined || input.revision < prepared)
      throw new HarnessError('letter_reference_missing', "That old letter sentence does not belong to this position in the current conversation.");
    return { origin: 'assistant_letter' as const };
  }

  /** Follow the kept letter's own address. A selected sentence expands only
   * that range; the footer identifies the whole letter without inventing a
   * paragraph selection or promoting its reflections to personal facts. */
  resolveReference(handle: ScopeHandle, raw: LetterReference, context?: {
    sessionId: string; allowCrossSession: boolean; permits?: ReflectiveLetterContext['permits'];
  }) {
    this.scope(handle);
    const input = letterReferenceSchema.parse(raw), record = this.retainedLetter(handle, input.opportunityId);
    const prepared = this.preparedRevision(record.id, record.revision, record.data.reflectiveLetterPreparedRevision, record.data.helpRecordId);
    if (prepared === undefined || input.revision < prepared || input.revision > record.revision)
      throw new HarnessError('letter_reference_changed', "The selected letter revision no longer belongs to this original letter.");
    if (context && !context.allowCrossSession && record.data.sessionId !== context.sessionId)
      throw new HarnessError('letter_reference_scope', "This letter is not in the prior context permitted for expansion this round.");
    if (!this.recordReadable(handle, record, context?.permits)) throw new HarnessError('letter_reference_changed', "A source of this sentence changed. Reconnect currently permitted words.");
    const document = reflectiveLetterDocumentSchema.parse(record.data.reflectiveLetter);
    if ('scope' in input) return {
      text: document.paragraphs.map(paragraph => paragraph.text).join('\n\n'), origin: 'assistant_letter' as const,
      label: "This letter", reference: input, paragraphKind: undefined,
      ...(input.revision === record.revision ? { read: { tool: 'read_reflective_letter' as const, arguments: {
        operation: 'read' as const, opportunityId: record.id, expectedRevision: input.revision,
      } } } : {}),
      ...this.usage(document),
      meaning: "The person is continuing the assistant-written letter. This is its original address without a specific sentence selection. The letter's interpretation is not user agreement or a new experience.",
    };
    const paragraph = document.paragraphs[input.paragraphIndex];
    if (!paragraph || input.end > Array.from(paragraph.text).length || input.end - input.start > 1200)
      throw new HarnessError('letter_reference_range', "The selection no longer falls within this sentence of the letter.");
    const text = codePointSlice(paragraph.text, input.start, input.end);
    if (!text.trim()) throw new HarnessError('letter_reference_range', "Select a sentence to continue discussing.");
    return { text, origin: 'assistant_letter' as const, label: "This sentence in the letter", reference: input, paragraphKind: paragraph.kind,
      ...(input.revision === record.revision ? { read: { tool: 'read_reflective_letter' as const, arguments: {
        operation: 'read' as const, opportunityId: record.id, expectedRevision: input.revision,
      } } } : {}),
      ...this.usage(document),
      meaning: "The person is referring to this sentence previously written by the assistant. Selection is not agreement, a personal fact, or new action permission." };
  }

  /** A native, private footnote opens only a source already adopted by this
   * exact letter. The renderer cannot choose a path, tool, new source or range. */
  async source(handle: ScopeHandle, raw: ReflectiveLetterSourceInput, signal: AbortSignal): Promise<ReflectiveLetterSourceView> {
    this.scope(handle); signal.throwIfAborted();
    const input = reflectiveLetterSourceInput.parse(raw), record = this.retainedLetter(handle, input.opportunityId, input.expectedRevision);
    if (!this.projectRecord(handle, record, undefined, true)) throw new HarnessError('letter_source_changed', "The letter's provenance changed. Return to the current page.");
    const document = reflectiveLetterDocumentSchema.parse(record.data.reflectiveLetter);
    const proof = document.paragraphs[input.paragraphIndex]?.sources[input.sourceIndex];
    if (!proof) throw new HarnessError('letter_source_missing', "This original-statement entry changed.");
    if (!this.proofCurrent(handle, proof)) throw new HarnessError('letter_source_changed', "That historical material cannot currently be expanded.");
    let value: ReflectiveLetterSourceView;
    if (proof.kind === 'note') {
      if (!this.dependencies.readNote) throw new HarnessError('letter_note_unavailable', "This note page cannot currently be opened.");
      const page = this.dependencies.readNote(handle, proof);
      signal.throwIfAborted(); this.scope(handle);
      if (page.note.id !== proof.id || page.note.revision !== proof.revision || page.note.sha256 !== proof.sha256
        || page.offset !== proof.start || page.end !== proof.end || sha(page.body) !== proof.quoteSha256)
        throw new HarnessError('letter_note_changed', "This note differs from the passage used when writing the letter.");
      value = { heading: page.note.title || "That note page", excerpts: [{ label: "The passage read while writing", text: page.body }] };
    } else if (proof.kind === 'material') {
      if (!this.dependencies.readMaterial) throw new HarnessError('letter_material_unavailable', "This original material cannot currently be expanded.");
      const result = await this.dependencies.readMaterial(handle, proof, signal) as { status?: string; data?: { text?: string; page?: number;
        source?: { resourceId?: string; sha256?: string; version?: number }; coverage?: { start?: number; end?: number } } };
      signal.throwIfAborted(); this.scope(handle);
      if (!['fresh', 'partial'].includes(String(result?.status)) || typeof result.data?.text !== 'string'
        || result.data.source?.resourceId !== proof.resourceId || result.data.source.sha256 !== proof.sha256
        || result.data.source.version !== proof.version || result.data.page !== proof.page
        || result.data.coverage?.start !== proof.start || result.data.coverage?.end !== proof.end
        || sha(result.data.text) !== proof.quoteSha256)
        throw new HarnessError('letter_material_changed', "The original material changed since the letter. An old excerpt was not restored.");
      value = { heading: proof.page === undefined ? "Words in that material" : `That material · Page ${proof.page}`,
        excerpts: [{ label: "The passage read then", text: result.data.text }] };
    } else {
      const originals = proof.kind === 'learning' ? proof.originals : [proof];
      value = { heading: proof.kind === 'learning' ? "Original words in that study session" : proof.sourceContext?.kind === 'relationship_rehearsal' ? "Original words in that rehearsal" : proof.sourceContext?.kind === 'shared_creation' ? "Original words during shared creation" : proof.speaker === 'user' ? "What you said then" : "The material then",
        excerpts: originals.map(original => {
          const current = this.currentOriginal(handle, original);
          if (sha(current.quote) !== original.quoteSha256) throw new HarnessError('letter_source_changed', "The original words changed since the letter was written.");
          return { label: original.sourceContext?.kind === 'relationship_rehearsal' ? "Written during rehearsal or expression editing" : original.sourceContext?.kind === 'shared_creation' ? "Written during shared creation" : original.speaker === 'user' ? "You said then" : original.speaker === 'assistant' ? "The assistant's expression then" : "The record then",
            text: current.quote, receivedAt: original.receivedAt };
        }) };
    }
    signal.throwIfAborted();
    const current = this.retainedLetter(handle, input.opportunityId, input.expectedRevision);
    if (!this.recordReadable(handle, current) || canonical(current.data.reflectiveLetter) !== canonical(record.data.reflectiveLetter))
      throw new HarnessError('letter_source_changed', "The letter's provenance changed while returning to the original words.");
    return value;
  }

  usage(document: ReflectiveLetterDocument) {
    const proofs = document.paragraphs.flatMap(paragraph => paragraph.sources);
    return { workSourceBindings: [document.sourceBinding], learningProcessVersions: proofs.flatMap(proof =>
      proof.kind === 'learning' ? [{ id: proof.id, revision: proof.revision }] : []),
      noteSources: proofs.flatMap(proof => proof.kind === 'note' ? [noteAddress(proof)] : []),
      reflectiveLetterSources: [{ binding: document.sourceBinding, request: document.request, proofs }],
      materialReads: proofs.flatMap(proof => proof.kind === 'material' ? [{ capability: 'materials.read', resourceId: proof.resourceId,
        sha256: proof.sha256, version: proof.version, sourceEventId: proof.sourceEventId, parentEventId: proof.parentEventId,
        ...(proof.page === undefined ? {} : { page: proof.page }), start: proof.start, end: proof.end, complete: false }] : []) };
  }
}
