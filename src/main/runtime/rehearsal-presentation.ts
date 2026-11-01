import * as z from 'zod';
import { rehearsalPresentationInput, rehearsalViewSchema, type RehearsalScene } from '../../shared/relationship-rehearsal';
import { HarnessError, type ScopeHandle, type WorkSourceRef } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import type { PolicyKernel } from './policy';
import type { RunSession } from './coordinator';
import type { RelationshipRehearsalService } from './relationship-rehearsal';
import { canonical, codePointSlice } from './semantics';

type Host = { repo: KernelRepository; policy: PolicyKernel; rehearsals: RelationshipRehearsalService };
const permits = (host: Host, session: RunSession) => (ref: WorkSourceRef) => {
  const view = session.attentionEvidenceViews?.[ref.eventId];
  if (!view) return true;
  const event = host.repo.evidence(session.ingress.contract.scope, ref.eventId);
  return !!event && event.contentVersion === ref.contentVersion && view.contentVersion === ref.contentVersion
    && view.sourceStart <= ref.start && view.sourceEnd >= ref.end && codePointSlice(event.text, view.sourceStart, view.sourceEnd) === view.quote;
};

/** No model-provided dialogue or role enters the renderer through this factory.
 * It reopens the original owner under the current scope and exact revision. */
export function createRehearsalPresentation(host: Host, session: RunSession,
  raw: z.infer<typeof rehearsalPresentationInput>, signal: AbortSignal) {
  signal.throwIfAborted();
  const input = rehearsalPresentationInput.parse(raw), handle = session.ingress.contract.scope;
  if (!session.pack) throw new HarnessError('context_missing', "Reconnect this round's original words and presentation budget before showing the rehearsal.");
  if (session.background || host.policy.validate(handle).child)
    throw new HarnessError('rehearsal_presentation', "This rehearsal opens only in the person's current conversation.");
  const read = host.rehearsals.read(handle, { sessionId: session.sessionId,
    allowCrossSession: session.ingress.contract.memoryMode === 'relevant', permits: permits(host, session) },
  { id: input.id, expectedRevision: input.expectedRevision });
  if (!read.view) throw new HarnessError('rehearsal_changed', "This round's original words are unreadable. Reconnect currently permitted content.");
  const view = rehearsalViewSchema.parse(read.view), now = host.repo.clock.now();
  const scene: RehearsalScene = { ...view, kind: 'rehearsal', sessionId: session.sceneSessionId || session.sessionId,
    createdAt: now, sourceBoundary: `${host.repo.epoch}:${host.repo.policyRevision}:${host.policy.sourceBoundary}`,
    source: { sourceId: 'work:self', fetchedAt: now, version: `${view.id}@${view.revision}` } };
  signal.throwIfAborted(); host.policy.validate(handle);
  return { scene, records: read.records };
}

export function assertRehearsalSnapshotReadable(host: Pick<Host, 'repo' | 'policy'>, handle: ScopeHandle, scene: RehearsalScene) {
  const scope = host.policy.require(handle, 'evidence:read');
  if (scope.audience !== 'self' || scope.subjectId !== scope.principalId || scope.worldId !== 'real'
    || !scope.sources.includes('work:self') || scene.source.sourceId !== 'work:self')
    throw new HarnessError('rehearsal_scope', "This simulation cannot leave the person's currently permitted private scope.");
  const { kind: _kind, sessionId: _session, createdAt: _created, sourceBoundary: _boundary, source: _source, ...raw } = scene;
  const view = rehearsalViewSchema.parse(raw);
  if (!host.repo.workBindingsReadable(handle, [view.sourceBinding]))
    throw new HarnessError('rehearsal_source_changed', "A real source behind this rehearsal exited. Old simulation cannot restore it.");
  return view;
}

export function assertRehearsalCurrent(host: Host, handle: ScopeHandle, scene: RehearsalScene) {
  const view = assertRehearsalSnapshotReadable(host, handle, scene);
  const current = host.rehearsals.read(handle, { sessionId: scene.sessionId, allowCrossSession: false },
    { id: view.id, expectedRevision: view.revision, offset: view.coverage.offset, limit: Math.max(1, view.turns.length) });
  if (!current.view || canonical(current.view) !== canonical(view))
    throw new HarnessError('rehearsal_changed', "This exchange changed. Continue the current round without restoring old line positions.");
  return view;
}
