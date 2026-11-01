import { HarnessError } from '../../shared/harness';
import type { StudyCompanionView } from '../../shared/study-companion';
import type { RunSession, RuntimeCoordinator } from './coordinator';
import { canonical } from './semantics';

type Host = Pick<RuntimeCoordinator, 'policy' | 'studyCompanion'>;
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : undefined;

/** Body-free facts for the existing semantic purpose review. A proposed ID
 * alone is never a read receipt, permission or a reason to skip that review. */
export function providedStudyPurposeReference(host: Host, session: RunSession, request: unknown, signal: AbortSignal) {
  const envelope = object(request), args = object(envelope?.arguments);
  if (!args || !session.pack) return;
  const presentation = envelope?.tool === 'present_view' ? object(args.study) : undefined;
  const studyTool = ['study_companion', 'read_study_companion'].includes(String(envelope?.tool));
  const formal = session.studySelection?.selection;
  const sameMatterIndex = studyTool && args.operation === 'read' && args.id === undefined
    && typeof args.matterId === 'string' && args.matterId === formal?.matterId;
  const id = presentation?.studyId ?? (studyTool ? args.id ?? (sameMatterIndex ? formal?.ref.studyId : undefined) : undefined);
  const expected = presentation?.studyRevision ?? (studyTool ? args.expectedRevision : undefined);
  if (typeof id !== 'string' || expected !== undefined && (!Number.isSafeInteger(expected) || Number(expected) < 1)) return;
  const handle = session.ingress.contract.scope;
  signal.throwIfAborted();
  const scope = host.policy.validate(handle);
  if (scope.audience !== 'self' || scope.child) return;
  const current = (revision: number) => {
    if (expected !== undefined && revision !== expected) return;
    const delivered = session.pack!.receipt.providedObjectVersions.find(value =>
      value.kind === 'work' && value.id === id && value.revision === revision);
    if (!delivered?.sourceBinding || !delivered.problemIdentitySha256) return;
    const snapshot = host.studyCompanion.currentSourceVersion(handle, { id, revision });
    if (!snapshot || snapshot.problemIdentitySha256 !== delivered.problemIdentitySha256
      || canonical(snapshot.sourceBinding) !== canonical(delivered.sourceBinding)
      || canonical(snapshot.sourceMaterial || null) !== canonical(delivered.sourceMaterial || null)
      || canonical(snapshot.noteSources) !== canonical(delivered.noteSources || [])) return;
    return snapshot;
  };
  try {
    for (const observation of [...(session.observations || [])].reverse()) {
      if (!['study_companion', 'read_study_companion'].includes(observation.tool) || !observation.toolCallId
        || !session.deliveredObservationIds?.has(observation.toolCallId)) continue;
      const result = object(observation.result), input = object(observation.requestedArguments);
      if (!result || !Array.isArray(result.items)) continue;
      const view = result.items.find(item => object(item)?.id === id) as StudyCompanionView | undefined;
      if (!view || !Number.isSafeInteger(view.revision) || view.revision < 1) continue;
      const snapshot = current(view.revision);
      if (!snapshot || canonical(snapshot.sourceBinding) !== canonical(view.sourceBinding)) continue;
      signal.throwIfAborted(); host.policy.validate(handle);
      return { origin: 'delivered_this_run', id, revision: view.revision, matterId: view.matterId, mode: view.mode,
        delivery: { tool: observation.tool, operation: input?.operation, toolCallId: observation.toolCallId,
          ...(observation.tool === 'study_companion' && input?.operation === 'open'
            && result.reused !== true && view.revision === 1 ? { createdThisRun: true } : {}) },
        sourceRefs: structuredClone(snapshot.sourceBinding.refs),
        sourceRefsAreCurrentRequestOnly: snapshot.sourceBinding.refs.every(ref =>
          session.events.some(event => event.id === ref.eventId && event.contentVersion === ref.contentVersion)),
        ...(snapshot.sourceMaterial ? { sourceMaterial: structuredClone(snapshot.sourceMaterial) } : {}),
        noteSources: structuredClone(snapshot.noteSources),
        readCoverage: { historyOffset: input?.historyOffset || 0,
          attempts: { returned: view.attempts.length, total: view.historyCoverage.attempts.total },
          steps: { returned: view.steps.length, total: view.historyCoverage.steps.total },
          ...(view.currentStep ? { currentStep: { id: view.currentStep.id,
            kind: view.currentStep.kind, mode: view.currentStep.mode,
            ...(view.currentStep.problemScope ? { problemScope: view.currentStep.problemScope } : {}) } } : {}),
          nextOffset: view.historyCoverage.nextOffset },
        meaning: "The original owner actually reread this exact study page and delivered it to the main assistant this round. Address, revision, problem source, and current scope were rechecked. No problem, attempt, or hint body appears here. History outside read windows did not become read, and presentation still checks the original owner. This identifies the same page in production without adding sources, help depth, saving, or action permission." };
    }
    const admitted = object(session.pack.data.currentStudy);
    if (formal?.ref.studyId !== id || admitted?.ref === undefined
      || canonical(admitted.ref) !== canonical(formal.ref)) return;
    const snapshot = current(formal.ref.studyRevision);
    if (!snapshot || canonical(snapshot.sourceBinding) !== canonical(formal.sourceBinding)) return;
    signal.throwIfAborted(); host.policy.validate(handle);
    return { origin: 'current_admitted_focus', id, revision: formal.ref.studyRevision, matterId: formal.matterId,
      focus: structuredClone(formal.ref.target), intent: session.studySelection!.intent,
      sourceRefs: structuredClone(snapshot.sourceBinding.refs),
      ...(sameMatterIndex ? { proposedRead: { kind: 'same_matter_index', matterId: args.matterId,
        mayIncludeOtherStudyRecords: true,
        meaning: "This proposal lists study pages for a shared matter. The current focus identifies only this page; other records and wider history gain no reading purpose from it." } } : {}),
      ...(session.studySelection?.requestedMode ? { requestedMode: session.studySelection.requestedMode } : {}),
      ...(snapshot.sourceMaterial ? { sourceMaterial: structuredClone(snapshot.sourceMaterial) } : {}),
      noteSources: structuredClone(snapshot.noteSources),
      readCoverage: { scope: 'selected_focus_only', otherStepsProvided: false },
      meaning: "The current words reference this part of the same study page. The host rechecked exact revision and problem source with the original owner. This supplies address and focus only, without expanding problem, other attempts, or hints or adding reading permission. Current original words and help depth take priority." };
  } catch (error) {
    if (error instanceof HarnessError) return;
    throw error;
  }
}
