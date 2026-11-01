import type { LocationStatusResult, MapOverview } from '../shared/map-v2';
import { createWorkoutLocationStream, discoverLocationDevices, type WorkoutLocationOptions } from './device-location';
import { simulatedMapFix } from './simulated-location';

/** App-internal positions are based only on the currently loaded map. */
export class MapLocationProvider {
  constructor(private manifest?: () => MapOverview) {}

  createWorkoutStream(options: WorkoutLocationOptions = {}) {
    return createWorkoutLocationStream({ ...options, manifest: options.manifest || this.manifest });
  }
  discoverDevices(options: Pick<WorkoutLocationOptions, 'source' | 'executablePath' | 'configurationPath'> = {}) {
    return discoverLocationDevices(options);
  }
  cancel() { /* There is no OS subscription or retained position to stop. */ }

  async read(manifest: MapOverview): Promise<LocationStatusResult> {
    try {
      return { status: 'fresh', source: 'simulated', phoneConnected: false, fix: simulatedMapFix(manifest),
        reason: 'Simulated position at the center of this map. It does not describe a real location.' };
    } catch {
      return { status: 'unavailable', source: 'simulated', phoneConnected: false,
        reason: 'The current map cannot supply a simulation frame. Choose a start manually.' };
    }
  }
}
