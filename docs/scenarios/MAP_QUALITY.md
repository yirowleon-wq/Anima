# Map quality directions

These **28 directions are preserved design requirements, not executed checks or a new checking framework**. They apply to Anima's lawful imported data and shared map surface. A synthetic demonstration is labeled synthetic; it is not a real campus survey. This document contains no original campus entities, geometry, personal places or trajectories. Use existing project/GIS tools and focused direct observation; new test code, fixtures or runners need explicit authorization.

## Keep the layers distinct

| Responsibility | Authoritative meaning | Cannot substitute for it |
| --- | --- | --- |
| Source and claims | Actual source identity, lawful use, dates, exact locator, uncertainty and a reasoned attribute decision. | A website title, repeated copies of one source, or possession of a file. |
| Canonical facts | Coordinates, centerlines, grounded footprints, roof projections, holes and actual spatial relations, each with a declared meaning. | A screen outline, shadow or convenient generator default. |
| Semantic relations | Road mode/class, entrances, bridges/tunnels, buildings/parts, ground use, adjacency and ownership. | Color, proximity or a drawing's apparent connection. |
| Derived display | Meshes, simplification, labels, materials, lighting and state styling, retaining canonical IDs. | New physical facts, moved features or altered actual road widths. |
| Navigation and interaction | A versioned graph, real access relations, stable selection, manual origins, routes and camera ownership. | Pixel contact, a route to a building centroid, arrival or action acceptance. |
| Source tools and generators | Versioned transformations and derivation rules with actual input/output provenance. | Independent reality evidence or permission to conceal a defect. |

For important attributes, decide source suitability individually after lawful use is established: directness, current applicability, precision, independent origin and consistency matter. A directory may establish a name without establishing height; a roof photo is not automatically a ground footprint. Separate capture, publication and retrieval dates. Resolve conflicting identities, periods, datums and ground/roof meanings before selecting a value; averaging coordinates is not a conflict decision. Record unknowns and a useful next source without demanding an arbitrary number of sources for every feature or repeating ineffective research indefinitely.

Every material conclusion should identify the applicable feature set, source/geometry/transform/rule/generator/display versions, actual observed result, witness and remaining uncertainty. These are facts needed to understand a conclusion, not a mandate for a parallel audit database. Empty queries, missing fields, unloaded resources and failed operations do not establish success. Count one canonical entity once across meshes, levels of detail and repeated sources. A removed/merged entity keeps a reasoned mapping; an unresolved missing-feature candidate cannot disappear from scope.

Coordinate datum conversion, projection, image registration and local rendering axes/origin are separate operations. Declare axis order, units and vertical meaning. Use a suitable measured analysis space for distance and area; rendering units are not automatically real ground meters. RFC 7946 describes WGS84 geographic coordinates in decimal degrees, so a project-specific projected XY file must declare its own format rather than claim that interchange semantics. [GeoJSON specification](https://datatracker.ietf.org/doc/html/rfc7946)

## Q01–Q28

### Q01 · Missing, duplicated or silently removed objects

Compare source features, canonical IDs, generator membership, runtime pick IDs and independently discovered missing candidates. A generated micro-instance may belong to a batch if the full member mapping remains available; an actual demolition needs evidence. Report missing/duplicate IDs, source locations and set differences. Complete the direction by repairing mappings/data and reconciling the full applicable denominator, not by hiding objects or counting screenshots.

### Q02 · Mixed datums, axes or units

Inspect every source-to-canonical-to-render transformation and independent point residuals, including directional bias. A local coordinate frame is acceptable with a reversible or clearly explained mapping; provider identity alone cannot determine coordinates. Preserve source, control point, displacement vector and affected extent as witnesses. Repair the shared conversion chain and retire all dependent outdated conclusions.

### Q03 · Overfitted image registration

Separate fitting points from independent check points and inspect edge behavior, local scale and folding. Compare simple and more complex justified transformations. A schematic can establish identity/adjacency without qualifying as precise geometric evidence. Retain held-out residuals, parameters and applicability extent. Reduce model complexity or refuse geometric use when unsupported, then reconsider the full same-source area.

### Q04 · Invalid planar geometry

Use an existing suitable geometry implementation to inspect self-intersection, closure, hole placement and broken rings, with separate diagnostics for duplicate vertices, zero-length edges and spikes. A short edge or duplicate vertex is not automatically the same as a standards-invalid shape. Report exact reason and coordinate/edge location. Repair against the original contour, then inspect changes in area, holes, neighbors and component count. A library's validity result has its own geometry-type rules and error information; it is not a reality judgment. [GEOS validity reference](https://libgeos.org/doxygen/classgeos_1_1operation_1_1valid_1_1IsValidOp.html)

### Q05 · Winding and triangulation disagree

Inspect the chosen output format's ring conventions, actual rendered normals and triangulation of courtyard holes. Normalizing ring order need not change shape. Do not label a real-world feature incorrect solely because an older input uses reverse winding: GeoJSON specifies orientation while recommending compatible reading of older polygons. Retain ring identity and anomalous faces, repair export/triangulation and revisit all output of the same generator. [GeoJSON polygon rules](https://datatracker.ietf.org/doc/html/rfc7946#section-3.1.6)

### Q06 · Duplicate shapes, slivers and unintended coverage seams

Use spatial candidate lookup for near-duplicate contours and for gaps/overlaps only in areas expected to cover the same space. Open ground between buildings is not a gap that must be filled; administrative extents may contain features. Record duplicate pairs, area differences and intended shared boundaries. Resolve duplicate origins or repair common edges, then inspect the adjacent area rather than patching one screenshot.

### Q07 · Unsupported physical road-width jumps

Fix width meaning, units, measured direction and sampling before examining the width profile of one semantic segment. A junction, bridge approach, lane or actual paving change can justify a discontinuity with its own source. Report road ID, position along it, before/after width and missing event. Repair source properties or the actual road surface and revisit that class and neighboring segments. Do not force real narrow bridges to uniform width.

### Q08 · Displayed road seams and joins

At a controlled scale and overhead view, inspect caps, joins, casing, repeated line/surface drawing, render order and pixel-to-meter treatment against actual pixels. Perspective and road hierarchy can justify screen-width differences. Retain layer ID, seam position, both parameter sets and view. Repair the common style/junction derivation and inspect comparable joins. A display fix does not certify physical width.

### Q09 · Unexplained dead ends and disconnected components

Inspect endpoint degree, components, area-boundary ports, entrance connections and relevant origin/destination reachability. Distinguish genuine ends, closed gates, walking-only branches and documented continuation outside coverage. Record nodes, components and affected routes. Repair supported graph/source relations and reconsider the graph and entrances. Endpoint degree alone is a candidate, not proof of an error.

### Q10 · False junctions or false grade separation

For a geometric crossing, compare shared nodes, level relations, bridge/tunnel roles, base elevation and travel semantics. Evidenced crossings at different levels stay disconnected; passages beneath structures need real conditions. Retain intersection, both IDs, relation and evidence gap. Resolve the fact before changing connectivity. Adding a layer number merely to suppress a warning is not completion.

### Q11 · Roads intersecting buildings or bridge structures

Use 2D intersection to find candidates, then inspect actual travel corridors and occupied vertical envelopes. Casing and shadow are not occupied ground. Courtyards, passages, arcades, elevated links and eaves require their own relation/clearance evidence. Preserve overlap geometry, length/area, both IDs, vertical intervals and uncertainty. Repair confirmed conflicts after source judgment, or keep unknown relations unresolved; revisit both objects and their entrance neighborhood.

### Q12 · A route graph detached from physical travel space

Map routing edges to actual roads/traversable surfaces, modes, directions and access conditions, reaching a verified entrance. A plaza crossing needs a supported travel domain and obstacles; unknown gate access cannot become always-open. Report unsupported edges, illegal route segments and entrance IDs. Repair graph/interaction relationships and reconsider connectivity and affected journeys. Drawing through a building center is not access.

### Q13 · Distorted building contours

Compare grounded footprint and roof projection separately against suitable registered sources. Look for missing wings and holes. Overhangs are not automatically grounded footprint, and occlusion does not justify inventing a rectangle. Retain difference areas/edges, exact source locator and positional uncertainty. Repair canonical contours and reconsider nearby roads and grounds.

### Q14 · Duplicate parent and part extrusion

Inspect building outline/part mappings, volume distribution, complete membership and duplicate faces. Part projections can legitimately overlap in a composite building or at different elevations; deleting all overlap is wrong. Record parent/child IDs and actual conflicting volume/faces. Repair relationships or derivation and inspect every equivalent structure produced by that logic.

### Q15 · Unsupported height and invented complexity

Trace each height, setback, roof and appendage to a specific source-backed claim. An explicitly reviewed schematic proxy can display with its proxy identity but cannot count as trustworthy 3D completion. Unusual real architecture cannot be deleted from intuition alone. Record unsupported parameters and exact missing sources. Obtain evidence or reduce only unsupported detail while preserving the open goal; examine the class of affected complex structures.

### Q16 · Invalid geometry for the claimed 3D representation

Choose rules from the actual representation: inspect normals, degenerate faces and self-intersection, applying closed/oriented-solid requirements only when a solid is claimed. Intentional open surfaces need not be watertight, and multipart representation rules must be checked rather than assumed. Preserve face/edge/volume identity and the applicable rule. Repair mesh/triangulation and inspect shadows, picking and same-generator models. Geometric validity is distinct from source accuracy and readability.

### Q17 · Conflicting neighborhood or hierarchy semantics

Inspect declared contains, part_of, adjacent, crosses_above and entrance_of relations and shared edges. Parcel/administrative boundaries may cross a building, and canopy differs from grounded occupancy. Report both IDs, conflicting relation and missing meaning. Resolve sources and relationships, then jointly review neighboring partition boundaries rather than letting each owner dismiss an edge case.

### Q18 · Missing or distorted sports facilities

Enumerate facilities by actual sport and inspect components, markings, number, orientation, track inner/outer boundaries, infield and entrances. Two fields may genuinely differ. A standard template checks plausibility but does not measure the real site. Preserve missing component slots, escaped markings and parameter/fact conflicts with class membership. Repair shared generation and each instance's supported parameters, then examine the whole relevant class.

### Q19 · Unknown land surfaces or confused water/ground

Require each surface's category, source and occupancy meaning. Separate water, shoreline, shadow, canopy and paving. A category with no proper name can be valid; an island needs a hole or explicit relation, not a cosmetic layer shift. Retain unknown surfaces and generator locations. Add supported semantics or remove only confirmed decoration, then review the same source/generator. Apparent cleanliness cannot justify deleting suspected real features.

### Q20 · Arbitrary or inconsistent styling

Compare semantic tokens and actual implementation, including object-level overrides, conflicting reuse and state colors. Real light can change pixels; selection/hover is a state, not a new material. Preserve feature/token/code location and any justified exception. Repair shared tokens and inspect normal and reduced-color views. Keep warm neutral/gold relationships and the four-theme product language; natural vegetation colors may depict land without becoming green interface accents. Never move facts to hide a style conflict.

### Q21 · Labels point incorrectly, collide or disappear

Inspect laid-out text bounds, target entity and control occlusion across meaningful scales and camera poses. Prioritize the current target/route, major roads/landmarks, ordinary names and small parts, checking dense areas. Low-priority labels may hide by rule; essential identity needs another reachable representation. Retain label/entity/view, occluder and suppressed priority. Repair anchors/placement and inspect dense neighborhoods and relevant scales. Hiding every label is not collision-free success.

### Q22 · Simplification, level transitions and tile cuts change meaning

Compare canonical and derived geometry while preserving shared edges, holes, important junctions, bridgeheads and entrances. Legitimate omitted detail is not an absent entity and cannot change canonical IDs. Record disappearing/cracked areas, threshold, parent/child level and transition state. Repair derivation, inspect relevant whole-level/boundary coverage and directly exercise the transition. A static final frame cannot establish no flicker or jump.

### Q23 · The selected target drifts across interaction

Follow search → selection → information → entrance → route using the same stable entity. Handle unavailable position, out-of-coverage origins, manual origins and virtual or explicitly imported positions honestly, without enabling OS location services or granting permission. Preserve source, quality, expiry and unknown status; virtual movement does not establish real arrival or official activity credit. A selection card remaining after panning can be intentional if its spatial reference remains clear. Preserve the actual reproduction path and ID break. Repair state/relationship logic and repeat that affected ordinary workflow, not every unrelated control.

### Q24 · Old results or branch success masquerade as integration

Compare the hashes/versions of reviewed objects, rules, sources, transformations, generators, styling and integrated implementation. Reuse only with actual unchanged-dependency evidence; otherwise retain stale status. Record the invalidated result and dependency difference. Recheck affected scope and final integrated relationships instead of changing only a report date. A conflict-free source merge proves neither spatial compatibility nor final product behavior.

### Q25 · Rights, attribution or private content is lost

Inspect each selected asset's allowed use, derivation/distribution terms and required attribution against actual submitted and public artifacts. Software licenses and geographic-data rights are distinct; a source link alone grants neither. Keep exact relevant clause/asset location while avoiding disclosure of secret body content. Isolate, replace or obtain the real missing permission, then review the affected artifacts again. Choose tools on their capabilities, evidence, dependencies and applicable terms.

### Q26 · A quality method claims success without detecting its failure mode

Where an existing check is used, confirm it identifies the actual bad object's location while not flagging a legitimate exception. When reality cannot be judged automatically, state that human review is required. Preserve false-positive/false-negative witness and rule identity. Repair a demonstrably faulty existing mechanism and retire dependent old conclusions. This direction does not authorize creating new cases, fixtures, assertions or a framework; use direct outputs and existing evidence where new test development is not authorized.

### Q27 · Repair stops at the area someone happened to point out

Use the failure's rule/generator/class/parameter fingerprint to locate the actual applicable class and partitions. Screenshot count is not scope. A claim of no related objects needs a complete justified enumeration. Record omitted IDs/areas and missing inspection layer. Correct the shared cause and complete applicable class, partition and object coverage, preserving a distinction between sampled and individually viewed members.

### Q28 · Severity, deletion or exceptions conceal unfinished work

Compare original and final severity, retired items, inapplicability, exception decisions and reproduction evidence. New evidence can show a candidate was never a defect, with a reviewable decision; effort alone cannot lower severity. Record changed classification and missing authorization/evidence. Restore genuinely unresolved blockers and obtain independent judgment for a material exception. An approval form is not an actual approval.

## Operational meaning without another implementation

**Registration:** derive residual vectors from the same declared measured space, retaining fit/check membership, bias, RMSE, distribution and maximum difference. Do not rename fitting points as held-out points or print unstable percentiles with false precision. Verify orientation, scale, reversibility/applicability and edge behavior. When source uncertainty exceeds a detail's scale, narrow the accuracy claim instead of inflating tolerance.

**Widths and connectivity:** inspect physical width profiles separately from pixel casing/join behavior. Build the graph from evidenced shared nodes and traversability, not touching pixels. Calibrate any snapping distance to data uncertainty and local spacing within eligible semantic relations. Nearby parallel paths, separated doors and crossing levels cannot be connected by distance alone. Unknown relations remain unknown rather than defaulting legal.

**Physical conflicts:** spatial indexes/bounding boxes locate candidates, while actual occupied surfaces and vertical relations decide conflicts. Grounded building area differs from roof projection; road centerlines can miss an actual road-surface intrusion. Retain witness geometry, both objects, measurement uncertainty and the exact supported exception.

**Building evidence:** separate a checked planar footprint, a simple supported volume, supported parts and sourced detail. These are project evidence levels, not claimed standards certification. A parent outline, grounded base, elevated envelope and roof have distinct meanings. Preserve courtyard openness at relevant elevations and real supported overhangs/clearance. Honest 2D remains useful when height is unknown, while the unmet richer-geometry objective stays open; neither random height nor indiscriminate flattening completes it.

**Whole-area and class coverage:** declared partitions cover the chosen area and overlapping boundaries receive joint review. One entity has one primary ID. A shared defect expands to every affected generator/class member; ordinary sampling cannot certify each unseen object. Any future statistical sample needs actual member IDs, scope, randomness and limits, not an arbitrary percentage or a claimed universal no-defect guarantee. New, merged and retired features remain reconciled, and difficult areas cannot be silently excluded.

One optional calibration retained from the dated design is `ceil(log(0.05) / log(0.95)) = 59` uniformly chosen members for at least 95% chance of finding a homogeneous defect affecting at least 5% under the stated sampling assumptions. Inspect all members if fewer exist. This is neither a mandatory quota nor a no-defect guarantee, and it cannot replace critical-object inspection or omit a whole area through arbitrary stratification. A systematic example expands review to its affected class; unseen members are never labeled individually viewed. No sampling or new test implementation is authorized by this illustration.

**Rendering and time:** inspect actual normal rendering, a focused semantic/ID view when needed, and source/difference views. Retain center, scale, bearing, pitch, viewport, pixel ratio and relevant state for interpretable comparisons. Use overhead and revealing oblique views for their actual questions. Difference images locate changes rather than deciding that an intended repair is wrong. Observe motion only where camera, label or level transition is affected; recording every building adds no geometric evidence.

**Validity and release:** distinguish inventoried, source-reviewed, modeled, geometry/topology/neighborhood/class/visual results, and actual acceptance. Source conflicts, failure and stale dependencies are independent blockers. A hand-written state cannot certify them. A branch can propose integration readiness; final acceptance concerns the integrated version and the human's actual decision. Coordinate, privacy/license, damaged-data and core-navigation faults remain serious; confirmed physical errors, missing major objects or systematic unreadable styling cannot be downgraded because repair is slow. Low-risk unknown detail retains its scope, effect and next evidence route. Do not claim complete real-campus coverage from a synthetic map or from this document.

For a future declared complete map scope, require reconciled entities/partitions/classes, applicable lawful sources and transformations, fresh actual observations, no unresolved critical or major defects, and direct inspection of every critical object and required region. No unreviewed area or hidden deletion can improve that result. A limited low-risk residual needs an actual reasoned acceptance within stated scope, not a claim of flawlessness. External source blockage remains unfinished; other independent work may continue.

Use focused direct observations and existing relevant checks within the scope of the actual request. The goals above preserve truthful geography, useful navigation and product quality without creating a parallel fact store, quality engine or test infrastructure. Follow the [map and mobile stages in the roadmap](../DEVELOPMENT_ROADMAP.md) for actual implementation scope.
