# Campus and environment

This document describes the current campus and environment configuration, import paths and external-service boundaries. The [roadmap](DEVELOPMENT_ROADMAP.md) and [working materials](materials/README.md) retain the unfinished interaction, visual and provider goals.

Campus life remains part of Anima: classes, exams, grades, activities, teams, tutoring, facilities, workshops, attendance, feedback, milestones and fitness records. The included edition connects no private university API. An explicit local import is usable without a university login. Local imports, local workout records and official provider receipts keep separate identities.

In **Settings → Connections**, choose a campus data JSON file or a campus activity JSON file. The host validates the selected file and saves an immutable snapshot in its own private owner. Importing or replacing that file is a local operation; model reading has its own permission. **Allow reading** and **Stop reading** control the activity source separately, and the general campus-read setting remains an independent limit. Refresh reloads only the selected source file. Disconnect stops reading; it does not silently erase independent calendar entries. Clearing all local data clears these source owners too. Examples are editable formats, clearly labeled synthetic, and contain no personal enrollment or transcript.

## Academic records

Start from [campus-data.example.json](../examples/campus-data.example.json). A document declares `schemaVersion: anima-campus-data/v1`, `institutionId`, `termId`, `timeZone`, `source`, `fetchedAt`, `resources` and honest completeness. An optional `academicYear` identifies the source collection period; each course or grade keeps its own `semester_id`. Quarter, semester and summer term IDs are stable strings such as `2026-fall`; names do not imply chronological order.

Resources include `classes`, `courses`, `learning_courses`, `exams`, `grades`, `gpa_overall`, `gpa_semesters`, `gpa_cumulative`, `retakes`, `projects`, `practice_summary`, `todos`, `activities`, `holidays`, `calendar_pending`, `cancelled_classes`, `source_status`, `reservations`, `reservation_violations`, `card_accounts`, `transactions`, `student_profile`, `roles`, `sports` and `terms`. A missing resource is unavailable, distinct from an explicitly empty list. `classes` contains actual expanded occurrences, not a private schedule inferred from public term dates. Use offset-bearing `startTime` and `endTime`; an unknown end stays unknown.

The same owner supports resource and field discovery, bounded filtering and sorting, joins, grouped summaries, known-interval conflicts and gaps, source reads, immutable pagination, history and differences between observations. A gap between supplied events does not establish free time. A continuation retains its snapshot and expected revision. Original JSON bytes are retained privately; normalized rows and derived analysis are identified separately. Source access is still governed by current purpose, privacy scope and per-resource permissions.

For grades, preserve the original symbol, `units` or `credit`, `points` when actually supplied, `semester_id`, source identity and any explicit `gpaIncluded` decision. A `gradingPolicy` may state the scale, symbol mapping, excluded symbols and repeat treatment. Unknown inclusion or points creates an incomplete calculation, never zero. `source_explicit` requires the source to identify included attempts; `all_attempts_analysis` is an explicitly labeled local analysis, not an official retake decision. Cumulative analysis requires source-declared `terms` with numeric `order` values. Major-only calculations require actual source-confirmed membership and their own filtered denominator.

The public [UCI 2026–27 calendar](https://www.reg.uci.edu/calendars/quarterly/2026-2027/quarterly26-27.html), revised October 29, 2026, distinguishes quarter start and instruction start:

| Term | Quarter begins | Instruction begins |
| --- | --- | --- |
| Fall 2026 | September 21, 2026 | September 24, 2026 |
| Winter 2027 | January 4, 2027 | January 4, 2027 |
| Spring 2027 | March 24, 2027 | March 29, 2027 |

These are public institutional dates in Pacific time, subject to official revision. They establish no personal weekly schedule. The public [academic regulations](https://catalogue.uci.edu/informationforadmittedstudents/academicregulationsandprocedures/) use a four-point basis, cap A+ at 4.0 and ordinarily adjust plus/minus grades by 0.3. Excluded symbols, incomplete records and repeated courses require their applicable rules; the undergraduate repeat policy has eligibility and an initial 16-unit condition, so a generic highest-grade replacement is insufficient. The example policy is an explicit public reference. Program, cohort, year, units, actual attempts and inclusion remain source data; no personal GPA or degree status is supplied.

## Activities

Start from [campus-activity.example.json](../examples/campus-activity.example.json). Each resource declares a source kind, completeness and `data`; optional `selection` records its exact term, date, venue or statistics range. The nineteen categories are learning records, fitness activity, notices, teams, events, tutoring, progress, venues, activity attendance, workshops, fitness measurements, competitions, course attendance, venue visits, feedback, facility status, degree requirements, milestones and external fitness.

An imported source can preserve a report, list, catalog or measurement. It cannot certify live availability, attendance, a reservation, official exercise credit or a successful external submission. Statistics are returned only when their declared period and range match the request; missing selection metadata is reported unavailable. A filtered response retains its source snapshot and conditions for later pages. External booking, sending and official submission need a separately reviewed provider and real action receipts.

## Geography and environment

The bundled [map](../assets/map-v2/SOURCE.md) is a self-authored synthetic diagram, labeled as such. It demonstrates the shared map engine, topology, entrances, access estimates, camera ownership and 2D fallback. It is not UCI geography or navigation. [UCI’s public map](https://map.uci.edu/?id=463) is an external reference; its existence grants no redistribution license. No redistributable UCI geometry, private map API or account connection is supplied.

Import a separately reviewed compatible directory through the normal project command:

```sh
npm run map:import -- /absolute/path/to/licensed-map-directory
```

The complete bundle uses a `campus-map/v2` manifest with the same version across facts/network, explicit bounds/CRS/source/license and SHA-256 `componentHashes` for eight JSON/GeoJSON components: `geography.geojson`, `display-geography.geojson`, `places.json`, `network.json`, `shared-facts.json`, `venues.json`, `sports-details.geojson` and `building-supplement.json`. Include `SOURCE.md` with genuine source/redistribution terms and the `source.osm.json.gz` structure record; a synthetic bundle explicitly records that it has no acquired OSM elements. The importer validates the selected directory and bytes, stages the dependent files and publishes the manifest last. It preserves Anima’s own compiled bridge instead of executing JavaScript from an imported bundle. Imported data must retain its actual provenance and coordinate semantics. Installing a dataset does not make its unverified names, entrances or current access official facts.

Map coordinates are WGS84 `[longitude, latitude]`; display and personal-profile meters use EPSG:3857 without a campus-specific offset. Every dataset declares bounds and component hashes. Synthetic, imported and OSM source kinds remain distinct. Estimated access does not establish a real door or passage. Opening the map starts with manual selection and does not start device acquisition.

Develop and exercise the full map, route and workout workflows with app-internal simulated fixes and tracks, manual origins or permitted imports, preserving source, time and quality. Simulated movement does not establish physical arrival or official credit. Never acquire real device location or enable OS location services or request or grant location permissions on iOS, Android, desktop, browser, emulator or guest. Native GPS acquisition is not a current development goal; independent native-device behavior remains a goal.

Weather uses an explicitly configured public reference, separate from the person’s clock time zone. The editable `Settings.environmentReference` contains `id`, `label`, `latitude`, `longitude`, `timeZone` and `basis: explicit_public_reference`. The initial reference is Irvine at 33.6846, −117.8265 in `America/Los_Angeles`; it is never GPS. Edit the reference label, coordinates and IANA zone through Settings. The host validates latitude/longitude bounds and the zone, and both the query and room projection use the same selected reference. Freshness, missing values, cancellation, sunrise/sunset transitions and current versus forecast time remain explicit.

Change the person’s IANA clock zone independently. The initial clock zone is `America/Los_Angeles`; DST comes from the time-zone database, including non-24-hour days and ambiguous/nonexistent local times. The app does not infer availability, health or a class schedule from time, weather or an unoccupied-looking calendar.

Weather and air quality have separate sources and expiry. Displayed Celsius, millimeters, meters/kilometers and pace retain their actual units; an imperial presentation requires real conversion, including split and pace calculations. A missing AQI, heart rate, calorie estimate or device observation stays unknown. A virtual room/theme can remain useful with unknown outdoor conditions and does not claim to depict actual local weather.

No location service or permission is required for these manual and public-reference paths. Private academic/activity services need a separately reviewed provider, genuine account/source authority and actual observations. Real booking, sending or official activity submission additionally needs the original action’s current permission and receipt. Those external conditions do not prevent independent conversation, study, notes, local calendar or imported-source work.
