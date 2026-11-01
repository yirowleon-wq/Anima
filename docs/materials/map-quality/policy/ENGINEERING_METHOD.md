# A unified map engineering method

This proposed project method synthesizes the research; it is not a quotation of a single standard or a claim of implementation. Named software is an optional reference. Inspect the actual technology stack, reuse existing reliable capabilities and avoid installing several GIS engines merely to appear thorough. This document does not authorize a new checker, test framework, fixture or geographic survey.

## A. Five fact and expression layers, with two cross-cutting constraints

Research basis: S05, S12–S17, S22 in the [historical register](../research/SOURCES.json).

| Layer | Holds | Cannot be replaced by |
| --- | --- | --- |
| Factual geometry | Coordinates, centerlines, grounded footprints, roof projections, facility boundaries, holes and actual spatial relations. | Inferring a real boundary from a screen outline or shadow. |
| Semantic classification | Road hierarchy; bridges, tunnels and passages; complexes, buildings and wings; paving, grass, woodland and water; composition and adjacency. | Guessing object class from color. |
| 2.5D/3D representation | Ground elevation, relative height, elevated base, roof, parts, declared geometry representation and their evidence. | Treating a layer number as meters or detail as truth. |
| Cartographic display | Semantic tokens, color, line width, shadows, labels, scale rules and selected/navigation state. | Moving features, altering physical widths or hiding objects to resolve display conflicts. |
| Interaction and navigation | Search, stable-ID selection, entrances, access conditions, routing graph, explicit origins, camera and information card. | Pixel contact as graph connectivity or a route aimed at the building center. |

Every important attribute needs a traceable evidence chain. Every acceptance result must bind the data, transformations, rules, generators and rendering versions it actually examined. Preserve mappings between source objects, canonical entities, derived geometry, render instances, labels, entrances and routing nodes. Something appearing in a screenshot does not establish its identity.

## B. Decide sources by attribute; there is no universal winner

Research basis: S01–S07, S26–S31. Some historical providers are anonymized in this edition; their restrictions are not transferred into an invented provider contract.

First establish lawful use, then compare fitness, directness, date, locatable precision, independence and consistency. Sources are not a vote. Several sites reusing one basemap form one geometry lineage. Distinguish capture/observation, publication and access dates; unknown dates stay unknown rather than becoming today's date. Evidence must be relocatable to a layer, feature, page, image region or visible part of a photograph. A domain or document title alone cannot support a particular attribute.

| Source type | Can preferentially support | Does not automatically support |
| --- | --- | --- |
| Official directories and labels | Names, identity, institutional association and entrance descriptions. | Precise footprint, height or current access. |
| Official schematic or 2.5D illustration | Complex composition, relative layout and recognizable features. | Real coordinates, north, angles, scale or grounded footprint. |
| Geographic/orthographic data with suitable rights and precision statements | Ground roads, boundaries and footprint candidates. | Current names, entrance purposes or occluded parts. |
| OSM vectors and edit history | Traceable entities, graph relations, classes and recorded contours. | Complete coverage, current conditions or reliable height for every object. |
| A specific commercial map product | Only the names, locations or comparisons its actual authorization permits. | Extraction, tracing into another database, caching or redistribution. |
| Aerial, satellite, street-level and public photographs | Visible features, candidate floors/roofs and local relations. | Automatic orthorectification, roof corners as ground corners, or publication date as capture date. |
| Architectural renderings | Design intent and the form at design time. | As-built or current reality. |
| User observations and annotations | The local fact the observer actually reports. | Infinite precision, whole-site inference or ownership of a third-party basemap. |
| Existing local materials | Reusable collection work and previous decisions. | Trustworthiness or public distribution rights merely because a file is in a repository. |

Create an attribute-level `claim_id` for each dispute: property, candidates, exact source locator, observation or original assertion, independent lineage group, capture date, error/unknown, adoption or rejection reason and affected entities. A building whose name comes from A, grounded outline from B, wings from C and height remains unknown has four claims, not one global “high confidence” label. Do not average conflicting coordinates. First distinguish different entities, dates, roof/ground meanings and datum mistakes, then retain the actual decision.

Evidence grades are per attribute:

- **E3:** direct, applicable measurement or explicit record, with a consistency check.
- **E2:** locatable observations independently corroborated, or a direct single source with an explicit uncertainty bound.
- **E1:** indirect estimate, schematic information or a single ambiguous observation.
- **E0:** unknown or unresolved conflict.

A name at E3 does not promote height to E3. Numerous weak sources do not automatically become E3. When evidence is insufficient, record relevant routes actually tried, findings, failure reasons and a promising next route. Do not demand an arbitrary three sources per object, stop after one failed search or repeat ineffective searches indefinitely. Keep unsupported critical facts blocked while progressing on independent work.

## C. Establish the common reference before changing geometry

Research basis: S02–S07.

Record provider-specific datum conversion, map projection, image registration and local render origin/axes as separate operations. A provider's geographic or projected output cannot be made correct simply by assigning a convenient EPSG label. For every input chain retain format and declared CRS, axis order, units, origin, provider conversion, canonical datum, target projection, vertical datum and implementation version. A brand does not establish every product's output coordinates.

A canonical interchange layer may use explicit WGS84 longitude/latitude. Distance, area and tolerance work needs an appropriate local measured coordinate system or validated surface geodesy. Rendering may use Web Mercator or local coordinates; do not assume its units equal uncalibrated physical road meters. A project-specific projected XY JSON file must declare that format rather than call itself RFC 7946 GeoJSON.

Image registration proceeds as follows:

1. Decide whether the image qualifies as geometric evidence. A schematic may support identity and adjacency; without demonstrated geometric consistency it cannot support precise contours.
2. Choose stable ground control points identifiable in both sources, distributed through the center, edges and directions. Roof displacement, tree canopy, water level, shadow, text or temporary construction cannot silently become ground control.
3. Separate fitting points and independent check points. Save coordinates, exact original/screenshot locator, selection reason, uncertainty and date. The mathematical minimum number of points is not sufficient validation by itself.
4. Compare explainable model families from simple to complex: translation/similarity, affine and a homography suitable to a planar image. Local nonlinear deformation needs extra evidence; do not warp roads merely to force every point to match. A homography cannot correct every height displacement in a real 3D building.
5. Report independent residual vectors, RMSE, P95, maximum and spatial distribution, alongside separately named fitting error. Inspect systematic rotation, scale, edge extrapolation and local folding. Never combine fitting and independent errors into one flattering result.
6. Before modification, freeze use-specific thresholds from control quality, resolvable detail, intended use and source precision. Record units, calibration members, rationale, approver and version. Estimate unknown source accuracy only with evidence or leave it unknown; do not self-award centimeter precision.
7. Save transform parameters, input and control-point hashes, applicable extent and version. All dependent objects use this chain. Per-building hidden offsets are high-risk exceptions. A reference change invalidates its dependent results.

Fusion is not stacking layers. Find candidate correspondence from proximity, shape, name, class and relations, then decide attributes and geometry. Ambiguous correspondence stays pending. A matching radius is not an automatic snapping distance. Preserve one-to-many and many-to-one source-ID mappings when combining old and new entities, preventing duplicate roads and buildings.

## D. Roads: constrain geometry, graph and display separately

Research basis: S10–S11, S22.

A road segment minimally needs stable ID, centerline, road class, permitted mode, measured/estimated/unknown width, width definition, vertical relations, endpoint types, source, render-object mapping and routing-edge mapping. Model supported sidewalks, medians, parking strips, stairs, entrances and traversable plaza surfaces independently; every line is not a vehicle road.

Keep physical width separate from cartographic width. In a continuous semantic segment without a junction, lane change, narrowing or bridge approach, inspect unexplained width-profile anomalies. Width events need evidence rather than self-justifying “it widens here.” Before modifying real widths from an image, exclude perspective, zoom, casing, duplicate drawing and mixed pixel/meter treatment.

Road surfaces can derive from evidenced centerlines/widths or a checked polygon. The two representations must not coexist unconstrained. Junction paving and seams need a shared treatment of cap, join and casing; laying one round cap over another road is not a proper junction. A large plaza is not an arbitrarily wide centerline. Traversal needs a supported travel domain and obstacles.

Graph review includes endpoints, isolated components, same-level intersection nodes, false links, duplicate edges, outside continuation, direction/access and entrance reachability. Classify ends as real ends, gates, stairs, construction, continuation outside scope or missing data. Boundary roads require ports and continuation explanations rather than suppressed disconnection warnings.

Bridges, tunnels, elevated links and passages require relations and factual evidence. A 2D intersection generates a candidate; incompatible physical occupancy at the same elevation establishes an illegal conflict. `layer` is a relative relation, not measured height or a z-index used to conceal error. Crossing a ground road does not automatically connect a bridge; a real bridgehead must connect to the correct graph. An unknown grade relation is unchecked, not presumed legal.

## E. Building complexity cannot exceed attribute evidence

Research basis: S12–S17.

| Project evidence band | Minimum factual support | Permitted expression | Invalid substitute |
| --- | --- | --- | --- |
| F: planar | Checked grounded/projected outline, with the distinction retained. | Footprint, courtyard holes and identity. | An arbitrary rectangle called simplification. |
| B: simple mass | Reliable contour; sourced height or an explicit reviewable estimate interval; base-height basis. | Flat roof or a simple supported extrusion. | Random defaults called trustworthy LOD1. |
| P: wings/parts | Each extent, height relation, membership and connection. | Supported buildings, links, elevated parts and platforms. | Building parts invented from triangulation or concave corners. |
| D: detail | Locatable evidence for roofs, facades and appendages. | Detail actually supported by the source. | Unsourced protrusions, window grids or setbacks added for a technical appearance. |

These are project evidence bands, not claims of equivalence to all CityGML LOD definitions or certification. Display LOD and factual confidence are independent. Near detail and distant simplification cannot introduce unsupported facts.

Do not extrude both a complete parent outline and its parts as duplicate whole buildings. Grounded footprint, horizontal cross-section/projected envelope at another elevation and roof coverage are different quantities. Some building outlines represent the projected union of parts; retain the source's meaning rather than automatically importing it as grounded footprint. Supported overhangs and elevated links may exceed the grounded base, but need membership, base/clearance and evidence. Do not enforce “all projection lies inside footprint” so strictly that it deletes real structures. Courtyard holes remain open at the elevations where they are actually open.

When height is unknown, retain checked planar geometry and mark height unresolved. Only an explicitly approved, clearly identified range of schematic proxy heights may support a uniform explainable proxy. It cannot count as trustworthy 3D completion. Flattening everything to pass intersections is prohibited; so is calling a simple incorrect contour restrained LOD1. Insufficient massing evidence for a required key building still blocks that goal.

## F. Rule-based grounds, vegetation and water

Research basis: S18–S21.

A track is a facility assembly: boundary, running ring, infield, confirmed markings, stands/platform, entrances and connecting spaces have separate roles. Two facilities share generation/display rules while lane count, curvature, infield offset, stand shape and entrances are verified independently. Do not force symmetry or copy a platform that does not exist.

For repeated courts, first verify sport, count, orientation, effective playing area and surrounding buffer, then use shared parameterized marking templates. Standard dimensions support plausibility and template rules; they do not establish that the actual facility complies. Clip lines to the correct surface, inspect closure, tangency and parallelism, and show comparable markings under the same relevant scale rules. Do not repair only the named example.

Grass, canopy, woodland, shrubs, paving, parking and water are not one ambiguous colored polygon. Trace uncertain surfaces to source and generator. Remove confirmed decoration where appropriate; do not delete suspected real geography merely to clean the image. Natural features may legally meet roads/buildings. Canopy cover and grounded occupancy need distinct relations. Water surface, linear channel, shoreline and bridge deck are separate. Islands use holes/relations rather than a raised display layer.

A small object with a clear class and no proper name can use stable ID plus `name_status=not_applicable`. A road/building whose required name is unknown uses `unknown` and remains pending. Do not invent names for every unnamed object or use “unnamed” to hide an unidentified class.

## G. Dark warm gray/gold semantic tokens

Research basis: S22, S24. Preserve the existing dark warm direction; do not replace it with a generic white navigation UI. Extract existing color/material roles first. This method specifies meanings, not uncalibrated final hex values. Current Anima theme and no-green-interface constraints remain in force; natural vegetation is geographic content, not a green UI accent.

| Token family | Stable meaning | Constraint |
| --- | --- | --- |
| `base.ground` | Dark warm ground. | Not road or shadow. |
| `road.primary / secondary / walk / casing` | Hierarchy, travel surface and cartographic edge. | Stable weight; physical and pixel width remain separate. |
| `building.roof / wall / outline` | Roof, side and outline. | Warm stone/gray/gold; light and a shared material govern variation, not random entity IDs. |
| `land.grass / canopy / wood` | Evidenced vegetation types. | Restrained supporting land colors, never the interface's primary accent. |
| `water.surface / bank` | Surface and shoreline. | Distinguishable from grass/paving through luminance, texture or edge. |
| `paving.plaza / parking` | Paved plaza and parking. | Related to roads without being identical. |
| `sports.surface / marking` | Sports surface and rule-derived lines. | Common class rules, with supported parameter differences. |
| `state.selected / hover / route / location` | Interaction state. | Gold highlighting/glow reserved for declared states or purposes. Location state does not authorize location collection. |
| `effect.shadow` | Derived lighting/volume shadow. | Can be disabled for inspection; not a factual land layer or routing input. |
| `audit.unknown / issue` | Audit-only uncertainty/problem. | Cannot substitute for final geographic expression. |

Stable meaning does not require every lit pixel to be identical. Compose transparency, shadow, outline and glow from tokens; explain state changes. Avoid unregistered per-object exceptions. Separate raw neutral palette, geographic semantics and interaction states. Legends, selection feedback or a focused shadow toggle help inspect meaning only when they have a useful role; this is not a request for permanent extra buttons.

## H. Labels, generalization and interaction

Research basis: S22–S25.

Freeze at least site/zone/block/close scale bands, calibrated to the actual engine's zoom or ground resolution rather than copied numeric zooms. Prioritize current target/route, major roads/landmarks, ordinary buildings, then parts/micro-facilities. Inspect dense areas too; a huge selected name cannot permanently displace nearby roads.

Labels retain target ID and anchor, distinguishing organizations, complexes, buildings and parts. Collision review uses laid-out projected text boxes, occupied UI space and oblique orientation. Try candidate anchors, abbreviations and scale hierarchy before suppressing lower-priority labels. Essential hidden names need another reachable means of identification. Hiding everything is not collision-free success.

Generalization creates derived geometry only; canonical facts stay intact. Simplify shared boundaries together and retain key junctions, bridgeheads, entrances and holes. Inspect tile/LOD boundaries for cracks, flashes, clipping and label jumps. Static frames locate spatial faults; continuous interaction establishes transitions. Recording a video after every building change is unnecessary.

Search, selection and information must identify the same entity; route through an evidenced traversable entrance. Distinguish unavailable position, an origin outside coverage, an explicit manual origin and virtual or imported positions with their own source and freshness. Never fabricate a fix or convert simulated movement into real arrival. Keep OS location services and permissions off, including on emulators and guests. A card remaining after panning is not inherently wrong; inspect intended behavior and its spatial reference before clearing selection.

## I. Derive object state from evidence and results

Research basis: package synthesis, with S08, S16, S32–S33 supporting validation and version isolation.

The principal progression is:

`UNINVENTORIED → INVENTORIED → SOURCE_REVIEWED → MODELLED → GEOMETRY_VALID → TOPOLOGY_VALID → NEIGHBOR_VALID → CLASS_CONSISTENT → VISUAL_VALID → ACCEPTANCE_READY → ACCEPTED`.

`SOURCE_BLOCKED`, `CONFLICT_BLOCKED`, `FAILED` and `STALE` are independent blocking/invalidity dimensions, not mandatory steps in the progression. `N_A` means a typed rule genuinely does not apply, with a reason; it is not PASS. Only the actual designated acceptor sets final acceptance. A responsibility family submits at most `MERGE_READY`.

Each result minimally references object/batch membership hash, geometry hash, relevant attribute hash, source-decision version, alignment version, rule version, generator version, render/style hash, executor/time and result locator. A manually assigned state string proves none of these. Upstream changes mark dependent results stale. Repairing a building requires revisiting affected roads, ground, labels and entrance routing. Recompute applicability and coverage after integration.

An absent applicable check, empty evidence, old version, unknown neighborhood, critical conflict or blocking issue prevents readiness. `__UNSET__`, `template_only=true`, empty demonstrations and sample records do not count as completed coverage.

## J. Define the denominator before claiming coverage

Research basis: the package's coverage/statistical design, not an original source's measured site coverage.

Build scope from canonical enumeration, runtime generator mappings, historical objects and independently found missing-feature candidates. Do not count only currently visible objects or add repeated source and LOD entries. Normalize real entities to one primary ID. Keep unresolved external candidates in a distinct candidate set until they are mapped to an existing/new entity or excluded with evidence. One entity's many meshes/LODs are not multiple completions. Generated trees, windows or markings retain rule ownership and full membership hash; every triangle need not have a prose report.

Use three coverage views: zones with geometry and neighboring buffers; classes spanning a shared defect mechanism; and individual critical/anomalous entities. Zone union must cover the frozen AOI. Explain empty areas as checked open ground or missing information. Define any surrounding navigable extent independently; do not exclude difficult areas silently.

Apply suitable existing automatic scans to the full applicable set. Individually inspect major roads, bridges, entrances, complex buildings, sports facilities, all anomalies and user-reported regions. Repeated ordinary objects use rule review plus spatial distribution, parameter extremes, boundaries and reproducible random samples. A sample records actual member IDs, seed, exclusions and unsampled count.

An optional dated calibration is `ceil(log(0.05) / log(0.95)) = 59` uniformly random members for at least 95% probability of finding a homogeneous defect affecting at least 5%, under those sampling assumptions; inspect all if fewer exist. This is neither a universal quota nor a no-defect guarantee, cannot replace critical-object review and cannot justify omitting a whole zone through arbitrary stratification. One systematic failure expands review to the affected generator/class and calls for a shared-rule repair. Do not call unsampled entities individually viewed. Distinguish `individual_human`, `sampled_human` and `rule_covered`; members inherit only actual rule-level conclusions. The illustration does not authorize new sampling/test infrastructure now.

Keep tombstones, source mappings and approved reasons for deletions/merges; include new entities in scope. Reconcile `opening + added - evidenced merged/retired = closing`. Disclose hiding, LOD reductions, reclassification, clipping and disabled layers without letting them inflate completion. Excluding an external candidate needs evidence comparable to including it.

## K. Quality review and efficiency

Research basis: S08–S09, S16–S17, S22–S25.

Reuse existing geometry capability: spatial indexing finds candidates, then a precise operation evaluates them. Each rule must address a real failure mode. The historical design called for a known failing witness and a legitimate/boundary witness to establish that a checker can detect and discriminate; this document does not create such cases or fixtures. Use existing witnesses and direct execution where authorized. A failed result identifies feature, position, value, criterion, evidence gap and next action. Large existence-only regressions add no geographic assurance.

After a repair batch, revisit affected objects, dependent neighbors and the shared rule. A global reference, shared generator, topology algorithm or integrated-version change triggers the corresponding broader scope. A cheap whole-set geometry pass and an expensive full-flow recording are different costs. Video is not geometry evidence; use it only for camera/LOD/label dynamics or one necessary integrated demonstration.

Human review uses normal finished rendering, a focused semantic/entity-ID audit view, and source/before-after views. Retain center, scale, bearing, pitch, viewport, device pixel ratio and state. Choose overhead and revealing oblique views for the question, not a mechanical 360-degree rotation. Attach question, conclusion, entity IDs, version and view to useful screenshots; repeated similar frames do not add coverage. Difference views locate change rather than rejecting an intended repair merely because pixels differ.

## L. Responsibility topology, risk and final gates

Research basis: S32–S33; the ownership, risk and release rules are a project synthesis. See the current-authority explanation in the [map materials README](../README.md#current-authority-and-future-work).

Establish baseline and shared record contracts first. Family A stabilizes sources/alignment before B roads, C buildings and D grounds write independent ranges. E styling/labels can study read-only early and write after entity interfaces stabilize. F independently reviews from baseline without silently editing production facts. Do not force six concurrent writers when file boundaries cannot support them.

The integration owner maintains shared IDs, partitions, severity, reference transforms and gates, and decides cross-domain conflicts. A family cannot move another family's boundary to pass its own check; hand off the issue. When road and building claim the same space, decide evidence and neighborhood semantics rather than letting the last merge win. One writer owns a production file. Independent ledger increments may be merged/deduplicated by the integrator; avoid concurrent writes to one shared ledger.

- **P0:** unproven coordinate chain; privacy/license blockage; damaged data; core navigation failure.
- **P1:** confirmed illegal spatial relation; missing major feature; clearly unsupported massing; systematic styling/label failure; unaudited critical area.
- **P2:** low-risk detail or noncritical unknown with stated scope, impact and next evidence route.

Lowering severity needs new evidence and an independent reasoned review. A confirmed visible error cannot become P2 merely because repair is slow. The integrator cannot approve its own unresolved critical doubt as a legal exception.

A release candidate simultaneously requires reconciled frozen scope; suitable lawful sources and transformations without critical conflict; fresh executed applicable results; zero P0/P1; real individual critical-object and complete required zone/class review; no unchecked area; no fabricated complexity or concealed issue; all work in one integrated version; disclosed residuals; reviewable rights; and final adversarial human review. A limited P2 delivery needs actual designated acceptance and cannot be described as flawless.

Work status can be `BLOCKED`, `IN_PROGRESS`, `RELEASE_CANDIDATE` or, after the actual decision, `USER_ACCEPTED`. A client/plugin goal mechanism cannot be reprogrammed by prose; its stopping signal is not acceptance. On an actual interruption or blocker, save a recoverable checkpoint and honest remaining scope. Neither session compaction, waiting nor a local tool failure establishes terminal session failure; current session-recovery rules remain authoritative.
