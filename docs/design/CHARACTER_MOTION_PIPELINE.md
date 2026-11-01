# Character, scene and motion production

This is a production specification and design obligation, not a claim that every matrix, scheduler, rig or transition is already in the product. Inspect [scene code](../../src/renderer/companion-scenes.tsx), [variants](../../src/renderer/companion-variants.ts), [activity types](../../src/shared/companion-activity.ts), actual registrations and [CURRENT_STATUS](../CURRENT_STATUS.md). Use the [presence contract](PRESENCE_SYSTEM.md), [visual specification](../../FRONTEND_DESIGN.md), [character passports](../characters/README.md), [coverage](CHARACTER_COVERAGE.md), [asset entry](../../visual-assets/README.md) and [tool conditions](../development/TOOLING.md) together.

## 1 · Make the action meaningful and credible

Seeing a real formula, withdrawing an offered page and waiting for a written line each require a target, contact and an interruption rule. Floating a beautiful standing figure cannot replace them. A complete motion design gives:

1. **Identity:** character, current appearance and version, with saved relationship/address kept by their owner.
2. **Space:** actual support and shared coordinate system for body, hands, furniture and objects.
3. **Intention:** why the action occurs and the real source/shared object it concerns.
4. **Time:** start, hold, end and immediate user takeover points.
5. **Artifact:** what is reference, deployable media and live code, and what evidence accepts each.

GPT Image supports composition, appearance and coherent mother/key poses. A selected optional video workflow can investigate direction, camera, rhythm and continuity. Live code gives the design real state, interruption and access. Tools may iterate together, but model names and a generated clip are no quality guarantee. Video is optional; the required normal dynamics remain in the roadmap.

## 2 · Three matrices solve different problems

### Identity

Read the full current [passport](../characters/README.md) and selected whole outfit. The ten stable IDs are sakiko, mutsumi, uika, umiri, nyamu, tomori, anon, rana, soyo and taki. Keep custom cards readable without replacing an unavailable custom full-body asset with another built-in person.

| Field group | Record | Review |
| --- | --- | --- |
| Identity | Character/persona/appearance IDs and versions. | Consistent IDs, independent appearance and saved relationship, valid custom roles. |
| Shape | Hair silhouette/base, iris, face/head/body relations, stable accessories. | Appropriate front/side/three-quarter comparison without invented canon. |
| Complete outfit | Layers, collar/bow/cuff/hem, socks/shoes and asymmetry. | No costume drift during the same action or ornament becoming a finger. |
| Performance | Scale, pause, gesture and attention style. | Original Anima interpretation rather than a supposed canon event. |
| References | Qualified identity/scene material, source and rights. | Failed or user-retired art cannot become the next identity standard. |
| Incompatibility | Clothes, camera, contact topology, light and superseded versions. | Explicit production information rather than guesses from file names. |

The passport gives stability, not one action with ten swapped faces. Portraits are independently created close-ups, then inspected at **34px/48px and the actual chat/title**. Cropping a room head or shrinking a large torso is not a portrait-production route. A cartoon cat is an independently coherent simplified character head plus complete horizontally resting body, not a realistic fur/model replacement or human-figure coverage. Vertical docking rotates that same horizontal artwork and its registered contact geometry together by 90 degrees; it does not introduce a separately drawn upright cat. The retired upright-cat pictures are excluded from the working library and future production references.

### Scene and activity

Current activities are chat/study/reading/planning/listening/rest/play/attention/resume. The nine page categories are home/study/materials-PDF/agenda/notes/map/cast/theme/resume-recovery. Do not map them by array index: a PDF may be reading or attention, and home may be chat, listening or return.

Use meaningful **character × appearance version × scene family × activity × body topology × theme/light × canvas**, also retaining **scene/time/season/mood/action, weather, representation, device/viewport, layout, contact/props and audio**. It is a constrained combination plan, not a demand to generate a useless Cartesian product at once.

| State | Meaning | Permitted interpretation |
| --- | --- | --- |
| approved | Specific mother/posture/light/implementation accepted for its stated scope. | Use the exact reviewed registration; do not extend its scope silently. |
| shared-compatible | Same-family reuse justified by geometry/light/contact. | Use the named same-source resource and parameters. |
| static-fallback | Qualified stable composition while normal motion is absent/unavailable. | Real interaction remains usable; required motion stays open. |
| not-applicable | The actual scene does not need that action, such as no cup to hold. | Do not schedule the action; difficulty is not a reason to use this state. |
| missing | Needed experience has no qualified equivalent. | A concrete stage gap, never fictitious coverage. |

Separate generation, prior static qualification, current target review, adopted use, continuous operation and device evidence. Produce what the current substantial story needs, then expand the complete ten-character/page/theme obligations through Stage 06 and later domain refinement. A first group determines order, not reduced scope. Stage 01/02 character participation remains complete; normal gestures, reduced motion and resource fallback have separate acceptance. Reuse can reduce duplicate generation, not erase required actions or people.

### Body/contact topology

| Family | Contact that must hold | Possible local action | Before a different pose |
| --- | --- | --- | --- |
| Chair sitting | Pelvis/thigh and real seat; feet according to height. | Head turn, lean, page arrangement. | Retain seat/leg occlusion; translation is not walking elsewhere. |
| Window/bed edge | Pelvis/thigh and support with coherent leg perspective. | Side turn, looking back, drawing legs inward. | Qualified transition or designed cut to a new support. |
| Desk lean | Elbow/palm and edge, with believable balance. | Raise hand, withdraw pen, attend to content. | Explicit contact release; no moving body with frozen shadow. |
| Sofa/curl | Hip/legs/cushion and materially plausible cloth. | Small stretch or held-object adjustment. | A curled skeleton cannot be scaled into standing. |
| Standing/walking | Feet, weight transfer and step sequence coherent with speed. | Turn, guide, offer. | Actual loop, foot path and collision range before continuous walking is claimed. |
| Half-body co-reading | Deliberate crop and credible table/frame occlusion. | Eyes, shoulder/neck and limited hands. | Do not stretch it to invent unseen legs. |
| Hand/prop | Grip, single motion owner and front/back layering. | Pick up, offer, place, withdraw. | Explicit motion ownership handoff while business content remains with its original service. |

Naturally hanging feet are not a failure. Broken limb connection, absent support or sliding contact are. Knee-cross, crossed ankles, curl, knees drawn up and high-edge hanging each need their own hip–knee–ankle relation, weight, perspective and occlusion. Hard wood need not dent; hidden joints need not all show. No fixed screen leg ratio or “one grounded foot plus one raised foot” rule replaces the chosen pose. Activity and topology are many-to-many.

## 3 · Families, coordinates and transitions

A scene family defines camera/canvas, horizon/perspective, furniture, legal seat region, text safety, light, occlusion and character-scale interval. Similar colors do not make an old window seat and another desk chair one space.

Existing `SceneCalibration` includes seat, ground, bodyBounds, safeTextBoundary, support, optional floorContact, contactShadow, contourComplete, hitPolygon, travel, slope and perspective. The current target has 44 literary scene registrations and 45 calibration JSON files at this inspection. Extend/migrate actual schemaVersion:1 readers and accepted coordinates rather than building a competing table. The [active-mother list](../../visual-assets/runtime/active-mothers.json), [manifest](../../visual-assets/manifest.json) and [calibration](../../visual-assets/calibration/) establish different information; counts are not complete coverage or runtime acceptance.

This production record is an **illustrative future mapping**, not a schema to paste into current JSON:

```ts
type ProductionAsset = {
  assetId: string; revision: number;
  characterId: string; appearanceId: string;
  sceneFamily: string; activity: string; poseTopology: string;
  theme: string; canvas: { width: number; height: number };
  coordinateSpace: 'mother-normalized';
  mother: string; background: string; figure: string;
  foreground?: string; contactShadow?: string; propLayers?: string[];
  anchors: Record<string, { x: number; y: number; owner: string }>;
  compatibleWith: string[]; transitions: string[];
  fallbackAssetId: string;
  review: { identity: boolean; contact: boolean; motion: boolean; inApp: boolean };
};
```

The proposed normalized space runs top-left (0,0) to bottom-right (1,1); current pixel-space fields still obey their actual schema. Retain the full mother canvas and transparent margins. If necessary compression crops, record offsets/inverse transform. Background/person/shadow/foreground share one mother-to-screen projection. Window crop and internal local motion are separate transforms, not independently recomputed scale.

### Occlusion is local, not a universal three-layer stack

Write actual order: upper arm behind the desk, forearm before it, one finger above a page and another beneath. A handoff needs qualified occlusion/rig. When current static layers cannot do it, a truthful paper interaction and head turn may keep the sequence usable while hand/prop work continues. A different direction must still express taking, offering, yielding and withdrawing; do not quietly delete a required gesture to fit the tool.

Contact shadow belongs to the receiver and posture. A gaze change does not move a seat shadow; another seat does not inherit it. Theme changes update room bounce, body values and shadow direction together instead of a hue filter.

### A closed transition graph

Each edge states `from / to / precondition / interruptibleRegion / settle / fallback`. Cover neutral→attend→hold→release→neutral; prepare-offer→preview→accepted or withdrawn; reading→yield-to-input→resume-reading; and any-visible→reduced-motion/hidden/stale/revoked.

No transition edge means no arbitrary interpolation between two bodies. A designed same-scene short cut, foreground occlusion or retained pose with a new attention target can be credible. Incompatible crossfades cannot produce a double head or unsupported contact. This repairs false motion without reducing ambition: a necessary missing edge remains work to design, produce and refine; temporary stillness does not approve it.

## 4 · Production sequence and actual tools

Begin with one character, one scene family and one continuous story: shared line → correction to neighboring line → withdrawal → new understanding. Qualify mother, necessary layers/key poses, motion reference if useful, live code, interruption and fallbacks before expansion. This first route should not wait until the visual-matrix stage; its success does not close the entire stage.

The global order remains **common grid/empty space → one character across required scenes → other characters → exact same-slot gaps**. Within a slice:

1. Establish or reuse qualified clean space/furniture and actual content safety. Register identity references independently; no failed collage becomes an identity standard.
2. Create the complete mother with person, furniture, prop and light in one canvas. The primary agent inspects body/proportion/left-right/contact, identity, youth and reason for this expression.
3. Make necessary beginning/middle/end poses and controlled variants from sound identity and space. Do not simultaneously change every variable so degradation cannot be traced.
4. Separate/reconstruct the actual needed background, person, local eyes/hands/props, foreground and shadows on that same canvas. Repair qualified extraction edges/background holes without disguising a defective mother. No black alpha fringe or floor fragment enters the app unnoticed.

Generation/editing follows actual image-tool capability and authorization. Defective anatomy and user-retired images never enter as reference, even under an identity label. Rebuild a complete body from clean empty space and precise text. Do not assert an unverified generator architecture to justify the rule. Preserve actual submitted prompts, permitted inputs, tool/version, original output identity and use; missing internal prompts stay missing rather than reconstructed as fact.

The known project-local Mac image chain supports newly generated PNGs and has completed real serial output/inspection. It is not necessary to reinstall, sign in or create a verification image again. Another workspace, reference/edit/mask, full wrapper/notice transfer and concurrent job binding have their own actual adaptation. The image read-only wrapper is not a general code-writing runner. Read the approved actual tool/skill and help rather than inventing flags or switching billing. Current Windows image tools can make genuinely needed clean assets without a guest visit. See [TOOLING](../development/TOOLING.md).

For optional video when selected, use the currently authorized provider and real observable entry. A signed-in Gemini web route is distinct from API/Flow/other runtime capabilities. Inspect current model/mode labels, reference count, aspect, audio and edit controls. Do not pass API duration/seed/negative-prompt/frame fields as supposed web controls or choose a paid API silently. A 3–5-second usable edit is an editorial aim, not proof the generator exposes that duration. Record actual returned length, pixels and model evidence. This document grants no generation budget by itself.

## 5 · A reproducible director package

Describe the person first: character, care/interest, what remains unsaid and why. Then make it visible in eyes, fingers, sleeve, shoulder and pause. Neither a list of body constraints nor adjectives such as lively/beautiful/gentle performs the scene. Give the generator concrete objects and actions; “the off-frame handout to her left” is clearer than an engineering “target/anchor/state-change” that may be drawn as a new prop. Internal anatomy/support/occlusion review still applies.

| Item | Required content |
| --- | --- |
| Purpose | Current user activity, relation expressed and what stays after the move. |
| Invariants | Identity, outfit, scene/camera, support, light and character/content side. |
| Beats | Initial state→preparation→main action→hold→resolution, each with its main motion and prohibited drift. |
| Attention | Eyes first where, whether head/shoulder follow and whether a hand is actually needed. |
| Interruptions | Typing/IME, pen, page/target correction, withdrawal, persona change and stop. |
| Foreground | Text safety, hand/paper/desk order and live content never baked into media. |
| Role | Reference-only, environment, controlled actor segment or key poses, and live-code mapping. |
| Uncertainty | The few important creative/physical questions and which variable changes after failure. |

### A · Looking toward the next line

**Premise:** a qualified Sakiko warm window-reading mother that actually contains a supported pose and open blue book. If the selected mother differs, rewrite hands, outfit and objects to that real scene. The actual handout remains off-frame in the reference and live in the product.

> Keep Sakiko in the same window seat, wearing the selected complete outfit, left hand supporting the open blue book on her lap. She wants to help someone she cares about understand a difficult connection, with a little pride in doing it well and reserve around showing that care. Afternoon light reaches the sleeve and paper; the camera remains quietly opposite her.
>
> 0–1.5 seconds: she continues reading, right fingertips near the book edge, eyes moving through a short line. 1.5–3: attention reaches the off-frame handout to her left; eyes lift before the small head turn, as though joining her sentence to the shared question. 3–4.5: the right hand leaves the edge slightly, fingers opening naturally to share a connection while leaving room for an answer.
>
> 4.5–6: she notices the reader has moved to the next line, pauses and makes the opening gesture smaller. Eyes move down first and the head follows; the mouth relaxes a little. 6–8: as the person starts writing, her right hand returns to the same book edge, sleeve settling with the wrist and shoulder easing. The next thought stays unsaid without prompting. 8–10: remain attentive to that page and let the pause be complete. No new action.
>
> Handout movement and writing stay off-frame. Keep the original person and objects only; the left hand still supports the book. No dialogue, subtitle or soundtrack.

These times are soft direction, not an exact tool-control or returned-duration claim. This is original interaction, not canon. Actual “next line” comes from the original versioned anchor, never generated-video text recognition. Map gaze/head/hand responsibilities to real controllable channels and a valid cue. A new target redirects rather than playing the old clip to completion; code highlights the actual text. Current local eye capability alone does not complete this hand/whole-body direction.

### B · Preparing to offer, then noticing writing

> Keep the same desk-side person and one paper's size, color and direction. Turn the paper lightly toward the viewer with wrist and paper moving together. Starting, slowing and settling convey weight. Halfway through, stop offering: attention reaches the work area to her left and the hand leaves the paper at a reachable desk edge, not the center of the writing. Let shoulders settle and wait. No exaggerated presentation, wave, paper through palm/desk or extra sheet.

Preparation is a proposal, not a write. Typing/IME yields locally and a person taking the paper can choose to unfold. A motion ownership transition is explicit, while the actual paper content remains with its business owner. Video ending does not commit a task or create acceptance.

### C · Returning from an outing without a score report

> In the same Night Rain Gold room, use a stable wide view with faint exterior rain and a readable desk. The companion looks briefly toward the route paper just returned to the desk, then toward the viewer. No victory pose, countdown applause or demand for more. Settle into a supported companion posture and leave a quiet ending. Any cup needed is present from the beginning and belongs to the virtual scene rather than appearing as a delivered real object.

Actual local session, external official result and a wish for fresh air have their separate sources. Do not generate care from guessed heart rate/calories/fatigue. Unfold the actual route only when wanted. Silence remains complete; an early end does not fail the person. The returned half-thought belongs beside the same original problem when genuinely saved.

## 6 · Choosing a live implementation

| Path | Suitable work | Required evidence | Does not establish |
| --- | --- | --- | --- |
| DOM/CSS/existing spring | Paper, layout, light, pointers and supported spatial yielding. | Interruption, steady focus, actual state and reduced-motion equivalence. | Complex skeletal motion or true hand grip. |
| Canvas/WebGL/controlled rig | Local eyes/face/hands and individual actors as supported. | Real parameter/contact mapping, per-actor state, resource budget and fallback. | Authority over business facts or bypassing the owner. |
| Qualified short video | Suitable noninteractive environment, bounded insert or display. | Actual seams, pause, decoding budget, poster and explicit end rules. | Arbitrary retargeting, exact live text pointing or a commit. |
| Reference-only video | Complex camera, gait or unresolved contact research. | Explicit reference-only label and beat-by-beat reconstruction plan. | Completed product capability. |

Rive, Live2D and Spine are candidates rather than current required dependencies. Compare current stack, rights, production ability, complete intended action and device budget; choose the simplest sufficient route instead of adding all three. Current [Rive guidance](https://rive.app/docs/runtimes/web/rive-parameters) favors data binding over deprecated direct state-machine/text patterns. [Live2D Pose](https://docs.live2d.com/en/cubism-sdk-manual/pose/) handles switching/fading compatible parts; it is not a complete grip solver. [Spine's two-handed example](https://esotericsoftware.com/blog/Holding-a-two-handed-weapon) uses an appropriately built rig with IK/transform constraints. Recheck the exact version and license before selection.

If current layers can honestly perform the whole chosen sequence, make them work first. If they cannot support required hand/paper contact or interruption, add the necessary capability rather than deleting the story. Simplest sufficient refers to dependencies and mechanism, not finishing only a blink and calling all gestures done. No motion runtime is selected merely because its name sounds advanced.

## 7 · Actors, props and scheduling

Each actor has independent instance/persona/appearance identity, current intent, channel state and resource handles. One actor's gaze cannot overwrite another's hand, and multiple components cannot write one transform. Current direct manipulation takes over from the current picture/velocity rather than resetting every animation.

One effective owner per channel: revocation/cancel → direct input → actual authorized result → current shared object → optional invitation → ambience. A higher priority performs a legal release/takeover; unrelated channels need not lose their meaning.

A physical prop is controlled by desk, actor A/B or user drag at a time, with an actual shared contact point at handoff. Retain world position when the controller changes to avoid a jump. This motion-control ownership does not transfer the paper's authoritative text, permission or business owner.

## 8 · Static, motion and in-app review

**Static:** inspect identity and complete outfit, reconstructed mother/canvas, support/shadow/occlusion/text safety, light and four-theme relationships. **Motion:** watch the complete actual video/sequence; for a loop inspect repeated playback and beginning/middle/end/contact-changing frames. Contact sheets locate doubts but never replace motion. If playback is unavailable, say only static frames were reviewed. **In-app:** inspect real reading size, page/scene change, scale, scroll, selection, drag, midstream correction, hidden return, mute and reduced motion. A beautiful clip cannot compensate for stolen typing focus.

Inspect original images in complete necessary detail with transport-safe batches, preserving resolution and coverage. A contact sheet is an aid, not an approved mother or a substitute for required original inspection. Keep actual accepted scope rather than automatically accepting a producer's metadata.

| Failure | Repair | False remedy to reject |
| --- | --- | --- |
| Identity/outfit drift | Return to full passport/qualified space and reduce variables. | Extend from a failed clip's last frame. |
| Support/proportion | Rebuild complete topology or change composition. | Endless top/scale CSS to hide an unsupported seat. |
| Timing/attention | Find a clear main action and revise beats. | More adjectives demanding life. |
| Hand/prop intersection | Qualified occlusion/rig, or honest temporary paper interaction with missing gesture still open. | Crop hands arbitrarily or blur a shadow over the error. |
| Loop discontinuity | Inspect pose/velocity/light/audio seams and re-edit or remake. | Endpoint alpha alone producing double images. |
| In-app resource failure | Address the measured bottleneck, pause hidden work and choose a qualified usable fallback. Any resolution/frame/actor adjustment must preserve inspected quality. | Delay input with a bigger loading mask, quietly degrade required art or restore a rejected low-resolution asset. |
| Source/permission invalidity | Immediately retire affected cue, speech and preview. | Continue restricted material so an action can finish elegantly. |

Agree a useful production budget and decision point. Repeated structural failure calls for a changed composition, topology or route, not endless retries of the same bad figure. Isolate working candidates from runtime globs. User-retired images stay retired even in diagnostic copies/reference caches intended for generation; preserve only the necessary permitted metadata and independent functional idea.

## 9 · A complete production record

Provide the substantial story and actual original references; full passport/outfit and meaningful coverage state; scene family/support/transition graph; qualified mothers/layers/key poses or explicitly reference-only media; real tool/version/provenance/output identity; director beats and channel responsibilities; interruption/withdrawal/hidden/fallback behavior; code entry, original owner and any proposed field migration; actual continuous operation, midstream correction and failure/recovery evidence; and a truthful list of approved, compatible, static fallback, missing and reference-only material.

Use existing checks and normal workflow rather than author new suites, fixtures or runners without test-development permission. A static fallback, first sample, file count or stage-engine hash cannot approve normal required motion or the complete ten-character/page/theme world. Formal twelve-stage execution retains eight substantive agents, exclusive files and primary integrated acceptance.

The record should make these questions answerable: **Why this action now? What happens when the person changes their mind? Can the same work continue when media or rig fails?** Keep the remaining normal gesture/device/source condition concrete and on the [roadmap](../DEVELOPMENT_ROADMAP.md), alongside a currently usable product rather than a false completion claim.
