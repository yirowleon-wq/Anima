import * as z from 'zod';
import { HarnessError } from '../../shared/harness';
import { workoutFixTime, type WorkoutState } from '../../shared/workout';
import type { PolicyKernel } from '../runtime/policy';
import type { CapabilityBroker, CapabilityResult, InvocationContext } from './broker';

export const WORKOUT_SOURCE_ID = 'workout:self';

const nonnegative = z.number().finite().nonnegative();
const stamp = z.string().datetime();
const hostTimeEstimate = z.object({ earliest: stamp, latest: stamp }).strict();
const ageRange = z.object({ earliest: z.number().finite(), latest: z.number().finite() }).strict();
const timeBasis = z.enum(['reported-time', 'bounded-host-estimate']);
const observation = z.object({ observedAt: stamp.nullable(), receivedAt: stamp.nullable(),
  ageMs: nonnegative.nullable(), receivedAgeMs: nonnegative.nullable(),
  ageRangeMs: ageRange.nullable(), timeBasis: timeBasis.nullable(), hostTimeEstimate: hostTimeEstimate.nullable(),
  accuracyMeters: nonnegative.nullable(), accuracyConfidence: z.enum(['68-percent', '95-percent', 'unknown']),
  quality: z.enum(['accepted', 'provider-not-selected', 'invalid', 'accuracy', 'stale', 'timestamp', 'outlier', 'source-change']),
}).strict();
const place = z.object({
  state: z.enum(['candidate', 'ambiguous', 'unmatched', 'weak-signal', 'unavailable']),
  reason: z.enum(['one-candidate', 'multiple-candidates', 'no-recorded-road', 'accuracy-missing',
    'accuracy-too-wide', 'invalid-fix', 'outside-map', 'map-unavailable']),
  timing: z.enum(['current', 'last-known', 'stale']),
  observedAt: stamp, receivedAt: stamp, ageMs: nonnegative, receivedAgeMs: nonnegative,
  ageRangeMs: ageRange, timeBasis, hostTimeEstimate: hostTimeEstimate.nullable(),
  provenance: z.enum(['device', 'simulated', 'unknown']),
  accuracyMeters: nonnegative.nullable(), mapAccuracyMeters: z.null(),
  map: z.object({ label: z.string().nullable(), version: z.string(), sourceDate: z.string(),
    networkSha256: z.string().nullable(), geographySha256: z.string().nullable(), sharedFactsSha256: z.string().nullable(),
  }).strict(),
  roads: z.array(z.object({ id: z.string(), sourceEdgeId: z.string(), wayId: z.string(),
    name: z.string(), conditions: z.array(z.string()), sourceLocator: z.string(),
  }).strict()).max(6),
  candidateCount: z.number().int().nonnegative(),
  venues: z.array(z.object({ id: z.string(), name: z.string(),
    relation: z.enum(['inside-recorded-area', 'near-recorded-boundary']), geometryVersion: z.string(),
    nominalLapMeters: nonnegative.nullable(), nominalLapBasis: z.string(),
    referenceLoopMeters: nonnegative.nullable(), referenceLoopBasis: z.string().nullable(),
    sourceLocator: z.string(), venueSourceLocator: z.string().nullable(),
  }).strict()),
}).strict();
const current = z.object({
  schemaVersion: z.literal(1), id: z.string().uuid(), revision: z.number().int().positive(),
  sampleRevision: z.number().int().nonnegative(),
  sport: z.enum(['walking', 'running', 'cycling']), status: z.enum(['recording', 'paused', 'finished', 'cancelled']),
  startedAt: stamp, updatedAt: stamp, finishedAt: stamp.nullable(),
  pauseReason: z.enum(['user', 'stationary', 'interrupted', 'permission', 'capacity']).nullable(),
  signal: z.enum(['searching', 'good', 'weak', 'disconnected', 'stopped']),
  motion: z.enum(['unknown', 'moving', 'stationary']),
  streamStatus: z.enum(['starting', 'listening', 'unavailable', 'denied', 'disconnected', 'stopped']),
  provenance: z.enum(['device', 'simulated', 'unknown']),
  metrics: z.object({ distanceMeters: nonnegative, elapsedActiveMs: nonnegative,
    trustedActiveMs: nonnegative, movingMs: nonnegative, paceSecondsPerKm: nonnegative.nullable(),
    averagePaceSecondsPerKm: nonnegative.nullable(), cadenceStepsPerMinute: nonnegative.nullable(),
  }).strict(),
  lastObservation: observation.nullable(), lastAcceptedObservation: observation.nullable(),
  place: place.nullable(),
  completedKilometers: z.number().int().nonnegative(),
  lastSplit: z.object({ kilometer: z.number().int().positive(), durationMs: nonnegative,
    paceSecondsPerKm: nonnegative, completedAt: stamp }).strict().nullable(),
  retention: z.enum(['encrypted-local', 'session-only']),
  persistence: z.enum(['encrypted-local', 'memory-only', 'error']),
  school: z.object({ submission: z.literal('not-submitted'), validCount: z.null() }).strict(),
}).strict();
const workoutSummarySchema = z.object({
  readAt: stamp, current: current.nullable(),
  cleanup: z.object({ recordingStopped: z.boolean(),
    streamStatus: z.enum(['starting', 'listening', 'unavailable', 'denied', 'disconnected', 'stopped']),
    localRemoval: z.enum(['complete', 'unconfirmed']),
    sourceRetraction: z.enum(['complete', 'unconfirmed', 'not-required']),
  }).strict().optional(),
  recovery: z.enum(['unavailable', 'none']),
}).strict();

export type WorkoutCurrentSummary = z.infer<typeof workoutSummarySchema>;
export interface WorkoutSummaryOwner { summary(): WorkoutCurrentSummary }

/** Only these fields can cross into a model request, never the original track. */
export const workoutReadPurpose = {
  projection: 'current_local_workout_summary',
  fields: ['id', 'schemaVersion', 'revision', 'sampleRevision', 'sport', 'status', 'times', 'pauseReason',
    'signal', 'motion', 'streamStatus', 'provenance', 'distance', 'activeDuration', 'pace', 'cadenceAvailability',
    'lastObservationTimesAndAccuracy', 'lastAcceptedObservationTimesAndAccuracy', 'measurementTimeEstimateAndAgeBounds', 'lastKilometerSplit',
    'campusPlaceNamesAndPublicSourceIds', 'placeObservationTimesAndAccuracy', 'mapInputVersions',
    'nominalTrackLengthAndReferenceLoopBasis',
    'localRetention', 'schoolSubmission', 'resourceCleanup'],
  containsCoordinates: false, containsTrack: false, containsDeviceIdentity: false, containsClockProof: false,
  meaning: "Read the map's current activity record: approximate area, distance, recent kilometer pace, location quality and pause state. Paused or finished sessions retain their last observed location. Raw locations and routes stay on this computer.",
} as const;

// Same freshness window as the owner's sample-gap boundary. A recent delivery
// cannot make an old measurement current, and a stopped record stays historical.
const CURRENT_PLACE_AGE_MS = 15_000;

function projectPlace(record: NonNullable<WorkoutState['session']>,
  accepted: NonNullable<WorkoutState['session']>['points'][number] | undefined, now: number): z.infer<typeof place> | null {
  try {
    const match = accepted?.mapMatch;
    if (!accepted || !match || match.method !== 'campus-local-candidates/v1'
      || match.observedAt !== accepted.raw.timestamp || match.fixSource !== accepted.raw.source
      || match.horizontalAccuracyM !== accepted.raw.accuracy
      || match.venues.some(venue => venue.geometryVersion !== match.mapVersion)
      || !Number.isFinite(match.observedAt) || !Number.isFinite(accepted.raw.receivedAt)
      || Number.isNaN(new Date(match.observedAt).getTime()) || Number.isNaN(new Date(accepted.raw.receivedAt).getTime())) return null;
    const time = workoutFixTime(accepted.raw, now, CURRENT_PLACE_AGE_MS);
    if (!time || !time.fresh && time.ageMs.earliest < 0) return null;
    const ageMs = Math.max(0, time.ageMs.latest), receivedAgeMs = Math.max(0, now - accepted.raw.receivedAt);
    const last = record.points.at(-1);
    const recent = time.fresh;
    const isCurrent = recent
      && record.status === 'recording' && record.stream.status === 'listening' && record.signal === 'good'
      && accepted.segment === record.segment && (last?.quality === 'accepted' || last?.quality === 'provider-not-selected');
    // Copy only public semantic evidence. In particular selected/candidate
    // coordinates, fractions, residuals, raw source, device identity and clock
    // correlation proofs/offsets stay here.
    const roads = match.candidates.slice(0, 6).map(road => ({ id: road.edgeId, sourceEdgeId: road.sourceEdgeId,
      wayId: road.wayId, name: road.name, conditions: [...road.conditions], sourceLocator: road.sourceLocator }));
    return place.parse({ state: match.state, reason: match.reason, timing: !recent ? 'stale' : isCurrent ? 'current' : 'last-known',
      observedAt: new Date(match.observedAt).toISOString(), receivedAt: new Date(accepted.raw.receivedAt).toISOString(),
      timeBasis: time.correlated ? 'bounded-host-estimate' : 'reported-time', ageRangeMs: { ...time.ageMs },
      hostTimeEstimate: time.correlated ? { earliest: new Date(time.measuredAt.earliest).toISOString(),
        latest: new Date(time.measuredAt.latest).toISOString() } : null,
      ageMs, receivedAgeMs, provenance: record.provenance, accuracyMeters: match.horizontalAccuracyM, mapAccuracyMeters: null,
      map: { label: match.mapLabel || null, version: match.mapVersion, sourceDate: match.mapSourceDate,
        networkSha256: match.networkSha256, geographySha256: match.geographySha256, sharedFactsSha256: match.sharedFactsSha256 },
      roads, candidateCount: match.candidateCount,
      venues: match.venues.map(venue => ({ id: venue.venueId, name: venue.name, relation: venue.relation,
        geometryVersion: venue.geometryVersion, nominalLapMeters: venue.nominalLapM, nominalLapBasis: venue.nominalLapBasis,
        referenceLoopMeters: venue.referenceLoopM ?? null, referenceLoopBasis: venue.referenceLoopBasis || null,
        sourceLocator: venue.sourceLocator, venueSourceLocator: venue.venueSourceLocator || null })),
    });
  } catch {
    // Historical drafts can predate optional map evidence. A damaged match
    // must not prevent reading the original workout's time and distance.
    return null;
  }
}

/** Projection runs beside the existing owner. It neither restores nor starts it. */
export function projectWorkoutCurrent(state: WorkoutState, now: number): WorkoutCurrentSummary {
  if (state.access !== 'active') throw new HarnessError('workout_private', "Reading this activity is not permitted now. Saved records remain at their original owner.");
  const record = state.session;
  const observationTime = (value: number) => Number.isFinite(value) && !Number.isNaN(new Date(value).getTime())
    ? new Date(value).toISOString() : null;
  const point = (value: NonNullable<WorkoutState['session']>['points'][number] | undefined) => {
    if (!value?.raw || typeof value.raw !== 'object') return null;
    const time = workoutFixTime(value.raw, now, CURRENT_PLACE_AGE_MS);
    return { observedAt: observationTime(value.raw.timestamp), receivedAt: observationTime(value.raw.receivedAt),
      ageMs: time && (time.fresh || time.ageMs.earliest >= 0) ? Math.max(0, time.ageMs.latest) : null,
      receivedAgeMs: observationTime(value.raw.receivedAt) ? Math.max(0, now - value.raw.receivedAt) : null,
      ageRangeMs: time ? { ...time.ageMs } : null,
      timeBasis: time ? time.correlated ? 'bounded-host-estimate' as const : 'reported-time' as const : null,
      hostTimeEstimate: time?.correlated ? { earliest: observationTime(time.measuredAt.earliest),
        latest: observationTime(time.measuredAt.latest) } : null,
      accuracyMeters: typeof value.raw.accuracy === 'number' && Number.isFinite(value.raw.accuracy) && value.raw.accuracy >= 0
        ? value.raw.accuracy : null,
      accuracyConfidence: ['68-percent', '95-percent'].includes(value.raw.accuracyConfidence || '')
        ? value.raw.accuracyConfidence! : 'unknown' as const, quality: value.quality };
  };
  const last = record?.points.at(-1);
  let accepted: typeof last;
  for (let index = (record?.points.length || 0) - 1; index >= 0; index--) {
    if (record!.points[index].quality === 'accepted') { accepted = record!.points[index]; break; }
  }
  const split = record?.splits.at(-1);
  return workoutSummarySchema.parse({ readAt: new Date(now).toISOString(),
    current: record ? {
      schemaVersion: record.schemaVersion, id: record.id, revision: record.revision, sampleRevision: record.sampleRevision,
      sport: record.sport, status: record.status,
      startedAt: new Date(record.startedAt).toISOString(), updatedAt: new Date(record.updatedAt).toISOString(),
      finishedAt: record.finishedAt === null ? null : new Date(record.finishedAt).toISOString(),
      pauseReason: record.pauseReason || null, signal: record.signal, motion: record.motion,
      streamStatus: record.stream.status, provenance: record.provenance,
      metrics: { distanceMeters: record.metrics.distanceMeters, elapsedActiveMs: record.metrics.elapsedActiveMs,
        trustedActiveMs: record.metrics.trustedActiveMs, movingMs: record.metrics.movingMs,
        paceSecondsPerKm: record.metrics.paceSecondsPerKm, averagePaceSecondsPerKm: record.metrics.averagePaceSecondsPerKm,
        cadenceStepsPerMinute: record.metrics.cadenceStepsPerMinute },
      lastObservation: point(last), lastAcceptedObservation: point(accepted), completedKilometers: record.splits.length,
      place: projectPlace(record, accepted, now),
      lastSplit: split ? { kilometer: split.kilometer, durationMs: split.durationMs,
        paceSecondsPerKm: split.paceSecondsPerKm, completedAt: new Date(split.completedAt).toISOString() } : null,
      retention: record.retention, persistence: record.persistence.status, school: { ...record.school },
    } : null,
    ...(state.pendingStop ? { cleanup: { recordingStopped: state.pendingStop.stream.status === 'stopped',
      streamStatus: state.pendingStop.stream.status, localRemoval: state.pendingStop.localRemoval,
      sourceRetraction: state.pendingStop.sourceRetraction } } : {}),
    recovery: state.recoveryError ? 'unavailable' : 'none',
  });
}

function describePlace(value: z.infer<typeof place> | null): string | null {
  if (!value) return null;
  const venues = [...new Set(value.venues.map(venue => venue.name).filter(Boolean))];
  const roads = [...new Set(value.roads.map(road => road.name).filter(Boolean))];
  const prefix = value.timing === 'current' ? "The current location is approximately " : "The last location was approximately ";
  let description: string;
  if (venues.length === 1) {
    const inside = value.venues.every(venue => venue.relation === 'inside-recorded-area');
    description = prefix + venues[0] + (inside ? " within its bounds" : " nearby");
  } else if (venues.length > 1) description = prefix + venues.join('、') + " nearby; the particular facility is unresolved";
  else if (roads.length === 1) description = prefix + roads[0] + " in the area"
    + (value.state === 'ambiguous' ? "; the particular road segment is unresolved" : '');
  else if (roads.length > 1) description = prefix + roads.slice(0, 3).join('、') + " nearby; the road is unresolved";
  else if (value.state === 'weak-signal') description = "The location uncertainty is too broad to identify a particular facility";
  else if (value.reason === 'outside-map') description = "The latest location is outside this map's coverage";
  else if (value.state === 'unavailable') description = "The activity could not be matched to the campus map";
  else description = value.candidateCount ? "Nearby roads have no recorded name; the particular segment is unresolved" : "No recorded road has been matched nearby";
  if (value.timing === 'stale') {
    const seconds = Math.ceil(Math.max(value.ageMs, value.receivedAgeMs) / 1000);
    description += `; this location was observed about ${seconds < 60 ? seconds + " seconds" : Math.floor(seconds / 60) + " minutes " + seconds % 60 + " seconds"} ago`;
  }
  return description;
}

function describeWorkout(view: WorkoutCurrentSummary): string {
  const record = view.current;
  if (!record) {
    if (view.cleanup) {
      const steps = [view.cleanup.recordingStopped ? "Location collection stopped" : "Waiting for the device to confirm that location collection stopped",
        view.cleanup.localRemoval === 'complete' ? "This local record was cleared" : "Clearing this local record is unconfirmed",
        ...(view.cleanup.sourceRetraction === 'not-required' ? [] : [view.cleanup.sourceRetraction === 'complete'
          ? "Its prior references were also withdrawn" : "Withdrawal of its prior references is unconfirmed"])];
      return steps.join('，') + '。';
    }
    return view.recovery === 'unavailable' ? "The previous activity could not be opened. Continue after access recovers." : "No activity record is open now.";
  }
  const sport = { walking: "walk", running: "run", cycling: "ride" }[record.sport];
  const status = { recording: "recording", paused: "paused", finished: "finished", cancelled: "cancelled" }[record.status];
  const details = [`This ${sport}${status}`];
  if (record.status === 'paused' && record.pauseReason) details.push({
    user: "You paused the session", stationary: "No new distance was recorded during this period, so recording paused automatically",
    interrupted: "The previous recording was interrupted and can continue here", permission: "Location permission is unavailable; no new distance has been recorded",
    capacity: "This record reached its capacity. Finish it before starting another",
  }[record.pauseReason]);
  if (record.provenance === 'simulated') details.push("This record comes from simulated locations");
  else if (record.provenance === 'unknown') details.push("The location source is unconfirmed");
  const location = describePlace(record.place);
  if (location) details.push(location);
  const distance = record.metrics.distanceMeters;
  details.push(distance > 0 ? `Estimated distance from locations: about ${distance >= 1000 ? (distance / 1000).toFixed(2) + " km" : Math.round(distance) + " m"}`
    : record.lastAcceptedObservation ? "No accumulated distance is recorded yet" : "No usable distance has been obtained from locations yet");
  const activeSeconds = Math.floor(record.metrics.elapsedActiveMs / 1000);
  details.push(`Active recording time: about ${Math.floor(activeSeconds / 60)} minutes ${activeSeconds % 60} seconds`);
  if (record.lastSplit) {
    const seconds = Math.round(record.lastSplit.durationMs / 1000);
    details.push(`Recorded kilometer ${record.lastSplit.kilometer} took ${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds`);
  }
  if (record.metrics.cadenceStepsPerMinute === null) details.push("Cadence has no reading for this session");
  if (record.streamStatus === 'denied' && record.pauseReason !== 'permission') details.push("Location permission is disabled");
  else if (record.streamStatus === 'unavailable') details.push("The device cannot currently supply a location");
  if (record.signal === 'weak') details.push("Recent locations are noisy; distance and pace remain estimates");
  else if (record.signal === 'disconnected') details.push("The location connection dropped; no new distance has been recorded");
  else if (record.signal === 'searching') details.push("Waiting for a new location");
  if (record.lastObservation?.quality === 'stale') details.push(record.status === 'recording'
    ? "The latest location timestamp did not align. This point was not added to distance; waiting for a fresh point" : "The final location timestamp did not align, so this point was not added to session distance");
  if (record.status === 'recording' && record.metrics.paceSecondsPerKm === null) details.push("Current pace needs more recorded distance");
  if (record.persistence === 'error') details.push("This activity has not been saved yet. Its current content remains available");
  return details.join('；') + '。';
}

export function registerWorkout(broker: CapabilityBroker, policy: PolicyKernel,
  getOwner: () => WorkoutSummaryOwner | undefined): void {
  const check = (ctx: InvocationContext) => {
    ctx.signal.throwIfAborted();
    const scope = policy.validate(ctx.scope);
    policy.require(ctx.scope, 'evidence:read');
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self')
      throw new HarnessError('scope_mismatch', "This activity summary is available only in the user's private conversation.");
    if (!scope.sources.includes(WORKOUT_SOURCE_ID))
      throw new HarnessError('source_forbidden', "Local activity records are outside the sources selected for this request.");
  };
  broker.register({ manifest: {
    id: 'local-workout', version: '4', trust: 'bundled_reviewed', sourceId: WORKOUT_SOURCE_ID,
    capabilities: [{ name: 'workout.current', displayName: "Look at this activity", version: '4',
      description: "Read the same run, walk or ride retained by the map, whether recording, paused or finished. Preserve approximate place or road, estimated distance and pace, elapsed time, cadence, completed kilometer splits and pause reasons. Place observations retain measurement time, accuracy and map provenance. A standard 400-meter track and a map reference loop are distinct. Raw locations and routes stay local. Read again for later progress; official recognition, if provided at all, needs separate provider records.",
      input: z.object({}).strict(),
      output: workoutSummarySchema.extend({ meaning: z.string() }).strict(),
      effect: 'read', requiredScopes: ['evidence:read'], subjects: ['self'], worlds: ['real'],
      timeoutMs: 5000, maxBytes: 10000, supportsIdempotency: false, supportsInspect: false, supportsCancel: false,
    }], egressHosts: [], platforms: ['*'], simulated: false, offline: 'read_cache', license: 'Project source',
  }, connectionStatus: () => ({ connected: !!getOwner(), ...(!getOwner() ? { reason: "The map's local activity could not be read. Continue when the map connection recovers." } : {}) }),
  invoke: (_name, _args, ctx): CapabilityResult => {
    check(ctx);
    const owner = getOwner();
    if (!owner) return { status: 'not_connected', sourceId: WORKOUT_SOURCE_ID, simulated: false,
      reason: "The map's local activity was not obtained. Existing records remain intact; retry after the map connection recovers.", coverage: { complete: false, scope: "Current local activity" } };
    const view = workoutSummarySchema.parse(owner.summary());
    check(ctx);
    const meaning = describeWorkout(view);
    return { status: view.current || view.cleanup ? 'fresh' : view.recovery === 'unavailable' ? 'partial' : 'known_absent',
      sourceId: WORKOUT_SOURCE_ID, observedAt: view.current?.updatedAt || view.readAt, fetchedAt: view.readAt,
      data: { ...view, meaning }, coverage: { complete: view.recovery === 'none', scope: "Summary of this local activity at reading time" },
      simulated: false };
  } }, { reviewed: true, source: 'Bundled current-workout read projection review' });
}
