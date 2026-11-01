# Existing implementation and the seams worth investigating

This working paper preserves concrete code-review reasoning and failure experience. Historical findings are investigation leads, not assertions that the current product still has the same defect. Use the actual [navigation](../../../PROJECT_NAVIGATION.md), [architecture](../../ARCHITECTURE.md), [current capability record](../../CURRENT_STATUS.md), lock files and running build. The formal redesign stages remain unfinished.

## What evidence establishes

Distinguish a file obtained, its full or selected text read, a document's implementation claim, a static code relationship and a current observed workflow. None implies all the others. A repository tree can be complete as a path inventory without every source line, image, binary or actual runtime having been inspected. A screenshot can establish a visible problem without proving its cause.

The earlier review found useful examples in both product and reference screenshots: repeated “nothing changed” disclaimers, a discussion prematurely classified as a layer, a note's relevant middle missed, route/weather work stranded at a read limit and character art obscuring content. These observations justify a desired experience to repair. They do not alone identify a prompt, function or model as the cause. Reference character continuity is inspiration; its exact suggestions, claims or unrelated entertainment features do not automatically become Anima requirements.

Keep code, the actual running build, a local packaged app and a public map preview separate. A branch name is not proof of an unmerged feature; inspect ancestry and content, and preserve shared uncommitted work. A research snapshot is not a reset target. Historical runtime/branch facts belong to their evidence, not to a current installation claim.

The pinned Hermes engine and OpenUI dependency are real implementation conditions. Read the actual [Hermes lock](../../../runtime/hermes/lock.json) and `package.json`. New online APIs, library-language versions, provider modes and framework defaults do not become present by reading their documentation.

## Follow the real call chain

The conversation starts at App's original input and enters the finite preload/main IPC. The Harness admits the original request, applies current source/processing/action controls and prepares the turn. Context compilation supplies permitted originals, current work, references, character and discoverable capabilities. The pinned sidecar/AIAgent uses host-owned model transport and tool registration. Tools reach the broker, domain services and bounded investigations; observations return to that same assistant.

Public text, source/result review, original Scene/Program/View identity and renderer interaction then reconnect to the next turn. The map, paper and current reference are part of the original conversation rather than another chat. A background path begins from a valid entrustment, business change or time node, passes through Attention/OpportunityScheduler and the same Harness, and preserves the same state and action boundaries. It is not a separate stateless periodic chatbot.

## Preserve existing value before replacing its mechanism

| Domain | Existing responsibility to locate | What presence alone does not prove |
| --- | --- | --- |
| Main loop and delegation | `harness.ts`, runtime Hermes adapter, sidecar, real tool rounds, independent children, shared scope/budget and parent adoption | Natural choice of inquiry on every appropriate question; engineering staffing is separate |
| Provider/transport | Provider, explicit development transport and model-selection modules | A configuration name is not a returned model identity, and no silent provider switch is authorized |
| Originals and understanding | Evidence/assertions, condition, support spans, correction, history and forgetting | Summary, hypothesis and candidate are not the person's explicit fact |
| Original readback | Browsing, context search, evidence/history reads, source-related navigation and memory inquiry | A directory is not its body read; a first miss is not absence |
| Optional semantic retrieval | Resource/method contract and candidates separate from source owners | Installed or declared resources are not evidence of default use or retrieval quality |
| Continuing work | Work, frames/options, planning intent, companion and study sessions | A second copied fact body or implicit renewed approval |
| Notes/materials | Independent Notes owner; TXT/MD/PDF bytes, pagination, pixels, parallel reading and exact references | Notes are not a profile; scan pixels are not OCR; local reading is not transmission permission |
| Campus sources | Explicit permitted imports/provider contracts, discovery, field scope, filtering, aggregation, pagination and source history | A university account connection, complete records or a real booking; no private campus service is bundled |
| Course/learning records | Course occurrences, study activities, assignments and exams | A new source branch replacing a valid existing aggregate, or grades establishing independent mastery |
| Local calendar | Events, tasks, deadlines, reminders, time blocks, recurrence/exceptions, zones, revisions and Undo | Local write, ICS generation, system import and external sync are different |
| Planning | Actual availability, preview/draft/recovery, preparation/travel/rest, budgets, continuing intent and partial adoption | A candidate is not accepted, saved or externally executed; dependencies need current source versions |
| Actions | Approval scope, expected revision, idempotency, outbox/attempts, receipts and unknown-result inspection | Timeout as failure, retry as harmless, or cancellation retracting an executed effect |
| Initiative | Entrustment, journal/cursor/ack, opportunities, prepare/wait/ask/notify/none and actual running host | Prepared as visible, OS-submitted as read, or process exit as continuing execution |
| Public research | Controlled search, webpage/PDF/original-image reads and bounded continuation handles | A search excerpt as full original reading, or external text as authority |
| Weather/air | Daily/hourly windows, separate source/units, configured public reference and incomplete fields | Interpolated minute-level or route-local facts unsupported by the source; no GPS implication |
| Space | Shared map service, topology/entrances, MapLibre and planar fallback, camera ownership | An estimate as an entrance, a device fix as a person's current position, or a diagram as campus navigation |
| Dynamic expression | Domain scenes plus the current finite program/library, real inputs and persistence | Autonomous use of every suitable expression or unrestricted executable generation |
| Shared learning/creation | Study/help, original chapters, letters, curiosity and rehearsal with actual owner links | Full long-term quality or every current model workflow observed |
| Persona | Editable core, original text-card draft, independent appearance adoption, revisions and conflict-preserved draft | Art as a complete role, preview as saved generation, or an image switch as core adoption |
| Methods | Discoverable bundled and personal methods, versions, dependencies and available paths | A permanent immutable method count, a high-privilege plugin or new permission |
| Direct manipulation | Navigation, calendar/notes, source correction, bounded entrustment and program inputs | The next model request receiving the current value unless the actual return path is wired |

The synthetic map and manual/imported campus sources are real foundation facilities with explicit identities and limits. They do not inherit institutional acceptance or geographical truth from another dataset. Keep the generic capability while requiring a genuine provider for an official record/action.

## Ten concrete seams and their present investigation

### C01 · Visible appearance and written identity can diverge

A prototype's default artwork and initially empty custom text core were independent states. This was a static reason to inspect a fresh profile, not proof that every user lacked a saved role. Recheck the present first-opening path: which actual written core and interaction settings enter the request, how the visible identity relates to it, and what explicit adoption does. Preserve existing users' saved characters. Do not force everyone to one default or call a portrait a complete personality.

Locate current `shared/persona*.ts`, Store settings, appearance and the character editor through navigation. Verify save/reload/conflict and image-only change separately. A settings description should accurately distinguish fixed illustrative preview from actual current generation.

### C02 · Several reasonable defaults can combine into a cold experience

An earlier interaction audit examined a combination of natural tone, no humor, adaptive depth, prepare-oriented initiative and meaningful-change preference, together with disabled optional weather/reminders. The question was how those defaults and a lively/close character actually interact. It was not permission to turn disabled services on behind the user's back.

Read today's defaults and composed request, then observe the first-use path. Can a user understand the real unconnected/disabled state and make a low-burden choice? Does selecting a character leave a contradictory setting suppressing its ordinary expression? Keep source, optional frequency, fixed reminder and notification-preview choices separate. Diagnose actual conflict rather than changing every default by guess.

### C03 · Incremental transport can be lost at an execution bridge

The concrete historical chain included a provider accepting a text callback, a main call passing no callback, tool-prefix publication after a complete model reply and a sidecar packaging the completed assistant turn as a streaming chunk. That supported a narrow finding: that path did not publish genuine token increments to the user, although it could speak between complete tool rounds.

Use those distinctions when reading the present implementation. Trace the actual callback, `model.request`, public event, `rhythm.offer` and final publication timing. Preserve the distinction between public prose and reasoning, between a tool intention and a result, and between cancellation and completed effects. A method named stream does not settle observed latency or granularity; a claim of absolutely no process conversation can be equally wrong.

### C04 · A rule against fake progress can also suppress real acknowledgment

Historical rhythm guidance tried to prevent empty “retrieving…” chatter by allowing speech only after substantive new information. The valuable motive remains: do not fabricate work. But a meaningful acknowledgment or relational response need not contain a new fact. Compare the actual role/request with the guidance that reaches the model rather than banning the same phrase everywhere.

Another seam was final text deduplication based on an exact published prefix. That does not automatically recognize semantic repetition. A final answer might repeat a name, table or prior result even when no literal prefix matches. Reproduce the particular effect before calling every reply repetitive. Improve event/message semantics and the original generation path, not a separate universal warm-rewrite model.

### C05 · Preparation, a message and a notification are distinct paths

An earlier background route could downgrade notify to prepare under its initiative setting, require real new value/channel for notification, and expose a narrower tool set than foreground creative work. That made a real question: can a letter or curiosity creation happen in the foreground yet never arrive as actual background help?

Follow today's valid entrustment, permitted tool set, investigation, original artifact/work identity, message append, exposure/deduplication, channel and continuation. Do not simply hand the entire foreground tool set to the background; it can carry different write/audience/purpose implications. Nor does an artifact entry prove the companion has approached the user. Preserve current capabilities while the future proactive stage addresses its actual missing consumers.

### C06 · Fixed notification copy is not the character's private message

An earlier reminder implementation used fixed application titles and a generic instruction to open details. That was delivery code, not character-authored conversation. When improving this, build the actual private message and original result first, then derive an appropriate OS/lock-screen projection under the user's preview setting. Personalized does not mean disclosing the whole private body on a lock screen.

Inspect current native platform support and receipts separately. OS submission, platform delivery, opening and reading are different states. Do not use a changed title alone as proof of a complete proactive encounter.

### C07 · A precise fixed teaching primitive is not general construction

The quadratic teaching declaration deliberately bound values, graph and tangent to one exact model. It was a useful precise primitive, but a waveform involving phase, time and superposition exceeded that specific contract. Today's broader finite interactive-program layer already exists; calling the whole product quadratic-only would be stale.

Preserve exact computation and actual current state while planning general authoring, constraints, graphics, motion/audio and composition. Another sine-only scene would repeat the old limitation. Check formula, units, coordinates, domain, time and parameter meaning independently of a reference image. The future whole OpenUI redesign must preserve existing real programs and their CAS/input readback.

### C08 · Scene identity and consumption have produced real visible failures

Retained project observations described a normal calendar flow first failing to obtain a usable scene, later showing duplicate scenes and a whole table repeated in prose, and then being repaired through a qualified read and continuation of the original object. Those were historical actual-workflow observations, not a new run made for this paper.

Use the experience to inspect a new domain, a repeated tool, a historical reference and a live update. Does the model receive a legal SceneRef, actually choose to present it, render one coherent object and understand the later selection? Directly projecting a pretty component cannot establish autonomous use. Preserve useful independent prose when one surface fails.

### C09 · Prompt length alone does not identify the cause

The old system file contained many dense long lines, then acquired role, interaction, rhythm, scope and specialized task guidance at composition time. Counting its lines did not explain exactly why the voice became cold, repetitive or hesitant.

Inspect actual permitted prompt composition, responsibility, conflict, repetition and timing. A bounded sanitized development view can help, but must not become an unguarded debug IPC, private-reasoning export or automatic personal-profile dump. Measure the relevant observable change before and after a meaningful adjustment. Do not solve every difficulty by appending one more restriction at the end.

### C10 · A documented freeze can outlive the implementation

An older note described the normal story-setting entry as frozen and its renderer absent. The current source has the foreground story-setting path: permitted original work/version and public setting selection return with the same composer and can continue a fictional chapter. Preserve that real path rather than deleting it from an obsolete description. Wiring is still not a claim that every workflow was observed in this foundation.

Similarly, optional semantic candidates/resource declarations do not establish default initial injection. The current product retains original/lexical readback and an optional-resource contract. A later retrieval choice needs actual resource identity, language suitability, source/delete semantics and observed benefit. Do not present a missing resource as a working semantic model.

## Broader limits remain concrete

Whole-database encryption, independent mobile hosting/synchronization, real device measurements, email/outward adapters, institutional writes, voice, general OCR/Office handling and a product-provider login each need their own implementation and evidence. They cannot be inferred from a vision, a narrow bridge, a responsive screenshot or an engineering subscription.

Historical check counts, scenario counts, screenshots and package versions retain their original scope; none is a current pass count. Image inventories locate material but cannot replace actual pixel inspection. An image must also have truthful admission, purpose and rights; generated character art does not itself grant redistribution permission.

Use current file responsibilities rather than copied old line numbers or an inaccessible remote path. The early seam is the investigation target: if a tool result never reached the next model request, more character wording will not repair it. If correct evidence arrives but a final template flattens it, rebuilding the memory store may be unnecessary. Independent judgment starts with that distinction.
