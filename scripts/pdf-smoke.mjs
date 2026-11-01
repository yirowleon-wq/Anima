import fs from 'node:fs';
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
if(['win32','darwin'].includes(process.platform)&&['x64','arm64'].includes(process.arch)) {
 fs.mkdirSync('.test-build',{recursive:true});
 await build({entryPoints:['tests/pdf-smoke.ts'],bundle:true,platform:'node',format:'cjs',outfile:'.test-build/pdf-smoke.cjs'});
 const result=spawnSync(process.execPath,['.test-build/pdf-smoke.cjs'],{stdio:'inherit',windowsHide:true});
 if(result.error) throw result.error;
 process.exitCode=result.status??1;
} else console.log('Native PDF smoke targets Windows and macOS.');

