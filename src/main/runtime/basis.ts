import * as z from 'zod';
import { HarnessError, type ScopeHandle, type WorkRecord } from '../../shared/harness';
import type { KernelRepository } from '../storage/repository';
import type { PolicyKernel } from './policy';
import type { WorkService } from './work';
import { resolveSourceQuote } from './source-quote';

const source = z.object({
  eventId: z.string().min(1).max(160), quote: z.string().min(1).max(3000),
  contentVersion: z.number().int().positive().optional(),
  start: z.number().int().nonnegative().optional().describe("Absolute Unicode code-point start of quote in the original. Repeated quotations need an actual complete position or a longer unique exact quote."),
  end: z.number().int().positive().optional(),
}).strict().superRefine((value, context) => {
  if (['contentVersion', 'start', 'end'].some(field => Object.hasOwn(value, field))
    && (value.contentVersion === undefined || value.start === undefined || value.end === undefined || value.end <= value.start))
    context.addIssue({ code: 'custom', path: ['start'], message: "An original position requires complete contentVersion/start/end, with end after start. Do not search again from an incomplete position." });
});
export const basisInput = z.object({
  operation: z.enum(['use', 'revise', 'retire', 'read']),
  id: z.string().max(160).optional(), expectedRevision: z.number().int().positive().optional(),
  matterId: z.string().max(160).optional(), source: source.optional(),
  interpretation: z.string().min(1).max(1200).optional(),
  purpose: z.string().min(1).max(600).optional(),
  validWhen: z.string().min(1).max(1000).optional(),
  stopWhen: z.string().min(1).max(1000).optional(),
  recheckAt: z.string().datetime({ offset: true }).nullable().optional(),
  standing: z.enum(['supported', 'tentative', 'insufficient', 'corrected', 'historical']).optional(),
  applicability: z.enum(['applies_now', 'condition_not_met', 'unknown']).optional().describe("Distinguish true original words from currently satisfied conditions. Use condition_not_met when a condition does not hold today; a true historical reason is not thereby currently applicable. Unknown is not the opposite state. Required for use/revise."),
  consumerIds: z.array(z.string().max(160)).max(12).optional(),
}).strict();

/** Applicability is a use of evidence for a matter, not another user profile.
 * The original statement never changes when its present usefulness expires. */
export class BasisService {
  constructor(readonly repo: KernelRepository, readonly policy: PolicyKernel, readonly work: WorkService) {}

  private cite(handle: ScopeHandle, citation: z.infer<typeof source>, allowHistorical = false) {
    const event = this.repo.evidence(handle, citation.eventId);
    if (!event || event.speaker !== 'user')
      throw new HarnessError('unsupported_evidence', "This interpretation needs corresponding original user words.");
    const source = resolveSourceQuote(event, citation);
    if (!source) throw new HarnessError('unsupported_evidence', "The supporting quotation is ambiguous, changed, or incomplete. Expand the exact quotation or provide actual contentVersion/start/end.");
    if (!allowHistorical) {
      const range = source, now = Date.parse(this.repo.clock.now());
      const restricted = this.repo.sourceRestrictions(handle, event.id).some(restriction =>
        (!restriction.effectiveFrom || Date.parse(restriction.effectiveFrom) <= now) &&
        (restriction.predicate === '*' || restriction.rangeUnknown || restriction.ranges.some(span =>
          span.contentVersion !== event.contentVersion || span.start < range.end && span.end > range.start)));
      if (restricted) throw new HarnessError('basis_source_changed', "The interpretation of this passage changed. Reassess from current words; independent unaffected passages remain usable.");
    }
    return { event, source };
  }

  read(handle: ScopeHandle, matterId?: string) {
    this.recheck();
    return this.repo.workData(handle, ['basis_use'], { matterId, limit: 24 }).map(record => ({
      ...record,
      usableNow: ['supported', 'tentative'].includes(record.status) && record.data.applicability === 'applies_now',
      meaning: record.status === 'insufficient' ? "Sufficient current support is absent. This does not make the original false or establish the opposite state."
        : ['corrected', 'historical', 'blocked', 'stale'].includes(record.status) ? "Historical status only; do not guide current judgment."
        : "Consider only for the listed matters, subjects, and conditions. Current words take priority; permission does not establish semantic applicability.",
    }));
  }

  update(handle: ScopeHandle, sessionId: string, raw: z.infer<typeof basisInput>) {
    const input = basisInput.parse(raw);
    if (input.operation === 'read') return this.read(handle, input.matterId);
    const scope = this.policy.require(handle, 'work:write');
    if (!input.source) throw new HarnessError('source_required', "Original evidence is required; a persistent state cannot be invented.");
    this.recheck();
    const { event, source } = this.cite(handle, input.source, input.operation === 'retire');
    const old = input.id ? this.repo.work(handle, undefined, input.id)[0] : undefined;
    if (input.id && (!old || old.data.type !== 'basis_use')) throw new HarnessError('basis_missing', "This basis-use record was not found.");
    if (old && old.revision !== input.expectedRevision) throw new HarnessError('revision_conflict', "The interpretation changed. Read its current revision.");
    if (input.operation !== 'use' && !old) throw new HarnessError('basis_missing', "Locate the existing basis before revising it.");
    const matterId = input.matterId || String(old?.data.matterId || '');
    const matter = this.repo.work(handle, undefined, matterId)[0];
    if (!matter || !['episode', 'goal', 'commitment', 'task'].includes(matter.kind))
      throw new HarnessError('matter_required', "Save an applicability basis only for work genuinely needing cross-turn continuation. Current original words can be used directly.");
    if (['closed', 'cancelled', 'withdrawn', 'completed'].includes(matter.status) && input.operation !== 'retire')
      throw new HarnessError('matter_inactive', "This matter ended. Establish the current purpose again.");
    if (input.operation === 'retire') {
      const standing = input.standing || 'corrected';
      if (!['insufficient', 'corrected', 'historical'].includes(standing)) throw new HarnessError('basis_state', "Retiring a basis does not confirm the opposite state.");
      return this.repo.write(() => {
        this.repo.invalidate(old!.id, 'basis_' + standing);
        return this.work.update(handle, old!.id, old!.revision, {
          status: standing, evidenceIds: [...new Set([...old!.evidenceIds, event.id])],
          data: { ...old!.data, endedBy: { ...source }, endedAt: this.repo.clock.now(), inverseEstablished: false },
        });
      });
    }
    if (!input.interpretation || !input.purpose || !input.validWhen || !input.stopWhen || input.recheckAt === undefined || !input.applicability)
      throw new HarnessError('applicability_required', "Specify purpose, applicable conditions, whether they currently hold (applicability), stopping conditions, and reassessment time (null if no fixed expiry).");
    if (input.recheckAt && Date.parse(input.recheckAt) <= Date.parse(this.repo.clock.now()))
      throw new HarnessError('basis_expired', "The reassessment time passed; this cannot be registered as a current basis.");
    if (input.standing && !['supported', 'tentative'].includes(input.standing)) throw new HarnessError('basis_state', "An insufficient or corrected basis should be retired.");
    const data = {
      type: 'basis_use', sessionId, matterId, purpose: input.purpose,
      interpretation: input.interpretation, validWhen: input.validWhen, stopWhen: input.stopWhen,
      recheckAt: input.recheckAt, applicability: input.applicability, subjectId: scope.subjectId, worldId: scope.worldId,
      source: { ...source, receivedAt: event.receivedAt },
      inverseEstablished: false,
    };
    return this.repo.write(() => {
      if (old) this.repo.invalidate(old.id, 'basis_revised');
      const status = input.applicability === 'condition_not_met' ? 'historical' : input.applicability === 'unknown' ? 'insufficient' : input.standing || 'tentative';
      const record = old
        ? this.work.update(handle, old.id, old.revision, { data, title: input.interpretation!, status, evidenceIds: [...new Set([...old.evidenceIds, event.id])] })
        : this.work.create(handle, 'hypothesis', input.interpretation!, data, { status, evidenceIds: [event.id] });
      for (const producer of [{ id: event.id, revision: event.contentVersion }, { id: matter.id, revision: matter.revision }])
        this.repo.addDependency(handle, { consumerId: record.id, producerId: producer.id, producerRevision: producer.revision, sensitivity: 'hard', invalidation: 'revalidate' });
      for (const id of input.consumerIds || []) this.link(handle, record, id);
      return record;
    });
  }

  link(handle: ScopeHandle, basis: WorkRecord, consumerId: string) {
    this.recheck();
    const currentBasis = this.repo.work(handle, undefined, basis.id)[0];
    if (!currentBasis || currentBasis.revision !== basis.revision)
      throw new HarnessError('basis_inactive', "This basis changed. Read its current revision.");
    const consumer = this.repo.work(handle, undefined, consumerId)[0];
    if (!consumer || !['plan', 'option', 'hypothesis', 'window'].includes(consumer.kind) || consumer.id === basis.id)
      throw new HarnessError('basis_consumer', "Link only candidates depending on this interpretation. Independent accepted calendar entries cannot be canceled automatically with it.");
    this.repo.addDependency(handle, { consumerId, producerId: basis.id, producerRevision: basis.revision, sensitivity: 'soft', invalidation: 'revalidate' });
  }

  /** Host maintenance reads timing/identity metadata, never prefetches bodies.
   * Runs before requests and dispatch so old workers cannot keep a stale use. */
  recheck() {
    const timed = this.repo.db.prepare(`SELECT b.id,b.revision,
      CASE WHEN m.status IN ('closed','cancelled','withdrawn','completed') THEN 'historical' ELSE 'insufficient' END AS next_status
      FROM h_work b LEFT JOIN h_work m ON m.id=json_extract(b.payload,'$.data.matterId')
      WHERE b.owner=? AND b.workspace=? AND json_extract(b.payload,'$.data.type')='basis_use'
      AND b.status IN ('supported','tentative') AND (
        (json_extract(b.payload,'$.data.recheckAt') IS NOT NULL AND julianday(json_extract(b.payload,'$.data.recheckAt'))<=julianday(?))
        OR m.status IN ('closed','cancelled','withdrawn','completed') OR m.id IS NULL
        OR json_extract(b.payload,'$.data.applicability') IS NULL)`).all(this.repo.identity.principalId, this.repo.identity.workspaceId, this.repo.clock.now());
    // A correction changes the interpretation of a specific source passage;
    // it does not delete the whole message or cancel an independent calendar
    // commitment. Range metadata is enough to retire only affected uses.
    // Legacy uses/restrictions with no range cannot certify applicability and
    // become insufficient, rather than silently continuing an obsolete use.
    const changed = this.repo.db.prepare(`SELECT b.id,b.revision,'insufficient' AS next_status
      FROM h_work b WHERE b.owner=? AND b.workspace=? AND json_extract(b.payload,'$.data.type')='basis_use'
      AND b.status IN ('supported','tentative') AND EXISTS (
        SELECT 1 FROM h_source_restrictions x WHERE x.event_id=json_extract(b.payload,'$.data.source.eventId')
        AND (NOT EXISTS (SELECT 1 FROM h_source_restriction_spans s WHERE s.event_id=x.event_id AND s.predicate=x.predicate)
          OR EXISTS (SELECT 1 FROM h_source_restriction_spans s WHERE s.event_id=x.event_id AND s.predicate=x.predicate
            AND (s.effective_from IS NULL OR julianday(s.effective_from)<=julianday(?))
            AND (x.predicate='*' OR s.content_version!=COALESCE(json_extract(b.payload,'$.data.source.contentVersion'),0)
              OR json_extract(b.payload,'$.data.source.start') IS NULL OR json_extract(b.payload,'$.data.source.end') IS NULL
              OR (s.start_cp<json_extract(b.payload,'$.data.source.end') AND s.end_cp>json_extract(b.payload,'$.data.source.start')))))
      )`).all(this.repo.identity.principalId, this.repo.identity.workspaceId, this.repo.clock.now());
    const rows = [...new Map([...timed, ...changed].map(row => [String(row.id), row])).values()];
    const sourceChanges = new Set(changed.map(row => String(row.id)));
    this.repo.write(() => {
      for (const row of rows) {
        const reason = sourceChanges.has(String(row.id)) ? 'basis_source_changed' : 'basis_no_longer_sufficient';
        this.repo.invalidate(String(row.id), reason);
        this.repo.db.prepare(`UPDATE h_work SET status=?,revision=revision+1,payload=json_set(payload,'$.status',?,'$.revision',revision+1,'$.data.endedAt',?,'$.data.inverseEstablished',json('false'),'$.data.invalidationReason',?) WHERE id=? AND revision=?`)
          .run(String(row.next_status), String(row.next_status), this.repo.clock.now(), reason, String(row.id), Number(row.revision));
      }
    });
    return rows.map(row => String(row.id));
  }
}
