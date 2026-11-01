import { REHEARSAL_SOURCE_CONTEXT_MEANING, rehearsalInteractionSchema, type RehearsalInteraction } from '../../shared/relationship-rehearsal';
import type { ScopeHandle, WorkSourceRef } from '../../shared/harness';
import type { RelationshipRehearsalService, RehearsalAdmission } from './relationship-rehearsal';

/** Adopt this reference after the new input's source limits are known and
 * before its owner body enters context. Ingress already kept source identity
 * and infer:false; an untrusted address never grants a read, fact or action. */
export function admitRehearsalIngress(service: RelationshipRehearsalService, handle: ScopeHandle,
  sessionId: string, raw: RehearsalInteraction | undefined,
  options: { allowCrossSession: boolean; permits?: (source: WorkSourceRef) => boolean }) {
  if (!raw) return undefined;
  const input = rehearsalInteractionSchema.parse(raw);
  return { input, ...service.admit(handle, sessionId, input, options.allowCrossSession, options.permits) };
}

export function rehearsalIngressMethod(admission: RehearsalAdmission) {
  return {
    type: 'relationship_rehearsal', currentInput: admission.kind,
    simulationIsActualExchange: false, userInputIsContextualReference: true, otherSpeechIsAssistantSimulation: true,
    inputKindIsNotSemanticDecision: true, sourceIdentityMeaning: REHEARSAL_SOURCE_CONTEXT_MEANING,
    method: "You remain the same assistant responsible for this conversation. The current words may be rehearsal, a correction that “they would not say that,” a revision of meaning, a wish to stop, or a request to collect the draft. Understand the full original naturally without another director, persona classifier, or fixed rounds. Preserve the meaning the person wants to express, rather than teaching them to win a conversation. An imagined other-person reply is only one possibility and belongs explicitly in the simulation view, not a real incoming message, mind-reading, or relationship fact. It may stop where a response remains unknown; do not rush the simulated other into agreement or invent the person's next line for a neat ending. Save only the person's actual rehearsal words as their lines. Use respond when appropriate, alternative/adjust after a mismatch, and collect/pause immediately when they want. Brief narration is optional when useful, without per-round scores or critiques. Let the exchange determine an opening instead of repeating a teaching slogan. Collected wording remains an unsent draft using prepare_release and original disclosure limits; no automatic sending, agreement change, or personal-fact write.",
  };
}
