import * as z from 'zod';
import { curiosityChapterAddressSchema, curiosityHistoryReadSchema, curiosityHistoryCatalogSchema } from './curiosity-source';
import { storySettingRequestSchema, type StorySettingSnapshot } from './story-setting';

const id = z.string().min(1).max(160);
export const curiositySourceSchema = z.object({
  eventId: id, contentVersion: z.number().int().positive(),
  start: z.number().int().nonnegative(), end: z.number().int().positive(),
  quote: z.string().min(1).max(2000),
}).strict().refine(value => Number.isSafeInteger(value.start) && Number.isSafeInteger(value.end) && value.end > value.start,
  'Exploration needs the exact original Unicode range.');

export const curiosityPublicCitationSchema = z.object({
  observationId: id,
  quote: z.string().min(1).max(1200).describe('An exact quotation from research.read content actually delivered this turn. A search summary is not a reading of the source.'),
}).strict();

/** One ready-to-try thing, rather than a preference category or a new goal. */
export const curiositySeedSchema = z.object({
  title: z.string().min(1).max(160),
  opening: z.string().min(1).max(1000).describe('A natural invitation. A current wish for something unfamiliar can outweigh old interests; do not claim the user will like it or has never seen it.'),
  experience: z.string().min(1).max(7000).describe('Concrete prepared content: a creation to play with, a readable passage or a sourced discovery. A category such as music or walking is insufficient.'),
  firstMove: z.string().min(1).max(1200).describe('A move available now or something to discuss, without creating a check-in, calendar entry or commitment.'),
  origin: z.enum(['created', 'public', 'mixed']).describe('created applies only to original creation or imagination. Do not relabel external facts as creation to bypass sourcing.'),
  citations: z.array(curiosityPublicCitationSchema).max(6).default([]),
}).strict().superRefine((seed, context) => {
  if (seed.origin === 'created' && seed.citations.length)
    context.addIssue({ code: 'custom', path: ['citations'], message: 'Pure creation does not attach citations that pretend to verify facts.' });
  if (seed.origin !== 'created' && !seed.citations.length)
    context.addIssue({ code: 'custom', path: ['citations'], message: 'Public facts require source content actually read this turn; alternatively create something that makes no such factual claim.' });
});

const target = { id, expectedRevision: z.number().int().positive(), expectedMatterRevision: z.number().int().positive() };
export const curiosityInvitationInput = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('brief'), source: curiositySourceSchema,
    publicTopic: z.string().min(1).max(300).describe('A public discovery topic without copying private words, profiles, courses, health, location or other private context.'),
    queries: z.array(z.string().min(1).max(300)).min(1).max(4),
  }).strict(),
  z.object({ operation: z.literal('offer'), source: curiositySourceSchema, seed: curiositySeedSchema,
    setting: storySettingRequestSchema.optional() }).strict(),
  z.object({ operation: z.literal('read'), id }).strict(),
  curiosityHistoryReadSchema.extend({ operation: z.literal('read_history') }).strict(),
  curiosityHistoryCatalogSchema.extend({ operation: z.literal('history') }).strict(),
  z.object({ operation: z.literal('continue'), ...target, source: curiositySourceSchema, seed: curiositySeedSchema,
    setting: storySettingRequestSchema.nullable().optional().describe('Supply only when the shared creation needs a public location setting. Omit to preserve it; null returns to creation independent of a map. Selecting a place proves no arrival and authorizes no real journey.'),
    fromChapter: curiosityChapterAddressSchema.optional().describe('The original chapter actually read and intended for continuation. Recheck its current version and new user words; do not roll back the object or restore old actions.') }).strict(),
  z.object({ operation: z.literal('another'), ...target, source: curiositySourceSchema, seed: curiositySeedSchema,
    setting: storySettingRequestSchema.optional() }).strict(),
  z.object({ operation: z.literal('put_aside'), ...target, source: curiositySourceSchema }).strict(),
]);
export type CuriosityInvitationInput = z.infer<typeof curiosityInvitationInput>;
export type CuriositySeed = z.infer<typeof curiositySeedSchema>;
export type CuriositySource = z.infer<typeof curiositySourceSchema>;

export interface CuriosityPublicSource {
  observationId: string;
  url: string;
  title: string;
  quote: string;
  fetchedAt: string;
  resourceId?: string;
}
export interface CuriosityInvitationView {
  id: string;
  revision: number;
  matterId: string;
  matterRevision: number;
  status: 'offered' | 'playing' | 'put_aside' | 'replaced' | 'historical';
  title: string;
  opening: string;
  experience: string;
  firstMove: string;
  origin: CuriositySeed['origin'];
  originLabel: string;
  publicSources: CuriosityPublicSource[];
  setting?: StorySettingSnapshot;
  presentation: 'experience_first';
  choices: { intent: 'continue' | 'another' | 'put_aside'; label: string }[];
  meaning: string;
}
