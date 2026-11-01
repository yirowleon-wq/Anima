# Opportunity scheduling, presentation and shared reads

These design passages preserve early decisions about fair opportunity processing, one opportunity's presentation across channels, and the four distinct kinds of cache. They are proposals to evaluate in the Harness redesign, not a claim that the current product implements every detail. Use [CURRENT_STATUS](../../CURRENT_STATUS.md) for actual observations, [the full architecture commission](COMPLETE_DESIGN_AND_COMMISSION.md) for the larger design, and [the dated research decisions](RESEARCH_DECISIONS_2026-10-18.md) for dependency-version and evidence boundaries.

The passages belong chiefly to roadmap blocks 03-B/03-C and 05-A/05-C/05-D, with source/provider work in 02. They do not start those blocks, authorize external actions or create a second scheduler or fact store. Read the current owners and capabilities before deciding what to retain or replace. Ordinary existing entry points and checks remain the available verification path; these are static requirements, not new executable cases or a runner.

## 1. A continuing mandate has a real scope

A broad, editable `InitiativeMandate` can express a continuing request such as, "Keep an eye on course changes and my travel this term; prepare what you can," or, "Help me make reasonable progress on midterm preparation over the next two weeks." The person can say this naturally or choose a few understandable scopes when enabling initiative. A valid mandate continues within its term; every derived watch does not require another confirmation.

The mandate retains its object or goal, readable sources, permitted forms of help and actions, valid period, interruption preferences and stopping conditions. Explicit goals, accepted plans and changes in sources already permitted for this purpose can support derived attention within that scope. An energetic character setting does not permit reading mail, expanding collection or accepting dinner for the person.

An initial interaction default can allow quiet preparation and contact when there is useful substance, without a long questionnaire. Reading still follows actual source permissions. Without a continuing mandate, the currently requested task still proceeds. At a natural point, the assistant may offer one concrete, understandable continuing scope instead of inventing it.

## 2. Known dependencies and unfamiliar opportunities

An existing plan or watch records dependencies such as a dated course occurrence, goal, weather window, route endpoints or reservation-opening event. A changed dependency can identify affected matters cheaply.

A dependency table alone misses needs the system has never recognized. A newly connected source, a newly read valid change or an event with no established relationship needs a budgeted semantic-discovery batch. The same primary model judges whether a new connection or opportunity belongs within the current mandate. Cheap routing handles duplicates, versions, scope, freshness and budget. A fixed list such as "exam, run, dinner" cannot decide an event's meaning in advance. Preserve occasional full reconciliation to recover missed subscriptions and interruptions, merge events where appropriate, and avoid repeated model calls on empty polls.

An event deferred for budget remains queued for the next batch. It is not silently discarded. Historical material associated with an ended goal does not quietly recreate its watch. A long absence of response can reduce the frequency of unpromised new suggestions; it cannot cancel an explicitly continuing reminder.

**Process currently valid known opportunities approaching `latestActionAt` first**, then ordinary dependency changes and unfamiliar-opportunity discovery. Merge duplicates, skip invalidated material and prevent one high-frequency source from consuming the budget indefinitely. Explicitly promised hard reminders continue through their existing independent execution path; a semantic-discovery queue cannot crowd them out. Persist why a window was missed because of budget, offline operation or failure. A late catch-up cannot be reported as an on-time completion.

### Time can change the decision without a new source event

A reservation window opening, a last feasible departure time, the end of a class or expiry of a forecast can change an opportunity even when no source updates. An opportunity can have several feasible handling windows and a next review time. Date-dependent queries use a rule that can be interpreted at run time or an exact occurrence. The word "tomorrow" in a newly created watch must not stay frozen as an old date.

Periodic scanning may remain a recovery entry, while the scheduler chooses the next necessary wake and combines source requests. Configuration sets resource budgets and defaults. A generic thirty-minute scan interval must not quietly miss a specifically known imminent deadline.

### Model judgment and host admission have different responsibilities

The model decides whose goal a change concerns, whether there is useful help now, what can be prepared, whether interruption is worthwhile, what question is necessary and which tradeoff fits. Give it original words, facts, unknowns and actual available capabilities. It can investigate courses, maps or notes without waiting for a keyword.

The host checks event and object versions, source purpose, action scope, temporal and resource feasibility, deduplication, budgets, actual external capability and receipts. A statement of confidence is not permission. A fixed scoring table is not a substitute for understanding a person's life.

The model can revise its judgment after a tool result. Every input does not need a forced serial chain of complete `InterpretationProposal`, `TaskNeeds`, emotion classification, character classification and a full plan. Actual source controls keep their boundary responsibility; they do not take over open-ended task interpretation.

## 3. An opportunity must still be valid when presented or committed

The proposed lifecycle is `candidate → preparing → ready → waiting/offered → accepted/executing → resolved`. Any stage may become `superseded`, `cancelled` or `expired`. These concepts can map onto sound existing tables instead of requiring a second state machine. Retain the versions and stopping conditions on which the opportunity depends.

Check necessary dependencies after preparation, before presentation and before writing. A strongly consistent side effect compares revisions in its commit transaction. A revised forecast or course, a withdrawn goal, changed permission or already completed task can invalidate prepared material. A late delegated report can retain diagnostic status but cannot reactivate a cancelled plan.

**One opportunity and revision share a presentation record**, from which the system chooses conversation, an in-app surface or an OS notification. Content already presented naturally in the foreground does not receive an unnecessary second push. Channel receipts retain their actual `submitted`, `delivered` and `seen` evidence; these states are not interchangeable. A genuinely new fact or renewed action value can revise the same opportunity. Permanent deduplication must not hide a later important change.

This keeps meaningful distinctions intact: preparation is not an offer, an offer is not acceptance, notification submission is not delivery, delivery is not exposure and exposure is not understanding or completion. One common logical opportunity can have channel-specific receipts without each channel inventing its own matter or authority.

## 4. Four kinds of cache and when they become unusable

| Kind | Suggested identity or basis | When it cannot be reused directly |
| --- | --- | --- |
| Provider prompt-prefix cache | Provider, model, account/tenant, protocol, tool-contract version and persona revision | Provider route or model changes, an edited character or a changed prefix. Use actual provider usage evidence; do not assume a hit. |
| Tool-fact cache | Source, semantic query parameters, place, time window, data/permission/rule versions | The source expires, permissions change, a course is cancelled, map data changes or coverage is insufficient. |
| Retrieval and situation-projection cache | User scope, purpose, query, memory/original/matter watermarks and revisions | A correction, forgetting, changed entity scope, an unprocessed gap or a new limiting condition. |
| Shared in-flight request or checkpoint | Task/request identity, dependencies, authority version, budget and callers | Every waiter cancels, permission becomes invalid, the deadline passes or the result no longer applies. |

Carry `observedAt`, `fetchedAt`, `validFor` and `coverage` with a result. TTL is an additional boundary, not a complete relevance test. A forecast cached less than thirty minutes ago does not establish whether rain will occur at a specific entrance fifteen minutes from now. Identical endpoints do not make a route reusable after transport mode or access conditions change.

Two concurrent matters asking for the same weather may share one actual read. **Each waiter keeps its own cancellation and purpose admission. Cancelling one waiter must not terminate the other still-lawful request.** A failed read needs a short backoff and an honest temporarily unavailable state. It must not be cached as "no classes."

Long-term memory is not a cache, and a compression checkpoint is not calendar truth. The historical host disabled upstream native memory and background review and built its own system prompt. Upstream `MEMORY.md` snapshot freezing was therefore a comparison design, not evidence that the product's current-position projection was reading an old value from that file. The [dated research register](RESEARCH_DECISIONS_2026-10-18.md) preserves the exact dependency-version distinction.

After correction or revoked access, publication admission must see the current version even if an old provider prefix may physically persist elsewhere. Do not claim that a local deletion proves every provider system erased previously received information. Explain only the controls and evidence the actual provider supports.

## 5. Carry these decisions into the later replacement

For 03-B, retain the distinction between original truth and a rebuildable retrieval/projection cache. For 03-C, trace current corrections and source fences through shared in-flight consumers, cached results and publication. For 05-A and 05-C, retain budget deferral, deadlines, meaningful wake conditions and channel-specific exposure without duplicate offers. For 05-D, one dispatch owner and explicit old-route retirement must preserve those obligations across migration and restart.

The ordinary user outcome is specific help that appears when it can matter and stays correct as circumstances change. Fairness, queue identity and cache admission support that outcome; they do not need to become product-facing dashboards or fixed message quotas.
