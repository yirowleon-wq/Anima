import * as z from 'zod';
import type { ChatCompletionsClient, ToolSpec } from '../provider';
import { ProviderError } from '../provider';
import { HarnessError } from '../../shared/harness';
import { hasCredentials } from './redaction';
import { structuredResult } from './structured-result';
import { usingLunaTransport } from '../model-selection';

export const releaseProjectionSchema = z.object({ requestedOperation: z.enum(['draft', 'revise', 'send']).optional().describe("Preserve whether the current outgoing task is drafting, revising or explicitly requesting send. Sending intent does not establish a connected channel or approval for a concrete external action."), reusePriorDraft: z.boolean().optional().describe("True when this turn explicitly refers to, reuses or requests sending an existing draft for the same audience without narrowing disclosure. The request itself can support reuse without restating the content or confirming again. False when the audience changes or content is newly restricted."), purpose: z.string().max(300), allowedFacts: z.array(z.string().max(600)).max(12), tone: z.string().max(150), recipient: z.string().max(160), useAvailability: z.boolean().describe("Whether the user requests coordination through their calendar's availability projection. Read only busy/free intervals, without reading or disclosing titles, places or reasons."), referencePrevious: z.boolean().optional().describe("True for an explicit reference to an earlier draft or confirmed version; do not read unrelated history."), requiredObservationFacts: z.array(z.string().max(300)).max(8).optional().describe("Concrete facts the draft still lacks actual material to support. currentMaterial, supplied priorReleasedDraft.text and real selectedToolObservations each have sources and can support their corresponding content. A need listed while interpreting the request is not still missing after its material arrives. Retain genuinely unavailable substantive results; vague placeholders do not supply them. With useAvailability=true, the host separately projects availability.") }).strict();
const proposalSchema = z.object({
  retentionScope: z.enum(['turn', 'conversation']).optional().describe("Use conversation only for an explicit retention choice covering the whole conversation and later messages. Use turn for this message or turn, and ordinarily. Task duration and chat retention are separate."),
  clearConversationOnExit: z.boolean().optional().describe("True only when the user explicitly asks to clear the whole chat on exit, with retention=session_only and retentionScope=conversation. No longer saving future messages does not itself delete existing chat or independent business records."),
  retention: z.enum(['unchanged', 'history_no_inference', 'session_only']).describe("How to retain this turn and whether to form long-term understanding: history_no_inference retains chat without extraction; session_only is explicit temporary chat without retained history; otherwise unchanged. Deleting old work and temporarily avoiding history concern actions and reading. Time-limited feelings or plans can still be retained with their conditions. Correcting an old judgment or refusing a permanent trait differs from refusing to retain these new words."),
  sourceAllowlist: z.array(z.string().max(160)).max(40).nullable().describe("List sourceIds only when the user really chooses source categories for the entire turn, such as this input only or no old chat. A page, record or two-object limit belongs in scopedSourceLimits; comparison may need related evidence. Source origin differs from storage: saved account snapshots remain campus:academic-account, while separately imported materials are campus:local. Saved-version-only or no-refresh choices concern version and acquisition and may be scoped. A future entrustment's or draft's source choices apply to its own object, while independent requests retain their own scope. If the referent is not located, normally use null to preserve a route to the original."),
  sourceExclusions: z.array(z.string().max(160)).max(40).describe("SourceIds the user explicitly excludes. Avoiding history does not cancel a separate requested lookup. Local page, record and step limits belong in scopedSourceLimits. map:local is public map data stored on this device, distinct from personal location and private profiles; public routes and refusal to read other private material can coexist."),
  scopedSourceLimits: z.array(z.object({ quote: z.string().min(1).max(2000), appliesTo: z.string().min(1).max(500) }).strict()).max(8).optional().describe("For a real object-specific material restriction, quote preserves continuous original words and appliesTo names the governed matter. Only these two items on this page with no further pages restricts material. Compare only, without changing, governs participation; relevant original records, conditions and conflicting arrangements may still be useful. Preserve the true object scope while locating its actual source. Each proposed read separately needs a current purpose. Omit when there is no local material restriction."),
  sourceBasis: z.string().min(1).max(2000).nullable().describe("A continuous verbatim passage supporting source choice. Provide it whenever sourceAllowlist is non-null or any source is excluded, even one. For retention or memory choices alone, put the quote in basis and use JSON null here. A whole multi-sentence original may supply a continuous passage with its original punctuation. Use JSON null when no source choice exists."),
  subject: z.enum(['self', 'other', 'fictional', 'mixed', 'none', 'unknown']).describe("The owner of personal material. Use none for knowledge or calculation explicitly independent of personal data. Finding the user's own discussion, choice, query or viewed material remains self; abbreviated 'this page' or 'these two' does not remove ownership. Creating, continuing, organizing or retaining a work's starting point is a real personal collaboration choice and is self. Narrators, characters, first-person text and plots retain fictional identity without becoming personal experiences. Use fictional only when the analyzed material's subject is actually a fictional person, not merely because the outer task concerns fiction. An unlocated work or option is a retrieval problem, not subject unknown or none. unknown means a real personal-data subject whose ownership is genuinely unresolved. Use mixed for independent self and other-subject portions without letting one scope override the other."),
  world: z.enum(['real', 'hypothetical', 'mixed', 'unknown']).describe("Ordinary explanation, computation, knowledge questions and current app control are real. Absence of a physical location does not make world unknown. Use hypothetical for an actual hypothetical scenario, and mixed when real delegation and hypothetical comparison coexist."),
  audience: z.enum(['self', 'group', 'public']).describe("The audience of the content actually requested now. A person who may be contacted later is not automatically the audience of current private analysis. Use self for explaining a difficulty, comparing or discussing privately; choose an outward audience only for an actual requested outward draft."),
  actions: z.enum(['unchanged', 'draft_only', 'none']).describe("Whether even action preparation should wait. Text-only trial calculation without a retained business proposal can be draft_only; no action at all this turn can be none. An explicit request for a local-change proposal with clickable confirmation permits retaining that minimal proposal, so actions stays unchanged. Put the actual instruction to confirm before modification in specificActionLimits; concrete handling separately checks the original object and current choice."),
  actionsApplyToWholeTurn: z.boolean().describe("Whether an explicit action restriction covers every action this turn. False for a particular object or only undelegated actions."),
  specificActionLimits: z.array(z.string().max(600)).max(8).describe("Verbatim constraints applying to particular objects or request parts, for the main assistant to interpret with their duration. Do not transfer one limit's expiry to another parallel limit. Stopping the user's already permitted attention is a real self-management request; finding the item to stop can be necessary to fulfill it."),
  release: releaseProjectionSchema.nullable().describe("Only for an actually requested outward draft. Null for audience=self; ordinary private answers and creative writing do not enter the outgoing-draft workflow."),
  basis: z.array(z.string().min(1).max(2000)).max(16),
  uncertain: z.boolean(),
  uncertainControls: z.array(z.object({ dimension: z.enum(['sources', 'retention', 'actions', 'audience']), quote: z.string().min(1).max(2000) }).strict()).max(8).describe("Only ambiguity in control choices, with original quotations. Missing task dates, referents or objects are not control ambiguity."),
}).strict();
export type TurnControlProposal = z.infer<typeof proposalSchema> & { sources: 'unchanged' | 'current_only' };

/** Produced only by current owner reads; contains no old title, prose,
 * personal fact, source permission or client-asserted world assignment. */
export interface TurnControlInteractionIdentity {
  activity: 'shared_creation' | 'shared_exploration' | 'co_work' | 'study' | 'planning' | 'discussion' | 'reflective_letter' | 'relationship_rehearsal' | 'note_reading' | 'material_reading' | 'interactive_program' | 'prepared_help' | 'message_reading';
  contentIdentity: 'creation' | 'public_reference' | 'mixed' | 'source_bound_work' | 'assistant_interpretation' | 'simulation' | 'user_note' | 'external_document' | 'interactive_work' | 'retained_user_message';
  focus: 'sentence_or_passage' | 'line_or_step' | 'source_object' | 'shared_object';
}
export interface TurnControlInteractionContext extends TurnControlInteractionIdentity {
  objects?: Array<TurnControlInteractionIdentity & { slot: 'A' | 'B' }>;
  relation?: { kind: 'compare' | 'same_question' | 'continuation'; from: 'A'; to: 'B' };
}

/** Every cloud-admissible turn receives the same semantic control check before
 * history is read or the input is retained. A vocabulary match cannot prove
 * that an unfamiliar request contains no saving or source restriction. */
export function needsControlParse(text: string, _context: { attachment?: boolean; image?: boolean; reference?: boolean } = {}): boolean {
  return !localCloudRestriction(text);
}

// These defaults are applied only to a real, successfully parsed tool proposal.
// Missing/failed calls never become an empty permission decision.
const ordinaryControls = {
  retention: 'unchanged', sourceAllowlist: null, sourceExclusions: [], sourceBasis: null,
  subject: 'self', world: 'real', audience: 'self', actions: 'unchanged', actionsApplyToWholeTurn: false,
  specificActionLimits: [], release: null, basis: [], uncertain: false, uncertainControls: [],
};
const controlProposalWireSchema = proposalSchema.partial();
const privacyVoiceBoundary = /\b(?:but|however|in reality|actually|as for me|separately)\b/iu;
const privacyAdoption = /\b(?:follow|obey|apply|remember|honou?r|enforce)\s*(?:(?:this|that|the|my|following|above)\s+)?(?:(?:instruction|rule|request|choice|requirement|agreement|restriction|policy)\s*)?[:\s]*$/iu;
const privacyPreference = /\bI\s+(?:want|require|choose|prefer)\s*(?:this|that)?\s*:?\s*$/iu;
const privacySameChoice = /^(?:the same (?:goes )?for me|same for me|that is (?:also )?what I want|this (?:also )?applies to me|this is (?:also )?my (?:current |actual |real )?(?:instruction|request|requirement|choice|policy|restriction))\b/iu;
const privacyFollowChoice = /^(?:please\s+)?(?:follow|obey|apply|honou?r|enforce)\s+(?:this|that|the above)(?:\s+(?:instruction|request|requirement|choice|policy|restriction|rule))?(?=$|[\s,;.!?])/iu;

/** Recognize reported words and closed language/design questions without
 * mistaking an explicit adoption for somebody else's privacy choice. */
function mentionedPrivacyChoice(before: string, after: string): boolean {
  const prefix = before.split(privacyVoiceBoundary).at(-1)!.trim();
  const clausePrefix = prefix.split(/,/u).at(-1)!.trim();
  const suffix = after.trim().replace(/^[,:\s]+/u, '');
  const followingClauses = suffix.split(/,/u).map(value => value.trim());
  if (followingClauses.some(value => privacySameChoice.test(value) || privacyFollowChoice.test(value)
    || /^(?:this\s+is\s+my|is\s+my)\s+(?:(?:actual|current|real)\s+)?(?:instruction|request|requirement|choice|policy|restriction)\b/iu.test(value)
    || /^(?:here\s+(?:is|are)|the following\s+(?:is|are))\s+my\s+(?:actual|real)\s+(?:data|material|content|records)\b/iu.test(value))) return false;
  if (clausePrefix !== prefix && /^(?:as for\s+)?(?:I\s+(?:want|require|choose|prefer)|my\s+(?:current\s+)?(?:request|instruction|choice|restriction))/iu.test(clausePrefix)) return false;
  if (/^(?:suppose|imagine|assume|if)\s+(?:I|we|you)\s+(?:say|said|ask|asked|were to (?:say|ask))\s*:?\s*$/iu.test(prefix)) return true;
  if (privacyAdoption.test(clausePrefix) || /\bmy\s+(?:(?:actual|current|real)\s+)?(?:instruction|request|requirement|choice|policy|restriction)\s+(?:is|means)\s*:?\s*$/iu.test(clausePrefix)) return false;
  if (/\bnot\s+(?:saying|asking|requiring)(?:\s+(?:that|you))?\s*$/iu.test(clausePrefix)) return true;
  if (/^(?:(?:this|that|the)\s+(?:phrase|term|sentence|wording|instruction|rule|request|design|policy)\s+)?(?:mean|means|meaning|what does|what would|how (?:do|should|would) (?:I|we|you) (?:understand|translate|explain))\b/iu.test(suffix)
    || /^(?:what (?:does|would) (?:this|that) mean|what is (?:the difference|meant)|how (?:does|would) (?:this|that) work)\b/iu.test(suffix)) return true;
  if (/^(?:please\s+)?(?:explain|translate|discuss|compare|what does|what would|what is meant by)\s*(?:the\s+)?(?:(?:phrase|term|sentence|wording|instruction|rule|request)\s*)?:?\s*$/iu.test(prefix)) return true;
  if (/^(?:the|a|an|our)?\s*$/iu.test(prefix)
    && /^(?:mode|version|architecture|design|approach|example|term|phrase|policy)\b[^,;\n]*\b(?:is|means|differs|works)\b/iu.test(suffix)) return true;
  if (/^(?:mode|version|architecture|design|approach|example|term|phrase|policy|system)\b/iu.test(suffix)
    && /\b(?:explain|discuss|compare|describe|design|build|imagine|consider|want|prefer)\b/iu.test(prefix)) return true;
  if (/^(?:for example|for instance|as an example|as a metaphor|imagine this)\s*:?\s*$/iu.test(prefix)) return true;
  const reported = /^(?:(?:suppose|imagine|assume)\s+)?(?:(?:a|the|another|my|your)\s+)?(?:user|customer|client|friend|roommate|teacher|student|character|someone|he|she|they)\s+(?:says?|said|asks?|asked|writes?|wrote|requests?|requested|requires?|required)\b[^.;!?\n]*$/iu.test(prefix);
  if (reported) {
    const preceding = prefix.slice(0, prefix.lastIndexOf(',')).trimEnd();
    return clausePrefix === prefix
      || /\b(?:says?|said|asks?|asked|writes?|wrote|requests?|requested|requires?|required)\s*:?\s*$/iu.test(preceding)
      || /^(?:(?:and|also)\s+)?(?:his|her|their)\b/iu.test(clausePrefix);
  }
  if (/^(?:imagine|suppose|consider)\s+(?:(?:a|the|an)\s+)?(?:system|app|application|architecture|design|scenario)\b/iu.test(prefix)) return true;
  // A real conditional about this file staying here still governs real data.
  // A closed hypothetical question about saying an instruction is material.
  return /^(?:(?:suppose|imagine|assume)\b|if\s+(?:I|we|someone|(?:a|the)\s+user)\s+(?:say|said|ask|asked|were to (?:say|ask))\b)/iu.test(prefix)
    && /\b(?:how|what|would|should)\b/iu.test(suffix);
}

interface PrivacyQuote { start: number; end: number; children: PrivacyQuote[]; }
const blankPrivacyMaterial = (value: string) => value.replace(/[^\r\n]/gu, ' ');
function adoptsPrivacyChoice(before: string, after: string): boolean {
  const adopted = privacyAdoption.test(before) || privacyPreference.test(before)
    || /\bmy\s+(?:(?:actual|current|real)\s+)?(?:instruction|request|requirement|choice|policy|restriction)\s+is\s*:?\s*$/iu.test(before)
    || /^(?:this\s+is\s+my|is\s+my)\s+(?:(?:actual|current|real)\s+)?(?:instruction|request|requirement|choice|policy|restriction)\b/iu.test(after)
    || privacySameChoice.test(after) || privacyFollowChoice.test(after);
  return adopted && !mentionedPrivacyChoice(before.replace(privacyAdoption, ''), after);
}
const privacySentenceBoundary = /[;.!?\n]/u;
const privacyBefore = (value: string) => value.trimEnd().split(privacySentenceBoundary).at(-1)!.split(privacyVoiceBoundary).at(-1)!;
const privacyAfter = (value: string) => value.replace(/^[\s,;.!?]+/u, '').split(privacySentenceBoundary)[0];

/** Keep quotation ownership through nesting. Unclosed quotes remain visible to
 * the conservative local gate instead of hiding the rest of the input. */
function authoredPrivacyText(text: string, recipientName: RegExp): string {
  // Markdown quotation is material too. It only becomes a current choice
  // when the author explicitly asks us to follow that particular passage.
  const fences = text.replace(/```(?:[a-z][\w-]*[ \t]*\r?\n)?([\s\S]*?)```/giu,
    (whole: string, inner: string, offset: number) => adoptsPrivacyChoice(privacyBefore(text.slice(0, offset)), privacyAfter(text.slice(offset + whole.length))) ? '\n' + inner + '\n' : blankPrivacyMaterial(whole));
  const authorText = fences.replace(/(?:^[ \t]*>.*(?:\r?\n|$))+/gmu,
    (whole: string, offset: number) => adoptsPrivacyChoice(privacyBefore(fences.slice(0, offset)), privacyAfter(fences.slice(offset + whole.length))) ? '\n' + whole.replace(/^[ \t]*> ?/gmu, '') + '\n' : blankPrivacyMaterial(whole));
  const closing: Record<string, string> = { '“': '”', '「': '」', '"': '"', '‘': '’', '『': '』', "'": "'" };
  const stack: Array<PrivacyQuote & { closing: string }> = [], roots: PrivacyQuote[] = [];
  for (let i = 0; i < authorText.length; i++) {
    const char = authorText[i];
    if (char === '\\') { i++; continue; }
    // Apostrophes in don't/user's aren't quotation marks.
    if ((char === "'" || char === '’') && /[a-z0-9]/iu.test(authorText[i - 1] || '') && /[a-z0-9]/iu.test(authorText[i + 1] || '')) continue;
    if (stack.at(-1)?.closing === char) {
      const quote = stack.pop()!;
      quote.end = i;
      (stack.at(-1)?.children || roots).push(quote);
    } else if (closing[char]) stack.push({ start: i, end: -1, children: [], closing: closing[char] });
  }
  const render = (start: number, end: number, quotes: PrivacyQuote[], depth = 0): string => {
    if (depth > 32) return authorText.slice(start, end);
    let output = '', cursor = start;
    for (const quote of quotes) {
      output += authorText.slice(cursor, quote.start);
      const inner = authorText.slice(quote.start + 1, quote.end);
      const before = privacyBefore(output), after = privacyAfter(authorText.slice(quote.end + 1, end));
      output += recipientName.test(inner.trim()) ? inner
        // The author's explicit adoption supplies current authority. Keep it
        // separate from the original reporter when scanning the chosen words.
        : adoptsPrivacyChoice(before, after) ? '\n' + render(quote.start + 1, quote.end, quote.children, depth + 1) + '\n'
        : blankPrivacyMaterial(authorText.slice(quote.start, quote.end + 1));
      cursor = quote.end + 1;
    }
    return output + authorText.slice(cursor, end);
  };
  return render(0, authorText.length, roots);
}

/** Conservative retention fallback shares the admission gate's quotation and
 * speaker ownership. A reported temporary chat does not change this author. */
export function localRetentionRestriction(text: string): boolean {
  const authored = authoredPrivacyText(text, /$a/u);
  const sentences = authored.split(privacySentenceBoundary);
  for (const [index, sentence] of sentences.entries()) {
    const adoption = adoptsPrivacyChoice('', (sentences[index + 1] || '').trim()) ? ',' + sentences[index + 1] : '';
    for (const match of sentence.matchAll(/\bsession[ -]only\b|\btemporary\s+(?:chat|conversation|mode)\b|\b(?:do not|don't|don’t|never|must not)\s+(?:save|store|retain|record)\b/giu))
      if (!mentionedPrivacyChoice(sentence.slice(0, match.index), sentence.slice(match.index + match[0].length) + adoption)) return true;
  }
  return false;
}

/** Check the operation governing information before any cloud call. Source
 * restrictions and public-search choices are interpreted separately; the
 * explicit local-only control remains authoritative. */
export function localCloudRestriction(text: string): boolean {
  if (hasCredentials(text)) return true;
  const modelService = '\\b(?:OpenAI|ChatGPT|Anthropic|Claude|Gemini|Luna|Grok)\\b';
  const currentModel = '\\b(?:(?:your|the|our|this|current|configured)\\s+)?(?:(?:current|configured|connected|online|language|large)\\s+)*model\\b';
  const remoteRecipient = new RegExp('\\b(?:cloud|server|remote|online|external|internet|network)(?:\\s+(?:model|service))?\\b|' + modelService + '|' + currentModel, 'iu');
  const uploadRestrictsModelTransmission = (operation: string) => {
    const target = operation.match(/\bupload\b[^,;.!?]*?\b(?:to|into|onto)\s+([^,;.!?]+)/iu)?.[1];
    if (!target) return true;
    return remoteRecipient.test(target)
      || /\b(?:cloud|remote|model|online|external|third.party|anywhere|anyone|anybody|any\s+(?:service|platform)|AI)\b/iu.test(target)
      || /^(?:you|yourself|me|us|him|her|it|them|there)\b/iu.test(target.trim());
  };
  const recipientName = new RegExp('^(?:' + remoteRecipient.source + ')(?:\\s+(?:language\\s+)?(?:model|service))?$', 'iu');
  const authored = authoredPrivacyText(text, recipientName), sentences = authored.split(privacySentenceBoundary);
  const clauses = sentences.flatMap((sentence, index) => [...sentence.matchAll(/[^,]+/gu)]
    .map(match => ({ text: match[0], before: sentence.slice(0, match.index), tail: sentence.slice(match.index + match[0].length)
      + (adoptsPrivacyChoice('', (sentences[index + 1] || '').trim()) ? ',' + sentences[index + 1] : '') })));
  const prohibition = "\\b(?:do not|don't|don’t|never|must not|mustn't|mustn’t|cannot|can't|can’t)\\s+(?:(?:want|allow|permit)\\s+(?:you|anyone|anybody)\\s+to\\s+)?";
  const transfer = new RegExp(prohibition + '(upload|send|transmit|share|submit|provide|forward)\\b', 'giu');
  const processing = new RegExp(prohibition + '(?:use|call|let|allow)\\s+(?:a\\s+|the\\s+|any\\s+|our\\s+|your\\s+|this\\s+|configured\\s+)*(?:(?:cloud|remote|online|external)\\s+(?:model|service)|' + modelService + '|model\\b)', 'giu');
  for (const { text: clause, before, tail } of clauses) {
    const operative = (start: number, end: number) => !mentionedPrivacyChoice(before + clause.slice(0, start), clause.slice(end) + tail);
    for (const expression of [/\b(?:offline|local)[ -]only\b/giu, processing,
      /\b(?:keep|retain|leave|store)\b[^,;.!?\n]{0,70}\b(?:only|solely)\s+(?:on|in)\s+(?:(?:my|this|the|your)\s+)?(?:local\s+)?(?:device|computer|machine)\b/giu,
      /\b(?:keep|retain)\b[^,;.!?\n]{0,70}\b(?:on this device|on my device|locally|offline)\s+only\b/giu,
      /\b(?:only|solely)\s+(?:process|analyse|analyze|read|run|compute|use)(?:\s+[^,;.!?\n]{1,60}?)?\s+(?:on|using)\s+(?:(?:my|this|the|your)\s+)?(?:local\s+)?(?:device|computer|machine)\b/giu,
      /\b(?:only|solely)\s+(?:process|analyse|analyze|read|run|compute|use)\b[^,;.!?\n]{0,70}\b(?:locally|offline)\b/giu,
      /\b(?:only|solely)\s+(?:local|offline)\s+(?:processing|analysis|inference|computation)\b/giu])
      for (const match of clause.matchAll(expression)) if (operative(match.index, match.index + match[0].length)) return true;
    for (const match of clause.matchAll(/\b(?:(?:must|should|may)\s+not|cannot|can't|can’t|never)\s+(?:leave|exit)\s+(?:(?:my|this|the|your)\s+)?(?:device|computer|machine)\b/giu))
      if (!/\b(?:I|we|you|he|she|they)\s+(?:(?:currently|today|still)\s+)*$/iu.test(clause.slice(0, match.index))
        && operative(match.index, match.index + match[0].length)) return true;
    for (const match of clause.matchAll(/\b(?:do not|don't|don’t|never)\s+(?:let|allow)\b[^,;.!?\n]{1,80}\b(?:leave|exit)\s+(?:(?:my|this|the|your)\s+)?(?:device|computer|machine)\b/giu))
      if (operative(match.index, match.index + match[0].length)) return true;
    for (const match of clause.matchAll(transfer))
      if ((match[1].toLowerCase() === 'upload' ? uploadRestrictsModelTransmission(clause.slice(match.index))
        : remoteRecipient.test(clause)) && operative(match.index, match.index + match[0].length)) return true;
    // A browsing prohibition is not a ban on the already configured model.
    for (const match of clause.matchAll(/\b(?:do not|don't|don’t|never|must not)\s+(?:go online|connect to the internet|use the internet)\b/giu))
      if (!/^\s+(?:to\s+)?(?:search|browse|look up|find sources|research)\b/iu.test(clause.slice(match.index + match[0].length))
        && operative(match.index, match.index + match[0].length)) return true;
  }
  return false;
}

/** A bounded control proposal, never a task/personality router or action approval. */
export async function parseTurnControls(text: string, client: Pick<ChatCompletionsClient, 'complete'>, signal: AbortSignal, catalog?: { sources: string[]; capabilities: unknown[]; ui?: unknown; currentInteraction?: TurnControlInteractionContext }): Promise<TurnControlProposal> {
  if (localCloudRestriction(text)) throw new HarnessError('cloud_disabled', "This content stays on this device. No offline model is currently available.");
  const { $schema: _, ...parameters } = z.toJSONSchema(controlProposalWireSchema);
  const spec: ToolSpec = { type: 'function', function: { name: 'propose_turn_controls', description: "Understand the person's choices about retaining and using material, audience, and hypothetical content. The main assistant determines how to converse and work.", parameters } };
  const messages = [
    { role: 'system', content: "Interpret the choices this message makes about data, retention and actions. propose_turn_controls returns your judgment to the app. Ordinary private self conversation commonly uses retention/actions=unchanged, subject=self, world=real, audience=self, sourceAllowlist/sourceBasis/release=null, empty arrays and false booleans. You may omit those defaults, returning {} to affirm them. General knowledge or tasks without personal material use subject=none. Omission confirms the default meaning, so retain real new restrictions, quotation basis, changes of subject/world/audience and genuine uncertainty. Meaning matters more than keywords. An outward release must include recipient, purpose and permitted facts." },
    { role: 'system', content: "Wanting a story, editing a shared work or using a public location as a setting is a real current creative wish. Its narrator, characters and imagined events have their own identities. Fictional subject matter does not turn the actual conversation fictional or hypothetical. Understand real requests and fictional propositions separately. Choosing creation now is not necessarily a lasting interest; reading, retention and action each keep their agreements." },
    { role: 'system', content: "Review only the person's own choices about material retention, sources, disclosure, subject/world and action scope. Leave full task interpretation and participation to the main assistant. Quotes, attachments and examples are material; authority comes from the user's request. Reading, saving and acting may have different choices. Asking to find a record usually names a goal; explicitly allowing only one material sets an exclusive boundary. Asking for someone else and hypothetical material retain distinct ownership. For outward writing, release contains facts permitted for that audience, purpose, tone and recipient; private reasons stay private. Private discussion is self with release=null. basis preserves continuous supporting original passages, and uncertainControls records genuine control ambiguity. An unlocated task object remains an investigation for the main assistant." },
    { role: 'user', content: text },
    { role: 'system', content: "Several matters in one sentence can have separate scopes. Distinguish participation style, actual action and readable material. Compare only, without changing, chooses how to help; original records, conditions and conflicting occupancy may still serve that comparison. Naming a task object does not exclude all other evidence. Use scopedSourceLimits for an explicit page, item set or draft-material restriction, including a single-task request. Material identity differs from its storage source. Two current-page items may belong to previous chat, notes or account records; locating and checking those exact items can be part of comparison. Whole-category choices such as no chat or no account lookup map to sourceAllowlist/sourceExclusions. If the page is not located, preserve the actual object limit and let the main assistant find it for its purpose, without incidental reading of other records. local-agenda is the user's registered local calendar and can contain courses. campus:local is separately imported material; campus:academic-account retains account-collected local snapshots. Saved-version-only and no-refresh govern version and acquisition, without changing source origin. Preserve that condition and apply real tool parameters." },
    { role: 'system', content: "Retaining original chat differs from forming long-term understanding. Keeping chat without extracting memory is history_no_inference. Explicit temporary chat cleared at the end is session_only. Determine the object of 'do not save'. Correcting an old reason may ask for a changed understanding rather than reject retaining the new words." },
    { role: 'system', content: "map:local is public place and network data stored locally; local names storage. Personal place roles come from work:self, while device location or map selection has separate current-sharing permission. weather:open-meteo gives an explicit public reference location's weather, and web:public gives public pages. A public route between two named places can coexist with excluding other personal material. Explicit refusal of maps, internet or all but current material still applies." },
    ...(catalog?.currentInteraction ? [{ role: 'system' as const, content: "currentInteraction is a temporary reference to actual shared content in the same conversation, carrying activity and content identity without old body text. objects retains A and B separately, and relation explains their connection. One can be a real note and another a creation or rehearsal. Pointing at a creation is real conversation, while first-person content can belong to a fictional character; real collaboration and work propositions can coexist as mixed. Commenting, managing or pointing follows the actual interaction. A click grants no old-text read, long-term retention, ongoing entrustment or action permission. Follow current changes of subject, audience or material scope." }] : []),
    ...(catalog ? [{ role: 'system' as const, content: "Available nonsensitive source names and capability descriptions follow. They map meaning to real material; reading permission still comes from this turn's agreement: " + JSON.stringify(catalog) }] : []),
  ] as Parameters<ChatCompletionsClient['complete']>[0];
  for (let attempt = 0; attempt < 2; attempt++) {
  let result: Awaited<ReturnType<ChatCompletionsClient['complete']>>;
  try {
    result = await client.complete(messages, [spec], signal, undefined, { thinking: 'enabled', maxOutputTokens: 16384, phase: 'control',
      ...(usingLunaTransport() ? { toolChoice: { type: 'function' as const, function: { name: spec.function.name } } } : {}),
    });
  } catch (error) {
    if (attempt !== 0 || !(error instanceof ProviderError) || error.code !== 'output_length') throw error;
    signal.throwIfAborted();
    messages.push({ role: 'system', content: "The previous judgment reached its output limit before completion. No scope was changed from it. The original request remains available; reread it and return a complete judgment through the same tool. Omit applicable default fields while retaining real restrictions and unresolved choices." });
    continue;
  }
  const calls = result.tool_calls.filter(call => call.function.name === spec.function.name);
  let raw: unknown;
  try { raw = calls.length === 1 ? JSON.parse(calls[0].function.arguments) : undefined; } catch { raw = undefined; }
  // Some non-strict responses spell an empty nullable slot as the string
  // "null". Normalize only the empty mapping, never a quoted restriction.
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const supplied = raw as Record<string, any>;
    // An outward projection is never manufactured from private defaults.
    raw = { ...ordinaryControls, ...supplied,
      ...(supplied.audience && supplied.audience !== 'self' && supplied.release === undefined ? { release: undefined } : {}) };
    const value = raw as Record<string, any>;
    // A self-facing response has no release projection by definition. Missing
    // this inapplicable nullable field must not erase a valid privacy control.
    if (value.audience === 'self' && value.release === undefined) value.release = null;
    if (value.sourceBasis === 'null' && value.sourceAllowlist === null && Array.isArray(value.sourceExclusions) && value.sourceExclusions.length === 0 && Array.isArray(value.uncertainControls) && !value.uncertainControls.some((entry: any) => entry.dimension === 'sources')) raw = { ...value, sourceBasis: null };
    const exact = (quote: unknown) => {
      if (typeof quote !== 'string' || text.includes(quote) || quote.length < 2) return quote;
      const pairs: Record<string, string> = { '“': '”', '‘': '’', '"': '"', "'": "'" };
      const closing = pairs[quote[0]], inner = closing && quote.at(-1) === closing ? quote.slice(1, -1) : quote;
      return text.includes(inner) ? inner : quote;
    };
    raw = { ...(raw as Record<string, any>), sourceBasis: exact((raw as any).sourceBasis), basis: Array.isArray((raw as any).basis) ? (raw as any).basis.map(exact) : (raw as any).basis,
      scopedSourceLimits: Array.isArray((raw as any).scopedSourceLimits) ? (raw as any).scopedSourceLimits.map((entry: any) => ({ ...entry, quote: exact(entry.quote) })) : (raw as any).scopedSourceLimits,
      uncertainControls: Array.isArray((raw as any).uncertainControls) ? (raw as any).uncertainControls.map((entry: any) => ({ ...entry, quote: exact(entry.quote) })) : (raw as any).uncertainControls };
    const normalized = raw as Record<string, any>;
    // The exact same scoped citation need not occupy the global slot too.
    // Its operation-specific restriction is retained and verified on each read.
    if (normalized.sourceAllowlist === null && Array.isArray(normalized.sourceExclusions) && !normalized.sourceExclusions.length
      && normalized.scopedSourceLimits?.some((entry: any) => entry.quote === normalized.sourceBasis)) normalized.sourceBasis = null;
  }
  const parsed = proposalSchema.safeParse(raw);
  const invalid = !parsed.success || parsed.data.basis.some(quote => !text.includes(quote)) || parsed.data.uncertainControls.some(c => !text.includes(c.quote)) || parsed.data.scopedSourceLimits?.some(limit => !text.includes(limit.quote)) ||
    (parsed.data.retentionScope === 'conversation' && (parsed.data.retention === 'unchanged' || !parsed.data.basis.length)) ||
    (parsed.data.clearConversationOnExit === true && (parsed.data.retentionScope !== 'conversation' || parsed.data.retention !== 'session_only')) ||
    (parsed.data.sourceBasis !== null && !text.includes(parsed.data.sourceBasis)) ||
    ((parsed.data.sourceAllowlist !== null || parsed.data.sourceExclusions.length > 0) && !parsed.data.sourceBasis) ||
    (parsed.data.sourceBasis !== null && parsed.data.sourceAllowlist === null && !parsed.data.sourceExclusions.length && !parsed.data.uncertainControls.some(control => control.dimension === 'sources'));
  const unknownSources = parsed.success && catalog && [...(parsed.data.sourceAllowlist || []), ...parsed.data.sourceExclusions].some(id => !catalog.sources.includes(id));
  // An object/page limit is retained for each actual read-purpose check. It
  // does not by itself change identity, audience or the whole-source scope,
  // so a valid proposal need not reclassify the person merely for carrying it.
  // A clear none/real subject also keeps the owner's identity. Private reads
  // still require their own purpose check, so ordinary knowledge need not
  // repeat this classification. Uncertain controls and source/audience changes
  // retain their existing review.
  if (!invalid && !unknownSources && parsed.success && attempt === 0 && (
    (parsed.data.subject !== 'self' && (parsed.data.subject !== 'none' || parsed.data.world !== 'real'
      || parsed.data.uncertain || parsed.data.uncertainControls.length > 0))
    || parsed.data.audience !== 'self' || parsed.data.sourceAllowlist !== null ||
    parsed.data.sourceExclusions.length > 0 || parsed.data.uncertainControls.some(control => control.dimension === 'sources')
  )) {
    messages.push({ role: 'system', content: "Independently recheck the original meaning. subject identifies whose personal material this is; questioner, mentioned person, author and data subject can differ. A user's own record remains self even when about a course, place or another author. Excluding other personal categories does not identify another person's data. other is an actual lookup of another person's record; none is knowledge explicitly independent of personal data. An unlocated source needs retrieval, not relabeling as other or none. audience identifies who sees this content now; possible future contacts need not be the current private-analysis audience. Private analysis remains self/release=null; actual outward drafting or dispatch uses its real audience. recipient and subject can differ. 'That letter' or 'the previous version' usually refers to the same-audience existing draft. referencePrevious and reusePriorDraft can preserve continuity when audience and disclosure are unchanged; channel availability is a separate real state. Looking up current calendar or goals names an object and does not always mean current-message-only. Lookup order is not necessarily exclusion. Missing material or an unresolved reference differs from uncertainty over reading permission. With no real source limit, sourceBasis is null and source uncertainty may be cleared; retain actual restriction quotes in basis. Retained chat without long-term inference is history_no_inference; explicit no-history is session_only. Keep genuine choice ambiguity while the main assistant resolves missing task parameters." });
    continue;
  }
  if (invalid || unknownSources) {
    if (attempt === 0) {
      const issues = !parsed.success ? parsed.error.issues.map(issue => ({ field: issue.path.join('.'), code: issue.code })) : [
        ...(parsed.data.basis.some(quote => !text.includes(quote)) ? [{ field: 'basis', code: 'not_contiguous_original_quote' }] : []),
        ...(parsed.data.uncertainControls.some(control => !text.includes(control.quote)) ? [{ field: 'uncertainControls.quote', code: 'not_contiguous_original_quote' }] : []),
        ...((parsed.data.scopedSourceLimits || []).some(limit => !text.includes(limit.quote)) ? [{ field: 'scopedSourceLimits.quote', code: 'not_contiguous_original_quote' }] : []),
        ...(parsed.data.sourceBasis !== null && !text.includes(parsed.data.sourceBasis) ? [{ field: 'sourceBasis', code: 'not_contiguous_original_quote' }] : []),
        ...((parsed.data.sourceAllowlist !== null || parsed.data.sourceExclusions.length > 0) && !parsed.data.sourceBasis ? [{ field: 'sourceBasis', code: 'required_for_allowlist_or_exclusions' }] : []),
        ...(unknownSources ? [{ field: 'sourceAllowlist/sourceExclusions', code: 'unknown_source_id' }] : []),
      ];
      messages.push({ role: 'system', content: "Some fields or quotations did not match the original request; no body was read or retained from that judgment. The issues are: " + JSON.stringify(issues) + ". Recheck against the original words. sourceIds must match the supplied catalog; quotations preserve continuous original text. Whole-turn source basis belongs in sourceBasis, and local entrustment or draft limits in scopedSourceLimits. Without limits these are null and an empty array. Saving a note differs from saving chat; refusing a calendar arrangement may still permit that note. Return the genuinely understood choices and objects through the same tool; format lets the app read your judgment." });
      continue;
    }
    throw new HarnessError('control_unknown', "The material scope is not yet established. Content has not been retained.");
  }
  if (!parsed.success) throw new HarnessError('control_unknown', "The material-scope proposal is unavailable.");
  const currentOnly = parsed.data.sourceAllowlist !== null && parsed.data.sourceAllowlist.every(id => id === 'current' || id.startsWith('file:'));
  let controls = parsed.data;
  if (controls.retention !== 'unchanged') {
    // Task limits, corrections to an old interpretation, and retention of the
    // current words have different owners. Resolve a proposed restriction by
    // its actual object rather than treating every negative request as saving.
    const retentionMeaning = z.object({ appliesTo: z.enum(['current_chat_or_inference', 'existing_understanding_only', 'current_task_only', 'unclear']),
      quote: z.string().min(1).max(2000), reason: z.string().max(1500) }).strict()
      .refine(value => text.includes(value.quote), 'The explanation needs a literal part of the current words.');
    const { $schema: __, ...retentionParameters } = z.toJSONSchema(retentionMeaning);
    try {
      const meaning = await structuredResult({ schema: retentionMeaning,
        tool: { type: 'function', function: { name: 'understand_retention_request',
          description: "Distinguish a change to the current task, an existing understanding, and retention of these current words.", parameters: retentionParameters } },
        messages: [
          { role: 'system', content: "Independently identify what this message restricts. current_chat_or_inference means an actual choice about retaining the current chat or long-term understanding from it, even alongside task requests. existing_understanding_only means correcting or retiring an existing judgment without restricting these new words. current_task_only limits the current task's objects, steps, range or actions without changing chat retention: stopping at a page, comparing two items or deferring one matter can be task choices. Read the whole sentence to identify its object. Keeping chat while declining long-term inference is still current_chat_or_inference. Inseparable meanings or an unclear retention object are unclear; preserve the narrower existing scope. quote is the continuous original basis. reason explains who or what the negation or change concerns, also honoring any separate real chat-retention limit in the sentence. Do not expand source, action or UI-selected scope." },
          { role: 'user', content: JSON.stringify({ original: text, proposal: { retention: controls.retention,
            retentionScope: controls.retentionScope || 'turn', basis: controls.basis } }) },
        ], complete: client.complete.bind(client), signal,
        options: { thinking: 'enabled', maxOutputTokens: 4096, phase: 'control' },
        failureCode: 'retention_meaning_unknown', failureMessage: "The meaning of this retention choice remains unclear." });
      if (meaning.appliesTo === 'existing_understanding_only' || meaning.appliesTo === 'current_task_only') {
        controls = { ...controls, retention: 'unchanged' };
        delete controls.retentionScope;
        delete controls.clearConversationOnExit;
      }
    } catch { /* An uncertain interpretation keeps the narrower proposal. */ }
  }
  if (controls.actions !== 'unchanged' && controls.actionsApplyToWholeTurn && controls.specificActionLimits.length) {
    const actionScope = z.object({ explicitWriteQuote: z.string().min(1).max(2000).nullable(), restrictionQuote: z.string().min(1).max(2000), restrictionCoversExplicitWrite: z.boolean() }).strict()
      .superRefine((value, context) => {
        if (!text.includes(value.restrictionQuote) || value.explicitWriteQuote && !text.includes(value.explicitWriteQuote))
          context.addIssue({ code: 'custom', message: 'Both action-scope citations must be literal current user text.' });
      });
    const { $schema: __, ...actionParameters } = z.toJSONSchema(actionScope);
    try {
      const verdict = await structuredResult({ schema: actionScope,
        tool: { type: 'function', function: { name: 'verify_action_restriction_scope', description: "Determine whether this local restriction also covers the neighboring explicit local-record request. This interprets meaning; actual handling retains its own steps.", parameters: actionParameters } },
        messages: [
          { role: 'system', content: "Identify which matters the restriction governs; later checks determine execution. explicitWriteQuote is a continuous original request to write a local object now, or null if absent. restrictionQuote preserves the restriction. restrictionCoversExplicitWrite says whether it also governs that explicit write. 'Register only this one; leave the others unscheduled' distinguishes them; 'Save none of the items yet' covers both. Preserve actual local or whole-turn scope while distinguishing drafts, discussion and hypotheses." },
          { role: 'user', content: JSON.stringify({ text, proposal: { actions: controls.actions, actionsApplyToWholeTurn: controls.actionsApplyToWholeTurn, specificActionLimits: controls.specificActionLimits } }) },
        ], complete: client.complete.bind(client), signal, options: { thinking: 'enabled', maxOutputTokens: 4096, phase: 'verification' },
        failureCode: 'action_scope_unknown', failureMessage: "The scope of the action restriction remains unclear." });
      if (verdict.explicitWriteQuote && !verdict.restrictionCoversExplicitWrite) {
        const allowedStart = text.indexOf(verdict.explicitWriteQuote), restrictionStart = text.indexOf(verdict.restrictionQuote);
        const distinctQuotes = allowedStart + verdict.explicitWriteQuote.length <= restrictionStart || restrictionStart + verdict.restrictionQuote.length <= allowedStart;
        if (distinctQuotes) controls = { ...controls, actions: 'unchanged', actionsApplyToWholeTurn: false };
      }
    } catch { /* Keep the more restrictive original proposal when verification fails. */ }
  }
  return { ...controls, release: controls.audience === 'self' ? null : controls.release, sources: currentOnly ? 'current_only' : 'unchanged' };
  }
  throw new HarnessError('control_unknown', "The material scope is not yet established. Content has not been retained.");
}
