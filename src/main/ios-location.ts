import type { WorkoutLocationStream } from '../shared/workout';
import { unavailableLegacyLocationStream } from './device-location';

export interface IosLocationOptions { deviceId?: string; workoutId?: string; configurationPath?: string }
export interface IosLocationDevice {
  transport: 'ios-simulator'; deviceId: string; deviceLabel: string; aliases: string[];
  status: 'connected' | 'offline'; provenance: 'simulated';
}

/** Retained entry points cannot launch or contact an iOS location service. */
export async function discoverIosLocationDevices(_options: Pick<IosLocationOptions, 'configurationPath'> = {}): Promise<IosLocationDevice[]> {
  return [];
}
export function createIosWorkoutLocationStream(_options: IosLocationOptions): WorkoutLocationStream {
  return unavailableLegacyLocationStream();
}
