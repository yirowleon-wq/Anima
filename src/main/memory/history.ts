import * as z from 'zod';
import { HarnessError, type Assertion, type ScopeHandle } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import { canonical } from '../runtime/semantics';

export const understandingReadInput = z.object({
  id: z.string().min(1).max(160),
  view: z.enum(['current', 'history']).optional(),
  snapshotRevision: z.number().int().positive().optional(),
  beforeRevision: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(20).optional(),
  knownAt: z.string().datetime({ offset: true }).optional().describe("Understanding saved by the system at this time, not its real-world effective time. Legacy revisions without host commit times remain unknown."),
  validAt: z.string().datetime({ offset: true }).optional().describe("Separately check whether this real-world instant falls inside the revision's declared validity interval, without changing historical or current state."),
}).strict();

const meaning = "This is one understanding's revision history, explaining what was saved then and how it changed. It grants no permission to use old facts now or restore old authorization. Real-world validity and host-recording times remain separate; unreliable legacy commit times are not inferred. Old bodies remain closed when their sources were corrected, deleted, revoked or excluded from this turn's scope.";

function validTime(assertion: Assertion) {
  return { from: assertion.temporal.validFrom ?? null, to: assertion.temporal.validTo ?? null,
    precision: assertion.temporal.precision, ...(assertion.temporal.unresolvedExpression ? { unresolved: assertion.temporal.unresolvedExpression } : {}) };
}

/** A transient view over the existing assertion owner. No second memory,
 * periodic summary, copied evidence or historical authorization is created. */
export function readUnderstandingHistory(repo: KernelRepository, handle: ScopeHandle, raw: z.infer<typeof understandingReadInput>,
  sourceReadable?: (eventId: string) => boolean) {
  if (!repo.personalMemoryReadable(handle))
    throw new HarnessError('memory_history_scope', "This scope does not permit reading personal-understanding history.");
  const page = repo.assertionHistory(handle, raw.id, raw);
  if (!page) return { status: 'not_found', items: [], reason: "This understanding is not readable in the current scope." };
  const items = page.items.map((entry, index) => {
    const value = entry.assertion && [...entry.assertion.evidenceIds, ...(entry.citations || []).map(citation => citation.eventId)]
      .every(id => sourceReadable?.(id) !== false)
      && (!entry.cause || sourceReadable?.(entry.cause.eventId) !== false) ? entry.assertion : undefined;
    const prior = page.items[index + 1]?.assertion;
    const priorCause = page.items[index + 1]?.cause;
    const previous = prior && [...prior.evidenceIds, ...(page.items[index + 1]?.citations || []).map(citation => citation.eventId)]
      .every(id => sourceReadable?.(id) !== false)
      && (!priorCause || sourceReadable?.(priorCause.eventId) !== false) ? prior : undefined;
    const cause = entry.cause && sourceReadable?.(entry.cause.eventId) !== false ? entry.cause : undefined;
    const changes = value && previous && previous.revision + 1 === value.revision
      ? ([['wording', previous.text, value.text], ['value', previous.value, value.value],
        ['conditions', previous.conditions, value.conditions], ['exceptions', previous.exceptionIds, value.exceptionIds],
        ['validTime', validTime(previous), validTime(value)], ['status', previous.status, value.status],
        ['sources', previous.evidenceIds, value.evidenceIds]] as const)
        .filter(([, before, after]) => canonical(before) !== canonical(after)).map(([field]) => field) : undefined;
    const appliesAt = value && raw.validAt ? value.temporal.precision === 'unresolved'
      || !value.temporal.validFrom && !value.temporal.validTo ? null
      : (!value.temporal.validFrom || Date.parse(value.temporal.validFrom) <= Date.parse(raw.validAt))
        && (!value.temporal.validTo || Date.parse(value.temporal.validTo) > Date.parse(raw.validAt)) : undefined;
    return { revision: entry.revision, committedAt: entry.committedAt, timing: entry.timing,
      operation: entry.operation, previousRevision: entry.previousRevision,
      ...(cause ? { changeSource: { ...cause, read: { tool: 'read_evidence', arguments: {
        id: cause.eventId, offset: cause.start, limit: Math.min(1200, cause.end - cause.start) } } } } : {}),
      ...(entry.related ? { relatedUnderstanding: entry.related } : {}),
      sourceCoverage: value ? 'available' : 'suppressed', currentUse: 'not_authorized_by_history',
      ...(value ? { understanding: { id: value.id, predicate: value.predicate, text: value.text, value: value.value,
        kind: value.kind, strength: value.strength, conditions: value.conditions, exceptionIds: value.exceptionIds,
        validTime: validTime(value), statusAtRevision: value.status, verificationAtRevision: value.verification },
      ...(value.referenceContexts?.length ? { referenceContexts: value.referenceContexts.map(reference => ({
        ...reference, meaning: "The assistant's original question explains the user's reply reference only. It is neither a personal fact nor action permission.",
        read: { tool: 'read_assistant_history', arguments: { id: reference.messageId, offset: reference.start,
          limit: Math.min(1200, reference.end - reference.start) } },
      })) } : {}),
      citations: entry.citations, ...(appliesAt === undefined ? {} : { declaredIntervalContainsValidAt: appliesAt }) }
        : { reason: "This revision's original basis is outside the current scope. Its old text was not restored." }),
      ...(changes ? { changedFields: changes } : {}),
    };
  });
  return { status: raw.knownAt && page.knownAtCoverage === 'unknown' ? 'unknown' : items.length ? 'fresh' : 'not_found',
    id: page.id, mode: raw.knownAt ? 'as_known_at' : 'revision_history',
    ...(raw.knownAt ? { knownAt: raw.knownAt, selectedRevision: page.selectedRevision ?? null } : {}),
    ...(raw.validAt ? { validAt: raw.validAt } : {}), items,
    coverage: { kind: 'revision_directory', snapshotRevision: page.snapshotRevision, nextBeforeRevision: page.nextBeforeRevision,
      complete: page.nextBeforeRevision === null, unknownCommitTimes: page.unknownCommitTimes,
      historicalContentComplete: page.nextBeforeRevision === null && (!raw.knownAt || !page.unknownCommitTimes)
        && items.every(item => item.sourceCoverage === 'available'),
      ...(raw.knownAt ? { knownAtCoverage: page.knownAtCoverage } : {}),
      ...(page.nextBeforeRevision === null ? {} : { read: { tool: 'read_understanding', arguments: { ...raw, view: 'history',
        snapshotRevision: page.snapshotRevision, beforeRevision: page.nextBeforeRevision } } }) }, meaning };
}
