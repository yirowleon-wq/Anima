# Historical external research report

## Scope and what the reading establishes

The original author reported reading substantive relevant sections of 33 primary records across site sources, provider interfaces, registration/projection, conflation, geometry, road models, urban 3D, sports/natural features, cartography/labels/generalization, rights and version collaboration. The register distinguishes read scope from unavailable material. Search snippets, promotional pages and failed downloads were not counted as read bodies.

Reading a source is not verifying a particular site object. The historical official entry established available modes/functions, not precise building heights, road widths, independent control errors or the actual remaining defect count. The actual repository/data were unavailable to that research. The engineering/acceptance method is the author's synthesis rather than a quotation of every reference.

All 33 IDs remain below with scope, problem, derived rule, workflow consequence and limitation. Five entries have anonymized identity/locator; the original institutional or regional information is not included here. Their substantive technical/rights lessons remain; no replacement source, survey or contract is asserted. Other URLs are historical source locators; no later revalidation is claimed. Recheck current technical specifications and terms when an implementation relies on them.

The complete machine-readable counterpart is [SOURCES.json](SOURCES.json). Q references resolve to the [canonical directions](../../../scenarios/MAP_QUALITY.md); software references do not require installing every named tool.

## Source, conclusion and implementation consequence

### S01 · Anonymous official campus map entry

Historical source identity/locator: not included here. Type: First-party site source. Historical access: 2026-10-06.

**Reported reading:** The entry page exposed 2D, 3D, imagery, search, layer and label modes; the author did not obtain the complete map data.

**Problem addressed:** One official entry may serve several expression and information roles; those roles cannot become one geometric truth.

**Derived project rule:** Register each mode/layer separately. Source identity, schematic layout and geographic base independently; Q02 and Q13.

**Workflow consequence:** Identify the exact layer and source role before attributing an object property to it.

**Limit:** The actual map engine was not operated and site geometry was not downloaded. Page functionality does not prove a particular footprint. The original institutional name, URL, site identifier and coordinates are excluded; no replacement campus evidence is asserted.

### S02 · Anonymized provider A coordinate-conversion documentation

Historical source identity/locator: not included here. Type: Original provider API documentation. Historical access: 2026-10-06.

**Reported reading:** Accepted input reference types, reference-selector parameter, longitude/latitude order and documented output behavior.

**Problem addressed:** Interfaces have different input references and defaults. Missing or repeated conversion can both cause displacement.

**Derived project rule:** Record each input reference, conversion direction, implementation and output; Q02.

**Workflow consequence:** Inspect actual calls and conversion count instead of inferring coordinates from a brand or variable name.

**Limit:** A documented direction is not authorization or an accuracy guarantee for arbitrary bidirectional conversion. Original provider identity, regional reference names and URL are excluded, with their technical lesson retained.

### S03 · Anonymized provider B coordinate-reference documentation

Historical source identity/locator: not included here. Type: Original provider API documentation. Historical access: 2026-10-06.

**Reported reading:** Differences between global geographic coordinates and the provider-specific geographic and projected product formats.

**Problem addressed:** Mixing products or treating longitude/latitude and a projected numeric space as interchangeable corrupts coordinates.

**Derived project rule:** Record reference, units and axis order per product/interface, never at brand level; Q02.

**Workflow consequence:** Inspect each input field and distinguish geographic from projected provider outputs.

**Limit:** The original provider identity, regional reference names and URL are excluded. This historical record does not establish a current Anima provider or authorized conversion.

### S04 · QGIS 3.44: Georeferencer

Historical source: [QGIS 3.44: Georeferencer](https://docs.qgis.org/3.44/en/docs/user_manual/managing_data_source/georeferencer.html). Type: Original GIS engineering documentation. Historical access: 2026-10-06.

**Reported reading:** Ground-control-point storage, transformation families, outputs and residual reports, including high-order and thin-plate-spline distortion risks.

**Problem addressed:** A perfect control-point fit can conceal local distortion and extrapolation.

**Derived project rule:** Save points/model and compare simple to complex models. The project additionally requires independent points; Q03.

**Workflow consequence:** Report fit and independent error separately instead of stretching every point into apparent agreement.

**Limit:** Independent holdouts and frozen thresholds are the package author’s project design, not claimed quotations of the documentation.

### S05 · IETF RFC 7946: GeoJSON

Historical source: [IETF RFC 7946: GeoJSON](https://www.rfc-editor.org/rfc/rfc7946). Type: Open standard. Historical access: 2026-10-06.

**Reported reading:** Coordinate system, Polygon ring structure/orientation and compatibility provisions.

**Problem addressed:** Arbitrary projected XY JSON is mislabeled standard GeoJSON, or winding is confused with all geometry validity.

**Derived project rule:** Declare interchange semantics, check geographic axes/units, and distinguish normalization from compatibility; Q02 and Q05.

**Workflow consequence:** Validate the actual imported format rather than inferring coordinate correctness from a file extension.

### S06 · PROJ: Web Mercator

Historical source: [PROJ: Web Mercator](https://proj.org/en/stable/operations/projections/webmerc.html). Type: Original projection-library documentation. Historical access: 2026-10-06.

**Reported reading:** Web Mercator computation and spherical approximation.

**Problem addressed:** Display projection units or pixels are treated as physical road meters.

**Derived project rule:** Use appropriate measured coordinates or reliable surface geodesy for real dimensions; Q02 and Q07.

**Workflow consequence:** Store physical measured width and render width separately rather than measuring reality from a screenshot.

### S07 · NGA Hootenanny

Historical source: [NGA Hootenanny](https://github.com/ngageoint/hootenanny). Type: Original government open-source engineering documentation. Historical access: 2026-10-06.

**Reported reading:** README descriptions of automatic/semi-automatic conflation, human treatment of uncertain matches and feature-class capabilities.

**Problem addressed:** Stacking sources is mistaken for fusion, producing duplicates and opaque choices.

**Derived project rule:** Match entities before deciding attributes; preserve one-to-many/many-to-one mappings and unresolved correspondences; Q01 and Q13.

**Workflow consequence:** Match semantics and decide candidates instead of averaging conflicting coordinates.

**Limit:** The method is relevant; installing the entire platform is not required.

### S08 · PostGIS ST_IsValidDetail

Historical source: [PostGIS ST_IsValidDetail](https://postgis.net/docs/ST_IsValidDetail.html). Type: Original spatial-library documentation. Historical access: 2026-10-06.

**Reported reading:** The valid/reason/location result and rule differences.

**Problem addressed:** A bare failure does not reveal where the geometry is wrong.

**Derived project rule:** Return entity ID, error type and witness position from geometric operations; Q04.

**Workflow consequence:** Use existing geometry capability for locatable faults instead of checks that merely assert a function exists.

### S09 · PostGIS ST_MakeValid

Historical source: [PostGIS ST_MakeValid](https://postgis.net/docs/ST_MakeValid.html). Type: Original spatial-library documentation. Historical access: 2026-10-06.

**Reported reading:** Linework/structure strategies and the possibility of changed type, splitting or dimensional collapse.

**Problem addressed:** Automatic formal repair can destroy a real contour, courtyard or neighborhood.

**Derived project rule:** Compare area, components, holes, type and relations before/after repair; Q04, Q06 and Q13.

**Workflow consequence:** Do not run unsupervised whole-map make-valid and call it factual correctness.

### S10 · OpenStreetMap: Key:layer

Historical source: [OpenStreetMap: Key:layer](https://wiki.openstreetmap.org/wiki/Key:layer). Type: Original data-model documentation. Historical access: 2026-10-06.

**Reported reading:** Relative vertical relationships, crossings, shared nodes and warnings against using layer to mask overlap.

**Problem addressed:** Every planar crossing is rejected, or a layer flag hides a real conflict.

**Derived project rule:** Separate relative level, measured elevation and render order. Evidence exceptions; Q10 and Q11.

**Workflow consequence:** Resolve bridge, tunnel, passage or elevated relations before connectivity and penetration judgment.

### S11 · OpenStreetMap: Key:width

Historical source: [OpenStreetMap: Key:width](https://wiki.openstreetmap.org/wiki/Key:width). Type: Original data-model documentation. Historical access: 2026-10-06.

**Reported reading:** Physical width, default units, source:width, estimated width and the distinction from a width restriction.

**Problem addressed:** Physical, restricted, estimated and screen-outline widths are mixed.

**Derived project rule:** Keep definition, source and estimate status; inspect continuity through supported events; Q07 and Q08.

**Workflow consequence:** Exclude casing/cap faults before changing a centerline or physical width.

### S12 · OpenStreetMap: Simple 3D Buildings

Historical source: [OpenStreetMap: Simple 3D Buildings](https://wiki.openstreetmap.org/wiki/Simple_3D_Buildings). Type: Original modeling documentation. Historical access: 2026-10-06.

**Reported reading:** Outline versus building:part, height/min_height, overhanging and underground part relationships.

**Problem addressed:** Parent and parts are double-extruded, base/top height are confused or upper projection becomes grounded footprint.

**Derived project rule:** Parts need membership and vertical intervals; inspect duplicate massing; Q14 and Q15.

**Workflow consequence:** Audit the generator and part evidence before adding individual building detail.

### S13 · OGC CityGML official overview

Historical source: [OGC CityGML official overview](https://www.ogc.org/standards/citygml/). Type: Official open-standard overview. Historical access: 2026-10-06.

**Reported reading:** City-object semantics, geometry, relationships, multilevel representation and separation of encoding in the official overview.

**Problem addressed:** A 3D model is reduced to meshes without stable entities or relations.

**Derived project rule:** Separate semantics/representation and evidence band/display LOD; Q13–Q17.

**Workflow consequence:** Store building composition and connection facts rather than substituting mesh complexity for evidence.

**Limit:** Only the overview was read. The large complete standard did not open; no whole-standard interpretation or conformity certification is claimed.

### S14 · CesiumGS 3D Tiles specification

Historical source: [CesiumGS 3D Tiles specification](https://raw.githubusercontent.com/CesiumGS/3d-tiles/main/specification/README.adoc). Type: Original open specification. Historical access: 2026-10-06.

**Reported reading:** Hierarchical LOD, geometricError, screen-space error and ADD/REPLACE refinement.

**Problem addressed:** A display approximation error is called real-world accuracy, or parent/child double rendering causes ghosts.

**Derived project rule:** Separate display error from geographic truth and inspect cracks, duplicates and flashes; Q22.

**Workflow consequence:** Use hierarchy only if the actual engine and scale need it, not to introduce another named engine.

**Limit:** Geometric error concerns approximation of the source model, not a measured site survey error.

### S15 · TU Delft 3dfier

Historical source: [TU Delft 3dfier](https://tudelft3d.github.io/3dfier/). Type: Original university engineering documentation. Historical access: 2026-10-06.

**Reported reading:** Rule-based reconstruction from 2D GIS, feature classes and point-cloud heights, including adjacent-feature integration.

**Problem addressed:** All polygons are arbitrarily raised with no coordinated ground/mass model.

**Derived project rule:** Reconstruction needs height inputs, class rules and boundary review; Q15 and Q17.

**Workflow consequence:** Reconstruct by class only with actual reliable height data; do not imagine a point cloud.

### S16 · Ledoux 2018: val3dity paper

Historical source: [Ledoux 2018: val3dity paper](https://pure.tudelft.nl/ws/files/51449712/s40965_018_0043_x.pdf). Type: Original peer-reviewed paper. Historical access: 2026-10-06.

**Reported reading:** 3D GIS primitives, validity, validation and error cases; the historical author inspected figures on PDF pages 3 and 10.

**Problem addressed:** 2D validity is mistaken for 3D validity, while some faults are hidden in normal views.

**Derived project rule:** Check shells/faces/solids according to declared representation and keep factual review separate; Q16.

**Workflow consequence:** Locate precise errors for review without claiming validator success proves reality.

**Limit:** DOI 10.1186/s40965-018-0043-x. This does not establish which 3D format the actual project uses.

### S17 · val3dity 2.2.0 error taxonomy

Historical source: [val3dity 2.2.0 error taxonomy](https://val3dity.readthedocs.io/2.2.0/errors/). Type: Original university-tool documentation. Historical access: 2026-10-06.

**Reported reading:** Ring, polygon, shell, solid and collection errors, format differences and tolerance.

**Problem addressed:** One rule is imposed on every mesh, rejecting legitimate open surfaces or missing solid faults.

**Derived project rule:** Applicability depends on declared Solid/MultiSurface and related representation; Q16.

**Workflow consequence:** Report type, threshold and error position; not every visible surface must be watertight.

### S18 · OpenStreetMap: leisure=track

Historical source: [OpenStreetMap: leisure=track](https://wiki.openstreetmap.org/wiki/Tag:leisure=track). Type: Original feature specification. Historical access: 2026-10-06.

**Reported reading:** Linear/area track representation, running ring versus infield, and area/road semantics.

**Problem addressed:** A track becomes an arbitrary ellipse or is confused with its surrounding road.

**Derived project rule:** Model ring, infield, markings and supporting facilities separately under shared rules; Q18.

**Workflow consequence:** Review comparable tracks with common rules while sourcing per-facility differences.

### S19 · OpenStreetMap: leisure=pitch

Historical source: [OpenStreetMap: leisure=pitch](https://wiki.openstreetmap.org/wiki/Tag:leisure=pitch). Type: Original feature specification. Historical access: 2026-10-06.

**Reported reading:** Playing surfaces, sport/surface, facility assemblies, multi-use sites and unknown extents.

**Problem addressed:** Incorrect sport, count, dimensions and ancillary boundaries are duplicated.

**Derived project rule:** Match court type, direction, count and surface to its parameterized rule; Q18.

**Workflow consequence:** Identify actual facility composition before drawing lines; do not apply basketball markings to every surface.

### S20 · 2026 ITF Rules of Tennis

Historical source: [2026 ITF Rules of Tennis](https://www.itftennis.com/media/7221/2026-rules-of-tennis-english.pdf). Type: Original sports rules. Historical access: 2026-10-06.

**Reported reading:** Rule 1 and the court appendix; the historical author actually viewed the court diagram on PDF page 36.

**Problem addressed:** Markings are drawn freehand without distinguishing playing area from surrounding space.

**Derived project rule:** Standard parameters supply a template and plausibility check; actual site compliance needs evidence; Q18.

**Workflow consequence:** Derive reviewable markings from parameters rather than use an attractive image as dimension proof.

**Limit:** No actual site courts were measured. The rules cannot establish that a particular facility obeys those dimensions.

### S21 · OpenStreetMap: natural=water

Historical source: [OpenStreetMap: natural=water](https://wiki.openstreetmap.org/wiki/Tag:natural=water). Type: Original feature specification. Historical access: 2026-10-06.

**Reported reading:** Water types, natural/artificial distinction, linear channels, islands and holes.

**Problem addressed:** Channel, water surface, bridge and other muted surfaces lose their meanings.

**Derived project rule:** Separate surface, bank, centerline and bridge, and represent islands by valid relationships; Q19.

**Workflow consequence:** Trace every supplemental crossing line to an entity class instead of coloring it as generic technical decoration.

### S22 · MapLibre Style Specification: Layers

Historical source: [MapLibre Style Specification: Layers](https://maplibre.org/maplibre-style-spec/layers/). Type: Original renderer documentation. Historical access: 2026-10-06.

**Reported reading:** Line width, cap/join, symbol priority, zoom and layer properties.

**Problem addressed:** Physical/pixel width, junction seams and label hierarchy become confused.

**Derived project rule:** Separate facts from screen style; use shared tokens and scale bands; Q08 and Q20–Q22.

**Workflow consequence:** Find equivalent properties in the actual engine and fix display mechanisms without moving facts.

**Limit:** The original project stack was not supplied. MapLibre is a method reference, not a confirmed dependency.

### S23 · Mapbox: Optimize map label placement

Historical source: [Mapbox: Optimize map label placement](https://docs.mapbox.com/help/dive-deeper/optimize-map-label-placement/). Type: Official rendering engineering documentation. Historical access: 2026-10-06.

**Reported reading:** Collision, variable anchors, density and drawing priority.

**Problem addressed:** Every label appears at once or all labels are suppressed to evade conflict.

**Derived project rule:** Review anchors, category priority, scale filtering and reachable identity together; Q21.

**Workflow consequence:** Inspect actual projected text/control boxes rather than only DOM text existence.

### S24 · Esri: Primary design principles for cartography

Historical source: [Esri: Primary design principles for cartography](https://www.esri.com/arcgis-blog/products/arcgis-pro/mapping/primary-design-principles-for-cartography). Type: First-party professional cartography material. Historical access: 2026-10-06.

**Reported reading:** Legibility, contrast, figure/ground, hierarchy and proportion.

**Problem addressed:** Dark technical style becomes an excuse for semantically unreadable low contrast.

**Derived project rule:** Preserve the warm dark direction while organizing luminance, texture and edges by feature/task; Q20 and Q21.

**Workflow consequence:** Review finished rendering; identical pixel colors are not the definition of consistent style.

### S25 · PostGIS ST_CoverageSimplify

Historical source: [PostGIS ST_CoverageSimplify](https://postgis.net/docs/ST_CoverageSimplify.html). Type: Original spatial-library documentation. Historical access: 2026-10-06.

**Reported reading:** Topology-preserving shared-edge simplification and its valid-coverage prerequisites.

**Problem addressed:** Independent simplification of neighboring polygons creates gaps or overlaps.

**Derived project rule:** Generalization is derived display; simplify shared edges together and retain semantic nodes; Q22.

**Workflow consequence:** Scale organization cannot overwrite and damage canonical geometry.

### S26 · OpenStreetMap Copyright and License

Historical source: [OpenStreetMap Copyright and License](https://www.openstreetmap.org/copyright). Type: Original data-license statement. Historical access: 2026-10-06.

**Reported reading:** ODbL, attribution and data sharing conditions.

**Problem addressed:** OSM is treated as unconditional content or software/data licenses are confused.

**Derived project rule:** Record data derivation, attribution and applicable rights separately from code; Q25.

**Workflow consequence:** Identify distributable asset classes rather than treating a code license as map-data permission.

### S27 · OSMF Tile Usage Policy

Historical source: [OSMF Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/). Type: Original service policy. Historical access: 2026-10-06.

**Reported reading:** Public tile caching, attribution and restrictions on bulk downloading/offline prefetch.

**Problem addressed:** Whole-map automated review can unintentionally scrape a public service.

**Derived project rule:** Use lawfully obtained self-generated/offline data for full-area work, not a public tile sweep; Q25.

**Workflow consequence:** Review network use by checking tools against service/resource boundaries too.

### S28 · Anonymized provider A service terms

Historical source identity/locator: not included here. Type: Original provider terms. Historical access: 2026-10-06.

**Reported reading:** Restrictions on extraction, copying, caching, adaptation, derived data and display.

**Problem addressed:** Withholding original imagery is treated as permission to extract or recreate restricted data.

**Derived project rule:** Record allowed uses from actual authorization. Manual reference is not an automatic exemption; Q25.

**Workflow consequence:** Keep unresolved restricted geometry out of delivery and seek lawful evidence.

**Limit:** This was an engineering reading of historical terms, not a complete legal opinion; a specific contract can differ. Original regional provider identity and URL are excluded.

### S29 · Anonymized provider B service terms

Historical source identity/locator: not included here. Type: Original provider terms. Historical access: 2026-10-06.

**Reported reading:** Extraction, caching, screenshots, derived databases and attribution requirements.

**Problem addressed:** Public visibility is mistaken for permission to cache, trace or publish.

**Derived project rule:** Record exact product, terms, intended use and actual authorization; Q25.

**Workflow consequence:** Do not copy geometry from a reference screenshot to evade a restriction.

**Limit:** Applicability depends on actual product/contract, not one blanket judgment. Original regional provider identity and URL are excluded.

### S30 · Google Maps Platform Terms

Historical source: [Google Maps Platform Terms](https://cloud.google.com/maps-platform/terms). Type: Original provider terms. Historical access: 2026-10-06.

**Reported reading:** Section 3.2.3 restrictions on scraping, unlicensed caching and specified derivative-content examples.

**Problem addressed:** Manual building tracing while withholding Google imagery can still be restricted.

**Derived project rule:** Check actual authorization before tracing roads/contours from satellite content; Q25.

**Workflow consequence:** Do not assume imagery can become an owned independent vector database.

**Limit:** Evaluate actual product, special terms and authorization. This is a historical reading, not a current legal determination.

### S31 · Google Maps / Google Earth Additional Terms

Historical source: [Google Maps / Google Earth Additional Terms](https://www.google.com/help/terms_maps/). Type: Original end-product terms. Historical access: 2026-10-06.

**Reported reading:** Content use, copying, bulk acquisition and reconstruction restrictions.

**Problem addressed:** Ordinary end-product permissions are confused with Platform API permissions.

**Derived project rule:** Record specific product rather than only provider name; Q25.

**Workflow consequence:** Identify the service before deciding whether content may be saved, compared or transformed into data.

### S32 · Git: git-worktree

Historical source: [Git: git-worktree](https://git-scm.com/docs/git-worktree). Type: Original version-control documentation. Historical access: 2026-10-06.

**Reported reading:** Independent working directories, shared repository, branch occupancy and worktree management.

**Problem addressed:** Concurrent writers edit the same directory and overwrite one another.

**Derived project rule:** Bind genuine isolated write assignments to baseline commits and one writer per file; Q24.

**Workflow consequence:** Make parallelism real through ownership and mergeable work rather than multiple writers in one file.

### S33 · OpenAI: Worktrees

Historical source: [OpenAI: Worktrees](https://developers.openai.com/codex/app/worktrees/). Type: Official Codex product documentation. Historical access: 2026-10-06.

**Reported reading:** Project chat/worktree isolation, starting branches, detached HEAD and handoff.

**Problem addressed:** Independent project chats and subagents are conflated, and every client is assumed able to start them automatically.

**Derived project rule:** Check actual capability, directory and commit; truthful read-only or serial alternatives apply when unavailable; Q24.

**Workflow consequence:** Bind responsibility contracts to actual sessions/paths/commits. Scoped MERGE_READY is not full-map acceptance. Current team governance replaces the source’s historical subagent restriction.

**Limit:** The reading did not establish that a particular client exposed a goal command or that the author could open local sessions. This edition does not claim a fresh product-documentation check.

## Twelve research conclusions carried into the method

| Theme | Research judgment | Future working location |
| --- | --- | --- |
| Source roles | Official identity, grounded geometry and photographic height cannot substitute for one another. A schematic cannot directly provide precise coordinates. S01–S07. | Property claims, family A, map phase two. |
| Reference and fusion | Provider conversion, projection, registration and local axes are separate. Control-point agreement is not independent accuracy. S02–S07. | Alignment records, Q02–Q03 and the reference gate. |
| Geometry validity | A valid geometry can still be false. Automatic repair can change parts and holes. S05, S08–S09. | Locatable outputs and before/after structural comparison; Q04–Q06. |
| Road topology | Physical width, display width and travel graph remain separate. A crossing's connectivity depends on space/access semantics. S10–S11, S22. | Family B and Q07–Q12. |
| Building mass | Outline, parts, base and top differ; display LOD cannot manufacture facts. S12–S17. | F/B/P/D evidence bands, family C, Q13–Q17. |
| Sports/natural objects | Shared rules allow real facility differences. Standard dimensions do not establish measured site conditions. S18–S21. | Assemblies/parameter templates, family D, Q18–Q19. |
| Visual meaning | Dark warmth survives while figure/ground, state, shadow and physical feature remain distinguishable. S22, S24. | Semantic tokens and Q20. |
| Labels/generalization | Labels need real priority/collision handling; shared boundaries simplify together. S22–S25. | Four scale bands, anchors and key-node protection; Q21–Q22. |
| Automatic/human review | A rule operation detects specified faults, not truth of reality. Every purposeful view answers a question. S08–S09, S16–S17. | Full applicable scope, individual critical review, honest samples and real witnesses; Q26–Q27. |
| Parallel ownership | A real isolated worktree reduces overwrites, not integration error. S32–S33. | Exclusive files, baseline hashes, handoffs and integrated recheck; Q24. |
| Rights/delivery | Public viewing is not tracing/download/distribution permission. Data rights and public tile-service policy differ. S26–S31. | Use-specific rights and distributable-asset records; Q25. |
| Completion evidence | Documents, photographs and family claims cannot prove object correctness. Scope and version must reconcile. Package synthesis. | Derived state, Q01/Q24/Q27/Q28 and the unfilled acceptance card. |

## Unavailable and unclaimed evidence

The historical author could read an additional official plan entry but failed to obtain its original map image. It therefore did not count as a read geometric plan. Some World Athletics facility PDFs failed; no claim was made of checking those technical drawings. The full large CityGML standard did not open, so discussion uses the overview plus the actually read modeling/validation references rather than claiming full conformity review.

Provider coordinate and license documents were read historically; current commercial site imagery and construction were not actually compared. An accessible URL does not authorize extraction. Future source use still requires applicable current evidence, actual rights and the standing privacy/location constraints. See [limitations](../review/LIMITATIONS.md) for the complete boundary.
