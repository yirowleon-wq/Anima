import { randomUUID } from 'node:crypto';
import * as z from 'zod';
import { HarnessError, type InteractiveProgramReadDeliveryIssue, type InteractiveProgramReadFailure, type InteractiveProgramReadReceipt } from '../../shared/harness';
import { interactiveProgramReferenceSchema, programNodeIdSchema, validateProgramState,
  type InteractiveProgramDocument, type ProgramFollowupReference, type ProgramStateValues } from '../../shared/interactive-program';
import type { RunSession, RuntimeCoordinator } from './coordinator';
import { admitProgramRead, canRefineCurrentProgramPublication, programReferenceIdentity, programSourcesReadable, readProgramView, recordProgramSources,
  type ProgramSourceAddress, type ProgramSourceProvenance } from './interactive-program-sources';
import { validateProgramStateAndEvaluate } from './interactive-program-compiler';
import { canonical, codePointSlice } from './semantics';
import { boundedProgramPresentation } from './presentation-delivery';

type ProgramHost = Pick<RuntimeCoordinator, 'repo' | 'policy' | 'context' | 'broker' | 'studyCompanion'>;

/** A delivered original or this turn's acknowledged publication can identify
 * the work. Neither invents a formal input snapshot nor authorizes an edit. */
export function deliveredProgramPurposeReference(host: ProgramHost, session: RunSession, request: unknown, signal: AbortSignal) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) return;
  const envelope = request as { tool?: unknown; arguments?: { program?: { previous?: { id?: unknown; expectedRevision?: unknown } };
    messageId?: unknown; programId?: unknown; revision?: unknown } };
  const readSource = envelope.tool === 'read_interactive_program' ? envelope.arguments : undefined;
  const previous = envelope.tool === 'present_view' ? envelope.arguments?.program?.previous
    : readSource && typeof readSource.messageId === 'string'
      ? { id: readSource.programId, expectedRevision: readSource.revision } : undefined;
  if (!previous || typeof previous.id !== 'string'
    || !Number.isSafeInteger(previous.expectedRevision) || Number(previous.expectedRevision) < 1) return;
  signal.throwIfAborted();
  const handle = session.ingress.contract.scope, scope = host.policy.validate(handle);
  if (session.background || scope.child || scope.audience !== 'self' || !session.pack) return;
  if ((!readSource || readSource.messageId === session.outputMessageId) && canRefineCurrentProgramPublication(host, session,
    { id: previous.id, expectedRevision: Number(previous.expectedRevision) }, signal))
    return { source: { messageId: session.outputMessageId!, programId: previous.id, revision: Number(previous.expectedRevision) },
      origin: 'published_this_run' as const,
      meaning: "The main assistant published this revision this round and received its real publication receipt; original sources were just rechecked. The inbound UI reference still identifies the revision the person selected. This receipt records progress on the same work without rewriting the UI reference, local inputs, or permission." };
  for (const read of [...(session.pack.receipt.interactiveProgramReads || [])].reverse()) {
    const ref = read.source;
    if (read.status !== 'available' || read.delivery !== 'delivered_to_model'
      || readSource && ref.messageId !== readSource.messageId
      || ref.programId !== previous.id || ref.revision !== previous.expectedRevision) continue;
    const identity = programReferenceIdentity(host, handle, ref,
      ref.messageId === session.outputMessageId || session.ingress.contract.memoryMode !== 'relevant' ? session.sessionId : undefined);
    if (!identity || !programSourcesReadable(host, handle, [ref], session)) continue;
    signal.throwIfAborted(); host.policy.validate(handle);
    return { source: { messageId: ref.messageId, programId: ref.programId, revision: ref.revision },
      origin: 'delivered_this_run' as const, readMode: read.mode, coverage: { ...read.coverage },
      meaning: "This original read result was actually delivered to the main assistant, and its address and sources were just rechecked. It identifies the original work, not formal UI input, proof of seeing, or edit permission." };
  }
}

const readInput = z.object({ messageId: z.string().min(1).max(160), programId: z.string().min(1).max(160),
  revision: z.number().int().positive(), mode: z.enum(['overview', 'source', 'states']).default('overview'),
  offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(64000).optional(),
  nodeId: programNodeIdSchema.optional().describe("overview may read one node actually present in native evaluation; omit nodeId for a bounded document-root overview."),
  stateKeys: z.array(z.string().min(1).max(48)).min(1).max(8).optional().describe("states mode: retrieve complete declarations and state for only these actual fields."),
  full: z.boolean().optional().describe("source only: explicitly read the currently permitted complete sourceDsl without silent truncation."),
  find: z.string().min(1).max(160).optional().describe("source only: locate exact Unicode positions of literal sourceDsl text, without reading bodies, guessing statements, or returning only the first match."),
}).strict().superRefine((input, context) => {
  const issue = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  if (input.mode !== 'source' && (input.full || input.find)) issue("Full reads and literal-position queries apply only to source mode.");
  if (input.mode !== 'states' && input.stateKeys) issue("Use states mode when selecting complete fields.");
  if (input.mode !== 'overview' && input.nodeId) issue("Node scope applies only to overview mode.");
  if (input.mode === 'overview' && (input.limit || 12) > 16) issue("An overview returns up to 16 actual nodes per page. Copy next to continue.");
  if (input.mode === 'states' && (input.limit || 4) > 8) issue("A complete-field read returns up to 8 fields. Use actual stateKeys for exact reads.");
  if (input.find && (input.limit || 8) > 16) issue("A literal-position query returns up to 16 positions. Copy next to continue.");
  if (input.full && (input.offset !== undefined || input.limit !== undefined || input.find)) issue("A full read cannot be combined with fragments, positions, or literal search.");
});
export const interactiveProgramReadDefinitions = [{ name: 'read_interactive_program', grant: 'evidence:read', schema: readInput,
  description: "Read the same interactive creation as needed using actual messageId/programId/revision. Default overview pages bounded native summaries and state previews from the document root; explicit nodeId selects only that node without reading full DSL. source reads exact sourceDsl by absolute Unicode offset/limit; find locates literals only; a complete read needs full:true. states returns complete declarations by actual stateKeys or page. Copy next; an overview or final page does not establish a full source read. Current values come only from this round's admitted UI reference; otherwise identify initial or focus_only. Missing Data remains needs_refresh. SourceSlot provides an address without expanding private tables. No tool execution or permission upgrade." }];

function locateNativeNode(value: unknown, nodeId: string): unknown {
  if (Array.isArray(value)) { for (const child of value) { const found = locateNativeNode(child, nodeId); if (found) return found; } return; }
  if (!value || typeof value !== 'object') return;
  const node = value as { type?: string; props?: { id?: string; children?: unknown } };
  if (node.type !== 'element') return;
  return node.props?.id === nodeId ? value : locateNativeNode(node.props?.children, nodeId);
}
function previewValue(value: unknown) {
  if (typeof value === 'string') {
    const total = Array.from(value).length, end = Math.min(80, total);
    return { value: codePointSlice(value, 0, end), coverage: { start: 0, end, total, complete: end === total } };
  }
  if (Array.isArray(value)) return { value: value.slice(0, 8).map(item => typeof item === 'string' ? codePointSlice(item, 0, 80) : item),
    coverage: { start: 0, end: Math.min(8, value.length), total: value.length,
      complete: value.length <= 8 && value.every(item => typeof item !== 'string' || Array.from(item).length <= 80) } };
  return { value, coverage: { complete: true } };
}
function inputProjection(inputs: ProgramStateValues) {
  return { inputs: structuredClone(inputs), inputCoverage: { complete: true } };
}
export function programStateForRead(session: RunSession, source: ProgramSourceAddress, program: InteractiveProgramDocument) {
  const ref = session.programReference, current = session.pack?.data.currentInteractive as Record<string, unknown> | undefined;
  const same = ref && ref.messageId === source.messageId && ref.programId === source.programId && ref.revision === source.revision
    && current?.messageId === source.messageId && current.programId === source.programId && current.revision === source.revision
    && current.nodeId === ref.nodeId;
  if (same && ref.inputs !== undefined && ['local_conditions', 'local_conditions_error'].includes(String(current.mode)))
    return { inputs: validateProgramState(program.states, ref.inputs), origin: 'this_turn_admitted_ui_reference' as const };
  return { inputs: program.initialState, origin: same && current.mode === 'focus_only'
    ? 'initial_only_focus_has_no_current_inputs' as const : 'initial_not_current_ui_state' as const };
}

function programReadNavigation(source: ProgramSourceAddress, nodeId: string) {
  return { previous: { id: source.programId, expectedRevision: source.revision },
    read: { tool: 'read_interactive_program', arguments: { ...source, mode: 'overview' } },
    readFocused: { tool: 'read_interactive_program', arguments: { ...source, mode: 'overview', nodeId } } };
}

/** Inputs are hypothetical local conditions. The host recomputes the same
 * native program, then locates the actual node; no client-derived answer or
 * tool invocation is accepted. A focus-only reference makes no value claim. */
export function resolveProgramReference(host: ProgramHost, session: RunSession, raw: ProgramFollowupReference, signal: AbortSignal) {
  signal.throwIfAborted();
  const ref = interactiveProgramReferenceSchema.parse(raw), source: ProgramSourceAddress = {
    messageId: ref.messageId, programId: ref.programId, revision: ref.revision };
  const view = readProgramView(host, session, source), program = view.program;
  if (!program) throw new HarnessError('interactive_program_missing', "This interaction in the original reply is outside the current readable scope.");
  const admission = admitProgramRead(host, session, source, view, signal);
  const observations = (program.provenance as ProgramSourceProvenance).bindings.map(binding => ({ alias: binding.alias,
    tool: binding.tool, sourceId: binding.sourceId, fetchedAt: binding.fetchedAt, expiresAt: binding.expiresAt,
    status: binding.status, use: binding.use, ...(binding.origin ? { origin: binding.origin, parent: binding.parent } : {}) }));
  if (ref.inputs === undefined) {
    if (!program.nodeIds.includes(ref.nodeId)) throw new HarnessError('interactive_node_changed', "Reference this component with its complete current local inputs.");
    return { reference: ref, programSources: [source], sourceAdmission: admission, projection: {
      ...source, nodeId: ref.nodeId, kind: 'interactive_program', mode: 'focus_only', observations,
      ...programReadNavigation(source, ref.nodeId),
      meaning: "The person focused on the same interactive work but supplied no current local inputs. Do not claim to observe adjusted derived values.",
    } };
  }
  const inputs = validateProgramState(program.states, ref.inputs);
  let evaluated: ReturnType<typeof validateProgramStateAndEvaluate>;
  try { evaluated = validateProgramStateAndEvaluate(program, inputs); }
  catch (error) {
    // A valid local condition can leave the expression/plot domain. Retain
    // that actual condition and honest failure, not an invented output or 0.
    if (!(error instanceof HarnessError) || error.code !== 'interactive_program') throw error;
    if (!program.nodeIds.includes(ref.nodeId)) throw new HarnessError('interactive_node_changed', "This evaluation did not generate that component. Reconnect its actual position in the original content.");
    return { reference: { ...ref, inputs }, programSources: [source], sourceAdmission: admission, projection: {
      ...source, nodeId: ref.nodeId, kind: 'interactive_program', mode: 'local_conditions_error', ...inputProjection(inputs), observations,
      error: { code: error.code, reason: error.message },
      ...programReadNavigation(source, ref.nodeId),
      meaning: "The original component address and declared local inputs are valid, but the same host native program failed under these conditions. There is no current derived node or answer. Explain or revise under these conditions without filling failure with zero or treating parameters as personal facts.",
    } };
  }
  if (!evaluated.nodeIds.includes(ref.nodeId)) throw new HarnessError('interactive_node_changed', "This component is not generated by the current input. Reference it again from the original view.");
  const target = locateNativeNode(evaluated.root, ref.nodeId);
  if (!target) throw new HarnessError('interactive_node_changed', "This component has no actual matching evaluation result.");
  signal.throwIfAborted();
  const presentation = boundedProgramPresentation(target);
  return { reference: { ...ref, inputs: evaluated.inputs }, programSources: [source], sourceAdmission: admission, projection: {
    ...source, nodeId: ref.nodeId, kind: 'interactive_program', mode: 'local_conditions', ...inputProjection(evaluated.inputs),
    presentation: { ...presentation, next: presentation.nextOffset === null ? null : { tool: 'read_interactive_program',
      arguments: { ...source, mode: 'overview', nodeId: ref.nodeId, offset: presentation.nextOffset, limit: 12 } } }, observations,
    ...programReadNavigation(source, ref.nodeId),
    meaning: "These are the person's submitted local hypotheses and the same host native program's actual evaluation from originally read observations. Observation time and coverage remain with the original source, not a new live or account read. Parameters, computations, and clicks are not personal facts, acceptance, or execution. New user statements still require original semantic interpretation.",
  } };
}
export { programReferenceIdentity };

/** Failed model-supplied addresses never become host source addresses. Only
 * their relation to already-admitted identities and a fixed reason survive. */
function recordProgramReadFailure(host: ProgramHost, session: RunSession, ref: ProgramSourceAddress,
  mode: 'overview' | 'source' | 'states', error: unknown, signal: AbortSignal) {
  const reasons: Record<string, InteractiveProgramReadFailure['reason']> = {
    interactive_program_reference_unqualified: 'reference_unqualified',
    interactive_program_source_proof_unavailable: 'source_proof_unavailable',
    interactive_program_view_missing: 'view_missing',
  };
  if (!(error instanceof HarnessError) || !Object.hasOwn(reasons, error.code) || !session.pack || signal.aborted) return;
  signal.throwIfAborted(); host.policy.validate(session.ingress.contract.scope);
  const same = (value: { messageId?: unknown; programId?: unknown; revision?: unknown } | undefined) => value
    && value.messageId === ref.messageId && value.programId === ref.programId && value.revision === ref.revision;
  const current = session.pack.data.currentInteractive as { messageId?: unknown; programId?: unknown; revision?: unknown } | undefined;
  const formal = !!(same(current) && same(session.programReference));
  const admitted = !!session.pack.receipt.interactiveProgramReads?.some(receipt => same(receipt.source));
  const relation: InteractiveProgramReadFailure['relation'] = formal && admitted ? 'formal_and_admitted'
    : formal ? 'formal_current' : admitted ? 'earlier_admitted' : 'unmatched_request';
  session.pack.receipt.interactiveProgramReadFailures = [...(session.pack.receipt.interactiveProgramReadFailures || []),
    { mode, reason: reasons[error.code], relation }].slice(-6);
  host.repo.saveReceipt(session.pack.contract.scope, session.pack.receipt);
}

/** Only safe, bounded admission metrics. A successful local read is distinct
 * from inclusion in a later successful request, let alone understanding. */
function programReadReceipt(source: ProgramSourceAddress, mode: 'overview' | 'source' | 'states',
  section: Record<string, unknown>, needsData: boolean, id: string, bytes: number, estimatedTokens: number): InteractiveProgramReadReceipt {
  const presentation = section.presentation as { parts?: unknown[]; coverage?: { offset: number; end: number; total: number; completeForProjection: boolean } } | undefined;
  const sourcePart = section.source as { text?: string; matches?: unknown[]; total?: number; searchFrom?: number;
    completeFromOffset?: boolean; coverage?: { start: number; end: number; total: number; wholeSourceProvided: boolean } } | undefined;
  const stateCoverage = section.coverage as { offset?: number; end?: number; total?: number; wholeStatesProvided?: boolean } | undefined;
  const next = section.next as { arguments?: { offset?: number } } | null | undefined;
  const count = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).length : 0;
  const coverage = mode === 'overview' ? { offset: presentation?.coverage?.offset || 0, end: presentation?.coverage?.end || 0,
    total: presentation?.coverage?.total || 0, complete: presentation?.coverage?.completeForProjection === true,
    wholeSourceProvided: false, sourceBodiesProvided: false, geometryPointsProvided: false }
    : mode === 'states' ? { offset: stateCoverage?.offset || 0, end: stateCoverage?.end || 0,
      total: stateCoverage?.total || 0, complete: stateCoverage?.offset === 0 && stateCoverage.end === stateCoverage.total,
      wholeSourceProvided: false, sourceBodiesProvided: false, geometryPointsProvided: false }
    : sourcePart?.coverage ? { offset: sourcePart.coverage.start, end: sourcePart.coverage.end,
      total: sourcePart.coverage.total, complete: sourcePart.coverage.wholeSourceProvided,
      wholeSourceProvided: sourcePart.coverage.wholeSourceProvided, sourceBodiesProvided: false, geometryPointsProvided: false }
    : { offset: sourcePart?.searchFrom || 0, end: sourcePart?.completeFromOffset ? sourcePart.total || 0 : next?.arguments?.offset || 0,
      total: sourcePart?.total || 0, complete: sourcePart?.completeFromOffset === true,
      wholeSourceProvided: false, sourceBodiesProvided: false, geometryPointsProvided: false };
  return { id, source: { ...source }, mode,
    ...(section.stateOrigin ? { stateOrigin: section.stateOrigin as InteractiveProgramReadReceipt['stateOrigin'] } : {}),
    status: needsData ? 'needs_refresh' : section.evaluationError ? 'evaluation_error' : 'available', coverage,
    counts: { nodes: presentation?.parts?.length || 0, stateDeclarations: count(section.states), statePreviews: count(section.statePreviews),
      sourceCodePoints: typeof sourcePart?.text === 'string' ? Array.from(sourcePart.text).length : 0,
      literalMatches: sourcePart?.matches?.length || 0 }, bytes, estimatedTokens, delivery: 'admitted' };
}

/** Reuse the original exact tool-wire delivery ledger. No DSL, state, query
 * or user-named node enters the receipt; no new delivery authority is made. */
export function markInteractiveProgramReadsDelivered(host: ProgramHost, session: RunSession,
  deliveryIssues?: ReadonlyMap<string, InteractiveProgramReadDeliveryIssue>): void {
  const pack = session.pack;
  if (!pack?.receipt.interactiveProgramReads?.length) return;
  const delivered = new Set((session.observations || []).flatMap(observation => {
    if (observation.tool !== 'read_interactive_program' || !observation.toolCallId
      || !session.deliveredObservationIds?.has(observation.toolCallId)) return [];
    const result = observation.result as { readReceiptId?: unknown } | undefined;
    return typeof result?.readReceiptId === 'string' ? [result.readReceiptId] : [];
  }));
  let changed = false;
  for (const receipt of pack.receipt.interactiveProgramReads) {
    if (delivered.has(receipt.id)) {
      if (receipt.delivery !== 'delivered_to_model') { receipt.delivery = 'delivered_to_model'; changed = true; }
      if (receipt.deliveryIssue !== undefined) { delete receipt.deliveryIssue; changed = true; }
    } else if (receipt.delivery === 'admitted') {
      const issue = deliveryIssues?.get(receipt.id);
      if (issue !== undefined && receipt.deliveryIssue !== issue) { receipt.deliveryIssue = issue; changed = true; }
    }
  }
  if (changed) { host.policy.validate(pack.contract.scope); host.repo.saveReceipt(pack.contract.scope, pack.receipt); }
}

export function executeInteractiveProgramRead(host: ProgramHost, session: RunSession, name: string, raw: unknown,
  signal: AbortSignal): Promise<unknown> | undefined {
  if (name !== 'read_interactive_program') return;
  return Promise.resolve().then(() => {
    const input = readInput.parse(raw), ref: ProgramSourceAddress = { messageId: input.messageId, programId: input.programId, revision: input.revision };
    let view: ReturnType<typeof readProgramView>;
    try { view = readProgramView(host, session, ref); }
    catch (error) { recordProgramReadFailure(host, session, ref, input.mode, error, signal); throw error; }
    const program = view.program;
    if (!program || !session.pack) throw new HarnessError('interactive_program_missing', "Reconnect the actual original interaction address first.");
    const admission = admitProgramRead(host, session, ref, view, signal);
    const original = program.provenance as ProgramSourceProvenance;
    const needsData = program.bindingAliases.length > 0 && !program.currentData;
    const read = (arguments_: Record<string, unknown>) => ({ tool: 'read_interactive_program', arguments: { ...ref, ...arguments_ } });
    const sourcePoints = Array.from(program.sourceDsl), sourceLength = sourcePoints.length;
    const state = programStateForRead(session, ref, program), keys = Object.keys(program.states);
    const base = { ...ref, previous: { id: ref.programId, expectedRevision: ref.revision },
      libraryVersion: 2, status: needsData ? 'needs_refresh' : 'available',
      ...(needsData ? { bindingAliases: program.bindingAliases,
        bindingOrigins: original.bindings.map(binding => ({ alias: binding.alias, tool: binding.tool,
          priorDelivery: { observationId: binding.observationId, path: binding.path }, sourceId: binding.sourceId,
          fetchedAt: binding.fetchedAt, expiresAt: binding.expiresAt, status: binding.status, use: binding.use,
          ...(binding.origin ? { origin: binding.origin, parent: binding.parent } : {}),
          meaning: "Historical delivery-source leads, not reusable observationIds for this round or directly executable read arguments. historical_only stays historical and restores no corrected proposition." })),
        sourceNavigation: {
          notes: original.receipt.noteSources || [], materials: original.receipt.materialReads || [],
          scenes: original.receipt.sceneReferences || [],
          records: original.receipt.providedObjectVersions.filter(record => record.kind === 'domain'),
          meaning: "Only owner-address metadata actually retained in the receipt and still lawful this round. Reread through the original owner under the current request; these addresses do not expand an entire account automatically. Unknown query parameters were not invented.",
        } } : {}),
    };
    let section: Record<string, unknown>;
    if (input.mode === 'source') {
      const offset = input.offset || 0;
      if (offset > sourceLength) throw new HarnessError('interactive_source_range', "The source position exceeds this revision's actual length.");
      if (input.find) {
        const needle = Array.from(input.find), limit = input.limit || 8, matches: { start: number; end: number }[] = [];
        let more = false;
        for (let cursor = offset; cursor <= sourceLength - needle.length; cursor++) {
          if (!needle.every((point, index) => sourcePoints[cursor + index] === point)) continue;
          if (matches.length === limit) { more = true; break; }
          matches.push({ start: cursor, end: cursor + needle.length });
        }
        const nextOffset = more ? matches[matches.length - 1].start + 1 : null;
        section = { mode: 'source', source: { scope: 'literal_positions_not_statements', find: input.find,
          unit: 'unicode_code_points', total: sourceLength, searchFrom: offset, matches,
          completeFromOffset: !more, sourceTextProvided: false },
          next: nextOffset === null ? null : read({ mode: 'source', find: input.find, offset: nextOffset, limit }) };
      } else {
        const limit = input.limit || 1600, start = input.full ? 0 : offset,
          end = input.full ? sourceLength : Math.min(sourceLength, start + limit);
        section = { mode: 'source', source: { text: sourcePoints.slice(start, end).join(''),
          coverage: { unit: 'unicode_code_points', start, end, total: sourceLength,
            wholeSourceProvided: start === 0 && end === sourceLength, statesProvided: false } },
          next: end === sourceLength ? null : read({ mode: 'source', offset: end, limit }) };
      }
    } else if (input.mode === 'states') {
      const selected = input.stateKeys ? [...new Set(input.stateKeys)] : keys;
      if (selected.some(key => !Object.hasOwn(program.states, key))) throw new HarnessError('interactive_state_keys', "The field is absent from this revision's actual states. Use a name from overview.");
      const offset = input.offset || 0, limit = input.limit || (input.stateKeys?.length || 4);
      if (offset > selected.length) throw new HarnessError('interactive_state_range', "The field position exceeds this revision's actual declaration.");
      const page = selected.slice(offset, offset + limit), end = offset + page.length;
      section = { mode: 'states', stateOrigin: state.origin,
        states: Object.fromEntries(page.map(key => [key, program.states[key]])),
        values: Object.fromEntries(page.map(key => [key, state.inputs[key]])),
        coverage: { scope: input.stateKeys ? 'requested_state_keys' : 'state_declarations', offset, end,
          total: selected.length, allStateCount: keys.length, wholeStatesProvided: offset === 0 && end === keys.length && selected.length === keys.length },
        next: end === selected.length ? null : read({ mode: 'states', ...(input.stateKeys ? { stateKeys: input.stateKeys } : {}), offset: end, limit }) };
    } else {
      const states: Record<string, unknown> = {}, statePreviews: Record<string, unknown> = {}, values: Record<string, unknown> = {};
      let stateEnd = 0;
      for (const key of keys.slice(0, 8)) {
        const declaration = program.states[key], complete = Array.from(canonical(declaration)).length <= 320;
        const shape = complete ? declaration : { kind: declaration.kind, initial: previewValue(declaration.initial),
          coverage: 'declaration_preview_only_use_states_for_complete' };
        const value = previewValue(state.inputs[key]);
        stateEnd++;
        if (complete) states[key] = declaration; else statePreviews[key] = shape;
        values[key] = value;
      }
      let presentation: unknown, evaluationError: unknown;
      if (!needsData) {
        try {
          const evaluated = validateProgramStateAndEvaluate(program, state.inputs), nodeId = input.nodeId || evaluated.nodeIds[0];
          if (!evaluated.nodeIds.includes(nodeId)) throw new HarnessError('interactive_node_changed', "This node is absent from the view generated by the actual current state.");
          const target = locateNativeNode(evaluated.root, nodeId);
          if (!target) throw new HarnessError('interactive_node_changed', "The current evaluation has no such actual node.");
          const summary = boundedProgramPresentation(target, { offset: input.offset, limit: input.limit });
          presentation = { nodeId, scope: input.nodeId ? 'explicit_node' : 'whole_document', ...summary,
            next: summary.nextOffset === null ? null : read({ mode: 'overview', ...(input.nodeId ? { nodeId } : {}),
              offset: summary.nextOffset, limit: input.limit || 12 }) };
        } catch (error) {
          if (!(error instanceof HarnessError) || error.code !== 'interactive_program') throw error;
          evaluationError = { code: error.code, reason: error.message };
        }
      }
      section = { mode: 'overview', stateOrigin: state.origin, states, statePreviews, values,
        stateCoverage: { offset: 0, end: stateEnd, total: keys.length, wholeDeclarationsProvided: stateEnd === keys.length && !Object.keys(statePreviews).length },
        stateKeys: keys, ...(presentation ? { presentation } : {}), ...(evaluationError ? { evaluationError } : {}),
        source: { totalCodePoints: sourceLength, textProvided: false, read: read({ mode: 'source', offset: 0, limit: 1600 }) },
        readStates: read({ mode: 'states', offset: 0, limit: 4 }),
        coverage: { scope: 'bounded_readable_projection_and_state_previews', wholeSourceProvided: false,
          sourceBodiesProvided: false, ...(needsData ? { evaluation: 'not_performed_missing_current_data' } : {}) } };
    }
    const readReceiptId = randomUUID();
    const value = { ...base, ...section, readReceiptId,
      meaning: "Only the marked range is supplied. An overview is not full DSL, point arrays, or SourceSlot bodies. initial is not current user state, and this_turn_admitted_ui_reference describes only submitted local conditions, not personal facts or execution. Follow actual continuation addresses for declarations and source; absent portions were not read." };
    const serialized = canonical(value), bytes = Buffer.byteLength(serialized), tokens = Math.ceil(Array.from(serialized).length / 1.4);
    const pack = session.pack;
    signal.throwIfAborted(); host.policy.validate(pack.contract.scope);
    recordProgramSources(pack, admission);
    pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
    pack.receipt.interactiveProgramReads = [...(pack.receipt.interactiveProgramReads || []),
      programReadReceipt(ref, input.mode, section, needsData, readReceiptId, bytes, tokens)].slice(-6);
    host.repo.saveReceipt(pack.contract.scope, pack.receipt);
    return value;
  });
}

/** Restore the formally admitted focus after native transcript compaction.
 * This is the Enter-time projection already admitted to this run, not another
 * UI observation, a source read, a summary, or a proof of tool-wire delivery. */
export function programContinuationAfterCompression(host: ProgramHost, session: RunSession) {
  const pack = session.pack, ref = session.programReference;
  if (!pack || !ref || session.background) return;
  const scope = host.policy.validate(pack.contract.scope);
  if (scope.audience !== 'self' || scope.child) return;
  const current = pack.data.currentInteractive as Record<string, unknown> | undefined;
  if (!current || current.messageId !== ref.messageId || current.programId !== ref.programId
    || current.revision !== ref.revision || current.nodeId !== ref.nodeId
    || !['focus_only', 'local_conditions', 'local_conditions_error'].includes(String(current.mode))) return;
  const source: ProgramSourceAddress = { messageId: ref.messageId, programId: ref.programId, revision: ref.revision };
  if (!pack.receipt.interactiveProgramSources?.some(value => value.messageId === source.messageId
    && value.programId === source.programId && value.revision === source.revision)
    || !programSourcesReadable(host, pack.contract.scope, [source], session)) return;
  host.policy.validate(pack.contract.scope); session.signal.throwIfAborted();
  const copy = (value: unknown) => value === undefined ? undefined : structuredClone(value);
  const read = (arguments_: Record<string, unknown>) => ({ tool: 'read_interactive_program', arguments: { ...source, ...arguments_ } });
  const inputs = copy(current.inputs), inputPreview = copy(current.inputPreview);
  const observations = copy(current.observations);
  const observationMetadataProvided = !Array.isArray(current.observations) || !current.observations.length || observations !== undefined;
  // The original projector never includes SourceSlot bodies or graph points.
  // Keep the actual observation dates/status/history identity beside derived
  // values, without replacing their delivery by an estimated size allowance.
  const presentation = copy(current.presentation);
  const methodPages: Record<string, unknown>[] = [];
  for (const observation of [...(session.observations || [])].reverse()) {
    if (observation.tool !== 'read_skill') continue;
    const result = observation.result as Record<string, any> | undefined;
    const requested = observation.requestedArguments as Record<string, unknown> | undefined;
    const section = result?.methodRead?.section;
    if (result?.id !== 'interactive-program' || result.status !== 'read' || result.guidanceOnly !== true
      || result.authority !== 'bundled_reviewed_guidance' || requested?.id !== 'interactive-program'
      || !['authoring', 'overview', 'grammar', 'components', 'functions', 'actions'].includes(section)) continue;
    const arguments_ = { id: 'interactive-program', section,
      ...(Array.isArray(requested.names) ? { names: structuredClone(requested.names) } : {}),
      ...(typeof requested.offset === 'number' ? { offset: requested.offset } : {}),
      ...(typeof requested.limit === 'number' ? { limit: requested.limit } : {}) };
    if (methodPages.some(page => canonical(page.read) === canonical({ tool: 'read_skill', arguments: arguments_ }))) continue;
    const instructions = typeof result.instructions === 'string' ? result.instructions : undefined;
    methodPages.push({ read: { tool: 'read_skill', arguments: arguments_ },
      coverage: structuredClone(result.methodRead.coverage),
      ...(instructions === undefined ? {} : { instructions }) });
  }
  return { kind: 'current_interactive_continuation', ...source,
    previous: { id: source.programId, expectedRevision: source.revision }, nodeId: ref.nodeId, mode: current.mode,
    stateOrigin: ref.inputs === undefined ? 'focus_only_no_current_inputs' : 'user_submit_snapshot_not_live_ui',
    ...(inputs !== undefined ? { inputs } : inputPreview !== undefined ? { inputPreview } : {}),
    inputCoverage: inputs !== undefined || inputPreview !== undefined ? structuredClone(current.inputCoverage)
      : { complete: false, valuesProvided: false },
    ...(presentation !== undefined ? { presentation } : {}),
    ...(observations !== undefined ? { observations } : {}),
    ...(current.mode === 'local_conditions_error' ? { evaluationError: copy(current.error) } : {}),
    coverage: { replayOfThisRunAdmittedProjection: true, presentationProvided: presentation !== undefined,
      observationMetadataProvided, sourceDslProvided: false, sourceBodiesProvided: false, geometryPointsProvided: false },
    read: read({ mode: 'overview' }), readFocused: read({ mode: 'overview', nodeId: ref.nodeId }),
    readStates: read({ mode: 'states', offset: 0, limit: 4 }),
    ...(methodPages.length ? { admittedMethodPages: methodPages } : {}),
    meaning: "This is the same work focus formally admitted this round, with sources just rechecked. Local inputs are fixed to the person's submission frame. Background data retains original observation time, partial/stale, and historical_only status. No later gesture was observed and no source was requeried. This is not personal fact or action approval. Only listed bounded material is restored; unread source, other nodes, and SourceSlot bodies need exact on-demand reads. Method pages originate in this round's original tool reads; reattaching them establishes neither full-manual reading nor successful original wire delivery." };
}
