import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { Tokenizer, type Encoding } from '@huggingface/tokenizers';
import * as ort from 'onnxruntime-node';
import {
  EMBEDDING_CONTRACT, LocalEmbeddingError,
  type EmbeddingPassageResult, type EmbeddingResult, type EmbeddingWorkerRequest,
  type EmbeddingWorkerResponse,
} from './embedding-contract';

type Model = { tokenizer: Tokenizer; session: ort.InferenceSession; outputName: string; fixedSequenceLength?: number };
const port = parentPort;
if (!port) throw new Error('The local embedding module must run in its host-owned worker.');

let modelPromise: Promise<Model> | undefined;
let queue = Promise.resolve();
port.on('message', (request: EmbeddingWorkerRequest) => {
  // Only one native call is active. A rejected request does not poison this queue.
  queue = queue.then(() => handle(request)).catch(() => undefined);
});

function cancelled(flag: Int32Array): void {
  if (Atomics.load(flag, 0)) throw new LocalEmbeddingError('embedding_cancelled', "Local semantic candidate work was cancelled.");
}

async function handle(request: EmbeddingWorkerRequest): Promise<void> {
  try {
    if (!EMBEDDING_CONTRACT.enabled)
      throw new LocalEmbeddingError('embedding_unavailable', 'No reviewed local embedding model is configured.');
    if (!Number.isSafeInteger(request.id) || request.id <= 0 || !(request.cancellation instanceof SharedArrayBuffer)
      || request.cancellation.byteLength !== Int32Array.BYTES_PER_ELEMENT)
      throw new LocalEmbeddingError('embedding_input', "The local semantic request is invalid.");
    const flag = new Int32Array(request.cancellation);
    cancelled(flag);
    if (typeof request.text !== 'string' || !request.text.length)
      throw new LocalEmbeddingError('embedding_input', "The local semantic passage is empty.");
    if (/[\uD800-\uDFFF]/u.test(request.text))
      throw new LocalEmbeddingError('embedding_input', "The local semantic passage contains invalid Unicode. The original was not rewritten to continue.");
    const points = Array.from(request.text);
    if (points.length > EMBEDDING_CONTRACT.maxCodePointsPerRequest)
      throw new LocalEmbeddingError('embedding_input', "The local semantic passage exceeds the complete-request range.");
    if (request.kind !== 'query' && request.kind !== 'passage')
      throw new LocalEmbeddingError('embedding_input', "The local semantic request type is invalid.");
    if (request.kind === 'passage' && (!Number.isSafeInteger(request.startCodePoint) || request.startCodePoint < 0
      || !Number.isSafeInteger(request.endCodePoint) || request.endCodePoint - request.startCodePoint !== points.length))
      throw new LocalEmbeddingError('embedding_input', "The local semantic source range does not match the complete passage.");
    const model = await (modelPromise ||= loadModel());
    cancelled(flag);
    let result: EmbeddingResult;
    if (request.kind === 'query') {
      if (!request.text.trim()) throw new LocalEmbeddingError('embedding_input', "The local semantic query is empty.");
      const encoding = encode(model.tokenizer, EMBEDDING_CONTRACT.queryPrefix + request.text);
      if (encoding.ids.length > EMBEDDING_CONTRACT.maxTokens)
        throw new LocalEmbeddingError('embedding_query_too_long', "The local semantic query exceeds 512 tokens. Narrow its scope; the query was not truncated.");
      result = { kind: 'query', methodId: EMBEDDING_CONTRACT.methodId,
        tokenCount: encoding.ids.length, vector: await infer(model, encoding, flag) };
    } else {
      const chunks: EmbeddingPassageResult['chunks'] = [];
      let start = 0;
      while (start < points.length) {
        cancelled(flag);
        const chunk = boundedChunk(model.tokenizer, points, start, flag);
        const text = points.slice(start, chunk.end).join('');
        const vector = await infer(model, chunk.encoding, flag);
        chunks.push({ startCodePoint: request.startCodePoint + start, endCodePoint: request.startCodePoint + chunk.end,
          textHash: createHash('sha256').update(text, 'utf8').digest('hex'), tokenCount: chunk.encoding.ids.length, vector });
        if (chunk.end === points.length) break;
        // Overlap remains wholly inside this one authorized contiguous range.
        start = chunk.end - Math.min(EMBEDDING_CONTRACT.overlapCodePoints, Math.floor((chunk.end - start) / 4));
      }
      result = { kind: 'passage', methodId: EMBEDDING_CONTRACT.methodId, chunks,
        coverage: { unit: 'unicode_code_point', start: request.startCodePoint, end: request.endCodePoint, complete: true } };
    }
    cancelled(flag);
    const transfer = result.kind === 'query' ? [result.vector.buffer as ArrayBuffer]
      : result.chunks.map(chunk => chunk.vector.buffer as ArrayBuffer);
    port!.postMessage({ id: request.id, ok: true, result } satisfies EmbeddingWorkerResponse, transfer);
  } catch (error) {
    const failure = error instanceof LocalEmbeddingError ? error
      : new LocalEmbeddingError('embedding_unavailable', "Local semantic candidates are unavailable. Existing original-text search remains available.");
    // Native/library errors may contain local paths; never forward their raw text.
    port!.postMessage({ id: request.id, ok: false, error: { code: failure.code, message: failure.message } } satisfies EmbeddingWorkerResponse);
  }
}

function encode(tokenizer: Tokenizer, text: string): Encoding {
  // 0.2.0 has no truncation/max_length option and does not implement JSON
  // truncation. Count this complete result, including CLS and SEP, ourselves.
  const encoded = tokenizer.encode(text, { add_special_tokens: true, return_token_type_ids: true });
  if (encoded.ids.length < 2 || encoded.ids[0] !== EMBEDDING_CONTRACT.clsTokenId
    || encoded.ids[encoded.ids.length - 1] !== EMBEDDING_CONTRACT.sepTokenId
    || encoded.attention_mask.length !== encoded.ids.length || encoded.token_type_ids?.length !== encoded.ids.length
    || !encoded.ids.every(value => Number.isSafeInteger(value) && value >= 0)
    || !encoded.attention_mask.every(value => value === 1) || !encoded.token_type_ids.every(value => value === 0))
    throw new LocalEmbeddingError('embedding_contract', "The local semantic tokenization contract does not match.");
  return encoded;
}

function boundedChunk(tokenizer: Tokenizer, points: string[], start: number, flag: Int32Array): { end: number; encoding: Encoding } {
  const maximum = Math.min(points.length, start + EMBEDDING_CONTRACT.maxChunkCodePoints);
  let encoding = encode(tokenizer, points.slice(start, maximum).join(''));
  if (encoding.ids.length <= EMBEDDING_CONTRACT.maxTokens) return { end: maximum, encoding };
  let low = start + 1, high = maximum - 1;
  let selected: { end: number; encoding: Encoding } | undefined;
  while (low <= high) {
    cancelled(flag);
    const end = low + Math.floor((high - low) / 2);
    encoding = encode(tokenizer, points.slice(start, end).join(''));
    if (encoding.ids.length <= EMBEDDING_CONTRACT.maxTokens) { selected = { end, encoding }; low = end + 1; }
    else high = end - 1;
  }
  // WordPiece counts need not be monotonic as a word grows. This need not be
  // the longest possible slice: every chosen slice is independently within the
  // token limit, and advancing over original code points preserves all text.
  if (!selected) {
    encoding = encode(tokenizer, points[start]);
    if (encoding.ids.length > EMBEDDING_CONTRACT.maxTokens)
      throw new LocalEmbeddingError('embedding_input', "A single original character cannot fit the model's range. Processing did not continue with a truncated character.");
    selected = { end: start + 1, encoding };
  }
  return selected;
}

async function infer(model: Model, encoding: Encoding, flag: Int32Array): Promise<Float32Array> {
  cancelled(flag);
  if (encoding.ids.length > EMBEDDING_CONTRACT.maxTokens)
    throw new LocalEmbeddingError('embedding_contract', "The local semantic input exceeds the pinned model range.");
  const sequenceLength = model.fixedSequenceLength || encoding.ids.length;
  const ids = new BigInt64Array(sequenceLength), attention = new BigInt64Array(sequenceLength), types = new BigInt64Array(sequenceLength);
  ids.fill(BigInt(EMBEDDING_CONTRACT.padTokenId));
  ids.set(BigInt64Array.from(encoding.ids, value => BigInt(value)));
  attention.set(BigInt64Array.from(encoding.attention_mask, value => BigInt(value)));
  types.set(BigInt64Array.from(encoding.token_type_ids!, value => BigInt(value)));
  const dimensions = [1, sequenceLength];
  const output = await model.session.run({ input_ids: new ort.Tensor('int64', ids, dimensions),
    attention_mask: new ort.Tensor('int64', attention, dimensions), token_type_ids: new ort.Tensor('int64', types, dimensions) }, [model.outputName]);
  cancelled(flag);
  const tensor = output[model.outputName];
  if (!(tensor instanceof ort.Tensor) || tensor.type !== 'float32' || !(tensor.data instanceof Float32Array)
    || tensor.dims.length !== 3 || tensor.dims[0] !== 1 || tensor.dims[1] !== sequenceLength
    || tensor.dims[2] !== EMBEDDING_CONTRACT.dimensions
    || tensor.data.length !== sequenceLength * EMBEDDING_CONTRACT.dimensions)
    throw new LocalEmbeddingError('embedding_contract', "The local semantic output dimensions do not match.");
  const vector = new Float32Array(EMBEDDING_CONTRACT.dimensions);
  let sum = 0;
  for (let index = 0; index < vector.length; index++) {
    const value = tensor.data[index];
    if (!Number.isFinite(value)) throw new LocalEmbeddingError('embedding_contract', "The local semantic candidate contains invalid numbers.");
    vector[index] = value;
    sum += value * value;
  }
  if (!Number.isFinite(sum) || sum <= 0) throw new LocalEmbeddingError('embedding_contract', "The local semantic candidate cannot be normalized.");
  const norm = Math.sqrt(sum);
  for (let index = 0; index < vector.length; index++) vector[index] /= norm;
  return vector;
}

async function loadModel(): Promise<Model> {
  const directory = (workerData as { resourceDirectory?: unknown }).resourceDirectory;
  if (typeof directory !== 'string' || !isAbsolute(directory))
    throw new LocalEmbeddingError('embedding_configuration', "The local semantic resource directory is invalid.");
  const root = await realpath(directory);
  const assets = new Map<string, Buffer>();
  for (const asset of EMBEDDING_CONTRACT.assets) {
    const location = await realpath(join(root, asset.path));
    const within = relative(root, location);
    if (isAbsolute(within) || within === '..' || within.startsWith(`..${sep}`))
      throw new LocalEmbeddingError('embedding_assets', "A local semantic resource escapes its pinned directory.");
    const info = await stat(location);
    if (!info.isFile() || info.size !== asset.bytes)
      throw new LocalEmbeddingError('embedding_assets', "Pinned local semantic resources are incomplete.");
    const bytes = await readFile(location);
    if (bytes.length !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256)
      throw new LocalEmbeddingError('embedding_assets', "Pinned local semantic resource versions do not match.");
    assets.set(asset.path, bytes);
  }
  const config = JSON.parse(assets.get('model/config.json')!.toString('utf8')) as Record<string, unknown>;
  if (config.model_type !== 'bert' || config.hidden_size !== EMBEDDING_CONTRACT.dimensions
    || config.max_position_embeddings !== EMBEDDING_CONTRACT.maxTokens)
    throw new LocalEmbeddingError('embedding_contract', "The local semantic model configuration does not match.");
  const tokenizer = new Tokenizer(JSON.parse(assets.get('model/tokenizer.json')!.toString('utf8')),
    JSON.parse(assets.get('model/tokenizer_config.json')!.toString('utf8')));
  // Only already-hashed local bytes reach ORT. No Hub loader, remote code or
  // provider/model fallback is involved, and no optimized model is written out.
  const session = await ort.InferenceSession.create(assets.get('model/onnx/model_quantized.onnx')!, {
    executionProviders: ['cpu'], executionMode: 'sequential', intraOpNumThreads: 1, interOpNumThreads: 1,
    graphOptimizationLevel: 'all', logSeverityLevel: 3,
  });
  try {
    const inputs = session.inputMetadata;
    const expectedInputs = ['input_ids', 'attention_mask', 'token_type_ids'];
    const batch = (dimension: string | number) => typeof dimension === 'string' || dimension === 1;
    const sequence = (dimension: string | number) => typeof dimension === 'string' || dimension === EMBEDDING_CONTRACT.maxTokens;
    if (session.inputNames.length !== expectedInputs.length || inputs.length !== expectedInputs.length
      || !expectedInputs.every(name => session.inputNames.includes(name) && inputs.some(item => item.name === name))
      || !inputs.every(item => item.isTensor && item.type === 'int64' && item.shape.length === 2
        && batch(item.shape[0]) && sequence(item.shape[1])))
      throw new LocalEmbeddingError('embedding_contract', "The local semantic input names, types or dimensions do not match.");
    // Discover the unique token-level output from metadata rather than guessing
    // an exporter-specific output name or selecting an unrelated pooled tensor.
    const outputs = session.outputMetadata.filter(item => item.isTensor && item.type === 'float32' && item.shape.length === 3
      && batch(item.shape[0]) && sequence(item.shape[1]) && item.shape[2] === EMBEDDING_CONTRACT.dimensions);
    if (outputs.length !== 1 || !session.outputNames.includes(outputs[0].name))
      throw new LocalEmbeddingError('embedding_contract', "Local semantic inference did not supply a unique fixed-dimensional token output.");
    const fixed = inputs.some(item => item.isTensor && typeof item.shape[1] === 'number');
    return { tokenizer, session, outputName: outputs[0].name,
      ...(fixed ? { fixedSequenceLength: EMBEDDING_CONTRACT.maxTokens } : {}) };
  } catch (error) {
    await session.release().catch(() => undefined);
    throw error;
  }
}
