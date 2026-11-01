import { build } from 'esbuild';
import fs from 'node:fs';
import { stageMaterialRuntime } from './material-runtime.mjs';
import { stageEmbeddingRuntime } from './embedding-runtime.mjs';
import { lockedOpenUiZodImports } from './zod-build-imports.mjs';

await build({
  entryPoints: { main: 'src/main/main.ts', preload: 'src/main/preload.ts', 'embedding-worker': 'src/main/memory/embedding-worker.ts' },
  bundle: true, outdir: 'dist-electron', outExtension: { '.js': '.cjs' },
  platform: 'node', format: 'cjs', target: 'node24',
  external: ['electron', 'pdfjs-dist', '@napi-rs/canvas', '@napi-rs/canvas-*', 'onnxruntime-node', 'onnxruntime-common', '@huggingface/tokenizers'],
  loader: { '.md': 'text' }, sourcemap: true,
  plugins: [lockedOpenUiZodImports()],
});
if (['win32', 'darwin'].includes(process.platform) && ['x64', 'arm64'].includes(process.arch)) {
  await stageMaterialRuntime('dist-electron/material-runtime');
  if ((fs.existsSync('runtime/embedding/lock.json') && JSON.parse(fs.readFileSync('runtime/embedding/lock.json', 'utf8')).enabled === true)) await stageEmbeddingRuntime('dist-electron/embedding-runtime');
  else console.log('Optional semantic model is not configured; source-backed lexical retrieval remains available.');
} else console.log('Desktop JavaScript built; native PDF staging is available on Windows and macOS.');
