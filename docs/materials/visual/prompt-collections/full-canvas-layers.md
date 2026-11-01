# Full-canvas layers and paper materials

These complete design briefs and production notes inform stages 06–08. Read [art direction and decisions](../art-direction-and-decisions.md) first.

Find retained originals in the [kept artwork library](../../../../visual-assets/library/README.md) and [exact file index](../../../../visual-assets/library/index.json). The [surfaces and atmosphere collection](../../../../visual-assets/library/surfaces-and-atmosphere) supplies the related preserved material. A record does not establish that its exact former input or output is eligible or present. Resolve current files by their actual library identity; do not substitute a retired image.

## Reading boundary

The briefs below adapt recorded material; they are not necessarily the exact text submitted to a tool. Interface copy, anonymous sample places and obsolete generic cast examples have been adapted; all sample conversations, dates, grades, weather and study reports remain synthetic. Recorded selections and observations belong to their historical scope. Current passports and the product contract override outdated identity or pose assumptions. A recorded edit/extraction request also does not establish that the verified Mac new-PNG wrapper supports references, edits or masks.

## Kept originals connected to this material

These links identify the actual retained files. Each brief link follows the recorded output SHA association, not a guess from a similar filename or a later use as an input. A blank prompt record is preserved as a specific provenance gap rather than a reconstructed invocation.

| Kept original | Adapted design brief | Design work |
| --- | --- | --- |
| [keep apricot](../../../../visual-assets/library/surfaces-and-atmosphere/keep-apricot.png) | [K035](full-canvas-layers.md#k035) | Preserve the whole light/material field for later live layout, never as factual weather or a screenshot UI. |
| [keep mist](../../../../visual-assets/library/surfaces-and-atmosphere/keep-mist.png) | [K036](full-canvas-layers.md#k036) | Preserve the whole light/material field for later live layout, never as factual weather or a screenshot UI. |
| [keep violet](../../../../visual-assets/library/surfaces-and-atmosphere/keep-violet.png) | [K037](full-canvas-layers.md#k037) | Preserve the whole light/material field for later live layout, never as factual weather or a screenshot UI. |
| [keep rain](../../../../visual-assets/library/surfaces-and-atmosphere/keep-rain.png) | [K038](full-canvas-layers.md#k038) | Preserve the whole light/material field for later live layout, never as factual weather or a screenshot UI. |
| [today apricot](../../../../visual-assets/library/surfaces-and-atmosphere/today-apricot.png) | [K039](full-canvas-layers.md#k039) | Preserve the whole light/material field for later live layout, never as factual weather or a screenshot UI. |
| [today mist](../../../../visual-assets/library/surfaces-and-atmosphere/today-mist.png) | [K040](full-canvas-layers.md#k040) | Preserve the whole light/material field for later live layout, never as factual weather or a screenshot UI. |
| [today violet](../../../../visual-assets/library/surfaces-and-atmosphere/today-violet.png) | [K041](full-canvas-layers.md#k041) | Preserve the whole light/material field for later live layout, never as factual weather or a screenshot UI. |
| [today rain](../../../../visual-assets/library/surfaces-and-atmosphere/today-rain.png) | [K042](full-canvas-layers.md#k042) | Preserve the whole light/material field for later live layout, never as factual weather or a screenshot UI. |

<a id="v005"></a>

## V005 · Recorded prompt

Recorded prompt:

```text
Use case: background-extraction. Produce a precise FULL-CANVAS RGBA ALPHA MASK for the exact seated character in this source image, not a newly composed illustration. Preserve EXACT original 1536x1024 framing and every original character x/y position, head/hair outline, pose, torso, skirt, both complete legs and both full shoes. No cropping, centering, scaling, moving or pose change. The person's entire silhouette and held objects must be a SOLID FULLY OPAQUE charcoal silhouette; interior face/cloth colors are not needed, because software uses only this alpha to reveal the ORIGINAL mother-image RGB pixels. Do NOT render a new face or outfit. The room, seat/cushions, window, floor, wall, plants, bookshelf, blanket and all background/contact shadows must become genuinely transparent alpha=0. The original large empty left portion stays transparent. Trace the true silhouette with at most a 1-pixel antialiased edge; no soft mask cloud, no low-opacity halo, no glow, no broad feathering, no matte border, no shadow or background object included. Exact original 1536x1024 full canvas, complete feet preserved. Include the open notebook, all its pages/covers, and the thin pencil in the character's hands inside the opaque silhouette. Do not include the separate cup sitting on the cushion.
```

<a id="v006"></a>

## V006 · Recorded production note

Historical production note:

Alpha mask only to reveal original mother RGB; extracted RGB is intentionally a flat charcoal silhouette, never a visible sticker.

<a id="v007"></a>

## V007 · Recorded production note

Historical production note:

Raw low-alpha fringe exists on planning/rest extraction and must be suppressed in the existing compositor. It is not accepted as a visible character halo.

<a id="v008"></a>

## V008 · Recorded prompt

Recorded prompt:

```text
Use case: background-extraction. Produce a precise FULL-CANVAS RGBA ALPHA MASK for the exact seated character in this source image, not a newly composed illustration. Preserve EXACT original 1536x1024 framing and every original character x/y position, head/hair outline, pose, torso, skirt, both complete legs and both full shoes. No cropping, centering, scaling, moving or pose change. The person's entire silhouette and held objects must be a SOLID FULLY OPAQUE charcoal silhouette; interior face/cloth colors are not needed, because software uses only this alpha to reveal the ORIGINAL mother-image RGB pixels. Do NOT render a new face or outfit. The room, seat/cushions, window, floor, wall, plants, bookshelf, blanket and all background/contact shadows must become genuinely transparent alpha=0. The original large empty left portion stays transparent. Trace the true silhouette with at most a 1-pixel antialiased edge; no soft mask cloud, no low-opacity halo, no glow, no broad feathering, no matte border, no shadow or background object included. Exact original 1536x1024 full canvas, complete feet preserved. Include the closed book on the character's lap and both resting hands inside the opaque silhouette. Preserve the exact window-facing head/hair silhouette.
```

<a id="v009"></a>

## V009 · Recorded prompt

Recorded prompt:

```text
Use case: background-extraction. Make an RGBA alpha extraction mask from this exact source. MANDATORY OUTPUT SIZE IS 1536 pixels wide by 1024 pixels high, identical to the input. Keep every full-frame transparent column and row, including the empty leftmost columns. Do not auto-trim even ONE pixel, do not crop to 1535, do not recenter, resize, zoom or shift. The exact original seated Anon silhouette remains at its source x/y coordinates: long hair, head, torso, uniform/skirt, both hands with the small folded paper bird, complete legs/socks and BOTH complete loafers. Represent only the person and held paper bird as a fully opaque solid charcoal silhouette; interior face/colors are irrelevant because software uses ONLY this alpha mask with the ORIGINAL mother RGB. Every room, seat, cushion, blanket, wall, window, plant, floor and shadow pixel is genuinely transparent alpha=0. No background cloud, glow, halo, drop shadow, broad feathering or matte; only a crisp silhouette with minimal single-pixel antialiasing on its true edge. The whole large left negative-space region remains empty transparent, but its full pixel canvas width must be preserved. Exact original 1536x1024 RGBA, no trim, no repositioning.
```

<a id="v010"></a>

## V010 · Recorded production note

Historical production note:

Raw low-alpha fringe must be suppressed by the existing compositor; this is a mask, not accepted direct-display character RGB.

<a id="v011"></a>

## V011 · Recorded prompt

Recorded prompt:

```text
Use case: background-extraction. Produce a precise FULL-CANVAS RGBA ALPHA MASK for the exact seated character in this source image, not a newly composed illustration. Preserve EXACT original 1536x1024 framing and every original character x/y position, head/hair outline, pose, torso, skirt, both complete legs and both full shoes. No cropping, centering, scaling, moving or pose change. The person's entire silhouette and held objects must be a SOLID FULLY OPAQUE charcoal silhouette; interior face/cloth colors are not needed, because software uses only this alpha to reveal the ORIGINAL mother-image RGB pixels. Do NOT render a new face or outfit. The room, seat/cushions, window, floor, wall, plants, bookshelf, blanket and all background/contact shadows must become genuinely transparent alpha=0. The original large empty left portion stays transparent. Trace the true silhouette with at most a 1-pixel antialiased edge; no soft mask cloud, no low-opacity halo, no glow, no broad feathering, no matte border, no shadow or background object included. Exact original 1536x1024 full canvas, complete feet preserved. Include the small folded paper bird held between both hands inside the opaque silhouette, preserving its pointed folds exactly.
```

<a id="v013"></a>

## V013 · Recorded production note

Historical production note:

Three independent Mutsumi Wakaba actions, identity expansion from approved Sakiko action mother canvases. Figure assets are generated alpha only; renderer should retain original mother RGB. No programmatic image extraction or pixel edits.

<a id="v016"></a>

## V016 · Recorded prompt

Recorded prompt:

```text
Use case: background-extraction.
Asset type: character alpha silhouette/cutout aligned to its existing mother illustration.
Input image is the EDIT TARGET and the ONLY source. Extract EXACTLY the already drawn seated Mutsumi Wakaba and her held object from this image; remove every background pixel to genuine transparency.
CRITICAL exact canvas registration: output FULL 1536 x 1024 RGBA PNG, same canvas bounds, no cropping, no trimming, no recentering, no zooming and no resizing. Keep ALL character pixels in the EXACT SAME original x,y coordinates, scale, facial identity, pose and shape. Do not redraw, beautify, move, change expression, or invent the character.
Include ALL pale grey-green hair strands, hairpins, face, blouse, all arms/hands/fingers, blue plaid skirt, complete legs, dark socks and BOTH COMPLETE BROWN SHOES at the original floor-contact coordinates. Include the ENTIRE object she is holding (open notebook and pencil / closed book / small paper bird as actually present in this source). Treat held object and hands as part of the same foreground. Do not detach or omit any part.
Erase the complete room: wall, floor, window, light, outside view, bench, seat cushion, plants, pillows, blanket, shelf, other books and floor shadow. Background, floor contact shadow and holes around/between hair, arms and legs must be TRUE alpha=0, not a fake checkerboard, white paint or grey backdrop. Keep fine antialiased hair boundaries without opaque room-colored halo. Preserve the original character RGB wherever possible; this output's alpha will mask the original mother RGB. No new ground shadow, no text, no watermark. One transparent aligned cutout.
```

<a id="v017"></a>

## V017 · Recorded production note

Historical production note:

Viewed full canvas: same seated registration, full held object and both complete shoes. Generated alpha has faint low-alpha fringe; existing renderer uses its alpha threshold and the original mother RGB. No image pixels edited.

<a id="v024"></a>

## V024 · Recorded production note

Historical production note:

Alpha mask only; original mother RGB is rendered by frontend. No crop, recenter, resize or pixel editing was performed.

<a id="v025"></a>

## V025 · Recorded prompt

Recorded prompt:

```text
Use case: background-extraction.
Asset type: exact-position full-canvas RGBA alpha mask for the supplied approved mother illustration, NOT a new character illustration.
Input image 1 is the edit target, sakiko-planning-mother.png.
Extract ONLY the complete visible girl and the object held in her hands (the open cream notebook and pencil). Output a flat solid WHITE silhouette of precisely those pixels on a genuinely transparent background. No face details, color, scene, shadows, glow, checkerboard or outline. Opaque white inside the selected girl and held object, transparent outside, clean antialiased outer edge. Preserve small transparent gaps between hair strands, limbs and object.
Registration is mandatory: preserve EXACT 1536x1024 landscape canvas and the subject's original x/y position, shape, scale, seated pose and complete silhouette from the mother. The large left area stays transparent. Do NOT center, crop, enlarge, rotate, resize, redesign or re-pose anything. Retain every outer hair strand, both ribbons, all clothing, legs and both complete shoes in their original positions. The white region must follow the mother's visible contour, including held object. Exclude the room, bench, cushion, blanket, flowers, floor and the cast shadow.
This output is used ONLY as an alpha mask; frontend displays original mother pixels through the mask. Accuracy of original subject footprint and transparency matters, never add decorative RGB or a replacement character.
```

<a id="v026"></a>

## V026 · Recorded production note

Historical production note:

Complete original-canvas white silhouette with complete shoes and held object area. Generated low-alpha halo is visible; requires primary composite inspection with existing frontend threshold before approval.

<a id="v027"></a>

## V027 · Recorded prompt

Recorded prompt:

```text
Use case: background-extraction.
Asset type: exact-position full-canvas RGBA alpha mask for the supplied approved mother illustration, NOT a new character illustration.
Input image 1 is the edit target, sakiko-rest-mother.png.
Extract ONLY the complete visible girl and the object held in her hands (the closed book on her lap). Output a flat solid WHITE silhouette of precisely those pixels on a genuinely transparent background. No face details, color, scene, shadows, glow, checkerboard or outline. Opaque white inside the selected girl and held object, transparent outside, clean antialiased outer edge. Preserve small transparent gaps between hair strands, limbs and object.
Registration is mandatory: preserve EXACT 1536x1024 landscape canvas and the subject's original x/y position, shape, scale, seated pose and complete silhouette from the mother. The large left area stays transparent. Do NOT center, crop, enlarge, rotate, resize, redesign or re-pose anything. Retain every outer hair strand, both ribbons, all clothing, legs and both complete shoes in their original positions. The white region must follow the mother's visible contour, including held object. Exclude the room, bench, cushion, blanket, flowers, floor and the cast shadow.
This output is used ONLY as an alpha mask; frontend displays original mother pixels through the mask. Accuracy of original subject footprint and transparency matters, never add decorative RGB or a replacement character.
```

<a id="v028"></a>

## V028 · Recorded prompt

Recorded prompt:

```text
Use case: background-extraction.
Asset type: exact-position full-canvas RGBA alpha mask for the supplied approved mother illustration, NOT a new character illustration.
Input image 1 is the edit target, sakiko-play-mother.png.
Extract ONLY the complete visible girl and the object held in her hands (the small cream origami bird). Output a flat solid WHITE silhouette of precisely those pixels on a genuinely transparent background. No face details, color, scene, shadows, glow, checkerboard or outline. Opaque white inside the selected girl and held object, transparent outside, clean antialiased outer edge. Preserve small transparent gaps between hair strands, limbs and object.
Registration is mandatory: preserve EXACT 1536x1024 landscape canvas and the subject's original x/y position, shape, scale, seated pose and complete silhouette from the mother. The large left area stays transparent. Do NOT center, crop, enlarge, rotate, resize, redesign or re-pose anything. Retain every outer hair strand, both ribbons, all clothing, legs and both complete shoes in their original positions. The white region must follow the mother's visible contour, including held object. Exclude the room, bench, cushion, blanket, flowers, floor and the cast shadow.
This output is used ONLY as an alpha mask; frontend displays original mother pixels through the mask. Accuracy of original subject footprint and transparency matters, never add decorative RGB or a replacement character.
```

<a id="v029"></a>

## V029 · Recorded production note

Historical production note:

Approved Sakiko activity mother and Tomori identity reference → complete activity mothers → same-canvas alpha silhouettes

<a id="v033"></a>

## V033 · Recorded prompt

Recorded prompt:

```text
Use case: background-extraction. Production RGBA SEGMENTATION MATTE / alpha silhouette extracted from the supplied approved complete scene. Exact output canvas 1536x1024, same pixel registration as this source image. Keep ONLY Tomori's entire seated character silhouette AND the small open notebook held on her lap as ONE natural foreground mask in the exact source positions. Include the complete head and every short hair edge, both hands and all fingers, every item of clothing, both full legs, socks and both complete shoes; preserve the original pose, scale, proportions and location exactly. Output inside the silhouette as pure WHITE RGB with opaque alpha; outside it must be truly transparent alpha=0, including the whole left wall and the spaces between limbs. Only narrow antialiasing on the exact silhouette edge. This is a full-canvas reusable mask, not a centered standalone portrait: NEVER crop, reposition, enlarge, redraw the pose, add padding or change the canvas aspect. Remove all room, window, bench, cushions, blanket, floor, background plants, light patches and all cast shadows from the mask. No background checkerboard painted in, no grey rectangle, no furniture, no labels, no drop shadow and no glow. The small held object is part of the mask; the bench and anything not held are NOT part. The character must remain at the exact far-right original seated position with the same complete shoes touching the original source floor coordinates.
```

<a id="v034"></a>

## V034 · Recorded prompt

Recorded prompt:

```text
Use case: background-extraction. Production RGBA SEGMENTATION MATTE / alpha silhouette extracted from the supplied approved complete scene. Exact output canvas 1536x1024, same pixel registration as this source image. Keep ONLY Tomori's entire seated character silhouette AND the small closed book held on her lap as ONE natural foreground mask in the exact source positions. Include the complete head and every short hair edge, both hands and all fingers, every item of clothing, both full legs, socks and both complete shoes; preserve the original pose, scale, proportions and location exactly. Output inside the silhouette as pure WHITE RGB with opaque alpha; outside it must be truly transparent alpha=0, including the whole left wall and the spaces between limbs. Only narrow antialiasing on the exact silhouette edge. This is a full-canvas reusable mask, not a centered standalone portrait: NEVER crop, reposition, enlarge, redraw the pose, add padding or change the canvas aspect. Remove all room, window, bench, cushions, blanket, floor, background plants, light patches and all cast shadows from the mask. No background checkerboard painted in, no grey rectangle, no furniture, no labels, no drop shadow and no glow. The small held object is part of the mask; the bench and anything not held are NOT part. The character must remain at the exact far-right original seated position with the same complete shoes touching the original source floor coordinates.
```

<a id="v035"></a>

## V035 · Recorded prompt

Recorded prompt:

```text
Use case: background-extraction. Production RGBA SEGMENTATION MATTE / alpha silhouette extracted from the supplied approved complete scene. Exact output canvas 1536x1024, same pixel registration as this source image. Keep ONLY Tomori's entire seated character silhouette AND the small origami bird held between her hands as ONE natural foreground mask in the exact source positions. Include the complete head and every short hair edge, both hands and all fingers, every item of clothing, both full legs, socks and both complete shoes; preserve the original pose, scale, proportions and location exactly. Output inside the silhouette as pure WHITE RGB with opaque alpha; outside it must be truly transparent alpha=0, including the whole left wall and the spaces between limbs. Only narrow antialiasing on the exact silhouette edge. This is a full-canvas reusable mask, not a centered standalone portrait: NEVER crop, reposition, enlarge, redraw the pose, add padding or change the canvas aspect. Remove all room, window, bench, cushions, blanket, floor, background plants, light patches and all cast shadows from the mask. No background checkerboard painted in, no grey rectangle, no furniture, no labels, no drop shadow and no glow. The small held object is part of the mask; the bench and anything not held are NOT part. The character must remain at the exact far-right original seated position with the same complete shoes touching the original source floor coordinates.
```

<a id="v037"></a>

## V037 · Recorded production note

Historical production note:

Only integrated mother-scene RGB supplies visible character colors; figure/mask RGB is not used as replacement art.

<a id="v038"></a>

## V038 · Recorded production note

Historical production note:

Same-canvas masks may include low-opacity raw exterior pixels; runtime alpha transfer and actual composite review remain necessary.

<a id="v043"></a>

## V043 · Recorded production note

Historical production note:

Only alpha is sampled; original matching mother supplies all visible character RGB.

<a id="v051"></a>

## V051 · Recorded prompt

Recorded prompt:

```text
Use case: precise-object-edit. Input image 1 is the EDIT TARGET, a fixed 1536 × 1024 room illustration. Produce its precisely registered EMPTY BACKGROUND CLEAN PLATE for a layered interactive scene. Remove ONLY the seated blue-haired girl in her entirety (hair, body, all clothing, both legs and both shoes), the single dark blue book she holds, and all shadows cast specifically by her and her shoes. Reconstruct the room surfaces she occluded: the same plaid window-seat cushion continuing naturally, wood seat front, window/curtain behind her, and floorboards below, with the same perspective and lighting. Keep the empty window seat in place. CRITICAL INVARIANTS: the complete original frame and camera are locked; no cropping, no zoom, no reframing, no shift, no new border. Preserve the exact pixel positions and appearance of all existing unaffected room geometry, all left-wall negative space, floorboard perspective, sunlight and window/leaf shadows not cast by the person, the river/campus/clock tower seen through the window, plants at upper right, bookshelf at right, pillows, cream knitted blanket, lower-right bedside table and its separate stack of books. The books on the table MUST remain; remove only the book held in her arms. Do not add a replacement person, clothing, cushion decoration, furniture, objects, text, UI, or symbols. The result should look like the SAME illustration with the person carefully inpainted out, suitable to composite her original full-canvas transparent cutout back in at exactly the same coordinates.
```

<a id="v054"></a>

## V054 · Recorded prompt

Recorded prompt:

```text
Use case: background-extraction. Input image is the EDIT TARGET. Extract ONLY Mutsumi Wakaba and the book she is touching from this exact mother scene onto a GENUINELY TRANSPARENT RGBA background, retaining the entire ORIGINAL 1536x1024 CANVAS. Critical: preserve her EXACT pixel position, scale, pose, silhouette, hair wisps, face, uniform, legs and both shoes, with the head, hip and feet at exactly the same coordinates as the source. Do NOT recenter, crop, zoom, rotate, move or redraw the character. Remove every pixel of room/background, cushion, pillows, blanket, sunlight, furniture, walls, floor and all cast shadows. Keep the green book as part of her foreground. Outside her silhouette alpha must be 0, inside body/clothes/book alpha must be solid opaque except natural anti-aliased edge/hair wisps. No colored matte, no halos or white/black/cyan outline, no checkerboard baked into pixels. This is a precise same-canvas foreground ALPHA MASK used to reveal original mother-scene RGB, not an opportunity to redraw her or rearrange the composition.
```

<a id="v056"></a>

## V056 · Recorded prompt

Recorded prompt:

```text
Use case: background-extraction. Produce a PRECISE SEGMENTATION ALPHA MASK, not another illustration. Input image 1 is the original full 1536x1024 scene. On the EXACT SAME 1536x1024 canvas, TRACE the EXACT original silhouette of ONLY the seated green-haired girl Mutsumi and the object held in her hands. Fill that traced person/object silhouette completely with solid WHITE (fully opaque alpha); make the entire rest of the original scene truly TRANSPARENT (alpha zero). NO face, hair, fabric or color detail should be drawn inside; just one flat white cut shape, with naturally anti-aliased contour and individual visible hair wisps. This image is exclusively an alpha mask to clip the ORIGINAL RGB image; do not redraw, recompose, rescale, recenter, shift or reinterpret the person. Her head top, back hair outer curve, hands, skirt edge, knees, legs and BOTH full shoes must follow the exact original pixel coordinates. Start with original image coordinates, never create a new centered cutout. Mask must include her full long hair and held object, all limbs, clothing and shoes; exclude every bit of room/wall/window/cushion/pillow/blanket/floor, furniture and every cast shadow. Do NOT include glow, aura, mist, shadow gradient, halo, vignette or colored matte: outside the precisely traced contour there is immediately transparent background, no broad soft edge. No extra parts, no crop, no text, no border. Character remains in original RIGHT-side position; left 55% remains entirely transparent. Exact canvas registration and contour accuracy take priority over everything. Include her GREEN book, whether closed or open, as one foreground with her hands.
```

<a id="v057"></a>

## V057 · Recorded production note

Historical production note:

RGBA mask RGB is flat white and is never displayed; apply existing alpha threshold then reveal original mother RGB. Raw exterior low-alpha pixels are retained in the file. Composite and drag must be checked by primary agent.

<a id="v058"></a>

## V058 · Recorded prompt

Recorded prompt:

```text
Use case: background-extraction. Produce a PRECISE SEGMENTATION ALPHA MASK, not another illustration. Input image 1 is the original full 1536x1024 scene. On the EXACT SAME 1536x1024 canvas, TRACE the EXACT original silhouette of ONLY the seated green-haired girl Mutsumi and the object held in her hands. Fill that traced person/object silhouette completely with solid WHITE (fully opaque alpha); make the entire rest of the original scene truly TRANSPARENT (alpha zero). NO face, hair, fabric or color detail should be drawn inside; just one flat white cut shape, with naturally anti-aliased contour and individual visible hair wisps. This image is exclusively an alpha mask to clip the ORIGINAL RGB image; do not redraw, recompose, rescale, recenter, shift or reinterpret the person. Her head top, back hair outer curve, hands, skirt edge, knees, legs and BOTH full shoes must follow the exact original pixel coordinates. Start with original image coordinates, never create a new centered cutout. Mask must include her full long hair and held object, all limbs, clothing and shoes; exclude every bit of room/wall/window/cushion/pillow/blanket/floor, furniture and every cast shadow. Do NOT include glow, aura, mist, shadow gradient, halo, vignette or colored matte: outside the precisely traced contour there is immediately transparent background, no broad soft edge. No extra parts, no crop, no text, no border. Character remains in original RIGHT-side position; left 55% remains entirely transparent. Exact canvas registration and contour accuracy take priority over everything. In this night scene include the ceramic mug in her hands, exclude the background lamp.
```

<a id="v060"></a>

## V060 · Recorded production note

Historical production note:

Reference roles follow the agent prompt record; RGBA figure assets supply alpha only, not generated RGB.

<a id="v062"></a>

## V062 · Recorded prompt

Recorded prompt:

```text
Use case: background-extraction. Create a precise FULL-CANVAS ALPHA MASK of only the seated anime girl and the book she holds in the source. This is a technical silhouette asset, NOT a new illustration. EXACT original 1536x1024 canvas; preserve every original x/y location, head scale, long hair silhouette, hands/book, skirt, complete legs and both complete shoes. DO NOT CROP, CENTER, RESIZE OR REPOSITION. All person and held-book pixels should be fully OPAQUE, with a plain flat solid charcoal RGB fill (interior details and face colors are unnecessary because software will use only the alpha channel to show ORIGINAL source pixels). Every room/background pixel must be alpha=0, including seat, cushions, floor, wall, window, bookshelf, plants and shadows. Preserve fine original outer hair silhouette with only a 1-pixel antialias edge. ABSOLUTELY NO white/colored halo, soft glow, fog, drop shadow, wide feathering or visible backdrop; sharp clean opaque silhouette against real transparency. Leave the entire original empty left region transparent. Output RGBA transparency, exact 1536x1024 full frame.
```

<a id="v063"></a>

## V063 · Recorded prompt

Recorded prompt:

```text
Use case: background-extraction. This output is a technical ALPHA SILHOUETTE, not an illustration. Extract the exact original outer silhouette of ONLY Anon and the object held in both hands. Output the EXACT ORIGINAL 1536x1024 canvas with every x/y position and scale UNCHANGED: head, long pink-hair outline, arms/hands, gray uniform, skirt, complete legs, dark socks and both entire loafers remain exactly where they were. NO crop, NO recenter, NO zoom or reframing. Fill the complete person-and-held-object silhouette with one solid fully opaque charcoal color, no interior face or texture is needed; software uses ONLY alpha over ORIGINAL mother-image pixels. Everything outside the silhouette must be genuinely transparent alpha=0, including wall, floor, seat, cushions, plants, window, lamp, bookshelf and shadows. Preserve fine hair silhouette with minimal 1-pixel antialiasing. No low-opacity fog, no feathering, no halo, no glow, no backdrop, no drop shadow, no extra shape around the shoes. The large left original safe region is entirely transparent. Keep full original framing, true RGBA output. The held object is the open book; include both open covers and pages inside the opaque silhouette.
```

<a id="v064"></a>

## V064 · Recorded prompt

Recorded prompt:

```text
Use case: background-extraction. This output is a technical ALPHA SILHOUETTE, not an illustration. Extract the exact original outer silhouette of ONLY Anon and the object held in both hands. Output the EXACT ORIGINAL 1536x1024 canvas with every x/y position and scale UNCHANGED: head, long pink-hair outline, arms/hands, gray uniform, skirt, complete legs, dark socks and both entire loafers remain exactly where they were. NO crop, NO recenter, NO zoom or reframing. Fill the complete person-and-held-object silhouette with one solid fully opaque charcoal color, no interior face or texture is needed; software uses ONLY alpha over ORIGINAL mother-image pixels. Everything outside the silhouette must be genuinely transparent alpha=0, including wall, floor, seat, cushions, plants, window, lamp, bookshelf and shadows. Preserve fine hair silhouette with minimal 1-pixel antialiasing. No low-opacity fog, no feathering, no halo, no glow, no backdrop, no drop shadow, no extra shape around the shoes. The large left original safe region is entirely transparent. Keep full original framing, true RGBA output. The held object is the small porcelain mug; include mug and handle with the hands, but DO NOT include the separate mug on the room cushion.
```

<a id="v067"></a>

## V067 · Recorded prompt

Recorded prompt:

```text
Use case: background-extraction. Edit target is the attached 1536x1024 complete Tomori room master. Create ONE genuine transparent RGBA extraction at EXACTLY the same FULL 1536x1024 canvas size. Keep the girl Tomori Takamatsu and all items she is holding (her small notebook and the small stone in her hand), including every hair edge, hands, blazer, skirt, complete knee socks, and both complete shoes. Preserve her exact original image coordinates, size, pose, tilt and perspective. The head, hip contact point, knees and shoe soles must be at their original pixels. REMOVE every room/background pixel, bench, cushions, floor, window, plants, wall, lamp and furniture to alpha=0. No cast floor shadow. Keep ONLY the original character silhouette and held object opaque; allow anti-alias alpha only along edges. This is an extraction, NOT a redraw or character restyling. Absolutely do NOT crop, recenter, zoom, resize the character, shift her, change her anatomy, close gaps between legs, omit shoes, fill the background with white/gray/checkerboard, or add anything. The left roughly 55 percent of the image must remain completely transparent exactly as in the source framing. The alpha channel of this output will be used as a full-canvas mask over the ORIGINAL mother image pixels; exact source alignment is essential. Preserve transparent background in the actual PNG.
```

<a id="v068"></a>

## V068 · Recorded production note

Historical production note:

Only alpha reveals original mother RGB; exact contour/composite review not inferred from the prompt.

<a id="v069"></a>

## V069 · Recorded prompt

Recorded prompt:

```text
Use case: background-extraction. Edit target is the attached 1536x1024 complete Tomori room master. Create ONE genuine transparent RGBA extraction at EXACTLY the same FULL 1536x1024 canvas size. Keep the girl Tomori Takamatsu and all items she is holding (the open book in both hands), including every hair edge, hands, blazer, skirt, complete knee socks, and both complete shoes. Preserve her exact original image coordinates, size, pose, tilt and perspective. The head, hip contact point, knees and shoe soles must be at their original pixels. REMOVE every room/background pixel, bench, cushions, floor, window, plants, wall, lamp and furniture to alpha=0. No cast floor shadow. Keep ONLY the original character silhouette and held object opaque; allow anti-alias alpha only along edges. This is an extraction, NOT a redraw or character restyling. Absolutely do NOT crop, recenter, zoom, resize the character, shift her, change her anatomy, close gaps between legs, omit shoes, fill the background with white/gray/checkerboard, or add anything. The left roughly 55 percent of the image must remain completely transparent exactly as in the source framing. The alpha channel of this output will be used as a full-canvas mask over the ORIGINAL mother image pixels; exact source alignment is essential. Preserve transparent background in the actual PNG.
```

<a id="v070"></a>

## V070 · Recorded prompt

Recorded prompt:

```text
Use case: background-extraction. Edit target is the attached 1536x1024 complete Tomori room master. Create ONE genuine transparent RGBA extraction at EXACTLY the same FULL 1536x1024 canvas size. Keep the girl Tomori Takamatsu and all items she is holding (the warm ceramic mug in both hands), including every hair edge, hands, blazer, skirt, complete knee socks, and both complete shoes. Preserve her exact original image coordinates, size, pose, tilt and perspective. The head, hip contact point, knees and shoe soles must be at their original pixels. REMOVE every room/background pixel, bench, cushions, floor, window, plants, wall, lamp and furniture to alpha=0. No cast floor shadow. Keep ONLY the original character silhouette and held object opaque; allow anti-alias alpha only along edges. This is an extraction, NOT a redraw or character restyling. Absolutely do NOT crop, recenter, zoom, resize the character, shift her, change her anatomy, close gaps between legs, omit shoes, fill the background with white/gray/checkerboard, or add anything. The left roughly 55 percent of the image must remain completely transparent exactly as in the source framing. The alpha channel of this output will be used as a full-canvas mask over the ORIGINAL mother image pixels; exact source alignment is essential. Preserve transparent background in the actual PNG.
```

<a id="v075"></a>

## V075 · Recorded prompt

Recorded prompt:

```text
Precise background-extraction production EDIT. Target is the attached approved mother scene, 1536x1024. Extract ONLY Sakiko Togawa AND the closed book she holds on her lap onto a truly transparent RGBA canvas, keeping the EXACT FULL 1536x1024 canvas and EXACT original pixel position, scale, face, body, pose and complete shoes from the input. Character occupies approximately x58%-99%, head near x81% y14%, seated hips x87% y61%, feet near x65%-77% y94%. Do NOT recenter, do NOT enlarge, do NOT crop tightly, do NOT redraw her, do NOT change face, clothes, hair, pose or lighting. Everything else — ivory wall, window, campus, cushions, throw, floor, furniture, plants, cup, books on side table — must become fully transparent. Preserve only the character's original contact shadow if directly under her hips or shoes as a very subtle alpha shadow, not background patches. Fine natural hair alpha, crisp original anime lines, no cyan/fringe/magenta/white halo, no glow, no new outline, no visible checkerboard. This layer must composite over the mother-scene background at top-left (0,0) without any independent fitting or geometry adjustment. Preserve the exact original source geometry.
```

<a id="v076"></a>

## V076 · Recorded production note

Historical production note:

alpha only; generated RGB and halo rejected as visible artwork; runtime alpha table removes low-opacity halo and displays original mother pixels

<a id="v084"></a>

## V084 · Recorded prompt

Recorded prompt:

```text
Use case: background-extraction. Extract ONLY Sakiko and the open book held in BOTH of her hands from this exact image onto genuinely transparent RGBA. CRITICAL REGISTRATION: output EXACT full original 1536x1024 canvas; leave the girl at EXACT original x/y coordinates, scale, seating pose, complete leg and both shoe positions. The left area stays fully transparent and empty. DO NOT CROP, DO NOT RECENTER, DO NOT resize/reframe. Preserve precisely the youthful face, all pale blue hair strands, bows, cardigan, skirt, skin, socks, both complete loafers, both hands and held open book from this input. Remove ALL room pixels: wall, floor, seat, cushions, blankets, lamp, plants, bookshelf, window, and contact shadows, making those pixels alpha=0. No backdrop of any color. Clean natural antialiased silhouette without any white halo, white outline, glow rim, matte contamination, shadow cloud, or feathered white border. Do not redraw or beautify her face or change body contour. Think of an exact full-frame alpha extraction aligned to the source image. The result will be used as a registration mask over ORIGINAL source pixels, so position, scale and silhouette accuracy are paramount.
```

<a id="v085"></a>

## V085 · Recorded production note

Historical production note:

The generated RGBA contains a low-alpha halo. Its RGB is not accepted for direct character rendering; the compositor must remove the fringe and display the mother image's original pixels. Dominant body alpha is 253, not 255.

<a id="v086"></a>

## V086 · Recorded prompt

Recorded prompt:

```text
Use case: background-extraction. Extract ONLY Sakiko and the warm mug held in BOTH hands from this exact rainy-night image onto genuinely transparent RGBA. CRITICAL REGISTRATION: output EXACT full original 1536x1024 canvas, keep figure at EXACT source pixel x/y coordinates, original scale, head, torso, seat footprint, complete leg angles and both shoe positions. Leave large left portion fully transparent. DO NOT CROP, DO NOT RECENTER, DO NOT resize/reframe. Keep the precise youthful face, all pale blue hair, navy bows, cardigan, skirt, complete skin/socks/both full loafers, hands and held mug. Remove all room, seat, cushions, blankets, floor, wall, window, rain, light, plants, lamp, bookshelf and background shadows to alpha=0. Only the person and held mug remain. No white halo, white or black fringe, glow outline, matte contamination or drop shadow. No redrawing face/body, no invented edges. This will be a full-frame alpha registration mask over ORIGINAL source pixels, so exact position and silhouette matter more than creative rendering.
```

<a id="v087"></a>

## V087 · Recorded prompt

Recorded prompt:

```text
Use case: precise-object-edit. Create a clean BACKGROUND PLATE from the input image by removing ONLY the entire seated anime girl and the open book she is holding. Inpaint the room naturally where the girl covered it: continuous original window seat with the same beige check cushion and supporting woodwork, original pillows, original warm wood floor under where both shoes were. Preserve the EXACT full 1536x1024 canvas, same fixed camera/perspective, and every existing window frame line, sill, window-seat cushion edge, bookshelf, throw blanket, wall and floor geometry at the SAME pixel positions. DO NOT crop, recenter, zoom, shift the window/seat, or redesign the room. Preserve original daytime lighting and original image everywhere outside the removed girl/book. The separate porcelain mug already on the cushion is part of the room and MUST remain at its original location. Left 60% stays the exact quiet clear cream wall/floor area without plants, writing or any added object. No girl or ghost silhouette, no human shadow left behind, no extra people, no UI, no text, no borders. Complete coherent empty room, original 1536x1024 framing.
```

<a id="v089"></a>

## V089 · Recorded prompt

Recorded prompt:

```text
Use case: precise-object-edit. Create a clean rainy-NIGHT BACKGROUND PLATE by removing ONLY the seated anime girl and mug held in her hands. Naturally reconstruct the beige check window-seat cushion, original pillows, woodwork and warm wooden floor hidden by her body and both shoes. CRITICAL: preserve EXACT original full 1536x1024 canvas, fixed camera, perspective, same window frame pixel lines, SAME window-seat cushion edge and position, same right bookshelf and warm gold table lamp, blanket and all room objects. NO crop, recenter, zoom or layout movement. Keep continuous coherent rainy nighttime across the whole window, cool dark blue-violet rain outside and the same warm amber indoor lamp light. Preserve the input image outside the removed person/held mug. Left quiet deep charcoal-violet wall/floor stays uncluttered with no plants or objects added. No ghost girl, no remaining body/shoe shadow, no people, no text, no UI, no dividing line. Output exact 1536x1024 original framing.
```

<a id="v090"></a>

## V090 · Recorded prompt

Recorded prompt:

```text
Use case: precise-object-edit / clean background extraction.
Edit target: the attached approved 1536×1024 complete room scene.
Remove ONLY the seated girl and the book she is holding, including all her hair, uniform, legs, shoes and body contact shadows. Reveal the empty padded window seat and the wooden floor naturally behind those removed pixels. Preserve the checked cushion, wooden frame, nearby pillows and blanket, window, curtain, plant, books, left wall, exact camera and perspective, object placement, and the entire approved cool airy morning mist blue, gentle daylight lighting unchanged. This is a same-canvas background layer for the original scene, not a new room. Output exactly the full 1536×1024 frame with no crop, no zoom, no reframing, no extra objects, no character, no human shadow, no text. Outside the girl's former silhouette preserve the target composition and lighting as faithfully as possible. The resulting clean plate must align with the target's full-canvas mother image.
```

<a id="v091"></a>

## V091 · Recorded production note

Historical production note:

mother pixels supply all character RGB; reused original chat alpha only after direct geometry comparison; background inpainting reconstructs occluded surfaces and is not a pixel-identical original background

<a id="v092"></a>

## V092 · Recorded prompt

Recorded prompt:

```text
Use case: precise-object-edit / clean background extraction.
Edit target: the attached approved 1536×1024 complete room scene.
Remove ONLY the seated girl and the book she is holding, including all her hair, uniform, legs, shoes and body contact shadows. Reveal the empty padded window seat and the wooden floor naturally behind those removed pixels. Preserve the checked cushion, wooden frame, nearby pillows and blanket, window, curtain, plant, books, left wall, exact camera and perspective, object placement, and the entire approved lavender violet dusk wall, warm orange low sun and sunset window lighting unchanged. This is a same-canvas background layer for the original scene, not a new room. Output exactly the full 1536×1024 frame with no crop, no zoom, no reframing, no extra objects, no character, no human shadow, no text. Outside the girl's former silhouette preserve the target composition and lighting as faithfully as possible. The resulting clean plate must align with the target's full-canvas mother image.
```

<a id="v094"></a>

## V094 · Recorded production note

Historical production note:

Primary agent explicitly confirmed individually viewing all 55 selected scene mothers, masks and clean plates. The original 31 hashes are bound to the earlier review snapshot; the additional 24 are bound to approved source logs with matching output hashes. Image review does not certify every runtime composition or drag combination.

<a id="v095"></a>

## V095 · Recorded production note

Historical production note:

Primary agent explicitly confirmed individually viewing all 31 current scene mothers, masks and clean plates through audit/new-scenes contact sheets. This confirms image review only, not every runtime composition or drag combination.

<a id="v098"></a>

## V098 · Recorded production note

Historical production note:

alpha mask only over original mother pixels

<a id="v101"></a>

## V101 · Recorded production note

Historical production note:

RGBA alpha mask only; RGB intentionally flat charcoal. Source mother's original pixels supply the rendered character. Raw low-alpha fringe must be removed by the compositor and is not accepted as a visible character halo.

<a id="v102"></a>

## V102 · Recorded production note

Historical production note:

Main body peaks 253/254, not 255; all three masks have genuinely transparent alpha-0 exterior.

<a id="v121"></a>

## V121 · Recorded prompt

Recorded prompt:

```text
Edit target: the attached generated Anima app design. Extract the warm ivory paper manuscript material as a production UI art asset, not a screenshot.
Keep only the large central paper's tactile fibers, very subtle warm natural grain, softly irregular cut edges, one barely visible offset second sheet and soft realistic cast shadow. Remove ALL English letters, text, gold ornaments, icons, actions, borders, app chrome, room, people and background. The center must be completely blank, suitable for live HTML text. Preserve the original paper's quiet warm-grey and ivory look, tactile but not yellow or brown vintage parchment. Straight-on orthographic flat paper, no perspective distortion. Fill a portrait-oriented rectangle roughly 4:5 with generous transparent margin for the soft shadow. True alpha transparency around the whole paper and shadow; no checkerboard baked in, no solid background. This will be stretched behind a live multiline manuscript and must read as the same paper material as the original design. The asset must contain no UI, no content, no text whatsoever.
```

<a id="v128"></a>

## V128 · Recorded prompt

Recorded prompt:

```text
Remove the entire shadow, glow, fringe and stray pixels around this paper. Output ONLY the physical blank ivory paper sheets as a clean cutout with absolutely no surrounding shadow at all. Keep the internal fibers and naturally uneven physical sheet edges and thin offset second sheet. The transparent area must contain zero isolated fragments, zero colored pixels, zero white chips, zero grey glow. The outer silhouette must be crisp anti-aliased neutral ivory-to-transparent. No chromatic red/yellow/green edge anywhere. Do not add a new shadow; a neutral CSS drop-shadow will be added later in the application. True transparent alpha outside the physical paper, completely blank center, no letters/symbols/UI/background. Preserve the paper's warm quiet material and shape.
```

<a id="v176"></a>

## V176 · Recorded production note

Historical production note:

Image edit/extraction from the project-generated study-paper design; transparent_background=true

<a id="v177"></a>

## V177 · Recorded prompt

Recorded prompt:

```text
Use case: background-extraction / precise-object-edit
Input image: the referenced study workspace mockup, serving as the target paper material.
Primary request: isolate the original blank warm-white paper material from that image as ONE reusable transparent PNG interface asset. Keep the beautiful delicate cotton fibers, slight natural deckled edges, very subtle thickness and window-light softness of the source sheet. Output ONE tall rectangular blank paper sheet, front-facing and almost orthographic, filling most of a portrait canvas with a small transparent margin on every side. Real alpha background is required.
Remove every letter, mathematical mark, underline, ruled line, note, character, UI control, window, desk, background, object and cast shadow beyond the immediate fine paper edge. The inside of the sheet must be completely blank and naturally near-white with fine fibers, low contrast, no yellow aging and no stains. Make all four softly irregular paper edges visible; avoid strong perspective, dramatic curls or folds. Keep the silhouette nearly rectangular so it can scale behind real HTML text. No typography or decorative symbols. Do not return the whole screenshot or a collage. This is the paper cutout itself, not a mockup preview; outside the sheet is transparent.
```

<a id="v178"></a>

## V178 · Recorded production note

Historical production note:

Runtime alpha paper surface behind genuine question, learner writing and current teaching text. No source content, character, typography or UI pixels are baked into this asset.

<a id="v181"></a>

## V181 · Recorded production note

Historical production note:

RGBA; transparent outside the isolated sheet, personally inspected. Not a screenshot used as an interface.

<a id="v183"></a>

## V183 · Recorded prompt

Recorded prompt:

```text
Extract only the soft watercolor night-campus footbridge from left A. Preserve grey-blue water, warm lamplight, bridge and trees, genuinely transparent softly feathered edges. Remove UI, text, page rectangles, borders, avatars and other illustration. Imaginary narrative art, not a real campus map or observation.
```

<a id="v184"></a>

## V184 · Recorded prompt

Recorded prompt:

```text
Extract only the second watercolor story illustration in left A: a mysterious umbrella figure under a golden lamp, imaginary grey-blue campus night, wet pavement and trees. Wide transparent watercolor with no UI, words, page, border or bridge. Imaginary narrative art, not a user portrait or real location observation.
```

<a id="v185"></a>

## V185 · Recorded production note

Historical production note:

Optional host-allowlisted narrative accents in a source-bound discussion. The model chooses an existing illustration; no keyword routing, arbitrary image URLs or runtime image-generation claim. The app uses copied project assets without Codex directories.

<a id="v186"></a>

## V186 · Recorded production note

Historical production note:

Generated for this project from its generated design reference; no third-party image was copied.

<a id="v188"></a>

## V188 · Recorded prompt

Recorded prompt:

```text
Use case: background-extraction.
Edit target / material reference: the supplied Anima letter-in-conversation design. Extract ONLY the actual softly textured ivory/warm-grey writing paper material used by the central letter. Remove ALL text, glyphs, source numbers, rules, icons, buttons, people, avatars, furniture, window, app chrome and interface. This output will be a real background skin behind live editable/rendered text, not a screenshot.
Create a perfectly front-facing blank paper sheet, filling about 98 percent of the canvas, with the same warm grey ivory tone, subtle fine paper grain and diffuse window-light falloff as the selected design. Rounded corners matching the original sheet, a very faint realistic soft shadow immediately around the edge. The sheet must be genuinely opaque; everything outside the sheet and its soft edge/shadow must be a true transparent alpha background. Do not place the sheet at an angle. No folded corner, no ornament, no ruled lines, no watermark, no text or imitation UI. Keep the paper calm enough for long reading. Landscape rectangular material approximately 3:2; tiny transparent margin only. Preserve the tactile paper feeling of the actual reference, not a flat vector block.
```

<a id="v189"></a>

## V189 · Recorded production note

Historical production note:

Actual paper/grain/light material behind live letter text; no screenshot UI or text is embedded.

<a id="v190"></a>

## V190 · Recorded production note

Historical production note:

PNG is RGBA with alpha range 0..254; read-only image metadata inspection. No Python image editing was used.

<a id="v191"></a>

## V191 · Recorded production note

Historical production note:

Generated for this user-authorized project from this task's synthetic design image. No external artwork supplied. May ship with the local desktop implementation; excluded from the public map preview.

<a id="v192"></a>

## V192 · Recorded production note

Historical production note:

Referenced by renderer/letter.css; live text, sources and controls remain normal React/OpenUI content.

<a id="v193"></a>

## V193 · Recorded production note

Historical production note:

2026-10-19: personally inspected this real material in the shared healthy isolated desktop app, then opened the actual owner footnote, observed its close fade, selected the original paragraph into the one composer while preserving a typed draft, cancelled the focus without changing that draft, dismissed the opportunity and reopened the same immutable letter from its original message. Root inspected the current rendering against the design and retained its continuous prose, paper, type and footnote relationship. No model request was sent. The observed source-panel bottom occlusion has a scoped scroll-margin source fix awaiting the next renderer update and targeted recheck; the new persistent selected-text mark is also pending that update.

<a id="v196"></a>

## V196 · Recorded production note

Historical production note:

Actual paper grain, deckled edge, light and shadow behind live message text

<a id="v197"></a>

## V197 · Recorded prompt

Recorded prompt:

```text
Extract only the single blank cream cotton-paper sheet from the supplied generated UI design as a reusable production graphic. Preserve the exact soft ivory paper color, fine tactile fiber grain, slightly irregular deckled edges, shallow lifted-paper warm shadow, and gentle side light. Remove ALL words, English letters, labels, rules, quotation marks, bubbles, buttons, branches, gold sprig, all UI controls, app frame, room and background. The sheet itself must stay fully opaque warm ivory; everything outside the ragged paper edge is genuine transparent alpha including around the subtle soft shadow. Show just this one clean blank rectangular sheet, filling about90% canvas, landscape ratio around1.35:1. No backdrop/checkerboard printed in pixels, no text, no watermark. This is the real paper material we will place live React text on, so preserve the exact paper appearance from the reference.
```

<a id="v198"></a>

## V198 · Recorded production note

Historical production note:

Small gold botanical ink ornament in the paper heading

<a id="v199"></a>

## V199 · Recorded prompt

Recorded prompt:

```text
Extract only the tiny delicate antique-gold botanical sprig at the top-left corner of the cream rehearsal paper in the supplied generated app UI. Make this one small fine graceful golden dried wildflower / wheat sprig into a real transparent-alpha production ornament. Preserve the exact hand-drawn gold ink shape and warm muted ochre color, its slight paper-ink texture, fine leaves and stems. Remove EVERYTHING else: no paper, no words, no app UI, no bars, no background, no frame. Tightly center the single sprig filling about80% of a tall narrow canvas, with transparent padding. Transparent alpha around and between every stem and leaf. No checkerboard printed in pixels. No extra elements, no labels. This asset will be placed at the exact top-left of the real live paper UI; not a screenshot.
```

<a id="v200"></a>

## V200 · Recorded production note

Historical production note:

Generated for this user-authorized local desktop implementation from synthetic project design; no external artwork or actual private conversation. Do not include in public map review deployment.

<a id="v201"></a>

## V201 · Recorded production note

Historical production note:

Artwork contains no dialogue or controls; all words, branches, actions and focus remain live React/OpenUI owner projections.

<a id="v202"></a>

## V202 · Recorded production note

Historical production note:

Generated assets personally inspected. Current integrated rendering and motion still awaiting same-profile visual check.

<a id="l02"></a>

## L02 · The selected room without its character

Recorded matching empty-room request:

```text
Edit ONLY the attached human-selected illustration to make its matching CLEAN EMPTY ROOM plate. Preserve the exact complete 1536×1024 landscape canvas, camera, perspective, architecture, window divisions, lakeside university view and clock tower, shelves, desk and wooden chair on the left, side table with ceramic lamp and cup, the full built-in window bench and cream cushion, both plaid pillows, knitted throw, foreground plants, woven rug, every floorboard and the soft afternoon light. This room, its intimate scale and its warm lived-in atmosphere are the new product's approved space.

Remove the silver-blue-haired girl completely, including all hair, ribbons, face, clothing, legs, socks, both shoes and her handheld open blue book. Remove only the shadows produced by her body, book and shoes. Reveal a plausible continuous empty cream bench cushion and the underlying natural wooden bench front and floorboards where she was. Preserve all room-owned objects and their real shadows, including the blanket and pillows. The empty cushion should look soft and gently used, with natural seams and a believable continuation of its existing folds.

The feeling remains: a cared-for room that has quietly kept a place for someone, sunlight held in the wood, an unhurried afternoon. No person, human remnant, replacement body, silhouette, face, animal, duplicate book, altered viewpoint, new furniture, UI, labels, buttons, text, guide marks, collage or border. Do not restage, zoom, crop or resize the room. One complete coherent image, matching the original composition exactly.
```

<a id="p03"></a>

## P03 · New prescription: extract only after anatomy is accepted

Proposal recorded as a new prescription, not a tool invocation:

```text
Use the anatomically approved complete room scene as the edit target. Extract only the character and objects actually held by her into true RGBA, preserving the entire original canvas, exact pixel position, silhouette and scale. This is extraction only, not a pose repair. Do not add or remove limbs, alter face or relocate feet. Preserve transparent gaps between limbs and furniture. Remove the room pixels and floor patches. Keep the separate clean room plate registered to the same full canvas.
```

<a id="k003"></a>

## K003 · Complete design brief associated with a kept original

Complete design brief associated with a kept original:

```text
Use case: compositing / background-extraction. Exact full-canvas RGBA production layer.
Input image 1 is the FULL 1536 x 1024 black-and-white technical opacity mask and is the EDIT TARGET. Its white figure silhouette, small far-right placement, source scale, empty margins, fine hair holes, two-leg gap and book silhouette are immutable. Input image 2 is the full same-size original room mother and supplies the ORIGINAL RGB COLOURS at the matching pixel coordinates only.
Convert this technical mask into a transparent colour layer: every BLACK pixel in image 1 becomes fully transparent, every WHITE figure pixel is filled with the colour of the corresponding same-coordinate figure pixel in image 2. Keep the narrow source silhouette antialiasing. Do not redraw or interpret the face, hair, uniform, book, limbs or shoes. The result must look like the original mother when placed back at x=0,y=0 over its clean background.
Preserve the mask's exact full-canvas geometry: x=1037..1475, y=236..791 approximate silhouette bounds, blank transparent left 1030 pixels, over 230 pixels empty above the head and below shoes. No enlargement or shift. This is not a close-up, portrait or character illustration request.
No contact shadow in this figure-only version. No aura, diffuse lighting field, outer glow, cast shadow, feathered oval or gray/white haze. Do not copy room RGB from outside the white silhouette. No room, cushion, bench, floor, furniture, pillows, blanket, lamp, window or landscape pixels. All spaces between hair strands, arms and body and the two legs must be truly transparent. Output one true RGBA PNG at exactly 1536 x 1024 with the exact original tiny far-right figure and held book.
```

<a id="k004"></a>

## K004 · Complete design brief associated with a kept original

Complete design brief associated with a kept original:

```text
Use case: background-extraction. Production layer extraction; exact source registration, NOT a new character drawing.
Input image 1 is the approved 1536 x 1024 mother. Return ONLY the exact visible Sakiko and her held open book as a genuine transparent RGBA PNG, keeping the full 1536 x 1024 canvas and every source position and source scale unchanged.
CRITICAL pixel geometry: the character occupies only a SMALL REGION ON THE FAR RIGHT of this wide canvas. Her source silhouette spans approximately x=1037 to 1475 and y=236 to 791. The left 1030 pixels of the image are entirely transparent. Top of her head remains near (1274,236), face centre near (1288,316), seated hips near (1298,576), supporting palm near (1447,584), leftmost shoe toe near (1040,758), rightmost shoe toe near (1111,780). The visible figure height is about 555 pixels, only 54% of the canvas height. Preserve the more than 230 pixels of transparent space ABOVE her head and more than 230 pixels BELOW her shoes. Do not fill the canvas with her. Do not recenter her. Do not enlarge her.
Exact original pixels/appearance: preserve the same face, expression, hair/ribbons, white blouse, navy cardigan, pleated plaid skirt, fingers, book and pages, legs, socks/emblems and two loafers. No redraw, new pose, changed face, leg extension or clothing changes. Keep each source outline and each visible hole between hair, arms, knees and legs.
Everything except her exact visible figure and held book must be transparent: remove the entire room, furniture, cushion, floor, pillows, blanket and lighting environment. This version extracts the FIGURE ONLY: no contact-shadow field, no new drop shadow, no white/gold aura, no outer glow, no soft luminous oval, no cushion or floor patch. Do not reinterpret the sunlit hair edge as a wide halo. Preserve fine strands with narrow antialiasing only. No black/white/grey background or checkerboard pixels. No crop, rotation, translation or resizing. Identical 1536 x 1024 source coordinates are required.
```

<a id="k035"></a>

## K035 · Complete design brief associated with a kept original

Complete design brief associated with a kept original:

```text
Use case: precise-object-edit. Create the clean environmental background layer for the input Keep design. Preserve only the intimate bookshelf niche, oak writing/display tabletop, brass warm lamp at upper right, sparse neutral book spines and small ceramic cup. Remove ALL UI navigation, buttons, icons, text, paper index/list, the large open notebook, all visible page writing, cat and character, printed photographs, clockface numbers. No words anywhere.
Recompose just enough so 85% of the scene is usable as a writing/display tabletop: a near front-facing softly lit oak/linen work surface spanning the whole lower 88% of the image. The bookshelf and lamp form a shallow upper edge and narrow outer side edges, not a huge banner. The central work area is quiet warm dark-to-light wood and natural cloth with low contrast grain, no fake rectangular sheets and no borders. Real content index and main note will be rendered as live panels on this table. Distinct from the window-seat cover, distinct from the big blank wall of the conversation and from the overhead calculation desk. Keep literary art and material refinement. Landscape1536x1024, warm apricot daylight, no green UI. Natural plant leaves only at edges and not across the actual main reading area. Do not retain silhouettes or ghost lettering of the removed panels.
```

<a id="k036"></a>

## K036 · Complete design brief associated with a kept original

Complete design brief associated with a kept original:

```text
Use case: lighting-weather. Exact same clean front-facing bookshelf writing/display desk as input. Change the complete scene into soft morning mist-blue indirect light; cool gentle shadows, natural brown oak, neutral books, no midday sunbeams. Keep exact camera, geometry, object positions and materials. Empty broad center stays completely empty, calm and low contrast for real UI content, not a new panel. Preserve literary painted material quality, not a flat color filter. No words, glyphs, readable book labels, UI, controls, dates, equations, characters, cats, paper documents, diagram or additional objects. Natural plants keep normal color; no green UI. Landscape1536x1024.
```

<a id="k037"></a>

## K037 · Complete design brief associated with a kept original

Complete design brief associated with a kept original:

```text
Use case: lighting-weather. Exact same clean front-facing bookshelf writing/display desk as input. Change the complete scene into soft rose-gold dusk with violet shadows and lit warm brass lamp; natural walnut, subtly warm books, no midday sunbeams. Keep exact camera, geometry, object positions and materials. Empty broad center stays completely empty, calm and low contrast for real UI content, not a new panel. Preserve literary painted material quality, not a flat color filter. No words, glyphs, readable book labels, UI, controls, dates, equations, characters, cats, paper documents, diagram or additional objects. Natural plants keep normal color; no green UI. Landscape1536x1024.
```

<a id="k038"></a>

## K038 · Complete design brief associated with a kept original

Complete design brief associated with a kept original:

```text
Use case: lighting-weather. Keep the exact clean bookshelf writing desk, camera, objects and empty work area from the input. Change the full scene into quiet night lamplight: deep walnut wood, warm brass lamp on at upper right, subdued cool charcoal shadows, warm natural highlights concentrated on actual surfaces. No sunshine or daytime leaf shadows, no white bright blank area, no flat color filter. The open center remains a broad clean quiet desk on which real UI paper will be rendered, no books/notebooks/panels in center. Preserve delicate literary art, reasonable contrast, subtle grain, flowers/plant natural at edges. Remove any readable book labels. No text, people, cat, UI, icons, buttons, screens, diagrams. Entire composition coherent nighttime,1536x1024.
```

<a id="k039"></a>

## K039 · Complete design brief associated with a kept original

Complete design brief associated with a kept original:

```text
Use case: precise-object-edit. Produce only the clean environment for a daytime schedule screen, based on the input's campus colonnade composition. Remove ALL characters, cat, paper notes, text, icons, calendar, event blocks, lines, arrows, controls, portraits, photographs and interface. Keep believable beautiful stone colonnade, distant autumn campus atmosphere, oak bench at right, architectural perspective, soft morning light.
The left/central writing plane of pale warm limestone from x=10% to72% must remain blank and low-contrast for a real HTML time-axis; allow it to be broad but integrated into architecture with no painted card border. The rightmost25% is open air and depth through arches, with a small empty bench. No huge full person and no window seat from home. Center floor and page safe area clear of leaves/objects. No symbols or readable text anywhere. 1536x1024 literary environment, soft apricot daylight, clean fine material, natural plant colors only at margins; no green UI. This is art, not a real map or factual photo of the user's campus.
```

<a id="k040"></a>

## K040 · Complete design brief associated with a kept original

Complete design brief associated with a kept original:

```text
Use case: lighting-weather. Keep exact camera, entire blank stone wall, campus colonnade arches, empty bench, plants and steps from the input. Change complete lighting to diffuse morning mist-blue daylight, soft light neutral limestone writing wall, overcast pale sky and mist in distant campus, natural muted autumn leaves, no hard sun shadows. Preserve natural material colors rather than flat tint. Blank wall stays empty and low contrast. No figures, cats, words, glyphs, readable signs, calendars, UI, controls, dates, charts or added objects. Literary painted environment,1536x1024. No green UI.
```

<a id="k041"></a>

## K041 · Complete design brief associated with a kept original

Complete design brief associated with a kept original:

```text
Use case: lighting-weather. Keep exact camera, entire blank stone wall, campus colonnade arches, empty bench, plants and steps from the input. Change complete lighting to rose-gold late dusk, warm mauve-neutral limestone writing wall still suitable for dark text, lavender shadows, apricot-pink sky in distance, warm lantern beginning to glow, no noon daylight. Preserve natural material colors rather than flat tint. Blank wall stays empty and low contrast. No figures, cats, words, glyphs, readable signs, calendars, UI, controls, dates, charts or added objects. Literary painted environment,1536x1024. No green UI.
```

<a id="k042"></a>

## K042 · Complete design brief associated with a kept original

Complete design brief associated with a kept original:

```text
Use case: lighting-weather. Transform the clean architectural schedule environment into a coherent quiet rainy evening. Keep exact camera, stone wall, arches, bench, steps and geometry from the input. Large blank left/central writing wall should be deep warm charcoal stone with subtle low-contrast texture, around #292c34, not a bright cream wall. Warm lantern at right lights the nearby stone and bench. Outside arches is blue-black wet evening with distant warm window lights and gentle rain sheen, no sunlit sky, no daytime sun shadows. Keep the broad left writing plane entirely blank for real readable calendar UI. No humans, cat, text, fake interface, controls, dates, circles, equations, readable labels or signs. Natural plants keep their normal muted colors at edges. Literary painted environment,1536x1024.
```

