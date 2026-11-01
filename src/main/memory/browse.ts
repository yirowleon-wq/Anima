import { createHash, randomUUID } from 'node:crypto';
import { sourceContextGuidance } from '../../shared/source-context';
import { HarnessError, type EvidenceEvent, type ScopeHandle } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import { codePointSlice } from '../runtime/semantics';
import { projectHistoricalEvidence, type EvidenceProjection } from './retrieval';

/** Host-proven original Unicode coordinates for a single projected passage. */
export type EvidenceBrowseSourceRange = (event: EvidenceEvent) => { start: number; end: number } | undefined;

export interface EvidenceBrowseOptions {
  sourceIds?: string[];
  receivedFrom?: string;
  receivedBefore?: string;
  cursor?: string;
}

export interface HostBrowseSeed {
  snapshot: number;
  before: number;
  sourceIds: string[];
  receivedFrom?: string;
  receivedBefore?: string;
  frontierId?: string;
  generation?: number;
}
export interface HostBrowsePosition {
  start: HostBrowseSeed;
  end: HostBrowseSeed;
  complete: boolean;
  requestCursor?: string;
  nextCursor: string | null;
  originals: { eventId: string; contentVersion: number; sourceId: string; total: number; previewEnd: number; sourceStart: number }[];
}
interface BrowsePosition extends HostBrowseSeed {
  binding: string;
  expiresAt: number;
}

/** Cursors contain no copied private text. Random host references also avoid
 * exposing global sequence numbers or counts from a partially visible source. */
export class EvidenceBrowser {
  private readonly cursors = new Map<string, BrowsePosition>();

  page(repo: KernelRepository, handle: ScopeHandle, options: EvidenceBrowseOptions, limit: number, project?: EvidenceProjection, maxRows = 200,
    projectRange?: EvidenceBrowseSourceRange) {
    return this.pageWithPosition(repo, handle, options, limit, project, maxRows, undefined, 'projection', projectRange).value;
  }

  /** The seed and returned position are host addresses, never model parameters. */
  pageWithPosition(repo: KernelRepository, handle: ScopeHandle, options: EvidenceBrowseOptions, limit: number, project?: EvidenceProjection,
    maxRows = 200, seed?: HostBrowseSeed, readCoordinates: 'projection' | 'source' = 'projection', projectRange?: EvidenceBrowseSourceRange) {
    const scope = repo.scope(handle), now = Date.parse(repo.clock.now());
    const binding = createHash('sha256').update(JSON.stringify({
      principal: scope.principalId, workspace: scope.workspaceId, subject: scope.subjectId,
      world: scope.worldId, audience: scope.audience, epoch: repo.epoch,
      sources: [...scope.sources].sort(), purposes: [...scope.purposes].sort(),
      grants: [...scope.grants].sort(), current: [...scope.currentEventIds].sort(),
    })).digest('hex');
    for (const [id, position] of this.cursors) if (position.expiresAt <= now) this.cursors.delete(id);
    const prior = seed ?? (options.cursor ? this.cursors.get(options.cursor) : undefined);
    if (seed && (!Number.isSafeInteger(seed.snapshot) || !Number.isSafeInteger(seed.before) || seed.snapshot < 0 || seed.before < 0
      || seed.before > seed.snapshot + 1 || seed.snapshot > repo.getMeta<number>('received_seq', 0)))
      throw new HarnessError('browse_position_invalid', "The original-text continuation position is invalid. The browsing position was not moved.");
    if (options.cursor && !seed && (!prior || !('binding' in prior) || prior.binding !== binding))
      throw new HarnessError('browse_cursor_expired', "The browsing cursor expired, the process restarted or source scope changed. Restart within the current scope.");
    const sourceIds = [...new Set(options.sourceIds ?? prior?.sourceIds ?? scope.sources
      .filter(source => source !== 'current' && (source !== 'profile:self' || repo.personalMemoryReadable(handle))))].sort();
    if (sourceIds.some(source => !scope.sources.includes(source)
      || source === 'profile:self' && !repo.personalMemoryReadable(handle)))
      throw new HarnessError('source_forbidden', "Browsing the selected source is not permitted this turn.");
    const receivedFrom = options.receivedFrom ?? prior?.receivedFrom;
    const receivedBefore = options.receivedBefore ?? prior?.receivedBefore;
    for (const value of [receivedFrom, receivedBefore])
      if (value !== undefined && !Number.isFinite(Date.parse(value))) throw new HarnessError('invalid_time', "The original-text browsing time range is invalid.");
    if (receivedFrom && receivedBefore && Date.parse(receivedFrom) >= Date.parse(receivedBefore))
      throw new HarnessError('invalid_time', "The browsing start must precede its end.");
    if (prior && (JSON.stringify(sourceIds) !== JSON.stringify(prior.sourceIds)
      || receivedFrom !== prior.receivedFrom || receivedBefore !== prior.receivedBefore))
      throw new HarnessError('browse_cursor_range', "Continuation cannot change original time or source bounds. Start a new scope without cursor.");

    const snapshot = prior?.snapshot ?? repo.getMeta<number>('received_seq', 0);
    let before = prior?.before ?? snapshot + 1;
    const start: HostBrowseSeed = { snapshot, before, sourceIds, receivedFrom, receivedBefore,
      ...(prior?.frontierId ? { frontierId: prior.frontierId, generation: prior.generation } : {}) };
    const visible: ReturnType<typeof projectHistoricalEvidence>[] = [];
    const sourceStarts = new Map<string, number>();
    let exhausted = false, scanned = 0;
    const scanLimit = Math.max(1, Math.min(maxRows, 200));
    // Scope and time filters run in SQL. Project before forming any preview or
    // visible-page count; rejected passages never become model candidates.
    while (visible.length <= limit && !exhausted && scanned < scanLimit) {
      const batchLimit = Math.min(limit + 1, scanLimit - scanned);
      const rows = repo.evidenceBrowsePage(handle, { sourceIds, receivedFrom, receivedBefore, snapshot, before, limit: batchLimit });
      if (!rows.length) { exhausted = true; break; }
      for (const event of rows) {
        scanned++;
        const view = projectHistoricalEvidence(repo, handle, event, project);
        if (view) {
          let sourceStart = 0;
          if (view.text !== event.text) {
            const range = projectRange?.(event);
            if (!range || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end)
              || range.start < 0 || range.end <= range.start || range.end > Array.from(event.text).length
              || codePointSlice(event.text, range.start, range.end) !== view.text)
              throw new HarnessError('browse_projection_invalid', "A clipped statement needs a host-supplied exact Unicode source range. No quote location was guessed and this page was not displayed.");
            sourceStart = range.start;
          }
          sourceStarts.set(event.id, sourceStart);
          visible.push(view);
          if (visible.length > limit) break;
        }
        before = event.sequence;
      }
      if (visible.length > limit) break;
      exhausted = rows.length < batchLimit;
    }
    const page = visible.slice(0, limit).filter((event): event is NonNullable<typeof event> => !!event);
    let nextCursor: string | null = null;
    if (visible.length > limit || !exhausted) {
      // Continue after the last consumed row. A visible look-ahead, when
      // present, was not consumed and will be read again on the next page.
      nextCursor = randomUUID();
      while (this.cursors.size >= 128) this.cursors.delete(this.cursors.keys().next().value!);
      this.cursors.set(nextCursor, { binding, snapshot, before, sourceIds, receivedFrom, receivedBefore, expiresAt: now + 30 * 60_000 });
    }
    const value = {
      status: page.length ? 'fresh' : nextCursor ? 'partial' : 'not_found',
      originals: page.map(event => ({
        id: event.id, contentVersion: event.contentVersion, sourceId: event.sourceId,
        receivedAt: event.receivedAt, speaker: event.speaker, kind: event.kind, authority: event.authority,
        ...(event.sourceContext ? { sourceContext: event.sourceContext } : {}),
        preview: Array.from(event.text).slice(0, 240).join(''), previewOnly: true,
        length: Array.from(event.text).length, use: event.use,
        hasUseRestrictions: event.restrictions.length > 0,
        read: { tool: 'read_evidence', arguments: { id: event.id,
          offset: readCoordinates === 'source' ? sourceStarts.get(event.id)! : 0, limit: Math.max(1, Math.min(1200, Array.from(event.text).length)) } },
      })),
      sourceContextMeaning: sourceContextGuidance(...page.map(event => event.sourceContext)),
      coverage: {
        retrieval: 'source_browse', semanticRelevance: 'not_judged', requiresExtraction: false,
        requiresLiteralMatch: false, order: 'received_sequence_descending',
        nextCursor, snapshot: 'fixed_on_first_page', currentPrivacyRechecked: true,
        bounded: true,
        complete: !nextCursor, completenessScope: 'currently_visible_sources_within_requested_received_time_range',
        ...(project ? {} : { sourceIds, receivedFrom: receivedFrom ?? null, receivedBefore: receivedBefore ?? null }),
        guidance: "This is an original-text location preview, not complete facts or current personal understanding. Follow read for full context, conditions and corrections. Time filters refer to receipt time, not a fact's effective time. Continue with the same cursor and scope; an empty page with cursor means bounded traversal remains, not that no readable originals exist. Later additions stay outside this snapshot; deletions and revoked permissions apply immediately. Ordinary cursors last 30 minutes within this process. A still-valid entrusted matter can continue through a fresh investigationContinuation from inspect_help; an old cursor restores no permission. Completed traversal lists the currently visible scope, not all real-world conditions.",
      },
    };
    return { value, position: { start, end: { ...start, before }, complete: !nextCursor,
      requestCursor: options.cursor, nextCursor,
      originals: page.map(event => ({ eventId: event.id, contentVersion: event.contentVersion, sourceId: event.sourceId,
        total: Array.from(event.text).length, previewEnd: Math.min(240, Array.from(event.text).length), sourceStart: sourceStarts.get(event.id)! })) } satisfies HostBrowsePosition };
  }
}
