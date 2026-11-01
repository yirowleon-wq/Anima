# Character and scene coverage

The machine-readable [coverage inventory](../../visual-assets/coverage.json) records concrete assets, current readers, owners and remaining work. It does not claim that every required combination has been generated, integrated or observed. Sakiko's new performance chain, the ten-character world and the interface redesign remain incomplete. The [asset manifest](../../visual-assets/manifest.json), scene registrations and [current status](../CURRENT_STATUS.md) retain their distinct file and observation authority.

## The real 360-slot inventory

The JSON contains one required record for each **10 characters × 9 page families × 4 manual themes**. This is 360 explicit base slots, with supported/sparse activity, time, season, expression, weather, pose, contact, appearance, device, layout and audio facets. It does not multiply every facet into an unhelpful Cartesian grid.

At the current inventory snapshot, **120 slots have a selected static fallback and 240 have no admitted same-character/manual-theme body source for their actual default page route**. These are inventory states, not a quality score. Required normal motion remains incomplete in every slot; local eye/blink, position handling and light-transition code have their own narrower records. Every current-view/runtime-acceptance field remains unknown without a scoped receipt. Source/static admission and matching hashes do not prefill those fields.

| Record | What it actually contains |
| --- | --- |
| `slots` | Each stable page/character/theme ID; separate art, layout, motion and actual-adoption state; concrete selected/candidate refs; actual App binding and consumer SHA revision; facets and named next work for that combination. |
| `hashAllowlist` / `artifactCatalog` | Only currently selected target manifest files with exact matching bytes; per-file path, hash, role and manifest inspection state. This inventory initially references 221 existing art resources, not an unreviewed recovery pool. |
| `registrationCatalog` | The 44 existing literary scene records, actual file/revision, mother/layers, activity versus neutral purpose, canonical theme/light, geometry/support, original static flag and exact mother admission. It does not claim the full resolver or integrated experience was executed. |
| `consumerCatalog` | The 38 current source consumers and exact SHA revisions used for this snapshot. This is source inspection, not a runtime receipt. |
| `timeOnlyVariantCatalog` | Independently registered neutral day/night sources with their canonical light/theme/geometry. They do not count as every requested manual theme or activity. |
| `representationCatalog` | Ten independent portrait and original edge-cat resources, scoped separately from human full-body coverage and current small-size/runtime review. |
| `pageProfiles` / `facetProfiles` | One maintained description for repeated requirements, mood direction, virtual time, seasonal gaps, device/audio conditions and preview assumptions. Individual slots bind these to real character, page, theme, source and next action. |
| `retainedLibrary` | Retained good art and design material already indexed by the current manifest, separately from runtime. More material being curated must receive a positive manifest/task entry; absence here is never permission to discard a retained image. |

Examples of the actual mapping, without upgrading the result:

- `S2_STUDY:sakiko:apricot` points to the complete supported study mother through `WorkspaceScenery` and the current study layout. It is a static study setting, not a newly completed handoff or explanation chain.
- `S6_MAP:sakiko:mist` points to the near-desk Mist setting and its **blink-only** patch. The Apricot near-desk variant has limited local iris travel; neither supplies a complete map-directed body/hand performance.
- `S6_MAP:taki:violet` can reference the existing same-theme attention registration on the real conversation-map route. General attention art does not approve a route-specific gesture or full map interaction.
- `S1_HOME:mutsumi:mist` has no exact manual-theme activity body. Its independently registered automatic-unknown day presence retains its canonical Mist/day source; that automatic alternative is recorded without closing the manual activity slot.
- `S1_HOME:anon:rain` remains missing for the required body/theme combination. The independent portrait can keep a different representation usable; a warm-day body is not silently relit or counted as rain.

Soyo's specific listening variants, Taki's attention variants and the other sparse activities remain actual registry references rather than being multiplied into approval for every page. All ten characters' own judgments and activity directions remain available for interpretation. Season is illustrated art direction: the existing literary direction is autumn-biased, with individual interpretation still awaiting image review, while spring, summer and winter remain missing directions rather than being marked inapplicable. Mood is a character's expression and motive, never an inferred diagnosis of the user.

Each record's `coverageState` describes the available fallback/missing resource at that scope. `art`, `layout`, `motion` and `actualAdoption` must be read separately. Existing source code or a matching selected mother is not current visual review; a source-approved still is not runtime or dynamic acceptance. A required missing action cannot be made `not-applicable` to finish a count. The inventory itself generates no art, runs no product tests and schedules no work.

## Three connected matrices

1. **Identity:** the ten complete [passports](../characters/README.md), chosen outfit/version, recognizable appearance, user-editable role and original interaction. [Portrayal](../../src/shared/persona-portrayals.ts) and [participation](../../src/shared/persona-performance.ts) feed the same primary model. Appearance does not rewrite personality or historical signature.
2. **Scene:** family, exact mother/canvas, camera, floor/seat/bed planes, content safety, light/weather/time and compatible devices/layout. Existing [scene code](../../src/renderer/companion-scenes.tsx) reads reviewed registrations and qualified mother identities; do not replace its admission checks with an unrestricted glob.
3. **Posture and transitions:** actual body/support topology, hip/knee/ankle continuity, hand/prop contact, gaze, foreground/occlusion, allowed travel, related audio and interruption. An activity label or changed prop does not create a new body topology.

All production uses **scene × character × time × season × mood × action**, with meaningful **activity, theme, weather, outfit/appearance, representation, device/viewport, layout, pose, contact anchor, prop owner and audio**. The dimensions organize required work and justified reuse; they do not demand every meaningless permutation.

## Status has a scope

| State | Meaning |
| --- | --- |
| approved | A specific asset or experience was accepted for a stated use, version and review scope. Static asset approval does not approve motion, a new pose, another character or a different device. |
| shared-compatible | A reviewed source is legitimately reused for this slot with explicit same identity/spatial/light/contact requirements and actual use evidence. Sharing a name is insufficient. |
| static-fallback | The feature stays usable through a qualified static view or reduced local performance while normal required motion is unavailable. The normal motion obligation remains open. |
| not-applicable | A real semantic reason makes a combination unnecessary, recorded per slot. Difficulty, missing tools or insufficient assets is not such a reason. |
| missing | A necessary image, pose, motion, control, source or observed interaction has no accepted equivalent yet. It stays a named work item. |

Keep separate fields/records for generation, static qualification, current target inspection, runtime adoption, actual continuous operation and device evidence. A prior accepted mother, `active-mothers.json` entry, existing layer, code path and present visual review prove different facts. Pending current review is not silently promoted to approved. Retirement overrides historical approval; no deleted/rejected image returns as a candidate, reference, fallback or identity input.

## Present representations and remaining work

| Representation | Actual entry | Present boundary and next useful unit |
| --- | --- | --- |
| Ten editable identities | shared persona/portrayal/participation modules and complete passports | All ten names, distinct participation and custom-role/legacy reading are retained in English. Direct schema reads establish data validity; they do not establish ten live model performances. Use the first shared-attention unit to examine actual understanding and expand without turning people into fixed business roles. |
| Ten independent portraits | Current portrait registry and manifest | Independent close images exist. Qualification requires actual 34px/48px circular and integrated chat/title viewing on relevant themes; a file alone does not close that review. Keep portrait and full-body coverage separate. |
| Literary full-scene mothers | Current runtime scene registrations | Existing static chat/presence and selected reading/study/listening/attention/resume combinations remain as their exact qualified resources. The registry, not a historical matrix count, determines what exists. Uncovered actions and distinct furniture/body relationships remain missing. |
| Near-desk/desk/agenda environments | Workspace scenery and admitted runtime assets | Different cameras/seats and paper placement require their own compatible support; do not apply one window-seat transform to every room. Refer to the current observation record for live layout and interaction; they cannot be inferred from the picture. |
| Local eyes | Current compatible rig registration and companion motion code | Qualified local eye/blink capability remains limited to its exact mother and channels. It does not establish arms, mouth, whole-body movement or current model understanding. Required gestures beyond it remain missing. |
| Ten horizontal edge cats and existing facing variants | Edge companion registry, body/tail and support geometry | Preserve qualified existing horizontal originals, including opposite-facing variants where present. Select facing direction without mirroring asymmetric identity; vertical docking rotates that same selected resource, all layers and registered contacts together by 90 degrees. No independently drawn upright resource or new direction-production task is introduced. Keep complete support, true transparency, tail-root movement and same-Harness summoning without consuming the draft. These forms do not complete human posture coverage. |
| Time/weather backplates | Current scene/environment registry | Time, weather and palette are independent. Unknown external conditions use the truthful configured/time-only alternative; a rainy theme is not measured rain. A complete light field must remain compatible with the person. |

The ninety original [activity directions](../characters/activity-directions.json), including care/approach/yield/gaze for each character, are fully retained as **revisable proposals**. They are neither completed scenes nor runtime keyword dispatch. A concrete per-cell brief uses the full passport/outfit, reviewed spatial mother, actual shared object and reason for this moment.

## Nine pages and four themes

Each character has meaningful coverage obligations across **home, study, materials/PDF, agenda, notes, map, cast, theme and return/interruption recovery**, in **Warm Apricot, Morning Mist, Dusk Violet and Night Rain Gold** where applicable. The activity axis independently uses chat, study, reading, planning, rest, listening, play, attention and resume. Do not equate nine pages with nine activities or nine poses.

| Page | What a completed slot must preserve |
| --- | --- |
| Home | Full-room entry, original work address/draft, independent character activity and an explicit path to resume. Choosing the full cover is a separate action. |
| Study | Real problem/attempt/help, exact selected/corrected line and sufficient explanation. Writing/pen input yields immediately without a layout jump. |
| Materials/PDF | Stable actual bytes/text/page pixels, quote/version/selection, useful narrow reading and return to the original spot. |
| Agenda | Actual alternatives, full occupation, trial versus save, conflict, partial adoption and truthful undo/unknown outcome. |
| Notes | Same editable note, independent user words, draft/CAS/history/trash and source return; a quiet aggregation does not create another body store. |
| Map | Same surface/camera/route and meaningful manual exploration, accepted source geography or clearly synthetic demo, fallback and no automatic location request. |
| Cast | Independent appearance/personality preview, adopt/cancel, current role revision and unmodified historical authorship. |
| Theme | Complete room/person light with stable controls, readable long English/formulas and genuine choice; no green UI or day/night split. |
| Return/recovery | Same objects/comparison relation, stop/draft/selection/focus and legitimate new changes only, including failure/cancel/revocation and reduced motion. |

In every required slot, direct manipulation takes priority, original facts remain authoritative, keyboard/mute/reduced motion stay usable, and missing normal performance remains open rather than renamed complete. Motion review includes actual passage through look/yield/offer/unfold/retract/resume/play, not just final screenshots.

## Production sequence and meaningful next work

Use **common spatial grid → Sakiko across key scenes → expand the other characters → fill same-slot gaps**. Sakiko is the first complete route, followed by Mutsumi and the existing Tomori/Anon priorities. A proposed complete expansion order may follow Taki, Soyo, Rāna, Uika, Umiri and Nyamu; this later order is a reviewable planning choice, not an immutable human decision or canon fact. Use actual qualified resources and differences to adjust it transparently.

After the [Stage 00 native foundation](../development/SWIFT_FOUNDATION_AND_CHARACTER_CONTINUITY.md), the proposed first character-language unit is Sakiko's study-and-return chain: own activity → real passage → exact “here” → corrected neighboring line changes understanding → writing makes room → leaving and returning restores the same thought. Use a suitable retained approved image-led design or create a clean new one before final implementation. A successful slice proves that path only; it does not close the whole stage, ten-character world, common runtime redesign or required full-body dynamics.

Subsequent units extend complete, useful experiences rather than indefinitely polishing one character or only recoloring ten portraits. Formal stage execution retains eight substantive exclusive modules, primary-agent integration and real acceptance. Record the version, observed result, open gesture/asset/device/source conditions and next entry in [continuation](../continuation.md). The [roadmap](../DEVELOPMENT_ROADMAP.md) carries full normal-motion, same-object, audio, outing and independent-device obligations.
