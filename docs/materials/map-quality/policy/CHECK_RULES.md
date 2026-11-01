# Rule registry contract

This is an execution specification for future authorized work, not a report of executed checks. The complete individual failure modes, inputs/methods, legitimate exceptions, witnesses, repair scopes and recheck scopes are maintained in [Q01–Q28](../../../scenarios/MAP_QUALITY.md#q01q28) rather than duplicated here.

At a real baseline, bind each applicable rule to actual queries, an existing suitable implementation, units, calibrated frozen thresholds and real known-bad/legitimate witnesses. Copying a table does not justify writing PASS. The historical proposals do not override current restrictions on new tests, fixtures, assertions, runners or a separate quality engine.

## Common result contract

Each result needs:

`check_id, rule_id, rule_version, scope_query, expected_ids_hash, input_versions, tested_count, pass_count, fail_count, blocked_count, not_applicable_ids_with_reason, failures[{feature_ids, witness_geometry_or_view, observed, expected, exception_claim, suggested_action}], executor, executed_at, result_locator`.

Also retain execution errors and unchecked members explicitly, as expanded in the [schema guide](../templates/SCHEMA_GUIDE.md). Counts must reconcile with the declared applicable set. Faults, timeouts, unloaded resources, missing fields, inadequate sources and invalid inputs produce `BLOCKED` or `ERROR`, not swallowed exceptions or silent skips. Derive scope from the frozen complete collection. When a class is known to exist, an empty filtered query cannot constitute success. A claim that a class is absent needs complete enumeration consistent with original data, rather than a predicate that filters it away.

Save enough actual commands or ordinary steps to reproduce a result. Human records retain view and judgment basis without pretending to be automated detection. A result locator must resolve to the real output, not just the name of an intended report.

## Different questions need different thresholds

Separate geometric validity, structural legality, positional error, visual readability and navigation correctness. Countable serious defects require zero unresolved items. Measured error uses calibrated thresholds with units and applicable extent. Aesthetic readability and real spatial interpretation retain human judgment. “Closer than a few meters” cannot serve as the universal answer to intersection, displacement and snapping.

The associated [operational predicates](OPERATIONAL_PREDICATES.md) retain formulas and the object semantics needed to instantiate the directions without asserting that those operations already exist in Anima.
