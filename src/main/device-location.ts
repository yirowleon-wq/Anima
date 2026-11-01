import type { MapOverview } from '../shared/map-v2';
import type { WorkoutLocationStream, WorkoutSport, WorkoutStopOwner } from '../shared/workout';
import { createSimulatedWorkoutStream, SIMULATED_TRACK_ID } from './simulated-location';

export interface WorkoutLocationOptions {
  source?: 'windows' | 'adb' | 'ios-simulator' | 'simulated';
  deviceId?: string;
  executablePath?: string;
  configurationPath?: string;
  simulated?: boolean;
  pollIntervalMs?: number;
  workoutId?: string;
  manifest?: () => MapOverview;
  sport?: WorkoutSport;
  elapsedMs?: number;
}
export interface LocationDevice {
  transport: 'simulated';
  deviceId: string;
  deviceLabel: string;
  aliases: string[];
  status: 'connected';
  provenance: 'simulated';
}

/** Compatibility entry: no operating-system or physical-device discovery occurs. */
export async function discoverLocationDevices(options: Pick<WorkoutLocationOptions, 'source' | 'executablePath'> = {}, signal?: AbortSignal): Promise<LocationDevice[]> {
  signal?.throwIfAborted();
  return options.source === 'simulated' ? [{ transport: 'simulated', deviceId: SIMULATED_TRACK_ID,
    deviceLabel: 'Simulated track', aliases: [SIMULATED_TRACK_ID], status: 'connected', provenance: 'simulated' }] : [];
}

/** Old receipts stay unconfirmed when their original physical producer cannot be inspected. */
export function unavailableLegacyLocationStream(): WorkoutLocationStream {
  return {
    start(_onFix, onStatus) {
      onStatus({ status: 'unavailable', reason: 'Physical location collection is disabled. Choose the simulated track.' });
    },
    stop(owner?: WorkoutStopOwner) {
      if (owner && !owner.stopped) throw new Error('The previous physical location stop cannot be verified by Anima.');
    },
  };
}

export function createWorkoutLocationStream(options: WorkoutLocationOptions = {}): WorkoutLocationStream {
  if (options.source === 'simulated' && options.manifest && (!options.deviceId || options.deviceId === SIMULATED_TRACK_ID))
    return createSimulatedWorkoutStream({ manifest: options.manifest, workoutId: options.workoutId,
      sport: options.sport, elapsedMs: options.elapsedMs, pollIntervalMs: options.pollIntervalMs });
  return unavailableLegacyLocationStream();
}
