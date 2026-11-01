import { useEffect, useId, useRef, useState } from 'react';
import type { CampusActivityConnectorState } from '../shared/campusActivity';
import { uiError } from './ui';
import './campusActivity-connection.css';

const api = window.anima;
export type CampusActivityConnectionFocus = 'primary' | 'allow' | 'refresh' | 'disconnect';
type Operation = CampusActivityConnectionFocus | '';

/** A view onto the activity owner. Importing a file does not connect an
 * institutional service or turn a local record into an official receipt. */
export function CampusActivityConnection({ disabled = false, restoreFocus, onControlFocus }: {
  disabled?: boolean;
  restoreFocus?: CampusActivityConnectionFocus;
  onControlFocus?: (focus: CampusActivityConnectionFocus) => void;
}) {
  const titleId = useId();
  const [connection, setConnection] = useState<CampusActivityConnectorState>();
  const [pending, setPending] = useState<Operation>('refresh');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const alive = useRef(true), generation = useRef(0), running = useRef<Operation>('refresh');
  const controls = useRef<Partial<Record<CampusActivityConnectionFocus, HTMLButtonElement>>>({});
  const restore = useRef(restoreFocus);
  const readingClosed = connection?.campusReadAllowed === false;

  useEffect(() => {
    alive.current = true;
    const request = ++generation.current;
    void api.campusActivityStatus().then(value => {
      if (alive.current && request === generation.current) setConnection(value);
    }).catch(problem => {
      if (alive.current && request === generation.current) setError(uiError(problem));
    }).finally(() => {
      if (alive.current && request === generation.current) { running.current = ''; setPending(''); }
    });
    return () => { alive.current = false; generation.current++; };
  }, []);
  useEffect(() => api.onEvent(event => {
    if (event.type !== 'state' || running.current) return;
    const request = ++generation.current;
    void api.campusActivityStatus().then(value => {
      if (alive.current && request === generation.current) setConnection(value);
    }).catch(problem => {
      if (alive.current && request === generation.current) setError(uiError(problem));
    });
  }), []);
  useEffect(() => {
    if (!restore.current || pending || disabled) return;
    const button = controls.current[restore.current] || controls.current.primary;
    const frame = requestAnimationFrame(() => {
      if (button?.isConnected && !button.disabled) { button.focus({ preventScroll: true }); restore.current = undefined; }
    });
    return () => cancelAnimationFrame(frame);
  }, [pending, disabled]);

  async function perform(kind: CampusActivityConnectionFocus, opener: HTMLButtonElement) {
    if (running.current) return;
    const request = ++generation.current;
    running.current = kind; setPending(kind); setError(''); setNotice(''); onControlFocus?.(kind);
    try {
      let value: CampusActivityConnectorState;
      if (kind === 'allow') {
        await api.permission({ scope: 'campus:activity:read', enabled: true });
        value = await api.campusActivityStatus();
      } else value = kind === 'primary' ? await api.campusActivityConnect()
        : kind === 'disconnect' ? await api.campusActivityDisconnect() : await api.campusActivityStatus();
      if (!alive.current || request !== generation.current) return;
      setConnection(value);
      setNotice(kind === 'disconnect' ? 'Activity reading has stopped.' : kind === 'allow'
        ? value.readAllowed ? 'Activity reading is allowed.' : 'Activity reading is still stopped. Review the source permissions.'
        : kind === 'primary' ? 'Review the current activity data source below.' : 'Current data source refreshed.');
    } catch (problem) {
      if (alive.current && request === generation.current) setError(uiError(problem));
    } finally {
      if (alive.current && request === generation.current) {
        running.current = ''; setPending('');
        requestAnimationFrame(() => {
          const target = opener.isConnected ? opener : controls.current.primary;
          if (target?.isConnected && !target.disabled) target.focus({ preventScroll: true });
        });
      }
    }
  }

  return <section className="campusActivity-connection" aria-labelledby={titleId} aria-busy={!!pending}>
    <div className="campusActivity-connection-main"><h3 id={titleId}>Activity records</h3>
      <button ref={button => { controls.current.primary = button || undefined; }} type="button" className="primary-button"
        disabled={disabled || !!pending} onFocus={() => onControlFocus?.('primary')}
        onClick={event => void perform('primary', event.currentTarget)}>{pending === 'primary' ? 'Choosing file…' : 'Select data file'}</button>
    </div>
    <p className="campusActivity-connection-feedback">{connection?.configured
      ? connection.readAllowed === false ? 'A local data source is configured. Reading is stopped.' : 'Local imported activity records. No institutional provider is connected.'
      : 'No activity data source is configured. Import a JSON file to read local records.'}</p>
    {readingClosed && <p className="campusActivity-connection-feedback" role="status">Campus reading is off. You can import a local file; reading requires enabling campus access in the source permissions.</p>}
    {error && <p className="campusActivity-connection-feedback" role="alert">{error}</p>}
    {notice && <p className="campusActivity-connection-feedback" role="status">{notice}</p>}
    <div className="campusActivity-connection-alternative-actions">
      {connection?.configured && connection.readAllowed === false && <button ref={button => { controls.current.allow = button || undefined; }} type="button" className="subtle-button"
        disabled={disabled || !!pending || readingClosed} onFocus={() => onControlFocus?.('allow')}
        onClick={event => void perform('allow', event.currentTarget)}>{pending === 'allow' ? 'Allowing…' : 'Allow reading'}</button>}
      <button ref={button => { controls.current.refresh = button || undefined; }} type="button" className="text-button"
        disabled={disabled || !!pending} onFocus={() => onControlFocus?.('refresh')}
        onClick={event => void perform('refresh', event.currentTarget)}>{pending === 'refresh' ? 'Refreshing…' : 'Refresh'}</button>
      <button ref={button => { controls.current.disconnect = button || undefined; }} type="button" className="text-button"
        disabled={disabled || !!pending} onFocus={() => onControlFocus?.('disconnect')}
        onClick={event => void perform('disconnect', event.currentTarget)}>{pending === 'disconnect' ? 'Stopping…' : 'Stop reading'}</button>
    </div>
  </section>;
}
