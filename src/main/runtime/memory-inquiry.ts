import * as z from 'zod';
import { HarnessError, workSourceRefSchema, type DelegatedTask, type ScopeHandle, type WorkSourceRef } from '../../shared/harness';
import type { ModelWireMessage, ToolSpec } from '../provider';
import type { KernelRepository } from '../storage/repository';
import { canonical } from './semantics';

export const MEMORY_INQUIRY_TOOL = 'recall_experience';
const id = z.string().min(1).max(160);
const inquiryQuestion = z.string().min(1).max(1000);
const inquiryContent = {
  question: inquiryQuestion.describe("The prior context needed now: why a choice was made, which experience matters, or which conditions changed later. The current question guides investigation; the person's reasons remain in original words."),
  uncertainties: z.array(z.string().min(1).max(400)).max(6).optional()
    .describe("Unresolved questions worth investigating in originals. Record the actual gaps; explanations may change with new evidence."),
  anchorRefs: z.array(workSourceRefSchema).max(8).optional()
    .describe("Known original-position leads using host-supplied absolute Unicode coordinates. These locate a start; body reading and experience relationships require actual evidence."),
  relatedTo: z.array(id).max(4).optional().describe("Known shared-matter, learning-process, or planning IDs for recovery through the same original owner."),
};
export const memoryInquiryInput = z.object({
  ...inquiryContent,
  sources: z.array(id).max(12).optional().describe("Permitted sourceIds actually needed for this inquiry; may further narrow scope. Omission uses only currently permitted original personal words, interpretations, and matter sources."),
  currentEvidenceIds: z.array(id).max(8).optional().describe("Current original-statement IDs actually needed by the investigator. Omission shares no current message or attachment by default."),
}).strict();
export type MemoryInquiryInput = z.infer<typeof memoryInquiryInput>;
export const memoryInquiryProfileSchema = z.object({ version: z.literal(1), ...inquiryContent }).strict();
export type MemoryInquiryProfile = z.infer<typeof memoryInquiryProfileSchema>;
export type MemoryInquiryTask = DelegatedTask & { memoryInquiry: MemoryInquiryProfile };
export interface MemoryInquiryOptions {
  /** Host-owned projection/entrustment check, additional to the normal scope. */
  permits?: (ref: WorkSourceRef) => boolean;
}

/** This is an alias of the original Hermes delegate transport, not a second
 * model loop. Offer it only to the parent alongside the native delegate tool. */
export function memoryInquiryToolSpec(): ToolSpec {
  const { $schema: _schema, ...parameters } = z.toJSONSchema(memoryInquiryInput);
  return { type: 'function', function: { name: MEMORY_INQUIRY_TOOL,
    description: "When this matter needs earlier experiences, reasons, or later changes, a read-only investigator in the same Hermes can explore deeply. Give the real question and uncertainty; it searches, expands original words, recovers matters, and reads corrections and exceptions before returning sourced understanding and gaps. This saves repetition. Use for substantial reading and comparison; respond directly when current words suffice. The inquiry writes no profile memory, old plan, or action.", parameters } };
}

export const MEMORY_INQUIRY_PARENT_GUIDANCE = `This handoff offers the investigator's current understanding of the question: recovered experiences, original reasons, later changes, exceptions, and gaps. Judge them against the person's current words, allowing feelings and tradeoffs to coexist. Sufficient context can support continuation without repeated background.

Interpretations remain sourced working hypotheses. evidenceIndex supplies reread addresses; actual original excerpts retain their own coverage. Use sufficient supplied content directly and reread missing decisive context. An unfinished branch does not erase independent usable material. Ask only for a condition that changes the answer and cannot be obtained through available originals or tools.

This report is a handoff to you. Form your own words through the current character and situation. Recovered experience supports understanding now; profile, scheduling, memory writes, and revival of old commitments have separate sources, choices, and execution.`;

function unique<T>(values: readonly T[]) { return [...new Set(values)]; }
function profileOf(task: DelegatedTask): MemoryInquiryProfile | undefined {
  const value = (task as DelegatedTask & { memoryInquiry?: unknown }).memoryInquiry;
  if (value === undefined) return;
  return memoryInquiryProfileSchema.parse(value);
}

/** Compiles the high-level semantic inquiry into the existing native child
 * protocol. No provider call, index, database write or background work occurs
 * here. The actual child remains owned by Hermes and its original parent run. */
export class MemoryInquiryService {
  constructor(readonly repo: KernelRepository) {}

  prepare(handle: ScopeHandle, raw: unknown, options: MemoryInquiryOptions = {}): { tasks: MemoryInquiryTask[] } {
    const input = memoryInquiryInput.parse(raw), scope = this.repo.scope(handle);
    if (scope.child || scope.subjectId !== scope.principalId || scope.worldId !== 'real'
      || scope.audience !== 'self' || !scope.grants.includes('evidence:read'))
      throw new HarnessError('memory_inquiry_forbidden', "The current permitted source scope does not support this personal-experience inquiry.");
    const sources = unique(input.sources ?? scope.sources.filter(source => ['history:self', 'profile:self', 'work:self'].includes(source)
      && (source !== 'profile:self' || scope.grants.includes('memory:read'))));
    const currentEvidenceIds = unique(input.currentEvidenceIds || []);
    if (currentEvidenceIds.some(eventId => !scope.currentEventIds.includes(eventId))
      || currentEvidenceIds.length > 0 && !scope.sources.includes('current')
      || sources.some(source => !scope.sources.includes(source) || source === 'profile:self' && !scope.grants.includes('memory:read')))
      throw new HarnessError('memory_inquiry_scope', "The selected current statement or source does not match the permitted read scope.");
    if (currentEvidenceIds.length && !sources.includes('current')) sources.push('current');
    if (!sources.length) throw new HarnessError('memory_inquiry_sources', "No earlier original statement or matter is currently permitted for this inquiry.");
    const refs = input.anchorRefs || [];
    for (const ref of refs) {
      const event = this.repo.evidence(handle, ref.eventId);
      if (!event || event.contentVersion !== ref.contentVersion || ref.end > Array.from(event.text).length
        || !(sources.includes(event.sourceId) || sources.includes('current') && currentEvidenceIds.includes(event.id))
        || options.permits && !options.permits(ref))
        throw new HarnessError('memory_inquiry_anchor', "The inquiry's original starting point changed or exceeds the permitted fragment.");
    }
    const profile: MemoryInquiryProfile = { version: 1, question: input.question,
      ...(input.uncertainties?.length ? { uncertainties: [...input.uncertainties] } : {}),
      ...(refs.length ? { anchorRefs: refs.map(ref => ({ ...ref })) } : {}),
      ...(input.relatedTo?.length ? { relatedTo: unique(input.relatedTo) } : {}) };
    return { tasks: [{ title: "Recover the reasons for this matter", instruction: "Reconstruct relevant earlier experiences, reasons, and later changes for the current question, returning understanding that supports discussion: " + input.question,
      sources, currentEvidenceIds, memoryInquiry: profile }] };
  }

  /** Apply after the parent model returns its assistant wire message, before
   * handing it to Hermes. Keeping the call ID preserves native tool delivery;
   * the original delegate authorize/open/result path executes the real child.
   * This cannot run for a child or an unoffered tool. */
  normalizeAssistant(handle: ScopeHandle, message: ModelWireMessage, options: MemoryInquiryOptions & { allowedTools: ReadonlySet<string> }): ModelWireMessage {
    if (message.role !== 'assistant' || !message.tool_calls?.some(call => call.function.name === MEMORY_INQUIRY_TOOL)) return message;
    if (!options.allowedTools.has(MEMORY_INQUIRY_TOOL) || !options.allowedTools.has('delegate'))
      return message;
    return { ...message, tool_calls: message.tool_calls.map(call => {
      if (call.function.name !== MEMORY_INQUIRY_TOOL) return call;
      try {
        const prepared = this.prepare(handle, JSON.parse(call.function.arguments), options);
        return { ...call, function: { ...call.function, name: 'delegate', arguments: JSON.stringify(prepared) } };
      } catch (error) {
        // Preserve a malformed/unavailable original call for the normal tool
        // boundary to report. A correctable tool argument must not become a
        // failed model RPC, nor may normalization fabricate a tool result.
        if (error instanceof SyntaxError || error instanceof z.ZodError || error instanceof HarnessError) return call;
        throw error;
      }
    }) };
  }

  /** Regular delegate tasks can select the same semantic method explicitly.
   * Keep their original title/instruction and declared source subset intact. */
  profile(handle: ScopeHandle, task: DelegatedTask, options: MemoryInquiryOptions = {}): MemoryInquiryTask | undefined {
    const profile = profileOf(task);
    if (!profile) return;
    this.prepare(handle, { question: profile.question, uncertainties: profile.uncertainties,
      anchorRefs: profile.anchorRefs, relatedTo: profile.relatedTo, sources: task.sources || [], currentEvidenceIds: task.currentEvidenceIds || [] }, options);
    return { ...task, memoryInquiry: profile };
  }

  /** Additional system method for child.open, alongside the original scoped
   * context. No source body is copied into this protocol description. */
  childSystem(task: DelegatedTask, availableTools: readonly string[], methodText: string): string {
    const profile = profileOf(task);
    if (!profile) return '';
    if (!methodText.trim()) throw new HarnessError('memory_inquiry_method', "The experience-investigation method body is not available yet. Instructions for the investigator were not generated.");
    return methodText + "\n\nThe question and navigation material below guide this inquiry. Facts come from actual originals; reading scope still follows the original entrusted request:\n"
      + canonical({ memoryInquiry: profile, availableTools: unique(availableTools), navigation: {
        anchorRefs: "These are absolute Unicode original-source addresses for read_evidence. A background quotation tool may use local coordinates; the host's real returned read entry expresses that relationship and can be followed.",
        relatedTo: "These IDs identify original concrete matters. restore_collaboration or that type's own read entry returns to the owner. Similar titles can belong to different matters; retain original identities.",
      } });
  }

  /** Attach only after the native host has accepted actual child results. The
   * child prose and evidenceIndex stay unchanged; this steers the parent from
   * collecting memories toward using them to answer the current concern. */
  parentHandoff(tasks: readonly DelegatedTask[], accepted: unknown): unknown {
    const questions = tasks.flatMap(task => {
      const profile = profileOf(task);
      return profile ? [{ question: profile.question, uncertainties: profile.uncertainties || [] }] : [];
    });
    if (!questions.length || !accepted || typeof accepted !== 'object' || Array.isArray(accepted)) return accepted;
    return { ...accepted, memoryInquiry: { questions, role: 'source_supported_working_understanding',
      continueWith: MEMORY_INQUIRY_PARENT_GUIDANCE,
      originalOwner: 'current_parent_run', writesPerformed: false } };
  }
}
