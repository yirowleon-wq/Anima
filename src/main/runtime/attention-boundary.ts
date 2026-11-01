import * as z from 'zod';
import type { ChatCompletionsClient, ToolSpec } from '../provider';
import { structuredResult } from './structured-result';

const wire = z.object({
  restrictionQuote: z.string().min(1).max(1200).describe("The exact original passage supporting this particular restriction; do not add a deadline supplied only by the proposal."),
  hasOwnEnd: z.boolean().describe("This restriction has its own explicit ending condition. A temporary restriction in the same sentence does not lend it an expiry."),
  matchesUntil: z.boolean().describe("The proposed until exactly matches this restriction's own explicit ending condition, including current time and timezone."),
  endQuote: z.string().max(1200).nullable(),
  reason: z.string().min(1).max(600),
}).strict();

export interface AttentionExpiryVerdict { approved: boolean; restrictionQuote: string; reason: string }

/** A restriction is applied immediately; only its automatic relaxation needs proof. */
export async function verifyAttentionExpiry(original: string, proposed: unknown, complete: ChatCompletionsClient['complete'], signal: AbortSignal): Promise<AttentionExpiryVerdict> {
  const { $schema: _, ...parameters } = z.toJSONSchema(wire);
  const tool: ToolSpec = { type: 'function', function: { name: 'verify_attention_expiry', description: "Help the assistant interpret this restriction's own ending condition and whether the proposed automatic release instant matches it. Reminders and business actions retain their own agreements.", parameters } };
  const schema = wire.superRefine((value, context) => {
    if (!original.includes(value.restrictionQuote)) context.addIssue({ code: 'custom', path: ['restrictionQuote'], message: "This quotation does not match the current original user words; the restriction was not bound." });
    if (value.hasOwnEnd && (!value.endQuote || !original.includes(value.endQuote))) context.addIssue({ code: 'custom', path: ['endQuote'], message: "This ending condition still needs its corresponding complete original passage." });
  });
  const value = await structuredResult({ schema, tool, complete, signal, failureCode: 'attention_expiry_unknown', failureMessage: "The automatic ending time of this restriction has not been confirmed.", options: { thinking: 'enabled', maxOutputTokens: 4096, phase: 'verification' }, messages: [
    { role: 'system', content: "Help the assistant interpret the ending condition of one restriction. The restriction is already effective; the question is when it may automatically end, separately from calendar operations or renewed confirmation. original is the person's current exact statement. proposed.rule/title/until are the assistant's interpretation; a deadline written into the proposal is not user evidence.\nOne sentence can contain parallel agreements with different objects and durations. For example, “No exercise reminders tonight, and don't push me because I feel anxious in future”: tonight modifies the former, while the latter may continue. This example guides interpretation; judge the actual original. If temporal attachment is unclear, hasOwnEnd may be false, preserving the existing quiet. Preserve a real temporary endpoint when the person gave one for this restriction.\nrestrictionQuote returns the smallest complete original supporting this restriction; endQuote identifies its own ending condition. Judge hasOwnEnd and matchesUntil independently. Leave unclear or mismatched automatic resumption unresolved. Relative dates can use the host's current time and timezone; the person need not speak ISO. Return your interpretation in this structure; the host applies source and revision checks." },
    { role: 'user', content: JSON.stringify({ original, proposed }) },
  ] });
  return { approved: value.hasOwnEnd && value.matchesUntil, restrictionQuote: value.restrictionQuote, reason: value.reason };
}
