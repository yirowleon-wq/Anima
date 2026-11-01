import { randomUUID } from 'node:crypto';
import { HarnessError } from '../../shared/harness';
import { PROGRAM_LIBRARY_VERSION, interactiveProgramInputSchema, type InteractiveProgramInput, type InteractiveProgramDraft,
  type ProgramStateValues } from '../../shared/interactive-program';
import type { PresentationView, SceneSnapshot } from '../../shared/scenes';
import type { RunSession, RuntimeCoordinator } from './coordinator';
import { compileInteractiveProgram } from './interactive-program-compiler';
import { bindProgramSceneSources, inheritPreviousProgramSources, inheritPreviousProgramData, lookupPreviousProgram, resolveProgramBindings,
  type ProgramSourceAdmission } from './interactive-program-sources';
import { editedProgramStates, mergeProgramSource, sourceSlotReferences } from './interactive-program-edit';

type ProgramHost = Parameters<typeof resolveProgramBindings>[0] & Pick<RuntimeCoordinator, 'scenes' | 'assertPresenceCreation' | 'campusSceneSources'>;
export interface InteractiveProgramPresentation {
  view: PresentationView;
  admission: ProgramSourceAdmission;
  edit?: { mode: 'statement_patch'; stateOrigin: string; explicitInputFields: number };
}

/** Purpose review needs the proposed source boundary, not another reading of
 * authored arithmetic/layout or local values. Only the caller's already
 * source-qualified current reference may supply a formal Message identity. */
export function projectInteractiveProgramReadPurpose(request: unknown,
  currentProgramReference?: unknown, providedProgramReference?: { source: { messageId: string; programId: string; revision: number }; origin: 'delivered_this_run' | 'published_this_run' }) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return request;
  const envelope = request as Record<string, unknown>, raw = envelope.arguments;
  if (envelope.tool !== 'present_view' || !raw || typeof raw !== 'object' || Array.isArray(raw)) return request;
  const args = raw as Record<string, unknown>;
  if (args.program === undefined) return request;
  const input = interactiveProgramInputSchema.parse(args.program);
  const kinds = { number: 0, boolean: 0, text: 0, choice: 0, sequence: 0 };
  const fields = 'patch' in input ? input.stateChanges || {} : input.states;
  for (const state of Object.values(fields)) if (state) kinds[state.kind]++;
  const formal = currentProgramReference as { messageId?: unknown; programId?: unknown; revision?: unknown } | undefined;
  const source = formal && typeof formal.messageId === 'string' && typeof formal.programId === 'string'
    && Number.isSafeInteger(formal.revision) && Number(formal.revision) > 0
    ? { messageId: formal.messageId, programId: formal.programId, revision: Number(formal.revision) } : undefined;
  const matched = input.previous && source && input.previous.id === source.programId
    && input.previous.expectedRevision === source.revision;
  const provided = providedProgramReference?.source;
  const readMatched = input.previous && provided && input.previous.id === provided.programId
    && input.previous.expectedRevision === provided.revision;
  return { ...envelope, arguments: { ...args, program: {
    libraryVersion: input.libraryVersion, operation: input.previous ? 'revise' : 'create',
    ...(input.previous ? { previous: { ...input.previous, formalIdentity: matched
      ? { status: 'matches_current_admitted_reference', source }
      : { status: source ? 'not_matched_to_current_formal_reference' : 'no_current_formal_reference' },
      ...(readMatched ? { providedIdentity: { status: 'matches_provided_reference', origin: providedProgramReference!.origin, source: provided } } : {}) } } : {}),
    bindings: (input.bindings || []).map(({ alias, observationId, path }) => ({ alias, observationId, path: [...path] })),
    localFields: { count: Object.keys(fields).length, kinds, ...('patch' in input
      ? { mode: 'explicit_changes', removed: Object.values(fields).filter(value => value === null).length } : {}) },
    sourceSlotBoundary: 'patch' in input ? "This round's arguments.sceneRefs and still-valid original-work SourceSlots with rechecked provenance" : "This round's arguments.sceneRefs",
    ...('patch' in input ? { editMode: 'statement_patch', explicitInputFields: Object.keys(input.inputChanges || {}).length,
      inheritance: "Continue exact still-valid source relationships of the same original work. Current permission and actual reads determine readability and body coverage." } : {}),
    meaning: "A creation is being prepared for a reply or the original work is being revised. Listed data addresses do not establish body reading. Original surfaces admitted to the work are limited to the listed scope. Interpret purpose using current original words, the focused work, and original-work reads actually obtained this round. Without a UI reference, an actually read original can still establish identity. The application checks data permission, original revision, and program structure.",
  } } };
}

/** Compose a new revision in the ordinary assistant Message owner. No write,
 * source receipt or publication is committed until the caller admits it. */
export function createInteractiveProgramPresentation(host: ProgramHost, session: RunSession, raw: InteractiveProgramInput,
  scenes: SceneSnapshot[], signal: AbortSignal,
  sourceSupplement?: Parameters<typeof bindProgramSceneSources>[2]): InteractiveProgramPresentation {
  signal.throwIfAborted();
  const scope = host.policy.validate(session.ingress.contract.scope);
  if (scope.child || session.background && !session.presence || scope.audience !== 'self')
    throw new HarnessError('presentation_owner', "The current main assistant attaches interactive content to this conversation.");
  if (session.background) host.assertPresenceCreation(session);
  if (!session.outputMessageId) throw new HarnessError('interactive_program_owner', "This interaction is not attached to the current real reply yet.");
  const input = interactiveProgramInputSchema.parse(raw);
  if (session.background && input.previous)
    throw new HarnessError('presence_creation_scope', "This request prepares a new work only; it does not edit or restore old works in the background.");
  const previous = input.previous ? lookupPreviousProgram(host, session, input.previous, signal) : undefined;
  if (previous && previous.view.revision >= Number.MAX_SAFE_INTEGER)
    throw new HarnessError('interactive_program_revision', "This interaction reached its revision limit. Begin a separate work.");
  const admission = resolveProgramBindings(host, session, input.bindings || [], signal);
  if (previous) inheritPreviousProgramSources(admission, previous, session);
  let draft: InteractiveProgramDraft, edit: InteractiveProgramPresentation['edit'], initialInputs: ProgramStateValues | undefined,
    initialInputFields: string[] | undefined;
  if ('patch' in input) {
    if (!previous) throw new HarnessError('interactive_program_patch', "A local continuation needs the exact previous reference of the same original work.");
    const dsl = mergeProgramSource(previous.program.sourceDsl, input.patch);
    const state = editedProgramStates(previous.program, input, session, previous.source);
    initialInputs = state.initialInputs;
    initialInputFields = state.initialInputFields;
    draft = { libraryVersion: input.libraryVersion, previous: input.previous, dsl, states: state.states, bindings: input.bindings || [] };
    inheritPreviousProgramData(admission, previous, session);
    const surviving = sourceSlotReferences(dsl), currentRefs = new Set(scenes.map(scene => `${scene.id}@${scene.revision}`));
    for (const ref of surviving) {
      if (currentRefs.has(ref)) continue;
      const allowed = previous.program.sourceSlots?.includes(ref)
        && previous.view.sceneRefs.find(scene => `${scene.id}@${scene.revision}` === ref);
      if (!allowed) throw new HarnessError('interactive_program_source_slot', "This new view lacks its original reference. Obtain its address from sceneRefs actually returned this round to attach it to the same work.");
      if (scenes.some(scene => scene.id === allowed.id))
        throw new HarnessError('duplicate_scene', "Two revisions of the same view were supplied. Select the intended revision and replace the old reference before expanding.");
      signal.throwIfAborted();
      const row = host.repo.db.prepare('SELECT session_id FROM messages WHERE id=?').get(previous.source.messageId);
      const sessionId = row ? String(row.session_id) : session.sceneSessionId || session.sessionId;
      scenes.push(host.scenes.get(session.ingress.contract.scope, sessionId, allowed, session.ingress.contract.id));
      currentRefs.add(ref);
    }
    edit = { mode: 'statement_patch', stateOrigin: state.stateOrigin, explicitInputFields: state.explicitInputFields };
  } else draft = input;
  const campusSources = scenes.flatMap(scene => {
    if (scene.kind !== 'campus' || scene.source.sourceId !== 'campus:academic-account') return [];
    const sources = host.campusSceneSources(session.ingress.contract.scope, session.sceneSessionId || session.sessionId, scene);
    if (!sources.length) throw new HarnessError('campus_history_changed', "This campus view's original account source does not match this round. Reread through currently permitted sources.");
    return sources;
  });
  const campusSensitiveReads = scenes.flatMap(scene => {
    if (scene.kind !== 'campus' || scene.source.sourceId !== 'campus:academic-account') return [];
    const sessionId = session.sceneSessionId || session.sessionId;
    const owners = host.repo.campusSceneSourceMessageIds(session.ingress.contract.scope, sessionId, scene);
    return host.repo.conversationCampusSensitiveReads(session.ingress.contract.scope, sessionId, owners);
  });
  bindProgramSceneSources(admission, scenes, { ...sourceSupplement,
    ...(campusSources.length ? { campusReadingSources: [...(sourceSupplement?.campusReadingSources || []), ...campusSources] } : {}),
    ...(campusSensitiveReads.length ? { campusSensitiveReads: [...(sourceSupplement?.campusSensitiveReads || []), ...campusSensitiveReads] } : {}) });
  let program;
  try {
    program = compileInteractiveProgram(draft, admission.data, admission.provenance,
      scenes.map(({ id, revision }) => `${id}@${revision}`), admission.provenance.bindings.map(binding => binding.alias), initialInputs, initialInputFields);
  } catch (error) {
    if (!(error instanceof HarnessError) || !error.diagnostic) throw error;
    signal.throwIfAborted(); host.policy.validate(session.ingress.contract.scope);
    const previousNavigation = previous && input.previous ? {
      relation: 'matches_known_reference' as const, fields: { id: 'programId' as const, expectedRevision: 'revision' as const }, automaticRebase: false as const,
      knownReference: { basis: 'validated_previous' as const, source: previous.source,
        previous: { id: previous.view.id, expectedRevision: previous.view.revision },
        read: { tool: 'read_interactive_program' as const, arguments: { ...previous.source, mode: 'overview' as const } } },
    } : undefined;
    throw new HarnessError(error.code, error.message, error.retry, { ...error.diagnostic,
      ...(previousNavigation ? { previous: previousNavigation } : {}),
      explanation: (previousNavigation
        ? "This continuation draft remains uncommitted; the original work and revision are unchanged. previous below points to the revision actually read this round for further editing."
        : "This initial draft is unpublished. Repair it before obtaining a readable programRef.") + error.diagnostic.explanation });
  }
  signal.throwIfAborted(); host.policy.validate(session.ingress.contract.scope);
  return { admission, ...(edit ? { edit } : {}), view: { id: previous?.view.id || randomUUID(), revision: previous ? previous.view.revision + 1 : 1,
    libraryVersion: PROGRAM_LIBRARY_VERSION, createdAt: host.repo.clock.now(),
    sceneRefs: scenes.map(({ id, revision }) => ({ id, revision })), dsl: program.dsl, program } };
}
