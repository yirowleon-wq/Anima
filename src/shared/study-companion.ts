import * as z from 'zod';
import { workSourceRefSchema, type WorkSourceBinding, type WorkSourceRef } from './harness';
import { explorableStudySchema, type ExplorableStudySpec } from './explorable-study';
import type { NoteSourceProof } from './notes-source';
import type { SourceBookmarkPreview } from './source-bookmark';

const id = z.string().min(1).max(160);
export const studyCitationSchema = workSourceRefSchema.safeExtend({ quote: z.string().min(1).max(8000) }).strict();
export const studyModeSchema = z.enum(['small_hint', 'guided_step', 'explain']);
export type StudyMode = z.infer<typeof studyModeSchema>;
const material = { observationId: id.describe('The top-level observationId returned by materials.read/observe, not a file ID, description-directory ID or internal page-image ID.'),
  resourceId: z.string().regex(/^material-[a-f0-9-]{36}$/) };
export const studyProblemInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('evidence'), source: studyCitationSchema.describe('An actual original-word fragment containing the problem. A request to look at a note is not the problem inside it; use note for that original passage.') }).strict(),
  z.object({ kind: z.literal('note'), id: z.string().regex(/^note-[a-f0-9-]{36}$/),
    revision: z.number().int().positive(), start: z.number().int().nonnegative(),
    end: z.number().int().positive() }).strict().describe('Copy studyProblem from manage_note read, or select an exact original passage within its read range. The host rereads the same note version; a note ID is not an eventId.'),
  z.object({ kind: z.literal('material_text'), ...material, page: z.number().int().positive().optional(),
    start: z.number().int().nonnegative(), end: z.number().int().positive(), quote: z.string().min(1).max(8000) }).strict(),
  z.object({ kind: z.literal('material_page'), ...material, page: z.number().int().positive(),
    description: z.string().min(1).max(2400).describe('Describe the problem from the actual page image obtained. This is assistant paraphrase; the original image remains available.') }).strict(),
]);
export const studyPacketInput = z.object({
  kind: z.enum(['question', 'hint', 'explanation', 'example', 'practice']),
  title: z.string().min(1).max(120).optional(),
  text: z.string().min(1).max(8000).describe('Teaching content actually provided this time, supporting Markdown and mathematics. small_hint gives only one useful advance without hiding later solution steps in the same passage.'),
  nextMove: z.string().min(1).max(800).describe('A small next thought, writing move or question. When the user asks for a direct explanation, a natural understanding check is welcome without forcing an exam.'),
  supports: z.array(studyCitationSchema).max(8).optional().describe('Other original words or material excerpts actually read and used in this teaching. General model knowledge is not a private source.'),
  exploration: explorableStudySchema.optional().describe('Optional interactive explanation on the same sheet, limited to finite quadratic relations a*x²+b*x+c. packet.text first provides a self-contained explanation and observation clues. Then the user can change declared coefficients or move x to see height and local slope together. Store no second explanation and prefill no answer beyond the current hint depth. This is not a general simulator; use ordinary explanation or research outside its scope. Changed values are temporary hypotheses, not personal facts or mastery.'),
}).strict();
const target = { id, expectedRevision: z.number().int().positive(), source: studyCitationSchema };
export const studyCompanionInput = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('open'), matterId: id, expectedMatterRevision: z.number().int().positive(),
    source: studyCitationSchema, title: z.string().min(1).max(160), problem: studyProblemInput,
    mode: studyModeSchema, attempt: studyCitationSchema.optional(), focus: z.string().min(1).max(800),
    nextStart: z.string().min(1).max(800), packet: studyPacketInput.optional() }).strict(),
  z.object({ operation: z.literal('read'), id: id.optional(), matterId: id.optional(),
    offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(12).optional(),
    historyOffset: z.number().int().nonnegative().optional(), historyLimit: z.number().int().min(1).max(8).optional() }).strict(),
  z.object({ operation: z.literal('respond'), ...target, mode: studyModeSchema.optional(),
    problem: studyProblemInput.optional().describe('When the problem points to the wrong source or the user corrects it, update its source on the same study sheet. Do not duplicate the object or edit the original note. Preserve the real sources of earlier help.'),
    attempt: studyCitationSchema.optional(), packet: studyPacketInput.optional(),
    focus: z.string().min(1).max(800).optional(), nextStart: z.string().min(1).max(800).optional() }).strict(),
  z.object({ operation: z.literal('park'), ...target, nextStart: z.string().min(1).max(800) }).strict(),
  z.object({ operation: z.literal('close'), ...target, note: z.string().max(800).optional() }).strict(),
]);
export type StudyCompanionInput = z.infer<typeof studyCompanionInput>;
export interface StudyOrigin {
  kind: 'evidence' | 'note' | 'material_text' | 'material_page';
  sourceId: string;
  eventId?: string;
  contentVersion?: number;
  start?: number;
  end?: number;
  resourceId?: string;
  sha256?: string;
  page?: number;
  crop?: { x: number; y: number; width: number; height: number } | null;
  name?: string;
  note?: NoteSourceProof;
  interpretation?: 'original_excerpt' | 'assistant_page_description';
  read: { tool: string; arguments: Record<string, unknown> };
}
export interface StudyCompanionView {
  id: string;
  revision: number;
  matterId: string;
  title: string;
  status: 'active' | 'parked' | 'closed';
  mode: StudyMode;
  focus: string;
  problem: { display: string; origin: StudyOrigin };
  bookmark?: SourceBookmarkPreview;
  attempts: { id: string; text: string; origin: 'user_report'; source: WorkSourceRef; receivedAt: string }[];
  steps: { id: string; kind: z.infer<typeof studyPacketInput>['kind']; title?: string;
    text: string; origin: 'assistant_generated'; nextMove: string; mode: StudyMode; providedAt: string;
    problemScope?: 'current_problem' | 'prior_problem' | 'unverified_legacy_problem';
    exploration?: ExplorableStudySpec }[];
  currentStep?: StudyCompanionView['steps'][number];
  historyCoverage: { attempts: { returned: number; total: number }; steps: { returned: number; total: number };
    nextOffset: number | null; read?: { tool: 'study_companion'; arguments: Record<string, unknown> } };
  nextStart: string;
  stopPoint?: { text: string; at: string };
  closure?: { text: string; at: string };
  sourceBinding: WorkSourceBinding;
  interaction: { actions: { id: string; label: string; request: string }[];
    meaning: string };
  updatedAt: string;
  meaning: string;
}
