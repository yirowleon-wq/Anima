import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
import {mapEngineLoader} from './scripts/map-engine-loader';
const mapFiles = ['manifest.json','places.json','network.json','geography.geojson','display-geography.geojson','sports-details.geojson','shared-facts.json','venues.json','building-supplement.json','source.osm.json.gz'];
export default defineConfig({
  root:'apps/review-web',base:'./',publicDir:false,plugins:[react(),mapEngineLoader(),{
    name:'public-map-only',
    configureServer(server) {
      server.middlewares.use((req,res,next)=>{
        const requested=decodeURIComponent((req.url||'').split('?')[0]).replace(/^.*\/map\//,'');
        const name=requested==='source.osm.json.gz'?requested:requested.endsWith('.gz')?requested.slice(0,-3):'';
        if (!mapFiles.includes(name)) return next();
        res.setHeader('Content-Type','application/gzip');
        const bytes=fs.readFileSync(path.resolve('assets/map-v2',name));
        res.end(name.endsWith('.gz')?bytes:gzipSync(bytes,{level:9}));
      });
    },
    generateBundle() {
      for(const name of mapFiles) {
        const bytes=fs.readFileSync(path.resolve('assets/map-v2',name)), compressed=name.endsWith('.gz');
        this.emitFile({type:'asset',fileName:'map/'+name+(compressed?'':'.gz'),source:compressed?bytes:gzipSync(bytes,{level:9})});
      }
    },
  }],
  resolve:{alias:[{find:/^\.\/mapStorage$/,replacement:path.resolve('apps/review-web/storage.ts')}]},
  server:{host:'127.0.0.1',port:5174,strictPort:true},
  build:{outDir:'../../dist-review',emptyOutDir:true,sourcemap:false},
});
