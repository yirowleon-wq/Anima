import { createHash, randomUUID } from 'node:crypto';
import * as z from 'zod';
import { HarnessError, type ScopeHandle, type WorkRecord } from '../../shared/harness';
import type { ImageAttachment } from '../../shared/types';
import type { LocationStatusResult, MapRouteQuery } from '../../shared/map-v2';
import { routeHasUnverifiedPassages } from '../../shared/map-v2';
import type { CampusMapAdapter } from '../mapService';
import type { CampusReferenceAdapter, ImageCrop } from '../capabilities/campus-reference';
import type { PolicyKernel } from './policy';
import type { WorkService } from './work';
import { projectMapRoute } from './map-model-view';
import { spatialBindingSchema, spatialSourceProofSchema, type SpatialBinding, type SpatialSourceProof } from '../../shared/spatial-source';
import { resolveSourceQuote } from './source-quote';
import { sharedMapRouteSchema, mapRouteReferenceSchema, type SharedMapRoute, type MapRouteReference } from '../../shared/map-context';

const id = z.string().min(1).max(160);
export const spatialInput = z.object({
  fromId: id.optional(), toId: id,
  originKind: z.enum(['given_places', 'user_statement', 'shared_map_selection', 'device_observation']).default('given_places')
    .describe('given_places includes conditional comparisons and saved place bindings. user_statement attaches this turn’s actual location words; mentioning a saved start does not place the person there. shared_map_selection and device_observation use the current native shared selection.'),
  role: z.string().max(50).optional(), bindingId: id.optional(), source: z.object({ eventId: id, quote: z.string().min(1).max(2000) }).strict().optional(),
  mode: z.enum(['walk', 'bike']).default('walk'), avoidStairs: z.boolean().default(false), arrivalBy: z.string().datetime({ offset: true }).optional(),
  allowConditional: z.boolean().optional(), originAccessId: id.optional(), destinationAccessId: id.optional(),
  departAt: z.string().datetime({ offset: true }).optional(), mapVersion: z.string().min(1).max(160).optional(),
}).strict();
export const spaceControlInput = z.object({
  operation: z.enum(['bind_role', 'alias', 'crosswalk', 'read', 'remove']), role: z.string().min(1).max(50).optional(),
  targetKind: z.enum(['public_place', 'shared_map_selection']).default('public_place')
    .describe('When saving a binding, public_place uses the public map placeId; shared_map_selection uses the current native selection, and any supplied placeId must match it. Default to the public place without applying a personal overlay merely because IDs match. read and remove retain the original configuration identity.'),
  bindingId: id.optional(), expectedRevision: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(50).optional(),
  placeId: id.optional(), alias: z.string().min(1).max(80).optional(), referenceId: id.optional(),
  source: z.object({ eventId: id, quote: z.string().min(1).max(2000) }).strict().optional(),
}).strict();
/** Internal preparation receipt. Only identity is supplied to the delegation
 * review; the endpoint and scope binding never become model arguments. */
export interface SpaceControlTarget {
  scopeId: string;
  requestSha256: string;
  endpoint: SpatialBinding['endpoint'];
  identity: { targetKind: 'public_place' | 'shared_map_selection' | 'existing_binding'; personal: boolean;
    placeId?: string; selectionId?: string; bindingId?: string; revision?: number; status?: string };
}
export interface VisualObservation { id: string; toolCallId?: string; image: ImageAttachment; hash: string; version: string; sourceId: string; source: unknown; crop: ImageCrop | null; scopeId: string; epoch: number }
export class SpatialService {
  reference?: CampusReferenceAdapter;
  private shared?: { id: string; endpoint?: SpatialBinding['endpoint']; device?: LocationStatusResult; epoch: number; expiresAt: number;
    route?: { conditions: SharedMapRoute; destination: SpatialBinding['endpoint'] } };
  private visuals = new Map<string, VisualObservation>();
  private visualHolders = new Map<string, Set<string>>();
  constructor(readonly policy: PolicyKernel, readonly work: WorkService, private map: () => CampusMapAdapter | undefined) {
    policy.onBarrier(() => { this.shared = undefined; this.visuals.clear(); this.visualHolders.clear(); });
  }
  // Pending model deliveries keep their owner entry; every use still goes
  // through the original visual() scope check.
  private trimVisuals(keepId?: string) {
    while (this.visuals.size > 4) {
      const oldest = [...this.visuals.keys()].find(id => id !== keepId && !this.visualHolders.has(id));
      if (!oldest) break;
      this.visuals.delete(oldest);
    }
  }
  available(capability?: string) {
    return capability === 'map.relations' ? !!this.map() : !!this.reference?.overview().connected;
  }
  /** Called only by a direct host UI control. Location sharing is distinct
   * from turning on the local map's coordinate display. */
  share(input: { enabled: boolean; fromId?: string; device?: LocationStatusResult; route?: SharedMapRoute; expectedSelectionId?: string }) {
    // A late native request can retire only the snapshot it created. It must
    // not clear a newer map handoff from another already-open view.
    if (!input.enabled && input.expectedSelectionId && this.shared?.id !== input.expectedSelectionId)
      return { ...this.sharedStatus(), coordinateEgress: false };
    const connection = this.map();
    let route: NonNullable<typeof this.shared>['route'];
    let graphOrigin: SpatialBinding['endpoint'] | undefined;
    if (input.enabled && input.route) {
      if (!connection || input.device) throw new HarnessError('map_route_selection', 'Choose both endpoints on the map before bringing this route into the conversation.');
      const conditions = sharedMapRouteSchema.parse(input.route), overview = connection.overview();
      if (conditions.mapVersion !== overview.version || conditions.profileRevision !== undefined && conditions.profileRevision !== overview.profileRevision)
        throw new HarnessError('map_route_changed', 'The map or places changed. Select again from the current route.');
      if (input.fromId && input.fromId !== conditions.fromId)
        throw new HarnessError('map_route_selection', 'This start does not match the route currently being viewed.');
      const preview = connection.route({ from: { kind: conditions.fromKind || 'place', id: conditions.fromId },
        to: { kind: conditions.toKind || 'place', id: conditions.toId }, version: conditions.mapVersion,
        profileRevision: overview.profileRevision, originAccessId: conditions.originAccessId, destinationAccessId: conditions.destinationAccessId,
        avoidStairs: conditions.avoidStairs, allowConditional: conditions.allowConditional });
      if (!preview.from || !preview.to) throw new HarnessError('map_route_selection', 'One route endpoint is no longer available. Choose it again.');
      if (conditions.fromKind === 'node') graphOrigin = { kind: 'public', pointId: preview.from.id };
      const personalDestination = conditions.toKind !== 'node' ? connection.capturePersonalPoint(conditions.toId) : undefined;
      const destination = personalDestination ? { kind: 'personal' as const, ...personalDestination }
        : conditions.toKind === 'node' ? { kind: 'public' as const, pointId: preview.to.id }
          : connection.publicView().point(conditions.toId) ? { kind: 'public' as const, pointId: connection.publicView().point(conditions.toId)!.id } : undefined;
      if (!destination) throw new HarnessError('map_route_selection', 'The route destination is no longer available. Choose it again.');
      route = { conditions: { ...conditions, ...(overview.profileRevision ? { profileRevision: overview.profileRevision } : {}) }, destination };
    }
    const fromId = route?.conditions.fromId || input.fromId;
    const personal = input.enabled && fromId && !graphOrigin ? connection?.capturePersonalPoint(fromId) : undefined;
    const publicPoint = input.enabled && fromId && !personal && !graphOrigin ? connection?.publicView().point(fromId) : undefined;
    if (route && !personal && !publicPoint && !graphOrigin) throw new HarnessError('map_route_selection', 'The route start is no longer available. Choose it again.');
    this.shared = input.enabled ? { id: randomUUID(),
      endpoint: graphOrigin || (personal ? { kind: 'personal', ...personal } : publicPoint ? { kind: 'public', pointId: publicPoint.id } : undefined),
      device: input.device, ...(route ? { route } : {}), epoch: this.policy.repo.epoch, expiresAt: Date.parse(this.policy.repo.clock.now()) + 120000 } : undefined;
    return { enabled: !!this.shared, expiresAt: this.shared ? new Date(this.shared.expiresAt).toISOString() : null, coordinateEgress: false,
      ...(this.shared ? { selectionId: this.shared.id } : {}),
      ...(this.shared?.route ? { routeReference: { selectionId: this.shared.id } } : {}) };
  }
  sharedStatus() {
    const value = this.shared;
    const enabled = !!value && value.epoch === this.policy.repo.epoch && value.expiresAt > Date.parse(this.policy.repo.clock.now());
    return { enabled, expiresAt: enabled ? new Date(value.expiresAt).toISOString() : null };
  }
  private currentSelection() {
    const selected = this.shared;
    return selected && selected.epoch === this.policy.repo.epoch
      && selected.expiresAt > Date.parse(this.policy.repo.clock.now()) ? selected : undefined;
  }
  private sharedRouteRecord(handle: ScopeHandle, raw: MapRouteReference) {
    const reference = mapRouteReferenceSchema.parse(raw), scope = this.policy.require(handle, 'map:read');
    const selected = this.currentSelection(), connection = this.map();
    if (!selected?.route || !selected.endpoint || selected.id !== reference.selectionId || !connection
      || scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.sources.includes('map:local'))
      throw new HarnessError('map_route_selection_expired', 'The shared route changed. Select the current route on the map again.');
    const conditions = selected.route.conditions, overview = connection.overview();
    if (conditions.mapVersion !== overview.version || conditions.profileRevision !== overview.profileRevision)
      throw new HarnessError('map_route_changed', 'The map or places changed; the old route was not continued.');
    const sources: SpatialSourceProof[] = [];
    for (const [endpoint, destination] of [[selected.endpoint, false], [selected.route.destination, true]] as const) {
      const source: SpatialSourceProof = { version: 1, origin: { kind: 'selection', id: selected.id, ...(destination ? { endpoint: 'destination' } : {}) } };
      if (endpoint.kind === 'personal') {
        const point = connection.readPersonalPoint(endpoint);
        if (!point) throw new HarnessError('map_route_changed', 'One route endpoint changed. Choose its current place again.');
        source.point = point.proof;
      }
      sources.push(source);
    }
    if (!this.sourcesCurrent(handle, sources)) throw new HarnessError('map_route_changed', 'A source supporting this route changed. Open it again.');
    const route = connection.route({ from: { kind: conditions.fromKind || 'place', id: conditions.fromId }, to: { kind: conditions.toKind || 'place', id: conditions.toId },
      version: conditions.mapVersion, profileRevision: conditions.profileRevision, originAccessId: conditions.originAccessId,
      destinationAccessId: conditions.destinationAccessId, avoidStairs: conditions.avoidStairs, allowConditional: conditions.allowConditional });
    return { reference, route, conditions, sources,
      meaning: 'These are the endpoints, entrances and route conditions the user indicated on the original map, reread at the current version. This is a route comparison, not evidence of departure, arrival or an accepted arrangement.' };
  }
  sharedRoute(handle: ScopeHandle, raw: MapRouteReference) {
    const selected = this.sharedRouteRecord(handle, raw);
    return { ...selected, route: projectMapRoute(selected.route) };
  }
  sharedRouteIdentity(handle: ScopeHandle, raw: MapRouteReference) {
    const selected = this.sharedRoute(handle, raw);
    return { origin: 'user_selected_route' as const, reference: selected.reference, conditions: selected.conditions,
      meaning: 'This UI reference identifies the map route and its endpoint conditions. It does not place the user at either end or authorize travel, location acquisition or calendar changes.' };
  }
  private bindingEndpoint(record: WorkRecord): SpatialBinding['endpoint'] | undefined {
    const parsed = spatialBindingSchema.safeParse(record.data.spatialBinding);
    if (parsed.success) return parsed.data.endpoint;
    // An older public binding can still identify its public place. It cannot
    // acquire a missing profile identity by following the current active one.
    if (record.data.spatialBinding !== undefined || typeof record.data.placeId !== 'string') return;
    const point = this.map()?.publicView().point(record.data.placeId);
    return point ? { kind: 'public', pointId: point.id } : undefined;
  }
  sourcesCurrent(handle: ScopeHandle, raw: unknown): boolean {
    const scope = this.policy.validate(handle);
    if (!Array.isArray(raw) || raw.length > 128) return false;
    if (!raw.length) return true;
    const connection = this.map();
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self'
      || !scope.sources.includes('map:local') || !scope.grants.includes('map:read') || !scope.grants.includes('evidence:read')) return false;
    for (const value of raw) {
      const parsed = spatialSourceProofSchema.safeParse(value);
      if (!parsed.success) return false;
      const proof = parsed.data;
      let endpoint: SpatialBinding['endpoint'] | undefined;
      if (proof.origin.kind === 'binding') {
        const record = this.policy.repo.spatialBindingVersion(handle, proof.origin.id, proof.origin.revision);
        if (!record
          || !this.policy.repo.spatialBindingBasisCurrent(handle, record.id, record.revision)) return false;
        endpoint = this.bindingEndpoint(record);
      } else {
        const selection = this.currentSelection();
        if (!selection || selection.id !== proof.origin.id) return false;
        if (selection.route) {
          const overview = connection?.overview(), conditions = selection.route.conditions;
          if (!overview || conditions.mapVersion !== overview.version || conditions.profileRevision !== overview.profileRevision) return false;
        }
        endpoint = proof.origin.endpoint === 'destination' ? selection.route?.destination : selection.endpoint;
      }
      if (!endpoint) return false;
      if (proof.point && (endpoint.kind !== 'personal' || proof.point.profileId !== endpoint.profileId
        || proof.point.pointId !== endpoint.pointId || !connection?.personalPointProofCurrent(proof.point))) return false;
    }
    return true;
  }
  private bindingView(record: WorkRecord) {
    const endpoint = this.bindingEndpoint(record);
    return { id: record.id, revision: record.revision, status: record.status, title: record.title,
      type: record.data.type, role: record.data.role, alias: record.data.alias,
      ...(endpoint?.kind === 'public' ? { placeId: endpoint.pointId } : {}),
      namespace: record.data.namespace, mapVersion: record.data.mapVersion,
      referenceId: record.data.referenceId, referenceNamespace: record.data.referenceNamespace,
      endpointKind: endpoint?.kind,
      routeOrigin: { capability: 'map.relations', arguments: { bindingId: record.id },
        sourceIds: ['work:self', 'map:local'], requiredGrants: ['evidence:read', 'map:read'],
        meaning: 'This is the exact saved start binding. Add a public destination toId to read a route. Personal names and positions may differ from the public map; an old map ID does not replace reading this start.' },
      spatialSources: [{ version: 1, origin: { kind: 'binding', id: record.id, revision: record.revision } } satisfies SpatialSourceProof] };
  }
  relation(handle: ScopeHandle, raw: unknown) {
    const scope = this.policy.require(handle, 'map:read');
    const input = spatialInput.parse(raw), connection = this.map(), now = this.policy.repo.clock.now();
    if (!connection) return { status: 'not_connected', reason: 'The map is not connected.' };
    if (input.arrivalBy && input.departAt && Date.parse(input.arrivalBy) < Date.parse(input.departAt)) throw new HarnessError('route_time_window', 'The desired arrival cannot precede departure.');
    let fromId = input.fromId;
    if ((input.role || input.bindingId || ['shared_map_selection', 'device_observation'].includes(input.originKind)) && (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self')) return { status: 'forbidden', reason: 'Personal places and device observations cannot be applied to another person or a hypothetical world. Explicit public places remain usable.' };
    const map = connection.publicView();
    let endpoint: SpatialBinding['endpoint'] | undefined;
    let sharedConditions: SharedMapRoute | undefined;
    let selectedRoute: ReturnType<SpatialService['sharedRouteRecord']> | undefined;
    const spatialSources: SpatialSourceProof[] = [];
    let originEvidence: Record<string, unknown> = { kind: input.originKind, userPresenceConfirmed: false };
    if (input.role || input.bindingId) {
      if (['shared_map_selection', 'device_observation'].includes(input.originKind)) throw new HarnessError('route_origin_conflict', 'The saved place binding differs from this map or device selection. Choose the start for this comparison.');
      const binding = this.policy.repo.spatialBindingRecords(handle, input.bindingId).find(record => !input.role
        || record.data.type === 'spatial_role' && record.data.role === input.role);
      if (!binding) return { status: 'unknown', reason: 'This personal place role has no binding and was not treated as the current location.' };
      if (!this.policy.repo.spatialBindingBasisCurrent(handle, binding.id, binding.revision))
        return { status: 'stale', reason: 'Support for this saved start changed. The old binding was not used for calculation.' };
      endpoint = this.bindingEndpoint(binding);
      if (!endpoint) return { status: 'stale', reason: 'The old start has no verifiable map identity. Choose the place for this comparison again.' };
      spatialSources.push({ version: 1, origin: { kind: 'binding', id: binding.id, revision: binding.revision } });
      originEvidence = { kind: 'accepted_place_binding', bindingKind: binding.data.type,
        ...(binding.data.role ? { role: binding.data.role } : {}), ...(binding.data.alias ? { alias: binding.data.alias } : {}), userPresenceConfirmed: false };
    }
    if (input.originKind === 'user_statement') {
      const event = input.source && this.policy.repo.evidence(handle, input.source.eventId);
      const source = event && resolveSourceQuote(event, input.source);
      if (!event || event.speaker !== 'user' || !source || !this.policy.repo.availableInferenceRanges(event).some(range => range.start <= source.start && range.end >= source.end)) throw new HarnessError('location_statement', 'A location statement needs currently readable original user words.');
      originEvidence = endpoint ? { ...originEvidence, statement: { at: event.receivedAt, sourceQuote: source.quote } }
        : { kind: 'user_statement', at: event.receivedAt, sourceQuote: source.quote, userPresenceConfirmed: 'statement_not_device_measurement' };
    }
    if (['shared_map_selection', 'device_observation'].includes(input.originKind)) {
      const shared = this.currentSelection();
      if (!shared) return { status: 'forbidden', reason: 'This map-sharing period ended. Explicitly supplied endpoints can still be compared.' };
      if (input.originKind === 'shared_map_selection') {
        endpoint = shared.endpoint;
        if (!endpoint) return { status: 'unknown', reason: 'This shared map has no selected start. Choose one for comparison.' };
        sharedConditions = shared.route?.conditions;
        if (shared.route && (input.toId === shared.route.conditions.toId || input.toId === shared.route.destination.pointId)) {
          selectedRoute = this.sharedRouteRecord(handle, { selectionId: shared.id });
          spatialSources.push(...selectedRoute.sources);
        } else spatialSources.push({ version: 1, origin: { kind: 'selection', id: shared.id } });
        originEvidence = { kind: 'user_selected_origin', userPresenceConfirmed: false };
      }
      else {
        const device = shared.device, fix = device?.fix;
        if (!fix || !['fresh', 'approximate'].includes(device.status) || Date.parse(now) - fix.timestamp > 120000) return { status: 'unknown', reason: 'The device has no sufficiently recent position. The user’s location remains unknown; compare conditionally from an explicit start.' };
        const candidates = connection.publicView().deviceCandidates(fix.coordinate, fix.accuracy);
        return { status: 'partial', device: { source: fix.source, label: fix.deviceLabel, observedAt: new Date(fix.timestamp).toISOString(), reportedAccuracyMeters: fix.accuracy },
          candidates: candidates.map(point => ({ id: point.id, label: point.displayName, namespace: 'osm-academic-v2' })),
          userPosition: 'not_established_by_device', originConnection: 'unconfirmed', coordinateEgress: false,
          reason: 'These describe only device-reported spatial relationships. They override no user location statement and prove no network access.' };
      }
    }
    let personal: ReturnType<CampusMapAdapter['readPersonalPoint']>;
    if (selectedRoute) fromId = selectedRoute.conditions.fromId;
    else if (endpoint?.kind === 'personal') {
      personal = connection.readPersonalPoint(endpoint);
      if (!personal) return { status: 'stale', reason: 'The chosen personal place changed or was removed. Another start was not substituted.' };
      fromId = personal.publicPointId || 'reference/personal-origin-' + personal.sha256;
      spatialSources[0].point = personal.proof;
    } else if (endpoint) fromId = sharedConditions?.fromKind === 'node' ? sharedConditions.fromId : endpoint.pointId;
    if (!fromId) return { status: 'unknown', destination: input.toId, reason: 'The start is missing. Destination facts or comparisons from explicitly supplied candidate starts remain possible.' };
    const given = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const avoidStairs = sharedConditions && !Object.hasOwn(given, 'avoidStairs') ? sharedConditions.avoidStairs : input.avoidStairs;
    const allowConditional = input.allowConditional ?? sharedConditions?.allowConditional;
    const query: MapRouteQuery = {
      from: { kind: sharedConditions?.fromKind || 'place', id: fromId },
      to: { kind: selectedRoute?.conditions.toKind || 'place', id: selectedRoute?.conditions.toId || input.toId },
      avoidStairs, allowConditional, originAccessId: input.originAccessId ?? sharedConditions?.originAccessId,
      destinationAccessId: input.destinationAccessId ?? selectedRoute?.conditions.destinationAccessId,
      version: input.mapVersion || selectedRoute?.conditions.mapVersion,
      ...(selectedRoute?.conditions.profileRevision ? { profileRevision: selectedRoute.conditions.profileRevision } : {}),
    };
    const route = selectedRoute ? connection.route(query) : personal && !personal.publicPointId
      ? map.routeReferences(query, [{ id: fromId, name: personal.name, coordinate: personal.coordinate }]).route : map.route(query);
    if (personal?.publicPointId && route.from) route.from = { ...route.from, displayName: personal.name };
    if (!this.sourcesCurrent(handle, spatialSources)) throw new HarnessError('spatial_source_changed', 'Support for the selected start changed. Return to its current place.');
    const materialId = 'route-material:' + createHash('sha256').update(JSON.stringify({ query, mode: input.mode, routeStatus: route.status, mapVersion: route.source.version, spatialSources, originEvidence, departAt: input.departAt || null, arrivalBy: input.arrivalBy || null })).digest('hex');
    const summary = { namespace: 'osm-academic-v2', version: route.source.version, sourceDate: route.source.date,
      from: route.from ? { id: route.from.id, label: route.from.displayName } : null, to: route.to ? { id: route.to.id, label: route.to.displayName } : null,
      materialId, preparedAt: now, mapVersion: route.source.version, profileRevision: route.profileRevision || null,
      endpoints: { fromId: route.from?.id || fromId, toId: route.to?.id || input.toId },
      routeConditions: { avoidStairs, allowConditional: !!allowConditional, originAccessId: query.originAccessId || null, destinationAccessId: query.destinationAccessId || null },
      originQuality: { kind: originEvidence.kind, establishesCurrentUserPosition: originEvidence.userPresenceConfirmed === 'statement_not_device_measurement' ? 'user_report_only' : false, requiresRecheck: ['shared_map_selection', 'device_observation'].includes(input.originKind), observedAt: originEvidence.at || null },
      cameraChanged: false, preparationOnly: true,
      originEvidence, spatialSources, coordinateEgress: false, route: projectMapRoute(route), warnings: route.warnings, unknown: ['Indoor time to reach an entrance', 'Queues, parking and current gate access', 'The person’s actual speed and stops'] };
    if (route.status !== 'ready') {
      const conditionalRoutes = route.status === 'unknown_entrance' && input.mode === 'walk' ? (route.conditionalOrigins || []).map(candidate => ({
        from: { id: candidate.id, label: candidate.label },
        originEntrance: candidate.originEntrance, destinationEntrance: candidate.destinationEntrance,
        networkMeters: candidate.networkM, estimateMinutes: candidate.minutes,
        condition: candidate.condition, originConnection: candidate.connection, guaranteedOnTime: false,
      })) : [];
      return { ...summary, status: route.status === 'same' ? 'fresh' : input.mapVersion && input.mapVersion !== route.source.version ? 'stale' : route.status === 'error' ? 'failed' : 'partial', routeStatus: route.status, reason: route.reason,
        conditionalRoutes, estimateBasis: route.status === 'same' ? 'The endpoints are the same map place. Indoor movement and the person’s actual position remain unknown.' : conditionalRoutes.length ? 'Candidate buildings are independent nearby places. Each segment starts at that candidate’s own recorded connected entrance, not an exit from the original place or the person’s current position. Access to the candidate entrance, indoor movement and current conditions remain unknown. Known segments cannot guarantee on-time arrival for the whole journey.' : 'The complete route is unconfirmed. Missing segments cannot be used to calculate arrival.' };
    }
    const meters = route.distance!.networkM, minutes = { min: Math.ceil(meters / 90), max: Math.ceil(meters / 48) };
    const estimatedAccess=route.distance!.connectorM>0;
    const conditional = routeHasUnverifiedPassages(route), departure = input.departAt || now, timingAvailable = input.mode === 'walk' && !estimatedAccess && !conditional;
    return { ...summary, status: estimatedAccess || conditional || input.mode !== 'walk' ? 'partial' : 'fresh', routeStatus: route.status, networkMeters: meters, connectorMeters:route.distance!.connectorM,totalEstimatedMeters:route.distance!.totalM,
      estimateMinutes: input.mode === 'walk' ? minutes : null, mode: input.mode,
      estimateCoverage: input.mode === 'walk' ? { part: 'recorded_network_only', meters,
        includesEstimatedAccess: false, includesIndoorTravel: false, metersPerMinute: { min: 48, max: 90 } } : null,
      estimateBasis: input.mode === 'walk' ? estimatedAccess
        ? `estimateMinutes uses only ${Math.round(meters)} m of recorded road at a conditional 48–90 m/min. Another ${Math.round(route.distance!.connectorM)} m of estimated endpoint access is excluded from that interval. Actual doors, indoor movement and current conditions remain unknown; no whole-journey arrival time is established.`
        : 'estimateMinutes covers only recorded entrance-to-entrance roads at a conditional 48–90 m/min, not measured personal speed, and excludes indoor movement.'
        : 'Only a walking network is available. Cycling access and parking are unverified; a walking estimate cannot stand in for them.',
      departAt: departure, departureBasis: input.departAt ? 'explicit_proposed_departure' : 'query_time_only',
      arrivalWindow: timingAvailable ? { earliest: new Date(Date.parse(departure) + minutes.min * 60000).toISOString(), latestBeforeUnknownCosts: new Date(Date.parse(departure) + minutes.max * 60000).toISOString() } : null,
      latestDepartureBeforeUnknownCosts: timingAvailable && input.arrivalBy ? new Date(Date.parse(input.arrivalBy) - minutes.max * 60000).toISOString() : null,
      conditionalPassages: conditional,
      requestedArrivalBy: input.arrivalBy || null, guaranteedOnTime: false,
    };
  }
  controlTarget(handle: ScopeHandle, raw: unknown): SpaceControlTarget | undefined {
    const input = spaceControlInput.parse(raw);
    if (input.operation === 'read') return;
    const scope = this.policy.require(handle, 'work:write');
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self')
      throw new HarnessError('space_scope', 'Personal place bindings belong only to the person’s real-world scope.');
    this.policy.require(handle, 'map:read');
    let endpoint: SpatialBinding['endpoint'];
    let identity: SpaceControlTarget['identity'];
    if (input.operation === 'remove') {
      const old = input.bindingId ? this.policy.repo.spatialBindingRecords(handle, input.bindingId, true)[0] : undefined;
      const previous = old ? spatialBindingSchema.safeParse(old.data.spatialBinding) : undefined;
      const legacyPublic = old && old.data.spatialBinding === undefined && this.bindingEndpoint(old)?.kind === 'public'
        ? { kind: 'public' as const, pointId: String(old.data.placeId) } : undefined;
      const existing = previous?.success ? previous.data.endpoint : legacyPublic;
      if (!old || old.revision !== input.expectedRevision || !existing)
        throw new HarnessError('space_binding_changed', 'This place binding changed. Read the currently saved item first.');
      endpoint = existing;
      identity = { targetKind: 'existing_binding', bindingId: old.id, revision: old.revision, status: old.status,
        personal: endpoint.kind === 'personal', ...(endpoint.kind === 'public' ? { placeId: endpoint.pointId } : {}) };
    } else if (input.targetKind === 'shared_map_selection') {
      const selected = this.currentSelection();
      if (!selected?.endpoint) throw new HarnessError('space_selection_changed', 'This shared map has no current selection to save.');
      endpoint = selected.endpoint;
      if (input.placeId && input.placeId !== endpoint.pointId && this.map()?.publicView().point(input.placeId)?.id !== endpoint.pointId)
        throw new HarnessError('space_target_conflict', 'The place to save does not match this shared selection.');
      identity = { targetKind: 'shared_map_selection', selectionId: selected.id, personal: endpoint.kind === 'personal',
        ...(endpoint.kind === 'public' ? { placeId: endpoint.pointId } : {}) };
    } else {
      const point = input.placeId ? this.map()?.publicView().point(input.placeId) : undefined;
      if (!point) throw new HarnessError('space_source', 'No public map place has been selected for saving.');
      endpoint = { kind: 'public', pointId: point.id };
      identity = { targetKind: 'public_place', placeId: point.id, personal: false };
    }
    return { scopeId: handle.id, requestSha256: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
      endpoint: structuredClone(endpoint), identity };
  }
  control(handle: ScopeHandle, raw: unknown, prepared?: SpaceControlTarget) {
    const input = spaceControlInput.parse(raw);
    if (input.operation === 'read') {
      const records = this.policy.repo.spatialBindingRecords(handle, input.bindingId, !!input.bindingId)
        .filter(record => (!input.role || record.data.role === input.role) && (!input.alias || record.data.alias === input.alias))
        .filter(record => this.policy.repo.spatialBindingBasisCurrent(handle, record.id, record.revision) && this.bindingEndpoint(record));
      const offset = input.offset || 0, limit = input.limit || 50, page = records.slice(offset, offset + limit).map(record => this.bindingView(record));
      return { items: page.map(({ spatialSources: _host, ...record }) => record),
        spatialSources: page.flatMap(record => record.spatialSources),
        page: { offset, returned: page.length, totalMatches: records.length, nextOffset: offset + page.length < records.length ? offset + page.length : null } };
    }
    const scope = this.policy.require(handle, 'work:write');
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self') throw new HarnessError('space_scope', 'Personal place bindings belong only to the person’s real-world scope.');
    this.policy.require(handle, 'map:read');
    const connection = this.map(), event = input.source && this.policy.repo.evidence(handle, input.source.eventId);
    const source = event && resolveSourceQuote(event, input.source);
    if (!event || event.speaker !== 'user' || !source || !scope.currentEventIds.includes(event.id)
      || !this.policy.repo.availableInferenceRanges(event).some(range => range.start <= source.start && range.end >= source.end))
      throw new HarnessError('space_source', 'Changing a personal place needs explicit original words from this turn.');
    const current = this.controlTarget(handle, input), target = prepared || current;
    if (!target || !current || target.scopeId !== handle.id || target.requestSha256 !== current.requestSha256
      || JSON.stringify(target.identity) !== JSON.stringify(current.identity) || JSON.stringify(target.endpoint) !== JSON.stringify(current.endpoint))
      throw new HarnessError('space_target_changed', 'The place changed during checking. A different selection was not written.');
    const endpoint = target.endpoint;
    if (input.operation === 'remove') {
      const old = input.bindingId ? this.policy.repo.spatialBindingRecords(handle, input.bindingId, true)[0] : undefined;
      if (!old || old.revision !== input.expectedRevision)
        throw new HarnessError('space_binding_changed', 'This place binding changed. Read the currently saved item first.');
      const { quote, ...address } = source;
      const next: WorkRecord = { ...old, revision: old.revision + 1, status: 'cancelled', evidenceIds: [event.id],
        data: { ...old.data, spatialBinding: { version: 1, endpoint, basis: { ...address,
          quoteSha256: createHash('sha256').update(quote).digest('hex') } }, updatedAt: this.policy.repo.clock.now() } };
      this.policy.repo.saveSpatialWork(handle, next, old.revision);
      this.policy.repo.invalidate(old.id, 'personal_place_removed', this.policy.repo.spatialBindingGoalsToPreserve(handle, old.id));
      return { id: next.id, revision: next.revision, status: next.status,
        change: { fromRevision: old.revision, toRevision: next.revision, currentStatus: next.status } };
    }
    if (input.operation === 'bind_role' && !input.role || input.operation === 'alias' && !input.alias || input.operation === 'crosswalk' && (!input.referenceId || !this.reference?.has(input.referenceId))) throw new HarnessError('space_target', 'The place or alias is not completely specified.');
    const type = input.operation === 'bind_role' ? 'spatial_role' : input.operation === 'alias' ? 'spatial_alias' : 'spatial_crosswalk';
    const recordId = 'space:' + createHash('sha256').update(`${scope.principalId}:${scope.workspaceId}:${type}:${input.role || input.alias || input.referenceId}`).digest('hex');
    const old = this.policy.repo.spatialBindingRecords(handle, recordId, true)[0], now = this.policy.repo.clock.now();
    const { quote, ...address } = source;
    const data = { type, namespace: 'osm-academic-v2', placeId: endpoint.pointId, mapVersion: connection!.publicView().overview().version, role: input.role || null, alias: input.alias || null,
      referenceId: input.referenceId || null, referenceNamespace: input.referenceId ? this.reference!.namespace : null,
      spatialBinding: { version: 1, endpoint, basis: { ...address, quoteSha256: createHash('sha256').update(quote).digest('hex') } } satisfies SpatialBinding,
      publicDataChanged: false, recordedAt: old?.data.recordedAt || now, updatedAt: now };
    const result: WorkRecord = { id: recordId, kind: 'experience', ownerId: scope.principalId, workspaceId: scope.workspaceId,
      subjectId: scope.subjectId, worldId: scope.worldId, revision: (old?.revision || 0) + 1, status: 'active',
      title: input.alias || input.role || 'User-confirmed place binding', evidenceIds: [event.id],
      label: { purpose: scope.purposes[0], audience: scope.audience, retention: scope.retention, sensitivity: 'personal', infer: false }, data };
    this.policy.repo.saveSpatialWork(handle, result, old?.revision);
    if (old) this.policy.repo.invalidate(old.id, 'personal_place_changed', this.policy.repo.spatialBindingGoalsToPreserve(handle, old.id));
    return { ...this.bindingView(result), change: { fromRevision: old?.revision || null,
      toRevision: result.revision, currentStatus: result.status } };
  }
  observe(handle: ScopeHandle, crop?: ImageCrop, onVisualPrepared?: (id: string) => void) {
    const scope = this.policy.require(handle, 'map:read'), observed = this.reference?.image(crop);
    if (!observed) return { status: 'not_connected', reason: 'No actual overhead image source is connected. The structured map remains available.' };
    const hash = createHash('sha256').update(Buffer.from(observed.image.dataUrl.split(',')[1], 'base64')).digest('hex'), id = randomUUID();
    this.visuals.set(id, { id, image: observed.image, hash, version: observed.version, sourceId: 'map:local', source: observed.source, crop: observed.crop, scopeId: handle.id, epoch: scope.privacyEpoch });
    onVisualPrepared?.(id);
    this.trimVisuals(id);
    return { status: 'fresh', observationId: id, hash, version: observed.version, crop: observed.crop, source: observed.source,
      transport: 'prepared_for_next_model_request', meaning: 'Actual image pixels were acquired for the next model request. This record does not prove model understanding.' };
  }
  visual(handle: ScopeHandle, id: string) {
    const scope = this.policy.validate(handle), image = this.visuals.get(id);
    if (!image || image.scopeId !== handle.id || image.epoch !== scope.privacyEpoch) throw new HarnessError('image_observation_missing', 'No actual image observation exists in this scope. A viewing proof cannot be fabricated.');
    return image;
  }
  retainVisual(scope: ScopeHandle, id: string, runId: string): VisualObservation {
    const image = this.visual(scope, id);
    const holders = this.visualHolders.get(id) || new Set<string>();
    holders.add(runId); this.visualHolders.set(id, holders);
    return image;
  }
  releaseVisuals(runId: string) {
    for (const [id, holders] of this.visualHolders) {
      holders.delete(runId);
      if (!holders.size) this.visualHolders.delete(id);
    }
    this.trimVisuals();
  }
}
