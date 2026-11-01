import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { ChevronDown, ChevronUp, Expand, MapPinned, Pause, Play, Route, X } from 'lucide-react';
import type { MapScene, SemanticSelection } from '../../shared/scenes';
import { emptyRoute, mapPointEndpoint, routeHasUnverifiedPassages, type MapPoint, type MapRouteResult } from '../../shared/map-v2';
import { sharedMapRouteSchema, type SharedMapRoute } from '../../shared/map-context';
import type { MapSurfaceMemory, MapContextHandoff } from './CampusMap';
import { MapSurface } from './DesktopMapSheet';
import type { CampusMapEngine } from './map-engine';
import './conversation-map.css';
import { prefersQuietMotion } from '../companion';
import { useSpringValue } from '../motion/use-spring';
import { uiError } from '../ui';

interface ViewMemory extends MapSurfaceMemory {
  legId?: string;
  sourceLegId?: string;
  collapsed?: boolean;
  manual?: boolean;
  selected?: MapPoint;
  cameraRequestId?: string;
  display?: string;
}
const views = new Map<string, ViewMemory>();
const viewResets = new Set<() => void>();
export function clearConversationMapViews() {
  views.clear();
  viewResets.forEach(reset => reset());
}
function viewMemory(key: string, continuationKey?: string): ViewMemory {
  let value = views.get(key);
  if (!value) {
    value = continuationKey && views.has(continuationKey) ? structuredClone(views.get(continuationKey)!) : {};
    views.set(key, value);
    while (views.size > 96) views.delete(views.keys().next().value!);
  }
  return value;
}
function distance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}
const focusAnimationTime = (progress: number) => (progress + .15) / 1.3 * 270;

/** A scene's fact snapshot is immutable. Only its local camera/preview/selection is saved here. */
export function ConversationMap({
  scene: snapshot,
  memoryKey = snapshot.id,
  continuationKey,
  onSelect,
  onContinue,
  onUseMapContext,
  historical = false,
  cancelled = false,
  interruptionKey,
  active = true,
  allowCameraRequests = true,
}: {
  scene: MapScene;
  memoryKey?: string;
  continuationKey?: string;
  onSelect: (selection: SemanticSelection) => void;
  onContinue?: () => void;
  onUseMapContext?: (value: MapContextHandoff) => boolean | void;
  historical?: boolean;
  cancelled?: boolean;
  interruptionKey?: string;
  active?: boolean;
  allowCameraRequests?: boolean;
}) {
  // IPC publishes a cloned message at every text update; equal scene versions
  // retain their fact object so streaming prose cannot restart map effects.
  const scene = useMemo(() => snapshot, [snapshot.id, snapshot.revision]);
  const memory = useRef(viewMemory(memoryKey, continuationKey)).current;
  const sourceVersion = useRef(scene.source.version);
  const userCameraRequest =
    allowCameraRequests &&
    !historical &&
    !!scene.cameraUserRequested &&
    !!scene.cameraRequestId &&
    memory.cameraRequestId !== scene.cameraRequestId;
  const canApplyDisplay = scene.display === 'compact' || !memory.manual || userCameraRequest;
  const [collapsed, setCollapsed] = useState(
      userCameraRequest && scene.display !== 'compact'
        ? false
        : scene.display && scene.display !== memory.display && canApplyDisplay
          ? scene.display === 'compact'
          : !!memory.collapsed,
    ),
    [focused, setFocused] = useState(false);
  const [legId, setLegId] = useState(
      memory.sourceLegId !== scene.activeLegId ? scene.activeLegId : memory.legId || scene.activeLegId,
    ),
    [selected, setSelected] = useState(memory.selected);
  useEffect(() => {
    if (sourceVersion.current === scene.source.version) return;
    sourceVersion.current = scene.source.version;
    memory.selected = undefined; setSelected(undefined);
  }, [scene.source.version, memory]);
  const [ready, setReady] = useState(false),
    [explaining, setExplaining] = useState(false),
    [progress, setProgress] = useState<number>(),
    [playing, setPlaying] = useState(false);
  const [surfaceEntered, setSurfaceEntered] = useState(active && !collapsed);
  useEffect(() => {
    if (active && !collapsed) setSurfaceEntered(true);
  }, [active, collapsed]);
  const [entrances, setEntrances] = useState(false);
  const [pickingOrigin, setPickingOrigin] = useState(false), [originPreview, setOriginPreview] = useState<MapRouteResult>();
  const [previewConditions, setPreviewConditions] = useState<SharedMapRoute>();
  const [routePending, setRoutePending] = useState(false), [routeIssue, setRouteIssue] = useState(''), [sharing, setSharing] = useState(false);
  const routeRequest = useRef(0), alive = useRef(true);
  const engine = useRef<CampusMapEngine | undefined>(undefined),
    container = useRef<HTMLElement>(null),
    expandButton = useRef<HTMLButtonElement>(null);
  const prior = useRef({ revision: scene.revision, intent: scene.cameraIntent });
  const motionRequest = useRef(0);
  const frame = useRef<HTMLDivElement>(null);
  const expansion = useRef<Animation | undefined>(undefined);
  const expansionSpring = useSpringValue(1, { stiffness: 290, damping: 33, bounds: [-.12, 1.12] });
  const expansionVector = useRef([0, 0, 0, 0]);
  const expansionOrigin = useRef<DOMRect | undefined>(undefined);
  // Modal focus can move the message scroller. The return target is the
  // opening viewport rectangle, not a later off-screen position of its frame.
  const inlineGeometry = useRef<{ width: number; height: number; left: number; top: number } | undefined>(undefined);
  const focusScroll = useRef<{ element: HTMLElement; top: number; left: number } | undefined>(undefined);
  const focusGesture = useRef<{ pointerId: number; target: HTMLButtonElement; startY: number; lastY: number;
    lastAt: number; velocity: number; startProgress: number; progress: number; distance: number; wasFocused: boolean; moved: boolean } | undefined>(undefined);
  const focusState = useRef(focused);
  const [draggingFocus, setDraggingFocus] = useState(false);
  const [placeholderHeight, setPlaceholderHeight] = useState<number>();
  const [transitioning, setTransitioning] = useState(false);
  const collapsedBeforeFocus = useRef(false);
  function animateFocus(before: DOMRect, scrubbing = false, visible?: DOMRect) {
    const element = container.current;
    const previous = expansionSpring.stop(), vector = expansionVector.current;
    expansion.current?.cancel();
    if (!element || (!scrubbing && prefersQuietMotion())) { setTransitioning(false); return; }
    const after = element.getBoundingClientRect();
    if (!after.width || !after.height) { setTransitioning(false); return; }
    const geometry = (rect: DOMRect) => ({ transformOrigin: '0 0',
      transform: `translate(${rect.left-after.left}px,${rect.top-after.top}px) scale(${rect.width/after.width},${rect.height/after.height})`, borderRadius: '22px' });
    const at = focusGesture.current?.progress || 0;
    const nextVector = [after.left-before.left, after.top-before.top, after.width-before.width, after.height-before.height];
    const extent = nextVector.reduce((sum, value) => sum + value * value, 0);
    const inherited = extent ? nextVector.reduce((sum, value, index) => sum + value * vector[index] * previous.velocity, 0) / extent : 0;
    expansionVector.current = nextVector;
    const rectangleAt = (progress: number) => new DOMRect(before.left + nextVector[0] * progress,
      before.top + nextVector[1] * progress, Math.max(1, before.width + nextVector[2] * progress), Math.max(1, before.height + nextVector[3] * progress));
    const animation = element.animate([
      // Leave a little room beyond each endpoint for the velocity carried by
      // a reversal. The final owner state remains exactly home or full size.
      { ...geometry(rectangleAt(-.15)), offset: 0 },
      { ...geometry(before), offset: .15 / 1.3 },
      // A restarted transition may not lie exactly on the original home/full
      // line. Keep the actual visible rectangle at the grabbed progress.
      ...(visible && at > 0 && at < 1 ? [{ ...geometry(visible), offset: (at + .15) / 1.3 }] : []),
      { transformOrigin: '0 0', transform: 'none', offset: 1.15 / 1.3 },
      { ...geometry(rectangleAt(1.15)), offset: 1 },
    ], { duration: 270, easing: 'linear', fill: 'both' });
    expansion.current = animation;
    animation.pause();
    setTransitioning(true);
    if (scrubbing) {
      expansionSpring.set(at);
      animation.currentTime = focusAnimationTime(focusGesture.current?.progress || 0);
    } else {
      expansionSpring.set(0, inherited);
      expansionSpring.animate(1, { onRest: () => {
        if (expansion.current !== animation) return;
        animation.cancel(); expansion.current = undefined; setTransitioning(false);
      } });
    }
    return animation;
  }
  useLayoutEffect(() => {
    if (expansion.current) {
      expansion.current.currentTime = focusAnimationTime(expansionSpring.value);
      if (expansionSpring.value === 1 && !focusGesture.current) {
        expansion.current.cancel(); expansion.current = undefined; setTransitioning(false);
      }
    }
  }, [expansionSpring.value]);
  function focusMap(next: boolean) {
    if (focusState.current === next) return;
    const element = container.current;
    // Capture the current animated position before interruption. Rapid changes
    // start here rather than replaying a previous entrance.
    expansionOrigin.current = element?.getBoundingClientRect();
    expansionSpring.stop();
    expansion.current?.cancel();
    setTransitioning(!prefersQuietMotion());
    engine.current?.cancelMotion(); setPlaying(false);
    if (next) {
      const home = element?.getBoundingClientRect();
      if (home) inlineGeometry.current = { width: home.width, height: home.height, left: home.left, top: home.top };
      const scroll = frame.current?.closest<HTMLElement>('.message-scroll');
      if (scroll) focusScroll.current = { element: scroll, top: scroll.scrollTop, left: scroll.scrollLeft };
      collapsedBeforeFocus.current = collapsed;
      setPlaceholderHeight(frame.current?.getBoundingClientRect().height);
      memory.collapsed = false; setCollapsed(false);
    } else {
      cancelOrigin(false);
      setPlaceholderHeight(undefined);
      memory.collapsed = collapsedBeforeFocus.current;
      setCollapsed(collapsedBeforeFocus.current);
    }
    focusState.current = next;
    setFocused(next);
  }
  useLayoutEffect(() => {
    if (!focused) {
      const scroll = focusScroll.current;
      focusScroll.current = undefined;
      if (scroll?.element.isConnected) {
        scroll.element.scrollTop = scroll.top;
        scroll.element.scrollLeft = scroll.left;
      }
    }
    const element = container.current, before = expansionOrigin.current;
    expansionOrigin.current = undefined;
    if (!element || !before) { setTransitioning(false); return; }
    const animation = animateFocus(before, !!focusGesture.current);
    return () => animation?.cancel();
  }, [focused]);
  function beginFocusGesture(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !event.isPrimary || focusGesture.current) return;
    const element = container.current;
    if (!element) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    engine.current?.cancelMotion(); setPlaying(false);
    const wasFocused = focusState.current;
    const visible = element.getBoundingClientRect();
    expansionSpring.stop();
    const home = inlineGeometry.current;
    const homeRect = wasFocused && home
      ? new DOMRect(home.left, home.top, home.width, home.height) : undefined;
    let startProgress = wasFocused ? 1 : 0;
    if (homeRect) {
      expansion.current?.cancel();
      const full = element.getBoundingClientRect(), dimensions = ['left', 'top', 'width', 'height'] as const;
      const dimension = dimensions.reduce((best, key) => Math.abs(full[key]-homeRect[key]) > Math.abs(full[best]-homeRect[best]) ? key : best);
      const range = full[dimension]-homeRect[dimension];
      if (Math.abs(range) > .5) startProgress = Math.max(0, Math.min(1, (visible[dimension]-homeRect[dimension])/range));
      const matches = (other: DOMRect) => dimensions.every(key => Math.abs(visible[key]-other[key]) < .5);
      if (!matches(homeRect) && !matches(full)) startProgress = Math.max(.001, Math.min(.999, startProgress));
    }
    const homeTop = homeRect?.top ?? visible.top;
    const focusedTop = parseFloat(getComputedStyle(element).getPropertyValue('--map-focus-top')) || 84;
    focusGesture.current = { pointerId: event.pointerId, target: event.currentTarget, startY: event.clientY,
      lastY: event.clientY, lastAt: event.timeStamp, velocity: 0, startProgress, progress: startProgress,
      distance: Math.max(96, Math.abs(homeTop-focusedTop)), wasFocused, moved: false };
    setDraggingFocus(true);
    if (!wasFocused) focusMap(true);
    else {
      if (homeRect) animateFocus(homeRect, true, visible);
    }
  }
  function moveFocusGesture(event: PointerEvent<HTMLButtonElement>) {
    const gesture = focusGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    const delta = event.clientY - gesture.startY, elapsed = event.timeStamp-gesture.lastAt;
    if (elapsed > 0) gesture.velocity = (gesture.lastY-event.clientY)/elapsed;
    gesture.lastY = event.clientY; gesture.lastAt = event.timeStamp;
    gesture.moved ||= Math.abs(delta) > 5;
    gesture.progress = Math.max(0, Math.min(1, gesture.startProgress-delta/gesture.distance));
    expansionSpring.set(gesture.progress, gesture.velocity * 1000 / gesture.distance);
    if (expansion.current) expansion.current.currentTime = focusAnimationTime(gesture.progress);
  }
  function endFocusGesture(cancel = false, settle = true) {
    const gesture = focusGesture.current;
    if (!gesture) return;
    focusGesture.current = undefined; setDraggingFocus(false);
    const next = cancel ? gesture.wasFocused : !gesture.moved ? !gesture.wasFocused
      : gesture.progress + (performance.now()-gesture.lastAt < 100 ? gesture.velocity * 100/gesture.distance : 0) > .5;
    if (gesture.target.hasPointerCapture(gesture.pointerId)) gesture.target.releasePointerCapture(gesture.pointerId);
    if (!settle) return;
    if (next) {
      const before = container.current?.getBoundingClientRect();
      if (before) animateFocus(before);
    } else focusMap(false);
  }
  useEffect(() => {
    const cancel = () => endFocusGesture(true);
    const resize = () => {
      endFocusGesture(true, false);
      inlineGeometry.current = undefined;
      // The previous window's inline rectangle is no longer a drag target.
      // Return from the visible position; the next expansion measures home anew.
      if (focusState.current) focusMap(false);
      else if (expansion.current) {
        const before = container.current?.getBoundingClientRect();
        if (before) animateFocus(before);
      }
    };
    window.addEventListener('blur', cancel); window.addEventListener('resize', resize);
    return () => { window.removeEventListener('blur', cancel); window.removeEventListener('resize', resize); };
  }, []);
  useEffect(() => () => expansion.current?.cancel(), []);
  const previousInterruption = useRef(interruptionKey);
  // Finish the geometry transition before a map gesture, so pointer
  // coordinates match the camera. A quick return keeps its visible origin.
  const finishFocus = (event?: { target: EventTarget | null; key?: string }) => {
    if (focusGesture.current || event?.key === 'Escape' || event?.target instanceof Element && event.target.closest('.conversation-map-expand,.conversation-map-grip')) return;
    expansionSpring.set(1); expansion.current?.cancel(); expansion.current = undefined; setTransitioning(false);
  };
  const effectiveLegId = memory.sourceLegId !== scene.activeLegId ? scene.activeLegId : legId;
  const leg =
    scene.journey.legs.find((value) => value.id === effectiveLegId) ||
    scene.journey.legs.find((value) => value.id === scene.activeLegId) ||
    scene.journey.legs[0];
  const browseRoute = useMemo(() => ({ ...emptyRoute(), to: scene.place }), [scene.place]);
  const originalRoute = leg?.route || browseRoute;
  const route = originPreview || originalRoute;
  const currentConditions = sharedMapRouteSchema.safeParse(originPreview ? previewConditions : leg?.routeConditions);
  const canKeepRoute = !!route.from && !!route.to && currentConditions.success
    && !['idle', 'loading', 'error', 'missing_origin', 'missing_destination', 'outside'].includes(route.status);
  const previewRoute = useRef(route);
  const changedRoute = previewRoute.current !== route;
  const total = scene.journey.legs.reduce((sum, value) => sum + (value.route.distance?.totalM || 0), 0);
  const dwell = scene.journey.stops.reduce((sum, value) => sum + (value.dwellMinutes || 0), 0);
  const valid = scene.journey.legs.every((value) => value.route.status === 'ready');
  function cancelOrigin(clear = true) {
    routeRequest.current++; setPickingOrigin(false); setRoutePending(false); setSharing(false); setRouteIssue('');
    if (clear) { setOriginPreview(undefined); setPreviewConditions(undefined); }
  }
  useEffect(() => {
    cancelOrigin();
  }, [scene.id, scene.revision]);
  useEffect(() => {
    // Leaving the page cancels unfinished work, while a route already chosen
    // by the user stays beside this same message when they come back.
    cancelOrigin(false);
  }, [active, cancelled, interruptionKey]);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; routeRequest.current++; };
  }, []);
  useEffect(() => {
    const reset = () => {
      cancelOrigin(); memory.selected = undefined; memory.selection = undefined; memory.manual = true;
      setSelected(undefined); motionRequest.current++; engine.current?.cancelMotion();
      setExplaining(false); setPlaying(false); setProgress(undefined);
      if (focusState.current) focusMap(false);
    };
    viewResets.add(reset);
    return () => { viewResets.delete(reset); };
  }, [memory]);
  useEffect(() => {
    if (memory.sourceLegId !== scene.activeLegId) {
      memory.sourceLegId = scene.activeLegId;
      memory.legId = scene.activeLegId;
      setLegId(scene.activeLegId);
      setProgress(undefined);
      setPlaying(false);
    }
    if (scene.display && memory.display !== scene.display) {
      memory.display = scene.display;
      if (scene.display === 'compact' || !memory.manual || userCameraRequest) {
        memory.collapsed = scene.display === 'compact';
        if (focused) collapsedBeforeFocus.current = memory.collapsed;
        else setCollapsed(memory.collapsed);
      }
      if (memory.collapsed) {
        engine.current?.cancelMotion();
        setPlaying(false);
      }
    }
    if (userCameraRequest && scene.display !== 'compact') {
      memory.collapsed = false;
      if (focused) collapsedBeforeFocus.current = false;
      setCollapsed(false);
    }
  }, [scene.activeLegId, scene.display, memory, userCameraRequest, focused]);
  useEffect(() => {
    if (!focused) return;
    const previous = document.activeElement as HTMLElement | null;
    const siblings: HTMLElement[] = [];
    let node: HTMLElement | null = container.current;
    while (node?.parentElement) {
      for (const sibling of node.parentElement.children)
        if (sibling !== node && sibling instanceof HTMLElement) siblings.push(sibling);
      node = node.parentElement;
      if (node === document.body) break;
    }
    const old = siblings.map((value) => value.inert);
    siblings.forEach((value) => (value.inert = true));
    container.current
      ?.querySelector<HTMLButtonElement>('.conversation-map-expand')
      ?.focus({ preventScroll: true });
    return () => {
      siblings.forEach((value, index) => (value.inert = old[index]));
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [focused]);
  useEffect(() => {
    if (!ready || !engine.current || !route) return;
    const changed = prior.current.revision !== scene.revision;
    const requested = !!scene.cameraRequestId && memory.cameraRequestId !== scene.cameraRequestId;
    prior.current = { revision: scene.revision, intent: scene.cameraIntent };
    if (!allowCameraRequests) {
      memory.cameraRequestId = scene.cameraRequestId;
      return;
    }
    if ((!changed && !requested) || historical) return;
    if (requested && memory.manual && !scene.cameraUserRequested) {
      memory.cameraRequestId = scene.cameraRequestId;
      return;
    }
    if (!requested) {
      if (!memory.manual && scene.cameraIntent === 'route') engine.current.fitRoute(route);
      return;
    }
    memory.cameraRequestId = scene.cameraRequestId;
    setPlaying(false);
    setProgress(undefined);
    if (scene.cameraIntent === 'explain') {
      void explain();
    } else if (scene.cameraIntent === 'overview') {
      engine.current.overview();
      memory.manual = false;
    } else if (scene.cameraIntent === 'destination' && route.to) {
      engine.current.focusPlace(route.to);
      memory.manual = false;
    } else if (scene.cameraIntent === 'selection' && scene.focusPlaceId) {
      const current = engine.current,
        ticket = current.ownership.ticket();
      void window.anima
        .mapPlaces({ publicOnly: !!scene.storySetting })
        .then((places) => {
          const point = places.find((value) => value.id === scene.focusPlaceId);
          if (
            point &&
            engine.current === current &&
            current.ownership.accepts(ticket) &&
            prior.current.revision === scene.revision
          ) {
            current.focusPlace(point);
            memory.manual = false;
          }
        })
        .catch(() => {});
    } else if (requested || !memory.manual) engine.current.fitRoute(route);
  }, [
    ready,
    scene.revision,
    scene.cameraIntent,
    scene.cameraRequestId,
    scene.focusPlaceId,
    historical,
    route,
    memory,
    allowCameraRequests,
  ]);
  useEffect(() => {
    if (changedRoute) {
      previewRoute.current = route;
      setPlaying(false);
      setProgress(undefined);
      engine.current?.preview(undefined);
    }
  }, [route, changedRoute]);
  useEffect(() => {
    if (ready && !changedRoute) engine.current?.preview(progress === undefined ? undefined : progress / 100);
  }, [ready, progress, route, changedRoute]);
  useEffect(() => {
    if (ready) engine.current?.showEntrances(entrances);
  }, [ready, entrances]);
  useEffect(() => {
    if (ready)
      engine.current?.contextRoutes(
        scene.journey.legs.filter((value) => value.id !== leg?.id).map((value) => value.route),
      );
  }, [ready, scene, leg?.id]);
  useEffect(() => {
    if (cancelled || previousInterruption.current !== interruptionKey) {
      endFocusGesture(true);
      motionRequest.current++;
      engine.current?.cancelMotion();
      setPlaying(false);
      setExplaining(false);
    }
    previousInterruption.current = interruptionKey;
  }, [ready, cancelled, interruptionKey]);
  useEffect(() => {
    endFocusGesture(true);
    if (!active) {
      motionRequest.current++;
      engine.current?.cancelMotion();
      setPlaying(false); setExplaining(false);
      if (focusState.current) focusMap(false);
    }
  }, [active, scene.revision]);
  useEffect(() => {
    if (!active || !playing || progress === undefined || !route) return;
    const current = engine.current,
      ticket = current?.ownership.ticket();
    let frame = 0,
      last = performance.now();
    const duration = Math.max(5000, Math.min(18000, (route.distance?.totalM || 500) * 10));
    const tick = (now: number) => {
      if (!current || ticket === undefined || !current.ownership.accepts(ticket)) {
        setPlaying(false);
        return;
      }
      const step = ((now - last) / duration) * 100;
      last = now;
      setProgress((value) => {
        const next = Math.min(100, (value || 0) + step);
        if (next === 100) setPlaying(false);
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, playing, progress === undefined, route]);
  function takeControl() {
    motionRequest.current++;
    memory.manual = true;
    setExplaining(false);
    setPlaying(false);
  }
  function choose(point: MapPoint) {
    if (pickingOrigin) { void selectOrigin(point); return; }
    memory.selected = point;
    setSelected(point);
    const camera = scene.storySetting && engine.current?.snapshot();
    onSelect({ sceneId: scene.id, sceneRevision: scene.revision, kind: 'place', placeId: point.id,
      ...(camera && camera.center.length === 2 ? { mapView: { center: [camera.center[0], camera.center[1]], resolution: camera.resolution,
        rotation: camera.rotation, pitch: camera.pitch || 0 } } : {}) });
  }
  async function selectOrigin(point: MapPoint) {
    const destination = originalRoute.to;
    if (!destination || destination.kind === 'water' || scene.storySetting) return;
    if (point.kind === 'water') { setRouteIssue('Choose a starting point on shore. Water is view-only.'); return; }
    const request = ++routeRequest.current;
    const requestingEngine = engine.current, cameraTicket = requestingEngine?.ownership.ticket();
    setRoutePending(true); setRouteIssue(''); setOriginPreview(undefined); setPreviewConditions(undefined);
    try {
      const result = await window.anima.mapRoute({ from: mapPointEndpoint(point), to: mapPointEndpoint(destination),
        version: scene.source.version, avoidStairs: false, allowConditional: false });
      if (!alive.current || request !== routeRequest.current) return;
      setOriginPreview(result); setPickingOrigin(false); setSelected(undefined);
      const from = result.from && mapPointEndpoint(result.from), to = result.to && mapPointEndpoint(result.to);
      if (from && from.kind !== 'current' && to && to.kind !== 'current') setPreviewConditions({
        fromId: from.id, fromKind: from.kind, toId: to.id, toKind: to.kind, mapVersion: result.source.version,
        ...(result.profileRevision ? { profileRevision: result.profileRevision } : {}), avoidStairs: false, allowConditional: false });
      memory.manual = true;
      if (requestingEngine && requestingEngine === engine.current && cameraTicket !== undefined && requestingEngine.ownership.accepts(cameraTicket)) {
        requestingEngine.cancelMotion(); requestingEngine.fitRoute(result);
      }
    } catch (error) {
      if (alive.current && request === routeRequest.current) setRouteIssue(uiError(error) || 'No route was found. Try another starting point.');
    } finally { if (alive.current && request === routeRequest.current) setRoutePending(false); }
  }
  async function refreshOriginalRoute() {
    const from = originalRoute.from && mapPointEndpoint(originalRoute.from), to = originalRoute.to && mapPointEndpoint(originalRoute.to);
    if (!from || from.kind === 'current' || !to || to.kind === 'current' || routePending || sharing || scene.storySetting) return;
    const request = ++routeRequest.current;
    const requestingEngine = engine.current, cameraTicket = requestingEngine?.ownership.ticket();
    setRoutePending(true); setRouteIssue('');
    try {
      const overview = await window.anima.mapOverview();
      if (!alive.current || request !== routeRequest.current) return;
      const result = await window.anima.mapRoute({ from, to, version: overview.version,
        profileRevision: overview.profileRevision, avoidStairs: false, allowConditional: false });
      if (!alive.current || request !== routeRequest.current) return;
      setOriginPreview(result); setPickingOrigin(false); setSelected(undefined);
      setPreviewConditions({ fromId: from.id, fromKind: from.kind, toId: to.id, toKind: to.kind,
        mapVersion: result.source.version, ...(result.profileRevision ? { profileRevision: result.profileRevision } : {}),
        avoidStairs: false, allowConditional: false });
      memory.manual = true;
      if (requestingEngine && requestingEngine === engine.current && cameraTicket !== undefined && requestingEngine.ownership.accepts(cameraTicket)) {
        requestingEngine.cancelMotion(); requestingEngine.fitRoute(result);
      }
    } catch (error) {
      if (alive.current && request === routeRequest.current) setRouteIssue(uiError(error) || 'The route could not be refreshed. The previous route is preserved.');
    } finally { if (alive.current && request === routeRequest.current) setRoutePending(false); }
  }
  async function keepCurrentRoute() {
    const result = route, callback = onUseMapContext;
    if (!result?.from || !result.to || !callback || sharing || scene.storySetting
      || !canKeepRoute || !currentConditions.success) return;
    const conditions = currentConditions.data;
    const request = ++routeRequest.current; let selectionId: string | undefined;
    setSharing(true); setRouteIssue('');
    try {
      const handoff = await window.anima.shareMapContext({ enabled: true, route: conditions });
      selectionId = handoff.selectionId;
      if (!alive.current || request !== routeRequest.current) {
        if (selectionId) await window.anima.shareMapContext({ enabled: false, expectedSelectionId: selectionId });
        return;
      }
      if (!handoff.enabled || !handoff.expiresAt || !handoff.routeReference) throw new Error('This route was not added to the conversation. Try again.');
      const accepted = callback({ text: '', label: `${result.from.displayName} → ${result.to.displayName}`,
        expiresAt: handoff.expiresAt, selectionId, routeReference: handoff.routeReference,
        previewRoute: structuredClone(result), routeConditions: conditions,
        previewMemory: { ...(memory.camera ? { camera: structuredClone(memory.camera) } : {}), sharedSelectionId: selectionId, entered: true } });
      if (accepted === false) {
        if (selectionId) await window.anima.shareMapContext({ enabled: false, expectedSelectionId: selectionId });
        return;
      }
      focusMap(false); onContinue?.();
    } catch (error) {
      if (selectionId) void window.anima.shareMapContext({ enabled: false, expectedSelectionId: selectionId }).catch(() => {});
      if (alive.current && request === routeRequest.current) setRouteIssue(uiError(error) || 'This route was not added to the conversation. Try again.');
    } finally { if (alive.current && request === routeRequest.current) setSharing(false); }
  }
  async function explain() {
    if (!route || !engine.current) return;
    const request = ++motionRequest.current;
    setPlaying(false);
    setProgress(undefined);
    memory.manual = false;
    setExplaining(true);
    await engine.current.explainRoute(route);
    if (request === motionRequest.current) setExplaining(false);
  }
  function pickLeg(id: string) {
    const next = scene.journey.legs.find((value) => value.id === id);
    if (!next) return;
    cancelOrigin();
    setLegId(id);
    memory.legId = id;
    memory.manual = false;
    setSelected(undefined);
    setPlaying(false);
    setProgress(undefined);
    engine.current?.takeControl();
    engine.current?.route(next.route);
    engine.current?.select(next.route.to, next.route.from, true);
    engine.current?.fitRoute(next.route);
    onSelect({ sceneId: scene.id, sceneRevision: scene.revision, kind: 'leg', legId: id });
  }
  function collapse() {
    cancelOrigin(false);
    memory.manual = true;
    engine.current?.cancelMotion();
    setPlaying(false);
    memory.collapsed = !collapsed;
    setCollapsed(!collapsed);
  }
  return (
    <div ref={frame} className="conversation-map-frame" style={placeholderHeight !== undefined ? { height: placeholderHeight } : undefined}>
    <section
      ref={container}
      className="conversation-map"
      data-focused={focused}
      data-transitioning={transitioning}
      data-dragging={draggingFocus}
      data-collapsed={collapsed}
      role={focused ? 'dialog' : undefined}
      aria-modal={focused || undefined}
      aria-label="Map in the conversation"
      onPointerDownCapture={finishFocus} onWheelCapture={finishFocus}
      onKeyDown={(event) => {
        finishFocus(event);
        if (event.key === 'Escape' && (pickingOrigin || originPreview || routePending)) {
          event.preventDefault(); event.stopPropagation(); cancelOrigin(); return;
        }
        if (!focused) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          engine.current?.cancelMotion();
          if (focusGesture.current) endFocusGesture(true);
          else focusMap(false);
        }
        if (event.key === 'Tab') {
          const items = Array.from(
            container.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input:not(:disabled),summary,[tabindex="0"]',
            ) || [],
          ).filter((value) => value.offsetParent !== null);
          const first = items[0],
            last = items.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <button type="button" className="conversation-map-grip" aria-label={focused ? 'Pull down to collapse the map, or press Enter to return to the conversation' : 'Pull up to expand the map, or press Enter to focus it'}
        aria-expanded={focused} onPointerDown={beginFocusGesture} onPointerMove={moveFocusGesture}
        onPointerUp={event => { if (focusGesture.current?.pointerId === event.pointerId) endFocusGesture(); }}
        onPointerCancel={event => { if (focusGesture.current?.pointerId === event.pointerId) endFocusGesture(true); }}
        onLostPointerCapture={event => { if (focusGesture.current?.pointerId === event.pointerId) endFocusGesture(true); }}
        onClick={event => { if (event.detail === 0) focusMap(!focusState.current); }}><span aria-hidden="true" /></button>
      <header className="conversation-map-heading">
        <span className="conversation-map-heading-icon">
          <MapPinned size={19} />
        </span>
        <div>
          <strong>
            {scene.storySetting ? `Story setting · ${selected?.displayName || scene.storySetting.place?.label || scene.place?.displayName || engine.current?.data.manifest.label || 'Map'}` : originPreview
              ? `${originPreview.from?.displayName || 'Selected start'} → ${originPreview.to?.displayName || 'Destination'}` : scene.journey.stops.map((stop) => stop.label).join(' → ') ||
              scene.place?.displayName ||
              (engine.current?.data.manifest.label || 'Map')}
          </strong>
          <small>
            {historical ? 'Earlier route · ' : ''}
            {scene.storySetting ? '' : originPreview ? originPreview.distance ? `${distance(originPreview.distance.totalM)} · Preview this route` : originPreview.reason : !leg
              ? ''
              : valid
                ? `${distance(total)}${scene.journey.estimate ? ` · mapped paths about ${scene.journey.estimate.walkingMinutes.min}–${scene.journey.estimate.walkingMinutes.max} min` : ''}${dwell ? ` · stops ${dwell} min` : ''}`
                : 'Some route segments remain uncertain'}
          </small>
        </div>
        <button
          ref={expandButton}
          className="conversation-map-expand"
          aria-label={focused ? 'Back to chat' : 'Focus the map'}
          onClick={() => {
            focusMap(!focused);
          }}
        >
          {focused ? <X size={18} /> : <Expand size={17} />}
        </button>
        {!focused && (
          <button aria-label={collapsed ? 'Expand conversation map' : 'Collapse conversation map'} onClick={collapse}>
            {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
        )}
      </header>
      <div className="conversation-map-canvas" hidden={collapsed}>
            {surfaceEntered && (
              <MapSurface
                initialRoute={route}
                inline
                publicOnly={!!scene.storySetting}
                memory={memory}
                onWindowClose={() => {}}
                onClose={() => focusMap(false)}
                onChoose={choose}
                onTakeControl={takeControl}
                onEngine={(value) => {
                  engine.current = value;
                  setReady(!!value);
                }}
              />
            )}
      </div>
      {!collapsed && (
        <>
          {!!leg && !originPreview && (
            <div className="conversation-map-journey" aria-label="Journey stop order">
              {scene.journey.stops.map((stop, index) => (
                <span key={stop.id} className="conversation-map-stop">
                  <button
                    aria-label={`View stop ${index + 1}: ${stop.label}`}
                    aria-pressed={leg?.toStopId === stop.id || (index === 0 && leg === scene.journey.legs[0])}
                    onClick={() => {
                      const target = scene.journey.legs[Math.max(0, index - 1)];
                      if (target) pickLeg(target.id);
                    }}
                  >
                    <i>{index + 1}</i>
                    {stop.label}
                    {!!stop.dwellMinutes && <small>{stop.dwellMinutes} min</small>}
                  </button>
                  {index < scene.journey.legs.length && (
                    <button
                      className="conversation-map-leg"
                      aria-label={`View the leg from ${stop.label} to ${scene.journey.stops[index + 1]?.label}`}
                      aria-pressed={leg?.id === scene.journey.legs[index].id}
                      onClick={() => pickLeg(scene.journey.legs[index].id)}
                    >
                      {scene.journey.legs[index].route.distance
                        ? distance(scene.journey.legs[index].route.distance!.totalM)
                        : 'Unknown'}{' '}
                      →
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          <div className="conversation-map-caption">
            <div className="conversation-map-route-copy">
              {pickingOrigin ? <strong>Choose a start on the map, or search for a place</strong> : selected ? (
                <strong>About “{selected.displayName}”</strong>
              ) : leg || originPreview ? (
                <span className="conversation-map-route-line">
                  {route.from?.displayName} <span aria-hidden="true">→</span> {route.to?.displayName}
                  {route.distance && <span className="conversation-map-distance">{distance(route.distance.totalM)}</span>}
                </span>
              ) : (
                <span>{scene.place?.displayName || engine.current?.data.manifest.label || 'Map'}</span>
              )}
              <small>
                {scene.storySetting ? '' : routePending ? 'Finding a route from here…' : !leg && !originPreview
                  ? ''
                  : route.status !== 'ready'
                    ? route.reason
                    : routeHasUnverifiedPassages(route)
                      ? 'Some passages are unconfirmed; this is a conditional preview'
                      : route.distance?.connectorM
                        ? 'Dashed lines are estimated connections; confirm the entrance nearby'
                        : 'Along the mapped walking paths'}
              </small>
            </div>
            <div className="conversation-map-actions">
            {!scene.storySetting && onUseMapContext && originalRoute.to && originalRoute.to.kind !== 'water' && <div className="conversation-map-handoff-actions">
              {canKeepRoute && <button className="conversation-map-handoff" disabled={sharing || routePending} onClick={() => void keepCurrentRoute()}><MapPinned size={16} aria-hidden="true" />{sharing ? 'Adding…' : route.status === 'ready' ? 'Bring this route to the conversation' : 'Bring these places to the conversation'}</button>}
              {!currentConditions.success && originalRoute.from && <button className="conversation-map-handoff" disabled={!ready || routePending || sharing} onClick={() => void refreshOriginalRoute()}>{routePending ? 'Refreshing the route…' : 'Refresh this route'}</button>}
              {!pickingOrigin && <button className={!route.from ? 'conversation-map-handoff' : undefined} disabled={!ready || routePending || sharing} onClick={() => {
                cancelOrigin(); setPickingOrigin(true); setSelected(undefined); memory.manual = true; engine.current?.takeControl();
                if (collapsed) { memory.collapsed = false; setCollapsed(false); }
                container.current?.querySelector<HTMLInputElement>('.campus-v2-search input')?.focus({ preventScroll: true });
              }}>{originalRoute.from || originPreview ? 'Change start' : 'Choose start'}</button>}
              {(pickingOrigin || originPreview || routePending) && <button disabled={sharing} onClick={() => cancelOrigin()}>Put aside</button>}
            </div>}
            {((!!leg || !!originPreview) && !scene.storySetting) && (
              <div className="conversation-map-camera-actions" role="group" aria-label="Explore this route">
                <button
                  disabled={!ready || route.status !== 'ready'}
                  onClick={() => { if (explaining) { engine.current?.cancelMotion(); takeControl(); } else void explain(); }}
                >
                  <Route size={15} />
                  {explaining ? 'Stop route tour' : 'Tour this route'}
                </button>
                <button
                  disabled={!ready || route.status !== 'ready'}
                  aria-label={playing ? 'Pause route preview' : 'Play route preview'}
                  onClick={() => {
                    memory.manual = true;
                    engine.current?.cancelMotion();
                    if (progress === undefined || progress === 100) setProgress(0);
                    setPlaying(!playing);
                  }}
                >
                  {playing ? <Pause size={15} /> : <Play size={15} />}
                  {playing ? 'Pause' : 'Preview'}
                </button>
                <button
                  aria-label="Return to this route"
                  disabled={!ready}
                  onClick={() => {
                    memory.manual = false;
                    engine.current?.fitRoute(route);
                  }}
                >
                  Return to route
                </button>
              </div>
            )}
            {scene.storySetting && selected && <button onClick={() => { choose(selected); focusMap(false); onContinue?.(); }}>Continue writing this scene</button>}
            {!leg && selected && !scene.storySetting && !pickingOrigin && <button onClick={() => choose(selected)}>Discuss this place</button>}
            </div>
          </div>
          {routeIssue && <p className="conversation-map-issue" role="status">{routeIssue}</p>}
          {(!!leg || !!originPreview) && !scene.storySetting && (
            <details className="conversation-map-evidence">
              <summary>Entrances and route sources</summary>
              <div>
                <p>
                  {route.from?.displayName}: {route.originEntrance?.name || 'Entrance unknown'}
                  <br />
                  {route.to?.displayName}: {route.destinationEntrance?.name || 'Entrance unknown'}
                </p>
                {route.warnings.map((warning, index) => (
                  <p key={index}>{warning}</p>
                ))}
                <p>
                  Map source: {scene.source.sourceDate?.slice(0, 10) || 'See map sources'}.
                  {scene.journey.estimate?.estimatedAccessM ? 'This time covers only mapped paths. Allow extra time for entrance access, going inside and local detours.' : ''}
                </p>
                <button
                  disabled={!ready}
                  onClick={() => {
                    setEntrances(!entrances);
                    engine.current?.showEntrances(!entrances);
                  }}
                >
                  {entrances ? 'Hide entrance markers' : 'Show mapped entrances'}
                </button>
              </div>
            </details>
          )}
          {progress !== undefined && (
            <div className="conversation-map-preview">
              <span>Route preview · not your current location</span>
              <input
                aria-label="Journey preview progress"
                type="range"
                min="0"
                max="100"
                step="0.1"
                value={progress}
                onChange={(event) => {
                  memory.manual = true;
                  setPlaying(false);
                  setProgress(Number(event.target.value));
                }}
              />
              <button
                onClick={() => {
                  setPlaying(false);
                  setProgress(undefined);
                }}
              >
                End
              </button>
            </div>
          )}
          {focused && (
            <button
              className="conversation-map-continue"
              onClick={() => {
                focusMap(false);
                onContinue?.();
              }}
            >
              Back to chat
            </button>
          )}
        </>
      )}
    </section>
    </div>
  );
}
