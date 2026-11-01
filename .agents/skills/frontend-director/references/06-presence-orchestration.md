# Orchestrating shared attention

This extends spatial yielding, direct manipulation and OpenUI without making a second business state machine. Follow the [presence contract](../../../../docs/design/PRESENCE_SYSTEM.md); proposed types and parameters require actual implementation.

## Five questions before directing

Which real object is shared? Which version? What does the action mean? How can the person interrupt it? How does the same task remain usable with mute, reduced motion or missing assets?

Without those answers, breathing, blinking and floating are optional ambience rather than evidence of meaningful interaction. The character need not move constantly. Listening, withdrawing a hand and making space are complete choices.

## One cue across coordinated channels

| Channel | Responsibility | Conflict and response |
| --- | --- | --- |
| Gaze | Alternate current object and person | Cursor following cannot fight a formula target. Consume the current valid shared-attention cue; explicit pointing takes precedence. |
| Head/body | Turn, listen and yield | A body animation cannot overwrite a user drag. User manipulation owns the channel, then resume from current state. |
| Hand/prop | Point, withdraw, offer | Hand, paper and desk cannot move independently through one another. Use contact constraints and one prop owner; a temporary paper interaction keeps usability but does not complete a missing required hand gesture. |
| Face/mouth | Expression and real speech | Bind speech to content revision so old TTS cannot speak a new or withdrawn line. |
| Content | Open paper, anchor and highlight | Incremental replies preserve reading position rather than forcing the bottom. |
| Light | Atmosphere and short emphasis | Keep content contrast stable; decoration or peripheral light must not wash over the text. |
| Sound | Material actions, notes and voice | Mix one coherent soundscape, allow independent mute and avoid duplicate emphasis or per-character typing noise. |

Priority: **direct manipulation → current valid task → optional initiative → ambience**. Undo, privacy invalidation and resource release have their own immediate path rather than waiting in that queue.

## Seven grammars in use

**Look:** Make the target identifiable first. DOM/PDF/handwriting projection changes on scroll while source identity stays. If it leaves the viewport, look toward its entry or stop pointing. On a correction, withdraw the old emphasis before indicating a confirmed new target.

**Yield:** On focus, IME, document expansion or pen input, protect content stability first. Move only to a real compatible place. Muting speech does not require hiding the character; less activity is not companionship switched off. After input, check relevance before restoring a proposal.

**Offer:** Prepare beside the desk, turn slightly toward the person, then wait to be taken. Before data is ready, a preparing action cannot pretend content exists. Failure leaves a usable continuation. Writing holds the offer at the edge; refusal retracts without losing the user's draft.

**Unfold:** Expand from the original object with identity and visual origin. The inline map keeps its camera; source reading retains selection; a larger piano preserves valid key/audio lifecycle rather than remounting into hanging notes.

**Retract:** Retire affected visual, voice, intent and derived output together. An executed calendar change uses actual owner undo/new revision. A card leaving the screen is not reversal. Reduced motion conveys the same state with stable replacement and concise feedback.

**Resume:** Restore usable text position, strokes and current object first; then a glance can acknowledge return. Do not fabricate an away summary when nothing useful changed. Place real changes beside affected objects. A saved continuation need not be blocked by a welcome ritual, while explicit full-cover navigation stays available. A different persona does not claim another's private experience.

**Play:** Rhythm can follow an actual tap and response a real choice. Distinct characters have distinct force, pauses and gestures. Quiet is permitted. A tap can receive a taskless response, not a fixed affectionate sentence dispatcher or repeated random reward.

## Time and interruption

Timing ranges are tuning starting points, not psychological constants or compulsory delays. Hand-following is immediate, spring transitions keep useful velocity, exact pointing avoids overshoot, color may ease and real progress follows facts. Preserve the useful velocity continuity, substep integration and hidden/reduced-motion settling in `src/renderer/motion/use-spring.ts`. `onRest` never commits a calendar, sends a message or saves memory; name performance completion separately from business completion.

Inspect the relevant transition before starting, mid-motion, near settling and after hiding, using ordinary interaction. Continue from the current picture or safely settle; never snap to an initial frame. Rapid page changes retain only the current valid target rather than playing each intermediate page later.

## Character differences

These are original directing notes, not canon biography: Sakiko prepares precisely and retracts cleanly; Mutsumi does less but knows the target; Anon approaches readily and settles quickly; Tomori gives a word or shared mark a longer, specific attention; Uika confirms attention before softly continuing; Umiri presents a practical next choice; Nyamu's rhythm brightens play but respects study; Rāna approaches through interest and withdraws naturally; Soyo attends to arrangement without changing a decision unasked; Taki takes on the real step before elaborating. All can have independent interests, different moods and a change of mind. Reuse one business contract rather than ten duplicated state machines or identical motion with swapped colors.

## Access, performance and observation

Support system reduced motion and the app's motion level, separate volumes/mute, keyboard equivalents, stable focus and reading order. State cannot depend only on color or an eye movement. Pause hidden animation/video decoding while keeping necessary business subscriptions. On return recheck cue expiry; an approved static asset may keep real interaction usable without an endless spinner, but does not close normal motion work.

Measure input response, frame time, decoder memory and energy on the actual device before optimizing. Observe actual presented state and explicit user acts, not inferred mood from gaze or hover. Diagnostics can show cue/version/owner; the product shows only what helps the person continue.

A directed story needs real continuous operation, an actual midstream correction, invalidation/recovery, reduced-motion equivalence and resource/source identity. Document edits do not imply a recording exists. One story establishes that slice only: formal stages still require their complete eight-agent responsibilities, ten-character/page/theme coverage and required normal gestures.

## Continuity that must survive orchestration

Preserve all six appearance forms, seven ideas, full outing and eight details through the same task. The carrier may hold two sources and their relationship. Overlay, paired pointers and side-by-side modes follow real correspondence, including saved layout and stopping points. Personal marks and names stay on original objects; only genuinely useful new changes appear on return; prepared material is actually available where needed. The model understands, investigates, explains, co-edits and rereads the state along the same runtime. Animation without that loop is incomplete.

Three frequently concealed breaks deserve direct attention: the same effective persona revision must reach preview/model/notification/audio without rewriting history; DOM UTF-16 selections must explicitly map to owner Unicode code points and repeated-text/version identity; visible text, played audio and actual feedback need honest range-based exposure records. Missing receipts stay unknown and a maximum cursor does not prove all earlier content was seen. Never nag someone to open a gift merely because no completed-reading acknowledgment exists.
