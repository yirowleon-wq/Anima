import { useEffect } from 'react';
import { LampDesk, Pause, Play, Square, X } from 'lucide-react';
import { focusSession, useFocusSession, type FocusSession } from './focus-session';
import './life-continuity.css';

export function focusTime(elapsedMs: number) {
  const seconds = Math.floor(elapsedMs / 1000), hours = Math.floor(seconds / 3600);
  return `${hours ? `${hours}:` : ''}${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function FocusLamp({ onActiveChange, onStatusChange, onFinish, disabled = false }: {
  onActiveChange?: (active: boolean) => void;
  onStatusChange?: (status: FocusSession['status']) => void;
  onFinish?: (session: FocusSession) => void;
  disabled?: boolean;
}) {
  const session = useFocusSession(), running = session.status === 'running';
  useEffect(() => { onActiveChange?.(running); }, [running, onActiveChange]);
  useEffect(() => { onStatusChange?.(session.status); }, [session.status, onStatusChange]);
  if (session.status === 'idle' && !session.storageUnavailable) return null;
  return <div className="focus-lamp" data-state={session.status} aria-label="Focus lamp">
    <span className="focus-lamp-light" aria-hidden="true"><LampDesk size={20} /></span>
    {session.status !== 'idle' && <>
      <time className="focus-lamp-time" aria-label={`${session.recovered ? 'When you last stopped' : 'This focus session'} ${focusTime(session.elapsedMs)}`}>{focusTime(session.elapsedMs)}</time>
      {session.status === 'ended' ? <>
        <button type="button" disabled={disabled} onClick={() => focusSession.start()}>Start again</button>
        <button className="focus-lamp-icon" type="button" aria-label="Dismiss this timer" onClick={() => focusSession.clear()}><X size={14} /></button>
      </> : <>
        <button type="button" disabled={disabled} onClick={() => running ? focusSession.pause() : focusSession.resume()}>
          {running ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}{running ? 'Pause' : session.recovered ? 'Continue this session' : 'Continue focusing'}
        </button>
        <button type="button" disabled={disabled} onClick={() => { const ended = focusSession.end(); if (ended) onFinish?.(ended); }}><Square size={11} aria-hidden="true" />End</button>
      </>}
    </>}
    {session.storageUnavailable && <span className="focus-lamp-issue" role="status">This timer could not be saved on this device</span>}
  </div>;
}
