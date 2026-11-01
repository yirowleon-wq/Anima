import * as z from 'zod';
import { HarnessError, type ClockPort, type ScopeHandle, type WorkRecord } from '../../shared/harness';
import { studyFocusRefSchema, studyFocusTargetSchema, studyHistoryReference, studyInteractionSchema,
  type StudyFocusRef, type StudyFocusTarget, type StudyHistoryReference, type StudyInteraction,
  type StudyResolvedFocus, type StudyScene } from '../../shared/study-presentation';
import type { StudyCompanionView, StudyMode } from '../../shared/study-companion';
import type { StudyCompanionContext, StudyCompanionService } from './study-companion';
import { canonical, systemClock } from './semantics';
import { resolveExplorableStudy } from './explorable-study';

const id = z.string().min(1).max(160);
export const studyPresentationInput = z.object({ studyId: id, studyRevision: z.number().int().positive().optional(),
  focus: studyFocusTargetSchema.optional(), historyOffset: z.number().int().nonnegative().optional(),
  historyLimit: z.number().int().min(1).max(8).optional() }).strict();
type CurrentStudy = { record: WorkRecord; projection: StudyCompanionView };
const requestedModes: Record<StudyScene['actions'][number]['id'], StudyMode> = {
  try: 'small_hint', hint: 'small_hint', example: 'guided_step', explain: 'explain',
};

/** No scene cache or parallel lifecycle. Every body/focus/request is compiled
 * after the owner has completed its asynchronous material/source read. A sync
 * history endpoint receives only a read address, never a stale body admission. */
export class StudyPresentationService {
  constructor(readonly study: Pick<StudyCompanionService, 'get'>, readonly clock: ClockPort = systemClock) {}

  private async currentOwner(handle: ScopeHandle, studyId: string, context: StudyCompanionContext) {
    // One real owner/material read keeps all learner lines on the paper.
    // Earlier teaching answers are not merged into the current help.
    return this.study.get(handle, studyId, { ...context, allAttempts: true });
  }

  private focusRef(scene: Pick<StudyScene, 'id' | 'revision' | 'owner'>, target: StudyFocusTarget): StudyFocusRef {
    return { sceneId: scene.id, sceneRevision: scene.revision, studyId: scene.owner.id, studyRevision: scene.owner.revision, target };
  }

  private currentHelp(view: StudyCompanionView) {
    const help = view.currentStep;
    // Returning to discovery must not redisplay an earlier full explanation.
    // The main model generates a fresh requested move through the owner tool.
    return help && help.mode === view.mode
      && help.problemScope !== 'prior_problem' && help.problemScope !== 'unverified_legacy_problem'
      && (view.mode !== 'small_hint' || help.kind === 'question' || help.kind === 'hint')
      && (view.mode === 'explain' || help.kind !== 'explanation') ? help : undefined;
  }

  private target(view: StudyCompanionView, requested?: StudyFocusTarget) {
    const help = this.currentHelp(view);
    const target = requested || (help ? { kind: 'help' as const, stepId: help.id } : { kind: 'next' as const });
    if (target.kind === 'attempt' && !view.attempts.some(attempt => attempt.id === target.attemptId)
      || target.kind === 'help' && help?.id !== target.stepId
      || target.kind === 'next' && target.stepId !== undefined && help?.id !== target.stepId)
      throw new HarnessError('study_focus_changed', "This position is outside the current study view. Select again from the current problem, attempt, or hint.");
    return target;
  }

  private build(value: CurrentStudy, options: { focus?: StudyFocusTarget; historyOffset?: number; historyLimit?: number },
    createdAt: string, fetchedAt: string): StudyScene {
    const view = value.projection, focus = this.target(view, options.focus), help = this.currentHelp(view);
    const attempt = focus.kind === 'attempt' ? view.attempts.find(value => value.id === focus.attemptId) : view.attempts[view.attempts.length - 1];
    const scene: StudyScene = { kind: 'study', id: 'study-scene:' + view.id, revision: view.revision, createdAt,
      source: { sourceId: 'work:self', fetchedAt, version: view.id + '@' + view.revision },
      owner: { kind: 'study_companion', id: view.id, revision: view.revision, matterId: view.matterId, sourceBinding: view.sourceBinding },
      historyWindow: { offset: options.historyOffset || 0, limit: options.historyLimit || 4 },
      heading: view.title, status: view.status, mode: view.mode, focus,
      problem: { text: view.problem.display, origin: view.problem.origin }, learnerLines: view.attempts,
      ...(view.bookmark ? { bookmark: view.bookmark } : {}),
      ...(attempt ? { learnerAttempt: attempt } : {}),
      attemptChoices: view.attempts.map(value => ({ id: value.id, receivedAt: value.receivedAt })),
      ...(help ? { help } : {}), helpState: help ? 'provided' : 'not_yet_provided_for_current_mode',
      nextMove: { text: help ? help.nextMove : view.currentStep && view.currentStep.mode !== view.mode
        ? "Write the step you have in mind so we can continue from it." : view.nextStart,
        origin: 'assistant_suggestion', ...(help ? { stepId: help.id } : {}) },
      ...(view.stopPoint ? { stopPoint: view.stopPoint } : {}), ...(view.closure ? { closure: view.closure } : {}),
      ...(view.problem.origin.resourceId && view.problem.origin.page
        ? { materialPage: { resourceId: view.problem.origin.resourceId, page: view.problem.origin.page, kind: 'original_material_page' } } : {}),
      actions: [], history: { attemptCount: view.historyCoverage.attempts.total, teachingMoveCount: view.historyCoverage.steps.total,
        nextOffset: view.historyCoverage.nextOffset, read: { tool: 'study_companion',
          arguments: { operation: 'read', id: view.id, ...(view.historyCoverage.nextOffset !== null ? { historyOffset: view.historyCoverage.nextOffset } : {}) } } },
      refresh: { tool: 'study_companion', arguments: { operation: 'read', id: view.id } },
      bodyPolicy: 'async_current_owner_read_required',
      meaning: "This page keeps the problem, your attempts, explanations, and next step together. A selected line can continue the discussion. Your current wish determines where to try independently or change the explanation." };
    scene.actions = view.interaction.actions.flatMap(action => {
      if (!Object.hasOwn(requestedModes, action.id)) return [];
      const actionId = action.id as StudyScene['actions'][number]['id'];
      const target: StudyFocusTarget = help ? { kind: 'next', stepId: help.id } : { kind: 'next' };
      return [{ id: actionId, label: action.label, request: action.request, requestedMode: requestedModes[actionId], focus: this.focusRef(scene, target) }];
    });
    return scene;
  }

  async project(handle: ScopeHandle, raw: z.infer<typeof studyPresentationInput>, context: StudyCompanionContext = {}) {
    const input = studyPresentationInput.parse(raw), current = await this.currentOwner(handle, input.studyId,
      { ...context, historyOffset: input.historyOffset, historyLimit: input.historyLimit });
    if (!current || input.studyRevision !== undefined && current.record.revision !== input.studyRevision)
      throw new HarnessError('study_scene_unavailable', "This study page cannot fully expand now. Continue from the original problem or matter.");
    const now = this.clock.now(), scene = this.build(current, input, now, now);
    return { scene, records: [current.record], projection: current.projection };
  }

  /** Before a model, frontend body response, or selected excerpt is delivered,
   * call this async owner boundary. Do not substitute a timestamp or cached
   * successful call in a synchronous SceneService/history/IPC permission gate. */
  async assertCurrent(handle: ScopeHandle, scene: StudyScene, context: StudyCompanionContext = {}) {
    if (scene.kind !== 'study' || scene.bodyPolicy !== 'async_current_owner_read_required'
      || !Number.isFinite(Date.parse(scene.createdAt)) || !Number.isFinite(Date.parse(scene.source.fetchedAt)))
      throw new HarnessError('study_scene_invalid', "The study-view reference is incomplete. Reopen from the current study page.");
    const current = await this.currentOwner(handle, scene.owner.id, { ...context,
      historyOffset: scene.historyWindow.offset, historyLimit: scene.historyWindow.limit });
    if (!current || current.record.revision !== scene.owner.revision || current.projection.matterId !== scene.owner.matterId)
      throw new HarnessError('study_scene_changed', "The problem, learning step, or sources changed. Open the current study page.");
    const expected = this.build(current, { focus: scene.focus, historyOffset: scene.historyWindow.offset,
      historyLimit: scene.historyWindow.limit }, scene.createdAt, scene.source.fetchedAt);
    if (canonical(expected) !== canonical(scene)) throw new HarnessError('study_scene_changed', "This view does not match the current study page. Reopen the current original problem and this help segment.");
    return current;
  }

  async resolveFocus(handle: ScopeHandle, scene: StudyScene, raw: StudyFocusRef, context: StudyCompanionContext = {}) {
    const selected = studyFocusRefSchema.parse(raw), current = await this.assertCurrent(handle, scene, context);
    if (selected.sceneId !== scene.id || selected.sceneRevision !== scene.revision
      || selected.studyId !== scene.owner.id || selected.studyRevision !== scene.owner.revision)
      throw new HarnessError('study_focus_changed', "The selection belongs to another study-view revision. Select the current position again.");
    const view = current.projection, target = this.target(view, selected.target), help = this.currentHelp(view);
    let text: string, origin: StudyResolvedFocus['origin'], source: StudyResolvedFocus['source'];
    if (target.kind === 'problem') {
      text = view.problem.display; origin = view.problem.origin.interpretation === 'assistant_page_description' ? 'assistant_problem_description' : 'original_problem';
    } else if (target.kind === 'attempt') {
      const attempt = view.attempts.find(value => value.id === target.attemptId)!;
      text = attempt.text; origin = 'user_report'; source = attempt.source;
    } else if (target.kind === 'help') { text = help!.text; origin = 'assistant_generated'; }
    else { text = scene.nextMove.text; origin = 'assistant_suggestion'; }
    const selection: StudyResolvedFocus = { ref: selected, matterId: view.matterId, text, origin,
      ...(source ? { source } : {}), sourceBinding: view.sourceBinding,
      ...(view.bookmark ? { bookmark: view.bookmark } : {}),
      meaning: "The person indicated this part of the same problem. Continue from it while preserving separate provenance for the problem, their attempt, and explained content." };
    return { selection, records: [current.record], projection: current.projection };
  }

  /** Resolve an actual UI follow-up at the host request boundary before its
   * selection or teaching request is used. The normal ingress owns the real
   * new user message; this helper never writes a synthetic learner step. */
  async resolveInteraction(handle: ScopeHandle, scene: StudyScene, raw: StudyInteraction, context: StudyCompanionContext = {}) {
    const input = studyInteractionSchema.parse(raw), resolved = await this.resolveFocus(handle, scene, input.focus, context);
    if (input.kind === 'reference') return { ...resolved, intent: 'reference_only' as const };
    if (scene.status === 'closed') throw new HarnessError('study_closed', "This page is finished. Reread this part; new learning begins on a new page.");
    if (input.kind === 'explore') {
      if (input.focus.target.kind !== 'help') throw new HarnessError('study_exploration_changed', "The changed condition must match the current explanation segment. Select again from this text and figure.");
      const exploration = resolveExplorableStudy(this.currentHelp(resolved.projection)?.exploration, input.values);
      return { ...resolved, selection: { ...resolved.selection, exploration }, intent: 'hypothetical_exploration' as const };
    }
    if (input.kind === 'attempt') {
      if (!input.text.trim()) throw new HarnessError('study_attempt_empty', "Write the step you have in mind to continue from here.");
      return { ...resolved, intent: 'learner_attempt' as const, text: input.text,
        meaning: "This is a newly written attempt prepared for conversation. After the person sends it, continue from their own attempt and examine whether it holds." };
    }
    const action = scene.actions.find(value => value.id === input.actionId);
    if (!action) throw new HarnessError('study_action_changed', "This step's learning entry changed. Continue from the current view.");
    return { ...resolved, intent: 'request_help' as const, text: action.request, requestedMode: action.requestedMode,
      meaning: "The person wants this explanation style now. Bring the choice into conversation to continue the same problem and current step." };
  }

  /** This is the only synchronous history/IPC fallback. It cannot authorize or
   * restore a stored StudyScene body, even if that snapshot was once valid. */
  historyReference(scene: StudyScene): StudyHistoryReference { return studyHistoryReference(scene); }
}
