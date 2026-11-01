import * as z from 'zod';
import type { Store } from '../store';
import type { CampusMapAdapter } from '../mapService';
import type { MapLocationProvider } from '../mapLocation';
import type { WorkoutDeviceChoice, WorkoutDeviceSelection } from '../../shared/types';
import type { WorkoutLocationStream, WorkoutState } from '../../shared/workout';
import { WorkoutSessionKernel } from './workout-session';
import { WorkoutDraftStore, type WorkoutDraftProtection } from './workout-storage';
import { projectWorkoutCurrent } from '../capabilities/workout';
import { workoutSourceObjectId } from '../../shared/workout-source';
import { SIMULATED_TRACK_ID } from '../simulated-location';

const deviceInput = z.object({ source: z.enum(['windows', 'adb', 'ios-simulator', 'simulated']),
  deviceId: z.string().min(1).max(256).optional() }).strict();
const referenceInput = z.object({ id: z.string().uuid(), expectedRevision: z.number().int().positive() }).strict();

/** The private native controls of the sole workout owner. No model receives a raw track. */
export class NativeWorkoutService {
  private readonly owner: WorkoutSessionKernel;
  private stream?: WorkoutLocationStream;
  private selected?: WorkoutDeviceSelection;
  private selecting = false;
  private releaseBarrier: () => void;

  constructor(private store: Store, private map: CampusMapAdapter, private location: MapLocationProvider,
    protection: WorkoutDraftProtection, onChanged: (state: WorkoutState) => void) {
    this.owner = new WorkoutSessionKernel({ storage: new WorkoutDraftStore(store, protection),
      stream: {
        start: (onFix, onStatus, onCadence) => {
          const record = this.owner.getState().session;
          if (!record?.recordingSource) throw new Error('Choose the recording device first.');
          this.stream = this.location.createWorkoutStream({ ...record.recordingSource, workoutId: record.id,
            sport: record.sport, elapsedMs: record.metrics.elapsedActiveMs });
          return this.stream.start(onFix, onStatus, onCadence);
        },
        stop: async identity => {
          if (!this.stream && identity && !identity.stopped) {
            if (!identity.recordingSource) throw new Error('The previous recording device is unknown; stopping is unconfirmed.');
            this.stream = this.location.createWorkoutStream({ ...identity.recordingSource, workoutId: identity.id });
          }
          const stream = this.stream;
          await stream?.stop(identity);
          if (this.stream === stream) this.stream = undefined;
        },
      },
      assertAccess: () => this.assertAccess(), matchFix: fix => this.map.matchWorkoutFix(fix), onChanged,
      onCancel: id => {
        const objectId = workoutSourceObjectId(id);
        try {
          store.kernel.withdrawWorkoutSource(id);
          const fence = store.kernel.fences().find(value => value.kind === 'delete' && value.objectIds.includes(objectId))
            || store.kernel.establishFence({ kind: 'delete', objectIds: [objectId], sourceIds: [] });
          store.kernel.cleanupFence(fence);
        }
        finally { store.runtime.policy.signalBarrier(); }
      },
    });
    this.releaseBarrier = store.runtime.policy.onBarrier(() => {
      if (store.runtime.policy.revoked().includes('location:read')) void this.owner.invalidate().catch(() => undefined);
    });
  }

  private assertPrivate() {
    if (this.store.closed || this.store.runtime.presentation.public) throw new Error('Return to the private map to view this workout.');
  }
  private assertAccess() {
    this.assertPrivate();
    if (this.store.runtime.policy.revoked().includes('location:read'))
      throw new Error('Location access is off, so sampling remains paused. Saved workout records remain available.');
  }

  async devices(): Promise<WorkoutDeviceChoice[]> {
    this.assertPrivate();
    return [{ source: 'simulated', deviceId: SIMULATED_TRACK_ID, deviceLabel: 'Simulated track',
      status: 'connected', provenance: 'simulated', reason: 'App-internal movement in the current map; no device position is read.' }];
  }

  private async select(raw?: WorkoutDeviceSelection, collection = true) {
    if (!raw) throw new Error('Choose the recording device before continuing this workout.');
    const choice = deviceInput.parse(raw);
    if (collection) this.assertAccess(); else this.assertPrivate();
    if (choice.source !== 'simulated' || choice.deviceId !== SIMULATED_TRACK_ID)
      throw new Error('Physical location collection is disabled. Choose the simulated track.');
    this.selected = { source: 'simulated', deviceId: SIMULATED_TRACK_ID };
  }

  state() { this.assertPrivate(); return this.owner.getState(); }
  summary() { this.assertAccess(); return projectWorkoutCurrent(this.owner.getState(), Date.now()); }
  restore() { this.assertPrivate(); return this.owner.restore(); }
  async start(raw: unknown) {
    this.assertAccess();
    const input = z.object({ sport: z.enum(['walking', 'running', 'cycling']),
      retention: z.enum(['encrypted-local', 'session-only']), device: deviceInput }).strict().parse(raw);
    if (this.selecting) throw new Error('The start is still in progress. Wait for the current record before another operation.');
    const previous = this.selected;
    this.selecting = true;
    try {
      await this.select(input.device); this.assertAccess();
      return await this.owner.start({ sport: input.sport, retention: input.retention, recordingSource: this.selected });
    } catch (error) { this.selected = previous; throw error; }
    finally { this.selecting = false; }
  }
  pause(raw: unknown) { this.assertPrivate(); return this.owner.pause(referenceInput.parse(raw)); }
  async resume(raw: unknown) {
    this.assertAccess();
    const input = referenceInput.extend({ device: deviceInput.optional() }).parse(raw);
    if (this.selecting) throw new Error('Continuation is still in progress. Wait for the current record before another operation.');
    const previous = this.selected;
    this.selecting = true;
    try {
      const source = input.device || this.owner.getState().session?.recordingSource;
      await this.select(source); this.assertAccess();
      return await this.owner.resume({ id: input.id, expectedRevision: input.expectedRevision, recordingSource: this.selected });
    } catch (error) { this.selected = previous; throw error; }
    finally { this.selecting = false; }
  }
  finish(raw: unknown) { this.assertPrivate(); return this.owner.finish(referenceInput.parse(raw)); }
  async cancel(raw: unknown) {
    this.assertPrivate();
    const input = referenceInput.extend({ device: deviceInput.optional() }).parse(raw);
    if (input.device) throw new Error('Selecting a new track cannot verify an earlier device stop. The existing cleanup remains unconfirmed.');
    if (this.selecting) throw new Error('Device selection is still in progress. Check the current record before continuing.');
    const previous = this.selected;
    this.selecting = true;
    try {
      this.assertPrivate();
      return await this.owner.cancel({ id: input.id, expectedRevision: input.expectedRevision });
    } finally { this.selected = previous; this.selecting = false; }
  }
  discardRecovery() { this.assertPrivate(); return this.owner.discardRecovery(); }
  suspend() { return this.owner.invalidate(); }
  async dispose() { this.releaseBarrier(); await this.owner.dispose(); }
}
