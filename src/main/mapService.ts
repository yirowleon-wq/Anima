import { readFileSync, statSync, createHash, path } from './mapStorage';
import {
  emptyRoute,
  type MapOverview,
  type MapPoint,
  type MapGraph,
  type MapRouteQuery,
  type MapRouteResult,
  type MapEndpoint,
  type LocationStatusResult,
  type MapAccessCandidate,
} from '../shared/map-v2';
import { WalkingGraph, metersBetween, classifyFix, inBounds, allowsFootAccess } from '../shared/map-routing';
import { fromLocal, toLocal, estimateAccess } from './mapProfile';
import { rankMapPoints } from '../shared/map-names';
import type { PersonalMapPointSelector, PersonalMapPointProof } from '../shared/spatial-source';
import type { WorkoutMapFix, WorkoutMapMatch } from '../shared/map-workout';
import { CampusWorkoutMatcher } from './map-workout';
export type { PersonalMapPointSelector, PersonalMapPointProof } from '../shared/spatial-source';
import { restoreRecordedRoadDisplays, retainBridgeStatusConditions, retainPublishedFootRestrictions, retainPublishedPlaceAccessConditions, retainUnverifiedOfficialCorrespondences, routeConditionWarning, qualifyUndergroundStations } from '../shared/map-v3';

/** Host-only identities. They grant neither profile access nor model egress. */
export interface PersonalMapPointRead {
  selector: PersonalMapPointSelector;
  name: string; coordinate: [number, number]; mapVersion: string; sha256: string;
  publicPointId?: string;
  proof: PersonalMapPointProof;
}
const unavailablePersonalMapRead = (error: unknown) => error instanceof SyntaxError
  || !!error && typeof error === 'object' && 'code' in error
    && ['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM'].includes(String(error.code));

export class CampusMapAdapter {
  private manifest: MapOverview;
  private points: MapPoint[];
  private byId: Map<string, MapPoint>;
  walking: WalkingGraph;
  private cache = new Map<string, MapRouteResult>();
  private publicPoints: MapPoint[] = [];
  private redirects: Record<string, string> = {};
  private official: Record<string, { id: string }> = {};
  private profileSignature = '';
  private originalReferences:Record<string,number[]>={};
  private baseGraph:MapGraph={version:'',nodes:[],edges:[]};
  private geography:any={features:[]};
  private sharedFacts:any;
  private publicAdapter?:CampusMapAdapter;
  private ephemeralDepth=0;
  private dataStamp=0;
  private displayGeography:object={type:'FeatureCollection',features:[]};
  private sports:object={type:'FeatureCollection',features:[]};
  private workoutMatcher?: { graph:MapGraph; stamp:number; matcher:CampusWorkoutMatcher };
  constructor(private directory: string, private options: { profileDirectory?: string; profileId?: string } = {}) {
    const read = (name: string) => JSON.parse(readFileSync(path.join(directory, name), 'utf8'));
    this.points = [];
    this.manifest = {
      schemaVersion: 'campus-map/v2',
      version: 'unavailable',
      sourceDate: '',
      acquiredAt: '',
      bounds: [-.0035, -.003, .0035, .003],
      campusBounds: [-.0033, -.0027, .0033, .0027],
      label: 'Campus map unavailable',
      crs: 'EPSG:4326',
      coordinateOrder: 'longitude, latitude',
      renderProjection: 'EPSG:3857',
      distance: 'meters',
      license: 'No data loaded',
      attribution: 'No data loaded',
      source: '',
      copyright: '',
      buildings: 0,
      selectable: 0,
      entrances: 0,
      connectedEntrances: 0,
      routableBuildings: 0,
      nodes: 0,
      edges: 0,
      features: 0,
      rejected: {},
      limitations: [],
    };
    let walking: WalkingGraph | undefined;
    try {
      const manifest: MapOverview = read('manifest.json');
      if (manifest.schemaVersion !== 'campus-map/v2') throw new Error('incompatible');
      this.manifest = { ...manifest, dataStatus: 'ready' };
      for(const [name,expected] of Object.entries(manifest.componentHashes||{})){
        if(!/^[a-z-]+\.(json|geojson)$/.test(name))throw new Error('Invalid map component name');
        if(createHash('sha256').update(readFileSync(path.join(directory,name))).digest('hex')!==expected)throw new Error('Map components changed during load');
      }
      this.points = read('places.json');
      try {
        const facts = retainUnverifiedOfficialCorrespondences(read('shared-facts.json'));
        if (facts.version !== manifest.version) throw new Error('Shared fact version mismatch');
        this.redirects = facts.legacyPlaceRedirects || {};
        this.official = facts.officialToCanonical || {};
        this.originalReferences=facts.originalLocatorReferences||{};this.sharedFacts=facts;
        this.geography=read('geography.geojson');
        const display=read('display-geography.geojson');this.displayGeography=display;
        // Parent relationships belong to the imported data; never infer them from source-specific IDs.
        this.sports=read('sports-details.geojson');
      } catch (error) {
        if (manifest.implementation === 'campus-map/v3') throw error;
      }
      if (
        !Array.isArray(this.points) ||
        this.points.some(
          (p) =>
            !p ||
            typeof p.id !== 'string' ||
            typeof p.displayName !== 'string' ||
            !Array.isArray(p.coordinate) ||
            p.coordinate.length !== 2 ||
            !p.coordinate.every(Number.isFinite) ||
            !Array.isArray(p.bounds) ||
            p.bounds.length !== 4 ||
            !p.bounds.every(Number.isFinite) ||
            !Array.isArray(p.entrances),
        )
      ) {
        this.points = [];
        throw new Error('places');
      }
      this.points=retainPublishedPlaceAccessConditions(this.points);
      const recordedGraph: MapGraph = read('network.json');
      const qualifiedGraph = qualifyUndergroundStations(this.points,retainPublishedFootRestrictions(retainBridgeStatusConditions(recordedGraph,this.geography)),this.geography,this.displayGeography as {features:any[]},this.sharedFacts?.fidelityObservations?.undergroundStations||[]);
      const supplementIds=new Set<string>((this.sharedFacts?.buildingSupplement?.members||[]).map((member:{id:string})=>member.id));
      const missingAccess=new Set(this.points.filter(point=>point.undergroundStation||supplementIds.has(point.id)&&!point.accessCandidates?.length&&!point.accessReviewBasis).map(point=>point.id));
      const graph=estimateAccess(this.points,qualifiedGraph,this.geography,missingAccess,'public');
      if(missingAccess.size)this.manifest={...this.manifest,nodes:graph.nodes.length,edges:graph.edges.length,
        entrances:this.points.reduce((n,p)=>n+p.entrances.length,0),connectedEntrances:this.points.reduce((n,p)=>n+p.entrances.filter(e=>e.connected).length,0),
        routableBuildings:this.points.filter(p=>p.kind==='building'&&p.accessCandidates?.length).length,
        estimatedAccessCandidates:this.points.reduce((n,p)=>n+(p.accessCandidates||[]).filter(a=>a.kind==='estimate').length,0)};
      this.baseGraph=graph;
      if (graph.version !== this.manifest.version) throw new Error('version');
      walking = new WalkingGraph(graph);
      if (manifest.implementation === 'campus-map/v3')
        this.displayGeography=restoreRecordedRoadDisplays(this.displayGeography as {features:any[]},graph);
    } catch {
      this.manifest = {
        ...this.manifest,
        dataStatus: this.points.length ? 'partial' : 'error',
        dataError: 'The route network did not load completely. You can browse the loaded map and continue the conversation.',
      };
    }
    this.byId = new Map(this.points.map((p) => [p.id, p]));
    this.publicPoints = structuredClone(this.points);
    this.walking = walking || new WalkingGraph({ version: this.manifest.version, nodes: [], edges: [] });
    try{this.dataStamp=statSync(path.join(directory,'manifest.json')).mtimeMs;}catch{}
    this.refreshProfile();
  }
  private refreshData(){
    if(this.ephemeralDepth)return;
    let stamp:number;try{stamp=statSync(path.join(this.directory,'manifest.json')).mtimeMs;}catch{this.manifest.dataStatus=this.points.length?'partial':'error';this.manifest.dataError=this.points.length?'The shared map source is temporarily unreadable. The loaded view remains; routing is paused.':'The shared map source is unreadable. Check the map data and reload.';return;}
    if(stamp===this.dataStamp)return;
    const next=new CampusMapAdapter(this.directory,this.options);
    if(next.manifest.dataStatus!=='ready'){this.manifest.dataStatus=this.points.length?'partial':'error';this.manifest.dataError=this.points.length?'The map is updating or its files are inconsistent. The loaded view remains; try again shortly.':'The shared map did not load completely. Check its data and reload.';return;}
    this.manifest=next.manifest;this.points=next.points;this.byId=next.byId;this.walking=next.walking;this.publicPoints=next.publicPoints;this.redirects=next.redirects;this.official=next.official;this.originalReferences=next.originalReferences;this.baseGraph=next.baseGraph;this.geography=next.geography;this.displayGeography=next.displayGeography;this.sports=next.sports;this.sharedFacts=next.sharedFacts;this.profileSignature=next.profileSignature;this.dataStamp=stamp;this.cache.clear();this.publicAdapter=undefined;
  }
  private canonical(id: string) { return this.redirects[id] || this.official[id]?.id || id; }
  /** Only main supplies the explicitly connected local profile directory.
   * Tests and standalone adapters default to public data, without private IO. */
  private refreshProfile() {
    if(this.ephemeralDepth)return;this.refreshData();
    if (!this.options.profileDirectory) return;
    try {
      const root = this.options.profileDirectory;
      const config = JSON.parse(readFileSync(path.join(root, 'profiles/config.json'), 'utf8'));
      if(this.options.profileId)config.active=this.options.profileId;
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(config.active)) throw new Error('Invalid profile id');
      const raw = readFileSync(path.join(root, 'profiles', config.active + '.json'));
      const revision = createHash('sha256').update(raw).digest('hex').slice(0,16);
      const signature = config.active + ':' + revision;
      if (signature === this.profileSignature) return;
      const profile = JSON.parse(raw.toString('utf8'));
      this.points = structuredClone(this.publicPoints);
      this.byId = new Map(this.points.map(p => [p.id,p]));
      const moved=new Set<string>();
      for (const [id, value] of Object.entries(profile.records || {})) {
        const record = value as { name?: string; note?: string; aliases?: string[];e_m?:number;n_m?:number };
        let p = this.byId.get(this.canonical(id));
        if(typeof record.name!=='string')continue;
        if(!p&&id.startsWith('u-')&&Number.isFinite(record.e_m)&&Number.isFinite(record.n_m)){
          const c=fromLocal(record.e_m!,record.n_m!);p={id,displayName:record.name,aliases:[],kind:'landmark',coordinate:c,bounds:[...c,...c],entrances:[],accessCandidates:[],source:{url:'local-personal-profile'},geometryStatus:'reference-point'};this.points.push(p);this.byId.set(id,p);moved.add(id);
        }
        if(!p)continue;
        p.aliases = [...new Set([p.displayName, ...p.aliases, ...(record.aliases || [])])];
        p.displayName = record.name.slice(0,160); p.personal = {basis:'user',note:record.note?.slice(0,6000),roles:[]};
        if(Number.isFinite(record.e_m)&&Number.isFinite(record.n_m)){
          const baseline=this.originalReferences[id]||toLocal(p.coordinate);
          if(Math.hypot(record.e_m!-baseline[0],record.n_m!-baseline[1])>.2){p.coordinate=fromLocal(record.e_m!,record.n_m!);p.personal.referencePoint=true;moved.add(p.id);if(p.roadReference){delete p.roadReference;p.kind='landmark';}if(p.geometryStatus==='reference-point')p.bounds=[...p.coordinate,...p.coordinate];}
        }
      }
      for (const [roleKey,value] of Object.entries(profile.roles || {})) {
        const role = value as { place_id?: string; label?: string };
        const p = role.place_id && this.byId.get(this.canonical(role.place_id));
        if (!p || !role.label) continue;
        const label = role.label.slice(0,40);
        p.personal = {...p.personal,basis:'user',roles:[...(p.personal?.roles || []),label],roleKeys:[...(p.personal?.roleKeys||[]),roleKey]};
        p.aliases = [...new Set([...p.aliases,label])];
      }
      for(const p of this.points) if(p.personal?.roles?.length) p.displayName=p.personal.roles.join(' / ')+' · '+p.displayName;
      this.walking=new WalkingGraph(estimateAccess(this.points,this.baseGraph,this.geography,moved));
      for(const p of this.points)if(p.nearbyRoadReferences)p.nearbyRoadReferences=p.nearbyRoadReferences.flatMap(ref=>{
        const point=this.byId.get(ref.id);if(!point?.roadReference)return [];
        const straightM=metersBetween(p.coordinate,point.coordinate);return straightM<=150?[{id:ref.id,straightM}]:[];
      });
      this.manifest.profileRevision = revision;this.manifest.profileName = String(profile.profile_name || 'My places');
      this.profileSignature=signature;this.cache.clear();
    } catch {
      // Never keep a prior person's names after an unreadable profile switch.
      this.points=structuredClone(this.publicPoints);this.byId=new Map(this.points.map(p=>[p.id,p]));
      this.walking=new WalkingGraph(this.baseGraph);
      this.manifest.profileRevision='unavailable';this.manifest.profileName=undefined;this.profileSignature='';this.cache.clear();
    }
  }
  allPoints() { this.refreshProfile(); return structuredClone(this.points); }
  dataset():import('../shared/map-v3').MapDataset {this.refreshProfile();return structuredClone({manifest:this.manifest,places:this.points,geography:this.displayGeography,sports:this.sports,venues:this.sharedFacts?.venues||[]});}
  // Send the large immutable display mesh as one value across contextBridge.
  // Copying/freezing hundreds of thousands of nested vertex arrays in the
  // isolated preload world stalls the first usable frame. JSON is decoded in
  // the renderer; the ordinary object API remains available for compatibility.
  serializedDataset():string {this.refreshProfile();return JSON.stringify({manifest:this.manifest,places:this.points,geography:this.displayGeography,sports:this.sports,venues:this.sharedFacts?.venues||[]});}
  /** Public model tools must not inherit the local UI's private profile. */
  publicView(){return this.options.profileDirectory?(this.publicAdapter ||= new CampusMapAdapter(this.directory)):this;}
  /** Capture only the explicitly selected personal point. The caller owns
   * scope and selection authorization; later reads never follow active. */
  capturePersonalPoint(pointId: string): PersonalMapPointSelector | undefined {
    if (!this.options.profileDirectory || typeof pointId !== 'string' || !pointId || pointId.length > 160) return;
    try {
      const config = this.options.profileId ? undefined
        : JSON.parse(readFileSync(path.join(this.options.profileDirectory, 'profiles/config.json'), 'utf8'));
      const profileId: unknown = this.options.profileId || config?.active;
      if (typeof profileId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(profileId)) return;
      const selected = this.readPersonalPoint({ profileId, pointId });
      return selected?.selector;
    } catch (error) { if (unavailablePersonalMapRead(error)) return; throw error; }
  }
  /** Read one already-authorized endpoint against the public baseline. No
   * other profile record, note, alias or role is projected into the result. */
  readPersonalPoint(selector: PersonalMapPointSelector): PersonalMapPointRead | undefined {
    if (!this.options.profileDirectory || !selector || typeof selector.profileId !== 'string'
      || !/^[a-zA-Z0-9_-]{1,64}$/.test(selector.profileId) || typeof selector.pointId !== 'string'
      || !selector.pointId || selector.pointId.length > 160) return;
    try {
      const raw: unknown = JSON.parse(readFileSync(path.join(this.options.profileDirectory, 'profiles', selector.profileId + '.json'), 'utf8'));
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
      const profile = raw as { records?: unknown; roles?: unknown }, publicMap = this.publicView();
      const mapVersion = publicMap.overview().version, pointId = publicMap.canonical(selector.pointId);
      if (typeof pointId !== 'string' || !pointId || pointId.length > 160) return;
      const baseline = publicMap.point(pointId);
      let coordinate: [number, number] | undefined = baseline ? [...baseline.coordinate] : undefined;
      let name = baseline?.displayName, personal = false;
      const records = profile.records && typeof profile.records === 'object' && !Array.isArray(profile.records) ? profile.records : {};
      for (const [id, value] of Object.entries(records)) {
        if (publicMap.canonical(id) !== pointId || !value || typeof value !== 'object' || Array.isArray(value)) continue;
        const record = value as { name?: unknown; e_m?: unknown; n_m?: unknown };
        if (typeof record.name !== 'string' || !record.name.trim()) continue;
        const hasCoordinate = typeof record.e_m === 'number' && Number.isFinite(record.e_m)
          && typeof record.n_m === 'number' && Number.isFinite(record.n_m);
        if (!coordinate && (!id.startsWith('u-') || !hasCoordinate)) continue;
        if (hasCoordinate) {
          const e = record.e_m as number, n = record.n_m as number;
          const reference = coordinate ? publicMap.originalReferences[id] || toLocal(coordinate) : undefined;
          if (!reference || Math.hypot(e - reference[0], n - reference[1]) > .2) {
            const next = fromLocal(e, n);
            if (!next.every(Number.isFinite)) return;
            coordinate = [next[0], next[1]];
          }
        }
        name = record.name.slice(0, 160); personal = true;
      }
      if (!coordinate || !name) return;
      const labels: string[] = [];
      const roles = profile.roles && typeof profile.roles === 'object' && !Array.isArray(profile.roles) ? profile.roles : {};
      for (const value of Object.values(roles)) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
        const role = value as { place_id?: unknown; label?: unknown };
        if (typeof role.place_id === 'string' && publicMap.canonical(role.place_id) === pointId
          && typeof role.label === 'string' && role.label.trim()) labels.push(role.label.slice(0, 40));
      }
      if (labels.length) { name = labels.join(' / ') + ' · ' + name; personal = true; }
      if (!personal || publicMap.overview().version !== mapVersion) return;
      const selected = { profileId: selector.profileId, pointId };
      const sha256 = createHash('sha256').update(JSON.stringify({ ...selected, name, coordinate })).digest('hex');
      const publicPointId = baseline && coordinate[0] === baseline.coordinate[0] && coordinate[1] === baseline.coordinate[1]
        ? baseline.id : undefined;
      const proof: PersonalMapPointProof = { ...selected, mapVersion, sha256, ...(publicPointId ? { publicPointId } : {}) };
      return { selector: selected, name, coordinate, mapVersion, sha256, ...(publicPointId ? { publicPointId } : {}), proof };
    } catch (error) { if (unavailablePersonalMapRead(error)) return; throw error; }
  }
  /** Recheck only the selected endpoint's used name/coordinate and public
   * map version. An unrelated edit elsewhere in the profile changes nothing. */
  personalPointProofCurrent(proof: PersonalMapPointProof): boolean {
    if (!proof || typeof proof.mapVersion !== 'string' || typeof proof.sha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(proof.sha256)) return false;
    const current = this.readPersonalPoint({ profileId: proof.profileId, pointId: proof.pointId });
    return !!current && current.selector.profileId === proof.profileId && current.selector.pointId === proof.pointId
      && current.mapVersion === proof.mapVersion && current.sha256 === proof.sha256 && current.publicPointId === proof.publicPointId;
  }
  sharedSnapshot(){this.refreshProfile();return {manifest:this.overview(),places:this.allPoints(),facts:structuredClone(this.sharedFacts)};}
  /** Local derived observations only; the workout owner retains the raw fix and
   * its own distance/segment decisions. Public source geography is used here,
   * never display curves, user landmarks or estimated venue reference loops. */
  matchWorkoutFix(fix:WorkoutMapFix):WorkoutMapMatch {
    this.refreshData();
    if(!this.workoutMatcher||this.workoutMatcher.graph!==this.baseGraph||this.workoutMatcher.stamp!==this.dataStamp
      ||this.manifest.dataStatus!=='ready'){
      this.workoutMatcher={graph:this.baseGraph,stamp:this.dataStamp,
        matcher:new CampusWorkoutMatcher(this.baseGraph,this.manifest,this.sharedFacts?.venues||[],this.geography)};
    }
    return this.workoutMatcher.matcher.match(fix);
  }
  verificationGraph(){this.refreshProfile();return structuredClone(this.walking.graph);}
  routeReferences(query:MapRouteQuery,references:{id:string;name:string;coordinate:[number,number]}[]){
    this.refreshProfile();
    const prior={points:this.points,byId:this.byId,walking:this.walking};
    this.ephemeralDepth++;
    try {
      const added:MapPoint[]=references.map(r=>{
        if(!r.id.startsWith('reference/')||!r.coordinate.every(Number.isFinite)||!inBounds(r.coordinate,this.manifest.bounds))throw new Error('This reference point is outside the map’s valid bounds.');
        return {id:r.id,displayName:r.name.slice(0,80),aliases:[],kind:'node',coordinate:r.coordinate,bounds:[...r.coordinate,...r.coordinate],entrances:[],accessCandidates:[],source:{url:'local-reference'},geometryStatus:'reference-point'};
      });
      this.points=[...this.points,...added];this.byId=new Map(this.points.map(p=>[p.id,p]));this.walking=new WalkingGraph(estimateAccess(this.points,this.walking.graph,this.geography,new Set(added.map(p=>p.id))));
      const route=this.route(query);return {route,graph:structuredClone(this.walking.graph)};
    } finally {this.points=prior.points;this.byId=prior.byId;this.walking=prior.walking;this.ephemeralDepth--;}
  }
  overview() {
    this.refreshProfile(); return structuredClone(this.manifest);
  }
  point(id: string) {
    this.refreshProfile(); const value = this.byId.get(this.canonical(id));
    return value ? structuredClone(value) : undefined;
  }
  /** Public geometry candidates, never a connection from the user's position. */
  nearbyConnectedPlaces(id: string, radiusMeters = 500, limit = 4) {
    const reference = this.byId.get(id);
    if (!reference) return [];
    return this.points.filter(point => point.id !== id && point.entrances.some(entrance => entrance.connected))
      .map(point => ({ point, distance: metersBetween(reference.coordinate, point.coordinate) }))
      .filter(item => item.distance <= Math.min(1000, radiusMeters)).sort((a, b) => a.distance - b.distance)
      .slice(0, Math.min(6, limit)).map(item => structuredClone(item.point));
  }
  /** A lake/area reference is useful for browsing but may have no walking
   * endpoint. Discover separate named public places with recorded graph access;
   * choosing one remains an explicit change of endpoint, never an invented door. */
  nearbyWalkablePlaces(id: string, radiusMeters = 600, limit = 6) {
    this.refreshProfile();
    const reference = this.byId.get(this.canonical(id));
    if (!reference || !['water', 'area'].includes(reference.kind) || this.manifest.dataStatus !== 'ready') return [];
    const radius = Math.max(0, Math.min(1000, radiusMeters)), seen = new Set<string>();
    return this.points.flatMap(point => {
      if (point.id === reference.id || point.personal || point.historicalReference || ['water', 'area', 'node'].includes(point.kind)
        || !point.displayName.trim() || /^Unnamed/.test(point.displayName)) return [];
      const canonicalId = this.canonical(point.id);
      if (seen.has(canonicalId)) return [];
      const straightM = metersBetween(reference.coordinate, point.coordinate);
      if (straightM > radius) return [];
      const recorded = point.accessCandidates ?? point.entrances.filter(entrance => entrance.connected)
        .map(entrance => ({ nodeId: entrance.id, kind: 'entrance' as const, conditions: undefined }));
      const access = recorded.filter(candidate => !candidate.conditions?.length
        && (this.walking.adjacency.get(candidate.nodeId) || []).some(({ edge }) => allowsFootAccess(edge.foot) && !edge.conditions?.length));
      if (!access.length) return [];
      const connectedBridgeNames = [...new Set(access.flatMap(candidate =>
        (this.walking.adjacency.get(candidate.nodeId) || []).flatMap(({ edge }) =>
          edge.bridge && edge.name?.trim() && allowsFootAccess(edge.foot) && !edge.conditions?.length ? [edge.name.trim()] : [])))];
      seen.add(canonicalId);
      return [{ point: structuredClone(point), straightM,
        endpoint: { kind: 'place' as const, id: point.id },
        relation: 'nearby_alternative' as const, forPlaceId: reference.id,
        distanceBasis: 'between_public_reference_points' as const,
        accessKinds: [...new Set(access.map(candidate => candidate.kind))], connectedBridgeNames }];
    }).sort((a, b) => Number(!a.connectedBridgeNames.includes(a.point.displayName)) - Number(!b.connectedBridgeNames.includes(b.point.displayName))
      || Number(a.point.kind !== 'landmark') - Number(b.point.kind !== 'landmark')
      || a.straightM - b.straightM).slice(0, Math.max(1, Math.min(8, limit)));
  }
  deviceCandidates(coordinate: [number, number], accuracy: number) {
    if (!Number.isFinite(accuracy) || accuracy > 150 || accuracy < 0) return [];
    const latitude = accuracy / 111000, longitude = latitude / Math.max(0.1, Math.cos(coordinate[1] * Math.PI / 180));
    return this.points.filter(point => coordinate[0] + longitude >= point.bounds[0] && coordinate[0] - longitude <= point.bounds[2] && coordinate[1] + latitude >= point.bounds[1] && coordinate[1] - latitude <= point.bounds[3]).slice(0, 4).map(point => structuredClone(point));
  }
  search(query: string, limit = 20) {
    this.refreshProfile();
    return structuredClone(rankMapPoints(this.points,query,this.manifest.label).slice(0,Math.max(1,Math.min(50,limit))));
  }
  locationStatus(): LocationStatusResult {
    return {
      status: 'idle',
      source: 'windows-native',
      phoneConnected: false,
      reason: 'Choose a start manually. Device location, when explicitly available, is separate; model tools do not acquire or save coordinates.',
    };
  }
  private resolve(e?: MapEndpoint): MapPoint | undefined {
    if (e?.kind === 'place') return this.byId.get(this.canonical(e.id));
    if (e?.kind === 'node') {
      const n = this.walking.nodes.get(e.id);
      if (!n) return;
      return {
        id: `node/${n.id}`,
        graphNodeId: n.id,
        displayName: n.name || 'Road point',
        roadReference: {nodeId:n.id,roadName:n.name||this.walking.adjacency.get(n.id)?.find(e=>e.edge.name)?.edge.name||'Road point',forPlaceIds:[]},
        aliases: [],
        kind: 'node',
        coordinate: n.coordinate,
        bounds: [...n.coordinate, ...n.coordinate],
        entrances: [],
        accessCandidates: [{
            id: 'entrance/'+n.id,
            nodeId: n.id,
            kind: 'road-point',
            name: n.name || 'Road point',
            coordinate: n.coordinate,
            coordinates: [n.coordinate],
            meters: 0,
            source: /^\d+$/.test(n.id)?`https://www.openstreetmap.org/node/${n.id}`:'local-derived-map-node',
        }],
        source: /^\d+$/.test(n.id)?{url:`https://www.openstreetmap.org/node/${n.id}`}:{url:'local-derived-map-node',featureId:`${this.manifest.version}/node/${n.id}`},
        geometryStatus: 'mapped',
      };
    }
  }
  route(query: MapRouteQuery): MapRouteResult {
    this.refreshProfile();
    if(query.from?.kind==='current'&&query.from.fix){
      const fix=query.from.fix;
      const quality=classifyFix(fix,this.manifest.bounds);
      if(quality!=='fresh')return {...emptyRoute(),status:quality==='outside'?'outside':'origin_confirmation',reason:quality==='outside'?'The reported position is outside this map. Choose two points manually.':quality==='stale'?'The reported position has expired. Choose a start manually.':'The reported position is invalid or too uncertain. Choose a start manually.'};
      const id='reference/device/'+createHash('sha256').update(JSON.stringify([fix.coordinate,fix.timestamp])).digest('hex').slice(0,16);
      return this.routeReferences({...query,from:{kind:'place',id}},[{id,name:'Reported device position',coordinate:fix.coordinate}]).route;
    }
    const start = performance.now(),
      from = this.resolve(query.from),
      to = this.resolve(query.to);
    const base: MapRouteResult = {
      ...emptyRoute(),
      from,
      to,
      source: { version: this.manifest.version, kind: this.manifest.dataKind || 'osm', date: this.manifest.sourceDate },
      profileRevision: this.manifest.profileRevision,
    };
    const fail = (status: MapRouteResult['status'], reason: string) => ({
      ...base,
      status,
      reason,
      elapsedMs: performance.now() - start,
    });
    if (this.manifest.dataStatus !== 'ready') return fail('error', this.manifest.dataError || 'The route network is not loaded.');
    if (query.version && query.version !== this.manifest.version)
      return fail('error', 'The map data changed. Choose the route endpoints again.');
    if (query.profileRevision && query.profileRevision !== this.manifest.profileRevision)
      return fail('error','Place names changed. Refresh the places before routing again.');
    if (!query.to) return fail('missing_destination', 'Choose a destination.');
    if (!to) return fail('outside', 'This place is outside the current map dataset.');
    if (!query.from) return fail('missing_origin', 'Choose a start on the map.');
    if (query.from.kind === 'current')
      return fail(
        'origin_confirmation',
        'The position is shown, but its walking connection to the network is unconfirmed. Choose your actual building with a recorded entrance as the start.',
      );
    if (!from) return fail('outside', 'The start is outside the current map dataset.');
    if (from.id === to.id) return fail('same', 'Start and destination are the same place; no route is needed.');
    const access = (point: MapPoint, chosen?: string): MapAccessCandidate[] => {
      const recorded: MapAccessCandidate[] = point.accessCandidates ?? point.entrances.filter(e=>e.connected).map(e=>({id:'entrance/'+e.id,nodeId:e.id,kind:'entrance' as const,name:e.name,coordinate:e.coordinate,coordinates:[e.coordinate],meters:0,source:e.source}));
      const eligible=recorded.filter(e=>(!chosen || e.id===chosen || e.entranceId&&'entrance/'+e.entranceId===chosen) && (query.allowConditional || !e.conditions?.length) && (!query.avoidStairs || !e.stairs));
      const cheapest=new Map<string,MapAccessCandidate>();
      for(const candidate of eligible){const current=cheapest.get(candidate.nodeId);if(!current||candidate.meters<current.meters||candidate.meters===current.meters&&candidate.kind==='entrance')cheapest.set(candidate.nodeId,candidate);}
      return [...cheapest.values()];
    };
    const a = access(from,query.originAccessId), b = access(to,query.destinationAccessId);
    if (!a.length || !b.length) {
      const result = fail(
        'unknown_entrance',
        (!a.length ? from : to).accessReviewBasis || `Under these conditions, road access for ${!a.length ? from.displayName : to.displayName} is unverified. Keep browsing or choose another place.`,
      );
      result.roadReferences=([['origin',from,a,b],['destination',to,b,a]] as const).flatMap(([endpoint,place,choices,other])=>choices.length?[]:(place.nearbyRoadReferences||[]).flatMap(ref=>{
        const point=this.byId.get(ref.id);if(!point?.roadReference)return [];
        const straightM=metersBetween(place.coordinate,point.coordinate);if(straightM>150)return [];
        if(other.length){
          const node=point.roadReference.nodeId,otherNodes=other.map(c=>c.nodeId);
          const linked=this.walking.shortest(endpoint==='origin'?[node]:otherNodes,endpoint==='origin'?otherNodes:[node],query.avoidStairs,undefined,undefined,query.allowConditional);
          if(!linked)return [];
        }
        return [{endpoint,point,straightM,forPlace:place.displayName}];
      }).slice(0,2));
      if(result.roadReferences.length)result.reason+= 'You can explicitly choose a nearby road point instead.';
      result.warnings.push('No suitable recorded entrance or obstacle-aware access within 80 m is available. No straight line through a wall or water was invented. A nearby road point is an explicitly different endpoint, not a building door.');
      if (!a.length && b.length) result.conditionalOrigins = this.nearbyConnectedPlaces(from.id).filter(point => point.id !== to.id).flatMap(point => {
        const candidate = this.route({ from: { kind: 'place', id: point.id }, to: query.to, avoidStairs: query.avoidStairs });
        if (candidate.status !== 'ready' || !candidate.distance || !candidate.originEntrance || !candidate.destinationEntrance || candidate.originAccess?.kind!=='entrance' || candidate.destinationAccess?.kind!=='entrance') return [];
        const networkM = candidate.distance.networkM;
        const entrance = (value: NonNullable<MapRouteResult['originEntrance']>) => ({ id: value.id, name: value.name, connected: value.connected, source: value.source });
        return [{ id: point.id, label: point.displayName, originEntrance: entrance(candidate.originEntrance), destinationEntrance: entrance(candidate.destinationEntrance),
          networkM, minutes: { min: Math.ceil(networkM / 90), max: Math.ceil(networkM / 48) }, connection: 'unknown' as const,
          condition: 'This segment starts at the candidate building’s own recorded connected entrance and ends at the destination entrance. Its outdoor interval applies only after reaching that candidate entrance. Access from the original place, indoor movement and current conditions remain unknown. The candidate entrance is not a confirmed exit from the original place.' }];
      });
      return result;
    }
    const key = JSON.stringify([this.manifest.version,this.manifest.profileRevision,from.id,from.coordinate,to.id,to.coordinate,!!query.avoidStairs,!!query.allowConditional,query.originAccessId,query.destinationAccessId]);
    const cached = this.cache.get(key);
    if (cached) return structuredClone(cached);
    const found = this.walking.shortest(
      a.map((e) => e.nodeId),
      b.map((e) => e.nodeId),
      query.avoidStairs,
      new Map(a.map(e=>[e.nodeId,e.meters])),new Map(b.map(e=>[e.nodeId,e.meters])),query.allowConditional,
    );
    if (!found) return fail('unreachable', 'The recorded walking network has no connected route. Missing segments were not replaced with straight lines.');
    const used = found.edgeIds.map((id) => this.walking.edges.get(id)!);
    const originAccess=a.find(e=>e.nodeId===found.nodeIds[0])!, destinationAccess=b.find(e=>e.nodeId===found.nodeIds.at(-1))!;
    const segments: NonNullable<MapRouteResult['segments']> = [];
    if(originAccess.kind==='estimate')segments.push({id:originAccess.id,name:'Start access estimate',coordinates:originAccess.coordinates,meters:originAccess.meters,kind:'estimate'});
    for(let i=0;i<used.length;i++) {const e=used[i];segments.push({id:e.id,name:e.name || (e.bridge?'Bridge':e.reviewedApproach?'Bridge approach':e.stairs?'Steps':e.buildingPassage?'Building passage':e.covered?'Covered walk':'Campus walk'),coordinates:[found.coordinates[i],found.coordinates[i+1]],meters:e.meters,kind:'network',stairs:e.stairs,bridge:e.bridge,conditions:e.conditions});}
    if(destinationAccess.kind==='estimate')segments.push({id:destinationAccess.id,name:'Destination access estimate',coordinates:destinationAccess.coordinates.slice().reverse(),meters:destinationAccess.meters,kind:'estimate'});
    const coordinates=segments.length?segments.flatMap((s,i)=>i?s.coordinates.slice(1):s.coordinates):found.coordinates;
    const connectorM=originAccess.meters+destinationAccess.meters;
    const networkM=used.reduce((sum,e)=>sum+e.meters,0);
    const estimateOnly=networkM===0&&connectorM>0;
    // This is a presentation distinction, not a confidence score. A tiny
    // recorded edge must not make a mostly estimated result sound surveyed.
    const estimateDominant=connectorM>0&&connectorM/(networkM+connectorM)>=.9;
    const warnings = ['Calculated from recorded segments allowing foot access. Gates, construction and current conditions still require local confirmation.'];
    if (used.some((e) => e.stairs)) warnings.push('The route includes steps.');
    if (used.some((e) => e.gate)) warnings.push('The route crosses a gate or entrance whose current access is unverified.');
    if(connectorM>0)warnings.push(from.undergroundStation||to.undergroundStation?'Dashed lines estimate obstacle-aware access from recorded entrances or references to the network. Physical connection and access remain unverified.':'Dashed lines estimate obstacle-aware access from a building reference to the network. Actual doors and indoor passage are unconfirmed.');
    if(from.undergroundStation||to.undergroundStation)warnings.push('Walking ends at a metro entrance and excludes station entry or internal transfers. Current opening is unverified.');
    if(estimateOnly)warnings.push('Both references connect to the same network point. This result contains access estimates only, with no recorded walking segment.');
    else if(estimateDominant)warnings.push('Most distance comes from building-reference access estimates, with very little recorded road. It does not confirm an actual walking route.');
    const assumptionWarning=routeConditionWarning([...used.flatMap(e=>e.conditions||[]),...(originAccess.conditions||[]),...(destinationAccess.conditions||[])]);
    if(assumptionWarning)warnings.push(assumptionWarning);
    const result: MapRouteResult = {
      ...base,
      status: 'ready',
      reason: assumptionWarning?'A hypothetical route was calculated under the listed access conditions; unverified passages remain marked in its segments.'
        :estimateOnly?'Both references connect to the same network point. This access-only estimate shows their relationship; the actual route remains unverified.'
        :estimateDominant?'This result is mostly access estimates with little recorded road. Actual entrances and routing remain unverified.'
        :connectorM>0?'The recorded-road segment is calculated, with access estimates at either end. Actual doors, indoor movement and current conditions still need confirmation.'
        :from.roadReference||to.roadReference?'The network route between the road reference and recorded access is ready.':'The network route between recorded entrances is ready.',
      routeBasis: estimateOnly?'access_estimate_only':estimateDominant?'access_estimate_dominant':connectorM>0?'recorded_network_with_estimates':'recorded_network',
      coordinates,
      nodeIds: found.nodeIds,
      edgeIds: found.edgeIds,
      distance: { totalM: found.meters, networkM, connectorM },
      originEntrance: from.entrances.find(e=>e.id===(originAccess.entranceId||(originAccess.kind==='entrance'?originAccess.nodeId:undefined))),
      destinationEntrance: to.entrances.find(e=>e.id===(destinationAccess.entranceId||(destinationAccess.kind==='entrance'?destinationAccess.nodeId:undefined))),
      originAccess,destinationAccess,segments,
      warnings,
      elapsedMs: performance.now() - start,
    };
    this.cache.set(key, result);
    if (this.cache.size > 128) this.cache.delete(this.cache.keys().next().value!);
    return structuredClone(result);
  }
}
