import * as z from 'zod';
import { HarnessError, type KnowledgeStatus } from '../../shared/harness';
import { CAMPUS_ACTIVITY_MODULES, CAMPUS_ACTIVITY_SOURCE_ID, CAMPUS_ACTIVITY_PUBLIC_RULE_REFERENCES, type CampusActivityModuleResource, type CampusActivityObservation, type CampusActivityReadArgs, type CampusActivityResource } from '../../shared/campusActivity';
import type { CampusActivityAdapter } from '../campusActivityAdapter';
import type { PolicyKernel } from '../runtime/policy';
import type { CapabilityBroker, CapabilityDefinition, CapabilityResult, CapabilityProvider, InvocationContext } from './broker';

export const CAMPUS_ACTIVITY_READ_GRANT = 'campus:activity:read';

const moduleDescriptions: Record<CampusActivityModuleResource, string> = {
  study_records: "Read available course and learning records from the configured campus activity source, preserving original details and actual empty-record explanations.",
  exercise: "Read personal activity sessions and any source-reported review state, with historical pagination. summary/statistics expose source counts; record_detail opens a particular session's pace and duration. Detailed routes stay local. Local records do not imply official recognition.",
  notices: "Read campus activity announcements with times, arrangements and original registration entries.",
  teams: "Read teams or clubs and participation records. mine selects personal membership; attendance opens occurrences and source term choices. termId can select historical records.",
  events: "Read a configured campus activity campaign's start, end, arrangements and personal activity summary. Values absent from the source remain null.",
  counselling: "Read tutoring or training attendance and source term choices. termId may select history; continue through returned pages when more records exist.",
  counts: "Read completion-count records for a source-supplied term. This query remains separate from activity summaries; official validity requires its actual provider evidence.",
  venues: "Read facilities, date-specific slots, personal orders, companions or training records. Select venueSiteId from the directory and searchDate for the date. reservation and art_reservation select available facility categories. Returned availability or price does not establish a booking.",
  fitness_attendance: "Read configured fitness-course or activity-attendance records with their actual source state.",
  training: "Read campus workshop or training sessions, times and fees.",
  fitness: "Read voluntary fitness results, existing appointments or feedback through results, schedule or feedback. No default institutional fitness requirement is assumed.",
  competitions: "Read personal competition registrations, results, certificates and existing feedback. Read together by default, or select records, results, certificates or feedback.",
  classes: "Read classes and attendance for a source term. Select its academic year and term with course_terms, then read classes. attendance opens course occurrences, including future dates as scheduled rather than attended.",
  venue_entries: "Read authorized facility-entry records with entry/exit direction, time and place. Select termId from source choices and continue returned pages. Manual attendance is not an access-control log.",
  feedback: "Read existing personal campus-service feedback. Report when the source is unavailable.",
  venue_live: "Read source-reported facility occupancy or availability with its observation time. A directory is not live status.",
  graduation_courses: "Read degree or program activity requirements and term choices when genuinely supplied. The result states whether personal records have been loaded; no mandatory fitness policy is invented.",
  graduation_report: "Read available personal academic-milestone or completion-report indicators and their original explanation.",
  external_fitness: "Read an optional external activity-service entry and whether its connection state is actually available. Separate authorization requirements remain explicit.",
};

const subpages: Partial<Record<CampusActivityModuleResource, readonly NonNullable<CampusActivityReadArgs['subpage']>[]>> = {
  teams: ['mine', 'attendance'], counselling: ['records'], fitness: ['results', 'schedule', 'feedback'],
  competitions: ['records', 'results', 'certificates', 'feedback'],
  venues: ['mine', 'orders', 'buddies', 'training', 'reservation', 'art_reservation'],
};
const extraResources = ['profile', 'menus', 'terms', 'summary', 'records', 'record_detail', 'statistics', 'rules', 'course_terms', 'courses', 'attendance'] as const;
const resourceNames = ['profile', ...CAMPUS_ACTIVITY_MODULES.map(item => item.resource), ...extraResources] as const;
const reference = z.string().min(1).max(160).regex(/^[^\r\n\0]+$/);
const pageFields = {
  refresh: z.boolean().default(false).describe("Read the latest saved record for this resource first. With no saved record, consult only its explicitly configured source. Set true to check for changes; keep false when paging the same record."),
  snapshotId: z.string().regex(/^[a-f0-9]{32}$/).optional().describe("Local record identifier returned previously, retained while reading further."),
  pointer: z.string().max(2048).optional().describe("Original-content address returned for that record, retained with snapshotId."),
  offset: z.number().int().min(0).max(1000000).default(0).describe("Continue at the previous offset. Lists count rows and text counts Unicode code points. Returned next-page entries retain record identity and content address."),
  limit: z.number().int().min(1).max(50).default(8).describe("Entries to expand in this page. The complete original remains local; further pages read the same record."),
};
const queryFields = {
  venueSiteId: reference.optional().describe("Original facility identifier from the source directory. Supply searchDate too; the adapter rechecks it in the same mode's directory."),
  searchDate: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/).refine(value => {
    const day = new Date(value + 'T00:00:00Z');
    return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value;
  }, "Use a valid date in the institution's time zone.").optional().describe("Institution-local date in YYYY-MM-DD form. The configured source declares its time zone. Together with venueSiteId, selects facility slots for that date."),
  upstreamPage: z.number().int().min(0).max(100000).optional().describe("Zero-based source page. Continuations retain term and page. Use snapshotId and offset to expand saved records."),
  schoolYear: reference.optional().describe("Academic-year value supplied by this resource. Select classes with termId; fitness results use the source's actual year choices."),
  termId: reference.optional().describe("Original termId supplied by this resource; each resource preserves its own term choices."),
  courseId: reference.optional().describe("courseId from the selected personal class list, used only for occurrence attendance."),
  recordId: reference.optional().describe("Original record ID from the personal list, for activity details or fitness appointment/feedback details. Ownership is checked first."),
  begin: z.number().int().nonnegative().safe().optional().describe("statistics start as Unix milliseconds, interpreted using the configured institution time zone."),
  end: z.number().int().nonnegative().safe().optional().describe("statistics end as Unix milliseconds, at most 730 days after begin."),
  period: z.enum(['WEEK', 'MONTH', 'TERM']).optional().describe("Group source activity statistics by week, month or term, with explicit begin/end bounds."),
  validStatus: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional().describe("Filter by a validity code only when documented by the configured provider. Omit for all source states; unknown codes remain unknown."),
  subpage: z.enum(['results', 'schedule', 'feedback', 'records', 'mine', 'attendance', 'orders', 'buddies', 'training', 'reservation', 'art_reservation', 'certificates']).optional(),
};
export const campusActivityReadInput = z.object({ resource: z.enum(resourceNames), ...pageFields, ...queryFields }).strict();
const output = z.record(z.string(), z.json());
const venueSelectionSchema = z.object({
  resource: z.literal('venues'), subpage: z.enum(['reservation', 'art_reservation']),
  directoryPointer: z.enum(['/response/data', '/directoryResponse/data']), venueMapField: z.literal('venueInfo'),
  siteMapField: z.literal('venueSiteInfo'), idField: z.literal('id'), dateFormat: z.literal('YYYY-MM-DD'),
  timeZone: z.string().min(1).max(100),
}).strict();

// A provider status is not an independent proof of official recognition.
// Its record review and statistics filter meanings remain distinct.
const exerciseStatusGuide = {
  label: "Provider activity status filter", labels: { '1': "Valid", '-1': "Invalid" },
  unconfirmedLabels: { '0': "The provider has not documented this statistics filter value" },
  omitted: "All states",
};
const exerciseFieldGuides = {
  statistics: {
    totalExerciseCount: { label: "Activity record count", meaning: "Count reported by the source for the selected period and state." },
    validStatus: exerciseStatusGuide,
    avgExerciseCount: { label: "Average activity count", meaning: "Source-reported average activity count. Its averaging interval and denominator must be read from the original source." },
  },
  summary: {
    tips: { label: "Activity summary explanation" },
    datas: { label: "Activity summary items", meaning: "Each item's des is the source explanation, value is its number, and unit is its unit." },
  },
  records: {
    isValid: { label: "Original provider activity status" },
    validCount: { label: "Provider count for this session" },
    checkStatus: { label: "Original review state supplied by the provider" },
    tip: { label: "Provider explanation for this activity" },
  },
} as const;

// Raw replies remain with the local connector. This projection is the model
// boundary, including fixed-snapshot reads, nested objects and page addresses.
const privateField = /token|secret|password|passwd|cookie|authorization|credential|ticket|session|^raw(?:response|bytes)?$|^bodyb64$/i;
const identityField = /^(?:user(?:name|id|no)?|uid|feedbackuid|feedbackname|baseStudentId|faceUuid|photoByte|student(?:id|no|number|name|num)?|realname|truename|nickname|phone(?:number)?|mobile(?:number)?|tel(?:ephone)?|email(?:address)?|account|acctid|custid|card(?:id|no|number)?|bankacc|identity(?:id|no)?|idcard|cert(?:ificate)?(?:no|number)?|imei|deviceid|address|photo|avatar)$/i;
const locationField = /^(?:lat(?:itude)?|lon(?:gitude)?|lng|coordinates?(?:tr)?|coordinatestr|gps|track|trajectory|routePoints|positionList|locations?|sportsList|jsonsports|mapPoints)$/i;
const profileIdentityField = /^(?:name|id|birth|birthday|birthDate|birthYear|dateOfBirth|yearOfBirth)$/i;
const profileField = (field: string) => profileIdentityField.test(field.replace(/[-_]/g, ''));
const venuePrivateField = /^(?:userphone|orderuid|orderuserid|ordername|doorpwd|ordernocode|ordercode|ordercodelist|buddyno|lockcode)$/i;
const protectedField = (field: string) => {
  const key = field.replace(/[-_]/g, '');
  return privateField.test(key) || identityField.test(key) || venuePrivateField.test(key) || locationField.test(key);
};
const safePointer = (pointer: string) => (pointer === '' || pointer.startsWith('/')) && !pointer.split('/').some(part => protectedField(part.replace(/~1/g, '/').replace(/~0/g, '~')));
const profilePointer = (pointer: string) => !pointer.split('/').some(part => profileField(part.replace(/~1/g, '/').replace(/~0/g, '~')));
const profileObservation = (observation: CampusActivityObservation) => observation.resource === 'profile'
  || observation.resource === 'venues' && (observation.coverage.profileRead === true
    || !!observation.data && typeof observation.data === 'object' && !Array.isArray(observation.data)
      && (observation.data as { profileRead?: unknown }).profileRead === true);

function publicText(value: string): string {
  return value.replace(/https?:\/\/[^\s<>"']+/gi, text => {
    try {
      const url = new URL(text);
      url.username = ''; url.password = ''; url.hash = '';
      for (const key of [...url.searchParams.keys()]) if (protectedField(key)) url.searchParams.delete(key);
      return url.toString();
    } catch { return "[institution address]"; }
  }).replace(/;jsessionid=[^\s/?#;<>"']+/gi, '').replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[sign-in details hidden]");
}

function project(value: unknown, budget: { remaining: number; bytes: number; omitted: boolean; profile: boolean }, depth = 0): unknown {
  if (budget.remaining-- <= 0 || depth > 18) { budget.omitted = true; return undefined; }
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    const text = publicText(value), bytes = Buffer.byteLength(text);
    if (bytes > budget.bytes) { budget.omitted = true; return undefined; }
    budget.bytes -= bytes;
    return text;
  }
  if (Array.isArray(value)) {
    const result = [];
    for (const item of value) {
      const next = project(item, budget, depth + 1);
      if (next === undefined) { budget.omitted = true; break; }
      result.push(next);
    }
    return result;
  }
  if (!value || typeof value !== 'object') return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (protectedField(key) || budget.profile && profileField(key)) continue;
    budget.bytes -= Buffer.byteLength(key);
    if (budget.bytes < 0) { budget.omitted = true; break; }
    if (key === 'pointer' && (typeof item !== 'string' || !safePointer(item) || budget.profile && !profilePointer(item))) continue;
    if (key === 'children' && Array.isArray(item)) {
      result[key] = item.filter(child => child && typeof child === 'object' && typeof child.pointer === 'string'
          && safePointer(child.pointer) && (!budget.profile || profilePointer(child.pointer)))
        .map(child => project(child, budget, depth + 1)).filter(child => child !== undefined);
      continue;
    }
    const next = project(item, budget, depth + 1);
    if (next !== undefined) result[key] = next;
  }
  return result;
}

function validateRead(args: CampusActivityReadArgs): CampusActivityReadArgs {
  if (args.pointer !== undefined && (!args.snapshotId || !safePointer(args.pointer)
    || args.resource === 'profile' && !profilePointer(args.pointer)))
    throw new HarnessError('campusActivity_pointer_forbidden', "Continue this activity record from its returned content address. Identity, sign-in details and precise locations stay local.");
  if (args.offset && !args.snapshotId) throw new HarnessError('campusActivity_snapshot_required', "Continuing needs the previous activity record, keeping separate queries from being spliced together.");
  const filters = ['schoolYear', 'termId', 'courseId', 'recordId', 'begin', 'end', 'period', 'validStatus', 'subpage', 'upstreamPage', 'venueSiteId', 'searchDate'] as const;
  if (args.snapshotId) {
    if (args.refresh || filters.some(key => args[key] !== undefined))
      throw new HarnessError('campusActivity_snapshot_parameters', "Continuation preserves the original term and query scope. Start a new query to change conditions.");
    return args;
  }
  const schoolPage = ['training', 'counselling', 'venue_entries'].includes(args.resource) || args.resource === 'venues' && ['orders', 'training'].includes(args.subpage || '');
  const venueSelection = args.resource === 'venues' && (!args.subpage || ['reservation', 'art_reservation'].includes(args.subpage));
  const allowed = new Set<string>(args.resource === 'statistics' ? ['begin', 'end', 'period', 'validStatus']
    : ['courses', 'classes', 'attendance'].includes(args.resource) ? ['schoolYear', 'termId', ...(['classes', 'attendance'].includes(args.resource) ? ['courseId'] : [])]
      : args.resource === 'record_detail' ? ['recordId'] : subpages[args.resource as CampusActivityModuleResource] ? ['subpage'] : []);
  if (schoolPage) allowed.add('upstreamPage');
  if (['counts', 'counselling', 'venue_entries'].includes(args.resource) || args.resource === 'teams' && args.subpage === 'attendance') allowed.add('termId');
  if (args.resource === 'graduation_courses') { allowed.add('schoolYear'); allowed.add('termId'); }
  if (args.resource === 'fitness') {
    if (args.subpage !== 'feedback') allowed.add('schoolYear');
    if (['schedule', 'feedback'].includes(args.subpage || '')) allowed.add('recordId');
  }
  if (venueSelection) { allowed.add('venueSiteId'); allowed.add('searchDate'); }
  if (filters.some(key => args[key] !== undefined && !allowed.has(key)))
    throw new HarnessError('campusActivity_unused_parameters', "These filters do not match the selected resource. Use describeOnly for its usage and preserve its required conditions. Time statistics, session details and class records have distinct queries.");
  if (venueSelection && (args.venueSiteId !== undefined) !== (args.searchDate !== undefined))
    throw new HarnessError('campusActivity_venue_selection', "Read the facility directory first, then supply its original facility ID and the intended institution-local date together.");
  if (['courses', 'classes', 'attendance'].includes(args.resource) && (!args.schoolYear || !args.termId))
    throw new HarnessError('campusActivity_term_required', "Read available course terms first, then use the academic year and term supplied by the source.");
  if (args.resource === 'attendance' && !args.courseId)
    throw new HarnessError('campusActivity_course_required', "Select this course from the personal class list, then use its courseId to read attendance occurrences.");
  if (args.resource === 'record_detail' && !args.recordId)
    throw new HarnessError('campusActivity_record_required', "Session details belong to the personal activity list. Continue with its returned recordId.");
  if (args.resource === 'statistics' && (args.begin === undefined || args.end === undefined || !args.period || args.end < args.begin || args.end - args.begin > 730 * 86400000))
    throw new HarnessError('campusActivity_statistics_range', "These statistics need explicit start/end bounds and a week, month or term grouping, up to 730 days. Supply the intended window to continue.");
  if (args.subpage && !subpages[args.resource as CampusActivityModuleResource]?.includes(args.subpage))
    throw new HarnessError('campusActivity_subpage_unknown', "This subpage does not match the selected activity resource. describeOnly lists its supported reading modes.");
  return args;
}

function sourceChildren(observation: CampusActivityObservation) {
  const value = observation.data, root = observation.coverage.pointer ?? '';
  if (!observation.snapshotId || !value || typeof value !== 'object') return [];
  const profile = profileObservation(observation);
  const visiblePointer = (pointer: string) => safePointer(pointer) && (!profile || profilePointer(pointer));
  const originalChildren = !Array.isArray(value) && (observation.coverage.navigationOnly || (value as { navigationOnly?: unknown }).navigationOnly === true
    || Object.keys(value).length === 1) && Array.isArray((value as { children?: unknown }).children)
    ? (value as { children: { pointer?: unknown; kind?: unknown; count?: unknown }[] }).children : undefined;
  // A connector directory is synthetic; its children already point into the
  // real response. Appending /children would invent a nonexistent source path.
  if (originalChildren) return originalChildren.filter(child => child && typeof child.pointer === 'string' && visiblePointer(child.pointer))
    .slice(0, 12).map(child => ({ pointer: child.pointer as string,
      kind: typeof child.kind === 'string' ? child.kind.slice(0, 30) : 'unknown',
      sourceReference: { sourceId: CAMPUS_ACTIVITY_SOURCE_ID, resource: observation.resource, snapshotId: observation.snapshotId, pointer: child.pointer as string } }));
  return Object.entries(value).filter(([key]) => !protectedField(key) && !(profile && profileField(key)))
    .slice(0, 12).map(([key, child]) => {
    const segment = Array.isArray(value) ? String((observation.coverage.offset ?? 0) + Number(key)) : key;
    const pointer = root + '/' + segment.replace(/~/g, '~0').replace(/\//g, '~1');
    return { pointer, kind: Array.isArray(child) ? 'array' : child === null ? 'null' : typeof child,
      ...(Array.isArray(child) || typeof child === 'string' ? { size: child.length } : {}),
      sourceReference: { sourceId: CAMPUS_ACTIVITY_SOURCE_ID, resource: observation.resource, snapshotId: observation.snapshotId, pointer } };
  });
}

function resultOf(observation: CampusActivityObservation, capability: string, args: CampusActivityReadArgs): CapabilityResult {
  const personalProfile = profileObservation(observation) || args.resource === 'venues' && args.subpage === 'mine';
  if (personalProfile && !profilePointer(observation.coverage.pointer ?? args.pointer ?? ''))
    throw new HarnessError('campusActivity_pointer_forbidden', "Continue this personal record from its returned readable content address.");
  const budget = { remaining: 3000, bytes: 70000, omitted: false, profile: personalProfile };
  const projected = observation.data === undefined ? undefined : project(observation.data, budget);
  const payload = budget.omitted ? undefined : projected;
  const source = observation.coverage;
  const venueSelection = args.resource === 'venues' ? venueSelectionSchema.safeParse(source.venueSelection) : undefined;
  const venueSource = venueSelection?.success === true;
  const page = source.kind === 'official_page';
  const catalog = source.kind === 'catalog';
  const navigationOnly = source.navigationOnly === true || !!payload && typeof payload === 'object' && !Array.isArray(payload)
    && ((payload as { navigationOnly?: unknown }).navigationOnly === true
      || Object.keys(payload).length === 1 && Array.isArray((payload as { children?: unknown }).children));
  const publicModuleData = ['venue_live', 'external_fitness'].includes(args.resource)
    || args.resource === 'teams' && /^\/availableTeams(?:\/|$)/.test(source.pointer ?? '')
    || args.resource === 'events' && /^\/activityResponse(?:\/|$)/.test(source.pointer ?? '');
  const explicitlyNonPersonal = venueSource || publicModuleData || !!observation.data && typeof observation.data === 'object' && !Array.isArray(observation.data)
    && (observation.data as { recordRead?: unknown }).recordRead === false;
  const venueDataRead = venueSource && !budget.omitted && !navigationOnly && !page && !catalog
    && observation.data !== undefined && !observation.error;
  const state = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as { readState?: unknown; venueLiveRead?: unknown }).readState : undefined;
  const stateMeaning = state === 'access_denied' ? "The source does not grant access to personal team membership. Available teams and personal memberships remain distinct."
    : state === 'external_entry_only' ? "The source supplies an external activity entry. Its connection state has not been obtained."
      : state === 'activity_unavailable' ? "The source returned no readable activity campaign. The personal activity summary remains unknown."
        : ['report_not_available', 'image_content_unread', 'report_loading_changed', 'no_personal_report'].includes(String(state)) ? "Personal indicators in this report have not been read yet."
          : state === 'no_published_courses' ? "The source returned no published fitness or activity-course records within the selected scope."
            : state === 'no_records' ? args.resource === 'counts' ? "The completion-count source returned no rows for this term."
              : args.resource === 'study_records' ? "The learning-record source returned no rows within this query scope."
                : "The source returned no records within this scope. The query range and reading time remain in the same result."
              : state === 'end_of_records' ? "The source returned its final page. Earlier records remain in their original sources."
                : args.resource === 'venue_live' ? "These are source-reported facility counts with their reading time."
                  : publicModuleData && args.resource === 'teams' ? "These are teams or clubs listed as available by the source."
                    : publicModuleData && args.resource === 'events' ? "These are the source's activity-campaign arrangements and overview." : undefined;
  const recordRead = !explicitlyNonPersonal && !page && !catalog && !navigationOnly && !budget.omitted && observation.data !== undefined && !observation.error;
  const fieldGuide = args.resource === 'statistics' ? exerciseFieldGuides.statistics
    : args.resource === 'summary' ? exerciseFieldGuides.summary
      : ['records', 'exercise', 'record_detail'].includes(args.resource) ? exerciseFieldGuides.records : undefined;
  const exerciseMeaning = args.resource === 'statistics' || args.resource === 'summary'
    ? "These are source activity counts and item explanations, separate from the completion-count query." : undefined;
  const hasSource = observation.data !== undefined && !!observation.snapshotId;
  const complete = source.complete && !budget.omitted && !page && !catalog && !navigationOnly;
  const status: KnowledgeStatus = observation.status === 'auth_required' ? 'not_connected'
    : observation.status === 'unavailable' ? 'failed'
      : observation.status === 'saved' ? complete ? 'stale' : 'partial'
        : !complete ? 'partial' : 'fresh';
  const next = source.next && safePointer(source.next.pointer || '') && (!personalProfile || profilePointer(source.next.pointer || '')) ? {
    tool: 'look_up', arguments: { source: 'capability', capability,
      arguments: { ...(capability === 'campusActivity.read' ? { resource: args.resource } : {}), snapshotId: source.next.snapshotId,
        offset: source.next.offset, ...(source.next.pointer !== undefined ? { pointer: source.next.pointer } : {}), limit: args.limit ?? 8 } },
  } : undefined;
  const schoolNext = source.upstreamNext && campusActivityReadInput.safeParse({ ...source.upstreamNext, refresh: true, limit: args.limit ?? 8 });
  const schoolContinuation = schoolNext && schoolNext.success && schoolNext.data.resource === args.resource ? {
    tool: 'look_up', arguments: { source: 'capability', capability: 'campusActivity.read', arguments: validateRead(schoolNext.data) },
    meaning: "The source has another page. The list may change during pagination. Saved content can still be expanded using its original record ID and content address.",
  } : undefined;
  return {
    status, sourceId: CAMPUS_ACTIVITY_SOURCE_ID, observedAt: observation.observedAt, fetchedAt: observation.fetchedAt,
    ...(hasSource && !budget.omitted ? { delivery: { kind: 'page' as const, complete: true as const } } : {}),
    data: { resource: args.resource, source: "Imported campus activity records", origin: 'imported_records',
      live: false, authenticated: false, officialRecord: false, recordRead, personalRecordRead: recordRead,
      ...(venueDataRead ? { venueDataRead: true } : {}), ...(payload !== undefined ? { content: payload } : {}),
      ...(fieldGuide ? { fieldGuide } : {}),
      ...(observation.snapshotId ? { snapshotId: observation.snapshotId } : {}),
      sourceCoverage: { ...source, complete, scope: 'returned_response',
        meaning: page ? "The source entry page opened, but personal records have not been read."
          : catalog ? "This is a source-provided feature directory. Its personal records have not been read."
            : stateMeaning ?? "This is the returned source content, with scope and continuation in the same result." },
      ...(next ? { continuation: next } : {}),
      ...(schoolContinuation ? { schoolContinuation } : {}),
      ...(venueSelection?.success && observation.snapshotId ? { venueSelection: {
        ...venueSelection.data,
        directoryRead: { tool: 'look_up', arguments: { source: 'capability', capability: 'campusActivity.read',
          arguments: { resource: 'venues', snapshotId: observation.snapshotId, pointer: venueSelection.data.directoryPointer, limit: args.limit ?? 8 } } },
        timesQuery: { capability: 'campusActivity.read', resource: 'venues', subpage: venueSelection.data.subpage,
          requiredFields: ['venueSiteId', 'searchDate'] },
        meaning: "Choose a facility from the directory and supply its ID with an institution-local date to inspect slots. No facility was reserved.",
      } } : {}),
      ...(observation.snapshotId && source.pointer !== undefined && safePointer(source.pointer) && (!personalProfile || profilePointer(source.pointer)) ? {
        sourceReference: { sourceId: CAMPUS_ACTIVITY_SOURCE_ID, resource: args.resource, snapshotId: observation.snapshotId, pointer: source.pointer },
      } : {}),
      ...(budget.omitted || navigationOnly ? { navigationRequired: true,
        ...(budget.omitted ? { sourceNavigation: sourceChildren(observation) } : {}),
        meaning: "This content is long. Follow the subentries below to open its original text." } : {}),
      ...(observation.error ? { error: { code: observation.error.code, ...(observation.error.httpStatus ? { httpStatus: observation.error.httpStatus } : {}) } } : {}),
      meaning: budget.omitted || navigationOnly ? "Original content remains unexpanded. Continue through the same record's entry."
        : stateMeaning ? stateMeaning
        : recordRead && exerciseMeaning ? exerciseMeaning
        : venueDataRead ? "The facility directory or date-specific slots were returned, including source-reported availability, capacity, occupancy and conditions. A selected slot has not been reserved."
        : page ? "The source entry page opened. Personal details are absent from this response."
        : recordRead ? "This is the returned campus activity content. Summaries, session records and review states retain their source names."
          : catalog ? "This is the source feature directory. Select a resource to continue."
            : "Personal activity content has not been read. The source response remains in this result.",
    },
    coverage: { complete, scope: `Campus activity ${args.resource}; current page of this source response` },
    ...(observation.error?.message ? { reason: publicText(observation.error.message).slice(0, 500) }
      : page ? { reason: "The entry page's text was read. Separately loaded personal records have not been obtained." }
        : budget.omitted ? { reason: "More original text remains. Continue reading the same record." }
          : observation.status === 'saved' ? { reason: "This is a locally saved source record with its collection time. Refresh the configured source for current information." } : {}),
    simulated: false,
  };
}

function definition(name: string, label: string, description: string, input: z.ZodType): CapabilityDefinition {
  return { name, displayName: label, description, version: '2', input, output, effect: 'read',
    requiredScopes: name === 'campusActivity.catalog' ? ['campus:read'] : ['campus:read', CAMPUS_ACTIVITY_READ_GRANT], subjects: ['self'], worlds: ['real'], timeoutMs: 90000,
    maxBytes: 120000, supportsIdempotency: false, supportsInspect: false, supportsCancel: false };
}

/** Register the existing connector with the original broker; no alternate loop. */
export function registerCampusActivity(broker: CapabilityBroker, policy: PolicyKernel, getAdapter: () => CampusActivityAdapter | undefined): void {
  const capabilities = CAMPUS_ACTIVITY_MODULES.map(module => definition(`campusActivity.${module.resource}`, `Campus activity · ${module.label}`, moduleDescriptions[module.resource],
    z.object({ ...pageFields,
      ...(module.resource === 'classes' ? { schoolYear: queryFields.schoolYear, termId: queryFields.termId, courseId: queryFields.courseId } : {}),
      ...(['counts', 'counselling', 'venue_entries', 'teams', 'graduation_courses'].includes(module.resource) ? { termId: queryFields.termId } : {}),
      ...(['fitness', 'graduation_courses'].includes(module.resource) ? { schoolYear: queryFields.schoolYear } : {}),
      ...(module.resource === 'fitness' ? { recordId: queryFields.recordId } : {}),
      ...(subpages[module.resource] ? { subpage: z.enum(subpages[module.resource] as [string, ...string[]]).optional() } : {}),
      ...(['venues', 'training', 'counselling', 'venue_entries'].includes(module.resource) ? { upstreamPage: queryFields.upstreamPage } : {}),
      ...(module.resource === 'venues' ? { venueSiteId: queryFields.venueSiteId, searchDate: queryFields.searchDate } : {}),
    }).strict()));
  capabilities.push(definition('campusActivity.catalog', "Campus activity query directory", "Inspect local activity-query entries and how to open terms, statistics and details. menus separately reports resources actually available from the configured source.", z.object({}).strict()));
  capabilities.push(definition('campusActivity.read', "Campus activity terms, records and statistics", "Read source directories, terms, personal records and activities. summary reads session summaries; records reads sessions; record_detail opens one; statistics aggregates a period; rules reads source rules; course_terms lists terms; courses reads classes; attendance reads occurrences. Nineteen resource categories remain available as a directory. Continue saved content using snapshotId and pointer. Missing providers remain explicitly unconfigured.", campusActivityReadInput));
  const check = (ctx: InvocationContext, records = true) => {
    ctx.signal.throwIfAborted();
    const scope = policy.validate(ctx.scope);
    if (scope.subjectId !== scope.principalId || scope.worldId !== 'real' || scope.audience !== 'self')
      throw new HarnessError('scope_mismatch', "Personal activity records are read only in the user's private conversation. External disclosure needs separately selected content and authorization.");
    for (const grant of records ? ['campus:read', CAMPUS_ACTIVITY_READ_GRANT] : ['campus:read']) policy.require(ctx.scope, grant);
    if (!scope.sources.includes(CAMPUS_ACTIVITY_SOURCE_ID)) throw new HarnessError('source_forbidden', "Activity records are outside this request's permitted sources.");
  };
  const provider: CapabilityProvider = {
    manifest: { id: 'campus-activity', version: '2', trust: 'bundled_reviewed', sourceId: CAMPUS_ACTIVITY_SOURCE_ID, capabilities,
      egressHosts: [], platforms: ['*'], simulated: false,
      offline: 'read_cache', license: 'Project-owned local adapter; imported sources retain their original rights' },
    connectionStatus: name => {
      if (name === 'campusActivity.catalog') return { connected: true };
      const state = getAdapter()?.describe();
      return { connected: !!state?.configured,
        ...(state?.reason ? { reason: state.reason } : !state ? { reason: "No campus activity source is configured on this computer. The query directory remains available." } : {}), entry: "Campus connections · Activities" };
    },
    invoke: async (name, raw, ctx) => {
      check(ctx, name !== 'campusActivity.catalog');
      if (name === 'campusActivity.catalog') return {
        status: 'fresh', sourceId: CAMPUS_ACTIVITY_SOURCE_ID, simulated: false,
        data: { catalogOnly: true, recordRead: false, connection: { configured: getAdapter()?.describe().configured === true,
          reason: getAdapter()?.describe().reason ?? (getAdapter() ? null : "No campus activity source is configured on this computer.") },
          modules: CAMPUS_ACTIVITY_MODULES.map(module => ({ ...module,
          capability: `campusActivity.${module.resource}`, description: moduleDescriptions[module.resource],
          ...(subpages[module.resource] ? { subpages: [...subpages[module.resource]!] } : {}),
          describe: { tool: 'look_up', arguments: { source: 'capability', capability: `campusActivity.${module.resource}`, describeOnly: true } },
        })), supportingResources: [...extraResources], publicRuleReferences: [...CAMPUS_ACTIVITY_PUBLIC_RULE_REFERENCES],
          meaning: "These are local activity-query entries. Select one to inspect records actually supplied by the configured source.",
          schoolSubmissionAvailable: false },
        coverage: { complete: true, scope: "Usage for nineteen campus activity resources" },
      };
      const resource = name === 'campusActivity.read' ? raw.resource : name.slice('campusActivity.'.length);
      const args = validateRead({ ...raw, resource });
      const adapter = getAdapter();
      if (!adapter) return { status: 'not_connected', sourceId: CAMPUS_ACTIVITY_SOURCE_ID, simulated: false,
        reason: "No activity source is configured. Select an authorized local campus-activity data file in Campus connections before continuing this query.",
        coverage: { complete: false, scope: `Campus activity ${resource}` } };
      let observation: CampusActivityObservation;
      try { observation = await adapter.read(args, ctx.signal); }
      catch (error) {
        check(ctx);
        // The adapter's process boundary already replaces raw Python, network
        // and filesystem failures with bounded public messages.
        throw new HarnessError('campusActivity_read_failed', error instanceof Error ? publicText(error.message).slice(0, 500)
          : "The local campus activity adapter did not complete this query. Check the connection settings and retry.");
      }
      check(ctx);
      return resultOf(observation, name, args);
    },
  };
  broker.register(provider, { reviewed: true, source: 'bundled CampusActivity read-only connector review' });
}
