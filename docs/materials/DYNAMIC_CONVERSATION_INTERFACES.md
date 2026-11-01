# Maps and dynamic interfaces inside one continuing conversation

**Material type:** design proposal, implementation rationale and dated code-inspection notes, prepared October 18, 2026. The working design includes continuous examples, alternatives, mechanisms, risks and a reading basis. The situations are hypothetical, not a personal timetable or actual service receipts.

The dated investigation was research only: it did not modify product source, install OpenUI, commit or publish an implementation. Its observations and API/source reading therefore do not themselves establish that the proposed experience was built.

**How to use it:** apply its design reasoning to the relevant work, especially roadmap stages 01, 04, 07, 08 and 09. A complete new map-performance sequence and general interface redesign remain development goals. [CURRENT_STATUS](../CURRENT_STATUS.md) and the actual implementation determine what the product currently does. Dated shortcomings below are not automatically current defects.

Use the [product contract](../PRODUCT_CONTRACT.md), [roadmap](../DEVELOPMENT_ROADMAP.md), [campus/environment contracts](../CAMPUS_AND_ENVIRONMENT.md), [experience requirements](../EXPERIENCE_REQUIREMENTS.md) and [material index](README.md) to place a future commission. Retain working behavior and original owners while replacing a mechanism. No passage here authorizes account access, publication, VM use, paid services, new test development, location services or location permissions.

## The implementation brief

Work as a designer with aesthetic judgment and an engineer able to finish a usable result. Understand the existing product first. Develop a complete experience for an interactive map within the conversation and a common presentation foundation that can later support weather, calendars, grades, reservations, notes and activities.

Use imagination to improve the actual interface and its behavior. The stories below explain what matters; they are not keyword triggers, mandatory component names or a layout to copy mechanically. A more persuasive detail is welcome when it keeps facts reliable, interaction continuous and the product visually coherent.

For an actual future implementation commission, first explain the important design judgment and the continuous path to be completed. Then implement, render, operate and repair it. A plan, architecture diagram, fixed-data demonstration or an extra “Open map” button does not establish this experience. Resolve missing information from the current project and existing tools first, and make routine layout/engineering decisions through informed judgment.

## I. Understand the existing foundation

Start from the actual current files and constraints. Where a reviewed repository exists, inspect its branch and working state; otherwise identify the independent folder’s explicit file baseline. Preserve concurrent healthy work instead of resetting a project to match a dated document.

Read the current AGENTS, README, PROJECT_NAVIGATION, CURRENT_STATUS, product contract, public-map review boundary and the relevant module documentation. Source code and actual operation establish capability. Earlier ideas and an assistant’s claim of completion do not replace that evidence.

The investigation behind this brief found an Electron/React conversation system, sessions and materials, a Hermes tool chain, host-side permissions and execution records, original evidence and derived memory, a local calendar, campus-source adapters, attention/preparation mechanisms and a shared campus-map implementation. This is the architectural context for the proposal; consult the current baseline for its later changes and exact verification.

The map used MapLibre with an OpenLayers planar compatibility path. It had geographic data, building/place identities, a walking network, routing, route emphasis, a preview cursor, labels and viewport fitting, plus camera-control ownership. Warm gray, off-white, restrained gold and a transparent sense of space were useful qualities to develop further. Current map geometry and licenses must be independently qualified; the included synthetic diagram does not establish real-campus navigation.

The most immediate gap identified in that historical snapshot was:

- `MapRouteCard` in `src/renderer/map/CampusMap.tsx` acted as a summary button opening a separate map.
- `src/renderer/App.tsx` rendered the button inside a message, then opened `MapSheet` on a click.
- Seeing and manipulating a map directly in the conversation, then changing that same map through the next sentence, did not yet form a complete chain.

These are dated observations. They explain why a real shared surface was proposed; they are not a reason to rebuild a capability already present in the current `ConversationMap`/shared-map path.

Other historical capability boundaries mattered too:

- `weather.lookup` then used one fixed public city reference and daily forecasts within seven days: daily maximum/minimum temperature, weather code and maximum precipitation probability, without hourly forecasts. The current explicit-reference and time-window capabilities must be inspected separately; do not carry that earlier limitation forward as an unexamined present fact.
- The campus directory included schedules, exams, grades and differing GPA bases, activity-related summaries and reservation records. A directory did not establish a connected personal account or readability of every field.
- Local calendar/reminder capability existed. Real university booking writes, reliable seat geometry/live availability, native phone observations/health data and cross-device synchronization still needed their own sources and interfaces. A current implementation may have advanced; its actual scope and receipts determine the claim.
- Estimated access, unverified entrances and conditional roads retained their honest meanings. Attractive motion could not supply missing geographic evidence.

The investigation also observed a hosted public-map preview in a browser, which actually used the planar compatibility path. A hosted preview was not necessarily synchronized with current source files. That observation established neither the latest 2.5D rendering, complete route playback nor frame rate. Future implementation must be observed using its actual current version.

## II. Product direction: we see the same thing and can change it together

The conversation remains the continuous entrance to the product. From original words, actual tool results, the current explicit selection and relevant context, the companion judges what is worth presenting now and places it where it is useful.

A conversation can unfold from prose into a map, from that map into a time arrangement, then from an accepted library visit into the actual reservation and material to bring. Place, date, context and the person’s choices are shared; a map, a forecast, a grade record and a note retain the reading and manipulation appropriate to each.

A casual question need not create a full ongoing matter. Nor must everything become the same card. One course grade can receive a direct answer. “I haven’t explored this area—show me around” can become open exploration. “I don’t want to rush today; somewhere nearby is enough” deserves a considered experience too.

The intended feeling has six parts:

1. Before I manually place markers, the companion has used the actual conversation to find useful places and routes.
2. The map’s first view answers the question I am asking.
3. Its movement has judgment: an overview when relationships matter, an entrance detail when that choice matters.
4. When I reach for it, it gives me control. A changed intention continues from the view I actually have.
5. “Here,” “that afternoon” and “the previous one” refer to the object I explicitly selected in the interface.
6. It can prepare useful help and also recognize when waiting is more considerate.

## III. Begin with a sufficiently vivid, continuous map experience

Classes, times and everyday details in the following storyboards are design situations. They do not claim a queried personal schedule. Actual presentation uses sources and conditions available at that time, with manual or otherwise authorized explicit origins. Do not activate location services or grant location permission to enact a storyboard.

### Storyboard A — The next class: the map unfolds where the words reach it

The person has just finished a class and asks: “Where is the next one? Can I get there in time?”

Give a useful answer first: the destination and a conditional timing judgment from a clearly stated start. With a timetable but no sufficiently current position, say naturally that the comparison starts from the previous classroom. A previous class location is not the person’s current GPS position.

Near that sentence, unfold a map that can be dragged, zoomed and used to select buildings. Give it enough area to recognize roads and endpoints. Its first frame contains the spatial relationship needed for this question. Do not require another application-sized map visit first, or start every question by flying down from a whole city or campus.

For “How far?” or “Will I make it?”, show A, B and their route steadily, with the timing answer immediately readable. For “How do I get there?”, establish direction and then offer one concise spatial explanation:

- Make start and destination clear, keeping only genuinely useful recognizable landmarks in context.
- Let the route become legible along actual roads. A measured elevation, pan or tilt can explain the relationship.
- Move closer only at an ambiguous junction, bridge approach or side of a building where a decision needs explanation.
- Finish with the destination and qualified entrance clear, at a view the person can use next.

This is a spatial explanation. Reading the answer and manipulating the map do not wait for animation. An unfamiliar route may merit a more expressive explanation; familiar routes, repeated inspection and urgent situations reach the useful view faster. Choose timing from distance, information gained and actual rendering/interaction quality rather than treating a fixed duration as design truth.

One everyday shot is worth refining: as the sentence reaches B, its outline receives a light, legible gold emphasis among the warm-gray buildings. A warm-gold route then unfolds from A along the roads. If a bridge approach needs explanation, move a little closer while retaining both ends of the bridge. Gold carries attention along the path; after the camera settles, the route stays quietly readable, as though someone laid the campus out on a desk and pointed along it. The instant the person takes the map, the guidance stops and the view follows their hand.

### Storyboard B — Pick up the computer, go there, then return

The person continues: “I’ll go back to A for my computer, then to B. After that I need to return to A.”

Continue the journey already under discussion. Join the stop sequence, necessary dwell time and return leg so map and concise time relationships explain feasibility together. Adding a stop changes only the affected parts, making the added distance or time understandable.

A is one place but can appear several times in the journey. Distinguish a place identity, each stop instance and each directed leg so A→B→A and A→C→B→A are representable. Generate a return leg from actual constraints; reversing an outbound polyline does not necessarily produce a valid return route.

If outbound and return overlap completely, avoid two lines flashing over each other. Give the currently discussed leg a clear direction while other legs remain light context, with a selectable stop sequence. Selecting “return to A” means viewing the return leg. “Move the camera back to A so I can look” can be only a viewing request and need not change an arrangement.

### Storyboard C — Take over while the map is moving

While the camera is heading toward B, the person drags to inspect a neighboring building. The view immediately follows the gesture. Camera motion, route emphasis and scheduled automatic fitting corrections relinquish control; a late callback cannot pull the view back.

During manual inspection, new explanation can use prose, a light annotation or emphasis on a segment. Moving the camera again needs an explicit request to continue the explanation, return to the route or inspect a new spatial target. “Follow the assistant” is not permission to keep competing for the view.

If the person says, “Wait—look at A first” during movement, retarget from the current visible state. Do not finish the old animation first or jump to its starting camera. Expansion, collapse and route replacement follow the same continuity.

### Storyboard D — Touch becomes part of the conversation

The person selects a building and then says: “If I go here first, can I still get back in time?”

The companion should know the stable place identity indicated by “here” and that the person is trying a possibility. This is a central connection between conversation and interface.

Interpret the meaning of an operation without building an elaborate gesture-classification system:

- Pan, zoom and rotation are viewing operations. They normally stay local, change no plan and request no model call per gesture.
- Selecting a place, route, date or time window creates an explicit current reference or trial choice that can accompany the next sentence.
- A real booking or amendment of an existing calendar entry uses the project’s actual execution capability and result records.

Near the composer, a restrained reference such as “about this building” or “Saturday afternoon” can make the context visible and easy to cancel. Design the form through actual use. Each selection need not add a large message or another row of labels.

### Storyboard E — On arrival, continue with what is useful

With a trustworthy arrival observation or an explicit “I’m here” from the person, the map can become a suitable compact spatial cue and hand attention to the next useful content: a real reservation, a short note for beginning study, the book to find or something to do before leaving. A self-report remains a self-report rather than an independently verified sensor event.

The preview cursor reaching its destination does not mean the person arrived. Without actual arrival support, keep a preview or planned-state identity.

## IV. Aesthetics and direct manipulation

The research direction combined Apple’s explanation of immediate feedback, interruption and spatial consistency with Google Maps’ treatment of route overview, street detail, entrances and camera paths. Translate those principles into this product’s actual data and window; they do not transfer another service’s imagery, APIs or native privileges.

Every camera action should answer something: where we are looking, where to go, where a choice occurs, which entrance matters or what changed. An engine exposing flyTo is not a reason for constant flying.

Separate the person’s route from the path used by the camera to explain it. Road geometry follows the qualified network. The camera may lead, move sideways, rise or retain a familiar landmark. It need not turn sharply at every road vertex; nor may aesthetic smoothing move the actual route into a building.

Keep warm gray and restrained gold meaningful. Gold primarily marks the current route, selection or present emphasis. Background and surrounding buildings sit at suitable levels; detailed labels emerge with the view. The selected building, required entrance and endpoints remain distinguishable and unobscured by floating content, controls or subtitles.

Use thin, layered material for a few controls when it helps show that they float above the map. Large prose, transcripts and all geographic content need not become frosted glass. Readable text, actual spatial layers and useful breathing room matter more than decoration count.

A pressed button responds promptly; direct manipulation follows the hand. A changed target continues from current motion. Late data and expired animations do not interrupt the newer operation. Coordinate rotation, pitch and scale with restraint rather than making every update change all three dramatically.

Distinguish route preview from a real position observation. Preview may play, pause, continue or be inspected at a journey position without a permanent row of player controls. A real observation has its own freshness and accuracy and is never derived from demonstration progress.

Reduced motion retains route, direction, endpoints and changes in stable frames. The planar compatibility renderer remains useful, using pan, restrained scale and emphasis to express the same intent without claiming full 3D capability.

## V. Design where the scene appears

The ordinary entrance is a scene unfolded on demand inside the conversation, with a natural path into and out of focused inspection.

Inline, place the map between the relevant sentence and its continuation, at a size that can carry the current spatial question while prose remains readable. When data is incomplete, keep a stable layout slot and show what is available and the real waiting state. Ready data becomes usable without another decorative wait or an invented percentage.

For a complex return journey, several-place comparison or careful entrance search, the same scene can enter a larger focus area. Preserve the object being discussed, camera intention, current selection and conversation context. A size change can refit the visible relationship; identical numeric zoom is not the goal.

A desktop may retain a light conversation entry. A narrow window or phone keyboard may use an input that can be naturally recalled. Choose the actual layout by rendering it. Do not squeeze full chat, map, details and composer into a crowded multi-column console simply to keep them all visible simultaneously.

Collapsing returns to the natural conversation position. Reopening continues the view without another campus-overview introduction. Entering focus must not erase what the conversation was about.

Free exploration may let the map temporarily become the main content in an immersive spatial view. It is a valuable exploration mode, not a required full-screen travel film for every classroom question.

Handle competition between chat scrolling and map manipulation carefully. A desktop wheel passing over the inline map should not casually zoom it by accident. Touch retains natural drag/two-finger operation; keyboard use supports selection and necessary actions. Prefer familiar platform behavior, then adjust from actual observation rather than prescribing one unverified universal gesture system.

## VI. Imagination in proactive help

The primary model judges initiative from original words, schedules, trustworthy observations and relevant history. Do not route “next class” to a fixed map template or “rain” to a fixed weather card.

Connect presentation to the existing attention, help-opportunity, preparation and notification lifecycle. A prepared map can enter a useful conversational moment rather than remaining forever hidden in a manually opened materials list. Completion of preparation is not itself a reason to interrupt.

Participation can have different strengths:

- **Prepare first:** the next class and a possible departure premise are known, but the person is engaged in something else. Prepare a reliable result quietly.
- **Join naturally:** when conversation turns to leaving class, going out or afternoon choices, bring a useful sentence and an appropriately sized map.
- **Remind when it matters:** an actual important departure window is about to be missed. Use the current agreed channel, explain the reason and immediately accommodate “not going yet” or “I’m already over there.”

Considerate initiative may mean recognizing that staying in a good study session suits this moment, even when another place looks marginally better. Several clicks on a building do not establish a lasting preference, and “I don’t feel like running today” does not become a permanent dislike of activity.

Reasons and conditions in memory matter. An actually sourced remark such as “Changing places breaks the concentration I just found” can inform the relevant situation. Current words and necessary evidence revise it when the person changes their mind. An interface selection is part of the present evidence, not automatically a personality fact or durable preference.

One sentence can revise a proactive map: “Class isn’t over yet,” “I’m already on the west side,” or “I’d like a longer way around today.” Continue the actual context rather than clearing it and asking the person to refill start, destination and purpose.

## VII. Everyday experiences that can grow from the map

These possibilities explain what the common foundation should accommodate and invite better situations. They do not require all external services to be connected in one commission. Keep complete design intent while clearly distinguishing actual capability and a future condition.

### 1. Calendar — See the time that is genuinely usable

“Between my two afternoon classes, how long could I actually stay at the library?”

A concise time band can show the preceding class, walking time, usable study time, packing/return and the next class. The point is how long the person can settle down comfortably, not how large an unoccupied timetable region looks.

Selecting the library or another building changes map and time relationships together. Dragging a candidate window is trial calculation; “that time, then” can refer to the current choice. Once the arrangement is accepted, save the actual local-calendar object through its existing authority. A drag demonstration does not amend an institutional timetable.

A distinctive local interaction: when the person points to another place, the old route recedes and only the changed warm-gold segment becomes prominent. Once distance is established, the usable sitting interval grows or shrinks. Give only the conclusion useful for this choice. Space and personal time connect in one continuous change. A click or “the previous one after all” can return to the original candidate.

“Leave this part unplanned” is a valuable choice. Calendar space need not be filled, and ordinary life need not become a queue of tasks.

### 2. Weather — Use the time scale the question actually needs

“Which day this week would be good for a little time outside?” can use a light seven-day comparison of temperature and precipitation. Selecting a day and then saying “that afternoon” carries a date reference into the existing local-calendar conversation when the person wants it.

For “Will I get wet going to class?”, a richer future experience could compare departure time and the whole journey while a time control reveals the applicable forecast. Light and atmosphere on the map can support the explanation, with a clear forecast/time-window identity. Decorative rain is not a live observation.

At the historical review date, the available source supported only daily forecasts for seven days from one fixed public reference. It could establish day comparisons and date references, not “rain stops in twenty minutes” or a particular hourly departure window. Hourly, minute-level and route-local claims require the actual corresponding source, time interval and geographic coverage; daily probabilities cannot be interpolated into them. The present foundation’s explicit-reference/hourly implementations are described by current code and status, not inferred from this older limitation.

“I want a comfortable evening walk” can remain a light conversation. Give sourced options and wait for the person rather than forcing a formal calendar entry.

### 3. Grades — Make the actual question easy to understand

For one course, show the course, result and needed explanation directly. For a term, use a readable table with units and calculation basis. A trend graph belongs to an actual comparison question. A simple lookup need not open a complete academic dashboard.

After selecting a course, “How much does this affect my overall GPA?” retains that course, its units and the relevant policy. Give a checkable explanation. Different terms and source GPA calculations keep their own scope and denominator. Missing results do not silently become zero. The selected institution/program/year’s actual scale and repeat treatment apply; no generic percentage-to-GPA shortcut supplies an official result.

When the person wants to discuss revision or study arrangements, connect actual exams, course material and suitable time. A high grade does not establish mastery, and a low grade becomes no personality, ability or attitude label. Clear, calm treatment of the real number needs neither confetti nor ranking pressure or gamified punishment.

### 4. Library — Continue from where to go into what to do there

“Find somewhere quiet for two hours; I need to get back to class afterward.”

Compare genuinely usable time, route and sourced place conditions first. If reliable seat information exists, an exterior building map can naturally lead to its actual floor/seat geometry, with selectable seats and comparable times. Without that geometry, show real room or reservation records rather than drawing a falsely precise seat plan.

An actual booking uses an existing or later reviewed writing capability. Candidate, submitting, success, failure and unknown stay aligned with receipts. Reading a saved booking does not establish the ability to make another. Inspect the same action after an unknown result before deciding what follows, avoiding duplicate reservations.

A confirmed reservation can connect to its route, genuine check-in deadline and the work the person intends to do. Someone already booked does not need another seat-selection ceremony. On arrival, shift emphasis to the actual seat information and study material. Cancellation or a time change updates only the affected journey and reminders.

### 5. Activity — Keep facts clear and leave room for the body and the day

“How much is left toward this term’s activity goal? Should I go today?”

Separate a formal provider’s recognized count where such a scheme actually exists, the person’s own activity record and a future device measurement. “I went running” cannot collapse those into official credit. Count, applicable rule, observation time and missing coverage follow the actual source; insufficient fields remain insufficient. Do not infer a mandatory institutional activity requirement from an example.

With actual remaining progress, a deadline and available time, help the person see comfortable opportunities. A small amount of fact plus a suitable optional plan is enough; avoid a red progress wall that nags every day.

Weather and current intention may support a track route, possible time and a natural choice to rest. Rest affects this judgment; it does not become a lasting preference. Declining a suggestion does not justify repeated extra reminders.

A future phone session can reduce the view to glanceable distance, elapsed time, position quality and necessary controls. Track computation, device accuracy, background permission and formal recognition require their own real integrations. A map animation completing a lap establishes neither a real lap nor recognized activity credit. Location services and permissions remain off; permitted manual or imported references can support the design.

### 6. Notes — Let a thought meet the person again where it helps

“Next time I’m near the library, remind me to look at that book.”

Preserve the actual words, particular book and condition as something to consider in a relevant future journey. When the next library visit is discussed, the companion can understand the wish and whether it is on the way without opening a large reminder dashboard each time.

“Leave it for now,” “I’ve already read it” and “next month” can change the intent. Being nearby is a conditional opportunity, not a requirement to notify on every pass. A journey preview without real position does not place the person there.

A building, reservation or course can be a referable note object, while free writing stays free rather than requiring a structured form for every thought. The historical brief treated original material/evidence as a foundation and asked the implementer to inspect whether a full note workspace existed. The present note owner must be assessed through current code; do not demote a real existing notebook to a future idea on the strength of that dated question.

### 7. A light rehearsal of a whole afternoon

“Class first, pick up a book at the library, then the track, and back.”

Map and time band become two views of the same arrangement. A stop selection directs attention to that leg while the time band explains arrival, dwell and what follows. Changing one stop makes changed distance and real remaining time apparent.

Where forecast resolution/coverage permits, add weather for the selected interval. The goal is to help decide how to spend the afternoon, not to stack full calendar, weather, map and booking panels together.

Two meaningful alternatives might be “take it easier” and “add one more place,” compared around their actual difference. Names and judgments come from this conversation; do not assume everyone always wants the fastest route.

### 8. Exploration and companionship without a task

“I’ve never explored this part.” “I don’t want to hurry.” “Is there somewhere nearby worth sitting for a while?”

The companion can organize a gentle spatial exploration. Start with a familiar landmark and gradually introduce nearby places with reliable information. A selected building or place becomes something to discuss.

Exploration may move more slowly. Keep a familiar bridge or building at one side and bring a more distant corner into view. A mode with qualified spatial volumes may use one light curved camera move to reveal relationships; a planar mode can make the same discovery through pan, restrained zoom and labels. Gold rests on the place being introduced. Stop where the person can look or select for themselves.

Do not invent “empty right now,” “especially quiet” or “open at this moment” to make a recommendation. Use actual environmental evidence, retain uncertainty where it is missing, and leave space for personal discovery and description.

If the person only wants to talk about something difficult, a map can be prepared without appearing. Initiative includes understanding and waiting. Not every feeling becomes an outing, workout or efficiency suggestion.

### 9. Desk to phone — The same day continues

When the person leaves the computer in a future independent-device edition, the phone can continue the selected journey, next stop and relevant context. Prioritize the part needed now rather than replaying the entire route.

Preserve object/selection identity while rechecking data and any permitted observation’s freshness. A hypothetical desktop origin does not override a newer valid phone observation. A route previously viewed does not become one actually traveled.

Arrange the phone view for one-handed use, keyboard occlusion, orientation and glanceable reading. The composer may naturally recede and be recalled; do not merely scale down the desktop window.

Retain clear state/event boundaries in the foundation. Real cross-device transport, independent mobile hosting, native observations, background reminders and health-platform sources belong to their separately implemented future capabilities. A “sync succeeded” demonstration button cannot announce those conditions as already met. Stage 11’s PC-off host and causal/withdrawal requirements still apply.

## VIII. What OpenUI should contribute

The project specified by the research is [thesysdev/openui](https://github.com/thesysdev/openui). Its dated inspection used upstream revision `8d9c4c3b108a7b5352192a6a9d7327bdf7ea19b5` and recorded an MIT license. That identifies a third-party research snapshot, not Anima’s current package version or a present API guarantee. Before a later implementation, check the actual installed lock/version and the necessary official documentation; retain the licenses of the resources actually distributed.

OpenUI can serve as a presentation adapter inside an existing conversation. In the inspected design, `defineComponent` registers a React component with a schema and explanation; `createLibrary` composes the allowed library; model-authored OpenUI Lang becomes an interface through `Renderer`; local state and structured actions support continued interaction.

The official custom-chat integration documented replacing assistant-message rendering while retaining the existing message list, composer, sessions and transport. Custom components do not require importing the complete `react-ui` skin or reconstructing the product through `AgentInterface`. Adopting the open runtime does not itself require another model, a paid hosted API or replacement of Hermes. Check the current supported integration rather than treating this historical option as a command to reinstall or migrate the current foundation.

Register components around real map data, the forecast resolution actually supplied and the existing local calendar. Let the model understand “this part of the journey,” “compare these two dates” or “emphasize this entrance.” Business tools supply facts; the map engine executes exact local movement.

Component properties reference host-validated data, objects, routes and stable place identities. The model should not emit longitude/latitude every frame, invent geographic geometry or execute arbitrary JavaScript. It needs expressive freedom to choose and organize a presentation, within schemas and component boundaries designed from the actual code. No fixed naming scheme in this brief is mandatory.

The person need not ask to “render a map component.” The primary model judges whether and how presentation helps from actual words, context and available capability. Use the existing context/evidence process rather than another keyword intent router assigning UI templates.

Dragging, pausing, switching already-known options or sorting a delivered table respond locally. A selection that changes conversational meaning carries its object, source reference and current intent into assistant context. New data, judgment or a real action uses the appropriate tool when needed.

If the actual installed runtime has an integration limitation, inspect its source and choose the smallest adequate adaptation. Keep Anima’s business contracts and components independently meaningful rather than making the whole app depend on an unstable DSL fragment. An unresolved critical condition must name the limitation and actual alternative. A static card labeled OpenUI does not establish integration, while a compatible existing dynamic implementation should be preserved rather than rebuilt for its label.

## IX. Continuity the common foundation must preserve

These are state relationships needed for the intended experience, not instructions to copy a new large architecture. Start from existing shared matters/views, object versions, local interaction and execution mechanisms, and map current names through project navigation.

### Facts, current objects and viewing state retain separate meanings

Facts are traceable to source, time, coverage and relevant conditions: a particular timetable snapshot, forecast, route revision or booking receipt. A visually continuous page does not give those sources one shared freshness.

A journey, arrangement or candidate that needs ongoing discussion keeps stable identity, current version and actual choices. A simple query does not require a complete work/matter first. Presentation objects can reference ongoing work or show a one-off query result.

A scene/view has its own stable identity. Camera, selected segment, expansion and a date being explored are view/interaction state. A temporary angle is not personal memory. A meaningful choice remains referable by the next “here” or “that day,” with trial calculation distinct from an accepted arrangement.

Real actions retain existing permission, execution, revision checking and receipts. Selecting an image or generating a button does not book a seat, change a calendar or finish an activity. Preparation, candidate, submission, success, failure and unknown follow actual events.

### The present can change while an old conversation keeps its historical meaning

Historical messages preserve the result discussed then. Opening yesterday’s weather must not silently replace it with a new forecast. Viewing an older journey must not turn it invisibly into a new timetable.

When the person wants to reuse an old arrangement, check affected facts and action conditions before continuing the current object. Explain a meaningful change where useful—“the earlier arrangement” or “the room later changed”—without putting revision/token/protocol fields in the ordinary conversation.

Reading old messages does not automatically replay their routes or submit their actions, and dozens of historical maps should not all consume active resources. The active map remains immediately usable. Offscreen/history strategy may combine a retained snapshot with recoverable state, chosen from actual performance and continuity rather than a rigid “everything always live” rule.

### Streaming presentation stays stable

With validated data available, deliver a useful first frame promptly. Streaming prose or local updates must not repeatedly reconstruct WebGL, reset the camera, replace the selected object or push the chat’s reading position away.

Map resizing, inline/focus changes, the next reply and historical recovery all need stable identity. If rebuilding a renderer instance is genuinely necessary, restore the scene and camera intention so use continues naturally. The mere presence of a React node does not prove continuity.

After cancellation, a route change, topic change or closed view, expired callbacks cannot move the camera, change old options or execute an action. Retain valid independent results and cancel the affected operation precisely rather than resetting the entire conversation for one update.

### A new domain has a clear entry

At minimum, a domain can supply useful component descriptions/property contracts, traceable data references, its own direct manipulation, semantic selections returning to the conversation and an actual action bridge when needed.

Map and weather need not share one layout. They can share a clear account of the selected object, result time, next-sentence reference and checks required before reuse. The component library expresses available presentation; the primary model judges its usefulness; the existing host maintains factual and execution boundaries.

## X. Concrete engineering observations worth preserving

These notes came from the October 18 investigation. Paths, line numbers, method signatures and integration status can change. They identify responsibilities and risks to inspect in the current project; they do not demand a new framework for each issue or certify that every risk currently reproduces.

### 1. Extract a genuinely reusable map surface

Read the current responsibilities in:

- `src/renderer/App.tsx`
- `src/renderer/map/CampusMap.tsx`
- `src/renderer/map/ConversationMap.tsx`
- `src/renderer/map/map-engine.ts`
- `src/renderer/map/map-state.ts`
- `src/renderer/map/map-types.ts`
- `src/main/mapService.ts`
- `src/main/runtime/spatial.ts`

The inspected `MapSheet` combined dialog `showModal/close`, map-instance creation/disposal, a position-reading loop and module-level state. Global names such as `savedCamera`, `savedSelection`, `entered` and `sessionLocationEnabled` created a risk of sharing state between several inline maps. That was a reason to separate the actual reusable surface/controller from scene state, not a prescription to recreate those globals. In the current foundation, verify the existing separation and manual-location default before any change.

Conversation-inline, focused and ordinary map entry should share the existing engine through suitable scene state. Simply registering the entire modal `MapSheet` as an OpenUI component would carry dialog, location and global-state responsibilities into each message.

Any future authorized observation lifecycle belongs to the actual host capability, never one independent request/poll loop per historical map. Keep geographic data, route service and compatibility renderer consistent. Do not create another campus map or duplicate place database. Location services and permissions remain off.

### 2. Add cancellable orchestration inside CameraOwnership

The inspected `map-state.ts` already had `CameraOwnership`, with revision/ticket rejection of stale actions. Pointer/wheel/takeControl behavior in `map-engine.ts` stopped camera movement and route reveal and cancelled pending fitting corrections when the person took over.

That is valuable existing work. A journey explanation should include beginning, phase completion, replacement, gesture takeover, disposal and expired callbacks in the same ownership model. Chain phases using the map engine’s real completion/cancellation signals instead of a few timeouts guessing that the camera finished.

The investigation found a specific interface trap: `zoom`, `rotate`, `north`, `setPitch`, `overview`, `focusPlace` and `fitRoute` invoked `takeControl`. Taking a ticket and then calling those methods in sequence could invalidate the ticket through the first call. In that inspected revision, `fitRoute(result, ticket)` returned whenever ticket was not undefined; the signature could not be assumed to support automated orchestration. Preserve the diagnostic lesson and check the actual current method rather than treating this dated finding as an unresolved current fault.

Internal interfaces may distinguish a direct user command from a phase within the same admitted orchestration. Do not create a second camera owner that also writes directly to the same MapLibre instance.

### 3. Reuse route geometry and existing preview

The inspected engine computed cumulative distance over the real polyline and interpolated along road segments while retaining turns. It had approximately 640 ms of route emphasis and a progress cursor explicitly identified as a route preview, not a current position. That duration is a dated implementation observation, not a required delay or a present performance claim.

Route fitting already accounted for labels, controls, bounds and a limited number of actual measurement corrections. Develop those capabilities rather than drawing a separate decorative curve detached from roads. Estimated/conditional segments keep their dashed and uncertainty meanings throughout emphasis.

Camera choreography and the real journey can be modeled separately. Reuse the actual walking network. Faster preview playback does not establish cycling access, real travel speed or native phone navigation.

### 4. Connect existing matters, selection and preparation

Read the actual responsibilities in:

- `src/shared/presentation.ts`
- `src/shared/interaction.ts`
- `src/shared/harness.ts`
- `src/renderer/HarnessViews.tsx`
- `src/renderer/LifePanels.tsx`
- `src/main/runtime/context.ts`
- `src/main/runtime/attention.ts`
- `src/main/capabilities/campus-query.ts`
- `src/main/capabilities/builtin.ts`

The inspected `SharedMatterView` carried object/option id and revision, `selectedOptionId` and `placeId`; `MatterSelectionInput` had `expectedRevision`; `ObjectPresentationState` expressed historical/current changes. Connect those actual identities and versions instead of inventing an unrelated “OpenUI selection.” Resolve names through current types if they have evolved.

Context already included original `authoredText`, session history, the current matter, observations, prepared material and a capability directory. Preserve the primary model’s ability to obtain evidence from the actual words, bringing meaningful interface references into that same context.

`AttentionService` had prepare/wait/ask/notify/none, expiry, deduplication and different presentation/notification modes. `PreparationShelf` then primarily showed material text. A proactive map should join that preparation/presentation path with a real cause and lifecycle, and enter the conversation when useful. Do not add a reminder process driven only by a clock and keyword matches. Current preparation capabilities must be checked independently rather than frozen at the historical text-only state.

### 5. An OpenUI action list does not automatically await arbitrary animations

In the inspected upstream `packages/react-lang/src/hooks/useOpenUIState.ts`, `ActionPlan` awaited a Mutation while iterating actions, but invoking a custom action handler did not await completion of a host animation.

The following illustrative notation therefore did not establish a reliable visual timeline:

```text
Action([@FlyToA(), @TraceRoute(), @FlyToB()])
```

It could issue three events quickly, causing camera operations to cancel one another. These names are an explanatory counterexample, not registered actions in Anima’s current finite library.

A semantic request such as “show this journey” can instead let the map controller run its phases inside the existing ownership model, continuing from actual completion, cancellation or a newer intention. Choose real action names and supported interfaces from the current code.

### 6. Streaming, incremental editing and restored state have concrete boundaries

The same inspected OpenUI hook blocked a new Query effect while `isStreaming`, while a response bundle was incomplete or while the bundle had a parse error. That referred to `bundle.error`; it did not establish that every DSL type error or recoverable warning blocked Query in exactly the same way. Do not promise data acquisition as soon as the model emits the opening of a Query expression. A useful first presentation can use trustworthy data and references already obtained by host tools, then unfold a stable view.

The inspected Renderer used index keys for array children, and unresolved references could be removed from an array. The same DSL statement name therefore did not guarantee that streaming insertion/reordering would preserve a WebGL mount. This was an integration risk inferred from source structure, **not a reproduced current-product failure**. Inspect real behavior around stable view/scene identity instead of reporting that inference as an observed defect.

The official incremental-editing approach merged patches by statement name, but its example waited for the patch stream to finish before merging, avoiding a half-written root that temporarily made nodes unreachable. Check the actual current merge/closed-unit design; do not rebuild an entire map for every arriving token.

The inspected message protocol could persist UI text plus `context`, while Renderer ignored that context. Host code needed to parse it, restore suitable `initialState` and persist appropriate changes through `onStateUpdate`. The host also managed component-library version and business-fact snapshot identity. A runtime instance’s Query cache was not durable cross-session or cross-device storage. In Anima, keep actual source bodies with their owners and persist the program’s appropriate local state through its revision/CAS contract rather than copying private factual content into a second UI archive.

Component prose and schema action restrictions do not replace execution checks in the host. Current permission, object revision, real capability and exact action receipt still determine what can happen.

## XI. The complete future work block represented by this brief

This section describes the intended finish for the design. Select work against the current baseline and actual roadmap dependencies; preserve already-completed parts. These goals remain distinct from implemented behavior.

Use the in-conversation map as one complete chain, plus a non-map case supported by actual data to show that the foundation generalizes. One suitable example is a daily seven-day forecast → selected date → “that afternoon, then” → local-calendar continuation. Another genuinely supported calendar/place sequence can be equally persuasive.

The point is that interface selections participate in continuing conversation and different domains refer to the same actual date/place. Placing two unrelated components together does not establish that shared foundation.

The map chain should cover:

1. The primary model chooses a useful map from the actual conversation/context/tool result; an extra “open” request is unnecessary.
2. Place resolution and routes retain reliable sources, with A→B, A→B→A and additional stops explained and changed continuously.
3. The person takes over during movement or redirects with the next sentence; the view continues from current state and stale callbacks do not retake control.
4. A selected place supports “here” in the next turn, while viewing, trying an option and taking an actual action remain distinct.
5. Inline, focus, collapse, multi-turn updates and historical inspection preserve reasonable continuity and a genuinely manipulable current map.
6. Existing preparation/attention can offer sourced map help in an appropriate situation and accommodate corrected premises, delay or a changed decision.
7. No-WebGL and reduced-motion paths retain the necessary information and direct interaction.

At the same time, weather, calendar, grade, reservation, note and activity domains receive clear component/reference/action entry contracts. A small feature with real value and actual evidence can complete a commissioned block; do not fill the future with empty buttons or invent external services for an all-complete claim.

For an unconnected capability, preserve its concrete design, interface home and the facts still needed. Hourly/minute weather at the necessary place, live seats, real booking writes, phone position or formal activity recognition require their actual conditions. Do not relabel demonstration data as connection success. Existing permitted samples/checks can assist isolated observation; this material authorizes no new fixture, assertion case, suite or runner, including temporary or inline test infrastructure. Synthetic results stay separate from personal results, executed actions and public demonstrations.

## XII. Judge the integrated result

For an actually commissioned future implementation, run its current integrated version and operate the paths changed. Screenshots help inspect composition, text and occlusion. Motion continuity and gesture takeover require playback and interruption, not only a still image or a successful function call.

The decisive experience is whether a person can see where/when a choice matters, change intention and have the view keep up, look freely while the companion yields, continue from the current selection in the next sentence, and return to the same conversation.

Choose a few discriminating situations: an unfamiliar route and entrance, an interrupted return journey, gesture takeover, inline/focus return, a selected-object reference and a cross-domain date continuation. Once these give adequate evidence, do not manufacture more video, screenshot matrices or scores merely for quantity.

Use the relevant existing checks and ordinary owner/bridge calls for actual state/execution risks: stale camera callbacks, replacement journey versions, a stable streaming view, historical reading versus current reuse and duplicate action triggers. Preserve verification without creating new test code/fixtures/runners unless the person explicitly commissions test development. Styling work needs actual rendering rather than tests that mirror its implementation.

Follow the current AGENTS and actual provider/host contract. Use the specifically authorized Luna configuration; connecting a UI does not authorize another model route, paid call or replacement of the whole model runtime. Product inference, engineering-model use and an image tool’s login remain distinct. Inspect actual returned model identity for claims about a real-model observation.

Respect the private/public boundary of current code and selected map-review assets. A public map can include only the reviewed public dataset and its presentation. Personal original words, accounts, model configuration, position, campus-query results and private overlays do not enter a public bundle or source commit. A desire to demonstrate an effect does not authorize publication or a page containing real user data.

Name actual connector/device limitations and which environment/path was observed. Planar success does not establish a 2.5D dynamic experience; a simulated reservation is not a real booking. A file path is not proof that image pixels were seen. Location services and permissions remain off; device and platform observations need their own applicable scope and evidence.

A useful development record contains:

- The important design choices and how they serve the everyday situations above.
- The continuous interactions actually completed and how to use them now.
- Relevant code/document changes and the necessary real run/check results.
- A few representative views sufficient to judge the outcome; motion media, when useful, focuses on actual movement and takeover.
- Capabilities still needing real sources or devices, and one clear next entry.

Do not turn the conclusion into dozens of internal receipt lines. Make clear what a person can now do, why it feels more natural and the actual remaining limits. A successful work block does not automatically trigger publication.

## XIII. Dated research basis and continued reading

These sources supplied design principles, examples or API/code evidence for the October 18 brief. Transfer the relevant judgment, not Google’s imagery/3D service privileges or Apple’s native APIs as presumed Anima resources. The dated research reported reading official prose, transcripts and source, and observing a Google route example. It did not claim hands-on operation of every reference product’s complete motion. This working edition preserves the reading basis; it does not report a fresh verification of every linked page or API. A later implementation checks the necessary current primary documentation and its actual installed versions.

### R1 — Maps and appropriate detail

[Apple Human Interface Guidelines — Maps](https://developer.apple.com/design/human-interface-guidelines/maps) informed interactive maps, clear selection, details appearing with spatial/zoom context and place details that do not obscure the relevant location.

### R2 — Purposeful and interruptible movement

[Apple Human Interface Guidelines — Motion](https://developer.apple.com/design/human-interface-guidelines/motion) informed purpose, timely feedback, cancellation, restraint in frequent actions and information that remains understandable without motion.

### R3 — Continuation from the actual moving state

[Apple WWDC18 — Designing Fluid Interfaces](https://developer.apple.com/videos/play/wwdc2018/803/) was read through its official transcript for immediate response, retargeting, spatial consistency and continuation from current movement. It was not evidence of a native Anima implementation.

### R4 — Material and content are not one surface

[Apple Human Interface Guidelines — Materials](https://developer.apple.com/design/human-interface-guidelines/materials) informed selective transparency for floating controls, with readable content and appropriate surface hierarchy.

### R5 — Attention and real urgency

[Apple Human Interface Guidelines — Managing notifications](https://developer.apple.com/design/human-interface-guidelines/managing-notifications) informed preparation versus timely contact and respect for the person’s attention according to actual urgency.

### R6 — Route overview, detail and the camera’s path

[Google Maps — How we built Immersive View for routes](https://blog.google/products-and-platforms/products/maps/google-maps-immersive-view-routes/) supplied research on route overview/street detail, entrances/occlusion, smooth camera paths and weather considered with a journey. The article’s B-spline camera approach is a design reference, not a required new algorithm or a source of geographic rights.

### R7 — Previewing a selected time

[Google Maps — October 2023 update](https://blog.google/products-and-platforms/products/maps/google-maps-october-2023-update/) supplied an example of departure preview and a time control for forecast/simulated conditions. Predictions retain their identity and do not become current observations.

### R8 — The journey and the camera can have different routes

[Mapbox — Animate the camera along a path](https://docs.mapbox.com/mapbox-gl-js/example/free-camera-path/) used separate `targetRoute` and `cameraRoute` examples, informing the separation of actual travel geometry from its viewing path. Its exact API remains version-specific.

### R9 — Prose and persistent space

[Mapbox — Fly to a location based on scroll position](https://docs.mapbox.com/mapbox-gl-js/example/scroll-fly-to/) informed the relationship between prose and a persistent map, without making every chat scroll seize camera control.

### R10 — Keep the existing conversation shell

[OpenUI — Custom chat UI](https://www.openui.com/docs/build-agents/custom-chat-ui) documented assistant-message rendering inside an existing conversation system.

### R11 — Registered components and local interaction

[OpenUI — Defining components](https://www.openui.com/docs/openui-lang/defining-components) and [Interactivity](https://www.openui.com/docs/openui-lang/interactivity) informed component registration, schemas, events and state updates.

### R12 — Local change, query and real action differ

[OpenUI — Actions](https://www.openui.com/docs/openui-lang/actions) and [Queries and mutations](https://www.openui.com/docs/openui-lang/queries-mutations) informed the separation of immediate local interaction, source acquisition, actual mutation and continued conversation.

### R13 — Restored context and incremental editing

[OpenUI — Message protocol](https://www.openui.com/docs/openui-lang/message-protocol) and [Incremental editing](https://www.openui.com/docs/openui-lang/incremental-editing) informed the host’s context restoration, state persistence, versioning and patch-merge responsibility.

### R14 — The specific upstream source inspected

The dated revision is `8d9c4c3b108a7b5352192a6a9d7327bdf7ea19b5`:

- [useOpenUIState.ts](https://github.com/thesysdev/openui/blob/8d9c4c3b108a7b5352192a6a9d7327bdf7ea19b5/packages/react-lang/src/hooks/useOpenUIState.ts) — action-handler awaiting and the streaming Query boundary.
- [Renderer.tsx](https://github.com/thesysdev/openui/blob/8d9c4c3b108a7b5352192a6a9d7327bdf7ea19b5/packages/react-lang/src/Renderer.tsx) — array-key/unresolved-reference behavior and context responsibilities.
- [queryManager.ts](https://github.com/thesysdev/openui/blob/8d9c4c3b108a7b5352192a6a9d7327bdf7ea19b5/packages/lang-core/src/runtime/queryManager.ts) — query/cache lifecycle considered in the research.

These references support the exact dated observations and inferred risks in section X, not a claim that every later runtime has identical behavior.

### R15 — Product responsibilities to trace in the actual current files

Read [PROJECT_NAVIGATION](../../PROJECT_NAVIGATION.md) and follow the actual versions of `CampusMap`, `ConversationMap`, `map-engine`, `map-state`, shared presentation/types, runtime context/attention/spatial, campus-query and built-in capability registration. Their current files, contracts and observed behavior take precedence over the older inspection notes. Keep original owner, source, version and action semantics while adapting rendering.

### R16 — Public preview and implementation are separate observations

Use the current project’s documented public-map review commands and [CURRENT_STATUS](../CURRENT_STATUS.md), together with the selected [map source](../../assets/map-v2/SOURCE.md). The dated hosted-preview observation established a planar path only. Hosting/version synchronization, current renderer choice, spatial quality and dynamic continuity require their own actual evidence; the public preview contains no private desktop integration.

---

Use this design's reasons and specific examples when choosing a bounded work unit. Consult the current baseline to avoid rebuilding what already works, and keep proposals distinct from observed behavior.
