# Map motion and shared spatial experience

This map and dynamic-interface design develops ideas through research and imagination before implementation. It preserves earlier observations, alternatives and proposals. Descriptions of code inspection, hosted previews and external examples belong to the earlier research; check the current implementation and runtime before drawing conclusions about their present behavior.

The original discussion referenced [OpenUI](https://github.com/thesysdev/openui), Apple interface guidance, Google Maps route presentations, and Mapbox camera examples. Those references explain the design lineage. Confirm current primary documentation and the actual integration before depending on a technical behavior. The separate [Dynamic conversation interfaces commission](DYNAMIC_CONVERSATION_INTERFACES.md) is a related full implementation proposal, not this document's source body.

## The creative request

There is already a real map in the product. Imagine bringing that map directly into the conversation with a striking, simple, fluid experience: the assistant presents a route from A to B without requiring the user to place markers manually; a camera helps explain the relationship, approaches what matters, and can show the return to A or another change of plan. The user can still touch and operate the map.

Before prescribing implementation, study how others describe map aesthetics and motion: what makes a route legible, how a camera reveals space, which details make motion feel deliberate, and how the map belongs in an ongoing conversation. Then brainstorm from the actual product rather than starting to code immediately. The desired work is imaginative design with a grounded foundation.

The assistant need not wait for the literal command “show a map.” A discussion of the next class or an upcoming departure can make spatial information useful. This does not mean automatically interrupting at every class boundary. Placement, timing, and the relationship with the assistant deserve as much design attention as the movement itself.

Leave room for later calendars, daily or hourly weather, grades, library arrangements, and activity records. A weather question might bring the relevant days into the conversation without a trip through menus; a grade question needs an appropriate readable presentation; a library arrangement needs more than a generic table. Future phone use can use explicit manual or permitted imported references. Location services and permissions remain off. Design boldly, but distinguish an imagined capability from one actually available.

## 1. What the reference designs suggest

### A camera should know how this route needs to be understood

The earlier research described Google Maps Immersive View examples combining overview and street detail, with deliberately designed zoom, translation, inclination, entrances, occlusion handling, and smooth camera paths. It also described time and weather within a travel view, including a time control for comparing forecast and simulated traffic. These are dated research observations, not a current capability audit or a requirement to reproduce a 3D service.

The transferable idea is a camera with a reason for moving. On a campus:

- “Will I make it?” calls first for the whole route and its time relationship.
- “How do I get there?” calls for recognizable turns.
- “Which building is it?” needs a familiar landmark to remain visible while the destination becomes clear.
- Near the destination, the final entrance may matter more than the whole campus.

Each approach, elevation, or turn should help answer the present question. Repeated ornamental flights do not make the experience intelligent.

### Fluidity includes changing one's mind mid-motion

The original reading of Apple's *Designing Fluid Interfaces* emphasized immediate response, interruption, redirection during motion, and spatial consistency. If the map is approaching B and the user says, “Wait, look at A again first,” it should turn naturally from its current visible state. It should neither make the user wait for the old animation nor jump back to a campus overview and replay an entrance.

Touch should take ownership immediately. The route can remain visible while the user's attention leads. This ability to meet a changed intention is a substantial part of the desired polished feel.

### The walking route and the viewing camera are different paths

The earlier Mapbox examples separated the route being explained from the camera's own path. Another example kept a single map alive while different text sections referred to different places.

The camera need not turn sharply at every road vertex, as if attached to the walker's forehead. It can lead slightly or move sideways to reveal the space before a turn. Later explanations should continue to address the same map. “Why does this part go around?” can emphasize that segment; “Show the way back” can turn attention to the return. Text and map stay about the same work.

### Depth and material should leave the content room to breathe

The original Apple map and material references emphasized interaction, clear selection, place information appropriate to the available space, and restrained use of translucent material for navigation and controls. The intended interpretation is concrete: a quiet map surface, an unmistakable current route, detail revealed as the user approaches, light controls with readable text, a calm state after an action, and relevant operations close at hand without every operation permanently occupying the screen.

The existing warm-gray, off-white, and gold map was a useful starting point. Preserve the clarity and hierarchy rather than copying a system's appearance without its reasons. Translucency must not blur labels or turn the map into a decorative backdrop.

## 2. Build on the real map and connect it to conversation

The earlier source inspection described a route-summary card that opened a separate map sheet. Its proposed gap was a map appearing in the conversation and remaining editable through the next sentence. That observation is version-specific; inspect the present product before declaring the gap still exists.

The same inspection found real road routes, route emphasis, a preview cursor, labels, viewport adaptation, and camera ownership that already allowed user takeover. The earlier hosted preview ran a planar compatibility path and differed from the examined source version. It did not verify the latest dimensional presentation or motion. Retain that limitation rather than treating the preview as evidence for a newer renderer.

The design judgment is to deepen the existing map's connection to conversation, time, and action. It is not a request to replace real geometry with a fantasy campus illustration or invent existing three-dimensional functionality.

## 3. Six acts for the first map experience

These are synthetic campus storyboards, not a user's biography or records of actual journeys.

### Act 1: the destination enters the conversation, and the map opens here

The user asks, “Where is my next class? Can I get there in time?” The assistant first gives a useful sentence: “It is at B. If we use your previous classroom A as the starting point, there is still some margin.” The starting point remains an explicit assumption, not a claim about live position.

The map appears immediately below that answer. Its first useful frame already includes A, B, and the campus between them. There is no flight down from a citywide view and no preliminary trip to a map tools page. Familiar building outlines remain quiet. As the explanation reaches B, its outline gains a restrained gold emphasis; a warm route reveals itself along the real road geometry from A. The feeling is of laying the campus out and tracing the way together.

### Act 2: approach only where explanation needs it

At an easily confused bridge approach, the camera moves a little closer while retaining both ends of the bridge and the next part of the route. A short explanation says, “Cross from this side.” Attention then proceeds toward a supported entrance, where the destination building, entrance, and last segment become clear.

Every route need not become a fixed-length travel film. A familiar route can be presented quickly; an unfamiliar one can receive more explanation. Only a request such as “Let me look along the way” calls for an extended preview. Make the conclusion readable and the map usable first. Motion helps understanding.

### Act 3: a hand on the map stops the guidance

The user notices a nearby building and drags the map. Camera ownership transfers immediately. The route remains, and the assistant understands that the user is exploring. Later text and data do not repeatedly pull the view back to B.

When the user asks, “Show that entrance again,” the camera continues from the current viewpoint. Refine this ability to take over and hand back more carefully than a spectacular repeated entrance animation.

### Act 4: a selected building makes “here” meaningful

The user selects the library and asks, “If I pick up a book here first, can I still get there in time?” The assistant needs to preserve three distinctions: “here” refers to the selected library; this is a trial arrangement; only the affected route segments and time assumptions need reconsideration.

Update the same map. Emphasize the added segment, leave unchanged portions stable, and briefly explain the detour's effect. A selection in the interface becomes useful common ground for the next sentence. Selecting a place does not itself authorize saving an arrangement, booking a seat, or starting navigation.

### Act 5: make the order of A to B to A understandable

The user says, “Pick something up at B, then return to A.” A light itinerary can read “Leave A · collect at B · return to A.” The segment currently being explained is clearest, with enough context retained around it. If outbound and return roads coincide, current direction and the itinerary can express the order without two lines competing for attention.

“Stop at C before returning” adds C to this same journey. Show which segment changed and the effect on the return time. The route-preview cursor must have an explicit meaning: reaching B means the preview reached B. It is not a real arrival. A future device position is a different fact with its own source and quality.

### Act 6: after arrival, attention turns to what is useful next

An explicit “I have arrived,” or a future reliable and authorized arrival signal, can let the map settle into an appropriately compact spatial cue. A library visit might bring forward an already confirmed reservation, seat information, or the activity being prepared. A class arrival might bring a relevant note or course material.

The sequence has a before and after. Once the map has explained the immediate spatial question, the center of attention can pass to the next part of the same work. Do not infer arrival from completion of an animation.

## 4. Placement: inline first, with two wider ways to look

| Presentation | Suitable situation | Intended feeling |
|---|---|---|
| Expanded in the conversation | The next class, one route, or one building | We are looking together at what we are discussing. |
| Temporary focused view | Return trips, multiple stops, comparison, or an entrance | The same scene has gained room. |
| Immersive exploration | An unfamiliar area, a leisurely campus look, or a journey preview | There is time to discover independently. |

Use the first for ordinary work, the second as a natural expansion for complexity, and the third when exploration is wanted. Expanding, collapsing, and returning preserve the selected place, discussed segment, and camera intention. A changed window shape can require a different visible extent; the user should still recognize the same map.

A desktop focused view can retain a lightweight composer. A future phone layout may let the composer withdraw naturally when the keyboard and map compete, with an easy return. Protect continuity of the conversation rather than squeezing full chat, map, details, and a row of controls into every screen.

Wheel behavior needs actual page inspection. While reading chat, passing over the map should not casually turn scrolling into accidental zoom. Deliberate map operation must still feel immediate. This judgment requires real interaction, not just a screenshot.

## 5. Initiative with three different strengths

**Prepare ahead.** The assistant may know the next class and have a legitimate way to prepare a route while the user is discussing something else. It can prepare without occupying the screen.

**Join naturally.** When the conversation reaches leaving class, going out, or the afternoon, a useful sentence and map can enter at that point. The user does not need to name a tool for spatial information to become relevant.

**Remind at the right moment.** If an important departure window is genuinely approaching, use an appropriate degree of interruption, and accept corrections such as “I am already there,” “Class has not ended,” or “I am not going today.” The source connected this with notification guidance that respects urgency and attention.

The earlier code reading reported preparation, waiting, questions, reminders, and deduplication mechanisms. Any later integration should inspect and extend the real mechanism rather than assume it is absent or replace it with a second loop. Preparation is not permission to notify, and a prepared presentation is not a completed action.

Do not reduce initiative to a rule that a map must pop up when class is nearly over. Someone already settled into productive study may be better served by staying, even if another place saves two minutes of walking. A useful judgment draws on their stated reasons, present situation, and relevant experiences.

“I do not feel like running today” is first about today. “Do not remind me this time” has a present scope. Treating either as a permanent global preference can make companionship feel like management rather than care.

## 6. Nine experiences that can grow from the map

### 6.1 Calendar: reveal the time that really belongs to the user

“How long can I sit somewhere comfortably between these classes?” can produce a simple time band: the previous class, travel, usable seated time, packing and return, and the next class. Give the genuinely free interval the most breathing room.

If the user chooses another place, emphasize only the changed route. Once the travel estimate is established, the seated interval lengthens or shortens. The benefit becomes immediately understandable: this place permits a little more undisturbed time. “Use this one” or “Go back to the previous one” should connect map, time, and conversation. “Leave that time empty” is also a meaningful choice that the calendar must preserve. Do not automatically fill it.

### 6.2 Weather: match the time scale to the question

“Which day this week is good for a walk?” calls for a seven-day comparison emphasizing useful temperature and precipitation conditions. Selecting Saturday and saying “That afternoon, then” should establish the date being discussed.

“Go to the library now or a little later?” could eventually use real hourly forecasts to vary a journey's departure time. Map light and weather atmosphere may support the experience, but the useful information remains legible and a forecast remains a forecast.

The inspected weather implementation offered daily forecasts over a seven-day range from a fixed public reference. That was an old implementation observation, not proof of an hourly source or the current configuration. The project uses a configurable public campus reference, with UCI as the default, separately from device location. Hourly departure comparison requires actual appropriate data. Never silently use a forecast to assert current weather or a reference point to assert the user's whereabouts.

### 6.3 Grades: make the asked-for thing clear first

A question about one course should first show that course. A question about a term should show a readable grade table, credits, and the applicable statistical basis. Only a question such as “Which courses most affect this term's GPA?” needs a comparison view.

Selecting a course and asking why its effect is large should retain that course and the calculation basis. Exams, materials, and the desired study arrangement can join when relevant. Academic systems and GPA policies must come from actual configuration or supported records, not an imported institution's assumptions.

The visual should be calm and clear, with room for the user's own reaction. Automatic celebration and judging a person by one result are not required. Use synthetic or properly authorized grade data when exploring the design.

### 6.4 Library: from a place choice to settling in

“Find somewhere to sit for two hours before I return to class” calls first for actual usable time, travel, and supported place conditions. With a reliable live availability source and seat geometry, a future map could move from building to floor to seat, while the selected time remains part of the same conversation.

If a reservation already exists, connect that actual object, its route, and any supported check-in deadline. At arrival, attention can pass to the seat and the intended work. The old resource catalog described readable reservation records. That does not establish current live vacancy, seat geometry, or a write capability for new reservations; each requires separate connector evidence.

Candidates and successful reservations must look distinct. A beautiful seat-selection animation is not a booking receipt.

### 6.5 Activity and running: show opportunities while respecting today's state

“How many sessions are left in my activity goal? Should I go today?” can first show the count and rules from the stated source, then consider the remaining time and unhurried opportunities. This may be a voluntary challenge or a configured program; do not invent a mandatory campus running policy.

If the user wants to go, a supported route, time window, and track entrance can join. If they choose rest today, accept that decision. A later phone exercise view could prioritize distance, elapsed time, position quality, and a small set of necessary controls, but only after real integration and separate permission.

Keep program-certified counts, personally recorded activity, and device-measured exercise distinct. They can help explain one another, but have different sources. Neither a phone trace nor an official certification exists merely because a map animates a run.

### 6.6 Notes: meet a thought again where it matters

“Next time I am near the library, remind me to look at that book” can preserve the original words, book, and condition. When a later conversation concerns the library, the assistant can say, “You also wanted to look at that book; this visit might fit.” It may explain whether it is on the way and retain book and library in the same discussion.

“I have already read it,” “Next month,” and “Leave it for now” change the continuing item appropriately. The warmth comes from not requiring a form for every passing thought or turning every idea into a demand. A geographically phrased condition does not itself grant location access; a relevant conversation can provide a lawful opportunity to reconsider it.

### 6.7 Preview an afternoon through both time and space

“After class, pick up the book, go to the track, and return” can become an afternoon that is easy to preview. Selecting a stop turns the map toward the relevant part. A time band explains arrival, dwell time, and what follows. Adding a stop shows both the changed distance and the remaining freely usable time.

With sufficient real data, the selected time's forecast can join. Two reasonable plans should be compared through meaningful differences: one is more relaxed, another includes an additional place. The user can also make an edit rather than being forced to choose from a prewritten button set. Preview, acceptance, and saving remain separate.

### 6.8 Campus exploration without a task

“I do not think I have explored this area” can let the map open more spaciously. Begin beside a recognizable bridge or building, then gently reveal an unfamiliar corner. Keep a familiar landmark near one side as a new road and buildings enter view.

Where real dimensional data exists, a small curved movement might reveal relationships between buildings. Planar mode can accomplish discovery through measured translation, zoom, and label hierarchy. Gold falls only on the current subject. Stop the camera and leave time for looking.

If the user selects a neighboring building, discuss it. “I feel like taking the longer way today” can lead to a supported route. Exploration can have a leisurely spirit without becoming a formal itinerary.

### 6.9 Continue from the computer onto the phone

After discussing a route on the computer, a future phone opening could prioritize the selected journey and the segment useful now. It should preserve why the journey was arranged, and revise the departure premise only when fresh, authorized information supports doing so.

Near the destination, the entrance may matter most; at the library, the seat and prepared work; afterward, the next stop. This requires genuine cross-device state, actual phone capabilities, and legitimate lifecycle support. Design stable objects, selections, and context first. A “synchronized” demonstration button is not implementation evidence. No location or background service is enabled by preserving this proposal.

## 7. The shared foundation should help the assistant understand

| Keep distinct | Why it matters |
|---|---|
| Facts and sources | Identify the weather result, schedule revision, or reservation receipt, and when it was obtained. |
| Discussed objects and selections | Resolve “here,” “that afternoon,” and “the earlier option” against stable current references. |
| Presentation and viewing state | Preserve recognizable places and spatial relationships after expansion, collapse, or a view change. |
| Historical results and current changes | Keep an old conversation's meaning and check affected changes when reusing it. |
| Actions and outcomes | Separate trying a plan, accepting it, submitting a reservation, and receiving actual success. |

This does not require a large persistent work object for every casual sentence. A simple query can stay light; continuing discussion can retain an object when needed.

Touch has limited and useful semantics. Dragging generally means viewing. Selecting a place or date establishes a current reference. “Arrange it this way” can initiate the appropriate authorized action path. Every zoom need not call the model, and every click must not become a long-term preference. Meaningful selections reaching the next sentence already provide substantial continuity.

Returning today to yesterday's chat should still show yesterday's discussed arrangement. If the user wants to adopt it again, recheck affected classrooms, forecasts, reservations, or other changed conditions. Trustworthy history and changeable present facts can coexist.

## 8. Where OpenUI belongs

The source described a component catalog and props made available to a model, whose interface description is rendered as interactive content. It noted an option to retain existing chat and integrate the assistant-message rendering layer, including custom components. Treat that as a dated integration observation and inspect the actual chosen version.

The intended responsibility split is: the assistant understands when a presentation is useful; OpenUI expresses that choice through bounded UI; the existing map engine handles accurate continuous movement; the host runtime owns facts and actions. The model can express “show the return,” “emphasize this building,” or “compare these dates.” It need not invent precise roads, frame-by-frame cameras, or reservation execution.

The original inspection found that custom actions did not automatically wait for a host animation. Merely queuing “fly to A,” “reveal route,” and “fly to B” therefore did not guarantee visual sequencing. Preserve the design remedy: express explaining the journey as one spatial intention, orchestrated by the map within real camera ownership, including interruption, redirection, and user takeover. Verify the current action contract rather than asserting this old behavior remains unchanged.

Message context alone also does not implement recovery. The host must connect historical snapshots, map-instance continuity, and any eventual cross-device state. OpenUI must not become an excuse to replace real state with a screenshot or a disconnected fake frontend state.

## 9. A concrete future commission with room for judgment

The related full commission preserves the research and aesthetic reasoning; inline maps, return routes, temporary stops, touch takeover, and reference continuity; placement, focus, return, and quiet preparation; the weather, calendar, grade, reservation, activity, note, and phone ideas; relevant source responsibilities; and the camera, streaming, action, and recovery concerns.

Its proposed first implementation outcome was a complete inline-map workflow plus one meaningful cross-domain continuation. An example was selecting a day in a real daily forecast and saying “That afternoon, then,” with the assistant understanding the selected date and connecting it to the existing local calendar under the actual authority rules. That would show both map quality and a foundation other domains can grow through. It remains a development goal, not a claim that it has been completed.

Component boundaries, focused layout, and the duration of individual camera movements require design judgment in the real rendering and interaction. The experience worth refining is natural and specific: the user selects a place, says “Here, then,” and the assistant and the interface share the reference, with subsequent actions still governed by real permission and receipts.
