# Hermes, bounded agency and auditable actions

Implementation entry points: [harness](../../../../src/main/harness.ts), [Hermes adapter](../../../../src/main/runtime/hermes.ts), [sidecar](../../../../runtime/hermes/sidecar.py), [tools](../../../../src/main/tools.ts), [runtime skills](../../../../src/main/runtime/skills.ts), [planning actions](../../../../src/main/actions/planning.ts) and [release projection](../../../../src/main/runtime/release-projection.ts). Inspect current code and the [capability baseline](../../../../docs/CURRENT_STATUS.md); a document's type or method name does not establish a registered interface.

## Pinned AIAgent and four narrow adapters

Use the pinned Python Hermes `AIAgent`, with version/commit in [lock.json](../../../../runtime/hermes/lock.json), rather than adding a simple competing tool-call loop. Engine receipts retain the real commit and adapter hash. The coordinated Anima protocol prefix is `anima.*`.

| Adapter | RPC responsibility | Boundary |
| --- | --- | --- |
| RunFactory | run start/ready and child authorize/open | Establish main/child AIAgent identity with runId, privacy epoch, task version and bounded tool set. |
| StateSink | child event/result and run complete | Record queued/running/produced/consumed/failed state, compression receipts and final message sequence. |
| TransportObserver | model complete | Python owns no API key and cannot call a model by a side route. The host rechecks current sources, permitted transmission, budget and actual usage, publishing only legitimate public content. Current provider contracts decide output budgeting; an advisory output allowance is not a post-completion rejection limit copied from an old number. Compression and cancellation stay in the pinned loop. |
| ToolBridge | tool call | Dispatch through ToolRegistry with the current ScopeHandle, AbortSignal and context receipt. |

## Progressive discovery

L0 is a compact directory of capabilities: experience recall, planning, configured campus records, maps, notes, materials, study, live interactive creations and external draft preparation. L1 `look_up` gives the selected domain's useful methods and prerequisites. L2 supplies precise working details, DSL signatures and coordinate contracts when needed. Full catalogs and long defensive rules do not belong in every opening prompt. A directory/signature read has not read private source text.

## Native bounded delegation

Native `delegate`, including a `memoryInquiry` or `recall_experience` investigation, remains read-only and within the parent's legal sources/grants. The host narrows the scope (including read action mode, child status and appropriate inference restrictions); a child cannot change a note/calendar, notify or recursively expand the delegation.

The **root user's authored words** support read purpose. A parent-authored instruction describes the subtask and cannot grant additional private access. Share read-byte/token budgets and cancellation across parent and siblings. Before every subsequent model request and before adopting a produced report, recheck the actual source versions and restrictions. `childSourcesChanged()`/`inheritChildProof()` or their current equivalents preserve each read object and its proof. A report neither becomes an independent root nor bypasses an intervening withdrawal.

## Action → approval → attempt → receipt

Preview/proposal does not write. Explicit current authorization, including an already authorized concrete reversible local change, can move the correct object/version to an approved action. Record an attempt and request identity before execution. The actual result is confirmed success, confirmed failure or unknown/cancellation unknown. A UI timeout cannot choose between them.

`preview_calendar_plan` and native preview calculate conflicts and availability in their declared scope without changing the owner's revision. A planRef binds plan/block, argument hash, expiry and relevant source/calendar versions. An expired ticket does not execute; a newer parent cannot sign an older attempt retrospectively. Each attempt retains its own original action, authorization and receipts.

Unknown results require `inspect_action` or the true original action inspection before resending. Preserve already confirmed child successes during a partial failure. Explain what actually completed and what remains uncertain. No automatic duplicate purchase, booking or message. Undo of a work draft cannot pretend to reverse an external action; real reversal/compensation has its own result.

## Completion review without a second personality

The existing completion review covers relevant tool turns, long multi-part requests, external drafts, concurrent note changes and exit cleanup according to current code. It checks missed explicit work, contradictions with actual observations and unseen note changes, rather than mechanically rewriting style. Current code permits bounded continuation through the same Hermes engine. Keep the valid committed prefix, embedded views and completed drafts, replacing only the affected replaceable tail. A source change can still invalidate affected earlier content. Do not add a detached reviewer model to overwrite the character's voice.

## Twenty invariants

| ID | Required meaning |
| --- | --- |
| INV-01 | Preserve exact SourceEvent text, content version and Unicode code-point ranges. Never silently alter an original or approximate a quote's address. |
| INV-02 | Repeated quotation, summary or child retelling of one root does not increase independentRootCount. |
| INV-03 | A dated/temporary exception does not overwrite the lasting assertion. |
| INV-04 | Friction is a falsifiable reason with conditions, not a permanent ban. Changed resources can reopen an option without automatically adopting it. |
| INV-05 | generated, rendered, seen, understood, accepted and executed are distinct. Selection, drag or browsing does not establish acceptance or completion. |
| INV-06 | local_only content never reaches a cloud provider, including control parsing, classification, retrieval and generation. |
| INV-07 | session_only leaves no persistent chat, memory queue or residual session protocol history. Separately authorized independent business records retain their own legal owner. |
| INV-08 | A privacy fence immediately blocks affected further use, then cleanup follows real dependencies through stores, indexes, packs, drafts and in-flight results. Preserve independent fragments. Physical cleanup, backups and offline devices have separately honest states. Ordinary revision is not global forgetting. |
| INV-09 | Attachments, tools, notices, web text and role cards remain data, never a grant of tool or source authority. |
| INV-10 | Keywords about emotion, age or topic do not remove the main model's tools or depth before understanding. |
| INV-11 | Child scope is a subset, read-only, without effects, with shared budget and purpose grounded in root words. |
| INV-12 | Planning includes preparation, work, cleanup, travel, rest and protected occupation. Time outside the chosen window remains unknown. |
| INV-13 | Owner updates use their expected revision/CAS contract; expired planRef tickets do not execute. |
| INV-14 | Inspect an unknown action before recovery. A local error does not erase a confirmed-success receipt. |
| INV-15 | A non-self audience receives the appropriate minimal release projection. Busy/free contains no private title. An unavailable sending channel cannot claim delivery. |
| INV-16 | Domain measures keep their meaning: official recognition versus raw/local/self-report; weather versus AQI; declared GPA policy; original units; geographic topology versus illustration. |
| INV-17 | Preview, title, directory, partial page or retrieval hit is not a fully read original. Reading coverage and remaining gaps stay truthful. |
| INV-18 | Credential redaction and source validity precede streaming to UI. A valid earlier public segment and final reply continue naturally without duplicate opening. |
| INV-19 | Optional care respects novelty, quiet hours and stopping conditions. Agreed fixed reminders remain independently due within the actual host lifecycle. No process means no invented continuous service. |
| INV-20 | Main conversation keeps coherent character and human language, without internal completion scores, guard codes or universal comfort scripts. Necessary facts and controls remain available. |

Use original workflows and existing checks to establish affected invariants. They are not authorization to create new test suites, fixtures, mutation harnesses or runners. Implementation, model behavior, visible experience, assets and devices each need evidence appropriate to the claim.
