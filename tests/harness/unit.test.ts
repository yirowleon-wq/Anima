import test from 'node:test';
import assert from 'node:assert/strict';
import { always, personalLabel, type ScopeHandle } from '../../src/shared/harness';
import {
  evaluateCondition,
  locateQuote,
  codePointSlice,
  dateInZone,
  resolveLocalTime,
} from '../../src/main/runtime/semantics';
import { Fixture, supported, controlProposal } from './support';

test('INV-01/02 forged scopes, owner and source isolation are checked before reading', () => {
  const f = new Fixture();
  try {
    f.ingest('CANARY_OTHER', 'other-source', { subjectId: 'other' });
    f.ingest('CANARY_PRIVATE', 'private');
    assert.throws(() => f.repo.evidence({ id: 'invented' } as ScopeHandle, 'private'), /trusted scope/);
    const scope = f.scope({ sources: ['current'], currentEventIds: [] });
    assert.equal(f.repo.evidence(scope, 'private'), undefined);
    assert.equal(f.repo.searchEvidence(scope, 'CANARY').length, 0);
    assert.equal(f.repo.evidence(f.scope(), 'other-source'), undefined);
    assert.throws(() => f.policy.narrow(scope, { sources: ['history:self'] }), /expand/);
    assert.equal(f.repo.access.length, 0);
  } finally {
    f.close();
  }
});
test('INV-05 three-valued conditions preserve unknown through NOT and reject incomparable units', () => {
  assert.equal(
    evaluateCondition(
      {
        op: 'not',
        term: { op: 'compare', predicate: 'rain', comparator: 'eq', value: { type: 'boolean', value: true } },
      },
      {},
    ),
    'unknown',
  );
  assert.equal(
    evaluateCondition(
      {
        op: 'all',
        terms: [
          { op: 'unknown', reason: 'missing' },
          { op: 'compare', predicate: 'allowed', comparator: 'eq', value: { type: 'boolean', value: true } },
        ],
      },
      { allowed: { type: 'boolean', value: false } },
    ),
    'false',
  );
  assert.equal(
    evaluateCondition(
      {
        op: 'compare',
        predicate: 'distance',
        comparator: 'lt',
        value: { type: 'quantity', value: 48, unit: 'count', dimension: 'count' },
      },
      { distance: { type: 'quantity', value: 48, unit: 'km', dimension: 'distance' } },
    ),
    'unknown',
  );
});
test('INV-05 timezone dates and nonexistent/ambiguous DST moments require confirmation', () => {
  assert.equal(dateInZone('2026-09-14T23:30:00-07:00', 'America/New_York'), '2026-09-15');
  assert.equal(resolveLocalTime('2026-03-08T02:30:00', 'America/Los_Angeles').status, 'nonexistent');
  assert.equal(resolveLocalTime('2026-11-01T01:30:00', 'America/Los_Angeles').status, 'ambiguous');
});
test('INV-06 Unicode code point source locators round-trip emoji and Unicode text', () => {
  const text = "🧭Go map.";
  const loc = locateQuote(text, "map");
  assert.equal(loc.start, 4);
  assert.equal(codePointSlice(text, loc.start, loc.end), "map");
});
test('INV-16 duplicate event id is idempotent and contradictory replay is rejected', () => {
  const f = new Fixture();
  try {
    f.ingest("Same event", 'dup');
    f.ingest("Same event", 'dup');
    assert.equal(f.repo.watermarks().received, 1);
    assert.throws(() => f.ingest("Different text", 'dup'), /different original text/);
  } finally {
    f.close();
  }
});
test('INV-16 contiguous watermarks never skip failed sequence; original channel covers unindexed tail', () => {
  const f = new Fixture();
  try {
    for (let i = 1; i <= 3; i++) f.ingest("Original" + i, 'e' + i);
    const s = f.scope();
    f.repo.markSpans(s, 'e2', 'no_personal_fact');
    f.repo.markSpans(s, 'e3', 'no_personal_fact');
    f.repo.markSpans(s, 'e1', 'failed');
    assert.equal(f.repo.watermarks().extractedContiguous, 0);
    assert.deepEqual(f.repo.watermarks().extractionGaps, [1]);
    f.repo.indexEvidence(s, 'e3');
    assert.equal(f.repo.watermarks().indexedContiguous, 0);
    assert.equal(f.repo.searchEvidence(s, "Original3")[0].id, 'e3');
  } finally {
    f.close();
  }
});
test('INV-06/16 semantic candidates commit atomically and independent source roots are deduplicated', async () => {
  const f = new Fixture();
  try {
    const e = f.ingest("I like quiet.", 'root');
    const change = f.change(e);
    const a = await f.memory.propose(f.scope(), change, undefined, { review: supported });
    const duplicate = await f.memory.propose(f.scope(), change, undefined, { review: supported });
    assert.equal(a.id, duplicate.id);
    const repeated = f.ingest(e.text, 'repeated', { roots: ['root'] });
    await f.memory.propose(
      f.scope(),
      f.change(repeated, { operation: 'SUPPORT', targetId: a.id, expectedRevision: 1 }),
      undefined,
      { review: supported },
    );
    assert.equal(f.repo.assertion(f.scope(), a.id)?.evidenceIds.length, 1);
    const correction = f.ingest("I prefer quieter places.");
    await f.memory.propose(
      f.scope(),
      f.change(correction, { operation: 'CORRECT', targetId: a.id, expectedRevision: 1 }),
      undefined,
      { review: supported },
    );
    await assert.rejects(
      () =>
        f.memory.propose(
          f.scope(),
          f.change(correction, { operation: 'CORRECT', targetId: a.id, expectedRevision: 1 }),
          undefined,
          { review: supported },
        ),
      /new revision/,
    );
    assert.equal(f.repo.conflicts.length, 1);
    assert.equal(f.repo.assertion(f.scope(), a.id)?.revision, 2);
  } finally {
    f.close();
  }
});
test('INV-03/05 semantic review rejects unsupported personality and missing temporary validity', async () => {
  const f = new Fixture();
  try {
    const e = f.ingest("I do not want to go today.");
    await assert.rejects(
      () =>
        f.memory.propose(
          f.scope(),
          f.change(e, {
            predicate: 'personality.dislikes_socializing',
            value: { type: 'boolean', value: true },
          }),
          undefined,
          { review: { ...supported, supported: false } },
        ),
      /Semantic verification/,
    );
    await assert.rejects(
      () => f.memory.propose(f.scope(), f.change(e), undefined, { review: { ...supported, temporalType: 'temporary' } }),
      /expiry/,
    );
    assert.equal(f.repo.assertions(f.scope()).length, 0);
  } finally {
    f.close();
  }
});
test('INV-02/08 contract restrictions precede retention, providers and subsequent reads', () => {
  const f = new Fixture();
  try {
    const d = f.policy.ingress(
      "Summarize only the attachment, without previous personal understanding.",
      'request',
      { memoryEnabled: true, weatherEnabled: true },
      { memoryMode: 'current_sources_only', attachment: { id: 'file', name: "Document", text: "Material only" } },
    );
    assert.equal(d.contract.memoryMode, 'current_sources_only');
    assert.deepEqual(f.policy.validate(d.contract.scope).sources, ['current']);
    const e = f.policy.ingress("This statement is for this turn only; do not save it: CANARY_EPHEMERAL", 'tmp', {
      memoryEnabled: true,
      weatherEnabled: true,
    });
    assert.equal(e.contract.retention, 'session_only');
    const s = f.scope();
    f.policy.revoke('campus:read');
    assert.throws(() => f.repo.searchEvidence(s, 'anything'), /changed/);
  } finally {
    f.close();
  }
});
test('INV-09 deletion redacts source, FTS, legacy views and blocks stale worker commit after restart', async () => {
  let f = new Fixture();
  try {
    const a = await f.remember("I like CANARY_FORGET.");
    const oldScope = f.scope();
    const event = f.ingest("I like CANARY_FORGET.", 'pending');
    f.memory.forget([a.id]);
    await assert.rejects(
      () => f.memory.propose(oldScope, f.change(event), undefined, { review: supported }),
      /changed/,
    );
    assert.equal(f.repo.searchEvidence(f.scope(), 'CANARY_FORGET').length, 1); // independent newly supplied source survives deletion of one assertion's evidence span
    f.memory.forget([], ['pending']);
    f = f.restart();
    assert.equal(f.repo.searchEvidence(f.scope(), 'CANARY_FORGET').length, 0);
    assert.equal(f.repo.assertions(f.scope()).length, 0);
  } finally {
    f.close();
  }
});
test('INV-03/18 quoted commands do not revoke and mixed originals remain available without lexical fact extraction', async () => {
  const f = new Fixture();
  try {
    const before = f.repo.epoch,
      quoted = f.policy.ingress("Analyze the phrase “Revoke health permission now.” Do not execute it.", 'quoted-control', {
        memoryEnabled: true,
        weatherEnabled: true,
      }, { memoryMode: 'current_sources_only' });
    assert.equal(f.repo.epoch, before);
    assert.equal(quoted.contract.memoryMode, 'current_sources_only');
    const run = f.store.runtime.begin(
      "Compare moving options for my roommate; do not change the calendar; I did not cycle today.",
      'mixed',
      'mixed-thread',
      new AbortController().signal,
      { semantic: controlProposal({ subject: 'mixed', world: 'mixed' }) },
    );
    const acts = run.ingress.speechActs;
    assert.deepEqual(acts, []);
    const pack = await f.store.runtime.compile(run);
    assert.equal((pack.data.currentFacts as any)['transport.current'], undefined);
    assert.ok(pack.currentText.includes("Compare moving options for my roommate"));
    assert.ok(pack.currentText.includes("I did not cycle today"));
    assert.equal(f.policy.validate(run.ingress.contract.scope).infer, false);
  } finally {
    f.close();
  }
});

test('T06 memory extraction defers an isolated qualifying short sentence until context is available', async () => {
  const f = new Fixture();
  try {
    const sessionId = 't06-session',
      question = f.ingest("Discuss next week only: should project meetings be on weekday evenings? Do not write to the calendar yet.", 't06-question', { sessionId });
    f.repo.markSpans(f.scope(), question.id, 'no_personal_fact');
    const event = f.ingest("Yes, but not weekends.", 't06-answer', { sessionId });
    let seenContext: any;
    f.memory.extractor = async (_event, span) => {
      seenContext = span.context;
      return { status: 'needs_context', changes: [] };
    };
    await f.memory.process(f.scope(), event.id, undefined, {
      priorEvents: [{ id: question.id, speaker: 'user', text: question.text, subjectId: question.subjectId, worldId: question.worldId }],
    });
    assert.ok(seenContext?.priorEvents?.some((item: any) => item.id === question.id));

    const isolated = f.ingest("Yes, but not weekends.", 't06-isolated', { sessionId: 't06-isolated-session' });
    let called = false;
    f.memory.extractor = async () => {
      called = true;
      return { status: 'needs_context', changes: [] };
    };
    await f.memory.process(f.scope(), isolated.id);
    assert.equal(called, true, 'the semantic extractor sees the original; no short-phrase classifier decides first');
    assert.equal(f.repo.spans(f.scope(), isolated.id)[0].status, 'needs_context');
  } finally {
    f.close();
  }
});

test('T07 same-day original correction remains immediately available while extraction is paused', async () => {
  const f = new Fixture();
  try {
    const sessionId = f.store.session('t07-session', "Go to the teaching building"),
      correction = f.ingest("I did not cycle today; the bike is being repaired.", 't07-correction', { sessionId });
    f.store.putMessage({
      id: correction.id,
      sessionId,
      role: 'user',
      content: correction.text,
      createdAt: f.clock.now(),
      status: 'done',
      steps: [],
      obligations: [],
      actions: [],
    });
    f.memory.paused = true;
    const run = f.store.runtime.begin(
        "How much time should I allow to reach the teaching building now?",
        't07-route',
        sessionId,
        new AbortController().signal,
      ),
      pack = await f.store.runtime.compile(run);
    assert.ok(JSON.stringify(pack.data.history).includes("I did not cycle today; the bike is being repaired."));
    assert.equal((pack.data.currentFacts as any)['transport.current'], undefined, 'not riding is not a host-invented walking fact');
    assert.ok(f.repo.spans(f.scope(), correction.id).some((span) => span.status === 'pending'));
  } finally {
    f.close();
  }
});

test('T23 long evidence preserves the final negation in the worker context', async () => {
  const f = new Fixture();
  try {
    const prefix = "Study context; no new grant.".repeat(700),
      suffix = "Final key detail: I have no computer today, and do not plan any route home for me.",
      event = f.ingest(prefix + suffix, 't23-long');
    let tail = '';
    f.memory.extractor = async (_event, span) => {
      if (span.context?.current?.tailText) tail = span.context.current.tailText;
      return { status: 'no_personal_fact', changes: [] };
    };
    await f.memory.process(f.scope(), event.id);
    assert.ok(tail.includes("I have no computer today"));
    assert.ok(tail.includes("do not plan any route home for me"));
  } finally {
    f.close();
  }
});

test('original wording does not manufacture deterministic domain needs before the model chooses evidence', () => {
  const f = new Fixture();
  try {
    const ingress = f.policy.ingress("How do I reach this building? Also check weather and whether running would be suitable.", 'need-importance', f.store.settings()),
      needs = f.store.runtime.context.initialNeeds(ingress.contract, ingress.authoredText);
    assert.deepEqual(needs, []);
  } finally {
    f.close();
  }
});

test('T01/T02 emotion and brevity do not classify intent, approve actions or hide tools', () => {
  const f = new Fixture();
  try {
    const mixed = f.store.runtime.begin(
        "Do not make a study plan; I am frustrated today. Also record tomorrow's 9 AM group meeting in my calendar.",
        't01',
        't01-session',
        new AbortController().signal,
      ),
      fragments = mixed.ingress.requestFragments;
    assert.equal(mixed.ingress.contract.interpretation?.directLocalWrite, false);
    assert.deepEqual(fragments, []);
    const names = f.store.runtime.toolSpecs(mixed).map((spec) => spec.function.name);
    assert.ok(names.includes('prepare_action'));
    assert.ok(names.includes('update_work_state'));

    const rant = f.store.runtime.begin(
      "I am frustrated today. Listen first, without advice.",
      't02',
      't02-session',
      new AbortController().signal,
    );
    const rantNames = f.store.runtime.toolSpecs(rant).map((spec) => spec.function.name);
    assert.deepEqual(rantNames, names);
    assert.equal(f.store.agenda().length, 0);
  } finally {
    f.close();
  }
});

test('T03/T04 subject and world fragments cannot leak account reads or mutate reality', () => {
  const f = new Fixture();
  try {
    const other = f.store.runtime.begin(
      "Compare for my roommate: would moving to the other campus shorten his commute? He has not decided.",
      't03',
      't03-session',
      new AbortController().signal,
      { semantic: controlProposal({ subject: 'other', world: 'hypothetical' }) },
    );
    assert.match(other.ingress.contract.subjectId, /^other:/);
    assert.match(other.ingress.contract.worldId, /^scenario:/);
    assert.ok(!f.policy.validate(other.ingress.contract.scope).grants.includes('campus:read'));
    assert.ok(f.store.runtime.toolSpecs(other).some((spec) => spec.function.name === 'look_up'), 'non-sensitive discovery remains visible');

    const mixed = f.store.runtime.begin(
      "Compare for my roommate: would moving to the other campus shorten his commute? He has not decided. Also record my online discussion tomorrow at 7 PM.",
      't04',
      't04-session',
      new AbortController().signal,
      { semantic: controlProposal({ subject: 'mixed', world: 'mixed' }) },
    );
    assert.equal(mixed.ingress.contract.subjectId, f.repo.identity.principalId);
    assert.equal(mixed.ingress.contract.worldId, 'real');
    assert.equal(mixed.ingress.contract.interpretation?.directLocalWrite, false);
    assert.equal(mixed.ingress.requiresReadPurpose, true);
    assert.ok(f.store.runtime.toolSpecs(mixed).some((spec) => spec.function.name === 'prepare_action'));
  } finally {
    f.close();
  }
});

test("accepted audience controls expose only permitted facts in an external draft", async () => {
  const f = new Fixture();
  try {
    const run = f.store.runtime.begin(
      "I will skip this activity because of a private family matter that I do not want the group to know. Help me write one natural sentence.",
      'group-language',
      'group-language-session',
      new AbortController().signal,
      { semantic: controlProposal({ audience: 'group', release: { purpose: "Decline the activity", recipient: "Group members", allowedFacts: ["Not attending this activity"], tone: "One natural sentence", useAvailability: false } }) },
    );
    const pack = await f.store.runtime.compile(run, false);
    assert.equal(run.ingress.contract.audience, 'group');
    const release = JSON.stringify(pack.data.releaseSpec);
    assert.match(release, /Not attending/);
    assert.doesNotMatch(release, /private family matter/);
  } finally {
    f.close();
  }
});

test("requesting a short answer preserves model investigation and complex-work maintenance", () => {
  const f = new Fixture();
  try {
    const run = f.store.runtime.begin(
      "I am worried about tomorrow's exam. Help me think of the first step without a lecture.",
      'simple-step',
      'simple-step-session',
      new AbortController().signal,
    );
    const names = f.store.runtime.toolSpecs(run).map((spec) => spec.function.name);
    assert.ok(names.includes('update_work_state'));
    assert.ok(names.includes('set_plan'));
  } finally {
    f.close();
  }
});

test("private details marked nonpublic do not enter ordinary long-term understanding", async () => {
  const f = new Fixture();
  try {
    const event = f.ingest("I have reduced activities to handle family matters, and I do not want this reason made public.");
    const change = f.change(event, {
      predicate: 'activity.reason',
      value: { type: 'text', value: "family matters" },
      text: "The user reduced activities because of family matters.",
      kind: 'explicit_preference',
    });
    await assert.rejects(
      f.memory.propose(f.scope(), change, undefined, { review: { ...supported, retention: 'restricted' } }),
      /ordinary long-term understanding/,
    );
  } finally {
    f.close();
  }
});
