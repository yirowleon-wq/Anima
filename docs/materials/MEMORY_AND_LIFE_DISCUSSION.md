# Memory, shared life, and the assistant loop

This sustained design discussion follows a first technical memory proposal, the questions that challenged it, subsequent refinements, and the later rejection of a rigid conversation harness. Its examples describe hypothetical students and situations, not real records, present permissions or evidence of completed features.

The argument develops over time. Early proposals are retained so that their reasons and later corrections remain understandable; an early mechanism does not become the current implementation merely by appearing here. In particular, the later discussion rejects a host that classifies a person's meaning before the main model can understand it. Interpret requirement-oriented retrieval in that light. Database choices, research frameworks, evaluation proposals, and integration wishes below are historical design options, not instructions to install or execute them.

[Architecture](../ARCHITECTURE.md) describes the single pinned Hermes loop and authoritative owners; the [product contract](../PRODUCT_CONTRACT.md) governs source, time, consent, correction, and action semantics. The [development roadmap](../DEVELOPMENT_ROADMAP.md) carries unfinished work. The complete [two hundred life questions](../scenarios/QUESTIONS.md) have their own canonical text and are linked here rather than duplicated. The companion discussion of maps and dynamic conversation interfaces is [maintained separately](DYNAMIC_CONVERSATION_INTERFACES.md).

## Part I · From a profile to evidence-backed understanding

### I.1 · The question that started the design

The initial design question was narrower than the full product ambition: how should context and personal memory work technically, without treating background material as executable instructions? A list of possible memory categories would not be enough. The design needed to say what stays readily available, what is extracted from conversations, how extraction happens, how important detail remains recoverable, and how the result could feel like an assistant that understands someone deeply. Existing approaches can inform the answer, but their names cannot substitute for a design.

The broader ambition was a student companion that could combine authorized information and judgment across ordinary life:

- Know actual course occurrences, including the particular week, room changes, holidays, rescheduled sessions, examinations, and deadlines, rather than treating a weekly timetable image as a complete calendar.
- Read legitimately supplied activity progress, grades and units, relevant academic rules, notices, facility availability, and reservations; distinguish local records from whatever an institution actually recognizes.
- Accumulate an editable understanding of interests, preferences, ongoing aims and reasons through conversation. A person who protects long uninterrupted thought and a person who prefers a convenient nearby seat should not receive identical plans.
- Use a lawful campus map, declared origins, public weather and other appropriately authorized observations to consider routes and transitions. Device observations and health or journal sources were ambitions requiring their own real host and permissions; this discussion authorizes no location service or device access.
- Coordinate accepted arrangements and, where separately connected and authorized, prepare communication or interact with external services. Reading a calendar, saving a local event, reserving a facility and sending an email remain different actions.
- Notice an approaching exam or a useful reservation window, obtain the actual examination record, prepare the relevant place or route, and offer useful help at the right time. If someone has a self-chosen activity goal and a short remaining window, weather and available time may matter; that does not make a particular day compulsory or make a local log an official count.
- Offer one conversational entrance into these capabilities. A person should be able to discuss a plan or a game of badminton in natural language, without naming internal tools and modules.
- Remain useful to different lives and temperaments, accept that onboarding questions may be declined, and learn through actual interaction. A declined questionnaire must not authorize an invented personality or unlimited inference from account data.

The design also considered possible wider institutional adoption and examples of existing calendar applications and large operational AI systems. That possibility is not a verified claim of market uniqueness or proof that private university services are available. Institutional approval, lawful access, security, distribution, support and real feedback would be substantial work. Confidence in a model's security ability is not a replacement for credentials, data boundaries and a real threat model. The convenience of an API key or subscription login does not make product and engineering accounts interchangeable.

The first design reframed the goal: not merely a chatbot that remembers hobbies and a timetable, but an assistant that keeps bringing together what a person actually said, the present situation, the matters still being pursued, and the tradeoffs that matter in different circumstances. Courses, weather, maps, activity records and reminders serve that relationship; they are not independent information-query boxes.

The initial thesis was to maintain personal memory as an evidence-based, continuously updated system outside the model, and compile a temporary working view for each model request. Neither an ever-growing `USER.md` nor a chat-vector database is the whole memory system. The structures below were product-specific proposals, not claims to reproduce any company's undisclosed implementation.

### I.2 · What the research comparisons were meant to teach

The historical discussion considered several public approaches. These descriptions preserve the design lessons, not a current software support matrix or permission to install another memory stack.

**A readable profile is not the complete memory.** Public descriptions of ChatGPT memory motivated a distinction between a high-level memory summary and all the details potentially used for personalization. Correction and some source visibility mattered. The extraction algorithm, internal storage schema and complete recall strategy were not public. For Anima, the lesson is that a readable personal overview should be useful and correctable without becoming the only place information exists.

**A small standing memory can coexist with historical readback.** Hermes' documented bounded MEMORY.md and USER.md files, SQLite session records and full-text search illustrated a practical combination: a small snapshot at the start, with tools to return to details not promoted into it. The discussion also considered background review and optional approval for memory writes. Those features do not make a pair of files sufficient as the sole authority for this product's personal history.

**Memory is inspectable state.** The discussion specifically considered Letta's Git-backed MemFS and background dreaming/organization for their inspectability, editability and traceable changes. The transferable lesson was not simply to generate more prose; it was to treat memory changes as state that can be inspected and revised.

**Facts need time.** Graphiti's entities, relationships, invalidation, historical context and combined temporal, lexical, semantic and relationship retrieval drew attention to a central requirement: a person's circumstances change. A final timeless value cannot explain both past reality and what the assistant believed at the time.

**An automatic `add` operation is not a complete update policy.** The discussion used Mem0's accessible extraction/storage API, whose cited add description was additive, to caution against assuming that correction, conflict, expiry and forgetting are solved merely because a framework advertises automatic memory.

The choice was to borrow useful mechanisms, not assemble all these frameworks into competing stores. There should be one authoritative account of each kind of original information.

### I.3 · Separate the record, the understanding, the present, and the view

The first proposal distinguished six logical roles. They could mostly live in one database; they were not six independent services. This early list is a conceptual decomposition, while the current product contract gives the exact owner and memory-layer terminology used by Anima.

| Logical role | What it keeps | Why it stays distinct |
| --- | --- | --- |
| Original evidence, `source_events` | Original statements, authorized imported files, real tool results and explicit feedback, with source and time | An interpretation can be wrong; the original must remain available for review and re-extraction when retention permits |
| Memory assertions, `memory_assertions` | What the system presently understands, with evidence, conditions, validity, status and revision | A revisable understanding is not the original itself |
| Ongoing matters, `episodes` | The current question, decisions, rejected options and unresolved issues | A matter being worked on cannot be compressed into a personality sentence |
| Current domain state, `live_state` | Appropriately recent course, environment, origin or progress observations and their timestamps | A state today is not a permanent trait |
| Derived memory views, `profile_views` | A short personal overview, a domain summary or a task-specific context pack | These must be rebuildable projections |
| Retrieval indexes | Lexical, vector, entity or relationship navigation | An index helps locate originals and must not be the only copy of information |

For example, preferring an evening run is a preference; reporting one activity session today is a dated observation; a provider's counting policy is a rule; proposing an outing tonight is a suggestion. Conflating them can turn an assistant's suggestion into an alleged completed action, a past state into the present, or one person's experience into an institutional rule.

Every useful memory therefore needs to know who supplied it, whom it concerns, whether it describes reality or a wish, when it applies, and where the evidence is. Identity, subject and source authority cannot be supplied freely by generated text.

A readily accessible core profile can still exist. It should be a versioned derived view of relatively stable, explicitly expressed, broadly useful information. Detailed access experiences at one place, a term-specific rule or the reason one arrangement failed need not all occupy that standing profile. They must remain available in their proper underlying objects. A small index and a few high-value facts can be standing; the evidence and contextual records remain complete within their actual retention scope.

### I.4 · What one assertion needs to preserve

A statement as broad as “likes running” offers little help in choosing an actual arrangement. The illustrative alternative was a contextual assertion about not wanting to run before dinner. This is a synthetic schema sketch, not an imported person or the product's literal current database schema:

```json
{
  "id": "mem_run_before_dinner",
  "user_id": "student_demo",
  "subject_id": "student_demo",
  "predicate": "running.before_dinner.acceptable",
  "value": false,
  "assertion_type": "explicit_preference",
  "strength": "explicit_rejection",
  "scope": { "workspace": "personal", "domain": "daily_planning" },
  "conditions": [],
  "related_memory_ids": ["mem_run_evening", "mem_run_after_dinner_interval"],
  "valid_time": { "from": null, "to": null, "precision": "unspecified" },
  "evidence": [{ "event_id": "event_demo", "span_id": "span_demo", "relation": "supports" }],
  "status": "active",
  "version": 1,
  "needs_confirmation": false
}
```

Several parts cannot be omitted:

- **Assertion type:** an explicit refusal and an inference that someone might prefer another time do not have equal certainty.
- **Conditions:** avoiding rain and trying to run in good weather are not contradictory. They apply under different conditions.
- **Evidence:** point to the exact passage in the actual original; a second model-written explanation is not an evidence address.
- **Valid time:** “not this week” is not a permanent dislike. A move beginning next week must not replace today's origin.
- **Status:** active, awaiting clarification, disputed, superseded, expired and withdrawn are different usable states.

Recorded time is an additional axis: when the system learned a fact and when it corrected that understanding. “Where did this person actually live in September?” and “What did the assistant believe on September 15?” are different questions. Bitemporality keeps changes in reality separate from changes in knowledge.

Atomic assertions alone are also insufficient. A synthetic comparison between better concentration on campus and greater satisfaction at home needs separately retrievable dimensions, but also the shared episode: campus may make it easier to begin studying, while home offers autonomy and satisfaction. Planning solely for focus can miss what made a day worth having. Keep atomic records for retrieval and checking alongside contextual experiences that explain reasons and tradeoffs. Otherwise a person becomes a rigid parameter table.

### I.5 · Extraction is a proposal-and-commit process

The proposed flow was candidate extraction → evidence verification → semantic update → transactional commit. It did not require rewriting an entire profile after every turn.

#### I.5.1 · Establish the event and its boundary before interpretation

A new input needs host-owned identity, provenance and consent metadata before the system reasons about it:

```text
event_id
user_id
conversation_id
parent_event_id
server_sequence
source_type
speaker
received_at
content_reference
consent_scope
```

“I want to run every day” said by the user and a document saying “some students may want to run every day” are not the same personal evidence. A product brief saying the assistant should understand different temperaments describes a product requirement, not the current person's temperament. Commands at the end of an attachment remain attachment content; memory extraction cannot promote them into future authority.

Passwords and tokens belong in dedicated credential handling, outside ordinary personal-memory extraction. Permission to retain conversation history does not mean permission to turn all sensitive material into an indefinite profile.

#### I.5.2 · Preserve complete, traceable spans

A long dictated message must not be handled by `text = text[:4000]`, nor reduced to the “five most important points” before everything else is discarded. Give source spans stable identifiers. Preserve meaningful units; when a unit is long, process it in bounded chunks with necessary neighboring context. Keep questions and answers, negation, exceptions, and both sides of “but” connected.

The proposed processing ledger distinguishes:

```text
not processed
candidate understanding produced
current-event material only
more context required
quotation or hypothetical material
no supported personal fact found
processing failed; retry pending
```

This ledger shows coverage of processing, not proof that every detail has been understood. Its value is preventing an untouched second half from being reported as fully processed. Original wording matters particularly when transcription, multilingual text or numbers are ambiguous. Mistaking a count of sessions for a distance is a structural factual error, not merely a summary style.

#### I.5.3 · Give the extractor enough relevant originals

The proposed extractor receives the new source spans, related recent original conversation, context needed to resolve references, and existing understanding about relevant entities. It need not read the entire history every turn, but the final sentence alone may be insufficient.

For “Yes, but not on weekends,” it must establish what “yes” addresses; whether the earlier statement was a user commitment or an assistant's hypothetical option; and whether weekends are a one-week exception or a general constraint.

A candidate therefore carries the assertion, supporting source-span IDs, subject and object, conditions and exceptions, real-world validity, explicit/inferred/unresolved status, and any potentially related earlier record. `unknown` and “not enough evidence to form a memory” are valid results. A schema must not force invented values. Structural validity is not semantic truth; even a perfectly shaped response can be wrong.

#### I.5.4 · Verify evidence, not the extractor's confidence

The proposed two layers have distinct responsibilities. Deterministic checks cover what code can establish: source IDs exist, quoted bytes or Unicode ranges match, units and dates are valid, required conditions are present, the subject/scope is legitimate, and the source is currently usable. Semantic review rereads the original rather than trusting the extractor's explanation.

Review should catch a wish becoming an accomplished fact, “sometimes” becoming “always,” a week becoming an enduring preference, an assistant suggestion becoming a user choice, an illustrative student becoming the actual user, or a lost negation, condition, exception or comparison target.

The discussion suggested additional review for complex or consequential candidates rather than an expensive uniform chain for every explicit fact. A generated `confidence: 0.97` is not automatically a calibrated probability. It may be recorded as a score, but probability claims require appropriate evidence and calibration.

#### I.5.5 · Decide what changed

Similarity alone is not an overwrite policy.

| Proposed operation | Meaning |
| --- | --- |
| `ADD` | A genuinely new supported understanding |
| `SUPPORT` | Independent evidence supporting an existing record |
| `REFINE` | More precise conditions, time, reason or detail |
| `ADD_EXCEPTION` | An exception with a narrower applicable scope |
| `SUPERSEDE` | A genuine new reality replacing an earlier one |
| `DISPUTE` | A conflict that remains unresolved |
| `EXPIRE` / `RETRACT` | Expiry or withdrawal with its own meaning |

The current contract explicitly distinguishes correcting an earlier error from a genuine change in reality, and preserves the separate expiry, withdrawal and forgetting meanings. Its [current update semantics](../../.agents/skills/backend-director/references/memory-and-continuity.md#two-time-axes-and-nine-updates) should govern actual work; the early table above is not a replacement API.

A library that usually has walk-in seats but requires advance reservations during exam periods needs conditional rules that coexist. It should not become an unconditional reservation rule, nor lose the ordinary-period experience. If a person will move from an apartment to campus housing next week, today's route still uses today's lawful origin; the future change retains its effective time.

One statement restated by a summary, an assistant and several investigators is still one root of evidence. Repeating the initial misunderstanding does not create independent support. Deduplicate by provenance, not by how many agents echoed it.

#### I.5.6 · Commit through one controlled writer

Extractors and reviewers propose changes. The host commits them:

```text
validate identity and scope
→ compare the expected memory revision
→ write the assertion or its new version
→ write evidence links and relationships
→ update the processing position
→ record index/view refresh work
→ commit the transaction
```

Retries, reconnection and repeated background delivery must not turn the same evidence into multiple memories. Event IDs, idempotency keys and uniqueness constraints serve that requirement. The model interprets; the host owns permission, consistency and the actual commit.

### I.6 · Personalization should preserve reasons and tradeoffs

The useful understanding is often conditional: campus improves concentration but home feels more satisfying; a person dislikes moving after becoming absorbed in study but is willing to move for a run; a daily creative session matters, while routine background work need not be watched; an evening activity remains desirable but may lose to the next morning's needs.

None of this establishes a fixed location ranking, laziness or poor self-control. Alongside atomic assertions, a decision experience should retain the situation, actual available options, choice and refusal, explicitly stated reasons, observed outcome, and what remains an inference.

For example, “The library was not too far; I was already concentrating and did not want to restart elsewhere” changes the explanation from travel aversion to the cost of disrupting an established state. That correction should change a later recommendation, not merely produce “I understand.”

Three visits to a library might be caused by construction at home. Behavior and the reason for choosing must be separate. Without a stated reason, a hypothesis can be considered without being made a settled personality fact. A conditional option ranker was discussed as a possible later technique, but with little evidence, confirmed preferences, conditions and relevant experiences are preferable to a falsely precise psychological model. Personalization means using an experience appropriately in a new situation, while allowing a person to change.

### I.7 · Compile context around the real question

“What should I do next?” is not a good literal proxy for every fact that might matter. Stairs, a shower after an activity, a library absence policy, or equipment at home may have little lexical similarity to the question and still change the answer.

The early proposal described identifying information needs for a near-term decision: current time and declared origin, the next fixed commitment, ongoing work, available duration, candidate places, relevant preferences and limits, and recent state. Familiar activities can have known information requirements, and the model can discover additional requirements for unfamiliar ones. These are questions to investigate under current permissions, not a host keyword classifier that decides the meaning or depth of help before the main model sees the request. The later critique in Part IV makes that boundary explicit.

Four complementary retrieval routes were proposed:

1. Structured reads obtain applicable constraints, such as equipment only being available at home or an explicitly excluded time. Such constraints must not compete with casual conversation for five similarity slots.
2. Lexical and entity navigation handles names, buildings, dates, precise wording and scoped aliases. A common library nickname must not silently bind across institutions or people.
3. Semantic candidates can connect differently phrased experiences, such as disruption from changing places and the cost of regaining concentration. They remain candidates requiring original readback and an appropriate model/resource.
4. Event history retrieves comparable arrangements and actual outcomes, beyond the short profile.

Independent reads can be parallel where their contracts permit it. Merging and ranking are useful, but permission, validity and explicit applicability are not ranking scores.

Finding “prefers an evening run” should also lead to the relevant meal interval, weather exception, preferred kind of field, opening or lighting conditions, the wish to return home afterward, and any conflict between a late activity and sleep. Bounded dependency expansion supplies conditions, exceptions, disputes and sources needed to interpret the record. Correct individual facts can still produce a wrong combined decision if those relationships are missing.

Dynamic values need their own refresh. Memory can identify that a progress record would matter; it cannot invent the current count. Preserve the source, observation time, retrieval time, validity or refresh policy, and coverage. A failed sync leaves an old value, and an old origin is not “where you are now.” Different sources need refresh decisions based on their rate of change and present purpose, not one permanent TTL for every domain.

There must also be a route to original material that bypasses extracted assertions. An unextracted detail must remain discoverable when retention and permissions allow it. Original conversations and documents need independent navigation and readback. The discussion used a documented Hindsight limitation to make the distinction concrete: a retained document producing no extracted memory could remain unavailable to its recall and reflect operations. Retention alone therefore did not establish discoverability. Avoid that gap rather than assuming a stored file is automatically usable memory.

Only then assemble the working context:

```text
standing system rules and permitted tools
current request and necessary recent originals
current matter: goal, accepted/refused options, unresolved questions
relevant valid understanding: conditions, exceptions, disputes, original evidence
current domain observations with source and time
missing information and remaining uncertainty
```

Do not concatenate every conversation, tool result and personal record. Context engineering motivated just-in-time reading, compact state and high-value material, while also warning that excessive compression can lose details whose importance emerges later. Conditions and exceptions outrank decorative biography; a current correction outranks an old summary; original evidence outranks the model's earlier conclusion.

### I.8 · Coverage is an inquiry, not a promise of omniscience

“Consider everything” is not an engineering mechanism. The proposal used an explicit account of relevant information and gaps. For an evening outing, an example might be:

```text
preferred activity times: obtained
whether dinner has ended: unknown
weather: obtained, freshness still to check
facility opening and lighting: obtained
later fixed commitment: obtained
next-morning constraint: obtained
activity-progress update: synchronization failed
```

No known restriction, no result found, not queried, and conflicting information are four different states. They must not collapse into an empty field. When a missing condition can change the answer, read an appropriate source, offer a conditional alternative, or ask the one useful question. Do not silently assume the condition does not matter.

A candidate plan can itself create new dependencies. Recommending a study place is one decision; adding “go home first and then return” introduces routes, stairs, equipment or computer time, and the next fixed event. Revisit those dependencies rather than reusing the smaller question's context. Retrieval can occur again after an option has become concrete.

There is no defensible guarantee that one extraction has found every detail that might matter to every future natural-language question. The attainable commitments are more specific: no silent truncation; explicit treatment of known important constraints; visible gaps; a path back to unextracted originals; and evidence about the omissions still being found. This is stronger than promising that a vector store never forgets.

### I.9 · Compress work without repeatedly rewriting the person

Repeatedly turning “old summary + new conversation” into another summary, while discarding the originals, compounds distortion. The alternative was bounded task or event checkpoints:

```text
what is being attempted
confirmed decisions
rejected alternatives and their reasons
IDs of the constraints currently relied upon
unresolved matters
original files or results needed to continue
which original event positions the checkpoint covers
```

A checkpoint restores work; it is not a biography. For a changed portion, read the relevant original events and memory records rather than endlessly compressing the preceding summary. Retain needed recent originals and return to older ones as required.

Within-conversation state and cross-conversation memory are distinct. The discussion compared thread state with persistent memory and noted risks in both whole-profile rewriting and scattered memory collections. A model provider's response-continuation handle can continue a response chain; it does not thereby supply an editable, cross-task, evidence-backed personal memory service. The user's records should outlive a provider choice. Changing a model means adapting its context and transport, not making the person's memory begin again.

### I.10 · Recent corrections cannot wait for consolidation

Moving consolidation into the background creates a real consistency problem. The immediate path must receive the new input, apply withdrawal and permission changes, present the current words to the current model, and honor an explicit correction now. The background path can perform complete extraction, cross-conversation integration, deduplication, indexing and profile refresh.

Someone saying they no longer live at an earlier address cannot be routed from that address merely because the background processor has not caught up. The design therefore keeps both the latest received event position and the position through which long-term processing is complete. Legal unprocessed recent inputs form a current overlay. If lag matters to the present decision, perform the relevant catch-up; do not claim that all memory is current. Completion must cover the interval actually processed, not jump over a missing middle event.

Multiple agents read an identifiable revision and return source-backed proposals. At commit, compare `expected_version` with the actual version. A conflict requires rereading and an appropriate merge: new information, exception, supersession or dispute, rather than last writer wins. Reads may be parallel, while the same part of the same person's memory has one controlled commit path. Durable pending work and an outbox-like transaction prevent a crash between saving an input and queuing its processing from losing that input forever.

The historical Hermes memory-provider discussion proposed useful integration boundaries: memory context, pre-turn discovery, post-turn synchronization and tools. Native files would at most be derived summaries, not competing authorities. The model could search and read; formal modifications would go through the host-owned writer. Native and external providers must not repeatedly extract one another's summaries as fresh evidence. Correction, withdrawal and changed sensitive scope must invalidate affected context.

This was an argument for owning memory semantics and read/write protocols, not rebuilding an entire framework for its own sake. In the current foundation, the pinned Hermes AIAgent remains the one loop and the host owns records; its separate native memory behavior must not be reenabled by treating an old integration proposal as a new instruction.

### I.11 · Remember an obligation to reconsider, not an imaginary completed action

An approaching examination, a reservation opportunity or a user-chosen progress target requires a record of what should be checked later. That record is neither a normal preference nor an already executed calendar event.

A hypothetical entrustment could say:

```text
purpose: help with a declared activity goal before its deadline
required sources: remaining work, dates, feasible windows and relevant weather
reevaluation events: a progress update, a date boundary or a material forecast change
permitted effect: offer a reminder
limits: agreed channel, time window, cooldown, expiry and authorization
```

The target or rule must have its actual origin; this is not a claim that a particular university imposes such a requirement. Local completion, a self-report and institutional acceptance remain different evidence.

An event or timer can cheaply identify an affected matter and an opportunity for reevaluation. The model then considers the necessary lawful memory and current data through the same context mechanism. This is not a model continuously reading all personal data. It is changed state → affected purpose → proportionate information → a decision about useful contact, including remaining quiet.

Enjoying reminders does not authorize automatic reservations, enrollment changes or email. Affection, familiarity and a long-term preference cannot manufacture business permission. Fixed reminders separately accepted by the user are also not optional suggestions to be forgotten in the name of restraint.

### I.12 · Correction, forgetting and privacy belong inside memory semantics

A deletion button added at the end cannot carry the whole requirement. A context receipt can preserve the versions, information and original ranges supplied for a response, domain observations read, unresolved conditions, and actual check results. It explains what the system had available. It cannot claim to reveal the model's hidden causal reasoning.

When someone says an understanding is wrong, that receipt should help locate the specific assertion and evidence, correct the appropriate meaning, and update dependent summaries or preparations. A receipt is not a new authority for content whose source has since been withdrawn.

A forgotten detail may have descendants in originals, extracted assertions, episodes, profiles, vector rows, caches or saved context. Deleting one sentence in a standing file can otherwise allow background extraction to recreate it from an older source. Track provenance and derivation, stop relevant pending extraction, and clear or rebuild affected descendants. Context already containing withdrawn material needs the appropriate invalidation and clean recompilation too. Privacy-driven context replacement is not a reason to abandon a healthy engineering conversation or ignore the governing session rules.

Immediate non-use in the active system and eventual treatment of backups must be described separately. Do not promise instantaneous deletion from every medium or reversal of an external disclosure that the application cannot actually perform.

Identity, workspace and permission scope come from a trusted host session, not an arbitrary generated `user_id`. For a future multi-user service, database row isolation can be one layer, but privileged accounts that bypass it cannot be made safe by a prompt. The desktop's current architecture and a hypothetical server deployment are distinct.

The current person, a third party, a hypothetical product user and a fictional character can be confused before any cross-account leak occurs. Correct subject and world identification is therefore a memory requirement in its own right. Retrieved websites, files and historical text remain data, not higher-priority instructions. Structured boundaries do not grant their contents new authority.

### I.13 · An implementation direction, and how it would be judged

The first discussion proposed one database, one memory service, one background processor and one context builder. PostgreSQL and pgvector were considered as a possible server implementation for events, assertions, evidence relations, versions, work and lexical/semantic retrieval. Relationships could begin as ordinary tables; a graph database would be justified only by real traversal needs. That was not a requirement to add these dependencies, nor a replacement for the foundation's existing SQLite owner.

The proposed interface responsibilities were:

```text
ingest_event(...)
  receive an event with trusted identity, source and consent
build_context(...)
  prepare a working view for the question, time, scope and budget
propose_memory_change(...)
  submit an interpretation for controlled review and commit
search_memory(...) / read_evidence(...)
  find understanding and return to the original
correct_memory(...) / forget(...)
  apply the distinct correction or deletion meaning through descendants
```

These are responsibility boundaries, not five mandatory microservices.

Remembering a name would be an inadequate evaluation. The discussion proposed replaying meaningful changes and judging what the assistant should do. These are historical evaluation examples, not new executable cases or claimed successful workflows:

| Situation or change | Required distinction |
| --- | --- |
| A distance is corrected to a count of sessions | Replace the old unit and propagate the corrected meaning |
| “Not this week” | Keep a bounded condition rather than inventing a permanent dislike |
| Campus improves concentration; home improves satisfaction | Retain both dimensions rather than making one location ranking |
| An attachment describes a hypothetical early riser | Do not assign the trait to the current person |
| The assistant proposes Wednesday; no acceptance follows | Do not record commitment or completion |
| A new origin is stated before background consolidation finishes | Do not keep routing from the earlier origin |
| Ordinary walk-in access and exam-period reservations | Preserve both conditional rules |
| A detail was never placed in the profile | Keep an authorized original readback route |
| The person asks to forget something | Do not recreate it through a summary or pending extraction |
| Two investigators propose changes to one record | Preserve a visible revision conflict and resolve it correctly |

Judgment should separate omissions from invented facts, condition/unit fidelity, retrieval of necessary evidence, continued use of invalid old information, constraint violations in the actual recommendation, and the delay before a correction takes effect. The cited LongMemEval work was considered for extraction, cross-conversation and temporal reasoning, knowledge updates and appropriate uncertainty. A life assistant also needs to show that its real choices respect the person's constraints.

The discussion proposed comparing profile-only, vector-only and richer evidence-based mechanisms on the same history, questions and model. A better-looking personalized response is insufficient; unfamiliar questions, time changes and corrections must still work. Such evaluation work requires its own authorization and appropriate existing tools. This document neither creates tests nor authorizes a new runner.

The first round ended with three questions the system must keep being able to answer: What supports this understanding of the person? Does it still apply here and now? What does this request actually need to know? The feeling of being understood should come from correctable, traceable, context-sensitive judgment rather than a longer profile or a more intimate tone.

#### Historical reading references for Part I

These are the public references cited in the design discussion. They are documentary context, not a claim that their current APIs were reverified or installed for this foundation.

- [OpenAI Memory FAQ](https://help.openai.com/en/articles/8590148-memory-faq)
- [Hermes persistent memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory/)
- [Letta memory and background organization](https://docs.letta.com/guides/agents/sleep-time-agents/)
- [Graphiti overview](https://help.getzep.com/graphiti/graphiti/overview)
- [Mem0 add operation](https://docs.mem0.ai/core-concepts/memory-operations/add)
- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Hindsight retained documents](https://hindsight.vectorize.io/developer/retain)
- [Context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Thread state and memory](https://docs.langchain.com/oss/python/concepts/memory)
- [Response conversation state](https://platform.openai.com/docs/guides/conversation-state)
- [Hermes memory providers](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory-providers/)
- [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [pgvector](https://github.com/pgvector/pgvector)
- [LongMemEval](https://arxiv.org/abs/2410.10813)
- [Agent safety boundaries](https://developers.openai.com/api/docs/guides/agent-builder-safety)

## Part II · Five rounds of life questions, and what they exposed

### II.1 · Deliberately change the kind of question

The next design exploration imagines opening the product as a student, examines varied questions through five deliberately different rounds, and revisits the memory design for omissions, distinctions and details that need to become concrete.

The design distinguishes five perspectives rather than merely adding menus for study, life and entertainment. The canonical [two hundred questions](../scenarios/QUESTIONS.md) preserve forty subdirections with five questions each:

| Perspective | Complete canonical question groups | What it challenges |
| --- | --- | --- |
| Present reality | A1 courses; A2 arrival and belongings; A3 food/errands; A4 places/equipment; A5 deadlines; A6 money/resources; A7 present condition/environment; A8 interruption recovery | What actually happened, what is true now, and what can still be done |
| Possible futures | B1 learning gaps; B2 degree/course paths; B3 priorities; B4 research/development; B5 experiments; B6 alternative futures; B7 reversibility; B8 growth/reflection | Unchosen paths, preparation, changing aims and opportunity costs |
| Other people | C1 shared time; C2 shared work; C3 expression by relationship; C4 promises/boundaries; C5 shared resources; C6 family/closeness; C7 asking for others; C8 public roles | Multiple subjects, actual agreement and what may be shared |
| Inner experience | D1 help wanted now; D2 actual obstacles; D3 energy/attention/environment; D4 a satisfying life; D5 learning together; D6 autonomy; D7 personal change; D8 conflicting needs | The difference between helping a person and optimizing a caricature |
| The relationship with the system | E1 recovery/references; E2 corrections/time; E3 hypotheses/branches; E4 privacy; E5 evidence/absence; E6 action state; E7 device/modality continuity; E8 change/exit/review | What the system knows, what permits its use, and whether it can recover or stop |

The immediate-reality round does not decide a life's direction or diagnose motives. It considers concrete class changes, an actual available entrance, whether food is still being served, a missing item, a resource deadline or a practical recovery from interruption. A door being open is not food service; a notice canceling one class is not automatically an assignment extension; a class-free interval does not prove enough time to fetch equipment.

The future round is different: it asks what can be learned, tried, chosen or left open. A contemplated move or course failure must remain hypothetical. Research readiness requires actual work, not résumé language. More time spent is not itself evidence of improved ability. A low-cost experiment can help someone discover an interest rather than turn the interest into a binding long-term goal.

The social round adds multiple people and unequal permissions. Four participants need their own confirmations; one person's silence is not everyone's agreement. A private reason can guide a personal decision without appearing in a group message. Asking for a roommate does not make the roommate's limits the user's limits. Shared spending and equipment have actual owners, promises and dependencies. Being a student representative or group leader changes the audience, not ownership of everyone's private information.

The inner-experience round asks what kind of help matters now. Serious analysis can be wanted instead of comfort. Moving may be difficult because of packing and restarting, rather than because the destination is disliked. A quiet place can feel oppressive; wanting company need not mean wanting conversation. Time with no résumé value or measurable output can still deserve protection. A person can prefer another mode today, reconsider an old goal, or remain unsure without receiving a permanent label.

The system-relationship round asks for original reasons, precise references, effective corrections, separate worlds, selective disclosure and truthful execution state. A draft is not a sent message; a failed connection leaves a reservation's outcome uncertain until checked. A second option in an image needs the original option identity and region, not the eternal label “second.” Exiting the product, withdrawing a source or changing models must have coherent consequences.

Research, finances and multi-person cooperation were exploratory extensions of the original conversational companion ambition. The list did not establish two hundred approved features, an exhaustive universe of life, or two hundred passing checks. Its purpose was to make weaknesses in the proposed model visible.

### II.2 · The original design needed more than extra profile fields

Evidence, assertions, current matter state, domain data, hybrid retrieval, revision and deletion remained useful. Yet the first proposal still leaned toward “save the past accurately and find it when relevant.” The broader problem is what a sentence means now: describing reality, exploring a possibility, asking for help, correcting an understanding, or limiting the system. Each can change a different state and must leave other states alone.

The response developed ten refinements. Some early wording described a semantic dispatch stage before extraction. That history is retained here; it must not be read as permission for a host classifier to preempt the primary model. The later critique rejects precisely that failure. Meaning belongs to the model's understanding of the original words, while deterministic source, consent and commit boundaries remain the host's responsibility.

### II.3 · Refinement one: a sentence can contain several different operations

Consider this hypothetical input:

> Suppose I move to campus housing next month. Compare two arrangements, but do not change the calendar. I do not want to run today; do not turn that into a permanent preference.

A single generic personal-information extractor should not flatten all of it into a profile. The relevant distinctions are:

| Passage | What it can mean | What must not happen |
| --- | --- | --- |
| A possible move next month | A hypothetical world for comparison | The present residence changes |
| Compare two arrangements | A comparison matter | An option is accepted without a choice |
| Do not change the calendar | A current action boundary | The restriction becomes a harmless prose note |
| Do not run today | A bounded exception | The enduring activity preference is overwritten |

The proposed interpretation record included speech act (statement, correction, hypothesis, request, authorization, withdrawal or quotation), subject (self, another person, group or fictional character), referenced object, reality/decision status, time, applicable scope, and exact original evidence with needed context. Authorization and withdrawal affect permission; a hypothetical affects a branch; a commitment affects a matter; only supported personal understanding belongs in personal memory.

Uncertainty is essential. “Fine, let's do that” cannot accept all preceding suggestions when its referent is unclear. Structured output validates a shape, not the meaning of the interpretation. A proposed write should carry why this kind of state change follows from the actual words, rather than merely outputting a plausible memory sentence.

### II.4 · Refinement two: reality, scenarios, options and effects are different

The assistant must be able to discuss a life that does not yet exist without recording it as current reality. The discussion distinguished:

```text
actual fact
hypothetical scenario
assistant-proposed option
user-selected direction
an actual commitment
an observed execution result
```

These are states and objects, not six copied versions of the same text. A world identifier can distinguish real life from a possible move, a competition-first branch or a project-first branch. A real calendar query cannot accidentally retrieve a hypothetical address, timetable or goal as current fact.

Adopting part of a scenario is not a wholesale replacement of reality. Determine which changes are actually decided, when they take effect and what remains conditional, then use the proper owner to commit each authorized change. “Prepare for the campus-housing option, but the application has not been accepted” can authorize preparation without establishing that the person already lives there.

Likewise, “The reservation may have succeeded before the connection broke” needs an unknown outcome and inspection of the original attempt. Treating it as a simple failure invites a duplicate booking; treating it as success invents a receipt. Memory management alone cannot supply these state transitions.

### II.5 · Refinement three: distinguish kinds of personal understanding

Adding labels does not solve the fourth round's questions. The proposed distinctions were:

| Kind | The question it answers | Illustrative content |
| --- | --- | --- |
| Conditional preference | Which choice is preferable under these conditions? | Avoid disrupting an established period of concentration |
| Value and tradeoff | What matters when benefits conflict? | Satisfaction cannot always yield to efficiency |
| Ability and resource | What can actually be done now? | Available equipment and demonstrated prerequisite knowledge |
| Current state | What applies today or at this moment? | A present wish to move or a current self-report of fatigue |
| Interaction agreement | How should the assistant participate this time? | Listen, hint, explain directly or help compare |
| Explanatory hypothesis | What reason might account for an observation? | An unclear completion standard may be the obstacle |

The last kind is particularly dangerous if it silently becomes a fact about the person. Not visiting the library three times might reflect dislike, a repeated need for home equipment, or a lack of a long enough interval. Retain competing explanations when evidence does not settle them. Choosing the most psychologically attractive story is not proof.

Conditional comparisons are more useful than one permanent score for every place. A shared study space may suit independent mathematics without equipment needs. Home may suit frequent spoken interaction with creative tools. When the person explicitly wants to relax, study efficiency should not become the sole objective. Understanding should become more precise about applicable conditions, not more confident about defining the person.

### II.6 · Refinement four: learning needs evidence of performance

Course enrollment and grades are not substitutes for independent ability. Learning observations should preserve the concept or skill, actual task, help or answers available at the time, parts completed independently, the point of error or hesitation, comparability of difficulty and source, when it happened, and whether independent reproduction followed.

A revisable conclusion such as “completed with a hint, but there is not yet evidence of finding the entry independently” is more useful than “mastered.” Interaction preference is separate: wanting a direct answer today is not permanent opposition to hints; requiring a hint once is not proof of an enduring loss of ability.

For a new learning suggestion, read the recent independent performance, how far prior help already revealed the solution, and the current spoiler or explanation preference. Context must preserve the teaching position and what has actually been exposed, not just a problem and a final answer. This supports the same problem, attempt, hint depth and return point; it does not claim that full handwriting or independent learning assessment is already complete.

### II.7 · Refinement five: a current-use contract

Before private retrieval, determine which sources may be used, for which subject and matter, for which audience, and with what possible effects. The historical `ContextContract` sketch expressed those dimensions:

```json
{
  "task_kind": "compare_options",
  "subject": "mentioned_roommate",
  "world_id": "scenario_move_to_campus",
  "allowed_sources": ["current_conversation", "authorized_campus_information"],
  "personal_memory_mode": "exclude_account_owner_profile",
  "audience": "current_user",
  "action_mode": "analysis_only",
  "interaction_mode": "explain_tradeoffs",
  "retention_mode": "session_only"
}
```

These were illustrative fields, not an everyday form every person must fill, a literal current schema, or an exhaustive intent taxonomy. A question for a roommate cannot reuse the account holder's preferences as the roommate's. “Only this file” excludes other memory even if it appears relevant. “Compare first” permits appropriate inquiry and simulation without calendar modification. A group audience cannot receive private background unchanged. Venting need not turn into planning or pressure.

The applicable boundary must hold before retrieval and continue through the reply and tool use. Reading all private information first and later telling the writer not to mention it is insufficient. In particular, information allowed for private judgment and information allowed for the present audience are not identical. A permitted busy/free projection can support coordination without exposing why the person is unavailable or the private event's title.

### II.8 · Refinement six: complete the conditional combination

A short “Where should I go now?” can depend on sources separated in both time and owner: a declared origin, no bicycle today, where equipment is, the next actual course, the current task, minimum useful study duration, opening conditions and the cost of switching places.

A query followed by the ten nearest vectors is not a sufficient architecture. The proposal tracked both the information needed and the evidence already obtained and usable in this turn. Each relevant condition can be current, stale, conflicting, unqueried, failed to obtain, inaccessible by permission, or confirmed not to impose a restriction. “No time restriction” is not the same as “the next class was never read.”

Candidate answers again create dependencies. Remaining on campus might not need home equipment details. Going home to work introduces routes, equipment and a possible return deadline. Follow those dependencies rather than reread every history item on every turn.

A larger context window is not a complete answer either. The historical discussion cited *Lost in the Middle* for position-sensitive use of information in the models and tasks it studied. That does not establish an identical limitation in every later model. It does establish why information being supplied and information being used reliably should be assessed separately. Count necessary conditions that actually affect the outcome, not just retrieved records.

### II.9 · Refinement seven: recover the decision situation

“Where did we stop?” exposes a gap when only a title, progress marker and latest conclusion survive. A continuing matter also needs to know why an option was chosen, what was tried, why another option failed, and whether that reason still applies.

The expanded matter record included the goal and revision, confirmed constraints, stable candidate IDs, the selected option, refusals and reasons, attempts and outcomes, unresolved questions, the next smallest question, and original evidence, files and artifact versions.

Refusal is not necessarily permanent. A person might reject working away from a machine because there was no permitted remote continuation. If that capability later genuinely becomes available, the old reason may no longer rule out the option. Remembering the refusal should make the comparison better, not close the option forever.

Similarly, “the second option” in a screenshot belongs to the option identity and the image region shown then. A later reorder must not change its meaning. Multimodal addresses therefore include message and Unicode range for text; file revision and page or paragraph for documents; image revision and region/object identity for pictures; and original audio, time interval and transcript revision for speech. An address does not itself prove that recognition or transcription was correct.

Continuity means restoring the circumstances of the decision, not merely remembering a task's name.

### II.10 · Refinement eight: immediate corrections and causal freshness

Suppose event 120 has arrived, extraction is complete continuously through 117, and index refresh through 115. Event 120 corrects that the person did not bring a bicycle today. Cycling must stop being the assumed route immediately, without waiting for every background task.

The proposed current view combines a usable long-term snapshot, relevant unmerged originals, this turn's corrections/restrictions and the current domain observations actually needed. Track contiguous progress or explicit holes. If 118 failed and 119 completed, the largest completed sequence does not certify 118.

Recheck at least when forming a proposal and again before a real submission or external disclosure. Between them, the person may cancel, withdraw a source, or change an event on another device. A context pack consequently needs the memory revision, source-event coverage, important observation times, permission revision and dependent goal/option revisions. Revalidate what changed instead of blindly carrying on. This is the technical substance of “I just told you; why do you still not know?”

Independent mobile hosts and cross-device convergence remain separate development work. This example preserves their causal requirement; it does not certify a working independent phone product or authorize location services or permissions.

### II.11 · Refinement nine: commitments, reminders and effects need related lifecycles

The system needs to remember what was promised, who promised, whether it happened and when it should stop. The discussion distinguished:

~~~text
proposed
accepted by the person
confirmed by required participants
authorized for execution
in progress
successful with a real receipt
failed
outcome unknown
canceled
~~~

In a shared arrangement, each participant retains their own confirmation. One person's agreement is not everyone's agreement.

A continuing reminder should depend on a still-valid purpose rather than an isolated “remind every day” sentence. For a hypothetical competition, retain the current goal, useful trigger (a nearby milestone or meaningful progress change), needed progress/deadline/time sources, agreed interruption style and channel, pause conditions, and completion/cancellation/expiry conditions. Canceling the goal requires reconsidering its dependent reminders, preparations and proposed actions.

Sometimes retiring a goal means stopping it from governing the future while preserving legitimate historical explanation. It is not always deletion of every sentence about it. Likewise, a successful past method is not future action permission. The historical discussion cited MemoryGraft as an example of poisoned experience influencing an agent in its studied setting: provenance and trust boundaries still matter when something was described as successful before. A remembered shortcut cannot bypass present permission.

### II.12 · Refinement ten: storing, using, disclosing and deleting are separate

The questions reveal several different requests:

- Use these words now without retaining them as long-term understanding.
- Retain this material, but only for this project.
- Use information in private planning without exposing it to a group.
- Forget the fact and prevent an older source from extracting it again.
- Keep lawful history while retiring its current applicability.

Active/inactive alone is therefore insufficient. Retention and use policy belong to the object. Promising not to put content in a profile while retaining it indefinitely in an unrestricted, re-extractable log would miss the request's actual meaning.

For genuine forgetting, follow the affected original content, assertions, task summaries, profile views, indexes, caches, pending extraction, dependent reminders and future context. Separate immediate non-use, active deletion, backup handling and disclosures that cannot be recalled. Local deletion cannot undo information already exposed to another person or service.

Non-use is not always forgetting. An old home can explain a past route without serving as today's origin. A former interest can remain part of a change history without continually overpowering a present interest. Memory should support change as deliberately as accumulation.

### II.13 · Put the refinements through one request

The second design round condensed its proposal into the following flow. It describes responsibilities; it is not a command to run a separate model at every arrow:

~~~text
original request or an authorized source change
→ understand speaker, subject, reality, quotation and purpose
→ establish the applicable current-use boundary
→ restore the relevant matter and memory revisions
→ find needed facts, preferences, experiences and originals
→ obtain the current state required for the decision
→ account for missing, stale and conflicting conditions
→ develop a useful reply or candidate arrangement
→ read additional dependencies introduced by that candidate
→ answer, or commit only after current permission/version checks
→ retain actual outcomes and supported change proposals
→ complete authorized background consolidation and derived refresh
~~~

Venting may not require a course or map read. A room query need not rebuild a life's goals. Comparing two six-month paths may require substantial investigation. Depth should follow the actual question, evidence gaps and the cost of mistakes, with the primary model free to understand and inquire. It should not be determined by a host's fatigue keyword or a rigid short-answer tag; Part IV explains why even an apparently semantic prefabricated pipeline can repeat that mistake.

A continuous mixed example tests the distinctions together:

> Do not use my habits for this. I am asking for my roommate, who has classes at two teaching sites tomorrow. What changes if they move to the new residence? Compare first; do not change the calendar. I previously said they were free on Wednesday, but they have since corrected that.

The right result is more than a memory sentence saying the roommate is unavailable Wednesday:

1. **Subject:** the comparison concerns the roommate. Do not write the roommate's circumstances into the current person's profile.
2. **Source:** use the information actually supplied or explicitly shared; asking on someone's behalf grants no access to that person's account.
3. **World:** the current residence is real within the supplied scenario; the possible new residence remains a comparison branch.
4. **Time:** resolve tomorrow from the message's time and declared zone. An unclear Wednesday is not automatically every Wednesday.
5. **Correction:** when scope and time align, use the explicit later correction while retaining its evidence.
6. **Authority:** compare without modifying the actual calendar or sending invitations.
7. **Retention:** keep the third-party material only within its legitimate purpose and duration, rather than automatically creating a permanent cross-purpose profile.

Subject, time, hypothetical worlds, correction, authorization, scope and context all coexist in this one sentence. The difficulty is often their consistency together, rather than the absence of one isolated module.

### II.14 · Two hundred questions are not a completed evaluation

Submitting each isolated question and judging whether the reply sounds good cannot establish memory reliability. Many questions depend on what was said before, what changed afterward, or what must never be used.

The discussion proposed that an eventual authorized evaluation account for the preceding input sequence, original stored state, current input, permitted sources, tool observations, evidence that should and should not be used, allowed and forbidden memory changes, allowed and forbidden actions, and requirements on the actual answer. Those are explanatory evaluation dimensions, not executable fixtures supplied by this material. Current work follows the applicable restriction on new test engineering.

“Not running today means only today” must survive today's choice, tomorrow's changed applicability, consolidation lag, compressed context and an eventual device transition. LongMemEval's historical comparison dimensions concerned extraction, cross-session and temporal reasoning, knowledge changes and uncertainty. MemoryAgentBench added attention to accurate retrieval, learning in interaction, longer understanding and selective forgetting. The important product question is not only whether something can be recalled, but whether it should still be used.

Two complementary comparisons were proposed:

**Relevant history should change the answer.** The same request for a study location can properly differ if equipment is present or absent, a move is effective now or only next week, the person wants relaxed reading or independent difficult work, or the question concerns a roommate instead of the account holder.

**Irrelevant private history should not change the answer.** A material-only summary, a translation of a supplied sentence, or a fictional-student analysis should not import unrelated experiences, projects, meal habits or personality guesses. Personalization includes knowing when not to personalize.

The dimensions should remain separate:

| Dimension | What needs evidence |
| --- | --- |
| Memory changes | Correct subject, unit, conditions and reality status |
| Updates and forgetting | Timely corrections and retirement of expired influence |
| Context | Necessary lawful evidence included; irrelevant or forbidden material excluded |
| Continuity | The same matter, alternatives, reasons and artifact revisions remain recoverable |
| Actions | Actual authorization, no duplicate effect, no invented completion |
| Understanding | The current need is respected rather than always turned into a plan |
| Explainability | Source locations, fact/inference distinctions and important unknowns are available |

A system can repeat past statements accurately while acting without authority. It can contain no factual error and still turn venting into unwanted life management. An architecture diagram with more boxes does not settle either problem.

The conclusion was to extend reliable storage and recall into a personal-understanding system with explicit semantic and authority boundaries. What should this sentence change? Under which conditions may this understanding be used? When is a direction only a possibility, then a commitment, then an actual result? How does an old interpretation stop interfering after someone changes?

A better assistant may remember a refusal and notice that its reason has expired; know a usual preference and hear that today is different; reduce the burden of choosing without treating exploration as approval; and respect a long-term aim while allowing it to be reconsidered. The questions expose concrete gaps but do not prove completeness. Continuous interaction, corrections, branches, invalidation and permission changes remain the situations in which those boundaries must actually hold.

#### Additional historical references for Part II

- [Lost in the Middle](https://arxiv.org/abs/2307.03172)
- [MemoryGraft](https://arxiv.org/abs/2512.16962)
- [MemoryAgentBench](https://arxiv.org/abs/2507.05257)

## Part III · Turn the understanding into a coherent runtime

### III.1 · Preserve the two foundations, then connect the real entrance

The next synthesis argued that the product should be more than a chat box, a memory add-on and several plugins. The whole collaboration mechanism must continuously understand a person, constrain information use, maintain work, and take responsibility for real actions. It must know what supports an understanding, whether it still applies, what this request may use, and which dependent suggestions or actions should stop when the premise changes.

The first round had separated originals, revisable assertions, ongoing matters, current observations, derived summaries and indexes. A usual activity preference, a report of exercising today, a provider-recognized result and the assistant's suggestion are different records with different sources, validity, update rules and implications. Candidate extraction, evidence verification, conditional updates, transactions, requirement-oriented retrieval, original readback, prompt correction, derived deletion and concurrency control should be retained rather than replaced with fashionable terminology.

The second round showed that one sentence can combine asking for someone else, a hypothetical move, a correction, a request and a narrower authority. Speech meaning, world, current-use boundaries, audience, commitment state and present participation therefore need to become protocols that actually govern the application entrance, not remain design vocabulary.

The synthesis did not conclude that every existing part should be rewritten. Domain ownership, separation of responsibilities, existing maps, local arrangements and data readers were valuable. Personal understanding must not own a second official grade ledger, timetable or activity record, and a profile must not substitute for permission.

It also stated an important evidence limit. At that point, the reviewer had discussion and navigation documents rather than the live repository and original runtime reports. Reports of a flat Memory{text, quote, createdAt}, indiscriminate preference/context insertion, incomplete derived forgetting and inconsistent map/device descriptions were documentary observations requiring a real code check. They were not an independent audit of the current product. The current architecture has a much richer owner, source, version and privacy structure. Do not use that old diagnosis as a current capability table.

The chosen direction was to keep useful product capabilities while rebuilding the coordination among them. A full replacement remains planned work with explicit migration seams; this discussion does not establish that it has been implemented.

### III.2 · What the research changed in the design

The synthesis reported a historical set of eighteen research papers, implementation pages and official documents, with separate reading-scope and adoption notes in its design materials. That number is not a claim of eighteen fresh readings or a guarantee that a benchmark result transfers to Anima.

| Research influence | The concrete design consequence |
| --- | --- |
| LongMemEval and MemoryAgentBench | Separate storing correctly, finding, using, updating and stopping use. A continuous correction/expiry/forgetting history matters more than one “Do you remember?” |
| Hindsight and Graphiti | Preserve facts, experiences and explanations separately; make source, time and relation fundamental. Begin with existing storage rather than importing a graph stack for its name. |
| PersonaMem-v2/v3 | Judge contextual use, not merely recall. Outdated, repetitive and unnecessary personalization can be failures. |
| Hermes memory | Borrow small standing context, historical discovery and lifecycle hooks without creating native, external-provider and application stores that compete as truth. |
| MemoryGraft | A remembered success can be contaminated. Experience supplies evidence, not executable instruction or future permission. |
| Context-engineering practice | Read just in time, keep recoverable work state and compress within boundaries. Brevity must not mean deleting a condition, denial or exception. |

The common lesson was that understanding depends less on a larger personal introduction than on evidence, conditions, change and the right occasion for use.

Implementation details also mattered. The discussion specifically noted that FTS5 trigram queries do not by themselves match a substring shorter than three Unicode characters. A two-character place alias therefore needs an appropriate entity/alias or bounded fallback route; merely enabling FTS5 does not settle it. Word and alias handling need suitable indexing and original readback rather than assumptions about a particular language. The current optional semantic resource remains separately configured and must not be described as loaded merely because its interface exists.

Provider protocol state is also not personal memory. A provider may require an opaque reasoning/protocol continuation field for its own request chain. Preserve it only under that protocol's actual contract; do not turn it into a user fact or expose it as personal reasoning. A narrowed source or transmission scope may require clean recompilation of the request chain.

### III.3 · A modular host, with clear responsibilities

The proposal kept the product's technical direction rather than demanding an immediate database migration or the wholesale adoption of another application's interface and tools. Electron, React, TypeScript, SQLite and the appropriate product provider could form a modular monolith. UI, permissions, memory, planning, actions and integrations need distinct responsibilities without becoming a collection of separate services.

The proposed chain was:

~~~text
request or authorized observation change
→ trusted identity, purpose and retention boundary
→ understand subject, meaning, reality/hypothesis and time
→ establish the applicable current-use contract
→ recover work, relevant understanding, originals and current observations
→ check conditions, exceptions, conflicts and gaps
→ form a useful answer or alternative and investigate new dependencies
→ project output for the actual audience
→ for an effect, recheck its current authority and revision
→ execute through the true owner, retaining a receipt or unknown result
→ update understanding, work and dependencies under their own rules
~~~

This was not intended as a mandatory heavy path for every message. Venting need not read a timetable; finding a classroom need not retrieve lifetime goals; a substantive alternative may need several reads. The later redesign further clarifies that the main model, not a prefabricated host intent route, chooses that depth.

#### III.3.1 · Preserve a tradeoff structure

Stable facts require evidence, applicability and valid time. Conditional preferences compare choices in situations. Values explain conflicts among concentration, autonomy, comfort and efficiency. Resources and performance distinguish equipment availability and independent ability from success after assistance. Current state belongs to now. Explanatory hypotheses stay uncertain and can coexist.

Not going to a library may be about equipment at home, only forty minutes being available, already being absorbed in work, the effort of packing, or simply wanting rest this time. Save a stated reason and know when it ceases to apply.

The proposed DecisionExperience keeps the options actually available then, the assistant's suggestion, the person's choice, explicit reasons, actual results and unobserved portions. Borrowing a computer can reopen an option previously rejected for lack of equipment. Reopening is not acceptance, and it grants no automatic calendar write.

#### III.3.2 · Complete the relevant combination, not a top-ten list

A short request can depend on constraints with low surface similarity. The early TaskNeeds name represented what the decision needed to establish and which needs arise only if travel, equipment, weather or effects enter the option. Structured conditions, lexical/entity discovery, relationships, experience and original readback then work together. Hard limits do not compete against casual chat for a top-k slot; a preference arrives with its conditions and exceptions.

Unqueried, not found, failed, forbidden, stale, disputed and confirmed no restriction remain separate. If budget cannot establish a necessary premise, make the uncertainty and remaining work clear, offer a conditional result or ask a consequential question. Do not silently delete the hard premise and present certainty. Do not reinterpret a tool or output limit as permission to reduce the person's original goal without explaining what remains.

A candidate can add travel, equipment, transition and return-time dependencies, so inquiry can continue after the first draft. This is purposeful reading under the current task, not an instruction to scan an entire life for every reply.

#### III.3.3 · Apply retention before persistence and audience before writing

Two boundaries were made stronger. First, determine permitted retention before writing raw chat, background work or an index. Session-only content must not quietly enter long-term understanding through a residual log or queue.

Second, project what the outgoing audience may receive before giving it to the outward writer. A group-availability message often needs intervals, not private event titles. Handing all the details to a writer and appending “do not leak” is a weaker boundary.

Forgetting follows originals and their actual descendants into summaries, indexes, caches, pending work, reminders and model request chains. A restored backup or reconnecting offline device must apply the deletion barrier before reuse. None of this can pretend to recall an already delivered external disclosure.

#### III.3.4 · Dependencies connect memory, planning and effects

A proposal needs to identify its supporting facts, preferences, permissions, resources and assumptions, with revisions. Then a course change rechecks the affected interval and route; a canceled goal retires dependent preparations; a new resource reopens its old blocking reason; a withdrawn permission invalidates affected in-flight context.

The aim is precise invalidation while retaining accepted independent arrangements, rather than replanning every aspect of life whenever anything changes.

#### III.3.5 · Admit an unknown outcome

Accepting a direction, saving a local event and succeeding at an external reservation are different. The illustrative state chain was approval → dispatch → unknown result → inspection → confirmed success, confirmed failure, or still unresolved.

A service can have acted even if its reply was lost. A timeout cannot authorize a second effect. Approval binds exact parameters, audience, revision and expiry; a check during planning does not replace the check immediately before dispatch. Real undo and compensation have their own outcomes.

#### III.3.6 · Domains, providers, tools and methods are not one universal plugin

A domain owns facts and rules. A provider connects an actual source. A tool exposes a controlled operation. A skill or task recipe can describe useful methods and information needs. The map, campus reader and weather source do not each establish a separate freely editable master profile.

A high-level lookup entrance can remain useful for the model, with precise domain contracts, deduplication and refresh handled inside the host. That avoids both dozens of overlapping model tools and a single unbounded operation that owns everything. The current finite library, progressive tool discovery and bounded memory inquiry should be read in that spirit, rather than inferred from the presence of an old method name.

### III.4 · A commission must not be satisfied by an unused shell

The study developed a continuous design discussion, structured design, engineering brief and detailed implementation/acceptance specification. These serve different reading and execution purposes; they are not evidence that the application had already changed. Current project documents state the actual implementation and observations.

Its proposed sequence was baseline protection → permission/evidence → memory/context → matters/dependencies → action/recovery → providers/extensions → actual entry points, quality and packaging. Its substantive requirements remain useful:

- New mechanisms must be called by the original product entrance. A ContextCompiler used only by a demonstration while the real composer still concatenates every preference is not integration.
- Inspect real data flow: actual persistence, retrieval access, model requests, external request counts and the person's visible state. A pleasant final sentence alone is insufficient.
- Mechanism evidence and model quality differ. A scripted model can exercise revision or cancellation logic without demonstrating that a real model understands a temporary exception or a request on behalf of someone else.
- Unavailable reservations, health sources and email must stay unavailable rather than become a false success. Preserve their intended contracts, useful failure behavior and external conditions.

The historical package described forty directions, two hundred questions and ninety-four multi-turn acceptance specifications. A scenario specification is not a successful application run. Even its own completed file/link/JSON/type-sample checks were stated separately from real application, provider and model validation.

For deletion, the important question is not only whether the assistant denies remembering. Restart, a late worker, re-extraction and a restored backup must not bring the withdrawn content back into active use. For external work, an executed action with a lost receipt is a more revealing situation than an uncomplicated success.

These preserve the intended acceptance standard. They do not authorize new tests, fixtures or runners in the present work. Use the applicable ordinary workflow and existing checks; distinguish their limits honestly.

### III.5 · Future room is more than more plugins

Sixteen experience extension contracts were discussed with experience goals, objects, insertion points, permissions, failure behavior and real activation conditions. The [two distinct extension families](../DEVELOPMENT_ROADMAP.md#two-extension-families-each-with-its-own-sixteen-goals) retain that breadth; the experience family must not be replaced by the separate platform family.

Five arguments were emphasized:

**Keep options open.** Someone considering research and an internship can benefit from shared preparation, the real latest decision time, exit costs and irreversible steps. An OptionWindow is not a reason to pick and record a goal immediately.

**Remember why a refusal happened.** “Do not work on that project here” may have meant equipment was absent. Connect resources, the blocking reason and the option so a real change can prompt reconsideration. Do not make it a permanent dislike of the place.

**Allow unfamiliar lives.** Explicit exploration can reduce the weight of historical soft preferences while preserving hard boundaries, real limitations and action authority. One experiment need not rewrite identity. Personalization must not make every future a repetition of the past.

**Know where the learner actually got to.** Seeing an answer, completing after a hint and independently finding an approach are different. Preserve observation, assistance, exposed content and hint limits rather than just a list of completed questions.

**Coordinate without exchanging whole private lives.** Availability projections, travel buffers and individual confirmations can support a group meeting without each participant receiving everybody else's private reasons.

The additional extension subjects included multimodal evidence, cross-device conflicts, attention budgets, institution-rule revisions, storage/export privacy, real delivery channels, execution inspection and compensation, feedback learning, reviewed method changes and provider protocol replacement.

The proposal also described an “unfamiliar extension” evaluation idea: register an equipment-borrowing capability the coordinator did not previously know, and require ordinary registration, observation, dependency updates and revocation to suffice, rather than adding a name-specific main-loop branch. This was a future evaluation proposal, not a new runner or completed provider in this foundation.

### III.6 · What can depend on outside conditions, and what must not be hand-waved

Actual phone permissions and lifecycle behavior, an external service's inspection/idempotency support, a second institution's rules, a multi-person account service and students' real responses to proactive help need outside evidence or product decisions. They cannot be filled in by imagination.

Subject and source boundaries, evidence-based updates, immediate correction, forgetting propagation, relevant condition coverage, dependent invalidation, action authority, unknown receipts, audience projection and their connection to the real entrance cannot be dismissed as later polish. The architecture and roadmap preserve these obligations while the current status distinguishes what has actually been implemented or observed.

The governing question was not how many plugins had been added. After someone changes their mind, corrects a premise, cancels a goal or narrows permission, does the next read, judgment and action actually change?

#### Additional historical references for Part III

- [Hindsight research reference](https://arxiv.org/html/2512.12818)
- [Persona memory research reference](https://arxiv.org/html/2512.06688)
- [SQLite FTS5](https://sqlite.org/fts5.html)
- [Selected model transport and actual response conditions](../development/TOOLING.md)

## Part IV · The criticism that changed the control structure

### IV.1 · The challenge was architectural

The next critique was forceful: the harness appeared to inspect a person's words for a prescribed formula, fail when a synonym changed, and grow another special case every time a failure was reported. A strong model was being reduced to weak behavior. Tool use and delegation had not become reliably usable, and emotional intelligence had been turned into literal group labels and short-response rules.

The design needed a severe examination of the actual failure, a wider study of real harnesses, a first-principles redesign, a second critique of that redesign against simply reusing Hermes, and a concrete engineering plan. Two hundred scenarios could not reasonably mean two hundred hardcoded semantic branches; life contains vastly more combinations. The implementation must avoid a literal surface treatment, require actual authorized model use and repair, and make design responsibility explicit rather than leaving the crucial judgment unspecified.

The critique identified an omission in the earlier architecture: it specified state, contracts, receipts and checks much more clearly than who owns semantic decisions, who receives the original words, and who may revise an interpretation. The easy-to-code rules grew while the main model's control did not.

The final selection changed accordingly: stop expanding a competing general agent loop; genuinely use Hermes' loop and delegation, while the product retains its domain services, personal memory, permissions and action boundaries. Recreating a nominally similar engine after reading about Hermes would miss that decision.

The design work included research, continuous discussion and an implementation specification. Their availability did not verify an Electron application. The project must keep documents, implemented mechanisms and actual observations distinct.

### IV.2 · What the old function observations actually established

The review reported extracting and directly running an older interpretation function, tool specification selection and discourse segmentation in an isolated environment. Its neutral capability and permission setup sought to isolate whether wording alone changed what the model could see.

The following descriptions capture historical meanings and reported results. They are not verbatim executable probe inputs, new cases, or claims about the present product:

| Meaning of the historical input | Reported behavior in that old path |
| --- | --- |
| Listen first, and check tomorrow's classroom | Recognized as a query; lookup was visible |
| Listen first, and find where the first class meets, expressed with different everyday wording | Treated as listening without a recognized query source; lookup disappeared |
| Record tomorrow's meeting at nine | Local-record intent and explicit-local-write flag |
| Put tomorrow morning's get-together at nine into the calendar, using different wording | Other intent; explicit-local-write flag false |
| Analyze why meetings make me nervous | Incorrectly marked as local recording with an explicit write flag |
| Compare two sources thoroughly before answering | Delegation visible |
| The same request with a short final-direction preference | Delegation and planning capabilities removed |

These were old-function observations, not a full application or real-model evaluation. They did not prove an incorrect calendar event had actually been committed. Even the missed synonymous delegation flag did not mean every preparation tool had disappeared in that setup. Those limits matter as much as the finding.

The finding was nevertheless substantial: before the model judged the request, wording changed its available capabilities. That is a direct mechanism by which a capable model can be made ineffective.

#### IV.2.1 · A semantic name did not make a semantic proposal

The reviewed interpretation function did not call a model. Regular-expression combinations supplied intent, source, participation, subject and confidence-like fields. A phrase requesting help with analysis and containing a meeting-related term could accidentally satisfy the local-recording pattern.

The defect was deeper than one bad expression. Calling the object InterpretationProposal did not supply understanding; a confidence field did not supply calibrated certainty. Downstream tool availability actually relied on it. A comment calling it a routing hint did not undo that effect.

#### IV.2.2 · Brief presentation was confused with shallow work

Expressions asking for one direction, a first step or one sentence were interpreted as a reason to remove delegation. Yet “I want one sentence at the end” and “spend one second finding the answer” are different requests.

A person could ask for two complex documents to be checked thoroughly and want only a concise conclusion. The visible result may be short while the inquiry must be complete. Confusing expression cost and solution cost rewards premature stopping.

#### IV.2.3 · Delegation existed, but existence was not reliable usability

The reviewed code did contain child loops, parallel calls and read-only restrictions. The criticism was not accurately expressed as “there were no subagents anywhere.” Availability was gated by surface wording, and the child's context remained shaped by the parent's initial interpretation.

Useful delegation needs more than Promise.all: an independent goal, actual investigation, appropriate material and tools, a stopping condition, parent consumption, preservation of useful sibling results after one failure, targeted follow-up, cancellation, shared budgets and recovery. A function named delegate is not the same evidence as a person receiving useful coordinated work.

#### IV.2.4 · Model configuration was a separate variable

The old reviewed provider path had an output allowance of 4096 and a thinking option falling back to disabled; the main generation path did not supply the override. The reported conclusion was specifically that this path did not enable that provider's explicit thinking mode.

That does not mean the model had no reasoning ability, and enabling the mode would not automatically solve all architecture problems. It was a variable that needed alignment when comparing the base model with an integrated product. A metadata claim of support was insufficient; the selected endpoint, model version, request fields and continuation requirements needed actual verification.

Those numbers and defaults are historical observations, not settings to copy into the current provider or its authorized development substitute.

#### IV.2.5 · Emotional intelligence had become a template

The old prompt grouped children, older people and tired people under a common instruction to use short sentences and one step. The reviewer expressly did not establish that the core code contained an age-word routing branch; the confirmed finding was the prompt's unified template.

The template still missed the point. An older person may want a deep argument; a young person may know a great deal; a tired person may explicitly request the whole explanation. “You did not explain it clearly” can require more substance rather than fewer words.

Adding one exception for requests for detail would preserve the wrong default assumption. Participation should follow the actual current need and feedback, rather than age terms, emotion terms or a fixed personality category.

### IV.3 · Why borrowing good components still produced the wrong system

The review's explanation was that the components had been noticed without preserving their control relationship. Memory tables, evidence receipts, permission objects, plans and approvals can make a diagram look mature while leaving the decisive question unanswered: who chooses what happens next?

The criticized flow was effectively:

~~~text
the host's vocabulary decides the meaning
→ the host decides what information is needed
→ the host decides which tools the model receives
→ the host decides the communication pattern
→ the model fills in the remaining reply
~~~

Open-world understanding was assigned to the weakest lexical component, while the model's stronger semantic ability arrived after the important choices. More surrounding machinery could therefore make the practical intelligence weaker.

The first memory discussion had already said that the model interprets while the host commits and enforces consistency, and that Hermes could be connected to a unified memory owner. The two hundred questions were explicitly synthetic challenges, not a scene-routing taxonomy. The architectural mistake was failing to make semantic ownership, access to original words, revision of meaning and removal of premature lexical gates higher-priority requirements than adding more fields.

Without a fair simple-model and native-engine baseline, development could fall into “reported failure → another rule → original sentence passes → declare success.” That is maintenance of exceptions, not evidence of generalization.

### IV.4 · First principles: let the model meet the world

A cloud model accepts messages and returns content. A single answer claiming a reservation does not create a reservation. A host is needed to dispatch a model's structured request to a real function and return the real observation.

The essential loop is:

~~~text
provide original words, needed prior context and useful tool contracts
→ the model answers or chooses a tool
→ the host validates current authority and arguments
→ the real operation returns success, failure, absence or uncertainty
→ the model uses that observation to choose what follows
~~~

The key is the relationship among judgment, action and environment feedback, not merely the presence of a while loop. Model parameters being hosted remotely does not prevent a local product from owning a complete tool loop and bounded delegation.

The historical discussion used public Codex agent-loop descriptions and earlier agent research to explain how responsibilities grew:

| Real task problem | Useful mechanism |
| --- | --- |
| A generated plan encounters a changed world | Continue judgment through action and observation |
| A task needs an external read or modification | Structured tools and genuine execution |
| A long matter exceeds a context window | Bounded compression, external work state and original readback |
| Independent directions need inquiry | Workers, coordination and synthesis |
| Operations can have consequences | Permission, approval, idempotency, inspection and compensation |
| A person interrupts or a process fails | Cancellation, redirection, checkpoints and recovery |
| It is unclear where the failure began | Traces, actual final state and a repair loop |

ReAct was discussed for alternating reasoning and action, and function calling for the structured model/function interface; they were examples of an evolution, not the sole origin of agents. MemGPT and Reflexion were invoked for working beyond a finite context and using feedback in subsequent attempts. The practical concern is continuing useful work and learning from actual results, not preclassifying every future human sentence.

Deliverable products then need lifecycle, state/resource management, real enforcement and client-facing events. An engine/client separation illustrates how these can be organized without making each UI page an independent brain.

Finite tools can address far more than two hundred scenarios because code defines operations rather than the complete set of possible utterances. A calendar tool legitimately has title, date, time and participants. It should not require one particular event word before the main model may consider a calendar. A delegation protocol can specify purpose, material, scope, budget and result without inventing a separate worker species for every age, weather or examination scenario.

Search, read, compare, draft, modify, inspect and delegate can be composed according to new observations. That composition is the source of breadth.

### IV.5 · Lexical search is a tool, not the source of semantic authority

If the model needs a room-change notice, it can search one phrase, try a synonym or course/instructor name, and then read the original. That is efficient, traceable inquiry.

If the host sees no particular room-change word and consequently withholds query tools, the keyword has replaced the model's judgment. These are different control structures.

Deleting full-text search would not solve the second problem. A fixed vector retriever can create the same bottleneck if a miss prevents the main model from searching again. Keep lexical, entity, time and original-source navigation, with the model able to propose and revise queries and read the necessary context. Semantic retrieval can help; it is not a unique truth authority.

The discussion likewise rejected both brittle prompt if/else lists and vague prompts that assume the model already knows everything. Clear principles, useful context and room to reason are needed. Moving one hundred lexical rules from code into a prompt does not automatically produce a good harness. Exact protocol/identifier validation, credential handling and source boundaries remain legitimate deterministic work; the objection is to replacing open-ended meaning with a vocabulary gate.

### IV.6 · Compare actual implementations without a marketing maturity score

The historical framework comparison looked at entrances, loops, tools, workers, state, extension and published limits. The named references and explicit design questions below preserve its useful distinctions; a design question is not a claim about another installed product:

| Reference or design question | Mechanism worth learning from | Assumption the discussion refused |
| --- | --- | --- |
| Hermes | A programmable AIAgent, complete tool loop, actual delegation and controls | Defaults for memory, workspace, tools and logs necessarily fit this product's boundaries |
| Codex | An engine/client relationship using events, threads, turns and approvals | A configurable endpoint means every provider can replace every protocol or model setting seamlessly |
| Design question · Composable runtime | Examine plugin and lifecycle organization of model, loop, tools and interface | A developer preview is automatically production-safe |
| Design question · Desktop engine reuse | Reuse a capable engine while the product owns installation, supervision and user experience | A wrapper is the same product as its upstream engine, or carries upstream endorsement |
| Design question · Shared streaming core | Share real tool dispatch, events and cancellation across clients | A coding loop is necessarily free of heuristics or a complete general personal assistant |

The discussion also considered Deep Agents JS, Pi SDK and OpenCode as actual embedding/orchestration candidates, while retaining the need to examine their default files, memory, permission and product assumptions. These are historical comparisons, not current endorsements or an instruction to install them.

Keep a desktop wrapper, its upstream engine and an independently implemented coding loop conceptually separate. Inspect the actual candidate's code for complexity nudges, early-stopping rules, summary slots and retention rather than assuming that a reusable engine has no heuristics. The right question is where a rule sits and what it does; neither “it uses rules too” nor the word agent settles the design.

Large multi-agent systems were not evidence that every message should pass through seven classifiers. The described research pattern was a primary agent organizing independent investigations, workers actually obtaining observations, and the primary agent continuing judgment from those materials. Parallel research, tightly coupled work and ordinary conversation do not need identical orchestration.

An intent classifier → emotion classifier → profile classifier → planner → reply writer → empathy editor can preserve an early error while increasing cost. A model-based classifier is not sufficient if later stages receive only its label and have no original words or right to reconsider it.

### IV.7 · Critique the redesign before selecting it

**Option A: replace regular expressions with several model classifiers.** This can improve individual interpretations while retaining an always-heavy pipeline, label-only handoffs and divided responsibility. No single participant may remain responsible for the actual help. The control structure itself needs review.

**Option B: embed default Hermes wholesale.** The discussion treated this as a strong baseline that deserved a fair trial, rather than dismissing a ready engine to protect custom code. Its default configuration still could not simply become a private-data product. Memory-provider integration, standing context files, prompt assembly, delegated logs, errors and caches needed examination. A skip-memory flag is not proof that all hidden retention paths are closed.

The reviewed Python embedding route also involved source-environment and packaging work, rather than an assumed universal wheel installation. Pinning, Windows packaging, process supervision and upgrades were real costs. Those are historical implementation observations; current platform and pinned-runtime instructions live in the actual project.

**Option C: use the real Hermes engine under the product's host boundaries.** This was selected for the loop, tools, delegation and programmable control already available, not because the discussion had proved that its answers were smartest. The benefit of inventing those general parts again had not been established.

A Python sidecar and narrow adaptation were accepted costs. A purported thin adapter that recreates the main loop, copies large upstream cores or accumulates task-specific semantic branches defeats the reason for reuse. Expose the actual integration constraint rather than quietly continuing a second engine under another name.

### IV.8 · One primary conversation loop, with precise boundaries

The final architectural picture connected the existing chat, map and agenda UI to the product host; the host to a controlled Hermes primary agent and on-demand workers; and that runtime to the genuinely configured product provider. The product should not retain a second competing model/tool loop.

#### IV.8.1 · Let the primary model understand original words

The primary agent needs the present request, necessary real role history, the ongoing matter, explicit controls, time and discoverable capabilities. It should not have to complete InterpretationProposal → TaskNeeds → interactionMode → a whole plan before it may respond.

It may answer, search, read, ask, draft, request an effect, delegate or repair according to what it learns. Work notes can support recovery without becoming an administrative form for every sentence. A concise desired conclusion does not prohibit adequate investigation.

#### IV.8.2 · Enforce what the host can actually establish

The host owns actual identity, connections, object access, parameter shape, revision, cost/budget, transactions, cancellation and receipts. The model understands the request, selects material, decides what to do next, composes tools, compares tradeoffs and chooses how to participate.

Natural-language controls still matter before private retrieval or persistence: material-only use, no retention, no outward send. The final proposal allowed a small semantic interpretation call limited to source, retention, audience and action restrictions while the input remained transient. It was not an emotion/personality/whole-plan classifier and could not enlarge account authority.

That call has a latency and cost tradeoff rather than being free by declaration. Strong explicit UI controls can provide a clearer boundary. A local no-retention promise also does not mean a cloud service never processed the words. A ban on cloud transfer must be enforced before even a cloud control parser; if no suitable local processing exists, do not invent a cloud fallback. No model parser formally guarantees perfect interpretation of every restriction.

#### IV.8.3 · Capability availability is not a vocabulary quiz

Genuinely connected, currently authorized, explicitly enabled capabilities can be offered within their real role/host configuration. A character card or its prose does not grant them new authority. With a large catalog, the primary model needs a continuing way to discover methods, browse further, revise a search and inspect a precise contract. An initial miss cannot become a permanent semantic ban.

Describe tools through their useful operations, rather than only internal table names. Return not found, unpermitted, unconnected, stale, partial, failed and unknown outcomes distinctly. The model needs the chance to consider another useful approach after a failed tool, not just a final error label.

#### IV.8.4 · Workers need independent work, not a stack of role prompts

The selection reused real delegation while adapting child creation, source access, logging and lifecycle. Each investigator receives an open task purpose, necessary material, allowed sources/tools, a shared budget and a stopping condition. It makes real model requests and obtains actual observations in its own context. It does not merely inherit the parent's mistaken lexical needs.

Start with bounded concurrency appropriate to actual authorization and cost; a person need not say the word multiple before independent inquiry is possible. The primary agent remains responsible for conversation. Workers supply materials; they do not take turns replacing the user's companion. The parent must inspect conflict, missing work and source support before using the report.

Keep the following states separate:

~~~text
started is not completed
produced is not consumed by the parent
a follow-up instruction queued is not adopted by the worker
canceling work is not proof that an external consequence was reversed
~~~

Those are runtime relationships, not personality categories. Current child work must remain within the original permitted source subset, cancellation and budget; a parent-authored instruction is not a fresh user grant.

#### IV.8.5 · Keep content open and metadata exact

Evidence, assertions, experiences, matters and domain state retain their distinct owners. Memory content need not be limited to a hand-maintained predicate vocabulary. An evidence-backed explanation that equipment was unavailable then and a borrowed device now removes that particular obstacle is richer than a permanent likes_library=false.

Subject, source, time, purpose and revision are host-controlled. Reasons, conditions and tradeoffs can remain open natural language for the model to understand in a new situation. Present words and corrections enter current help promptly; long-term organization can follow under its retention policy. Unextracted originals remain readable. Several matters can share a conversation, and one matter can span conversations. Long-term memory should illuminate change, not fix identity.

#### IV.8.6 · Real effects still require exact protocols

Flexible understanding does not mean executing whatever a model says. A clearly authorized reversible local operation can proceed with low friction under its existing policy. Outward effects, other people's interests, cost and irreversible changes need their concrete current authorization.

The meaning of an explicit delegation comes from the actual words, prior context and object, not a pair of matching event words. Events, tasks, deadlines, reminders and planned work blocks retain their distinctions. An unknown end does not become one hour. A timeout does not become a retry. A real receipt establishes what happened.

“Saved to the local calendar, not synchronized to an external calendar” is a useful precise outcome. A universal completed state would conceal the boundary.

#### IV.8.7 · Emotional intelligence belongs throughout participation

A continuously responsible primary agent can keep track of why someone is frustrated, which part was not understood, what has already been refused, and which small matter remains unfinished. It can analyze seriously when analysis is wanted, listen before proposing a plan when that is wanted, or investigate and complete a clear small request instead of giving an exhausted person another questionnaire.

Warmth is not a stock sentence. Human communication is not invariably short. Participating appropriately in the present request matters more than appending a few consoling sentences after a generic workflow. The character participates in attention, understanding and choices, rather than being a final empathy filter.

### IV.9 · Critique the selected engine integration too

The final proposal was not exempt from adversarial review. It identified five ways the same failure could return:

1. **A bridge can grow a new keyword brain.** Its job is carrying identity, authority, capability, state, events and original words. It must not quietly resume deciding intent or removing tools from wording.
2. **One hook is not every boundary.** The reviewed pre-model hook was turn-scoped, not a guarantee about every internal model request. Enforce permission, revocation and budget at the real transport and host tool boundaries; verify a hook's actual invocation rather than trusting its name.
3. **Hidden storage can become another memory.** Main-turn data, compression, children, logs, errors, caches and recovery all need controlled paths. Disabling one memory feature does not establish that every retention path is closed.
4. **Safety can become permanent inaction.** Pure venting must not trigger an unwanted write, while venting plus a clear local recording request must still permit that recording. Both responsibilities matter.
5. **Custom layers must earn their cost.** With the same model, tools and lawful sources, a lightweight baseline must not be deliberately disadvantaged. If custom additions only increase delay and defensive prose while making understanding worse, remove the degrading addition rather than protecting the diagram.

The product's valuable work lies in its domain data, maps, ongoing life, controllable understanding, real assistance and continuous experience. A general loop recreated merely to prove engineering sophistication does not acquire value from being custom.

### IV.10 · Verification is a repair loop

The discussion separated two loops. In the product, the agent continues from tool observations. During engineering, the developer examines failure, changes the relevant mechanism and runs the affected workflow again. Recording one failure without fixing a correctable cause completes observation, not improvement.

The proposed development sequence was:

~~~text
real observed failure
→ locate the earliest divergence
→ propose a falsifiable cause
→ repair a general mechanism
→ revisit the original trigger
→ examine fresh equivalent expressions and neighboring counterexamples
→ use relevant existing regression evidence
→ obtain independent evaluation appropriate to the authorized work
~~~

This is an evaluation and engineering principle. It is not authority for new test suites, fixtures, runners, extra model calls or a wholesale redesign. Ordinary product entry points and existing relevant checks remain the permitted verification route unless test development is explicitly authorized.

#### IV.10.1 · Check the real configured route

The historical commission objected to declaring a missing key by habit when a permitted configuration had actually been supplied. Check the current endpoint, actual response model, relevant mode, output budget, tool dialect and continuation fields through the approved entry. Do not print credentials or search other projects for substitutes. An old not_run note is not a current experiment.

Real generation, a genuine tool request, consumption of an actual observation, independent delegated work and cancellation are separate observations. HTTP success, some text or a tool_calls field do not alone establish completion.

The product provider and development transport have distinct boundaries; engineering CLI sign-in is not a product login. The approved current model route and actual recorded response identity govern any real check.

#### IV.10.2 · Use a fair comparison to locate responsibility

The historical research proposed four aligned views: a minimally transformed provider/tool loop, the then-current product path, a lightly configured ready engine, and the final integrated path. Any later authorized comparison must use the same actual authorized model configuration wherever the paths support it. Their questions were respectively what the model can do without degrading preprocessing; where the product diverges; what reuse already provides; and whether memory/guards/product coordination improve or harm the result.

Align model, tools, lawful data and mode as far as possible. Report additional calls and cost separately. This comparison idea remains material for a future separately authorized investigation; it is not a claim that these four runs were performed on this foundation.

Diagnose the earliest concrete difference. If a tool disappears before the first request, fix exposure before rewriting empathetic copy. If it is available but unused, inspect its meaning, context and actual model settings. If it ran but its observation never reached the next request, repair the protocol. If the right evidence is present yet the answer is wrong, examine reasoning, use of conditions and expression. “Remind the model again” is not one explanation for every failure.

#### IV.10.3 · An equivalent wording should not need another source patch

The historical commission required the original triggering example, at least five fresh meaning-equivalent expressions not used to write the patch, and neighboring counterexamples before counting a semantic repair as general. That explicit requirement is retained as a design goal, not claimed completed here. It does not itself authorize a new runner, test code or testing matrix; execution must follow the actual authorized scope.

A permitted lookup must not lose its tool because a particular initial classifier did not recognize a phrase. Correctly preserving negation, quotation and another subject is equally important: different meanings must not be flattened into one intent to make a paraphrase comparison look good.

#### IV.10.4 · A prompt can overfit too

The prohibited pattern was natural-language body → contains/regex → open-ended intent, action authority, tool removal or demographic response template. Replacing it with a prompt containing every failed sentence and standard answer would preserve the defect.

Appropriate changes can concern general principles, useful tool descriptions, context organization, real model settings, call protocols, state transfer and execution. The engineer should explain which class of failure the change addresses and why. A scan finding no regular expression cannot certify generalization; deterministic identifier parsing and exact source checks are different from a lexical substitute for understanding.

#### IV.10.5 · Do not reward a beautiful account of doing nothing

The proposed evaluation standard had to reject a claim of saving with no calendar write, duplicate effects, forbidden memory reads, or a worker marked complete without a real request. If an evaluator accepts those outcomes, its result is not trustworthy.

This principle concerns actual attempts, traces and the environment's final state, with appropriate human and mechanism evidence. Task completion and the appropriateness of communication both matter. Counts of lists, comforting words or tool calls cannot substitute for either. It does not by itself require a new grading system.

### IV.11 · The conclusion and its evidence boundary

The decisive change was ownership of semantic control. A vocabulary must not define the person's intention, determine the model's useful capabilities or prescribe a fixed emotional mode. Identity, permission, domain facts, effects and recovery still remain host responsibilities; several unconstrained agents talking freely would not solve those duties.

The historical review had executed original-function observations. It explicitly had not run the full Electron application, the real provider or an integrated Hermes product in that review. Complete design files were not presented as proof of a verified new application.

The product does not need two hundred semantic branches for two hundred questions. It needs room to understand the person's original words, discover, investigate, cooperate and correct, with actual behavior showing that a reasonable rephrasing does not demand another code patch.

Preserve the working product and its actual owner boundaries. Read current implementation and observation records before diagnosing an old failure as present. Carry the complete broader redesign into the roadmap and reviewable work units. Reading this discussion does not complete the twelve stages, a character performance chain, ten-character production, all-interface image work or a whole-runtime rewrite.

#### Additional historical references for Part IV

- [Codex agent loop](https://openai.com/index/unrolling-the-codex-agent-loop/)
- [ReAct](https://arxiv.org/abs/2210.03629)
- [MemGPT](https://arxiv.org/abs/2310.08560)
- [Engine and client separation](https://openai.com/index/unlocking-the-codex-harness/)
- [Hermes Python embedding](https://hermes-agent.nousresearch.com/docs/guides/python-library)
- [Deep Agents JS](https://docs.langchain.com/oss/javascript/deepagents/overview)
- Desktop reuse and shared coding-loop alternatives remain explicit design questions in IV.6; their useful mechanisms are requirements to inspect, not evidence of a currently adopted product.
- [Multi-agent research organization](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Hermes hooks](https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks)
- [Agent improvement loop](https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop)
- [Evaluating attempts, traces and actual outcomes](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

