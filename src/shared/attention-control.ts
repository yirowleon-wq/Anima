import * as z from 'zod';

const id = z.string().min(1).max(160);
const sourceNames: Record<string, string> = {
  'campus:local': 'Imported campus records', 'campus:academic-account': 'Imported academic records',
  'map:local': 'Campus map', 'weather:open-meteo': 'Weather forecast', 'current': 'Content provided this turn',
  'web:public': 'Public web pages', 'local-agenda': 'Local calendar', 'notes:self': 'Your notes',
  'history:self': 'Past conversations', 'profile:self': 'Understanding about you', 'work:self': 'Shared work',
};
export const attentionSourceName = (source: string) => sourceNames[source] || (source.startsWith('file:') ? 'Your attached file' : 'Other permitted sources');
export const attentionListInput = z.object({
  cursor: z.string().min(1).max(1024).optional(),
  limit: z.number().int().min(1).max(50).default(20),
}).strict();
export const attentionChangeInput = z.object({
  id,
  expectedRevision: z.number().int().positive(),
  expectedControlVersion: z.string().regex(/^[a-f0-9]{64}$/),
  operation: z.enum(['pause', 'resume', 'stop', 'revise']),
  ruleId: id.optional(),
  ruleRevision: z.number().int().positive().optional(),
  changes: z.object({
    sources: z.array(id).min(1).max(8),
    until: z.string().datetime({ offset: true }).nullable(),
  }).strict().optional(),
}).strict().superRefine((value, context) => {
  if (value.operation === 'resume' ? !value.ruleId || !value.ruleRevision : value.ruleId !== undefined || value.ruleRevision !== undefined)
    context.addIssue({ code: 'custom', message: 'Choose the pause you want to lift.' });
  if (value.operation === 'revise' ? !value.changes : value.changes !== undefined)
    context.addIssue({ code: 'custom', path: ['changes'], message: 'Keep the selected sources and end time when changing this agreement.' });
});

/** Native private controls only. No original quote, model context, or prepared body. */
export interface AttentionControlItem {
  id: string;
  title: string;
  sessionId?: string;
  revision: number;
  controlVersion: string;
  status: 'active' | 'paused' | 'ended' | 'expired' | 'unavailable';
  sources: string[];
  sourceBoundary: string[];
  until: string | null;
  channel: 'in_app' | 'local_notification';
  pauseRules: { id: string; revision: number; until: string | null; resumable: boolean }[];
  canPause: boolean;
  canStop: boolean;
  canRevise: boolean;
  availableSources: string[];
  /** A derived mandate cannot extend past its still active parent. */
  maximumUntil: string | null;
  unavailableReason?: 'source_permission' | 'parent_inactive' | 'permission_retracted';
}
export interface AttentionControlPage { items: AttentionControlItem[]; nextCursor: string | null }
export type AttentionListInput = z.input<typeof attentionListInput>;
export type AttentionChangeInput = z.infer<typeof attentionChangeInput>;
