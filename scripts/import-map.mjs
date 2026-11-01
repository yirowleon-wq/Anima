import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';

// Import a complete, explicitly selected map dataset. This does not download geography or request location.
const selected = process.argv[2];
if (!selected) throw new Error('Usage: npm run map:import -- /absolute/path/to/licensed-map-directory');
const project = await fs.realpath(process.cwd()), input = await fs.realpath(path.resolve(selected));
const destination = path.join(project, 'assets/map-v2'), parent = path.dirname(destination);
if (input === destination || input.startsWith(destination + path.sep) || destination.startsWith(input + path.sep)) throw new Error('Choose a separate input dataset directory.');
const sourceStat = await fs.lstat(input);
if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) throw new Error('The selected map source must be a regular directory.');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function readFile(name, maximum = 64 * 1024 * 1024) {
  if (!/^[a-z][a-z0-9.-]+$/.test(name) || name.includes('..')) throw new Error('Unsafe map component filename.');
  const file = path.join(input, name), stat = await fs.lstat(file), real = await fs.realpath(file);
  if (!stat.isFile() || stat.isSymbolicLink() || !real.startsWith(input + path.sep) || stat.size > maximum) throw new Error('Invalid or oversized map component: ' + name);
  return fs.readFile(file);
}
const manifestBytes = await readFile('manifest.json', 256 * 1024), manifest = JSON.parse(manifestBytes);
if (manifest.schemaVersion !== 'campus-map/v2' || typeof manifest.version !== 'string' || !manifest.version.trim()
  || !manifest.componentHashes || typeof manifest.componentHashes !== 'object' || Array.isArray(manifest.componentHashes)) throw new Error('A complete campus-map/v2 manifest is required.');
const required = ['geography.geojson', 'display-geography.geojson', 'places.json', 'network.json', 'shared-facts.json', 'venues.json', 'sports-details.geojson', 'building-supplement.json'];
const allowed = new Set(required);
if (required.some(name => !Object.hasOwn(manifest.componentHashes, name))) throw new Error('The map manifest omits a required component.');
const components = new Map(); let totalBytes = 0;
for (const [name, expected] of Object.entries(manifest.componentHashes)) {
  if (!allowed.has(name) || typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)) throw new Error('Invalid map component record.');
  const bytes = await readFile(name);
  totalBytes += bytes.length;
  if (totalBytes > 128 * 1024 * 1024 || digest(bytes) !== expected) throw new Error('Map component size or hash mismatch: ' + name);
  const value = JSON.parse(bytes);
  if (name.endsWith('.geojson') && (value.type !== 'FeatureCollection' || !Array.isArray(value.features))) throw new Error('Invalid GeoJSON component: ' + name);
  if (name === 'places.json' && (!Array.isArray(value) || value.some(point => point?.personal)))
    throw new Error('The shared map needs a public place array. Keep personal overlays in their separate owner.');
  if (name === 'shared-facts.json' && value.version !== manifest.version) throw new Error('Map fact version differs from its manifest.');
  components.set(name, bytes);
}
const sourceBytes = await readFile('source.osm.json.gz');
JSON.parse(gunzipSync(sourceBytes, { maxOutputLength: 64 * 1024 * 1024 }).toString('utf8'));
const notice = await readFile('source.md', 1024 * 1024).catch(async error => {
  // The conventional notice name is uppercase; it is data, never executed.
  const file = path.join(input, 'SOURCE.md'), stat = await fs.lstat(file), real = await fs.realpath(file);
  if (!stat.isFile() || stat.isSymbolicLink() || !real.startsWith(input + path.sep) || stat.size > 1024 * 1024) throw error;
  return fs.readFile(file);
});
if (!notice.toString('utf8').trim()) throw new Error('The dataset must include its source and redistribution terms in SOURCE.md.');
await fs.mkdir(parent, { recursive: true });
const staging = destination + '.staging-' + randomUUID(), previous = destination + '.previous-' + randomUUID();
let movedPrevious = false, published = false;
const removeSibling = async target => {
  const absolute = path.resolve(target);
  if (path.dirname(absolute) !== parent || !absolute.startsWith(destination + '.') || absolute === destination) throw new Error('Unsafe map staging cleanup path.');
  await fs.rm(absolute, { recursive: true, force: true });
};
try {
  await fs.mkdir(staging);
  for (const [name, bytes] of components) await fs.writeFile(path.join(staging, name), bytes);
  await fs.writeFile(path.join(staging, 'source.osm.json.gz'), sourceBytes);
  await fs.writeFile(path.join(staging, 'SOURCE.md'), notice);
  const bridge = path.join(staging, 'shared-bridge.mjs');
  const compiled = spawnSync(process.execPath, [path.join(project, 'scripts/build-map-bridge.mjs'), bridge],
    { cwd: project, encoding: 'utf8', windowsHide: true });
  if (compiled.error) throw compiled.error;
  if (compiled.status !== 0) throw new Error('The project map adapter could not be built. Install the locked dependencies first.');
  // All dependent files exist before the manifest is written or the directory becomes visible.
  await fs.writeFile(path.join(staging, 'manifest.json'), manifestBytes);
  const loaded = spawnSync(process.execPath, [bridge, staging], { input: JSON.stringify({ id: 'map-import', op: 'snapshot' }) + '\n',
    cwd: project, encoding: 'utf8', windowsHide: true, maxBuffer: 128 * 1024 * 1024, timeout: 30_000 });
  if (loaded.error) throw loaded.error;
  const snapshot = loaded.status === 0 ? JSON.parse(loaded.stdout.trim()) : undefined;
  if (!snapshot?.ok || snapshot.value?.manifest?.dataStatus !== 'ready' || snapshot.value.manifest.version !== manifest.version)
    throw new Error('The dataset did not load through the product map owner. The previous map was retained.');
  if (await fs.access(destination).then(() => true, () => false)) { await fs.rename(destination, previous); movedPrevious = true; }
  await fs.rename(staging, destination); published = true;
  if (movedPrevious) await removeSibling(previous);
  console.log(JSON.stringify({ imported: manifest.version, components: components.size, source: 'explicitly selected dataset', deviceLocationUsed: false }));
} catch (error) {
  if (!published && movedPrevious && !(await fs.access(destination).then(() => true, () => false))) await fs.rename(previous, destination);
  await removeSibling(staging); throw error;
}
