import * as z from 'zod';

const id = z.string().min(1).max(160);
const range = { start: z.number().int().nonnegative(), end: z.number().int().positive() };
export const companionSourceSchema = z.object({
  eventId: id, contentVersion: z.number().int().positive(), ...range,
  quote: z.string().min(1).max(4000),
}).strict().refine(value => Number.isSafeInteger(value.start) && Number.isSafeInteger(value.end) && value.end > value.start,
  'A conversation source needs a complete valid Unicode range.');
export const companionReplySchema = z.object({
  messageId: id, ...range, quote: z.string().min(1).max(2000),
}).strict().refine(value => Number.isSafeInteger(value.start) && Number.isSafeInteger(value.end) && value.end > value.start,
  'Expression feedback needs the exact location of an actual assistant reply.');

/** These name conversational material, not moods, affinity or task routes. */
export const companionKindSchema = z.enum(['ongoing_topic', 'shared_phrase', 'expression_feedback']);
export type CompanionKind = z.infer<typeof companionKindSchema>;
export const personalMethodUsageSchema = z.enum(['work', 'conversation']);
export type PersonalMethodUsage = z.infer<typeof personalMethodUsageSchema>;
export const companionEntrySchema = z.object({
  kind: companionKindSchema,
  label: z.string().min(1).max(160).describe('A short topic label for later retrieval, not an emotion, intimacy level or judgment of a person.'),
  topic: companionSourceSchema.describe('The user’s original words for this conversation, shared expression or feedback.'),
  phrase: companionSourceSchema.optional().describe('For shared_phrase, words the user actually used or explicitly adopted. The assistant merely suggesting them is not shared adoption.'),
  meaning: companionSourceSchema.optional().describe('The user’s actual explanation of the expression or interaction need; leave absent if none was given.'),
  conditions: z.array(companionSourceSchema).max(4).default([]).describe('Cite only stated conditions. A request for today does not become a lasting agreement.'),
  replyTarget: companionReplySchema.optional().describe('The actual published assistant reply addressed by the feedback, not a candidate answer, character example or unpublished text.'),
}).strict().superRefine((value, context) => {
  if (value.kind === 'shared_phrase' && !value.phrase)
    context.addIssue({ code: 'custom', path: ['phrase'], message: 'A shared expression requires the user’s actual adoption.' });
  if (value.kind !== 'expression_feedback' && value.replyTarget)
    context.addIssue({ code: 'custom', path: ['replyTarget'], message: 'Only expression feedback links the assistant reply being discussed.' });
});
export const companionManageInput = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('remember'), source: companionSourceSchema, entry: companionEntrySchema }).strict(),
  z.object({ operation: z.literal('revise'), id, expectedRevision: z.number().int().positive(),
    source: companionSourceSchema, entry: companionEntrySchema }).strict(),
  z.object({ operation: z.enum(['resume', 'pause', 'close']), id, expectedRevision: z.number().int().positive(),
    source: companionSourceSchema }).strict(),
]);
export type CompanionManageInput = z.infer<typeof companionManageInput>;
export const companionReadInput = z.object({
  id: id.optional(), expectedRevision: z.number().int().positive().optional(),
  query: z.string().max(300).default(''), offset: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(12).default(6), includeInactive: z.boolean().default(false),
}).strict();
export type CompanionReadInput = z.infer<typeof companionReadInput>;

export interface CompanionPersonaAnchor {
  revision: number;
  presetId: string;
  name: string;
}
export interface CompanionThreadCue {
  id: string;
  revision: number;
  kind: CompanionKind;
  title: string;
  updatedAt: string;
  fromCurrentConversation: boolean;
  personaRelation: 'same_configuration' | 'edited_configuration' | 'different_role';
  read: { tool: 'restore_collaboration'; type: 'companion'; id: string; expectedRevision: number };
}
export interface ConversationMethodCue {
  id: string;
  revision: number;
  name: string;
  usage: 'conversation';
  read: { tool: 'read_skill'; id: string };
}

export const COMPANION_CONTINUITY_MEANING = 'Preserve actual conversation topics, shared expressions and the user’s feedback for natural continuity. A topic needs no task, deadline or next step. An old topic does not require continuation now. Feedback stays within its original scope and does not establish emotion, satisfaction, dependence or intimacy. A character change does not rewrite actual conversations; another character may refer to a conversation here without claiming it as their own experience. Read lasting interaction agreements through explicitly selected conversation methods; do not automatically change the character core, schedule or background contact.';
