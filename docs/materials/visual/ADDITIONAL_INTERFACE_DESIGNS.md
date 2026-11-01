# Additional interface design studies

These design studies preserve relationships needed in Anima: a trial beside the saved arrangement, a source beside the same unfinished thought, a setting that can be inspected before adoption, and a small recovery action beside the operation that failed. The briefs and static observations establish design intent; they do not establish current implementation, persistence, scientific correctness, animation or device behavior.

The examples below are synthetic. Live text, formulas, dates, source excerpts, permissions, controls and receipts must come from their actual owners. The implementation directions describe intended behavior; they do not turn earlier observations into completed features. Complete related briefs are linked at their sections.

Read the [visual specification](../../../FRONTEND_DESIGN.md), [product contract](../../PRODUCT_CONTRACT.md), [presence system](../../design/PRESENCE_SYSTEM.md) and [art direction and decisions](art-direction-and-decisions.md) first. Then read the relevant study below and its linked complete brief. The [development roadmap](../../DEVELOPMENT_ROADMAP.md) records the stages and their dependencies.

<a id="agenda-trial"></a>

## AID01 · Try a different time without losing the original arrangement

The scheduling study gives approximately two thirds of a wide work surface to one readable vertical day and one third to a calm attached editing sheet. The day carries fixed classes in pale mist blue and the personally movable work in restrained gold. Keep the fixed occupation visibly still while the trial moves. An unobtrusive three-date landing strip changes the trial's day without creating a different event.

A concrete example is a 90-minute report session originally at 16:00–17:30, tried at 17:30–19:00 while dinner remains protected at 18:00–19:00. A dashed original-position outline and a raised trial block show what moved; the actual overlap is the 18:00–19:00 interval, rather than a warning attached to the whole day. The editing sheet keeps original and proposed times, editable local date/time and the complete 90-minute duration together. Two alternatives—16:30–18:00 and 19:00–20:30—are quiet paper choices with an understandable reason. Adopt this time, Put it back and Think it through together perform different operations. Showing an alternative does not save it.

The narrow counterpart preserves the same comparison and full object title. It stacks the actual day and an attached lower sheet rather than shrinking a wide editor until tick labels and actions become unreadable. A cross-day example moves Friday's 16:00–17:30 session to Saturday at the same time. Original date, trial date and duration remain visible together. Previous day / This day / Next day labels must derive consistently from one declared date; generated weekday or date labels are never authoritative.

The third relationship is a stale trial. Suppose the saved event changes elsewhere to Saturday 17:00–18:30 while the open trial still proposes 16:00–17:30. Keep both the person's trial and the current saved arrangement visible. A short factual sentence can say, “This arrangement changed. Your trial is still here.” View the current version and Cancel remain usable; adoption against the old revision is unavailable. Viewing the new arrangement does not silently replace the trial or grant approval to a different one.

**Implementation direction.** Carry one stable calendar identity and expected revision through drag, date entry, alternative selection and discussion. Trial placement has no business write. Adoption checks current permissions and conflicts, returns the real owner's receipt and then offers appropriate undo. Cancel restores the saved placement, question, focus and draft. An unknown commit result is resolved through its existing attempt before another action is sent. Preparation, cleanup, travel and rest remain part of occupied time where applicable; an unknown end stays unknown, and unchosen hours are not declared free. The complete [selected-window alternatives](prompt-collections/shared-life-and-creation.md#t12), [daily-rhythm alternatives](prompt-collections/shared-life-and-creation.md#t18), [two possible changes](prompt-collections/shared-life-and-creation.md#t20) and [saved-portion continuation](prompt-collections/shared-life-and-creation.md#t21) preserve the complementary planning designs.

**Development work.** Stage 05 develops the real trial/commit/revision relationship; stage 08 carries partial adoption into shared work. First read the contract's “Time and ongoing help,” this study and the four complete planning requests. Finish a usable wide/narrow trial with protected occupation, cross-day editing, stale revision, cancel and owner-backed undo. Stop with the same event/trial identity, current revision, last receipt and one next conflict to resolve; do not mark a merely painted overlap as a scheduling result.

<a id="persona-writing"></a>

## AID02 · Write the relationship, inspect an import, and keep the draft

The focused personality editor makes the person's writing the main subject. A compact row contains the companion's name and how she should address the person. Beneath it, one generous “How would you like us to get along?” field holds editable prose, followed by one clear Save agreements action. Speaking and stories and Examples remain collapsed until asked for. Character starting point and earlier agreements is a separate small disclosure after the writing area; presets, import, export and history belong there rather than in a permanent button row. Appearance choices remain on their own surface.

This simpler default is distinct from the expanded writing-left/example-right study. The latter keeps a modest scenario preview beside the main editor when it is useful to hear the wording. The example is editable demonstration content, not a real reply or a diagnosis of the person's current emotion. A response should follow the particular situation and character's judgment; a stock comforting sentence must not become a product router. A rigorous explanation request can receive rigorous work even when the person is tired.

<a id="persona-import"></a>

### Review an editable character proposal before putting it into the draft

An import review is a restrained paper sheet over the same writing surface, roughly a comfortable letter-reading width. It contains the proposed character identity, a small Adjust this setting action, editable self-reference and user-address fields, and a clearly chosen Keep our existing form of address option. Identity inspired by a fictional character remains distinct from the person's biography and the project's original interpretation.

The body presents interaction style and speaking style as readable excerpts. A scenario selector and short sample response let the person inspect the voice without running a business action. The footer says the setting is not active yet. Put into editing draft and Keep the current setting are separate choices. Closing the sheet restores the underlying caret and text; placing a proposal into the draft is not the final save.

**Implementation direction.** Imported character cards supply editable text only. No embedded macro, script, command or claim such as “I checked it” obtains execution authority. Keep the current name/address agreement unless the person explicitly changes it. A new image cannot silently replace personality, and old messages retain the author who spoke then. Any import failure preserves the original editor and the candidate text that was lawfully available.

<a id="persona-conflict"></a>

### Compare a competing saved version without dimming the person's words

The conflict study leaves the same draft, caret, companion name and agreed address in place. A small folded-paper bookmark opens immediately below the writing field, showing “This was also edited elsewhere.” The currently saved words are read-only in an inset that can be collapsed. The person's draft stays fully legible; differences are conveyed by placement and paper edges rather than red/green diff colors or strike-through.

Replace the saved version with this draft and Keep editing are precise alternatives. The usual final save remains unavailable while the competing saved state is unresolved; Cancel remains possible. Reading the inset does not merge it, replace the draft or change the address. The preview on the right retains its own example role throughout.

**Implementation direction.** Resolve against the real persona owner's current revision. “Replace” is an explicit revision-bound write after review, not unconditional overwrite. Another competing update keeps the new draft and reopens the factual comparison. Keep editing retains the local text; cancelling an unsaved change restores the active agreement without erasing an independently saved history. If the save result is unknown, inspect the existing attempt before retrying.

**Development work.** Stage 01 develops persona meaning, ownership and editable agreements; stage 06 polishes the actual settings experience. Read this whole study, the contract's “Character and memory,” the current [character passports](../../characters/README.md) and the presence system's “Persona, relationship and private history.” Deliver default, import review, draft adoption, actual save, conflicting save, failure and cancellation on one editor. Record the active agreement, local draft, current revision and unresolved choice separately.

<a id="appearance"></a>

## AID03 · Choose a companion and light in the same complete room

Three appearance studies solve different information-density questions and should remain available for comparison.

**Room above a filmstrip.** The room occupies almost the full content width beneath the ordinary settings tabs. The complete window, desk, bench and supported character remain the main object. A thin, single-row filmstrip holds ten compact independent portraits with short names and a delicate active ring. Four tactile light choices sit on one quiet line below; secondary custom-image and display actions appear on demand. This study shows a changed, uncommitted preview: Cancel and Adopt appear together immediately above the room, rather than a permanently disabled save row. It is useful when comparing several cast members directly is the current purpose.

**Quiet rows beside the room.** A narrow left column exposes Companion, Light and a single atmosphere relation; a large uninterrupted complete-room preview occupies the right. Companion opens an on-demand chooser containing the ten identities and custom-image options. The chooser is closed in the clean saved state, so a permanent portrait grid does not compete with the room. No save actions need to occupy the unchanged default state.

**Two rows with one atmosphere choice.** The quieter continuation keeps only Companion—with current portrait/name and one chevron—and Light—with the current concise value and one chevron. Manual themes and an automatic atmosphere mode live behind the Light entry, so swatches and a second weather toggle do not repeat the same concept on the default page. The night counterpart keeps precisely the same geometry while coordinating warm charcoal/taupe paper, warm ivory text, amber practical lamps and a cool night window. Day retains warm ivory surfaces and natural daylight. Both are whole environments, with no mechanical half-day/half-night split.

A related full-size preview study separates three subjects: how the companion looks, the proposed relationship/personality, and the person's existing editable agreement. Its ten portrait choices and four theme previews are useful comparison material, but they are not reasons to combine these subjects into one adoption button. An appearance preview must not overwrite the other two.

That comparison study uses two rows of five independent youthful portraits beside a generous empty-room preview, four themes below, and a short natural response sample. The sample can help judge an interaction style without freezing a full-body activity into settings. Choosing an image, choosing that character's interaction style, retaining an existing agreement and editing that agreement remain separate decisions. Preview, Adopt and Not now are explicit alternatives; the complete current passports govern identity details.

**Implementation direction.** Choose the layout according to the current activity; do not stack all three alternatives into one page. Preview retains the active appearance until adoption, Cancel restores it, and failed persistence leaves a recoverable preview. If an existing control commits immediately, state and observe that real behavior rather than pretending it is an uncommitted preview. Choosing an atmosphere is an appearance preference, not a weather observation or permission to obtain device location. Any future externally informed mode needs an explicitly configured source, freshness and an honest unavailable state; manual choices remain usable. All themes preserve the same draft, focus, controls and chosen character. The [visual specification's theme rules](../../../FRONTEND_DESIGN.md#themes-and-participation) provide the complete shared palette and light-field discipline.

Activity, pose, reasoning and listening are not a permanent appearance toolbar. The character's behavior should come from the exchange. Favorite/import/custom-image/reduced-motion actions can be reached when needed without making the default page a director's console. Use reviewed independent portraits; a distant room head is not an avatar source.

**Development work.** Stage 06 compares these layouts at actual English lengths and wide/narrow sizes after stage 01 has separated appearance and persona owners. Begin with this study, the visual specification and [character coverage](../../design/CHARACTER_COVERAGE.md). Deliver one coherent chosen default, its open chooser, changed preview, adoption/cancel/failure and full-scene theme behavior. Preserve the other useful layouts as studies rather than claiming all are current UI.

<a id="shared-reading"></a>

## AID04 · A source page, a movable book and a comparison desk

### Focused reading has a stable adjustable relationship

The focused reader gives a large actual PDF page the main left area and a smaller conversation/draft area the right, joined by a narrow draggable divider. Page controls stay attached to the page. The composer belongs to that same conversation; enlarging the source changes the available work area without constructing another input. Use legal placement slots where they keep reading and content clear, rather than allowing an apparently free drag to produce an unreachable window.

The focused composition gives the source roughly 62–64% of its reference width and almost the full usable height below navigation, with a small writer lower-right and room still visible upper-right. A subtle header grip, slim divider handle and compact page/zoom controls keep the page usable; these proportions describe a study rather than a universal split. Resizing retains the page, zoom, selection, question, draft and caret. Narrow layouts can give one object the width it needs and a direct route back to the other. An actual PDF's white page pixels remain their original pixels in night mode; the surrounding reader chrome, conversation and composer can use warm smoked-tea material. A room theme must not recolor source ink or make a page look like a reconstructed facsimile.

### Pick up, place and return the same document

The transfer studies preserve the pickup address visibly while carrying a small same-file object. A clear landing location appears beside the relevant sentence or within the current writer. The complete page remains available; the draft is not cleared or sent by the drag. A vacant pickup slot, compact source chip and local trial placement communicate the transfer without a long dashed route across the room.

The full transfer has five beats: open the same material; lift its small cover/selection while leaving a recognizable origin; preview at a limited receiver beside the existing writer or study paper; return or correct an invalid drop through Cancel/Escape; then continue the same passage. Reversing direction begins at the current position immediately, without waiting for an old animation. Drop is a trial when adoption is required. Put it back or Escape returns to the original source header using its stable identity and version. It must not follow an arbitrary line into the background, guess a position by matching words, or turn a pictured laptop into a second whole-product shell. Reopening returns to the same document/page; a second visual cover does not create another owner.

### An attachment tray and a comparison desk are different from the focused reader

The tray studies include a single pending item, reordered items, an opened source and a multi-document comparison. A cover can be moved within the pending attachment order while the current question remains editable. A repeated cover click brings the same existing reading frame forward. Closing that frame returns to the cover and draft. Removing an item from the writer removes that pending attachment only; it does not delete its source, the saved note or a business object.

The small-object family gives each PDF a distinguishable booklet cover with a fine spine and restrained motif; an image uses its real aspect-ratio thumbnail. One item keeps its small footprint rather than stretching across the writer. Short labels derive from existing native names, with full names available accessibly, not from a model naming pass. During reorder the lifted object leaves its slot, nearby items make an insertion gap, and Cancel or interrupted focus restores the original order. Keyboard reordering preserves the same result.

The comparison desk has two offset readable papers and a visual reference, with room for their deliberate relation and the persistent tray/draft. Each frame's position, size and layer are local presentation state. Its page, zoom and selection belong to the particular source view. Pending attachment order is a third relationship. Do not collapse these into one state value or force the comparison into the focused reader's split.

Preserve the A/B roles, original versions, both stopping points, current question and local placement as a comparison group. Returning restores the relationship, not merely two independently reopened files. A scene illustration can be a visual reference in that group without becoming route geometry or a real place observation.

A single small companion form may belong to a particular reading-frame identity and an along-edge position. It follows that frame when moved, immediately yields to a grab, and keeps clear of close/resize controls, text, speech and focus. Reuse the same complete horizontal cat for a vertical edge by rotating its registered body, tail and contact geometry together by 90 degrees. Keep its paws aligned with the visible edge. Different-time closeups do not imply several simultaneous companions.

### A shared spread keeps the evidence and the connection distinct

An alternate composition places two source excerpts in an unboxed column on the left of one shared paper, while the companion's connecting explanation occupies the right. Generous space separates the columns; ordinary prose continues above and below the spread. The two excerpts retain their own page addresses. The connecting claim is an interpretation that can be corrected or removed, rather than a new merged source.

For example, compare the remaining choices in Ax = 0 with the constants in y″ + y = 0. The first statement depends on rank and the declared field; the second depends on the equation and applicable domain. A common word such as “freedom” does not erase these conditions. Removing one premise withdraws its dependent bridge and graph explanation without deleting an independent source or the person's writing.

**Implementation direction.** Source addresses carry original owner, stable ID, revision/hash, exact page/region or Unicode span and current permission. Selection, preview, inclusion in the draft and sending remain separate. Use actual PDF text/pixels and lawful original material; a design sample proves neither import nor reading. A companion can point to the same line and accept correction, following [G1 · Shared pointing and correction](../../design/PRESENCE_SYSTEM.md#g1--shared-pointing-and-correction). Marked contact studies are production evidence, not clean character layers.

**Development work.** Stages 01/04 establish common-object and comparison identity; stage 08 develops focused reading, the comparison desk and precise transfer. Read this study, the contract's “One conversation, real things,” G1 and G3 in the presence system, then [the original problem/attempt/hint request](prompt-collections/reading-study-and-piano.md#v142). Finish source-open, resize, reorder, frame-close, remove-pending, drop/adopt/cancel and full comparison return with one retained draft. Stop with both source revisions, their relationship, current selections/view positions and the same unfinished question.

<a id="conversation"></a>

## AID05 · One conversation through nine ordinary moments

This sequence studies a full-room conversation with small author labels and continuous prose. The room fills the application; it is not nested inside a pictured laptop or another floating app. A quiet top navigation and one left-aligned composer keep their anchors across the sequence. In the wide reference, useful text occupies the left two thirds and the right third remains inhabited room. A local reading support appears only behind actual text, with dissolving edges and solid readable glyphs. Empty conversation does not need an empty whiteboard.

The historical wide ruler used a 1536×1024 canvas, a 72px top bar, a roughly 930px composer ending 72px above the bottom edge, and about 22px body type with 35px line height. These are study relationships, not universal runtime constants. Fit real English, enlargement and the current visual ruler. Attachments and quote rows can grow upward from the same wide composer edge; a narrow writer may instead grow downward from a stable top where that relationship is intentionally chosen. Preserve one composer identity in either layout.

Use a synthetic two-source question: “Both passages use ‘degrees of freedom.’ Are they talking about the same thing?” The compact book covers and nearby page links identify actual source objects. Their small appearance is not permission to hide source names from accessible labels or details. Real page labels come from the real document; do not transplant a sample page number.

1. **Empty conversation.** The room, navigation and one usable input are sufficient. There is no attachment, history, selection or current generation. No suggestion grid, progress panel or compulsory task fills the space.
2. **Two sources before send.** Two compact upright book objects live inside the same writer above the question and insertion caret. Hover/focus may reveal an item's remove action; every item need not wear a permanent delete badge. Removal preserves the question. No response exists yet.
3. **Response in progress.** The sent question and its two sources move into their historical message once. A real partial reply appears beneath the companion's author label. The person can already type a different new draft, such as “I want to understand the second passage first.” The one primary control is Stop for that active answer; there is no simultaneous resend control. Any stated progress reflects actual work rather than a scripted claim.
4. **A short answer.** A compact explanation can say that the examples count choices left after constraints, then state n − rank(A) and the two constants of the differential equation with their respective source links. No graph or contextual Ask this action is required when none is relevant or selected. The remaining space can breathe.
5. **A longer answer with a live object.** The same explanation can grow into y = a cos x + b sin x, with two modest coefficient controls embedded in the reading flow. For a = 1 and b = 0.5, the illustrative values at 0, π/2, π, 3π/2 and 2π are 1, 0.5, −1, −0.5 and 1. These values must be computed by the live object when implemented. The graph is a shared piece of reasoning, not a disconnected plotting dashboard.
6. **Ask about one selected phrase.** Selecting only “how much can still be chosen independently” reveals one local Ask this action. That explicit action puts one removable quote reference into the same writer beside the new question. It does not send, remember or approve anything. Removing the quote removes the reference, not the current prose draft or original answer.
7. **Stop safely.** The already written partial answer remains, with a small truthful stopped indicator if needed. The new unsent draft, caret and original sent sources survive unchanged. A cancelled operation cannot later append an unrequested graph or completed answer. Returning the control to its appropriate send state does not turn the partial answer into a completed investigation.
8. **Return from a source.** Close the reader or follow Back to the original paragraph, scroll position and question. A short-lived underline can indicate the returned line without adding a recovery card. The quote chip, new draft and graph's current coefficients remain. The old contextual menu need not remain open.
9. **Narrow continuation.** A two-row compact header, normal reading-size formulas and a single writer preserve the selected paragraph and nearby sources. Earlier messages may be above the scroll position; do not duplicate them merely to fill the narrow frame. Reflow prose and allow an intentionally scrollable long formula rather than shrinking every glyph. The composer remains reachable above the keyboard and retains the quote and caret.

Day and night counterparts keep the same object relationships. Day uses dark warm ink on a subtle warm-ivory support; night uses warm ivory on smoked-tea surfaces with the room's practical light. This is coherent appearance, not evidence of current outdoor weather.

<a id="narrow-continuation"></a>

### A narrow source, thought and writer can grow naturally

A complementary narrow Keeping relationship has one original reader above one independent thought, then the same optional writer. The thought starts below the source and stays there when a file is added. Inside the writer, a compact source/draft-status line precedes a pending-cover row and the form. Two or three actual covers share a row while space permits, then wrap downward. Saved-object entrances belong below this writing group, distinct from pending attachments. Ordinary vertical scrolling can continue below the viewport; do not hide a file, compress the source, move the thought upward or create a second writer just to force everything into the initial frame.

This relationship uses an independent small portrait and at most one properly supported small companion form to yield space. A source file with no supplied title receives its actual native metadata later; the concept does not license an invented filename or a fictional page thumbnail. The active source/reader remains owned by its real object, while any decorative ambient crop has no reader hotspots or transfer geometry. This continuation preserves the useful relationship, not an earlier unaccepted camera, giant companion or generated source page.

**Implementation direction.** The graph keeps a program identity/version, persisted local inputs and the exact input snapshot sent to the model. A reply arriving after the person changes a coefficient must not reset the newer live value. The next model turn reads the actual applicable input rather than inferring it from a screenshot. Corrections to source, selected line or permission invalidate only dependent material. Cancellation, unknown delivery, loss of a source and a deliberate short answer have different meanings.

**Development work.** Stages 01/04/08 develop common attention and continuation; stage 09 rebuilds the general live-creation system. Read this nine-moment sequence, the shared-reading study, the complete [long-conversation request](prompt-collections/reading-study-and-piano.md#v234) and [phase-shifted wave request](prompt-collections/reading-study-and-piano.md#t28). Deliver a continuous real exchange through send, new drafting, source return, exact selection, cancellation, live input and reopening. Record the original conversation/work/program versions and current input/draft when stopping; a set of static frames does not finish the sequence.

<a id="study-transfer"></a>

## AID06 · Offer one hint, carry one excerpt, preserve independent writing

A folded hint note sits next to the learner's actual current line, not over the next equation. The two-paper study gives the original PDF roughly 56% and the learner's derivation 44%, preserving broad readable equations and a modest companion presence outside them. The folded note conceals its contents. Only a short “A hint for this line” label and four grounded actions are visible: Take it, Make it smaller, Keep it and Put it down.

Use y′ + 2y = e^x and the learner's existing line μ(x) = e^(2x) as a synthetic example. Those are the problem and reported attempt, not an invitation to show a whole solution behind an allegedly concealed hint. Taking the hint reveals only its chosen depth. A smaller hint changes that depth without covertly adding later steps. Keeping the offered hint preserves its relation to this attempt; dismissing it leaves the original work untouched. Seeing help does not record mastery.

The bookmark tray is a separate transfer design. A highlighted excerpt is picked up from an actual PDF page into a light shallow rail between the two papers. Study paper, Note and Conversation are three possible destinations. Choosing one shows a compact cancellable trial beside the relevant work, with Accept and Put back. The source excerpt need not be repeated as full body text in every tray, preview and destination. One semantic address can have several views without becoming several independent facts. The existing chat draft remains untouched throughout.

The note-recovery counterpart makes the separation especially clear. When a quoted source note changes, its former quote is no longer displayed as current and new text is not silently substituted. A small source area says that the original page changed and offers Open the current original and Review again. Beneath it, the person's independent unfinished prose, equation, blank writing line and caret stay editable. Save note and Put aside remain visible. In a narrow window, the file list collapses behind a real back/list entry so the note retains its reading width.

**Implementation direction.** Preserve the exact source owner, revision, hash and span/page-region across pickup and trial placement. The destination's write is separate from choosing it, and its real receipt decides whether adoption occurred. Cancellation returns the semantic object to its original address and focus; it does not navigate by a decorative arrow. Source withdrawal changes access to the quoted material without deleting independent annotations. Reanchoring is a reviewed anchor operation, not permission to overwrite the note with old content. Long user-authored math can scroll locally at a readable scale. The complete [study request and later mathematical correction](prompt-collections/reading-study-and-piano.md#v142) and [notes history/conflict request](prompt-collections/shared-life-and-creation.md#v226) remain the detailed companion materials.

**Development work.** Stage 08 develops the complete same-problem help and semantic transfer, after stage 03 supplies source invalidation. Read this study, the shared-reading study and the two linked complete requests. Finish concealed/revealed/reduced/kept/dismissed hint states, each destination's trial/accept/put-back, stale source recovery and intact independent writing. Record the actual attempt, offered hint, source address, note draft and adopted receipt separately.

<a id="welcome-and-keep"></a>

## AID07 · A welcome that can return, and a Keeping space that can be empty

The open-room welcome relationship combines an unboxed greeting, one warm writing surface and a quiet bookmark immediately below it. The bookmark returns to an actual prior object; it is not an invented recap or a demand to resume unfinished work. Choosing the complete cover remains different from Back, Resume or a bookmark. A response arriving in the background does not pull the person away from the chosen room.

Two empty-Keep studies retain distinct compositions. One uses a small pale action group low on the left: writing is primary, Notes and Materials are secondary. The other is airier: an outlined writing pill and separate text links leave more room visible. Compare the alternatives at actual content and window sizes; combining them into a row of duplicated actions loses their purpose. The displayed empty view need not mean all history is absent: earlier notebooks, original materials and search remain reachable. Write a page, Browse notes and Open materials are sufficient entrances; they do not require an additional empty-state toolbar. Empty does not mean a category dashboard, a progress debt or a room that needs filler.

**Implementation direction.** Start writing opens a real draft under its original owner. Back, Put aside and reopening recover that draft rather than creating another empty note. Notes, materials, conversations and works remain projections from their owners, not a second body-text collection. A lawful deleted item can be restored through its own trash/history semantics; a revoked source is not revived by an empty-state shortcut. Use the complete [notes history/trash/conflict study](prompt-collections/shared-life-and-creation.md#v226) and [empty/failed/unsaved/stopped study](prompt-collections/shared-life-and-creation.md#v236) for their distinct states.

**Development work.** Stages 04/06 develop the return and Keeping experience. First read the contract's “One conversation, real things,” this study and the linked complete requests. Deliver an actual cover/return distinction, an empty writing entry and same-draft return with no compulsory task. Stop with the work address, draft owner and intended next destination rather than inventing a welcome summary.

<a id="anchor-transfer"></a>

## AID08 · Preview a place that has real support

The position-change study highlights actual target furniture in the same room and previews a pose built for that surface. A bench-to-desk-chair change is a change of support, depth, orientation and occlusion, not a horizontal translation of one figure. The person can inspect the target before Adopt, or Cancel back to the original location and state. A small destination pill belongs over the actual cushion with a restrained target, while the post-drop strip contains only the location, Not now and Sit here. Separate comfortable 44px location choices provide click, keyboard and narrow-window alternatives. There is no ghost second body, invented furniture, business action or automatic study launch.

**Implementation direction.** The target furniture, full-body mother, seat/floor contact and foreground occlusion share the room's camera and canvas. A preview does not commit location, grant a lasting preference or change personality. Direct dragging takes over any current motion immediately; the preview follows the actual gesture and has a keyboard alternative. Cancellation restores the original pose/location and current task. Missing compatible art leaves an honest unavailable choice or appropriate declared fallback, not an unsupported floating figure. The complete production discipline lives in [Rebuild bad poses from clean space, then separate](../../../FRONTEND_DESIGN.md#rebuild-bad-poses-from-clean-space-then-separate) and the [motion pipeline](../../design/CHARACTER_MOTION_PIPELINE.md). Those methods include the whole-body/contact inspection that a two-panel drawing cannot establish.

**Development work.** Stage 06 supplies supported poses and stage 08 integrates direct user takeover. Read the two linked specifications before choosing a complete eligible scene. Finish one real source/target preview, adopt, cancel, interruption, keyboard and reduced-motion relationship. Record the exact mother/support/calibration version at the stop point; a static preview is not a completed furniture-to-furniture performance.

<a id="local-recovery"></a>

## AID09 · Let recovery stay beside the action

This study represents four different moments, not four simultaneous panels in the product. The shared intent is stable work and a small, truthful next step at the original operation. Use a restrained open amber notch and readable local text rather than a full-width alert. Only a true wait may move gently; a static failure mark must not spin to impersonate ongoing work.

| Moment | Local relationship and action | What must remain |
| --- | --- | --- |
| An attachment chooser did not open | Beside the same plus/file action: “Could not open” and Retry when a retry is actually executable. Do not guess a network cause. | The same editable draft, attachments and focus; no fake imported item. |
| A source changed | Remove the obsolete highlight. At its original bookmark/corner show “This source changed” and Return to the original. | Exact owner/version and a genuine route to compare or relocate; no first-match text search pretending to recover an anchor. |
| A connection is genuinely waiting | At the send origin show “Still connecting” and one Cancel/Stop control. | The same draft and one active attempt, no duplicate Send alongside it. |
| Delivery is unconfirmed | At that same origin show “This message is not confirmed” and Check result as the next action. | The original attempt and recoverable submitted/new drafts; inspect its outcome before resending. |
| A note did not save | At its save origin show “Not saved · Your writing is here” and Retry only while that original draft is actually retained and editable. | The note, caret, text and true owner state; no checkmark or completed-save claim from animation. |

The connection and delivery rows are consecutive possible states of one operation, not two duplicate inputs. A narrow source or note should receive its own local recovery, rather than every failure being routed into the conversation composer. Normal send remains available in normal writing; removing it from an unconfirmed state must not remove the product's send capability.

**Implementation direction.** Separate immediate input reception, factual receipt and expressive performance. A click acknowledges locally; waiting remains at the origin; Cancel or typing takes control at once; completion withdraws the temporary status without stealing focus or reopening a greeting. Keyboard access reaches the action and returns to the original control. Reduced motion preserves the same information and recovery. An unknown outcome is a lookup problem before it is a retry problem. The complete [empty/failed/unsaved/stopped request](prompt-collections/shared-life-and-creation.md#v236) additionally preserves search-no-match, recoverable open failure and close-with-draft choices; this study adds the exact local placement and unknown-send distinction.

**Development work.** Stages 01/05/08 develop operation ownership and recovery; stage 12 follows the whole experience. Read this table, the product contract's action semantics and V236. Finish each actual origin with only its relevant state/action, retained drafts, cancellation, source invalidation and keyboard/reduced-motion behavior. Save the last attempt/receipt and what is actually retained when stopping. No global “everything went wrong” board is the intended result.

<a id="physical-paper"></a>

## AID10 · A continuous paper where a change can be seen, touched and heard

The portrait physical-paper study joins three things without nested dashboards: overlaid wave curves at the top, a generously readable grand-piano action through the middle, and nearby playable controls, decay trace and string model below. Warm ivory paper, warm gray ink, restrained ochre and mist blue support the relationships. A related night composition places continuous conversation on a quiet upper/left wall and the key–hammer–string work below in the same lamp-lit field. The instrument should feel related to the explanation, with force/touch controls near the keys.

On the wave, a small ring at a crest changes amplitude. A separate short phase rail changes phase, and a distinct vertical observation cursor changes time. Nearby numerical input offers an alternative to dragging; the three controls must not be mistaken for three copies of one gesture. Continue from this change carries the actual current parameters into the same conversation. Use two thin component waves and a stronger sum, recomputed from their declared definitions, rather than a decorative waveform that happens to look plausible.

The action cutaway has a horizontal key on a balance fulcrum, a wippen/jack linkage, a pivoted hammer shank with felt head below a horizontal string, a separate damper above the string and a pedal linkage. Pressing the key's front lifts its back. The jack lets the hammer escape before impact; the hammer strikes from below and rebounds instead of remaining glued to the string. The damper's key/pedal behavior is separate from hammer motion. The picture's particular mechanical geometry is a design proposal to replace with a checked causal construction.

Directly below, compact keys, touch/force, Watch slowly and Sustain let the person manipulate that same event. A decaying waveform is close enough to hear and see the effect. The formula f₁ = (1/(2L))√(T/μ) has nearby string length and tension controls; the ideal-string assumptions, linear mass density, units, valid ranges and approximation limits belong to the actual explanation. Numerical values and a pictured envelope are not measurements.

**Implementation direction.** One lawful model/voice event must drive the mechanism, actual sound, signal trace and explanation. A slow mechanism view does not silently slow the audible sound unless that is the chosen behavior. A displayed trace states its actual sampling window and source; a drawn two-second curve is not audio evidence. Keep mute, audio activation/focus, key release, sustain release, rapid repetition, hidden/reopen, direct takeover and input-device differences explicit. User changes stay in the program's real local state; send uses its recorded snapshot, and late model changes respect a newer local edit.

The complete competing studies are [V173 · One continuous instrument paper](prompt-collections/reading-study-and-piano.md#v173) and [V174 · Two papers and conversational prose](prompt-collections/reading-study-and-piano.md#v174). They preserve a readable one-octave keyboard, the two/three black-key grouping, escapement stages, a scrubbable mechanism experiment and a separate sustain experiment. Read both full bodies rather than treating this portrait study as their replacement.

**Development work.** Stage 09 rebuilds the general creation/program relationship; stage 10 develops the demanding instrument/audio experience. Read this study, V173, V174 and the roadmap's stages 09–10 after the source/version/input semantics are usable. Finish one causally connected instrument with actual controls and appropriate sound/mechanism evidence. Record current program/model parameters, voice/audio lifecycle and unresolved physical approximation at the stopping point. A beautiful cutaway or one sounding key does not finish the block.

<a id="entrustment"></a>

## AID11 · Revise one ongoing request while keeping the current agreement clear

The ongoing-request editor retains a two-column relationship: a calm list of entrusted things at left and the selected item's existing paper detail at right. Edit replaces only the scope/deadline portion inside that detail. It does not navigate to a new administrative form or lose the original conversation link.

A synthetic request might be, “If the classroom changes, help me review the route.” Scope choices can include the class schedule and campus map, with weather left unselected. The deadline has an explicit local date/time and declared timezone, or a genuinely open-ended stop condition. A modest before/after line makes an extension understandable. Save agreement and Cancel sit on the original detail grid; Pause for now, Return to that conversation and Stop watching retain their distinct meanings. Pausing keeps the agreement.

The conflict counterpart preserves the person's source checkboxes and proposed deadline at the same positions while the saved agreement changes elsewhere. Suppose the current paused agreement ends November 1 at 18:00 and the draft proposes November 3 at 18:00. The paper's title and saved context continue to describe the current agreement, not the unsubmitted draft. A quiet factual inset says, “This request changed. Your edits are still here,” followed by the actual current source scope and deadline. Continue editing from the current agreement is an explicit reconciliation action. Save is unavailable until the person reviews the new basis; Cancel remains available.

**Implementation direction.** Use the original entrustment ID, actual permission baseline and expected revision. Changing a deadline or source choice never broadens reading, model processing, notification channel or external-action authority by implication. Reconciliation must retain the draft and make the proposed changes understandable before a revision-bound save; it is not a silent last-writer-wins merge. Pause, stop, ordinary edit, permanent forgetting and cancellation propagate according to their different meanings. If saving has an unknown result, inspect that attempt; do not create duplicate requests.

Prepared material belongs to this same request with real sources, validity and usefulness. Opening or partly accepting it does not mean the watched event happened or an external notification was delivered. Without an actual running host/channel, the interface cannot promise unattended service. The complete [ongoing request and prepared-material study](prompt-collections/shared-life-and-creation.md#v220) preserves active/paused presentation and useful route preparation. The complete [message/source-permission study](prompt-collections/shared-life-and-creation.md#v222) supplies the separate read/retain/audience choices; do not fold those axes into a single checkbox.

**Development work.** Stage 03 provides source/permission propagation and stage 05 develops ongoing help, preparation and revision. Read this study, V220, V222 and the contract's “Time and ongoing help.” Finish the same selected item's edit, save/cancel, paused edit, concurrent change, reconciliation, unknown-result lookup and original-conversation return. Stop with the saved agreement, local draft, source baseline, active/paused/stopped status and next permitted action separately recorded.

<a id="production-methods"></a>

## Production lessons belong with their complete methods

Full-scene art, an extracted body, a numeric mask, a contact receiver, a coordinate crop and a browser comparison have different roles. A calibration copy may introduce a drawer patch, change an object count, clip a crown or retain shoe fringe without making the complete original defective. Keep the independently qualified original and the precise production lesson separate. Do not turn a diagnostic crop into a new interface design or a rejected body into a reference.

The complete guidance is already maintained in [Failure experience that should change future production](art-direction-and-decisions.md#failure-experience-that-should-change-future-production), [full-canvas layers and paper materials](prompt-collections/full-canvas-layers.md), [extract only after anatomy is accepted](prompt-collections/full-canvas-layers.md#p03), and the visual specification's [pose reconstruction](../../../FRONTEND_DESIGN.md#rebuild-bad-poses-from-clean-space-then-separate) and [themes](../../../FRONTEND_DESIGN.md#themes-and-participation). These sections preserve original RGB versus alpha, exact common canvas, contact/occlusion, held-object continuity, contrasting composites, room-owned props and coherent light. A matching size or a threshold value does not replace actual reconstruction and current integrated inspection.

## Choose a substantial next block and leave a real continuation

Use the roadmap's dependency order, not the order in which pictures happen to appear in a folder. Persona/common objects and source rights precede source-sensitive recovery; trial/entrustment semantics precede their polished transitions; the general program contract precedes the demanding piano. Character support work precedes furniture transfer. None of these studies requires finishing all ten characters before a useful block can end.

Begin each substantial block with the linked materials, actual current implementation/status and eligible original artwork relevant to that relationship. Build a usable object or workflow with its ordinary cancel, failure and return, then record the actual version, current owner/object/revision, draft, meaningful observations and one next task. If a source, device, model allowance or compatible asset is unavailable, keep the permitted independent work and state the exact remaining condition. Resume from those objects and current permissions; do not restore an expired approval or manufacture a completed state.

The studies preserve alternatives and unbuilt ambitions as working knowledge. [Current status](../../CURRENT_STATUS.md) remains the place for what the foundation actually implements and has actually demonstrated.
