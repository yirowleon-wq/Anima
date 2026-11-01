import * as z from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import type { CampusMapAdapter } from '../mapService';
import type { CampusActivityAdapter } from '../campusActivityAdapter';
import type { WorkoutSummaryOwner } from './workout';
import { CAMPUS_ACCOUNT_SOURCE_ID, type AcademicAdapter, type CampusDomain } from '../academicAdapter';
import type { DomainService } from '../storage/domains';
import type { KernelRepository } from '../storage/repository';
import type { PolicyKernel } from '../runtime/policy';
import type { CapabilityBroker, CapabilityDefinition, CapabilityProvider, CapabilityResult } from './broker';
import { HarnessError, type KnowledgeStatus } from '../../shared/harness';
import { calendarFieldsSchema, localCalendarChangeSchema } from '../../shared/calendar';
import { expandAgenda, localStamp } from '../actions/calendar';
import { campusQueryInput, validateCampusQuery, requireCampusQueryScope, campusQueryContinuation, campusLookupReadsCourseGrades, examCourseRecordsPointer } from './campus-query';
import { calendarCommitment, planningPreviewInput, previewCalendarPlan, planningDraftInput } from '../actions/planning';
import { planningRecoveryInput, type PlanningApplicationService } from '../actions/planning-application';
import { readCampusPlanningConstraints, campusConstraintSummary } from '../actions/planning-campus';
import { planningIntentReplanInput, type PlanningIntentService } from '../runtime/planning-intents';
import { compareCalendarPlans, planningComparisonInput, planningComparisonView } from '../actions/planning-comparison';
import { weatherInput, weatherOutput, weatherRequest, weatherResult } from './weather';
import { airQualityInput, airQualityOutput, airQualityRequest, airQualityResult } from './air-quality';
import { dateInZone, dayBounds } from '../runtime/semantics';
import { projectMapSearchPoint } from '../runtime/map-model-view';

export interface BuiltinConnections {
  map?: CampusMapAdapter;
  campus?: AcademicAdapter;
  campusActivity?: CampusActivityAdapter;
  workout?: WorkoutSummaryOwner;
  weatherEnabled: () => boolean;
}
const jsonObject = z.record(z.string(), z.json());
function projectWalkingSearchPoint(point: Parameters<typeof projectMapSearchPoint>[0]) {
  const projected = projectMapSearchPoint(point);
  // Search delivers place and walking facts. The complete map retains its
  // rendering prescriptions, approximate volumes and visual audit notes.
  const fields = ['id', 'displayName', 'aliases', 'kind', 'scope', 'graphNodeId', 'roadReference',
    'source', 'geometryStatus', 'historicalReference', 'undergroundStation', 'entrances', 'accessSummary',
    'accessReviewBasis', 'nearbyRoadReferences', 'coordinate', 'coordinateMeaning', 'officialIds', 'legacyIds', 'sourceCorrection'];
  const accessCount = point.accessCandidates?.length ?? point.entrances.filter(entrance => entrance.connected).length;
  return { ...Object.fromEntries(fields.flatMap(key => projected[key] !== undefined ? [[key, projected[key]]] : [])),
    walkingEndpoint: {
      role: point.kind === 'water' ? 'browse_only' : point.undergroundStation ? 'station_entrance'
        : point.roadReference ? 'road_point' : accessCount ? 'place_with_access_candidates' : 'place_reference_only',
      hasAccessCandidates: accessCount > 0,
      meaning: point.kind === 'water' ? "This is water. Select a nearby bridge or road point for a walking route."
        : !accessCount ? "The current data has no usable access connection. The result retains its reason and nearby road candidates."
          : point.undergroundStation ? "The walking route uses recorded transit entrances. Station entry and internal transfers need separate time."
            : "Access methods, estimated distances and passage conditions are listed with entrances and candidates. The route supplies the actual path.",
    },
  };
}
const campusDomains = [
  'schedule',
  'courses',
  'learning_courses',
  'exams',
  'assignments',
  'grades',
  'gpa',
  'gpa_semesters',
  'gpa_cumulative',
  'retakes',
  'practice',
  'projects',
  'activities',
  'sports',
  'reservations',
  'reservation_violations',
  'card',
  'transactions',
  'profile',
  'roles',
  'calendar_pending',
  'cancelled_classes',
  'holidays',
  'source_status',
  'places',
  'rules',
] as const;
export const campusInput = z
  .object({
    domain: z.enum(campusDomains).describe("Resource category to read. Select a course or grade term using filters on the source semester_id; academicYear/term identify the collection period. sports returns readable activity entries; imported activity material is available through campus.imported_lookup."),
    courseId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/).optional(),
    academicYear: z.string().regex(/^20\d{2}-20\d{2}$/).optional().describe("Collection snapshot's academic year. Its course and grade rows may span several terms; filter semester_id for row scope."),
    term: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/).optional().describe("Collection snapshot's term. For one term, use filters semester_id:eq:the-source-term-ID. Grade presentation can use campusDisplay.semesterId on a Scene from that same source."),
    query: z.string().max(100).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    at: z.string().datetime({ offset: true }).optional(),
    timeMode: z.enum(['overlap', 'starts', 'contained']).optional(),
    fields: z
      .array(z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/))
      .max(24)
      .optional(),
    filters: z.array(z.string().max(160)).max(6).optional().describe("Filter source fields as field:operator:value; all supplied conditions must match. Use semester_id:eq:the-original-term-ID for one term. Lists and presentation use the same filter."),
    sort: z.string().max(100).optional(),
    offset: z.number().int().min(0).max(10000).optional(),
    bundleId: z.string().regex(/^[a-f0-9]{32}$/).optional().describe("Continue reading the same snapshot from its original address; this differs from refresh."),
    expectedSnapshotVersion: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    window: z.string().max(40).optional(),
    limit: z.number().int().min(1).max(50).default(12),
    refresh: z.boolean().default(false).describe("Read saved records by default. Set true only when current data is needed; the configured source refreshes the relevant collection while preserving its provenance. Missing prior records remain an explicit gap. Keep false when paging and retain the previous page's source address."),
  })
  .strict();
const campusOverviewInput = z
  .object({
    refresh: z.boolean().default(false).describe("true refreshes the configured academic collection, including grades. includeSensitiveDomains selects categories exposed for this request."),
    includeSensitiveDomains: z.boolean().default(false),
    academicYear: z.string().regex(/^20\d{2}-20\d{2}$/).optional(),
    term: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/).optional(),
  })
  .strict();
const campusAuthentication = z.object({
  mode: z.enum(['saved_snapshot', 'live_session']), accountBinding: z.enum(['current_local_account', 'not_established']),
  ssoCheck: z.enum(['not_performed', 'performed', 'reused']),
  verifiedAt: z.string().optional(), lastSsoVerifiedAt: z.string().optional(),
}).strict();
const campusAccountOutput = z
  .object({
    domain: z.string(),
    records: z.array(jsonObject),
    policyMeanings: jsonObject.optional(),
    conflicts: z.array(jsonObject).optional(),
    source: z.string(),
    institutionId: z.string(),
    termId: z.string(),
    termIdMeaning: z.literal('snapshot_collection_period').optional(),
    recordSelection: z.object({ filters: z.array(z.string()), sort: z.string().optional(),
      semester: z.enum(['no_semester_predicate', 'semester_predicate_provided']) }).strict().optional(),
    courseRecords: jsonObject.optional(),
    live: z.boolean(),
    origin: z.enum(['academic_account', 'imported_records']),
    authenticated: z.boolean(),
    authentication: campusAuthentication.optional(),
    total: z.number().int().nonnegative().optional(),
    cached: z.boolean(),
    snapshotAt: z.string().optional(),
    bundleId: z.string().optional(),
    nextOffset: z.number().int().nonnegative().nullable().optional(),
    offset: z.number().int().nonnegative().optional(),
    unknownTimeRecords: z.number().int().nonnegative().optional(),
    sourceCoverage: jsonObject.optional(),
    timeInterval: jsonObject.optional(),
    evaluatedAt: z.string().optional(),
    snapshotProof: jsonObject.optional(),
    snapshotProofs: z.array(jsonObject).optional(),
    truncated_for_model: z.boolean().optional(),
    nested_values_truncated: z.boolean().optional(),
  })
  .strict();
const campusNavigationOutput = z.object({
  kind: z.literal('navigation_required'), domain: z.string(), recordRead: z.literal(false),
  resource: z.string().optional(), bundleId: z.string().optional(), offset: z.number().int().nonnegative().optional(),
  expectedSnapshotVersion: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  total: z.number().int().nonnegative().optional(), authentication: campusAuthentication.optional(),
  snapshotProof: jsonObject.optional(), truncated_for_model: z.boolean().optional(), nested_values_truncated: z.boolean().optional(),
}).strict();
const campusImportOutput = z
  .object({
    domain: z.string(),
    records: z.array(jsonObject),
    materialVersions: z.array(jsonObject).optional(),
    conflicts: z.array(jsonObject).optional(),
    source: z.string(),
    institutionId: z.string(),
    termId: z.string(),
    live: z.literal(false),
    origin: z.literal('legacy_import'),
    authenticated: z.literal(false),
    total: z.number().int().nonnegative().optional(),
    totalMeaning: z.enum(['matching_retained_records', 'matching_records_within_source_limit']).optional(),
    offset: z.number().int().nonnegative().optional(),
    nextOffset: z.number().int().nonnegative().nullable().optional(),
    snapshotVersion: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    continuation: jsonObject.optional(),
    sourceRead: z.object({ limit: z.literal(6000), returned: z.number().int().nonnegative(), limitReached: z.boolean(), meaning: z.string() }).strict().optional(),
    truncated_for_model: z.boolean().optional(),
    cached: z.literal(true),
    snapshotAt: z.string().optional(),
  })
  .strict();
export const localActionInput = z
  .object({
    ...calendarFieldsSchema.shape,
    title: z.string().min(1).max(160),
    detail: z.string().max(1500).default('').describe("Extra details for the event, following what the user actually supplied. Leave empty if absent."),
    startsAt: z.string().datetime({ offset: true }).optional(),
    durationMinutes: z.number().int().min(1).max(1440).optional(),
    demo: z.boolean().optional(),
    planRef: z.object({ planId: z.string().min(1).max(160), blockId: z.string().min(1).max(160) }).strict().optional().describe("When saving the original planning.draft proposal, copy its complete returned reference."),
  })
  .strict();
const base = (
  name: string,
  input: z.ZodType,
  output: z.ZodType,
  requiredScopes: string[],
  extra: Partial<CapabilityDefinition> = {},
): CapabilityDefinition => ({
  name,
  version: '1',
  input,
  output,
  effect: 'read',
  requiredScopes,
  subjects: ['self'],
  worlds: ['real', 'scenario'],
  timeoutMs: 15000,
  maxBytes: 80000,
  supportsIdempotency: false,
  supportsInspect: false,
  supportsCancel: false,
  cacheScope: 'equivalent',
  ...extra,
});
const manifest = (
  id: string,
  sourceId: string,
  capabilities: CapabilityDefinition[],
  egressHosts: string[] = [],
): CapabilityProvider['manifest'] => ({
  id,
  sourceId,
  version: '1',
  capabilities,
  egressHosts,
  platforms: ['*'],
  simulated: false,
  trust: 'bundled_reviewed',
  offline: 'read_cache',
  license: 'project-owned adapter; underlying sources retain original licenses',
});
function statusOf(value: any): KnowledgeStatus {
  if (value?.status === 'conflict') return 'conflict';
  if (value?.stale || value?.freshness?.stale) return 'stale';
  if (value?.status === 'forbidden' || value?.status === 'auth_required') return 'forbidden';
  if (value?.status === 'unavailable' || value?.status === 'unsupported') return 'unsupported';
  if (value?.status === 'error' || value?.status === 'failed') return 'failed';
  if (value?.status === 'conflict') return 'conflict';
  if (
    value?.status === 'partial' || value?.status === 'navigate_required' ||
    ['ok', 'fresh'].includes(String(value?.status)) && (value?.coverage?.complete === false || value?.completeness?.complete === false)
  )
    return 'partial';
  return ['ok', 'fresh'].includes(String(value?.status))
    ? 'fresh'
    : value?.status === 'not_found'
      ? 'not_found'
      : 'unknown';
}
function sourceObservationAt(value: any): string | undefined {
  const mapped = value?.coverage?.source_fetched_at;
  const candidates = [
    value?.fetched_at,
    value?.collected_at,
    ...(mapped && typeof mapped === 'object' ? Object.values(mapped) : []),
  ]
    .filter((item): item is string => typeof item === 'string' && Number.isFinite(Date.parse(item)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return candidates[0];
}
/** Only a successful page of a complete, source-bound connector query gets
 * a page-delivery mark. An empty partial/auth response is not such a page. */
function campusPageCoordinates(result: any, expectedOffset: number): boolean {
  return !(!Array.isArray(result.records) || result.records.some((row: unknown) => !row || typeof row !== 'object' || Array.isArray(row))
    || !Number.isSafeInteger(result.offset) || result.offset !== expectedOffset
    || result.offset < 0
    || !Number.isSafeInteger(result.total_matches) || result.total_matches < result.offset + result.records.length
    || result.next_offset === null && result.total_matches !== result.offset + result.records.length
    || result.next_offset !== null && (!Number.isSafeInteger(result.next_offset)
      || result.next_offset !== result.offset + result.records.length || result.next_offset <= result.offset || result.next_offset >= result.total_matches));
}
function campusPageDelivery(campus: AcademicAdapter, result: any, expectedOffset: number): CapabilityResult['delivery'] {
  if (result.status !== 'ok' || result.coverage?.complete !== true || result.completeness?.complete === false
    || result.nested_values_truncated === true || result.truncated_for_model === true
    || Array.isArray(result.coverage.issues) && result.coverage.issues.length
    || !campusPageCoordinates(result, expectedOffset)
    || !result.snapshotProof || result.snapshotProof.bundleId !== result.bundle_id
    || result.snapshotProof.resource !== result.resource || !campus.captureReadingProof?.(result.snapshotProof)) return;
  return { kind: 'page', complete: true };
}
function examCourseRecordsNavigation(campus: AcademicAdapter, result: any) {
  const proof = result.snapshotProof;
  if (result.recordKind === 'exam_course_record' || !['ok', 'partial'].includes(result.status)
    || !proof || proof.resource !== 'exams' || proof.bundleId !== result.bundle_id || !campus.captureReadingProof(proof)) return;
  return { recordRead: false, model: 'exam_course_record',
    read: { capability: 'campus.query', arguments: { operation: 'read', resource: 'exams',
      bundleId: proof.bundleId, expectedSnapshotVersion: proof.version, pointer: examCourseRecordsPointer,
      offset: 0, limit: 8, refresh: false } },
    meaning: "A separate exam-course collection may include subjects with no exam time. Follow this address using its own pages and course scope; missing historical material is reported during reading." };
}
export function calendarLocalTimes(item: Record<string, unknown>, fallbackTimeZone: string): Record<string, unknown> {
  const timeZone = typeof item.timeZone === 'string' ? item.timeZone : fallbackTimeZone;
  if (typeof item.startsAt !== 'string') return item.allDayDate ? { ...item, timeZone } : item;
  const endsAt = typeof item.endsAt === 'string' ? item.endsAt : item.endsAt !== null && typeof item.durationMinutes === 'number'
    ? new Date(Date.parse(item.startsAt) + item.durationMinutes * 60000).toISOString() : undefined;
  return { ...item, timeZone, localStartsAt: localStamp(item.startsAt, timeZone), localEndsAt: endsAt ? localStamp(endsAt, timeZone) : null };
}
function safeRecord(value: unknown, depth = 0, truncated?: { value: boolean }): any {
  if (depth > 12) { if (truncated) truncated.value = true; return null; }
  if (Array.isArray(value)) {
    if (value.length > 100 && truncated) truncated.value = true;
    return value.slice(0, 100).map((v) => safeRecord(v, depth + 1, truncated));
  }
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !/^(?:password|secret|token|ticket|cookie|authorization|credential|raw_response|data_path|body_b64|email|phone|mobile|account|student.?id|customer.?id|account.?id|card.?id|bank.?account|certificate.?number)$/i.test(key) &&
            !/(identity|student.?id|phone|mobile|email)/i.test(key),
        )
        .map(([k, v]) => [k, safeRecord(v, depth + 1, truncated)]),
    );
  if (typeof value === 'string' && value.length > 4000 && truncated) truncated.value = true;
  return typeof value === 'string' ? value.slice(0, 4000) : value;
}

const sensitiveCampusGrant: Partial<Record<(typeof campusDomains)[number], string>> = {
  grades: 'campus:grades:read',
  gpa: 'campus:gpa:read',
  gpa_semesters: 'campus:gpa:read',
  gpa_cumulative: 'campus:gpa:read',
  retakes: 'campus:grades:read',
  reservations: 'campus:reservations:read',
  reservation_violations: 'campus:reservations:read',
  card: 'campus:card:read',
  transactions: 'campus:transactions:read',
  profile: 'campus:profile:read',
  roles: 'campus:profile:read',
};
export function registerBuiltins(
  broker: CapabilityBroker,
  policy: PolicyKernel,
  repo: KernelRepository,
  domains: DomainService,
  connections: BuiltinConnections,
  planning: PlanningApplicationService,
  planningIntents?: PlanningIntentService,
) {
  const register = (provider: CapabilityProvider) =>
    broker.register(provider, { reviewed: true, source: 'bundled source review' });
  const campusScopeCurrent = (scope: ReturnType<PolicyKernel['validate']>) => scope.principalId === repo.identity.principalId
    && scope.workspaceId === repo.identity.workspaceId && scope.subjectId === scope.principalId && scope.worldId === 'real' && scope.audience === 'self'
    && scope.privacyEpoch === repo.epoch && scope.policyRevision === repo.policyRevision && Date.parse(scope.expiresAt) > Date.parse(repo.clock.now())
    && scope.sources.includes(CAMPUS_ACCOUNT_SOURCE_ID) && scope.grants.includes('campus:read');
  planning.setCampusPort({
    read: async (scope, from, to, signal) => {
      if (!campusScopeCurrent(scope) || !connections.campus) return null;
      return readCampusPlanningConstraints(connections.campus, scope, from, to, signal, () => {
        if (!campusScopeCurrent(scope)) throw new HarnessError('planning_campus_scope_changed', "The permitted campus-reading scope changed. Recheck the conditions used for this arrangement.");
      });
    },
    current: (scope, snapshot) => campusScopeCurrent(scope) && !!connections.campus?.describe().available && snapshot.proofs.length > 0
      && snapshot.proofs.every(proof => connections.campus!.isCurrentSnapshot(proof)),
    currentVersion: (scope, version) => campusScopeCurrent(scope) && !!connections.campus?.describe().available
      && connections.campus.isCurrentSnapshotVersion(version),
  });
  register({
    manifest: manifest('situation', 'current', [base('situation.read', z.object({
      from: z.string().datetime({ offset: true }).describe("Start of the period to review together. to must follow it, up to 31 days later."), to: z.string().datetime({ offset: true }).describe("End of the period to review together."), timeZone: z.string().max(100).default('America/Los_Angeles'),
      limit: z.number().int().min(1).max(20).default(8).describe("Number of entries to return initially per category; results retain remaining counts and provenance."),
    }).strict(), jsonObject, ['evidence:read'], { version: '3', timeoutMs: 90000, worlds: ['real'], displayName: "Look at the coming days together", description: "Bring together saved events, accepted commitments, current goals and readable campus events for up to 31 days to discuss the coming days. Configured campus sources reconnect to their original records and report missing term data. Each item retains local time, provenance and incomplete coverage. Let the user describe energy and wishes. For a particular timetable or exam list, use campus.lookup or campus.query directly; the returned presentation address can be shown." })]),
    invoke: async (_name, args, ctx) => {
      const scope = policy.validate(ctx.scope), now = repo.clock.now();
      if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self') throw new HarnessError('situation_scope', "This entry concerns the user's privately discussed real events. Other people's arrangements and hypothetical stories belong to their own matters.");
      if (Date.parse(args.to) <= Date.parse(args.from) || Date.parse(args.to) - Date.parse(args.from) > 31 * 86400000) throw new HarnessError('time_window', "Supply a start and a later end for the review period, up to 31 days. Longer periods can be read in consecutive windows.");
      const campusSnapshot = await planning.readCampus(scope, args.from, args.to, ctx.signal);
      policy.validate(ctx.scope);
      const campusCalendar = campusSnapshot ? { ...campusConstraintSummary(campusSnapshot),
        items: campusSnapshot.busy.slice(0, args.limit).map(item => calendarLocalTimes({ startsAt: item.start, endsAt: item.end,
          title: item.title, sourceId: item.sourceId, sourceVersion: item.sourceVersion, meaning: "These events come from saved institutional records. Attendance and the user's calendar are recorded separately." }, args.timeZone)),
        truncated: campusSnapshot.busy.length > args.limit, totalKnownScheduledItems: campusSnapshot.busy.length } : null;
      const mayReadAgenda = scope.sources.includes('local-agenda');
      const agenda = mayReadAgenda ? repo.db.prepare('SELECT payload FROM agenda').all().map(row => JSON.parse(String(row.payload))) : [];
      const local = mayReadAgenda ? expandAgenda(agenda, args.from, args.to, args.timeZone) : undefined;
      const localItems = (local?.items || []).map(item => calendarLocalTimes(item, args.timeZone));
      const work = scope.sources.includes('work:self') ? repo.work(ctx.scope) : [];
      const evidence = (ids: string[]) => ids.flatMap(id => { const source = repo.evidence(ctx.scope, id); return source ? [{ id: source.id, sourceId: source.sourceId, version: source.contentVersion, receivedAt: source.receivedAt, authority: source.authority }] : []; });
      const goals = work.filter(item => item.kind === 'goal' && item.status === 'active').slice(0, args.limit).map(item => ({ id: item.id, revision: item.revision, title: item.title, status: item.status, data: item.data, sources: evidence(item.evidenceIds) }));
      const commitments = work.filter(item => item.kind === 'commitment' && (['accepted', 'confirmed'].includes(item.status) || item.data.accepted === true) && !['cancelled', 'closed', 'stale', 'blocked'].includes(item.status)).slice(0, args.limit).map(item => ({ id: item.id, revision: item.revision, title: item.title, status: item.status, data: item.data, sources: evidence(item.evidenceIds) }));
      const mayReadCampus = scope.grants.includes('campus:read') && scope.sources.some(source => ['campus:local', CAMPUS_ACCOUNT_SOURCE_ID].includes(source));
      const storedCampusScope = campusSnapshot ? policy.narrow(ctx.scope, { sources: scope.sources.filter(source => source !== CAMPUS_ACCOUNT_SOURCE_ID) }) : ctx.scope;
      const campus = mayReadCampus && (!campusSnapshot || scope.sources.includes('campus:local')) ? ['schedule', 'exams'].map(domain => {
        const result = domains.resolve(storedCampusScope, domain, { from: args.from, to: args.to, limit: args.limit + 1 });
        return { domain, status: result.status, completeForWindow: false, truncated: result.records.length > args.limit,
          records: result.records.filter(record => !campusSnapshot || record.sourceId !== CAMPUS_ACCOUNT_SOURCE_ID)
            .slice(0, args.limit).map(record => ({ ...record, value: safeRecord(calendarLocalTimes(record.value, args.timeZone)) })),
          meaning: "These are the saved records readable now. Follow original campus sources to check last-minute class changes or complete occurrences." };
      }) : [];
      const acceptedLocal = localItems.filter(item => calendarCommitment(item as any).state === 'accepted');
      const acceptedDated = acceptedLocal.filter(item => calendarCommitment(item as any).occupiesTime).map(item => ({ ...item, sourceId: 'local-agenda' }));
      const schoolDated = campusSnapshot ? campusSnapshot.busy.map(item => ({ startsAt: item.start, endsAt: item.end,
        title: item.title, sourceId: item.sourceId, sourceVersion: item.sourceVersion })) : [];
      const storedDated = campus.flatMap(domain => domain.records.filter(record => record.value.status !== 'cancelled' && typeof record.value.startsAt === 'string').map(record => ({ ...record.value, id: record.id, revision: record.revision, sourceId: record.sourceId, sourceStatus: record.status, fetchedAt: record.fetchedAt })));
      const nextInWindow = (items: Record<string, unknown>[]) => items.filter(item => typeof item.startsAt === 'string'
        && Date.parse(item.startsAt) >= Math.max(Date.parse(now), Date.parse(args.from)))
        .sort((a, b) => Date.parse(String(a.startsAt)) - Date.parse(String(b.startsAt)))[0] || null;
      const next = nextInWindow(acceptedDated), nextKnownScheduledItem = nextInWindow([...acceptedDated, ...schoolDated, ...storedDated]);
      const data = { now, timeZone: args.timeZone, window: { from: args.from, to: args.to }, nextAcceptedCommitment: next,
        localAgenda: { status: mayReadAgenda ? local!.status : 'not_read', items: localItems.slice(0, args.limit), truncated: !!local && local.items.length > args.limit, issues: local?.issues.map(item => calendarLocalTimes(item, args.timeZone)) || [], sourceId: 'local-agenda' },
        goals, commitments, campus, campusCalendar, nextKnownScheduledItem,
        coverage: { localAgenda: mayReadAgenda ? 'local_registered_occurrences_only' : 'not_in_scope', work: scope.sources.includes('work:self') ? 'bounded_authorized_records' : 'not_in_scope',
          campus: campusSnapshot ? 'current_saved_account_snapshot_not_live_confirmation' : mayReadCampus ? 'stored_records_only_not_live_complete' : 'not_in_scope', notes: 'not_read', location: 'not_read', weather: 'not_read', energy: 'unknown' },
        unknown: ["Blank time means no event was listed in these records. Other commitments still need consideration.", "Let the user describe today's energy and wishes.", "The next item comes from the records just read. Another source may contain an earlier event; include it when that source is read."] };
      return { status: 'fresh', sourceId: 'current', data: JSON.parse(JSON.stringify(data)), fetchedAt: now, coverage: { complete: false, scope: 'bounded allowed local situation; omitted sources remain unknown' }, simulated: false };
    },
  });
  register({
    manifest: manifest('local-agenda', 'local-agenda', [
      base('planning.compare', planningComparisonInput, jsonObject, ['evidence:read'], { version: '2', timeoutMs: 90000, cacheScope: 'handle',
        displayName: "Compare ways to arrange the day", description: "Try 2–4 alternatives using the same calendar and campus records, showing what each preserves, moves and leaves open. Preserve total work, splitting conditions, setup, cleanup, travel, rest and free time. taskPreferences.rhythm can compare continuous and split work. Results show actual differences and unscheduled work. This is still comparison; save only after adoption is decided." }),
      base('planning.draft', planningDraftInput, jsonObject, ['evidence:read'], { version: '2', timeoutMs: 90000, displayName: "Draft a complete, considered plan", description: "Schedule tasks against deadlines, dependencies, full workload and splitting conditions, reserving setup, cleanup, travel, rest and free time. Readable campus classes, exams and calendar exceptions join the calculation. Results show what fits and what does not. Adopt through acceptanceProposals and the original planRef. Recalculate when conditions change, preserving already saved steps." }),
      base('planning.recover', planningRecoveryInput, jsonObject, ['evidence:read'], { version: '1', cacheScope: 'handle', worlds: ['real'], displayName: "Continue an unfinished plan", description: "Use the original planId to inspect saved steps, possible continuation and changed conditions. Check actual results first, retain completed saves and follow returned entries for the remainder." }),
      ...(planningIntents ? [base('planning.replan', planningIntentReplanInput, jsonObject, ['evidence:read'], { version: '2', timeoutMs: 90000, cacheScope: 'handle', worlds: ['real'], displayName: "Continue a retained planning discussion", description: "Use the read intent's id and expectedRevision to recalculate with its original conditions, current calendar and saved portion. Recheck readable campus records. Return a new draft address while retaining original sources, adoption progress and unresolved gaps; continue adoption from that draft." })] : []),
      base('planning.preview', planningPreviewInput, jsonObject, ['evidence:read'], { version: '1', displayName: "Consider a better adjustment", description: "Try up to three adjustments in the current calendar, preserving fixed commitments and including accepted but movable events. Return conflicts, missing conditions and edit proposals linked to original objects. This previews changes; an actual decision is saved through the original local action." }),
      base('local.agenda.change', localCalendarChangeSchema, z.object({}).strict(), ['local:write'], { effect: 'local_write', worlds: ['real'], supportsIdempotency: true, supportsInspect: true, supportsCancel: true, displayName: "Edit the original event", description: "Update or delete an event using its original identity and revision, or change only one recurring occurrence. Preserve actual changes and the original record's inspection and undo entries." }),
      base('local.agenda.save', localActionInput, z.object({}).strict(), ['local:write'], {
        effect: 'local_write',
        worlds: ['real'],
        supportsIdempotency: true,
        supportsInspect: true,
        supportsCancel: true,
        displayName: "Save this arrangement", description: "Save the explicit arrangement to the local calendar, preserving original dates, reminder time and details. Use its planRef when adopting a full plan. Results can be read back and undone.",
      }),
      base(
        'local.agenda.read',
        z.object({ query: z.string().max(100).optional(), from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional(), timeZone: z.string().max(100).optional() }).strict(),
        z.object({ items: z.array(jsonObject), issues: z.array(jsonObject).optional() }).strict(),
        ['evidence:read'],
        { version: '2', displayName: "Read saved events", description: "Read unfinished local events within a date range. Recurrences expand into dated occurrences with local time and time zone. query matches title text; omit it to read the whole period. Unknown end times remain unknown, and pending conditions or conflicts accompany the result." },
      ),
    ]),
    invoke: async (name, args, ctx) => {
      if (name === 'local.agenda.save' || name === 'local.agenda.change')
        throw new HarnessError('transaction_required', "Save through prepare_action. Edit saved events through their original actions, keeping actual results and undo at the same place.");
      policy.validate(ctx.scope);
      if (name === 'planning.compare') {
        const scope = policy.validate(ctx.scope), input = planningComparisonInput.parse(args);
        if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self' || !scope.sources.includes('local-agenda'))
          throw new HarnessError('planning_scope', "The user's calendar has not been read, so actual openings cannot be calculated. Reconnect the permitted calendar before comparing these alternatives.");
        const campus = await planning.readCampus(scope, input.draft.from, input.draft.to, ctx.signal);
        ctx.signal.throwIfAborted(); policy.validate(ctx.scope);
        if (campus && !planning.campusCurrent(scope, campus))
          throw new HarnessError('planning_campus_changed', "Campus events changed during comparison. Read them again and compare alternatives using the same current source snapshot.");
        const items = repo.db.prepare('SELECT payload FROM agenda').all().map(row => JSON.parse(String(row.payload)));
        const currentInput = campus ? { ...input, draft: { ...input.draft, busy: [...input.draft.busy, ...campus.busy],
          sourceCoverage: [...input.draft.sourceCoverage, campus.coverage] } } : input;
        const comparison = compareCalendarPlans(items, currentInput), comparisonId = randomUUID();
        const data = { ...comparison, comparisonId, comparisonView: planningComparisonView(comparison, { comparisonId,
          sourceIds: ['local-agenda', ...(campus ? [campus.sourceId] : [])] }), ...(campus ? { campusCalendar: campusConstraintSummary(campus) } : {}) };
        return { status: 'fresh', sourceId: 'local-agenda', data: JSON.parse(JSON.stringify(data)), fetchedAt: repo.clock.now(),
          coverage: { complete: false, scope: 'declared alternatives on one current local agenda and permitted saved campus snapshot; not all possible life choices' }, simulated: false };
      }
      if (name === 'planning.preview' || name === 'planning.draft' || name === 'planning.recover' || name === 'planning.replan') {
        const campus = name === 'planning.draft' ? await planning.readCampus(policy.validate(ctx.scope), args.from, args.to, ctx.signal) : null;
        policy.validate(ctx.scope);
        const items = repo.db.prepare('SELECT payload FROM agenda').all().map(row => JSON.parse(String(row.payload)));
        const data = name === 'planning.draft' ? planning.prepare(policy.validate(ctx.scope), items, args, undefined, campus) : name === 'planning.recover' ? planning.recover(policy.validate(ctx.scope), items, args)
          : name === 'planning.replan' ? await planningIntents!.replanWithCampus(ctx.scope, args, ctx.signal) : previewCalendarPlan(items, args);
        return { status: 'fresh', sourceId: 'local-agenda', data: JSON.parse(JSON.stringify(data)), fetchedAt: repo.clock.now(),
          coverage: { complete: name === 'planning.preview' && 'issues' in data && data.issues.length === 0, scope: 'local calendar arithmetic only; external coverage and energy remain explicit conditions' }, simulated: false };
      }
      const items = repo.db
        .prepare('SELECT payload FROM agenda')
        .all()
        .map((r) => JSON.parse(String(r.payload)))
        .filter((a) => !a.done && (!args.query || a.title.includes(args.query)));
      if (args.from || args.to) {
        if (!args.from || !args.to) throw new HarnessError('time_window', "A time query needs explicit start and end bounds.");
        const expanded = expandAgenda(items, args.from, args.to, args.timeZone || 'America/Los_Angeles');
        const titleFilter = args.query ? `; title contains ${JSON.stringify(args.query)}` : '; no title filter';
        return { status: expanded.status, sourceId: 'local-agenda', data: { items: expanded.items.map(item => calendarLocalTimes(item, args.timeZone || 'America/Los_Angeles')), issues: expanded.issues.map(item => calendarLocalTimes(item, args.timeZone || 'America/Los_Angeles')) }, coverage: { complete: expanded.coverage.complete, scope: `dated occurrences from ${args.from} to ${args.to}; undated tasks excluded${titleFilter}` }, fetchedAt: repo.clock.now(), simulated: false };
      }
      return {
        status: items.length ? 'fresh' : 'known_absent',
        sourceId: 'local-agenda',
        data: { items: items.map(item => calendarLocalTimes(item, args.timeZone || 'America/Los_Angeles')) },
        coverage: { complete: true, scope: `unfinished local agenda${args.query ? `; title contains ${JSON.stringify(args.query)}` : '; no title filter'}` },
        fetchedAt: repo.clock.now(),
        simulated: false,
      };
    },
  });
  register({
    manifest: manifest('campus-read', CAMPUS_ACCOUNT_SOURCE_ID, [
      base('campus.query', campusQueryInput, jsonObject, ['campus:read'], {
        version: '10', displayName: "Explore courses, grades and GPA", description: "Read original courses, timetable, exams, grades, term and overall GPA, and academic activity records from the configured source. resources lists collections; schema describes source fields; quick/select filters, joins or aggregates; continuation pages the same query; read opens the original object; history/diff shows observed changes. exam_course_record can expose courses without resolved exam times; major entries refer to the same collection. Preserve units, original grade, attempts, inclusion policy and denominator. Grade scales retain their actual institution policy. Source identity, save time and gaps are included so further reading can be chosen honestly.", timeoutMs: 90000, maxBytes: 140000,
      }),
      base(
        'campus.lookup',
        campusInput,
        z.union([campusAccountOutput, campusNavigationOutput, z.object({ kind: z.literal('capability_assessment'), domain: z.enum(campusDomains), recordRead: z.literal(false),
          requestedMeasures: z.array(z.string()), catalog: jsonObject }).strict()]),
        ['campus:read'],
        { version: '16', timeoutMs: 90000, displayName: "Personal campus records", description: "Browse original courses, timetable, exams, grades, GPA, academic activities and other saved campus records by category. Filter grades by course name and source term ID. Exam occurrences and courseRecords page separately. Unsupported categories return their readable resource catalog with the actual reading state. Preserve attempt policy, denominator, observation period, continuation and source time. Academic units and activity counts use their own sources." },
      ),
      base('campus.overview', campusOverviewInput, jsonObject, ['campus:read'], {
        version: '6',
        timeoutMs: 90000,
        maxBytes: 140000,
        displayName: "See available campus records", description: "Read an overview of campus records and category entries for the selected collection period. Saved material is used by default. refresh rereads the configured academic collection; includeSensitiveDomains selects categories returned here. Follow the relevant list for courses, exams or grades.",
      }),
    ]),
    connectionStatus: () => {
      const status = connections.campus?.describe();
      const connected = !!status?.available && status.credentialsConfigured !== false;
      return { connected, ...(status?.reason ? { reason: status.reason } : !connected ? { reason: "No campus source configured" } : {}), entry: "Connections and preferences → Campus records" };
    },
    invoke: async (name, args, ctx) => {
      const sourceId = CAMPUS_ACCOUNT_SOURCE_ID;
      const connector = connections.campus?.describe();
      if (!connections.campus || !connector?.available)
        return {
          status: 'not_connected',
          sourceId,
          reason: connector?.reason || "No campus academic source is configured. Choose an authorized local data file in Connections and preferences → Campus records. Already imported material remains available through campus.imported_lookup.",
          simulated: false,
        };
      if (name === 'campus.query') {
        const query = validateCampusQuery(args);
        requireCampusQueryScope(policy, ctx.scope, query);
        const result = await connections.campus.query(query, ctx.signal, { allowAcademicSync:
          ['campus:grades:read', 'campus:gpa:read', 'campus:profile:read'].every(grant => policy.can(ctx.scope, grant)) });
        policy.validate(ctx.scope);
        const sourceStatus = result.status === 'unavailable' ? 'not_connected' : statusOf(result);
        const paged = result.next_offset != null || (query.spec?.offset ?? query.offset) > 0;
        const exactRows = result.truncated_for_model !== true && result.nested_values_truncated !== true
          && (!Array.isArray(result.records) || campusPageCoordinates(result, query.spec?.offset ?? query.offset));
        const status: KnowledgeStatus = sourceStatus === 'fresh' && (paged || !exactRows) ? 'partial' : sourceStatus;
        const continuation = exactRows ? campusQueryContinuation(query, result) : undefined;
        const observedAt = sourceObservationAt(result);
        const delivery = campusPageDelivery(connections.campus, result, query.spec?.offset ?? query.offset);
        const courseRecords = examCourseRecordsNavigation(connections.campus, result);
        return { status, sourceId, data: JSON.parse(JSON.stringify({ ...result, ...(continuation ? { continuation } : {}),
          ...(courseRecords ? { courseRecords } : {}) })), fetchedAt: observedAt, reason: result.reason,
          ...(delivery ? { delivery } : {}),
          coverage: { complete: result.status !== 'navigate_required' && exactRows && result.coverage?.complete === true && !paged,
            scope: query.resource || query.spec?.resource || 'capability_metadata' }, simulated: false };
      }
      if (name === 'campus.lookup' && args.domain === 'sports') {
        const assessment = (await connections.campus.read({ domain: 'sports' }, ctx.signal)).data;
        policy.validate(ctx.scope);
        if (assessment.kind !== 'capability_assessment') return { status: statusOf(assessment), sourceId,
          reason: assessment.reason, simulated: false, coverage: { complete: false, scope: 'connector_catalog_only' } };
        return { status: 'unsupported', sourceId,
          data: { kind: assessment.kind, domain: assessment.domain, recordRead: assessment.recordRead,
            requestedMeasures: assessment.requestedMeasures, catalog: assessment.catalog }, simulated: false,
          coverage: { complete: false, scope: 'connector_catalog_only' } };
      }
      if (connector.credentialsConfigured === false)
        return {
          status: 'forbidden',
          sourceId,
          reason: "The campus academic source is not configured. Select an authorized data file in Connections and preferences → Campus records; imported material remains available through campus.imported_lookup.",
          simulated: false,
        };
      if (name === 'campus.overview') {
        if (args.includeSensitiveDomains) {
          for (const grant of [
            'campus:grades:read',
            'campus:gpa:read',
            'campus:reservations:read',
            'campus:card:read',
            'campus:transactions:read',
            'campus:profile:read',
          ]) policy.require(ctx.scope, grant);
        }
        const result = await connections.campus.fullContext(
          {
            refresh: args.refresh,
            includeSensitiveDomains: args.includeSensitiveDomains,
            academicYear: args.academicYear,
            term: args.term,
          },
          ctx.signal, { allowAcademicSync: ['campus:grades:read', 'campus:gpa:read', 'campus:profile:read'].every(grant => policy.can(ctx.scope, grant)) },
        );
        policy.validate(ctx.scope);
        const batches = Array.isArray(result?.batches) ? result.batches
          : Array.isArray(result?.sections) ? result.sections.map((section: any) => ({ scope: section.domain, data: section.data })) : [];
        const domains = batches
          .filter((batch: any) => batch.scope !== 'academic')
          .map((batch: any) => {
            const data = batch.data || {};
            return {
              domain: String(batch.scope),
              status: String(data.status || 'unknown'),
              total: typeof data.total_matches === 'number' ? data.total_matches : undefined,
              records: (Array.isArray(data.records) ? data.records : [])
                .slice(0, 4)
                .map((record: any) => safeRecord(record)),
              fetchedAt: sourceObservationAt(data),
              ...(data.authentication ? { authentication: data.authentication } : {}),
              complete: data.coverage?.complete === true || data.completeness?.complete === true,
              issues: Array.isArray(data.coverage?.issues) ? data.coverage.issues.slice(0, 8) : undefined,
            };
          });
        const overviewSnapshotAt = domains
          .map((domain: any) => domain.fetchedAt)
          .filter((item: unknown): item is string => typeof item === 'string' && Number.isFinite(Date.parse(item)))
          .sort((a: string, b: string) => Date.parse(a) - Date.parse(b))[0];
        return {
          status: statusOf(result),
          sourceId,
          data: JSON.parse(
            JSON.stringify(
              safeRecord({
                origin: result?.origin === 'imported_records' ? 'imported_records' : 'academic_account',
                authenticated: result?.origin !== 'imported_records' && result?.authentication?.mode === 'live_session',
                ...(result?.authentication ? { authentication: result.authentication } : {}),
                refreshed: Boolean(result?.refreshed),
                snapshotAt: overviewSnapshotAt,
                domains,
                missingDomains: result?.missingScopes || [],
                incompleteDomains: result?.incompleteScopes || [],
                source: "Configured academic source",
              }),
            ),
          ),
          fetchedAt: overviewSnapshotAt,
          expiresAt: overviewSnapshotAt
            ? new Date(Date.parse(overviewSnapshotAt) + 300000).toISOString()
            : undefined,
          coverage: {
            complete: result?.status === 'ok',
            scope: args.includeSensitiveDomains ? 'all supported account domains' : 'supported non-sensitive account domains',
          },
          reason: result?.reason,
          simulated: false,
        };
      }
      const grant = sensitiveCampusGrant[args.domain as (typeof campusDomains)[number]];
      if (grant) policy.require(ctx.scope, grant);
      if (campusLookupReadsCourseGrades(args)) policy.require(ctx.scope, 'campus:grades:read');
      if (!['places', 'rules'].includes(args.domain)) {
        const wrapped = (await connections.campus!.read(
          {
            domain: args.domain as CampusDomain,
            query: args.query,
            courseId: args.courseId,
            academicYear: args.academicYear,
            term: args.term,
            from: args.from,
            to: args.to,
            at: args.at,
            timeMode: args.timeMode,
            fields: args.fields,
            filters: args.filters,
            sort: args.sort,
            offset: args.offset,
            bundleId: args.bundleId,
            expectedSnapshotVersion: args.expectedSnapshotVersion,
            window: args.window,
            limit: args.limit,
            refresh: args.refresh,
          },
          ctx.signal, { allowAcademicSync: ['campus:grades:read', 'campus:gpa:read', 'campus:profile:read'].every(grant => policy.can(ctx.scope, grant)) },
        )) as any;
        const result = wrapped?.data && typeof wrapped.data === 'object' ? wrapped.data : wrapped;
        const snapshotAt = sourceObservationAt(result);
        policy.validate(ctx.scope);
        if (result.status === 'navigate_required') return {
          status: 'partial', sourceId, data: {
            kind: 'navigation_required', domain: args.domain, recordRead: false,
            ...(typeof result.resource === 'string' ? { resource: result.resource } : {}),
            ...(typeof result.bundle_id === 'string' ? { bundleId: result.bundle_id } : {}),
            ...(typeof result.expectedSnapshotVersion === 'string' ? { expectedSnapshotVersion: result.expectedSnapshotVersion } : {}),
            ...(Number.isSafeInteger(result.offset) && result.offset >= 0 ? { offset: result.offset } : {}),
            ...(Number.isSafeInteger(result.total_matches) && result.total_matches >= 0 ? { total: result.total_matches } : {}),
            ...(result.authentication ? { authentication: result.authentication } : {}),
            ...(result.snapshotProof ? { snapshotProof: result.snapshotProof } : {}),
            ...(result.truncated_for_model === true ? { truncated_for_model: true } : {}),
            ...(result.nested_values_truncated === true ? { nested_values_truncated: true } : {}),
          }, fetchedAt: snapshotAt, coverage: { complete: false, scope: args.domain }, reason: result.reason, simulated: false,
        };
        const records = result.records || result.result || [];
        const truncated = { value: result.truncated_for_model === true };
        const deliveredRecords = (Array.isArray(records) ? records : [records])
          .map((record: any) => safeRecord(record, 0, truncated))
          .filter((record: any) => record && typeof record === 'object' && !Array.isArray(record));
        if (Array.isArray(records) && deliveredRecords.length !== records.length) truncated.value = true;
        const contentTruncated = truncated.value || result.nested_values_truncated === true;
        const delivery = campusPageDelivery(connections.campus!, { ...result, truncated_for_model: truncated.value }, args.offset || 0);
        const courseRecords = examCourseRecordsNavigation(connections.campus!, result);
        return {
          status: statusOf(contentTruncated && result.status === 'ok' ? { ...result, status: 'partial' } : result),
          sourceId,
          ...(delivery ? { delivery } : {}),
          data: {
            domain: args.domain,
            records: deliveredRecords,
            ...(result.policyMeanings ? { policyMeanings: result.policyMeanings } : {}),
            ...(truncated.value ? { truncated_for_model: true } : {}),
            ...(result.nested_values_truncated === true ? { nested_values_truncated: true } : {}),
            source: "Configured academic source",
            institutionId: connector.institutionId || 'unspecified',
            termId: String(result.semester_id || 'unspecified'),
            termIdMeaning: 'snapshot_collection_period' as const,
            recordSelection: result.recordSelection || { filters: args.filters || [], ...(args.sort ? { sort: args.sort } : {}),
              semester: (args.filters || []).some((filter: string) => filter.split(':')[0].trim() === 'semester_id')
                ? 'semester_predicate_provided' as const : 'no_semester_predicate' as const },
            ...(courseRecords ? { courseRecords } : {}),
            live: result.live === true && result.origin !== 'imported_records',
            origin: result.origin === 'imported_records' ? 'imported_records' : 'academic_account',
            authenticated: result.origin !== 'imported_records' && (result.authentication ? result.authentication.mode === 'live_session'
              : connector.authStatus === 'verified' || !!result.authenticated_at),
            ...(result.authentication ? { authentication: result.authentication } : {}),
            total: typeof result.total_matches === 'number' ? result.total_matches : undefined,
            cached: !args.refresh,
            snapshotAt,
            ...(typeof result.bundle_id === 'string' ? { bundleId: result.bundle_id } : {}),
            ...(result.next_offset !== undefined ? { nextOffset: result.next_offset } : {}),
            ...(Number.isSafeInteger(result.offset) && result.offset >= 0 ? { offset: result.offset } : {}),
            ...(typeof result.unknown_time_records === 'number' ? { unknownTimeRecords: result.unknown_time_records } : {}),
            ...(result.coverage ? { sourceCoverage: result.coverage } : {}),
            ...(result.time_interval ? { timeInterval: result.time_interval } : {}),
            ...(typeof result.evaluated_at === 'string' ? { evaluatedAt: result.evaluated_at } : {}),
            ...(result.snapshotProof ? { snapshotProof: result.snapshotProof } : {}),
            ...(result.snapshotProofs ? { snapshotProofs: result.snapshotProofs } : {}),
          },
          fetchedAt: snapshotAt,
          expiresAt:
            snapshotAt && Number.isFinite(Date.parse(snapshotAt))
              ? new Date(Date.parse(snapshotAt) + 300000).toISOString()
              : undefined,
          coverage: {
            complete: !contentTruncated && (result.coverage?.complete === true || result.completeness?.complete === true)
              && result.next_offset == null && (result.offset ?? args.offset ?? 0) === 0,
            scope: args.domain,
          },
          reason: result.reason || result.error?.message,
          simulated: false,
        };
      }
      const catalog = await connections.campus.query({ operation: 'resources', offset: 0, limit: 50, refresh: false }, ctx.signal);
      policy.validate(ctx.scope);
      return { status: 'unsupported', sourceId,
        data: { kind: 'capability_assessment', domain: args.domain, recordRead: false, requestedMeasures: [], catalog },
        coverage: { complete: false, scope: 'connector_catalog_only' }, simulated: false };
    },
  });
  // A legacy import remains available only for explicit offline migration. It
  // has a different source ID and is never selected when the account skill is
  // configured, so it cannot masquerade as a current ACADEMIC account result.
  register({
    manifest: manifest('campus-import', 'campus:local', [
      base('campus.imported_lookup', campusInput.extend({
        expectedSnapshotVersion: z.string().regex(/^[a-f0-9]{64}$/).optional().describe("Copy snapshotVersion from the original result to continue. Restart at the first page if the source or filter scope changes."),
      }), campusImportOutput, ['campus:read'], { version: '2', displayName: "Browse imported campus material", description: "Read class occurrences, exams, activity records, places or rules imported on this computer. Filter by date or text and continue using the original material revision. Provenance and save time accompany each result. Configured academic courses, grades and GPA can be read separately through campus.lookup or campus.query." }),
    ]),
    connectionStatus: () => ({ connected: !!repo.getMeta('campus_import_metadata'), reason: "This reads campus material imported on this computer. Configured academic collections have separate entries." }),
    invoke: async (_name, args, ctx) => {
      const metadata = repo.getMeta<{ institutionId: string; termId: string; source: string; updatedAt?: string }>(
        'campus_import_metadata',
      );
      if (!metadata)
        return {
          status: 'unsupported',
          sourceId: 'campus:local',
          reason: "No campus material has been imported on this computer. A configured academic source can be read with campus.lookup or campus.query; authorized institutional pages or export files can also be considered.",
          simulated: false,
        };
      const importedDomain = args.domain === 'practice' || args.domain === 'sports' ? 'sports' : args.domain;
      if (!['schedule', 'exams', 'sports', 'places', 'rules'].includes(importedDomain)) return {
        status: 'unsupported', sourceId: 'campus:local', simulated: false,
        coverage: { complete: false, scope: args.domain },
        reason: "This import format contains class occurrences, exams, activities, places and rules. Other academic records can be read through campus.lookup or campus.query when configured.",
      };
      const result = domains.resolve(ctx.scope, importedDomain, {
        institutionId: metadata.institutionId,
        termId: metadata.termId,
        from: args.from,
        to: args.to,
        query: args.query,
        limit: 6000,
      });
      const sourceLimitReached = result.records.length >= 6000;
      const snapshotVersion = createHash('sha256').update(JSON.stringify({
        metadata, domain: args.domain, from: args.from || null, to: args.to || null, query: args.query || null,
        records: result.records.map(record => ({ id: record.id, sourceId: record.sourceId, revision: record.revision,
          evidenceId: record.evidenceId, fetchedAt: record.fetchedAt, status: record.status })),
      })).digest('hex');
      const offset = args.offset || 0;
      if (args.expectedSnapshotVersion && args.expectedSnapshotVersion !== snapshotVersion || offset > 0 && !args.expectedSnapshotVersion)
        return { status: 'conflict', sourceId: 'campus:local', simulated: false,
          coverage: { complete: false, scope: args.domain },
          reason: args.expectedSnapshotVersion
            ? "The imported material or filter scope changed. Start again from the first page."
            : "The original material revision is missing. Obtain snapshotVersion on the first page and continue from its returned address." };
      let records = result.records;
      if (args.from)
        records = records.filter(
          (r) => !r.value.endsAt || Date.parse(String(r.value.endsAt)) > Date.parse(args.from),
        );
      if (args.to)
        records = records.filter(
          (r) => !r.value.startsAt || Date.parse(String(r.value.startsAt)) < Date.parse(args.to),
        );
      if (args.query) records = records.filter((r) => JSON.stringify(r.value).includes(args.query));
      const page = records.slice(offset, offset + args.limit), nextOffset = offset + page.length < records.length ? offset + page.length : null;
      const truncated = { value: false };
      const deliveredRecords = page.map(record => safeRecord(record.value, 0, truncated));
      const status = result.status === 'conflict' ? 'conflict' : records.length ? 'stale' : sourceLimitReached ? 'partial' : 'not_found';
      return {
        status,
        sourceId: 'campus:local',
        data: {
          domain: args.domain,
          records: deliveredRecords,
          materialVersions: page.map(record => ({ kind: 'domain', id: record.id, revision: record.revision, sourceId: record.sourceId,
            domain: record.domain, institutionId: record.institutionId, termId: record.termId })),
          conflicts: result.conflicts.map((g) => ({ id: g[0].id, sources: g.map((r) => r.sourceId) })),
          source: metadata.source,
          institutionId: metadata.institutionId,
          termId: metadata.termId,
          live: false,
          origin: 'legacy_import',
          authenticated: false,
          total: records.length,
          totalMeaning: sourceLimitReached ? 'matching_records_within_source_limit' : 'matching_retained_records',
          offset, nextOffset, snapshotVersion,
          ...(nextOffset !== null ? { continuation: { tool: 'look_up', arguments: { source: 'capability', capability: 'campus.imported_lookup',
            arguments: { domain: args.domain, ...(args.from ? { from: args.from } : {}), ...(args.to ? { to: args.to } : {}),
              ...(args.query ? { query: args.query } : {}), offset: nextOffset, limit: args.limit, expectedSnapshotVersion: snapshotVersion, refresh: false } } } } : {}),
          sourceRead: { limit: 6000, returned: result.records.length, limitReached: sourceLimitReached,
            meaning: sourceLimitReached
              ? "Up to 6000 saved items were obtained. total counts matches within that batch. Continue within it, or narrow the date or text scope to reach other records."
              : "total counts saved records matching this filter; this page opens one portion. Source save times accompany the result. Check the configured academic source for later changes." },
          ...(truncated.value ? { truncated_for_model: true } : {}),
          cached: true,
          snapshotAt: metadata.updatedAt,
        },
        fetchedAt: metadata.updatedAt || records[0]?.fetchedAt,
        coverage: { complete: !sourceLimitReached && !truncated.value && offset === 0 && nextOffset === null, scope: args.domain },
        reason: "These are offline imported campus records with their save times. Configured academic collections have separate reading entries.",
        simulated: false,
      };
    },
  });
  const place = z.object({ kind: z.enum(['place', 'node']), id: z.string().min(1).max(100) }).strict();
  const routeInput = z
    .object({
      from: z.union([place, z.object({ kind: z.literal('current') }).strict()]).optional(),
      to: place.optional(),
      avoidStairs: z.boolean().optional(),
      allowConditional: z.boolean().optional(),
      version: z.string().optional(),
    })
    .strict();
  register({
    manifest: manifest('spatial', 'map:local', [
      base('map.overview', z.object({}).strict(), jsonObject, ['map:read'], {
        subjects: ['self', 'other', 'fictional'],
        displayName: "Look at the campus map", description: "Read the current public map's area, data revision and place categories, then find particular places with map.search.",
      }),
      base(
        'map.search',
        z
          .object({ query: z.string().min(1).max(100), limit: z.number().int().min(1).max(10).default(5) })
          .strict(),
        z.object({ matches: z.array(jsonObject) }).strict(),
        ['map:read'],
        { version: '4', subjects: ['self', 'other', 'fictional'], displayName: "Find a place on the map", description: "Search ordinary names, registered aliases or categories, optionally within the current map bounds. Results preserve places, entrances, access conditions and original source addresses. Water or area results may list nearby independently named points connected to the road graph. Choose an explicit candidate for map.route, then adjust for the user's actual destination." },
      ),
      base('map.route', routeInput, jsonObject, ['map:read'], { subjects: ['self', 'other', 'fictional'], displayName: "Look at a route", description: "Calculate a route between discovered places or network nodes, preserving original endpoints, direction and entrance conditions. Distinguish recorded roads, estimated access and segment distances. Explain differences affecting the intended destination, travel time or entrance choice, with detailed figures available when needed. Follow candidate entrances if access is missing." }),
      base('map.location_status', z.object({}).strict(), jsonObject, ['map:read'], { displayName: "Inspect the map's location state", description: "Read the public map's retained location state and reason. For a specific starting point, find a place or use the location the user explicitly supplied." }),
    ]),
    connectionStatus: () => ({ connected: !!connections.map && connections.map.overview().version !== 'unavailable', reason: connections.map ? undefined : "Map data is not assembled yet." }),
    invoke: (name, args) => {
      if (!connections.map)
        return {
          status: 'unsupported',
          sourceId: 'map:local',
          reason: "Map data is not assembled yet.",
          simulated: false,
        };
      const publicMap=connections.map.publicView?.() || connections.map;
      const value =
        name === 'map.overview'
          ? publicMap.overview()
          : name === 'map.search'
            ? { matches: publicMap.search(args.query, args.limit).map(point => {
              const nearby = publicMap.nearbyWalkablePlaces(point.id);
              return { ...projectWalkingSearchPoint(point), ...(nearby.length ? { nearbyWalkablePlaces: nearby.map(candidate => ({
                ...candidate, point: projectWalkingSearchPoint(candidate.point),
                meaning: "This is a nearby independently named point with its own source. The displayed distance is a straight line between reference points. A bridge name comes from recorded road data. Selecting this point creates a new endpoint; map.route calculates walking distance.",
              })) } : {}) };
            }) }
            : name === 'map.route'
              ? publicMap.route(args)
              : publicMap.locationStatus();
      const v = value as any,
        status: KnowledgeStatus =
          name === 'map.route' && v.status === 'ready' && (v.distance?.connectorM>0 || v.segments?.some((s:any)=>s.conditions?.length)) ? 'partial' : name === 'map.route' && v.status !== 'ready' && v.status !== 'ok' && v.status !== 'success'
            ? Array.isArray(v.conditionalOrigins) && v.conditionalOrigins.length ? 'partial' : 'unknown'
            : name === 'map.location_status'
              ? 'unknown'
              : 'fresh';
      return {
        status,
        sourceId: 'map:local',
        data: JSON.parse(JSON.stringify(value)),
        fetchedAt: repo.clock.now(),
        coverage: {
          complete: name !== 'map.route' || status === 'fresh',
          scope: 'Shared public ground facts, recorded entrances and explicitly estimated access',
        },
        reason: name === 'map.route' && status === 'partial' ? v.status==='ready'
          ? v.routeBasis === 'recorded_network_with_estimates' && !v.segments?.some((segment: any) => segment.conditions?.length)
            ? `The recorded road segment is calculated. This route includes access estimates; about ${Math.round(v.distance?.connectorM || 0)} meters across both ends are estimated access. Entrances, interiors and current passage conditions need separate confirmation.`
            : v.reason
          : "The connection from the original start to the road graph is missing. Roads between candidate entrances can still be inspected to choose a starting entrance." : v.reason,
        simulated: false,
      };
    },
  });
  register({
    manifest: manifest('weather', 'weather:open-meteo', [
      base('weather.lookup', weatherInput, weatherOutput, ['weather:read'], {
        version: '6', displayName: "Look at the weather for that time", description: "Read forecasts for a public reference within the next seven local dates. date selects a day; from/to selects hours. Preserve the source forecast, local time zone, retrieval time and missing values. Daily statistics report their actual aggregation window. Use hourly data for particular hours. Facility opening conditions need their own source.",
      }),
      base('air_quality.lookup', airQualityInput, airQualityOutput, ['weather:read'], {
        version: '2', displayName: "Look at the air-quality forecast", description: "Read PM2.5, PM10, US AQI and European AQI forecasts for a public reference. Default to the next 24 hours, or choose a window within the next five local dates. Preserve reference location, time window and index scales for discussion alongside actual conditions.",
      }),
    ], ['api.open-meteo.com', 'air-quality-api.open-meteo.com']),
    connectionStatus: () => ({ connected: connections.weatherEnabled(), reason: connections.weatherEnabled() ? undefined : "Weather queries are disabled. Enable them in Connections and preferences." }),
    invoke: async (name, args, ctx) => {
      if (!connections.weatherEnabled()) return { status: 'forbidden', sourceId: 'weather:open-meteo', reason: "Weather queries are disabled. Enable them in Connections and preferences, then continue with the same location and period.", simulated: false };
      if (name === 'air_quality.lookup') {
        const query = airQualityRequest(args, repo.clock.now()), response = await ctx.request(query.url.toString());
        if (!response.ok) throw new HarnessError('air_quality_failed', `The air-quality source returned no forecast (HTTP ${response.status}). Retry the same location and period later.`);
        const now = repo.clock.now(), result = airQualityResult(query, await response.json(), now);
        return { status: result.complete ? 'fresh' : 'partial', sourceId: 'weather:open-meteo', data: result.data,
          fetchedAt: now, expiresAt: new Date(Date.parse(now) + 1800000).toISOString(), simulated: false,
          coverage: { complete: result.complete, scope: 'Public-reference CAMS forecast; US and European indices only', until: query.to },
          ...(result.complete ? {} : { reason: "Some hours are missing. Available hourly values remain in the result. Use that partial coverage or try a shorter period." }) };
      }
      const query = weatherRequest(args, repo.clock.now()), response = await ctx.request(query.url.toString());
      if (!response.ok) throw new HarnessError('weather_failed', `The weather source returned no forecast (HTTP ${response.status}). Retry the same location and period later.`);
      const observedAt = repo.clock.now(), result = weatherResult(query, await response.json(), observedAt);
      return { status: result.complete ? 'fresh' : 'partial', sourceId: 'weather:open-meteo', data: result.data,
        fetchedAt: observedAt, expiresAt: new Date(Math.min(Date.parse(observedAt) + 1800000, Date.parse(dayBounds(dateInZone(observedAt, query.location.timeZone), query.location.timeZone).to))).toISOString(),
        coverage: { complete: result.complete, scope: `${query.location.label}; ${query.from} to ${query.to}; ${query.hourly ? 'hourly' : 'daily'} forecast`, until: query.to }, simulated: false,
        ...(result.complete ? {} : { reason: "This forecast has missing values or misaligned time windows, retained in its details. Use hourly data for changes over particular hours." }) };
    },
  });
  register({
    manifest: manifest('evidence', 'history:self', [
      base(
        'evidence.search',
        z.object({ query: z.string().min(1).max(100) }).strict(),
        z.object({ results: z.array(jsonObject) }).strict(),
        ['evidence:read'],
        { displayName: "Find the original words", description: "Search saved original statements by text, returning exact words, context, revision and time. Later corrections and retired uses remain explained so the original conditions can inform the conversation." },
      ),
    ]),
    invoke: (_name, args, ctx) => ({
      status: 'fresh',
      sourceId: 'history:self',
      data: {
        results: repo.searchEvidence(ctx.scope, args.query).map((e) => ({
          id: e.id,
          text: e.text,
          sourceId: e.sourceId,
          contentVersion: e.contentVersion,
          receivedAt: e.receivedAt,
          authority: e.authority,
          use: repo.sourceRestrictions(ctx.scope, e.id).length ? 'historical_only' : 'source_evidence',
          restrictions: repo.sourceRestrictions(ctx.scope, e.id),
        })),
      },
      fetchedAt: repo.clock.now(),
      simulated: false,
    }),
  });
}
