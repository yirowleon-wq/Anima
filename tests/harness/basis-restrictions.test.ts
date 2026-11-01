import test from 'node:test';
import assert from 'node:assert/strict';
import { Fixture, supported } from './support';
import type { EvidenceEvent, WorkRecord } from '../../src/shared/harness';

function useBasis(f: Fixture, event: EvidenceEvent, matter: WorkRecord, quote: string, consumerIds: string[] = []) {
  return f.store.runtime.basis.update(f.scope(), 'basis-restriction-session', {
    operation: 'use', matterId: matter.id, source: { eventId: event.id, quote },
    interpretation: quote, purpose: 'Compare the current activity options', validWhen: 'This activity comparison while the original words still apply',
    stopWhen: 'The user corrects this preference or ends the comparison', recheckAt: null,
    standing: 'supported', applicability: 'applies_now', consumerIds,
  }) as WorkRecord;
}

test('source correction retires only overlapping basis uses and their candidates, preserving unrelated uses and accepted calendar', async () => {
  let f = new Fixture();
  try {
    const event = f.ingest('🎼I like jazz. I usually run at the west field.', 'basis-combined-source');
    const music = await f.memory.propose(f.scope(), f.change(event, {
      sourceQuote: 'I like jazz.', text: 'I like jazz.', predicate: 'music.preference',
    }), undefined, { review: supported });
    const matter = f.store.runtime.work.create(f.scope(), 'episode', 'Weekend activity comparison', {}, { status: 'active' });
    const option = f.store.runtime.work.create(f.scope(), 'option', 'Jazz performance option', {}, { status: 'proposed' });
    const oldBasis = useBasis(f, event, matter, 'I like jazz.', [option.id]);
    const unrelated = useBasis(f, event, matter, 'I usually run at the west field.');
    assert.deepEqual((oldBasis.data.source as any).start, 1, 'source offsets use Unicode code points');
    f.store.saveAction({ id: 'independent-calendar', title: 'Confirmed discussion', detail: '', done: false, startsAt: '2026-09-14T10:00:00Z' });
    const accepted = structuredClone(f.store.agenda());

    const correction = f.ingest('Correction: I only like classical music.', 'basis-music-correction');
    await f.memory.propose(f.scope(), f.change(correction, {
      operation: 'CORRECT', targetId: music.id, expectedRevision: music.revision, predicate: music.predicate,
    }), undefined, { review: { ...supported, derivation: 'maintain_existing' } });

    const states = f.store.runtime.basis.read(f.scope(), matter.id);
    const corrected = states.find(record => record.id === oldBasis.id)!;
    assert.equal(corrected.usableNow, false);
    assert.equal(corrected.status, 'insufficient');
    assert.equal(corrected.data.invalidationReason, 'basis_source_changed');
    assert.equal(corrected.data.inverseEstablished, false);
    assert.equal(states.find(record => record.id === unrelated.id)?.usableNow, true);
    assert.equal(f.repo.work(f.scope(), undefined, option.id)[0].status, 'stale');
    assert.deepEqual(f.store.agenda(), accepted);
    assert.throws(() => useBasis(f, event, matter, 'I like jazz.'), { code: 'basis_source_changed' });
    assert.doesNotThrow(() => useBasis(f, event, matter, 'I usually run at the west field.'));
    assert.doesNotThrow(() => useBasis(f, correction, matter, correction.text));
    assert.throws(() => f.store.runtime.basis.link(f.scope(), oldBasis, option.id), { code: 'basis_inactive' });

    f = f.restart();
    assert.equal(f.store.runtime.basis.read(f.scope(), matter.id).find(record => record.id === oldBasis.id)?.usableNow, false);
    assert.equal(f.store.runtime.basis.read(f.scope(), matter.id).find(record => record.id === unrelated.id)?.usableNow, true);
    assert.deepEqual(f.store.agenda(), accepted);
  } finally { f.close(); }
});

test('a future supersession retires the old basis at its effective time, including after restart', async () => {
  let f = new Fixture();
  try {
    const event = f.ingest('I currently usually run at the west field.', 'basis-current-place');
    const old = await f.memory.propose(f.scope(), f.change(event, { predicate: 'running.venue' }), undefined, { review: supported });
    const matter = f.store.runtime.work.create(f.scope(), 'episode', 'Choose a running location', {}, { status: 'active' });
    const basis = useBasis(f, event, matter, event.text);
    const future = f.ingest('Starting tomorrow I will run at the east field instead.', 'basis-future-place');
    const starts = '2026-09-15T06:00:00.000Z';
    await f.memory.propose(f.scope(), f.change(future, {
      operation: 'SUPERSEDE', targetId: old.id, expectedRevision: old.revision, predicate: old.predicate, validFrom: starts,
    }), undefined, { review: { ...supported, derivation: 'maintain_existing', temporalType: 'future' } });
    assert.equal(f.store.runtime.basis.read(f.scope(), matter.id).find(record => record.id === basis.id)?.usableNow, true);
    assert.doesNotThrow(() => useBasis(f, event, matter, event.text));
    f = f.restart();
    f.clock.set(starts);
    assert.equal(f.store.runtime.basis.read(f.scope(), matter.id).find(record => record.id === basis.id)?.usableNow, false);
    assert.throws(() => useBasis(f, event, matter, event.text), { code: 'basis_source_changed' });
  } finally { f.close(); }
});

test('legacy restrictions without a locator request re-evaluation without invalidating a different source', async () => {
  const f = new Fixture();
  try {
    const old = f.ingest('I like jazz.', 'basis-legacy-source');
    const separate = f.ingest('I usually run at the west field.', 'basis-separate-source');
    const matter = f.store.runtime.work.create(f.scope(), 'episode', 'Activity comparison', {}, { status: 'active' });
    const restricted = useBasis(f, old, matter, old.text);
    const unrelated = useBasis(f, separate, matter, separate.text);
    f.repo.db.prepare('INSERT INTO h_source_restrictions VALUES(?,?,?,?)').run(old.id, 'music.preference', 'CORRECT', null);
    const states = f.store.runtime.basis.read(f.scope(), matter.id);
    assert.equal(states.find(record => record.id === restricted.id)?.usableNow, false);
    assert.equal(states.find(record => record.id === unrelated.id)?.usableNow, true);
    assert.throws(() => useBasis(f, old, matter, old.text), { code: 'basis_source_changed' });
    assert.equal(f.repo.evidence(f.scope(), old.id)?.text, old.text, 'retiring a use does not delete the original');
  } finally { f.close(); }
});
