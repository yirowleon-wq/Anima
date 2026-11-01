import test from 'node:test';
import assert from 'node:assert/strict';
import { Fixture, supported } from './support';
import { HarnessError } from '../../src/shared/harness';
import { ProviderError } from '../../src/main/provider';
import { bindModelSemantics } from '../../src/main/memory/model';

test('memory drains defer exhausted budgets and transient reviews without losing or duplicating reordered candidates', async () => {
  const f = new Fixture();
  try {
    const event = f.ingest('I like jazz. I usually run at the field.');
    const a = f.change(event, { sourceQuote: 'I like jazz.', text: 'I like jazz.', predicate: 'music.preference' });
    const b = f.change(event, { sourceQuote: 'I usually run at the field.', text: 'I usually run at the field.', predicate: 'running.venue' });
    const contract = f.policy.ingress('Synthetic memory continuity check', 'continuity', f.store.settings()).contract;
    let phase = 0;
    bindModelSemantics(f.memory, f.policy, contract, (async (messages: any[], _tools: unknown, _signal: unknown, _text: unknown, options: any) => {
      if (phase === 0) throw new HarnessError('memory_budget', 'synthetic exhausted budget');
      if (options.phase === 'memory_extract') return { content: JSON.stringify({ status: 'candidate_emitted', changes: phase === 1 ? [a, b] : [b, a] }), tool_calls: [] };
      const input = JSON.parse(messages.at(-1).content);
      if (phase === 1 && input.candidate.predicate === 'running.venue') throw new ProviderError('synthetic transport interruption', true);
      return { content: JSON.stringify(supported), tool_calls: [] };
    }) as any);
    await assert.rejects(f.memory.process(contract.scope, event.id), { code: 'memory_budget' });
    assert.deepEqual(f.repo.spans(f.scope(), event.id).map(span => span.status), ['pending']);
    phase = 1;
    await assert.rejects(f.memory.process(contract.scope, event.id), ProviderError);
    assert.deepEqual(f.repo.spans(f.scope(), event.id).map(span => span.status), ['pending']);
    assert.equal(f.repo.assertions(f.scope()).length, 1);
    phase = 2;
    await f.memory.process(contract.scope, event.id);
    assert.deepEqual(new Set(f.repo.assertions(f.scope()).map(value => value.predicate)), new Set(['music.preference', 'running.venue']));
    assert.equal(f.repo.assertions(f.scope()).length, 2);
    assert.deepEqual(f.repo.spans(f.scope(), event.id).map(span => span.status), ['candidate_emitted']);
    assert.equal(f.repo.watermarks().extractedContiguous, event.sequence);
  } finally { f.close(); }
});

test('recovery queue persists fairness and transient backoff without reviving restricted sources', () => {
  const f = new Fixture();
  let resumed: Fixture | undefined;
  try {
    const first = f.ingest('First synthetic pending fact.'), second = f.ingest('Second synthetic pending fact.');
    assert.equal(f.repo.nextPendingMemory()?.id, first.id);
    assert.equal(f.repo.recordMemoryAttempt(first.id, 'retryable').status, 'pending');
    assert.equal(f.repo.nextPendingMemory()?.id, second.id);
    resumed = f.restart();
    assert.equal(resumed.repo.nextPendingMemory(first.id), undefined);
    resumed.clock.advance(1001);
    assert.equal(resumed.repo.nextPendingMemory()?.id, second.id, 'never-attempted source precedes retry');
    assert.equal(resumed.repo.nextPendingMemory(first.id)?.id, first.id);
    resumed.repo.db.prepare('INSERT INTO h_source_restrictions VALUES(?,?,?,NULL)').run(first.id, 'preference.old', 'DEACTIVATE');
    assert.equal(resumed.repo.nextPendingMemory(first.id)?.id, first.id, 'a local restriction leaves independent passages recoverable');
    resumed.repo.db.prepare('INSERT INTO h_source_restrictions VALUES(?,?,?,NULL)').run(first.id, '*', 'REVOKE');
    assert.equal(resumed.repo.nextPendingMemory(first.id), undefined);
    resumed.repo.markSpans(resumed.scope(), second.id, 'no_personal_fact');
    assert.equal(resumed.repo.recordMemoryAttempt(second.id, 'checked').status, 'complete');
    assert.equal(resumed.repo.nextPendingMemory(), undefined);
  } finally { if (resumed) resumed.close(); else f.close(); }
});

test('time and scope eligibility precede retrieval limits; all pages and query endings remain reachable', async () => {
  const f = new Fixture();
  try {
    for (let i = 0; i < 50; i++) await f.remember(`Morning run route and weather history ${i}`, { validTo: '2026-09-13T06:00:00.000Z', predicate: `history.${i}` });
    const current = await f.remember('Choose the field for morning runs', { predicate: 'running.current' });
    const ingress = f.policy.ingress('Plan a morning run', 'temporal', f.store.settings());
    const pack = await f.store.runtime.context.compile(ingress, [], new AbortController().signal);
    const found = f.store.runtime.context.prefetch(pack, 'Morning run route and weather history') as any;
    assert.deepEqual(found.bundles.flatMap((bundle: any) => bundle.assertions.map((value: any) => value.id)), [current.id]);
    for (let i = 0; i < 60; i++) await f.remember(`Synthetic pagination topic ${i}`, { predicate: `paging.${i}` });
    const ids: string[] = [], originals: string[] = [];
    for (let offset = 0; offset < 64; offset += 8) {
      const page = f.repo.lexicalAssertionPage(f.scope(), 'Synthetic pagination topic', { at: f.clock.now(), verified: true, limit: 8, offset });
      assert.equal(page.total, 60); ids.push(...page.items.map(value => value.id));
      originals.push(...f.repo.lexicalEvidence(f.scope(), 'Synthetic pagination topic', 8, offset).map(value => value.id));
    }
    assert.equal(ids.length, 60); assert.equal(new Set(ids).size, 60);
    assert.equal(originals.length, 60); assert.equal(new Set(originals).size, 60);
    const ending = await f.remember('Squirrel observation', { predicate: 'tail.query' });
    const longQuery = Array.from({ length: 100 }, (_, i) => String.fromCodePoint(0x1f300 + i)).join('') + 'Squirrel observation';
    assert.ok(f.repo.lexicalAssertionPage(f.scope(), longQuery, { at: f.clock.now() }).items.some(value => value.id === ending.id));
    assert.ok(f.repo.lexicalEvidence(f.scope(), longQuery).some(value => value.id === ending.evidenceIds[0]));
  } finally { f.close(); }
});

test('local corrections retain independent originals with precise historical ranges and reject stale extraction', async () => {
  const f = new Fixture();
  try {
    const event = f.ingest('😀I like jazz. My bicycle lock code is written in a small blue notebook.');
    const quote = 'I like jazz.';
    const old = await f.memory.propose(f.scope(), f.change(event, { sourceQuote: quote, text: quote, predicate: 'music.preference' }), undefined, { review: supported });
    const correction = f.ingest('Correction: I like classical music.');
    await f.memory.propose(f.scope(), f.change(correction, { operation: 'CORRECT', targetId: old.id, expectedRevision: old.revision, predicate: old.predicate }), undefined, { review: { ...supported, derivation: 'maintain_existing' } });
    assert.ok(f.repo.searchEvidence(f.scope(), 'bicycle lock').some(value => value.id === event.id));
    const historical = f.repo.historicalEvidence(f.scope(), event);
    assert.equal(historical.use, 'historical_only');
    assert.deepEqual(historical.restrictions[0].ranges, [{ contentVersion: 1, start: 1, end: 1 + Array.from(quote).length }]);
    assert.equal(historical.restrictions[0].replacementEventId, correction.id);
    await assert.rejects(f.memory.propose(f.scope(), f.change(event, { sourceQuote: quote, predicate: old.predicate }), undefined, { review: supported }));
    await assert.rejects(f.memory.propose(f.scope(), f.change(event, { sourceQuote: quote, predicate: 'renamed.music.preference' }), undefined, { review: supported }));
    const independent = await f.memory.propose(f.scope(), f.change(event, { sourceQuote: 'My bicycle lock code is written in a small blue notebook.', text: 'Location of the lock notebook', predicate: 'bicycle.note_location' }), undefined, { review: supported });
    assert.equal(independent.status, 'active');
    const restored = f.restart();
    try {
      assert.equal(restored.repo.sourceRestrictions(restored.scope(), event.id)[0].rangeUnknown, false);
      restored.memory.forget([event.id]);
      assert.equal(restored.repo.searchEvidence(restored.scope(), 'bicycle lock').length, 0);
      assert.equal(restored.repo.lexicalEvidence(restored.scope(), 'bicycle lock').length, 0);
    } finally { restored.close(); }
  } finally { try { f.close(); } catch {} }
});

test('indexed and pending originals share one stable pagination order while whole-source restrictions remain closed', () => {
  const f = new Fixture();
  try {
    const events = Array.from({ length: 12 }, (_, i) => f.ingest(`Synthetic observation record ${i}`));
    for (const event of events.filter((_, i) => i % 2 === 0)) f.repo.indexEvidence(f.scope(), event.id);
    f.repo.db.prepare('INSERT INTO h_source_restrictions VALUES(?,?,?,NULL)').run(events[0].id, '*', 'REVOKE');
    const results = [0, 4, 8].flatMap(offset => f.repo.lexicalEvidence(f.scope(), 'Synthetic observation record', 4, offset));
    assert.equal(results.length, 11); assert.equal(new Set(results.map(event => event.id)).size, 11);
    assert.ok(!results.some(event => event.id === events[0].id));
    assert.equal(f.repo.searchEvidence(f.scope(), 'Synthetic observation record', 4, 8).length, 3);
  } finally { f.close(); }
});

test('background source projection bounds raw reads, derived assertions and pack state independently of usage estimates', async () => {
  const f = new Fixture();
  try {
    const event = f.ingest('An allowed observation passage. A synthetic secret code SILVERLEAF must not leave this source.');
    const secret = await f.memory.propose(f.scope(), f.change(event, { sourceQuote: event.text, predicate: 'private.code' }), undefined, { review: supported });
    f.repo.db.prepare('INSERT INTO h_source_restrictions VALUES(?,?,?,NULL)').run(event.id, 'Private metadata code BANYAN', 'CORRECT');
    const permitted = await f.remember('An independent public lead from the observation passage', { predicate: 'allowed.observation' });
    const ingress = f.policy.ingress('Read the observation passage', 'projected', f.store.settings());
    const pack = await f.store.runtime.context.compile(ingress, [], new AbortController().signal);
    const project = (source: typeof event) => source.id === event.id ? { ...source, text: 'An allowed observation passage.' } : source;
    const result = f.store.runtime.context.prefetch(pack, 'observation passage', f.clock.now(), 0, 8, 0, project) as any;
    assert.ok(!JSON.stringify(result).includes('SILVERLEAF'));
    assert.ok(!JSON.stringify(result).includes('BANYAN'));
    assert.ok(!JSON.stringify(pack.data).includes('SILVERLEAF'));
    assert.ok(!pack.assertions.some(assertion => assertion.id === secret.id));
    assert.ok(pack.assertions.some(assertion => assertion.id === permitted.id));
    assert.ok(!pack.receipt.providedObjectVersions.some(version => version.id === secret.id));
    const hidden = f.store.runtime.context.prefetch(pack, 'SILVERLEAF', f.clock.now(), 0, 8, 0, project) as any;
    assert.equal(hidden.originals.length, 0); assert.equal(hidden.bundles.length, 0);
    const tiny = await f.store.runtime.context.compile(ingress, [], new AbortController().signal);
    tiny.contract.budget.maxReadBytes = 1;
    const partial = f.store.runtime.context.prefetch(tiny, 'observation passage', f.clock.now(), 0, 8, 0, project);
    assert.equal(partial.status, 'fresh');
    assert.ok(!JSON.stringify(partial).includes('SILVERLEAF'));
  } finally { f.close(); }
});
