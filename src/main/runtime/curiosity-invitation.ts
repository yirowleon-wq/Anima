import { randomUUID } from 'node:crypto';
import { HarnessError, type EvidenceEvent, type ScopeHandle, type WorkRecord, type WorkSourceBinding, type WorkSourceRef } from '../../shared/harness';
import { curiosityInvitationInput, curiositySeedSchema, type CuriosityInvitationInput, type CuriosityInvitationView,
  type CuriosityPublicSource, type CuriositySeed, type CuriositySource } from '../../shared/curiosity-invitation';
import type { KernelRepository } from '../storage/repository';
import type { PolicyKernel } from './policy';
import { canonical, codePointSlice } from './semantics';
import { curiosityFollowupReferenceSchema, curiosityChapterAddressSchema, curiosityHistoryReadSchema, curiosityHistoryCatalogSchema, type CuriosityFollowupReference, type CuriosityChapterAddress } from '../../shared/curiosity-source';
import { storySettingSnapshotSchema } from '../../shared/story-setting';
import { publicStoryPlace, retainStorySetting, type PublicSettingMap } from './story-setting';
import { noteSourceProofSchema, type NoteSourceProof } from '../../shared/notes-source';
import type { VerifiedSelection } from '../../shared/scenes';

export interface CuriosityObservation { tool: string; requestedArguments?: unknown; result: unknown; toolCallId?: string }
export interface CuriosityContext {
  sessionId: string;
  events: EvidenceEvent[];
  ephemeral: boolean;
  allowCrossSession?: boolean;
  observations: readonly CuriosityObservation[];
  deliveredObservationIds: ReadonlySet<string>;
  /** Host-held original note dependencies actually adopted by this run. */
  noteSources?: readonly NoteSourceProof[];
  /** Only SceneService's current public-map selection, never model arguments. */
  storySettingSelection?: VerifiedSelection['storySetting'];
  permits?: (ref: WorkSourceRef) => boolean;
}
export interface CuriosityResult {
  value: Record<string, unknown>;
  records: WorkRecord[];
  bindings: WorkSourceBinding[];
  assistantWorkSources?: CuriosityChapterAddress[];
}

const choices: CuriosityInvitationView['choices'] = [
  { intent: 'continue', label: "Keep playing together" }, { intent: 'another', label: "Try something fresh" }, { intent: 'put_aside', label: "Set this aside" },
];
const body = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : undefined;
const plainData = (value: unknown): WorkRecord['data'] => JSON.parse(JSON.stringify(value));
const member = (record: WorkRecord, sessionId: string) => record.data.sessionId === sessionId
  || Array.isArray(record.data.sessionIds) && record.data.sessionIds.includes(sessionId);
const creationBody = (view: CuriosityInvitationView) => ({ title: view.title, opening: view.opening,
  experience: view.experience, firstMove: view.firstMove, origin: view.origin, publicSources: view.publicSources,
  ...(view.setting ? { setting: view.setting } : {}) });

/** One invitation in the original frame/option store. The model supplies the
 * interesting thing; this owner never infers hobbies, trains a recommender,
 * starts a timer or turns a choice to play into a business acceptance. */
export class CuriosityInvitationService {
  constructor(readonly repo: KernelRepository, readonly policy: PolicyKernel,
    private readonly publicMap: () => PublicSettingMap | undefined = () => undefined) {}

  private owner(handle: ScopeHandle, write = false) {
    const scope = write ? this.policy.require(handle, 'work:write') : this.policy.require(handle, 'evidence:read');
    if (scope.child || scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self')
      throw new HarnessError('curiosity_scope', "This exploration is available only in the person's private conversation.");
    if (write && (!scope.sources.includes('work:self') || scope.retention !== 'purpose_scoped'))
      throw new HarnessError('curiosity_retention', "You can play together now without saving an exploration record for later recovery.");
    return scope;
  }

  private source(handle: ScopeHandle, context: CuriosityContext, ref: CuriositySource) {
    const scope = this.owner(handle), event = context.events.find(item => item.id === ref.eventId);
    if (!event || event.status !== 'active' || !scope.currentEventIds.includes(event.id)
      || event.speaker !== 'user' || event.authority !== 'user_statement'
      || event.parentEventId || !['user_message', 'user_control'].includes(event.kind)
      || event.ownerId !== scope.principalId || event.subjectId !== scope.principalId || event.worldId !== 'real'
      || event.contentVersion !== ref.contentVersion || ref.end > Array.from(event.text).length
      || codePointSlice(event.text, ref.start, ref.end) !== ref.quote
      || context.permits?.(ref) === false)
      throw new HarnessError('curiosity_source', "This step has not been matched to the person's current wish to explore, continue, change, or set aside. Prior interests and your ideas can inform understanding; the current choice still needs their words.");
    if (!context.ephemeral && scope.retention === 'purpose_scoped' && scope.sources.includes('work:self')
      && scope.grants.includes('work:write')) this.repo.resolveWorkSourceBinding(handle, [this.ref(ref)]);
    return event;
  }
  private ref(ref: CuriositySource): WorkSourceRef {
    return { eventId: ref.eventId, contentVersion: ref.contentVersion, start: ref.start, end: ref.end };
  }

  private materials(handle: ScopeHandle, context: CuriosityContext, seed: CuriositySeed): CuriosityPublicSource[] {
    if (seed.origin === 'created') return [];
    const scope = this.policy.require(handle, 'evidence:read');
    if (!scope.sources.includes('web:public')) throw new HarnessError('curiosity_public_scope', "Public research is unavailable this round. You can still create together, clearly identifying fiction.");
    const sources = seed.citations.map(citation => {
      const observation = context.observations.find(item => item.toolCallId === citation.observationId
        && context.deliveredObservationIds.has(citation.observationId));
      const args = body(observation?.requestedArguments), result = body(observation?.result), data = body(result?.data);
      const capability = observation?.tool === 'look_up' ? args?.capability : observation?.tool;
      if (capability !== 'research.read' || result?.sourceId !== 'web:public' || result.simulated !== false
        || !['fresh', 'partial'].includes(String(result.status)) || typeof data?.text !== 'string'
        || !data.text.includes(citation.quote) || typeof data.url !== 'string'
        || typeof result.fetchedAt !== 'string' || !Number.isFinite(Date.parse(result.fetchedAt)))
        throw new HarnessError('curiosity_public_source', "This public claim has not been found in original material actually read this round. Open the source or create something that does not depend on that unverified fact.");
      let url: URL;
      try { url = new URL(data.url); } catch { throw new HarnessError('curiosity_public_source', "The original public-source address is unavailable."); }
      if (url.protocol !== 'https:' || url.username || url.password)
        throw new HarnessError('curiosity_public_source', "This public material needs an actually read HTTPS address without embedded account credentials.");
      return { observationId: citation.observationId, url: url.href,
        title: typeof data.title === 'string' && data.title.trim() ? data.title.trim().slice(0, 400) : url.hostname,
        quote: citation.quote, fetchedAt: result.fetchedAt,
        ...(typeof data.resourceId === 'string' ? { resourceId: data.resourceId } : {}) };
    });
    return [...new Map(sources.map(source => [source.observationId + '\u0000' + source.quote, source])).values()];
  }

  private record(handle: ScopeHandle, id: string, kind: WorkRecord['kind'], title: string, status: string,
    data: unknown, binding: WorkSourceBinding, old?: WorkRecord): WorkRecord {
    const scope = this.owner(handle, true);
    return { id, kind, ownerId: scope.principalId, workspaceId: scope.workspaceId, subjectId: scope.subjectId,
      worldId: 'real', revision: old ? old.revision + 1 : 1, status, title,
      evidenceIds: [...new Set(binding.refs.map(ref => ref.eventId))], sourceBinding: binding,
      label: { purpose: scope.purposes[0], audience: 'self', retention: 'purpose_scoped', sensitivity: 'personal', infer: false },
      data: plainData({ ...body(data), recordedAt: old?.data.recordedAt || this.repo.clock.now(), updatedAt: this.repo.clock.now() }) };
  }

  private current(handle: ScopeHandle, context: CuriosityContext, id: string) {
    this.owner(handle);
    const option = this.repo.work(handle, 'option', id)[0];
    if (!option || option.data.type !== 'curiosity_invitation' || !option.sourceBinding || typeof option.data.matterId !== 'string')
      throw new HarnessError('curiosity_missing', "This starting point is unavailable. Begin a fresh experience suited to the current wish.");
    if (option.data.noteSources !== undefined && (option.data.materialNoteContractVersion !== 1
      || !this.repo.noteSourcesReadable(handle, option.data.noteSources)))
      throw new HarnessError('curiosity_source_changed', "A note page cited by this creation is unreadable.");
    const frame = this.repo.work(handle, 'episode', option.data.matterId)[0];
    if (!frame || frame.data.type !== 'collaboration_frame' || frame.data.curiosityInvitation !== true || !frame.sourceBinding
      || !Array.isArray(frame.data.optionIds) || !frame.data.optionIds.includes(option.id)
      || !context.allowCrossSession && !member(frame, context.sessionId)
      || [...frame.sourceBinding.refs, ...option.sourceBinding.refs].some(ref => context.permits?.(ref) === false))
      throw new HarnessError('curiosity_source_changed', "The original invitation or its sources cannot be fully opened this round. Continue from permitted portions.");
    if (!this.repo.workBindingsReadable(handle, [frame.sourceBinding, option.sourceBinding]))
      throw new HarnessError('curiosity_source_changed', "This experience's current sources changed. Continue within still-permitted content.");
    for (const address of this.chapterSources(option)) this.historicalChapter(handle, context, address);
    return { frame, option };
  }

  private chapterSources(option: WorkRecord): CuriosityChapterAddress[] {
    const raw = option.data.assistantWorkSources ?? (option.data.continuedFrom ? [option.data.continuedFrom] : []);
    if (!Array.isArray(raw)) throw new HarnessError('curiosity_history_changed', "The original work's provenance cannot be fully recovered now.");
    return raw.map(value => curiosityChapterAddressSchema.parse(value));
  }

  private view(frame: WorkRecord, option: WorkRecord): CuriosityInvitationView {
    const seed = curiositySeedSchema.parse(option.data.seed);
    const status: CuriosityInvitationView['status'] = ['put_aside', 'replaced'].includes(option.status)
      ? option.status as 'put_aside' | 'replaced'
      : frame.status === 'active' && ['offered', 'playing'].includes(option.status)
        ? option.status as 'offered' | 'playing' : 'historical';
    const publicSources = Array.isArray(option.data.publicSources) ? option.data.publicSources as unknown as CuriosityPublicSource[] : [];
    return { id: option.id, revision: option.revision, matterId: frame.id, matterRevision: frame.revision, status,
      title: seed.title, opening: seed.opening, experience: seed.experience, firstMove: seed.firstMove, origin: seed.origin,
      originLabel: seed.origin === 'created' ? "A shared creation" : seed.origin === 'public' ? "A public-source discovery" : "Public discovery and shared creation",
      publicSources, presentation: 'experience_first', choices: ['offered', 'playing'].includes(status) && frame.status === 'active' ? [...choices] : [],
      ...(option.data.setting ? { setting: storySettingSnapshotSchema.parse(option.data.setting) } : {}),
      meaning: "Continue, try another, or set it aside according to the current answer. This experience is not a long-term goal, interest, subscription, or accepted arrangement. Shared fiction remains fictional. Public sources retain their reading time; check opening hours, cost, and present conditions before a real outing or purchase." };
  }

  read(handle: ScopeHandle, context: CuriosityContext, id: string): CuriosityResult {
    const { frame, option } = this.current(handle, context, id);
    const view = this.view(frame, option);
    if (view.origin !== 'created') {
      const citations = view.publicSources.flatMap(source => {
        const match = context.observations.find(observation => {
          if (!observation.toolCallId || !context.deliveredObservationIds.has(observation.toolCallId)) return false;
          const args = body(observation.requestedArguments), result = body(observation.result), data = body(result?.data);
          return (observation.tool === 'research.read' || observation.tool === 'look_up' && args?.capability === 'research.read')
            && result?.sourceId === 'web:public' && result.simulated === false && ['fresh', 'partial'].includes(String(result.status))
            && data?.url === source.url && typeof data.text === 'string' && data.text.includes(source.quote);
        });
        return match?.toolCallId ? [{ observationId: match.toolCallId, quote: source.quote }] : [];
      });
      if (citations.length !== view.publicSources.length || !citations.length) return {
        value: { status: 'needs_public_refresh', id: option.id, revision: option.revision,
          matterId: frame.id, matterRevision: frame.revision,
          publicRead: view.publicSources.map(source => ({ tool: 'look_up', arguments: {
            source: 'capability', capability: 'research.read', arguments: { url: source.url, view: 'text' } } })),
          meaning: "The earlier public source has not been reread this round. Follow publicRead to its original address. If unavailable, create together while distinguishing creation from real discovery.",
        }, records: [frame, option], bindings: [] };
      view.publicSources = this.materials(handle, context, { ...curiositySeedSchema.parse(option.data.seed), citations });
    }
    return { value: { status: 'available', curiosity: view }, records: [frame, option], bindings: [], assistantWorkSources: this.chapterSources(option) };
  }

  private historicalChapter(handle: ScopeHandle, context: CuriosityContext, address: CuriosityChapterAddress) {
    const scope = this.policy.require(handle, 'evidence:read');
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.sources.includes('history:self') || !scope.sources.includes('work:self'))
      throw new HarnessError('curiosity_history_scope', "The original chapter of this shared work has not been opened in this round.");
    const chapter = this.repo.assistantHistoricalWorks(handle, { ...address, limit: 1, permits: context.permits,
      ...(context.allowCrossSession ? {} : { sessionId: context.sessionId }) })[0];
    if (!chapter || !context.allowCrossSession && chapter.sessionId !== context.sessionId
      || chapter.scene.provenance.sourceBinding.refs.some(ref => context.permits?.(ref) === false))
      throw new HarnessError('curiosity_history_changed', "The chapter's source or scope changed. The current work did not substitute for the old original.", 'read');
    return chapter;
  }

  /** Immutable original scene text, explicitly an assistant/shared work. A new
   * current seed cannot silently replace an early chapter in this read. */
  readHistory(handle: ScopeHandle, context: CuriosityContext, raw: unknown): CuriosityResult {
    const input = curiosityHistoryReadSchema.parse(raw), chapter = this.historicalChapter(handle, context, input);
    const view = chapter.scene.view, points = Array.from(view[input.field]), end = Math.min(points.length, input.offset + input.limit);
    if (input.offset > points.length) throw new HarnessError('curiosity_history_range', "This position exceeds the chapter body. Reread within its original range.", 'read');
    const address = { messageId: chapter.messageId, sceneId: chapter.scene.id, sceneRevision: chapter.scene.revision };
    return { value: { status: 'available', ...address, title: view.title, origin: 'shared_creation',
      owner: { id: view.id, revision: view.revision, matterId: view.matterId, matterRevision: view.matterRevision },
      field: input.field, text: points.slice(input.offset, end).join(''),
      coverage: { start: input.offset, end, total: points.length, complete: input.offset === 0 && end === points.length },
      next: end < points.length ? { tool: 'read_shared_creation', arguments: { ...address, field: input.field, offset: end, limit: input.limit } } : null,
      fields: (['opening', 'experience', 'firstMove'] as const).map(field => ({ field, length: Array.from(view[field]).length,
        read: { tool: 'read_shared_creation', arguments: { ...address, field, offset: 0, limit: input.limit } } })),
      fromChapter: address,
      ...(view.setting ? { setting: view.setting,
        settingMeaning: "This public map setting was selected when that chapter was written. Story events remain fictional. Check whether the map changed before presenting it now." } : {}),
      currentWork: { tool: 'restore_collaboration', arguments: { id: view.matterId } },
      meaning: "This is the original chapter written together then; its events remain within the work. The current work was not reverted. Set-aside invitations, interest records, reminders, and actions were not restored. Continue the same work from today's new wish." },
      records: [], bindings: [chapter.scene.provenance.sourceBinding], assistantWorkSources: [address] };
  }

  history(handle: ScopeHandle, context: CuriosityContext, raw: unknown): CuriosityResult {
    const scope = this.policy.require(handle, 'evidence:read'), input = curiosityHistoryCatalogSchema.parse(raw);
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.sources.includes('history:self') || !scope.sources.includes('work:self'))
      throw new HarnessError('curiosity_history_scope', "Earlier shared-work material has not been opened in this round.");
    const page = this.repo.assistantHistoricalWorkPage(handle, { ...input, permits: context.permits,
      ...(context.allowCrossSession ? {} : { sessionId: context.sessionId }) });
    const addresses = page.items.map(chapter => ({ messageId: chapter.messageId, sceneId: chapter.scene.id, sceneRevision: chapter.scene.revision }));
    return { value: { status: page.items.length ? 'available' : page.complete ? 'not_found' : 'partial',
      items: page.items.map((chapter, index) => ({ ...addresses[index], title: chapter.scene.view.title, origin: 'shared_creation',
        createdAt: chapter.createdAt,
        owner: { id: chapter.scene.view.id, revision: chapter.scene.view.revision, matterId: chapter.scene.view.matterId, matterRevision: chapter.scene.view.matterRevision },
        fields: (['opening', 'experience', 'firstMove'] as const).map(field => ({ field, length: Array.from(chapter.scene.view[field]).length })),
        read: { tool: 'read_shared_creation', arguments: addresses[index] } })),
      coverage: { complete: page.complete, bodyRead: false, order: input.order },
      next: page.nextCursor ? { tool: 'read_shared_creation', arguments: { ...input, operation: 'history', cursor: page.nextCursor } } : null,
      meaning: "This page recovers chapter titles and addresses. Open each body through read. oldest/latest follows real message order, not a score of people or works. Continue an empty page when next exists. Finding or reading an old chapter does not restart invitations or actions." },
      records: [], bindings: page.items.map(chapter => chapter.scene.provenance.sourceBinding), assistantWorkSources: addresses };
  }

  /** The next user utterance can refer to this exact shared experience without
   * treating the old public text as newly read. Actual adoption still uses read(). */
  referenceIdentity(handle: ScopeHandle, raw: CuriosityFollowupReference, context: { sessionId: string; allowCrossSession?: boolean }) {
    const scope = this.owner(handle), ref = curiosityFollowupReferenceSchema.parse(raw);
    if (!scope.sources.includes('work:self')) throw new HarnessError('curiosity_scope', "This work is outside the current conversation scope.");
    if (ref.chapter) {
      const identity = this.repo.assistantHistoricalWorkIdentity(handle, { ...ref.chapter,
        ...(context.allowCrossSession ? {} : { sessionId: context.sessionId }) });
      if (!identity || identity.owner.id !== ref.id || identity.owner.revision !== ref.revision
        || identity.owner.matterId !== ref.matterId || identity.owner.matterRevision !== ref.matterRevision)
        throw new HarnessError('curiosity_reference_missing', "This reference does not match an identifiable original chapter.");
      return { origin: 'created' as const };
    }
    const optionFilter = this.repo.filter(handle, 'r'), frameFilter = this.repo.filter(handle, 'f');
    // The admission parser receives only an object's identity/origin. Never
    // select seed prose, resolve a focus, call view/read or open its originals.
    const row = this.repo.db.prepare(`SELECT json_extract(r.payload,'$.data.seed.origin') AS origin
      FROM h_work r JOIN h_work f ON f.id=json_extract(r.payload,'$.data.matterId')
      WHERE ${optionFilter.sql} AND ${frameFilter.sql} AND r.id=? AND r.revision=? AND f.id=? AND f.revision=?
      AND r.kind='option' AND json_extract(r.payload,'$.data.type')='curiosity_invitation'
      AND f.kind='episode' AND json_extract(f.payload,'$.data.type')='collaboration_frame'
      AND json_extract(f.payload,'$.data.curiosityInvitation')=1
      AND EXISTS(SELECT 1 FROM json_each(f.payload,'$.data.optionIds') option_ref WHERE option_ref.value=r.id)
      AND (? OR json_extract(f.payload,'$.data.sessionId')=? OR EXISTS(SELECT 1 FROM json_each(f.payload,'$.data.sessionIds') member WHERE member.value=?))
      AND NOT EXISTS(SELECT 1 FROM json_each(r.payload,'$.sourceBinding.sourceIds') src WHERE src.value NOT IN (SELECT value FROM json_each(?)))
      AND NOT EXISTS(SELECT 1 FROM json_each(f.payload,'$.sourceBinding.sourceIds') src WHERE src.value NOT IN (SELECT value FROM json_each(?)))
      AND NOT EXISTS(SELECT 1 FROM json_each(r.payload,'$.sourceBinding.requiredGrants') grant_ref WHERE grant_ref.value NOT IN (SELECT value FROM json_each(?)))
      AND NOT EXISTS(SELECT 1 FROM json_each(f.payload,'$.sourceBinding.requiredGrants') grant_ref WHERE grant_ref.value NOT IN (SELECT value FROM json_each(?)))`)
      .get(...optionFilter.params, ...frameFilter.params, ref.id, ref.revision, ref.matterId, ref.matterRevision,
        context.allowCrossSession ? 1 : 0, context.sessionId, context.sessionId,
        JSON.stringify(scope.sources), JSON.stringify(scope.sources), JSON.stringify(scope.grants), JSON.stringify(scope.grants));
    if (!row || !['created', 'public', 'mixed'].includes(String(row.origin)) || this.repo.hasFence(ref.id) || this.repo.hasFence(ref.matterId))
      throw new HarnessError('curiosity_reference_missing', "This experience does not belong to this position in the current conversation.");
    return { origin: row.origin as 'created' | 'public' | 'mixed' };
  }

  resolveReference(handle: ScopeHandle, raw: CuriosityFollowupReference, context: CuriosityContext) {
    const reference = curiosityFollowupReferenceSchema.parse(raw);
    if (reference.chapter) {
      const chapter = this.historicalChapter(handle, context, reference.chapter), view = chapter.scene.view;
      if (reference.id !== view.id || reference.revision !== view.revision || reference.matterId !== view.matterId
        || reference.matterRevision !== view.matterRevision)
        throw new HarnessError('curiosity_history_identity', "This reference does not match that original chapter. The current work did not replace it.");
      const focus = reference.focus;
      if (focus && focus.end > Array.from(view[focus.field]).length)
        throw new HarnessError('curiosity_history_range', "This quotation does not match this position in that chapter.");
      return { reference, projection: { ...reference, status: 'historical', origin: 'shared_creation', title: view.title,
        ...(focus ? { focus: { ...focus, text: codePointSlice(view[focus.field], focus.start, focus.end), origin: 'shared_creation' } } : {}),
        read: { tool: 'read_shared_creation', arguments: reference.chapter },
        currentWork: { tool: 'restore_collaboration', arguments: { id: view.matterId } },
        meaning: "The person refers to the chapter in the original message. A same-named current passage may have changed. Read the original through read, then use fromChapter to continue the same work with the new wish. This reference did not revert the work or reselect an old option. Fiction remains fictional." },
        records: [], bindings: [chapter.scene.provenance.sourceBinding], assistantWorkSources: [reference.chapter] };
    }
    const { frame, option } = this.current(handle, context, reference.id);
    if (option.id !== reference.id || option.revision !== reference.revision || frame.id !== reference.matterId
      || frame.revision !== reference.matterRevision)
      throw new HarnessError('curiosity_changed', "The experience changed. An old reference did not overwrite its current content.", 'read');
    const seed = curiositySeedSchema.parse(option.data.seed);
    const focus = reference.focus;
    if (focus && focus.end > Array.from(seed[focus.field]).length)
      throw new HarnessError('curiosity_focus_changed', "This sentence changed. Select its current position again.", 'read');
    const focusReadable = !focus || seed.origin === 'created' || this.read(handle, context, option.id).value.status === 'available';
    const focused = focus ? { ...focus, ...(focusReadable
      ? { text: codePointSlice(seed[focus.field], focus.start, focus.end), origin: seed.origin === 'created' ? 'shared_creation' : seed.origin,
        meaning: "This is the current position within a work, separate from the person's real experience. Public claims follow material actually read this round." }
      : { status: 'read_required', meaning: "The old work position was found. Related public original material has not been reopened this round." }) } : undefined;
    return { reference,
      projection: { ...reference, ...(focused ? { focus: focused } : {}), status: option.status,
        read: { tool: 'curiosity_invitation', arguments: { operation: 'read', id: option.id } },
        meaning: "The current words continue this same experience. Its address is available; open the body and public sources through read. A set-aside invitation was not restored and no new interest judgment was saved. Respond to today's wish and read prior context when needed." },
      records: [frame, option], bindings: [frame.sourceBinding!, option.sourceBinding!], assistantWorkSources: this.chapterSources(option) };
  }

  private retainPublicSources(handle: ScopeHandle, context: CuriosityContext, sources: CuriosityPublicSource[]): WorkSourceRef[] {
    const scope = this.owner(handle, true);
    // These are exact excerpts of real, delivered public reads, not another
    // facts store or an ingestion path for child summaries/model claims.
    return sources.map(source => {
      const id = randomUUID(), event = this.repo.ingest(handle, { id, ownerId: scope.principalId,
        workspaceId: scope.workspaceId, subjectId: scope.subjectId, worldId: 'real', sourceId: 'web:public',
        contentVersion: 1, status: 'active', text: source.quote, speaker: 'external', kind: 'tool_result', authority: 'source_record',
        roots: [id], label: { purpose: scope.purposes[0], audience: 'self', retention: 'purpose_scoped', sensitivity: 'public', infer: false },
        locator: { kind: 'structured', snapshotId: source.resourceId || source.observationId,
          jsonPointer: '/data/text', sourceRecordId: source.observationId },
        receivedAt: source.fetchedAt, sessionId: context.sessionId });
      return { eventId: event.id, contentVersion: event.contentVersion, start: 0, end: Array.from(event.text).length };
    });
  }

  private stop(handle: ScopeHandle, context: CuriosityContext, input: Extract<CuriosityInvitationInput, { operation: 'put_aside' }>): CuriosityResult {
    // Closing an existing invitation keeps no new private body. A temporary
    // conversation must not force the user to retain chat just to put it down.
    this.owner(handle); this.policy.require(handle, 'work:write'); this.source(handle, context, input.source);
    const operationKey = 'curiosity-stop:' + input.id + ':' + input.source.eventId + ':' + input.source.contentVersion
      + ':' + input.source.start + ':' + input.source.end;
    const repeated = this.repo.operation<{ id: string; revision: number; matterId: string; matterRevision: number }>(operationKey);
    if (repeated) return { value: { status: 'already_put_aside', ...repeated, repeated: true,
      meaning: "This experience is already set aside. Repeating this operation does not reopen it or cancel independent arrangements." }, records: [], bindings: [] };
    const option = this.repo.sourcedWorkMetadata(handle, input.id);
    const frame = option?.matterId ? this.repo.sourcedWorkMetadata(handle, option.matterId) : undefined;
    if (!option || option.kind !== 'option' || option.type !== 'curiosity_invitation' || !frame
      || frame.kind !== 'episode' || frame.type !== 'collaboration_frame')
      throw new HarnessError('curiosity_missing', "The experience to set aside was not found.");
    if (option.revision !== input.expectedRevision || frame.revision !== input.expectedMatterRevision)
      throw new HarnessError('revision_conflict', "This experience changed. Read its current revision before setting it aside.");
    this.repo.write(() => {
      this.source(handle, context, input.source);
      for (const [record, status] of [[option, 'put_aside'], [frame, 'closed']] as const) {
        const updated = this.repo.db.prepare(`UPDATE h_work SET status=?,revision=revision+1,payload=json_set(payload,
          '$.status',?,'$.revision',revision+1,'$.data.updatedAt',?,'$.data.nextStep',NULL) WHERE id=? AND revision=?`)
          .run(status, status, this.repo.clock.now(), record.id, record.revision);
        if (Number(updated.changes) !== 1) throw new HarnessError('revision_conflict', "This experience changed. The new state was not overwritten.");
        this.repo.outbox('work_changed', record.id);
      }
      this.repo.completeOperation(operationKey, 'curiosity_put_aside', { id: option.id, revision: option.revision + 1,
        matterId: frame.id, matterRevision: frame.revision + 1 });
    });
    return { value: { status: 'put_aside', id: option.id, revision: option.revision + 1,
      matterId: frame.id, matterRevision: frame.revision + 1,
      meaning: "This rests here without another reminder. Let it end quietly without asking why or treating today's choice as a permanent dislike." }, records: [], bindings: [] };
  }

  execute(handle: ScopeHandle, context: CuriosityContext, raw: unknown): CuriosityResult {
    const input = curiosityInvitationInput.parse(raw);
    if (input.operation === 'read') return this.read(handle, context, input.id);
    if (input.operation === 'read_history') { const { operation: _read, ...address } = input; return this.readHistory(handle, context, address); }
    if (input.operation === 'history') { const { operation: _history, ...query } = input; return this.history(handle, context, query); }
    this.source(handle, context, input.source);
    if (input.operation === 'brief') return { value: { status: 'public_brief', publicTopic: input.publicTopic,
      queries: input.queries, research: input.queries.map(query => ({ tool: 'look_up', arguments: {
        source: 'capability', capability: 'research.search', arguments: { query, limit: 5 } } })),
      meaning: "This prepares a public topic and search terms without exporting the original invitation, past interests, or private background. Actual queries still follow the agreed purpose. Search results discover sources; open research.read for facts. You can also create a clearly fictional small experience without networking.",
    }, records: [], bindings: [] };
    if (input.operation === 'put_aside') return this.stop(handle, context, input);
    const selected = input.operation === 'continue' && input.setting ? context.storySettingSelection : undefined;
    const framing = selected && input.operation === 'continue' && input.setting
      && selected.work.id === input.id && selected.work.revision === input.expectedRevision
      && selected.work.matterRevision === input.expectedMatterRevision && selected.placeId === input.setting.placeId
      && selected.mapVersion === input.setting.mapVersion ? selected : undefined;
    if (framing) this.referenceIdentity(handle, framing.work, { sessionId: context.sessionId, allowCrossSession: false });
    let settingAvailable = false, settingUnavailable: string | undefined;
    if (input.setting) {
      if (input.seed.origin !== 'created') throw new HarnessError('story_map_creation', "Map setting continues a shared creation; external discoveries still require their original public-source bodies.");
      try { publicStoryPlace(this.policy, handle, this.publicMap(), input.setting, framing); settingAvailable = true; }
      catch (error) {
        if (!(error instanceof HarnessError) || !['story_map_scope', 'story_map_changed'].includes(error.code)) throw error;
        settingUnavailable = "This public place does not match the currently readable map. The setting was not attached, but creation can continue. Find a recognizable map place when changing the setting.";
      }
    }
    const publicSources = this.materials(handle, context, input.seed);
    const retainingScope = this.policy.validate(handle);
    if (context.ephemeral || retainingScope.retention === 'session_only' || !retainingScope.sources.includes('work:self')
      || !retainingScope.grants.includes('work:write')) return {
      value: { status: 'conversation_only', seed: input.seed, publicSources,
        ...(input.setting ? { settingStatus: settingUnavailable ? 'not_attached' : 'not_saved', settingMeaning: settingUnavailable || "Creation and public-map exploration can continue this round. This setting was not separately saved for recovery next time." } : {}),
        originLabel: input.seed.origin === 'created' ? "A shared creation" : "Public material actually read this round",
        meaning: "Play or talk together now without saving exploration records, goals, or interests." }, records: [], bindings: [] };
    this.owner(handle, true);
    const operationKey = 'curiosity:' + input.operation + ':' + input.source.eventId + ':' + input.source.contentVersion
      + ':' + input.source.start + ':' + input.source.end + (input.operation === 'offer' ? '' : ':' + input.id);
    const repeated = this.repo.operation<{ id: string }>(operationKey);
    if (repeated) return this.read(handle, context, repeated.id);
    const previous = input.operation === 'offer' ? undefined : this.current(handle, context, input.id);
    if (framing && (!previous || framing.work.matterId !== previous.frame.id))
      throw new HarnessError('curiosity_history_identity', "This setting belongs to another shared work. The two were not combined.");
    const inheritedNotes = input.operation === 'continue' && previous?.option.data.noteSources !== undefined
      ? previous.option.data.noteSources as unknown : [];
    if (!Array.isArray(inheritedNotes)) throw new HarnessError('curiosity_source_changed', "The original work's note provenance cannot be fully recovered now.");
    const noteSources = [...new Map([...(context.noteSources || []), ...inheritedNotes]
      .map(value => { const proof = noteSourceProofSchema.parse(value); return [canonical(proof), proof] as const; })).values()];
    if (noteSources.length > 256 || !this.repo.noteSourcesReadable(handle, noteSources))
      throw new HarnessError('curiosity_source_changed', "Note provenance for this creation is incomplete. The original draft was not overwritten.");
    const noteMetadata = context.noteSources !== undefined || inheritedNotes.length
      ? { materialNoteContractVersion: 1, noteSources } : {};
    const original = input.operation === 'continue' && input.fromChapter ? this.historicalChapter(handle, context, input.fromChapter) : undefined;
    // An original saved chapter can carry its own older dependencies. It does
    // not make its body newly read, and a mutable/unpublished seed is never a
    // substitute for that original message. Metadata-only put_aside preserves
    // the host's last-authored versions; current CAS/state/new consent remain
    // separate. All content, bindings and inherited proofs must still match.
    const saved = previous ? this.repo.assistantCurrentWorkChapter(handle, {
      ownerId: previous.option.id, ownerRevision: Number.isSafeInteger(previous.option.data.authoredRevision)
        ? Number(previous.option.data.authoredRevision) : previous.option.revision,
      matterId: previous.frame.id, matterRevision: Number.isSafeInteger(previous.option.data.authoredMatterRevision)
        ? Number(previous.option.data.authoredMatterRevision) : previous.frame.revision,
      permits: context.permits, ...(context.allowCrossSession ? {} : { sessionId: context.sessionId }),
    }) : undefined;
    const checkpoint = saved && canonical(creationBody(saved.scene.view)) === canonical(creationBody(this.view(previous!.frame, previous!.option)))
      && canonical(saved.scene.provenance.sourceBinding) === canonical(this.repo.resolveWorkSourceBinding(handle,
        [...previous!.frame.sourceBinding!.refs, ...previous!.option.sourceBinding!.refs]))
      && canonical(saved.scene.provenance.assistantWorkSources || []) === canonical(this.chapterSources(previous!.option)) ? saved : undefined;
    const checkpointAddress = checkpoint ? { messageId: checkpoint.messageId, sceneId: checkpoint.scene.id, sceneRevision: checkpoint.scene.revision } : undefined;
    const chapterSources = [...new Map([
      ...(checkpointAddress ? [checkpointAddress] : previous ? this.chapterSources(previous.option) : []),
      ...(input.operation === 'continue' && input.fromChapter ? [input.fromChapter] : []),
    ].map(address => [JSON.stringify(address), address])).values()];
    if (original && original.scene.view.matterId !== previous?.frame.id)
      throw new HarnessError('curiosity_history_identity', "This chapter belongs to another shared work. The two were not forced into one matter.");
    if (input.operation !== 'offer' && previous
      && (previous.option.revision !== input.expectedRevision || previous.frame.revision !== input.expectedMatterRevision))
      throw new HarnessError('revision_conflict', "The experience changed. Read its current revision before continuing or trying another.");
    const returningToKeptWork = previous && input.operation === 'continue' && previous.frame.status === 'closed'
      && previous.option.status === 'put_aside' && previous.frame.data.curiosityOptionId === previous.option.id;
    if (previous && !returningToKeptWork && (previous.frame.status !== 'active' || !['offered', 'playing'].includes(previous.option.status)))
      throw new HarnessError('curiosity_inactive', "This experience was replaced or is no longer open. Return to the original work and continue from a current new invitation.");
    const currentRef = this.ref(input.source);
    const directFrameRefs = [...(!checkpoint ? previous?.frame.sourceBinding?.refs || [] : []), currentRef];
    const directOptionRefs = [...(input.operation === 'continue' ? !checkpoint ? previous?.option.sourceBinding?.refs || [] : [] : directFrameRefs), currentRef];
    const uniqueCount = (refs: WorkSourceRef[]) => new Set(refs.map(canonical)).size;
    const inheritedSetting = input.operation === 'continue' && (!input.setting || !settingAvailable)
      && input.setting !== null && input.seed.origin === 'created'
      ? original?.scene.view.setting || (previous?.option.data.setting ? storySettingSnapshotSchema.parse(previous.option.data.setting) : undefined) : undefined;
    const directWithSetting = [...directOptionRefs, ...(inheritedSetting ? [inheritedSetting.evidenceRef] : [])];
    const additionalSources = publicSources.length + (input.setting && settingAvailable ? 1 : 0);
    if (uniqueCount(directFrameRefs) > 32 || uniqueCount(directWithSetting) + additionalSources > 32) return {
      value: { status: 'conversation_only', seed: input.seed, publicSources, originLabel: input.seed.origin === 'created' ? "A shared creation" : "Public material actually read this round",
        persistence: 'original_chapter_required',
        ...(previous ? { preserveOriginal: { tool: 'present_view', arguments: { curiosity: {
          id: previous.option.id, expectedRevision: previous.option.revision, expectedMatterRevision: previous.frame.revision } } } } : {}),
        meaning: "The new content can be played with now without overwriting the original work. Earlier content is not yet retained as a readable original chapter. Use preserveOriginal to present and retain the actual original, then continue today's wish; original fragments remain. This new content is not saved yet. Handle chapter organization yourself rather than burdening the person." },
      records: [], bindings: [], assistantWorkSources: [] };
    return this.repo.write(() => {
      this.source(handle, context, input.source);
      if (!this.repo.noteSourcesReadable(handle, noteSources))
        throw new HarnessError('curiosity_source_changed', "A note page cited by this creation changed. The original draft was not overwritten.");
      const refs = this.retainPublicSources(handle, context, publicSources);
      const setting = input.setting && settingAvailable
        ? retainStorySetting(this.repo, this.policy, handle, context.sessionId, this.publicMap(), input.setting, framing) : inheritedSetting;
      const frameId = previous?.frame.id || randomUUID(), optionId = input.operation === 'continue' && previous ? previous.option.id : randomUUID();
      const frameBinding = this.repo.resolveWorkSourceBinding(handle, [...(!checkpoint ? previous?.frame.sourceBinding?.refs || [] : []), currentRef]);
      const optionBinding = this.repo.resolveWorkSourceBinding(handle, [
        ...(input.operation === 'continue' ? !checkpoint ? previous?.option.sourceBinding?.refs || [] : [] : frameBinding.refs),
        currentRef, ...refs, ...(setting ? [setting.evidenceRef] : []),
      ]);
      const frameData = { ...(previous?.frame.data || { type: 'collaboration_frame', curiosityInvitation: true,
        sessionId: context.sessionId, sessionIds: [context.sessionId], question: "Try something fresh together", confirmedFacts: [], decisions: [],
        tentativeUnderstanding: [], participation: [], rejectedOptions: [], nextStep: null }),
        optionIds: [...new Set([...(previous?.frame.data.optionIds as string[] || []), optionId])], curiosityOptionId: optionId,
        nextStep: null, lastSessionId: context.sessionId,
        ...(chapterSources.length ? { assistantWorkSources: chapterSources } : {}),
        sessionIds: [...new Set([...(previous?.frame.data.sessionIds as string[] || []), context.sessionId])] };
      const frame = this.record(handle, frameId, 'episode', "Try something fresh together", 'active', frameData, frameBinding, previous?.frame);
      const option = this.record(handle, optionId, 'option', input.seed.title,
        input.operation === 'continue' ? 'playing' : 'offered', { type: 'curiosity_invitation', matterId: frame.id,
          sessionId: context.sessionId, seed: input.seed, publicSources,
          sourceIds: [...new Set([...optionBinding.sourceIds, ...(noteSources.length ? ['notes:self'] : [])])], ...noteMetadata,
          authoredRevision: input.operation === 'continue' && previous ? previous.option.revision + 1 : 1,
          authoredMatterRevision: frame.revision,
          ...(setting ? { setting } : {}),
          requiredGrants: optionBinding.requiredGrants, currentWishOverridesOldInterests: true,
          ...(input.operation === 'continue' && input.fromChapter ? { continuedFrom: input.fromChapter } : {}),
          ...(chapterSources.length ? { assistantWorkSources: chapterSources } : {}),
          meaning: "This is a new experience tried together now. Interest and continuation follow today's answer; it did not become a long-term interest, goal, or accepted action." }, optionBinding,
        input.operation === 'continue' ? previous?.option : undefined);
      if (input.operation === 'another' && previous) {
        const old = { ...previous.option, status: 'replaced', revision: previous.option.revision + 1,
          data: { ...previous.option.data, replacedBy: option.id, updatedAt: this.repo.clock.now() } };
        this.repo.saveSourcedWork(handle, old, previous.option.revision);
      }
      this.repo.saveSourcedWork(handle, frame, previous?.frame.revision);
      this.repo.saveSourcedWork(handle, option, input.operation === 'continue' ? previous?.option.revision : undefined);
      this.repo.completeOperation(operationKey, 'curiosity_invitation', { id: option.id });
      return { value: { status: input.operation === 'continue' ? 'playing' : 'offered', curiosity: this.view(frame, option),
        ...(settingUnavailable ? { settingStatus: setting ? 'kept_previous' : 'not_attached',
          settingMeaning: setting ? "The new public setting did not match. The original camera and places remain with the work." : settingUnavailable } : {}),
        read: { tool: 'curiosity_invitation', arguments: { operation: 'read', id: option.id } } }, records: [frame, option], bindings: [], assistantWorkSources: chapterSources };
    });
  }
}
