import { randomUUID } from 'node:crypto';
import * as z from 'zod';
import type { Store } from '../store';
import type { Harness } from '../harness';
import type { RuntimeOverview } from '../../shared/types';
import { HarnessError, objectId, personalLabel } from '../../shared/harness';
import { hasCredentials } from './redaction';
import { readReleaseArtifacts } from './release-store';
import { latestReleases, renderReleases } from './release-composer';
import { attentionChangeInput, attentionSourceName, type AttentionControlItem, type AttentionControlPage } from '../../shared/attention-control';
import { usingLunaTransport } from '../model-selection';
import { replySources } from './reply-sources';

/** Trusted native controls. These are never registered as model or extension tools. */
export class NativeControls {
  constructor(
    readonly store: Store,
    readonly harness: Pick<Harness, 'running' | 'recoverPending'>,
  ) {}
  private attentionScope(eventId?: string) {
    const { runtime } = this.store;
    if (runtime.presentation.public) throw new HarnessError('private_view_required', "Return to your private page before reviewing these entrusted matters.");
    const settings = this.store.settings(), base = runtime.policy.validate(runtime.policy.hostScope());
    return runtime.policy.hostScope({ sources: base.sources.filter(source =>
      (settings.memoryEnabled || !['history:self', 'profile:self'].includes(source)) &&
      (settings.weatherEnabled || source !== 'weather:open-meteo')),
      currentEventIds: eventId ? [eventId] : [], infer: false });
  }
  private attentionSession(item: AttentionControlItem): AttentionControlItem {
    if (item.sessionId && this.store.conversations().some(session => session.id === item.sessionId)) return item;
    const { sessionId: _, ...withoutSession } = item;
    return withoutSession;
  }
  attentionList(raw: unknown = {}): AttentionControlPage {
    const page = this.store.runtime.attention.nativeList(this.attentionScope(), raw);
    return { ...page, items: page.items.map(item => this.attentionSession(item)) };
  }
  attentionChange(raw: unknown): AttentionControlItem {
    const input = attentionChangeInput.parse(raw), runtime = this.store.runtime, repo = this.store.kernel;
    return repo.write(() => {
      const item = runtime.attention.nativeItem(this.attentionScope(), input.id);
      const text = input.operation === 'pause' ? `Pause the entrusted matter “${item.title}”.`
        : input.operation === 'stop' ? `Stop continuing the entrusted matter “${item.title}”.`
          : input.operation === 'revise' ? `Revise the agreement for “${item.title}”: permitted sources are ${input.changes!.sources.map(attentionSourceName).join(', ')}; ${input.changes!.until ? `until ${input.changes!.until}` : "with no end time"}. Preserve the remaining agreement and still-valid pauses.`
          : `Lift the selected pause in “${item.title}”, preserving the still-valid original agreement.`;
      const eventId = randomUUID(), identity = repo.identity, scope = this.attentionScope(eventId);
      const event = repo.ingest(scope, { id: eventId, ownerId: identity.principalId, workspaceId: identity.workspaceId,
        subjectId: identity.principalId, worldId: 'real', sourceId: 'history:self', contentVersion: 1,
        speaker: 'user', kind: 'user_control', authority: 'user_statement', roots: [eventId], text,
        label: { ...personalLabel, infer: false }, receivedAt: repo.clock.now(), status: 'active' });
      return this.attentionSession(runtime.attention.nativeChange(scope, input, { eventId: event.id, quote: text }));
    });
  }
  responseExposure(raw: unknown) {
    const input = z.object({ sessionId: objectId, messageId: objectId, event: z.enum(['displayed', 'opened']) }).strict().parse(raw);
    const message = this.store.messages(input.sessionId).find(message => message.id === input.messageId && message.role === 'assistant');
    if (message?.proactive === 'check_in')
      return { recorded: this.store.recordPresenceExposure(input.sessionId, input.messageId, input.event) };
    const scope = this.store.runtime.policy.hostScope();
    const record = message?.cooperationId && this.store.kernel.work(scope, undefined, message.cooperationId)[0];
    if (!record || record.data.type !== 'cooperation_record' || record.data.responseId !== input.messageId) return { recorded: false };
    this.store.runtime.cooperation.exposure(scope, record.id, record.revision, input.event);
    return { recorded: true };
  }
  editRelease(raw: unknown) {
    const input = z.object({ sessionId: objectId, messageId: objectId, id: objectId, expectedRevision: z.number().int().positive(), body: z.string().trim().min(1).max(16000) }).strict().parse(raw);
    if (this.harness.running) throw new HarnessError('busy', "Wait until the current reply ends before saving draft edits.");
    if (hasCredentials(input.body)) throw new HarnessError('credential_field', "This text may contain credentials. Remove them before saving.");
    const runtime = this.store.runtime, repo = this.store.kernel, scope = runtime.policy.hostScope();
    const message = this.store.messages(input.sessionId).find(message => message.id === input.messageId && message.role === 'assistant' && message.status === 'done');
    const previous = readReleaseArtifacts(repo, runtime.policy, scope, input.sessionId, input.id)[0];
    if (!message?.releaseArtifacts?.some(artifact => artifact.id === input.id) || !previous || previous.revision !== input.expectedRevision) throw new HarnessError('revision_conflict', "The draft changed. Keep your edits and compare the latest revision.");
    return repo.write(() => {
      const current = readReleaseArtifacts(repo, runtime.policy, scope, input.sessionId, input.id)[0];
      if (!current || current.revision !== input.expectedRevision)
        throw new HarnessError('revision_conflict', "The draft or its evidence changed. It was not overwritten; your edits remain available to continue.");
      const eventId = randomUUID(), identity = repo.identity, now = repo.clock.now();
      const event = repo.ingest(scope, { id: eventId, ownerId: identity.principalId, workspaceId: identity.workspaceId, subjectId: identity.principalId, worldId: 'real', sourceId: 'history:self', contentVersion: 1,
        speaker: 'user', kind: 'user_control', authority: 'user_statement', roots: [eventId], text: `Text you saved in the draft editor:
${input.body}`, sessionId: input.sessionId, label: { ...personalLabel, infer: false }, receivedAt: now, status: 'active' });
      const artifact = { ...previous, body: input.body, authoredBy: 'user' as const, revision: previous.revision + 1, createdAt: now, sourceMessageId: event.id,
        sourceMessageIds: [...new Set([...(previous.sourceMessageIds || [previous.sourceMessageId]), event.id])],
        sourceMessageVersions: [...(previous.sourceMessageVersions || []), { id: event.id, revision: event.contentVersion }],
        sourceIds: [...new Set([...(previous.sourceIds || ['history:self']), 'history:self'])],
        basedOnObjects: [...(previous.basedOnObjects || []), { id: event.id, revision: event.contentVersion, kind: 'evidence' as const }],
        brief: { ...previous.brief, allowedFacts: [], useAvailability: false },
        supersedes: { id: previous.id, revision: previous.revision }, delivery: 'not_sent' as const };
      const releaseArtifacts = [...message.releaseArtifacts!, artifact];
      const responseText = message.responseText ?? (message.content === renderReleases(latestReleases(message.releaseArtifacts!)) || message.content === previous.body ? '' : undefined);
      const updated = { ...message, releaseArtifacts, ...(responseText !== undefined ? { responseText,
        content: responseText + (responseText ? '\n\n' : '') + renderReleases(latestReleases(releaseArtifacts)) } : {}) };
      this.store.putMessage(updated);
      return runtime.presentation.message(updated)!;
    });
  }
  matterSelection(raw: unknown): import('../../shared/presentation').MatterSelectionResult {
    const input = z.object({ id: objectId, expectedRevision: z.number().int().positive(), optionId: objectId.nullable() }).strict().parse(raw);
    const runtime = this.store.runtime, repo = this.store.kernel, scope = runtime.policy.hostScope();
    const view = runtime.presentation.matter(input.id, input.expectedRevision);
    const old = repo.work(scope, 'episode', input.id)[0];
    if (!view || !old) throw new HarnessError('revision_conflict', "This arrangement changed. Read its current revision.");
    const option = input.optionId ? view.options.find(option => option.id === input.optionId) : undefined;
    if (input.optionId && !option) throw new HarnessError('choice_missing', "This option is no longer in the current arrangement.");
    const changed = repo.write(() => {
      const eventId = randomUUID(), identity = repo.identity, text = option ? `In “${view.title}”, change the ${option.placeId ? "place selection" : "selection"} to “${option.placeLabel || option.title}”.` : `Withdraw the selection in “${view.title}”, preserving other content.`;
      const event = repo.ingest(scope, { id: eventId, ownerId: identity.principalId, workspaceId: identity.workspaceId, subjectId: identity.principalId, worldId: 'real', sourceId: 'history:self', contentVersion: 1, speaker: 'user', kind: 'user_control', authority: 'user_statement', roots: [eventId], text, sessionId: String(old.data.sessionId || ''), label: { ...personalLabel, infer: false }, receivedAt: repo.clock.now(), status: 'active' });
      repo.invalidate(old.id, 'direct_selection_changed');
      const record = runtime.work.update(scope, old.id, old.revision, { evidenceIds: [...new Set([...old.evidenceIds, event.id])], data: { ...old.data, selectedOptionId: input.optionId,
        selection: { optionId: input.optionId, placeId: option?.placeId || null, sourceEventId: event.id, selectedAt: repo.clock.now(), actualBusinessEffects: false } } });
      repo.addDependency(scope, { consumerId: record.id, producerId: event.id, producerRevision: event.contentVersion, sensitivity: 'privacy', invalidation: 'block' });
      return record;
    });
    return { state: runtime.presentation.state(this.store.state(false)), undo: { id: changed.id, expectedRevision: changed.revision, optionId: view.selectedOptionId } };
  }
  help(raw: unknown) {
    const input = z.object({ id: objectId, expectedRevision: z.number().int().positive(), operation: z.enum(['displayed', 'opened', 'dismiss', 'once', 'stop_topic']) }).strict().parse(raw);
    const runtime = this.store.runtime, scope = runtime.policy.hostScope(), record = this.store.kernel.work(scope, undefined, input.id)[0];
    if (!record || record.data.type !== 'help_opportunity' || record.revision !== input.expectedRevision) throw new HarnessError('revision_conflict', "This help changed. Read its current content.");
    if (input.operation === 'displayed' || input.operation === 'opened') {
      const help = record.data.helpRecordId && this.store.kernel.work(scope, undefined, String(record.data.helpRecordId))[0];
      if (help) runtime.cooperation.exposure(scope, help.id, help.revision, input.operation);
    } else if (input.operation === 'dismiss') {
      runtime.reminders.cancel(record.id);
      runtime.work.update(scope, record.id, record.revision, { status: 'dismissed', data: { ...record.data, dismissalMeaning: 'closed_this_item_only_not_a_preference' } });
    } else {
      const text = input.operation === 'once' ? "Remind me only once about this matter." : "Stop proactively watching this matter.";
      const eventId = randomUUID(), identity = this.store.kernel.identity;
      const event = this.store.kernel.ingest(scope, { id: eventId, ownerId: identity.principalId, workspaceId: identity.workspaceId, subjectId: identity.principalId, worldId: 'real', sourceId: 'history:self', contentVersion: 1, speaker: 'user', kind: 'user_control', authority: 'user_statement', roots: [eventId], text, label: { ...personalLabel, infer: false }, receivedAt: this.store.kernel.clock.now(), status: 'active' });
      runtime.attention.control(scope, String(record.data.sessionId), { operation: input.operation === 'once' ? 'once' : 'stop', targetId: String(record.data.bindingId), rule: text, source: { eventId: event.id, quote: text } });
    }
    return runtime.presentation.state(this.store.state(false));
  }
  overview(): RuntimeOverview {
    const { runtime: r, kernel: repo } = this.store,
      scope = r.policy.hostScope(),
      f = repo.filter(scope);
    const processing = repo.db
      .prepare(
        `SELECT r.id,r.received_at,json_extract(r.payload,'$.fileName') AS file_name,COUNT(s.id) AS total,SUM(s.status='pending') AS pending,SUM(s.status IN ('failed','needs_context')) AS failed FROM h_evidence r JOIN h_spans s ON s.event_id=r.id WHERE ${f.sql} AND r.status='active' AND r.infer=1 GROUP BY r.id HAVING pending>0 OR failed>0 ORDER BY r.seq DESC LIMIT 50`,
      )
      .all(...f.params)
      .map((row) => ({
        eventId: String(row.id),
        receivedAt: String(row.received_at),
        fileName: row.file_name ? String(row.file_name) : undefined,
        total: Number(row.total),
        pending: Number(row.pending),
        failed: Number(row.failed),
      }));
    return {
      worlds: r.work.worlds(scope).map((w) => r.work.adoptionDiff(scope, w.id)),
      memories: r.memory.views(),
      work: repo.work(scope).filter((w) => ['goal', 'episode', 'plan', 'task', 'commitment'].includes(w.kind)),
      actions: r.actions
        .list(scope)
        .map((action) => ({ action, receipts: r.actions.receipts(scope, action.id) })),
      processing,
      watermarks: repo.watermarks(),
      privacyEpoch: repo.epoch,
      policyRevision: repo.policyRevision,
      revoked: r.policy.revoked(),
      notifications: r.reminders.port?.capabilities || {
        submitted: false,
        delivered: false,
        seen: false,
        stableId: false,
        closedApp: false,
      },
      storage: { atRestEncrypted: false, keyProtection: 'os_safe_storage' },
    };
  }
  evidence(value: unknown) {
    return this.store.kernel.evidence(this.store.runtime.policy.hostScope(), objectId.parse(value)) || null;
  }
  replySources(value: unknown) { return replySources(this.store, value); }
  adoptWorld(raw: unknown) {
    const input = z
        .object({
          id: objectId,
          itemIds: z.array(objectId).min(1).max(32),
          expectedBaseRevision: z.number().int().nonnegative(),
          expectedPrivacyEpoch: z.number().int().positive(),
        })
        .strict()
        .parse(raw),
      r = this.store.runtime,
      scope = r.policy.hostScope(),
      diff = r.work.adoptionDiff(scope, input.id);
    if (
      input.expectedPrivacyEpoch !== this.store.kernel.epoch ||
      input.expectedBaseRevision !== diff.baseRevision
    )
      throw new HarnessError('revision_conflict', "The adoption scope changed. Review the proposal again.");
    r.work.adoptPreparation(scope, input.id, input.itemIds);
    return this.overview();
  }
  goal(raw: unknown) {
    const input = z
        .object({
          id: objectId,
          expectedRevision: z.number().int().positive(),
          status: z.enum(['active', 'paused', 'cancelled']),
        })
        .strict()
        .parse(raw),
      r = this.store.runtime,
      scope = r.policy.hostScope();
    const old = this.store.kernel.work(scope, 'goal').find((w) => w.id === input.id);
    if (!old || old.revision !== input.expectedRevision)
      throw new HarnessError('revision_conflict', "The goal changed. Refresh before deciding.");
    if (old.status === 'cancelled')
      throw new HarnessError('goal_cancelled', "This goal was canceled. Propose it again before deciding whether to adopt it.");
    if (input.status === 'cancelled') r.work.cancelGoal(scope, old.id);
    else
      this.store.kernel.write(() => {
        r.work.update(scope, old.id, old.revision, { status: input.status });
        if (input.status === 'paused') {
          this.store.kernel.invalidate(old.id, 'goal_paused');
          this.store.kernel.db
            .prepare("UPDATE h_jobs SET status='paused',fence=fence+1 WHERE goal_id=? AND status='queued'")
            .run(old.id);
          this.store.kernel.db.prepare("UPDATE h_watches SET status='inactive' WHERE goal_id=?").run(old.id);
        }
      });
    return this.overview();
  }
  feedback(raw: unknown): { saved: boolean; causalSuccess: 'not_established' } {
    const input = z
        .object({
          recommendationId: objectId,
          response: z.enum(['accepted', 'declined', 'not_observed']),
          reason: z.string().trim().min(1).max(1200).optional(),
        })
        .strict()
        .parse(raw),
      r = this.store.runtime,
      scope = r.policy.hostScope();
    if (input.reason && hasCredentials(input.reason))
      throw new HarnessError('restricted_retention', "Do not include keys or passwords in feedback.");
    const action = r.actions.get(scope, input.recommendationId),
      message = this.store.db
        .prepare("SELECT id FROM messages WHERE id=? AND role='assistant'")
        .get(input.recommendationId);
    if (!action && !message)
      throw new HarnessError('recommendation_missing', "This suggestion no longer exists. Feedback was not saved.");
    const id = randomUUID(),
      text =
        input.reason ||
        { accepted: "The user reported this helped", declined: "The user reported this did not fit", not_observed: "Outcome not yet observed" }[
          input.response
        ];
    r.observations.ingest(scope, {
      id,
      sourceId: 'work:self',
      kind: 'feedback',
      version: 1,
      locator: {
        kind: 'text',
        eventId: id + ':v1',
        contentVersion: 1,
        startCodePoint: 0,
        endCodePoint: Array.from(text).length,
      },
      text,
      label: { ...personalLabel, infer: false },
      quality: 'unverified',
      data: {
        recommendationId: input.recommendationId,
        exposure: 'shown',
        response: input.response,
        ...(input.reason ? { explicitReason: input.reason } : {}),
        missingness: 'not_observed',
        contextRevision: action?.revision || 1,
      },
    });
    r.work.create(
      scope,
      'experience',
      text,
      {
        recommendationId: input.recommendationId,
        response: input.response,
        reason: input.reason || '',
        outcome: 'not_observed',
        causalSuccess: 'not_established',
      },
      { status: 'reported', evidenceIds: [id + ':v1'] },
    );
    return { saved: true, causalSuccess: 'not_established' };
  }
  async retry(value: unknown) {
    if (this.harness.running) throw new HarnessError('run_active', "Stop the current reply before retrying organization.");
    const settings = this.store.settings();
    if (!settings.memoryEnabled)
      throw new HarnessError('model_unavailable', "Memory is paused. Enable it before continuing organization.");
    if (settings.mode !== 'luna')
      throw new HarnessError('model_unavailable', `Enable ${usingLunaTransport() ? ' Luna' : "the model connection"} in Connections and sources before continuing organization.`);
    const id = objectId.parse(value),
      r = this.store.runtime,
      scope = r.policy.hostScope(),
      event = this.store.kernel.evidence(scope, id);
    if (
      !event?.label.infer ||
      event.subjectId !== this.store.kernel.identity.principalId ||
      event.worldId !== 'real'
    )
      throw new HarnessError('inference_forbidden', "This material cannot be used for personal understanding.");
    const spans = this.store.kernel
      .spans(scope, id)
      .filter((s) => ['failed', 'needs_context'].includes(s.status));
    if (spans.length)
      this.store.kernel.markSpans(
        scope,
        id,
        'pending',
        spans.map((s) => s.id),
      );
    await this.harness.recoverPending(id);
    return this.overview();
  }
  async reconcile(value: unknown) {
    await this.store.runtime.actions.reconcile(this.store.runtime.policy.hostScope(), objectId.parse(value));
    return this.overview();
  }
  permission(raw: unknown) {
    const input = z
      .object({ scope: z.enum(['campus:read', 'campus:activity:read', 'map:read', 'location:read']), enabled: z.boolean() })
      .strict()
      .parse(raw);
    this.store.runtime.policy[input.enabled ? 'grant' : 'revoke'](input.scope);
    return this.overview();
  }
}
