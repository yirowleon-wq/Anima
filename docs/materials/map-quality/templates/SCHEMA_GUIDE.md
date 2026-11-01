# Shared records, fields and derived views

These are preserved record-authoring formats for future authorized work. They are neither production map data nor test fixtures, a new fact store, executed checks or acceptance evidence. Reuse existing authoritative tables/files and stable IDs. Add only missing provenance decisions, result evidence and review scope. Do not maintain a hand-copied second “correct map.” Choose one actual storage format appropriate to the project rather than several competing authorities.

Every `*.example.*` file is empty, with `template_only: true` and/or `__UNSET__`; it contributes zero completed entities or checks. Production records must come from actual enumeration, execution and reading. These documents and formats do not instantiate records or create test code or a runner.

## Minimum logical records

These may live in the existing database, SQLite or a suitable log according to the actual architecture.

| Record | Required purpose and fields |
| --- | --- |
| manifest | `scope_id`, AOI geometry locator/hash, zone boundaries, baseline commit, versions, full entity/class/critical membership hashes, exclusions/additions/merges, threshold locator and acceptance authority. Freezes the real denominator. |
| sources | Source ID, specific product/layer/type/locator; capture/publication/access dates; schematic status; CRS; positional accuracy/basis; independent lineage; attribute-specific suitable roles; viewing/extraction/derivation/cache/distribution rights, terms and actual authorization. |
| claims | Claim ID, feature/batch, property, candidate values, exact source and locator, source coordinates/units where lawfully held, observation, evidence grade, conflict group, adopted/rejected/unknown decision, reason and reviewer/time. Confidence is per property. |
| features | Stable ID, source mappings, name/status, class/layer/zone, geometry locator/hash, reference chain, parent/parts/relations, claim references, property confidence, conflicts/issues, evidence band/massing basis, style token, owner, applicable/result references and derived state. |
| issues | Issue/rule/feature/zone IDs, witness geometry/view, observation, hypotheses, claims, P0/P1/P2, state, owner/handoff, duplicate link, repair commit, closure checks and downgrade decision. |
| checks | Check/rule/implementation version, scope query, expected members/hash, actual count breakdown, input versions, real command/steps/time/executor, PASS/FAIL/BLOCKED/ERROR/N_A, witnesses and output locator. |
| reviews | Review scope/member set, sample method/seed, view/full camera parameters, data/style hashes, questions, source comparison, observation/decision, unreviewed scope and reviewer. |
| decisions | Related issue/claim, prior/proposed value, reason/new evidence, impact members, authority, independent review, actual approval locator and expiry/invalidation conditions. Controls exceptions, exclusions, downgrade and residual acceptance. |
| branch contracts | Actual assigned session/directory where applicable, baseline/schema/alignment, members, exact read/write boundaries, issue prefix, dependencies/handoffs, delivery and review gates. |

If original images/maps cannot be cached or distributed, retain only permitted locators and observations. Reference existing geometry/runtime paths rather than embedding large files in each row. All geographic examples here are empty; original private geometry is excluded.

## Expand an entity through references

Every object must resolve source list/dates, adopted geometry, reference chain, conflicts, confidence, geometry/topology/neighborhood/class/visual state, 3D basis, styling, zone, owner and unresolved doubts. Foreign keys can supply the detail without repeating source prose in every entity row.

Batches are for micro-objects sharing a generator. Retain `batch_id + generator_hash + membership_locator + membership_hash + member_count + parameters_range + sampled_member_ids` and runtime instance-to-batch/parent mapping. “This class was all checked” is not a member set. Critical bridges, principal buildings and facilities cannot disappear inside a batch. Distinguish `individual_human`, `sampled_human` and `rule_covered`; unsampled members were not individually seen.

The JSON Schema checks record structure only. Cross-table references, scope, dependency freshness, rights and reality need the actual project's authorized operations and review. A file hash establishes identity of bytes, not truth of a photograph, assertion or human judgment.

## Derive readiness rather than writing it freely

The status progression describes satisfied prerequisites. Validity comes from referenced results. SOURCE_BLOCKED, CONFLICT_BLOCKED, FAILED and STALE are independent blocking dimensions. Every applicable rule and required cross-object/human relationship needs a current result. Evidence work can overlap without inventing readiness.

The preserved explanatory algorithm is specification, not an implemented evaluator:

```text
resolve canonical entity and full dependency fingerprint
if template or required identity/provenance missing: NOT_READY
if unresolved critical claim or issue: BLOCKED
for each applicable rule and required human review:
    if no result: UNCHECKED
    if result dependency fingerprint differs: STALE
    if result is ERROR/BLOCKED/FAIL: NOT_READY
    if N_A lacks typed reason or required actual approval: NOT_READY
if class, neighborhood or zone coverage incomplete: NOT_READY
else: ACCEPTANCE_READY
ACCEPTED requires actual designated acceptance; never generate it automatically
```

## Record invariants

- Unique feature IDs and resolvable source/derived mappings; all claim/check/issue references exist. Demonstration IDs never enter production counts.
- Every expected set is reproducible. PASS + FAIL + BLOCKED + ERROR + N_A + unchecked members equals its explicit scope. Unchecked cannot be PASS. N_A requires a valid typed applicability reason.
- Closing active count equals opening + added − evidenced merged/retired. Hiding, lower LOD and reclassification do not reduce entity count.
- An absent name distinguishes `unknown` from `not_applicable`; an absent height distinguishes `unknown` from supported `estimated`. Null cannot become zero measured height.
- Unknown capture/publication date is null; access is not capture. Unknown precision is null rather than an unsupported “high precision.”
- State is a derived cache. Recompute final readiness from current claims/checks/reviews rather than trusting that cache.
- Closing an issue references actual change and recheck. Evidence that a candidate was not a defect may close it without erasing its observation/decision history.
- Exceptions, downgrades and scope exclusions require a real approval locator. A template reviewer field is not authorization.

## Ten readable views from one authoritative record set

| View | Sole basis | Question answered |
| --- | --- | --- |
| MAP_AUDIT_LEDGER.md | Issues and current outcomes. | What remains wrong, who owns it and what closed it? |
| MAP_SOURCE_MATRIX.md | Sources and claims. | Which attribute rests on which evidence and decision? |
| MAP_OBJECT_INVENTORY.md | Features and manifest. | Which entities exist and why did counts change? |
| MAP_CRS_AND_ALIGNMENT.md | Alignment, control points and actual results. | How does each source enter the reference and with what error? |
| MAP_TOPOLOGY_RULES.md | Rule configuration and Q07–Q17 results. | Which relations are legal and which entities violate them? |
| MAP_STYLE_SEMANTICS.md | Tokens and Q20–Q22. | What do color, material, hierarchy and labels mean? |
| MAP_ZONE_COVERAGE.md | Manifest, features, checks and reviews. | What is checked, unchecked, blocked or stale by zone/class/entity? |
| MAP_UNCERTAINTY_REGISTER.md | Open claims, issues and decisions. | What is unknown, what does it affect and what evidence could resolve it? |
| MAP_FIX_LOG.md | Actual commits, issues and count reconciliation. | What changed, why and what happened in neighbors? |
| MAP_FINAL_ACCEPTANCE.md | Current integrated snapshot and acceptance card. | Why can this scope be delivered, and who accepted its residuals? |

These can be generated on demand, not ten permanently hand-maintained documents. Add no field without a decision purpose. Any future view generator should be small and reproducible; document-processing code is not itself map quality work.

## Template files

The unchanged empty fields preserve the full source record contracts. The schema identifier uses Anima's neutral namespace. No real entity, identity, site coordinate or passing example is supplied.

- [Manifest](manifest.example.yaml), [alignment](alignment.example.yaml), [branch contract](branch_contract.example.yaml) and [style](style.example.yaml).
- [Feature](feature.example.json), [source](source.example.json), [claim](claim.example.json), [issue](issue.example.json).
- [Check result](check.example.json), [human review](review.example.json), [batch](batch.example.json) and [decision](decision.example.json).
- [Structural schema](audit_record.schema.json): structure only, not truth, check execution, reference integrity or acceptance.
