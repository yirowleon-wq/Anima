# Project navigation

This page describes actual ownership and entry points. [Current status](docs/CURRENT_STATUS.md) records what was observed; [the contract](docs/PRODUCT_CONTRACT.md) states behavior to protect; [the roadmap](docs/DEVELOPMENT_ROADMAP.md) retains unfinished development. None of these grants new data or action permission.

## Read for the task

| Task | Entry |
| --- | --- |
| Install, launch, model and platform conditions | [README](README.md), `package.json`, `.env.example` |
| Installed component roles and source boundaries | [Runtime components](DEPENDENCIES.md), `runtime/component-map.json` |
| Resume development | [START_HERE](START_HERE.md), [continuation](docs/continuation.md), [working notes](docs/development/README.md) |
| Claude Code project entry | [CLAUDE.md](CLAUDE.md), the same [AGENTS](AGENTS.md), and the maintained `.agents/skills` bodies |
| Experiences and implementation mapping | [Project guide](docs/PROJECT_GUIDE.md), [component map](runtime/component-map.json) |
| Product decisions and control | [PRODUCT_CONTRACT](docs/PRODUCT_CONTRACT.md), [project foundations](.agents/skills/project-foundations/SKILL.md) |
| Main loop, privacy, source and action semantics | [ARCHITECTURE](docs/ARCHITECTURE.md), [backend direction](.agents/skills/backend-director/SKILL.md) |
| Layout, character, motion, theme or art | [FRONTEND_DESIGN](FRONTEND_DESIGN.md), [frontend direction](.agents/skills/frontend-director/SKILL.md), [presence](docs/design/PRESENCE_SYSTEM.md) |
| A character's identity or portrayal | [Complete passports](docs/characters/README.md), then the selected character and outfit |
| Campus data, time, grading, map and environment | [CAMPUS_AND_ENVIRONMENT](docs/CAMPUS_AND_ENVIRONMENT.md), actual adapter and shared types |
| Full stage responsibilities and future scope | [DEVELOPMENT_ROADMAP](docs/DEVELOPMENT_ROADMAP.md), [experience requirements](docs/EXPERIENCE_REQUIREMENTS.md) |
| Native Swift foundation and character continuity | [Stage 00 and the 38 block-specific obligations](docs/development/SWIFT_FOUNDATION_AND_CHARACTER_CONTINUITY.md); present architecture and actual Mac evidence remain separate |
| Choose a substantial future block, its materials and recovery | [Work sequence](docs/development/WORK_SEQUENCE.md), the linked 38 work orders and [complete working materials](docs/materials/README.md) |
| Memory/context acceptance within those blocks | [200 full question gates](docs/scenarios/MEMORY_GATES.md), [38-block scope map](docs/scenarios/MEMORY_GATE_SEQUENCE.md); each work-block body also includes its actual relevant acceptance wording |

## Single implementation

```text
src/main/             host, credentials, SQLite, permission, providers, tools, effects
src/main/runtime/     model collaboration, context, work, scenes, program and recovery
src/main/memory/      original evidence, understanding, retrieval, derivation and forgetting
src/main/actions/     calendar, planning, attempts, receipts, reminders and export
src/main/materials/   original files, PDF text/pixels and isolated native worker
src/main/notes/       independent writing, revisions, conflict, history and trash
src/main/storage/     persistent owner records and exact source/dependency relationships
src/renderer/         one conversation workspace, live papers and direct manipulation
src/renderer/map/     shared MapSurface, camera, routing display and planar fallback
src/shared/           finite bridge types, persona, scene, program and domain contracts
runtime/hermes/       pinned Python sidecar and lock
runtime/embedding/    optional-resource contract; no bundled semantic model
prompts/              actual model instructions and bounded investigation methods
assets/map-v2/        selected synthetic or explicitly imported map data
visual-assets/        selected art, exact hashes, scene geometry and design references
apps/review-web/      public-map-only preview reusing the same map implementation
.agents/skills/       maintained project development skills
scripts/              existing setup, build, staging, import and check entries
tests/                retained existing mechanism checks
docs/                 current contracts, capabilities, design, roadmap and working notes
```

## Find the real owner

| Object or workflow | Authority and implementation |
| --- | --- |
| App/window/IPC | `main/main.ts`, `main/preload.ts`, `renderer/main.tsx`, `renderer/App.tsx` |
| One assistant loop | `main/harness.ts` → `main/runtime/hermes.ts` → `runtime/hermes/sidecar.py` → pinned `AIAgent` |
| Provider and transport | `main/luna-provider.ts`, `model-selection.ts`, `network.ts`; Connections selects the normal live Luna route or offline demo. `provider.ts` retains the explicitly configured compatible-wire adapter; `scripts/run-luna-test.mjs` is an explicit Luna launch alias. |
| Permission and purpose | `runtime/policy.ts`, `controls.ts`, `turn-controls.ts`, `read-purpose.ts`, `privacy-control.ts`, `action-delegation.ts` |
| Tool discovery | `main/tools.ts`, `capabilities/registry.ts`, `runtime/skills.ts`, `tool-surface.ts` and domain providers |
| Investigation and memory inquiry | `runtime/background-delegation.ts`, `delegation-evidence.ts`, `investigation-frontier.ts`, `memory-inquiry.ts`; method in `prompts/memory-inquiry.md` |
| Memory and original readback | `memory/service.ts`, `model.ts`, `retrieval.ts`, `browse.ts`, `source-related.ts`; `runtime/context.ts`, `continuity.ts`; `storage/repository.ts` |
| Persona and appearance | `shared/persona*.ts`, Store settings, `renderer/PersonaEditor.tsx`, `CompanionSettings.tsx`; appearance is separate |
| Current object, relation and return | `shared/workspace-context.ts` → renderer context/App → runtime context/coordinator; `renderer/workspace-return.ts` |
| Composer and reading | `App.tsx`, `ConversationComposerDock.tsx`, `ReadingDesk.tsx`, `ReadingDivider.tsx`; no second chat input |
| Materials and PDF | `main/materials/service.ts`, `pdf.ts`, `worker.ts`, `renderer/MaterialsPanel.tsx`, `MaterialPdfPage.tsx` |
| Notes and search | `shared/notes.ts` → `main/notes/service.ts` → Store/Bridge → `renderer/NotesPanel.tsx`; `main/search.ts`, `LocalSearchPanel.tsx` |
| Study and personal methods | `runtime/study-companion.ts`, `study-native.ts`, `personal-methods.ts`, `method-work-help.ts`; `presentation/StudySceneView.tsx` |
| Calendar and trial placement | `shared/calendar.ts`, `main/actions/calendar.ts`, `local-calendar.ts`, `runtime.ts`; `AgendaDayTimeline.tsx`, Workspace/LifePanels |
| Planning and adoption | `actions/planning*.ts`, `runtime/planning-intents.ts`, original `planRef` / proof / attempt ledger |
| Calendar export | `shared/calendar-export.ts` → preload/main → `actions/calendar-export.ts` → original accepted agenda instances |
| Entrustment and preparation | `runtime/attention.ts`, `cooperation.ts`, `opportunity-scheduler.ts`, `EntrustedPanel.tsx`, `EntrustedRevision.tsx`; original work/release records |
| Reminders | `actions/reminders.ts`; operating-system submission and opening remain separate |
| Work, story, rehearsal, letters | `runtime/work.ts`, `collaboration.ts`, `curiosity-invitation.ts`, `story-setting.ts`, `relationship-rehearsal.ts`, `reflective-letter.ts`; corresponding presentation views |
| Scenes and presentations | `shared/scenes.ts`, `presentation.ts` → runtime scenes/projections/compiler → `presentation/AssistantPresentation.tsx` |
| Interactive programs | shared `interactive-library.ts`, `interactive-functions.ts`, `interactive-program.ts`; runtime `interactive-program*.ts`; renderer `InteractiveProgramView.tsx`, `program-local-state.ts` |
| Program state | original program identity/revision → finite bridge → `NativeProgramLocalState` → SQLite CAS; App reads a sending-time snapshot |
| Room and supporting geometry | `renderer/companion-scenes.tsx`, `WorkspaceScenery.tsx`, `companion-d01-motion.tsx`, `EdgeCompanion.tsx`; [asset manifest](visual-assets/manifest.json) |
| Shared map | `main/mapService.ts`, `mapProfile.ts`, shared map types/routing, renderer `CampusMap.tsx`/`ConversationMap.tsx`, `map-engine.ts`, `planar-map.ts` |
| Workouts | `runtime/workout-session.ts` is the one owner; `workout-storage.ts`, `workout-native.ts`, `capabilities/workout.ts`, map workout layer |
| Campus records | `main/academicAdapter.ts`, `campusActivityAdapter.ts`, `storage/domains.ts`, `runtime/campus-*.ts`; explicit imported sources, no implied account connection |
| Weather and air | `capabilities/weather.ts`, `air-quality.ts`, shared and runtime environment; configured public reference point, not GPS |
| Outward draft | `runtime/release-store.ts`, `release-composer.ts`, `release-projection.ts`, `redaction.ts`; no automatic sending |

## Current strategy

Natural language is the primary entry. Existing specialized views open around the current object and return to the same conversation. The planned native Swift foundation precedes the first existing development block, which deepens Sakiko's continuous study-and-return experience; both preserve the existing capabilities and the other nine editable identities.

UC Irvine and America/Los_Angeles are configurable public defaults, not an account, enrollment or personal schedule. The synthetic map is a real routable demonstration with an explicit identity, not campus navigation. Importing an authorized file is not querying a live university service. A future provider must preserve source, freshness, authorization and action-result boundaries.

The long-term work redesigns the complete Harness and OpenUI interaction systems in stages. Current mechanisms may be replaced when their full behavior, data, permission, cancellation and recovery equivalents exist. Do not add a parallel permanent engine or fact store, or delete a capability merely because its replacement is difficult.

## Evidence and privacy

Use the existing project commands and the normal application. [Current status](docs/CURRENT_STATUS.md) states the actual platform, build and observed workflow boundaries. Documentation, compilation, model behavior, rendering, motion, external records and physical devices each require their own evidence.

Protect private profiles, credentials, personal databases, account history and diagnostic data. The public preview contains only selected map data.
