import { useEffect, useId, useReducer, useRef, useState, type RefObject, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Compass,
  LocateFixed,
  MapPinned,
  Maximize,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  Route,
  Search,
  X,
  Info,
} from 'lucide-react';
import {
  emptyRoute,
  mapPointEndpoint,
  mapRoutePointName,
  routeHasUnverifiedPassages,
  type MapCard,
  type MapPoint,
  type MapRouteResult,
  type LocationStatusResult,
  type LocationFix,
  type MapOverview,
} from '../../shared/map-v2';
import { classifyFix, inBounds } from '../../shared/map-routing';
import { rankMapPoints, uniqueExactMapPoint } from '../../shared/map-names';
import { initialSelection, selectionReducer, type SelectionState } from './map-state';
import type { MapData, CampusMapEngine, SavedCamera } from './map-engine';
import type { MapRouteReference, SharedMapRoute } from '../../shared/map-context';
import engineModuleUrl from 'virtual:anima-map-engine-url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './map.css';
import './map-surface.css';
import { WindowControls, uiError } from '../ui';

const api = window.anima;
const dataCaches = new Map<boolean, MapData>();
const engineUrl = new URL(engineModuleUrl, import.meta.url);
let engineModuleRetry = 0;
function loadEngine(fresh: boolean) {
  if (fresh) engineUrl.searchParams.set('mapRetry', String(++engineModuleRetry));
  return import(/* @vite-ignore */ engineUrl.href) as Promise<typeof import('./map-engine')>;
}
export interface MapSurfaceMemory { camera?: SavedCamera; selection?: SelectionState; entered?: boolean; sharedSelectionId?: string }
export interface MapContextHandoff {
  text: string;
  label: string;
  expiresAt: string;
  selectionId?: string;
  routeReference?: MapRouteReference;
  previewRoute?: MapRouteResult;
  routeConditions?: SharedMapRoute;
  previewMemory?: MapSurfaceMemory;
}
const standaloneMemory: MapSurfaceMemory = import.meta.hot?.data.campusMapMemory || {};
import.meta.hot?.dispose((data)=>{data.campusMapMemory=standaloneMemory;});
async function loadData(signal: AbortSignal, publicOnly = false): Promise<MapData> {
  const current=await api.mapOverview({ publicOnly }), dataCache = dataCaches.get(publicOnly);
  if(current.dataStatus==='error')throw new Error(current.dataError||'The map could not be opened. Try opening it again.');
  if(dataCache&&dataCache.manifest.version===current.version){
    const places=dataCache.manifest.profileRevision===current.profileRevision?dataCache.places:await api.mapPlaces({ publicOnly });
    if(signal.aborted)throw new DOMException('Cancelled','AbortError');
    const next = { ...dataCache, manifest: current, places }; dataCaches.set(publicOnly, next); return next;
  }
  const {manifest,places,geography,sports,venues}=api.mapDataJson?JSON.parse(await api.mapDataJson({ publicOnly })):await api.mapData({ publicOnly });
  if(manifest.dataStatus==='error')throw new Error(manifest.dataError||'The map could not be opened. Try opening it again.');
  if (
    manifest.schemaVersion !== 'campus-map/v2' ||
    !Array.isArray(places) ||
    (geography as {type?:string}).type !== 'FeatureCollection'
  )
    throw new Error('This map is not available yet.');
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  const next = { manifest, places, geography, sports, venues }; dataCaches.set(publicOnly, next); return next;
}
function initialState(route: MapRouteResult, memory: MapSurfaceMemory, conditions?: SharedMapRoute): SelectionState {
  const from = route.from && mapPointEndpoint(route.from), to = route.to && mapPointEndpoint(route.to);
  const options = conditions && from && from.kind !== 'current' && to && to.kind !== 'current'
    && conditions.fromId === from.id && conditions.toId === to.id
    && (conditions.fromKind || 'place') === from.kind && (conditions.toKind || 'place') === to.kind
    ? { avoidStairs: conditions.avoidStairs, allowConditional: conditions.allowConditional,
      originAccessId: conditions.originAccessId, destinationAccessId: conditions.destinationAccessId } : {};
  if(route.to?.kind==='water')return {...initialSelection,destination:route.to};
  if(route.from?.kind==='water')return {...initialSelection,mode:'two',stage:'origin',destination:route.to};
  if (route.schemaVersion === 'map-route/v2' && route.to)
    return {
      ...initialSelection,
      mode: route.from ? 'two' : 'current',
      origin: route.from,
      destination: route.to,
      route,
      ...options,
    };
  if (memory.selection) return { ...memory.selection, route: emptyRoute() };
  return { ...initialSelection };
}
function distanceLabel(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}
function routeDistanceTitle(r: MapRouteResult) {
  const d = r.distance!;
  const label = routeHasUnverifiedPassages(r) ? 'Conditional route' : r.routeBasis === 'access_estimate_dominant' ? 'Mostly estimated access' : d.networkM === 0 && d.connectorM > 0 ? 'Estimated connection' : 'Walk';
  return `${label} ${distanceLabel(d.totalM)}`;
}
function placeSearchDetail(p: MapPoint) {
  if (p.undergroundStation) return 'Transit station · walk to an entrance';
  if (p.historicalReference && !p.personal) return 'Historical place · current conditions unknown';
  if (p.kind === 'facility') return 'Sports facility';
  if (p.kind === 'water') return 'Water · view only';
  if (p.geometryStatus === 'reference-point') {
    if (p.source.url === 'local-personal-profile' || p.personal?.referencePoint) return 'Your marker · entrance unknown';
    return p.id.startsWith('official/legacy/') ? 'Earlier directory location · shape unknown' : 'Reference location · shape unknown';
  }
  if (p.kind === 'area') return 'Area';
  if (p.entrances.some(e => e.connected)) return 'Building · mapped entrances and paths';
  return p.accessCandidates?.length ? 'Building · nearby route can be estimated; entrance unknown' : 'Building · entrance unknown';
}
function placeStatusText(p: MapPoint) {
  if (p.undergroundStation) return 'The route ends at a mapped entrance. Check its opening conditions nearby.';
  if (p.roadReference) return 'This is a mapped path point; access to the building is unknown.';
  if (p.historicalReference && !p.personal) return 'This place comes from an earlier map. Current access is unknown.';
  if (p.kind === 'water') return 'View the water here. Choose a place on shore to compare routes.';
  if (p.kind === 'facility') return 'Facility and neighboring paths';
  if (p.geometryStatus === 'reference-point') {
    if (p.modelBasis) return 'The building shape is illustrative. Its exact position and access are unknown.';
    if (p.source.url === 'local-personal-profile' || p.personal?.referencePoint) return 'This is your marker; the exact entrance is unknown.';
    return p.id.startsWith('official/legacy/') ? 'This earlier directory point has no confirmed current route.' : 'This is a reference point; access is unknown.';
  }
  if (p.entrances.some(e => e.connected)) return 'Mapped entrances are available for route comparison.';
  return p.accessCandidates?.length ? 'A route to the vicinity can be estimated; the entrance is unknown.' : 'The entrance is unknown.';
}
export function MapRouteCard({ card, onOpen }: { card: MapCard; onOpen: () => void }) {
  const current = card.route?.schemaVersion === 'map-route/v2',
    r = card.route;
  return (
    <button className="campus-v2-card" onClick={onOpen} aria-label="Open in the map">
      <span className="campus-v2-card-icon">
        <MapPinned size={23} />
      </span>
      <span>
        <strong>{current && r.to ? r.to.displayName : 'Open campus map'}</strong>
        <small>
          {current && r.status === 'ready' && r.distance
            ? `${routeDistanceTitle(r)}${r.distance.connectorM ? " · includes estimated connections" : " · mapped entrances"}`
            : current
              ? r.reason
              : 'This map has changed. Select the place again.'}
        </small>
      </span>
      <ArrowUpRight size={18} />
    </button>
  );
}
export function MapSurface({
  initialRoute,
  initialConditions,
  onClose,
  onUseContext,
  onWindowClose,
  returnLabel = 'Back to chat',
  reviewScene,
  reviewControls,
  footerControls,
  inline = false,
  publicOnly = false,
  memory = standaloneMemory,
  onChoose,
  onEngine,
  onTakeControl,
  onPresenceHost,
  sharedSelectionId,
}: {
  initialRoute: MapRouteResult;
  initialConditions?: SharedMapRoute;
  onClose: () => void;
  onWindowClose: () => void;
  onUseContext?: (value: MapContextHandoff) => boolean | void;
  returnLabel?: string;
  reviewScene?: 'overview' | 'top-down' | 'oblique' | 'route-demo' | 'building-focus';
  reviewControls?: ReactNode;
  footerControls?: ReactNode;
  inline?: boolean;
  publicOnly?: boolean;
  memory?: MapSurfaceMemory;
  onChoose?: (point: MapPoint) => void;
  onEngine?: (engine: CampusMapEngine | undefined) => void;
  onTakeControl?: () => void;
  /** Desktop may carry the same companion into this top-layer surface. */
  onPresenceHost?: (host: HTMLElement | null) => void;
  /** Reopening a handed-off preview stops acquisition on exit, while keeping
   * that already-authorized snapshot until its normal stop/expiry boundary. */
  sharedSelectionId?: string;
}) {
  const stage = useRef<HTMLDivElement>(null),
    engine = useRef<CampusMapEngine | undefined>(undefined),
    engineGeneration = useRef(0),
    retryEngineModule = useRef(false);
  const searchId=useId();
  const handlers = useRef({onChoose,onEngine,onTakeControl});
  handlers.current={onChoose,onEngine,onTakeControl};
  const routeRef=useRef(initialRoute);routeRef.current=initialRoute;
  const sceneRouteRef=useRef(initialRoute);
  const compass = useRef<HTMLSpanElement>(null),
    scale = useRef<HTMLDivElement>(null),
    search = useRef<HTMLInputElement>(null),
    coverage = useRef<HTMLSpanElement>(null);
  const [data, setData] = useState<MapData>(),
    [dataError, setDataError] = useState(false),
    [engineError, setEngineError] = useState<'load' | 'render'>(),
    [attempt, setAttempt] = useState(0),
    [engineAttempt, setEngineAttempt] = useState(0),
    [engineReady, setEngineReady] = useState(false);
  const dataRef=useRef(data);dataRef.current=data;
  const [selection, dispatch] = useReducer(selectionReducer, initialRoute, (r) => inline&&memory.selection?memory.selection:reviewScene === 'building-focus' && r.to ? {...initialSelection, destination:r.to} : initialState(r,memory,initialConditions)),
    selectionRef = useRef(selection);
  selectionRef.current = selection;
  const [query, setQuery] = useState(''),
    [searchOpen, setSearchOpen] = useState(false),
    [onlyConnected, setOnlyConnected] = useState(false),
    [resultIndex, setResultIndex] = useState(-1);
  const [hover, setHover] = useState<MapPoint>(),
    [candidates, setCandidates] = useState<MapPoint[]>([]),
    [about, setAbout] = useState(false),
    [help, setHelp] = useState(false);
  const [pitch,setPitch]=useState(memory.camera?.pitch||0),[spaceControls,setSpaceControls]=useState(false),[preview,setPreview]=useState<number|undefined>(),[routeDetails,setRouteDetails]=useState(false),[collapsed,setCollapsed]=useState(false),[entrances,setEntrances]=useState(false);
  const [selectionNotice,setSelectionNotice]=useState('');
  const reviewRouteFramed = useRef(false);
  const appliedReviewScene=useRef<typeof reviewScene>(undefined);
  const pitchValue=useRef(pitch);
  const [location, setLocation] = useState<LocationStatusResult>({
    status: 'idle',
    reason: 'Simulated position is off. Choose a starting point on the map.',
    source: 'simulated',
    phoneConnected: false,
  });
  const handoffContext = useRef(!!(sharedSelectionId || memory.sharedSelectionId));
  const sharePending = useRef(false);
  const [sharing, setSharing] = useState(false),
    [shareError, setShareError] = useState('');
  async function useContext(device = false) {
    if (publicOnly) return;
    const selected = selectionRef.current, point = selected.origin || selected.destination, manifest = dataRef.current?.manifest;
    if (sharePending.current || !onUseContext || !device && !point) return;
    const from = selected.origin && mapPointEndpoint(selected.origin), to = selected.destination && mapPointEndpoint(selected.destination);
    const route: SharedMapRoute | undefined = !device && selected.mode === 'two' && selected.stage === 'browse'
      && from && from.kind !== 'current' && to && to.kind !== 'current' && manifest
      && selected.route.from?.id === selected.origin?.id && selected.route.to?.id === selected.destination?.id
      && !['loading', 'error', 'missing_origin', 'missing_destination', 'outside'].includes(selected.route.status)
      ? { fromId: from.id, toId: to.id, fromKind: from.kind, toKind: to.kind, mapVersion: manifest.version,
        ...(manifest.profileRevision ? { profileRevision: manifest.profileRevision } : {}),
        ...(selected.originAccessId ? { originAccessId: selected.originAccessId } : {}),
        ...(selected.destinationAccessId ? { destinationAccessId: selected.destinationAccessId } : {}),
        avoidStairs: !!selected.avoidStairs, allowConditional: !!selected.allowConditional } : undefined;
    sharePending.current = true;
    setSharing(true);
    setShareError('');
    let selectionId: string | undefined;
    try {
      const result = await api.shareMapContext({
        enabled: true,
        ...(device ? { includeDevice: true } : route ? { route } : { fromId: point!.id }),
      });
      if (!result.enabled || !result.expiresAt) throw new Error('This place was not added to the conversation. Try again.');
      selectionId = result.selectionId;
      if (!alive.current || selectionRef.current.revision !== selected.revision) {
        if (selectionId) await api.shareMapContext({ enabled: false, expectedSelectionId: selectionId });
        return;
      }
      if (route && !result.routeReference) throw new Error('This route was not added to the conversation. Reopen the map and try again.');
      const accepted = onUseContext({
        text: route ? '' : device
          ? 'Using the simulated-position snapshot just shared as a reference, I would like to ask: '
          : `Starting from the map selection “${point!.displayName}”, `,
        label: route ? `${selected.origin!.displayName} → ${selected.destination!.displayName}`
          : device ? 'Simulated-position reference' : point!.displayName,
        expiresAt: result.expiresAt,
        ...(selectionId ? { selectionId } : {}),
        ...(result.routeReference ? { routeReference: result.routeReference } : {}),
        ...(route ? { previewRoute: structuredClone(selected.route), routeConditions: route,
          previewMemory: { ...(memory.camera ? { camera: structuredClone(memory.camera) } : {}),
            selection: structuredClone(selected), entered: true, sharedSelectionId: result.selectionId } } : {}),
      });
      if (accepted === false) {
        if (selectionId) await api.shareMapContext({ enabled: false, expectedSelectionId: selectionId });
        return;
      }
      handoffContext.current = true;
      onClose();
    } catch (error) {
      if (selectionId) void api.shareMapContext({ enabled: false, expectedSelectionId: selectionId }).catch(() => {});
      if (alive.current) setShareError(uiError(error));
    } finally {
      sharePending.current = false;
      if (alive.current) setSharing(false);
    }
  }
  const locationRef = useRef(location);
  locationRef.current = location;
  const tracking = useRef(false);
  const alive = useRef(true),
    locationRevision = useRef(0),
    touched = useRef(false),
    first = useRef(!memory.entered),
    introDone = useRef(false);
  const initialDestination = useRef(
    initialRoute.schemaVersion === 'map-route/v2' && !(memory.camera && memory.selection?.destination?.id === initialRoute.to?.id
      && memory.selection?.origin?.id === initialRoute.from?.id) ? initialRoute.to?.id : undefined,
  );
  const activity = useRef(0),
    pendingLocate = useRef<{ fix: LocationFix; activity: number } | undefined>(undefined);
  const feedback = useRef({ rotation: NaN, width: NaN, label: '' });
  const requestRef = useRef<(explicit?: boolean) => Promise<void>>(async () => {});
  const results=rankMapPoints((data?.places||[]).filter(p=>!onlyConnected||p.entrances.some(e=>e.connected)),query,data?.manifest.label);
  const shown = results.slice(0, 40);
  const exact=uniqueExactMapPoint(shown,query,data?.manifest.label),activeResult=resultIndex>=0?resultIndex:exact?shown.findIndex(p=>p.id===exact.id):shown.length===1?0:-1;
  function user() {
    handlers.current.onTakeControl?.();
    setSelectionNotice('');
    activity.current++;
    touched.current = true;
    introDone.current = true;
    setHover(undefined);
  }
  function choose(point: MapPoint) {
    user();
    engine.current?.takeControl();
    if(inline){dispatch({type:'browse'});dispatch({type:'choose',point});handlers.current.onChoose?.(point);}
    else if(point.kind==='water'&&selectionRef.current.mode!=='browse')setSelectionNotice('Water is view-only. Choose a building or place on shore.');
    else dispatch({ type: 'choose', point });
    setSearchOpen(false);
    setQuery('');
    setCandidates([]);
    setCollapsed(false);setPreview(undefined);
    stage.current?.focus({ preventScroll: true });
  }
  function chooseAndFocus(point:MapPoint){
    choose(point);
    const map=engine.current;if(!map)return;
    const ticket=map.ownership.ticket();
    // Measure the panel created by this selection after React has placed it.
    // A subsequent drag/selection owns the view and cancels this pending fit.
    requestAnimationFrame(()=>{if(engine.current===map&&map.ownership.accepts(ticket))map.focusPlace(point);});
  }
  function showWholeRoute(route:MapRouteResult){
    const map=engine.current;if(!map)return;
    user();map.takeControl();const ticket=map.ownership.ticket();
    setRouteDetails(false);setPreview(undefined);
    // The explicit overview needs the compact card's actual viewport space.
    // A later user gesture still owns the camera and cancels this request.
    requestAnimationFrame(()=>{if(engine.current===map&&map.ownership.accepts(ticket))map.fitRoute(route);});
  }
  useEffect(() => {
    alive.current = true;
    memory.entered = true;
    return () => {
      alive.current = false;
      locationRevision.current++;
      memory.selection = { ...selectionRef.current, route: emptyRoute() };
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setDataError(false);
    loadData(controller.signal, publicOnly)
      .then((d) => {
        if (!controller.signal.aborted) {setData(d);if(!initialRoute.to)dispatch({type:'rebind',places:d.places});}
      })
      .catch(() => {
        if (!controller.signal.aborted) setDataError(true);
      });
    return () => controller.abort();
  }, [attempt, publicOnly]);
  useEffect(() => {
    if (!data || !stage.current) return;
    if(engine.current?.supportsSpace){
      try { engine.current.updateData(data); }
      catch { setEngineError('render'); setEngineReady(false); }
      return;
    }
    let disposed = false;
    const generation = ++engineGeneration.current;
    const current = () => !disposed && alive.current && engineGeneration.current === generation;
    const fresh = retryEngineModule.current;
    retryEngineModule.current = false;
    loadEngine(fresh)
      .then(({ createCampusMap }) => {
        if (!current() || !stage.current) return;
        try {
          const map = createCampusMap(
            stage.current,
            data,
            {
              choose,
              candidates: setCandidates,
              hover: setHover,
              blank: () => {
                setHover(undefined);
                setCandidates([]);
                setSearchOpen(false);
              },
              user,
              camera: (c) => {
                if (!current()) return;
                memory.camera = c;
                if(Math.abs((c.pitch||0)-pitchValue.current)>.1){pitchValue.current=c.pitch||0;setPitch(c.pitch||0);}
                if (c.rotation !== feedback.current.rotation) {
                  const needle = compass.current?.querySelector('i');
                  if (needle) needle.style.transform = `rotate(${c.rotation}rad)`;
                  feedback.current.rotation = c.rotation;
                }
                const lat = (Math.atan(Math.exp(c.center[1] / 6378137)) * 360) / Math.PI - 90;
                if (coverage.current) {
                  const covered = inBounds(
                    [(c.center[0] * 180) / Math.PI / 6378137, lat],
                    dataRef.current?.manifest.bounds||data.manifest.bounds,
                  );
                  if (coverage.current.hidden !== covered) coverage.current.hidden = covered;
                }
                if (scale.current) {
                  if(c.scale){scale.current.style.width=`${c.scale.width}px`;scale.current.textContent=c.scale.meters>=1000?`${c.scale.meters/1000} km`:`${c.scale.meters} m`;scale.current.title=c.scale.reference;scale.current.dataset.reference=c.scale.reference;return;}
                  const ground = c.resolution * Math.cos((lat * Math.PI) / 180),
                    ideal = ground * 90,
                    power = 10 ** Math.floor(Math.log10(ideal)),
                    m =
                      [1, 2, 5, 10]
                        .map((v) => v * power)
                        .filter((v) => v <= ideal)
                        .at(-1) || power;
                  const width = Math.round((m / ground) * 10) / 10,
                    label = m >= 1000 ? `${m / 1000} km` : `${m} m`;
                  if (width !== feedback.current.width) {
                    scale.current.style.width = `${width}px`;
                    feedback.current.width = width;
                  }
                  if (label !== feedback.current.label) {
                    scale.current.textContent = label;
                    feedback.current.label = label;
                  }
                }
              },
              ready: () => {
                if (current()) {
                  setEngineError(undefined);
                  setEngineReady(true);handlers.current.onEngine?.(engine.current);
                }
              },
              error: () => { if (current()) { setEngineError('render'); setEngineReady(false); } },
            },
            memory.camera,
            {initialRoute:inline?routeRef.current:undefined,cooperativeGestures:inline},
          );
          engine.current = map;
          if (touched.current) map.takeControl();
        } catch { if (current()) setEngineError('render'); }
      }, () => { if (current()) setEngineError('load'); });
    return () => {
      if(alive.current&&engine.current?.supportsSpace)return;
      disposed = true;
      setEngineReady(false);
      engine.current?.dispose();
      engine.current = undefined;
    };
  }, [data, engineAttempt]);
  function retryMap() {
    stage.current?.focus({ preventScroll: true });
    if (dataError) {
      dataCaches.delete(publicOnly);
      setAttempt((a) => a + 1);
    }
    if (engineError) {
      // Keep this surface, selection and camera. Recreate only its failed
      // renderer; re-reading unchanged data cannot repair that renderer.
      const previous = engine.current;
      retryEngineModule.current = engineError === 'load';
      engineGeneration.current++;
      engine.current = undefined;
      try { if (previous) memory.camera = previous.snapshot(); } catch {}
      try { previous?.dispose(); } catch {}
      stage.current?.replaceChildren();
      handlers.current.onEngine?.(undefined);
      setEngineReady(false);
      setEngineAttempt((a) => a + 1);
    }
    setDataError(false);
    setEngineError(undefined);
  }
  useEffect(()=>()=>{engine.current?.dispose();engine.current=undefined;handlers.current.onEngine?.(undefined);},[]);
  useEffect(() => {
    const current=engine.current;
    if(reviewScene!=='route-demo'||!engineReady||!current||selection.route.status!=='ready'||reviewRouteFramed.current)return;
    reviewRouteFramed.current=true;
    const ticket=current.ownership.ticket();
    const frame=requestAnimationFrame(()=>{if(!touched.current&&current.ownership.accepts(ticket))current.fitRoute(selection.route);});
    return ()=>cancelAnimationFrame(frame);
  }, [engineReady, selection.route, reviewScene]);
  useEffect(() => {
    if (!engineReady || !reviewScene || !engine.current) return;
    if(appliedReviewScene.current===reviewScene)return;
    appliedReviewScene.current=reviewScene;
    const current = engine.current;
    if ((reviewScene === 'oblique' || reviewScene === 'building-focus') && current.supportsSpace) {
      current.setPitch(42); current.rotate(-Math.PI / 12, false);
    }
    if (reviewScene === 'overview' || reviewScene === 'top-down') current.overview();
  }, [engineReady, reviewScene]);

  // Profile edits are local and infrequent. Refresh labels and endpoints from
  // their sole owner without recreating geometry, camera or the route task.
  useEffect(()=>{
    if(!data||inline)return;
    let stopped=false;
    const timer=setInterval(async()=>{try{const m=await api.mapOverview({ publicOnly });if(stopped)return;if(m.version!==data.manifest.version||m.dataStatus!==data.manifest.dataStatus){const next=api.mapDataJson?JSON.parse(await api.mapDataJson({ publicOnly })):await api.mapData({ publicOnly });if(!stopped){dataCaches.set(publicOnly,next);setData(next);dispatch({type:'rebind',places:next.places});}return;}if(m.profileRevision===data.manifest.profileRevision)return;const places=await api.mapPlaces({ publicOnly });if(stopped)return;data.manifest=m;data.places=places;engine.current?.updatePlaces(places);dispatch({type:'rebind',places});}catch{}},3000);
    return()=>{stopped=true;clearInterval(timer);};
  },[data,inline,publicOnly]);
  useEffect(() => {
    if (engineReady) engine.current?.select(selection.destination, inline?initialRoute.from:selection.mode==='browse'?undefined:selection.origin,inline?initialRoute.status==='ready'&&selection.destination?.id===initialRoute.to?.id:selection.mode!=='browse');
  }, [engineReady, selection.destination, selection.origin,selection.mode,inline,initialRoute]);
  useEffect(()=>{
    if(!inline||sceneRouteRef.current===initialRoute)return;
    sceneRouteRef.current=initialRoute;memory.selection=undefined;
    // Returning from a local route preview can have no origin. Rebuild this
    // selection from the original endpoints instead of retaining the trial A.
    dispatch({type:'clear'}); dispatch({type:'browse'});
    if(initialRoute.from)dispatch({type:'start',point:initialRoute.from});
    if(initialRoute.to)dispatch({type:'choose',point:initialRoute.to});
  },[inline,initialRoute,memory]);
  useEffect(() => {
    if (!inline && engineReady && initialDestination.current && !touched.current) {
      const point = data?.places.find((p) => p.id === initialDestination.current);
      initialDestination.current = undefined;
      if (point) {
        introDone.current = true;
        engine.current?.focusPlace(point);
      }
    }
  }, [engineReady]);
  useEffect(() => {
    if (engineReady) engine.current?.route(inline?initialRoute:selection.mode==='browse' ? emptyRoute() : selection.route);
    setPreview(undefined);
  }, [engineReady, selection.route, selection.mode,inline,initialRoute]);
  useEffect(()=>{
    if(inline&&engineReady){const point=memory.selection?.destination||initialRoute.to;engine.current?.select(point,initialRoute.from,initialRoute.status==='ready'&&point?.id===initialRoute.to?.id);}
  },[inline,engineReady,initialRoute]);
  useEffect(() => {
    if (engineReady) engine.current?.preview(preview===undefined?undefined:preview/100);
  }, [engineReady, preview]);
  useEffect(() => {
    // A new dataset disposes the old engine before the next ready render.
    // React can still run this effect with the preceding ready flag in that
    // commit. Defer the request until the current instance is actually alive.
    if (inline || !data || !engineReady || !engine.current?.ownership.alive || !selection.destination || selection.stage === 'origin' || selection.mode==='browse') return;
    let current = true;
    const revision = selection.revision;
    dispatch({ type: 'loading', revision });
    const from =
      selection.mode === 'two' && selection.origin
        ? mapPointEndpoint(selection.origin)
        : selection.mode === 'current' && locationRef.current.status === 'fresh'
          ? { kind: 'current' as const }
          : undefined;
    api
      .mapRoute({ from, to: mapPointEndpoint(selection.destination), version: data.manifest.version, profileRevision:data.manifest.profileRevision, avoidStairs:selection.avoidStairs,allowConditional:selection.allowConditional,originAccessId:selection.originAccessId,destinationAccessId:selection.destinationAccessId, publicOnly })
      .then((route) => {
        if (!current || !alive.current) return;
        if(route.source.version && route.source.version!==data.manifest.version)return;
        dispatch({ type: 'result', revision, route });
      })
      .catch((e) => {
        if (current && alive.current)
          dispatch({
            type: 'result',
            revision,
            route: { ...emptyRoute(), status: 'error', reason: String(e.message || e) },
          });
      });
    return () => {
      current = false;
    };
  }, [selection.revision, data, engineReady]);
  requestRef.current = async (explicit = false) => {
    if (publicOnly) return;
    if (document.visibilityState === 'hidden') return;
    if (explicit) tracking.current = true;
    if (!tracking.current) return;
    if (explicit) {
      engine.current?.takeControl();
      user();
    }
    const revision = ++locationRevision.current,
      ticket = engine.current?.ownership.ticket(),
      activityTicket = activity.current;
    setLocation((s) => ({ ...s, status: 'requesting', reason: 'Preparing the simulated position…' }));
    let result: LocationStatusResult;
    try {
      result = await api.mapLocate();
    } catch {
      result = {
        status: 'unavailable',
        source: 'simulated',
        phoneConnected: false,
        reason: 'The simulated position is unavailable. Choose a starting point on the map.',
      };
    }
    if (!alive.current || revision !== locationRevision.current) return;
    if (result.fix && data)
      result = {
        ...result,
        status: classifyFix(result.fix, data.manifest.bounds, Date.now(), locationRef.current.fix),
      };
    setLocation(result);
    if (result.fix && result.status === 'fresh' && engine.current) {
      if (explicit && activityTicket === activity.current) engine.current.locate(result.fix, false, ticket);
    }
    if (
      explicit &&
      result.fix &&
      result.status === 'fresh' &&
      !engine.current &&
      activityTicket === activity.current
    )
      pendingLocate.current = { fix: result.fix, activity: activityTicket };
  };
  function stopLocation() {
    tracking.current = false;
    locationRevision.current++;
    pendingLocate.current = undefined;
    engine.current?.takeControl();
    user();
    void api.mapStopLocation();
    setLocation({
      status: 'idle',
      source: 'simulated',
      phoneConnected: false,
      reason: 'Simulated position is stopped. You can choose a starting point on the map.',
    });
    if (selectionRef.current.mode === 'current') dispatch({ type: 'retry' });
  }
  useEffect(() => {
    if(inline || publicOnly)return;
    void requestRef.current();
    const timer = setInterval(() => {
      if (['fresh', 'approximate', 'outside'].includes(locationRef.current.status)) void requestRef.current();
    }, 30000);
    const visible = () => {
      if (document.visibilityState === 'hidden') {
        locationRevision.current++;
        void api.mapStopLocation({ keepSharedContext: handoffContext.current });
      } else if (locationRef.current.fix) void requestRef.current();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      tracking.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      locationRevision.current++;
      // The location loop owns shutdown. A deliberate handoff keeps only the
      // already authorised short-lived snapshot; acquisition still stops.
      void api.mapStopLocation({ keepSharedContext: handoffContext.current }).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!engineReady) return;
    const usable =
      location.fix && data
        ? ['fresh', 'approximate'].includes(classifyFix(location.fix, data.manifest.bounds))
        : false;
    engine.current?.location(usable ? location.fix : undefined);
    const pending = pendingLocate.current;
    if (pending) {
      pendingLocate.current = undefined;
      if (pending.activity === activity.current) engine.current?.locate(pending.fix);
    }
  }, [engineReady, location]);
  useEffect(() => {
    setResultIndex(-1);
  }, [query, onlyConnected]);
  useEffect(() => {
    if (searchOpen)
      document.getElementById(`${searchId}-result-${resultIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [resultIndex]);
  function cancel(e: React.SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (searchOpen) {
      setSearchOpen(false);
      search.current?.focus();
    } else if (about || help || candidates.length) {
      setAbout(false);
      setHelp(false);
      setCandidates([]);
      stage.current?.focus();
    } else if (selection.mode === 'two' && selection.stage !== 'browse') {
      if (publicOnly) {
        const point = selection.destination || selection.origin;
        dispatch({ type: 'clear' });
        dispatch({ type: 'browse' });
        if (point) dispatch({ type: 'choose', point });
      } else dispatch({ type: 'current' });
      stage.current?.focus();
    } else onClose();
  }
  const route = selection.route,
    p = selection.destination;
  const handoffRoute = selection.mode === 'two' && selection.stage === 'browse' && !!selection.origin && !!p
    && route.from?.id === selection.origin.id && route.to?.id === p.id
    && !['loading', 'error', 'missing_origin', 'missing_destination', 'outside'].includes(route.status);
  const choosingEndpoint=selection.mode==='two'&&(selection.stage==='origin'||selection.stage==='destination');
  const venue=data?.venues?.find(v=>v.id===(p||selection.origin)?.id);
  const hoverPixel =
    hover && engine.current
      ? engine.current.project(hover.coordinate)
      : undefined;
  return (
    <section
      ref={publicOnly ? undefined : onPresenceHost}
      className={`campus-v2-dialog campus-v2-surface${inline?' campus-map-inline':''}`}
      aria-label={data?.manifest.label || 'Map'}
      onKeyDown={(event)=>{if(event.key==='Escape')cancel(event);}}
      onKeyDownCapture={user}
    >
      <header className="campus-v2-header">
        <button
          type="button"
          className="campus-v2-return"
          aria-label={returnLabel}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }}
        >
          <ArrowLeft size={18} />
          <span>Back</span>
        </button>
        <div>
          <strong title={data?.manifest.label}>{data?.manifest.dataKind === 'synthetic' ? 'Synthetic campus' : data?.manifest.label || 'Map'}</strong>
          <span>{data?.manifest.dataKind === 'synthetic' ? 'Illustrative map' : 'Places and paths'}</span>
        </div>
        {reviewControls}
        <div className="campus-v2-window-actions">
          <button
            className="campus-v2-icon"
            aria-label="Map sources and coverage"
            onClick={() => {
              setAbout(!about);
              setHelp(false);
            }}
          >
            <Info size={18} />
          </button>
          {!inline && <WindowControls onClose={onWindowClose} />}
        </div>
      </header>
      <div
        className="campus-v2-body"
        onPointerDown={user}
      >
        <div
          ref={stage}
          className="campus-v2-stage"
          role="application"
          tabIndex={0}
          aria-label="Map. Arrow keys pan; plus and minus zoom; Q and E rotate; brackets adjust pitch; N points north; 0 shows the overview."
        />
        <div className="campus-v2-top campus-v2-obstruction">
          <div className="campus-v2-search">
            <Search size={18} />
            <input
              ref={search}
              aria-label="Search buildings or places"
              role="combobox"
              aria-expanded={searchOpen}
              aria-controls={`${searchId}-results`}
              aria-autocomplete="list"
              aria-activedescendant={
                searchOpen && shown[activeResult] ? `${searchId}-result-${activeResult}` : undefined
              }
              placeholder="Search buildings and places"
              value={query}
              onFocus={() => setSearchOpen(true)}
              onChange={(e) => {
                user();
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  setSearchOpen(true);
                  setResultIndex((i) =>
                    Math.max(0, Math.min(shown.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))),
                  );
                }
                if (e.key === 'Enter' && shown[activeResult]) {
                  e.preventDefault();
                  const point = shown[activeResult];
                  chooseAndFocus(point);
                }
                if (e.key === 'Escape' && searchOpen) {
                  e.preventDefault();
                  e.stopPropagation();
                  setSearchOpen(false);
                }
              }}
            />
            {query ? (
              <button aria-label="Clear search" onClick={() => setQuery('')}>
                <X size={16} />
              </button>
            ) : (
              <span className="campus-v2-key">⌕</span>
            )}
          </div>
          {searchOpen && (
            <div className="campus-v2-results">
              <button
                className="campus-v2-filter"
                role="switch"
                aria-checked={onlyConnected}
                onClick={() => setOnlyConnected(!onlyConnected)}
              >
                <span>Only places with mapped entrances</span>
                {onlyConnected ? <Check size={15} /> : <span>All</span>}
              </button>
              <div id={`${searchId}-results`} role="listbox" aria-label="Place search results">
                {shown.map((point, i) => (
                  <button
                    key={point.id}
                    id={`${searchId}-result-${i}`}
                    data-place-id={point.id}
                    role="option"
                    tabIndex={-1}
                    aria-selected={i === activeResult}
                    onClick={() => {
                      chooseAndFocus(point);
                    }}
                  >
                    <span>{point.displayName}</span>
                    <small>
                      {placeSearchDetail(point)}
                    </small>
                  </button>
                ))}
              </div>
              <p>
                {results.length
                  ? `${results.length} matching places${results.length > 1 ? ' · Choose one or use the arrow keys' : ''}${results.length > 40 ? ' · Keep typing to narrow the results' : ''}`
                  : 'No matching place was found. Try another name or a nearby place.'}
              </p>
            </div>
          )}
          <div className="campus-v2-mode">
            <button
              className={selection.mode === 'two' ? 'active' : ''}
              onClick={() => {
                user();
                dispatch({ type: selection.mode === 'two' ? 'browse' : 'two' });setCollapsed(false);
                setSearchOpen(false);
              }}
            >
              <Route size={16} />
              {selection.mode === 'two' ? 'Browse map' : 'Route between points'}
            </button>
            <span aria-live="polite">
              {selection.stage === 'origin'
                ? 'Choose start A'
                : selection.stage === 'destination'
                  ? 'Choose destination B'
                  : ''}
            </span>
          </div>
        </div>
        <div className="campus-v2-controls campus-v2-obstruction">
          {engineReady && engine.current?.supportsSpace && <div><button aria-label={pitch>1?'Show the 2D map':'Show the 3D view'} onClick={()=>{user();engine.current?.setPitch(pitch>1?0:42,true);setSpaceControls(pitch<=1);}}>{pitch>1?'2D':'3D'}</button></div>}
          <div>
            {!publicOnly && <button data-map-action="locate" aria-label="Show simulated position" title="Show simulated position" onClick={() => void requestRef.current(true)}>
              <LocateFixed size={20} />
            </button>}
            <button aria-label="Point north" title="Point north · N" onClick={() => engine.current?.north()}>
              <span ref={compass} className="campus-v2-north">
                N<i />
              </span>
            </button>
          </div>
          <div>
            <button aria-label="Zoom in" title="Zoom in · +" onClick={() => engine.current?.zoom(0.6)}>
              <Plus size={19} />
            </button>
            <button aria-label="Zoom out" title="Zoom out · −" onClick={() => engine.current?.zoom(-0.6)}>
              <Minus size={19} />
            </button>
          </div>
          <div>
            <button
              aria-label="Rotate counterclockwise"
              title="Rotate counterclockwise · Q"
              onClick={() => engine.current?.rotate(-Math.PI / 12)}
            >
              <RotateCcw size={17} />
            </button>
            <button
              aria-label="Rotate clockwise"
              title="Rotate clockwise · E"
              onClick={() => engine.current?.rotate(Math.PI / 12)}
            >
              <RotateCw size={17} />
            </button>
            <button aria-label="Show map overview" title="Show overview · 0" onClick={() => engine.current?.overview()}>
              <Maximize size={17} />
            </button>
          </div>
        </div>
        {spaceControls && <div className="campus-v3-pitch campus-v2-floating"><label>View angle <input aria-label="Map pitch" type="range" min="0" max="55" step="1" value={Math.round(pitch)} onChange={e=>{user();engine.current?.setPitch(Number(e.target.value));}}/></label><button aria-label="Close pitch control" onClick={()=>setSpaceControls(false)}><X size={14}/></button></div>}
        {hover && hoverPixel && !searchOpen && (
          <div
            className="campus-v2-tooltip"
            style={{
              left: Math.max(20, Math.min((stage.current?.clientWidth || 800) - 210, hoverPixel[0] + 12)),
              top: Math.max(90, Math.min((stage.current?.clientHeight || 600) - 65, hoverPixel[1] - 32)),
            }}
          >
            {hover.displayName}
          </div>
        )}
        {candidates.length > 0 && (
          <div className="campus-v2-candidates campus-v2-floating" aria-label="Choose a nearby building">
            <strong>Which building did you mean?</strong>
            {candidates.map((p) => (
              <button key={p.id} onClick={() => choose(p)}>
                {p.displayName}
              </button>
            ))}
            <button onClick={() => setCandidates([])}>Cancel</button>
          </div>
        )}
        {dataError || engineError ? (
          <div className="campus-v2-empty" role="alert">
            <MapPinned size={28} />
            <strong>The map could not be opened</strong>
            <button onClick={retryMap}>
              Open again
            </button>
          </div>
        ) : (
          !engineReady && (
            <div className="campus-v2-loading" role="status">
              Opening the map…
            </div>
          )
        )}
        {selection.mode==='browse' && p && <section className="campus-v3-place campus-v2-route campus-v2-obstruction" aria-label="Place details"><div><strong>{p.displayName}</strong><button aria-label={collapsed?'Expand place details':'Collapse place details'} onClick={()=>setCollapsed(!collapsed)}>{collapsed?'Expand':'Collapse'}</button></div>{!collapsed&&<>{!p.graphNodeId&&<p>{placeStatusText(p)}</p>}<div className="campus-v2-route-actions">{p.kind==='water'?<button onClick={()=>{user();dispatch({type:'two'});}}>Choose a shore starting point</button>:<><button onClick={()=>{user();dispatch({type:'start',point:p});stage.current?.focus({preventScroll:true});}}>Route from here</button>{!publicOnly&&<button onClick={()=>{user();dispatch({type:'current'});}}>Use simulated position</button>}{p.entrances.length>0&&<button onClick={()=>{setEntrances(!entrances);engine.current?.showEntrances(!entrances);}}>{entrances?'Hide entrances':'Show entrances'}</button>}</>}</div>{venue&&<details className="campus-v3-venue"><summary>Track and facility information</summary><p>{venue.nominalLapBasis}</p><p>{venue.lapBasis}</p><p>{venue.markingBasis}</p><p>{venue.laneBasis}</p><p>{venue.displayBasis}</p><small>Explore the facility here; this does not count running laps.</small></details>}{p.waterBasis&&<details className="campus-v3-venue"><summary>Water and shoreline information</summary><p>{p.waterBasis}</p></details>}{(p.modelBasis||p.sourceCorrection)&&<details className="campus-v3-venue"><summary>{p.modelBasis?"Building shape and sources":"Facility information"}</summary>{p.modelBasis&&<p>{p.modelBasis}</p>}{p.sourceCorrection&&<p>{p.sourceCorrection.basis}</p>}</details>}{p.personal?.note&&<p>{p.personal.note}</p>}</>}</section>}
        {selection.mode!=='browse' && (p || selection.origin || selection.mode === 'two') && (
          <section
            className="campus-v2-route campus-v2-obstruction"
            aria-label="Route information"
            data-status={route.status}
            data-collapsed={collapsed}
            data-picking={choosingEndpoint}
          >
            <div className="campus-v2-endpoints">
              <button
                onClick={() => {
                  user();
                  dispatch({ type: 'origin' });
                }}
              >
                <span className="campus-v2-endpoint">A</span>
                <span>
                  {selection.mode === 'current' ? 'Simulated position' : mapRoutePointName(selection.origin,route.originAccess) || 'Choose start'}
                </span>
              </button>
              <button className="campus-v3-swap" aria-label="Swap endpoints" title="Swap endpoints" disabled={!selection.origin||!p} onClick={()=>{user();dispatch({type:'swap'});}}><ArrowLeftRight size={16}/></button>
              <button
                onClick={() => {
                  user();
                  dispatch({ type: 'destination' });
                }}
              >
                <span className="campus-v2-endpoint filled">B</span>
                <span>{mapRoutePointName(p,route.destinationAccess) || 'Choose destination'}</span>
              </button>
              <button aria-label={preview!==undefined?'End preview':collapsed?'Expand route information':'Collapse route information'} onClick={()=>preview!==undefined?setPreview(undefined):setCollapsed(!collapsed)}>{preview!==undefined?'End':collapsed?'Expand':'Collapse'}</button>
            </div>
            {!collapsed && preview===undefined && <>
            {selectionNotice&&<p className="campus-v3-pick-hint" role="status">{selectionNotice}</p>}
            {choosingEndpoint ? <p className="campus-v3-pick-hint" role="status">{selection.stage==='origin'?'Choose start A on the map':'Choose another place as destination B'}, You can also search.</p> :
            <div className="campus-v2-route-main" aria-live="polite">
              <div>
                <strong>
                  {route.status === 'ready' && route.distance
                    ? routeDistanceTitle(route)
                    : route.status === 'loading'
                      ? 'Finding a route…'
                      : route.status==='unknown_entrance'
                        ? 'Entrance unknown'
                      : route.status==='unreachable'
                        ? 'No connecting route found'
                      : route.status==='error'
                        ? 'The route could not be found'
                      : p
                        ? p.displayName
                        : 'Select a building on the map'}
                </strong>
                <p>
                  {selection.stage === 'origin'
                    ? 'Choose start A.'
                    : route.status === 'ready'
                      ? route.distance?.connectorM ? `Mapped paths ${distanceLabel(route.distance.networkM)} + estimated access ${distanceLabel(route.distance.connectorM)} · Confirm dashed connections nearby` : `${route.originEntrance?.name||'Path point'} → ${route.destinationEntrance?.name||'Path point'} · ${routeHasUnverifiedPassages(route)?'includes passages with unconfirmed access':'shortest route along the mapped paths'}`
                      : route.reason}
                </p>

              </div>
              {route.status === 'ready' && (
                <button className="campus-v2-primary" onClick={() => showWholeRoute(route)}>
                  Show the full route
                  <Maximize size={15} />
                </button>
              )}
            </div>}
            <div className="campus-v2-route-actions">
              {route.status==='ready'&&<button className="campus-v3-preview-toggle" onClick={()=>setPreview(0)}><Route size={15}/>Preview the route</button>}
              <button disabled={!selection.previous} onClick={()=>{user();dispatch({type:'undo'});}}>Undo last selection</button>
              <button onClick={()=>{user();dispatch({type:'clear'});setPreview(undefined);}}>Clear</button>
              {route.status==='error'&&<button onClick={()=>dispatch({type:'retry'})}>Retry route</button>}
              <button onClick={()=>setRouteDetails(!routeDetails)}>{routeDetails?'Hide details':'Route details'}</button>
            </div>
            {route.status==='unknown_entrance'&&!!route.roadReferences?.length&&<details className="campus-v3-road-recovery">
              <summary>Choose a nearby mapped path</summary>
              <p>The route begins or ends at the selected path. Building access remains unknown.</p>
              {route.roadReferences.map(ref=><button key={ref.endpoint+ref.point.id} onClick={()=>{user();dispatch({type:ref.endpoint==='origin'?'origin':'destination'});dispatch({type:'choose',point:ref.point});}}><span>{ref.point.displayName}</span><small>About {Math.round(ref.straightM)} m in a straight line from {ref.forPlace} · {ref.endpoint==='origin'?'Use as start':'Use as destination'}</small></button>)}
            </details>}
            {route.status==='ready'&&(selection.origin?.roadReference||p?.roadReference)&&<p className="campus-v3-road-reference-note">{selection.origin?.roadReference?'Start':'Destination'} is on a mapped path. Access from there to the building is not included.</p>}
            {routeDetails&&<div className="campus-v3-route-details">
              <label><input type="checkbox" checked={!!selection.avoidStairs} onChange={e=>dispatch({type:'options',avoidStairs:e.target.checked})}/>Avoid stairs</label>
              <label><input type="checkbox" checked={!!selection.allowConditional} onChange={e=>dispatch({type:'options',allowConditional:e.target.checked})}/>Include conditional passages</label>
              {[['origin',selection.origin],['destination',p]].map(([role,value])=>{
                const place=value as MapPoint|undefined,endpoint=role as 'origin'|'destination';
                const choices=[...new Map((place?.accessCandidates||[]).flatMap(candidate=>{
                  if(candidate.entranceId){const entrance=place?.entrances.find(e=>e.id===candidate.entranceId);return entrance?[[`entrance/${entrance.id}`,entrance.name] as const]:[];}
                  return candidate.kind==='entrance'?[[candidate.id,candidate.name] as const]:[];
                })).entries()].sort((a,b)=>a[1].localeCompare(b[1],'en-US',{numeric:true}));
                const used=endpoint==='origin'?route.originEntrance:route.destinationEntrance;
                return place&&<div key={endpoint}><strong>{endpoint==='origin'?'Departure':'Destination'} · {place.displayName}{place.undergroundStation&&used?' · '+used.name:''}</strong>{place.roadReference?<p>This is a path point. Building access is unknown.</p>:choices.length?<label><select aria-label={endpoint==='origin'?'Choose departure entrance':'Choose destination entrance'} value={(endpoint==='origin'?selection.originAccessId:selection.destinationAccessId)||''} onChange={e=>dispatch({type:'access',endpoint,id:e.target.value||undefined})}><option value="">Compare mapped entrances</option>{choices.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>:<p>The entrance is unknown. Dashed lines avoid mapped obstacles but remain estimated connections.</p>}</div>;
              })}
              {!!(selection.origin?.entrances.length||p?.entrances.length)&&<button onClick={()=>{setEntrances(!entrances);engine.current?.showEntrances(!entrances);}}>{entrances?'Hide entrance markers':'Show mapped entrances'}</button>}
              {!publicOnly&&selection.mode==='two'&&<button onClick={()=>{user();dispatch({type:'current'});}}>Use simulated position</button>}
              {route.warnings.map((warning,i)=><p key={i}>{warning}</p>)}
            </div>}
            {onUseContext && (!choosingEndpoint||routeDetails) && (
              <div className="campus-v2-share">
                <button className="campus-map-handoff" disabled={sharing || !(selection.origin || p)
                  || selection.mode === 'two' && !!selection.origin && !!p && !handoffRoute} onClick={() => void useContext(false)}>
                  {sharing ? 'Adding to conversation…' : handoffRoute ? 'Discuss this route' : 'Continue from here'}
                  <ArrowUpRight size={14} />
                </button>
                {location.fix && ['fresh', 'approximate'].includes(location.status) && (
                  <details><summary>Simulated position</summary><button disabled={sharing} onClick={() => void useContext(true)}>
                    Use this simulated position
                  </button></details>
                )}
                {shareError && <p role="alert">{shareError}</p>}
              </div>
            )}
            </>}
            {preview!==undefined&&route.status==='ready'&&<div className="campus-v3-preview">
              <label><span>{routeHasUnverifiedPassages(route)?'Conditional preview':'Route preview'}</span><output>{distanceLabel((route.distance?.totalM||0)*preview/100)}</output><input autoFocus aria-label="Route preview progress" type="range" min="0" max="100" value={preview} onChange={e=>setPreview(Number(e.target.value))}/><span>Destination</span></label>
            </div>}
          </section>
        )}
        <footer className="campus-v2-footer">
          <div>
            <div ref={scale} className="campus-v2-scale" style={{visibility:engineReady?'visible':'hidden'}}>
              100 m
            </div>
            <button
              className="campus-v2-attribution"
              onClick={() => { setAbout(true); setHelp(false); }}
            >
              {data?.manifest.attribution || 'Map data'}
            </button>
          </div>
          <span ref={coverage} className="campus-v2-coverage" hidden>
            This area is outside the map coverage
          </span>
          <button
            className="campus-v2-location-state"
            onClick={() => {
              setAbout(true);
              setHelp(false);
            }}
          >
            {location.status === 'idle' && selection.origin
              ? `Manual start · ${selection.origin.displayName}`
              : locationLabel(location)}
          </button>
          {!publicOnly && footerControls}
          <button
            className="campus-v2-help"
            aria-label="Map controls"
            onClick={() => {
              setHelp(!help);
              setAbout(false);
            }}
          >
            ?
          </button>
        </footer>
        {about && (
          <div className="campus-v2-about campus-v2-floating" role="region" aria-label="Map sources and coverage">
            <div className="campus-v2-floating-head">
              <strong>{data?.manifest.label || 'About this map'}</strong>
              <button aria-label="Close map information" onClick={() => setAbout(false)}><X size={17} /></button>
            </div>
            <p>{data?.manifest.dataKind === 'synthetic' ? 'This is an illustrative demonstration, not real-campus navigation.' : 'Explore the places and paths supplied by this map. Your markers remain separate from its source geometry.'}</p>
            {data && <>
              <dl>
                <div><dt>Selectable buildings</dt><dd>{data.manifest.buildings}</dd></div>
                <div><dt>Entrances connected to paths</dt><dd>{data.manifest.connectedEntrances}</dd></div>
                <div><dt>Buildings with mapped or estimated access</dt><dd>{data.manifest.routableBuildings}</dd></div>
                <div><dt>Source date</dt><dd>{data.manifest.sourceDate.slice(0, 10)}</dd></div>
              </dl>
              <p>{data.manifest.attribution}</p><p>{data.manifest.license}</p>
              {data.manifest.limitations.map((limitation, index) => <p key={index}>{limitation}</p>)}
              <p>Unmapped areas may still contain buildings and paths. Access controls, construction and temporary changes need current confirmation. Building heights may be recorded, estimated or illustrative; indoor routes are not supplied. At an angle, the scale represents ground distance across the center of the view.</p>
            </>}
            {!publicOnly && <><strong>Simulated position</strong>
              <p>{location.reason}{location.fix && <> Recorded at {new Date(location.fix.timestamp).toLocaleTimeString('en-US')}.</>}</p>
              <p>Closing the map stops the simulated position. A workout has its own controls and retention settings.</p>
              {tracking.current && <button className="campus-v2-stop-location" onClick={stopLocation}>Stop simulated position</button>}
            </>}
            <div className="campus-v2-source-links">
              {data?.manifest.source.startsWith('https://') && <button onClick={() => void api.openLink(data.manifest.source)}>Map source ↗</button>}
              {data?.manifest.dataKind === 'osm' && <button onClick={() => void api.openLink('https://www.openstreetmap.org/copyright')}>OpenStreetMap license ↗</button>}
            </div>
          </div>
        )}
        {help && (
          <div className="campus-v2-about campus-v2-floating" role="region" aria-label="Map controls">
            <div className="campus-v2-floating-head">
              <strong>Explore the map</strong>
              <button aria-label="Close map controls" onClick={() => setHelp(false)}>
                <X size={17} />
              </button>
            </div>
            <dl>
              <div>
                <dt>Pan</dt>
                <dd>Drag or use arrow keys</dd>
              </div>
              <div>
                <dt>Zoom</dt>
                <dd>Scroll, pinch, or use + / −</dd>
              </div>
              <div>
                <dt>Rotate</dt>
                <dd>Right-drag, use two fingers, or press Q / E; [ / ] adjusts pitch</dd>
              </div>
              <div>
                <dt>North / overview</dt>
                <dd>N / 0</dd>
              </div>
              <div>
                <dt>Select a building</dt>
                <dd>Select its outline, or search and press Enter</dd>
              </div>
            </dl>
            <p>
              Keyboard shortcuts work while the map has focus. For a two-point route, choose A, then B. Later selections replace only
              B. Drag at any time to take over the camera.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
export function MapSheet(props: Parameters<typeof MapSurface>[0]) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const opener=document.activeElement as HTMLElement|null;
    dialog.current?.showModal();
    return ()=>{dialog.current?.close();if(opener?.isConnected)opener.focus({preventScroll:true});};
  },[]);
  return <dialog ref={dialog} className="campus-v2-dialog" aria-label="Campus map" onCancel={event=>{event.preventDefault();props.onClose();}}><MapSurface {...props}/></dialog>;
}
function fromWgs84([lon, lat]: number[]) {
  return [(6378137 * lon * Math.PI) / 180, 6378137 * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))];
}
function locationLabel(location: LocationStatusResult) {
  const labels: Record<LocationStatusResult['status'], string> = {
    idle: 'Choose a starting point on the map',
    requesting: 'Preparing simulated position…',
    fresh: 'Simulated position',
    approximate: 'Simulated position is approximate',
    outside: 'Simulated position is outside this map',
    stale: 'Earlier simulated position',
    denied: 'Position access is off',
    unavailable: 'Simulated position is unavailable',
  };
  return labels[location.status];
}
