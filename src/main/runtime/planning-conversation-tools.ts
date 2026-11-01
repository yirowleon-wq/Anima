import * as z from 'zod';
import { HarnessError, workSourceRefSchema, type WorkRecord, type WorkSourceBinding, type WorkSourceRef } from '../../shared/harness';
import { planningComparisonInput } from '../actions/planning-comparison';
import { planningConversationContinueInput, planningConversationReadInput } from './planning-conversation';
import type { RuntimeCoordinator, RunSession } from './coordinator';
import { canonical, codePointSlice } from './semantics';

const offerInput = z.object({ matterId: z.string().min(1).max(160), expectedMatterRevision: z.number().int().positive(),
  comparison: planningComparisonInput, sourceRefs: z.array(workSourceRefSchema).min(1).max(32) }).strict();
export const definitions: { name: string; description: string; schema: z.ZodType; grant?: string; mutates?: boolean }[] = [
  { name: 'offer_planning_alternatives', grant: 'work:write', mutates: true, schema: offerInput,
    description: "Place two to four meaningfully different complete arrangements in the same planning matter. Use planning.compare first or provide complete current conditions and branches: retain agreements, move an arrangement, try an unaccepted activity, or shift task emphasis. taskPreferences.rhythm can compare continuous and segmented work while preserving the full same workload and each segment's setup/cleanup; split only when the original task permits. workRhythms reports actual segments and overhead for explaining tradeoffs, not personality or efficiency scores. sourceRefs identify exact original evidence; your reasons remain your interpretation. This retains discussable alternatives at the same option addresses, without changing the calendar. Include unscheduled work and each version's problems and reasons. Renaming an equivalent plan does not create a distinct choice." },
  { name: 'read_planning_alternative', grant: 'evidence:read', schema: planningConversationReadInput,
    description: "Recover one arrangement of the same matter by its exact address and reconsider it against the current calendar: retained and moved items, desired activities, unscheduled work, and original conditions. A prior click indicates historical discussion interest. Changed arrangements require renewed comparison; an old view is not a currently saveable plan." },
  { name: 'continue_planning', grant: 'evidence:read', mutates: true, schema: planningConversationContinueInput,
    description: "Check the original actions' real results and current calendar for the same alternative, then propose the next original-arrangement change or new-activity save. Once an action tool returns, actionRefs must carry exact stepId/actionId/actionRevision. Without the original action address, inspect_action first; identical parameters do not establish success. Each step follows permission for that actual action; selecting an option executes nothing. Preserve success and inspect unknown original outcomes before retrying. Continue discussion after calendar change. Once prior edits actually complete, replan full work/setup/cleanup/rest through the original planner. With work:write, retain only original action addresses and actual planId; later reads still inspect original results. Scheduling is not task completion." },
];
export const planningConversationToolDefinitions = definitions;
const names = new Set(definitions.map(value => value.name));
export type PlanningConversationToolHost = Pick<RuntimeCoordinator, 'repo' | 'policy' | 'context' | 'planning' | 'planningConversation'>;

export function executePlanningConversationTool(host: PlanningConversationToolHost, session: RunSession,
  name: string, raw: unknown, signal: AbortSignal): Promise<unknown> | undefined {
  if (!names.has(name)) return undefined;
  return execute();
  async function execute() {
    signal.throwIfAborted();
    const contract = session.ingress.contract, handle = contract.scope, scope = host.policy.require(handle, 'evidence:read');
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.sources.includes('work:self') || !scope.sources.includes('local-agenda'))
      throw new HarnessError('planning_conversation_scope', "Discuss using currently permitted material. Earlier work records or the real calendar are not open in this round.");
    const pack = session.pack;
    if (!pack) throw new HarnessError('context_missing', "Reconnect the current conversation before continuing this comparison.");
    if ((name === 'offer_planning_alternatives' || name === 'continue_planning') && (scope.child || session.background || session.ephemeral))
      throw new HarnessError('planning_conversation_owner', "The current main assistant discusses in the permitted foreground. Background or temporary scopes retain no plans and continue no actions.");
    const args = definitions.find(value => value.name === name)!.schema.parse(raw) as Record<string, any>;
    const permits = (ref: WorkSourceRef) => {
      try {
        host.repo.resolveWorkSourceBinding(handle, [ref]);
        const projection = session.attentionEvidenceViews?.[ref.eventId];
        if (!projection) return true;
        const event = host.repo.evidence(handle, ref.eventId);
        return !!event && event.contentVersion === projection.contentVersion && event.contentVersion === ref.contentVersion
          && projection.sourceStart <= ref.start && projection.sourceEnd >= ref.end
          && codePointSlice(event.text, projection.sourceStart, projection.sourceEnd) === projection.quote;
      } catch (error) { if (error instanceof HarnessError) return false; throw error; }
    };
    const readOptions = { ...(contract.memoryMode === 'relevant' ? {} : { sessionId: session.sessionId }), permits };
    const allSources = (record: WorkRecord): WorkSourceBinding[] => {
      if (record.sourceBinding) {
        if (record.sourceBinding.refs.some(ref => !permits(ref))) throw new HarnessError('planning_conversation_scope', "Some original words supporting this plan are outside the permitted fragments.");
        return [record.sourceBinding];
      }
      const refs = record.kind === 'episode' && record.data.type === 'collaboration_frame'
        ? host.planningConversation.matterSources(handle, record.id, record.revision).refs : record.evidenceIds.map(eventId => {
        const event = host.repo.evidence(handle, eventId);
        if (!event) throw new HarnessError('work_source_changed', "The original planning words are unreadable.");
        const ref = { eventId, contentVersion: event.contentVersion, start: 0, end: Array.from(event.text).length };
        if (!ref.end || !permits(ref)) throw new HarnessError('planning_conversation_scope', "The old discussion has no provable exact fragment. Whole-message access cannot restore unpermitted portions.");
        return ref;
      });
      if (refs.some(ref => !ref.end || !permits(ref)))
        throw new HarnessError('planning_conversation_scope', "The discussion's declared source fragments are outside this round's scope.");
      const result: WorkSourceBinding[] = [];
      for (let index = 0; index < refs.length; index += 32) result.push(host.repo.resolveWorkSourceBinding(handle, refs.slice(index, index + 32)));
      return result;
    };
    const admit = (result: any) => {
      signal.throwIfAborted(); host.policy.validate(handle);
      const { records = [], bindings = [], ...view } = result as { records?: WorkRecord[]; bindings?: WorkSourceBinding[]; [key: string]: any };
      const actualBindings = [...bindings, ...records.flatMap(allSources)];
      if (actualBindings.some(binding => binding.refs.some(ref => !permits(ref))))
        throw new HarnessError('work_source_changed', "The source scope for this content changed. Old body text was not adopted.");
      for (const record of records) if (host.repo.work(handle, undefined, record.id)[0]?.revision !== record.revision)
        throw new HarnessError('revision_conflict', "The discussion updated. Continue its current revision.");
      const serialized = canonical(view), bytes = Buffer.byteLength(serialized), tokens = Math.ceil(Array.from(serialized).length / 1.4);
      host.context.recordWorkSources(pack, records); host.context.recordWorkSourceBindings(pack, actualBindings);
      const factSources = records.filter(record => record.data.type === 'planning_alternative').flatMap(record =>
        Array.isArray(record.data.sourceIds) ? record.data.sourceIds.filter((source): source is string => typeof source === 'string') : []);
      pack.receipt.providedSourceIds = [...new Set([...(pack.receipt.providedSourceIds || []), 'local-agenda', ...factSources])];
      pack.receipt.budget.readBytes += bytes; pack.receipt.budget.estimatedTokens += tokens;
      host.repo.saveReceipt(handle, pack.receipt);
      return view;
    };
    const currentItems = () => host.repo.db.prepare('SELECT payload FROM agenda').all().map(row => JSON.parse(String(row.payload)));
    if (name === 'offer_planning_alternatives') {
      const frame = host.repo.work(handle, 'episode', args.matterId)[0];
      if (!frame || contract.memoryMode !== 'relevant' && frame.data.sessionId !== session.sessionId
        && !(Array.isArray(frame.data.sessionIds) && frame.data.sessionIds.includes(session.sessionId)))
        throw new HarnessError('planning_conversation_scope', "This matter is not open within this session's permitted context.");
      const matterBindings = allSources(frame);
      const refs = z.array(workSourceRefSchema).parse(args.sourceRefs);
      if (refs.some(ref => !permits(ref))) throw new HarnessError('planning_conversation_scope', "This evidence exceeds the permitted original-word fragments.");
      const input = planningComparisonInput.parse(args.comparison);
      const campus = await host.planning.readCampus(scope, input.draft.from, input.draft.to, signal);
      signal.throwIfAborted(); host.policy.validate(handle);
      const binding = host.repo.resolveWorkSourceBinding(handle, refs);
      const sources = [...new Set([...input.draft.busy, ...input.draft.energyWindows, ...input.draft.travelTimes,
        ...input.draft.tasks, ...input.draft.conditions.filter(value => value.status !== 'unknown'),
        ...input.draft.tasks.flatMap(task => task.conditions.filter(value => value.status !== 'unknown')),
        ...input.draft.sourceCoverage.filter(value => value.status !== 'not_checked')]
        .flatMap(value => value.sourceId && !['current', 'user-declared'].includes(value.sourceId) ? [value.sourceId] : []))];
      const observed = new Set([...(pack.receipt.providedSourceIds || []), ...binding.sourceIds,
        ...matterBindings.flatMap(value => value.sourceIds), 'local-agenda', ...(campus ? [campus.sourceId] : [])]);
      if (sources.some(source => !observed.has(source)))
        throw new HarnessError('planning_parameter_source_unknown', "Some facts used by the plan have not actually been read this round. Obtain them through permitted sources rather than inventing a source name.");
      const result = host.planningConversation.offer(handle, currentItems(), input, { sessionId: session.sessionId,
        matterId: args.matterId, expectedMatterRevision: args.expectedMatterRevision, sourceRefs: refs,
        dependentSourceIds: sources }, campus);
      return admit(result);
    }
    if (name === 'read_planning_alternative') return admit(host.planningConversation.read(handle, currentItems(), args, readOptions));
    const { actionRefs: _actionRefs, ...address } = args;
    const description = host.planningConversation.describe(handle, address, readOptions);
    for (const record of description.records) allSources(record);
    const campus = description.hasContinuation ? null
      : await host.planning.readCampus(scope, description.window.from, description.window.to, signal);
    signal.throwIfAborted(); host.policy.validate(handle);
    return admit(host.planningConversation.continue(handle, currentItems(), args, campus, readOptions));
  }
}
