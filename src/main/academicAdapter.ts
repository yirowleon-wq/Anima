import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import * as z from 'zod';
import type { Store } from './store';
import { campusResources, normalizedRoots, validateCampusQuery, type CampusQuery } from './capabilities/campus-query';
import type { CampusSnapshotProof } from './capabilities/campus-saved-source';
import { HarnessError, type CampusSavedReadingProof } from '../shared/harness';
import { canonical, dateInZone, dayBounds, addDate } from './runtime/semantics';
import { selectCampusRows } from './integrations/campus-data';

/** Stable owner identity; a local source does not imply a university login. */
export const CAMPUS_ACCOUNT_SOURCE_ID = 'campus:academic-account';
export type CampusAuthStatus = 'needs_login' | 'credentials_saved' | 'verified' | 'failed';
export type CampusDomain = 'schedule' | 'courses' | 'learning_courses' | 'exams' | 'assignments' | 'grades' | 'gpa'
  | 'gpa_semesters' | 'gpa_cumulative' | 'retakes' | 'practice' | 'sports' | 'projects' | 'activities'
  | 'reservations' | 'reservation_violations' | 'card' | 'transactions' | 'profile' | 'roles'
  | 'calendar_pending' | 'cancelled_classes' | 'holidays' | 'source_status';
export type CampusRefreshScope = 'academic' | 'domain';
export interface CampusReadArgs {
  domain: CampusDomain; query?: string; courseId?: string; academicYear?: string; term?: string;
  window?: string; from?: string; to?: string; at?: string; timeMode?: 'overlap' | 'starts' | 'contained';
  fields?: string[]; filters?: string[]; sort?: string; limit?: number; offset?: number; bundleId?: string;
  expectedSnapshotVersion?: string; refresh?: boolean;
}
export interface CampusRefreshArgs { scope: CampusRefreshScope; domain?: CampusDomain; academicYear?: string; term?: string }
export interface CampusConnectorState {
  configured: boolean; available: boolean; label: string; sourceKind?: 'academic_account' | 'imported_records' | 'provider';
  authStatus?: CampusAuthStatus; lastVerifiedAt?: string; catalogued?: number; verified?: number; blocked?: number;
  /** Compatibility admission: an imported source needs no network credential. */
  credentialsConfigured?: boolean; reason?: string;
  timeZone?: string; institutionId?: string; selection?: { academicYear?: string; term?: string };
}
export interface CampusFullContextArgs { refresh?: boolean; includeSensitiveDomains?: boolean; academicYear?: string; term?: string }
export interface CampusAcquisition { allowAcademicSync: boolean }
export interface CampusAuthentication {
  mode: 'saved_snapshot' | 'live_session'; accountBinding: 'current_local_account' | 'not_established';
  ssoCheck: 'not_performed' | 'performed' | 'reused'; verifiedAt?: string; lastSsoVerifiedAt?: string;
}
const domainResource: Record<CampusDomain, string> = {
  schedule: 'classes', courses: 'courses', learning_courses: 'learning_courses', exams: 'exams', assignments: 'todos',
  grades: 'grades', gpa: 'gpa_overall', gpa_semesters: 'gpa_semesters', gpa_cumulative: 'gpa_cumulative', retakes: 'retakes',
  practice: 'practice_summary', sports: 'sports', projects: 'projects', activities: 'activities', reservations: 'reservations',
  reservation_violations: 'reservation_violations', card: 'card_accounts', transactions: 'transactions', profile: 'student_profile',
  roles: 'roles', calendar_pending: 'calendar_pending', cancelled_classes: 'cancelled_classes', holidays: 'holidays', source_status: 'source_status',
};
const sensitiveDomains = new Set<CampusDomain>(['grades', 'gpa', 'gpa_semesters', 'gpa_cumulative', 'retakes', 'reservations',
  'reservation_violations', 'card', 'transactions', 'profile', 'roles']);
const summaryFields: Partial<Record<CampusDomain, string[]>> = {
  schedule: ['uid', 'summary', 'startTime', 'endTime', 'location', 'teacher', 'time_precision'],
  courses: ['key', 'name', 'semester_id', 'credit', 'teachers', 'confirmed', 'online'],
  learning_courses: ['id', 'name', 'course_code', 'credit', 'semester_id', 'start_date', 'end_date', 'study_completeness'],
  exams: ['id', 'name', 'semester_id', 'credit', 'type', 'startTime', 'endTime', 'dateLabel', 'location', 'seat', 'time_precision'],
  grades: ['id', 'name', 'course_code', 'repeat_group', 'semester_id', 'credit', 'original', 'fourPoint', 'gpaIncluded', 'gpa_exclusion_reason', 'grading_policy', 'quality_issues'],
};
export const campusSummaryFields = (domain: CampusDomain) => summaryFields[domain]?.slice();
export function campusGradeLookupFilters(filters: readonly string[] | undefined, query?: string) {
  return [...new Set([...(filters || []), ...(query?.trim() ? [`name:contains:${query.trim()}`] : [])])];
}
export function campusAcademicAcquisition(capability: string, input: unknown) {
  if (!input || typeof input !== 'object' || !(input as { refresh?: boolean }).refresh || !capability.startsWith('campus.')) return;
  return { operation: 'reload_explicit_local_source', collectedSources: ['configured_campus_data_file'],
    meaning: 'Reload only the file explicitly chosen for this campus source. This is local acquisition, not an authenticated university query.' };
}
export const campusDataSchema = z.object({
  schemaVersion: z.literal('anima-campus-data/v1'), institutionId: z.string().min(1).max(100),
  termId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/),
  academicYear: z.string().regex(/^\d{4}-\d{4}$/).optional(),
  timeZone: z.string().max(100).refine(value => { try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true; } catch { return false; } }),
  source: z.string().min(1).max(500), fetchedAt: z.iso.datetime({ offset: true }), complete: z.boolean().default(false),
  coverage: z.record(z.string(), z.object({ complete: z.boolean(), from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional(), note: z.string().max(2000).optional() }).strict()).default({}),
  resources: z.record(z.string(), z.array(z.record(z.string(), z.json())).max(100000)),
  gradingPolicy: z.object({ id: z.string().min(1).max(100), source: z.string().max(500), scaleMax: z.number().positive().max(100),
    gradePoints: z.record(z.string(), z.number()).optional(), excluded: z.array(z.string()).default([]),
    repeatPolicy: z.enum(['source_explicit', 'all_attempts_analysis']).default('source_explicit') }).strict().superRefine((policy,context)=>{
      for(const [grade,points] of Object.entries(policy.gradePoints||{}))if(points<0||points>policy.scaleMax)
        context.addIssue({code:'custom',path:['gradePoints',grade],message:'Grade points must be within the declared scale.'});
    }).optional(),
  scheduleQuality: z.object({ generatedAllResolvableRules: z.boolean(), unresolvedRuleCount: z.number().int().nonnegative(),
    calendarOfficiallyCrosschecked: z.boolean().default(false), allFutureDatesFinal: z.boolean().default(false) }).strict().optional(),
}).strict();
export type CampusDataDocument = z.infer<typeof campusDataSchema>;
interface SavedSnapshot { id: string; sha256: string; identity: string; importedAt: string; document: CampusDataDocument; rawBase64: string }
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const authentication: CampusAuthentication = { mode: 'saved_snapshot', accountBinding: 'not_established', ssoCheck: 'not_performed' };
const privateField = /^(?:password|passwd|secret|token|ticket|cookie|authorization|credentials?|raw_response|body_b64|email|phone|mobile|account|student_?(?:id|number|name)|card_?(?:id|number)|identity_?(?:id|number)|birth_?date|address)$/i;
function safeProjection(value: unknown, resource?: string): any {
  if (Array.isArray(value)) return value.map(item=>safeProjection(item,resource));
  if (value && typeof value === 'object') {
    const declared=(value as Record<string,unknown>).resource;
    if(typeof declared==='string')resource=declared;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !privateField.test(key)
    && !(resource==='student_profile'&&/^(?:name|id|birth|birthday|dateOfBirth)$/i.test(key))
    && !(resource==='card_accounts'&&/^(?:id|number|name)$/i.test(key))).map(([key, item]) => [key, safeProjection(item,resource)]));
  }
  return value;
}
function resourceRows(document: CampusDataDocument, resource: string): Record<string, any>[] | undefined {
  if (resource === 'source_status') return Object.entries(document.resources).map(([name, rows]) => ({ resource: name, records: rows.length,
    complete: document.coverage[name]?.complete ?? document.complete, source: document.source, fetched_at: document.fetchedAt, origin: 'imported_records' }));
  if (resource !== 'grades' && document.resources[resource]) return document.resources[resource].map(row => ({ ...row }));
  if (!['grades', 'gpa_overall', 'gpa_semesters', 'gpa_cumulative', 'retakes'].includes(resource)) return;
  const grades = document.resources.grades?.map((row, index): Record<string, any> => {
    const original = typeof row.original === 'string' ? row.original : typeof row.grade === 'string' ? row.grade : null;
    const policy = document.gradingPolicy, excluded = !!original && policy?.excluded.includes(original) === true;
    const suppliedPoints = typeof row.points === 'number' ? row.points : typeof row.fourPoint === 'number' ? row.fourPoint
      : original && policy?.gradePoints ? policy.gradePoints[original] ?? null : null;
    const outOfScale=typeof suppliedPoints==='number'&&!!policy&&(suppliedPoints<0||suppliedPoints>policy.scaleMax),points=outOfScale?null:suppliedPoints;
    const units = typeof row.units === 'number' ? row.units : typeof row.credit === 'number' ? row.credit : null;
    const included = typeof row.gpaIncluded === 'boolean' ? row.gpaIncluded : !excluded && policy?.repeatPolicy === 'all_attempts_analysis' ? true : null;
    return { ...row, id: typeof row.id === 'string' ? row.id : `imported-grade:${index}`, name: row.name ?? row.course_name,
      semester_id: row.semester_id ?? row.termId ?? document.termId, credit: units, original, points,
      fourPoint: policy?.scaleMax === 4 ? points : typeof row.fourPoint === 'number' ? row.fourPoint : null,
      grading_policy: policy?.id ?? row.grading_policy ?? null, gpaIncluded: excluded ? false : included,
      gpa_exclusion_reason: excluded ? 'This grade symbol is excluded by the selected policy.' : row.gpa_exclusion_reason,
      quality_issues: [...(Array.isArray(row.quality_issues) ? row.quality_issues : []), ...(included === null && !excluded ? ['GPA inclusion or repeat treatment is not supplied by the source.'] : []),
        ...(outOfScale?['The source grade points are outside the declared scale; the normalized value remains unknown.']:[])] };
  });
  if (!grades) return;
  if (resource === 'grades') return grades;
  if (resource === 'retakes') {
    const groups = new Map<string, typeof grades>();
    for (const grade of grades) { const key = String(grade.repeat_group ?? grade.course_code ?? grade.id); groups.set(key, [...(groups.get(key) || []), grade]); }
    return [...groups].filter(([, attempts]) => attempts.length > 1).map(([course_group, attempts]) => ({ course_group, attempt_ids: attempts.map(row => row.id),
      policy: document.gradingPolicy?.repeatPolicy || 'source_explicit', chronology_quality: 'Imported source order; actual chronology requires explicit term dates.' }));
  }
  const aggregate = (rows: typeof grades, fields: Record<string, unknown>) => {
    const eligible = rows.filter(row => row.gpaIncluded === true), counted = eligible.filter(row => typeof row.points === 'number' && typeof row.credit === 'number' && row.credit > 0);
    const incomplete = rows.filter(row => row.gpaIncluded === null || row.gpaIncluded === true && (row.points === null || row.credit === null));
    const denominator = counted.reduce((sum, row) => sum + row.credit, 0), weighted = counted.reduce((sum, row) => sum + row.points * row.credit, 0);
    return { ...fields, policy: document.gradingPolicy?.repeatPolicy || 'source_explicit',
      gpa: { fourPoint: document.gradingPolicy?.scaleMax === 4 && denominator > 0 ? weighted / denominator : null },
      gpa_credit_denominator: denominator, eligible_attempts: eligible.length, counted_attempts: counted.length,
      excluded_attempts: rows.filter(row => row.gpaIncluded === false).map(row => ({ id: row.id, reason: row.gpa_exclusion_reason || 'Source marked this attempt excluded.' })),
      incomplete_attempts: incomplete.map(row => row.id), zero_credit_attempts: rows.filter(row => row.credit === 0).map(row => row.id),
      complete: (document.coverage.grades?.complete ?? document.complete) && incomplete.length === 0,
      source_complete: document.coverage.grades?.complete ?? document.complete,
      formula: 'sum(source grade points per unit × source units) / sum(included positive units); unknown inclusion is not zero',
      officialUniversityCalculation: false, grading_policy: document.gradingPolicy?.id ?? null };
  };
  if (resource === 'gpa_overall') return [aggregate(grades, {})];
  const terms = [...new Set(grades.map(row => String(row.semester_id)))];
  if (resource === 'gpa_semesters') return terms.map(semester_id => aggregate(grades.filter(row => row.semester_id === semester_id), { semester_id }));
  // Cumulative order comes from explicit source values, never lexical term IDs.
  if(grades.length&&terms.some(term=>typeof document.resources.terms?.find(row=>row.id===term)?.order!=='number'))return;
  return terms.flatMap(term => { const order = document.resources.terms?.find(row => row.id === term)?.order;
    if (typeof order !== 'number') return [];
    const includedTerms = new Set(document.resources.terms!.filter(row => typeof row.order === 'number' && row.order <= order).map(row => row.id));
    return [aggregate(grades.filter(row => includedTerms.has(row.semester_id)), { through_semester: term })]; });
}

/** Explicit file acquisition and immutable source snapshots belong to this owner.
 * No external skill discovery, university request or location service runs here. */
export class AcademicAdapter {
  private issued = new Map<string, CampusSnapshotProof>();
  private groups = new Map<string, CampusSnapshotProof[]>();
  constructor(private store: Store) {}
  private snapshots() { return this.store.meta<SavedSnapshot[]>('campus_data_snapshots', []); }
  private head(): SavedSnapshot | undefined { if (this.store.meta('campus_data_disabled', false)) return;
    return this.snapshots().find(snapshot => snapshot.id === this.store.meta<string | null>('campus_data_head', null)); }
  private load(file: string): SavedSnapshot {
    const selected = path.resolve(file), actual = statSync(selected).isDirectory() ? path.join(selected, 'campus-data.json') : selected;
    const raw = readFileSync(actual); if (raw.byteLength > 32 * 1024 * 1024) throw new HarnessError('campus_import_size', 'Choose a campus data file smaller than 32 MiB.');
    const document = campusDataSchema.parse(JSON.parse(raw.toString('utf8')));
    for (const resource of Object.keys(document.resources)) if (![...campusResources, 'learning_courses', 'sports', 'terms'].includes(resource as any)) throw new HarnessError('campus_resource', `Unknown campus resource: ${resource}.`);
    const sha256 = createHash('sha256').update(raw).digest('hex'), identity = digest({ source: document.source, institutionId: document.institutionId, selected: actual });
    const snapshot = { id: digest({ sha256, identity }).slice(0, 32), sha256, identity, importedAt: new Date().toISOString(), document, rawBase64: raw.toString('base64') }, previous = this.snapshots();
    const unchanged = previous.find(item => item.id === snapshot.id && item.identity === identity);
    this.store.putMeta('campus_data_snapshots', unchanged ? previous.map(item=>item.id===snapshot.id&&item.identity===identity?{...item,rawBase64:snapshot.rawBase64}:item) : [...previous, snapshot]); this.store.putMeta('campus_data_head', snapshot.id);
    this.store.putMeta('campus_data_source_file', actual); this.store.putMeta('campus_data_disabled', false); this.issued.clear(); this.groups.clear(); return unchanged || snapshot;
  }
  configure(file: string) { this.load(file); return this.describe(); }
  connectInstalled() { const file = this.store.meta<string | null>('campus_data_source_file', null) || process.env.ANIMA_CAMPUS_DATA;
    if (!file) throw new HarnessError('campus_not_configured', 'Choose a campus data JSON file in Connections. No university provider is configured.');
    this.load(file); return this.describe(); }
  disconnect() { this.store.putMeta('campus_data_disabled', true); this.issued.clear(); this.groups.clear(); }
  describe(): CampusConnectorState { const head = this.head(); return { configured: !!head, available: !!head,
    label: head ? `${head.document.institutionId} · imported campus records` : 'Campus data', sourceKind: 'imported_records', credentialsConfigured: !!head,
    authStatus: head ? 'verified' : 'needs_login', ...(head ? { lastVerifiedAt: head.importedAt, catalogued: Object.keys(head.document.resources).length,
      timeZone: head.document.timeZone, institutionId: head.document.institutionId,
      selection: { academicYear: head.document.academicYear, term: head.document.termId } } : {}),
    reason: head ? 'Local file import; no university account or live service is connected.' : 'Import a campus data JSON file. No university account or live service is connected.' }; }
  async configureCredentials() { throw new HarnessError('campus_credentials_not_used', 'Local campus data uses an explicit file import and does not request account credentials.'); }
  async forgetCredentials(_signal?: AbortSignal) { this.disconnect(); return { status: 'ok', note: 'The local source is disconnected. No account credentials were stored.' }; }
  async verifyAccount(signal = new AbortController().signal) { signal.throwIfAborted(); return { status: this.head() ? 'ok' : 'unavailable', connector: this.describe(), authentication: 'imported_records', note: 'Only the local source was checked; no university sign-in was attempted.' }; }
  private selected(bundleId?: string, expectedVersion?: string, resource?: string): SavedSnapshot | undefined {
    const head = this.head(); if (!head) return;
    const snapshot = bundleId ? this.snapshots().find(item => item.id === bundleId && item.identity === head.identity) : head;
    if (!snapshot) throw new HarnessError('campus_snapshot_unavailable', 'The requested snapshot is no longer available from this source.');
    if (expectedVersion && resource && this.version(snapshot, resource) !== expectedVersion) throw new HarnessError('campus_snapshot_changed', 'This snapshot does not match the requested version. Return to the current source.');
    return snapshot;
  }
  private version(snapshot: SavedSnapshot, resource: string) { return digest({ bundleId: snapshot.id, resource, bundle: snapshot.sha256, content: digest(snapshot.document) }); }
  private resourceAddress(snapshot: SavedSnapshot, resource: string) { return `${Object.hasOwn(snapshot.document.resources,resource)?'/resources':'/derived'}/${resource}`; }
  private proof(snapshot: SavedSnapshot, resource: string): CampusSnapshotProof {
    const value: CampusSnapshotProof = { sourceId: CAMPUS_ACCOUNT_SOURCE_ID, bundleId: snapshot.id, resource, version: this.version(snapshot, resource),
      selection: this.head()?.id === snapshot.id ? 'saved_head' : 'historical', collectedAt: snapshot.document.fetchedAt, sourceFetchedAt: { [resource]: snapshot.document.fetchedAt },
      coverage: { complete: snapshot.document.coverage[resource]?.complete ?? snapshot.document.complete, origin: 'imported_records', live: false },
      original: { bundleId: snapshot.id, pointer: this.resourceAddress(snapshot,resource) } };
    this.issued.set(digest(value), structuredClone(value)); return value;
  }
  captureReadingProof(proof: CampusSnapshotProof): CampusSavedReadingProof | undefined { const head = this.head(), snapshot = this.snapshots().find(item => item.id === proof.bundleId);
    if (!head || !snapshot || snapshot.identity !== head.identity || !this.issued.has(digest(proof)) || this.version(snapshot, proof.resource) !== proof.version) return;
    return { sourceId: CAMPUS_ACCOUNT_SOURCE_ID, bundleId: snapshot.id, resource: proof.resource, version: proof.version, sourceIdentity: head.identity,
      headIdentity: digest({ identity: head.identity, head: head.id }), selection: proof.selection, collectedAt: proof.collectedAt }; }
  readingState(proof: CampusSavedReadingProof): 'same_saved_head' | 'historical_snapshot' | 'unavailable' { const head = this.head(), snapshot = this.snapshots().find(item => item.id === proof.bundleId);
    if (!head || !snapshot || proof.sourceId !== CAMPUS_ACCOUNT_SOURCE_ID || proof.sourceIdentity !== head.identity || snapshot.identity !== head.identity || this.version(snapshot, proof.resource) !== proof.version) return 'unavailable';
    return proof.selection === 'saved_head' && head.id === snapshot.id && proof.headIdentity === digest({ identity: head.identity, head: head.id }) ? 'same_saved_head' : 'historical_snapshot'; }
  readingResource(domain: string) { return domainResource[domain as CampusDomain]; }
  isCurrentSnapshot(proof: CampusSnapshotProof) { const reading = this.captureReadingProof(proof); return !!reading && this.readingState(reading) === 'same_saved_head'; }
  isCurrentSnapshotVersion(version: string) { const group = this.groups.get(version); return group ? group.every(proof => this.isCurrentSnapshot(proof)) : [...this.issued.values()].some(proof => proof.version === version && this.isCurrentSnapshot(proof)); }
  bindPlanningSnapshots(proofs: CampusSnapshotProof[]) { if (!proofs.length || proofs.some(proof => !this.isCurrentSnapshot(proof))) return;
    const version = digest(proofs.map(proof => ({ resource: proof.resource, version: proof.version }))); this.groups.set(version, structuredClone(proofs)); return version; }
  savedSnapshotRevision() { const head = this.head(); return head ? digest({ id: head.id, identity: head.identity }) : null; }
  async readPlanningQuality(proof: CampusSnapshotProof, signal: AbortSignal) { signal.throwIfAborted();
    if (proof.resource !== 'classes' || !this.isCurrentSnapshot(proof)) throw new HarnessError('planning_campus_changed', 'The saved schedule changed. Read its current version before planning.');
    const quality = this.head()?.document.scheduleQuality; return quality ? { status: 'ok' as const, ...quality } : { status: 'unavailable' as const }; }
  async capabilities(signal: AbortSignal) { signal.throwIfAborted(); const head = this.head(); return { status: head ? 'ok' : 'unavailable', connector: this.describe(), resources: head ? Object.keys(head.document.resources) : [], note: 'A directory is navigation, not a reading of its records.' }; }
  async query(raw: CampusQuery, signal: AbortSignal, acquisition?: CampusAcquisition): Promise<any> {
    signal.throwIfAborted(); const args = validateCampusQuery(raw);
    if (args.refresh) { if (!acquisition?.allowAcademicSync) throw new HarnessError('campus_acquisition_required', 'Reloading campus data requires current source acquisition permission.'); this.connectInstalled(); signal.throwIfAborted(); }
    const resource = args.resource || args.spec?.resource || 'source_status', snapshot = this.selected(args.bundleId, args.expectedSnapshotVersion, resource);
    if (!snapshot) return { status: 'unavailable', recordRead: false, connector: this.describe(), reason: this.describe().reason };
    const document = snapshot.document;
    if (args.term !== undefined && args.term !== document.termId || args.academicYear !== undefined && args.academicYear !== document.academicYear)
      return { status: 'unavailable', recordRead: false, reason: 'The selected collection period does not match this imported source. Choose the source’s exact term and academic year.' };
    const meta = { bundle_id: snapshot.id, fetched_at: document.fetchedAt, semester_id: document.termId, authentication, origin: 'imported_records', live: false, read_only: true };
    if (args.operation === 'resources') return { status: 'ok', ...meta, recordRead: false, resources: [...new Set([...Object.keys(document.resources), 'source_status'])].map(name => ({ resource: name, model: name, count: document.resources[name]?.length,
      original: { bundleId: snapshot.id, pointer: `/resources/${name}` }, complete: document.coverage[name]?.complete ?? document.complete })), meaning: 'Imported source addresses; no record body or live service was read.' };
    if (args.operation === 'schema') { const model = args.model || resource, rows = resourceRows(document, model);
      return rows ? { status: 'ok', ...meta, recordRead: false, resource: model, model, fields: [...new Set(rows.flatMap(row => Object.keys(row)))], meaning: 'Fields in this source; unknown values remain unknown.' }
        : { status: 'unavailable', ...meta, recordRead: false, reason: 'This source does not contain that resource.' }; }
    if (args.operation === 'history') { const items = this.snapshots().filter(item => item.identity === snapshot.identity && resourceRows(item.document, resource) !== undefined).reverse();
      return { status: 'ok', ...meta, recordRead: false, items: items.slice(args.offset, args.offset + args.limit).map(item => ({ bundle_id: item.id, collected_at: item.document.fetchedAt, imported_at: item.importedAt, semester_id: item.document.termId, kind: 'imported_records' })),
        total: items.length, next_offset: args.offset + args.limit < items.length ? args.offset + args.limit : null }; }
    if (args.operation === 'diff') { if (!args.fromBundle || !args.toBundle) throw new HarnessError('campus_diff_sources', 'Choose both saved snapshot IDs before comparing changes.');
      const before = this.selected(args.fromBundle)!, after = this.selected(args.toBundle)!, left = resourceRows(before.document, resource), right = resourceRows(after.document, resource);
      if (!left || !right) return { status: 'unavailable', ...meta, recordRead: false, reason: 'One snapshot lacks this resource; absence is not an empty result.' };
      const key = (row: Record<string, unknown>, index: number) => String(row.id ?? row.uid ?? row.key ?? `source-order:${index}`), a = new Map(left.map((row, i) => [key(row, i), row])), b = new Map(right.map((row, i) => [key(row, i), row]));
      const changes = [...new Set([...a.keys(), ...b.keys()])].flatMap(id => digest(a.get(id) ?? null) === digest(b.get(id) ?? null) ? [] : [{ id, operation: !a.has(id) ? 'added' : !b.has(id) ? 'removed' : 'changed', before: a.get(id) ?? null, after: b.get(id) ?? null }]);
      return { status: 'ok', ...meta, recordRead: true, resource, changes: safeProjection(changes.slice(args.offset, args.offset + args.limit),resource), total: changes.length,
        next_offset: args.offset + args.limit < changes.length ? args.offset + args.limit : null, observed_change_not_publication_time: true, note: 'Changes between imported observations, not publication time.' }; }
    const all = resourceRows(document, resource); if (!all) return { status: 'unavailable', ...meta, resource, recordRead: false, reason: 'The source does not contain this resource. This does not establish that there are no records.' };
    const involved=[...new Set([resource,...(args.spec?.resources||[]),...(args.spec?.join?[args.spec.join.resource]:[])])];
    const proofs=involved.map(name=>this.proof(snapshot,name)),proof=proofs[0];
    const coverage = { ...(document.coverage[resource] || { complete: document.complete }),
      complete:involved.every(name=>document.coverage[name]?.complete??document.complete),
      source_fetched_at: Object.fromEntries(involved.map(name=>[name,document.fetchedAt])), origin: 'imported_records', live: false };
    if (args.operation === 'read') { const prefix=this.resourceAddress(snapshot,resource),pointer=args.pointer||prefix,legacy=normalizedRoots[resource as keyof typeof normalizedRoots];
      if (pointer !== prefix && !pointer.startsWith(prefix + '/') && (!legacy || pointer !== legacy && !pointer.startsWith(legacy + '/'))) throw new HarnessError('campus_pointer', 'Use an original address within the selected resource.');
      let value: any = document.resources[resource] ?? all; for (const part of pointer.slice(pointer.startsWith(prefix) ? prefix.length : legacy!.length).split('/').filter(Boolean).map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'))) {
        if (privateField.test(part)) throw new HarnessError('campus_private_field', 'This private field is outside the model projection.'); value = value?.[part]; }
      if (value === undefined) return { status: 'unavailable', ...meta, resource, recordRead: false, reason: 'That original address is absent from this immutable snapshot.' };
      const size = Array.isArray(value) ? value.length : typeof value === 'string' ? [...value].length : 1, page = Array.isArray(value) ? value.slice(args.offset, args.offset + args.limit) : typeof value === 'string' ? [...value].slice(args.offset, args.offset + args.limit).join('') : value;
      return { status: 'ok', ...meta, resource, recordRead: true, pointer, data: safeProjection(page,resource), total_items: size, offset: args.offset, next_offset: args.offset + args.limit < size ? args.offset + args.limit : null, coverage, snapshotProof: proof, snapshotProofs: [proof],
        bodyKind:Object.hasOwn(document.resources,resource)?'original_imported_rows':'derived_local_analysis' }; }
    const spec = structuredClone(args.spec || { resource, fields: args.fields, offset: args.offset, limit: args.limit });
    if (spec.time?.window) {
      if (spec.time.from || spec.time.to || spec.time.at) throw new HarnessError('campus_time_window', 'Use either a named local-date window or explicit times, not both.');
      const today = dateInZone(new Date().toISOString(), document.timeZone), name = spec.time.window;
      const days = name === 'today' ? [today, today] : name === 'tomorrow' ? [addDate(today, 1), addDate(today, 1)]
        : ['next_7_days', 'next7days', 'week'].includes(name) ? [today, addDate(today, 6)] : undefined;
      if (!days) throw new HarnessError('campus_time_window', 'Use today, tomorrow, next_7_days, or an explicit from/to range in the declared time zone.');
      spec.time = { ...spec.time, window: undefined, from: dayBounds(days[0], document.timeZone).from, to: dayBounds(days[1], document.timeZone).to };
    }
    const projectedResources=Object.fromEntries(Object.entries(document.resources).map(([name,rows])=>[name,safeProjection(rows,name)]));
    const selected = selectCampusRows(safeProjection(all,resource), spec, projectedResources), offset = spec.offset ?? args.offset, limit = spec.limit ?? args.limit, records = selected.rows.slice(offset, offset + limit);
    return { status: coverage.complete && selected.metricQuality.every(metric=>metric.complete===true) ? 'ok' : 'partial', ...meta, resource, operation: args.operation, recordRead: true, records: safeProjection(records,resource), returned: records.length, total_matches: selected.rows.length, offset,
      next_offset: offset + records.length < selected.rows.length ? offset + records.length : null, coverage, snapshotProof: proof, snapshotProofs: proofs, unknown_time_records: selected.unknownTime,
      ...(selected.metricQuality.length?{metric_quality:selected.metricQuality,calculation_complete:selected.metricQuality.every(metric=>metric.complete===true)}:{}),
      original: { bundleId: snapshot.id, pointer: this.resourceAddress(snapshot,resource) }, note: 'These are normalized projections or derived local calculations. Read original imported rows through their source address. Local analysis does not certify university results or attendance.' };
  }
  async read(args: CampusReadArgs, signal: AbortSignal, acquisition?: CampusAcquisition): Promise<any> {
    const resource = domainResource[args.domain], conditions = (args.filters || []).map(filter => { const [field, op, ...rest] = filter.split(':'); return { field, op, value: rest.join(':') }; });
    if (args.query) conditions.push({ field: args.domain === 'schedule' ? 'summary' : 'name', op: 'contains', value: args.query });
    if (args.courseId) conditions.push({ field: 'course_id', op: 'eq', value: args.courseId });
    const spec: any = { resource, fields: args.fields || campusSummaryFields(args.domain), offset: args.offset || 0, limit: args.limit || 12,
      ...(conditions.length ? { where: { and: conditions } } : {}), ...(args.sort ? { sort: [args.sort] } : {}),
      ...((args.from || args.to || args.at || args.window) ? { time: { from: args.from, to: args.to, at: args.at, window: args.window, mode: args.timeMode || 'overlap' } } : {}) };
    const data = await this.query({ operation: 'quick', resource: resource as any, spec, bundleId: args.bundleId, expectedSnapshotVersion: args.expectedSnapshotVersion,
      academicYear: args.academicYear, term: args.term, offset: args.offset || 0, limit: args.limit || 12, refresh: args.refresh || false }, signal, acquisition);
    return { domain: args.domain, label: args.domain.replaceAll('_', ' '), cached: !args.refresh, connector: this.describe(), data: { ...data, domain: args.domain } };
  }
  async refresh(args: CampusRefreshArgs, signal: AbortSignal) { signal.throwIfAborted(); this.connectInstalled(); return { scope: args.scope, connector: this.describe(), data: { status: 'ok', origin: 'imported_records', live: false, note: 'Reloaded the explicitly configured local source.' } }; }
  async fullContext(args: CampusFullContextArgs, signal: AbortSignal, acquisition?: CampusAcquisition): Promise<any> {
    if (args.refresh) { if (!acquisition?.allowAcademicSync) throw new HarnessError('campus_acquisition_required', 'Reloading campus data requires source acquisition permission.'); this.connectInstalled(); }
    const head = this.head(); if (!head) return { status: 'unavailable', connector: this.describe(), reason: this.describe().reason };
    if(args.term!==undefined&&args.term!==head.document.termId||args.academicYear!==undefined&&args.academicYear!==head.document.academicYear)
      return {status:'unavailable',recordRead:false,connector:this.describe(),reason:'The requested collection period does not match the imported source.'};
    const sections = []; for (const domain of (Object.keys(domainResource) as CampusDomain[]).filter(domain => args.includeSensitiveDomains || !sensitiveDomains.has(domain))) {
      signal.throwIfAborted(); if (resourceRows(head.document, domainResource[domain]) !== undefined) sections.push(await this.read({ domain, limit: 8 }, signal)); }
    return { status: head.document.complete ? 'ok' : 'partial', connector: this.describe(), sections, authentication, fetched_at: head.document.fetchedAt,
      origin: 'imported_records', live: false, note: 'A bounded overview of local snapshots; continue through each original resource to read the remaining records.' };
  }
  async availability(from: string | undefined, to: string | undefined, signal: AbortSignal) { signal.throwIfAborted();
    const head = this.head(), start = from || new Date().toISOString(), end = to || new Date(Date.parse(start) + 7 * 86400000).toISOString(), rows = head ? resourceRows(head.document, 'classes') : undefined, coverage = head?.document.coverage.classes;
    const intervals = (rows || []).flatMap(row => { const lo = Math.max(Date.parse(start), Date.parse(row.startTime)), hi = Math.min(Date.parse(end), Date.parse(row.endTime));
      return row.status !== 'cancelled' && Number.isFinite(lo) && Number.isFinite(hi) && lo < hi ? [{ start: new Date(lo).toISOString(), end: new Date(hi).toISOString() }] : []; });
    const complete = !!rows && coverage?.complete === true && !!coverage.from && coverage.from <= start && !!coverage.to && coverage.to >= end && head?.document.scheduleQuality?.generatedAllResolvableRules === true && head.document.scheduleQuality.unresolvedRuleCount === 0;
    return { participant: 'Self', busyIntervals: intervals, status: complete ? 'fresh' : 'unknown', sourceId: CAMPUS_ACCOUNT_SOURCE_ID, fetchedAt: head?.document.fetchedAt,
      coverage: { complete, scope: 'Imported scheduled busy intervals only', until: end }, window: { from: start, to: end },
      meaning: 'Planned source intervals do not prove attendance or establish that every other time is free.', reason: complete ? undefined : 'The imported schedule does not establish complete coverage of this window.' };
  }
  /** Compatibility entry; no process or network command is launched. */
  async run(_args: string[], signal: AbortSignal, _timeoutMs = 45000): Promise<any> { signal.throwIfAborted(); return { status: 'unavailable', reason: 'Use structured query/read operations. No external campus command is configured.' }; }
}
