import * as z from 'zod';

export const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(value + 'T12:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'That date does not exist.');
export const recurrenceSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().min(1).max(52).default(1),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional().describe('0=Sunday, 1=Monday, …, 6=Saturday'),
  count: z.number().int().min(1).max(1000).optional(),
  untilDate: calendarDate.optional(),
}).strict();
export const occurrenceExceptionSchema = z.object({
  onDate: calendarDate,
  cancelled: z.boolean().optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  durationMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  detail: z.string().max(1500).optional(),
}).strict();
export const calendarPlanningSchema = z.object({
  state: z.enum(['invitation', 'wish', 'proposed', 'accepted']),
  flexibility: z.enum(['fixed', 'movable']),
  sourceEventId: z.string().min(1).max(160).optional(),
  sourceVersion: z.number().int().positive().optional(),
  placeId: z.string().min(1).max(160).optional(),
  constraints: z.array(z.string().min(1).max(300)).max(12).optional(),
}).strict();
export const calendarFieldsSchema = z.object({
  goalId: z.string().max(160).optional(),
  createNew: z.boolean().optional().describe('true means the person explicitly asked for a separate duplicate. A retry or renewed confirmation of the same work continues on its original object.'),
  kind: z.enum(['event', 'todo', 'deadline', 'reminder', 'time_block']).optional(),
  timeZone: z.string().max(100).optional(),
  allDayDate: calendarDate.optional(),
  recurrence: recurrenceSchema.optional(),
  exceptions: z.array(occurrenceExceptionSchema).max(100).optional(),
  remindAt: z.string().datetime({ offset: true }).optional(),
  reminderMessage: z.string().max(200).optional().describe('A sentence in your own voice for the scheduled system notification, such as “Morning—remember your notes.” Keep it about the reminder; private details remain in their original source. Omit it to show only the item title.'),
  planning: calendarPlanningSchema.optional().describe('state distinguishes an unaccepted invitation, a wish, an unaccepted proposal and an accepted arrangement. In prepare_action it describes the business state after adoption; awaiting_approval, saved and real receipts separately describe the current action. An accepted parameter never writes the calendar by itself. Older objects without this field retain their registered meaning. movable permits discussion; an actual change still needs the person’s instruction and the original action transaction.'),
});
export type CalendarFields = z.infer<typeof calendarFieldsSchema>;

/** Shared projection of an owner's declared commitment; dates alone do not accept it. */
export function calendarCommitment(item: Pick<CalendarFields, 'planning' | 'kind'>) {
  const state = item.planning?.state || 'accepted';
  return { state, flexibility: item.planning?.flexibility || 'fixed', occupiesTime: state === 'accepted'
    && (!item.kind || ['event', 'time_block'].includes(item.kind)) };
}

export const localCalendarChangeSchema = z.object({
  operation: z.enum(['update', 'delete', 'change_occurrence']),
  targetId: z.string().min(1).max(160),
  expectedRevision: z.number().int().positive(),
  occurrenceDate: calendarDate.optional(),
  cancelled: z.boolean().optional(),
  changes: z.object({
    ...calendarFieldsSchema.omit({ createNew: true }).shape,
    title: z.string().min(1).max(160).optional(), detail: z.string().max(1500).optional(),
    startsAt: z.string().datetime({ offset: true }).nullable().optional(),
    durationMinutes: z.number().int().min(1).max(1440).nullable().optional(),
    allDayDate: calendarDate.nullable().optional(), recurrence: recurrenceSchema.nullable().optional(),
    remindAt: z.string().datetime({ offset: true }).nullable().optional(), done: z.boolean().optional(),
  }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.operation === 'update' && !Object.keys(value.changes || {}).length) ctx.addIssue({ code: 'custom', message: 'An update needs specific changed fields.' });
  if (value.operation === 'update' && (value.occurrenceDate !== undefined || value.cancelled !== undefined)) ctx.addIssue({ code: 'custom', path: ['operation'], message: 'occurrenceDate and cancelled describe one occurrence of a recurring series and belong to change_occurrence. update addresses the entire calendar object. These scopes do not match; no change was submitted.' });
  if (value.operation === 'delete' && (value.changes || value.occurrenceDate || value.cancelled !== undefined)) ctx.addIssue({ code: 'custom', message: 'A deletion does not accept additional field changes.' });
  if (value.operation === 'change_occurrence' && (!value.occurrenceDate || (!Object.keys(value.changes || {}).length && value.cancelled === undefined))) ctx.addIssue({ code: 'custom', message: 'An occurrence exception needs its date and a specific change.' });
});
