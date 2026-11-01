import { randomUUID } from 'node:crypto';
import * as z from 'zod';
import type { Action, Obligation, Step } from '../shared/types';
import { HarnessError, type DelegatedTask } from '../shared/harness';
import type { Store } from './store';
import type { RunSession } from './runtime/coordinator';
import { ProviderError, toolArgumentCharacterLimit, type ToolSpec } from './provider';
import { redactCredentials, redactCredentialValues } from './runtime/redaction';
import { DEFERRED_TOOL_FAMILIES, deferredFamily, deferredToolCatalog, USE_TOOL, type DeferredFamily } from './runtime/tool-surface';

const useToolInput = z.object({
  name: z.string().min(1).max(100).optional(), query: z.string().max(300).optional(),
  family: z.enum(Object.keys(DEFERRED_TOOL_FAMILIES) as [DeferredFamily, ...DeferredFamily[]]).optional(),
  offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(23).default(8),
  arguments: z.record(z.string(), z.unknown()).optional(),
}).strict();

function parameterRequirement(issue: z.ZodIssue): string {
  // Keep authored business explanations. Standard validation prose can quote
  // arbitrary submitted keys; the path and code already identify the problem.
  if (issue.code === 'custom') return redactCredentials(issue.message);
  if (issue.code === 'invalid_type') {
    const types: Record<string, string> = { string: "text", number: "a number", bigint: "an integer", boolean: "yes or no", array: "a list", object: "an object", date: "a date", file: "a file" };
    return `This needs ${types[issue.expected] || "the content specified by the usage"}。`;
  }
  if (issue.code === 'too_small' || issue.code === 'too_big') {
    const amount = issue.code === 'too_small' ? issue.minimum : issue.maximum;
    const measure = issue.origin === 'string' ? "text length" : issue.origin === 'array' ? "item count" : "value";
    const relation = issue.code === 'too_small' ? issue.inclusive === false ? "greater than " : "at least " : issue.inclusive === false ? "less than " : "at most ";
    return `${measure} needs ${relation}${amount}。`;
  }
  if (issue.code === 'unrecognized_keys') return "This includes fields absent from this contract. Compare with the complete usage and adjust them.";
  if (issue.code === 'invalid_value') return "Choose from the options in the complete usage.";
  if (issue.code === 'invalid_union') return "This contract accepts several forms, but the supplied form does not match. Review the complete usage and choose one.";
  return "The format does not match. Review this entry's complete usage.";
}

export interface ToolContext {
  prepareRelease?: import('./runtime/coordinator').RuntimeCallbacks['prepareRelease'];
  verifyPrivacyControl?: import('./runtime/coordinator').RuntimeCallbacks['verifyPrivacyControl'];
  verifyReadPurpose?: import('./runtime/coordinator').RuntimeCallbacks['verifyReadPurpose'];
  readConversation?: import('./runtime/coordinator').RuntimeCallbacks['readConversation'];
  verifyAttentionExpiry?: import('./runtime/coordinator').RuntimeCallbacks['verifyAttentionExpiry'];
  verifyLocalDelegation?: import('./runtime/coordinator').RuntimeCallbacks['verifyLocalDelegation'];
  verifyBusinessChoice?: import('./runtime/coordinator').RuntimeCallbacks['verifyBusinessChoice'];
  store: Store;
  signal: AbortSignal;
  userText: string;
  currentUserId: string;
  child: boolean;
  step: (step: Step) => void;
  plan: (items: Obligation[]) => void;
  action: (item: Action) => void;
  changed: () => void;
  delegate: (tasks: DelegatedTask[], operationSignal?: AbortSignal) => Promise<unknown>;
  runtimeSession?: RunSession;
  campus?: import('./academicAdapter').AcademicAdapter;
  map?: import('./mapService').CampusMapAdapter;
  mapCard?: (card: import('../shared/map-v2').MapCard) => void;
  present?: import('./runtime/coordinator').RuntimeCallbacks['present'];
  companionActivity?: import('./runtime/coordinator').RuntimeCallbacks['companionActivity'];
  attentionMessage?: import('./runtime/coordinator').RuntimeCallbacks['attentionMessage'];
  // Compatibility shape only. Cache eligibility belongs to CapabilityBroker.
  campusMemo?: {
    fullContextUsed: boolean;
    domains: Set<string>;
    results: Map<string, unknown>;
    inFlight?: Map<string, Promise<unknown>>;
  };
  campusReady?: (result: unknown) => void;
  campusInvalidate?: () => void;
}

function formatToolStepTitle(name: string, raw: string, capabilityTitle?: (name: string) => string | undefined): string {
  let args: any = {};
  try {
    if (typeof raw === 'string' && raw.trim().startsWith('{')) {
      args = JSON.parse(raw);
    }
  } catch {}
  if (name === 'use_tool' && typeof args?.name === 'string')
    return args.arguments === undefined ? "Look at how to do this" : formatToolStepTitle(args.name, JSON.stringify(args.arguments), capabilityTitle);
  if (name === 'look_up') {
    if (args.source === 'local') return "Read scheduled events";
    if (args.source === 'map') return "Look at the map";
    if (args.source === 'capability') {
      if (!args.capability) return "Find a useful method";
      if (args.describeOnly || args.arguments === undefined) return "Inspect this source's reading options";
      return capabilityTitle?.(args.capability) || "Find relevant material";
    }
  }
  if (name === 'present_view') return "Lay out the result";
  if (name === 'change_local_action') return "Adjust an event";
  if (name === 'inspect_action') return "Check the event result";
  if (name === 'cancel_action') return "Undo an event";
  if (name === 'delegate') return "Investigate in parallel";
  if (name === 'send_check_in') return "Come by to say something";
  if (name === 'study_companion' || name === 'read_study_companion') return "Open the study pages";
  if (name === 'manage_relationship_rehearsal') return "Try saying it together";
  if (name === 'offer_planning_alternatives') return "Compare arrangements";

  if (name === 'look_up' || name === 'search_history' || name === 'query_campus' || name === 'get_weather') {
    if (args.source === 'weather' || name === 'get_weather') return "Read weather conditions";
    if (args.source === 'campus' || name === 'query_campus') {
      const domain = args.domain || args.kind;
      if (domain === 'schedule') return "Read courses and schedules";
      if (domain === 'grades') return "Read grades and units";
      return "Read campus information";
    }
    if (args.source === 'history' || name === 'search_history') return "Search past records";
    return "Find relevant material";
  }
  if (name.startsWith('map_')) {
    if (name === 'map_route') return "Plan route and travel time";
    if (name === 'map_search') return "Find a place";
    if (name === 'map_overview') return "Look at the map overview";
    return "Read map information";
  }
  if (name === 'manage_note') {
    const act = args?.operation;
    if (act === 'read') return "Read note text";
    if (act === 'list') return args.input?.query ? "Find related notes" : "Read the note list";
    if (act === 'history') return "Read earlier note revisions";
    if (act === 'create') return "Write a new note";
    if (act === 'update') return "Edit a note";
    if (act === 'change_state') return args.input?.state === 'deleted' ? "Remove this note" : "Restore this note";
    if (act === 'undo') return "Undo a note edit";
    return "Organize notes";
  }
  if (name === 'manage_calendar') {
    const act = args?.action;
    if (act === 'read' || act === 'query') return "Check the schedule";
    if (act === 'create') return "Add an event";
    if (act === 'update') return "Adjust an event";
    return "Organize events";
  }
  if (name === 'search_context') return "Search past records";
  if (name === 'read_evidence') return args.view === 'image' ? "Observe the original image again" : "Check the original statements";
  if (name === 'read_understanding') return "Read earlier understanding";
  if (name === 'recall_experience') return "Revisit shared experience";
  if (name === 'curiosity_invitation') return "Prepare a curiosity invitation";
  if (name === 'write_reflective_letter') return "Write a personal letter";
  if (name === 'manage_relationship_rehearsal') return "Try saying it together";
  if (name === 'read_relationship_rehearsal') return "Return to this rehearsal";
  if (name === 'manage_companion') return "Retain a shared agreement";
  if (name === 'read_companion') return "Revisit interaction details";
  if (name === 'read_skill') return args.id === 'persona-expression' ? "Revisit familiar ways of interacting" : "Read a suitable method";
  if (name === 'manage_method') return "Retain a new interaction preference";
  if (name === 'remember_preference' || name === 'propose_memory_change') return "Organize current information";
  if (name === 'prepare_action' || name === 'propose_action') return "Prepare the next arrangement";
  if (name === 'present_view') return "Prepare a presentation";
  if (name === 'decide_help') return "Consider the response";

  return "Review current matters";
}

/** Model continuation/retry instructions remain in the tool result. The
 * activity line describes only what this host operation actually delivered. */
function toolStepDisplay(title: string, status: Step['status'], result?: any, materialRead = false): NonNullable<Step['userFacing']> {
  const coverage = result?.coverage?.complete === false ? 'partial' as const
    : result?.coverage?.complete === true ? 'complete' as const : undefined;
  if (materialRead) {
    const data = result?.data, range = data?.coverage, page = Number.isSafeInteger(data?.page) && data.page > 0 ? data.page : undefined;
    if (status === 'done') {
      const detail = range?.end > range?.start ? page ? `Read this passage on page ${page}.` : "Read this original passage."
        : page ? "Reached the end of this page's text." : "This file has no text.";
      return { title, status, detail, ...(coverage ? { coverage } : {}) };
    }
    if (result?.status === 'partial' && data?.needsVisual && range?.total === 0)
      return { title, status, coverage: 'partial', detail: "This page yielded no readable text. Open the actual page to inspect it." };
  }
  const explanations: Record<string, string> = {
    partial: "This step obtained partial content and needs further checking.", stale: "This content changed. Check its current revision.",
    forbidden: "Permission to use the required material was not obtained.", unsupported: "This source cannot complete this step. Another method may be used.",
    not_connected: "This source is not connected yet.", not_queried: "This material was not found in this request.",
    unknown: "This step's result is not yet confirmed.", conflict: "The original content changed. Check the current revision first.",
    needs_confirmation: "This step still needs your decision.", outcome_unknown: "There is no definite result. Inspect the original operation first.",
    reconciling: "Inspecting the original operation's result.", cancellation_unknown: "A definite undo result has not arrived.",
    cannot_cancel: "This step cannot be undone directly now. Inspect its actual result first.", failed: "This step did not finish. Existing content remains.",
    failed_confirmed: "This step did not finish. Existing content remains.", unresolved: "This step has no confirmed result yet.",
    dispatching: "This step is still in progress.", cancel_requested: "Cancellation was requested; waiting for the actual result.",
  };
  const detail = status === 'blocked' ? explanations[String(result?.status)] || "This step is unfinished." : undefined;
  return { title, status, ...(detail ? { detail } : {}), ...(coverage ? { coverage } : {}) };
}

function failedStepDisplay(title: string, error: unknown): NonNullable<Step['userFacing']> {
  const code = error instanceof HarnessError ? error.code : '';
  const detail = /material_integrity|material_reference_changed/.test(code) ? "The original file differs from its prior version. Select the intended file again."
    : /material.*range|quote.*range/.test(code) ? "This location is beyond the original text. Return to its page and select again."
      : code === 'material_not_sent' ? "This file has not been sent with a message yet. Bring it into the conversation first."
      : /forbidden|scope|privacy/.test(code) ? "Permission to use the required material was not obtained. Confirm its use scope at the original place."
      : /material|source/.test(code) ? "This original passage cannot be opened now. Select it again at its original location."
      : /revision|conflict|changed/.test(code) ? "The original content changed. Check its current revision first."
        : "This step is unfinished. Already available content remains.";
  return { title, status: 'blocked', detail };
}

export class ToolRegistry {
  private run: RunSession;
  constructor(private context: ToolContext) {
    context.store.runtime.connect({ campus: context.campus, map: context.map });
    this.run =
      context.runtimeSession ||
      context.store.runtime.begin(
        context.userText,
        context.currentUserId || randomUUID(),
        'tool-contract',
        context.signal,
      );
    if (context.child && !context.runtimeSession) {
      const scope = context.store.runtime.policy.narrow(this.run.ingress.contract.scope, {
        child: true,
        infer: false,
        grants: context.store.runtime.policy
          .validate(this.run.ingress.contract.scope)
          .grants.filter((g) => g.endsWith(':read')),
      });
      this.run = {
        ...this.run,
        ingress: { ...this.run.ingress, contract: { ...this.run.ingress.contract, scope } },
      };
    }
  }
  /** What the model is offered for this request (see runtime/tool-surface). */
  specs(): ToolSpec[] {
    return this.context.store.runtime.modelToolSpecs(this.run, this.context.child);
  }
  /** The full permission-filtered contract list owned by the host. */
  allSpecs(): ToolSpec[] {
    return this.context.store.runtime.toolSpecs(this.run, this.context.child);
  }
  async execute(name: string, raw: string, toolCallId?: string, operationSignal?: AbortSignal): Promise<string> {
    if (name === USE_TOOL) return this.useTool(raw, toolCallId, operationSignal);
    const signal = AbortSignal.any([this.context.signal, this.run.signal, ...(operationSignal ? [operationSignal] : [])]);
    const id = randomUUID(),
      title = formatToolStepTitle(name, raw, capability => this.context.store.runtime.broker.describe(capability)?.displayName);
    signal.throwIfAborted();
    this.context.step({ id, title, status: 'running', userFacing: { title, status: 'running' } });
    let requestedArguments: unknown;
    try {
      if (raw.length > toolArgumentCharacterLimit(name))
        throw new HarnessError('input_budget', "This submission is too long. Shorten this payload to continue without dropping the original task.");
      const args = JSON.parse(raw);
      requestedArguments = redactCredentialValues(args);
      if (name === 'read_evidence' && !this.run.pack)
        await this.context.store.runtime.compile(this.run, false, signal);
      const readBaseline = this.run.investigation && ['search_context', 'read_evidence'].includes(name)
        ? this.context.store.runtime.repo.sourceRestrictionSnapshot(this.run.ingress.contract.scope) : undefined;
      const result = await this.context.store.runtime.executeTool(
          this.run,
          name,
          args,
          this.context,
          this.context.child,
          signal,
        );
      if (toolCallId && typeof (result as any)?.data?.observationId === 'string') {
        const visual = this.run.toolImages && [...this.run.toolImages].reverse()
          .find(image => image.id === (result as any).data.observationId && !image.toolCallId);
        if (visual) visual.toolCallId = toolCallId;
      }
      signal.throwIfAborted();
      const status = (result as any)?.status;
      // A reviewed read owner can distinguish this delivered page from the
      // remaining global coverage. Missing sources and business partials do
      // not receive this mark; raw status/coverage/continuation stay intact.
      // Reading an older saved page can finish without refreshing its source.
      const deliveredReaderPage = name === 'look_up' && (result as any)?.delivery?.kind === 'page'
        && (result as any)?.delivery?.complete === true;
      // A ready route has finished its calculation even when entrance/access
      // conditions keep its knowledge coverage partial. Keep that original
      // result intact; this only describes whether this tool step finished.
      const route = (result as any)?.data;
      const calculatedMapRoute = status === 'partial' && (result as any)?.sourceId === 'map:local'
        && (name === 'map_route' || name === 'look_up' && args.capability === 'map.route')
        && route?.schemaVersion === 'map-route/v2' && route.status === 'ready';
      const stepStatus: Step['status'] = [
        'failed', 'forbidden', 'unsupported', 'not_connected', 'unknown', 'conflict', 'needs_confirmation',
        'not_queried', 'failed_confirmed', 'outcome_unknown', 'unresolved', 'dispatching', 'reconciling',
        'cancel_requested', 'cancellation_unknown', 'cannot_cancel',
      ].includes(status) || ['partial', 'stale'].includes(status) && !deliveredReaderPage && !calculatedMapRoute ? 'blocked' : 'done';
      const userFacing = toolStepDisplay(title, stepStatus, result, name === 'look_up' && args.capability === 'materials.read');
      this.context.step({
        id,
        title,
        status: stepStatus,
        detail: userFacing.detail,
        userFacing,
      });
      const identified = toolCallId ? result && typeof result === 'object' && !Array.isArray(result)
        ? { ...result, observationId: toolCallId } : { data: result, observationId: toolCallId } : result;
      // Keep the normal JSON projection (including toJSON values), then
      // redact decoded fields without changing quotes or field boundaries.
      let finalResult = redactCredentialValues(JSON.parse(JSON.stringify(identified)));
      if (name === 'read_evidence' && this.run.pack && typeof args.id === 'string'
        && !['failed', 'forbidden', 'unsupported', 'not_connected', 'unknown', 'stale', 'conflict'].includes((result as any)?.status))
        finalResult = this.context.store.runtime.context.recordEvidenceRead(this.run.pack, result, finalResult, args.id,
          this.specs().some(tool => tool.function.name === 'restore_collaboration'));
      if (name === 'search_context' && this.run.pack)
        finalResult = this.context.store.runtime.context.recordSearchEvidenceRead(this.run.pack, result, finalResult);
      const safe = JSON.stringify(finalResult);
      signal.throwIfAborted();
      this.context.store.runtime.policy.validate(this.run.ingress.contract.scope);
      if (this.run.investigation && toolCallId && ['search_context', 'read_evidence'].includes(name))
        this.context.store.runtime.investigation.stageOutput(this.run.investigation,
          this.run.ingress.contract.scope, name, toolCallId, result, finalResult, readBaseline);
      (this.run.observations ||= []).push({ tool: name, requestedArguments, result: finalResult, ...(toolCallId ? { toolCallId } : {}) });
      return safe;
    } catch (error) {
      if (signal.aborted) throw error;
      const detail =
        error instanceof HarnessError
          ? error.message
          : error instanceof ProviderError
            ? name === 'present_view' ? "The presentation is not ready yet." : "No usable result was obtained yet."
            : error instanceof z.ZodError
              ? "Some fields need adjustment. Their locations and required content are listed below."
              : error instanceof SyntaxError
                ? requestedArguments === undefined
                  ? "The arguments could not be parsed. Supply complete JSON to continue."
                  : "Part of the returned content could not be parsed. No usable result was obtained yet."
                : "This step did not finish.";
      const userFacing = failedStepDisplay(title, error);
      this.context.step({ id, title, status: 'blocked', detail: userFacing.detail, userFacing });
      const diagnosticExplanation = error instanceof HarnessError && error.diagnostic
        ? redactCredentials(error.diagnostic.explanation) : undefined;
      const programAttempt = name === 'present_view' && requestedArguments !== null && typeof requestedArguments === 'object'
        && !Array.isArray(requestedArguments) && Object.hasOwn(requestedArguments, 'program');
      const failedResult = {
        status:
          error instanceof HarnessError && /forbidden|scope|approval/.test(error.code)
            ? 'forbidden'
            : 'failed',
        error: detail,
        code: error instanceof HarnessError || error instanceof ProviderError ? error.code : 'invalid_request',
        ...(error instanceof ProviderError ? {
          retry: "The model supplied no usable result. Continue with already obtained material that remains valid. If this step involved an actual change, inspect the original action's result before deciding how to proceed.",
        } : {}),
        ...(error instanceof HarnessError && error.diagnostic ? {
          diagnostic: { rejectedDimensions: error.diagnostic.rejectedDimensions, explanation: diagnosticExplanation!.slice(0, 500),
            ...(error.diagnostic.expansion ? { expansion: error.diagnostic.expansion } : {}),
            ...(error.diagnostic.depth ? { depth: error.diagnostic.depth } : {}),
            ...(error.diagnostic.expression ? { expression: error.diagnostic.expression } : {}),
            ...(error.diagnostic.component ? { component: error.diagnostic.component } : {}),
            ...(error.diagnostic.input ? { input: error.diagnostic.input } : {}),
            ...(error.diagnostic.previous ? { previous: error.diagnostic.previous } : {}) },
          retry: error.code.startsWith('interactive_') || error.diagnostic.input || error.diagnostic.previous
            ? (programAttempt ? "This draft was not published. The comments below retain its specific gaps." : '')
              + "Connect the current part first. Continue an original work with that draft's sources and revision. Use sufficient existing guidance without repeatedly expanding it; read additional methods only where needed. New usable parts can then join the current conversation."
            : "This understanding was not saved. The comments retain its gaps. Continue using original statements, conditions and expiry, leaving uncertainty unresolved; the present question can still receive a thoughtful answer.",
        } : {}),
        ...(error instanceof z.ZodError ? {
          fields: error.issues.slice(0, 12).map(issue => ({ path: issue.path.join('.'), code: issue.code, requirement: parameterRequirement(issue) })),
          ...(this.allSpecs().some(spec => spec.function.name === name) ? { usage: { tool: USE_TOOL, arguments: { name } } } : {}),
          retry: "Incorrect field locations and required content are below, with a link to complete usage. Repair them and continue. If an actual change was attempted, inspect the original action's result first.",
        } : {}),
      };
      (this.run.observations ||= []).push({ tool: name, requestedArguments, result: failedResult, ...(toolCallId ? { toolCallId } : {}) });
      const programDiagnostic = error instanceof HarnessError ? error.diagnostic : undefined;
      if ((programAttempt || programDiagnostic?.expansion || programDiagnostic?.depth || programDiagnostic?.expression || programDiagnostic?.component || programDiagnostic?.input || programDiagnostic?.previous) && this.run.pack) {
        const receipt = this.run.pack.receipt;
        receipt.interactiveProgramDiagnostics = [...(receipt.interactiveProgramDiagnostics || []), {
          stepId: id, ...(toolCallId ? { toolCallId } : {}),
          rejectionCode: error instanceof HarnessError && /^[a-z][a-z0-9_]{0,79}$/.test(error.code)
            ? error.code : error instanceof z.ZodError ? 'invalid_program_envelope' : 'program_rejected',
          ...(programDiagnostic?.expansion ? { expansion: structuredClone(programDiagnostic.expansion) } : {}),
          ...(programDiagnostic?.depth ? { depth: structuredClone(programDiagnostic.depth) } : {}),
          ...(programDiagnostic?.expression ? { expression: structuredClone(programDiagnostic.expression) } : {}),
          ...(programDiagnostic?.component ? { component: structuredClone(programDiagnostic.component) } : {}),
          ...(programDiagnostic?.input ? { input: structuredClone(programDiagnostic.input) } : {}),
          ...(programDiagnostic?.previous ? { previous: structuredClone(programDiagnostic.previous) } : {}),
          explanationTruncated: (diagnosticExplanation?.length || 0) > 500,
        }].slice(-8);
        this.context.store.runtime.repo.saveReceipt(this.run.pack.contract.scope, receipt);
      }
      return JSON.stringify(failedResult);
    }
  }
  /** Reads any current tool's original contract. Specialized tools call the
   * ordinary execute path; everyday tools keep their direct entry point. */
  private async useTool(raw: string, toolCallId?: string, operationSignal?: AbortSignal): Promise<string> {
    const signal = AbortSignal.any([this.context.signal, this.run.signal, ...(operationSignal ? [operationSignal] : [])]);
    signal.throwIfAborted();
    let requestedArguments: unknown;
    const respond = (result: unknown) => {
      signal.throwIfAborted();
      this.context.store.runtime.policy.validate(this.run.ingress.contract.scope);
      const safeResult = redactCredentialValues(result);
      (this.run.observations ||= []).push({ tool: USE_TOOL, requestedArguments, result: safeResult, ...(toolCallId ? { toolCallId } : {}) });
      return JSON.stringify(safeResult);
    };
    try {
      if (raw.length > toolArgumentCharacterLimit(USE_TOOL)) throw new HarnessError('input_budget', "This submission is too long. Shorten this payload to continue without dropping the original task.");
      const request = useToolInput.parse(JSON.parse(raw));
      requestedArguments = redactCredentialValues(request);
      const available = this.allSpecs(), { name } = request;
      if (!name) {
        if (request.arguments !== undefined) throw new HarnessError('tool_name_required', "The requested content is present but the tool name is missing. Search by purpose using query or browse the catalog, then submit name with arguments.");
        return respond(deferredToolCatalog(available, request));
      }
      if (request.query !== undefined || request.family !== undefined)
        throw new HarnessError('tool_mode_conflict', "Both a tool name and catalog-search conditions were supplied. Keep name for usage or execution; keep query or family to find a tool.");
      const spec = available.find(item => item.function.name === name);
      if (!spec
        && available.some(item => item.function.name === 'look_up')) {
        const capability = this.context.store.runtime.broker.describe(name);
        if (capability) {
          if (request.arguments === undefined)
            return this.execute('look_up', JSON.stringify({ source: 'capability', capability: name, describeOnly: true }), toolCallId, signal);
          return respond({ status: 'failed', code: 'capability_entry_required',
            error: capability.effect === 'read'
              ? "This is a source-reading contract. The requested content is retained in the entry below; continue through look_up."
              : "This changes an actual arrangement. Continue through the original action entry; its complete usage is available below.",
            usage: { tool: 'look_up', arguments: { source: 'capability', capability: name, describeOnly: true } },
            ...(capability.effect === 'read' ? { continuation: { tool: 'look_up', arguments: {
              source: 'capability', capability: name, arguments: request.arguments,
            } } } : {}),
          });
        }
      }
      if (spec && request.arguments === undefined) return respond({ status: 'schema', name, description: spec.function.description,
        parameters: spec.function.parameters,
        ...(!deferredFamily(name) ? { directTool: name } : {}),
        next: deferredFamily(name)
          ? "This is the tool's complete usage. Keep the same name and supply required content in arguments. If recently read conditions remain unchanged, use it directly or continue finding another method."
          : `This is the complete usage of ${name}. Continue its actual use through the original ${name} entry with these arguments. Already understood usage need not be expanded repeatedly.` });
      if (!spec || !deferredFamily(name)) return respond({ status: 'failed', code: 'tool_unavailable',
        error: spec
          ? "This tool is directly provided this turn. Continue through its original entry."
          : "This tool was absent from the specialized catalog. Search again by purpose through the entry below, or use look_up to find methods from other sources.",
        discover: { tool: USE_TOOL, arguments: {} },
        ...(!spec && available.some(item => item.function.name === 'look_up') ? {
          capabilityCatalog: { tool: 'look_up', arguments: { source: 'capability' } },
        } : {}),
        ...(spec ? { directTool: name, continuation: { tool: name, arguments: request.arguments } } : {}),
      });
      return this.execute(name, JSON.stringify(request.arguments), toolCallId, signal);
    } catch (error) {
      if (signal.aborted) throw error;
      return respond({ status: 'failed', code: error instanceof HarnessError ? error.code : 'invalid_request',
        error: error instanceof HarnessError ? error.message : error instanceof z.ZodError
          ? "Some fields need adjustment; their locations remain below. Use query or family to find tools. If the name is known, supply name and put requested content in arguments."
          : "These arguments could not be parsed. Supply complete JSON and continue through the same entry.",
        ...(error instanceof z.ZodError ? { fields: error.issues.slice(0, 8).map(issue => ({ path: issue.path.join('.'), code: issue.code, requirement: parameterRequirement(issue) })) } : {}),
        discover: { tool: USE_TOOL, arguments: {} },
      });
    }
  }
}
