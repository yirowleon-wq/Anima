import { DEFAULT_MODEL } from '../shared/types';
import { NOTE_ARGUMENT_CHARACTERS } from '../shared/notes';

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}
export type WireContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };
export interface WireMessage<Content = string | null> {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: Content;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  reasoning_content?: string;
}
export type ModelWireMessage = WireMessage<string | null | WireContentPart[]>;
/** Physical frame guards, independent of estimated/account token allowances.
 * A valid 64 KB program can exceed 20 KB once wrapped as JSON, especially with
 * escaped Unicode. Its actual grammar, sources and work stay with the owner. */
export const MODEL_WIRE_LIMITS = {
  textCharacters: 64000,
  toolArgumentCharacters: 512000,
  opaqueCharacters: 8 * 1024 * 1024,
} as const;
export function toolArgumentCharacterLimit(name: string) {
  return name === 'manage_note' ? NOTE_ARGUMENT_CHARACTERS : MODEL_WIRE_LIMITS.toolArgumentCharacters;
}
export function ssePendingCharacterLimit(tools: readonly ToolSpec[]) {
  // A provider event can wrap the entire original argument JSON in a string.
  return tools.some(tool => tool.function.name === 'manage_note') ? 2 * NOTE_ARGUMENT_CHARACTERS + 4096 : 1_000_000;
}
/** A foreground generative request can legitimately build a sizeable work.
 * Its original cancellation and authority expiry can still end it earlier. */
export const MODEL_REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
/** Hermes may join adjacent user messages as adjacent text parts. Preserve
 * all text and image order while keeping a single text part before the image. */
export function coalesceUserTextParts(messages: ModelWireMessage[]): ModelWireMessage[] {
  return messages.map(message => {
    if (message.role !== 'user' || !Array.isArray(message.content)) return message;
    const content: WireContentPart[] = [];
    for (const part of message.content) {
      const last = content.at(-1);
      if (part.type === 'text' && last?.type === 'text') last.text += '\n\n' + part.text;
      else content.push(part.type === 'text' ? { ...part } : part);
    }
    return { ...message, content };
  });
}
export interface ToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}
export interface Completion {
  responseModel?: string;
  transportAttempts?: number;
  content: string;
  tool_calls: ToolCall[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number; prompt_cache_hit_tokens?: number; prompt_cache_miss_tokens?: number; providerId?: string; model?: string; physical_attempts?: number; unreported_attempts?: number };
}
export interface CompletionOptions {
  /** Native request telemetry for the host only; never sent to a provider. */
  hostCompression?: import('../shared/harness').HermesCompressionReceipt;
  reasoningEffort?: 'low' | 'high' | 'max';
  allowTransportRetry?: boolean;
  phase?: 'control' | 'main' | 'child' | 'memory_extract' | 'memory_review' | 'completion_review' | 'verification' | 'compression' | 'evaluation_judge' | 'release_write' | 'release_review';
  actorId?: string;
  maxOutputTokens?: number;
  toolChoice?: { type: 'function'; function: { name: string } };
  thinking?: 'enabled' | 'disabled';
  strict?: boolean;
  /** Transport metadata only; partial arguments and reasoning never leave it. */
  onToolCallProgress?: (event: { kind: 'call'; id: string; name: string } | { kind: 'reset' }) => void;
}

/**
 * The host-facing, non-secret portion of the provider contract.  This is
 * deliberately about the protocol we implement, not a claim that every
 * model in the provider has the same limits.  Model-specific limits are
 * optional and are only populated when the caller has verified them.
 */
export interface ProviderMetadata {
  temporaryTestSubstitute?: boolean;
  replaces?: string;
  reasoningEffort?: string;
  providerId: string;
  endpoint: string;
  model: string;
  protocol: string;
  protocolVersion: string;
  capabilities: {
    thinking: boolean;
    reasoningContent: boolean;
    toolCalls: boolean;
    toolContinuation: boolean;
    strictTools: boolean;
    structuredOutput: boolean;
    modalities: string[];
    toolDialect: string;
    opaqueState: string;
  };
  limits: {
    /** Requested output size; enforcement depends on the transport below. */
    maxOutputTokens: number;
    /** App Server records usage without discarding an already complete answer. */
    outputEnforcement?: 'provider' | 'advisory';
    /** Verified provider input window, when supplied by an authoritative probe/config. */
    contextTokens?: number;
  };
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public retryable = false,
    public code = 'provider_error',
    public status?: number,
    public usage?: Completion['usage'],
  ) {
    super(message);
  }
}
/** Classify only the network TypeErrors already eligible for transport retry.
 * Apply after the existing retry decision; cancellation keeps its own owner. */
export function normalizeTransportError(error: unknown, signal: AbortSignal): unknown {
  if (signal.aborted || !(error instanceof TypeError) || !['terminated', 'fetch failed'].includes(error.message)) return error;
  const original = error as TypeError & { transportAttempts?: number; usage?: Completion['usage'] };
  const normalized = new ProviderError('The connection ended before the request completed. The visible text is kept, but this response is unfinished.', true, 'transport', undefined, original.usage);
  if (original.transportAttempts !== undefined) Object.assign(normalized, { transportAttempts: original.transportAttempts });
  return normalized;
}
export function friendlyError(e: unknown): string {
  if (e instanceof ProviderError) return e.message;
  if (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError'))
    return 'The request was stopped or timed out. Try again later.';
  return 'This request did not finish.';
}
export async function readSSE(response: Response, onData: (data: string) => void, signal?: AbortSignal, maximumPendingCharacters = 1_000_000) {
  signal?.throwIfAborted();
  if (!response.body) throw new ProviderError('The connection returned no content. Try again.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '',
    lines: string[] = [],
    eventCharacters = 0,
    skipLF = false;
  const emit = () => {
    signal?.throwIfAborted();
    if (lines.length) onData(lines.join('\n'));
    lines = [];
    eventCharacters = 0;
  };
  const line = (value: string) => {
    if (value.length > maximumPendingCharacters) throw new ProviderError('The returned content exceeded this request’s limit.');
    if (!value) {
      emit();
      return;
    }
    if (value === 'data' || value.startsWith('data:')) {
      const data = value === 'data' ? '' : value.slice(5).replace(/^ /, '');
      eventCharacters += data.length + (lines.length ? 1 : 0);
      if (eventCharacters > maximumPendingCharacters) throw new ProviderError('The returned content exceeded this request’s limit.');
      lines.push(data);
    }
    // SSE IDs identify a resume position, not unique content. This reader
    // never reconnects, so equal IDs must not swallow later deltas.
  };
  const abort = () => {
    void reader.cancel(signal?.reason).catch(() => {});
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      let decoded = decoder.decode(value, { stream: !done });
      if (skipLF && decoded) {
        if (decoded.startsWith('\n')) decoded = decoded.slice(1);
        skipLF = false;
      }
      pending += decoded;
      let index: number;
      while ((index = pending.search(/[\r\n]/)) >= 0) {
        signal?.throwIfAborted();
        const value = pending.slice(0, index);
        const cr = pending[index] === '\r';
        skipLF = cr && index === pending.length - 1;
        const width = cr && pending[index + 1] === '\n' ? 2 : 1;
        pending = pending.slice(index + width);
        line(value);
      }
      if (eventCharacters + pending.length > maximumPendingCharacters) throw new ProviderError('The returned content exceeded this request’s limit.');
      if (done) break;
    }
    // Only a blank line dispatches an SSE event. A disconnected final frame
    // must not turn an unfinished completion into a successful response.
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export class ChatCompletionsClient {
  readonly capabilities = {
    providerId: 'configured-chat-completions',
    protocol: 'chat-completions',
    protocolVersion: 'v1',
    // Kept as a compatibility alias for diagnostics which previously read
    // capabilities.version; it is a protocol label, never a model name.
    version: 'chat-completions-v1',
    modalities: ['text', 'image'],
    toolDialect: 'function_calls',
    endpoint: '',
    strictEndpoint: '',
    thinking: true,
    reasoningContent: true,
    toolCalls: true,
    toolContinuation: true,
    strictTools: true,
    // This adapter currently validates JSON locally; it does not activate a
    // provider-native response_format contract.
    structuredOutput: false,
    opaqueState: 'bounded_tool_chain',
  };
  private verifiedContextTokens?: number;
  private protocol = new WeakMap<Completion, string>();
  public readonly model: string;
  constructor(
    private key: string,
    model: string = DEFAULT_MODEL,
    private fetcher: typeof fetch = fetch,
    metadata?: { contextTokens?: number; endpoint?: string; strictEndpoint?: string },
  ) {
    // Retain the generic wire adapter for explicit compatible connections and
    // existing protocol checks. The product's live route is owned by Luna.
    this.model = model;
    this.capabilities.endpoint = metadata?.endpoint || process.env.ANIMA_CHAT_COMPLETIONS_ENDPOINT || '';
    this.capabilities.strictEndpoint = metadata?.strictEndpoint || this.capabilities.endpoint;
    this.verifiedContextTokens = metadata?.contextTokens;
  }
  /** Metadata is safe to persist in a run receipt: it contains no key or payload. */
  providerMetadata(options?: CompletionOptions): ProviderMetadata {
    return {
      providerId: this.capabilities.providerId,
      endpoint: options?.strict ? this.capabilities.strictEndpoint : this.capabilities.endpoint,
      model: this.model,
      reasoningEffort: options?.thinking === 'disabled' ? 'none' : options?.reasoningEffort || 'high',
      protocol: this.capabilities.protocol,
      protocolVersion: this.capabilities.protocolVersion,
      capabilities: {
        thinking: this.capabilities.thinking,
        reasoningContent: this.capabilities.reasoningContent,
        toolCalls: this.capabilities.toolCalls,
        toolContinuation: this.capabilities.toolContinuation,
        strictTools: this.capabilities.strictTools,
        structuredOutput: this.capabilities.structuredOutput,
        modalities: [...this.capabilities.modalities],
        toolDialect: this.capabilities.toolDialect,
        opaqueState: this.capabilities.opaqueState,
      },
      limits: {
        maxOutputTokens: options?.maxOutputTokens || 4096,
        ...(this.verifiedContextTokens ? { contextTokens: this.verifiedContextTokens } : {}),
      },
    };
  }
  assistantMessage(result: Completion): WireMessage {
    const reasoning = this.protocol.get(result);
    return {
      role: 'assistant',
      content: result.content || null,
      ...(result.tool_calls.length ? { tool_calls: result.tool_calls } : {}),
      ...(reasoning !== undefined ? { reasoning_content: reasoning } : {}),
    };
  }
  invalidateBoundary() {
    this.protocol = new WeakMap();
  }
  async complete(
    messages: ModelWireMessage[],
    tools: ToolSpec[],
    signal: AbortSignal,
    onText?: (text: string) => void,
    options?: CompletionOptions,
  ): Promise<Completion> {
    let deliveredText = false;
    for (let attempt = 0; attempt < (options?.allowTransportRetry === false ? 1 : 2); attempt++) {
      signal.throwIfAborted();
      try {
        const result = await this.completeOnce(messages, tools, signal, onText ? text => { deliveredText = true; onText(text); } : undefined, options);
        if (attempt) result.transportAttempts = attempt + 1;
        if (result.usage) result.usage = { ...result.usage, physical_attempts: attempt + 1, unreported_attempts: attempt };
        return result;
      } catch (error) {
        options?.onToolCallProgress?.({ kind: 'reset' });
        const transient = error instanceof ProviderError ? error.retryable : error instanceof TypeError && ['terminated', 'fetch failed'].includes(error.message);
        if (signal.aborted || deliveredText || !transient || attempt || options?.allowTransportRetry === false) {
          if (error instanceof Error) (error as Error & { transportAttempts?: number }).transportAttempts = attempt + 1;
          throw normalizeTransportError(error, signal);
        }
        if (error instanceof ProviderError && error.status) await new Promise<void>((resolve, reject) => {
          const abort = () => { clearTimeout(timer); reject(signal.reason); };
          const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 1000);
          signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
        });
      }
    }
    throw new ProviderError('The connection is temporarily unavailable. Try again later.', false, 'transport');
  }
  private async completeOnce(
    messages: ModelWireMessage[], tools: ToolSpec[], signal: AbortSignal,
    onText?: (text: string) => void, options?: CompletionOptions,
  ): Promise<Completion> {
    signal.throwIfAborted();
    if (options?.maxOutputTokens !== undefined && (!Number.isInteger(options.maxOutputTokens) || options.maxOutputTokens < 256 || options.maxOutputTokens > 32768))
      throw new ProviderError('The output budget for this turn is invalid.');
    // Character storage is a separate bounded transport resource. Keep it
    // compatible with the declared token allowance rather than silently
    // applying the old 4K-output character cap to a 16K-output request.
    const reasoningCharacterLimit = Math.max(64000, (options?.maxOutputTokens || 4096) * 16);
    if (!this.key) throw new ProviderError('Configure an API key for this compatible connection first.');
    if (!this.capabilities.endpoint && this.fetcher === fetch) throw new ProviderError('Configure the compatible endpoint before sending a request.', false, 'configuration');
    let response: Response | undefined;
    for (let attempt = 0; attempt < 1; attempt++) {
      response = await this.fetcher(
        options?.strict
          ? this.capabilities.strictEndpoint
          : this.capabilities.endpoint,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.model,
            messages,
            ...(tools.length
              ? {
                  tools: options?.strict
                    ? tools.map((tool) => ({
                        ...tool,
                        function: {
                          ...tool.function,
                          strict: true,
                          parameters: strictDialect(tool.function.parameters),
                        },
                      }))
                    : tools,
                }
              : {}),
            ...(options?.toolChoice ? { tool_choice: options.toolChoice } : {}),
            stream: true,
            stream_options: { include_usage: true },
            max_tokens: options?.maxOutputTokens || 4096,
            thinking: { type: options?.thinking || 'disabled' },
            ...(options?.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
          }),
          signal: AbortSignal.any([signal, AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS)]),
        },
      );
      if (response.ok) break;
      const status = response.status;
      await response.body?.cancel();
      if (status === 401) throw new ProviderError('The model service API key is invalid. Update it in Connections.', false, 'authentication', status);
      if (status === 402) throw new ProviderError('The model service account has insufficient credit. Add credit before trying again.', false, 'quota', status);
      if (status === 400 || status === 404 || status === 422)
        throw new ProviderError('The model service did not accept this request. Check the model name or reduce the input before retrying.', false, 'protocol', status);
      throw new ProviderError(
        status === 429 ? 'The model service is receiving too many requests. Try again later.' : 'The model service is temporarily unavailable. Try again later.',
        status === 429 || status >= 500, 'transient_http', status,
      );
    }
    if (!response?.ok) throw new ProviderError('The model service is temporarily unavailable.');
    let content = '',
      complete = false;
    let reasoning = '';
    let outputLimited = false;
    let usage: Completion['usage'];
    const calls = new Map<number, ToolCall>();
    await readSSE(
      response,
      (data) => {
        signal.throwIfAborted();
        if (!data) return;
        if (data === '[DONE]') {
          complete = true;
          return;
        }
        let chunk: {
          choices?: {
            delta?: {
              content?: string;
              reasoning_content?: string;
              tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
            };
            finish_reason?: string;
          }[];
          error?: unknown;
          usage?: Completion['usage'];
        };
        try {
          chunk = JSON.parse(data);
        } catch {
          throw new ProviderError('The model service returned incomplete content. Try again.');
        }
        if (chunk.error) throw new ProviderError('The model service interrupted this request. Try again.');
        if (chunk.usage) usage = chunk.usage;
        const choice = chunk.choices?.[0];
        if (!choice) return;
        if (choice.finish_reason === 'length') {
          // Keep reading the separate usage frame, but never execute a partial
          // tool call or promote this incomplete response to a completion.
          outputLimited = true;
          return;
        }
        if (outputLimited) return;
        if (choice.finish_reason && !['stop', 'tool_calls'].includes(choice.finish_reason))
          throw new ProviderError('The model did not finish its response. Try a smaller request.');
        if (choice.finish_reason) complete = true;
        const delta = choice.delta;
        // Opaque protocol data is kept only in this bounded in-memory request chain, never serialized as memory or UI.
        if (options?.thinking === 'enabled' && delta?.reasoning_content) {
          reasoning += delta.reasoning_content;
          if (reasoning.length > reasoningCharacterLimit) throw new ProviderError('The model protocol state exceeded this turn’s limit.', false, 'protocol_budget');
        }
        if (delta?.content) {
          content += delta.content;
          if (content.length > MODEL_WIRE_LIMITS.textCharacters) throw new ProviderError('The response reached this request’s length limit.');
          onText?.(delta.content);
        }
        for (const part of delta?.tool_calls || []) {
          if (!Number.isInteger(part.index) || part.index < 0 || part.index > 7)
            throw new ProviderError('The number of tools exceeded this turn’s limit.');
          const call = calls.get(part.index) || {
            id: '',
            type: 'function' as const,
            function: { name: '', arguments: '' },
          };
          if (part.id) call.id = part.id;
          if (part.function?.name && part.function.name !== call.function.name)
            call.function.name += part.function.name;
          if (part.function?.arguments) call.function.arguments += part.function.arguments;
          if (call.function.arguments.length > toolArgumentCharacterLimit(call.function.name)) throw new ProviderError('The tool request exceeded the transport length limit.');
          calls.set(part.index, call);
          if (call.id && tools.some(tool => tool.function.name === call.function.name))
            options?.onToolCallProgress?.({ kind: 'call', id: call.id, name: call.function.name });
        }
      },
      signal,
      ssePendingCharacterLimit(tools),
    );
    if (outputLimited) throw new ProviderError('This response reached its length limit. You can ask Anima to continue.', false, 'output_length', undefined, usage);
    if (!complete) throw new ProviderError('The connection ended before the response finished. Try again.');
    const tool_calls = [...calls.values()];
    if (options?.strict)
      for (const call of tool_calls) {
        const spec = tools.find((tool) => tool.function.name === call.function.name);
        if (spec) {
          try {
            call.function.arguments = JSON.stringify(
              normalizeStrictArguments(JSON.parse(call.function.arguments), spec.function.parameters),
            );
          } catch {
            /* Local schema rejects malformed JSON. */
          }
        }
      }
    if (tool_calls.some((c) => !c.id || !c.function.name))
      throw new ProviderError('The tool request is incomplete. Try again.');
    if (!content && !tool_calls.length) throw new ProviderError('The model service returned no usable content. Try again.');
    const result: Completion = { content, tool_calls, ...(usage ? { usage } : {}) };
    // All assistant turns belong to the provider's thinking protocol, including
    // terminal replies. Only a host boundary change clears the opaque chain.
    // WeakMap keeps this out of ordinary messages, memory, UI and JSON reports.
    if (options?.thinking === 'enabled') this.protocol.set(result, reasoning);
    return result;
  }
}

// This compatible route uses a narrower schema dialect. Local Zod validation remains authoritative.
export function strictDialect(input: Record<string, unknown>): Record<string, unknown> {
  const walk = (value: unknown): any => {
    if (Array.isArray(value)) return value.map(walk);
    if (!value || typeof value !== 'object') return value;
    const result: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) {
      if (['$schema', 'minLength', 'maxLength', 'minItems', 'maxItems'].includes(key)) continue;
      if (key === 'format' && !['email', 'hostname', 'ipv4', 'ipv6', 'uuid'].includes(String(item))) continue;
      if (key === 'oneOf') {
        result.anyOf = walk(item);
        continue;
      }
      if (key === '$defs') {
        result.$def = walk(item);
        continue;
      }
      if (key === '$ref' && typeof item === 'string') {
        result.$ref = item.replace('#/$defs/', '#/$def/');
        continue;
      }
      if (key === 'const' && typeof item !== 'number') {
        result.enum = [item];
        continue;
      }
      result[key] = walk(item);
    }
    if (result.type === 'object') {
      if (!result.properties && result.additionalProperties)
        throw new ProviderError('This tool contains open fields that cannot be converted equivalently to strict mode. Use standard tool mode.');
      const required = new Set(Array.isArray(result.required) ? result.required : []);
      result.properties ||= {};
      for (const key of Object.keys(result.properties))
        if (!required.has(key))
          result.properties[key] = { anyOf: [result.properties[key], { type: 'null' }] };
      result.required = Object.keys(result.properties);
      result.additionalProperties = false;
    }
    return result;
  };
  return walk(input);
}

function normalizeStrictArguments(value: any, schema: any): any {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => normalizeStrictArguments(item, schema.items || {}));
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const property = schema.properties?.[key] || {};
    const permitsNull =
      property.type === 'null' ||
      (Array.isArray(property.type) && property.type.includes('null')) ||
      property.anyOf?.some((part: any) => part.type === 'null');
    if (item === null && !(schema.required || []).includes(key) && schema.properties?.[key] && !permitsNull)
      continue;
    result[key] = normalizeStrictArguments(item, property);
  }
  return result;
}
