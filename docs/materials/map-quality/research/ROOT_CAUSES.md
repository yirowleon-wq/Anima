# Observations and root-cause hypotheses

The original input comprised seven screenshots plus an older instruction text. The historical analyst could see road-width changes and seams, fragmented/stepped building volumes, ambiguous land surfaces and inconsistent sports markings. Additional images suggested an abruptly interrupted main road and confused bridge/water/road layering around a gate, junction and canal. Original locations are excluded. These anonymous descriptions are leads, not coordinates or survey findings. The original screenshots are not bundled here and were not re-inspected as part of this edition.

The older instruction already requested full-area, class, zone and neighborhood repair and factual/spatial/visual/interaction acceptance. Those intentions are insufficient if the denominator, evidence and integrated version remain unbound.

## One visible symptom can have several causes

| Phenomenon | Plausible causes, still hypotheses | Evidence needed |
| --- | --- | --- |
| Road appears inconsistently wide | A real width event, incorrect attribute, duplicated line/surface, pixel/meter confusion, casing or perspective. | Centerline width profile, physical surface, shared styles, fixed comparable views and lawful source geometry. |
| Circular facility collides with a road | Registration, source boundary, footprint error, or decoration misclassified as real geography. | Coordinate chain/residuals, factual boundaries and derivation provenance. |
| A building has unexplained small protrusions | Unsupported parts, double extrusion, triangulation interpreted as wings, confused height/base height, or real complex architecture. | Part IDs, generator, extents and attribute-level height evidence. |
| A line crosses a building | Illegal same-level occupancy, a real elevated link/passage/overhang, administrative line, audit overlay or shadow. | Semantic class, elevation, grounded footprint and relations. Do not delete every crossing. |
| Two tracks have different markings | Missing rule, wrong facility class, zoom treatment or actual physical parameters. | Complete facility membership, shared generator, per-instance sources/parameters and the same scale. |
| Main road apparently stops | Missing source, AOI/tile clipping, occlusion or incorrect endpoint class. | Source centerline, canonical/rendered objects, boundary ports and graph continuation. |
| Round cap protrudes into another road | Layering, cap/join style or per-segment junction derivation. | Render structure and seam view, separate from graph connectivity. |
| Water and bridge conflict | Confused water area/centerline, missing deck, duplicated road expression or mismatched reference. | Entity IDs, source class, layer relations and travel connectivity. |
| A selected building's card remains after it leaves the viewport | Intended retained selection, or decoupled camera/card reference. | Product intent and actual interaction, not automatic clearing from a static image. |

## Six systemic hypotheses to verify in the repository

1. **No canonical fact entry:** sources and runtime generators may feed rendering directly, causing duplicates, displacement and lost identity. Verify source → canonical → render IDs and transformations before deciding this is the cause.
2. **Untyped spatial constraints:** intersections may be treated uniformly without mode, height or ground/roof meaning.
3. **Complexity exceeds evidence:** setbacks, windows and parts may be easier to generate than to source. Limit each attribute by its evidence; a simple shape is not automatically trustworthy either.
4. **Screenshot-by-screenshot patching:** isolated visual corrections may leave the same defect in an entire class or generator.
5. **Activity counts substitute for discoveries:** runs, recordings and assertion totals may not correspond to real faults. A meaningful result needs a failure witness and post-repair closure.
6. **Integration and completion are unprovable:** local family results may not concern one current version or a stable complete scope; old images and empty documents can satisfy a merely formal gate.

None is an established repository diagnosis. Screenshots do not establish a particular renderer, engine, coordinate offset, algorithm or generation mechanism. A real baseline must prove or reject each hypothesis before code is replaced.
