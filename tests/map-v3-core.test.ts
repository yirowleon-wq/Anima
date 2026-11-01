import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { WalkingGraph } from '../src/shared/map-routing';
import { CampusMapAdapter } from '../src/main/mapService';
import { initialSelection, selectionReducer } from '../src/renderer/map/map-state';
import type { MapGraph, MapPoint } from '../src/shared/map-v2';
import { restoreRecordedRoadDisplays, retainBridgeStatusConditions, bridgeStatusUnverified, routeConditionWarning } from '../src/shared/map-v3';
import { drawableTriangle, roofBoundaryEdges, type MeshVertex } from '../src/renderer/map/mesh-geometry';
import { GroundFill, groundFillPolygons, groundFillCoordinate } from '../src/renderer/map/ground-fills';
import { cartographyLayers } from '../src/renderer/map/cartography';
import { darkMapPalette, lightMapPalette } from '../src/renderer/map/map-theme';
import { createExpression } from '@maplibre/maplibre-gl-style-spec';
import earcut from 'earcut';
const service=new CampusMapAdapter('assets/map-v2');
const node=(id:string)=>({id,coordinate:[0,0] as [number,number]});
const edge=(id:string,from:string,to:string,meters:number,extra={})=>({id,from,to,meters,way:'way/test',name:'',oneway:false,stairs:false,bridge:false,gate:false,...extra});

test('Pedestrian areas fill their surfaces, preserve holes, and remain distinct from lines and elevators',()=>{
 const rings=[[[-0.002,-0.004],[-0.0016,-0.004],[-0.0016,-0.0036],[-0.002,-0.0036],[-0.002,-0.004]],
  [[-0.0019,-0.0039],[-0.0019,-0.0037],[-0.0017,-0.0037],[-0.0017,-0.0039],[-0.0019,-0.0039]]];
 const area:any={type:'Feature',id:'fixture/plaza',properties:{kind:'road',highway:'pedestrian'},geometry:{type:'Polygon',coordinates:rings}};
 const multi:any={...area,id:'fixture/multi',geometry:{type:'MultiPolygon',coordinates:[rings]}};
 const line:any={...area,id:'fixture/path',geometry:{type:'LineString',coordinates:rings[0].slice(0,2)}};
 const elevator:any={...area,id:'fixture/elevator',properties:{kind:'road',highway:'elevator'}};
 const data:any={type:'FeatureCollection',features:[area,multi,line,elevator]},before=JSON.stringify(data);
 for(const palette of [darkMapPalette,lightMapPalette])for(const direction of ['atlas','relief','focus'] as const){
  const spec=cartographyLayers(palette,direction).find(layer=>layer.id==='pedestrian-areas');
  assert.ok(spec&&spec.type==='fill');
  const fill:any=new GroundFill(spec,data,new Map());
  assert.deepEqual(fill.groups.map((group:any)=>group.feature.id),['fixture/plaza','fixture/multi']);
  assert.ok(fill.groups.every((group:any)=>group.count>0));
  const paths=cartographyLayers(palette,direction).find(layer=>layer.id==='paths');
  assert.ok(paths&&'filter' in paths);
  const filter=createExpression(paths.filter,'paths.filter');if(filter.result!=='success')throw Error('Path filter failed to compile');
  assert.equal(filter.value.evaluate({zoom:18},{type:2,properties:line.properties}),true);
  assert.equal(filter.value.evaluate({zoom:18},{type:3,properties:area.properties}),false);
  assert.equal(filter.value.evaluate({zoom:18},{type:3,properties:{kind:'road',highway:'footway'}}),true);
 }
 assert.equal(groundFillPolygons(area)[0].rings.length,2);
 assert.equal(JSON.stringify(data),before);
});

test('A historical bridge source status is not overwritten by gate assumptions or treated as a confirmed bridge',()=>{
 const graph:MapGraph={version:'fixture',nodes:[node('a'),node('b')],edges:[
  edge('old','a','b',20,{way:'way/old',gate:true,conditions:['gate_opening_unverified']}),
  edge('active','a','b',30,{way:'way/active',bridge:true}),
  edge('not-bridge','a','b',40,{way:'way/not-bridge'})]};
 const geography={features:[{id:'way/old',properties:{bridge:'abandoned'}},{id:'way/active',properties:{bridge:'yes'}},{id:'way/not-bridge',properties:{bridge:'no'}}]};
 const before=structuredClone(graph),result=retainBridgeStatusConditions(graph,geography);
 assert.deepEqual(graph,before);assert.deepEqual(result.nodes,graph.nodes);
 assert.deepEqual(result.edges.map(e=>e.id),graph.edges.map(e=>e.id));
 assert.deepEqual(result.edges[0].conditions,['gate_opening_unverified',bridgeStatusUnverified]);
 assert.equal(result.edges[0].bridge,false);assert.deepEqual(result.edges.slice(1),graph.edges.slice(1));
 assert.deepEqual(retainBridgeStatusConditions(result,geography),result);
});

test('Redeveloped paths and unknown conditions are not misclassified as gates; each uncertainty is retained',()=>{
 assert.equal(routeConditionWarning([]),undefined);
 const site=routeConditionWarning(['redeveloped_site_access_unverified'])!;
 assert.match(site,/redevelopment area/);assert.match(site,/former paths/);assert.doesNotMatch(site,/gate is open/);
 const mixed=routeConditionWarning([bridgeStatusUnverified,'gate_opening_unverified',bridgeStatusUnverified,'future_condition'])!;
 assert.equal(mixed.match(/historical bridge/g)?.length,1);assert.match(mixed,/gate/);assert.match(mixed,/other unverified passages/);
 assert.doesNotMatch(routeConditionWarning(['future_condition'])!,/gate|gate is open/);
});

test('A zero-edge result on one graph node retains the selected access assumptions',()=>{
 const dir=fs.mkdtempSync(path.resolve('.test-data/map-route-conditions-'));
 const manifest={...service.overview(),version:'conditional-access-fixture',implementation:undefined,componentHashes:undefined};
 const entrance=(id:string,conditions:string[]):MapPoint=>({id,displayName:id,aliases:[],kind:'building',coordinate:[0,0],bounds:[0,0,0,0],
  entrances:[],source:{url:'test://synthetic'},geometryStatus:'mapped',accessCandidates:[{id:id+'/access',nodeId:'shared',kind:'entrance',name:'Synthetic entrance',coordinate:[0,0],coordinates:[[0,0]],meters:0,source:'test://synthetic',conditions}]});
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest));
 fs.writeFileSync(path.join(dir,'places.json'),JSON.stringify([entrance('a',['gate_opening_unverified']),entrance('b',[])]));
 fs.writeFileSync(path.join(dir,'network.json'),JSON.stringify({version:manifest.version,nodes:[node('shared')],edges:[]}));
 const adapter=new CampusMapAdapter(dir),query={from:{kind:'place' as const,id:'a'},to:{kind:'place' as const,id:'b'}};
 assert.equal(adapter.route(query).status,'unknown_entrance');
 const assumed=adapter.route({...query,allowConditional:true});
 assert.equal(assumed.status,'ready');assert.equal(assumed.edgeIds.length,0);assert.equal(assumed.distance?.totalM,0);
 assert.ok(assumed.warnings.some(w=>w.includes('hypothetical route')&&w.includes('gate is open')));
 assert.equal(adapter.route(query).status,'unknown_entrance');
});

const exactFillArea2=(points:number[][])=>points.reduce((sum,p,i)=>{
 const q=points[(i+1)%points.length],integer=(v:number)=>BigInt(v*2**149);
 return sum+integer(p[0])*integer(q[1])-integer(q[0])*integer(p[1]);
},0n);
const absArea=(v:bigint)=>v<0n?-v:v;
const drawnFillArea2=(vertices:ArrayLike<number>,indices:number[])=>{
 let sum=0n;for(let i=0;i<indices.length;i+=3)sum+=absArea(exactFillArea2(indices.slice(i,i+3).map(k=>[vertices[k*2],vertices[k*2+1]])));
 return sum;
};

test('A self-crossing synthetic ring does not pass the exact fill-area predicate',()=>{
 // Synthetic self-crossing ring: the area predicate must reject it. Actual
 // source-derived failure witnesses stay in the local audit, not this fixture.
 const bad=[[0,0],[10,10],[0,10],[10,0],[0,0]];
 assert.notEqual(drawnFillArea2(bad.flat(),earcut(bad.flat())),absArea(exactFillArea2(bad)));
});

test('Ground fill preserves valid courtyard holes and disconnected components',()=>{
 const feature:any={type:'Feature',id:'fixture/courtyard',properties:{kind:'building'},geometry:{type:'MultiPolygon',coordinates:[
  [[[-0.002,-0.004],[-0.0016,-0.004],[-0.0016,-0.0036],[-0.002,-0.0036],[-0.002,-0.004]],[[-0.0019,-0.0039],[-0.0019,-0.0037],[-0.0017,-0.0037],[-0.0017,-0.0039],[-0.0019,-0.0039]]],
  [[[-0.001,-0.004],[-0.0009,-0.004],[-0.001,-0.0039],[-0.001,-0.004]]]
 ]}};
 const polygons=groundFillPolygons(feature);assert.equal(polygons.length,2);assert.equal(polygons[0].rings.length,2);
 for(const p of polygons){const expected=absArea(exactFillArea2(p.rings[0]))-p.rings.slice(1).reduce((s,r)=>s+absArea(exactFillArea2(r)),0n);assert.equal(drawnFillArea2(p.vertices,p.indices),expected);}
 const p=polygons[0],outerArea=absArea(exactFillArea2(p.rings[0]));assert.notEqual(drawnFillArea2(p.vertices,p.indices),outerArea,'Filling the courtyard must fail');
});

test('Nearby independent boundaries are not snapped together and fill layers retain separate identities',()=>{
 const feature:any={type:'Feature',id:'fixture/near',properties:{kind:'building'},geometry:{type:'Polygon',coordinates:[[[-0.002,-0.004],[-0.0016,-0.004],[-0.0016,-0.0036],[-0.002,-0.0036],[-0.002,-0.004]]]}};
 const plain=groundFillPolygons(feature),near=groundFillPolygons(feature,[{coordinate:[-0.0018,-0.003999999],owners:new Set(['fixture/neighbor'])}]);
 assert.deepEqual(near,plain,'A nearby separate edge is not a shared node');
 const fill=new GroundFill({id:'footprints',type:'fill',source:'geography'},{type:'FeatureCollection',features:[feature]},new Map());
 assert.notEqual(fill.id,'footprints','Do not collide with a native tile bucket during feature-state updates');
});

test('Ground picking inverts the actual perspective matrix and rejects points behind the camera or outside clipping',()=>{
 const matrix=new Float32Array([2,0,0,.25, 0,3,0,.125, 0,0,1,0, .1,-.2,0,1]);
 const x=.2,y=-.1,w=matrix[3]*x+matrix[7]*y+matrix[15];
 const screenX=((matrix[0]*x+matrix[4]*y+matrix[12])/w+1)*400;
 const screenY=(1-(matrix[1]*x+matrix[5]*y+matrix[13])/w)*300;
 const picked=groundFillCoordinate(matrix,800,600,screenX,screenY)!;
 assert.ok(Math.abs(picked[0]-x)<1e-14&&Math.abs(picked[1]-y)<1e-14);
 const behind=matrix.slice();behind[15]=-1;assert.equal(groundFillCoordinate(behind,800,600,400,300),undefined);
 const clipped=matrix.slice();clipped[14]=5;assert.equal(groundFillCoordinate(clipped,800,600,400,300),undefined);
});

test('Zero-area triangles are rejected while thin faces, vertical walls, and invalid input remain distinct',()=>{
 assert.equal(drawableTriangle([[0,0,0],[0,0,0],[1,1,1]]),false);
 assert.equal(drawableTriangle([[0,0,0],[1,0,0],[2,0,0]]),false);
 assert.equal(drawableTriangle([[0,0,0],[1,0,0],[1,1e-12,0]]),true);
 assert.equal(drawableTriangle([[0,0,0],[0,1,0],[0,1,1]]),true);
 assert.throws(()=>drawableTriangle([[0,0,0],[1,0,0],[NaN,1,0]]));
 assert.throws(()=>drawableTriangle([[0,0,0],[1,0,0],[1e308,1,0]]));
});
test('Duplicate roof triangles retain outer boundaries without drawing shared triangulation edges as cracks',()=>{
 const a:MeshVertex=[0,0,1],b:MeshVertex=[1,0,1],c:MeshVertex=[1,1,1],d:MeshVertex=[0,1,1];
 const edges=roofBoundaryEdges([{material:'roof',vertices:[a,b,c,a,c,d,c,b,a]}]);
 const keys=edges.map(e=>[e.a.join(','),e.b.join(',')].sort().join('|'));
 assert.equal(edges.length,4);assert.ok(!keys.includes([a.join(','),c.join(',')].sort().join('|')));
 assert.equal(roofBoundaryEdges([{material:'wall',vertices:[a,b,c]}]).length,0);
 assert.throws(()=>roofBoundaryEdges([{material:'roof',vertices:[a,b]}]));
});


test('Closer access need not produce the shortest total route; destination costs participate in the global comparison',()=>{
 const graph:MapGraph={version:'fixture',nodes:['a','b','x','y'].map(node),edges:[edge('ax','a','x',100),edge('by','b','y',8),edge('xy','x','y',60)]};
 const found=new WalkingGraph(graph).shortest(['a','b'],['x','y'],false,new Map([['a',1],['b',10]]),new Map([['x',1],['y',4]]));
 assert.equal(found?.meters,22);assert.deepEqual(found?.nodeIds,['b','y']);
});

test('Ordinary sections of a source road remain visible beside unverified sections without mutating the original',()=>{
 const fixture={features:[{id:'way/test',properties:{kind:'source-history'},geometry:{type:'LineString',coordinates:[[0,0],[0.001,0]]}}]};
 const sample:MapGraph={version:'fixture',nodes:[{id:'a',coordinate:[0,0]},{id:'b',coordinate:[0.001,0]},{id:'c',coordinate:[0.002,0]},{id:'d',coordinate:[0.003,0]}],edges:[edge('ab','a','b',1),edge('bc','b','c',1,{conditions:['site_unverified']}),edge('cd','c','d',1)]};
 const split=restoreRecordedRoadDisplays(fixture,sample).features[0];
 assert.equal(split.geometry?.type,'MultiLineString');
 assert.deepEqual(split.geometry?.coordinates,[[[0,0],[0.001,0]],[[0.002,0],[0.003,0]]]);
 assert.deepEqual(restoreRecordedRoadDisplays(fixture,{...sample,edges:sample.edges.map(e=>({...e,conditions:['site_unverified']}))}),fixture);
 assert.deepEqual(restoreRecordedRoadDisplays(fixture,{...sample,edges:[]}),fixture);
 const reverse=restoreRecordedRoadDisplays(fixture,{...sample,edges:[edge('ba','b','a',1,{oneway:true}),edge('cb','c','b',1,{oneway:true})]}).features[0];
 assert.equal(reverse.geometry?.type,'LineString');
 assert.deepEqual(reverse.geometry?.coordinates,[[0.002,0],[0.001,0],[0,0]]);
 assert.throws(()=>restoreRecordedRoadDisplays(fixture,{...sample,nodes:sample.nodes.filter(n=>n.id!=='a')}));
});
test('Bellman-Ford independently cross-checks multi-source, multi-target Dijkstra on fixed synthetic graphs',()=>{
 let seed=41729;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 for(let round=0;round<60;round++){
  const nodes=Array.from({length:9},(_,i)=>node(String(i))),edges=[] as MapGraph['edges'];
  for(let i=0;i<9;i++)for(let j=i+1;j<9;j++)if(random()<.32)edges.push(edge(`${i}-${j}`,String(i),String(j),1+Math.floor(random()*30),{oneway:random()<.4,stairs:random()<.2,conditions:random()<.1?['gate_opening_unverified']:[]}));
  const source=new Map([['0',2],['1',8]]),target=new Map([['7',3],['8',13]]),avoid=round%2===0,conditional=round%3===0;
  const dist=new Map(nodes.map(n=>[n.id,source.get(n.id)??Infinity]));
  for(let i=0;i<nodes.length-1;i++)for(const e of edges){if(avoid&&e.stairs||!conditional&&e.conditions?.length)continue;dist.set(e.to,Math.min(dist.get(e.to)!,dist.get(e.from)!+e.meters));if(!e.oneway)dist.set(e.from,Math.min(dist.get(e.from)!,dist.get(e.to)!+e.meters));}
  const expected=Math.min(...[...target].map(([id,cost])=>dist.get(id)!+cost));const actual=new WalkingGraph({version:'small',nodes,edges}).shortest([...source.keys()],[...target.keys()],avoid,source,target,conditional);
  assert.equal(actual?.meters??Infinity,expected);
 }
});
test('Cached or previous results cannot ignore gate assumptions or stair avoidance',()=>{
 const g=new WalkingGraph({version:'gate',nodes:['a','b','c'].map(node),edges:[edge('gate','a','b',1,{conditions:['gate_opening_unverified']}),edge('stairs','a','c',5,{stairs:true}),edge('last','c','b',5)]});
 assert.equal(g.shortest(['a'],['b'])?.meters,10);assert.equal(g.shortest(['a'],['b'],true),null);assert.equal(g.shortest(['a'],['b'],true,new Map(),new Map(),true)?.meters,1);
});
test('Entering two-point mode keeps A, C replaces only the destination, and undo rejects stale results',()=>{
 const a=service.search('Demo Library')[0],b=service.search('Demo Studio')[0],c=service.search('Demo Meadow')[0];
 let s=selectionReducer(initialSelection,{type:'choose',point:a});assert.equal(s.mode,'browse');s=selectionReducer(s,{type:'two'});assert.equal(s.origin?.id,a.id);assert.equal(s.stage,'destination');
 s=selectionReducer(s,{type:'choose',point:b});const revision=s.revision;s=selectionReducer(s,{type:'choose',point:c});assert.equal(s.origin?.id,a.id);assert.equal(s.destination?.id,c.id);
 const late=service.route({from:{kind:'place',id:a.id},to:{kind:'place',id:b.id}});assert.equal(selectionReducer(s,{type:'result',revision,route:late}),s);
 s=selectionReducer(s,{type:'undo'});assert.equal(s.destination?.id,b.id);assert.ok(s.revision>revision);assert.equal(s.route.status,'idle');
});
test('Estimated route segments, explicit entrances, same-building routes, and out-of-bounds endpoints remain distinct',()=>{
 const a=service.search('Demo Library')[0],b=service.search('Demo Meadow')[0],r=service.route({from:{kind:'place',id:a.id},to:{kind:'place',id:b.id}});
 assert.equal(r.status,'ready');assert.ok(r.distance!.connectorM>0);assert.ok(Math.abs(r.distance!.totalM-r.distance!.networkM-r.distance!.connectorM)<1e-6);assert.equal(r.destinationEntrance,undefined);assert.equal(r.destinationAccess?.kind,'estimate');
 assert.ok(r.segments?.some(s=>s.kind==='estimate'));assert.ok(!r.segments?.some(s=>s.conditions?.length));
 const door=service.search('Demo Studio')[0],fixed=door.accessCandidates!.find(c=>c.kind==='entrance')!;
 const chosen=service.route({from:{kind:'place',id:a.id},to:{kind:'place',id:door.id},destinationAccessId:fixed.id});assert.equal(chosen.destinationAccess?.id,fixed.id);
 assert.equal(service.route({from:{kind:'place',id:a.id},to:{kind:'place',id:a.id}}).status,'same');
 assert.equal(service.route({from:{kind:'place',id:a.id},to:{kind:'place',id:'missing'}}).status,'outside');
});


test('Personal profiles stay out of public map tools and switching to an empty profile removes prior aliases',()=>{
 const dir=fs.mkdtempSync(path.resolve('.test-data/map-v3-core-'));fs.mkdirSync(path.join(dir,'profiles'));fs.writeFileSync(path.join(dir,'profiles/config.json'),JSON.stringify({active:'one'}));
 fs.writeFileSync(path.join(dir,'profiles/one.json'),JSON.stringify({profile_name:'Synthetic',records:{'demo-library':{name:'Unique synthetic alias',note:'Local-only synthetic note'}},roles:{home:{place_id:'demo-library',label:'Synthetic home'}}}));
 const map=new CampusMapAdapter('assets/map-v2',{profileDirectory:dir});assert.equal(map.search('Unique synthetic alias').length,1);assert.equal(map.publicView().search('Unique synthetic alias').length,0);assert.ok(map.publicView().allPoints().every(p=>!p.personal));
 const localPayload=JSON.parse(map.serializedDataset());assert.ok(localPayload.places.some(p=>p.personal?.note==='Local-only synthetic note'));assert.equal(localPayload.manifest.version,service.overview().version);
 const publicPayload=JSON.parse(map.publicView().serializedDataset());assert.ok(publicPayload.places.every(p=>!p.personal));
 fs.writeFileSync(path.join(dir,'profiles/two.json'),JSON.stringify({profile_name:'Empty',records:{},roles:{}}));fs.writeFileSync(path.join(dir,'profiles/config.json'),JSON.stringify({active:'two'}));assert.equal(map.search('Unique synthetic alias').length,0);assert.equal(map.search('Synthetic home').length,0);
 const emptyPayload=JSON.parse(map.serializedDataset());assert.equal(emptyPayload.manifest.profileName,'Empty');assert.ok(emptyPayload.places.every(p=>!p.personal));
});
test('One-off reference points do not mutate the public graph, and stale fixes cannot create location routes',()=>{
 const target=service.search('Demo Studio')[0],count=service.walking.nodes.size;
 const ref={id:'reference/public-test',name:'Synthetic reference point',coordinate:service.search('Demo Library')[0].coordinate};
 const result=service.routeReferences({from:{kind:'place',id:ref.id},to:{kind:'place',id:target.id}},[ref]);assert.equal(result.route.status,'ready');assert.ok(result.route.distance!.connectorM>0);assert.equal(service.walking.nodes.size,count);assert.equal(service.point(ref.id),undefined);
 const stale=service.route({from:{kind:'current',fix:{coordinate:ref.coordinate,accuracy:10,timestamp:Date.now()-130000,crs:'EPSG:4326',source:'test',deviceLabel:'Synthetic'}},to:{kind:'place',id:target.id}});assert.equal(stale.status,'origin_confirmation');assert.equal(stale.coordinates.length,0);
});
