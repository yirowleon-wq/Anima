# Events, observation and causal feedback

This is design guidance for mapping existing contracts to shared presence, not a claim that every suggested field is implemented. Follow the [presence system](../../../../docs/design/PRESENCE_SYSTEM.md), current source types and actual runtime.

## Existing seams to preserve

`companion-activity.ts` relates nine activities to run/message/revision and valid replies. `companion-continuity.ts` retains original words, topics, shared phrases, feedback and persona relation. `source-bookmark.ts` holds stable material/note/message references; `scene-transfer.ts` moves existing scene addresses without another body owner. Renderer variants/scenes relate activity, appearance, support, light and registration. `conversation-rhythm.ts` manages actual public draft/continuation. Extend these real seams and compatibility readers rather than inventing parallel managers from document aliases.

## A cue and an observation

A proposed presence cue needs cue identity, run/message, scene instance, actor/persona/appearance, kind, target owner/ID/revision/anchor, basis, fact state, privacy epoch, expiry, interrupt conditions and alternatives. Target version and character identity are part of causality. A proposed observation carries observation/device/scene identity, original target, explicit action, occurred time, expected revision and current epoch. Keep per-frame geometry and unsent writing local.

Renderer reports explicit acts—moving a quote to study, saying “the next line,” withdrawing a proposal—not “the user understood” or “the user is sad.” A hover or eye direction does not diagnose emotion.

## Two lifecycles

The original service's **fact chain** may map proposal/ready/committed/failed/unknown. The **presentation chain** may map eligible/preparing/visible/settled with cancellation, supersession, hidden or unavailable exits. Map these names rather than blindly adding duplicate states. Presentation receipts schedule and diagnose; they cannot commit facts. Finished video is not success, and missing UI exposure is not a failed host transaction. A committed state is usable while an optional animation settles.

## Duplicates, ordering and recovery

- Deduplicate by cue and associated fact version; retransmission does not re-offer paper or replay audio.
- Reject a stale write to the same target; do not compare meaningless global version numbers across independent objects.
- Restore current snapshots before still-valid increments. Never replay every cue accumulated while hidden.
- Keep continuous processing watermarks; a maximum sequence number does not close a missing memory segment.
- Reconnecting devices apply fences/tombstones before content or initiative. Device and server clocks have distinct purposes.

## How “here” reaches understanding

An explicit selection resolves to owner, identity, revision and exact anchor. Page, text range, handwritten object and camera matrix are different projections; a screenshot rectangle is not permanent text identity. Only the permitted combination of selected context and necessary pixels enters the model. A scroll does not upload a whole history or start continuous recording.

After a new target, retire or identify the old dependent explanation before continuing. If “here” lacks a resolvable target, naturally ask for that missing distinction or provide a selection path. Correctly admitting a missing anchor is preferable to pointing at the wrong line. DOM UTF-16 offsets explicitly convert to the owner’s Unicode code points; repeated text and changed versions require exact original identity.

## Input, privacy and switching

IME composition, an active pen stroke and a drag are local takeover signals, not mood labels. Begin yielding immediately and do not automatically reinstate an expired proposal when writing ends. Correction, retract and forget have distinct scopes; follow policy/owner semantics. A withdrawn source retires affected queued speech, card snapshots, preparation and model output. Block new use immediately, tracking actual physical/backup/offline cleanup separately.

Appearance change preserves persona, names and legitimate experience while rechecking asset compatibility. Persona change preserves public object references but follows the actual persona-relation rules for experience. Another character cannot claim a private shared past without its real basis. Page change invalidates old screen coordinates; the same original object can be projected in the new scene rather than dragging an old hand gesture to the wrong place.

## Five causal paths to operate when affected

1. A third-line selection changes to the fourth; a late third-line response cannot light the old target again.
2. Typing interrupts an expanded agenda offer; motion stops but proposal data, draft and focus survive.
3. An external activity submission times out; no success mark appears before inspection of that same attempt.
4. A source is withdrawn while its speech is queued; it never plays and an old cache cannot restore it.
5. A persona switch and return retain the work/bookmark without transferring another persona's lived-history claim.

Use normal workflow, current tools and existing checks; this list does not authorize new test code or runners. Record actual input, owner result, cue lifecycle and visible outcome, then repair the earliest divergence rather than adding bureaucratic wording.

## Time, exposure and historical identity

Use monotonic time for in-process motion/intervals and establish a new base after restart. Use declared-zone fact time for schedule and source applicability. Each source retains acquisition, event and applicable time; a fresh weather query does not refresh an old position.

Generated, delivered, OS-accepted, rendered, played, reported read, understood, adopted and executed need distinct evidence. Missing acknowledgment remains unknown. Skipped audio or partial long-text visibility retains actual ranges, not a maximum cursor pretending continuous exposure. Message, preparation and notification have separate identities and projections; opening a notification returns to its original object without executing it twice. Effective persona revision reaches current draft, speech and notification, while historical messages retain their original actor/persona version. A separate rewriting agent cannot fix a configuration that was actually overwritten.
