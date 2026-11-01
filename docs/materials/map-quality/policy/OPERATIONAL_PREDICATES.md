# Operational specifications for computable map objects

These formulas and procedures explain how future authorized work could instantiate Q01–Q28. They are not executed software or site measurements. Use the shortest reliable route in the existing stack. Do not build a separate framework for every rule. This document does not implement the proposed checks or create test cases or runners.

## 1. Registration report

In a declared measured analysis space, compute independent-point residuals `r_i = T(p_i) - q_i`. Report vectors, mean bias vector, `RMSE = sqrt(mean(||r_i||²))`, distance quantiles and maximum. Separate fit and independent sets. If the sample is too small for stable quantiles, say so rather than displaying false precision. Points used in fitting cannot become independent points by renaming them. Retain image-space parameters alongside measured-space results.

Inspect invertibility, orientation, local scale and applicability extent. If control uncertainty exceeds the detail's scale, that detail cannot be proven accurate: narrow the conclusion rather than inflating tolerance arbitrarily.

## 2. Physical road-width candidates

Follow one consistent chainage direction and inspect `w(s)` within a semantic road segment. Freeze units, sample spacing and surface-width measurement method. A change beyond calibrated absolute/relative limits, away from an evidenced width event, yields a candidate containing `feature_id, s, w_before, w_after, event_ref, source_uncertainty`. Exclude actual junctions, curve-buffer artifacts, lane changes and factual narrow bridges before forcing uniformity.

Separately inspect pixel width, casing, cap/join and drawing order at a fixed view. Give physical-width and display-seam problems different issue IDs, linked to the same entity; repairing one does not certify the other.

## 3. Road graph

Build connectivity from evidenced shared nodes and traversable relations, not touching pixels. A crossing is a connected same-level intersection, an evidenced disconnected grade crossing, or `BLOCKED` for insufficient meaning. Degree-one endpoints are candidates requiring an explanation: real end, gate, stairs, AOI continuation or missing data. Compare isolated components within the actual travel mode; a closed running track is not automatically a vehicle-road island.

Calibrate snapping to source uncertainty and local spacing, within semantically eligible relations. Proximity alone cannot connect parallel paths, entrances across a wall or coincident bridge/ground levels. Distance and width limits cannot replace relationship facts.

## 4. Physical penetration

Use a spatial index/bounding box to find candidates, then inspect actual occupancy geometry, excluding casing and shadow. After `road_surface ∩ building_ground`, inspect travel elevation, solid vertical intervals and passage/arcade/courtyard relations. Confirm illegality only when necessary semantics are known and physical occupancy actually conflicts. Unknown relations block judgment rather than defaulting legal.

Retain intersection geometry, both IDs, area/crossing length, uncertainty band, vertical relation and source. A road centerline can avoid a building while its physical surface still intrudes. Boundary contact, roof projection, canopy and administrative boundaries need their own semantics rather than one universal `intersects` assertion.

## 5. Building mass and evidence

Resolve parent outline/part instance mappings and rendering rules for each building. Compare confirmed envelopes/elevations, courtyard openness, elevated clearance, missing wings and duplicate whole-building volumes. Every detail parameter resolves to a claim. A program default cannot be generated first and retroactively called a reasonable estimate. An explicitly approved schematic proxy remains a proxy in audit state, user explanation and completion accounting.

Select 3D validity by declared representation. Do not force open surfaces into closed solids; claimed solids must meet their solid requirements. Store mathematical validity, source support, neighborhood legality and readability as four separate conclusions.

## 6. Zone and shared-class coverage

The union of zone geometry covers the frozen AOI. Deliberate overlaps support joint boundary review; one entity retains one primary ID so completion is not double-counted. Review boundaries with a common buffer rather than both owners dismissing an edge.

Fingerprint a defect with `rule_id + generator_hash/class + parameter_signature`. Query all candidate members sharing that mechanism, then retain outcomes for the complete applicable set. Human random sampling does not replace existing full-set automated checks. A shared-mechanism fault expands review to every affected member.

## 7. Labels and integrated-version freshness

Use actual laid-out text boxes and occupied controls, and inspect whether essential entities still have an accessible identity. No collisions with every label hidden is not success. Cover meaningful scale, pose and interaction states by risk rather than counting screenshots.

A changed dependency hash makes a result `STALE`. On the single integrated commit, recompute object/rule/zone coverage and cross-class relations. A conflict-free text merge does not prove that roads, buildings, entrances and shorelines coexist correctly.
