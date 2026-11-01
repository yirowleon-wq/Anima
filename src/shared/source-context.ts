import type { EvidenceEvent } from './harness';
import { REHEARSAL_SOURCE_CONTEXT_MEANING } from './relationship-rehearsal';

export const SHARED_CREATION_SOURCE_CONTEXT_MEANING = `sourceContext.kind=shared_creation means the host checked a real shared work or setting reference in this conversation against the source scope when these words arrived. It supplies a work address and activity identity. Earlier content remains with its original owner; reading, saving, adopting, using location and execution each need their own authority.

Read both what the person is doing and what happens inside the work. Wanting to write, comment, revise or manage a story is real creative conversation. A narrator’s first person, character dialogue, imagined routes, arrivals, agreements and decisions belong to the story world. A public map can be only a story setting. Real location, experiences, preferences, commitments and action instructions each need independent support. Genre and this marker are contextual clues; one message can include both real requests and fiction.

Interpret independent real self-reports fragment by fragment from their original words, purpose and existing permissions, while fiction retains its identity. If attribution is unclear, keep it unknown through needs_context/original_only. Reread works through their original chapter addresses; personal understanding and recording permission come from their own real fragments. New requests to stop, change topic, narrow sources, refuse old text or decline retention express the current choice. An old reference preserves historical provenance without extending a mandate.`;

export const INTERACTIVE_PROGRAM_SOURCE_CONTEXT_MEANING = `sourceContext.kind=interactive_program supplies the real interactive work and node addresses this conversation refers to, checked by the host when these words arrived. Earlier bodies remain with their source and old permissions retain their original limits. The reference identifies the object.

Local inputs, curves, calculations, dragging, selection and trial conditions express hypotheses or exploration within the work. Personal experiences, lasting preferences, accepted decisions, mastery and business outcomes each need independent real support. Attend to the rest of the sentence too: the person may report real circumstances, request a work change, stop, or raise another matter. Interpret these through existing semantic methods and exact original words; work values and personal facts keep separate identities.

Current explicit source limits, refusal to reread, refusal of retention and cancellation express the present choice. Reread original specifications or bound material through current valid sources when needed. Whole-library reading, external disclosure and business actions still need their own authority.`;

/** Select semantic methods from actual source metadata, never from words in
 * the user's prose or a guessed neighboring activity. */
export function sourceContextGuidance(...contexts: (EvidenceEvent['sourceContext'])[]): string[] {
  const kinds = new Set(contexts.map(context => context?.kind));
  return [
    ...(kinds.has('relationship_rehearsal') ? [REHEARSAL_SOURCE_CONTEXT_MEANING] : []),
    ...(kinds.has('shared_creation') ? [SHARED_CREATION_SOURCE_CONTEXT_MEANING] : []),
    ...(kinds.has('interactive_program') ? [INTERACTIVE_PROGRAM_SOURCE_CONTEXT_MEANING] : []),
  ];
}
