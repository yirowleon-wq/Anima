import { useEffect, useId, useRef, useState } from 'react';
import { Activity, Bike, Footprints, LocateFixed, Pause, Play, RefreshCw, Route, Square, X } from 'lucide-react';
import type { WorkoutDeviceChoice } from '../../shared/types';
import type { WorkoutPendingStopView, WorkoutRetention, WorkoutSessionRecord, WorkoutSport, WorkoutState } from '../../shared/workout';
import type { CampusMapEngine } from './map-engine';
import { DesktopWorkoutLayer, workoutMapCurrent } from './desktop-workout-layer';
import { inBounds } from '../../shared/map-routing';
import { uiError } from '../ui';
import './workout.css';

const api = window.anima;
const sports = { walking: 'Walking', running: 'Running', cycling: 'Cycling' } as const;
const sportIcons = { walking: Footprints, running: Activity, cycling: Bike };
const actionLabels = { read: 'Reading…', retry: 'Retrying…', start: 'Starting…', pause: 'Pausing…', finish: 'Finishing…', stop: 'Stopping…', resume: 'Resuming…', discard: 'Discarding…' } as const;
type WorkoutAction = keyof typeof actionLabels;
const deviceKey = (device: WorkoutDeviceChoice) => `${device.source}:${device.deviceId}`;
function duration(milliseconds: number) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function pace(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}′${String(rounded % 60).padStart(2, '0')}″`;
}
function statusLabel(session: WorkoutSessionRecord) {
  if (session.status !== 'recording' && session.stream.status !== 'stopped') return 'Stop not confirmed';
  if (session.status === 'paused') return 'Paused';
  if (session.status === 'finished') return 'Finished';
  return ({ searching: 'Preparing position…', good: 'Recording', weak: 'Position uncertain', disconnected: 'Position disconnected', stopped: 'Position stopped' })[session.signal];
}
function signalReason(session: WorkoutSessionRecord) {
  const point = session.points.at(-1);
  if (point?.quality === 'accuracy') return point.raw.accuracy === null ? 'This sample has no accuracy information and was not counted toward distance.'
    : `Accuracy is about ${Math.round(point.raw.accuracy)} m; this sample was not counted toward distance.`;
  if (point?.quality === 'outlier') return 'This sample jumped too far and was not counted toward distance.';
  if (point?.quality === 'stale') return 'This sample has an inconsistent time and was not counted toward distance.';
  if (point?.quality === 'source-change') return 'The position source changed; recording continues in a new segment.';
  if (point?.quality === 'invalid') return 'This sample cannot be used to calculate distance.';
  if (point?.quality === 'timestamp' || point && session.signal === 'weak') return 'Waiting for a fresh position; current pace is unavailable.';
  return session.stream.reason;
}
function retentionLabel(session: WorkoutSessionRecord) {
  if (session.persistence.status === 'encrypted-local') return 'Encrypted local save';
  return session.persistence.reason || (session.persistence.status === 'error' ? 'Not safely saved yet; keep the app open' : 'Kept in this window only');
}
function cadenceNote(session: WorkoutSessionRecord) {
  if (session.metrics.cadenceStepsPerMinute !== null) return undefined;
  const observation = session.latestCadenceObservation;
  if (observation?.status === 'unsupported') return session.provenance === 'simulated' ? 'No step count is available for this track' : 'This device has no step sensor';
  if (observation?.status === 'denied' || observation?.permission === 'denied') return 'Physical-activity permission is not granted';
  if (session.status !== 'recording') return undefined;
  if (observation?.status === 'unavailable') return 'Step count is unavailable';
  if (observation?.status === 'stopped') return 'Step sensing stopped';
  if (observation?.status === 'listening') return 'Waiting for new steps';
  return undefined;
}
function pendingStopAction(pending: WorkoutPendingStopView) {
  const stopped = pending.stream.status === 'stopped';
  if (!stopped && pending.stopVerification === 'unavailable') return 'Retry cleanup';
  if (pending.sourceRetraction === 'unconfirmed') return stopped ? 'Retry cleanup' : 'Retry cleanup and stop';
  if (pending.localRemoval === 'unconfirmed') return stopped ? 'Retry record removal' : 'Retry cleanup';
  return stopped ? 'Finish cleanup' : 'Retry stopping the track';
}
function readableError(error: unknown) {
  return uiError(error, { fallback: 'The operation did not finish. Read the current record before continuing.' });
}

/** Private controls for the native owner. Timers and metrics are always read back from it. */
export function WorkoutControls({ engine, mapOnly = false }: { engine?: CampusMapEngine; mapOnly?: boolean }) {
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<WorkoutState>();
  const stateRef = useRef(state);
  stateRef.current = state;
  const mapLayer = useRef<DesktopWorkoutLayer | undefined>(undefined);
  const [devices, setDevices] = useState<WorkoutDeviceChoice[]>([]);
  const [device, setDevice] = useState('');
  const [sport, setSport] = useState<WorkoutSport>('running');
  const [retention, setRetention] = useState<WorkoutRetention>('session-only');
  const [busy, setBusy] = useState<WorkoutAction | ''>('');
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState<'session' | 'recovery'>();
  const [newDraft, setNewDraft] = useState(false);
  const mounted = useRef(true);
  const eventVersion = useRef(0);
  const operation = useRef(false);
  const focusAfterAction = useRef(false);
  const deviceRequest = useRef(0);
  const deviceDefault = useRef('');
  const session = state?.session;
  const pendingStop = state?.pendingStop;
  const tracks = devices.filter(candidate => candidate.source === 'simulated');
  const selected = tracks.find(candidate => deviceKey(candidate) === device);
  const unavailableStop = !!pendingStop && pendingStop.stream.status !== 'stopped' && pendingStop.stopVerification === 'unavailable';
  const canRetryCleanup = !!pendingStop && (!unavailableStop || pendingStop.localRemoval === 'unconfirmed' || pendingStop.sourceRetraction === 'unconfirmed');
  const producer = session?.recordingSource && devices.find(candidate => candidate.source === session.recordingSource!.source
    && (session.recordingSource!.deviceId ? candidate.deviceId === session.recordingSource!.deviceId : candidate.source === 'simulated'));
  const current = session?.points.at(-1)?.raw;
  const mapPoint = workoutMapCurrent(session);
  const pointOnMap = !!engine && !!mapPoint && inBounds(mapPoint.raw.coordinate, engine.data.manifest.bounds);
  const live = session?.status === 'recording' || session?.status === 'paused';
  const stopUnconfirmed = !!session && session.status !== 'recording' && session.stream.status !== 'stopped';
  const legacyStopUnconfirmed = stopUnconfirmed && session?.recordingSource?.source !== 'simulated';
  const settlingStop = stopUnconfirmed && ['pause', 'finish', 'stop'].includes(busy);
  const busyLabel = busy ? actionLabels[busy] : '';
  const form = state?.access !== 'suspended' && !pendingStop && (!session || newDraft);
  const locked = !!busy || reading;

  async function readState(restore = false) {
    const version = eventVersion.current;
    const next = await (restore ? api.workoutRestore() : api.workoutState());
    if (mounted.current && version === eventVersion.current) setState(next);
    return next;
  }
  async function loadDevices() {
    const request = ++deviceRequest.current;
    setLoadingDevices(true);
    try {
      const next = await api.workoutDevices();
      if (mounted.current && request === deviceRequest.current) setDevices(next);
    } catch (failure) { if (mounted.current && request === deviceRequest.current) setError(readableError(failure)); }
    finally { if (mounted.current && request === deviceRequest.current) setLoadingDevices(false); }
  }
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = api.onWorkout(next => { eventVersion.current++; setState(next); });
    void readState().catch(failure => { if (mounted.current) setError(readableError(failure)); });
    return () => { mounted.current = false; deviceRequest.current++; unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!engine) return;
    const layer = new DesktopWorkoutLayer(engine);
    mapLayer.current = layer;
    layer.update(stateRef.current);
    return () => { layer.dispose(); if (mapLayer.current === layer) mapLayer.current = undefined; };
  }, [engine]);
  useEffect(() => { mapLayer.current?.update(state); }, [state]);
  useEffect(() => {
    if (!open) return;
    setError('');
    setReading(true);
    void readState(true).catch(async failure => {
      if (mounted.current) setError(readableError(failure));
      await readState().catch(() => undefined);
    }).finally(() => { if (mounted.current) setReading(false); });
    void loadDevices();
    panel.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    if (!open || session?.status !== 'recording') return;
    const timer = window.setInterval(() => { void readState().catch(() => undefined); }, 1000);
    return () => window.clearInterval(timer);
  }, [open, session?.id, session?.status]);
  useEffect(() => {
    const source = session?.recordingSource;
    if (!source || !session) return;
    const identity = `${session.id}:${source.source}:${source.deviceId || ''}`;
    if (identity === deviceDefault.current) return;
    const match = tracks.find(candidate => candidate.status === 'connected' && candidate.source === source.source
      && (source.deviceId ? candidate.deviceId === source.deviceId : candidate.source === 'simulated'));
    if (match) { deviceDefault.current = identity; setDevice(deviceKey(match)); }
  }, [session?.id, session?.recordingSource?.source, session?.recordingSource?.deviceId, devices]);
  useEffect(() => { setConfirmDiscard(undefined); setNewDraft(false); }, [session?.id]);
  useEffect(() => {
    if (open && !busy && focusAfterAction.current) {
      focusAfterAction.current = false;
      (panel.current?.querySelector<HTMLButtonElement>('.workout-primary:not(:disabled)') || panel.current)?.focus({ preventScroll: true });
    }
  }, [open, busy, state]);

  function close() { setOpen(false); setConfirmDiscard(undefined); trigger.current?.focus({ preventScroll: true }); }
  async function act(label: WorkoutAction, action: () => Promise<WorkoutState>) {
    if (operation.current || reading) return;
    operation.current = true; setBusy(label); setError('');
    const version = eventVersion.current;
    try {
      const next = await action();
      if (mounted.current) {
        focusAfterAction.current = true;
        if (version === eventVersion.current) setState(next);
        setConfirmDiscard(undefined);
        setNewDraft(false);
      }
    } catch (failure) {
      if (mounted.current) setError(readableError(failure));
      await readState().catch(() => undefined);
    } finally { operation.current = false; if (mounted.current) setBusy(''); }
  }
  const reference = session ? { id: session.id, expectedRevision: session.revision }
    : pendingStop ? { id: pendingStop.id, expectedRevision: pendingStop.revision }
    : state?.suspendedSession ? { id: state.suspendedSession.id, expectedRevision: state.suspendedSession.revision } : undefined;
  const chosenDevice = selected && selected.status === 'connected' ? { source: selected.source, deviceId: selected.deviceId } : undefined;
  const Icon = sportIcons[session?.sport || sport];
  const isSimulatedPoint = (point: NonNullable<typeof current>) => point.provenance === 'simulated' || point.mock === true;
  const simulatedPosition = current ? isSimulatedPoint(current)
    : session?.recordingSource?.source === 'simulated' || producer?.provenance === 'simulated';
  const hasSimulatedPoints = session?.points.some(point => isSimulatedPoint(point.raw));
  const hasOtherPoints = session?.points.some(point => !isSimulatedPoint(point.raw));
  const source = hasSimulatedPoints && hasOtherPoints ? 'Recorded and simulated positions' : simulatedPosition
    ? 'Simulated position' : session?.provenance === 'device' ? 'Recorded device position' : 'Position source unconfirmed';
  const simulatedMapPoint = !!mapPoint && isSimulatedPoint(mapPoint.raw);

  if (mapOnly) return null;
  return <div className="workout-controls" onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    <button ref={trigger} type="button" className="workout-trigger" aria-expanded={open} aria-controls={panelId}
      onClick={() => open ? close() : setOpen(true)}><Activity size={15} /><span>{pendingStop ? pendingStop.stream.status === 'stopped' ? 'Finish cleanup' : 'Workout cleanup' : live ? session.status === 'paused' ? 'Workout paused' : 'Recording workout' : 'Workout'}</span>{live && <output className="workout-trigger-distance">{(session.metrics.distanceMeters / 1000).toFixed(2)}<small>km</small></output>}</button>
    {open && <section ref={panel} id={panelId} className="workout-panel campus-v2-obstruction" tabIndex={-1} aria-label="Workout record" aria-busy={locked}>
      <header className="workout-head"><div><Icon size={20} /><strong>{form ? 'Record a workout' : session ? sports[session.sport] : 'Workout record'}</strong>
        {session && !form && <span>{settlingStop ? 'Stopping track…' : statusLabel(session)}</span>}</div><button type="button" aria-label="Close workout record" onClick={close}><X size={18} /></button></header>
      {error && !pendingStop && <p className="workout-notice" role="alert">{error}<button type="button" disabled={locked} onClick={() => void act('read', () => api.workoutState())}>Read current record</button></p>}
      {(!state || reading && !session) && !error && <p className="workout-note" role="status">Reading this workout…</p>}
      {pendingStop && <div className="workout-recovery"><p role="status">{pendingStop.localRemoval === 'complete' ? pendingStop.stream.status === 'stopped' ? 'Workout record removed and source stopped.' : 'Workout record removed; source stop is not confirmed.'
        : pendingStop.stream.status === 'stopped' ? 'Source stopped; local record removal is not confirmed.' : 'Local record removal and source stop are not confirmed.'}</p>
        {pendingStop.sourceRetraction === 'unconfirmed' && <p className="workout-note">Earlier references have not all been cleared. You can retry cleanup.</p>}
        {pendingStop.persistence.status !== 'encrypted-local' && <p className="workout-note">{pendingStop.persistence.reason || 'Cleanup has not been safely saved. Keep Anima open.'}</p>}
        {pendingStop.stream.status !== 'stopped' && <p className="workout-note">{pendingStop.stream.reason}</p>}
        {unavailableStop && <p className="workout-note">The original source stop is unconfirmed; Anima cannot verify it.</p>}
        {error && <p className="workout-note" role="alert">{error}</p>}
        {canRetryCleanup && <button className="workout-primary" type="button" disabled={locked} onClick={() => void act('retry', () => api.workoutCancel({ id: pendingStop.id, expectedRevision: pendingStop.revision }))}>{busyLabel || pendingStopAction(pendingStop)}</button>}</div>}
      {state?.access === 'suspended' && !pendingStop && <div className="workout-recovery"><p>This record is paused. Reopen it in the private map when its source is available.</p><button className="workout-primary" type="button" disabled={locked} onClick={() => void act('read', () => api.workoutRestore())}>Reload record</button>
        {reference && state.suspendedSession?.status !== 'finished' && <button type="button" disabled={locked} onClick={() => void act('finish', () => api.workoutFinish(reference))}>Finish this workout</button>}</div>}
      {state?.recoveryError && <div className="workout-notice"><p>{state.recoveryError}</p><div className="workout-inline-actions"><button type="button" disabled={locked} onClick={() => void act('read', () => api.workoutRestore())}>Reload</button><button type="button" disabled={locked} onClick={() => setConfirmDiscard('recovery')}>Discard earlier draft</button></div></div>}
      {form && state && !reading && <form onSubmit={event => { event.preventDefault(); if(chosenDevice) void act('start', () => api.workoutStart({ sport, retention, device: chosenDevice })); }}>
        <fieldset className="workout-sports" disabled={locked}><legend className="sr-only">Workout type</legend>{(Object.keys(sports) as WorkoutSport[]).map(choice => {
          const SportIcon = sportIcons[choice];
          return <label key={choice}><input type="radio" name={`${panelId}-sport`} value={choice} checked={sport === choice} onChange={() => setSport(choice)} /><span><SportIcon size={17} />{sports[choice]}</span></label>;
        })}</fieldset>
        <div className="workout-field"><label htmlFor={`${panelId}-device`}>Track source</label><div><select id={`${panelId}-device`} value={device} disabled={locked || loadingDevices} onChange={event => setDevice(event.target.value)} required aria-label="Track source"><option value="">{loadingDevices ? 'Finding tracks…' : 'Choose a track'}</option>{tracks.map(choice => <option key={deviceKey(choice)} value={deviceKey(choice)} disabled={choice.status !== 'connected'}>{choice.deviceLabel}{choice.status !== 'connected' ? ` · ${{ unavailable: 'Unavailable', unauthorized: 'Not available', offline: 'Offline', connected: '' }[choice.status]}` : ''}</option>)}</select><button type="button" aria-label="Refresh tracks" disabled={locked || loadingDevices} onClick={() => void loadDevices()}><RefreshCw size={16} /></button></div></div>
        {selected?.provenance === 'simulated' && <p className="workout-note">This track is simulated.</p>}
        {selected?.reason && <p className="workout-note">{selected.reason}</p>}
        <fieldset className="workout-retention" disabled={locked}><legend>Retention</legend><label><input type="radio" name={`${panelId}-retention`} checked={retention === 'session-only'} onChange={() => setRetention('session-only')} /><span>This window only</span></label><label><input type="radio" name={`${panelId}-retention`} checked={retention === 'encrypted-local'} onChange={() => setRetention('encrypted-local')} /><span>Encrypted local save</span></label></fieldset>
        {newDraft && <p className="workout-note">Starting will replace this record.</p>}
        <button className="workout-primary" type="submit" disabled={locked || !chosenDevice}><Play size={16} />{busyLabel || 'Start recording'}</button>
        {newDraft && <button className="workout-text-action" type="button" onClick={() => setNewDraft(false)}>Return to this record</button>}
        <details className="workout-connection-details"><summary>Track and retention</summary><p>Window-only records are lost when the app closes. An encrypted draft reopens paused.</p>{tracks.filter(choice => choice.status !== 'connected').map(choice => <p key={deviceKey(choice)}>{choice.deviceLabel}: {choice.reason || 'Track currently unavailable'}</p>)}</details>
      </form>}
      {session && !form && <>
        <p className="workout-source">{current?.deviceLabel || producer?.deviceLabel || 'Recorded track'} · {source}</p>
        {pointOnMap && <div className="workout-map-actions"><button type="button" onClick={() => { close(); mapLayer.current?.overview(); }}><Route size={15} />View track</button><button type="button" onClick={() => { close(); mapLayer.current?.locate(); }}><LocateFixed size={15} />{simulatedMapPoint ? 'Show simulated position' : 'Show recorded position'}</button></div>}
        {engine && mapPoint && !pointOnMap && <p className="workout-note">The last recorded position is outside this map.</p>}
        <div className="workout-distance"><output aria-live="off">{(session.metrics.distanceMeters / 1000).toFixed(2)}</output><span>km</span></div>
        <dl className="workout-metrics"><div><dt>Recorded time</dt><dd>{duration(session.metrics.elapsedActiveMs)}</dd></div><div><dt>{session.status === 'finished' ? 'Average pace' : 'Current pace'}</dt><dd>{pace(session.status === 'finished' ? session.metrics.averagePaceSecondsPerKm : session.metrics.paceSecondsPerKm)}<small>{(session.status === 'finished' ? session.metrics.averagePaceSecondsPerKm : session.metrics.paceSecondsPerKm) !== null ? '/km' : 'Unknown'}</small></dd></div></dl>
        {session.pauseDetail && <p className="workout-note">{session.pauseDetail}</p>}
        {session.status === 'recording' && session.signal !== 'good' && <p className="workout-note">{signalReason(session)}</p>}
        {stopUnconfirmed && !settlingStop && <p className="workout-note" role="status">{legacyStopUnconfirmed ? 'The original source stop is unconfirmed; Anima cannot verify it.' : session.stream.reason}</p>}
        {session.persistence.status !== 'encrypted-local' && <p className="workout-note">{retentionLabel(session)}</p>}
        <details className="workout-record-details"><summary>This workout</summary><dl><div><dt>Time with trusted position</dt><dd>{duration(session.metrics.trustedActiveMs)}</dd></div><div><dt>Average pace</dt><dd>{pace(session.metrics.averagePaceSecondsPerKm)}</dd></div><div><dt>Cadence</dt><dd>{session.metrics.cadenceStepsPerMinute === null ? 'Unknown' : `${Math.round(session.metrics.cadenceStepsPerMinute)} steps/min`}{cadenceNote(session) && <small>{cadenceNote(session)}</small>}</dd></div><div><dt>Retention</dt><dd>{retentionLabel(session)}</dd></div></dl>
          {session.splits.length > 0 && <ol className="workout-splits" aria-label="Kilometer splits">{session.splits.map(split => <li key={split.kilometer}><span>{split.kilometer} km</span><span>{pace(split.paceSecondsPerKm)}<small>/km</small></span></li>)}</ol>}
          <p>Local workout record; not submitted to an institution.</p></details>
        <div className="workout-actions">{session.status === 'recording' && <button className="workout-primary" type="button" disabled={locked} onClick={() => reference && void act('pause', () => api.workoutPause(reference))}><Pause size={16} />{busyLabel || 'Pause'}</button>}
          {stopUnconfirmed && !legacyStopUnconfirmed && <button className="workout-primary" type="button" disabled={locked} onClick={() => reference && void act('stop', () => session.status === 'finished' ? api.workoutFinish(reference) : api.workoutPause(reference))}>{busyLabel || 'Retry stopping the track'}</button>}
          {session.status === 'paused' && !stopUnconfirmed && <button className="workout-primary" type="button" disabled={locked || !chosenDevice} onClick={() => reference && chosenDevice && void act('resume', () => api.workoutResume({ ...reference, device: chosenDevice }))}><Play size={16} />{busyLabel || 'Resume recording'}</button>}
          {live && !stopUnconfirmed && <button type="button" disabled={locked} onClick={() => reference && void act('finish', () => api.workoutFinish(reference))}><Square size={14} />End</button>}
          {session.status === 'finished' && !stopUnconfirmed && <button className="workout-primary" type="button" disabled={locked} onClick={() => setNewDraft(true)}>Record another workout</button>}</div>
        {session.status === 'paused' && !legacyStopUnconfirmed && <details className="workout-connection-details" open={!chosenDevice || undefined}><summary>{chosenDevice ? 'Change track source' : 'Choose a track to resume'}</summary><label className="workout-field"><span>Resume with</span><select aria-label="Track source for resuming" value={device} disabled={locked || loadingDevices} onChange={event => setDevice(event.target.value)}><option value="">Choose a track</option>{tracks.map(choice => <option key={deviceKey(choice)} value={deviceKey(choice)} disabled={choice.status !== 'connected'}>{choice.deviceLabel}</option>)}</select></label><button type="button" disabled={locked || loadingDevices} onClick={() => void loadDevices()}>Refresh tracks</button></details>}
      </>}
      {reference && !pendingStop && !form && !confirmDiscard && <button type="button" className="workout-text-action" disabled={locked} onClick={() => setConfirmDiscard('session')}>Cancel and discard this record</button>}
      {confirmDiscard && <div className="workout-discard" role="group" aria-label="Discard workout record"><p>{confirmDiscard === 'recovery' ? 'Discard the unreadable earlier draft?' : 'Stop recording and discard this workout?'}</p><div><button type="button" disabled={locked} onClick={() => setConfirmDiscard(undefined)}>Keep record</button><button type="button" disabled={locked} onClick={() => void act('discard', () => confirmDiscard === 'recovery' ? api.workoutDiscardRecovery() : api.workoutCancel(reference!))}>Discard record</button></div></div>}
    </section>}
  </div>;
}
