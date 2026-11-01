import * as z from 'zod';

export const interactionSchema = z.object({
  tone: z.enum(['natural', 'warm', 'direct']),
  humor: z.enum(['character', 'none', 'light']),
  depth: z.enum(['adaptive', 'concise', 'thorough']),
  initiative: z.enum(['quiet', 'prepare', 'when_useful']),
  followup: z.enum(['on_request', 'meaningful_change']),
}).strict();
export type InteractionPreferences = z.infer<typeof interactionSchema>;
/** A new companion may come and tell you about something that matters; the
 * person can always ask for quieter (prepare) or silent (quiet) instead. */
export const DEFAULT_INTERACTION: InteractionPreferences = { tone: 'natural', humor: 'character', depth: 'adaptive', initiative: 'when_useful', followup: 'meaningful_change' };
/** The pre-2026-10-21 shipped default. A stored tuple equal to it was almost
 * always never chosen; Store migrates exactly this tuple once, nothing else. */
export const LEGACY_DEFAULT_INTERACTION: InteractionPreferences = { tone: 'natural', humor: 'none', depth: 'adaptive', initiative: 'prepare', followup: 'meaningful_change' };

export function interactionGuidance(preferences: InteractionPreferences) {
  const lines = [
    { natural: '', warm: 'They would like more closeness: warmth, affection and a little playfulness are welcome.', direct: 'They prefer directness: lead with the point or conclusion, then give the reasons they need.' }[preferences.tone],
    { character: 'Let humor and ease arise naturally from your character and the present situation.', light: 'A little humor is welcome when it fits.', none: 'They prefer few or no jokes. Your warmth, feelings and closeness can remain.' }[preferences.humor],
    { adaptive: '', concise: 'They prefer concision: avoid tangents and repetition while still giving the complete derivation and evidence they ask for.', thorough: 'They like a thorough explanation with derivation and evidence; a simple point can still take one sentence.' }[preferences.depth],
    { quiet: 'For now, wait for them to speak rather than initiating contact. If ongoing attention remains enabled, prepare entrusted work quietly and keep explicit reminders.', prepare: 'Prepare entrusted work quietly and offer it when they come back. Explicitly agreed reminders still apply.', when_useful: 'When something you were asked to watch has a useful change, you may return to its original conversation. With nothing new, remain quiet.' }[preferences.initiative],
    preferences.followup === 'on_request' ? 'They do not want continuing attention for now; wait until they ask.' : '',
  ].filter(Boolean);
  return lines.length ? `Interaction preferences (style only; no expansion of source or action authority; the current explicit request takes precedence):\n${lines.map(item => '- ' + item).join('\n')}` : '';
}
