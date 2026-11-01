import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/main/store';
import { ChatCompletionsClient, ProviderError, type Completion, type WireMessage } from '../src/main/provider';
import { Harness } from '../src/main/harness';
import { AcademicAdapter } from '../src/main/academicAdapter';
import { ToolRegistry, type ToolContext } from '../src/main/tools';
import { campusSchema } from '../src/shared/schemas';
import type { Message, RunEvent } from '../src/shared/types';
import { controlProposal, supported } from './harness/support';
import type { TurnControlProposal } from '../src/main/runtime/turn-controls';

const complete = (content: string): Completion => ({ content, tool_calls: [] });
const tool = (name: string, args: unknown): Completion => ({
  content: '',
  tool_calls: [{ id: randomUUID(), type: 'function', function: { name, arguments: JSON.stringify(args) } }],
});

interface CoreHostFixture { controls?: TurnControlProposal | (() => TurnControlProposal); review?: (input: any) => { missing: any[]; contradictions: string[]; requests: any[] }; allowPurpose?: boolean; }
const wrapped = new WeakMap<ChatCompletionsClient, { options: CoreHostFixture }>();
/** Explicit host protocol fixtures, never claims of natural-language quality. */
function hostClient(client: ChatCompletionsClient, options?: CoreHostFixture) {
  const existing = wrapped.get(client);
  if (existing) { if (options) existing.options = options; return client; }
  const state = { options: options || {} }; wrapped.set(client, state);
  const original = client.complete.bind(client);
  client.complete = async (...args) => {
    const names = args[1].map(spec => spec.function.name);
    if (names.length === 1 && names[0] === 'propose_turn_controls') {
      const proposal = typeof state.options.controls === 'function' ? state.options.controls() : state.options.controls || controlProposal();
      const { sources, ...value } = proposal;
      return tool(names[0], { ...value, sourceAllowlist: sources === 'current_only' ? ['current'] : value.sourceAllowlist });
    }
    if (names.length === 1 && names[0] === 'report_completion_gaps') return tool(names[0], state.options.review?.(JSON.parse(String([...args[0]].reverse().find(message => message.role === 'user')?.content))) || { missing: [], contradictions: [], requests: [] });
    if (names.length === 1 && names[0] === 'verify_read_purpose') {
      const input = JSON.parse(String([...args[0]].reverse().find(message => message.role === 'user')?.content));
      return tool(names[0], { neededForCurrentRequest: !!state.options.allowPurpose, allowed: !!state.options.allowPurpose, sourceQuote: state.options.allowPurpose ? input.original : '', reason: 'Explicit host mechanism fixture.' });
    }
    if (names.length === 1 && names[0] === 'verify_local_delegation') return tool(names[0], { decision: 'draft_only', basis: [], missing: [], reason: 'No automatic approval in this fixture.' });
    return original(...args);
  };
  return client;
}
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
function tmpdir(){if(process.env.ANIMA_TEST!=='1'||!process.env.ANIMA_DATA_DIR)throw new Error('Run npm test with an isolated test directory.');return process.env.ANIMA_DATA_DIR;}
function message(sessionId: string, content: string, role: 'user' | 'assistant' = 'user'): Message {
  return {
    id: randomUUID(),
    sessionId,
    content,
    role,
    createdAt: new Date().toISOString(),
    status: 'done',
    steps: [],
    obligations: [],
    actions: [],
  };
}
function ctx(store: Store, extra: Partial<ToolContext> = {}): ToolContext {
  return {
    store,
    signal: new AbortController().signal,
    userText: 'I like uninterrupted thinking and dislike running back and forth.',
    currentUserId: '',
    child: false,
    step: () => {},
    plan: () => {},
    action: () => {},
    changed: () => {},
    delegate: async () => [],
    ...extra,
  };
}
function stream(parts: unknown[], split = 7, done = true): Response {
  const bytes = new TextEncoder().encode(
    parts.map((p) => `data: ${JSON.stringify(p)}\r\n\r\n`).join('') + (done ? 'data: [DONE]\n\n' : ''),
  );
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += split) controller.enqueue(bytes.slice(i, i + split));
        controller.close();
      },
    }),
    { status: 200 },
  );
}

test('Local restart restores records; short terms and full-text queries work, and deletion leaves no result', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'anima-test-'));
  const file = path.join(dir, 'store.sqlite');
  let store = new Store(file);
  const id = store.session(undefined, 'Physics and badminton');
  store.putMessage(message(id, 'I like uninterrupted thinking, play badminton on Wednesday, and have a physics exam on Friday.'));
  store.close();
  store = new Store(file);
  assert.equal(store.search('physics').length, 1);
  assert.equal(store.search('badminton').length, 1);
  assert.equal(store.search('physics Friday').length, 1);
  assert.equal(store.search('%').length, 0);
  store.deleteSession(id);
  assert.equal(store.search('badminton').length, 0);
  assert.equal(store.messages(id).length, 0);
  store.close();
});
test('Crash recovery marks unfinished steps as interrupted', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'anima-crash-')), 'db');
  let store = new Store(file);
  const id = store.session();
  store.putMessage({
    ...message(id, '', 'assistant'),
    status: 'running',
    steps: [{ id: 's', title: 'Looking up', status: 'running' }],
    obligations: [
      { id: 'o', title: 'Check the schedule', status: 'running' },
      { id: 'o2', title: 'Choose a time', status: 'pending' },
    ],
  });
  store.close();
  store = new Store(file);
  assert.equal(store.messages(id)[0].status, 'cancelled');
  assert.equal(store.messages(id)[0].steps[0].status, 'cancelled');
  assert.ok(store.messages(id)[0].obligations.every((o) => o.status === 'blocked'));
  store.close();
});
test('SSE handles split multibyte text and tool argument fragments without exposing internal reasoning', async () => {
  let body: any;
  const output: string[] = [];
  const client = new ChatCompletionsClient('test-key', 'gpt-6-luna', (async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return stream(
      [
        { choices: [{ delta: { reasoning_content: 'Private internal content' } }] },
        {
          choices: [
            {
              delta: {
                content: 'Let’s check your schedule.',
                tool_calls: [
                  { index: 0, id: 'call-1', function: { name: 'query_campus', arguments: '{"kind":' } },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: { tool_calls: [{ index: 0, function: { arguments: '"schedule"}' } }] },
              finish_reason: 'tool_calls',
            },
          ],
        },
      ],
      5,
    );
  }) as typeof fetch);
  const result = await client.complete(
    [{ role: 'user', content: 'Plan today' }],
    [],
    new AbortController().signal,
    (t) => output.push(t),
    { toolChoice: { type: 'function', function: { name: 'campus_full_context' } } },
  );
  assert.equal(result.content, 'Let’s check your schedule.');
  assert.equal(result.tool_calls[0].function.arguments, '{"kind":"schedule"}');
  assert.equal(output.join(''), result.content);
  assert.ok(!JSON.stringify(result).includes('internal'));
  assert.equal(body.thinking.type, 'disabled');
  assert.equal(body.tool_choice.function.name, 'campus_full_context');
});
test('A 401 error does not echo secrets from the response body', async () => {
  const client = new ChatCompletionsClient(
    'secret-test',
    'gpt-6-luna',
    (async () => new Response('secret-test', { status: 401 })) as typeof fetch,
  );
  await assert.rejects(
    () => client.complete([], [], new AbortController().signal),
    (e) => e instanceof ProviderError && !e.message.includes('secret-test') && e.message.includes('invalid'),
  );
});
test('A partial response is not reported as success and already streamed content is not requested again', async () => {
  let calls = 0;
  const client = new ChatCompletionsClient('test-key', 'gpt-6-luna', (async () => {
    calls++;
    return stream([{ choices: [{ delta: { content: 'partial' } }] }], 7, false);
  }) as typeof fetch);
  await assert.rejects(() => client.complete([], [], new AbortController().signal), /ended before/);
  assert.equal(calls, 1);
});
test('Cancellation reaches the provider network request', async () => {
  const c = new AbortController();
  let linked = false;
  const client = new ChatCompletionsClient(
    'test-key',
    'gpt-6-luna',
    ((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          linked = true;
          reject(init.signal?.reason);
        });
      })) as typeof fetch,
  );
  const request = client.complete([], [], c.signal);
  c.abort();
  await assert.rejects(request);
  assert.equal(linked, true);
});
test('Child permissions are a read-only subset; disabled weather and memory cannot be called', async () => {
  const store = new Store(':memory:');
  store.saveSettings({ weatherEnabled: false, memoryEnabled: false });
  const registry = new ToolRegistry(ctx(store, { child: true }));
  const names = registry.specs().map((s) => s.function.name);
  assert.ok(['look_up', 'read_evidence', 'resolve_time'].every(name => names.includes(name)));
  assert.ok(['delegate', 'prepare_action', 'change_local_action', 'propose_memory_change'].every(name => !names.includes(name)));
  assert.ok(['not_connected', 'unsupported', 'forbidden'].includes(JSON.parse(await registry.execute('look_up', '{"source":"campus","mode":"refresh","domain":"schedule"}')).status));
  assert.match(await registry.execute('delegate', '{"tasks":[]}'), /unavailable/);
  assert.match(await registry.execute('remember_preference', '{}'), /unavailable/);
  store.close();
});
test('Campus tools follow actual permissions; compatibility aliases stay out of model schemas', async () => {
  const store = new Store(':memory:');
  const calls: string[] = [];
  const campus = {
    describe: () => ({ configured: true, available: true, credentialsConfigured: true, authStatus: 'verified' }),
    capabilities: async () => ({ status: 'ok', catalogued: 40 }),
    fullContext: async (args: any) => { calls.push('full:' + Boolean(args.refresh)); return { status: 'ok', batches: [] }; },
    read: async (args: any) => { calls.push('read:' + args.domain + ':' + Boolean(args.refresh)); return { status: 'ok', domain: args.domain, records: [], fetched_at: new Date().toISOString(), coverage: { complete: true } }; },
    refresh: async (args: any) => { calls.push('refresh:' + args.scope); return { status: 'ok', scope: args.scope, domain: args.domain }; },
  };
  const registry = new ToolRegistry(ctx(store, { campus: campus as any, userText: 'Check courses and exams, refreshing the permitted data if needed.' }));
  const names = registry.specs().map(s => s.function.name);
  assert.ok(['delegate', 'inspect_action', 'look_up', 'prepare_action', 'propose_memory_change', 'read_evidence'].every(name => names.includes(name)));
  assert.ok(names.includes('look_up')); assert.ok(names.includes('prepare_action')); assert.ok(!names.includes('campus_full_context')); assert.ok(!names.includes('campus_read')); assert.ok(!names.includes('campus_refresh')); assert.ok(!names.includes('query_campus'));
  const detail = JSON.parse(await registry.execute('look_up', '{"source":"campus","mode":"detail","domain":"schedule","window":"next:7d"}'));
  assert.equal(detail.sourceId, 'campus:academic-account');
  assert.equal(detail.data.origin, 'academic_account');
  assert.match(JSON.stringify(detail), /schedule/);
  const overview = JSON.parse(await registry.execute('look_up', '{"source":"campus","mode":"overview"}'));
  assert.equal(overview.sourceId, 'campus:academic-account');
  assert.ok(Array.isArray(overview.data.domains));
  assert.equal(JSON.parse(await registry.execute('look_up', '{"source":"campus","mode":"refresh","domain":"schedule"}')).status, 'forbidden');
  assert.deepEqual(calls, ['read:schedule:false', 'full:false']); store.close();
});
test('Partial or authentication-required campus reads remain blocked rather than completed', async () => {
  const store = new Store(':memory:'); const statuses: string[] = [];
  const campus = {
    describe: () => ({ configured: true, available: true, credentialsConfigured: true, authStatus: 'verified' }),
    read: async () => ({ status: 'partial', records: [], coverage: { complete: false } }),
  };
  const registry = new ToolRegistry(ctx(store, { campus: campus as any, step: s => statuses.push(s.status), campusMemo: { fullContextUsed: false, domains: new Set(), results: new Map() } }));
  const output = JSON.parse(await registry.execute('look_up', '{"source":"campus","domain":"schedule"}'));
  assert.equal(output.status, 'partial'); assert.equal(statuses.at(-1), 'blocked'); store.close();
});
test('Campus reads use one requested domain, reuse qualified caches, and do not read grades unsolicited', async () => {
  const store = new Store(':memory:'); store.saveSettings({ mode: 'luna' });
  const reads: string[] = []; const fakeCampus = { describe: () => ({ configured: true, available: true, credentialsConfigured: true, authStatus: 'verified', label: 'test' }), read: async (args: any) => { reads.push(args.domain); return { data: { status: 'ok', records: [], fetched_at: new Date().toISOString(), coverage: { complete: true }, origin: 'academic_account', authenticated_at: new Date().toISOString() } }; } };
  let calls = 0;
  const fake = { complete: async (messages: WireMessage[]) => { if(messages[0].content?.includes('[harness:extract')) return complete(JSON.stringify({status:'no_personal_fact',changes:[]})); calls++; return calls <= 2 ? tool('look_up', { source: 'campus', domain: 'schedule' }) : complete('The allowed course data was read. No other domain was queried.'); } } as unknown as ChatCompletionsClient;
  const harness = new Harness(store, () => 'test-key', () => {}, () => hostClient(fake), fakeCampus as any);
  const first = harness.start(undefined, 'Help me check tomorrow’s courses'); await harness.idle();
  assert.deepEqual(reads, ['schedule']); assert.equal(store.messages(first.sessionId).at(-1)?.status, 'done'); store.close();
});


test('Memory requires this turn’s original words, honors a length budget, and rejects invented quotes and sensitive information', async () => {
  const store = new Store(':memory:');
  store.runtime.memory.reviewer = async () => supported;
  const registry = new ToolRegistry(ctx(store));
  assert.match(
    await registry.execute(
      'remember_preference',
      JSON.stringify({ text: 'likes uninterrupted thinking', source_quote: 'I like uninterrupted thinking' }),
    ),
    /saved/,
  );
  assert.match(
    await new ToolRegistry(ctx(store)).execute(
      'remember_preference',
      JSON.stringify({ text: 'likes morning runs', source_quote: 'I like morning runs' }),
    ),
    /original|quote|source/,
  );
  assert.equal(store.memories().length, 1);
  assert.match(
    await registry.execute(
      'remember_preference',
      JSON.stringify({ text: 'likes uninterrupted thinking', source_quote: 'I like uninterrupted thinking' }),
    ),
    /saved/,
  );
  const sensitive = new ToolRegistry(ctx(store, { userText: 'The password is test-only' }));
  assert.match(
    await sensitive.execute(
      'remember_preference',
      JSON.stringify({ text: 'The password is test-only', source_quote: 'The password is test-only' }),
    ),
    /unavailable/,
  );
  for (let i = 0; i < 20; i++) store.saveMemory(`${i}${'x'.repeat(130)}`);
  assert.equal(store.memories().length, 21);
  assert.throws(() => store.saveMemory('y'.repeat(4001)));
  store.close();
});
test('Campus dates require a time zone; imported records remain explicitly identified without an account connection', async () => {
  const store = new Store(':memory:');
  assert.equal(campusSchema.safeParse({ source: 'test', updatedAt: '2026-09-09' }).success, false);
  const data = campusSchema.parse({
    source: 'Synthetic export',
    updatedAt: '2026-09-09T10:00:00-07:00',
    schedule: [
      {
        id: '1',
        title: 'Overnight event',
        startsAt: '2026-09-09T23:30:00-07:00',
        endsAt: '2026-09-10T00:30:00-07:00',
        location: 'Example',
        status: 'cancelled',
        source: 'Class cancellation notice',
      },
    ],
  });
  store.putMeta('campus', data);
  const result = JSON.parse(
    await new ToolRegistry(ctx(store)).execute(
      'query_campus',
      JSON.stringify({
        kind: 'schedule',
        from: '2026-09-10T00:00:00-07:00',
        to: '2026-09-11T00:00:00-07:00',
      }),
    ),
  );
  assert.equal(result.status, 'stale');
  assert.equal(result.data.origin, 'legacy_import');
  assert.equal(result.data.authenticated, false);
  assert.match(result.reason, /import|account|offline/);
  store.close();
});
test('An unconfigured campus query returns unavailable without pretending to have found records', async () => {
  const store = new Store(':memory:');
  const states: string[] = [];
  const registry = new ToolRegistry(ctx(store, { step: (s) => states.push(s.status) }));
  assert.equal(JSON.parse(await registry.execute('query_campus', '{"kind":"exams"}')).status, 'unsupported');
  assert.equal(states.at(-1), 'blocked');
  store.close();
});

test('Withdrawing health data in the current turn still allows a response within the remaining scope', async () => {
  const store = new Store(':memory:');
  store.saveSettings({ mode: 'luna', memoryEnabled: false });
  store.runtime.policy.grant('health:use');
  store.runtime.policy.registerSource('health:local');
  const fake = {
    complete: async () => complete('Okay, I will not use health records for this hour. What would you like to do first?'),
  } as unknown as ChatCompletionsClient;
  const harness = new Harness(store, () => 'test-key', () => {}, () => hostClient(fake, { controls: controlProposal({ sourceExclusions: ['health:local'], sourceBasis: 'without using health data' }) }));
  const run = harness.start(undefined, 'Plan the next hour without using health data.');
  await harness.idle();
  const answer = store.messages(run.sessionId).at(-1)!;
  assert.equal(answer.status, 'done');
  assert.match(answer.content, /not use health records/);
  assert.doesNotMatch(answer.content, /Source scope updated/);
  store.close();
});

test('Missing unit evidence is corrected through focused review rather than lexical replacement', async () => {
  const store = new Store(':memory:');
  store.saveSettings({ mode: 'luna', memoryEnabled: false });
  const campus = {
    describe: () => ({ configured: true, available: true, credentialsConfigured: true, authStatus: 'verified' }),
    read: async () => ({
      data: {
        status: 'ok',
        records: [{ balance_raw: 115855, balance_unit: 'unverified_source_unit' }],
        evaluated_at: new Date().toISOString(),
        coverage: { complete: true },
        origin: 'academic_account',
        authenticated_at: new Date().toISOString(),
      },
    }),
  };
  let round = 0;
  const fake = {
    complete: async () => (++round === 1 ? tool('look_up', { source: 'campus', domain: 'card' }) : complete(round === 2 ? 'The balance is 115855 cents.' : '115855（raw university-system units, unverified）')), 
  } as unknown as ChatCompletionsClient;
  hostClient(fake, { allowPurpose: true, review: input => ({ missing: [], contradictions: input.reply.includes('115855 cents') ? ['The observation supports only the raw value. The unit is unverified, so do not call it cents.'] : [], requests: [] }) });
  const harness = new Harness(store, () => 'test-key', () => {}, () => hostClient(fake), campus as any);
  const run = harness.start(undefined, 'Check my campus card balance.');
  await harness.idle();
  const answer = store.messages(run.sessionId).at(-1)!.content;
  assert.match(answer, /115855（raw university-system units, unverified）/);
  assert.doesNotMatch(answer, /115855\s*(?:cents|dollars)/);
  store.close();
});

test('A busy projection cannot be presented to a group as availability or guaranteed free time', async () => {
  const store = new Store(':memory:');
  store.saveSettings({ mode: 'luna', memoryEnabled: false });
  store.runtime.domains.importSnapshot({
    source: 'Synthetic imported schedule',
    updatedAt: '2026-09-14T06:00:00Z',
    schedule: [{
      id: 'busy-1', title: 'Private event', startsAt: '2026-09-15T09:00:00-07:00',
      endsAt: '2026-09-15T10:00:00-07:00', location: 'Hidden', status: 'scheduled', source: 'Synthetic',
    }],
    exams: [], places: [], rules: [],
  });
  let round = 0;
  const fake = {
    complete: async () => ++round === 1 ? tool('availability_projection', { from: '2026-09-15T07:00:00Z', to: '2026-09-16T07:00:00Z' }) : complete(round === 2 ? 'I am free September 15, 09:00–10:00; any other time works too.' : 'September 15, 09:00–10:00 does not work. Other times may still have unsynced plans.'),
  } as unknown as ChatCompletionsClient;
  hostClient(fake, { controls: controlProposal({ audience: 'group', release: { recipient: 'the group', purpose: 'Discuss available times', allowedFacts: [], tone: 'natural', useAvailability: true } }), review: input => ({ missing: [], contradictions: input.reply.includes('free September 15, 09:00–10:00') ? ['The busy interval 09:00–10:00 is not free, and other times are not guaranteed.'] : [], requests: [] }) });
  const harness = new Harness(store, () => 'test-key', () => {}, () => hostClient(fake));
  const run = harness.start(undefined, 'Draft my available times for the group without explaining why I am busy. Do not send it.');
  await harness.idle();
  const answer = store.messages(run.sessionId).at(-1)!.content;
  assert.match(answer, /09:00–10:00 does not work/);
  assert.doesNotMatch(answer, /free September 15, 09:00–10:00|any other time works/);
  assert.doesNotMatch(answer, /Private event|Hidden/);
  store.close();
});

test('The host does not remove necessary qualifications from the main model’s response by keyword', async () => {
  const store = new Store(':memory:');
  store.saveSettings({ mode: 'luna', memoryEnabled: false });
  const fake = {
    complete: async () => complete('Open the most urgent assignment and do only its first part. Do not submit without enough information.'),
  } as unknown as ChatCompletionsClient;
  const harness = new Harness(store, () => 'test-key', () => {}, () => hostClient(fake));
  const run = harness.start(undefined, 'I feel overwhelmed. Help me find a first step, with just one direction.');
  await harness.idle();
  const answer = store.messages(run.sessionId).at(-1)!.content;
  assert.match(answer, /Open the most urgent assignment/);
  assert.equal(answer, 'Open the most urgent assignment and do only its first part. Do not submit without enough information.');
  store.close();
});

test('The first response does not wait for background memory extraction; explicit idle can wait for the queue', async () => {
  const store = new Store(':memory:');
  store.saveSettings({ mode: 'luna' });
  let releaseExtraction!: () => void,
    resolveReply!: () => void,
    extractionSettled = false;
  const extractionGate = new Promise<void>((resolve) => {
      releaseExtraction = resolve;
    }),
    replyDone = new Promise<void>((resolve) => {
      resolveReply = resolve;
    }),
    order: string[] = [];
  const fake = {
    complete: async (messages: WireMessage[]) => {
      if (messages[0].content?.includes('[harness:extract')) {
        order.push('extract');
        await extractionGate;
        extractionSettled = true;
        return complete(JSON.stringify({ status: 'no_personal_fact', changes: [] }));
      }
      order.push('foreground');
      return complete('The foreground response is complete.');
    },
  } as unknown as ChatCompletionsClient;
  const harness = new Harness(
    store,
    () => 'test-key',
    (event) => {
      if (event.type === 'message' && event.message.role === 'assistant' && event.message.status === 'done')
        resolveReply();
    },
    () => hostClient(fake),
  );
  harness.start(undefined, 'Please answer first, then organize this statement in the background.');
  assert.equal(
    await Promise.race([replyDone.then(() => 'reply'), delay(30000).then(() => 'timeout')]),
    'reply',
  );
  assert.equal(order[0], 'foreground');
  assert.equal(extractionSettled, false);
  releaseExtraction();
  await harness.idle();
  assert.equal(extractionSettled, true);
  store.close();
});

test('A privacy epoch change cancels background extraction and preserves pending work for restart', async () => {
  const store = new Store(':memory:');
  store.saveSettings({ mode: 'luna' });
  let resolveReply!: () => void,
    resolveStarted!: () => void;
  const replyDone = new Promise<void>((resolve) => {
      resolveReply = resolve;
    }),
    extractionStarted = new Promise<void>((resolve) => {
      resolveStarted = resolve;
    });
  const fake = {
    complete: async (messages: WireMessage[], _tools: unknown, signal: AbortSignal) => {
      if (messages[0].content?.includes('[harness:extract')) {
        resolveStarted();
        signal.throwIfAborted();
        await new Promise<void>((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
        );
      }
      return complete('The foreground response is complete.');
    },
  } as unknown as ChatCompletionsClient;
  const harness = new Harness(
    store,
    () => 'test-key',
    (event) => {
      if (event.type === 'message' && event.message.role === 'assistant' && event.message.status === 'done')
        resolveReply();
    },
    () => hostClient(fake),
  );
  const { sessionId } = harness.start(undefined, 'I like reading quietly.');
  await replyDone;
  assert.equal(
    await Promise.race([extractionStarted.then(() => 'started'), delay(30000).then(() => 'timeout')]),
    'started',
  );
  store.runtime.policy.revoke('memory:write');
  await harness.backgroundIdle();
  const userId = store.messages(sessionId).find((message) => message.role === 'user')!.id,
    statuses = store.db
      .prepare('SELECT status FROM h_spans WHERE event_id=? ORDER BY start_cp')
      .all(userId)
      .map((row) => String(row.status));
  assert.deepEqual(statuses, ['pending']);
  assert.equal(store.runtime.memory.views().length, 0);
  await harness.stop();
  store.close();
});

test('A read-only child recompiles its ContextPack within its own scope rather than inheriting the parent body', async () => {
  const store = new Store(':memory:');
  store.saveSettings({ mode: 'luna' });
  const parentCanary = 'PARENT_PACK_CANARY_619',
    childPayloads: string[] = [],
    originalCompile = store.runtime.compile.bind(store.runtime);
  (store.runtime as any).compile = async (...args: Parameters<typeof originalCompile>) => {
    const pack = await originalCompile(...args);
    pack.data.parentOnly = { secret: parentCanary };
    return pack;
  };
  let foregroundCalls = 0;
  const fake = {
    complete: async (messages: WireMessage[], _tools: unknown, _signal: unknown, _onText: unknown, options?: { phase?: string }) => {
      if (messages[0].content?.includes('[harness:extract'))
        return complete(JSON.stringify({ status: 'no_personal_fact', changes: [] }));
      if (options?.phase === 'child') {
        childPayloads.push(messages.at(-1)?.content || '');
        return complete('The child uses only its own allowed scope.');
      }
      foregroundCalls++;
      return foregroundCalls === 1
        ? tool('delegate', { tasks: [{ title: 'Scope review', instruction: 'Check only the source scope of the current request.', sources: [] }] })
        : complete('The scope review is complete.');
    },
  } as unknown as ChatCompletionsClient;
  const harness = new Harness(store, () => 'test-key', () => {}, () => hostClient(fake));
  harness.start(undefined, 'Please investigate this request in parallel.');
  await harness.idle();
  assert.equal(childPayloads.length, 1);
  assert.equal(childPayloads[0].includes(parentCanary), false);
  assert.match(childPayloads[0], /Check only the source scope of the current request/);
  store.close();
});

test('The visible scope summary shows correctable participation and public-draft boundaries without exposing internal reasoning', async () => {
  const store = new Store(':memory:');
  store.saveSettings({ mode: 'luna' });
  store.runtime.memory.paused = true;
  const draftText = 'Draft a message to the instructor to confirm a time. Share only that Wednesday afternoon works. Use a polite, natural tone. Do not send it.';
  const brief = { recipient: 'the instructor', purpose: 'Confirm a time', allowedFacts: ['Wednesday afternoon works'], tone: 'polite and natural', useAvailability: false, requestedOperation: 'draft' as const };
  let draftStage = false, requested = false;
  const fake = new ChatCompletionsClient('synthetic');
  fake.complete = async (_messages, tools, _signal, _onText, options) => {
    if (tools.length === 1 && tools[0].function.name === 'project_release_brief') return tool('project_release_brief', brief);
    if (options?.phase === 'release_write') return complete('Hello, Wednesday afternoon works for me.');
    if (draftStage && !requested) { requested = true; return tool('prepare_release', { sourceQuote: draftText, task: 'Draft a message to the instructor confirming a time.' }); }
    return complete('Handled within this turn’s boundaries.');
  };
  let controlledTurn = 0;
  hostClient(fake, { controls: () => ++controlledTurn === 1 ? controlProposal() : controlProposal({ audience: 'group', release: { recipient: 'the instructor', purpose: 'Confirm a time', allowedFacts: ['Wednesday afternoon works'], tone: 'polite and natural', useAvailability: false } }) });
  const harness = new Harness(store, () => 'test-key', () => {}, () => hostClient(fake));
  const mixed = harness.start(undefined, 'I just want to vent; also note tomorrow’s group meeting at nine.');
  await harness.idle();
  const mixedReply = store.messages(mixed.sessionId).at(-1)!;
  assert.equal(mixedReply.scopeSummary?.interpretation, undefined);
  assert.equal(store.agenda().length, 0, 'host does not turn wording into action authorization');
  draftStage = true;
  const draft = harness.start(
    undefined,
    draftText,
  );
  await harness.idle();
  const draftReply = store.messages(draft.sessionId).at(-1)!;
  assert.equal(draftReply.scopeSummary?.release?.recipient, 'the instructor');
  assert.equal(draftReply.scopeSummary?.release?.mode, 'draft');
  assert.deepEqual(draftReply.scopeSummary?.release?.allowedFacts, ['Wednesday afternoon works']);
  assert.equal(draftReply.releaseArtifacts?.[0].body, 'Hello, Wednesday afternoon works for me.');
  assert.equal(JSON.stringify(draftReply.scopeSummary).includes('internal reasoning'), false);
  store.close();
});


test('The full harness decomposes, delegates, and synthesizes while preparing actions without unauthorized saving', async () => {
  const store = new Store(':memory:');
  store.saveSettings({ mode: 'luna' });
  let mainCalls = 0,
    active = 0,
    maxActive = 0;
  const events: RunEvent[] = [];
  const fake = {
    complete: async (messages: WireMessage[], _tools: unknown, _signal: unknown, _onText: unknown, options?: { phase?: string }) => {
      if (messages[0].content?.includes('[harness:extract'))
        return complete(JSON.stringify({ status: 'no_personal_fact', changes: [] }));
      if (messages[0].content?.includes('[harness:verify'))
        return complete(
          JSON.stringify({
            supported: true,
            preservesSubject: true,
            preservesWorld: true,
            preservesTime: true,
            preservesConditions: true,
            reason: 'test',
            retention: 'allowed', temporalType: 'unknown', derivation: 'original_only',
            futureUse: null, useScope: null, preservesUseScope: true,
          }),
        );
      if (options?.phase === 'child') {
        active++;
        maxActive = Math.max(maxActive, active);
        await delay(25);
        active--;
        return complete('Live information is missing, so I cannot confirm the plan is feasible.');
      }
      mainCalls++;
      if (mainCalls === 1)
        return tool('set_plan', { items: [{ id: '1', title: 'Check courses and fitness', status: 'running' }] });
      if (mainCalls === 2)
        return tool('delegate', {
          tasks: [
            { title: 'Course inquiry', instruction: 'Check next week’s courses and identify unknowns.', sources: [] },
            { title: 'Fitness inquiry', instruction: 'Check fitness requirements and missing information.', sources: [] },
          ],
        });
      if (mainCalls === 3) return tool('prepare_action', { title: 'Check the workout time', detail: 'Waiting for actual data.' });
      if (mainCalls === 4)
        return tool('set_plan', { items: [{ id: '1', title: 'Check courses and fitness', status: 'blocked' }] });
      return complete('Campus data is still missing. Import it first.');
    },
  } as unknown as ChatCompletionsClient;
  const harness = new Harness(
    store,
    () => 'test-key',
    (e) => events.push(e),
    () => hostClient(fake),
  );
  const result = harness.start(undefined, 'Help me consider next week’s courses and fitness records together');
  await harness.idle();
  const m = store.messages(result.sessionId).at(-1)!;
  assert.equal(m.status, 'done');
  assert.equal(maxActive, 2, JSON.stringify({ mainCalls, reply: m.content, status: m.status, steps: m.steps, delegations: m.contextReceipt?.delegations, observations: store.runtime.lastSession?.observations }));
  assert.equal(m.actions.length, 1);
  assert.equal(store.agenda().length, 0);
  assert.equal(m.obligations[0].status, 'blocked');
  assert.ok(events.some((e) => e.type === 'message' && e.message.steps.some((s) => s.scope === 'Check independently')));
  store.close();
});
test('A stopped conversation can continue without old run state leaking into the new response', async () => {
  const store = new Store(':memory:');
  const harness = new Harness(
    store,
    () => '',
    () => {},
  );
  const { sessionId } = harness.start(undefined, 'Plan today');
  await delay(20);
  await harness.stop();
  assert.equal(harness.running, false);
  const stopped = store.messages(sessionId).at(-1)!;
  assert.equal(stopped.status, 'cancelled');
  assert.ok(stopped.steps.every((s) => s.status !== 'running'));
  harness.start(sessionId, 'I have felt tired lately');
  await harness.idle();
  assert.equal(store.messages(sessionId).at(-1)!.status, 'done');
  store.close();
});
test('Long conversations do not rely on recursive summaries; unextracted original constraints can be read through tools', async () => {
  const store = new Store(':memory:');
  store.saveSettings({ mode: 'luna' });
  const id = store.session();
  for (let i = 0; i < 26; i++)
    store.putMessage(message(id, i === 0 ? 'Unfinished requirement: preserve evening rest.' : `Synthetic message ${i}`));
  let main: WireMessage[] = []; let reads = 0;
  const fake = {
    complete: async (messages: WireMessage[]) => {
      if (messages[0].content?.includes('[harness:extract'))
        return complete(JSON.stringify({ status: 'no_personal_fact', changes: [] }));
      if (messages[0].content?.includes('[harness:verify'))
        return complete(
          JSON.stringify({
            supported: true,
            preservesSubject: true,
            preservesWorld: true,
            preservesTime: true,
            preservesConditions: true,
            reason: 'test',
            retention: 'allowed', temporalType: 'unknown', derivation: 'original_only',
            futureUse: null, useScope: null, preservesUseScope: true,
          }),
        );
      if (messages[0].content?.includes('Compress the conversation')) return complete('Unfinished requirement: preserve evening rest.');
      main = structuredClone(messages);
      if (reads++ === 0) return tool('search_context', { query: 'Unfinished requirement evening rest' });
      return complete('I will preserve evening rest.');
    },
  } as unknown as ChatCompletionsClient;
  const harness = new Harness(
    store,
    () => 'test-key',
    () => {},
    () => hostClient(fake),
  );
  harness.start(id, 'Continue planning');
  await harness.idle();
  assert.equal(store.summary(id).count, 0);
  assert.ok(main.some(item => item.role === 'tool' && item.content?.includes('preserve evening rest')));
  assert.equal(store.search('Unfinished requirement').length, 1);
  assert.ok(main.length >= 3);
  store.close();
});
