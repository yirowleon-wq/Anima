import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const electronRoot = path.resolve('node_modules/electron');
const marker = path.join(electronRoot, 'path.txt');
if (!fs.existsSync(marker)) {
  const result = spawnSync(process.execPath, [path.join(electronRoot, 'install.js')], { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0 || !fs.existsSync(marker)) throw new Error('Pinned Electron runtime installation failed.');
}
console.log(`Pinned Electron runtime ready for ${process.platform}/${process.arch}.`);
if ((fs.existsSync('runtime/embedding/lock.json') && JSON.parse(fs.readFileSync('runtime/embedding/lock.json', 'utf8')).enabled === true)) {
  const { installEmbeddingAssets } = await import('./embedding-runtime.mjs');
  await installEmbeddingAssets();
} else console.log('Optional semantic model is not configured; lexical retrieval and original-source reading remain available.');
