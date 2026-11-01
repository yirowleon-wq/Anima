# Reading, study and piano requests

These complete design briefs and production notes inform stages 08–10. Read [art direction and decisions](../art-direction-and-decisions.md) first.

Find retained originals in the [kept artwork library](../../../../visual-assets/library/README.md) and [exact file index](../../../../visual-assets/library/index.json). A record does not establish that its exact former input or output is eligible or present. Resolve current files by their actual library identity; do not substitute a retired image.

## Reading boundary

The briefs below adapt recorded material; they are not necessarily the exact text submitted to a tool. Interface copy, anonymous sample places and obsolete generic cast examples have been adapted; all sample conversations, dates, grades, weather and study reports remain synthetic. Recorded selections and observations belong to their historical scope. Current passports and the product contract override outdated identity or pose assumptions. A recorded edit/extraction request also does not establish that the verified Mac new-PNG wrapper supports references, edits or masks.

## Kept originals connected to this material

These links identify the actual retained files. Each brief link follows the recorded output SHA association, not a guess from a similar filename or a later use as an input. A blank prompt record is preserved as a specific provenance gap rather than a reconstructed invocation.

| Kept original | Adapted design brief | Design work |
| --- | --- | --- |

<a id="v140"></a>

## V140 · Recorded production note

Historical production note:

Private project design reference for the message-inline StudyScene; not a runtime background, source document or learner record.

<a id="v141"></a>

## V141 · Recorded production note

Historical production note:

Generated from the user's product direction; no reference images supplied.

<a id="v142"></a>

## V142 · The original problem, personal attempt and one hint

Recorded prompt:

```text
Use case: ui-mockup
Asset type: high-fidelity desktop message-inline learning workspace design for the English personal companion app Anima.
Primary request: Design one beautiful, usable "A shared study surface" embedded in a conversation. The learner is working on ONE actual calculus exercise. The layout must make the relationship among the original question, the learner's own one-line handwritten attempt, and ONE currently requested small hint perceptible at a glance. A quiet side-by-side double-paper relationship, not a dashboard or a pile of chat bubbles. The original problem occupies a narrower paper on the left; the learner's draft is the larger working paper on the right. A small warm marginal teacher annotation belongs next to the exact written line, with a subtle pencil-like linking stroke. Spacious blank writing room below with an actual textarea-like invitation and one modest send-arrow control.
Scene/backdrop: front-facing app screenshot with a restrained warm grey conversation canvas and soft window light. Paper is near-white, faint warm edges, subtle fold/shadow, a little muted gold emphasis. This is implementable UI, not a physical notebook photograph.
Text verbatim: small heading "Make sense of this step"; source "Example handout · p. 3"; problem label "This problem"; problem "Find the indefinite integral"; clear mathematical display "∫ x cos(x²) dx"; learner label "My attempt so far"; learner's handwritten line "Let u = x², so du = 2x dx"; short teacher annotation "Treat x dx as one block. How can it be exchanged for du?"; writing placeholder "My next thought is…"; small primary action "Another hint"; unobtrusive text action "Explain it fully"; tiny source access "View original page".
Typography: excellent English typesetting, readable 15–18px equivalents, real mathematical typesetting, learner line has a restrained cursive handwritten quality but remains fully legible.
Character presence: at most a soft cropped companion silhouette at the far page margin, under 8% of total space, entirely secondary to the question and student's work; no giant avatar, no speech-balloon UI.
Constraints: show only this one small hint, no final antiderivative, no complete solution, no hidden-answer panel, no answer chips, no test score, mastery meter, progress bar, badges, ability label, hint/mode/steps metadata, status dashboard, timestamps row, tool names, engineering text, or extra sections. Current teaching stance is expressed through the content and the "Explain it fully" action, never status tags. Keep a coherent quiet paper composition with ordinary accessible controls and generous space. No background wallpaper image and no flashy gradients.
```

<a id="v143"></a>

## V143 · Recorded production note

Historical production note:

Use narrower original-question paper beside a larger learner working paper; one current small teaching annotation relates to the real learner line. Keep direct explanation available. Implement as responsive CSS and real text, not a bitmap interface.

<a id="v144"></a>

## V144 · Recorded production note

Historical production note:

Design-only proposal for explorable quadratic explanation inside existing Study paper. Runtime uses real HTML/SVG calculations and existing blank alpha paper asset, never this screenshot.

<a id="v147"></a>

## V147 · An explicitly illustrative quadratic example

Recorded prompt:

```text
Edit the referenced Anima study-paper design into a faithful, implementable desktop UI proposal for an explorable explanation INSIDE THE SAME STUDY PAPER, not a separate app or dashboard. Preserve the warm gray window light, quiet gold accents, authentic cotton paper grain, narrow left original-question paper, larger right working paper, and only one actual writing composer on the right paper. Existing selected companion can be a very small blue-haired girl cutout at the far right paper edge; she does not obscure mathematics.

Use real, legible English and mathematically consistent content. Left narrow paper: source heading calculus-practice.md, quiet View original text, This problem, original integral ∫ x cos(x²) dx. Never change this original problem into the graph example. Right heading Make sense of this step, quiet bookmark Put aside for now. Two authentic learner-reported handwritten lines under My attempt so far: u=x², du=2x dx; next line x dx=½du. These remain in place. After them one short current authored explanation: Use a small quadratic example to distinguish two readings at the same point. Its height gives the function value; the tangent gives the local rate of change. This is an explicitly illustrative example, not the original integral secretly changed.

Below that explanation embed a real coherent pencil/SVG-style coordinate graph of f(x)=a x². The graph lives directly on the paper, about 220 CSS px high, NOT in a rounded card. The current temporary choice is a=2, x=1. Display this in one natural sentence above the graph with only the two numbers delicately gold-underlined as editable text: Try a = 2 and observe at x = 1. The dark graphite current parabola is y=2x². A very quiet thin dashed gray original curve y=x² appears only as context, labelled Original condition a=1 in tiny writing near its curve. Do not give it a competing legend or readout. Coordinate axes with restrained labels: x from -2 to 2, y from -1 to 8. One warm gold point at (1,2). A thin vertical graphite dashed guide from (1,0) to (1,2) makes the actual height legible. A short warm gold tangent passing through (1,2), slope 4; draw it correctly, e.g. from (.65,.6) to (1.35,3.4). A tiny point/handle on the x axis lets the reader drag x, no big control bars.

Immediately below the graph one ordinary linked-reading sentence, not tiles: The value at this point is 2, and the tangent slope is 4.The tangent rises to the right. The values and graph are linked, but do not animate a static image or present a performance score. A very quiet text action Ask about this change can attach this temporary hypothesis to the one composer. The author has provided an understandable explanation first; this is not a blank sandbox or an exam.

At bottom of the right paper retain ONE true writing area with natural handwritten placeholder My next thought is… and the existing small attachment/control icons plus a single gold send arrow. There is no second global chat composer. No mode badges, progress bars, mastery labels, engineering fields, charts dashboard, slider panel, lesson navigation, duplicate answers, fake PDF URL, or giant avatar. Keep the plotted point and tangent mathematically exact. Show the full pair of papers at comfortable desktop reading scale; it is fine for paper to extend vertically, but the graph, the two learner lines, explanation and one writing input must form one coherent working surface.
```

<a id="v148"></a>

## V148 · Recorded production note

Historical production note:

Illustrative math and synthetic study content; no student personal facts or mastery claim.

<a id="v149"></a>

## V149 · Recorded production note

Historical production note:

Generated plot is design guidance only. Runtime point, curve, tangent and numbers must come from the same finite quadratic calculation.

<a id="v150"></a>

## V150 · Recorded production note

Historical production note:

Keep original question, learner reports, assistant explanation and temporary user-selected conditions distinct.

<a id="v151"></a>

## V151 · Recorded production note

Historical production note:

Do not change selected companion/presence preference to match the illustrative character.

<a id="v153"></a>

## V153 · Recorded production note

Historical production note:

Standalone first real quadratic example; original source and learner report now correspond to the function graph. Design only, not a runtime screenshot or mathematical authority.

<a id="v154"></a>

## V154 · Correcting the first task so source and graph agree

Recorded prompt:

```text
Revise the referenced explorable-study UI design to match the honest standalone first learning task chosen for implementation. Preserve its same warm cotton study papers, quiet window light, gold-underlined numbers embedded in the explanation, one accurate linked function graph, one actual composer, and unobtrusive companion at the far page edge.

IMPORTANT: the left original problem must now genuinely correspond to the graph, not the unrelated integral. Change its source heading to function-and-rate.md. Under This problem use: How do the function value and its local rate of change differ? Then the large original formula f(x)=x². Add small actual source wording: Look near x=1. Do not show any integral anywhere.

Right page heading: One point, two readings. Under My attempt so far show ONE learner-reported handwritten line: x=1 gives f(1)=1. Do NOT pretend computed slope is a learner's own result. The current readable teacher explanation is: The point’s height gives the function value; the tangent’s slope gives the local rate of change. Read them at the same x, then adjust a or move x slightly. Do not call x time or rate speed/velocity.

Keep the inline adjustable sentence Try a = 2 and observe at x = 1. with a=2 and x=1 subtly gold-underlined as editable text. Current curve is exactly y=2x², quiet original dashed curve y=x², main true point (1,2), height guide from (1,0) to (1,2). Make the x-axis foot point a tiny quiet gray mark, secondary to the actual gold point (1,2). Tangent must be a STRAIGHT LINE of slope 4 through (1,2), for example endpoints (.65,.6) and (1.35,3.4), never a curved gold annotation. Axes x=-2..2 and y=-1..8. Do not create two competing sets of readouts. One natural sentence below reads: The value at this point is 2, and the tangent slope is 4.The tangent rises to the right. Quiet action Ask about this change, and only one writing composer.

This is a focused finite quadratic explanation, not a general simulator or dashboard. Preserve open paper space, meaningful formula size, controlled handwriting/book typography and real readable relationships; no mode badges, mastery/progress, category chips, hidden answers or large slider panel.
```

<a id="v156"></a>

## V156 · Recorded production note

Historical production note:

Only the literal learner report x=1 gives f(1)=1 belongs under learner attempts; model-computed slope remains an assistant calculation.

<a id="v157"></a>

## V157 · Recorded production note

Historical production note:

Runtime tangent is a true straight line from the finite closed-form derivative, independent of the drawing.

<a id="v158"></a>

## V158 · Recorded production note

Historical production note:

The selected companion remains the real existing profile choice.

<a id="v170"></a>

## V170 · Recorded production note

Historical production note:

B keeps ordinary explanation interleaved with two related papers in one conversation. Adopt composition, warm ivory, restrained gold, typography and spacing, using live SVG/HTML and shared local state. Neither image is a runtime background.

<a id="v171"></a>

## V171 · Recorded production note

Historical production note:

Generated key counts/grouping and action geometry are imperfect. Mechanical causality and exactly eight white/five black keys must follow actual implementation and source review, not generated pixels.

<a id="v172"></a>

## V172 · Recorded production note

Historical production note:

Local design reference only; no public redistribution claim or application bundle inclusion.

<a id="v173"></a>

## V173 · Piano direction A: one continuous instrument paper

Recorded prompt:

```text
Use case: ui-mockup. Make a new high-fidelity desktop conversation UI design for the English companion app Anima, using the supplied app image only as the reference for its restrained warm ivory, soft window light, quiet gold, English typography, generous content spacing, simple top navigation and small anime avatar. This is a design study, not a screenshot of a functioning app. Do not copy its two-column PDF layout. Create an integrated, editorially beautiful interactive explanation of how a GRAND PIANO makes and stops a sound, within an ordinary conversation. 1536x1024 landscape composition. Keep the actual app chrome: small door logo and Anima upper left, subtle Chat / Today / Keep pill centered, tiny companion avatar upper right; a compact conversational composer at the bottom. No large character covers the learning content. No developer labels or dashboard badges.
Design direction A: one continuous warm paper as an instrument, NOT a black/blue technical dashboard, no boxes inside boxes. At the top of the conversation show a small avatar with the name Sakiko, then one friendly short line 'Press gently, then release.'. Below is an ample softly textured off-white paper with the quiet serif heading 'How one key can hold a sound'. The main content is a beautiful, precise, readable vector-like side cutaway mechanism occupying most of the paper width: horizontal ivory key acting on a fulcrum, warm wooden wippen and jack, angled wooden hammer shank with rounded felt hammer head rising toward a horizontal string above, a separate felt damper resting above the string, and a bridge/soundboard at the right. Keep the lever connections and labels readable, mechanical details simplified clearly, not fantastical. Show the hammer detached and in flight just before striking, with one delicate gold motion arc; string mist-blue/slate line, damper charcoal, wood honey gold. Small nearby English labels 'Key', 'Jack', 'Hammer', 'String', 'Damper', 'Bridge' with fine restrained leader lines. No dense Cartesian graph grid.
Immediately beneath this cutaway, on the SAME paper, place a playable-looking full C4 to C5 one-octave piano keyboard: eight ivory white keys, five matte charcoal black keys grouped correctly in two and three. The pressed C4 has a subtle gold edge and soft depressed depth. Keep the keyboard physically close to the mechanism so they feel causally related, not another disconnected card. Beside the keys, a small frequency reading 'C4 · 261.6 Hz', and a small restrained waveform trace. Beneath, a single slim control row with a 'Touch' gold slider, a 'Watch slowly' play control, a compact 'Sustain' switch, and a quiet reset icon; a subtle speaker icon enables sound. At the active mechanism position place one short margin note 'The hammer has left the jack and is moving freely toward the string.' in normal readable text, without a large status panel. Include a discreet four-stop process line 'Press · Escape · Strike · Rebound', current stage highlighted naturally, no big progress percentage.
After the paper, the conversation continues with one short readable paragraph about releasing the key with the pedal off versus on; include the formula f₁ = (1/2L) √(T/μ) in elegant mathematical typography. The design must feel welcoming, calm, beautiful, intellectually serious, and genuinely touchable. Preserve clear text contrast, no text over the mechanism, no huge English headline, no extra permanent help banners, no boilerplate disclaimers, no AI implementation details. Show a realistic amount of content at usable desktop size, not an empty decorative hero. The cutaway and keys should be the visual focus, with the app identity felt through materials and spacing.
```

<a id="v174"></a>

## V174 · Piano direction B: two papers and conversational prose

Recorded prompt:

```text
Use case: ui-mockup. Create a second substantially different, implementable design study for the English desktop companion app Anima. Use the attached app image as the style reference: warm ivory, natural window light, muted gold, beautiful legible English serif learning text, refined sparse controls, small avatar, calm app navigation. A 1536x1152 landscape app screen. This study is a CONVERSATIONAL EXPLORABLE EXPLANATION, with two genuinely interactive paper sections separated by the companion's prose. Keep the small Anima door logo upper left and Chat / Today / Keep navigation at the top, small avatar top right, compact composer at the bottom. The drawings must look like precise, elegant SVG illustrations that can actually move and be recalculated, not photorealistic renders or painted assets. No black/blue dashboard, no dark cards, no full character illustration, no decorative status panels.
Direction B: an open illustrated notebook. One quiet prose line from Sakiko introduces the first experiment. First paper section heading 'First, see how the hammer reaches the string'. The generous flat diagram shows a simplified grand piano action side view, correctly separated into key lever on fulcrum, wippen/jack linkage, angled hammer shank and felt hammer head BELOW a horizontal string, separate felt damper ABOVE that string, and bridge at right. Clean honey wood strokes, warm gray outlines, small mist-blue/slate vibrating string, subtle amber accent on the currently moving lever. Plenty of white paper between parts; no dense grid. The jack stops pushing BEFORE impact and the hammer head is in free flight below the string. Tiny labels with leader lines only at the relevant parts. Directly below this diagram are a small scrubbable timeline and quiet controls 'Watch slowly', 'Next step', 'Reset'; a single-key lever at the left looks pressable, not a row of explanatory cards. One small in-paper margin sentence explains the current stage. This is a visual explanation of force and release, not a decorative full piano.
Between the two paper sections, ordinary companion prose says 'Now listen: why can the sound continue after the key is released?' in the same reading flow, with no extra author bubble border. Second paper section is compact and tactile: a playable C4–C5 keyboard beneath an elegant thin wave/envelope line, followed by a single row 'Touch' slider, 'Sustain' switch and small sound toggle. EXACT KEY GEOMETRY: 8 white keys labeled C4 D4 E4 F4 G4 A4 B4 C5. EXACTLY 5 black keys: C-sharp BETWEEN white C4 and D4, D-sharp BETWEEN D4 and E4, then NO black between E4/F4; F-sharp BETWEEN F4/G4, G-sharp BETWEEN G4/A4, A-sharp BETWEEN A4/B4, then NO black between B4/C5. Two-black group then three-black group, never a black key on every gap. Keys are quiet ivory and warm charcoal, one C4 white key softly pressed with a muted gold lower edge. Normal note readout 'C4 · 261.6 Hz' is small. No giant labels or simulation scores.
The lower conversation can continue with a small formula f₁ = (1/2L) √(T/μ) and one brief explanation, visually part of the conversation rather than a third card. Keep mechanical diagram, keyboard, controls and narration all readable at realistic desktop scale; the first experiment explains mechanism, the second lets the person hear the sustain distinction. Soft paper texture should be almost imperceptible. Gentle fine borders and tiny shadows, warm coherent neutrals, clear contrast. Preserve the feeling of sitting together at a study desk. No software implementation language, no arbitrary code blocks, no repeated helper text for each control, no title saying Interactive Lab. Do not create photorealistic mechanical hardware; this design must be feasible as live vector geometry and native controls.
```

<a id="v216"></a>

## V216 · Materials: remove the redundant global rail

Recorded prompt:

```text
Edit this exact Anima materials library interface. Preserve the beautiful warm ivory/champagne-gold palette, crisp refined typography, document list, selected paper preview, and the centered top navigation Chat Today Keep. ONE targeted correction: remove the entire unnecessary left vertical global navigation column (Home / Classes / Agenda / Notes / Materials / Life), including its decorative quote and flowers. Expand the actual Keep content into that freed space with generous margins and a balanced 40% document list / 60% paper preview. The only global navigation is the small top pill. Make the application full bleed edge to edge with no outer desktop/tabletop surround or dropped-shadow computer-window frame. Retain a subtle hint of warm window light only in empty outer margins. No new controls, no new cards, no extra categories. Keep the real tabs Notes Materials Conversation immediately below Keep, the search Find material and Add material action, and current reading actions. No engineering badges, slogans, disclaimers or watermark. A calm actual app interface, landscape.
```

<a id="v234"></a>

## V234 · Long conversation and source selection across light fields

Recorded prompt:

```text
Use case: ui-mockup. Create page 32 of the Anima English companion app, 1600x1000 landscape two-panel design board comparing the same calm conversation in daylight and at night. No device mockups, no promotional headings, no technical annotations. Full interface in each panel: tiny doorway logo Anima, centered compact pill Chat Today Keep, small optional character avatar at top right. Left palette warm ivory #f8f5ef with white paper and muted champagne gold. Right palette deep warm ink #282528, soft ivory text and muted amber, subtle small lamplight only in the far edge; no low-contrast grey on grey. Content is long-form readable conversation, not chat bubbles around every paragraph. Small user bubble I want to understand this step. Why can we define it this way? Assistant tiny character avatar then strong headline Start from a known solution., two natural paragraphs, an elegant displayed scalar formula c(t)=x(t)/u(t) and x(t)=u(t)c(t). Add a compact code block below with just two lines def greet(name): and return f'Hello, {name}', copy icon in code corner, retaining monospace typography. Beneath the answer are discreet copy and Quote controls and a collapsed From this handout link. Show a short selected phrase highlighted pale gold and a small contextual button Ask about this sentence, keeping typography and line spacing stable. Composer anchored at bottom with plus, unobtrusive privacy icon and gold send arrow; placeholder Keep going… . No oversized character in reading area; dark right panel has only a tiny portrait. The design must support genuinely long reading through comfortable line lengths, hierarchy and breathing room, no whole-screen card wall, no metadata parade, no progress counter, no verification statuses, no disclaimer or demo labels, no watermark.
```

<a id="t24"></a>

## T24 · Academic table intent and policy boundary

Complete design brief:

```text
The built-in GPT Image edit retained the original desktop shell, warm grey/ivory restrained gold, window light and single composer. It replaced the large co-work papers with one semantic semester table in the assistant message: course, credits, original grade and explicitly configured grade points, using the default institutional 4-point scale. Four synthetic records (mathematics, physics, writing, PE) demonstrated numbers, a letter grade and a pass/fail exclusion. A selected row used a thin gold rule and a quiet continuation link; source and calculation basis were collapsed. No overall GPA was invented from these rows. No ranking, mastery label, second input or management dashboard was requested.

The image is a design reference. Runtime uses text, semantic HTML and CSS, not a screenshot or Codex-hosted asset. Real account data was not supplied to image generation.
```

<a id="t28"></a>

## T28 · A phase-shifted wave sum with a precise zero state

Complete design brief:

```text
Use case: precise-object-edit, ui-mockup with a scientifically accurate plot.
Edit target: the supplied actual Anima desktop screenshot from the project's isolated synthetic Note conversation. This is a localized product design edit, not a new app screenshot from scratch.

Preserve the exact existing application shell, aspect ratio and landscape camera, top navigation “Chat / Today / Keep”, warm off-white and restrained muted-gold palette, soft room light, existing room backdrop, current blue-haired character illustration and her upper-right position, generous clear space to her left, and the single existing bottom composer. Preserve the existing bottom composer's geometry, original free draft and note-focus cue; do not create another input or chat panel. Do not add a side bar, device mockup, browser frame or extra character. Only replace the central current note paper and its contents. The current character must not overlap plot, labels, controls or reading text.

Replace that central note with one beautiful, continuous, usable conversation paper for a live work made in the moment. Reuse the reference's soft ivory paper material, faint fibers, delicate paper edge and believable shallow shadow. Do not exaggerate roughness. Keep typography clear and large at normal desktop size. Remove the old note title, note body, selected-note marking, timestamp and “Open original note” from inside this paper. The new work is a design example; no visible “OpenUI”, “program”, “demo”, internal IDs or implementation labels.

Inside the paper:
1. Large clear English title, exactly: “Let two waves meet”.
2. One short natural companion sentence, exactly: “Shift them by half a cycle and see where the gold curve goes.”
3. The main visual is a large, rigorous, clean SVG-like scientific line graph, not hand-drawn waves and not an illustration of water. Plot x from 0 to 2π and y approximately -1.2 to 1.2. Clear light horizontal zero axis; discreet amplitude ticks 1, 0, -1; x-axis labels exactly 0, π, 2π. No coarse grid or decorative graph paper.
   Exact mathematical state: φ = 180° = π. y₁ = sin(x), y₂ = sin(x + π) = -sin(x), y₁ + y₂ = 0 everywhere.
   At x=0 both originals are at 0. The dark thin ink-gray original y₁ rises to +1 at π/2, crosses 0 at π, falls to -1 at 3π/2, and returns to 0 at 2π.
   The other original is a thin light warm-gray curve, precisely the vertical opposite: -1 at π/2 and +1 at 3π/2.
   The sum is a slightly stronger, restrained gold STRAIGHT HORIZONTAL LINE on y=0 for the entire graph. It MUST NOT be another sinusoid. Both original waves are visible and clearly distinguishable, visually secondary to the gold result.
   A small legible legend ties gray line to “sin(x)”, light warm-gray line to “sin(x + φ)”, and gold line to “Sum of the two waves”. Keep labels separate and readable; do not cover the curves.
4. Under the graph, a slim readable live phase control. Its label/value exactly “Phase difference 180°”. A long elegant slider runs from 0° at left to 360° at right, with its thumb precisely halfway at 180°. It belongs to the same paper, not an inset card collection.
5. A light ON toggle labelled exactly “Show the two originals”; a small restrained play affordance labelled “Watch slowly”; a quiet text reset entry “Restore the original state”. They communicate finite local adjustment/play/reset without a dashboard or many tool cards.
6. The state explanation is readable, exactly: “The values are opposite everywhere, so their sum is zero. Adjust the phase slightly and they no longer cancel completely.”
   A compact optional mathematical line may read exactly “sin(x) + sin(x + π) = 0”; do not introduce another equation.
7. On the paper edge, one single understated conversational continuation entry, exactly “Discuss this change ↗”. It returns to the existing shared composer; no second chat box, survey or floating toolbar.

Use the reference's existing quiet spacing and readable English typography. Let the graph be the paper's visual focus, with enough room for all controls and explanation above the composer. Do not fill the whole page with microcopy or decorative labels. No badge rows, audit/permission disclaimers, lesson checklist, score, new notebook manager, fake progress or generic engineering dashboard. Output one polished, realistic landscape desktop design image.
```

