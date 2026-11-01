import type { ContextContract, WorkRecord, WorkSourceBinding, WorkSourceRef } from '../../shared/harness';
import { personalMethodSourcesSchema, type PersonalMethodSources } from '../../shared/personal-method';
import type { KernelRepository } from '../storage/repository';
import type { PersonalMethodService } from './personal-methods';

/** Discovery projection of the existing personal-method owner. No method,
 * rating, background task or automatic adoption is created here. */
export function buildPersonalMethodContinuity(runtime: { repo: KernelRepository; personalMethods: PersonalMethodService },
  contract: ContextContract, admission: { ephemeral: boolean; requiresReadPurpose: boolean; permits?: (ref: WorkSourceRef) => boolean }) {
  const empty = () => ({ data: {} as Record<string, unknown>, records: [] as WorkRecord[],
    bindings: [] as WorkSourceBinding[], sources: [] as PersonalMethodSources[] });
  const scope = runtime.repo.scope(contract.scope);
  if (admission.ephemeral || admission.requiresReadPurpose || scope.child || contract.memoryMode !== 'relevant'
    || contract.retention !== 'purpose_scoped' || contract.audience !== 'self' || scope.retention !== 'purpose_scoped'
    || scope.audience !== 'self' || scope.subjectId !== scope.principalId || scope.worldId !== 'real') return empty();
  const currentRequest = [...scope.currentEventIds].reverse().map(id => runtime.repo.evidence(contract.scope, id))
    .find(event => event?.speaker === 'user' && event.authority === 'user_statement' && !event.parentEventId
      && ['user_message', 'user_control'].includes(event.kind) && event.status === 'active' && Array.from(event.text).length > 0);
  const source = currentRequest ? { eventId: currentRequest.id, contentVersion: currentRequest.contentVersion,
    start: 0, end: Array.from(currentRequest.text).length } : undefined;
  const cues = runtime.personalMethods.cues(contract.scope, { limit: 4, permits: admission.permits,
    ...(source && admission.permits?.(source) !== false ? { forCurrentHelp: { source } } : {}) });
  if (!cues.items.length && !cues.moreMayExist) return empty();
  return { data: { personalHelpMethods: { items: cues.items, moreMayExist: cues.moreMayExist,
    guidance: "These are methods the person wanted to borrow later. Hear today's desired collaboration first. At a relevant obstacle, use readForCurrentHelp when actually applying a method to this step; use read for reviewing the agreement only. readForCurrentHelp carries the current original request address and binds reuse to that same request. For several requests in one sentence, narrow forCurrentHelp.source to the part using the method; include matterId when the original matter was read. Familiar help can work quietly. If asked about an old agreement, or today's wish differs, follow choices.read to the original selection and later revision. These entries are source addresses; read_skill contains full instructions and applicability. discover_skills finds more. The person can change a method in ordinary words without remembering its name. Work independently, accept one step, make a rough start, or explain fully according to today. A one-time change stays this round; lasting changes use manage_method. Use amend for a local change. instructionEdits replaces exact sentences while preserving other text, and individual conditions can be changed separately. Historical problems, material, and outcomes remain available through their own provenance. Begin today's work from today." } },
    records: cues.records,
    bindings: cues.records.flatMap(record => record.sourceBinding ? [record.sourceBinding] : []),
    sources: cues.records.flatMap(record => {
      const parsed = personalMethodSourcesSchema.safeParse(record.data.methodSources);
      return parsed.success ? [parsed.data] : [];
    }) };
}
