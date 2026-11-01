import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ImageAttachment } from '../../shared/types';
import { boundedImageSize, type RasterMediaType } from './raster';

export interface PdfCrop { x: number; y: number; width: number; height: number }
export interface PdfRequest {
  operation: 'describe' | 'read' | 'table' | 'render' | 'prepare_image';
  mediaType?: RasterMediaType;
  page?: number;
  /** Fractions of the rotated page, with its top-left corner as the origin. */
  crop?: PdfCrop;
}
export interface PdfTextItem {
  text: string;
  transform: number[];
  /** [left, top, right, bottom], normalized in the rotated page. */
  bbox: [number, number, number, number];
  bboxPdfPoints: [number, number, number, number];
  coordinateSpace: 'normalized_rotated_page';
  fontName: string;
  dir: string;
  hasEOL: boolean;
}
export interface PdfTable {
  id: string;
  bbox?: [number, number, number, number];
  bboxPdfPoints?: [number, number, number, number];
  coordinateSpace: 'normalized_rotated_page';
  rows: (string | null)[][];
  extraction: 'tagged_pdf' | 'pdf_geometry';
  warning?: string;
}
export interface PdfResult {
  pageCount: number;
  page?: number;
  text?: string;
  items?: PdfTextItem[];
  extraction?: 'pdf_text_layer';
  needsVisual?: boolean;
  tables?: PdfTable[];
  coverage?: { complete: boolean; reason?: string };
  image?: ImageAttachment;
  originalSize?: { width: number; height: number };
  rendererVersion?: string;
  crop?: PdfCrop;
  bboxPdfPoints?: [number, number, number, number];
}

export const MATERIAL_READER_VERSION = 'pdfjs-dist6.2.108-canvas1.0.6';
export const MAX_PDF_BYTES = 20_000_000;
const MAX_WIRE_BYTES = 32 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const WORKER_TIMEOUT_MS = 30_000;
const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

function failure(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

function validateRequest(request: PdfRequest) {
  if (!request || !['describe', 'read', 'table', 'render', 'prepare_image'].includes(request.operation)) {
    throw failure('MATERIAL_PDF_REQUEST', 'Invalid PDF operation.');
  }
  if (request.page !== undefined && (!Number.isInteger(request.page) || request.page < 1)) {
    throw failure('MATERIAL_PDF_PAGE', 'PDF page numbers start at 1.');
  }
  if (request.crop !== undefined) {
    const { x, y, width, height } = request.crop;
    if (request.operation !== 'render' || ![x, y, width, height].every(Number.isFinite)
      || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) {
      throw failure('MATERIAL_PDF_CROP', 'The crop must be within the page, with coordinates and dimensions expressed as fractions from 0 to 1.');
    }
  }
}

async function checkedRuntime(root: string) {
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Invalid material runtime directory.');
  const manifestStat = await fs.lstat(path.join(root, 'manifest.json'));
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.size > 256 * 1024) throw new Error('Invalid material runtime manifest.');
  const manifestBytes = await fs.readFile(path.join(root, 'manifest.json'));
  if (manifestBytes.length > 256 * 1024) throw new Error('Material runtime manifest exceeds its limit.');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const native = process.platform === 'win32' && process.arch === 'x64' ? { package: '@napi-rs/canvas-win32-x64-msvc', library: 'skia.win32-x64-msvc.node' }
    : process.platform === 'darwin' && ['x64', 'arm64'].includes(process.arch) ? { package: `@napi-rs/canvas-darwin-${process.arch}`, library: `skia.darwin-${process.arch}.node` } : undefined;
  if (manifest.version !== 1 || manifest.readerVersion !== MATERIAL_READER_VERSION
    || manifest.dependencies?.['pdfjs-dist'] !== '6.2.108'
    || manifest.dependencies?.['@napi-rs/canvas'] !== '1.0.6'
    || manifest.platform !== process.platform || manifest.arch !== process.arch
    || !native || manifest.dependencies?.[native.package] !== '1.0.6' || manifest.nativeLibrary !== `node_modules/${native.package}/${native.library}`
    || manifest.worker?.path !== 'worker.cjs' || !Array.isArray(manifest.files)
    || manifest.files.length === 0 || manifest.files.length > 1000) throw new Error('Material runtime version/manifest mismatch.');
  if (process.env.ANIMA_MATERIAL_RUNTIME_MANIFEST_SHA256
    && sha256(manifestBytes) !== process.env.ANIMA_MATERIAL_RUNTIME_MANIFEST_SHA256) {
    throw new Error('Material runtime manifest fingerprint mismatch.');
  }
  const names = new Set<string>();
  const realRoot = await fs.realpath(root);
  let totalBytes = 0;
  for (const file of manifest.files) {
    const relative = file?.path;
    if (typeof relative !== 'string' || !/^[A-Za-z0-9_@.+/-]+$/.test(relative)
      || relative.startsWith('/') || relative.split('/').some((part: string) => !part || part === '.' || part === '..')
      || names.has(relative.toLowerCase()) || !/^[a-f0-9]{64}$/.test(file.sha256)
      || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > 64 * 1024 * 1024) throw new Error('Unsafe material runtime file record.');
    totalBytes += file.bytes;
    if (totalBytes > 256 * 1024 * 1024) throw new Error('Material runtime exceeds its budget.');
    names.add(relative.toLowerCase());
    const filename = path.resolve(root, relative);
    if (!filename.startsWith(root + path.sep)) throw new Error('Material runtime path escaped its root.');
    const stat = await fs.lstat(filename);
    const realFile = await fs.realpath(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || !realFile.startsWith(realRoot + path.sep)
      || stat.size !== file.bytes || sha256(await fs.readFile(filename)) !== file.sha256) {
      throw new Error('Material runtime file fingerprint mismatch.');
    }
  }
  const workerRecord = manifest.files.find((file: { path: string }) => file.path === 'worker.cjs');
  if (!workerRecord || workerRecord.sha256 !== manifest.worker.sha256) throw new Error('Material worker fingerprint mismatch.');
  for (const required of ['node_modules/pdfjs-dist/legacy/build/pdf.mjs', 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
    'node_modules/pdfjs-dist/legacy/LICENSE_COREJS_3.49.0', 'node_modules/pdfjs-dist/LICENSE', 'node_modules/pdfjs-dist/cmaps/LICENSE',
    'node_modules/pdfjs-dist/standard_fonts/LICENSE_FOXIT', 'node_modules/pdfjs-dist/standard_fonts/LICENSE_LIBERATION',
    'node_modules/pdfjs-dist/wasm/openjpeg.wasm', 'node_modules/pdfjs-dist/wasm/qcms_bg.wasm', 'node_modules/pdfjs-dist/wasm/jbig2.wasm',
    'node_modules/pdfjs-dist/iccs/CGATS001Compat-v2-micro.icc', 'node_modules/@napi-rs/canvas/LICENSE',
    'node_modules/@napi-rs/canvas/index.js', manifest.nativeLibrary,
    ...(process.platform === 'win32' ? ['node_modules/@napi-rs/canvas-win32-x64-msvc/icudtl.dat'] : [])]) {
    if (!names.has(required.toLowerCase())) throw new Error('Material runtime is incomplete.');
  }
  const actualNames = new Set<string>();
  const walk = async (directory: string, prefix = '') => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const relative = prefix ? prefix + '/' + entry.name : entry.name;
      if (entry.isSymbolicLink()) throw new Error('Material runtime contains a symlink.');
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), relative);
      else if (entry.isFile() && relative !== 'manifest.json') actualNames.add(relative.toLowerCase());
      else if (!entry.isFile()) throw new Error('Material runtime contains a non-file entry.');
      if (actualNames.size > 1000) throw new Error('Material runtime exceeds its file budget.');
    }
  };
  await walk(root);
  if (actualNames.size !== names.size || [...actualNames].some(name => !names.has(name))) throw new Error('Material runtime file set mismatch.');
  return { worker: path.join(root, 'worker.cjs'), nativeLibrary: path.join(root, manifest.nativeLibrary) };
}

/** Only verified bytes enter the child. No file/URL/model transport is accepted. */
export async function parsePdf(bytes: Buffer, request: PdfRequest, signal: AbortSignal): Promise<PdfResult> {
  if (signal.aborted) throw failure('MATERIAL_PDF_CANCELLED', 'PDF reading stopped.');
  validateRequest(request);
  if (request.operation === 'prepare_image' && (request.page !== undefined || request.crop !== undefined
    || !boundedImageSize(bytes, request.mediaType || '')))
    throw failure('MATERIAL_PDF_IMAGE', 'The image format, dimensions, or size cannot be read reliably.');
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_PDF_BYTES) {
    throw failure('MATERIAL_PDF_RESOURCE_LIMIT', 'The PDF is empty or exceeds the 20,000,000-byte reading limit.');
  }
  const root = path.resolve(process.env.ANIMA_MATERIAL_RUNTIME_ROOT || path.join(process.cwd(), 'dist-electron/material-runtime'));
  let runtime: { worker: string; nativeLibrary: string };
  try { runtime = await checkedRuntime(root); }
  catch { throw failure('MATERIAL_PDF_RUNTIME', 'The local PDF reader is missing or failed its integrity check. Rebuild or reinstall the app.'); }
  if (signal.aborted) throw failure('MATERIAL_PDF_CANCELLED', 'PDF reading stopped.');
  const input = JSON.stringify({ version: 1, bytes: bytes.toString('base64'), request });
  if (Buffer.byteLength(input) > MAX_WIRE_BYTES) throw failure('MATERIAL_PDF_RESOURCE_LIMIT', 'The PDF input exceeds the reading limit.');
  const env: NodeJS.ProcessEnv = {
    ELECTRON_RUN_AS_NODE: '1', NODE_ENV: 'production', DISABLE_SYSTEM_FONTS_LOAD: '1',
    NAPI_RS_NATIVE_LIBRARY_PATH: runtime.nativeLibrary,
  };
  // Allow only the OS loader/temp variables, never API keys, proxies or Node hooks.
  for (const name of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR']) if (process.env[name]) env[name] = process.env[name];
  return new Promise<PdfResult>((resolve, reject) => {
    const child = spawn(process.execPath, ['--max-old-space-size=512', '--disable-proto=throw', runtime.worker], {
      cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    let terminal: Error | undefined;
    let outputBytes = 0;
    const chunks: Buffer[] = [];
    let diagnosticBytes = 0;
    const stop = (error: Error) => {
      if (!terminal) terminal = error;
      child.kill('SIGKILL');
    };
    const abort = () => stop(failure('MATERIAL_PDF_CANCELLED', 'PDF reading stopped.'));
    const timer = setTimeout(() => stop(failure('MATERIAL_PDF_TIMEOUT', 'PDF reading exceeded the 30-second limit.')), WORKER_TIMEOUT_MS);
    signal.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) stop(failure('MATERIAL_PDF_RESOURCE_LIMIT', 'The PDF page result exceeds the output limit. No truncated or partial text was adopted.'));
      else chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      diagnosticBytes += chunk.length;
      if (diagnosticBytes > 64 * 1024) stop(failure('MATERIAL_PDF_RESOURCE_LIMIT', 'PDF diagnostics exceeded their limit.'));
      // Diagnostics are neither material text nor evidence returned to the model.
    });
    child.on('error', () => { terminal ||= failure('MATERIAL_PDF_RUNTIME', 'The local PDF reader could not start.'); });
    child.stdin.on('error', () => { terminal ||= failure('MATERIAL_PDF_RUNTIME', 'The material could not be sent to the local PDF reader.'); });
    child.on('close', (code) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (terminal) { reject(terminal); return; }
      let reply: { ok?: boolean; result?: PdfResult; error?: { code?: string; message?: string } };
      try { reply = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { reject(failure('MATERIAL_PDF_PROTOCOL', 'The PDF reader did not return a valid result.')); return; }
      if (code !== 0 || reply.ok !== true || !reply.result || !Number.isInteger(reply.result.pageCount)) {
        const allowed = /^MATERIAL_PDF_[A-Z_]+$/.test(reply.error?.code || '') ? reply.error!.code! : 'MATERIAL_PDF_PARSE';
        reject(failure(allowed, reply.error?.message || 'The PDF could not be read. No complete page result was obtained.')); return;
      }
      resolve(reply.result);
    });
    if (signal.aborted) abort();
    else child.stdin.end(input);
  });
}
