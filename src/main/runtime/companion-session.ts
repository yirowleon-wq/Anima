import { createHash, randomUUID } from 'node:crypto';
import {
  companionSessionWriteSchema, companionSessionReadSchema, companionSessionDataSchema,
  companionSceneProjectionSchema, companionContextProjectionSchema,
  type CompanionCitation, type CompanionLocator, type CompanionCheckpointInput, type CompanionStoredCheckpoint,
  type CompanionSessionData, type CompanionSessionWriteInput, type CompanionSessionReadInput, type CompanionSceneProjection,
} from '../../shared/companion-session';
import { HarnessError, type ScopeHandle, type WorkRecord, type WorkSourceRef } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import type { WorkService } from './work';
import { LearningProcessService } from '../memory/learning-process';
import { companionSourceInputSchema, companionFollowupReferenceSchema,
  type CompanionSourceInput, type CompanionSourceView, type CompanionFollowupReference } from '../../shared/companion-source';
import { canonical, codePointSlice } from './semantics';
import { resolveSourceQuote } from './source-quote';
import type { MaterialService } from '../materials/service';

type Permission = (ref: WorkSourceRef) => boolean;
type Current = { record: WorkRecord; data: CompanionSessionData; matter: WorkRecord };
export type CompanionSnapshotHeader = Pick<CompanionSceneProjection, 'id' | 'revision' | 'matterId' | 'matterRevision' | 'snapshotProof'>;
const hash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/** A source-bound working artifact of the original collaboration frame. */
export class CompanionSessionService {
  private readonly learning: LearningProcessService;
  constructor(readonly repo: KernelRepository, readonly work: WorkService,
    readonly snapshotMaterials?: Pick<MaterialService, 'retainedTextIdentityCurrent'>) {
    this.learning = new LearningProcessService(repo, work);
  }

  idFor(matterId: string): string { return 'companion:' + hash(matterId); }

  private scope(handle: ScopeHandle, write = false) {
    const scope = this.work.policy.require(handle, write ? 'work:write' : 'evidence:read');
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.sources.includes('work:self') || write && (scope.child || scope.retention !== 'purpose_scoped'))
      throw new HarnessError('companion_scope', "This shared-work record cannot be opened or saved in this round.");
    return scope;
  }

  private cite(handle: ScopeHandle, input: CompanionCitation, user = false): CompanionLocator {
    const event = this.repo.evidence(handle, input.eventId), source = event && resolveSourceQuote(event, input);
    if (!event || !source || user && (event.speaker !== 'user' || event.authority !== 'user_statement'))
      throw new HarnessError('companion_source_changed', "This step lacks a complete original statement. Select the person's own account to retain an attempt or outcome.");
    const ref = { eventId: event.id, contentVersion: source.contentVersion, start: source.start, end: source.end };
    this.repo.resolveWorkSourceBinding(handle, [ref]);
    return { ...ref, quoteSha256: hash(source.quote) };
  }

  private currentSource(handle: ScopeHandle, input: CompanionCitation): CompanionLocator {
    const source = this.cite(handle, input, true), scope = this.repo.scope(handle), event = this.repo.evidence(handle, source.eventId)!;
    if (!scope.currentEventIds.includes(event.id) || event.kind !== 'user_message')
      throw new HarnessError('companion_current_source', "The intent to start, pause, or continue is not yet bound to the current statement.");
    return source;
  }

  private locatorCurrent(handle: ScopeHandle, source: CompanionLocator): boolean {
    const event = this.repo.evidence(handle, source.eventId);
    return !!event && event.contentVersion === source.contentVersion && source.end <= Array.from(event.text).length
      && hash(codePointSlice(event.text, source.start, source.end)) === source.quoteSha256;
  }

  private quoted(data: CompanionSessionData): CompanionLocator[] {
    const point = data.checkpoint;
    return [data.startedBy, data.lastTransition.source, ...(data.interruption ? [data.interruption.source] : []),
      ...(data.outcomeReport ? [data.outcomeReport] : []),
      ...[point.workingExplanation, point.currentObstacle, point.nextStep, point.returnPoint].flatMap(value => value?.sources || []),
      ...point.attemptReports, ...point.materials.flatMap(value => value.kind === 'assistant_message' ? [] : [value.source])];
  }

  private refs(data: CompanionSessionData): WorkSourceRef[] {
    const refs = [...this.quoted(data).map(({ quoteSha256: _hash, ...source }) => source),
      ...data.checkpoint.materials.flatMap(value => value.kind === 'assistant_message' ? value.sourceRefs : []),
      ...data.checkpoint.learningProcessRefs.flatMap(value => value.sourceBinding.refs)];
    return [...new Map(refs.map(ref => [canonical(ref), ref])).values()];
  }

  private fileCurrent(handle: ScopeHandle, material: Extract<CompanionStoredCheckpoint['materials'][number], { kind: 'file' }>): boolean {
    const event = this.repo.evidence(handle, material.source.eventId);
    if (!event || event.kind !== 'file_import' || event.speaker !== 'external' || event.locator?.kind !== 'file'
      || event.locator.artifactId !== material.resourceId || !this.locatorCurrent(handle, material.source)) return false;
    let metadata: Record<string, unknown>;
    try { metadata = JSON.parse(event.text); } catch { return false; }
    return metadata.resourceId === material.resourceId && metadata.sha256 === material.sha256 && metadata.version === material.version
      && (material.page === undefined || metadata.mediaType === 'application/pdf');
  }

  private current(handle: ScopeHandle, matterId: string, recordId = this.idFor(matterId), permits?: Permission): Current | undefined {
    const matter = this.repo.work(handle, 'episode', matterId)[0];
    const record = this.repo.workArtifactRecords(handle, 'companion_session', { id: recordId, matterId, limit: 1 })[0];
    if (!matter || matter.data.type !== 'collaboration_frame' || !record || record.id !== this.idFor(matterId)
      || record.kind !== 'plan' || record.data.type !== 'companion_session' || !record.sourceBinding) return;
    const parsed = companionSessionDataSchema.safeParse(record.data);
    if (!parsed.success || parsed.data.matterId !== matter.id || record.status !== parsed.data.state) return;
    const data = parsed.data, refs = this.refs(data);
    if (refs.some(ref => permits?.(ref) === false)) return;
    try {
      if (canonical(record.sourceBinding) !== canonical(this.repo.resolveWorkSourceBinding(handle, refs))) return;
      for (const material of data.checkpoint.materials) {
        if (material.kind === 'file' && !this.fileCurrent(handle, material)) return;
        if (material.kind === 'assistant_message') {
          const original = this.repo.learningAssistantSource(handle, material);
          if (!original || original.contentSha256 !== material.contentSha256 || canonical(original.sourceRefs) !== canonical(material.sourceRefs)) return;
        }
      }
      for (const linked of data.checkpoint.learningProcessRefs) {
        const learning = this.repo.work(handle, 'experience', linked.id)[0];
        if (!learning || learning.data.type !== 'learning_process' || learning.data.matterId !== matter.id
          || learning.status !== 'recorded' || learning.revision !== linked.revision
          || canonical(learning.sourceBinding) !== canonical(linked.sourceBinding)) return;
        this.learning.assertCurrent(handle, linked.id, linked.revision, permits);
      }
    } catch (error) { if (error instanceof HarnessError) return; throw error; }
    if (this.quoted(data).some(source => !this.locatorCurrent(handle, source))) return;
    return { record, data, matter };
  }

  private checkpoint(handle: ScopeHandle, matterId: string, input: CompanionCheckpointInput): CompanionStoredCheckpoint {
    const supported = (value: CompanionCheckpointInput['workingExplanation']) => ({ text: value.text, sources: value.sources.map(source => this.cite(handle, source)) });
    return { helpMode: input.helpMode, workingExplanation: supported(input.workingExplanation),
      currentObstacle: input.currentObstacle ? supported(input.currentObstacle) : null,
      nextStep: input.nextStep ? supported(input.nextStep) : null, returnPoint: supported(input.returnPoint),
      materials: input.materials.map(material => {
        if (material.kind === 'assistant_message') {
          const original = this.repo.learningAssistantSource(handle, material);
          if (!original || codePointSlice(original.text, material.start, material.end) !== material.quote)
            throw new HarnessError('companion_material_changed', "The original explanation message or its sources changed. Return to a currently accessible original.");
          return { kind: material.kind, label: material.label, messageId: material.messageId, start: material.start, end: material.end,
            contentSha256: original.contentSha256, sourceRefs: original.sourceRefs };
        }
        const source = this.cite(handle, material.source);
        if (material.kind === 'evidence') return { kind: material.kind, label: material.label, source };
        const stored = { ...material, source };
        if (!this.fileCurrent(handle, stored)) throw new HarnessError('companion_material_changed', "This material does not match the received file. Recover the page from the current original file.");
        return stored;
      }),
      attemptReports: input.attemptReports.map(source => this.cite(handle, source, true)),
      learningProcessRefs: input.learningProcessRefs.map(linked => {
        const learning = this.repo.work(handle, 'experience', linked.id)[0];
        if (!learning || learning.data.type !== 'learning_process' || learning.data.matterId !== matterId || learning.revision !== linked.revision
          || learning.status !== 'recorded' || !learning.sourceBinding)
          throw new HarnessError('companion_learning_changed', "This learning process does not match the current matter. Recover its original attempt.");
        this.learning.assertCurrent(handle, learning.id, learning.revision);
        return { id: learning.id, revision: learning.revision, sourceBinding: learning.sourceBinding };
      }),
    };
  }

  write(handle: ScopeHandle, sessionId: string, raw: CompanionSessionWriteInput) {
    const args = companionSessionWriteSchema.parse(raw), scope = this.scope(handle, true), source = this.currentSource(handle, args.source);
    const recordId = this.idFor(args.matterId);
    if (args.id && args.id !== recordId) throw new HarnessError('companion_address', "This return point belongs to another matter. Return to the work being done together.");
    if (args.operation === 'stop') return this.stop(handle, args, source, recordId);
    return this.repo.write(() => {
      const matter = this.repo.work(handle, 'episode', args.matterId)[0];
      if (!matter || matter.data.type !== 'collaboration_frame' || matter.revision !== args.expectedMatterRevision)
        throw new HarnessError('companion_matter_changed', "The shared matter changed. Restore its current revision before continuing.");
      if (!['active', 'needs_review'].includes(matter.status)) throw new HarnessError('companion_matter_closed', "The original matter ended. A restart can begin with what they want to do now.");
      const metadata = this.repo.sourcedWorkMetadata(handle, recordId);
      if (metadata && (metadata.type !== 'companion_session' || metadata.kind !== 'plan' || metadata.matterId !== matter.id))
        throw new HarnessError('companion_address', "The shared-work address does not match the original matter.");
      if (metadata ? args.expectedRevision !== metadata.revision : args.expectedRevision !== undefined)
        throw new HarnessError('companion_revision', "The shared-work checkpoint changed. Continue from its current revision.");
      const old = args.operation === 'begin' ? undefined : this.current(handle, matter.id, recordId);
      if (args.operation === 'begin') {
        if (metadata && !['finished', 'stopped'].includes(metadata.status))
          throw new HarnessError('companion_already_started', "This matter already has a checkpoint. Continue recording there or resume its unfinished step.");
        if (!args.checkpoint) throw new HarnessError('companion_checkpoint_required', "Starting shared work needs real current material and a return point.");
      } else if (!old) throw new HarnessError('companion_unavailable', "The former checkpoint or its sources are unreadable. Continue from currently accessible material.");
      if (args.operation === 'checkpoint' && (!args.checkpoint || old!.data.state !== 'active')
        || args.operation === 'hold' && old!.data.state !== 'active'
        || args.operation === 'resume' && !['active', 'held'].includes(old!.data.state)
        || args.operation === 'finish' && !['active', 'held'].includes(old!.data.state))
        throw new HarnessError('companion_state', "The current stopping state does not match this step. Determine whether to continue, park, or finish.");
      if (args.interruption && args.operation !== 'hold' || (args.finishKind || args.outcomeReport) && args.operation !== 'finish')
        throw new HarnessError('companion_transition', "Interruption and completion evidence belongs only to its corresponding state transition.");
      const interruptionSource = args.operation === 'hold' ? args.interruption ? this.currentSource(handle, args.interruption) : source : undefined;
      const outcomeReport = args.operation === 'finish' && args.outcomeReport ? this.cite(handle, args.outcomeReport, true) : null;
      if (args.finishKind === 'user_reported_done' && !outcomeReport)
        throw new HarnessError('companion_outcome_required', "The statement reporting completion was not found. Record the actual progress instead.");
      const now = this.repo.clock.now(), previous = old?.data;
      const checkpoint = args.checkpoint ? this.checkpoint(handle, matter.id, args.checkpoint) : previous!.checkpoint;
      const state: CompanionSessionData['state'] = args.operation === 'hold' ? 'held' : args.operation === 'finish' ? 'finished' : 'active';
      const sessions = [...new Set([...(previous?.sessionIds || []), sessionId])];
      if (sessions.length > 128) throw new HarnessError('companion_session_limit', "The conversation-link capacity for this matter is full. Original records remain; this link was not added.");
      const data: CompanionSessionData = { type: 'companion_session', version: 1, matterId: matter.id,
        runId: previous?.runId || randomUUID(), state, sessionId, sessionIds: sessions,
        startedAt: previous?.startedAt || now, updatedAt: now, startedBy: previous?.startedBy || source,
        lastTransition: { operation: args.operation, at: now, source },
        interruption: interruptionSource ? { at: now, source: interruptionSource } : previous?.interruption || null,
        finishedAt: state === 'finished' ? now : null, finishKind: state === 'finished' ? args.finishKind || 'session_wrap' : null,
        outcomeReport, checkpoint, sourceIds: [] };
      const binding = this.repo.resolveWorkSourceBinding(handle, this.refs(data));
      data.sourceIds = [...new Set([...binding.sourceIds,
        ...(checkpoint.materials.some(material => material.kind === 'assistant_message') ? ['history:self'] : [])])].sort();
      companionSessionDataSchema.parse(data);
      const record: WorkRecord = { id: recordId, kind: 'plan', ownerId: scope.principalId, workspaceId: scope.workspaceId,
        ...(!args.checkpoint && old?.record.personalMethodSources ? { personalMethodSources: old.record.personalMethodSources } : {}),
        subjectId: scope.subjectId, worldId: scope.worldId, revision: (metadata?.revision || 0) + 1, status: state,
        title: "Shared-work return point", evidenceIds: [...new Set(binding.refs.map(ref => ref.eventId))], sourceBinding: binding,
        label: { purpose: scope.purposes[0], audience: 'self', retention: 'purpose_scoped', sensitivity: 'personal', infer: false },
        data: data as WorkRecord['data'] };
      this.repo.saveSourcedWork(handle, record, metadata?.revision);
      if (metadata) this.repo.invalidate(record.id, 'companion_session_changed');
      // Ordinary frame progress may continue independently. Parent identity and
      // current lifecycle are checked on every adoption, rather than treating
      // each frame revision (including a new pointer) as a changed source.
      for (const ref of binding.refs) this.repo.addDependency(handle, { consumerId: record.id, producerId: ref.eventId,
        producerRevision: ref.contentVersion, sensitivity: 'privacy', invalidation: 'block' });
      for (const material of checkpoint.materials) if (material.kind === 'assistant_message')
        this.repo.addDependency(handle, { consumerId: record.id, producerId: material.messageId,
          producerRevision: 1, sensitivity: 'privacy', invalidation: 'block' });
      for (const linked of checkpoint.learningProcessRefs)
        this.repo.addDependency(handle, { consumerId: record.id, producerId: linked.id,
          producerRevision: linked.revision, sensitivity: 'privacy', invalidation: 'block' });
      return { status: 'saved', id: record.id, revision: record.revision, matterId: matter.id, records: [record],
        scene: this.project({ record, data, matter }),
        meaning: state === 'held' ? "This matter is parked here. Its original material and next step are saved for return to the same place."
          : state === 'finished' ? args.finishKind === 'user_reported_done'
            ? "The reported completion words and finishing point are saved. Actual outcomes remain inspectable in their original records."
            : "This part is put away. Its stopping point and sources remain with their original owners."
          : "The new return point is saved. Continue with the same material and thought; calendars and reminders remain separate." };
    });
  }

  private stop(handle: ScopeHandle, args: CompanionSessionWriteInput, source: CompanionLocator, recordId: string) {
    if (args.checkpoint || args.interruption || args.finishKind || args.outcomeReport)
      throw new HarnessError('companion_stop_input', "This step pauses the shared-work page. Edit body text or sources at their original owner.");
    return this.repo.write(() => {
      const metadata = this.repo.sourcedWorkMetadata(handle, recordId);
      if (!metadata || metadata.type !== 'companion_session' || metadata.kind !== 'plan' || metadata.matterId !== args.matterId)
        throw new HarnessError('companion_missing', "No shared-work session was found for this matter.");
      if (metadata.revision !== args.expectedRevision) throw new HarnessError('companion_revision', "Shared-work state changed. Stop against its current revision.");
      if (metadata.status === 'stopped') return { status: 'stopped', id: recordId, revision: metadata.revision, matterId: args.matterId, records: [] as WorkRecord[],
        meaning: "This shared-work page stopped. Calendar and learning records remain with their owners." };
      const at = this.repo.clock.now(), revision = metadata.revision + 1;
      // This new control address does not replace, supplement or reauthorize
      // the old working-content binding. Keeping lastTransition intact also
      // lets still-legal history be read after stopping without rebinding it.
      this.repo.db.prepare(`UPDATE h_work SET status='stopped',revision=?,payload=json_set(payload,'$.status','stopped','$.revision',?,
        '$.data.state','stopped','$.data.updatedAt',?,'$.data.stopTransition',json(?)) WHERE id=? AND revision=?`)
        .run(revision, revision, at, JSON.stringify({ at, source }), recordId, metadata.revision);
      this.repo.invalidate(recordId, 'companion_session_stopped');
      this.repo.outbox('work_changed', recordId);
      return { status: 'stopped', id: recordId, revision, matterId: args.matterId, records: [] as WorkRecord[],
        meaning: "This shared-work page stopped. Calendar and learning records remain with their owners; earlier body text was not opened." };
    });
  }

  private sourceRead(source: CompanionLocator) {
    return { tool: 'read_evidence', arguments: { id: source.eventId, offset: source.start, limit: Math.min(1200, source.end - source.start) } };
  }

  private project(value: Current) {
    const { record, data, matter } = value, point = data.checkpoint, parentActive = ['active', 'needs_review'].includes(matter.status);
    return companionSceneProjectionSchema.parse({ kind: 'companion_session', id: record.id, revision: record.revision,
      matterId: matter.id, matterRevision: matter.revision, runId: data.runId, state: data.state, helpMode: point.helpMode,
      workingExplanation: point.workingExplanation.text, currentObstacle: point.currentObstacle?.text || null,
      nextStep: point.nextStep?.text || null, returnPoint: point.returnPoint.text,
      materials: point.materials.map(material => ({ kind: material.kind, label: material.label,
        originalContentsRead: 'not_established_by_checkpoint', read: material.kind === 'evidence' ? this.sourceRead(material.source)
          : material.kind === 'assistant_message' ? { tool: 'read_assistant_history', arguments: { id: material.messageId,
            offset: material.start, limit: Math.min(1200, material.end - material.start) } }
          : { capability: 'materials.read', arguments: { resourceId: material.resourceId,
            ...(material.page === undefined ? {} : { page: material.page }), offset: material.offset, limit: material.limit } } })),
      attempts: point.attemptReports.map(source => ({ source, read: this.sourceRead(source), observation: 'user_report', independentlyObserved: false })),
      learningProcessRefs: point.learningProcessRefs.map(({ id, revision }) => ({ id, revision })), interruption: data.interruption,
      finishKind: data.finishKind, controls: { canHold: parentActive && data.state === 'active', canResume: parentActive && ['active', 'held'].includes(data.state),
        canFinish: parentActive && ['active', 'held'].includes(data.state), canStop: ['active', 'held'].includes(data.state) },
      snapshotProof: { version: 1, sourceBinding: record.sourceBinding,
        assistantMaterials: point.materials.filter(material => material.kind === 'assistant_message')
          .map(({ kind: _kind, label: _label, ...material }) => material),
        materials: point.materials.filter(material => material.kind === 'file').map(({ label: _label, ...material }) => material),
        learningProcessRefs: point.learningProcessRefs, personalMethodSources: record.personalMethodSources || [] },
      meaning: "Current working context for a shared activity; not a personal fact, task completion, independent mastery or new execution authority." });
  }

  read(handle: ScopeHandle, raw: CompanionSessionReadInput, permits?: Permission) {
    this.scope(handle);
    const args = companionSessionReadSchema.parse(raw), id = args.id || this.idFor(args.matterId);
    if (id !== this.idFor(args.matterId)) throw new HarnessError('companion_address', "The shared-work address does not belong to this original matter.");
    if (args.metadataOnly) {
      const metadata = this.repo.sourcedWorkMetadata(handle, id);
      const found = metadata?.type === 'companion_session' && metadata.matterId === args.matterId && metadata.kind === 'plan' ? metadata : undefined;
      return { status: found ? 'fresh' : 'not_found', matterId: args.matterId, ...(found ? { control: found } : {}), records: [] as WorkRecord[],
        meaning: found ? "The stopping state was found. Earlier body text and material were not opened."
          : "No shared-work page was found for this matter." };
    }
    const current = this.current(handle, args.matterId, id, permits);
    return current ? { status: 'fresh', matterId: args.matterId, records: [current.record], scene: this.project(current),
      checkpoint: { ...current.data.checkpoint,
        interpretationUse: "This records the assistant's interpretation then. Reconsider it with today's original words, material, and situation before continuing." },
      sourceBinding: current.record.sourceBinding, outcomeReport: current.data.outcomeReport,
      meaning: "The checkpoint is recovered in its original place. Continue according to today's wish. Attempts and completion accounts are the person's reports; external outcomes need original records." }
      : { status: 'not_available', matterId: args.matterId, records: [] as WorkRecord[],
        meaning: "The checkpoint or a source is unreadable in this round. Continue from accessible current content; independent matters remain." };
  }

  context(handle: ScopeHandle, matterId: string, permits?: Permission) {
    this.scope(handle);
    const current = this.current(handle, matterId, undefined, permits);
    if (!current || !['active', 'needs_review'].includes(current.matter.status) || !['active', 'held'].includes(current.data.state)) return null;
    const { record, data, matter } = current, point = data.checkpoint;
    return { projection: companionContextProjectionSchema.parse({ id: record.id, revision: record.revision, matterId, matterRevision: matter.revision,
      state: data.state, helpMode: point.helpMode, workingExplanation: point.workingExplanation.text,
      currentObstacle: point.currentObstacle?.text || null, nextStep: point.nextStep?.text || null, returnPoint: point.returnPoint.text,
      materialCount: point.materials.length, attemptReportCount: point.attemptReports.length,
      read: { tool: 'read_companion_session', arguments: { matterId, id: record.id } }, resumeRequiresCurrentRequest: true,
      meaning: "A continuation lead only. Read the current source first; retrieval itself restores no work, reminder or action authority." }),
      record, sourceBinding: record.sourceBinding,
      learningProcessVersions: point.learningProcessRefs.map(({ id, revision }) => ({ id, revision })) };
  }

  /** Initial context gets addresses only. Opening the actual return point uses
   * read(), with the same current owner checks and no automatic resume. */
  index(handle: ScopeHandle, options: { sessionId?: string; limit?: number; permits?: Permission } = {}) {
    this.scope(handle);
    const limit = Math.min(4, Math.max(1, options.limit ?? 2)), scan = Math.min(100, limit * 4 + 1);
    const rows = this.repo.workArtifactRecords(handle, 'companion_session', {
      ...(options.sessionId ? { sessionId: options.sessionId } : {}), limit: scan,
    });
    const values = rows.flatMap(record => {
      const matterId = typeof record.data.matterId === 'string' ? record.data.matterId : '';
      const current = matterId ? this.current(handle, matterId, record.id, options.permits) : undefined;
      return current && ['active', 'held'].includes(current.data.state)
        && ['active', 'needs_review'].includes(current.matter.status) ? [current] : [];
    });
    const picked = values.slice(0, limit);
    return { items: picked.map(({ record, data }) => ({ id: record.id, revision: record.revision, matterId: data.matterId,
      status: data.state, read: { tool: 'read_companion_session', arguments: { matterId: data.matterId, id: record.id } },
      availability: 'read_before_resuming' as const })), records: picked.map(value => value.record),
      learningProcessVersions: picked.flatMap(value => value.data.checkpoint.learningProcessRefs.map(({ id, revision }) => ({ id, revision }))),
      moreMayExist: rows.length === scan || values.length > picked.length,
      meaning: picked.length ? "These shared-work pages can be recovered. Open them to read exact stopping points and material. Continuing today follows the current request."
        : "No matching shared-work page returned. The current matter can still be discussed; investigate an old return point through its original records." };
  }

  scene(handle: ScopeHandle, matterId: string, permits?: Permission) {
    this.scope(handle);
    const current = this.current(handle, matterId, undefined, permits);
    return current ? { projection: this.project(current), record: current.record, sourceBinding: current.record.sourceBinding } : null;
  }

  /** Read the actual explanation shown then. Ordinary checkpoint progress is
   * independent of its frozen sources; this never substitutes new contents or
   * renews the former controls. Only source metadata is checked synchronously. */
  private snapshotDependencies(handle: ScopeHandle, raw: CompanionSnapshotHeader, permits?: Permission) {
    const scope = this.scope(handle);
    const shown = companionSceneProjectionSchema.pick({ id: true, revision: true, matterId: true, matterRevision: true, snapshotProof: true })
      .parse({ id: raw.id, revision: raw.revision, matterId: raw.matterId, matterRevision: raw.matterRevision, snapshotProof: raw.snapshotProof }),
      f = this.repo.filter(handle), parent = this.repo.filter(handle, 'm');
    if (shown.id !== this.idFor(shown.matterId) || this.repo.hasFence(shown.id) || this.repo.hasFence(shown.matterId))
      throw new HarnessError('companion_snapshot_changed', "This original work explanation left the current source scope.");
    const metadata = this.repo.db.prepare(`SELECT r.revision,r.status,m.revision AS matter_revision,m.status AS matter_status
      FROM h_work r JOIN h_work m ON m.id=json_extract(r.payload,'$.data.matterId')
      WHERE ${f.sql} AND ${parent.sql} AND r.id=? AND r.kind='plan'
      AND json_extract(r.payload,'$.data.type')='companion_session' AND m.id=? AND m.kind='episode'
      AND json_extract(m.payload,'$.data.type')='collaboration_frame'`).get(...f.params, ...parent.params, shown.id, shown.matterId);
    if (!metadata || Number(metadata.revision) < shown.revision || Number(metadata.matter_revision) < shown.matterRevision
      || ['deleted', 'blocked', 'stale'].includes(String(metadata.matter_status)))
      throw new HarnessError('companion_snapshot_changed', "The matter owning this work explanation is no longer readable.");
    if ((Number(metadata.revision) !== shown.revision || Number(metadata.matter_revision) !== shown.matterRevision)
      && !scope.sources.includes('history:self')) throw new HarnessError('companion_snapshot_scope', "Only current content is being read; earlier shared-work pages were not expanded.");
    const proof = shown.snapshotProof;
    let legacy: Current | undefined;
    if (!proof) {
      const current = this.current(handle, shown.matterId, shown.id, permits);
      if (!current || current.record.revision !== shown.revision)
        throw new HarnessError('companion_snapshot_proof', "This earlier page lacks complete original material proof. An old source did not open new content.");
      legacy = current;
    } else {
      if (!this.repo.workBindingsReadable(handle, [proof.sourceBinding]) || proof.sourceBinding.refs.some(ref => permits?.(ref) === false)
        || proof.personalMethodSources.some(source => this.repo.verifyPersonalMethodSources?.(handle, source) !== true))
        throw new HarnessError('companion_snapshot_source', "Evidence for the original page changed. No old copy was restored.");
      for (const source of proof.assistantMaterials) {
        const original = this.repo.personalMethodAssistantSource(handle, source);
        if (!original || canonical(original.sourceRefs) !== canonical(source.sourceRefs))
          throw new HarnessError('companion_snapshot_source', "The assistant explanation used by the original page cannot currently be verified.");
      }
      for (const file of proof.materials) {
        const event = this.repo.evidence(handle, file.source.eventId);
        if (!this.fileCurrent(handle, { ...file, label: '' }) || !event?.parentEventId || !this.snapshotMaterials
          || !this.snapshotMaterials.retainedTextIdentityCurrent(handle, { resourceId: file.resourceId, sha256: file.sha256,
            version: file.version, sourceEventId: event.id, contentVersion: event.contentVersion, parentEventId: event.parentEventId }))
          throw new HarnessError('companion_snapshot_source', "The original file exited or changed. An old address did not restore permission.");
      }
      for (const linked of proof.learningProcessRefs) {
        const filter = this.repo.filter(handle);
        if (this.repo.hasFence(linked.id) || !this.repo.workBindingsReadable(handle, [linked.sourceBinding])
          || linked.sourceBinding.refs.some(ref => permits?.(ref) === false)
          || !this.repo.db.prepare(`SELECT r.id FROM h_work r WHERE ${filter.sql} AND r.id=?
            AND json_extract(r.payload,'$.data.type')='learning_process' AND json_extract(r.payload,'$.data.matterId')=?`)
            .get(...filter.params, linked.id, shown.matterId))
          throw new HarnessError('companion_snapshot_source', "The original learning source exited. An old attempt was not transformed into a new conclusion.");
      }
    }
    return { metadata, legacy };
  }

  snapshotMetadata(handle: ScopeHandle, header: CompanionSnapshotHeader, permits?: Permission): boolean {
    try { this.snapshotDependencies(handle, header, permits); return true; }
    catch (error) { if (error instanceof HarnessError || error instanceof SyntaxError || error instanceof Error && error.name === 'ZodError') return false; throw error; }
  }

  snapshot(handle: ScopeHandle, raw: CompanionSceneProjection, permits?: Permission): CompanionSceneProjection {
    const shown = companionSceneProjectionSchema.parse(raw), { metadata, legacy } = this.snapshotDependencies(handle, shown, permits);
    if (legacy) {
      const { controls: _a, matterRevision: _b, snapshotProof: _c, history: _d, historySource: _e, ...old } = shown;
      const { controls: _f, matterRevision: _g, snapshotProof: _h, history: _i, historySource: _j, ...actual } = this.project(legacy);
      if (canonical(old) !== canonical(actual)) throw new HarnessError('companion_snapshot_changed', "The original page does not match this shared-understanding revision.");
    }
    const { historySource: _unverifiedAddress, history: _history, ...original } = shown;
    const historical = Number(metadata.revision) !== shown.revision || Number(metadata.matter_revision) !== shown.matterRevision;
    return { ...original, ...(historical ? { history: { currentRevision: Number(metadata.revision), currentState: String(metadata.status) },
      controls: { canHold: false, canResume: false, canFinish: false, canStop: false } } : {}) };
  }

  /** Identify a UI address before interpreting new-input restrictions. This
   * opens no checkpoint, quotation, attempt or material; formal recovery must
   * still run resolveReference after the current input boundary is known. */
  referenceIdentity(handle: ScopeHandle, raw: CompanionFollowupReference, context: { sessionId: string }) {
    this.scope(handle);
    const reference = companionFollowupReferenceSchema.parse(raw);
    if (reference.snapshot) {
      const original = this.repo.assistantCoWorkIdentity(handle, reference.snapshot, { sessionId: context.sessionId })
        .some(owner => owner.id === reference.id && owner.revision === reference.revision && owner.matterId === reference.matterId);
      if (!original) throw new HarnessError('companion_reference_missing', "This original-page reference does not belong to this position in the current conversation.");
      return { origin: 'companion_session' as const, historical: true };
    }
    const scope = this.repo.scope(handle), filter = this.repo.filter(handle), parent = this.repo.filter(handle, 'f');
    const row = this.repo.db.prepare(`SELECT r.id FROM h_work r JOIN h_work f ON f.id=json_extract(r.payload,'$.data.matterId')
      WHERE ${filter.sql} AND ${parent.sql} AND r.id=? AND r.revision=?
      AND r.kind='plan' AND json_extract(r.payload,'$.data.type')='companion_session'
      AND json_extract(r.payload,'$.data.matterId')=?
      AND f.kind='episode' AND json_extract(f.payload,'$.data.type')='collaboration_frame'
      AND json_type(r.payload,'$.sourceBinding')='object'
      AND NOT EXISTS(SELECT 1 FROM json_each(r.payload,'$.sourceBinding.sourceIds') src
        WHERE src.type!='text' OR src.value NOT IN (SELECT value FROM json_each(?)))
      AND NOT EXISTS(SELECT 1 FROM json_each(r.payload,'$.sourceBinding.requiredGrants') permission
        WHERE permission.type!='text' OR permission.value NOT IN (SELECT value FROM json_each(?)))
      AND (json_extract(r.payload,'$.data.sessionId')=? OR EXISTS(SELECT 1 FROM json_each(r.payload,'$.data.sessionIds') m
        WHERE m.type='text' AND m.value=?))`).get(...filter.params, ...parent.params, reference.id, reference.revision,
        reference.matterId, JSON.stringify(scope.sources), JSON.stringify(scope.grants), context.sessionId, context.sessionId);
    if (!row || reference.id !== this.idFor(reference.matterId) || this.repo.hasFence(reference.id) || this.repo.hasFence(reference.matterId))
      throw new HarnessError('companion_reference_missing', "This shared checkpoint does not belong to this position in the current conversation.");
    return { origin: 'companion_session' as const };
  }

  resolveReference(handle: ScopeHandle, raw: CompanionFollowupReference, permits?: Permission) {
    this.scope(handle);
    const reference = companionFollowupReferenceSchema.parse(raw);
    if (reference.snapshot) {
      const original = this.repo.assistantCoWorkScene(handle, reference.snapshot, { permits });
      const projection = original?.scene.coWork.find(value => value.id === reference.id && value.revision === reference.revision && value.matterId === reference.matterId);
      if (!original || !projection?.snapshotProof || reference.target
        && !(reference.target.kind === 'material' ? projection.materials : projection.attempts)[reference.target.index])
        throw new HarnessError('companion_snapshot_changed', "The original page or a source is unreadable. Later content was not restored.");
      return { reference, projection, record: undefined, sourceBinding: projection.snapshotProof.sourceBinding,
        sourceSessionId: original.sessionId, assistantWorkSources: [reference.snapshot], learningProcessVersions: [],
        currentOwner: { id: reference.id, revision: projection.history?.currentRevision || projection.revision,
          state: projection.history?.currentState || projection.state,
          read: { tool: 'read_companion_session', arguments: { matterId: reference.matterId, id: reference.id } } } };
    }
    const value = this.current(handle, reference.matterId, reference.id, permits);
    if (!value || value.record.revision !== reference.revision)
      throw new HarnessError('companion_changed', "The checkpoint just changed. Recover its current position.");
    if (reference.target && !(reference.target.kind === 'material' ? value.data.checkpoint.materials : value.data.checkpoint.attemptReports)[reference.target.index])
      throw new HarnessError('companion_source_missing', "The checkpoint no longer contains this source. Reopen from the current page.");
    return { reference, projection: this.project(value), record: value.record, sourceBinding: value.record.sourceBinding,
      sourceSessionId: value.data.sessionId, assistantWorkSources: [],
      learningProcessVersions: value.data.checkpoint.learningProcessRefs.map(({ id, revision }) => ({ id, revision })) };
  }

  /** An explicit local source-open action, not model transmission or resume. */
  source(handle: ScopeHandle, raw: CompanionSourceInput): CompanionSourceView {
    const input = companionSourceInputSchema.parse(raw);
    if (input.snapshot) return this.snapshotSource(handle, input);
    const { record } = this.resolveReference(handle, { kind: 'co_work', ...input });
    if (!record) throw new HarnessError('companion_source_changed', "Reopen through this original page's material address.");
    const data = companionSessionDataSchema.parse(record.data);
    const original = (source: CompanionLocator, title: string): CompanionSourceView => {
      const event = this.repo.evidence(handle, source.eventId);
      if (!event || !this.locatorCurrent(handle, source)) throw new HarnessError('companion_source_changed', "The original words changed. Continue from current material.");
      return { kind: 'excerpt', title, text: codePointSlice(event.text, source.start, source.end),
        origin: event.speaker === 'user' ? 'user_statement' : event.speaker === 'assistant' ? 'assistant_history' : 'quotation', receivedAt: event.receivedAt };
    };
    if (input.target.kind === 'attempt') return original(data.checkpoint.attemptReports[input.target.index], "Your attempt then");
    const material = data.checkpoint.materials[input.target.index];
    if (material.kind === 'evidence') return original(material.source, material.label);
    if (material.kind === 'assistant_message') {
      const message = this.repo.learningAssistantSource(handle, material);
      if (!message || message.contentSha256 !== material.contentSha256 || canonical(message.sourceRefs) !== canonical(material.sourceRefs))
        throw new HarnessError('companion_source_changed', "This original explanation is unreadable. No old copy was restored.");
      return { kind: 'excerpt', title: material.label, text: codePointSlice(message.text, material.start, material.end), origin: 'assistant_history' };
    }
    const event = this.repo.evidence(handle, material.source.eventId)!;
    const metadata = JSON.parse(event.text) as { mediaType?: unknown };
    if (!['text/plain', 'text/markdown', 'application/pdf'].includes(String(metadata.mediaType)))
      throw new HarnessError('companion_source_changed', "The original material format cannot currently be verified. Return to the current file.");
    return { kind: 'file', title: material.label, resourceId: material.resourceId, sha256: material.sha256,
      version: material.version, mediaType: metadata.mediaType as 'text/plain' | 'text/markdown' | 'application/pdf',
      ...(material.page === undefined ? {} : { page: material.page }), offset: material.offset, limit: material.limit };
  }

  private snapshotSource(handle: ScopeHandle, input: CompanionSourceInput): CompanionSourceView {
    const value = this.resolveReference(handle, { kind: 'co_work', ...input }), projection = value.projection, proof = projection.snapshotProof;
    if (!proof || !input.snapshot) throw new HarnessError('companion_snapshot_proof', "The original page lacks material proof.");
    const original = (source: CompanionLocator, title: string): CompanionSourceView => {
      const event = this.repo.evidence(handle, source.eventId);
      if (!event || !this.locatorCurrent(handle, source)) throw new HarnessError('companion_source_changed', "This original passage changed.");
      return { kind: 'excerpt', title, text: codePointSlice(event.text, source.start, source.end),
        origin: event.speaker === 'user' ? 'user_statement' : event.speaker === 'assistant' ? 'assistant_history' : 'quotation', receivedAt: event.receivedAt };
    };
    if (input.target.kind === 'attempt') return original(projection.attempts[input.target.index].source, "Your attempt then");
    const entry = projection.materials[input.target.index], address = entry.read.arguments;
    if (entry.kind === 'evidence') {
      const start = Number(address.offset), end = start + Number(address.limit), id = String(address.id);
      const source = proof.sourceBinding.refs.find(ref => ref.eventId === id && ref.start <= start && ref.end >= end);
      const event = source && this.repo.evidence(handle, source.eventId);
      if (!source || !event || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start)
        throw new HarnessError('companion_source_changed', "The original source position cannot currently be verified.");
      return original({ ...source, start, end, quoteSha256: hash(codePointSlice(event.text, start, end)) }, entry.label);
    }
    if (entry.kind === 'assistant_message') {
      const source = proof.assistantMaterials.find(source => source.messageId === address.id && source.start === address.offset);
      const message = source && this.repo.personalMethodAssistantSource(handle, source);
      if (!source || !message || canonical(message.sourceRefs) !== canonical(source.sourceRefs))
        throw new HarnessError('companion_source_changed', "The original page's assistant material exited.");
      return { kind: 'excerpt', title: entry.label, text: codePointSlice(message.text, source.start, source.end), origin: 'assistant_history' };
    }
    const file = proof.materials.find(file => file.resourceId === address.resourceId && file.offset === address.offset
      && file.limit === address.limit && file.page === address.page);
    const event = file && this.repo.evidence(handle, file.source.eventId);
    const metadata = event && JSON.parse(event.text) as { mediaType?: unknown } | undefined;
    if (!file || !metadata || !['text/plain', 'text/markdown', 'application/pdf'].includes(String(metadata.mediaType)))
      throw new HarnessError('companion_source_changed', "The original file identity cannot currently be verified.");
    return { kind: 'file', title: entry.label, resourceId: file.resourceId, sha256: file.sha256, version: file.version,
      mediaType: metadata.mediaType as 'text/plain' | 'text/markdown' | 'application/pdf',
      ...(file.page === undefined ? {} : { page: file.page }), offset: file.offset, limit: file.limit };
  }

  assertCurrent(handle: ScopeHandle, id: string, revision: number, matterId: string, permits?: Permission) {
    this.scope(handle);
    const value = this.current(handle, matterId, id, permits);
    if (!value || value.record.revision !== revision)
      throw new HarnessError('companion_changed', "The saved checkpoint or its sources changed. Continue from current content.");
  }
}
