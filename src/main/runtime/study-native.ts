import { HarnessError, type ScopeHandle } from '../../shared/harness';
import { studyBookmarkInputSchema, studyNativeInputSchema, type StudyBookmarkInput, type StudyBookmarkPreview,
  type StudyNativeInput, type StudyScene } from '../../shared/study-presentation';
import { NativeSourceBookmarkService } from './source-bookmark-native';
import type { Store } from '../store';
import type { StudyPresentationService } from './study-presentation';

/** Trusted private UI reads one known learning artifact. The renderer cannot
 * provide a source, file path, tool call or cached body to authorize itself. */
export class NativeStudyService {
  constructor(readonly store: Store, readonly presentation: StudyPresentationService) {}

  private boundary() {
    const { kernel, runtime } = this.store, settings = this.store.settings();
    return JSON.stringify([kernel.epoch, kernel.policyRevision, runtime.policy.sourceBoundary,
      runtime.presentation.public, settings.memoryEnabled, settings.weatherEnabled]);
  }

  private scope(write = false) {
    const { runtime } = this.store;
    if (runtime.presentation.public) throw new HarnessError('private_view_required', "Return to your private conversation before continuing this study page.");
    const settings = this.store.settings(), base = runtime.policy.validate(runtime.policy.hostScope());
    return runtime.policy.hostScope({ sources: base.sources.filter(source =>
      (settings.memoryEnabled || !['history:self', 'profile:self'].includes(source))
      && (settings.weatherEnabled || source !== 'weather:open-meteo')),
      grants: base.grants.filter(grant => grant.endsWith(':read') || write && grant === 'work:write'), currentEventIds: [], infer: false, audience: 'self' });
  }

  private conversation(sessionId: string) {
    if (!this.store.db.prepare('SELECT 1 FROM sessions WHERE id=?').get(sessionId)
      || this.store.conversationPolicy(sessionId)?.retention === 'session_only')
      throw new HarnessError('study_conversation', "This conversation cannot currently recover saved study pages.");
    const latest = this.store.db.prepare(`SELECT COALESCE(json_extract(payload,'$.scopeSummary.audience'),
      json_extract(payload,'$.requestControls.audience')) AS audience FROM messages WHERE session_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1`).get(sessionId);
    if (latest?.audience === 'group' || latest?.audience === 'public')
      throw new HarnessError('study_private_conversation', "Study content opens only in the person's private conversation.");
  }

  private authorize(handle: ScopeHandle, input: StudyNativeInput) {
    this.conversation(input.sessionId);
    const attached = this.store.messages(input.sessionId).some(message => {
      if (input.messageId && message.id !== input.messageId || message.role !== 'assistant'
        || message.scopeSummary?.audience && message.scopeSummary.audience !== 'self') return false;
      return (message.scenes || []).some(scene => {
        const value = scene as unknown as { kind?: string; id?: string; revision?: number; owner?: { id?: string; revision?: number } };
        return ['study', 'study_reference'].includes(String(value.kind)) && value.owner?.id === input.studyId
          && value.owner.revision === input.studyRevision && value.revision === input.studyRevision && value.id === 'study-scene:' + input.studyId;
      });
    });
    // An already-saved owner in this exact conversation may also be opened
    // while its current reply is still being attached to the message.
    const own = this.store.kernel.workArtifactRecords(handle, 'study_companion', { id: input.studyId, sessionId: input.sessionId, limit: 1 })[0];
    if (!attached && (!own || own.revision !== input.studyRevision))
      throw new HarnessError('study_reference_missing', "This page is not an existing study reference in the current conversation. Open its original message or learning matter.");
    if (input.messageId && !attached) throw new HarnessError('study_reference_missing', "This message has no selected study reference.");
    const current = own || (attached ? this.store.kernel.workArtifactRecords(handle, 'study_companion', { id: input.studyId, limit: 1 })[0] : undefined);
    return { attached, own, current };
  }

  async project(raw: StudyNativeInput): Promise<StudyScene> {
    const input = studyNativeInputSchema.parse(raw), boundary = this.boundary(), handle = this.scope();
    const admission = this.authorize(handle, input);
    const current = admission.current?.revision === input.studyRevision;
    const value = await this.presentation.project(handle, { studyId: input.studyId,
      // An old message is an address to the current owner, never a request to
      // replay its old answer. A changed owner starts at its current focus.
      ...(current ? { studyRevision: input.studyRevision, focus: input.focus } : {}),
      historyOffset: input.historyOffset, historyLimit: input.historyLimit },
    { ...(admission.attached ? {} : { restrictToSessionId: input.sessionId }) });
    this.store.runtime.policy.validate(handle);
    if (boundary !== this.boundary()) throw new HarnessError('study_boundary_changed', "The source or presentation scope changed. Reopen this page from the current conversation.");
    this.authorize(handle, input);
    return value.scene;
  }

  async read(raw: StudyNativeInput): Promise<StudyScene> { return this.project(raw); }

  async previewBookmark(raw: StudyBookmarkInput): Promise<StudyBookmarkPreview> {
    const input = studyBookmarkInputSchema.parse(raw), { bookmark, expectedRevision, ...address } = input;
    if (!bookmark) throw new HarnessError('study_bookmark_empty', "Select the intended passage from its original source first.");
    const boundary = this.boundary(), current = await this.project(address), origin = current.problem.origin;
    if (current.owner.revision !== expectedRevision || current.status === 'closed')
      throw new HarnessError('study_changed', "This page received new content. Return to its current step before placing the passage.");
    const selected = bookmark.reference;
    const sameProblem = bookmark.kind === 'conversation'
      ? origin.kind === 'evidence' && origin.eventId === bookmark.reference.messageId
        && (bookmark.reference.contentVersion === undefined || bookmark.reference.contentVersion === origin.contentVersion)
        && origin.start !== undefined && origin.end !== undefined && selected.start >= origin.start && selected.end <= origin.end
      : bookmark.kind === 'material'
      ? origin.resourceId === bookmark.reference.resourceId && origin.sha256 === bookmark.reference.sha256
        && origin.page === bookmark.reference.page && (origin.kind === 'material_page'
          || origin.start !== undefined && origin.end !== undefined && selected.start >= origin.start && selected.end <= origin.end)
      : origin.kind === 'note' && origin.note?.id === bookmark.reference.id
        && origin.note.revision === bookmark.reference.revision && origin.note.sha256 === bookmark.reference.sha256
        && selected.start >= origin.note.start && selected.end <= origin.note.end;
    if (!sameProblem) throw new HarnessError('study_bookmark_problem', "This page holds a different problem. Keep the passage in conversation first so we can inspect it together.");
    if (bookmark.kind === 'material' && origin.kind === 'material_page' && origin.crop
      && !await this.store.runtime.materials.quoteWithinCrop(this.scope(), bookmark.reference, origin.crop, new AbortController().signal))
      throw new HarnessError('study_bookmark_crop', "This passage is outside the original problem crop. Keep it in conversation first so we can inspect it.");
    const preview = await new NativeSourceBookmarkService(this.store).preview(bookmark);
    const now = await this.project(address);
    if (now.owner.revision !== expectedRevision || boundary !== this.boundary())
      throw new HarnessError('study_changed', "This page changed. Continue from its current step.");
    return { ...preview, studyId: current.owner.id, studyRevision: current.owner.revision };
  }

  async acceptBookmark(raw: StudyBookmarkInput): Promise<StudyScene> {
    const input = studyBookmarkInputSchema.parse(raw), { bookmark, expectedRevision, ...address } = input;
    const boundary = this.boundary();
    const adopted = bookmark ? (await this.previewBookmark(input)).reference : null;
    if (!bookmark && (await this.project(address)).owner.revision !== expectedRevision)
      throw new HarnessError('study_changed', "This page changed. Continue from its current step.");
    const handle = this.scope(true), admission = this.authorize(handle, address);
    if (boundary !== this.boundary()) throw new HarnessError('study_boundary_changed', "The source changed. Select it again at the original owner.");
    await this.store.runtime.studyCompanion.keepBookmark(handle, input.studyId, expectedRevision, adopted,
      { ...(admission.attached ? {} : { restrictToSessionId: input.sessionId }) });
    const value = await this.presentation.project(handle, { studyId: input.studyId },
      { ...(admission.attached ? {} : { restrictToSessionId: input.sessionId }) });
    this.store.runtime.policy.validate(handle);
    if (boundary !== this.boundary()) throw new HarnessError('study_boundary_changed', "The source changed. Reopen this page from the current conversation.");
    return value.scene;
  }
}
