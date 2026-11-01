import type { LocationFix, MapOverview } from '../shared/map-v2';
import type { WorkoutLocationStream, WorkoutSport, WorkoutStopOwner } from '../shared/workout';

export const SIMULATED_TRACK_ID = 'anima-simulated-track';

/** The frame comes from the loaded map, never an operating-system location. */
function frame(manifest: MapOverview) {
  const bounds = manifest.bounds;
  if (manifest.dataStatus === 'error' || manifest.version === 'unavailable' || manifest.crs !== 'EPSG:4326'
    || !Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite)
    || bounds[0] < -180 || bounds[2] > 180 || bounds[1] < -90 || bounds[3] > 90
    || bounds[0] >= bounds[2] || bounds[1] >= bounds[3]) throw new Error('The current map has no usable simulation frame.');
  const longitude = (bounds[0] + bounds[2]) / 2, latitude = (bounds[1] + bounds[3]) / 2;
  const longitudeScale = Math.cos(latitude * Math.PI / 180) * 111_195;
  const radius = Math.min(30, (bounds[2] - bounds[0]) * longitudeScale * 0.2,
    (bounds[3] - bounds[1]) * 111_195 * 0.2);
  if (!Number.isFinite(radius) || radius < 1 || longitudeScale <= 0) throw new Error('The current map is too small for a simulated track.');
  return { longitude, latitude, longitudeScale, radius };
}

export function simulatedMapFix(manifest: MapOverview, timestamp = Date.now()): LocationFix {
  const current = frame(manifest);
  return { coordinate: [current.longitude, current.latitude], crs: 'EPSG:4326', timestamp,
    accuracy: 1, source: 'simulated', deviceLabel: 'Simulated position' };
}

/** No external process or sensor is involved; stop invalidates every scheduled callback. */
export function createSimulatedWorkoutStream(options: { manifest: () => MapOverview; workoutId?: string;
  sport?: WorkoutSport; elapsedMs?: number; pollIntervalMs?: number }): WorkoutLocationStream {
  let generation = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  return {
    start(onFix, onStatus) {
      if (timer) clearInterval(timer);
      const current = frame(options.manifest()), ownGeneration = ++generation;
      const started = performance.now(), offsetMs = Math.max(0, options.elapsedMs || 0);
      const speed = options.sport === 'walking' ? 1.4 : options.sport === 'cycling' ? 4 : 2.5;
      const emit = () => {
        if (ownGeneration !== generation) return;
        const seconds = (offsetMs + Math.max(0, performance.now() - started)) / 1000;
        const angle = speed * seconds / current.radius;
        const timestamp = Date.now();
        onFix({ coordinate: [current.longitude + current.radius * Math.sin(angle) / current.longitudeScale,
          current.latitude + current.radius * (1 - Math.cos(angle)) / 111_195],
          crs: 'EPSG:4326', timestamp, receivedAt: timestamp, accuracy: 1, accuracyConfidence: 'unknown',
          altitude: null, altitudeAccuracy: null, altitudeDatum: 'unknown', speed, heading: null,
          source: 'anima-simulated', deviceId: SIMULATED_TRACK_ID, deviceLabel: 'Simulated track',
          transport: 'simulated', provenance: 'simulated', mock: true });
      };
      onStatus({ status: 'listening', reason: 'Simulated movement is running in the current map. No device position is used.' });
      emit();
      if (ownGeneration === generation) timer = setInterval(emit, Math.max(250, Math.min(options.pollIntervalMs || 1000, 5000)));
    },
    stop(owner?: WorkoutStopOwner) {
      if (owner && (options.workoutId && owner.id !== options.workoutId
        || owner.recordingSource && owner.recordingSource.source !== 'simulated'))
        throw new Error('This stop does not match the simulated workout.');
      ++generation;
      if (timer) clearInterval(timer);
      timer = undefined;
    },
  };
}
