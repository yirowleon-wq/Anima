import { randomUUID } from 'node:crypto';
import { HarnessError, type ScopeHandle, type WorkSourceRef } from '../../shared/harness';
import { curiosityPresentationInput, curiosityViewSchema, type CuriosityScene } from '../../shared/curiosity-scene';
import type { z } from 'zod';
import type { RuntimeCoordinator, RunSession } from './coordinator';
import type { CuriosityContext, CuriosityInvitationService } from './curiosity-invitation';
import { canonical, codePointSlice } from './semantics';

type Host = Pick<RuntimeCoordinator, 'repo' | 'policy'> & { curiosityInvitations: CuriosityInvitationService };

export function curiosityContextForRun(host: Host, session: RunSession): CuriosityContext {
  const handle = session.ingress.contract.scope;
  return { sessionId: session.sessionId, events: session.events, ephemeral: session.ephemeral,
    allowCrossSession: session.ingress.contract.memoryMode === 'relevant',
    observations: session.observations || [], deliveredObservationIds: session.deliveredObservationIds || new Set(),
    ...(session.selection?.storySetting ? { storySettingSelection: structuredClone(session.selection.storySetting) } : {}),
    permits: (ref: WorkSourceRef) => {
      const view = session.attentionEvidenceViews?.[ref.eventId];
      if (!view) return true;
      const event = host.repo.evidence(handle, ref.eventId) || session.events.find(value => value.id === ref.eventId);
      return !!event && event.contentVersion === ref.contentVersion && view.contentVersion === ref.contentVersion
        && view.sourceStart <= ref.start && view.sourceEnd >= ref.end
        && codePointSlice(event.text, view.sourceStart, view.sourceEnd) === view.quote;
    } };
}

/** The caller admits the final presentation budget and records the returned
 * sources once. This factory neither publishes a scene nor writes another owner. */
export function createCuriosityPresentation(host: Host, session: RunSession,
  raw: z.infer<typeof curiosityPresentationInput>, signal: AbortSignal) {
  signal.throwIfAborted();
  const input = curiosityPresentationInput.parse(raw), handle = session.ingress.contract.scope;
  const scope = host.policy.require(handle, 'evidence:read');
  if (session.background || scope.child || scope.subjectId !== scope.principalId || scope.worldId !== 'real'
    || scope.audience !== 'self' || !scope.sources.includes('work:self'))
    throw new HarnessError('curiosity_presentation', "This experience opens in the current private conversation, without a separate background message.");
  const read = host.curiosityInvitations.read(handle, curiosityContextForRun(host, session), input.id);
  if (read.value.status !== 'available')
    throw new HarnessError('curiosity_public_refresh', "The original source for this discovery was not reread this round. Return to it or create something without unverified claims.", 'read');
  const view = curiosityViewSchema.parse(read.value.curiosity);
  if (view.revision !== input.expectedRevision || view.matterRevision !== input.expectedMatterRevision)
    throw new HarnessError('curiosity_changed', "This experience moved forward. Continue its current part first.");
  const refs = [...new Map(read.records.flatMap(record => record.sourceBinding?.refs || [])
    .map(ref => [canonical(ref), ref])).values()];
  const binding = host.repo.resolveWorkSourceBinding(handle, refs), now = host.repo.clock.now();
  const noteSources = host.repo.workNoteSources(handle, read.records);
  const scene: CuriosityScene = { kind: 'curiosity', id: randomUUID(), revision: 1,
    sessionId: session.sceneSessionId || session.sessionId, createdAt: now,
    source: { sourceId: 'work:self', fetchedAt: now, version: `${view.matterRevision}:${view.revision}` },
    view, provenance: { sourceBinding: binding, noteSources,
      ...(read.assistantWorkSources?.length ? { assistantWorkSources: read.assistantWorkSources } : {}) } };
  signal.throwIfAborted(); host.policy.validate(handle);
  return { scene, records: read.records, bindings: [binding, ...read.bindings], assistantWorkSources: read.assistantWorkSources || [] };
}

/** Generic history may show a legal creation, but cannot refresh a public
 * discovery from its cached body. Public/mixed scenes require the actual run's
 * delivered research.read observations again, including at parent adoption. */
export function assertCuriositySceneReadable(host: Host, handle: ScopeHandle, scene: CuriosityScene,
  context?: CuriosityContext) {
  assertCuriositySnapshotSourcesReadable(host, handle, scene);
  if (scene.view.origin === 'created' && scene.view.status === 'historical' && !scene.view.choices.length) {
    // A source-legal old work is not the current option state. Later turns can
    // add private conditions; reading the past piece need not read those too.
    return curiosityViewSchema.parse(scene.view);
  }
  if (scene.view.origin !== 'created' && !context)
    throw new HarnessError('curiosity_public_refresh', "Re-read this public discovery in the current conversation. An old view did not become new source material.");
  const current = host.curiosityInvitations.read(handle, context || { sessionId: scene.sessionId, events: [], ephemeral: false,
    observations: [], deliveredObservationIds: new Set() }, scene.view.id);
  if (current.value.status !== 'available')
    throw new HarnessError('curiosity_public_refresh', "Expand the current public source before continuing this discovery.");
  const view = curiosityViewSchema.parse(current.value.curiosity);
  // A newly read public source may have a different actual read time/call ID.
  // That is a new projection, not permission to rewrite this picture in place.
  if (canonical(view) !== canonical(scene.view))
    throw new HarnessError('curiosity_changed', "This experience or its current sources changed. Open the current content.");
  const refs = [...new Map(current.records.flatMap(record => record.sourceBinding?.refs || [])
    .map(ref => [canonical(ref), ref])).values()];
  if (canonical(host.repo.resolveWorkSourceBinding(handle, refs)) !== canonical(scene.provenance.sourceBinding))
    throw new HarnessError('curiosity_source_changed', "This experience's evidence changed. Continue from current original words.");
  return view;
}

/** Displaying an already-authored snapshot is distinct from adopting public
 * facts in a new run. Only the live host path can use this weaker source check. */
export function assertCuriositySnapshotSourcesReadable(host: Pick<Host, 'repo' | 'policy'>, handle: ScopeHandle, scene: CuriosityScene) {
  const scope = host.policy.require(handle, 'evidence:read');
  if (scope.child || scope.audience !== 'self' || scope.subjectId !== scope.principalId || scope.worldId !== 'real'
    || !scope.sources.includes('work:self')) throw new HarnessError('curiosity_scope', "This work is not yet readable within the person's current conversation.");
  if (scene.kind !== 'curiosity' || scene.source.sourceId !== 'work:self'
    || !host.repo.workBindingsReadable(handle, [scene.provenance.sourceBinding])
    || !host.repo.noteSourcesReadable(handle, scene.provenance.noteSources || [])
    || !host.repo.assistantWorkSourcesReadable(handle, scene.provenance.assistantWorkSources || []))
    throw new HarnessError('curiosity_source_changed', "A source of this experience changed. The body was not restored from a view copy.");
  return curiosityViewSchema.parse(scene.view);
}
