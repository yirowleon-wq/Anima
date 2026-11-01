# Research basis, adoption decisions and limits — October 18, 2026

This dated research and design argument preserves the mechanisms considered, the reasons for adopting or rejecting them, and the limits of their evidence. **R01–R20 are stable identifiers within this document**, distinct from similarly numbered registers elsewhere in the material library. A project decision is a design synthesis, not evidence that a cited source has validated its effectiveness in student life.

The research record below reports what was inspected on **October 18, 2026**. It does not reverify linked services, policies, source trees or account access today. Unpinned web pages describe their historical reading date. Consult [current evidence](../../CURRENT_STATUS.md), the actual dependency lock and the [development roadmap](../../DEVELOPMENT_ROADMAP.md) for present behavior and later work. Historical recommendations are material for judgment; they do not start development or override the current scope.

## Reading baseline

The historical dependency baseline in `runtime/hermes/lock.json` was Hermes **0.21.2**, commit **`d595e636c83aa0b9606d4e914e1140ae9c796897`**, with Python **3.13**. The research inspected key public source files at that exact commit and compared them with official documentation accessible on October 18. **That research did not execute upstream Hermes or the application's Hermes checks.** Host wiring and intended check coverage were established by source review. Check code existing in a repository does not establish a passing execution. A passed result quoted from an older report remains a historical report, not an execution made by this research.

Three host differences affect implementation judgments:

- The sidecar set `skip_memory=True` and `skip_background_review=True`, with `_build_system_prompt` supplied by the application host. Upstream native `MEMORY.md` session freezing is therefore a comparison mechanism. It cannot, by itself, diagnose stale application context or justify enabling a second automatic memory system.
- The application had already connected `delegate`. `tests/harness/hermes.test.ts` contained end-to-end check implementations using a real `AIAgent` and a synthetic host model. The research inspected their source without running them. It established neither a passing current chain nor production-model quality, concurrent capacity or cost.
- The inspected host was a Windows Electron desktop, with local calendar, reminders and memory, plus map, position and weather interfaces. Independent mobile sensing, mobile background operation and full campus integration remained future work. Desktop scheduling and an evaluation-model transport do not establish mobile or production guarantees. Position interfaces remain design capabilities; current work keeps location services and permissions off and uses manual references or admitted synthetic observations.

The adoption direction was to retain the existing Hermes execution foundation and authoritative application host while adding situational understanding, opportunities, plan revision and verifiable results at the domain layer. Replacing a framework, training a model or connecting every provider was not a prerequisite for the first useful result. The later whole-Harness redesign remains governed by the current roadmap and must preserve equivalent capabilities and owners.

## 1. Complete the life-decision loop

The intended assistant continuously understands the person's situation, current commitments, concerns and meaningful changes, then advances something useful for that person. Tool calls, scheduled jobs, memory and persona each solve part of the problem. Installing them together does not automatically produce good initiative.

The proposed sequence is: an external change becomes a sourced event; it revises current circumstances and existing commitments; the assistant judges which matters are worth pursuing; preparation already covered by authority happens first; an action window and the person's attention inform whether to appear; execution is followed by an actual result read; explicit feedback informs later adjustment. Hermes provides general model calls, the tool loop, sessions and isolated work. Anima's domain layer determines what matters in student life and what this particular action actually changed. This is a synthesis across the research, not an unmodified framework architecture.

Keep three distinctions clear:

- **Proactive ability and warm expression.** Initiative means discovering and advancing something worthwhile. Warmth means closeness, natural expression and remembered context. More messages do not establish more initiative. An enthusiastic companion can prepare quietly during focus and bring a complete result at a useful moment.
- **Known facts and inferred needs.** A classroom, a forecast's publication time and an explicit arrangement can be factual inputs. “You must be anxious” or “You surely want to study” remains an inference. Correct individual facts do not guarantee a correct interpretation of the person's goals.
- **Ability to act and a reason to act.** Calendar, weather and map tools establish only available means. Required information, remaining opportunity, existing agreements and actual delivery or persistence still need checking.

Horvitz's mixed-initiative work considers automatic action, questions and nonintervention together. JITAI separates need, receptivity and support burden. PTIME connects scheduling constraints with personal tradeoffs. Proactive Agent and ProActor show ways to evaluate opportunity recognition and timing, without establishing reliability throughout real student life. See R11–R17.

## 2. Use Hermes accurately, including its version differences

### 2.1 Inventory what is actually exposed before choosing a replacement

The historical desktop included maps, position/weather interfaces, local calendar/reminders/memory and a stdio execution chain; the full mobile chain was unfinished. Keep five capability columns: present upstream; present in the locked version; wrapped by Anima; enabled in the running configuration; and the layer actually observed. Upstream mechanisms, application wiring, check source, older execution reports, a new execution and production operation are separate evidence.

The pinned source supported these mechanisms:

| Capability | Evidence at `d595e636…` | Meaning for the application host |
| --- | --- | --- |
| Persistent short memory | `tools/memory_tool.py` and `tools/memory_tool_store.py` manage `MEMORY.md` / `USER.md`; loading freezes a system-prompt snapshot, and later disk writes do not alter that prompt. | The host had disabled this native path and supplied current context itself. Distinguish stable summaries from changing circumstances; upstream freezing is not a diagnosis of stale host state. |
| Memory mutation | `MEMORY_SCHEMA` exposes `add` / `replace` / `remove`, including atomic batches. `replace` finds the entry containing `old_text` and replaces the whole entry. | This applies when actually calling native upstream memory. Host memory follows its own contract. A newer documented `patch` signature cannot be used against the locked native tool by assumption. |
| Delegation | `tools/delegate_tool.py` creates a fresh conversation with `goal` + `context`, independent `task_id`, the parent's tools minus child-blocked tools, batched `tasks`, `output_schema`, one bounded correction, and running `steer` / `stop`. | Existing application wiring and real-`AIAgent`/synthetic-hostmodel check source should be extended rather than duplicated. Actual execution, production quality, cancellation races and budget behavior require their own observations. |
| Delegation budgets | `tools/delegate_tool_config.py` used configurable defaults of concurrency 10 and depth 1, with no fixed wall-clock ceiling by default and separate state detection. | General framework defaults are not an appropriate product budget merely because they exist. |
| Scheduled tool | `tools/cronjob_tools.py` registers `cronjob_manage`; the Python function retains `cronjob`. Actions are `create`, `list`, `update`, `pause`, `resume`, `remove` and `run`. | Use the real registry contract. The shorthand “cronjob” in prose is not evidence of the registered tool name. |
| Scheduled context | The same tool contract describes a fresh session, without automatic inheritance of current chat context, and uses the final answer for delivery. | A persistent job references stable work and rereads current context. A temporary prompt saying “tomorrow,” “here” or “that course” is insufficient. |
| Persona | Locked official documentation describes `HERMES_HOME/SOUL.md` as primary identity with a session personality overlay. | The application builds its own system prompt. Explicit persona configuration belongs in that host path; the existence of `SOUL.md` does not establish that it is loaded. |
| Compression and caching | Locked documentation includes ContextEngine plugins, compression and provider prompt-cache paths. | These address context cost; they do not replace durable facts or execution state. |

The research's upstream-main comparison was commit `d24fe22029c9d42dd7cd3702df4c02b1e92b9506`, dated **2026-10-18T07:10:21Z**. Its memory documentation used `add` / `patch` / `remove` and rejected `replace`. Its scheduled-work source had also been split further; `cron/scheduler_tick.py` did not exist at the locked commit. Do not import main-branch APIs into the pinned application or make a Hermes upgrade an assumed prerequisite for domain reconstruction. See R01–R06.

### 2.2 Give situation, memory and persona their own responsibilities

Distinguish the following logical objects within the existing storage. These are data responsibilities, not a demand for a separate database per item.

1. **Explicit user settings:** chosen name, character style, reminder intensity, learning preferences and current boundaries. Record the scope of a user change. Switching persona does not rewrite a timetable, health fact or execution permission.
2. **Facts and commitments:** a course occurrence, assignment deadline, agreed dinner, submitted booking or user-chosen activity progress. Keep source, validity, version and subsequent revision relationships.
3. **Current circumstances:** declared time zone, a manual location reference and its precision/time, approaching commitments, a forecast's valid window, connection/device state and present self-report. Their lifetimes are short. A position is neither automatically available nor permission to collect it.
4. **Episodic memory:** what happened, who said what, why a plan changed and the person's response. Preserve recoverable original evidence.
5. **Assistant interpretation:** for example, “On several recent occasions, a longer study block in the academic building suited the person better.” This remains an evidence-backed, conditional inference, not permanent identity.
6. **Procedural experience:** how a particular institutional connector is queried or a particular failure recovered. Reuse it in adapters or methods, separately from a private personal profile.

A long-term summary provides inexpensive stable background. Retrieval locates detail. The current situation packet supplies newly valid state. LongMemEval cautions that replacing originals entirely with extracted facts or summaries can lose information. Generative Agents retains evidence pointers for reflections yet still reports embellishment. Interpretations therefore need a source return, correction and expiry; another model-written paragraph is not a new observation. See R02, R05, R16 and R18.

### 2.3 Context-cache implementation goals

Let the authoritative context builder organize a stable prefix: identity, tool contracts, a small stable rule set and versioned configuration. Put short-lived circumstances, work snapshots and recent changes later in the current input. Reordering the entire world state or inserting current time early in the system prompt can harm prefix reuse. Observe actual provider receipts before claiming a cache hit; following a recommended structure is not a hit receipt.

Provider prompt caching reduces repeated-input cost, compression shortens the current conversation, and persistent memory carries information across sessions. Keep their lifetimes distinct. Read actual usage, hit tokens and latency; similar-looking prompts are not performance evidence. Models, accounts and provider routes differ. Hermes's Anthropic-specific caching does not prove equivalent behavior for another API provider or a subscription-backed ChatGPT route. See R05.

## 3. Proposed initiative mechanisms

### 3.1 Admit meaningful changes reliably

An upstream signal needs an event ID, source, received time, actual occurrence/effective time, applicable time zone, expiry and quality. Forecast changes, revised course occurrences, completed work, a new message, a deliberately supplied place change, a booking window or a reconnected device may justify reconsideration. Minute position noise is not itself a new life decision; current work neither activates location services nor collects position.

At admission, deduplicate, compare versions and cheaply check source scope and freshness. Known dependencies identify which matters need reevaluation: changed weather may affect an outdoor plan; a classroom change affects that course's route; a completed personal activity may retire related unsent optional prompts. Preserve budgeted semantic discovery for eligible new sources and meaningful changes without existing dependencies. A fixed vocabulary or existing watch list cannot exhaust new human needs. Low-frequency reconciliation can recover missed changes and lost subscriptions without repeatedly calling a model when nothing changed.

Give each logical reminder/work item one persistent execution owner. Understand Anima's existing reminder scheduler before adding native Hermes cron. Two schedulers must not independently create and deliver the same promise. The OpenClaw material inspected then placed recurring heartbeat work under one automation owner: periodic checking and initiative can share durable scheduling while retaining distinct context and delivery contracts. See R04 and R07.

### 3.2 A useful opportunity record

The model may propose an opportunity from current facts, goals and open work. Every candidate should state: the goal it serves; the new evidence that triggered it; why now; what can be prepared immediately; what remains unknown; earliest/latest action time; prepared, executable or invalid state; what happens without a response; and how completion can be checked.

Those reasons are more reviewable than `priority=0.84`. A ranking score is an adjustable heuristic unless calibrated data supports more. A model-generated decimal is not a measured success probability, interruption probability or precise utility. Preserve hard constraints, explainable tradeoffs and immediate user override. Introduce complex weights when real conflicts require them, not as a prerequisite for the first useful capability.

Possible outputs include:

- Quiet preparation: obtain the classroom, prepare a route, draft a schedule change or assemble useful work material.
- Natural mention in an existing conversation: while discussing the evening, connect an actual forecast with a user-chosen activity opportunity.
- Wait for a usable window: after class, when the choice will still be available.
- Interrupt for a confirmed important change close to the loss of a meaningful action window.
- Defer or abandon: evidence expired, a goal was withdrawn, the person completed it, the message was already delivered, or a necessary premise is missing.
- Ask one specific question when it changes the result, such as a dinner's starting time before reserving a complete study block.

These are execution outcomes; the product does not need six internal-state buttons. JITAI's useful lesson is to relate decision frequency to meaningful change and burden, with no support now as a deliberate result. Do not copy its health-intervention intervals or thresholds into student life. See R11–R13.

### 3.3 Plan the next genuinely available period

Planning need not wait for every campus, health or social connector. Available local calendar, reminders, maps and permitted weather information can support an initial real loop. Begin with the next actual time window, then extend to a day, week and longer goals.

Separate fixed commitments, adjustable personal plans, unaccepted invitations and wishes. A piece of work needs a window, duration range, dependencies, place/resources, progress, divisibility and the tradeoff the person actually cares about. A course is a dated occurrence with cancellation, moves, holidays and exceptions, not just a weekday string.

Replanning first locates the affected part and preserves other confirmed commitments. A dinner invitation may make earlier study, shorter study or another study location genuinely different options; explain what each sacrifices. A new signal does not justify rewriting the whole day. Academic metrics do not always outrank friendship, rest or curiosity.

PTIME suggests that one conflict can have several reasonable relaxation directions, informed by personal choices. It principally studied meeting scheduling and does not supply the complete model for sustained study, activity windows, travel and weather. Local revision with stable existing commitments is an additional project decision, not a claim already validated for all student schedules by that paper. See R14.

### 3.4 Follow one coherent situation

Consider a person who explicitly wants a continuous study block and also has a self-chosen activity goal. An afternoon class moves to another building; a friend suggests dinner; a weather source then revises its evening forecast toward rain.

Save the classroom revision and retire the former destination. Prepare a route using the new classroom and the actual validity of the supplied manual origin. Treat dinner as an unaccepted invitation. Compare feasible study/activity adjustments, then change only the relevant plan once selected. If the rain no longer affects that plan, update quietly. A friend's later time change revises the same matter instead of creating an unrelated event. Completing the activity retires its related unsent prompts.

Preserve missing-data branches. A stale reference cannot support “from where you are now.” With no connected activity provider, use only admitted local or user-provided progress. A coarse forecast cannot promise rain at an exact minute. Without permission to read a friend's messages, use only the person's account of the invitation. While offline, do not claim continuing observation. Each limitation still leaves room for the preparation actually supported now; it does not invent an institutional exercise requirement.

### 3.5 Delegate genuinely independent reasoning

Simple concurrent queries can be batched at the tool layer. Reserve reasoning agents for independent judgment or substantial material: investigating enrollment constraints, comparing longer learning plans or studying a complicated journey.

Each child receives a concrete task, current world-state version, relevant facts, allowed tools, budget, cancellation conditions and result contract. The parent gathers facts, suggestions, sources, failures and completion states before making the user-facing decision. Children do not rewrite shared persona or overwrite one another's calendar work. A changed goal, revoked event or passed deadline cancels or expires the affected result. A late report cannot silently restore an old plan.

The historical audit found the pinned `delegate` connected and existing `tests/harness/hermes.test.ts` check source using a real `AIAgent` with a synthetic host model; it did not execute those checks. Subsequent implementation should extend the existing snapshot, cancellation and merge boundary and use relevant existing checks. Default concurrency, depth and cost do not define the product budget; task value, latency and actual device/model conditions do. Production-model use needs separate observation. See R03.

### 3.6 Accept desktop, mobile and authentication separately

The first coherent result can be desktop-based. The October 18 WorkManager reading reported a 15-minute minimum for periodic work, with actual execution affected by system conditions and constraints. A desktop minute-by-minute scan is not directly portable, and registering a periodic task does not establish punctual delivery. Mobile wake, due notifications, restoration and energy behavior require native observations under then-current documentation. See R19.

The dated OpenAI reading described an official Codex app-server path for appropriately authorized ChatGPT-plan OAuth tokens. A model catalog does not establish the account's right to call a model. Use the application's own authorized credential lifecycle and observe a completed inference turn for the selected model before declaring that invocation successful. The explicit Luna evaluation transport is not proof of production ChatGPT sign-in integration. See R20.

## 4. Warmth, editable character and accurate understanding

Separate user-chosen character identity, expression habits and interaction initiative, with facts and tool authority remaining in their respective layers. A gentle companion, direct classmate or playful fictional character can be a default or user-authored configuration. Defaults need real dialogue examples and observable differences, beyond a list of adjectives.

Character should survive ordinary conversation, urgency, low mood, refusal, missing information and action failure. “I checked what I could; you can look after class and still have time” can express warmth without a nickname, emoji or encouragement in every line. A persona change cannot change route facts, deadlines or permissions.

Save the person's character edits separately from assistant-inferred preferences and keep their editing authority clear. “After several short-notice dinners split a long study block, you preferred to discuss the timing earlier” needs evidence, conditions and a correction path. It must not become “you dislike socializing.” One silence does not establish permanent dislike of reminders or cancel explicitly ongoing work.

Avoid a giant first-use questionnaire. Provide reasonable defaults and gather small amounts of feedback when an actual decision exposes a consequential difference. PTIME supports reducing preference-expression burden; it does not establish reliable personality learning. Natural character still needs actual dialogue and human response. See R06, R14 and R18.

## 5. What evaluation should establish

Observe four results together: discovering worthwhile work, choosing an appropriate moment, genuinely advancing or completing it, and making the relationship comfortable. Clicks, response rates, reminder counts or the assistant saying “done” cannot stand in for them.

| Question | Useful observation | Counterexample to retain |
| --- | --- | --- |
| Does it discover a real opportunity? | Reason from the event stream available so far, including an opportunity not directly requested. | A superficially similar situation with no need; repetition without new evidence. |
| Is the information trustworthy? | Read current versions, distinguish fact/inference/unknown and return to originals. | Rescheduled class, changed time zone, expired forecast, correction or similar names. |
| Is the timing appropriate? | Prepare and appear inside a meaningful opportunity window; distinguish early, late and missed. | An exam, focus, a vanished opportunity or a delayed message. |
| Does the action help? | Inspect actual receipts and visible state changes. | Failed calls, unpersisted writes or a generated schedule never adopted. |
| Does it revise correctly? | New information changes affected plans and retires old prompts. | Changed mind, a friend's new time, canceled class or cross-device conflict. |
| Does it recover? | Offline/restart/retry preserves one action and message identity. | Duplicate event delivery, restart during execution or a late result. |
| Is memory accurate? | Extraction, cross-session synthesis, time, correction and justified abstention. | A false “you said” premise, expired preference or embellished summary. |
| Is it pleasant to live with? | Clear natural interaction, useful initiative and continuity. | Engineering-status monologues or enthusiasm turning into repeated interruptions. |

Scenario material should describe available input, the acceptable action category and time windows, conditions for silence/questions and actual-result observations. It should not prescribe one exact sentence. Preserve counterfactual reasoning: identify which step becomes unsupported if one required fact disappears. Future events and review criteria must not leak into current model input. These are static design and review requirements; [AGENTS](../../../AGENTS.md) governs any enactment. This material creates no permission to author new tests, fixtures, assertions, harnesses or runners.

ProactiveBench's human annotation and simulated environment can inform repeatable event descriptions, but the work reports false positives and a need for more user-centered validation. ProActor's oracle can see future conversation and its evaluated domains are English customer service and home loans. A retrospective annotation method is not online evidence available to this assistant and does not establish reliable student-life decisions. LongMemEval evaluates interactive-memory questions, not real external-action success. Begin from an actual admitted end-to-end loop and build real-use evidence separately. See R15–R17.

## 6. Primary-source register

The historical research grouped source code and official explanation for one mechanism into one entry, rather than treating several same-origin pages as independent corroboration. The twenty entries span open-source implementations, official mechanism documentation, first-party product announcements and academic papers. **“Read scope” below means the historical October 18 research's reported scope, not a fresh read.** A dynamic page without a pinned revision represents only that date. A product announcement describes a promise; it does not expose an algorithm. Third-party overviews, search snippets and marketing retellings were not the recorded basis for implementation claims.

### R01 — Hermes Agent: pinned implementation and version

- **Identity/version:** `NousResearch/hermes-agent`; pinned commit titled “fix(model): a selected model id is never rewritten to a catalog neighbour,” dated **2026-09-12T21:05:36Z**. [Pinned commit](https://github.com/NousResearch/hermes-agent/commit/d595e636c83aa0b9606d4e914e1140ae9c796897). The historical main comparison was `d24fe22029c9d42dd7cd3702df4c02b1e92b9506`.
- **Read scope:** commit metadata; key implementations, schemas and documentation listed in R02–R06; the then-current main directory and corresponding explanations.
- **Supports:** Hermes already supplies a general agent-execution foundation. A claim that upstream lacks a capability needs an exact locked-version check.
- **Limits:** public source review only; neither upstream nor application Hermes checks were executed by this research. Wiring and intended coverage came from application/check source review, without proving passing execution or production operation.
- **Adoption:** pin versions and inventory interfaces; evaluate domain reconstruction separately from a framework upgrade.

### R02 — Hermes Memory Tool / MemoryStore and persistent memory

- **Identity/version:** Hermes **0.21.2**, commit `d595e636c83aa0b9606d4e914e1140ae9c796897`. [Memory tool](https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/tools/memory_tool.py), [MemoryStore](https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/tools/memory_tool_store.py), and [official persistent-memory guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory). The guide's October 18 snapshot was not assumed identical to the pinned source.
- **Read scope:** pinned `MEMORY_SCHEMA`, `load_from_disk`, `_mutate`, `replace` and `format_for_system_prompt`; then-current documentation of injection, `session_search`, capacity and mutation actions.
- **Supports:** a frozen short-summary snapshot; a persistent write does not mean current-turn visibility; locked/atomic file updates; the older whole-entry `replace` versus newer local `patch` semantics.
- **Limits:** short text is not the student's fact database. New documentation features are not automatically in the pinned version. The host disables native memory and upstream background review through `skip_memory=True` / `skip_background_review=True`; freezing is not a diagnosis of stale host position/context.
- **Adoption:** retain authoritative host memory, strengthen sources and freshness, and project current world state through the host. Use MemoryStore as a comparison rather than enabling a second automatic interpretation or transferring memory ownership.

### R03 — Hermes subagent delegation

- **Identity/version:** Hermes **0.21.2** at the pinned commit. [Delegation tool](https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/tools/delegate_tool.py), [configuration](https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/tools/delegate_tool_config.py), and [official delegation guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation), read as an October 18 snapshot separately from pinned source.
- **Read scope:** schema; child-context construction; result/interruption status; running controls; concurrency, depth and timeout defaults.
- **Supports:** a fresh child context requires a complete bounded handoff; structured results and live control are available; defaults are not product-optimal resource settings.
- **Limits:** child authority and completion reporting still depend on the host/configuration. Existing application delegation and real-`AIAgent`/synthetic-hostmodel check source were inspected without executing the checks or production-model work.
- **Adoption:** extend the existing bridge; let the parent integrate judgments; pass snapshot version, budget and cancellation; batch simple reads directly.

### R04 — Hermes scheduled tasks (cron)

- **Identity/version:** Hermes **0.21.2** at the pinned commit. [Locked scheduled-tool source](https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/tools/cronjob_tools.py) and [official cron guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron), with the guide treated as its October 18 snapshot.
- **Read scope:** `cronjob_manage` registration, `create` / `update` / `run` parameters, fresh-session delivery, and then-current missed-fire/catch-up explanations.
- **Supports:** registration, execution and delivery have separate states; work cannot rely on temporary chat context; recovery policy needs explicit meaning.
- **Limits:** the research did not retrospectively establish every newer catch-up detail for the pinned version. Those details are not an existing application guarantee.
- **Adoption:** one scheduling owner per logical work item; durable events/receipts for recovery; inspect the actual pinned semantics during implementation.

### R05 — Hermes context compression and caching

- **Identity/version:** Hermes **0.21.2** at the pinned commit. [Locked design documentation](https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/website/docs/developer-guide/context-compression-and-caching.md) and [official guide](https://hermes-agent.nousresearch.com/docs/developer-guide/context-compression-and-caching), whose October 18 snapshot is a separate version.
- **Read scope:** ContextEngine, dual compression, Anthropic cache markers, stable prefixes and changes of model/account.
- **Supports:** caching, compression and persistent memory are separate mechanisms; prefix stability and provider route influence cost.
- **Limits:** reported performance ratios were not remeasured for Anima; provider-specific behavior does not generalize to every API.
- **Adoption:** separate stable configuration from dynamic circumstances, observe real usage and avoid promising a saving from a documentation percentage.

### R06 — Hermes personality and `SOUL.md`

- **Identity/version:** Hermes **0.21.2** at the pinned commit. [Locked personality documentation](https://github.com/NousResearch/hermes-agent/blob/d595e636c83aa0b9606d4e914e1140ae9c796897/website/docs/user-guide/features/personality.md) and [official personality guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/personality), compared as an October 18 snapshot.
- **Read scope:** primary-identity location, `HERMES_HOME` scope, preservation of user files and durable identity versus session overlay.
- **Supports:** configurable identity is an available mechanism and can be separated from a temporary interaction style.
- **Limits:** configurability establishes neither character quality nor a usable character editor. The host supplies `_build_system_prompt`; upstream `SOUL.md` loading is not the application's current identity path.
- **Adoption:** consume user-authored persona in the existing host compiler; separate it from inferred preferences, facts and permission; keep one authoritative identity source.

### R07 — OpenClaw heartbeat and automation

- **Identity/version:** official README/docs accessible on October 18; no reproducible release or source commit was pinned. [Heartbeat guide](https://docs.openclaw.ai/gateway/heartbeat), [automation guide](https://docs.openclaw.ai/automation).
- **Read scope:** system-owned monitor, unified automation owner, `activeHours`, owner delivery, `NO_REPLY` / structured silence and unavailable-channel behavior.
- **Supports:** scheduled internal processing can produce no user message; independent tasks and background heartbeat have distinct contracts; one occurrence has a definite owner.
- **Limits:** public implementation explanations were read, not executed. Its defaults are product choices rather than universal rules.
- **Adoption:** borrow durable, recoverable and quiet background work; do not migrate the whole framework or copy a fixed 30-minute interval.

### R08 — Khoj: personal AI and automations

- **Identity/version:** official README/docs accessible on October 18, without a pinned runnable release or commit. [Khoj repository](https://github.com/khoj-ai/khoj), [automation documentation](https://docs.khoj.dev/features/automations/).
- **Read scope:** personal knowledge, agents configured by persona/model/tools, file retrieval and automation in the README; time zones and email-delivery dependencies in the automation guide.
- **Supports:** personal material, character and scheduled research can coexist in a personal product; delivery depends on actual service configuration.
- **Limits:** the material does not establish reliable full-campus planning. Executing a query on a schedule is not autonomous discovery of a need.
- **Adoption:** notes/materials can serve as contextual resources; automated results should return naturally to the surfaces where they are useful.

### R09 — Introducing Muse: The World's First Personal AI Agent Built for Everyone

- **Identity/version:** [Meta first-party announcement](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/), recorded with body dates **September 8, 2026 / September 30, 2026**.
- **Read scope:** “How It Works” and “Built to be Private, Safe, and Secure.”
- **Supports:** the announcement described long-term goals, continuing execution, remembered personal details, initiative, changeable user authority and action records as product commitments.
- **Limits:** an official product description does not reveal complete opportunity scoring, persona-memory algorithms or failure rates. It does not support inferring the internals.
- **Adoption:** preserve the experience goal of natural conversation followed by useful progress/results; an independent virtual machine is not a prerequisite for every student assistant.

### R10 — Introducing Grok Bot

- **Identity/version:** [xAI first-party announcement](https://x.ai/news/introducing-grok-bot), dated **August 11, 2026** in the historical record.
- **Read scope:** independent computer, natural messages, multiple-bot collaboration, routines from demonstrations, remembered preferences and proactive follow-up.
- **Supports:** a specifically identifiable always-on-agent product presented as an ongoing work partner.
- **Limits:** product descriptions and internal employee examples are not a reproducible algorithm paper; “knows you better” does not reveal the learning mechanism.
- **Adoption:** borrow continuing collaboration and reduced handoff burden without copying an enterprise multi-bot organization or granting broad external-action authority by default.

### R11 — Principles of Mixed-Initiative User Interfaces

- **Identity/version:** Eric Horvitz, **CHI 1999**. [Paper](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/11/chi99horvitz-1.pdf), [Microsoft Research publication page](https://www.microsoft.com/en-us/research/publication/principles-mixed-initiative-user-interfaces/).
- **Read scope:** twelve principles, the LookOut scheduling example, goal uncertainty, expected utility of acting/not acting/dialogue and threshold discussion.
- **Supports:** initiative should account for uncertainty, attention cost, correction and direct control. Questions also incur cost.
- **Limits:** a classic small-system study is not proof of modern LLM reliability. Its utility model needs estimated quantities or explicit design assumptions.
- **Adoption:** allow preparation, necessary questions and appropriately timed action with quick correction. Do not require a redundant confirmation for every already-authorized local action.

### R12 — Learning and Reasoning about Interruption

- **Identity/version:** Eric Horvitz and Johnson Apacible, **ICMI 2003**. [Paper](https://www.erichorvitz.com/iw.pdf), [author's project page](https://www.erichorvitz.com/learninterrupt.htm).
- **Read scope:** multiple event sources, expected interruption cost, notification channels, and the Interruption Workbench's collection, user annotation and modeling process.
- **Supports:** interruption costs vary for the same person across moments and channels. A timetable alone does not establish a binary interruptibility state.
- **Limits:** an office setting and a relatively small study do not establish equivalent results for modern mobile signals or Anima's data.
- **Adoption:** prefer explicit focus/class state and user feedback; retain uncertainty when signals are insufficient rather than pretending to know attention.

### R13 — Just-in-Time Adaptive Interventions in Mobile Health

- **Identity/version:** Inbal Nahum-Shani and colleagues, *Just-in-Time Adaptive Interventions (JITAIs) in Mobile Health: Key Components and Design Principles for Ongoing Health Behavior Support*, DOI **10.1007/s12160-016-9830-8**. The research read the team's **2016** article version; the journal issue is **2018, 52(6)**. [University-hosted paper](https://dept.stat.lsa.umich.edu/~tewaria/research/nahum-shani16just-in-time.pdf), [journal record](https://academic.oup.com/abm/article/52/6/446/4733473), [open record](https://pmc.ncbi.nlm.nih.gov/articles/PMC5364076/).
- **Read scope:** six components, need and receptivity, intervention fatigue, decision-point frequency, and proximal/distal outcomes.
- **Supports:** changing person/environment conditions should inform support type, timing and intensity. No prompt is a designed outcome; frequency depends on meaningful change and burden.
- **Limits:** a health-behavior design framework establishes neither learning/GPA gains nor permission to diagnose from fragmentary measurements.
- **Adoption:** borrow its decision structure and burden awareness; define outcomes around actual student goals.

### R14 — PTIME: Personalized Assistance for Calendaring

- **Identity/version:** Pauline M. Berry, Melinda Gervasio, Bart Peintner and Neil Yorke-Smith, **ACM TIST 2011, 2(4), Article 40**. [Paper](https://starlab.ewi.tudelft.nl/papers/n92.pdf), [SRI publication page](https://www.sri.com/publication/ptime-personalized-assistance-for-calendaring/).
- **Read scope:** introduction, system components, preference-model design, user study, constraint reasoning and preference learning through selected results.
- **Supports:** scheduling involves personal tradeoffs; overconstrained choices need different relaxation directions; low-burden initial preferences can be complemented by later feedback.
- **Limits:** mainly meeting scheduling, with a population/capability range short of full student life. It does not establish a desire for a completely filled automatic schedule.
- **Adoption:** distinguish fixed commitments from adjustable plans; offer a few meaningful alternatives and accumulate conditional preferences gradually.

### R15 — Proactive Agent: Shifting LLM Agents from Reactive Responses to Active Assistance

- **Identity/version:** Yaxi Lu and colleagues, **ICLR 2025**. [Conference paper](https://proceedings.iclr.cc/paper_files/paper/2025/file/75c37811e830bf029584b1c6fac17726-Paper-Conference.pdf), [official conference abstract](https://proceedings.iclr.cc/paper_files/paper/2025/hash/75c37811e830bf029584b1c6fac17726-Abstract-Conference.html).
- **Read scope:** event collection, Environment Gym, User Agent, event update → task prediction → feedback → execution, and appendix limitations.
- **Supports:** event streams and human acceptance/refusal annotation can evaluate proactive recognition; an explicit no-action outcome is needed.
- **Limits:** much of the material is simulated, environments are limited and false positives remain substantial; the authors call for more user-centered validation.
- **Adoption:** use synthetic situations to reveal regressions and design gaps while retaining separate real-use acceptance. Training a large model is not a prerequisite.

### R16 — LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory

- **Identity/version:** Di Wu and colleagues, **ICLR 2025**. [Conference paper](https://proceedings.iclr.cc/paper_files/paper/2025/file/d813d324dbf0598bbdc9c8e79740ed01-Paper-Conference.pdf), [code repository](https://github.com/xiaowu0162/LongMemEval).
- **Read scope:** definitions of five capabilities; indexing/retrieval/reading; section 5.2 value decomposition and section 5.3 key-design results.
- **Supports:** memory includes updates, temporal reasoning, cross-session synthesis and abstention. Replacing original content with summaries/extracted facts alone may lose information.
- **Limits:** a memory question-answering benchmark establishes neither external-action success nor long-term trust or student benefit.
- **Adoption:** retain originals/provenance and use summaries for discovery. Review correction and justified unknowns rather than equating keyword retrieval with memory quality. Further executable test development remains subject to explicit authorization.

### R17 — ProActor: Timing-Aware Reinforcement Learning for Proactive Task Scheduling Agents

- **Identity/version:** Lei Ding, Bin He, Chenguang Wang and Yang Liu, **ACL 2026, pages 18257–18303**. [Conference paper](https://aclanthology.org/2026.acl-long.832.pdf), [official ACL record](https://aclanthology.org/2026.acl-long.832/).
- **Read scope:** reference action/windows; action consistency, timing, false-trigger and readiness measures; the oracle's access to future conversation; limitations.
- **Supports:** correct action, parameters and timing need separate evaluation. An action can have several reasonable windows, and reference annotation is only a reference.
- **Limits:** English ABCD+ and Home Loan domains; training dialogues no longer than 50 turns; future-visible oracle and limited generalization.
- **Adoption:** include time windows and readiness in scenario contracts; give the online model only then-available facts. Borrow the evaluation idea before considering its reinforcement-learning infrastructure.

### R18 — Generative Agents: Interactive Simulacra of Human Behavior

- **Identity/version:** Joon Sung Park and colleagues, **arXiv 2304.03442v2, August 6, 2023**. [Paper](https://arxiv.org/html/2304.03442v2).
- **Read scope:** memory stream, section 4.2 reflection and evidence pointers, planning, section 6.5 memory/embellishment, and the two-game-day end-to-end simulation.
- **Supports:** observation, reflection and planning can be separated; an interpretation can preserve links to its original memories.
- **Limits:** plausible behavior among 25 simulated people does not establish accurate understanding of a real person. The paper includes knowledge embellishment.
- **Adoption:** borrow grounded interpretation and continuity while preserving correction. Do not mistake simulated-character research for a complete human model.

### R19 — Define work requests: Android WorkManager

- **Identity/version:** [Official Android documentation](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work); the historical record reports last update **October 16, 2026 UTC**, read October 18.
- **Read scope:** periodic work, flex intervals, constraints, delayed work, retry/backoff, and load/quota conditions for expedited work.
- **Supports:** the reported periodic minimum was 15 minutes, not exact execution timing; constraints can delay or skip work, and expedited work also has limits.
- **Limits:** that page does not cover every notification, exact alarm or vendor behavior, and gives no iOS background guarantee. Recheck the current platform documentation when implementing.
- **Adoption:** use it for suitably delayable durable synchronization/compensation. Do not port a desktop minute scan directly. Exact due-time needs require an applicable mechanism and actual device evidence.

### R20 — Codex app-server: Sign in with ChatGPT

- **Identity/version:** [Official app-server documentation](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server), accessible October 18, without a fixed app-server release identified in the record.
- **Read scope:** OAuth token injection, Responses provider, `initialize` / `initialized`, thread/turn flow, `model/list` limits, `turn.status` and renewal.
- **Supports:** the documented path for appropriately authorized ChatGPT-plan OAuth tokens; a model catalog may be client-built, while a completed actual model invocation establishes that invocation's access.
- **Limits:** documentation does not establish application authorization, a particular account's model entitlement, or production integration through Luna evaluation. Current implementation needs its actual supported version and authorization.
- **Adoption:** keep application-specific authorization and credential storage/renewal. Accept a selected-model call through its actual completed receipt; failed/interrupted turns are not success. Sign-in and catalog availability remain separate observations.

## 7. Requirements to carry into an engineering commission

The useful constraint is an observable result, not allegiance to a framework:

1. Begin from the real dependency lock and existing host entry points. Explain which upstream capabilities are exposed and which need a thin adaptation.
2. Follow at least one legitimate student-life situation through changed events, revised context, quiet preparation, natural contact, actual action receipt and later correction.
3. Move institution/person constants out of generic logic into appropriate data/settings. Keep deterministic correctness rules; determinism alone is not an objectionable hard-coded intent route.
4. Keep persona editable, interpretation correctable, facts sourced and dynamic state expirable. Caches and delegated work must not silently change these boundaries.
5. For each important behavior retain the circumstances calling for initiative and the meaningful neighboring circumstances: insufficient information, waiting, already completed work and withdrawal after change. Use ordinary permitted inspection and existing checks; this research creates no new test-development authority.
6. Do not rename simulator success as real integration, a registered cron as punctual delivery, or a saved summary as a fact correctly used in this turn.
7. Work from real available data and the actual environment. Unconnected health, mail or campus feeds leave explicit manual/known-source paths. Keep location services and permissions off; no active location collection is needed to preserve the architecture or demonstrate a manual-origin loop.
8. The application host retains identity, personal memory and current context. Native upstream memory/background review were disabled in the historical wiring; an inactive upstream frozen summary is not the diagnosed cause of a host-context problem.
9. Record delegation wiring, synthetic-hostmodel check source, actual check execution and production-model observation separately. The October 18 research was source review only. Extend the existing interfaces rather than duplicating them; later observations belong in the current evidence record.
10. Android background operation, desktop scheduling and official ChatGPT-plan authentication have independent runtime constraints. Accept the corresponding platform and real model result, rather than a directory, simulator or registered task alone.

The research contribution is a form of life collaboration grounded in evidence, able to choose a moment and revise its help as circumstances change. Persona makes the interaction natural. Runtime mechanisms make the help feasible, accountable and continuous after something actually happens.
