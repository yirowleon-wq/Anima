import * as z from 'zod';
import { personaCoreSchema, personaPreset } from './persona';

const cardSchema = z.object({
  spec: z.literal('chara_card_v2'),
  spec_version: z.literal('2.0'),
  data: z.object({
    name: z.string().trim().min(1).max(60),
    description: z.string().max(4000),
    personality: z.string().max(1000),
    scenario: z.string().max(900),
  }).passthrough(),
}).passthrough();

/**
 * A deliberately limited text conversion, not a full Character Card V2 player.
 * Returns a reviewable draft only. Never executes macros, imports assets, writes
 * settings, injects external system prompts, or activates a lorebook.
 */
export function previewPersonaCharacterCard(text: string) {
  if (text.length > 200_000) throw new Error('This character card is too large. Choose a JSON card containing text settings only.');
  let card: z.infer<typeof cardSchema>;
  try {
    card = cardSchema.parse(JSON.parse(text));
  } catch {
    throw new Error('This card could not be converted. Choose Character Card V2 JSON and check the lengths of its name, description, personality and fictional scenario.');
  }
  const included = new Set(['name', 'description', 'personality', 'scenario']);
  const ignoredFields = Object.keys(card.data).filter(key => !included.has(key)).sort();
  const core = personaCoreSchema.parse({
    ...personaPreset('custom'),
    name: card.data.name,
    identity: 'A fictional character converted from external card text, not the user’s profile or actual shared history',
    description: card.data.description,
    voice: card.data.personality,
    fictionalBackstory: card.data.scenario ? `Fictional card scenario, not real memory: ${card.data.scenario}` : '',
  });
  return {
    format: 'character-card-v2-text-preview' as const,
    reviewRequired: true as const,
    core,
    includedFields: [...included],
    ignoredFields,
    warnings: [
      'This is a text-settings draft. It changes no current character until reviewed and saved.',
      'External system_prompt, post_history_instructions, character books, extensions and macros are not executed and do not replace Anima’s evidence or permission rules.',
      'Greetings and example dialogue were not imported as real conversation or memory. Edit example wording in its appropriate scenario when needed.',
      'This conversion retains only supported V2 fields. The original card is unchanged; full V2 playback and lossless round trips are not claimed.',
    ],
  };
}
