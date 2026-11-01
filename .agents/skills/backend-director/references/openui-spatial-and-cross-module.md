# Live creations, spatial continuity and original owners

Inspect the actual [program](../../../../src/main/runtime/interactive-program.ts), [local state](../../../../src/main/runtime/interactive-program-local-state.ts), [shared library](../../../../src/shared/interactive-library.ts), [source bookmarks](../../../../src/main/runtime/source-bookmark-native.ts), [study](../../../../src/main/runtime/study-companion.ts), [agenda](../../../../src/main/runtime/native-agenda.ts) and [map routing](../../../../src/shared/map-routing.ts). Design names below are proposals until mapped to real registered contracts.

## A program in the conversation

The primary model constructs a finite, checked OpenUI program through `present_view`. Keep its DSL/AST, real scene/program identity, version and sources rather than replacing it with a screenshot, fixed card or arbitrary JavaScript execution.

Read actual signatures before relying on a primitive. The library provides graphic/curve/point/line/area and direct-handle/time/motion responsibilities, as well as finite press/sound/signal behavior. Conceptual names such as Linkage, Fulcrum, Hammer and Damper are **future mechanism design**, not evidence those components are currently registered. Prefer expressive general geometry, constraints, parameters and sound to a hard-coded piano page. String frequency `f₁=(1/(2L))√(T/μ)` can express a specific approximation; units, range, harmonics, damping and limits remain explicit. A simplified model is not a measured mechanism or a realistic piano by itself.

Real data refreshes through its original owner and stable reference; never transcribe fabricated campus records into the DSL. A source slot or view can be legitimate without granting its body to every future model purpose.

### Construction, revision and input return

- Streaming tool arguments may expose genuine generating/checking activity at the reply's text anchor. Only a closed, checked unit executes. Early appearance is not a successful save or accepted work.
- `previous + patch` identifies original message/program/revision, checks current permission and updates that same work. Retain unaffected declarations, parameters, source dependencies and its place in the reply.
- Existing local input persistence uses the owner's CAS and expected state revision, coalescing UI updates around its current interval (historically 120ms). Store durable inputs; transient press/play state has its own lifecycle. This is neither just localStorage nor a model request every frame.
- Continue sends the original program identity/node and **send-time state snapshot** into the same loop. The host validates and exposes the actual current inputs. New user changes made while waiting remain distinct so a late patch cannot reset them to an old initial value.
- On reopening, refresh original data through current permissions, distinguish missing/stale data, and preserve permitted user inputs. A stale screenshot or copied data body is not live recovery.

## One authority per object

Conversation, agenda, study, materials, notes and map are important spaces, but not a closed enumeration of what the assistant can understand. Activity, interactive works, letters/curiosity, character/theme settings and new real surfaces also register current readable semantics, available actions and return/readback paths.

| Object | Authority | Concrete identity and guard |
| --- | --- | --- |
| Original message quote | Evidence repository/bookmark owner | sessionId/messageId/contentVersion/hash/Unicode range; selected DOM text alone is not verified source. |
| Material or PDF quote | Material owner | resourceId/version/hash/page/range/crop; no detached unversioned text. |
| Note passage | Notes owner | noteId/revision/content hash/range; current draft cannot be silently overwritten and an actual concurrent change reaches the runtime. |
| Problem and attempt | Study owner/Work | problem identity, original source and revision; prior problem sources remain traceable. Given/read help does not establish mastery. |
| Calendar occurrence | Calendar/agenda owner | original ID/revision/occurrence, with trial distinct from actual commit. |
| Place and route | Map owner/reviewed data | route/version/stops/geometry source; an illustration is not geometry and a discussed place is not GPS. |

## Five complementary protocol proposals

`R` below must become the original owner's concrete reference union—message/material/note, agenda occurrence, route, Work/Scene/Program or another registered object. It does not permit arbitrary URIs or copying bodies into a universal fact store. `D` is a schema-checked delta of the correct owner, not arbitrary JSON/script. Start from existing focused/current object context and source contracts.

```typescript
interface AIPointerTarget<R> {
  pointerId: string;
  targets: { key: string; ref: R }[];
  relation?: { from: string; to: string; explanation: string; basis: R[] };
  cueId: string;
}

interface TracingPaperMatch<R> {
  previous: R;
  current: R;
  pairs: { previous: R; current: R; explanation: string }[];
  changedConditions: string[];
  mode: 'overlay' | 'paired-pointers' | 'side-by-side';
  alignment?: { matrix: [number, number, number, number, number, number]; basis: R[] };
  proposalRevision: number;
}

interface CanvasCollaborativeDelta<R, D> {
  operationId: string;
  groupId: string;
  target: R;
  baseRevision: number;
  author: 'user' | 'companion';
  operation: D;
  dependsOn: R[];
  phase: 'proposed' | 'preview' | 'submitted';
}

interface TravelingContextSnapshot<R> {
  threadId: string;
  focus: R[];
  relationRefs: R[];
  checkpointRef?: R;
  operationGroupId?: string;
  cueId?: string;
  carrierStyleId: string;
}

interface RelationalToken<R> {
  id: string;
  revision: number;
  target: R;
  appearance: { kind: 'preset'; styleId: string } | { kind: 'user-artwork'; ref: R };
  meaningRefs: R[];
  adoptedFrom?: R;
  createdAt: string;
}
```

**Pointing:** page/range/AST identity follows the owner; frontend resolves screen projection. Do not force map edges into document page fields. A new target retires the old cue and updates the same model context and explanation. Distinguish the companion pointer from the user cursor, support an A/B relation and retire emphasis naturally. A method name such as `amend_pointer` must be registered before it is treated as real.

**Recognition:** actually read old/current originals and explain correspondence and changed conditions. The user can reject or move a pair. Overlay requires a valid spatial mapping; do not warp two objects to manufacture mathematical equivalence. Rotation/exponential, plan/outing, first/revised draft and concept/full model can use any of the three modes. Hold/release has a click and keyboard equivalent; opacity alone is not the feature.

**Turn-taking:** each owner supplies the real delta for an auxiliary line, endpoint, route candidate, agenda trial, paragraph or parameter. Accept one part without deleting later user work. Changed premises invalidate or recompute dependent suggestions. An actual owner receipt supplies result and new revision; frontend animation cannot fill in success. Offer, unfold, take and retract feel related without delaying content or overriding input.

**Travel:** carry identity, relations, current lawful versions, unfinished question and stop, not just a symbol. Preserve a local comparison layout and semantic grouping; another device adapts viewport rather than copying every pixel or taking focus. A reviewed carrier can be orb/paper/tray/desktop/sound/status; a glow is supplementary. Continue only compatible contact and current cues. On a new use, recheck source, grant, persona and version—snapshots cannot restore cancelled work or expired permission.

**Marks:** keep presets alongside real user strokes, drawings or image versions, including imperfect shapes. Fetch meanings from the original owner instead of storing another permanent quote. A narrow-path reason can inform a later plan and a problem's nickname can connect to a new attempt. Renaming, redrawing, removal, correction and forgetting propagate to actual projections, while ordinary revision preserves independent lawful history. A shared mark grants no action authority.

## One two-way experience

Original references → current semantic relation → the same model investigates/explains/proposes/revises → original owner action/result → character/object/sound → explicit correction or takeover → actual new owner state. Gentle calls and jokes use this same conversation when semantics are needed; local response never waits on a model and no extra animation agent is created.

Verify the actual continuous sequence: understanding of the relation, real object change, partial adoption, return and state readback. Declaring the five interfaces, drawing a motion or saving one program does not complete the full [roadmap](../../../../docs/DEVELOPMENT_ROADMAP.md).
