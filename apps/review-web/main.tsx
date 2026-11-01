import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {preloadPublicMap} from './storage';
import {CampusMapAdapter} from '../../src/main/mapService';
import {emptyRoute, type MapRouteQuery} from '../../src/shared/map-v2';
import '@fontsource-variable/inter';

const scenes = {'overview':'Overview','top-down':'Overhead','oblique':'Perspective','route-demo':'Walking route','building-focus':'Building'} as const;
type Scene = keyof typeof scenes;
async function start() {
  await preloadPublicMap();
  const service = new CampusMapAdapter('map'); // No profile directory can enter this adapter.
  if (service.overview().dataStatus !== 'ready') throw new Error('The selected map data could not be loaded.');
  const unavailable = {status:'unavailable' as const,source:'review-web',phoneConnected:false,reason:'Choose a start on the map. This public preview does not read device location.'};
  window.anima = {
    mapOverview:async()=>service.overview(), mapPlaces:async()=>service.allPoints(),
    mapData:async()=>service.dataset(), mapDataJson:async()=>service.serializedDataset(),
    mapRoute:async (query:MapRouteQuery)=>query.from?.kind === 'current' ? {...emptyRoute(),status:'origin_confirmation',reason:unavailable.reason} : service.route(query),
    mapLocationStatus:async()=>unavailable, mapLocate:async()=>unavailable, mapStopLocation:async()=>{},
    shareMapContext:async()=>{throw new Error('This preview contains only the selected public map.');},
    window:()=>{},
    openLink:async (url:string)=>{if (['https://www.openstreetmap.org/copyright','https://map.uci.edu/?id=463','https://docs.overturemaps.org/attribution/'].includes(url)) window.open(url,'_blank','noopener,noreferrer');},
  } as unknown as typeof window.anima;
  const {MapSheet} = await import('../../src/renderer/map/CampusMap');
  const requested = new URL(location.href).searchParams.get('scene');
  const scene:Scene = requested && requested in scenes ? requested as Scene : 'overview';
  const from = service.point('place/library');
  const to = service.point('place/studio');
  const focus = service.point('place/commons');
  const initial = scene === 'route-demo' && from && to ? service.route({from:{kind:'place',id:from.id},to:{kind:'place',id:to.id}}) : scene === 'building-focus' && focus ? {...emptyRoute(),to:focus} : emptyRoute();
  function Review() {
    const [open,setOpen] = useState(true);
    return open ? <MapSheet publicOnly initialRoute={initial} reviewScene={scene} onClose={()=>setOpen(false)} onWindowClose={()=>setOpen(false)}
      returnLabel="About this map" reviewControls={<label className="review-scenes"><span>View</span><select aria-label="Map preview scene" value={scene} onChange={e=>{const url=new URL(location.href);url.searchParams.set('scene',e.target.value);location.assign(url.href);}}>{Object.entries(scenes).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>} /> :
      <main className="review-home"><h1>Anima · Campus map</h1><p>A synthetic campus demonstrates places, entrances and walking routes. It is not UC Irvine navigation data.</p><button onClick={()=>setOpen(true)}>Open map</button><p>This public preview contains no desktop records or device location.</p><p>{service.overview().attribution}</p></main>;
  }
  createRoot(document.getElementById('root')!).render(<Review />);
}
start().catch(error=>{
  const root=document.getElementById('root')!;root.replaceChildren();
  const main=document.createElement('main');main.className='review-loading';main.setAttribute('role','alert');main.textContent=String(error instanceof Error?error.message:error);root.append(main);
});
