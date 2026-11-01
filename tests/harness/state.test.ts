import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { Fixture } from './support';
import { DomainService } from '../../src/main/storage/domains';
import { WorkService } from '../../src/main/runtime/work';
import { CapabilityBroker, type CapabilityProvider } from '../../src/main/capabilities/broker';
import { ActionRuntime } from '../../src/main/actions/runtime';
import { ReminderRuntime } from '../../src/main/actions/reminders';
import { always } from '../../src/shared/harness';

export function localProvider(): CapabilityProvider {
  return {
    manifest: {
      id: 'local-agenda-provider',
      version: '1',
      trust: 'bundled_reviewed',
      sourceId: 'local-agenda',
      capabilities: [
        {
          name: 'local.agenda.save',
          version: '1',
          input: z
            .object({
              title: z.string(),
              detail: z.string().default(''),
              startsAt: z.string().optional(),
              durationMinutes: z.number().optional(),
            })
            .strict(),
          output: z.object({}).strict(),
          effect: 'local_write',
          requiredScopes: ['local:write'],
          subjects: ['self'],
          worlds: ['real'],
          timeoutMs: 1000,
          maxBytes: 8000,
          supportsIdempotency: true,
          supportsInspect: true,
          supportsCancel: true,
        },
      ],
      egressHosts: [],
      platforms: ['*'],
      simulated: false,
      offline: 'read_cache',
      license: 'project-owned',
    },
    invoke: () => {
      throw new Error('Local transaction handled by ActionRuntime');
    },
  };
}

test('INV-13 campus partial sports updates preserve schedule and official count cannot be changed by local done', () => {
  const f = new Fixture();
  try {
    const d = new DomainService(f.repo, f.policy);
    d.importSnapshot({
      source: "Fictional course",
      updatedAt: f.clock.now(),
      schedule: [
        {
          id: 'class-1',
          title: "Example course",
          startsAt: '2026-09-14T08:00:00Z',
          endsAt: '2026-09-14T09:00:00Z',
          status: 'scheduled',
          location: "Room A",
          source: "Fictional",
        },
      ],
      exams: [],
      places: [],
      rules: [],
      sports: { completed: 9, required: 12, deadline: '2026-09-28T00:00:00Z', ruleSource: "Fictional rule" },
    });
    d.importSnapshot(
      {
        source: "Fictional activity",
        updatedAt: f.clock.now(),
        schedule: [],
        exams: [],
        places: [],
        rules: [],
        sports: { completed: 10, required: 12, deadline: '2026-09-28T00:00:00Z', ruleSource: "Fictional rule" },
      },
      ['sports'],
    );
    assert.equal(d.campusSnapshot()?.schedule[0].id, 'class-1');
    assert.equal(d.campusSnapshot()?.sports?.completed, 10);
    d.apply(f.scope(), {
      sourceId: 'campus:local',
      domain: 'schedule',
      institutionId: 'academic',
      termId: 'unspecified',
      scopeKeys: ['all'],
      completeness: 'partial',
      upserts: [],
      tombstones: [],
      fetchedAt: f.clock.now(),
      errors: [],
    });
    assert.equal(d.campusSnapshot()?.schedule.length, 1);
    f.store.saveAction({ id: 'local', title: "Finished running", detail: "Local completion", done: true });
    assert.equal(d.campusSnapshot()?.sports?.completed, 10);
  } finally {
    f.close();
  }
});
test('INV-04/12 duplicate approvals result in one real SQLite local write and a local-only receipt', async () => {
  const f = new Fixture();
  try {
    const b = new CapabilityBroker(f.policy);
    b.register(localProvider(), { reviewed: true, source: 'test-fixture' });
    let writes = 0;
    const actions = new ActionRuntime(f.repo, f.policy, b, (a) => {
      writes++;
      f.store.saveAction(a);
    });
    const scope = f.scope(),
      a = actions.prepare(scope, { capability: 'local.agenda.save', arguments: { title: "Local event" } }),
      approval = actions.approve(scope, a.id, a.digest, a.revision);
    assert.equal(f.store.agenda().length, 0);
    await Promise.all(Array.from({ length: 3 }, () => actions.execute(scope, a.id, approval.id)));
    assert.equal(writes, 1);
    assert.equal(f.store.agenda().length, 1);
    assert.equal(actions.receipts(scope, a.id)[0].localStatus, 'local_saved');
    assert.equal(actions.get(scope, a.id)?.status, 'succeeded');
  } finally {
    f.close();
  }
});
test('INV-12 digest-bound approval expires on argument revision', async () => {
  const f = new Fixture();
  try {
    const b = new CapabilityBroker(f.policy);
    b.register(localProvider(), { reviewed: true, source: 'test' });
    const actions = new ActionRuntime(f.repo, f.policy, b, (a) => f.store.saveAction(a));
    const s = f.scope(),
      a = actions.prepare(s, { capability: 'local.agenda.save', arguments: { title: "Old content" } }),
      approval = actions.approve(s, a.id, a.digest, 1);
    actions.revise(s, a.id, 1, { title: "New content" });
    await assert.rejects(() => actions.execute(s, a.id, approval.id), /confirmation expired/);
    assert.equal(f.store.agenda().length, 0);
  } finally {
    f.close();
  }
});
test('INV-08 pre-dispatch revocation actually blocks a previously approved action', async () => {
  const f = new Fixture();
  try {
    const b = new CapabilityBroker(f.policy);
    b.register(localProvider(), { reviewed: true, source: 'test' });
    const actions = new ActionRuntime(f.repo, f.policy, b, (a) => f.store.saveAction(a));
    const s = f.scope(),
      a = actions.prepare(s, { capability: 'local.agenda.save', arguments: { title: "Awaiting confirmation" } }),
      approval = actions.approve(s, a.id, a.digest, 1);
    actions.beforeDispatch = async () => {
      f.policy.revoke('local:write');
    };
    await assert.rejects(() => actions.execute(s, a.id, approval.id), /changed/);
    assert.equal(f.store.agenda().length, 0);
    assert.equal(actions.get(f.scope(), a.id)?.status, 'cancelled');
  } finally {
    f.close();
  }
});
test('INV-18 goal cancellation invalidates reminder jobs and accepted work is not silently replanned', async () => {
  const f = new Fixture();
  try {
    const work = new WorkService(f.repo, f.policy),
      s = f.scope(),
      goal = work.create(s, 'goal', "Competition preparation", {}, { status: 'active' });
    const reminders = new ReminderRuntime(f.repo, f.policy);
    reminders.schedule({ id: 'prep', title: "Preparation", detail: '', startsAt: f.clock.now() }, goal.id);
    const accepted = work.create(s, 'plan', "Accepted study time", { accepted: true }, { status: 'accepted' });
    work.cancelGoal(s, goal.id);
    assert.equal(f.repo.db.prepare('SELECT status FROM h_jobs').get()?.status, 'cancelled');
    assert.deepEqual(work.repair(s, { weather: 'rain' }).find((p) => p.id === accepted.id)?.next, accepted.data);
  } finally {
    f.close();
  }
});
test('INV-17 quiet hours, attention budget and real OS receipt limitations are preserved', async () => {
  const f = new Fixture();
  try {
    const reminders = new ReminderRuntime(f.repo, f.policy);
    reminders.configure({ enabled: true, quietWindows: [['22:00', '08:00']] });
    reminders.port = {
      capabilities: { submitted: true, delivered: false, seen: false, stableId: false, closedApp: false },
      submit: async () => ({ status: 'submitted_to_os' }),
    };
    for (let i = 0; i < 10; i++)
      reminders.schedule({ id: 'r' + i, title: "Reminder" + i, detail: '', startsAt: '2026-09-14T06:00:00Z' });
    f.clock.set('2026-09-14T13:00:00Z');
    await reminders.runDue();
    assert.equal(reminders.submitted.length, 0);
    f.clock.set('2026-09-14T15:05:00Z');
    await reminders.runDue();
    assert.equal(reminders.submitted.length, 1);
    assert.equal(reminders.submitted[0].status, 'submitted_to_os');
    assert.equal(reminders.capabilities().closedAppReminders, false);
    await reminders.runDue();
    assert.equal(reminders.submitted.length, 1);
  } finally {
    f.close();
  }
});
test('INV-03/04 stable image option anchors survive reorder and hypothetical adoption prepares tasks only', () => {
  const f = new Fixture();
  try {
    const work = new WorkService(f.repo, f.policy),
      s = f.scope();
    const episode = work.create(s, 'episode', "Comparison", { optionIds: [] }, { status: 'active' });
    work.addOptions(
      s,
      episode.id,
      [
        { id: 'a', title: "A" },
        { id: 'b', title: "B" },
      ],
      ['a', 'b'],
    );
    assert.equal(work.resolveReference(s, episode.id, "Choose the second").optionId, 'b');
    const e = f.repo.work(s, 'episode')[0];
    work.update(s, e.id, e.revision, { data: { ...e.data, optionIds: ['b', 'a'] } });
    assert.equal(work.resolveReference(s, e.id, "Continue that comparison").optionId, 'b');
    work.createWorld(s, 'dorm', { application: 'dorm' });
    const diff = work.adoptionDiff(s, 'dorm');
    work.adoptPreparation(s, 'dorm', [diff.items[0].id]);
    assert.equal(f.repo.work(s, 'task').length, 1);
    assert.equal(f.repo.assertions(s).length, 0);
    assert.equal(f.repo.work(s, 'commitment').length, 0);
  } finally {
    f.close();
  }
});

test('conversation frames keep multiple matters, resume a tangent and recover options across sessions', () => {
  const f = new Fixture();
  try {
    const work = new WorkService(f.repo, f.policy),
      s = f.scope(),
      first = f.ingest("Compare dorm and off-campus housing options", 'frame-a1'),
      episodeA = work.episode(s, 'session-a', first.text, [first.id])!;
    work.addOptions(s, episodeA.id, [{ id: 'stay-dorm', title: "Dorm" }, { id: 'stay-out', title: "Off campus" }]);
    const tangent = f.ingest("Schedule running next week", 'frame-b1'),
      episodeB = work.episode(s, 'session-a', tangent.text, [tangent.id])!;
    assert.notEqual(episodeA.id, episodeB.id, 'unrelated request in one chat gets its own episode');
    work.addOptions(s, episodeB.id, [{ id: 'run-morning', title: "Morning run" }, { id: 'run-evening', title: "Evening run" }]);
    const returnTurn = f.ingest("Continue the previous one", 'frame-a-return'),
      resumed = work.episode(s, 'session-a', returnTurn.text, [returnTurn.id])!;
    assert.equal(resumed.id, episodeA.id, 'the tangent keeps a parent focus chain');
    assert.equal(work.resolveReference(s, episodeA.id, "Choose the second").optionId, 'stay-out');

    const crossSession = f.ingest("Continue comparing dorm options", 'frame-a2'),
      resumedFromNewChat = work.episode(s, 'session-b', crossSession.text, [crossSession.id])!;
    assert.equal(resumedFromNewChat.id, episodeA.id, 'semantic anchor resumes an episode in another session');
    assert.ok((resumedFromNewChat.data.sessionIds as string[]).includes('session-b'));
    assert.equal(f.repo.conversationFrames(s, { sessionId: 'session-b' }).length, 1);
    const evidenceResumed = work.episode(s, 'session-c', "Continue with this material", [first.id])!;
    assert.equal(evidenceResumed.id, episodeA.id, 'shared surviving evidence is a stable cross-session anchor');
  } finally {
    f.close();
  }
});

test('deleted evidence cannot resurrect a conversation frame or its option reference', () => {
  const f = new Fixture();
  try {
    const work = new WorkService(f.repo, f.policy),
      s = f.scope(),
      event = f.ingest("Compare retained study places", 'frame-delete'),
      episode = work.episode(s, 'session-delete', event.text, [event.id])!;
    work.addOptions(s, episode.id, [{ id: 'library', title: "Library" }, { id: 'home', title: "Home" }]);
    const fence = f.repo.establishFence({ kind: 'delete', objectIds: [], sourceIds: ['history:self'] });
    f.repo.cleanupFence(fence);
    const rebuilt = f.scope();
    assert.equal(f.repo.conversationFrames(rebuilt).length, 0);
    assert.equal(work.resolveCurrentReference(rebuilt, 'session-new', "Choose the second").status, 'none');
  } finally {
    f.close();
  }
});
test('INV-05 ISO offsets compare as instants for reminders and evidence expiry', async () => {
  const f = new Fixture();
  try {
    f.ingest("This material expired.", 'expired-offset', {
      label: {
        purpose: 'personal_assistance',
        audience: 'self',
        retention: 'purpose_scoped',
        sensitivity: 'personal',
        infer: false,
        expiresAt: '2026-09-13T22:30:00-07:00',
      },
    });
    assert.equal(f.repo.evidence(f.scope(), 'expired-offset'), undefined);
    const reminders = f.store.runtime.reminders;
    reminders.configure({ enabled: true, quietWindows: [] });
    reminders.port = {
      capabilities: { submitted: true, delivered: false, seen: false, stableId: false, closedApp: false },
      submit: async () => ({ status: 'submitted_to_os' }),
    };
    reminders.schedule({
      id: 'offset-action',
      title: "Local 11 PM",
      detail: '',
      startsAt: '2026-09-13T23:00:00-07:00',
    });
    await reminders.runDue();
    assert.equal(reminders.submitted.length, 1);
  } finally {
    f.close();
  }
});

test('a reminder set for a time fires at that time even in quiet hours; late ones and optional notices wait', async () => {
  const f = new Fixture();
  try {
    const reminders = new ReminderRuntime(f.repo, f.policy);
    reminders.configure({ enabled: true, quietWindows: [['22:00', '08:00']], timeZone: 'America/Los_Angeles' });
    const sent: { title: string; body: string; silent?: boolean }[] = [];
    reminders.port = {
      capabilities: { submitted: true, delivered: false, seen: false, stableId: false, closedApp: false },
      submit: async input => { sent.push(input); return { status: 'submitted_to_os' }; },
    };
    // 07:30 local is inside quiet hours but is the explicitly chosen reminder time.
    reminders.schedule({ id: 'wake', title: "Bring material", detail: '', kind: 'reminder', startsAt: '2026-10-22T14:30:00Z', reminderMessage: "Good morning. Remember to bring the material." });
    reminders.schedule({ id: 'late', title: "Yesterday's event", detail: '', kind: 'reminder', startsAt: '2026-10-21T10:00:00Z' });
    f.clock.set('2026-10-22T14:30:20Z');
    await reminders.runDue();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].body, "Good morning. Remember to bring the material.");
    assert.equal(sent[0].silent, false);
    await reminders.runDue();
    assert.equal(sent.length, 1, 'the late reminder waits for the quiet hours to end');
    // 15:05Z is 08:05 local, after quiet hours; the overdue group can go out.
    f.clock.set('2026-10-22T15:05:00Z');
    await reminders.runDue();
    assert.equal(sent.length, 2);
    assert.match(sent[1].body, /Yesterday's event|agreed times have passed/);
  } finally {
    f.close();
  }
});

test('notification text is her words, or a private placeholder when previews are off', async () => {
  const { notificationText } = await import('../../src/main/actions/reminders');
  const persona = { core: { name: "Mio" } };
  assert.deepEqual(notificationText({ persona }, 'reminder', { title: "Bring material", message: "Good morning. Bring the material." }), { title: "Mio", body: "Good morning. Bring the material." });
  assert.deepEqual(notificationText({ persona }, 'reminder', { title: "Bring material" }), { title: "Mio", body: "It's time: Bring material" });
  assert.deepEqual(notificationText({ persona, notificationPreview: 'private' }, 'suggestion', { title: "Grade update", body: "Your calculus grade is available" }), { title: "Mio", body: "There's something I'd like to tell you." });
  const long = notificationText({ persona }, 'suggestion', { body: "I".repeat(200) });
  assert.equal(Array.from(long.body).length, 90);
  assert.equal(notificationText({}, 'reminder', { catchup: true }).title, "Anima");
});
