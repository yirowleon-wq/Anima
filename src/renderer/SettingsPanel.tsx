import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { ArrowLeft, Check, ChevronRight, Download, LoaderCircle, Pencil, Trash2, X } from 'lucide-react';
import { IconButton, Modal, PagePanel, Switch, uiError } from './ui';
import { MemoryPanelSimple, SourcePermissions, type MemoryWorkspaceState } from './HarnessViews';
import type { SettingsUpdate, State } from '../shared/types';
import { useAppearance, type Appearance } from './appearance';
import { DEFAULT_INTERACTION } from '../shared/interaction';
import { PersonaEditor, type PersonaDraft, type PersonaPreviewDraft } from './PersonaEditor';
import { CompanionSettings, type CompanionSettingsDraft } from './CompanionSettings';
import { useCompanion, type CompanionMoment } from './companion';
import { RichText } from './RichText';
import { CampusActivityConnection, type CampusActivityConnectionFocus } from './CampusActivityConnection';
import './settings-refinement.css';
import { environmentReference, publicEnvironmentReferenceSchema } from '../shared/campus-profile';

const api = window.anima;
type SettingsTab = 'companion' | 'conversation' | 'preferences' | 'connections' | 'memory' | 'materials';
export interface SettingsDraft {
  timeZone?: string;
  environmentReference?: { label: string; latitude: string; longitude: string; timeZone: string };
  apiKey?: string;
  guidance?: string;
  persona?: PersonaDraft;
  personaPreview?: PersonaPreviewDraft;
  companion?: CompanionSettingsDraft;
  /** Navigation only; privacy changes still clear every editable/private field above. */
  navigation?: { entry: SettingsTab; tab: SettingsTab; campusActivityFocus?: CampusActivityConnectionFocus; resume?: boolean;
    positions?: Partial<Record<SettingsTab, number>> };
}
interface Props {
  embedded?: boolean;
  initialTab?: SettingsTab;
  companionMoment?: CompanionMoment;
  companionEntry?: 'partner' | 'light';
  companionEntryRevision?: number;
  state: State;
  busy: boolean;
  onState: (s: State) => void;
  onClose: () => void;
  notify: (s: string) => void;
  onClear: () => void;
  onBeforeForget?: () => boolean;
  draft: MutableRefObject<SettingsDraft>;
  memoryWorkspace: MemoryWorkspaceState;
  onMemoryWorkspace: Dispatch<SetStateAction<MemoryWorkspaceState>>;
}
type Feedback = { action: string; text: string; error?: boolean } | null;
const date = (v: string) =>
  new Date(v).toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
const errorText = uiError;

export function SettingsPanel({
  state,
  busy,
  onState,
  onClose,
  notify,
  onClear,
  onBeforeForget,
  draft,
  memoryWorkspace,
  onMemoryWorkspace,
  embedded,
  initialTab = 'connections',
  companionMoment,
  companionEntry = 'partner',
  companionEntryRevision = 0,
}: Props) {
  const [appearance, setAppearance] = useAppearance();
  const { reset: resetCompanion, value: companion, update: updateCompanion } = useCompanion();
  const interaction = state.settings.interaction || DEFAULT_INTERACTION;
  const resumeNavigation = useRef(initialTab !== 'companion' && draft.current.navigation?.resume && draft.current.navigation.entry === initialTab
    ? draft.current.navigation : undefined);
  const [tab, setTab] = useState<SettingsTab>(resumeNavigation.current?.tab || initialTab);
  const tabs: SettingsTab[] = embedded ? ['conversation', 'preferences', 'connections', 'memory'] : ['companion', 'conversation', 'preferences', 'connections', 'memory'];
  const tabNames: Record<string, string> = { companion: 'Companion', conversation: 'Conversation', preferences: 'Reading', connections: 'Connections', materials: 'Campus data', memory: 'About you' };
  const Frame = embedded ? PagePanel : Modal;
  const [guidance, setGuidance] = useState(draft.current.guidance ?? state.settings.guidance);
  const [guidanceExpanded, setGuidanceExpanded] = useState(
    draft.current.guidance !== undefined && draft.current.guidance !== state.settings.guidance,
  );
  const [timeZoneDraft, setTimeZoneDraft] = useState(draft.current.timeZone ?? state.settings.timeZone ?? 'America/Los_Angeles');
  const initialEnvironment = environmentReference(state.settings);
  const [environmentDraft, setEnvironmentDraft] = useState(draft.current.environmentReference ?? { label: initialEnvironment.label, latitude: String(initialEnvironment.latitude), longitude: String(initialEnvironment.longitude), timeZone: initialEnvironment.timeZone });
  function changeEnvironment(field: keyof typeof environmentDraft, value: string) { setEnvironmentDraft(current => { const next = { ...current, [field]: value }; draft.current.environmentReference = next; return next; }); }
  const [pending, setPending] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [memoryText, setMemoryText] = useState(''),
    [editId, setEditId] = useState<string>();
  const [sourceId, setSourceId] = useState(''),
    [clearConfirm, setClearConfirm] = useState(false);
  const testCancelled = useRef(false),
    pendingRef = useRef('');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const sourceBackRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const positions = useRef<Partial<Record<SettingsTab, number>>>({ ...resumeNavigation.current?.positions });
  const previewRef = useRef<HTMLDivElement>(null);
  const previewAnchor = useRef<{ element: HTMLElement; offset: number } | undefined>(undefined);
  const disabled = busy || !!pending;
  useEffect(
    () => () => {
      if (pendingRef.current === 'test') void api.cancelConnection();
    },
    [],
  );
  useEffect(() => {
    if (tab !== 'materials') return;
    if (resumeNavigation.current?.campusActivityFocus) return;
    const frame = requestAnimationFrame(() => sourceBackRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [tab]);
  useEffect(() => {
    const previous = draft.current.navigation;
    draft.current.navigation = { entry: initialTab, tab, positions: positions.current, resume: true,
      ...(previous?.entry === initialTab && previous.tab === tab && previous.campusActivityFocus ? { campusActivityFocus: previous.campusActivityFocus } : {}) };
  }, [draft, initialTab, tab]);
  function settingsViewport() {
    return embedded ? bodyRef.current?.closest<HTMLElement>('.page-panel') : bodyRef.current;
  }
  useLayoutEffect(() => {
    const viewport = settingsViewport();
    if (!viewport) return;
    viewport.scrollTop = positions.current[tab] || 0;
    const remember = () => { positions.current[tab] = viewport.scrollTop; };
    viewport.addEventListener('scroll', remember, { passive: true });
    return () => viewport.removeEventListener('scroll', remember);
  }, [tab, embedded]);
  useLayoutEffect(() => {
    const viewport = previewRef.current, anchor = previewAnchor.current;
    if (viewport && anchor?.element.isConnected)
      viewport.scrollTop += anchor.element.getBoundingClientRect().top - viewport.getBoundingClientRect().top - anchor.offset;
    previewAnchor.current = undefined;
  }, [appearance.readingScale, appearance.density]);
  function changeReadingLayout(patch: Pick<Partial<Appearance>, 'readingScale' | 'density'>) {
    const viewport = previewRef.current;
    if (viewport) {
      const top = viewport.getBoundingClientRect().top;
      const element = [...viewport.querySelectorAll<HTMLElement>('.markdown > p, .markdown > h2, .markdown > blockquote')]
        .find(item => item.getBoundingClientRect().bottom > top + 8);
      if (element) previewAnchor.current = { element, offset: element.getBoundingClientRect().top - top };
    }
    setAppearance(patch);
  }
  function changeTab(value: SettingsTab) {
    const viewport = settingsViewport();
    if (viewport) positions.current[tab] = viewport.scrollTop;
    if (pendingRef.current === 'test') {
      testCancelled.current = true;
      void api.cancelConnection();
    }
    resumeNavigation.current = undefined;
    draft.current.navigation = { entry: initialTab, tab: value, positions: positions.current, resume: true };
    setTab(value);
    setFeedback(null);
  }
  async function perform(action: string, fn: () => Promise<void>) {
    if (pendingRef.current) return;
    pendingRef.current = action;
    setPending(action);
    setFeedback(null);
    try {
      await fn();
    } catch (e) {
      setFeedback({
        action,
        text:
          action === 'test' && testCancelled.current
            ? 'Connection check stopped'
            : errorText(e).replace(/[。.!！]+$/, ''),
        error: !(action === 'test' && testCancelled.current),
      });
    } finally {
      pendingRef.current = '';
      setPending('');
    }
  }
  function result(actions: string[]) {
    return feedback && actions.includes(feedback.action) ? (
      <div
        className={`inline-status ${feedback.error ? 'error' : ''}`}
        role={feedback.error ? 'alert' : 'status'}
      >
        {feedback.text}
      </div>
    ) : null;
  }
  async function update(action: string, settings: SettingsUpdate) {
    await perform(action, async () => {
      onState(await api.saveSettings(settings));
    });
  }
  const connector = state.campusConnector;
  const connectorReady =
    !!connector?.configured && !!connector.available && connector.authStatus === 'verified';
  const connectorStatus = !connector?.configured ? 'No data source' : !connector.available ? 'Data file unavailable' : 'Local records available';
  if (initialTab === 'companion' && tab === 'companion') return <section className="companion-room-page" aria-label="Companion and atmosphere">
    <CompanionSettings persona={state.settings.persona} draft={draft} moment="chat" roomMode initialEntry={companionEntry} entryRevision={companionEntryRevision}
      onState={onState} busy={busy || !!pending} saving={pending === 'persona'} saveOperation={operation => perform('persona', operation)} onEditPersona={() => changeTab('conversation')} />
    <button type="button" className="companion-room-close icon-button" onClick={onClose} aria-label="Back to the previous page"><X size={20} /></button>
  </section>;
  return (
    <Frame
      title={tab === 'materials' ? 'Sources and permissions' : initialTab === 'memory' ? 'About you' : 'Settings'}
      onClose={onClose}
      className={`settings-panel settings-refined ${initialTab === 'memory' ? 'memory-page' : ''} ${['companion', 'conversation', 'preferences'].includes(tab) ? 'settings-wide' : ''} ${tab === 'preferences' ? 'settings-rhythm' : tab === 'conversation' ? 'settings-conversation' : tab === 'connections' ? 'settings-connect' : ''}`}
    >
      {tab === 'materials' ? (
        <button ref={sourceBackRef} className="source-back text-button" onClick={() => changeTab('connections')}>
          <ArrowLeft size={14} />
          Back to connections
        </button>
      ) : initialTab !== 'memory' ? (
        <div className="panel-tabs" role="tablist" aria-label="Anima settings">
          {tabs.map((t, i) => (
            <button
              key={t}
              id={`settings-tab-${i}`}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              aria-selected={tab === t}
              aria-controls={`settings-panel-${i}`}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => changeTab(t)}
              onKeyDown={(e) => {
                let next: number | undefined;
                if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
                if (e.key === 'ArrowLeft') next = (i + tabs.length - 1) % tabs.length;
                if (e.key === 'Home') next = 0;
                if (e.key === 'End') next = tabs.length - 1;
                if (next !== undefined) {
                  e.preventDefault();
                  changeTab(tabs[next]);
                  tabRefs.current[next]?.focus();
                }
              }}
            >
              {tabNames[t]}
            </button>
          ))}
        </div>
      ) : null}
      <div
        className="panel-body" data-settings-panel={tab === 'materials' ? 'sources' : undefined}
        ref={bodyRef}
        role={tab === 'materials' || initialTab === 'memory' ? 'region' : 'tabpanel'}
        id={tab === 'materials' ? 'settings-source-panel' : `settings-panel-${tabs.indexOf(tab)}`}
        aria-label={tab === 'materials' ? 'Source settings' : initialTab === 'memory' ? 'About you' : undefined}
        aria-labelledby={
          tab === 'materials' || initialTab === 'memory' ? undefined : `settings-tab-${tabs.indexOf(tab)}`
        }
      >
        {busy && tab === 'connections' && <p className="busy-note">Wait for this reply to finish before changing the connection.</p>}
        {tab === 'companion' && <CompanionSettings persona={state.settings.persona} draft={draft} moment={companionMoment} onState={onState} busy={busy || !!pending} saving={pending === 'persona'} saveOperation={(operation) => perform('persona', operation)} onEditPersona={() => changeTab('conversation')} />}
        {tab === 'connections' && (
          <>
            <div className="section-heading">
              <div>
                <h3>{state.modelRuntime?.displayName || 'Luna'}</h3>
                <p>{state.settings.mode === 'demo' ? 'Demo mode' : 'Luna selected'}</p>
              </div>
            </div>
              <div className="model-runtime-note">
                <div className="field-buttons">
                  {state.settings.mode === 'demo' && (
                    <button
                      className="primary-button"
                      disabled={disabled}
                      onClick={() => void update('enable-luna', { mode: 'luna' })}
                    >
                      Use this connection
                    </button>
                  )}
                  <button
                    className={state.settings.mode === 'demo' ? 'subtle-button' : 'primary-button'}
                    disabled={disabled}
                    onClick={() => {
                      testCancelled.current = false;
                      void perform('test', async () => {
                        const text = await api.testConnection({});
                        setFeedback({ action: 'test', text: text.replace(/[。.!！]+$/, '') });
                      });
                    }}
                  >
                    {pending === 'test' && <LoaderCircle size={14} className="spin" />}
                    {pending === 'test' ? 'Checking…' : 'Check connection'}
                  </button>
                  {pending === 'test' && (
                    <button
                      className="text-button"
                      onClick={() => {
                        testCancelled.current = true;
                        void api.cancelConnection();
                      }}
                    >
                      Stop check
                    </button>
                  )}
                </div>
                {result(['test'])}
                <details className="connection-technical">
                  <summary>About this connection</summary>
                  <p>
                    Uses the local Codex CLI session for {state.modelRuntime?.displayName || 'Luna'}. The connection check reports the returned model identity when available. No API key is bundled or required here.
                  </p>
                </details>
              </div>
            {state.settings.mode === 'luna' && (
              <details className="settings-disclosure connection-extra">
                <summary>Other connection settings</summary>
                <div className="settings-disclosure-body">
                  <button
                    className="text-button use-demo"
                    disabled={disabled}
                    onClick={() =>
                      void perform('demo', async () => {
                        onState(await api.saveSettings({ mode: 'demo' }));
                        setFeedback({ action: 'demo', text: 'Demo mode is ready to explore' });
                      })
                    }
                  >
                    Use demo mode
                  </button>
                </div>
              </details>
            )}
            {result(['demo'])}
            <button className="settings-navigation" onClick={() => changeTab('materials')}>
              <span>
                <strong>Campus data and weather</strong>
                <small>{connectorReady ? 'Local dataset configured' : 'Choose a data source'}</small>
              </span>
              <ChevronRight size={16} />
            </button>
          </>
        )}
        {tab === 'materials' && (
          <>
            <details className="settings-disclosure source-permissions-entry">
              <summary>Allowed sources</summary>
              <div className="settings-disclosure-body"><SourcePermissions onState={onState} /></div>
            </details>
            <section className="campus-source-block">
              <div className="connector connector-primary">
                <div><div className="connector-title-line"><strong>Academic records</strong>
                  <span className={`source-status ${connectorReady ? 'connected' : 'unavailable'}`}>{connectorStatus}</span>
                </div><p>Import a JSON dataset to read classes, exams, grades, and related records. No institutional provider is connected.</p></div>
                <button className="subtle-button" disabled={disabled} onClick={() => void perform('account-connect', async () => {
                  onState(await api.connectCampusAccount());
                  setFeedback({ action: 'account-connect', text: 'Review the current data source below.' });
                })}>{pending === 'account-connect' ? <LoaderCircle size={14} className="spin" /> : 'Select data file'}</button>
              </div>
              {connector?.configured && <details className="connector-more"><summary>Data source</summary>
                <div className="connector-actions" role="group" aria-label="Academic data source controls">
                  <button className="connector-action" disabled={disabled} onClick={() => void perform('credentials', async () => {
                    onState(await api.configureCampusCredentials());
                    setFeedback({ action: 'credentials', text: 'Review the current data source below.' });
                  })}>Replace data file</button>
                  <button className="connector-action connector-action-danger" disabled={disabled} onClick={() => void perform('connector-disconnect', async () => {
                    onState(await api.disconnectCampusConnector());
                    setFeedback({ action: 'connector-disconnect', text: 'Academic record reading has stopped.' });
                  })}>Stop reading</button>
                </div>
                <small>Imported records are local snapshots. They do not confirm current institutional status or attendance.
                  {connector.lastVerifiedAt ? ` Last checked: ${date(connector.lastVerifiedAt)}.` : ''}</small>
              </details>}
            </section>

            {result([
              'account-connect',
              'connector-disconnect',
              'credentials',
              'credentials-forget',
              'import',
              'template',
              'disconnect',
            ])}
            <details className="settings-disclosure" open={!!resumeNavigation.current?.campusActivityFocus}>
              <summary>Activity records</summary>
              <div className="settings-disclosure-body">
                <CampusActivityConnection disabled={disabled} restoreFocus={resumeNavigation.current?.campusActivityFocus}
                  onControlFocus={campusActivityFocus => { draft.current.navigation = { entry: initialTab, tab, campusActivityFocus }; }} />
              </div>
            </details>
            {!connectorReady && (
              <details className="settings-disclosure campus-import-block">
                <summary>Local campus material</summary>
                <div className="settings-disclosure-body">
                  <div className="connector">
                    <div>
                      <strong>{state.campus ? 'Saved material' : 'Open data file'}</strong>
                      <p>Fresh institutional records require a separately configured provider.</p>
                    </div>
                    <button
                      className="subtle-button"
                      disabled={disabled}
                      onClick={() =>
                        void perform('import', async () => {
                          const next = await api.importCampus();
                          if (next) {
                            onState(next);
                            setFeedback({
                              action: 'import',
                              text: 'This file is open. It is a local snapshot; live institutional records require a configured provider.',
                            });
                          }
                        })
                      }
                    >
                      {pending === 'import' ? (
                        <LoaderCircle size={14} className="spin" />
                      ) : state.campus ? (
                        'Update'
                      ) : (
                        'Import'
                      )}
                    </button>
                  </div>
                  {state.campus && (
                    <small className="campus-import-state">
                      This file was saved on  {date(state.campus.updatedAt)}
                    </small>
                  )}
                  <details className="campus-more">
                    <summary>File actions</summary>
                    <div className="field-buttons">
                      <button
                        className="text-button"
                        disabled={disabled}
                        onClick={() =>
                          void perform('template', async () => {
                            if (await api.campusTemplate())
                              setFeedback({ action: 'template', text: 'A blank data file was saved. Fill it using the included format' });
                          })
                        }
                      >
                        <Download size={14} />
                        Save blank format
                      </button>
                      {state.campus && (
                        <button
                          className="text-button"
                          disabled={disabled}
                          onClick={() =>
                            void perform('disconnect', async () => {
                              onState(await api.disconnectCampus());
                              setFeedback({ action: 'disconnect', text: 'This saved material was removed' });
                            })
                          }
                        >
                          Remove this material
                        </button>
                      )}
                    </div>
                  </details>
                </div>
              </details>
            )}
            <details className="settings-disclosure">
              <summary><span>Weather and air quality</span><small>{state.settings.weatherEnabled ? 'Allowed' : 'Off'}</small></summary>
              <div className="settings-disclosure-body">
                <Switch checked={state.settings.weatherEnabled} onChange={value => void update('weather', { weatherEnabled: value })}
                  label="Use the selected public reference" detail="Queries a manually chosen reference. It does not read device location."
                  disabled={!!pending || (busy && !state.settings.weatherEnabled)} />
                <label className="field-label">Reference name<input value={environmentDraft.label} disabled={disabled}
                  onChange={event => changeEnvironment('label', event.target.value)} /></label>
                <div className="settings-environment-coordinates">
                  <label className="field-label">Latitude<input type="number" step="any" min={-90} max={90} value={environmentDraft.latitude} disabled={disabled}
                    onChange={event => changeEnvironment('latitude', event.target.value)} /></label>
                  <label className="field-label">Longitude<input type="number" step="any" min={-180} max={180} value={environmentDraft.longitude} disabled={disabled}
                    onChange={event => changeEnvironment('longitude', event.target.value)} /></label>
                </div>
                <label className="field-label">Reference time zone<input value={environmentDraft.timeZone} placeholder="America/Los_Angeles" disabled={disabled}
                  onChange={event => changeEnvironment('timeZone', event.target.value)} /></label>
                <button type="button" className="subtle-button" disabled={disabled} onClick={() => void perform('environment', async () => {
                  if (!environmentDraft.latitude.trim() || !environmentDraft.longitude.trim()) throw new Error('Enter both reference coordinates.');
                  const latitude = Number(environmentDraft.latitude), longitude = Number(environmentDraft.longitude);
                  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error('Latitude must be between -90 and 90 degrees.');
                  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error('Longitude must be between -180 and 180 degrees.');
                  if (!environmentDraft.label.trim()) throw new Error('Enter a reference name.');
                  if (!environmentDraft.timeZone.trim()) throw new Error('Enter a reference time zone.');
                  try { new Intl.DateTimeFormat('en-US', { timeZone: environmentDraft.timeZone.trim() }).format(); } catch { throw new Error('Enter a valid IANA time zone for the public reference.'); }
                  const reference = publicEnvironmentReferenceSchema.parse({ id: 'user-public-reference', label: environmentDraft.label.trim(),
                    latitude, longitude, timeZone: environmentDraft.timeZone.trim(), basis: 'explicit_public_reference' });
                  onState(await api.saveSettings({ environmentReference: reference })); delete draft.current.environmentReference;
                  setFeedback({ action: 'environment', text: 'Public reference saved.' });
                })}>Save public reference</button>
                {result(['environment'])}
              </div>
            </details>
            {result(['weather'])}

          </>
        )}
        {tab === 'memory' && (
          <MemoryPanelSimple
            key={`${state.privacyEpoch}:${state.policyRevision}:${state.sourceBoundary ?? 0}`}
            state={state}
            onState={onState}
            busy={busy}
            workspace={memoryWorkspace}
            onWorkspace={onMemoryWorkspace}
          />
        )}
        {(tab === 'preferences' || tab === 'conversation') && (
          <>
            <div hidden={tab !== 'conversation'}>
              <PersonaEditor persona={state.settings.persona} legacyGuidance={state.settings.guidance} draft={draft} onState={onState} busy={busy || !!pending} saving={pending === 'persona'} perform={(operation) => perform('persona', operation)} />
              {result(['persona'])}
            </div>
            {tab === 'preferences' && <>
              <div className="rhythm-layout">
                <div className="rhythm-controls">
                  <section className="preference-section">
                    <label className="field-label">Your time zone<input value={timeZoneDraft} disabled={disabled} placeholder="America/Los_Angeles"
                      onChange={event => { setTimeZoneDraft(event.target.value); draft.current.timeZone = event.target.value; }} /></label>
                    <button type="button" className="subtle-button" disabled={disabled} onClick={() => void perform('timezone', async () => {
                      const zone = timeZoneDraft.trim();
                      try { new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(); } catch { throw new Error('Enter a valid IANA time zone.'); }
                      if (!zone) throw new Error('Enter a time zone.');
                      onState(await api.saveSettings({ timeZone: zone })); delete draft.current.timeZone;
                      setFeedback({ action: 'timezone', text: 'Time zone saved.' });
                    })}>Save time zone</button>
                    {result(['timezone'])}

                    <h3 className="section-title">Typography</h3>
                    <label className="rhythm-choice-row"><span>Text size</span><select aria-label="Text size" value={appearance.readingScale} onChange={event => changeReadingLayout({ readingScale: Number(event.target.value) as Appearance['readingScale'] })}>
                      <option value={1}>Standard</option><option value={1.15}>Larger</option><option value={1.3}>Largest</option>
                    </select></label>
                    <label className="rhythm-choice-row"><span>Spacing</span><select aria-label="Spacing" value={appearance.density} onChange={event => changeReadingLayout({ density: event.target.value as Appearance['density'] })}>
                      <option value="comfortable">Comfortable</option><option value="compact">Compact</option>
                    </select></label>
                  </section>
                  <details className="settings-disclosure initiative-section">
                    <summary>Proactive companionship</summary>
                    <div className="settings-disclosure-body">
                      <label className="rhythm-choice-row"><span>Proactive help</span><select aria-label="Initiative level" value={interaction.initiative} disabled={!!pending} onChange={event => void update('initiative', { interaction: { ...interaction, initiative: event.target.value as typeof interaction.initiative } })}>
                        <option value="quiet">Wait for me to ask</option><option value="prepare">Prepare useful material</option><option value="when_useful">Tell me when there is something useful</option>
                      </select></label>
                      <Switch label="Watch the things I entrust to you" detail="When off, check only when you ask." checked={interaction.followup === 'meaningful_change'} disabled={!!pending} onChange={value => void update('followup', { interaction: { ...interaction, followup: value ? 'meaningful_change' : 'on_request' } })} />
                      <label className="rhythm-choice-row"><span>Check in</span><select aria-label="How often to check in without a task" value={state.settings.companionCheckIns || 'sometimes'} disabled={!!pending} onChange={event => void update('checkins', { companionCheckIns: event.target.value as 'off' | 'sometimes' | 'often' })}>
                        <option value="off">Off</option><option value="sometimes">Sometimes</option><option value="often">Often</option>
                      </select></label>
                      {interaction.initiative === 'quiet' && <p className="preference-scope-note">Waiting for you to ask also pauses unsolicited check-ins.</p>}
                    </div>
                  </details>
                  {result(['initiative', 'followup', 'checkins'])}
                  <details className="settings-disclosure">
                    <summary>Motion and notifications</summary>
                    <div className="settings-disclosure-body">
                      <Switch label="Reduce motion" checked={companion.reducedMotion} onChange={reducedMotion => updateCompanion({ reducedMotion })} />
                      <Switch checked={state.settings.remindersEnabled} onChange={v => void update('reminders', { remindersEnabled: v })} label="Use system notifications" detail="Agreed reminders and matters you allow notifications for while away from the window." disabled={!!pending || (busy && !state.settings.remindersEnabled)} />
                      <Switch checked={(state.settings.notificationPreview || 'words') === 'words'} onChange={v => void update('preview', { notificationPreview: v ? 'words' : 'private' })} label="Show notification content" detail="When off, notifications show only a private message notice." disabled={!!pending} />
                    </div>
                  </details>
                  {result(['reminders', 'preview'])}
                  <details className="settings-disclosure">
                    <summary>Background and startup</summary>
                    <div className="settings-disclosure-body">
                      <Switch checked={(state.settings.backgroundPresence || 'tray') === 'tray'} onChange={v => void update('presence', { backgroundPresence: v ? 'tray' : 'quit' })} label="Keep running in the tray after closing the window" detail="Continue valid reminders and ongoing requests. Pauses while the computer sleeps or is off." disabled={!!pending} />
                      <Switch checked={state.settings.launchAtLogin === true} onChange={v => void update('login', { launchAtLogin: v })} label="Start in the tray" detail="Open the window if the tray is unavailable." disabled={!!pending} />
                    </div>
                  </details>
                  {result(['presence', 'login'])}
                </div>
                <aside className="rhythm-preview-column" aria-label="Reading layout example">
                  <div className="reading-feel-preview">
                    <h3>Why can a constant vary?</h3>
                    <div ref={previewRef} className="reading-preview-scroll" role="region" aria-label="Long text layout preview" tabIndex={0}>
                      <div className="markdown reading-preview-text"><RichText text={"Start with a solution we already know. For the first-order equation $x′=a(t)x+b(t)$, temporarily leave out the extra term and take a nonzero solution $u(t)$ of the homogeneous equation.\n\nNow write the new solution as\n\n$$x(t)=u(t)c(t).$$\n\nThis does not yet establish anything about the original equation. It is a different way to express the unknown: keep the known function $u(t)$ in view, then ask what the remaining function $c(t)$ must satisfy.\n\nDifferentiate the product. The term $u′(t)c(t)$ cancels with $a(t)u(t)c(t)$ on the other side, leaving\n\n$$u(t)c′(t)=b(t).$$\n\nOn an interval where $u(t)$ is nonzero, this gives $c′(t)=b(t)/u(t)$. Integrate that expression, then multiply by $u(t)$ to recover the original unknown function.\n\nSo variation of constants does not begin by declaring that a constant changes. It uses a known homogeneous solution to re-express the problem. What matters is checking that the resulting expression still satisfies the original equation.\n\nIf an initial value is given, use it at the end to determine the integration constant. Each step has its place: recognize the known structure, find the remaining change, then return to the conditions and check.\n\nYou can stop at the cancellation above and look at what remains on each side."} /></div>
                    </div>
                  </div>
                </aside>
              </div>
            </>}
            <details className="settings-disclosure" hidden={tab !== 'conversation'}>
              <summary>Conversation style</summary>
              <div className="settings-disclosure-body">
                <div className="preference-fields">
                  <label>
                    Tone
                    <select
                      aria-label="Conversation tone"
                      value={interaction.tone}
                      disabled={!!pending}
                      onChange={(event) =>
                        void update('interaction', {
                          interaction: { ...interaction, tone: event.target.value as typeof interaction.tone },
                        })
                      }
                    >
                      <option value="natural">Natural and clear</option>
                      <option value="warm">A little warmer</option>
                      <option value="direct">Direct and to the point</option>
                    </select>
                  </label>
                  <label>
                    Explanation
                    <select
                      aria-label="Explanation preference"
                      value={interaction.depth}
                      disabled={!!pending}
                      onChange={(event) =>
                        void update('interaction', {
                          interaction: {
                            ...interaction,
                            depth: event.target.value as typeof interaction.depth,
                          },
                        })
                      }
                    >
                      <option value="adaptive">Expand as the question needs</option>
                      <option value="concise">Fewer digressions and less repetition</option>
                      <option value="thorough">Develop the full derivation</option>
                    </select>
                  </label>
                  <label>
                    Humor
                    <select
                      aria-label="Humor preference"
                      value={interaction.humor}
                      disabled={!!pending}
                      onChange={(event) =>
                        void update('interaction', {
                          interaction: {
                            ...interaction,
                            humor: event.target.value as typeof interaction.humor,
                          },
                        })
                      }
                    >
                      <option value="character">Follow the character naturally</option>
                      <option value="none">Do not initiate jokes</option>
                      <option value="light">Lighten the mood when it fits</option>
                    </select>
                  </label>
                </div>
              </div>
            </details>
            {tab === 'conversation' && result(['interaction'])}
            <details className="settings-disclosure" hidden={tab !== 'conversation'} open={guidanceExpanded} onToggle={event => setGuidanceExpanded(event.currentTarget.open)}>
              <summary><span>More about me</span>{guidance !== state.settings.guidance && <small>Unsaved</small>}</summary>
              <div className="settings-disclosure-body">
                <label className="field-label behavior-label">
                  Private background and reply preferences
                  <textarea
                    value={guidance}
                    onChange={(e) => {
                      setGuidance(e.target.value);
                      draft.current.guidance = e.target.value;
                    }}
                    rows={3}
                    maxLength={4000}
                    placeholder="For example: Start with the result, then derive it. Keep the details I ask for."
                  />
                </label>
                <p className="setting-note">Used only when you permit personal memory. These details are excluded from character exports.</p>
                <div className="field-buttons">
                  <button
                    className="primary-button"
                    disabled={disabled || guidance === state.settings.guidance}
                    onClick={() =>
                      void perform('guidance', async () => {
                        onState(await api.saveSettings({ guidance }));
                        setFeedback({ action: 'guidance', text: 'These preferences will guide future conversations' });
                      })
                    }
                  >
                    {pending === 'guidance' && <LoaderCircle size={14} className="spin" />}Save these words
                  </button>
                </div>
              </div>
            </details>
            {tab === 'conversation' && result(['guidance'])}
            <details className="data-controls" hidden={tab !== 'preferences'}>
              <summary className="section-title">Stored on this computer</summary>
              <div className="data-controls-body">
                <details className="data-storage-detail"><summary>How data is retained</summary><p>Conversations are stored on this computer. Permitted content is sent to the connected model during chat. The local database is not fully encrypted at rest. Data exports include conversations, notes, and events; custom character images and reading appearance are excluded.</p></details>
                <button
                  className="text-button"
                  disabled={disabled}
                  onClick={() =>
                    void perform('export', async () => {
                      if (await api.exportData()) setFeedback({ action: 'export', text: 'Data was saved to your chosen location' });
                    })
                  }
                >
                  {pending === 'export' ? (
                    <LoaderCircle size={14} className="spin" />
                  ) : (
                    <Download size={15} />
                  )}
                  Export my data
                </button>
                {result(['export'])}
                {clearConfirm ? (
                  <div className="clear-confirm">
                    <p>Conversations, memories, events, notes, connection settings, and custom character images on this computer will be permanently deleted.</p>
                    <button
                      className="danger-button"
                      disabled={disabled}
                      onClick={() =>
                        void perform('clear', async () => {
                          if (onBeforeForget?.() === false) return;
                          onState(await api.clearData());
                          resetCompanion();
                          draft.current = {};
                          onClear();
                          notify('Local data was cleared');
                        })
                      }
                    >
                      Clear local data
                    </button>
                    <button className="text-button" onClick={() => setClearConfirm(false)}>
                      Keep for now
                    </button>
                  </div>
                ) : (
                  <button
                    className="text-button danger-text"
                    disabled={disabled}
                    onClick={() => setClearConfirm(true)}
                  >
                    <Trash2 size={14} />
                    Clear data on this computer
                  </button>
                )}
                {result(['clear'])}
              </div>
            </details>
          </>
        )}
      </div>
    </Frame>
  );
}
