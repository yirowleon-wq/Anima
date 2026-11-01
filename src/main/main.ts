import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  net,
  nativeImage,
  Notification,
  powerMonitor,
  protocol,
  safeStorage,
  session,
  shell,
  Tray,
} from 'electron';
import { mkdirSync, existsSync, readFileSync, writeFileSync, unlinkSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as z from 'zod';
import { createHash } from 'node:crypto';
import { Store } from './store';
import { LocalSearchService } from './search';
import { DraftStore } from './storage/drafts';
import { Harness } from './harness';
import { AcademicAdapter } from './academicAdapter';
import { CampusActivityAdapter } from './campusActivityAdapter';
import { CampusMapAdapter } from './mapService';
import { MapLocationProvider } from './mapLocation';
import { friendlyError } from './provider';
import { createModelClient, usingLunaTransport } from './model-selection';
import { LUNA_MODEL, LUNA_DISPLAY_NAME } from './luna-provider';
import { actionCommandSchema, campusSchema, settingsSchema } from '../shared/schemas';
import { DEFAULT_MODEL, getDraftAttachments, withDraftAttachments, type Draft, type ImageAttachment, type Settings } from '../shared/types';
import campusExample from '../../examples/campus.example.json';
import { LIMITS } from '../shared/limits';
import { assertTestDataDirectory } from './testBoundary';
import { isEphemeral } from './runtime/policy';
import { conditionSchema } from '../shared/harness';
import { hasCredentials } from './runtime/redaction';
import { NativeControls } from './runtime/controls';
import { NativeCampusCalendar } from './runtime/campus-calendar';
import { agendaFocusSchema } from '../shared/agenda';
import { NativeStudyService } from './runtime/study-native';
import { NativeSourceBookmarkService } from './runtime/source-bookmark-native';
import { NativeKeepService } from './runtime/keep';
import { NativeAgendaOrigin } from './runtime/agenda-origin';
import { conversationBookmarkReferenceSchema } from '../shared/source-bookmark';
import { NativeRehearsalService } from './runtime/rehearsal-native';
import { NativeProgramLocalState } from './runtime/interactive-program-local-state';
import { NativeWorkoutService } from './runtime/workout-native';
import { rehearsalInteractionSchema } from '../shared/relationship-rehearsal';
import { configureNetwork } from './network';
import { materialReferenceSchema, materialTargetSchema, materialQuoteReferenceSchema } from '../shared/materials';
import { semanticSelectionSchema } from '../shared/scenes';
import { workspaceContextSchema } from '../shared/workspace-context';
import { studyInteractionSchema } from '../shared/study-presentation';
import { reflectiveLetterSourceInput, letterReferenceSchema, reflectiveLetterProjectInput } from '../shared/reflective-letter';
import { noteReferenceSchema } from '../shared/note-presentation';
import { preparationFocusReferenceSchema } from '../shared/presentation';
import { noteQuoteReferenceSchema } from '../shared/notes';
import { notebookQuoteReferenceSchema } from '../shared/notes';
import { sharedMapRouteSchema, mapRouteReferenceSchema } from '../shared/map-context';
import { companionSourceInputSchema, companionFollowupReferenceSchema } from '../shared/companion-source';
import { campusAcademicReadInputSchema } from '../shared/campus-academic';
import { curiosityFollowupReferenceSchema } from '../shared/curiosity-source';
import { interactiveProgramReferenceSchema } from '../shared/interactive-program';
import { createOpportunityScheduler } from './runtime/opportunity-scheduler';
import { calendarExportInput } from '../shared/calendar-export';
import { exportCalendarSnapshot } from './actions/calendar-export';

assertTestDataDirectory();
// The installed product owns a relocatable interpreter and pinned engine.
// Development and isolated tests can explicitly choose a runtime root.
if (app.isPackaged) process.env.ANIMA_RUNTIME_ROOT = path.join(process.resourcesPath, 'hermes-runtime');
else process.env.ANIMA_RUNTIME_ROOT ||= path.resolve(__dirname, '..');
if (app.isPackaged) process.env.ANIMA_MATERIAL_RUNTIME_ROOT = path.join(process.resourcesPath, 'material-runtime');
// Both development and the portable app use the same product-owned layout.
// No application request downloads a model or looks in a personal cache.
process.env.ANIMA_EMBEDDING_RUNTIME_ROOT = app.isPackaged ? path.join(process.resourcesPath, 'embedding-runtime')
  : path.resolve(__dirname, 'embedding-runtime');
process.env.ANIMA_EMBEDDING_WORKER_PATH = path.join(process.env.ANIMA_EMBEDDING_RUNTIME_ROOT, 'worker.cjs');

// A repository command may inject the user's DPAPI-protected project credential
// for this process only. Capture it before Electron starts, then remove all model
// credentials from the inherited environment so unrelated child processes never
// receive them.
let projectModelKey = (process.env.ANIMA_PROJECT_MODEL_KEY || '').trim();
if (
  projectModelKey.length < 8 ||
  projectModelKey.length > 512 ||
  /\s/.test(projectModelKey)
)
  projectModelKey = '';
for (const name of [
  'ANIMA_PROJECT_MODEL_KEY',
  'ANIMA_TEST_MODEL_KEY',
  'ANIMA_ALLOW_LIVE_EVAL',
  'MODEL_API_KEY',
  'OPENAI_API_KEY',
])
  delete process.env[name];

configureNetwork();

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);
// Explicit profile override also makes packaged verification independent of personal data.
if (process.env.ANIMA_DATA_DIR) app.setPath('userData', path.resolve(process.env.ANIMA_DATA_DIR));
app.setName('Anima');
// One companion per profile: a second launch brings the existing window back.
// The lock lives in the (possibly isolated) userData directory set above.
const isPrimaryInstance = app.requestSingleInstanceLock();
if (!isPrimaryInstance) app.quit();
else app.on('second-instance', () => showWindow());
let window: BrowserWindow | undefined,
  store: Store,
  harness: Harness,
  academic: AcademicAdapter,
  map: CampusMapAdapter,
  keyPath = '';
const mapLocation = new MapLocationProvider(() => map.overview());
let closing = false;
let draftCloseConfirmed = false;
let connectionController: AbortController | undefined;
let latestDeviceLocation: import('../shared/map-v2').LocationStatusResult | undefined;
let opportunityScheduler: ReturnType<typeof createOpportunityScheduler> | undefined;
let workouts: NativeWorkoutService | undefined;
let campusActivityConnectController: AbortController | undefined;
let workoutExitPending = false;
let workoutDisposed = false;
let tray: Tray | undefined;
const desktopNotifications = new Map<string, { cancel: () => void }>();
let quitting = false;
let trayNoticeShown = false;
/** Bring the one window back, wherever it went (tray, minimized, behind). */
function showWindow() {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
function navigateTo(target?: import('./actions/reminders').DeliveryTarget) {
  showWindow();
  if (target?.preparationRef && store) store.runtime.presentation.focusPreparation(target.preparationRef);
  if (target && window && !window.isDestroyed()) window.webContents.send('anima:navigate', target);
}
/** Closing the window keeps her running in the tray unless the person chose
 * otherwise, so promised reminders and entrusted watches keep going. */
function keepsRunningInTray() {
  return process.env.ANIMA_TEST !== '1' && store?.settings().backgroundPresence !== 'quit';
}
function applyLoginItem() {
  if (process.env.ANIMA_TEST === '1' || !app.isPackaged) return;
  try {
    // The portable launcher removes its extracted process.execPath on exit.
    // Windows must start the enduring launcher, not that temporary child.
    const portable = process.env.PORTABLE_EXECUTABLE_FILE;
    const executable = process.platform === 'win32' && portable && path.isAbsolute(portable)
      && existsSync(portable) && statSync(portable).isFile() ? portable : process.execPath;
    app.setLoginItemSettings({ openAtLogin: store.settings().launchAtLogin === true, path: executable, args: ['--hidden'] });
  } catch { /* A platform without login items keeps the manual start. */ }
}
function ensureTray(): boolean {
  if (tray && !tray.isDestroyed()) return true;
  tray = undefined;
  if (process.env.ANIMA_TEST === '1') return false;
  try {
    tray = new Tray(nativeImage.createFromPath(path.join(app.getAppPath(), 'visual-assets/runtime/art/brand/window-gold.png')).resize({ width: 16, height: 16 }));
    const name = () => store.settings().persona.core.name.trim() || 'Anima';
    const menu = () => Menu.buildFromTemplate([
      { label: `Open Anima`, click: () => showWindow() },
      { type: 'separator' },
      { label: 'Quit Anima', click: () => { quitting = true; app.quit(); } },
    ]);
    tray.setToolTip(`${name()} is here`);
    tray.setContextMenu(menu());
    tray.on('click', () => showWindow());
    return true;
  } catch {
    if (tray && !tray.isDestroyed()) tray.destroy();
    tray = undefined;
    return false;
  }
}
function getKey() {
  if (projectModelKey) return projectModelKey;
  if (existsSync(keyPath)) {
    try {
      return safeStorage.decryptString(readFileSync(keyPath));
    } catch {
      // A corrupt local app key falls back to no credential.
    }
  }
  return '';
}
function saveKey(key: string) {
  if (
    !safeStorage.isEncryptionAvailable() ||
    (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')
  )
    throw new Error('System key protection is unavailable. The API key was not saved.');
  writeFileSync(keyPath, safeStorage.encryptString(key), { mode: 0o600 });
}
function deleteKey() {
  if (existsSync(keyPath)) unlinkSync(keyPath);
  projectModelKey = '';
}
function state() {
  return decorateState(store.state(!!getKey()));
}
function decorateState(value: ReturnType<Store['state']>) {
  return store.runtime.presentation.state({
    ...value,
    environment: store.runtime.environment.snapshot(),
    campusConnector: academic.describe(),
    modelRuntime: { displayName: LUNA_DISPLAY_NAME, model: LUNA_MODEL, providerId: 'openai-app-server', temporaryTestSubstitute: false as const, status: 'enabled' as const, productionDefault: 'Luna' as const },
  });
}
function trusted(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame)
    throw new Error('The request did not come from an allowed app page.');
  const url = new URL(event.senderFrame.url);
  if (
    !(url.protocol === 'app:' && url.hostname === 'anima') &&
    !(process.env.ANIMA_DEV === '1' && url.origin === 'http://127.0.0.1:5173')
  )
    throw new Error('The request did not come from an allowed app page.');
}
function handle(name: string, fn: (data: any) => unknown | Promise<unknown>) {
  ipcMain.handle(name, async (event, data) => {
    trusted(event);
    const boundary = store ? `${store.kernel.epoch}:${store.kernel.policyRevision}:${store.runtime.policy.sourceBoundary}` : undefined;
    try {
      if (store && !store.runtime.presentation.permitsIpc(name)) throw new Error('Return to the private view before using personal content.');
      const result = await fn(data);
      if (store && !store.runtime.presentation.permitsIpc(name)) throw new Error('The audience changed. This personal result was not delivered to the current view.');
      return result;
    } catch (error) {
      if (store && !store.runtime.presentation.permitsIpc(name)) throw new Error('This view is public. The result of the personal operation was not delivered.');
      if (error instanceof z.ZodError) throw new Error('Check the entered values, length, and date format, then try again.');
      throw error;
    } finally {
      opportunityScheduler?.wake();
      // A withdrawal may have taken effect even if a later part of the request
      // failed. Let every open view discard its old boundary in either case.
      if (store && boundary !== undefined && boundary !== `${store.kernel.epoch}:${store.kernel.policyRevision}:${store.runtime.policy.sourceBoundary}` &&
        window && !window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send('anima:event', { type: 'state', state: state() });
      }
    }
  });
}
let pendingSendSubmission: string | undefined;
let pendingSendController: AbortController | undefined;
function noRun() {
  if (harness.running || pendingSendSubmission) throw new Error('Stop the current response before changing a connection or data source.');
}
const id = z.string().min(1).max(100);
const attachmentIdSchema = z.string().uuid();
const textAttachmentSchema = z.union([
  z
    .object({
      kind: z.literal('text'),
      attachmentId: attachmentIdSchema.optional(),
      name: z.string().max(LIMITS.fileName),
      text: z.string().max(LIMITS.attachmentText),
      resource: materialReferenceSchema.optional(),
    })
    .strict(),
  z
    .object({
      name: z.string().max(LIMITS.fileName),
      attachmentId: attachmentIdSchema.optional(),
      text: z.string().max(LIMITS.attachmentText),
      resource: materialReferenceSchema.optional(),
    })
    .strict()
    .transform((value) => ({ kind: 'text' as const, ...value })),
]);
const imageAttachmentSchema = z
  .object({
    kind: z.literal('image'),
    attachmentId: attachmentIdSchema.optional(),
    name: z.string().max(LIMITS.fileName),
    mimeType: z.literal('image/jpeg'),
    dataUrl: z
      .string()
      .max(LIMITS.imageDataUrl)
      .refine((value) => value.startsWith('data:image/jpeg;base64,')),
    width: z.number().int().min(1).max(1600),
    height: z.number().int().min(1).max(1600),
  })
  .strict();
const draftSchema = z
  .object({
    text: z.string().max(LIMITS.draftText),
    attachment: z.union([textAttachmentSchema, imageAttachmentSchema]).nullable(),
    attachments: z.array(z.union([textAttachmentSchema, imageAttachmentSchema])).max(LIMITS.attachments).optional(),
    submission: z.object({ id: attachmentIdSchema, draftKey: id, controls: z.object({
      transmission: z.enum(['cloud_allowed', 'local_only']).optional(), memoryMode: z.enum(['relevant', 'current_sources_only', 'session_only', 'none']).optional(),
      retention: z.enum(['purpose_scoped', 'history_no_inference', 'session_only']).optional(), audience: z.enum(['self', 'group', 'public']).optional(),
    }).strict().optional(), materialDocument: z.object({
      resourceId: materialReferenceSchema.shape.resourceId, sha256: materialReferenceSchema.shape.sha256 }).strict().optional() }).strict().optional(),
  })
  .strict().superRefine((value, context) => {
    const attachments = getDraftAttachments(value);
    if (attachments.filter(item => item.kind === 'image').reduce((n, item) => n + (item.kind === 'image' ? item.dataUrl.length : 0), 0) > LIMITS.imageDataUrls)
      context.addIssue({ code: 'custom', message: 'These images are too large together. Keep two and try again.' });
    const ids = attachments.flatMap(item => item.attachmentId ? [item.attachmentId] : []);
    if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: 'The same attachment appears twice. Remove one copy.' });
  }).transform(value => value.attachments ? withDraftAttachments(value, value.attachments) : value);
function draft(value: unknown): Draft {
  const parsed = draftSchema.safeParse(value);
  return parsed.success ? parsed.data : { text: '', attachment: null };
}

app.whenReady().then(async () => {
  if (!isPrimaryInstance) return;
  Menu.setApplicationMenu(null);
  const dataDir = app.getPath('userData');
  mkdirSync(dataDir, { recursive: true });
  keyPath = path.join(dataDir, 'model-key.bin');
  store = new Store(path.join(dataDir, 'anima.sqlite'));
  const stopEnvironmentState = store.runtime.environment.onChanged(() => {
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
      window.webContents.send('anima:event', { type: 'state', state: state() });
  });
  store.onClose(stopEnvironmentState);
  const localSearch = new LocalSearchService(store);
  // The explicit project entry point means this app session should use the
  // project model rather than silently falling back to the demo responder.
  // No request is sent until the user starts a conversation.
  if (['luna-app-server', 'luna-app-server-test'].includes(process.env.ANIMA_MODEL_TRANSPORT || '')) store.saveSettings({ mode: 'luna' });
  academic = new AcademicAdapter(store);
  const campusActivity = new CampusActivityAdapter(path.join(dataDir, 'campus-activity'));
  store.runtime.connect({ campusActivity });
  map = new CampusMapAdapter(path.join(app.getAppPath(), 'assets', 'map-v2'), {
    profileDirectory: path.join(dataDir, 'map-profile'),
  });
  harness = new Harness(
    store,
    getKey,
    (event) => {
      if (event.type === 'state') opportunityScheduler?.wake();
      if (!window || window.isDestroyed()) return;
      if (event.type === 'state') window.webContents.send('anima:event', { ...event, state: decorateState(event.state) });
      else if (event.type === 'message') {
        if (event.message.role === 'user' && event.message.authoredSource && event.message.submissionId)
          drafts.admitSubmission(event.message);
        const message = store.runtime.presentation.message(event.message, { liveCuriosity: true, liveRehearsal: true, liveNote: true, liveCampus: true, liveProgram: true, liveAttachments: true }); if (message) window.webContents.send('anima:event', { ...event, message });
      }
      else if (!store.runtime.presentation.public) window.webContents.send('anima:event', event);
    },
    undefined,
    academic,
    map,
  );
  const controls = new NativeControls(store, harness);
  workouts = new NativeWorkoutService(store, map, mapLocation, safeStorage, value => {
    if (window && !window.isDestroyed() && !store.closed && !store.runtime.presentation.public)
      window.webContents.send('anima:workout', value);
  });
  store.runtime.connect({ workout: workouts });
  handle('workout:devices', () => workouts!.devices());
  handle('workout:state', () => workouts!.state());
  handle('workout:restore', () => workouts!.restore());
  handle('workout:start', value => workouts!.start(value));
  handle('workout:pause', value => workouts!.pause(value));
  handle('workout:resume', value => workouts!.resume(value));
  handle('workout:finish', value => workouts!.finish(value));
  handle('workout:cancel', async value => {
    try { return await workouts!.cancel(value); }
    finally { harness.stateChanged(); }
  });
  handle('workout:discard-recovery', async () => {
    try { return await workouts!.discardRecovery(); }
    finally { harness.stateChanged(); }
  });
  const campusActivityGrantAllowed = (grant: 'campus:read' | 'campus:activity:read') =>
    store.runtime.policy.grants().includes(grant) && !store.runtime.policy.revoked().includes(grant);
  const campusActivityStatus = () => ({ ...campusActivity.describe(),
    campusReadAllowed: campusActivityGrantAllowed('campus:read'),
    readAllowed: campusActivityGrantAllowed('campus:read') && campusActivityGrantAllowed('campus:activity:read') });
  store.runtime.policy.onBarrier(() => {
    if (store.runtime.policy.revoked().some(grant => grant === 'campus:read' || grant === 'campus:activity:read'))
      campusActivityConnectController?.abort();
  });
  handle('campusActivity:status', () => campusActivityStatus());
  handle('campusActivity:connect', async () => {
    noRun();
    campusActivityConnectController?.abort();
    const controller = new AbortController(); campusActivityConnectController = controller;
    try {
      const selected = await dialog.showOpenDialog(window!, { title: 'Import campus activity records', properties: ['openFile'],
        filters: [{ name: 'Campus activity JSON', extensions: ['json'] }] });
      if (selected.canceled || !selected.filePaths[0]) return campusActivityStatus();
      controller.signal.throwIfAborted();
      await campusActivity.configure(selected.filePaths[0]);
      const result = await campusActivity.authenticate(controller.signal);
      controller.signal.throwIfAborted();
      harness.stateChanged();
      return { ...campusActivityStatus(), check: { status: result.status, observedAt: result.observedAt,
        reason: result.error?.message || result.note } };
    } finally { if (campusActivityConnectController === controller) campusActivityConnectController = undefined; }
  });
  handle('campusActivity:disconnect', () => {
    campusActivityConnectController?.abort();
    store.runtime.policy.revoke('campus:activity:read'); harness.stateChanged(); return campusActivityStatus();
  });
  const campusCalendar = new NativeCampusCalendar(store);
  const agenda = store.runtime.nativeAgenda;
  const study = new NativeStudyService(store, store.runtime.studyPresentation);
  const sourceBookmarks = new NativeSourceBookmarkService(store);
  const kept = new NativeKeepService(store);
  handle('keep:snapshot', value => kept.snapshot(value));
  const agendaOrigin = new NativeAgendaOrigin(store, localSearch);
  handle('agenda:origin', value => agendaOrigin.resolve(value));
  const rehearsal = new NativeRehearsalService(store, store.runtime.rehearsals);
  handle('rehearsal:project', value => rehearsal.project(value));
  handle('note:project', value => {
    const runtime = store.runtime, operation = new AbortController(), remove = runtime.policy.onBarrier(() => operation.abort());
    try { return runtime.notePresentation.project(value, operation.signal); }
    finally { remove(); }
  });
  handle('study:project', value => study.project(value));
  handle('study:read', value => study.read(value));
  handle('study:bookmark-preview', value => study.previewBookmark(value));
  handle('study:bookmark-accept', value => study.acceptBookmark(value));
  handle('source-bookmark:preview', value => sourceBookmarks.preview(value));
  handle('source-bookmark:keep', value => sourceBookmarks.keep(value));
  handle('letter:project', value => {
    const runtime = store.runtime, boundary = `${store.kernel.epoch}:${store.kernel.policyRevision}:${runtime.policy.sourceBoundary}`;
    if (runtime.presentation.public) throw new Error('Return to the private conversation before opening the letter.');
    const scope = runtime.policy.hostScope(), operation = new AbortController();
    const remove = runtime.policy.onBarrier(() => operation.abort());
    try {
      const result = runtime.presentation.letterProject(scope, reflectiveLetterProjectInput.parse(value));
      operation.signal.throwIfAborted(); runtime.policy.validate(scope);
      if (runtime.presentation.public || boundary !== `${store.kernel.epoch}:${store.kernel.policyRevision}:${runtime.policy.sourceBoundary}`)
        throw new Error('The source or audience changed. Reopen the letter from the current conversation.');
      return result;
    } finally { remove(); }
  });
  handle('letter:source', async value => {
    const runtime = store.runtime, boundary = `${store.kernel.epoch}:${store.kernel.policyRevision}:${runtime.policy.sourceBoundary}`;
    if (runtime.presentation.public) throw new Error('Return to the private conversation before opening the original words.');
    const scope = runtime.policy.hostScope(), operation = new AbortController();
    const remove = runtime.policy.onBarrier(() => operation.abort());
    try {
      const result = await runtime.reflectiveLetters.source(scope, reflectiveLetterSourceInput.parse(value), operation.signal);
      operation.signal.throwIfAborted(); runtime.policy.validate(scope);
      if (runtime.presentation.public || boundary !== `${store.kernel.epoch}:${store.kernel.policyRevision}:${runtime.policy.sourceBoundary}`)
        throw new Error('The source or audience changed. Reopen the original words from the current letter.');
      return result;
    } finally { remove(); }
  });
  handle('companion:source', async value => {
    const runtime = store.runtime, boundary = `${store.kernel.epoch}:${store.kernel.policyRevision}:${runtime.policy.sourceBoundary}`;
    if (runtime.presentation.public) throw new Error('Return to the private conversation before opening the original material.');
    const scope = runtime.policy.hostScope(), operation = new AbortController();
    const remove = runtime.policy.onBarrier(() => operation.abort());
    try {
      const result = runtime.companionSessions.source(scope, companionSourceInputSchema.parse(value));
      operation.signal.throwIfAborted(); runtime.policy.validate(scope);
      if (runtime.presentation.public || boundary !== `${store.kernel.epoch}:${store.kernel.policyRevision}:${runtime.policy.sourceBoundary}`)
        throw new Error('The source or audience changed. Reopen the original words from the current return point.');
      return result;
    } finally { remove(); }
  });
  handle('campus:academic', async raw => {
    const runtime = store.runtime, boundary = `${store.kernel.epoch}:${store.kernel.policyRevision}:${runtime.policy.sourceBoundary}`;
    if (runtime.presentation.public) throw new Error('Return to the private conversation before opening grade records.');
    const input = campusAcademicReadInputSchema.parse(raw), operation = new AbortController(), remove = runtime.policy.onBarrier(() => operation.abort());
    try {
      const scene = await runtime.readCampusAcademic(input, operation.signal);
      operation.signal.throwIfAborted();
      if (runtime.presentation.public || boundary !== `${store.kernel.epoch}:${store.kernel.policyRevision}:${runtime.policy.sourceBoundary}`)
        throw new Error('The source or audience changed. Reopen the current grade record.');
      return scene;
    } finally { remove(); }
  });
  handle('campus:schedule', value => campusCalendar.read(value));
  handle('agenda:day', async value => {
    const operation = new AbortController(), remove = store.runtime.policy.onBarrier(() => operation.abort());
    try { return await agenda.day(value, operation.signal); }
    finally { remove(); }
  });
  handle('agenda:preview-change', async value => {
    const operation = new AbortController(), remove = store.runtime.policy.onBarrier(() => operation.abort());
    try { return await agenda.preview(value, operation.signal); }
    finally { remove(); }
  });
  const programLocalState = new NativeProgramLocalState(store);
  handle('program:local-state:read', value => programLocalState.read(value));
  handle('program:local-state:save', value => programLocalState.save(value));
  store.runtime.policy.onBarrier(() => {
    mapLocation.cancel(); latestDeviceLocation = undefined; store.runtime.spatial.share({ enabled: false });
    queueMicrotask(() => { if (!store.closed) void store.runtime.reminders.retireInvalidNotifications().catch(() => {}); });
  });
  handle('runtime:overview', () => controls.overview());
  handle('search:local', value => localSearch.search(value));
  handle('search:resolve', value => localSearch.resolve(value));
  handle('search:cancel', () => localSearch.cancel());
  handle('attention:list', value => controls.attentionList(value));
  handle('attention:change', value => controls.attentionChange(value));
  handle('runtime:adopt-world', (value) => controls.adoptWorld(value));
  handle('runtime:evidence', (value) => controls.evidence(value));
  handle('runtime:reply-sources', value => controls.replySources(value));
  handle('runtime:goal', (value) => controls.goal(value));
  handle('runtime:feedback', (value) => controls.feedback(value));
  handle('runtime:retry', (value) => controls.retry(value));
  handle('runtime:reconcile', (value) => controls.reconcile(value));
  handle('runtime:action', (value) => {
    const actionId = id.parse(value),
      scope = store.runtime.policy.hostScope();
    const action = store.runtime.actions.get(scope, actionId) || null;
    const recordId = action?.capability === 'local.agenda.change' ? action.arguments.targetId : action?.id;
    return {
      action,
      ...(action?.planningOffer ? { planningOffer: store.runtime.planningOffers.state(scope, action) } : {}),
      receipts: store.runtime.actions.receipts(scope, actionId),
      ...(action && ['local.agenda.save', 'local.agenda.change'].includes(action.capability) && typeof recordId === 'string'
        ? { localRecord: store.runtime.calendar.read(recordId) || null } : {}),
    };
  });
  handle('runtime:permission', (value) => controls.permission(value));
  const root = path.join(app.getAppPath(), 'dist');
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'anima') return new Response('Forbidden', { status: 403 });
    let decoded: string;
    try {
      decoded = decodeURIComponent(url.pathname);
    } catch {
      return new Response('Invalid path', { status: 400 });
    }
    const file = path.resolve(root, '.' + (decoded === '/' ? '/index.html' : decoded));
    if (!file.startsWith(root + path.sep) || !existsSync(file) || !statSync(file).isFile())
      return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  session.defaultSession.setPermissionRequestHandler((_w, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  handle('state', state);
  handle('environment:read', value => {
    z.undefined().parse(value);
    return store.runtime.environment.read();
  });
  handle('notes:list', value => store.notes.list(value));
  handle('notes:draft', value => store.notes.nativeDraft(value));
  handle('notes:read', value => store.notes.read(value));
  handle('notes:create', value => store.notes.create(value));
  handle('notes:update', value => store.notes.update(value));
  handle('notes:state', value => store.notes.changeState(value));
  handle('notes:undo', value => store.notes.undo(value));
  handle('notes:history', value => store.notes.history(value));
  handle('notes:quote', value => value && typeof value === 'object' && 'noteId' in value
    ? store.notes.notebookQuote(value) : store.notes.quote(noteQuoteReferenceSchema.parse(value)));
  handle('messages', (value) => store.runtime.presentation.public ? [] : store.messages(id.parse(value)).flatMap(message => { const safe = store.runtime.presentation.message(message); return safe ? [safe] : []; }));
  handle('presentation:surface', async value => {
    const mode = z.enum(['private', 'public']).parse(value);
    store.runtime.presentation.setSurface(mode);
    if (mode === 'public') { localSearch.cancel(); mapLocation.cancel(); latestDeviceLocation = undefined; connectionController?.abort(); campusActivityConnectController?.abort(); store.runtime.spatial.share({ enabled: false }); await workouts?.suspend().catch(() => undefined); await harness.stop(); store.runtime.materials.endConversation(); }
    return state();
  });
  handle('presentation:select', value => {
    const input = z.object({ sessionId: id, id: z.string().max(160), revision: z.number().int().positive() }).strict().parse(value);
    store.runtime.presentation.selectArtifact(input.sessionId, input.id, input.revision); return state();
  });
  handle('presentation:clear', () => { store.runtime.presentation.clearSelection(); return state(); });
  handle('presentation:select-matter', value => {
    const input = z.object({ id: z.string().min(1).max(160), revision: z.number().int().positive() }).strict().parse(value);
    store.runtime.presentation.selectMatter(input.id, input.revision); return state();
  });
  handle('matter:selection', value => { const changed = controls.matterSelection(value); return { ...changed, state: state() }; });
  handle('preparation:open', value => {
    if (!store.runtime.presentation.focusPreparation(preparationFocusReferenceSchema.parse(value)))
      throw new Error('This preparation changed or was put away. Return to its current version.');
    return state();
  });
  handle('help:action', value => { controls.help(value); return state(); });
  handle('response:exposure', value => controls.responseExposure(value));
  handle('release:edit', value => { const message = controls.editRelease(value); harness.invalidateConversation(message.sessionId); return message; });
  const drafts = new DraftStore(store);
  handle('draft', (value) => draft(drafts.get(id.parse(value))));
  handle('draft:info', value => drafts.info(id.parse(value)));
  handle('draft:unsaved', () => drafts.unsaved());
  handle('draft:submissions', () => drafts.submissions().map(item => {
    const admitted = drafts.submissionAdmission(item.id);
    return { ...item, processing: pendingSendSubmission === item.draft.submission!.id || harness.submissionPending(item.draft.submission!.id),
      ...(admitted ? { admitted } : {}) };
  }));
  handle('draft:persist', value => {
    const input = z.object({ id, digest: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true) }).strict().parse(value);
    drafts.persist(input.id, input.digest);
    if (!store.runtime.presentation.public && window && !window.isDestroyed())
      window.webContents.send('anima:event', { type: 'conversations', conversations: store.conversations() });
  });
  handle('draft:save', (value) => {
    const input = z
      .object({
        id,
        retention: z.literal('session_only').optional(),
        privacyEpoch: z.number().int().positive().optional(),
        draft: draftSchema,
      })
      .parse(value);
    drafts.save(input.id, input.draft, input.retention === 'session_only', input.privacyEpoch);
  });
  handle('send', async (value) => {
    const input = z
      .object({
        sessionId: id.optional(),
        submissionId: attachmentIdSchema.optional(),
        content: z.string().min(1).max(LIMITS.message).refine(text => text.trim().length > 0, 'Write something before sending.'),
        workspaceContext: workspaceContextSchema.optional(),
        attachment: z.object({ name: z.string().max(LIMITS.fileName), text: z.string().max(LIMITS.attachmentText) }).strict().optional(),
        image: imageAttachmentSchema.optional(),
        material: materialReferenceSchema.optional(),
        attachments: z.array(z.union([textAttachmentSchema, imageAttachmentSchema])).max(LIMITS.attachments).optional(),
        materialDocument: z.object({ resourceId: materialReferenceSchema.shape.resourceId,
          sha256: materialReferenceSchema.shape.sha256 }).strict().optional(),
        materialQuote: materialQuoteReferenceSchema.optional(),
        noteQuote: noteQuoteReferenceSchema.optional(),
        conversationQuote: conversationBookmarkReferenceSchema.optional(),
        selection: semanticSelectionSchema.optional(),
        studyInteraction: studyInteractionSchema.optional(),
        companionReference: companionFollowupReferenceSchema.optional(),
        curiosityReference: curiosityFollowupReferenceSchema.optional(),
        programReference: interactiveProgramReferenceSchema.optional(),
        preparationReference: preparationFocusReferenceSchema.optional(),
        letterReference: letterReferenceSchema.optional(),
        noteReference: noteReferenceSchema.optional(),
        notebookQuote: notebookQuoteReferenceSchema.optional(),
        mapRouteReference: mapRouteReferenceSchema.optional(),
        agendaFocus: agendaFocusSchema.optional(),
        rehearsalInteraction: rehearsalInteractionSchema.optional(),
        controls: z
          .object({
            transmission: z.enum(['cloud_allowed', 'local_only']).optional(),
            memoryMode: z.enum(['relevant', 'current_sources_only', 'session_only', 'none']).optional(),
            retention: z.enum(['purpose_scoped', 'history_no_inference', 'session_only']).optional(),
            audience: z.enum(['self', 'group', 'public']).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .refine(input => !input.attachments || !input.attachment && !input.image && !input.material, 'Use the current attachment list on its own.')
      .refine(input => !input.attachment || !input.material && !input.materialDocument && !input.image, 'Attach one file or image before continuing.')
      .refine(input => !input.materialDocument || !input.image && (!input.material
        || input.material.resourceId === input.materialDocument.resourceId && input.material.sha256 === input.materialDocument.sha256),
        'Different files are selected. Keep the one to discuss before sending.')
      .refine(input => input.content.length + (input.attachment ? input.attachment.name.length + input.attachment.text.length : 0) <= LIMITS.message, 'The message and attachment are too long together. Select the part to discuss first.')
      .superRefine((input, context) => {
        const items = input.attachments || [];
        const documentInQueue = !!input.materialDocument && items.some(item => item.kind === 'text'
          && item.resource?.resourceId === input.materialDocument!.resourceId && item.resource.sha256 === input.materialDocument!.sha256);
        if (items.length + (input.materialDocument && !documentInQueue ? 1 : 0) > LIMITS.attachments)
          context.addIssue({ code: 'custom', message: 'Attach up to three files or images at a time.' });
        if (input.content.length + items.reduce((n, item) => n + item.name.length + (item.kind === 'text' && !item.resource ? item.text.length : 0), 0) > LIMITS.message)
          context.addIssue({ code: 'custom', message: 'The message and attachment text are too long together. Select the part to discuss first.' });
        if (items.reduce((n, item) => n + (item.kind === 'image' ? item.dataUrl.length : 0), 0) > LIMITS.imageDataUrls)
          context.addIssue({ code: 'custom', message: 'These images are too large together. Keep two and try again.' });
        const keys = items.map(item => item.kind === 'text' && item.resource ? 'material:' + item.resource.resourceId
          : item.kind === 'image' ? 'image:' + createHash('sha256').update(Buffer.from(item.dataUrl.split(',')[1], 'base64')).digest('hex') : 'text:' + item.name + '\n' + item.text);
        const ids = items.flatMap(item => item.attachmentId ? [item.attachmentId] : []);
        if (new Set(keys).size !== keys.length || new Set(ids).size !== ids.length)
          context.addIssue({ code: 'custom', message: 'The same attachment appears twice. Remove one copy.' });
      })
      .refine(input => [input.materialQuote, input.noteQuote, input.noteReference, input.notebookQuote, input.conversationQuote].filter(Boolean).length <= 1, 'Several source passages are selected. Keep one before sending.')
      .parse(value);
    noRun();
    pendingSendSubmission = input.submissionId || crypto.randomUUID();
    const admissionController = new AbortController(); pendingSendController = admissionController;
    try {
    // Only this explicit send boundary can prepare an unsubmitted original
    // kept by its native owner. Reuse the standard material ingress so the
    // eventual file event belongs to the real user message and current run.
    // A durably bound original returns no new material: its existing source
    // remains. An explicit temporary delivery needs this turn's real event.
    const queuedDocument = input.attachments?.some(item => item.kind === 'text' && item.resource?.resourceId === input.materialDocument?.resourceId
      && item.resource?.sha256 === input.materialDocument?.sha256);
    const documentDraftOwnerId = input.sessionId || 'new';
    const draftDocument = input.materialDocument && !queuedDocument ? getDraftAttachments(drafts.get(documentDraftOwnerId))
      .find(item => item.kind === 'text' && item.resource?.resourceId === input.materialDocument!.resourceId
        && item.resource.sha256 === input.materialDocument!.sha256) : undefined;
    const preparedDocument = !input.material && input.materialDocument && !queuedDocument
      ? store.runtime.materials.prepareDocumentSend(input.materialDocument, draftDocument?.kind === 'text' && draftDocument.resource
        ? { draftOwnerId: documentDraftOwnerId, reference: draftDocument.resource } : undefined) : undefined;
    // A host-qualified pending draft original keeps its canonical upload ID.
    // No other draft words or attachments enter this explicit delivery.
    const draftUpload = preparedDocument?.kind === 'draft' ? { kind: 'text' as const,
      name: preparedDocument.reference.name, text: '', resource: preparedDocument.reference,
      ...(draftDocument?.attachmentId ? { attachmentId: draftDocument.attachmentId } : {}) } : undefined;
    const uploads = draftUpload ? [draftUpload, ...(input.attachments || [])] : input.attachments;
    if (draftUpload && (uploads!.length > LIMITS.attachments
      || draftUpload.attachmentId && input.attachments?.some(item => item.attachmentId === draftUpload.attachmentId)))
      throw new Error('Attachment references are duplicated. Select the originals again.');
    if (draftUpload && input.content.length + uploads!.reduce((n, item) => n + item.name.length
      + (item.kind === 'text' && !item.resource ? item.text.length : 0), 0) > LIMITS.message)
      throw new Error('The message and attachment text are too long together. Select the part to discuss first.');
    const material = input.material || (preparedDocument?.kind === 'notebook' ? preparedDocument.reference : undefined);
    const quoteMaterial = preparedDocument && preparedDocument.reference.resourceId === input.materialQuote?.resourceId ? preparedDocument.reference
      : material?.resourceId === input.materialQuote?.resourceId ? material
      : input.attachments?.flatMap(item => item.kind === 'text' && item.resource?.resourceId === input.materialQuote?.resourceId ? [item.resource] : [])[0];
    if (input.materialQuote) await store.runtime.materials.nativeQuote({
      target: quoteMaterial ? { kind: 'pending', reference: quoteMaterial } : { kind: 'saved', resourceId: input.materialQuote.resourceId },
      quote: input.materialQuote,
    }, admissionController.signal);
    admissionController.signal.throwIfAborted();
    if (preparedDocument?.kind === 'draft' && store.runtime.materials.prepareDocumentSend(input.materialDocument!,
      { draftOwnerId: documentDraftOwnerId, reference: preparedDocument.reference })?.kind !== 'draft')
      throw new Error('This original is no longer attached to that draft. Select the file again.');
    if (input.noteQuote) store.notes.quote(input.noteQuote);
    return harness.start(input.sessionId, input.content, { ...input.controls, submissionId: input.submissionId, submittedMaterialDocument: input.materialDocument,
      attachment: input.attachment ? { id: crypto.randomUUID(), ...input.attachment } : undefined,
      material, uploads, selection: input.selection, workspaceContext: input.workspaceContext,
      studyInteraction: input.studyInteraction, companionReference: input.companionReference,
      curiosityReference: input.curiosityReference, letterReference: input.letterReference, noteReference: input.noteReference,
      notebookQuote: input.notebookQuote, mapRouteReference: input.mapRouteReference, agendaFocus: input.agendaFocus,
      programReference: input.programReference, preparationReference: input.preparationReference,
      rehearsalInteraction: input.rehearsalInteraction, materialQuote: input.materialQuote, noteQuote: input.noteQuote,
      conversationQuote: input.conversationQuote }, input.image);
    } finally { pendingSendSubmission = undefined; if (pendingSendController === admissionController) pendingSendController = undefined; }
  });
  handle('stop', () => { pendingSendController?.abort(new DOMException('Stopped by the user', 'AbortError')); return harness.stop(); });
  handle('persona:follow-default', value => {
    noRun();
    store.followDefaultCompanion(z.string().min(1).max(100).parse(value));
    return state();
  });
  handle('settings:save', (value) => {
    const { apiKey, ...settings } = settingsSchema.parse(value);
    const disablingOnly =
      !apiKey &&
      Object.entries(settings).every(
        ([key, val]) =>
          ['memoryEnabled', 'weatherEnabled', 'remindersEnabled'].includes(key) && val === false
          // How notices look and whether she stays in the tray never change a
          // reply already in progress, so they can be saved at any time.
          || ['notificationPreview', 'backgroundPresence', 'launchAtLogin', 'companionCheckIns'].includes(key),
      );
    if (!disablingOnly) noRun();
    if (apiKey) saveKey(apiKey);
    store.saveSettings(settings as Partial<Settings>);
    if (settings.launchAtLogin !== undefined) applyLoginItem();
    if (settings.backgroundPresence === 'tray') ensureTray();
    return state();
  });
  handle('connection:test', async (value) => {
    noRun();
    const input = z.object({ apiKey: z.string().trim().max(512).optional() }).strict().parse(value);
    connectionController?.abort();
    const controller = new AbortController();
    connectionController = controller;
    try {
      const result = await createModelClient(input.apiKey || getKey(), DEFAULT_MODEL).complete(
        [{ role: 'user', content: 'Reply only: Connection successful.' }],
        [],
        AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
      );
      return result.responseModel ? result.responseModel + ' responded.' : 'The model connection responded; no model identity was returned.';
    } catch (e) {
      throw new Error(friendlyError(e));
    } finally {
      if (connectionController === controller) connectionController = undefined;
    }
  });
  handle('connection:cancel', () => {
    connectionController?.abort();
  });
  handle('key:delete', () => {
    noRun();
    deleteKey();
    store.saveSettings({ mode: 'demo' });
    return state();
  });
  handle('memory', (value) => {
    const input = z
      .object({
        action: z.enum(['save', 'delete', 'deactivate']),
        id: id.optional(),
        text: z.string().trim().min(1).max(4000).optional(),
        expectedRevision: z.number().int().positive().optional(),
        operation: z.enum(['CORRECT', 'SUPERSEDE', 'ADD_EXCEPTION', 'REFINE']).optional(),
        validFrom: z.string().datetime({ offset: true }).optional(),
        validTo: z.string().datetime({ offset: true }).optional(),
        conditions: conditionSchema.optional(),
      })
      .parse(value);
    if (input.action === 'delete' && input.id) store.deleteMemory(input.id);
    else if (input.action === 'deactivate' && input.id) store.runtime.memory.deactivate(input.id);
    else if (input.action === 'save' && input.text)
      store.runtime.memory.saveControl(input.text, input.id, input);
    else throw new Error('Enter the memory text.');
    return state();
  });
  handle('conversation:delete', (value) => {
    noRun();
    const sessionId = id.parse(value);
    drafts.clear(sessionId);
    store.deleteSession(sessionId);
    harness.invalidateCampusCache(sessionId);
    return state();
  });
  handle('conversation:end', (value) => {
    noRun();
    const sessionId = id.parse(value);
    harness.endConversation(sessionId);
    if (store.conversationPolicy(sessionId)?.retention === 'session_only') drafts.clear(sessionId);
    return state();
  });
  handle('data:clear', async () => {
    noRun();
    connectionController?.abort();
    campusActivityConnectController?.abort();
    await academic.forgetCredentials(AbortSignal.timeout(20_000)).catch(() => {});
    store.clear();
    campusActivity.clear();
    drafts.clear();
    deleteKey();
    harness.invalidateCampusCache();
    return state();
  });
  handle('campus:import', async () => {
    noRun();
    const result = await dialog.showOpenDialog(window!, {
      title: 'Import campus data',
      filters: [{ name: 'Campus data JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (result.canceled) return null;
    const file = result.filePaths[0];
    if (statSync(file).size > 8_000_000) throw new Error('This data file is too large. Choose a JSON file smaller than 8 MB.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    } catch {
      throw new Error('This is not a valid JSON file.');
    }
    const data = campusSchema.safeParse(parsed);
    if (!data.success)
      throw new Error('The data format does not match. Include its source, retrieval time, and dated schedule instances with time zones. A template is in examples.');
    // Last occurrence wins when an exported event is rescheduled or cancelled.
    data.data.schedule = [...new Map(data.data.schedule.map((e) => [e.id, e])).values()];
    data.data.exams = [...new Map(data.data.exams.map((e) => [e.id, e])).values()];
    store.runtime.domains.importSnapshot(data.data, Object.keys(parsed as object));
    harness.invalidateCampusCache();
    return state();
  });
  handle('campus:disconnect', () => {
    noRun();
    store.putMeta('campus', null);
    harness.invalidateCampusCache();
    return state();
  });
  handle('campus:template', async () => {
    const result = await dialog.showSaveDialog(window!, {
      title: 'Save a campus data template',
      defaultPath: 'campus-data-example.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return false;
    writeFileSync(result.filePath, JSON.stringify(campusExample, null, 2), 'utf8');
    return true;
  });
  const importAcademicRecords = async () => {
    noRun();
    const epoch = store.kernel.epoch;
    const selected = await dialog.showOpenDialog(window!, { title: 'Import academic records', properties: ['openFile'],
      filters: [{ name: 'Academic JSON', extensions: ['json'] }] });
    if (selected.canceled || !selected.filePaths[0]) return state();
    if (epoch !== store.kernel.epoch || store.runtime.presentation.public)
      throw new Error('The source scope changed. Choose the file again from your private view.');
    academic.configure(selected.filePaths[0]);
    harness.invalidateCampusCache(); harness.stateChanged();
    const verified = await academic.verifyAccount(AbortSignal.timeout(75_000));
    if (verified.status !== 'ok') throw new Error(verified.note || 'The imported academic records could not be read.');
    return state();
  };
  handle('campus:connector:configure', importAcademicRecords);
  handle('campus:account:connect', importAcademicRecords);
  handle('campus:connector:disconnect', () => {
    noRun();
    academic.disconnect();
    harness.invalidateCampusCache();
    return state();
  });
  handle('campus:connector:credentials', importAcademicRecords);
  handle('campus:connector:forget-credentials', async () => {
    noRun();
    harness.invalidateCampusCache();
    harness.stateChanged();
    const result = await academic.forgetCredentials(AbortSignal.timeout(20_000));
    if (result.status !== 'ok')
      throw new Error(result.note || 'The local connection could not be removed.');
    return state();
  });
  const mapView = (raw: unknown) => z.object({ publicOnly: z.boolean().optional() }).strict().parse(raw || {}).publicOnly ? map.publicView() : map;
  handle('map:overview', raw => mapView(raw).overview());
  handle('map:places', raw => mapView(raw).allPoints());
  handle('map:data', raw => mapView(raw).dataset());
  handle('map:data-json', raw => mapView(raw).serializedDataset());
  handle('map:search', (value) => {
    const input = z
      .object({ query: z.string().trim().min(1).max(100), limit: z.number().int().min(1).max(50).optional() })
      .parse(value);
    return map.search(input.query, input.limit || 20);
  });
  handle('map:location-status', () => map.locationStatus());
  handle('map:locate', async () => { latestDeviceLocation = await mapLocation.read(map.overview()); return latestDeviceLocation; });
  handle('map:share-context', value => {
    const input = z.object({ enabled: z.boolean(), fromId: z.string().max(160).optional(), includeDevice: z.boolean().optional(),
      route: sharedMapRouteSchema.optional(), expectedSelectionId: z.string().uuid().optional() }).strict().parse(value);
    if (input.fromId && !map.point(input.fromId)) throw new Error('The starting point is not on the current map.');
    return store.runtime.spatial.share({ enabled: input.enabled, fromId: input.fromId, route: input.route,
      expectedSelectionId: input.expectedSelectionId,
      ...(input.includeDevice ? { device: latestDeviceLocation } : {}) });
  });
  handle('map:context-status', () => store.runtime.spatial.sharedStatus());
  handle('map:location-stop', value => { const input = z.object({ keepSharedContext: z.boolean().optional() }).strict().parse(value || {}); mapLocation.cancel(); latestDeviceLocation = undefined; if (!input.keepSharedContext) store.runtime.spatial.share({ enabled: false }); });
  handle('map:route', (value) => {
    const place = z.object({ kind: z.enum(['place', 'node']), id: z.string().min(1).max(100) });
    const input = z
      .object({
        from: z.union([place, z.object({ kind: z.literal('current') })]).optional(),
        to: place.optional(),
        avoidStairs: z.boolean().optional(),
        version: z.string().max(100).optional(),
        profileRevision: z.string().max(100).optional(),
        allowConditional: z.boolean().optional(),
        originAccessId: z.string().max(200).optional(),
        destinationAccessId: z.string().max(200).optional(),
        publicOnly: z.boolean().optional(),
      })
      .parse(value);
    const { publicOnly, ...query } = input;
    if (publicOnly && query.from?.kind === 'current') throw new Error('Choose a setting on the public map without using device location.');
    return (publicOnly ? map.publicView() : map).route(query.from?.kind==='current' ? {...query,from:{kind:'current',fix:latestDeviceLocation?.fix}} : query);
  });
  handle('action', async (value) => {
    const input = actionCommandSchema.parse(value);
    if (input.action === 'undo')
      await store.runtime.actions.cancel(store.runtime.policy.hostScope(), input.effect.id, new AbortController().signal, input.effect);
    else if (input.action === 'delete')
      await store.runtime.changeLocalFromUI(input.item, 'delete');
    else
      await store.runtime.acceptLocal({ ...input.item, done: input.action === 'done' || input.item.done });
    return state();
  });
  handle('text:attach', async () => {
    const epoch = store.kernel.epoch;
    const result = await dialog.showOpenDialog(window!, {
      title: 'Add reading material',
      filters: [{ name: 'Text, Markdown, or PDF', extensions: ['txt', 'md', 'pdf'] }],
      properties: ['openFile'],
    });
    if (result.canceled) return null;
    if (epoch !== store.kernel.epoch) throw new Error('The allowed source scope changed. Select the file again.');
    const file = result.filePaths[0];
    return store.runtime.materials.stageFile(file);
  });
  handle('materials:list', value => {
    const input = z.object({ sessionId: id.optional() }).strict().parse(value || {});
    return store.runtime.materials.nativeList(input.sessionId);
  });
  handle('materials:read', value => store.runtime.materials.nativeReadPage(value));
  handle('materials:quote', value => store.runtime.materials.nativeQuote(value));
  const materialCommitGate = () => {
    const runtime = store.runtime, epoch = store.kernel.epoch, revision = store.kernel.policyRevision, boundary = runtime.policy.sourceBoundary;
    if (runtime.presentation.public) throw new Error('Return to the private conversation before saving this note.');
    return () => {
      if (runtime.presentation.public || epoch !== store.kernel.epoch || revision !== store.kernel.policyRevision || boundary !== runtime.policy.sourceBoundary)
        throw new Error('The source or audience changed. The note was not saved. Return to its original location and check before continuing.');
    };
  };
  handle('materials:keep-quote', value => store.runtime.materials.nativeKeepQuote(value, store.notes, materialCommitGate()));
  handle('materials:move-note', value => store.runtime.materials.nativeMoveNote(value, store.notes, materialCommitGate()));
  handle('materials:notes', value => store.runtime.materials.nativeNotes(value, store.notes));
  handle('materials:cancel', value => {
    const input = z.object({ readerId: z.string().min(1).max(100).optional() }).strict().parse(value || {});
    store.runtime.materials.cancelNativeRead(input.readerId);
  });
  handle('materials:discard', value => {
    const input = z.object({ reference: materialReferenceSchema }).strict().parse(value);
    store.runtime.materials.releasePending(input.reference);
  });
  handle('materials:export', async value => {
    const input = z.object({ target: materialTargetSchema }).strict().parse(value);
    const epoch = store.kernel.epoch, revision = store.kernel.policyRevision;
    const original = store.runtime.materials.nativeOriginal(input.target);
    const selected = await dialog.showSaveDialog(window!, { title: 'Export the original file', defaultPath: original.item.name });
    if (selected.canceled || !selected.filePath) return false;
    if (epoch !== store.kernel.epoch || revision !== store.kernel.policyRevision || store.runtime.presentation.public)
      throw new Error('The allowed source scope changed. Reopen the original before exporting.');
    const current = store.runtime.materials.nativeOriginal(input.target);
    writeFileSync(selected.filePath, current.bytes);
    return true;
  });
  handle('image:attach', async (): Promise<ImageAttachment | null> => {
    const result = await dialog.showOpenDialog(window!, {
      title: 'Add an image',
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
      properties: ['openFile'],
    });
    if (result.canceled) return null;
    const file = result.filePaths[0];
    if (statSync(file).size > 8_000_000) throw new Error('Choose an image smaller than 8 MB.');
    const source = nativeImage.createFromBuffer(readFileSync(file));
    if (source.isEmpty()) throw new Error('This image could not be read. Choose another image.');
    const original = source.getSize();
    if (!original.width || !original.height || original.width > 12_000 || original.height > 12_000)
      throw new Error('This image is too large. Choose another image.');
    const scale = Math.min(1, 1600 / original.width, 1600 / original.height);
    const prepared =
      scale < 1
        ? source.resize({
            width: Math.max(1, Math.round(original.width * scale)),
            height: Math.max(1, Math.round(original.height * scale)),
            quality: 'best',
          })
        : source;
    let bytes = prepared.toJPEG(90),
      size = prepared.getSize();
    if (bytes.length * 1.34 > LIMITS.imageDataUrl) {
      const smallerScale = Math.min(1, 1280 / size.width, 1280 / size.height);
      const smaller = prepared.resize({
        width: Math.max(1, Math.round(size.width * smallerScale)),
        height: Math.max(1, Math.round(size.height * smallerScale)),
        quality: 'good',
      });
      bytes = smaller.toJPEG(82);
      size = smaller.getSize();
    }
    const dataUrl = 'data:image/jpeg;base64,' + bytes.toString('base64');
    if (dataUrl.length > LIMITS.imageDataUrl) throw new Error('This image is still too large after processing. Choose another image.');
    return {
      kind: 'image',
      attachmentId: crypto.randomUUID(),
      name: path.basename(file),
      mimeType: 'image/jpeg',
      dataUrl,
      width: size.width,
      height: size.height,
    };
  });
  handle('calendar:export', async value => {
    const input = calendarExportInput.parse(value);
    const epoch = store.kernel.epoch, revision = store.kernel.policyRevision;
    // Validate the requested interval before opening the native picker; re-read after it closes.
    exportCalendarSnapshot([], input, store.kernel.clock.now());
    const result = await dialog.showSaveDialog(window!, {
      title: 'Export accepted calendar events', defaultPath: 'anima-calendar.ics',
      filters: [{ name: 'Calendar file', extensions: ['ics'] }],
    });
    if (result.canceled || !result.filePath) return { saved: false, count: 0, omitted: 0, reasons: [] };
    if (epoch !== store.kernel.epoch || revision !== store.kernel.policyRevision || store.runtime.presentation.public)
      throw new Error('The source scope changed. Return to the private view and select it again.');
    const snapshot = exportCalendarSnapshot(store.agenda(), input, store.kernel.clock.now());
    if (!snapshot.count) return { saved: false, count: 0, omitted: snapshot.omitted, reasons: snapshot.reasons.length ? snapshot.reasons : ['There are no accepted events to export in this period.'] };
    writeFileSync(result.filePath, snapshot.content, { encoding: 'utf8', mode: 0o600 });
    return { saved: true, count: snapshot.count, omitted: snapshot.omitted, reasons: snapshot.reasons };
  });
  handle('data:export', async () => {
    const result = await dialog.showSaveDialog(window!, {
      title: 'Export my data',
      defaultPath: 'anima-data.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return false;
    writeFileSync(result.filePath, JSON.stringify(store.export(), null, 2), 'utf8');
    return true;
  });
  handle('link:open', async (value) => {
    const url = new URL(z.string().max(2500).parse(value));
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname)
      throw new Error('Only safe HTTPS source links can be opened.');
    await shell.openExternal(url.toString());
  });
  handle('text:copy', (value) => {
    clipboard.writeText(z.string().max(100000).parse(value));
  });
  ipcMain.on('window', (event, value) => {
    trusted(event);
    if (value === 'close') window?.close();
    if (value === 'close-confirmed') { draftCloseConfirmed = true; window?.close(); }
    if (value === 'minimize') window?.minimize();
    if (value === 'maximize') window?.isMaximized() ? window.unmaximize() : window?.maximize();
  });
  window = new BrowserWindow({
    title: 'Anima',
    width: 1220,
    height: 850,
    minWidth: 420,
    minHeight: 570,
    backgroundColor: '#171918',
    frame: false,
    show: false,
    icon: path.join(app.getAppPath(), 'visual-assets/runtime/art/brand/window-gold.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  const noteChangeWindow = window;
  const stopNoteChanges = store.notes.onChanged(change => {
    if (store.runtime.presentation.public || noteChangeWindow.isDestroyed() || noteChangeWindow.webContents.isDestroyed()) return;
    const current = store.notes.read({ id: change.id, revision: change.revision, offset: 0, limit: 1 }).note;
    if (store.runtime.presentation.public) return;
    noteChangeWindow.webContents.send('anima:event', { type: 'note_changed', note: {
      id: current.id, revision: current.revision, sha256: current.sha256, state: current.state,
    } } satisfies import('../shared/types').RunEvent);
  });
  noteChangeWindow.once('closed', stopNoteChanges);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => {
    // Vite may reload its current document after an entry-point change. Keep
    // that exact local development page usable without allowing link navigation.
    const developmentReload = process.env.ANIMA_DEV === '1'
      && event.url === 'http://127.0.0.1:5173/' && event.url === window?.webContents.getURL();
    if (!developmentReload) event.preventDefault();
  });
  let environmentLocked = false, environmentSuspended = false;
  const syncEnvironmentActivity = () => {
    const active = !!window && !window.isDestroyed() && window.isVisible() && !window.isMinimized()
      && !quitting && !environmentLocked && !environmentSuspended;
    store.runtime.environment.setActive(active);
    return active;
  };
  const refreshVisibleEnvironment = () => {
    if (syncEnvironmentActivity()) void store.runtime.environment.read();
  };
  window.on('show', syncEnvironmentActivity);
  window.on('restore', refreshVisibleEnvironment);
  window.on('focus', refreshVisibleEnvironment);
  window.on('hide', syncEnvironmentActivity);
  window.on('minimize', () => store.runtime.environment.setActive(false));
  // Track lock/sleep before loading the renderer: a load or focus event must
  // not restart weather while the desktop is still locked or suspended.
  powerMonitor.on('suspend', () => { environmentSuspended = true; store.runtime.environment.setActive(false); });
  powerMonitor.on('lock-screen', () => { environmentLocked = true; store.runtime.environment.setActive(false); });
  powerMonitor.on('resume', () => { environmentSuspended = false; refreshVisibleEnvironment(); });
  powerMonitor.on('unlock-screen', () => { environmentLocked = false; refreshVisibleEnvironment(); });
  window.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden') || !ensureTray()) window?.show();
  });
  window.on('close', (event) => {
    if (!quitting && keepsRunningInTray() && ensureTray()) {
      // The renderer keeps its drafts; nothing is lost by hiding.
      event.preventDefault();
      window?.hide();
      if (!trayNoticeShown && Notification.isSupported()) {
        trayNoticeShown = true;
        new Notification({ title: 'Anima is still running', body: 'Open Anima from the tray icon. Choose Quit Anima in its menu to close the app completely.', silent: true }).show();
      }
      return;
    }
    // The renderer also owns notebook edits that have not been saved yet.
    if (!draftCloseConfirmed && !window?.webContents.isDestroyed() && !window?.webContents.isCrashed() && !window?.webContents.isLoadingMainFrame()) {
      event.preventDefault();
      window?.webContents.send('anima:close-request');
      return;
    }
    if (!closing && harness.running) {
      event.preventDefault();
      closing = true;
      void harness.stop().finally(() => window?.close());
    }
  });
  window.on('closed', () => {
    store.runtime.environment.setActive(false);
    harness.endConversations();
    window = undefined;
  });
  await window.loadURL(
    process.env.ANIMA_DEV === '1' ? 'http://127.0.0.1:5173' : 'app://anima/index.html',
  );
  store.runtime.reminders.port = {
    capabilities: {
      submitted: Notification.isSupported(),
      delivered: false,
      seen: false,
      stableId: false,
      closedApp: false,
    },
    submit: async (input, signal) => {
      signal.throwIfAborted();
      const leaseEnd = Date.parse(input.leaseUntil);
      const leaseMs = leaseEnd - Date.parse(store.kernel.clock.now());
      if (!Number.isFinite(leaseMs) || leaseMs <= 0) return { status: 'unknown' };
      const notice = new Notification({ title: input.title, body: input.body, silent: input.silent === true });
      return new Promise<{ status: 'submitted_to_os' | 'unknown' }>(resolve => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const settle = (status: 'submitted_to_os' | 'unknown') => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener('abort', cancel);
          notice.removeListener('show', shown);
          resolve({ status: status === 'submitted_to_os'
            && (signal.aborted || Date.parse(store.kernel.clock.now()) >= leaseEnd) ? 'unknown' : status });
        };
        const release = () => {
          notice.removeListener('click', clicked);
          notice.removeListener('close', closed);
          notice.removeListener('failed', failed);
          desktopNotifications.delete(input.id);
        };
        const cancel = () => {
          settle('unknown');
          release();
          notice.close();
        };
        const shown = () => {
          if (signal.aborted || Date.parse(store.kernel.clock.now()) >= leaseEnd) cancel();
          else settle('submitted_to_os');
        };
        const failed = () => { settle('unknown'); release(); };
        const clicked = () => {
          settle('submitted_to_os');
          release();
          navigateTo(input.target);
        };
        const closed = (event: Electron.Event<{ reason?: string }>) => {
          const confirmed = settled;
          settle('unknown');
          // Windows can hide the toast while retaining it in Action Center.
          // Keep its original click route until the person acts or cancels it.
          if (!confirmed || event.reason !== 'timedOut') release();
        };
        desktopNotifications.get(input.id)?.cancel();
        desktopNotifications.set(input.id, { cancel });
        notice.once('show', shown);
        notice.once('failed', failed);
        notice.on('close', closed);
        notice.once('click', clicked);
        signal.addEventListener('abort', cancel, { once: true });
        // The original leased occurrence bounds this acknowledgement wait.
        // No native reply leaves the durable intent unknown; it is not retried.
        const remaining = leaseEnd - Date.parse(store.kernel.clock.now());
        if (signal.aborted || remaining <= 0) cancel();
        else {
          timer = setTimeout(cancel, remaining);
          try { notice.show(); } catch { cancel(); }
        }
      });
    },
    cancel: async id => { desktopNotifications.get(id)?.cancel(); },
  };
  store.runtime.reminders.canSubmitSuggestion = () => !store.runtime.presentation.public && !window?.isFocused();
  store.runtime.reminders.configure({ enabled: store.settings().remindersEnabled });
  const reminderTimer = setInterval(() => {
    void store.runtime.reminders.runDue();
  }, 30000);
  const recoveryTimer = setInterval(() => {
    if (process.env.ANIMA_TEST !== '1') void harness.recoverPending();
  }, 30000);
  if (process.env.ANIMA_TEST !== '1') {
    opportunityScheduler = createOpportunityScheduler({
      nextReviewAt: () => store.runtime.attention.nextReviewAt(),
      review: () => harness.reviewOpportunities(),
      available: () => !harness.running && store.settings().mode === 'luna' && (usingLunaTransport() || !!getKey()),
      // State changes bring forward newly registered deadlines; periodic
      // reconciliation remains a recovery path for external source changes.
    });
    store.notes.onChanged(() => opportunityScheduler?.wake());
    store.onAgendaChanged(() => opportunityScheduler?.wake());
    // Every ten minutes the host asks whether this is a gentle moment for her
    // to drop by; most of the time the answer is no and no model is called.
    const presenceTimer = setInterval(() => { void harness.considerCheckIn(); }, 10 * 60000);
    app.on('will-quit', () => clearInterval(presenceTimer));
  }
  void store.runtime.reminders.runDue();
  // After sleep or a locked screen, catch up at once instead of waiting for
  // the next 30-second tick: due reminders first, then entrusted reviews.
  const catchUp = () => { void store.runtime.reminders.runDue(); opportunityScheduler?.wake(); };
  powerMonitor.on('resume', catchUp);
  powerMonitor.on('unlock-screen', catchUp);
  applyLoginItem();
  if (keepsRunningInTray()) ensureTray();
  app.on('will-quit', () => {
    campusActivityConnectController?.abort();
    clearInterval(reminderTimer);
    clearInterval(recoveryTimer);
    opportunityScheduler?.stop();
    for (const notice of desktopNotifications.values()) notice.cancel();
    store.close();
  });
});
app.on('before-quit', event => {
  quitting = true;
  store?.runtime.environment.setActive(false);
  if (workouts && !workoutDisposed) {
    event.preventDefault();
    if (!workoutExitPending) {
      workoutExitPending = true;
      void workouts.dispose().catch(() => undefined).finally(() => { workoutDisposed = true; app.quit(); });
    }
  }
});
app.on('window-all-closed', () => app.quit());

app.on('before-quit', () => mapLocation.cancel());
