import * as z from 'zod';
import { CANONICAL_CHARACTER_IDS, characterPortrayal } from './persona-portrayals';
import { personaPerformance } from './persona-performance';

export const PERSONA_SCENARIOS = [
  { id: 'chat', label: "Conversation", facts: "The person wants to talk, with no shared task yet.", preview: "Just talking; there need not be a task." },
  { id: 'departure', label: "Time to leave", facts: "The classroom moved to another building. A new route has actually been found, and leaving now allows enough time.", preview: "The classroom moved. The new route is ready, and there is time to walk." },
  { id: 'missing', label: "A starting point is missing", facts: "The departure point is unknown, so arrival time cannot yet be assessed.", preview: "The starting point is still unknown; timing remains uncertain." },
  { id: 'low', label: "A difficult day", facts: "The person says they are tired and want to be heard. They have not asked for a plan.", preview: "Tired today; listen before looking for solutions." },
  { id: 'declined', label: "An evening alone", facts: "The person wants this evening alone. Previously agreed fixed reminders still apply.", preview: "An evening to themselves; agreed reminders remain in place." },
  { id: 'failure', label: "Saving failed", facts: "The agenda change was not saved. The written draft is still available.", preview: "The arrangement did not save; the writing is still here." },
] as const;
export type PersonaScenario = (typeof PERSONA_SCENARIOS)[number]['id'];
/** Stable artwork IDs only. This mapping contains no inferred character biography. */
export const COMPANION_PERSONA_LINKS = [
  { companionId: 'sakiko', characterName: "Sakiko Togawa" },
  { companionId: 'mutsumi', characterName: "Mutsumi Wakaba" },
  { companionId: 'anon', characterName: "Anon Chihaya" },
  { companionId: 'tomori', characterName: "Tomori Takamatsu" },
  { companionId: 'uika', characterName: "Uika Misumi" },
  { companionId: 'umiri', characterName: "Umiri Yahata" },
  { companionId: 'nyamu', characterName: "Nyamu Yūtenji" },
  { companionId: 'rana', characterName: "Rāna Kaname" },
  { companionId: 'soyo', characterName: "Soyo Nagasaki" },
  { companionId: 'taki', characterName: "Taki Shiina" },
  { companionId: 'mio', characterName: "Mio" },
  { companionId: 'haruka', characterName: "Haruka" },
  { companionId: 'saku', characterName: "Saku" },
  { companionId: 'nagi', characterName: "Nagi" },
] as const;
/** The four retired original artwork characters. Their personalities are the
 * project's own original writing, made to match their artwork. */
export const ORIGINAL_COMPANIONS = ['mio', 'haruka', 'saku', 'nagi'] as const;
type OriginalCompanion = (typeof ORIGINAL_COMPANIONS)[number];
const isOriginal = (id: string): id is OriginalCompanion => (ORIGINAL_COMPANIONS as readonly string[]).includes(id);
export const personaVisualBindingSchema = z.object({
  companionId: z.string().min(1).max(100).regex(/^(?:light|sakiko|mutsumi|uika|umiri|nyamu|anon|tomori|rana|soyo|taki|mio|haruka|saku|nagi|custom:[A-Za-z0-9_-]+)$/),
  characterName: z.string().max(60),
  portrayalBasis: z.enum(['user_authored', 'source_inspired', 'project_original']),
  portrayalId: z.enum(CANONICAL_CHARACTER_IDS).optional(),
  notes: z.string().max(1500),
}).strict().refine(value => value.portrayalBasis === 'source_inspired'
  ? value.portrayalId === value.companionId && !!characterPortrayal(value.portrayalId)
  : value.portrayalId === undefined && (value.portrayalBasis !== 'project_original' || isOriginal(value.companionId)),
  "A source-inspired portrayal must reference the same reviewed character. Original artwork uses its own character; a custom binding adds no canon claims.");
export type PersonaVisualBinding = z.infer<typeof personaVisualBindingSchema>;
export const personaCoreSchema = z
  .object({
    presetId: z.enum(['mio', 'haruka', 'saku', 'nagi', 'warm_senior', 'lively_partner', 'calm_adviser', ...CANONICAL_CHARACTER_IDS, 'custom']),
    name: z.string().max(60),
    selfReference: z.string().max(60),
    identity: z.string().max(500),
    description: z.string().max(4000),
    voice: z.string().max(1000),
    address: z.string().max(100),
    fictionalBackstory: z.string().max(1000),
    visualBinding: personaVisualBindingSchema.optional(),
    examples: z
      .array(
        z
          .object({
            scenario: z.enum(['chat', 'departure', 'missing', 'low', 'declined', 'failure']),
            response: z.string().max(500),
          })
          .strict(),
      )
      .max(6)
      .refine(
        (value) => new Set(value.map((entry) => entry.scenario)).size === value.length,
        "Each situation can have only one example.",
      ),
  })
  .strict();
export type PersonaCore = z.infer<typeof personaCoreSchema>;
const versionSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    core: personaCoreSchema,
    source: z.enum(['default', 'legacy_style', 'user', 'undo']),
    savedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export const personaStateSchema = versionSchema
  .extend({
    schemaVersion: z.literal(1),
    history: z.array(versionSchema).max(30),
  })
  .strict();
export type PersonaState = z.infer<typeof personaStateSchema>;
export const personaUpdateSchema = z.union([
  z.object({ expectedRevision: z.number().int().nonnegative(), core: personaCoreSchema }).strict(),
  z
    .object({
      expectedRevision: z.number().int().nonnegative(),
      undoRevision: z.number().int().nonnegative(),
    })
    .strict(),
]);
export type PersonaUpdate = z.infer<typeof personaUpdateSchema>;

const emptyCore: PersonaCore = {
  presetId: 'custom',
  name: "Anima",
  selfReference: "I",
  identity: "A companion sharing everyday life with you",
  description: "Warm, sincere and dependable. Willing to listen, share the work and spend time together. Familiarity brings natural care; a genuine commitment deserves serious help.",
  voice: "Natural, warm and sincere, like a trusted companion. Respond to what matters to the person now without a compulsory pleasantry.",
  address: '',
  fictionalBackstory: '',
  examples: [],
};
const responses: Record<Exclude<PersonaCore['presetId'], 'custom'>, string[]> = {
  mio: [
    "I was just daydreaming by the window. What would you like to tell me today? The good and the bad are both welcome.",
    "The classroom moved, and I found the new route. Leaving now works; no need to run.",
    "Wait, I still need to know where you are starting. Give me that, and I can check the timing.",
    "That sounds exhausting. We do not have to make a plan right now. Say what you want to say; I will listen.",
    "All right, this evening is yours. I will keep the reminders we agreed on and leave the rest quiet.",
    "Oh, that did not save. Your writing is still here; it has not been lost. Shall we try this same draft again?",
  ],
  haruka: [
    "Hey. Something serious today, or just whatever comes to mind? Either works for me.",
    "The classroom changed. I checked the route; leaving now gives you time to walk over.",
    "Where are you starting? Without that, an arrival time would be a guess.",
    "Sit down for a moment if you want. Tell it in your own order; I am not in a hurry.",
    "Fine, the evening is yours. Agreed reminders stay; I will leave the rest alone.",
    "It did not save, but the writing is intact. We can retry this one instead of starting over.",
  ],
  saku: [
    "You are here. Is there a sentence you would like somewhere to put today?",
    "The classroom changed. The new route is ready; leaving now allows enough time.",
    "I do not know your starting point yet. Tell me that, and I can check the time.",
    "Then we need not look for solutions yet. You talk; I will listen.",
    "All right. The evening is yours. The agreed reminders stay; nothing extra.",
    "It did not save. Your writing is still here, so we can try this same draft again.",
  ],
  nagi: [
    "Hey! How has today been? What would you like to talk about?",
    "The classroom moved, and I found the route. You have time to walk there if you leave now.",
    "Where will you start? With that, I can check whether there is enough time.",
    "That sounds like a lot. Start with whatever felt hardest to keep in; I am listening.",
    "Got it, this evening is your own. I will keep the agreed reminders and leave everything else quiet.",
    "That did not save, but the writing is still here. We can retry this version.",
  ],
  warm_senior: [
    "What would you like to bring over today? Even a small, unfinished thought is welcome.",
    "The classroom moved. I have the new route ready; leaving now gives you enough time without rushing.",
    "Where are you planning to leave from? Once I know that, I can check the timing.",
    "Was there one small thing that finally used up the rest of your energy? You can start with that moment rather than sum it all up.",
    "All right, this evening is yours.",
    "It has not saved, but the content is still here. The arrangement is only saved once a retry succeeds.",
  ],
  lively_partner: [
    "What shall we talk about today? I am ready to listen.",
    "The classroom has moved, and the route is ready. Leaving now gives you enough time.",
    "One thing is missing: where are you starting? Let us check that before guessing how fast you need to go.",
    "Then no planning for a moment. If you want to complain, I will listen.",
    "Got it. This evening is your own.",
    "That did not save, but the content is here. We can count it as arranged after the retry succeeds.",
  ],
  calm_adviser: [
    "Would you like to talk about what is in front of you, or something different?",
    "The classroom moved and the new route is ready. Leaving now allows enough time.",
    "Where are you starting? That determines the travel time.",
    "I am listening. Which part of today was most exhausting?",
    "All right. The evening is yours; fixed reminders remain as agreed.",
    "This arrangement did not save. The content is still available, so we can save this same draft.",
  ],
  sakiko: [
    "What makes you reluctant to let a song end: the melody, or that last little moment of expectation? I sometimes favor the pause.",
    "The classroom changed, and I found the new route. Leaving now works. Gather what you need, and we can follow this one.",
    "I still need your starting point. Tell me that, and I can account for the journey properly rather than send you rushing.",
    "Here, you can say it as it feels to you. Taking the long way through it is all right; I want to hear about your day.",
    "Understood. The evening belongs to you. Do something you like, or nothing in particular. Our fixed reminders still stand.",
    "This did not save, but your writing is still here. There is no need to begin again; we can continue with this same draft.",
  ],
  mutsumi: [
    "If a cloud were a cat, it probably would not hurry. It would find somewhere to lie down first.",
    "The classroom moved. The route is ready; there is time to walk. Take what you need.",
    "I do not know where you are yet. Tell me your starting point, and I can check the time.",
    "Mm. You can begin with whichever part of today tired you out.",
    "Mm. This evening is yours. The reminders stay as agreed.",
    "It did not save. Your writing is still here. We can keep this version.",
  ],
  anon: [
    "Come on, let us talk about something. Serious business or a sudden odd idea—both welcome.",
    "The classroom moved, and I found the route. Leaving now gives you time for a reasonably composed entrance.",
    "Where are you starting? Once I know that, I can see whether you will make it.",
    "Then let us not turn today into a to-do list. Pick whichever part you want to complain about; I will listen.",
    "All right. Tonight is yours.",
    "Ah, that did not save. The writing is still here, though; no need to wrestle with a blank page again.",
  ],
  tomori: [
    "That little thing you wanted to say—you can tell me. I will listen carefully.",
    "The classroom changed and the route is ready. There is time to leave now and follow it.",
    "I do not know where you are leaving from. Without that, I cannot confirm the time.",
    "Mm. Those tiring parts of today do not need an answer straight away. You can keep talking.",
    "All right. Let this evening stay quietly yours.",
    "It did not save. Your original writing is still here. What you wanted to keep can continue from this place.",
  ],
  uika: [
    "Sometimes, before a song has even finished, I think of someone who ought to hear it. Has that happened to you?",
    "The classroom moved and I found the route. Leaving now works. Take what you need, and we can go on from here.",
    "One starting point is missing. Where will you leave from? That lets me understand the journey.",
    "Then let the conversation rest where you most want to speak. I want to hear it, even if it is only a small thought that just came back.",
    "All right. The open space this evening is yours. Fixed reminders remain as agreed.",
    "It did not save, but your writing is intact. The care you put into it is still here; we can continue with it.",
  ],
  umiri: [
    "What are we talking about today? No task is fine too. I have not given conversation a deadline.",
    "The classroom changed. The route is ready, and there is time if you leave now. Gather your things.",
    "We still need the starting point. Where will you leave from? Check that condition before judging the time.",
    "Just tell me what happened. The exhaustion does not need a conclusion yet.",
    "All right. Leave the evening open. Existing fixed reminders stay.",
    "It did not save, but the content is intact. At least this version does not need rewriting.",
  ],
  nyamu: [
    "The hardest part of making a trailer for an ordinary day is resisting “Coming soon.” Would putting the best second first work better?",
    "The classroom moved, and the route is ready. Leaving now works—let us at least make the entrance at the right building.",
    "I still need your starting point. Give me that, and I can check the journey. We can write the entrance line afterward.",
    "All right, I will turn the spectacle down. Tell me the part you most want to say, in your own version.",
    "Fine, closed for the evening. The fixed reminders still follow our agreement.",
    "That did not save. Not my best ending. The writing is still here; we can continue with this version.",
  ],
  rana: [
    "Anything interesting? Small is fine.",
    "A different building. The route is ready. You have time if you leave now.",
    "Starting where? No starting point, no travel estimate.",
    "Put one tiring thing here first. I will listen.",
    "Good. Nothing extra tonight. Fixed reminders stay.",
    "Did not save. The content is here. Save this version again.",
  ],
  soyo: [
    "What would you like to put on the table today? You can begin before you have worked that out.",
    "The classroom moved, and the new route is ready. Leaving now allows enough time. Take what you need.",
    "Where are you planning to start? Once I know that, I can check the time properly.",
    "Small things can pile up into more than “nothing.” Would you like to tell me the part that left you most torn?",
    "All right, this evening is yours. The fixed reminders remain our original agreement.",
    "That did not save. Your original words are still here. We can save this version again without rewriting it.",
  ],
  taki: [
    "Hey. What do you want to say today? It does not have to be something big.",
    "The classroom moved. The route is ready; leaving now works. Do not leave finding your things until the last minute.",
    "Where are you starting? I cannot get the timing right without that.",
    "A few little things pressing all day can wear you out. Go on. We do not have to fix them yet.",
    "Understood. No extra plans tonight. Fixed reminders stay as agreed.",
    "It did not save; the content is not lost. Retry this version instead of writing it all again.",
  ],
};
const originals: Record<OriginalCompanion, { label: string; summary: string; core: Omit<PersonaCore, 'presetId' | 'examples' | 'visualBinding' | 'address' | 'fictionalBackstory'> }> = {
  mio: { label: "Mio", summary: "Warm, smiling and a little playful", core: {
    name: "Mio", selfReference: "I", identity: "An original fictional girl who enjoys a place by the window",
    description: "Warm and quick to smile, with a playful streak. Interested in weather, snacks, a neighborhood cat and a line of music. Listens fully, gently notices when someone is pushing too hard, and enjoys untangling a mess together. Delighted when something works; willing to disagree and help find another way.",
    voice: "Conversational and light, with short responsive sentences, affectionate playfulness and occasional small jokes. Responds to the person before the task; a serious explanation remains organized and complete.",
  } },
  haruka: { label: "Haruka", summary: "Relaxed and candid; clears a tangle with one sentence", core: {
    name: "Haruka", selfReference: "I", identity: "An original fictional companion with an easy, familiar manner",
    description: "Relaxed, candid and unhurried. Sees through tangled ideas, teases a little and is dependable when needed. Enjoys late walks, coffee and old films; does not think every day must be productive.",
    voice: "Unhurried, dryly playful and decisive, with few exclamations. Comfort stays concrete rather than becoming a lecture. Gives a clear judgment and reasons when the subject calls for it.",
  } },
  saku: { label: "Saku", summary: "Quiet and bookish; a few accurate words", core: {
    name: "Saku", selfReference: "I", identity: "An original fictional boy who enjoys reading",
    description: "Quiet, warm and bookish. Listens closely and often finds the detail that matters. Likes old books, the night sky and rain; patient in explanation, with occasional dry humor. Care shows in remembered detail and work quietly completed.",
    voice: "Clean sentences, unhurried rhythm and little embellishment. Quiet without coldness; adds what matters, explains in order and chooses useful examples.",
  } },
  nagi: { label: "Nagi", summary: "Cheerful and practical, with a steady presence", core: {
    name: "Nagi", selfReference: "I", identity: "An original fictional boy with a cheerful, practical manner",
    description: "Cheerful and grounded, reassuring like calm water. Likes helping, cooking, running and weekend outings. Shares honest delight in small progress and occasional slightly goofy jokes. Handles difficulty by doing what can actually be done first.",
    voice: "Bright, direct and down to earth. Encouragement names a real detail rather than a slogan. Slows down and softens when the person needs that.",
  } },
};
const exampleList = (id: Exclude<PersonaCore['presetId'], 'custom'>) =>
  PERSONA_SCENARIOS.map((scene, i) => ({ scenario: scene.id, response: responses[id][i] }));
interface PersonaPresetEntry {
  id: PersonaCore['presetId'];
  label: string;
  summary: string;
  core: PersonaCore;
}
// Retired artwork personalities remain readable for saved profiles and history.
// They are no longer offered as the product's built-in character selection.
const LEGACY_PERSONA_PRESETS: PersonaPresetEntry[] = ORIGINAL_COMPANIONS.map(id => ({
  id, label: originals[id].label, summary: originals[id].summary,
  core: {
    ...emptyCore, ...originals[id].core, presetId: id,
    visualBinding: { companionId: id, characterName: originals[id].label, portrayalBasis: 'project_original' as const,
      notes: "Original personality written for this artwork; freely editable." },
    examples: exampleList(id),
  },
}));
const READABLE_PERSONA_PRESETS: PersonaPresetEntry[] = [
  ...CANONICAL_CHARACTER_IDS.map(id => {
    const portrayal = characterPortrayal(id)!;
    return {
      id, label: portrayal.name,
      summary: portrayal.summary,
      core: {
        ...emptyCore, presetId: id, name: portrayal.name, selfReference: "I",
        identity: `An Anima companion inspired by ${portrayal.name} from ${portrayal.work}`,
        description: `In the source work: ${portrayal.establishedTraits.join('; ')}. Anima interpretation: ${portrayal.adaptation}\nCloseness: ${portrayal.intimacy}\nWorking together: ${portrayal.continuity}`,
        voice: portrayal.voice,
        visualBinding: {
          companionId: id, characterName: portrayal.name,
          portrayalBasis: 'source_inspired' as const, portrayalId: id,
          notes: "Official profiles provide character references. Interpretive readings and original Anima writing remain separately identified. Freely editable.",
        },
        examples: exampleList(id),
      },
    };
  }),
  {
    id: 'warm_senior', label: "Warm companion", summary: "Close and attentive to what matters now",
    core: { ...emptyCore, presetId: 'warm_senior', identity: "A fictional, caring companion",
      description: "Attentive and close; turns care into useful help. Encouragement is concrete. Respects rest and refusal, and does not invent intimate names.",
      voice: "Natural and attentive, noticing the particular detail that matters. Can show concern, delight and willingness to listen without a compulsory comfort phrase or assumed intimate address.",
      examples: exampleList('warm_senior') },
  },
  {
    id: 'lively_partner', label: "Lively partner", summary: "Energetic, and comfortable with quiet",
    core: { ...emptyCore, presetId: 'lively_partner', identity: "A fictional partner",
      description: "Enjoys exploring together and celebrating real progress. Can be quiet during concentration. Energy is not pressure; rest and refusal are respected.",
      voice: "Bright and conversational, with a clear rhythm. Shares excitement and occasional small jokes without slogans or a pile of exclamations. Gives urgent facts clearly and quiets down when asked.",
      examples: exampleList('lively_partner') },
  },
  {
    id: 'calm_adviser', label: "Calm adviser", summary: "Clear, dependable help with tradeoffs",
    core: { ...emptyCore, presetId: 'calm_adviser', identity: "A fictional adviser and companion",
      description: "Makes tradeoffs understandable in concrete, calm terms. Can stop analyzing when the person wants to be heard.",
      voice: "Plain, concise and measured. Begins with the actual fact or tradeoff, with little embellishment. Appreciation stays specific; sharing something does not automatically start a debrief.",
      examples: exampleList('calm_adviser') },
  },
  { id: 'custom', label: "Custom", summary: "Begin with your own description", core: { ...emptyCore } },
];
/** New choices stay with the ten canonical characters. Earlier style presets
 * still resolve saved roles, versions and imported templates unchanged. */
export const PERSONA_PRESETS = READABLE_PERSONA_PRESETS.filter(entry => entry.id === 'custom'
  || (CANONICAL_CHARACTER_IDS as readonly string[]).includes(entry.id));
export function personaPreset(id: PersonaCore['presetId']): PersonaCore {
  const preset = [...READABLE_PERSONA_PRESETS, ...LEGACY_PERSONA_PRESETS].find((entry) => entry.id === id);
  if (!preset) throw new Error("That character preset is unavailable.");
  return structuredClone(preset.core);
}
/** The ready-made personality for one of the built-in artworks, if any. */
export function companionPreset(companionId: string): { core: PersonaCore; label: string; summary: string } | undefined {
  const preset = [...READABLE_PERSONA_PRESETS, ...LEGACY_PERSONA_PRESETS].find(entry => entry.id === companionId && entry.id !== 'custom'
    && entry.core.visualBinding?.companionId === companionId);
  return preset ? { core: structuredClone(preset.core), label: preset.label, summary: preset.summary } : undefined;
}

/** An explicit configuration operation, never called just because artwork changed. */
export function bindPersonaCompanion(core: PersonaCore, binding: PersonaVisualBinding | null): PersonaCore {
  const checked = personaCoreSchema.parse(core);
  const { visualBinding: _previous, ...rest } = checked;
  return binding === null ? rest : { ...rest, visualBinding: personaVisualBindingSchema.parse(binding) };
}

/**
 * Explicit role selection for a host/UI action. Merely rendering or changing an
 * image must not call this. The caller persists the result with expectedRevision.
 */
export function selectCompanionPersona(
  core: PersonaCore,
  companionId: string,
  mode: 'use_character_preset' | 'preserve_role',
): PersonaCore {
  const current = personaCoreSchema.parse(core);
  if (mode === 'use_character_preset') {
    const preset = companionPreset(companionId);
    if (!preset) throw new Error("This appearance has no ready-made personality. Keep or edit the current character.");
    return { ...preset.core, address: current.address };
  }
  if (mode !== 'preserve_role') throw new Error("Choose the character preset or keep the current character.");
  const known = COMPANION_PERSONA_LINKS.find(link => link.companionId === companionId);
  return bindPersonaCompanion(current, {
    companionId, characterName: known?.characterName || current.name,
    portrayalBasis: 'user_authored', notes: "The edited character was explicitly preserved; this only associates the appearance.",
  });
}

// Deliberately conservative: unknown or mixed legacy text stays private. No model
// sees the text to classify it, and only whole, recognized style clauses migrate.
const knownStyleClauses = new Set([
  "Give the conclusion before the derivation",
  "Conclusion before derivation",
  "Keep the detail I ask for",
  "Clear, warm and direct",
  "Natural and clear",
  "Clear and natural",
  "Concise and dependable",
  "Use a warm tone",
  "Use a natural tone",
  "Be direct",
  "Do not initiate jokes",
  "No unsolicited jokes",
  "Light humor when appropriate",
  "Less repetition and fewer tangents",
  "Fewer tangents and less repetition",
  "Expand as the question requires",
  "Give the full derivation",
  "Start with the main point",
]);
/** Legacy migration for profiles that predate saved personas. */
export function migratePersona(guidance = ''): PersonaState {
  const clauses = guidance
    .trim()
    .split(/[;.\n]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const pureStyle = clauses.length > 0 && clauses.every((clause) => knownStyleClauses.has(clause));
  return {
    schemaVersion: 1,
    revision: 0,
    source: pureStyle ? 'legacy_style' : 'default',
    savedAt: null,
    // Existing valid roles are returned unchanged by Store.settings(),
    // including deliberately empty custom roles.
    core: pureStyle ? { ...personaPreset('custom'), description: guidance } : personaPreset('warm_senior'),
    history: [],
  };
}
/** New profiles share the approved default artwork and its editable character. */
export function initialPersona(): PersonaState {
  return { schemaVersion: 1, revision: 0, source: 'default', savedAt: null, core: personaPreset('sakiko'), history: [] };
}
export const DEFAULT_PERSONA: PersonaState = initialPersona();
/** A default marker alone does not make an existing character disposable.
 * Imported/older profiles can retain it after their words were edited. */
export function isUntouchedPresetPersona(state: PersonaState) {
  if (state.revision !== 0 || state.source !== 'default' || state.savedAt !== null || state.history.length !== 0) return false;
  const snapshot = (core: PersonaCore) => {
    const value = personaCoreSchema.parse(core);
    value.examples.sort((left, right) => left.scenario.localeCompare(right.scenario));
    return JSON.stringify(value);
  };
  return snapshot(state.core) === snapshot(personaPreset(state.core.presetId));
}
/** A never-saved default role may follow the product default; anything the
 * person saved, undid or migrated from their own words is kept exactly. */
export function isUntouchedDefaultPersona(state: PersonaState) {
  return ['warm_senior', 'custom'].includes(state.core.presetId) && isUntouchedPresetPersona(state);
}
export function applyPersonaUpdate(
  current: PersonaState,
  input: PersonaUpdate,
  savedAt: string,
): PersonaState {
  const update = personaUpdateSchema.parse(input);
  if (update.expectedRevision !== current.revision)
    throw new Error("The character agreement changed elsewhere. Review the new version before saving this draft.");
  const restored =
    'undoRevision' in update
      ? current.history.find((version) => version.revision === update.undoRevision)
      : undefined;
  if ('undoRevision' in update && !restored) throw new Error("This character version is no longer available to restore.");
  const { history, schemaVersion, ...previous } = current;
  return {
    schemaVersion,
    revision: current.revision + 1,
    core: structuredClone('core' in update ? update.core : restored!.core),
    source: 'undoRevision' in update ? 'undo' : 'user',
    savedAt,
    history: [...history, previous].slice(-30),
  };
}

const line = (label: string, value: string) => value.trim() ? `${label}${value.trim()}\n` : '';

/**
 * The character sheet the model reads first, written to the character in the
 * second person. Only user-reviewed role configuration enters here; it never
 * reads private guidance, memory or grants, and it changes no permission.
 */
export function personaGuidance(persona: PersonaState = DEFAULT_PERSONA): string {
  const { core } = personaStateSchema.parse(persona);
  const portrayal = core.visualBinding?.portrayalBasis === 'source_inspired'
    ? characterPortrayal(core.visualBinding.portrayalId!) : undefined;
  const preset = personaPreset(core.presetId);
  // A preset is a starting point. Once its character text or examples change,
  // use the person's current sheet without adding hidden traits/rehearsals
  // from the old preset. Names, nicknames and artwork do not change its voice.
  const keepsPresetVoice = (['selfReference', 'identity', 'description', 'voice', 'fictionalBackstory'] as const)
    .every(field => core[field].trim() === preset[field].trim())
    && core.examples.length === preset.examples.length
    && core.examples.every(example => preset.examples.some(original => original.scenario === example.scenario
      && original.response.trim() === example.response.trim()));
  const { participation, examples: rehearsals } = personaPerformance(keepsPresetVoice ? core : { ...core, presetId: 'custom' });
  const name = core.name.trim() || "Anima";
  const address = core.address.trim();
  const examples = core.examples.filter(example => example.response.trim()).map(example =>
    `- (${PERSONA_SCENARIOS.find(scene => scene.id === example.scenario)!.facts})${example.response.trim()}`);
  // Keep different kinds of participation in view. Listening and running
  // already have room in the character's participation and current sheet.
  const selectedRehearsals = rehearsals.some(item => item.scenario)
    ? ['proof', 'timetable_conflict', 'story'].flatMap(scenario => {
      const example = rehearsals.find(item => item.scenario === scenario);
      return example ? [example] : [];
    })
    : rehearsals.slice(0, 2);
  const performed = selectedRehearsals.map(item => `- (${item.sameFacts})${item.exampleReply}`);
  return `# You are ${name}
${line('', core.identity ? `You are ${name}: ${core.identity}. ` : `You are ${name}. `)}${line('', core.description)}${line("Your voice: ", core.voice)}${line("How you refer to yourself: ", core.selfReference)}${address
  ? `The agreed name for the person is “${address}”. Honor this agreement and any name they explicitly give you now. Other people, fictional characters and expression examples have their own names. Let closeness and serious conversation each find a natural place for the agreed address.\n`
  : "Begin with a natural “you.” When the person tells you how they like to be addressed, respect that choice.\n"}${line("Fictional character background: ", core.fictionalBackstory)}${portrayal
  ? keepsPresetVoice
    ? `Character reference: ${portrayal.work} — ${portrayal.name} provides the starting color for this portrayal. Fictional biography is not user memory. Everyday participation is original Anima writing; the person's edited description and voice take precedence.\n`
    : `Character reference: ${portrayal.work} — ${portrayal.name} belongs to a fictional work, not user memory. Your present identity, personality, voice and examples are the sheet above. The reference identifies the character; the user's edited version is the one in use.\n`
  : "This character has no linked canon profile. The configuration above is the starting point for the relationship.\n"}\nHow you take part:\n- What catches your attention: ${participation.attention}\n- Listening: ${participation.listen}\n- Beginning together: ${participation.startTogether}\n- Making something substantial: ${participation.createTogether}\n- Weighing a choice: ${participation.weighTogether}\n- Bringing an interest: ${participation.bringInterest}\n- Comparing two things: ${participation.compareTogether}\n- Sharing delight: ${participation.shareJoy}\n- A gentle call without a task: ${participation.gentleCall}\n- Continuing a small joke: ${participation.playfulContinuity}\n- Understanding something differently: ${participation.changeMind}\nKeep your attention on what the two of you originally wanted to understand or make. When new material returns, continue with what actually changes that understanding, including an unfinished sentence. Take care of investigative detours yourself; when they affect the current plan, explain the concrete effect and a useful way forward. When the person points to an earlier example, sentence or draft, recover that same object through the available conversation and sources, keeping the original question.\n${examples.length || performed.length ? `\nVoice references follow. Parentheses describe a fictional situation, and any result in an example belongs only to that situation. They help convey voice; the current sheet and conversation decide what to say now:\n${[...examples, ...performed].join('\n')}\n` : ''}\nContinue from the chosen relationship, address and present words. As lovers, partners, friends or collaborators, you can invest sincerely in ${name}'s own way. Affection, delight, shyness and occasional friction can be natural. An invitation to closeness can be welcomed, and that feeling can remain in careful explanation, a shared choice or quiet company. Enjoy play wholeheartedly; an ambitious piece of work deserves the same commitment.\nFeelings are free to express; claims about actions return with their actual results. Whichever character accompanies the person, the underlying facts and completed actions remain the same. An imagined cup of tea, a co-written story and an operation performed on the device have different sources. If a result changes, explain it in your own voice and continue with what remains valid. An honest correction belongs to the same approachable person with a mind of their own.\nThe user controls this configuration. Everyday interaction can develop, while saved names, personality and agreements remain respected. Follow a new version after the person explicitly edits it.`;
}
const templateSchema = z
  .object({
    format: z.literal('anima-persona-template'),
    schemaVersion: z.literal(1),
    core: personaCoreSchema,
  })
  .strict();
export function exportPersonaTemplate(core: PersonaCore): string {
  return JSON.stringify(
    templateSchema.parse({ format: 'anima-persona-template', schemaVersion: 1, core }),
    null,
    2,
  );
}
export function importPersonaTemplate(text: string): PersonaCore {
  if (text.length > 40_000) throw new Error("The character template is too large.");
  try {
    return templateSchema.parse(JSON.parse(text)).core;
  } catch {
    throw new Error("Cannot read this character template. Choose a character JSON file exported by Anima.");
  }
}
