# Anima visual and interaction specification

<a id="unified-visual-20261023"></a>

This specification serves a concrete experience: a place worth returning to, where a particular companion hears what matters, serious work remains clear and leaving does not lose the original thought. Space, light, actual help and continuity create warmth together. A gold accent, large portrait or repeated reassurance cannot do that alone.

Use [project navigation](PROJECT_NAVIGATION.md), [current capability and observation](docs/CURRENT_STATUS.md), the [shared-presence contract](docs/design/PRESENCE_SYSTEM.md) and [motion production specification](docs/design/CHARACTER_MOTION_PIPELINE.md) together. [Visual assets](visual-assets/README.md), their [manifest](visual-assets/manifest.json), current runtime registrations and [character coverage](docs/design/CHARACTER_COVERAGE.md) have distinct roles. An earlier approval, a file, a contact sheet, a producer's completion claim and a current integrated observation are different evidence.

## Space serves the person and the work

The brand action opens a complete independent cover room, with the existing work address and draft retained. Resume, Back and a bookmark continue work; choosing the cover is a different action. A reply arriving while the cover is open does not pull the person away. New/empty conversation can use that complete room; sending the first message moves into a stable reading space. Keep the same composer, cursor, composition, attachments and draft across those changes: the current React path keeps its DOM host, while a native Swift path must preserve the equivalent state and control continuity.

Character and light selection preview the same full scene. Settings and work use a local native paper surface rather than a white strip or stacked cards covering the room. Cover/settings occupy the side the person leaves free. Reading, conversation, agenda and keeping work can have compatible distinct settings and poses; swapping an avatar does not establish presence in each. A large camera change must not make the input fly across the window. On a narrow window, use an intentional crop shared by art and its support points, rather than shrinking a horizontal picture between empty bars.

The current implementation provides full-room cover/preview, a near-desk conversation setting, co-reading at a desk, a window-side keeping space and an agenda setting with its own furniture. Their code/artifact entries are [WorkspaceScenery](src/renderer/WorkspaceScenery.tsx), [scene registration](src/renderer/companion-scenes.tsx), [coherent surfaces](src/renderer/coherent-desk.css) and the manifest. This identifies the implementation, not a claim that every character, theme, motion or device is accepted. A common paper fills the needed work area on the character's free side; narrow composition gives content its own stable place.

Resolution must hold at the actual displayed scale. A rejected low-resolution scene/clip stays retired and cannot return as a background, poster or next-generation reference. Keep the qualified full-resolution mother and its real canvas; common 1536×1024 material is not permission to distort another size. A local eye or blink patch stays inside its precise calibrated region rather than replacing a face or the whole picture. Successful generation does not approve motion.

Remove redundant standing explanations, subtitles and duplicated entries. Main reading and controls start around the current 16px relationship, with roughly 24px page headings where appropriate; actual paper text, English line length, equations, enlargement and control context decide the result. Necessary source, time, saving and secondary actions can use clear controls and on-demand detail. Icons retain accessible names. Do not hide a true failure, source restriction or necessary business limit. Actual PDF pixels and math fonts keep their own representation and zoom.

Build the scene and normal task first, then the character/small forms. The cat docks only on visible real furniture, book, lamp, floor, paper/window edge or calibrated head/lap support. Art and docking points share one canvas projection. A reading surface or control hiding the support removes it from docking. Existing pose selection, continuous arrow-key choice and Escape return preserve focus. A different body pose does not become a memory or permission. The long-seat figure remains its original mother pixels and makes room for editing; narrow composition must not accidentally cut it into an unexplained half-person. Static layers are not whole-body motion evidence.

Entry and rest may favor the full room and closeness. Long English, formulas, annotation and complex arrangements require stable reading surfaces. Keep source and explanation comparable, the map in a proper viewing space, and selection/return traceable. The companion can read, look out or attend to the same page rather than permanently stare at the person.

Greeting, current input and a real stopping point form one attention group. Do not put provider/retention controls into the expressive entry by default. Protect usable empty time in the agenda. Unfinished proofs and drafts are not progress debt. “Continue here” returns to the same object without creating another background-recap flow. Preserve aligned work and repair local problems through their actual dependencies.

## Classify each asset by its actual qualities

| Class | Basis | Record and action |
| --- | --- | --- |
| A · Direct standard | Recognizable youthful identity, air/light, believable body/space and a clear useful task relationship. | Record hash, scene, character/action, theme, composition reason and accepted use. Painted dates/formulas/routes are not business data. |
| B · Precise reuse/refinement | Space, light and UI relationships work; a recoverable issue is confined to identity/face or a specific furniture/occlusion boundary. | Name what stays, who/what changes and why. A broken skeleton is not repaired by swapping a face; rebuild the complete person from clean space. |
| C · Functional idea | The image cannot serve as final art but contains a useful operation, choice, transfer or narrative situation. | Preserve trigger, object, action, state, source, cancel/return and code destination before disposing of redundant artwork. The idea does not license a retired image's return. |
| D · Retire/remove | Broken anatomy or selected leg relationship, unsupported sticker, hard day/night collage, unrelated redundancy or explicit human rejection. | Keep necessary source-side identity/decision metadata, remove the current asset and repair references. Never use it as another generation's reference or fallback. |

Human-deleted/rejected images remain retired even if an old record called them A, B or approved. Do not recover them from history, archives or caches for reference, identity input or a remake. Valid independent product requirements continue through a clean new design.

For useful existing art, explain strengths, weaknesses, spatial reason, unrealized interaction and exact remedy. Deduplicate identical bytes by hash with appropriate provenance. Classification is not guessed from names. Original art, actual submitted prompt, runtime screenshot and contact sheet remain separately identified; a sheet assists inspection but is not the design original.

## Image-led coverage and the four-step pipeline

Home, study, PDF/materials, agenda, keeping/notes, map/routes, cast, themes, return/wait/interruption recovery and important new small interfaces each need a GPT Image design before final live implementation. A suitable already-qualified design can cover the same meaning, with scope stated. Hand-drawn placeholders, CSS screenshots and a whole picture with superficial click regions cannot impersonate an image-led design or a working interface. Live text, formulas, dates, inputs and actions stay live.

1. **Grid and space:** establish reference viewport, navigation/content slots, readable density, next action, safe text region, furniture planes, seats and light. Do not lock an already wrong room structure.
2. **One complete character across categories:** begin with Sakiko through entering/chat, co-reading, arranging, listening at night, rest, play, return and new-feature feedback. Inspect whole body, face, support and content safety. Use genuinely different supported mothers where required rather than changing only a prop.
3. **Expand characters:** extend sound spatial language to Mutsumi, Tomori, Anon and the other members with each passport's identity and participation. Record actual character × posture × light and additional meaningful dimensions. A fallback is not a new action.
4. **Fill same-slot gaps:** mother, empty space, figure/mask and necessary occlusion share the complete canvas and coordinates. Reinspect reconstruction before expansion. Preserve sound containers/navigation; removal updates registration and fallback too.

Use the detailed [coverage matrix](docs/design/CHARACTER_COVERAGE.md) and [production method](docs/design/CHARACTER_MOTION_PIPELINE.md). Images explore design and make art, not real records or selectable documents. Preserve actual prompt, permitted inputs, output hashes, purpose and review. A missing original prompt remains missing; a later proposed prompt is separately identified.

## Rebuild bad poses from clean space, then separate

Never submit a defective body/action image as a correction reference. A lower leg that incorrectly passes back to the ground in a selected knee-cross, an impossible limb connection or unsupported figure must be rebuilt with **clean empty setting + precise text describing the complete pose**. Do not repeatedly tell the same bad skeleton to lift a foot. This is a production rule from observed failures, not a claim about an unverified image model's internal architecture.

Distinguish the character's left/right from the viewer's. Describe support, hip–knee–ankle continuity, each leg's direction and occlusion for the chosen pose. In a genuine right-leg-over-left-knee pose, the raised lower leg carries its foot off the ground. Crossed ankles may keep both feet grounded; a high bed edge can leave both naturally hanging; curled sitting can place feet on a cushion. Hard wood need not compress and clothing-hidden joints need not all be exposed. Judge balance, perspective and contact rather than fixed foot count or screen leg-length ratios.

Inspect normal scale and the whole first, then magnify limbs, hands, garment occlusion, contact and edges. A structurally failed mother exits even after many calls. Mask extraction separates already qualified art; it is not anatomy repair. RGBA, equal dimensions or an alpha maximum cannot prove registration. Recompose on light/dark surroundings to inspect hair, shoes, glow, floor fragments and held objects.

Standing and kneeling may use real floor support. The existing calibration contract permits `support: 'floor'` and `floorContact: 'feet' | 'kneeling'`. Seat/ground pivot references use the actual mother contact; an in-place-only pose uses `travel: 0`, `slope: 0` and `perspective: 0` rather than invented movement. A cushion-supported folded leg stays supported by that cushion rather than being forced to the floor. Type admission is not asset or in-app approval.

The current target includes 44 literary `*.scene.json` registrations and 45 calibration JSON files at the time of this document's inspection. The [active-mother admission list](visual-assets/runtime/active-mothers.json) checks exact mother identity; the [calibration directory](visual-assets/calibration/) and [manifest](visual-assets/manifest.json) retain different information. These counts and hash checks do not close the full visual matrix or current runtime acceptance. A complete runtime review should bind exact mother, adopted scene fields and actual image bytes (for example, a proposed `bundleSha256` identity), plus the stage-engine version (such as `stageEngineSha256`), so changed art/engine reopens that scope. Preserve earlier results as historical; a prose/source-pointer edit alone does not change the image bundle. Do not claim a not-yet-existing review schema or file is currently consumed.

## Window, furniture and ordinary life

A complete window has side frames, top and sill in one perspective. Furniture has understandable usable direction, seat depth, back, floor contact and passage. A small desk has a real height and place to work. Plants, curtains, books and wood create lived depth without filling text safety. Keep scene and content layers distinct and inspect long content, narrow crop and zoom. Neither heavier gradients over broken architecture nor a permanently empty wall over most of the room is a solution.

Use compatible daylight and lamp sources; do not combine a noon exterior and midnight sky. An imagined bridge or lake view is artistic setting, not target-campus geography or present weather.

## Current code relationships, not universal constants

The following values were directly read from current target code. The cascade and actual integrated rendering still decide final optical alignment. A rule in an older layer does not establish the final computed value.

| Element | Current implementation entry | Judgment |
| --- | --- | --- |
| Desktop bar | design-system.css: 72px; padding 0 16px 0 30px; gap 14px. | Shared brand/navigation/action relationship, without a new per-page bar. |
| Three-way navigation | Top 15px, centered; three 78px slots, 4px padding, 28px outer radius, 16px blur; base buttons at least 32px. Coherent surfaces set navigation text to 16px. | Indicator positions 0/78/156px do not prove optical centering of each real word/icon. |
| Narrow bar | workspace-continuation has an earlier ≤600px 100px/top53 rule. The later, more specific coherent-desk ≤760px rule uses 112px/top62. | Inspect the final cascade, menus, window controls and input. Do not force desktop height or report the older rule as final rendering. |
| Content/reading | Base widths min(1020px,100%−88px) and min(800px,100%−88px), with responsive overrides. | Real long English, formulas and computed widths determine comfort. |
| Controls/radii | 40px control height; 12px regular radius and 18px object radius. | Contextual navigation/container radii can differ while optical hierarchy remains coherent. |
| Material | Light base shadow 0 18px 60px #58442b12, 0 3px 12px #58442b08; dark and palette variants exist. | Stable paper, restrained glass/navigation; no wall of gray boxes. |
| Source/chat split | Initial 56%, bounded 35–70%; 18px divider; narrow behavior at ≤900px with actual minimum-width constraints. | Preserve DOM/selection/draft and keyboard/cancel/reset. This is not every study layout's ratio. |
| Study papers | Initial problem width 32.1%, bounded 24–56%, constrained by actual minimums. | Retain distinct problem, attempt and help rather than impose an image's ratio globally. |
| Near-desk paper | coherent-desk uses native surface and the real paper-fiber resource; current near-desk Markdown/composer are 17px, with 1.85 body line-height. | A task-specific paper relationship, not proof every surface has this type size. |
| Font roles | Current body/display use system-ui and platform fallbacks; reading has Iowan/Palatino/Georgia alternatives; math retains KaTeX. | A declared stack is not proof a particular font loaded on every platform. Inspect English, accents, numbers and formulas in the actual app. |
| Spacing | Several page paddings and CSS layers remain. | Consolidate useful shared 4/8px rhythm only when it fixes a real relationship, then inspect glyphs and neighboring healthy work. |

## Themes and participation

| Theme | Current light/dark accent | Scene intent |
| --- | --- | --- |
| Warm Apricot | #947044 / #cfb17e | Warm wood, paper and natural light with air. |
| Morning Mist | #637b98 / #b4c5de | Clear pale light, naturally colored skin rather than a blue filter. |
| Dusk Violet | #896d98 / #d4b6e1 | Rose-gold exterior and violet shadows in the same room. |
| Night Rain Gold | #967344 / #d9b87c | Warm interior light, cool rainy-night atmosphere and readable content. |

Palette, light/dark mode and actual scene weather/time are related but distinct. Four tokens do not constitute a completed asset/motion matrix. **No green UI**, including accents and broad surfaces. Foliage, view, established hair and clothing colors remain natural. Theme changes preserve controls and drafts and affect the full light field, not a hard day/night slider.

Recognizable youthful characters take precedence over realistic skin, adult faces or a generic caring senior. Participation responds to the task: an appropriate side turn in chat, real line attention during proof, the same timeline during planning, listening that lets a sentence finish and play emerging from interest. A small/hidden room protects content but is not a completed full-body yielding performance. Furniture changes need a compatible complete pose, support and contact; pixel translation does not establish physical placement.

Independent portraits are created close up, then inspected at real 34px/48px circles and the actual chat/title. Do not crop room heads. Keep all ten distinct. The cat form has a simple coherent 2D character head and complete cartoon cat body, support and tail root; directions preserve Rāna's eyes and Mutsumi's clips. Portrait, cat and body coverage are separate.

## Implementation, observation and completion

Implement the [presence contract](docs/design/PRESENCE_SYSTEM.md) through actual owners: a chat/material quote reaches the same study object; agenda trial saves/undoes the same ID/revision; map unfolds the same surface/camera; a changed program input returns to the same model and survives the promised persistence level. Selection alone does not send, remember or approve. Keep cancellation, failure, recovery, keyboard and reduced motion in each affected relationship.

The six forms, seven creative responsibilities, full outing and eight details remain complete obligations. Overlays, paired pointers and side-by-side views use true relations; comparison groups, personal drawings, preparation at its useful location, useful-only return changes, taskless calls and causal play become real processes the person can alter. A blink, glow or first-character slice cannot replace them. Normal motion, reduced-motion equivalence and resource fallback are accepted separately.

Existing spring, easing and Web Animations code establish useful mechanisms, not a completed universal physics standard. Introduce a spring for a real return/trial/container takeover benefit and inspect velocity continuity, reversal and interruption without damaging already correct behavior.

The primary agent inspects relevant design originals and the final integrated rendering, operates the affected tasks at normal speed, fixes correctable defects and rechecks the original trigger. Builds, static images, historical checks, returned-model identity, native device results and present experience have different evidence scopes. [CURRENT_STATUS](docs/CURRENT_STATUS.md) records actual observations; the [roadmap](docs/DEVELOPMENT_ROADMAP.md) preserves uncompleted normal dynamics, full cast/page/theme coverage and future independent devices. This specification itself certifies none of those results.
