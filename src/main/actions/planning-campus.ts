import { createHash } from 'node:crypto';
import { HarnessError, type ScopeData } from '../../shared/harness';
import type { AcademicAdapter } from '../academicAdapter';
import type { CampusSnapshotProof } from '../capabilities/campus-saved-source';
import { validateCampusQuery, type CampusQuery } from '../capabilities/campus-query';
import { canonical, dateInZone } from '../runtime/semantics';
import type { PlanningDraftRequest } from './planning-intent-contract';
import type { CampusScheduleBlock, CampusScheduleQuality } from '../../shared/campus-calendar';

export interface PlanningCampusConstraints {
  sourceId: 'campus:academic-account'; version: string; proofs: CampusSnapshotProof[];
  busy: PlanningDraftRequest['busy']; coverage: PlanningDraftRequest['sourceCoverage'][number];
  items: CampusScheduleBlock[]; scheduleQuality: CampusScheduleQuality[];
  issues: string[]; cancelledCount: number; pendingCount: number;
}
export interface PlanningCampusPort {
  read(scope: ScopeData, from: string, to: string, signal: AbortSignal): Promise<PlanningCampusConstraints | null>;
  current(scope: ScopeData, snapshot: PlanningCampusConstraints): boolean;
  currentVersion(scope: ScopeData, version: string): boolean;
}
export function campusConstraintSummary(campus: PlanningCampusConstraints) {
  return { sourceId: campus.sourceId, version: campus.version, readOnly: true, live: false,
    coverage: campus.coverage, snapshots: campus.proofs.map(proof => ({ bundleId: proof.bundleId, resource: proof.resource, version: proof.version, selection: proof.selection,
      collectedAt: proof.collectedAt, sourceFetchedAt: proof.sourceFetchedAt, coverage: proof.coverage, original: proof.original })),
    scheduleQuality: campus.scheduleQuality,
    cancelledCount: campus.cancelledCount, pendingCount: campus.pendingCount, issues: campus.issues,
    meaning: "This calculation reserves the supplied classes and exams without adding calendar entries. School events are not attendance evidence; other open time still needs discussion in the context of the user's life. Unconfirmed calendar details and possible class changes remain visible for replanning." };
}
const sourceId = 'campus:academic-account' as const;
const instant = (raw: unknown): string | undefined => typeof raw === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw)
  && Number.isFinite(Date.parse(raw)) ? new Date(raw).toISOString() : undefined;

/** Consume the connector's normalized records. Campus occurrences remain
 * constraints of the same planner, never copied into the local calendar. */
export async function readCampusPlanningConstraints(adapter: AcademicAdapter, scope: ScopeData, from: string, to: string,
  signal: AbortSignal, validate: () => void): Promise<PlanningCampusConstraints | null> {
  if (!scope.sources.includes(sourceId) || !scope.grants.includes('campus:read') || !adapter.describe().available) return null;
  if (!(Date.parse(to) > Date.parse(from)) || Date.parse(to) - Date.parse(from) > 32 * 86400000)
    throw new HarnessError('planning_campus_window', "Campus events need a valid bounded window, up to 32 days at a time.");
  const proofs: CampusSnapshotProof[] = [], issues: string[] = [], scheduleQuality: CampusScheduleQuality[] = [];
  const groups = new Map<string, Record<string, any>[]>();
  // A source declares its term and time zone. Dates do not imply a semester,
  // quarter, class schedule or institutional coverage on their own.
  const source = adapter.describe(), timeZone = source.timeZone || 'America/Los_Angeles';
  const firstDate = dateInZone(from, timeZone), lastDate = dateInZone(new Date(Date.parse(to) - 1).toISOString(), timeZone);
  const inDateWindow = (row: Record<string, any>) => {
    const date = [row.date, row.original_date, row.actual_date, row.dateLabel]
      .find(value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));
    return !date || date >= firstDate && date <= lastDate;
  };
  for (const window of [{ from, to, ...source.selection }]) {
    let bundleId: string | undefined;
    const load = async (resource: 'classes' | 'exams' | 'cancelled_classes' | 'calendar_pending', spec: NonNullable<CampusQuery['spec']>) => {
      const records: Record<string, any>[] = [];
      let offset = 0;
      while (true) {
        signal.throwIfAborted(); validate();
        const result = await adapter.query(validateCampusQuery({ operation: 'select', resource, bundleId, academicYear: window.academicYear,
          term: window.term, offset, limit: 50, spec: { ...spec, resource, operation: 'select', offset, limit: 50 } }), signal);
        signal.throwIfAborted(); validate();
        const proof = result.snapshotProof as CampusSnapshotProof | undefined;
        if (!proof || proof.resource !== resource || !adapter.isCurrentSnapshot(proof) || bundleId && proof.bundleId !== bundleId) {
          issues.push(`${resource}There is no verifiable matching campus snapshot. Missing records were not treated as an empty schedule.`); break;
        }
        bundleId ||= proof.bundleId;
        if (!proofs.some(value => value.version === proof.version && value.resource === proof.resource)) proofs.push(proof);
        const rows = Array.isArray(result.records) ? result.records : Array.isArray(result.result) ? result.result : [];
        records.push(...rows.filter((row: unknown) => !!row && typeof row === 'object' && !Array.isArray(row)));
        if (typeof result.unknown_time_records === 'number' && result.unknown_time_records > 0)
          issues.push(`${resource}Some records have no resolved time. Events in this window remain uncertain.`);
        if (!['ok', 'fresh', 'not_found'].includes(String(result.status)) || result.coverage?.complete !== true)
          issues.push(`${resource}Only part of the saved snapshot is covered. Unread records remain unknown.`);
        const next = result.next_offset;
        if (next == null) {
          if (typeof result.total_matches === 'number' && offset + rows.length < result.total_matches)
            issues.push(`${resource}Unread records remain; no truncated result was called complete.`);
          break;
        }
        if (!Number.isSafeInteger(next) || next <= offset || records.length >= 2000) {
          issues.push(`${resource} exceeds this event-reading boundary across its full pages. Narrow the window and continue; the remainder was not silently omitted.`); break;
        }
        offset = next;
      }
      return records;
    };
    for (const resource of ['classes', 'exams', 'cancelled_classes', 'calendar_pending'] as const) {
      const timed = resource === 'classes' || resource === 'exams';
      const records = await load(resource, { resource, ...(timed ? { time: { from: window.from, to: window.to, mode: 'overlap' as const } } : {}) });
      // The connector's overlap query treats a missing end as an instant.
      // Read these exact same-source rows too, so a prior start cannot vanish
      // before the planner conservatively preserves its unknown end.
      if (timed) records.push(...await load(resource, { resource, where: { field: 'endTime', op: 'missing' } }));
      groups.set(resource, [...(groups.get(resource) || []), ...records]);
    }
    const classes = proofs.find(proof => proof.resource === 'classes' && proof.bundleId === bundleId);
    if (classes) {
      signal.throwIfAborted(); validate();
      try {
        const quality = await adapter.readPlanningQuality(classes, signal);
        signal.throwIfAborted(); validate();
        scheduleQuality.push({ bundleId: classes.bundleId, ...quality });
        if (quality.status !== 'ok' || !quality.generatedAllResolvableRules || quality.unresolvedRuleCount > 0)
          issues.push("Some course rules or schedule-generation quality details remain unread or unresolved. They cannot establish free time.");
      } catch (error) {
        signal.throwIfAborted(); validate();
        if (!adapter.isCurrentSnapshot(classes)) throw error;
        scheduleQuality.push({ bundleId: classes.bundleId, status: 'unavailable' });
        issues.push("Schedule-generation quality cannot currently be read from the campus snapshot. Unexpanded classes were not treated as free time.");
      }
    } else issues.push("Schedule-generation quality has not been obtained. Complete free-time coverage cannot be confirmed.");
  }
  signal.throwIfAborted(); validate();
  if (proofs.some(proof => !adapter.isCurrentSnapshot(proof)))
    throw new HarnessError('planning_campus_changed', "The campus snapshot or account changed during reading. The old result was not delivered; read again.");
  const cancellationKey = (rule: unknown, date: unknown) => typeof rule === 'string' && typeof date === 'string' ? canonical([rule, date]) : undefined;
  const cancelledRows = groups.get('cancelled_classes') || [];
  const cancelled = new Set(cancelledRows.flatMap(row => {
    const key = cancellationKey(row.session_uid, row.original_date); return key ? [key] : [];
  }));
  const cancellationsInWindow = new Set(cancelledRows.filter(inDateWindow).map(row => canonical([row.session_uid, row.original_date])));
  const pending = [...new Map((groups.get('calendar_pending') || []).filter(inDateWindow).map(row => [canonical(row), row])).values()];
  if (pending.length) issues.push("Some campus events still lack published or precisely resolved times. Missing times cannot be treated as free time.");
  const itemMap = new Map<string, CampusScheduleBlock>();
  for (const [resource, records] of groups) {
    if (resource !== 'classes' && resource !== 'exams') continue;
    for (const row of records) {
      const start = instant(row.startTime), end = instant(row.endTime);
      if (start && (Date.parse(start) >= Date.parse(to) || end && Date.parse(end) <= Date.parse(from))) continue;
      const cancelledKey = cancellationKey(row.fromUid || row.session_uid || row.uid, row.original_date || (start ? dateInZone(start, timeZone) : undefined));
      if (row.status === 'cancelled' || row.status === 'canceled' || resource === 'classes' && cancelledKey && cancelled.has(cancelledKey)) {
        if (inDateWindow(row)) cancellationsInWindow.add(cancelledKey || canonical([resource, row.uid, row.id, start]));
        continue;
      }
      if (!start) { issues.push(`${resource}Some event start times are unresolved. Free time cannot be confirmed from them.`); continue; }
      if (end && Date.parse(end) <= Date.parse(start)) { issues.push(`${resource}Some start or end times cannot be checked.`); continue; }
      if (!end) issues.push(`${resource}Some events have unknown end times; their occupancy is conservatively reserved through this window's end.`);
      const title = typeof (row.summary || row.name) === 'string' ? String(row.summary || row.name).slice(0, 160) : resource === 'classes' ? "Class schedule" : "Exam schedule";
      const identity = [row.uid || row.id || null, row.fromUid || row.session_uid || null, row.type || null, title, start, end || null, row.dateLabel || null, row.location || null];
      const id = 'campus:' + createHash('sha256').update(canonical([resource, identity])).digest('hex');
      itemMap.set(id, { id, kind: resource === 'classes' ? 'class' : 'exam', title, start, end: end || null,
        ...(typeof row.location === 'string' && row.location ? { location: row.location.slice(0, 300) } : {}),
        ...(typeof row.time_precision === 'string' ? { timePrecision: row.time_precision.slice(0, 80) } : {}) });
    }
  }
  const version = adapter.bindPlanningSnapshots(proofs);
  if (proofs.length && !version) throw new HarnessError('planning_campus_changed', "The saved campus snapshot changed. Read it again before calculating.");
  const currentVersion = version || createHash('sha256').update(canonical([])).digest('hex');
  const reasons = [...new Set(issues)], items = [...itemMap.values()].sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id));
  return { sourceId, version: currentVersion, proofs, items, scheduleQuality,
    busy: items.map(item => ({ start: item.start, end: item.end, sourceId, sourceVersion: currentVersion, title: item.title })), issues: reasons,
    cancelledCount: cancellationsInWindow.size, pendingCount: pending.length,
    coverage: { sourceId, sourceVersion: currentVersion, status: reasons.length ? 'partial' : 'complete',
      reason: reasons.length ? "Campus event coverage or timing is incomplete. Fill the gap first; missing records were not treated as free time."
        : "Only classes, exams and calendar exceptions in the currently saved personal snapshot are covered. This is not attendance, live institutional confirmation or proof of personal availability." } };
}
