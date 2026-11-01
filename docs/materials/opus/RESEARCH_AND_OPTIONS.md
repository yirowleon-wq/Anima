# Research references, applicable questions and design alternatives

Use this question-driven reference paper to inform Anima's development. It is not an installation list, a claim that every linked feature exists in Anima or authorization for a provider/account/billing change. The formal development stages remain unfinished.

Reading notes below describe the recorded design research, not fresh website checks. A body read, selected section, search excerpt and unviewed video have different meanings. Links may change. At actual implementation, read enough primary material to affect a concrete decision and compare it with the installed source/lock. A public product description establishes what its publisher describes, not a hands-on result or its private algorithm.

## Start from an observed problem

Name an actual discontinuity, then choose sources that might explain or improve it. Ask what problem a source solves, its assumptions and costs, what evidence supports it and how Anima differs. A long reference list, a benchmark number or an announcement does not implement a capability. Do not search only for support for a favored answer or require the entire internet to be researched before useful work begins.

## Continuing assistants and conversation

### R01 · Introducing Grok Bot

[Publisher introduction](https://x.ai/news/introducing-grok-bot).

The recorded review opened the body describing cross-application tasks, routine work and continuing proactive help. It is useful for considering the whole no-new-message → continuing work → returned result → original conversation experience. It was product material, not a hands-on trial, and did not establish the internal scheduler or memory implementation.

### R02 · Introducing Muse, Your Personal AI Agent

[Publisher introduction](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/).

The recorded review opened and located discussion of continuing execution, relevant changes and approval where necessary. Use it to distinguish tasks, executing host, notification and user decision. Anima does not receive cloud persistence, account connections or independent mobile capability merely because that vision is described elsewhere.

### R03 · How We Designed Muse

[Design account](https://introducing.muse.ai/).

The earlier research read design discussion of a primary conversation, several tasks and interruptions, time/event triggers and personal expression. It can help ask how continuing relationship and work stay in one entrance instead of scattered management pages. It is a design explanation, not a requirement to copy the entire flow or policy.

## Main loops, context and execution

### R04 · Hermes subagent delegation

[Delegation documentation](https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation).

The earlier review read delegation, independent context and result delivery. Compare actual independence of a product inquiry, parent receipt/adoption and background return. Current online defaults for tools, concurrency or gateway behavior may differ from the pinned engine. Do not adopt upstream memory, shell, session or permissions automatically. Product delegation remains distinct from the eight-worker organization of formal engineering stages.

### R05 · Hermes scheduled tasks / cron

[Scheduling documentation](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron/).

The recorded read covered the opening and task description. Use it as an entry to compare native framework scheduling with the host's existing OpportunityScheduler. Do not let two independent schedulers fulfill the same responsibility. Inspect actual pinned behavior and consumer/state ownership before considering replacement or integration.

### R06 · Effective context engineering for AI agents

[Primary engineering account](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents).

The earlier review read on-demand context, lightweight references, hybrid strategies and long-running work. It supports considering a few useful anchors plus autonomous original reading, while asking whether more context actually helps. It is not an implemented Anima feature or evidence that omission, pollution and waiting have improved here. Measure those actual consequences under current source and retention rules.

### R07 · LangGraph persistence

[Persistence documentation](https://docs.langchain.com/oss/python/langgraph/persistence).

An earlier durable-execution entry redirected to this material, whose body was read. Compare per-thread checkpoints with cross-thread persistent state and reopening. Persistence alone is not an executing background host. This is a design comparison, not a request to replace Hermes or the existing Work/SQLite owners.

### R08 · AG-UI events

[Event concepts](https://docs.ag-ui.com/concepts/events).

The recorded read covered event types, run lifecycle and separate text/tool/state meaning. It is useful when examining message parts, tool phases, state increments and cancellation ownership. Adopting a vocabulary does not require a protocol migration. An event exists does not mean its action completed, or that all associated text can be published without the current host checks.

## Memory and retrieval

### R09 · Letta stateful agents, versioned concepts

[Stateful-agent concepts](https://docs.letta.com/v1-sdk/concepts/stateful-agents).

The earlier memory link redirected here, and the research read core content. Compare editable core blocks with recoverable history. The entry was explicitly a previous SDK concept; do not treat it as a current API guarantee. Its persistence pattern does not automatically meet Anima's session-only, no-save, deletion or purpose restrictions, and persist-everything is not a safe default migration.

### R10 · Graphiti

[Official repository](https://github.com/getzep/graphiti).

The recorded review read README material on temporal facts, original episodes, source traceability and retrieval. Use it as a candidate where temporal relations actually help. Graph storage and maintenance have costs. Long-term memory alone is not a reason to migrate the whole store, and deployment behavior such as telemetry must be inspected in the actual version if chosen.

### R11 · LongMemEval

[Primary paper entry](https://arxiv.org/abs/2410.10813).

The recorded review read the abstract and version information, not a complete reproduction. Information extraction, cross-session reasoning, temporal questions, knowledge updates and unsupported-answer abstention can inform useful memory questions. Use the author-code/reproduction link from the paper's public record when that specific investigation needs it.

This benchmark does not cover the whole character, action, initiative or UI-continuity problem. Its public result cannot become Anima's result. Preserve independent actual exposure, source and execution evidence rather than infer companionship from memory question answering.

### R12 · Further leads requiring problem-specific reading

- [LongMemEval-V2](https://arxiv.org/abs/2605.12493)
- [EvalMem](https://arxiv.org/abs/2609.22231)
- [LeanMem](https://arxiv.org/abs/2608.03463)

Earlier notes obtained search-result abstracts only, without full reading or reproduction. Their described leads concerned longer agent experience, separating encoding/retrieval/generation failures and maintaining material according to content type. Read the actual paper when that problem arises. A title or abstract does not establish effectiveness, superiority or fit. A useful failure decomposition need not copy a paper's multi-agent scoring organization.

## OpenUI and dynamic expression

### R13 · OpenUI repository

[Official repository](https://github.com/thesysdev/openui).

The recorded review opened the entry and relevant README portions, without auditing every latest source file. Use it to identify the intended project and inspect the installed implementation when needed. Package version, language-specification version and document date are different; none silently upgrades another.

### R14 · UI generation

[Generation documentation](https://www.openui.com/docs/build-agents/ui-generation).

The earlier read covered keeping an existing agent/tool/transport and defining a shared component library with generated descriptions. The useful question is richer expression inside Anima's original conversation rather than rebuilding the whole product. A recommended service combination does not authorize a particular gateway or supplier.

### R15 · Defining components

[Component contract](https://www.openui.com/docs/openui-lang/defining-components).

The recorded review read the component-definition material. Compare name, explanation, schema and React rendering as one real author contract. Type correctness does not establish understandable controls, accurate arithmetic or valid original references.

### R16 · Interactivity

[Interactivity documentation](https://www.openui.com/docs/openui-lang/interactivity).

The earlier research read ActionEvent, local state, continuation and persistence. Use it to distinguish immediate local operation, meaningful return to the agent and a real business effect. A component event grants no permission; the host business entry rechecks scope, revision and actual outcome. The present program/CAS implementation already exists and needs preservation during a future redesign.

### R17 · Incremental editing

[Incremental-editing documentation](https://www.openui.com/docs/openui-lang/incremental-editing).

The recorded read was a complete relevant document passage returned through search, including statement merge, prior state and merging at stream completion; it was not a full current source audit. Use it to reduce regeneration-induced object jumps. A merge example does not prove the current React map will remain mounted or preserve newer user input; inspect actual identities and live/sending-time state.

### R18 · Related author/state/architecture entries

- [System prompts](https://www.openui.com/docs/openui-lang/system-prompts)
- [Reactive state](https://www.openui.com/docs/openui-lang/reactive-state)
- [Architecture](https://www.openui.com/docs/openui-lang/architecture)
- [Tools](https://www.openui.com/docs/build-agents/tools)

The earlier notes read relevant search passages rather than completely auditing each page. These entries address what the model knows it can construct, how local parameters change and how agent-side/UI-side tools divide duties. Check the selected installed path first. Do not adopt every newly documented feature at once or confuse local controls with an action channel.

## Selected-transport design questions

### R19 · Thinking-mode continuation

Design guidance for the selected Luna transport; this entry does not claim that a particular API protocol was exercised here.

Inspect whether the actual selected mode requires prior opaque reasoning state during tool continuation and constrains sampling parameters. Carry only the fields the selected protocol actually needs, under the same source and retention boundaries. This is a compatibility question, not a universal explanation of style or an invitation to tune temperature blindly.

Maintaining a protocol does not authorize changing the provider or making a paid validation call. Opaque protocol reasoning state is neither public prose nor personal memory. Product authentication, engineering tools and the explicit development transport remain separate.

### R20 · Tool calls and chat-completion fields

Design guidance for the actual selected transport, rather than a provider-specific field guarantee.

Check tool-call identity, streamed argument increments, result role, completion status and selected mode in the configured transport and its installed contract. Compatible JSON shape does not guarantee identical optional fields, visual input or behavior. Preserve those questions without claiming a complete field-by-field audit or a provider request in this paper.

## Character primary material

### R21 · Official characters and band

[Sakiko](https://anime.bang-dream.com/avemujica/character/sakiko/), [Mutsumi](https://anime.bang-dream.com/avemujica/character/mutsumi/), [another official Sakiko context](https://anime.bang-dream.com/mygo/character/sakiko/) and [the band](https://bang-dream.com/artist/avemujica/).

Earlier research obtained indexed official descriptions while some direct pages returned an error. It did not establish complete accessible profile-body reading. Use current reachable legitimate sources for identity, period and portrayal. A failed URL does not finish character study; an indexed snippet is not the original scene. The current [passports](../../characters/README.md) preserve their own richer evidence and all ten identities.

### R22 · Animate Times performance interview

[Interview](https://www.animatetimes.com/news/details.php?id=1711341102).

The earlier read covered performance discussion of Sakiko's outward change and layers of expression. It warns against flattening a person into surface adjectives. It is an interpretive source to combine with original context, not a record of the user's shared experiences or a reason to reproduce a long block of dialogue.

### R23 · Real Sound performance interview

[First page](https://realsound.jp/movie/2025/01/post-1912474.html) and [second page](https://realsound.jp/movie/2025/01/post-1912474_2.html).

The recorded research read portrayal discussion on the first page and opened the second. The material was labelled PR but was a first-person performance interview. Use it to avoid collapsing Mutsumi/Mortis into one generic quiet role, with actual period/portrayal and user choice kept separate. One interview does not replace the character's work or establish an exhaustive biography.

### R24 · Official videos and the rest of the cast

[Official channel](https://www.youtube.com/@bang_dream_official).

The earlier review preserved official CM/PV/video entries but did not watch them. The complete [character/initiative reference paper](../gemini/03-CHARACTER-AND-INITIATIVE-REFERENCES.md) retains the more specific entries and reading/viewing conditions. Listen to actual legitimate material before claiming its rhythm, pauses or wording was heard. Study each of the other characters from their own context rather than copying Sakiko/Mutsumi's template.

## Compare alternatives through actual consequences

For personality, compare preserving expressive core plus repairing composition, a justified core redesign and a final restyling layer. Look at identity, factual change, added latency and maintenance. A universal final rewriter is not the default answer.

For conversation, compare public speech between complete tool rounds and a real incremental event bridge, combined where appropriate. A fabricated progress stream or another model producing status chatter needs a real reason and cannot invent findings. Fixed filler does not provide company.

For memory, compare stronger original/lexical navigation, an appropriate semantic candidate path, time/relation structures and full prefilling. Inspect omissions, false recalls, condition/correction/deletion behavior, latency and cost. A retrieval leaderboard alone is insufficient.

For initiative, compare improving existing Attention and the same Harness with a redesigned executor or actual framework/native scheduling. Establish authoritative work/state and the real executing host; two independent systems must not both fulfill the same promise.

For dynamic UI, compare mature domain components, composable checked declarations and only where truly necessary a separately bounded artifact route. Precision, generative breadth, recovery and host authority matter as much as a familiar example's appearance.

For cleanup, compare convergence by duplicated responsibility and actual consumers with mechanical file splitting or broad rewriting. Observable simpler useful behavior determines the change; line count and churn do not demonstrate quality. Whole-Harness/OpenUI redesign still needs a complete target/migration rather than permanent isolated patches.

## Keep searching where new evidence points

Why did the model never see or choose a real capability? If evidence existed, was it lost in tool return, compression or prompt composition? Where did an initiative lose its consumer? Why did a successful action repeat after reopening? Why did an updated UI reference select another object? Which guidance flattened a character during tools? Why did an unfamiliar mathematical interaction require another dedicated template?

Read enough of a relevant primary source to make a decision, then return to the product and observe it. A research note can challenge a premise rather than merely support it. Necessary evidence is the goal, not a mandatory full-web reading campaign or a new framework installation quota.
