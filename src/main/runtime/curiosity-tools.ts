import * as z from 'zod';
import { curiosityInvitationInput } from '../../shared/curiosity-invitation';
import { sharedCreationReadInput } from '../../shared/curiosity-source';
import { HarnessError, type WorkSourceRef } from '../../shared/harness';
import type { RunSession, RuntimeCoordinator } from './coordinator';
import type { CuriosityContext, CuriosityInvitationService } from './curiosity-invitation';
import { canonical, codePointSlice } from './semantics';

export interface CuriosityToolDefinition {
  name: string; description: string; schema: z.ZodType; grant?: string; mutates?: boolean;
}
export const definitions: CuriosityToolDefinition[] = [{
  name: 'curiosity_invitation', grant: 'evidence:read', mutates: true, schema: curiosityInvitationInput,
  description: "When the person wants something fresh, a little play, or a direction beyond old interests, bring an immediately usable piece with substance: shared creation, a puzzle, an observation, or a sourced discovery. Do not force stories or binary choices. offer supplies title/opening/experience/firstMove. Pure creation uses created and can be played directly. public/mixed must cite a research.read observationId actually delivered this round and an original-body quote; search or child summaries are not original reads. brief can prepare public themes and search entries without exporting private words/profile; real search still follows original readPurpose. read/continue/another/put_aside preserve ID and revision; a natural user answer can advance the experience without clicking a button. Shared fiction continues through its original work: remember creating together, without treating fictional first-person events as the person's real life or creating a separate fictional-life database. Create no goals, interest labels, reminders, or subscriptions. Current invitation takes priority over old profiles; changing content does not imply permanent dislike. Do not begin with a category questionnaire or ask whether to search. After a resource failure, offer a clearly created opening without unverified facts. choices are available interactions, not a required menu or follow-up every time. For public-map settings use present_view.storySetting with the original work ID and both revisions, plus an exact existing map address. Selection remains temporary. In continuation, use currentSelection.storySetting.placeId/mapVersion for continue.setting; the host attaches camera and public route endpoints only when all four work addresses and the place version match. Do not invent camera, node kind, or setting proof. Omitted setting preserves it; null removes it. Public places and story events establish no actual arrival or journey.",
}, { name: 'read_shared_creation', grant: 'evidence:read', schema: sharedCreationReadInput,
  description: "Recover and read original early chapters of a shared work. operation=history discovers by real matterId/ownerId or query; order=oldest begins with the earliest chapter and next continues. These are chapter addresses in original messages.Scene, not separate summaries. For body reads, use messageId/sceneId/sceneRevision actually returned by the directory or read_assistant_history, omitting operation. Paginate opening/experience/firstMove by Unicode code points. This is historical assistant/shared creation; fictional first person is not the user's real experience, and current option.seed cannot replace an old chapter. Reading or discovery does not restart invitations or actions. Recheck source and scope each time; public caches are not new facts.",
}];
export const curiosityToolDefinitions = definitions;
export type CuriosityToolHost = Pick<RuntimeCoordinator, 'repo' | 'policy' | 'context'> & {
  curiosityInvitations: CuriosityInvitationService;
};

/** The existing outer coordinator owns read-purpose/local-delegation review
 * when applicable, and changed(). This helper never calls a new classifier. */
export function executeCuriosityTool(
  host: CuriosityToolHost, session: RunSession, name: string, raw: unknown, signal: AbortSignal,
): Promise<unknown> | undefined {
  if (name !== 'curiosity_invitation' && name !== 'read_shared_creation') return undefined;
  return execute();
  async function execute() {
    signal.throwIfAborted();
    const handle = session.ingress.contract.scope, scope = host.policy.require(handle, 'evidence:read');
    const pack = session.pack;
    if (!pack) throw new HarnessError('context_missing', "Reconnect the current conversation before sharing this experience.");
    const shared = name === 'read_shared_creation' ? sharedCreationReadInput.parse(raw) : undefined;
    const input = shared ? 'operation' in shared ? shared : { ...shared, operation: 'read_history' as const }
      : curiosityInvitationInput.parse(raw);
    if (!['read', 'read_history', 'history'].includes(input.operation) && (session.background || scope.child))
      throw new HarnessError('curiosity_current_invitation', "This older experience can be reread through its original sources. Renewed invitation, continuation, or setting aside follows the person's current original words.");
    const permits = (ref: WorkSourceRef) => {
      const view = session.attentionEvidenceViews?.[ref.eventId];
      if (!view) return true;
      const event = host.repo.evidence(handle, ref.eventId) || session.events.find(item => item.id === ref.eventId);
      return !!event && event.contentVersion === ref.contentVersion && view.contentVersion === ref.contentVersion
        && view.sourceStart <= ref.start && view.sourceEnd >= ref.end
        && codePointSlice(event.text, view.sourceStart, view.sourceEnd) === view.quote;
    };
    const context: CuriosityContext = { sessionId: session.sessionId, events: session.events, ephemeral: session.ephemeral,
      allowCrossSession: session.ingress.contract.memoryMode === 'relevant', observations: session.observations || [],
      deliveredObservationIds: session.deliveredObservationIds || new Set(),
      ...(session.selection?.storySetting ? { storySettingSelection: structuredClone(session.selection.storySetting) } : {}),
      noteSources: structuredClone(pack.receipt.noteSources || []), permits };
    const result = host.curiosityInvitations.execute(handle, context, input);
    signal.throwIfAborted(); host.policy.validate(handle);
    const text = canonical(result.value), bytes = Buffer.byteLength(text), tokens = Math.ceil(Array.from(text).length / 1.4);
    host.context.recordWorkSources(pack, result.records);
    host.context.recordWorkSourceBindings(pack, result.bindings);
    host.context.recordAssistantWorkSources(pack, result.assistantWorkSources || []);
    pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
    host.repo.saveReceipt(handle, pack.receipt);
    return result.value;
  }
}
