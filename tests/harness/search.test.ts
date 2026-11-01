import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { LocalSearchService } from '../../src/main/search';
import type { LocalSearchHit, LocalSearchPage } from '../../src/shared/search';
import type { Message } from '../../src/shared/types';
import { Fixture } from './support';

function message(f: Fixture, content: string, options: Partial<Message> = {}) {
  const sessionId = options.sessionId || f.store.session(), id = options.id || randomUUID();
  if ((options.role || 'user') === 'user') f.ingest(content, id, { sessionId });
  const value: Message = { id, sessionId, role: 'user', content, createdAt: f.clock.now(), status: 'done',
    steps: [], obligations: [], actions: [], ...options };
  f.store.putMessage(value); return value;
}
function material(f: Fixture, name: string, body: string | Buffer) {
  const attachment = f.store.runtime.materials.stageBytes(name, Buffer.isBuffer(body) ? body : Buffer.from(body));
  const sessionId = f.store.session();
  const run = f.store.runtime.begin("Look at this material", randomUUID(), sessionId, new AbortController().signal, { material: attachment.resource });
  f.store.runtime.finish(run);
  return attachment.resource!;
}
async function all(service: LocalSearchService, query: string, selected?: ('conversation' | 'note' | 'material')[], limit = 18) {
  let page: LocalSearchPage, cursor: string | undefined, pages = 0;
  const items: LocalSearchHit[] = [];
  do {
    page = await service.search({ query, kinds: selected, limit, ...(cursor ? { cursor } : {}) });
    items.push(...page.items); cursor = page.nextCursor || undefined;
    assert.ok(++pages < 100, 'search must finish');
  } while (cursor);
  return { ...page, items, pages };
}

test('local search finds long chat, note and original text endings with precise Unicode positions and bounded snippets', async () => {
  const f = new Fixture();
  try {
    const service = new LocalSearchService(f.store), body = "A😀".repeat(11000) + "We watch the stars at dusk; bring a coat.";
    const chat = message(f, body);
    const note = f.store.notes.create({ title: "Weekend ideas", body });
    assert.equal(note.status, 'saved');
    const document = material(f, "quick-note.md", body);
    const before = Number(f.store.db.prepare('SELECT total_changes() AS n').get()!.n);
    f.store.saveSettings({ memoryEnabled: false });
    const afterSetting = Number(f.store.db.prepare('SELECT total_changes() AS n').get()!.n);
    const result = await all(service, "watch the stars");
    assert.deepEqual(new Set(result.items.map(hit => hit.kind)), new Set(['conversation', 'note', 'material']));
    assert.equal(result.complete, true);
    for (const hit of result.items) {
      assert.ok(Array.from(hit.snippet).length <= 182);
      assert.equal(Array.from(hit.snippet).slice(hit.match.start, hit.match.end).join(''), "watch the stars");
      assert.equal(hit.locator.offset, 22003);
      assert.deepEqual(await service.resolve(hit.locator), hit.locator);
      assert.ok(!JSON.stringify(hit).includes('accessKey'));
      assert.ok(!JSON.stringify(hit).includes(f.dir));
    }
    assert.equal(result.items.find(hit => hit.kind === 'conversation')!.locator.kind, 'conversation');
    assert.ok(result.items.some(hit => hit.id.includes(chat.id)));
    assert.ok(result.items.some(hit => hit.id.includes(document.resourceId)));
    assert.equal(Number(f.store.db.prepare('SELECT total_changes() AS n').get()!.n), afterSetting, 'search adds no durable query or copied content');
    assert.ok(afterSetting >= before);
  } finally { f.close(); }
});

test('local search leaves temporary, unsent, trashed and forgotten sources out, and invalidates old locators', async () => {
  const f = new Fixture();
  try {
    const service = new LocalSearchService(f.store), original = message(f, "stars original");
    const temporary = message(f, "stars temporary", { sessionId: f.store.session() });
    f.store.restrictConversation(temporary.sessionId, 'session_only');
    const discarded = f.store.notes.create({ title: "stars draft", body: "Returned to Trash" });
    assert.equal(discarded.status, 'saved');
    if (discarded.status === 'saved') f.store.notes.changeState({ id: discarded.note.id, expectedRevision: discarded.note.revision, state: 'deleted' });
    f.store.runtime.materials.stageBytes("stars-unsent.txt", Buffer.from("stars unsent"));
    const saved = material(f, "stars-material.txt", "stars original file");
    const results = await all(service, "stars");
    assert.ok(!JSON.stringify(results).includes("temporary"));
    assert.ok(!JSON.stringify(results).includes("Trash"));
    assert.ok(!JSON.stringify(results).includes("unsent"));
    const oldChat = results.items.find(hit => hit.kind === 'conversation')!.locator;
    const oldFile = results.items.find(hit => hit.kind === 'material')!.locator;
    f.memory.forget([original.id]);
    const parent = f.store.runtime.materials.nativeList().find(item => item.resourceId === saved.resourceId)!;
    f.store.deleteSession(parent.sessionId!);
    await assert.rejects(service.resolve(oldChat));
    await assert.rejects(service.resolve(oldFile));
    assert.equal((await all(service, "stars")).items.length, 0);
  } finally { f.close(); }
});

test('literal short text and punctuation queries paginate without duplicate hits or full history payloads', async () => {
  const f = new Fixture();
  try {
    const service = new LocalSearchService(f.store);
    for (let index = 0; index < 11; index++) message(f, `Visit ${index} to Q1, exact record 100%_".`);
    const result = await all(service, "Q1", ['conversation'], 2);
    assert.equal(result.items.length, 11); assert.equal(new Set(result.items.map(hit => hit.id)).size, 11);
    assert.ok(result.pages > 1);
    assert.equal((await all(service, '100%_"', ['conversation'])).items.length, 11);
    assert.equal((await all(service, "' OR 1=1 --", ['conversation'])).items.length, 0);
    assert.equal((await service.search({ query: '  ' })).items.length, 0);
    await assert.rejects(service.search({ query: "Q1", path: '/private' }));
  } finally { f.close(); }
});

test('forgotten first-message text cannot return through a surviving conversation title', async () => {
  const f = new Fixture();
  try {
    const service = new LocalSearchService(f.store), sessionId = f.store.session(undefined, "secret stars belonging only to the past");
    const first = message(f, "secret stars belonging only to the past", { sessionId });
    message(f, "A normal topic that remains", { sessionId });
    assert.ok((await all(service, "secret stars", ['conversation'])).items.length);
    f.memory.forget([first.id]);
    assert.equal((await all(service, "secret stars", ['conversation'])).items.length, 0);
    const surviving = (await all(service, "normal topic", ['conversation'])).items[0];
    assert.equal(surviving.title, "A conversation");
  } finally { f.close(); }
});

test('note edits, source revocation and public display are rechecked before resolving or continuing', async () => {
  const f = new Fixture();
  try {
    const service = new LocalSearchService(f.store), note = f.store.notes.create({ title: "stars", body: "stars are written here" });
    assert.equal(note.status, 'saved');
    const found = (await all(service, "stars", ['note'])).items[0];
    if (note.status === 'saved') f.store.notes.update({ id: note.note.id, expectedRevision: note.note.revision, title: "stars", body: "The text was replaced" });
    await assert.rejects(service.resolve(found.locator));
    for (let index = 0; index < 3; index++) message(f, `stars${index}`);
    const first = await service.search({ query: "stars", kinds: ['conversation'], limit: 1 });
    f.policy.revoke('evidence:read');
    await assert.rejects(service.search({ query: "stars", cursor: first.nextCursor! }));
    await assert.rejects(service.resolve(first.items[0].locator));
    assert.equal((await all(service, "stars", ['conversation'])).items.length, 0);
    assert.equal((await all(service, "stars", ['note'])).items.length, 1, 'owner notebook is separate from model evidence access');
    f.store.runtime.presentation.setSurface('public');
    await assert.rejects(service.search({ query: "stars" }));
    await assert.rejects(service.resolve(found.locator));
  } finally { f.close(); }
});

test('PDF text pages continue in bounded batches and image-only coverage is not called complete', async () => {
  const f = new Fixture();
  try {
    material(f, "handout.pdf", '%PDF-1.7\nsynthetic fixture bytes');
    const read: number[] = [];
    const service = new LocalSearchService(f.store, async (_bytes, request) => {
      read.push(request.page);
      return { page: request.page, pageCount: 7, text: request.page === 7 ? "The final page contains stars" : "This page's text", needsVisual: request.page === 1 };
    });
    const first = await service.search({ query: "stars", kinds: ['material'] });
    assert.equal(first.items.length, 0); assert.ok(first.nextCursor); assert.ok(read.length <= 4);
    const rest = await service.search({ query: "stars", kinds: ['material'], cursor: first.nextCursor! });
    assert.deepEqual(read, [1, 2, 3, 4, 5, 6, 7]);
    assert.equal(rest.items.length, 1);
    assert.equal(rest.items[0].locator.kind === 'material' && rest.items[0].locator.page, 7);
    assert.equal(rest.complete, false); assert.equal(rest.warnings[0].code, 'text_layer_only');
  } finally { f.close(); }
});

test('cancelled PDF search cannot return a late private result; read failures remain visible', async () => {
  const f = new Fixture();
  try {
    material(f, "handout.pdf", '%PDF-1.7\nsynthetic fixture bytes');
    let release!: () => void, started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const service = new LocalSearchService(f.store, async () => {
      started(); await new Promise<void>(resolve => { release = resolve; });
      return { page: 1, pageCount: 1, text: "stars private result" };
    });
    const searching = service.search({ query: "stars", kinds: ['material'] });
    await ready;
    const rejected = assert.rejects(searching); service.cancel(); release(); await rejected;
    const failed = new LocalSearchService(f.store, async () => { throw new Error('reader unavailable'); });
    const result = await all(failed, "stars", ['material']);
    assert.equal(result.items.length, 0); assert.equal(result.complete, false);
    assert.equal(result.warnings[0].code, 'unavailable');
  } finally { f.close(); }
});
