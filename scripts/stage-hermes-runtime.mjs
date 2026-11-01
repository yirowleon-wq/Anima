import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { stageMaterialRuntime } from './material-runtime.mjs';
import { stageEmbeddingRuntime } from './embedding-runtime.mjs';

if (!['win32', 'darwin'].includes(process.platform)) throw new Error('Desktop packaging supports Windows and macOS.');
const project = fs.realpathSync(process.cwd()), source = path.join(project, '.runtime/hermes-agent');
const lock = JSON.parse(fs.readFileSync('runtime/hermes/lock.json', 'utf8'));
const installed = JSON.parse(fs.readFileSync('.runtime/hermes-install.json', 'utf8'));
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const run = (file, args, cwd = project) => execFileSync(file, args, { cwd, encoding: 'utf8', windowsHide: true });
if (run('git', ['rev-parse', 'HEAD'], source).trim() !== lock.commit) throw new Error('Runtime source is not the pinned Hermes revision.');
for (const patch of installed.patches) if (hash(path.join(source, patch.file)) !== patch.sha256) throw new Error('Unrecorded adapter changes: ' + patch.file);
const changed = run('git', ['diff', '--name-only'], source).trim().split(/\r?\n/).filter(Boolean);
// The upstream website is never staged. It may be removed locally, but
// modifications to its files remain unreviewed.
const deleted = new Set(run('git', ['diff', '--name-only', '--diff-filter=D'], source).trim().split(/\r?\n/).filter(Boolean));
if (changed.some(file => !(file.startsWith('website/') && deleted.has(file)) && !installed.patches.some(patch => patch.file === file))) throw new Error('Unreviewed changes in pinned runtime source.');
const venvPython = path.join(source, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python3');
const python = JSON.parse(run(venvPython, ['-I', '-B', '-c', 'import sys,sysconfig,json; print(json.dumps({"base":sys.base_prefix,"packages":sysconfig.get_path("purelib"),"version":sys.version}))']));
const base = fs.realpathSync(python.base), packages = fs.realpathSync(python.packages);
const target = path.resolve('build/runtime-staging-' + Date.now());
if (!target.startsWith(path.join(project, 'build') + path.sep)) throw new Error('Runtime staging escaped the project.');
fs.mkdirSync(target, { recursive: true });
const pyTarget = path.join(target, '.runtime/python');
const omitted = new Set(['__pycache__', 'test', 'tests', 'idlelib', 'ensurepip', '.git']);
function copyTree(from, to, boundary, packageTree = false) {
  const stat = fs.lstatSync(from), actual = fs.realpathSync(from);
  if (actual !== boundary && !actual.startsWith(boundary + path.sep)) throw new Error('Runtime source redirected outside its selected root.');
  if (stat.isSymbolicLink()) {
    // Materialize only links whose actual bytes remain within the selected distribution.
    const resolved = fs.statSync(actual);
    if (resolved.isDirectory()) throw new Error('Directory symlinks need explicit runtime packaging review.');
    fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(actual, to); return;
  }
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(from)) {
      if (omitted.has(name) || (!packageTree && name === 'site-packages') || /\.py[co]$/.test(name)
        || (packageTree && (/\.(?:pth|egg-link)$/.test(name) || name.startsWith('__editable__') || name === 'direct_url.json'))) continue;
      copyTree(path.join(from, name), path.join(to, name), boundary, packageTree);
    }
  } else if (stat.isFile()) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); }
  else throw new Error('Runtime source contains a non-file entry.');
}
if (process.platform === 'win32') {
  for (const entry of fs.readdirSync(base)) if (['Lib', 'DLLs', 'LICENSE.txt'].includes(entry) || /\.(?:exe|dll)$/.test(entry))
    copyTree(path.join(base, entry), path.join(pyTarget, entry), base);
} else {
  // A relocatable CPython distribution is required. Framework installations fail the independence check below.
  for (const entry of ['bin', 'lib', 'include', 'share']) if (fs.existsSync(path.join(base, entry)))
    copyTree(path.join(base, entry), path.join(pyTarget, entry), base);
  for (const entry of ['LICENSE.txt', 'LICENSE']) if (fs.existsSync(path.join(base, entry)))
    copyTree(path.join(base, entry), path.join(pyTarget, entry), base);
}
const packageTarget = path.join(pyTarget, process.platform === 'win32' ? 'Lib/site-packages' : `lib/python${lock.python}/site-packages`);
copyTree(packages, packageTarget, packages, true);
const excluded = new Set(['.git', '.venv', '__pycache__', 'node_modules', 'tests', 'tests-js', 'docs', 'website', 'ui-tui', 'web', '.github', 'apps', 'docker', 'evals', 'mcp-research-data', 'datagen-config-examples', 'screenshots', '.env']);
let copiedSourceFiles = 0;
for (const relative of run('git', ['ls-files', '-z'], source).split('\0').filter(Boolean)) {
  if (relative.split('/').some(part => excluded.has(part) || part.startsWith('.env'))) continue;
  const from = path.resolve(source, relative), to = path.resolve(target, '.runtime/hermes-agent', relative);
  if (!from.startsWith(source + path.sep) || !to.startsWith(target + path.sep) || fs.lstatSync(from).isSymbolicLink()) throw new Error('Unsafe pinned runtime source path.');
  fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); copiedSourceFiles++;
}
fs.mkdirSync(path.join(target, '.runtime/hermes-home'), { recursive: true });
fs.copyFileSync('.runtime/hermes-home/config.yaml', path.join(target, '.runtime/hermes-home/config.yaml'));
fs.cpSync('runtime/hermes', path.join(target, 'runtime/hermes'), { recursive: true, filter: file => !file.includes('__pycache__') });
const pythonLicense = ['LICENSE.txt', 'LICENSE', `lib/python${lock.python}/LICENSE.txt`].map(name => path.join(base, name)).find(file => fs.existsSync(file));
if (!pythonLicense) throw new Error('The selected Python distribution has no located license.');
const stagedPython = path.join(pyTarget, process.platform === 'win32' ? 'python.exe' : 'bin/python3');
const info = JSON.parse(run(stagedPython, ['-I', '-B', '-c', 'import sys,json,openai,httpx; print(json.dumps({"python":sys.version,"base":sys.base_prefix,"openai":openai.__version__}))'], target));
if (!path.resolve(info.base).startsWith(path.resolve(pyTarget))) throw new Error('Staged Python relies on the machine installation. Use a relocatable CPython distribution.');
const materialRuntime = await stageMaterialRuntime(path.resolve('build/material-runtime-staging-' + Date.now()));
const embeddingLock = fs.existsSync('runtime/embedding/lock.json') ? JSON.parse(fs.readFileSync('runtime/embedding/lock.json', 'utf8')) : undefined;
const embeddingRuntime = embeddingLock?.enabled === true ? await stageEmbeddingRuntime(path.resolve('build/embedding-runtime-staging-' + Date.now()), { immutableResource: true }) : undefined;
const manifest = { createdAt: new Date().toISOString(), platform: process.platform, arch: process.arch, lock,
  python: { version: info.python, openai: info.openai }, copiedSourceFiles,
  sourceSelection: 'Pinned tracked source and verified host adaptations; no untracked data or environment files.',
  sidecarSha256: hash('runtime/hermes/sidecar.py'), patches: installed.patches, dependencyLockSha256: hash(path.join(source, 'uv.lock')),
  containsPrivateData: false, optionalSemanticModel: !!embeddingRuntime };
fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2));
const baseConfig = JSON.parse(fs.readFileSync('package.json', 'utf8')).build;
const relative = file => path.relative(project, file).split(path.sep).join('/');
const config = { ...baseConfig, files: [...baseConfig.files,
  '!node_modules/pdfjs-dist{,/**/*}', '!node_modules/@napi-rs/canvas{,/**/*}', '!node_modules/@napi-rs/canvas-*{,/**/*}',
  '!node_modules/onnxruntime-node{,/**/*}', '!node_modules/onnxruntime-common{,/**/*}', '!node_modules/@huggingface/tokenizers{,/**/*}'],
  extraResources: [...(baseConfig.extraResources || []),
    { from: relative(target), to: 'hermes-runtime', filter: ['**/*', '**/.*', '**/.*/**'] },
    { from: relative(materialRuntime.path), to: 'material-runtime', filter: ['**/*'] },
    { from: relative(path.join(materialRuntime.path, 'node_modules')), to: 'material-runtime/node_modules', filter: ['**/*'] },
    ...(embeddingRuntime ? [
      { from: relative(embeddingRuntime.path), to: 'embedding-runtime', filter: ['**/*'] },
      { from: relative(path.join(embeddingRuntime.path, 'node_modules')), to: 'embedding-runtime/node_modules', filter: ['**/*'] },
    ] : [])] };
fs.writeFileSync('build/hermes-builder.json', JSON.stringify(config, null, 2));
console.log(JSON.stringify({ staged: relative(target), python: info.python, platform: process.platform, arch: process.arch, packageConfig: 'build/hermes-builder.json' }));
