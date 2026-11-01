import * as z from 'zod';
import { workSourceBindingSchema, workSourceRefSchema, type WorkSourceBinding } from './harness';

const id = z.string().min(1).max(160), revision = z.number().int().positive();
export const REHEARSAL_SOURCE_CONTEXT_MEANING = `sourceContext.kind=relationship_rehearsal means these words arrived through the person’s rehearsal or expression-editing interface. It identifies a source and activity; particular permissions and the actual speaker of every sentence still need their own support.

Distinguish voices that may coexist: a line the person is trying to say to someone, an assistant-simulated possible response, commentary about rehearsal, and a real request to stop or do something else. First-person claims, agreement, remembering, adoption, sending and execution inside dialogue belong first to that rehearsal. The assistant’s response remains a possibility. Real facts about either person, recording permission, decisions and action instructions are understood separately from actual original words.

A person can make a serious new request midway through a rehearsal. Interpret the whole message semantically. A real personal ADD needs both an actual factual fragment and exact recording permission. An interface reference or “remember” inside a line explains the object in that context; any new real record still needs its own provenance.`;
export const rehearsalCitationSchema = workSourceRefSchema.safeExtend({ quote: z.string().min(1).max(4000) });
export type RehearsalCitation = z.infer<typeof rehearsalCitationSchema>;
const locator = workSourceRefSchema.safeExtend({ quoteSha256: z.string().regex(/^[a-f0-9]{64}$/) });
export type RehearsalLocator = z.infer<typeof locator>;
const supported = z.object({ text: z.string().min(1).max(1400), sources: z.array(rehearsalCitationSchema).min(1).max(8) }).strict();
const storedSupported = z.object({ text: z.string().min(1).max(1400), sources: z.array(locator).min(1).max(8) }).strict();
const premise = z.object({
  text: z.string().min(1).max(1200), origin: z.enum(['user_report_for_this_rehearsal', 'assistant_possibility']),
  sources: z.array(rehearsalCitationSchema).max(8),
}).strict().superRefine((value, context) => {
  if (value.origin === 'user_report_for_this_rehearsal' && !value.sources.length)
    context.addIssue({ code: 'custom', path: ['sources'], message: 'A personal account of this situation needs actual user words. An assistant possibility is not a reported fact.' });
});
const storedPremise = z.object({ text: z.string().min(1).max(1200),
  origin: z.enum(['user_report_for_this_rehearsal', 'assistant_possibility']), sources: z.array(locator).max(8) }).strict();

export const rehearsalRefSchema = z.object({ id, revision, matterId: id, activeTurnId: id.nullable() }).strict();
export type RehearsalRef = z.infer<typeof rehearsalRefSchema>;
export const rehearsalInteractionSchema = z.object({
  kind: z.enum(['reference', 'utterance', 'alternative', 'collect', 'pause', 'resume']), ref: rehearsalRefSchema,
}).strict();
export type RehearsalInteraction = z.infer<typeof rehearsalInteractionSchema>;

const base = { id, expectedRevision: revision, matterId: id, source: rehearsalCitationSchema };
export const rehearsalWriteInput = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('begin'), matterId: id, expectedMatterRevision: revision, source: rehearsalCitationSchema,
    intention: supported.describe('What the person wants to express or protect, retaining original-word support rather than trying to win the conversation for them.'),
    boundaries: z.array(supported).max(6),
    counterpart: z.object({ label: z.string().min(1).max(80), premise }).strict(),
    opening: z.string().min(1).max(2000).optional().describe('One possible opening from the other person, always assistant simulation, never a claim of actual speech. Omit to let the user begin.'),
  }).strict(),
  z.object({ operation: z.literal('respond'), ...base,
    userLine: rehearsalCitationSchema.describe('The continuous original line the user actually rehearsed this turn, not a line invented for them by the assistant.'),
    response: z.string().min(1).max(2500).describe('The primary assistant simulates one possible response without claiming the other person thinks that way or adding real relationship facts. The response may be difficult, disagree or stop at an awkward point; it need not end in quick acceptance of a boundary.'),
    aside: z.string().max(800).optional().describe('When necessary, respond as the original assistant to the meaning. Do not score, review or assign practice after every turn.'),
  }).strict(),
  z.object({ operation: z.literal('alternative'), ...base, targetTurnId: id,
    premise: premise.optional(), response: z.string().min(1).max(2500),
    aside: z.string().max(800).optional(),
  }).strict(),
  z.object({ operation: z.literal('adjust'), ...base,
    intention: supported.optional(), boundaries: z.array(supported).max(6).optional(), premise: premise.optional(),
    aside: z.string().max(800).optional(),
  }).strict(),
  z.object({ operation: z.literal('collect'), ...base,
    expression: z.string().min(1).max(6000).describe('An expression worth considering now, still an assistant draft. Do not accept, send or claim agreement on the person’s behalf. It can be collected before a complete rehearsal round.'),
    fromTurnIds: z.array(id).max(24).optional().describe('IDs of lines or possible responses actually used in this rehearsal, for provenance only. Simulated responses are not actual incoming messages.'),
  }).strict(),
  z.object({ operation: z.enum(['pause', 'resume', 'close']), ...base }).strict(),
]);
export type RehearsalWriteInput = z.infer<typeof rehearsalWriteInput>;
export const rehearsalReadInput = z.object({ id, expectedRevision: revision.optional(),
  offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(24).optional(),
}).strict();

const userTurn = z.object({ id, parentId: id.nullable(), actor: z.literal('you'), origin: z.literal('user_practice_not_actual_exchange'),
  source: locator, controlSource: locator, createdAt: z.string(), basedOnRevision: revision }).strict();
const otherTurn = z.object({ id, parentId: id.nullable(), actor: z.literal('possible_other'), origin: z.literal('assistant_simulation'),
  text: z.string().min(1).max(2500), requestedBy: locator, alternativeOf: id.nullable(), createdAt: z.string(), basedOnRevision: revision }).strict();
export const rehearsalStoredTurnSchema = z.discriminatedUnion('actor', [userTurn, otherTurn]);
export const rehearsalDataSchema = z.object({
  type: z.literal('relationship_rehearsal'), version: z.literal(1), matterId: id,
  state: z.enum(['active', 'held', 'closed']), sessionId: id, sessionIds: z.array(id).min(1).max(128),
  startedBy: locator, lastControl: locator,
  intention: storedSupported, boundaries: z.array(storedSupported).max(6),
  counterpart: z.object({ label: z.string().min(1).max(80), premise: storedPremise }).strict(),
  turns: z.array(rehearsalStoredTurnSchema).max(128), activeTurnId: id.nullable(),
  lastAside: z.object({ text: z.string().max(800), requestedBy: locator, at: z.string() }).strict().nullable(),
  expression: z.object({ optionId: id, revision, requestedBy: locator,
    fromTurnIds: z.array(id).max(24), origin: z.literal('assistant_draft_not_sent'), at: z.string() }).strict().nullable(),
  operations: z.array(z.object({ key: z.string(), operation: z.string(), source: locator, at: z.string() }).strict()).max(128),
  lifecycleControl: z.object({ operation: z.enum(['pause', 'close']), source: locator, at: z.string() }).strict().optional(),
  sourceIds: z.array(id).max(32), createdAt: z.string(), updatedAt: z.string(),
}).strict();
export type RehearsalData = z.infer<typeof rehearsalDataSchema>;
export type RehearsalStoredTurn = z.infer<typeof rehearsalStoredTurnSchema>;

export interface RehearsalView {
  id: string; revision: number; matterId: string; state: RehearsalData['state'];
  ref: RehearsalRef; intention: string; boundaries: string[];
  counterpart: { label: string; premise: string; premiseOrigin: RehearsalData['counterpart']['premise']['origin'] };
  turns: { id: string; actor: 'you' | 'possible_other'; text: string;
    origin: 'user_practice_not_actual_exchange' | 'assistant_simulation'; alternativeCount: number }[];
  aside: string | null;
  expression: { optionId: string; revision: number; text: string; origin: 'assistant_draft_not_sent' } | null;
  coverage: { offset: number; total: number; nextOffset: number | null };
  sourceBinding: WorkSourceBinding;
  updatedAt: string;
  meaning: string;
}
export const rehearsalViewSchema = z.object({
  id, revision, matterId: id, state: z.enum(['active', 'held', 'closed']), ref: rehearsalRefSchema,
  intention: z.string().min(1).max(1400), boundaries: z.array(z.string().min(1).max(1400)).max(6),
  counterpart: z.object({ label: z.string().min(1).max(80), premise: z.string().min(1).max(1200),
    premiseOrigin: z.enum(['user_report_for_this_rehearsal', 'assistant_possibility']) }).strict(),
  turns: z.array(z.object({ id, actor: z.enum(['you', 'possible_other']), text: z.string().min(1).max(4000),
    origin: z.enum(['user_practice_not_actual_exchange', 'assistant_simulation']), alternativeCount: z.number().int().nonnegative() }).strict()).max(24),
  aside: z.string().max(800).nullable(), expression: z.object({ optionId: id, revision, text: z.string().min(1).max(6000),
    origin: z.literal('assistant_draft_not_sent') }).strict().nullable(),
  coverage: z.object({ offset: z.number().int().nonnegative(), total: z.number().int().nonnegative(), nextOffset: z.number().int().nonnegative().nullable() }).strict(),
  sourceBinding: workSourceBindingSchema, updatedAt: z.string(), meaning: z.string().max(1600),
}).strict().superRefine((view, context) => {
  if (view.id !== view.ref.id || view.revision !== view.ref.revision || view.matterId !== view.ref.matterId)
    context.addIssue({ code: 'custom', path: ['ref'], message: 'Rehearsal references must belong to the same current object.' });
  if (view.turns.some(turn => turn.actor === 'you' ? turn.origin !== 'user_practice_not_actual_exchange' : turn.origin !== 'assistant_simulation'))
    context.addIssue({ code: 'custom', path: ['turns'], message: 'The user’s rehearsal and a simulated response cannot be treated as real correspondence.' });
});
export const rehearsalPresentationInput = z.object({ id, expectedRevision: revision }).strict();
export const rehearsalNativeInput = z.object({ sessionId: id, messageId: id, id, sceneRevision: revision }).strict();
export type RehearsalNativeInput = z.infer<typeof rehearsalNativeInput>;
export interface RehearsalNativeBridge { rehearsalProject(input: RehearsalNativeInput): Promise<RehearsalScene> }

/** This is one bounded message projection of the original Work artifact. */
export const rehearsalSceneRefSchema = z.object({ id, revision, matterId: id, sourceBinding: workSourceBindingSchema }).strict();
export interface RehearsalScene extends RehearsalView {
  kind: 'rehearsal'; sessionId: string; createdAt: string; sourceBoundary: string; source: import('./scenes').SceneSource;
}
export interface RehearsalHistoryReference {
  kind: 'rehearsal_reference'; id: string; revision: number; sessionId: string; createdAt: string; source: import('./scenes').SceneSource;
  owner: { id: string; revision: number; matterId: string }; label: 'Continue that rehearsal'; requiresCurrentRead: true;
  read: { tool: 'read_relationship_rehearsal'; arguments: { id: string } };
}
export function rehearsalHistoryReference(scene: RehearsalScene): RehearsalHistoryReference {
  return { kind: 'rehearsal_reference', id: scene.id, revision: scene.revision, sessionId: scene.sessionId, createdAt: scene.createdAt,
    source: { sourceId: 'work:self', fetchedAt: scene.source.fetchedAt, ...(scene.source.version ? { version: scene.source.version } : {}) },
    owner: { id: scene.ref.id, revision: scene.ref.revision, matterId: scene.ref.matterId }, label: 'Continue that rehearsal', requiresCurrentRead: true,
    read: { tool: 'read_relationship_rehearsal', arguments: { id: scene.ref.id } } };
}

export function rehearsalFollowup(view: RehearsalView, kind: RehearsalInteraction['kind']) {
  const text = kind === 'alternative' ? 'Try another possible response so I can have another go.'
    : kind === 'collect' ? 'Pause the rehearsal and help me collect what I want to say into a usable sentence.'
      : kind === 'pause' ? 'Pause here.' : kind === 'resume' ? 'Let’s continue the part we were rehearsing.' : '';
  return { text, rehearsalInteraction: { kind, ref: view.ref } satisfies RehearsalInteraction };
}
