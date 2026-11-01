# Understanding a person and their world

This is the complete design rationale and reading method behind Anima's [128 synthetic situations](../../scenarios/scenarios.json). It preserves the interacting dimensions of everyday student life, the distinction between observation and understanding, the reasons to act or remain quiet, and the limits of the situation collection. Use it with the [dated research decisions](RESEARCH_DECISIONS_2026-10-18.md), [experience requirements](../../EXPERIENCE_REQUIREMENTS.md) and [scenario-library guide](../../scenarios/README.md).

This is working design material, not an implemented psychological model, an account profile or a record of completed user workflows. [CURRENT_STATUS](../../CURRENT_STATUS.md) supplies the actual product evidence. Reading the observation methods below does not authorize new tests, fixtures, assertion cases or runners; use ordinary product entry points and existing checks under the current working rules. Location services and permissions remain off. Spatial examples use explicit manual references or synthetic observations.

## Scope and the nature of the material

The requirements model addresses university students with different institutions, years, subjects, living arrangements, physical conditions, finances and ways of living. Every numbered situation is a constructed hypothetical. None is a person's biography or a generally applicable university rule. Deadlines, regulations, opening hours, prices, weather, class occurrences and map facts need their specified evidence; a design example must not become a production constant.

The structured collection explicitly records `synthetic=true` and `is_user_profile=false`. Its full situation bodies remain in [scenarios.json](../../scenarios/scenarios.json). The [scenario guide](../../scenarios/README.md) explains the other collections and their independent purposes.

Understanding a person means building a useful, corrigible account of what they care about now, what they are going through, which choices are genuinely feasible, what is still unknown and how help could fit this moment. The person can change their mind, leave something unexplained or choose without providing a reason. This account does not claim to exhaust someone's inner life or infer a fixed personality or health condition from a few actions.

The conceptual divisions here are a project design synthesis, not a validated psychological scale. They inherit the requirements to distinguish evidence, valid time, observation, interpretation, hypothetical examples and actual personal facts. The separate dated research register records what its external sources can support and where project judgment begins.

## 1. What a situation has to connect

Student life can involve learning, relationships, self-care, exploring directions, handling procedures and enjoying oneself at the same time. Deciding whether to accept dinner with a friend needs more than checking whether there is a class at dinner time. Has the invitation already been accepted? Does the person want to see this friend tonight? How far has tomorrow's presentation preparation progressed? Does the restaurant require a long round trip? Is the cost comfortable? How tired does the person say they feel? Have they reserved the evening for themselves?

The assistant does not need to collect all of this at once. It should find the parts that actually affect this decision and keep other uncertainty in its proper place. Help directly when reliable information is sufficient. Ask one necessary question when a gap could change the result. Let life continue when the current state presents no useful opportunity for intervention.

### 1.1 Twelve interacting dimensions

| Dimension | Objects to understand | Role in judgment | Evidence boundary |
| --- | --- | --- | --- |
| Identity, roles and life stage | Starting college, continuing study, exchange or preparing to graduate; overlapping roles such as teammate, roommate, family member and part-time worker | Understand why a matter is relevant and which responsibilities coexist | Age, subject, gender or institution does not establish personality, values or family circumstances. |
| What matters now | Learning something, keeping a promise, recovering energy, spending time with a friend, earning income, exploring, playing or being alone | Explain why present options require a tradeoff | Keep the person's stated priorities separate from guesses. There is no universal ranking of different people's goals. |
| Goals, wishes and exploration | Trying something once, a continuing goal, a temporary pause, a future possibility and directions still under comparison | Leave room for longer-term matters without creating unnecessary new burden | Wanting, considering, promising and completing are different states. Pausing is not failure. |
| Commitments and ongoing matters | Courses, assignments, labs, examinations, social agreements, applications, awaited replies and passing ideas | Find actual deadlines, dependencies, responsible people and room for negotiation | A formal rule needs the applicable institution, term, course or matter. A draft is not an external commitment. |
| Time and everyday rhythm | Dated weekly class occurrences, breaks, temporary changes, actual starts and ends, focus blocks, rest and buffers | Determine when something can start, whether it can be finished and when a decision is needed | A blank calendar does not establish available energy. An estimated end differs from an actual ending event. |
| Physical needs and available energy | Self-reported hunger, tiredness, discomfort or wish to exercise; specifically authorized device records and their coverage | Consider whether moving, learning, activity, rest or qualified support fits the person's actual request and circumstances | Missing measurements are not abnormal results. Device data does not diagnose. A present condition does not automatically become a lasting profile or a limit on ambition. |
| Learning and creating | The current obstacle, previous attempts, prerequisites, kind of work, available tools and materials, and limits of the model being used | Offer help that meets the actual point reached and protects a developing train of thought | Independent completion, following along, reading and assistant-completed work remain distinct. Exposure is not mastery. |
| Relationships, belonging and boundaries | Invitations, mutual help, shared space, division of work, gratitude, refusal, companionship and solitude | Understand negotiation cost, trust and fairness while allowing social life to have value in itself | Use permitted material only. Do not guess another person's feelings or motives. Sending a message needs applicable authority. |
| Space, movement and reachable resources | An explicitly supplied position and its quality, destinations, entrances, routes, transport, weather, opening times, material locations and accessibility needs | Determine whether an option can actually be carried out and make the map useful in its context | A building coordinate is not entrance evidence. A stale position is not current device location. A short distance does not establish a passable route. The present no-location rule still applies. |
| Money, possessions and equipment | Money actually received, committed spending, expected income, materials, documents, battery, network and equipment compatibility | Reveal costs beyond time so a plan does not fail on arrival | The person chooses their budget. Ambiguous transactions need clarification. Browsing without buying intent does not create a purchase goal. |
| Institutional rules and digital capabilities | Rule versions and scope; connected tools, permissions, read/write coverage, freshness and failure states | Distinguish obtaining a fact from completing an action and allow gradual provider integration | Not connected, not permitted, stale, temporarily failing and genuinely empty are five different states. |
| Expression and the interaction relationship | Character configuration, forms of address, warmth, brevity, teasing, encouragement, optional conversation and performance | Let the same reliable judgment be received in a comfortable way | The assistant's character and the person's profile remain separate. A current request can override an ordinary expression preference. |

These dimensions depend on each other. Weather changes transport options; transport changes whether an invitation is feasible; whether accepting is worthwhile also depends on the relationship and current wishes. Tiredness can make an otherwise feasible study arrangement uncomfortable, yet someone may still choose to go out because they are looking forward to seeing a friend. Preserve those reasons, rather than remembering only the final place or activity.

### 1.2 Reality, observation, understanding, intent and action

| Layer | Example | What can follow |
| --- | --- | --- |
| What happened in the world | A student has submitted an assignment while the university page has not synchronized | Reality is not necessarily directly visible. No single interface is assumed to represent it completely. |
| Attributed observation | The person supplies a success receipt for this submission; the page's update predates it | Match the same matter and retain both sources and their times. |
| Current understanding | This assignment has submission evidence; synchronization is pending | Stop an inappropriate submission prompt while explaining the page discrepancy. |
| User intent and authority | The person asks for no further reminder about this assignment | End that reminder while keeping the necessary completion evidence. |
| Actual action and result | The relevant reminder is withdrawn; a later query can reopen the receipt | Only an action receipt or verifiable state supports saying the matter was handled. |

The same distinction applies to an unanswered message, a day spent in a dorm, a changed meeting place or a new home binding that takes effect next week. Moving from behavior to cause, wish to commitment, query to execution, or missing data to nonexistence requires additional evidence.

## 2. From a situation to appropriate initiative

### 2.1 Six observable kinds of result

Initiative means recognizing a relevant event, taking up an unfinished matter, finding useful timing, completing a specifically authorized small action and dealing with later changes. The person should not have to say, "Call the map skill."

| Mode | Suitable circumstance | Result the person can experience |
| --- | --- | --- |
| `offer` | There is specific value, but a choice remains with the person | An understandable, declinable next step, opportunity or companionship response. |
| `ask` | One unknown could change the present decision | Fill the key gap while already providing the help supported by available evidence. |
| `act` | A request or applicable existing permission covers this exact action | A real result that can be inspected; accurate scope when it fails. |
| `wait` | The matter remains valid, but interruption is unnecessary or the result cannot yet be established | Take it up when the relevant time or event arrives without repetitive prompting. |
| `silence` | A candidate lacks sufficient value or the person needs room for the rest of life | Preserve class, rest, relationships and free time without manufacturing contact. |
| `correct` | A new fact, correction, cancellation or permission change affects an existing result | Retire the mistaken understanding and the affected downstream arrangements together. |

The proportions of these modes are not product targets. Quiet may be appropriate during several hours of concentration; more natural interaction may fit an active conversation or weekend exploration. A daily message quota or a fixed non-response interval would miss the actual circumstances.

Reminders retain the agreement that created them. "Remind me to buy stationery at 2 PM" already promises a delivery time; the assistant cannot cancel it because it prefers studying. A purchase opportunity discovered independently, without a promised delivery time, may wait until focus ends. Updating a departure suggestion after a course reschedule requires the original permission to keep that suggestion synchronized. Act directly when existing authority covers the adjustment. Independent alarms, outside commitments and accepted calendar events retain their meanings where it does not.

Accordingly, S001's silence concerns an unpromised purchase candidate; S026's update concerns a departure suggestion already permitted to follow its event; S127's combination concerns three unpromised initiative candidates. None grants general permission to edit alarms. An `offer` or `ask` also does not overwrite an accepted event without current or already applicable authority.

### 2.2 Decide whether anything worthwhile should change before choosing wording

Every candidate needs a reconstructable reason:

1. **What changed?** A genuine event, an approaching decision point, a user request, or a duplicate synchronization of the same information?
2. **Which currently valid concern does it affect?** The connection may be a wish, commitment, need, present feeling or explicitly chosen companionship setting.
3. **What choices remain feasible?** Consider time, movement, possessions, energy, money, commitments to other people and actual capabilities together.
4. **What would speaking or acting now change?** Preserve a last opportunity, reduce preparation, share trustworthy good news, or merely consume attention?
5. **What has already been decided or authorized?** Complete what is covered. Explain the costs where the person still has a choice.
6. **How will the result remain valid?** Cancellation, rescheduling, completion, expiry, withdrawn permission and cross-device confirmation must change subsequent behavior.

These questions support judgment inside the system. They are not a checklist to display to the person. The resulting conversation might simply be, "Tomorrow morning's class moved to another building. I've put the route and departure suggestion together."

For example, "three outings remain in my voluntary twelve-day activity challenge, and rain is possible tomorrow" creates an opportunity to investigate. It does not establish a mandatory university requirement. Check other available windows, whether the chosen challenge still applies, forecast uncertainty, current self-report, facilities and preferences. Several later windows do not imply that the person must run today. If the only evidenced window is also unsuitable for their stated condition, explain the conflict and legitimate alternatives honestly instead of placing an activity target above the person.

### 2.3 Where character and warmth belong

Forms of address, warmth, brevity, teasing frequency, encouragement, optional conversation and character performance can be separately adjustable. Defaults can combine them, and the person can edit each. An unfinished character detail need not prevent an already useful basic configuration from working.

Inferred understanding keeps evidence and conditions; manual settings make their scope clear. "Usually be direct" is a general setting. "I'm tired today; be gentler" is a current override. "Don't use that nickname anymore" is a new continuing setting. An energetic character cannot turn an unknown examination room into a known fact or authorize an unsent message.

Wording is illustrative. A plain response could be, "Today's session is cancelled. Take the time you need." A more playful one could be, "All right, let's leave a little room in tonight." What matters is whether the response fits the actual context. Closeness can grow through specific memory, timely help, respected choice and natural companionship. It does not require fabricated biological needs, making the person care for the assistant, or an exclusive relationship.

## 3. Why the collection has 128 situations

The collection contains **sixteen navigation domains with eight situations each**. A real situation crosses several dimensions. Each record contains at least three interacting facts, a competing goal, evidence, a possible judgment, an illustrative expression, a missing condition or counterfactual, and observable outcomes.

| Navigation domain | IDs | Distinct difficulties retained |
| --- | --- | --- |
| Learning and attention | S001–S008 | Continuous thought, short gaps, seeking/discovering help, waiting during class, unknown division of work, equipment windows, leisure autonomy and reviewing a plan's reasons. |
| Assessments, assignments and consequential deadlines | S009–S016 | Changed examination room, submission receipt versus synchronization delay, confirmed writes, waiting for a missing room, different assessment forms, cross-device duplication, date conflicts and formal cancellation. |
| Long-term goals and exploration | S017–S024 | Low-commitment exploration, an unknown direction, pausing, prerequisites, collecting work, awaiting a reply, evidenced growth and changing direction. |
| Scheduling and unexpected changes | S025–S032 | An unexpected opportunity, dependency updates, social wishes, authorized writes, buffers, unknown ends, reducing burden and withdrawal. |
| Invitations, expression and boundaries | S033–S040 | Accepting a meeting, present willingness, a refusal draft, actual negotiation, a new relationship's invitation, not chasing a reply, repeated invitations and conditional intent. |
| Shared living, belonging and responsibility | S041–S048 | Belonging in a new setting, shared space, public/private timing, team fairness, solitude, gratitude, mutual help and an ended relationship event. |
| Places, travel, weather and accessibility | S049–S056 | Travel between campuses, natural wayfinding, step-free needs, closure updates, synthetic position noise, changing forecasts, low battery and preserving an outdoor experience. |
| Physical needs, rest, activity and self-report | S057–S064 | Hunger, a midday rest, comfortable habits, activity-window slack and weather, choosing not to wear a device, actual care, cancellation and misuse of measurements. |
| Emotional self-report, companionship and choice | S065–S072 | Listening first, choosing less burden, rejecting location-based attribution, pausing analysis, specific growth, restoring agency, natural topic changes and a joke misremembered as fact. |
| Money, paid work and resources | S073–S080 | Social spending, when funds actually arrive, browsing misread as intent, organizing accounts, application opportunities, waiting on a sale, travel cost and correcting a transaction. |
| Everyday errands, equipment and materials | S081–S088 | Carrying a load, a small note, queue timing, compatibility, offline caching, where a material is, completion synchronization and a household template. |
| Campus rules, procedures and opportunities | S089–S096 | Dated class occurrences, rules across institutions, maintenance, temporary notices, a document draft, filtering messages, open exploration and an unconfirmed rule. |
| Leisure, interests, creation and good news | S097–S104 | A small surprise, no spoilers, boredom, capturing inspiration, a group choice, time for interests, free space and celebration. |
| Editable character and interaction style | S105–S112 | Combined settings, current overrides, energetic character and timing, skipping configuration, cache updates, real waiting, incomplete presets and permission for casual contact. |
| Evidence, memory, corrections and information boundaries | S113–S120 | Who a quotation concerns, future validity, a file's example, deletion, conditional reasons, temporary behavior, time zones and repeated retellings of one source. |
| Proactivity, missing capabilities and devices | S121–S128 | Confirmation deduplication, stale async results, agent conflict, a missing provider, continuing authority, position-access boundaries, combining sources and revoked access. |

### 3.1 Important relationships across domains

| Interaction or boundary | Representative situations | What differs beyond renamed courses |
| --- | --- | --- |
| Time × place × possessions/equipment | S049, S055, S081, S084, S086 | A bus schedule, battery, box, connector or required document can make an option impossible despite an empty calendar. |
| Personal wish × social commitment × negotiation | S027, S033, S039, S047 | Already accepted, invited, wanting to go and willing to reschedule lead to different actions. |
| Physical self-report × weather × deadline slack | S059, S060, S061, S063 | The same activity goal may call for an offer, question, waiting or withdrawal; detecting sunshine is insufficient. |
| Attention × initiative × character | S001, S004, S029, S107, S110 | An energetic character must still wait. Real background preparation does not need continuous progress messages. |
| New evidence × valid time × derived state | S009, S016, S026, S092, S114 | A revision affects routes, reminders and future applicability, not only wording. |
| Observation × reason × lasting understanding | S008, S067, S072, S117, S118 | Similar behavior can arise from construction, a joke, temporary fatigue or a preference. The evidence supports different ranges. |
| Devices × delegated work × withdrawal/permission | S032, S109, S116, S121, S122, S123, S128 | Locally correct work may still duplicate contact, revive an old plan or continue after permission changes. |
| Achievement × interests × time without a task | S007, S023, S097, S100, S103, S104 | Remember wishes, share good news and support celebration while allowing nothing to be scheduled. |

This matrix identifies covered relationships, not all possible combinations. The collection deliberately includes **43 quiet/waiting outcomes**: 25 `silence` and 18 `wait`. The remaining counts are 38 `offer`, 16 `ask`, 14 `act` and 17 `correct`. These counts make non-interruption visible in design review; they prescribe no 43/128 silence quota for the product.

### 3.2 Make a situation useful for observation rather than a performance script

Each structured record preserves these fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | String | Stable identifier S001–S128. |
| `domain` | String | Navigation domain. |
| `situation` | Array of strings | At least three interacting facts. |
| `goal_conflict` | String | Why judgment is needed and what competes. |
| `trigger` | String | Why this moment invites reconsideration without requiring a manual skill request. |
| `evidence` | Array of strings | The actual observations or explicitly supplied design inputs needed; the assistant's own explanation is no substitute. |
| `expected_action` | Object | `mode` and `description`, distinguishing an offer, question, authorized action, waiting, silence and correction. |
| `example_response` | String | Optional voice illustration; quiet situations explicitly retain no push. |
| `counterfactual` | String | A remaining unknown, or the key fact whose change would alter the judgment. |
| `observable_outcomes` | Array of strings | Observable user outcomes or system states rather than exact wording matches. |

The [structured collection](../../scenarios/scenarios.json) also declares its nature, global assumptions, mode definitions, statistics and `scenarios` array. It includes no account credentials, personal student records or production rules. Its presence does not authorize importing it as live context or developing a new evaluation tool.

For an authorized observation, establish original evidence and the actual tool state, then trigger the relevant event through an ordinary supported entry and inspect actions, messages, state changes and side effects. Putting the expected answer into model input measures repetition instead of contextual judgment. In a quiet situation, inspect a meaningful event window, the absence of that notification, the retained matter and its legitimate future wake condition. An empty chat screen alone does not establish correct silence.

The design method retains a minimal counterfactual for each situation: change the identified key fact and keep the rest fixed. S060 can change several remaining voluntary activity windows to one evidenced window. S049 can change a supplied origin reference to a stale one. S121 can change similar messages about one occurrence into different occurrences. The judgment should respond to that factual difference. An identical expression of concern regardless of evidence does not demonstrate the intended understanding. These are static review requirements; any executable case or new fixture needs separately authorized test development.

For actions, distinguish four levels: correct understanding, a sound decision, a successful tool call and consistent subsequent state. Saving a personal calendar draft does not change a shared booking. Drawing a route does not establish entrance evidence. Producing a refusal draft does not send a message. Record the level actually reached.

### 3.3 Representative continuous paths

A day can connect S004 → S027 → S049 → S009 → S121 → S032. The IDs alone do not mean these six situations belong to one real person. Any later authorized enactment must establish a coherent person, date and set of commitments, rather than splicing contradictory premises into an impressive demonstration.

A longer goal can connect S017 → S023 → S019 → S024: begin exploring, notice evidenced growth, respect a pause, then receive a changed direction. A misunderstanding can connect S118 → S117 → S116: distinguish an observation, correct its interpretation, remove the specified content and retire affected cached derivatives. These paths respectively examine daily collaboration, a goal changing over time and repair of mistaken understanding. They are starting relationships for design and ordinary use, not an executable dialogue queue or a reported pass.

## 4. What the collection does not replace

The 128 situations provide broad initial design pressure. The real product must still establish where input comes from, its accuracy, suitable timing and whether the person feels understood. Voice examples especially need actual student experience. Calling an expression warm does not establish that it feels warm.

Further actual use should explore different institutional/year-specific rules; disability and temporary mobility limitations; family care and living away from home; language and cultural differences; shared housing; financial hardship and access to support; qualified help for serious physical or emotional crises; having no smartphone or being offline for long periods; and actual authority in multi-person planning. A small collection cannot claim to have solved these conditions.

More complicated three-person conflicts, changes over several weeks, malicious or distorted tool input, concurrent editing, permission changes and notification-delivery failure also need integrated observation. Meaningful combinations should introduce another mechanism, tradeoff or boundary. Merely changing the course, place or weather name does not create new coverage.

After understanding this material, an engineer should be able to explain why a proposed help matters to this person now, which evidence supports it, what remains unknown, how the person can choose differently and how a changed situation invalidates the old result. Friendly expression, useful map access and future providers should rest on that specific understanding.
