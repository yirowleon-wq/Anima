import * as z from 'zod';
import { rehearsalReadInput, rehearsalWriteInput } from '../../shared/relationship-rehearsal';
import { HarnessError, type WorkSourceRef } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import type { ContextCompiler } from './context';
import type { PolicyKernel } from './policy';
import type { RunSession } from './coordinator';
import type { RelationshipRehearsalService, RehearsalAdmission } from './relationship-rehearsal';
import { canonical, codePointSlice } from './semantics';

export const relationshipRehearsalToolDefinitions: { name: string; description: string; schema: z.ZodType; grant?: string; mutates?: boolean }[] = [
  { name: 'manage_relationship_rehearsal', schema: rehearsalWriteInput, grant: 'work:write', mutates: true,
    description: "Practice an actual interpersonal exchange within the original shared matter. begin preserves the person's intended meaning and boundaries; respond uses only their actual current rehearsal line, then you simulate one possible reply. Use alternative/adjust when it feels wrong. collect may directly organize wording at any time; pause/close need no completed round count, score, or level. Other-person lines remain simulation, not real messages, profiles, or promises. Practice words were not externally spoken. Use an existing shared matter, or create it through update_collaboration without making the person select internal IDs. view.ref is the real original rehearsal address and revision; present.arguments can go directly to present_view. matterId is not a view ID. begin on the same matter's lawful active rehearsal only rereads it, without reopening or restoring; respond against its returned revision before presenting. An opening alone does not prove the person rehearsed. Final drafts and external sending still follow prepare_release and original action limits." },
  { name: 'read_relationship_rehearsal', schema: rehearsalReadInput, grant: 'evidence:read',
    description: "Read the same matter's rehearsal, separating intended meaning, actual practice words, one simulated response, and unsent wording. Reading neither continues simulation nor restores state. For long exchanges continue using fixed expectedRevision and coverage; simulation is not real relationship memory. If a letter is requested, copy activityTiming.reviewNavigation.use.arguments into begin and add currentQuote without guessing from/before. This only navigates verified sources' receipt interval; it grants no whole-window access and does not establish continuous practice duration." },
];
const names = new Set(relationshipRehearsalToolDefinitions.map(definition => definition.name));
export interface RelationshipRehearsalToolHost {
  repo: KernelRepository; policy: PolicyKernel; context: ContextCompiler; rehearsals: RelationshipRehearsalService;
}
type RehearsalRun = RunSession & { rehearsalAdmission?: RehearsalAdmission };

export function executeRelationshipRehearsalTool(host: RelationshipRehearsalToolHost, session: RehearsalRun,
  name: string, raw: unknown, signal: AbortSignal): Promise<unknown> | undefined {
  if (!names.has(name)) return undefined;
  return execute();
  async function execute() {
    const handle = session.ingress.contract.scope, contract = session.ingress.contract, scope = host.policy.require(handle, 'evidence:read');
    signal.throwIfAborted();
    const pack = session.pack;
    if (!pack) throw new HarnessError('context_missing', "Reconnect this round's original words before rehearsing together.");
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self' || !scope.sources.includes('work:self'))
      throw new HarnessError('rehearsal_scope', "This expression is rehearsed only within the person's permitted private scope.");
    const writing = name === 'manage_relationship_rehearsal';
    if (writing && (session.background || session.ephemeral || scope.child))
      throw new HarnessError('rehearsal_owner', "The current main assistant rehearses with the person; a background task or child inquiry cannot start a simulation for them.");
    const permits = (ref: WorkSourceRef) => {
      try {
        host.repo.resolveWorkSourceBinding(handle, [{ eventId: ref.eventId, contentVersion: ref.contentVersion, start: ref.start, end: ref.end }]);
        const view = session.attentionEvidenceViews?.[ref.eventId];
        if (!view) return contract.memoryMode === 'relevant' || session.events.some(event => event.id === ref.eventId)
          || host.repo.evidence(handle, ref.eventId)?.sessionId === session.sessionId;
        const event = host.repo.evidence(handle, ref.eventId);
        return !!event && event.contentVersion === ref.contentVersion && view.contentVersion === ref.contentVersion
          && view.sourceStart <= ref.start && view.sourceEnd >= ref.end && codePointSlice(event.text, view.sourceStart, view.sourceEnd) === view.quote;
      } catch (error) { if (error instanceof HarnessError) return false; throw error; }
    };
    const context = { sessionId: session.sessionId, allowCrossSession: contract.memoryMode === 'relevant',
      permits, admission: session.rehearsalAdmission, signal };
    const result = writing ? host.rehearsals.write(handle, context, rehearsalWriteInput.parse(raw))
      : host.rehearsals.read(handle, context, rehearsalReadInput.parse(raw));
    signal.throwIfAborted(); host.policy.validate(handle);
    const { records, ...payload } = result;
    const view = 'view' in result ? result.view : undefined;
    const reference = view ? { id: view.id, revision: view.revision } : 'id' in result && typeof result.id === 'string'
      ? { id: result.id, revision: result.revision } : undefined;
    const activityTiming = view ? host.rehearsals.activityTiming(handle, view.id, view.revision, { ...context, timeZone: contract.timeZone }) : undefined;
    const visible = { ...payload, ...(activityTiming ? { activityTiming } : {}), ...(reference ? { present: { tool: 'present_view', arguments: { rehearsal: {
      id: reference.id, expectedRevision: reference.revision } } } } : {}) };
    const text = canonical(visible), bytes = Buffer.byteLength(text), tokens = Math.ceil(Array.from(text).length / 1.4);
    if (records.some(record => !record.sourceBinding || record.sourceBinding.refs.some(ref => !permits(ref))))
      throw new HarnessError('rehearsal_source_changed', "A source of this rehearsal changed. Return to the currently permitted original sentence.");
    host.context.recordWorkSources(pack, records);
    pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
    host.repo.saveReceipt(handle, pack.receipt);
    return visible;
  }
}
