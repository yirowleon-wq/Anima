import * as z from 'zod';
import { HarnessError } from '../../shared/harness';
import type { PolicyKernel } from '../runtime/policy';
import type { ScopeHandle } from '../../shared/harness';

export const campusResources = ['classes', 'courses', 'learning_courses', 'sports', 'exams', 'grades', 'gpa_semesters', 'gpa_overall', 'gpa_cumulative', 'retakes', 'projects', 'practice_summary', 'todos', 'activities', 'holidays', 'calendar_pending', 'cancelled_classes', 'source_status', 'reservations', 'reservation_violations', 'card_accounts', 'transactions', 'student_profile', 'roles'] as const;
const resource = z.enum(campusResources);
const field = z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,100}$/);
const sensitive = /^(password|passwd|secret|token|ticket|cookie|authorization|credential|raw_response|body_b64|email|phone|mobile|account|student.?id|student.?no|card.?no|identity.?id|customer.?id|account.?id|bank.?account|cert)$/i;
const where = z.record(z.string(), z.json()).describe("Use {field,op,value} for one condition, with field from schema. op supports eq/ne/in/not_in/contains/starts_with/ends_with/length_gt/length_eq/gt/gte/lt/lte/missing/exists. Combine using and/or arrays, not with one condition object, and any/all with {field,where}.");
const sort = z.array(z.union([field, z.object({ field, descending: z.boolean().optional() }).strict()])).max(12);
export const campusSelectSchema = z.object({
  resource, resources: z.array(resource).max(5).optional(),
  operation: z.enum(['select', 'aggregate', 'conflicts', 'transitions', 'gaps']).optional(),
  time: z.object({ from: z.string().max(50).optional(), to: z.string().max(50).optional(), at: z.string().max(50).optional(), window: z.string().max(40).optional(), mode: z.enum(['overlap', 'starts', 'contained']).optional(), field: field.optional(), end_field: field.optional() }).strict().optional(),
  where: where.optional(), after_join_where: where.optional(), having: where.optional(),
  join: z.object({ resource, left_on: field, right_on: field, as: field.optional(), kind: z.enum(['left', 'inner']).optional() }).strict().optional(),
  fields: z.array(field).max(40).optional(), group_by: z.array(field).max(8).optional(), distinct: z.array(field).max(8).optional(),
  metrics: z.array(z.object({ op: z.enum(['count', 'count_where', 'fraction', 'count_distinct', 'sum', 'mean', 'median', 'min', 'max', 'first', 'last', 'weighted_mean']), field: field.optional(), weight: field.optional(), where: where.optional().describe("count_where and fraction may contain where inside the metric. For sum, mean, weighted_mean and similar metrics, select contributing rows using outer spec.where first."), as: field.optional() }).strict()).max(16).optional(),
  sort: sort.optional(), order_by: sort.optional(), offset: z.number().int().min(0).max(1000000).optional(), limit: z.number().int().min(1).max(100).optional(),
}).strict();
export const campusQueryInput = z.object({
  operation: z.enum(['resources', 'schema', 'quick', 'select', 'read', 'history', 'diff'])
    .describe("resources lists collections; schema describes a chosen model; quick selects one record class; select combines conditions or aggregates; read follows an original address; history lists saved versions; diff compares two observations."),
  resource: resource.optional(), model: z.string().regex(/^[a-z_]{1,60}$/).optional().describe("Select a model from resources to inspect field syntax. A resource category and its model may have different names."),
  spec: campusSelectSchema.optional(),
  bundleId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional().describe("Identifier returned for the previous record, retained while paging or opening original content."),
  expectedSnapshotVersion: z.string().regex(/^[a-f0-9]{64}$/).optional().describe("Version returned with that record, retained alongside its identifier to continue reading the same content."),
  fromBundle: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional().describe("Earlier snapshot identifier for comparison, obtainable from history."),
  toBundle: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/).optional().describe("Later snapshot identifier for comparison. Changes establish only what differs between the observations."),
  pointer: z.string().max(500).optional().describe("Original-content address supplied by this record, retained with its identifier while expanding it."), fields: z.array(field).max(40).optional(),
  offset: z.number().int().min(0).max(1000000).default(0).describe("Continue from the previous offset. Composite queries also use this unless given a separate offset."),
  limit: z.number().int().min(1).max(50).default(8).describe("Number of entries to expand now. Composite queries also use this unless given a separate limit. Remaining originals stay available for further pages."),
  refresh: z.boolean().default(false).describe("Read saved records by default and preserve collection times. For current changes, set true on quick/select to reread the configured source. Existing records in the same collection retain their provenance. Keep false to page a saved snapshot; campus.overview can request an overall refresh."), academicYear: z.string().regex(/^20\d{2}-20\d{2}$/).optional(), term: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/).optional(),
}).strict();
export type CampusQuery = z.infer<typeof campusQueryInput>;
export const examCourseRecordsPointer = '/normalized/exam_course_records';
export const campusExamSummaryFields = ['id', 'name', 'semester_id', 'credit', 'type', 'startTime', 'endTime', 'dateLabel', 'location', 'seat', 'time_precision'] as const;
export const campusGpaPolicies = {
  all_attempts: { label: "All attempts", meaning: "Retain every course attempt, then weight eligible records by original inclusion rules and units. Actual inclusion still needs valid grade points and positive units." },
  first_attempt: { label: "First attempt", meaning: "For each same-course group, choose the earliest term and weight by the original inclusion rules and units. Attempt order within a term may remain unknown." },
  highest_attempt: { label: "Highest grade", meaning: "For each same-course group, choose the highest comparable source grade. Keep all point scales tied to that same attempt. For ties or wholly incomparable values, retain the first source record." },
  repository_first_response: { label: "First source record", meaning: "For each same-course group, take the first record in source order, then weight eligible records by units. Source order does not establish actual attempt chronology; check original terms and records." },
} as const;
export const majorGpaPointer = '/normalized/transcript/major';
export const majorGpaFields = {
  source_complete: "Whether this major collection is complete; coverage describes the grade and major sources separately",
  gpa: "Weighted means under explicitly supplied source scales. Compatibility fields fivePoint, fourPoint, fourPointLegacy and hundredPoint are populated only when the source and grading policy support that scale; they do not imply a conversion.",
  'gpa.fivePoint': "Weighted source value for major-matched records on an explicitly supplied five-point scale, otherwise null",
  'gpa.fourPoint': "Weighted source value for major-matched records on an explicitly supplied four-point scale, otherwise null",
  'gpa.fourPointLegacy': "Legacy compatibility value only when explicitly provided by the source; no automatic grade conversion",
  'gpa.hundredPoint': "Weighted source percentage for the same major-matched records, when supplied",
  gpa_credit_denominator: "Actual included-unit denominator for these major records, separate from all-course attempts",
  eligible_attempts: "Attempts satisfying the declared inclusion policy",
  counted_attempts: "Attempts with usable grade points and positive units that actually enter the weighted mean",
  excluded_attempts: "Excluded record identifiers and reasons under the declared policy; returned only when explicitly selected",
  incomplete_attempts: "Identifiers of otherwise eligible records missing usable units or grade points; returned only when explicitly selected",
  zero_credit_attempts: "Zero-unit record identifiers; they do not increase the denominator and appear only when explicitly selected",
  earned_credits_sum_attempts: "Sum of earned units across attempts; repeats may duplicate units",
  complete: "Whether this major aggregation is complete; coverage describes grade and major collections separately",
  formula: "Weighted formula recorded by the source adapter",
} as const;
export const majorGpaReadFields = ['gpa', 'gpa_credit_denominator', 'eligible_attempts', 'counted_attempts', 'complete', 'source_complete', 'formula'] as const;
const courseSummaryFields = ['key', 'name', 'semester_id', 'credit', 'teachers', 'confirmed', 'online'];

/** A snapshot also contains historical courses joined from grades and exams.
 * Selecting its timetable semester alone does not select those course rows. */
function hasCourseSemesterCondition(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const condition = value as Record<string, unknown>;
  if (condition.field === 'semester_id') return true;
  return ['and', 'or'].some(key => Array.isArray(condition[key]) && condition[key].some(hasCourseSemesterCondition))
    || hasCourseSemesterCondition(condition.not);
}

function requireCourseSemester(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value))
    throw new HarnessError('campus_semester_unknown', "This course collection has no term and includes historical courses. Resolve the term before treating it as this term's schedule.");
  return value;
}

export function campusCourseLookupFilters(filters: readonly string[] | undefined, semesterId: unknown): string[] {
  const selected = [...(filters || [])];
  if (!selected.some(value => value.split(':', 1)[0].trim() === 'semester_id'))
    selected.push(`semester_id:eq:${requireCourseSemester(semesterId)}`);
  return selected;
}

/** Preserve explicit course-semester choices, including cross-semester ones.
 * A quick query keeps its original narrow projection when a where is added. */
export function campusCourseQueryForSemester(input: CampusQuery, semesterId: unknown): CampusQuery {
  if (!['quick', 'select'].includes(input.operation) || (input.resource || input.spec?.resource) !== 'courses'
    || (input.spec?.resources?.length || 0) > 1
    || [input.spec?.where, input.spec?.after_join_where, input.spec?.having].some(hasCourseSemesterCondition)) return input;
  const semester = requireCourseSemester(semesterId), next = structuredClone(input);
  const selected = next.spec || { resource: 'courses' as const,
    fields: next.fields?.length ? [...next.fields] : [...courseSummaryFields], offset: next.offset, limit: next.limit };
  const condition = { field: 'semester_id', op: 'eq', value: semester };
  next.spec = { ...selected, where: selected.where ? { and: [selected.where, condition] } : condition };
  return validateCampusQuery(next);
}
const grants: Partial<Record<(typeof campusResources)[number], string>> = {
  grades: 'campus:grades:read', retakes: 'campus:grades:read', gpa_semesters: 'campus:gpa:read', gpa_overall: 'campus:gpa:read', gpa_cumulative: 'campus:gpa:read',
  reservations: 'campus:reservations:read', reservation_violations: 'campus:reservations:read', card_accounts: 'campus:card:read', transactions: 'campus:transactions:read', student_profile: 'campus:profile:read', roles: 'campus:profile:read',
};
export const normalizedRoots = Object.fromEntries(campusResources.map(resource => [resource, `/resources/${resource}`])) as Record<(typeof campusResources)[number], string>;

export function validateCampusQuery(raw: unknown) {
  const input = campusQueryInput.parse(raw);
  if (input.operation === 'quick' && !input.spec && input.resource === 'exams' && !input.fields?.length)
    input.fields = [...campusExamSummaryFields];
  const examCourseRead = input.pointer === examCourseRecordsPointer;
  const majorGpaRead = input.pointer === majorGpaPointer;
  if (majorGpaRead && (input.operation !== 'read' || input.resource !== 'gpa_overall'))
    throw new HarnessError('major_gpa_read_only', "This address references a saved major summary. Use gpa_overall read with the original record and revision to read its saved result.");
  if (majorGpaRead && (input.offset !== 0 || input.spec !== undefined || input.model !== undefined
    || input.academicYear !== undefined || input.term !== undefined || input.fromBundle !== undefined || input.toBundle !== undefined || input.refresh))
    throw new HarnessError('major_gpa_read_parameters', "Read this major summary as a whole from its original record and revision, with bundleId, expectedSnapshotVersion and requested fields, keeping offset 0. Other filters or term queries use their own entries.");
  if (majorGpaRead) {
    input.fields = input.fields?.length ? input.fields : [...majorGpaReadFields];
    if (input.fields.some(name => !Object.hasOwn(majorGpaFields, name)))
      throw new HarnessError('major_gpa_read_fields', "This address provides major summary values. Select fields from its field descriptions. Individual course grades remain in their original grade collection.");
  }
  if (examCourseRead && (input.operation !== 'read' || input.resource !== 'exams'))
    throw new HarnessError('exam_course_read_only', "This references an original course record within exam data. Use exams read on the same record; actual exam occurrences remain nested under each course.");
  if (examCourseRead && (input.fields !== undefined || input.spec !== undefined || input.model !== undefined
    || input.academicYear !== undefined || input.term !== undefined || input.fromBundle !== undefined || input.toBundle !== undefined || input.refresh))
    throw new HarnessError('exam_course_read_parameters', "This expands exam courses in source order. Continue with the original snapshot, revision, offset and limit. Use quick/select for different fields or conditions.");
  if (input.spec && !['quick', 'select'].includes(input.operation))
    throw new HarnessError('query_spec_operation', "This mode uses different condition entries: quick/select takes spec; read follows an original-content address; diff selects comparison fields at the top level.");
  if (!['resources', 'schema'].includes(input.operation) && !input.resource && !input.spec) throw new HarnessError('resource_required', "Choose a resource to read, such as courses, exams or grades.");
  if (input.operation === 'schema' && !input.model) throw new HarnessError('model_required', "Choose the field model to inspect.");
  if (input.operation === 'select' && !input.spec) throw new HarnessError('query_required', "A composite query needs a concrete spec.");
  if (input.spec && input.resource && input.spec.resource !== input.resource) throw new HarnessError('resource_mismatch', "resource and spec.resource select different collections. Set both to the same intended collection to continue.");
  if (input.spec?.resources?.length === 1 && input.spec.resources[0] !== input.spec.resource)
    throw new HarnessError('resource_mismatch', "A single resources entry must match resource. Combining resources requires listing them or their joins explicitly.");
  if (input.spec) input.spec = { ...input.spec, offset: input.spec.offset ?? input.offset, limit: input.spec.limit ?? input.limit };
  const validateWhere = (expression: any, depth = 0): void => {
    if (expression === undefined || expression === null) return;
    if (depth > 12 || !expression || typeof expression !== 'object' || Array.isArray(expression)) throw new HarnessError('query_filter', "A filter must be a condition object nested no deeper than 12 levels.");
    const logic = ['and', 'or', 'not', 'any', 'all'].filter(key => key in expression);
    if (logic.length) {
      if (logic.length !== 1 || Object.keys(expression).length !== 1) throw new HarnessError('query_filter', "Use one logical operator per level. Put multiple conditions in an and/or array.");
      const key = logic[0], value = expression[key];
      if (key === 'and' || key === 'or') {
        if (!Array.isArray(value)) throw new HarnessError('query_filter', "and/or accepts an array of conditions. Put them together in one array.");
        for (const item of value) validateWhere(item, depth + 1);
      } else if (key === 'not') validateWhere(value, depth + 1);
      else {
        if (!value || typeof value !== 'object' || typeof value.field !== 'string') throw new HarnessError('query_filter', "any/all requires an array field and a nested where condition.");
        validateWhere(value.where, depth + 1);
      }
      return;
    }
    if (typeof expression.field !== 'string' || Object.keys(expression).some(key => !['field', 'op', 'value'].includes(key))) throw new HarnessError('query_filter', "Write one condition as {field,op,value}, with the field name, comparison operator and target value in the corresponding properties.");
    if (!['missing', 'exists', 'eq', 'ne', 'in', 'not_in', 'contains', 'starts_with', 'ends_with', 'length_gt', 'length_eq', 'gt', 'gte', 'lt', 'lte'].includes(expression.op || 'eq')) throw new HarnessError('query_filter', "This comparison operator is unsupported. Choose an op listed in schema and continue the original condition.");
    if (['in', 'not_in'].includes(expression.op) && !Array.isArray(expression.value)) throw new HarnessError('query_filter', "in/not_in compares candidate values supplied as a value array.");
  };
  for (const expression of [input.spec?.where, input.spec?.after_join_where, input.spec?.having, ...(input.spec?.metrics || []).map(metric => metric.where)]) validateWhere(expression);
  if (input.spec?.metrics?.some(metric => metric.where !== undefined && !['count_where', 'fraction'].includes(metric.op)))
    throw new HarnessError('query_metric_filter', "This metric first selects records through outer spec.where. Metric-level where belongs to count_where and fraction. Move the original condition to the corresponding location to continue.");
  const validateFields = (value: any, depth = 0): void => {
    if (depth > 12) throw new HarnessError('query_depth', "Query conditions are nested too deeply.");
    if (Array.isArray(value)) { for (const item of value) validateFields(item, depth + 1); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (['field', 'left_on', 'right_on', 'end_field', 'weight'].includes(key) && typeof item === 'string' && item.split('.').some(segment => sensitive.test(segment))) throw new HarnessError('credential_field', "This field stays in the local source connection. Choose currently readable course or grade fields from schema.");
      if (['fields', 'group_by', 'distinct', 'sort', 'order_by'].includes(key) && Array.isArray(item) && item.some(field => typeof field === 'string' && field.split('.').some(segment => sensitive.test(segment)))) throw new HarnessError('credential_field', "Some selected fields stay in the local source connection. Choose currently readable fields from schema.");
      validateFields(item, depth + 1);
    }
  };
  validateFields(input);
  if (input.operation === 'read') {
    if (!input.bundleId || !input.resource || !input.pointer) throw new HarnessError('navigation_required', "Continuing original-content reading needs the returned resource, record identifier and content address.");
    const root = normalizedRoots[input.resource];
    if (!examCourseRead && !majorGpaRead && (!input.pointer.startsWith(root) || (!root.endsWith('_') && input.pointer !== root && !input.pointer.startsWith(root + '/')))
      || input.pointer.split('/').some(segment => sensitive.test(segment)))
      throw new HarnessError('pointer_forbidden', "This content address belongs to another resource. Follow the entry returned by the current resource.");
    // Generic source envelopes need endpoint verification before data access.
    if (root === '/normalized/items' || input.resource === 'source_status') throw new HarnessError('pointer_ambiguous', "Open this resource with quick/select. Returned items preserve their original sources.");
  }
  if (input.operation === 'diff' && (!input.fromBundle || !input.toBundle || !input.resource)) throw new HarnessError('bundles_required', "Comparison needs two real snapshots and a specific resource.");
  return input;
}

/** Keep a displayed lookup page on its actual source, including the course
 * predicate added by the adapter. Relative windows become fixed instants;
 * time-dependent membership still needs a new query instead of a next page. */
export function campusLookupOnSnapshot(input: Record<string, any>, result: Record<string, any>) {
  const bundleId = result.bundleId ?? result.bundle_id, proof = result.snapshotProof;
  const resource = input.domain === 'schedule' ? 'classes' : input.domain === 'gpa' ? 'gpa_overall' : input.domain;
  if (typeof bundleId !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(bundleId)
    || input.bundleId && input.bundleId !== bundleId || proof?.bundleId !== bundleId
    || proof.sourceId !== 'campus:academic-account' || proof.resource !== resource
    || typeof proof.version !== 'string' || !/^[a-f0-9]{64}$/.test(proof.version)
    || input.expectedSnapshotVersion && input.expectedSnapshotVersion !== proof.version) return;
  const args: Record<string, any> = { ...structuredClone(input), bundleId, expectedSnapshotVersion: proof.version, refresh: false };
  if (args.domain === 'courses' && Array.isArray(result.recordSelection?.filters)
    && result.recordSelection.filters.every((filter: unknown) => typeof filter === 'string'))
    args.filters = [...result.recordSelection.filters];
  const interval = result.timeInterval ?? result.time_interval;
  const instant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
  let fixed = true;
  if (args.at) { if (instant(interval?.from)) args.at = interval.from; else fixed = false; }
  else if (args.window || args.from || args.to) {
    if ((args.window || args.from) && !instant(interval?.from) || (args.window || args.to) && !instant(interval?.to)) fixed = false;
    else { delete args.window; if (instant(interval?.from)) args.from = interval.from; if (instant(interval?.to)) args.to = interval.to; }
  }
  const dynamic = new Set(['ongoing', 'ended', 'minutes_from_now']);
  if ((args.filters || []).some((filter: string) => dynamic.has(filter.split(':')[0].split('.').at(-1)!))
    || typeof args.sort === 'string' && args.sort.split(',').some((part: string) => dynamic.has(part.trim().replace(/^-/, '').split('.').at(-1)!))) fixed = false;
  return { arguments: args, evaluation: {
    ...(instant(result.evaluatedAt ?? result.evaluated_at) ? { at: result.evaluatedAt ?? result.evaluated_at } : {}),
    paging: fixed ? 'fixed_conditions' as const : 'evaluation_dependent' as const,
    dynamicValues: ['schedule', 'exams'].includes(args.domain) && (!args.fields || args.fields.some((field: string) => dynamic.has(field.split('.').at(-1)!))),
  } };
}

export function requireCampusQueryScope(policy: PolicyKernel, scope: ScopeHandle, input: CampusQuery) {
  policy.require(scope, 'campus:read');
  for (const grant of campusQueryGrants(input)) policy.require(scope, grant);
}
export function campusQueryGrants(input: CampusQuery) {
  if (['resources', 'schema'].includes(input.operation)) return [];
  const selected = new Set([input.resource, input.spec?.resource, ...(input.spec?.resources || []), input.spec?.join?.resource].filter((item): item is (typeof campusResources)[number] => !!item));
  return [...new Set([...selected].flatMap(item => grants[item] ? [grants[item]!] : []).concat(campusQueryReadsCourseGrades(input) ? ['campus:grades:read'] : []))];
}

/** These are actual connector field paths, including relative any/all paths.
 * Values and output aliases are never interpreted as source field names. */
export function campusQueryReadsCourseGrades(input: CampusQuery): boolean {
  if (['resources', 'schema', 'history'].includes(input.operation)) return false;
  const spec = input.spec, root = input.resource || spec?.resource;
  const rootCourses = (spec?.resources || [root]).includes('courses');
  const joinAlias = spec?.join?.resource === 'courses' ? spec.join.as || 'joined' : undefined;
  if (!rootCourses && !joinAlias) return false;
  const pathUsesGrades = (path: string, fullObject = false, transformed = false) => {
    let parts = path.split('.');
    if (transformed && ['conflicts', 'transitions'].includes(spec?.operation || '')) {
      if (!['first', 'second'].includes(parts[0])) return false;
      parts = parts.slice(1);
      if (!parts.length) return fullObject;
    }
    if (rootCourses && ['grade', 'grades'].includes(parts[0])) return true;
    return !!joinAlias && parts[0] === joinAlias && (parts.length === 1 ? fullObject : ['grade', 'grades'].includes(parts[1]));
  };
  const condition = (value: unknown, parent = '', transformed = false): boolean => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const object = value as Record<string, any>;
    if (['and', 'or'].some(key => Array.isArray(object[key]) && object[key].some((item: unknown) => condition(item, parent, transformed)))) return true;
    if (object.not && condition(object.not, parent, transformed)) return true;
    for (const key of ['any', 'all']) if (object[key] && typeof object[key].field === 'string') {
      const path = [parent, object[key].field].filter(Boolean).join('.');
      if (pathUsesGrades(path, true, transformed) || condition(object[key].where, path, transformed)) return true;
    }
    return typeof object.field === 'string' && pathUsesGrades([parent, object.field].filter(Boolean).join('.'), !['exists', 'missing'].includes(object.op), transformed);
  };
  if (input.operation === 'read') {
    const parts = input.pointer?.slice(normalizedRoots.courses.length).split('/').filter(Boolean) || [];
    return parts.length <= 1 || ['grade', 'grades'].includes(parts[1]);
  }
  if (!spec) return input.operation === 'diff' && !input.fields?.length
    || (input.fields || []).some(value => pathUsesGrades(value, true));
  if (condition(spec.where) || condition(spec.after_join_where)
    || [...(spec.sort || []), ...(spec.distinct || []), ...(spec.group_by || [])].some(value => pathUsesGrades(typeof value === 'string' ? value : value.field, true))
    || spec.metrics?.some(metric => !!metric.field && pathUsesGrades(metric.field, true) || !!metric.weight && pathUsesGrades(metric.weight, true) || condition(metric.where))
    || spec.time && [spec.time.field, spec.time.end_field].some(value => !!value && pathUsesGrades(value, true))
    || spec.join && (rootCourses && pathUsesGrades(spec.join.left_on, true) || joinAlias && ['grade', 'grades'].includes(spec.join.right_on.split('.')[0]))) return true;
  const operation = spec.operation || 'select';
  if (operation === 'aggregate' || operation === 'gaps') return false;
  return !spec.fields?.length || spec.fields.some(value => pathUsesGrades(value, true, true))
    || condition(spec.having, '', true) || (spec.order_by || []).some(value => pathUsesGrades(typeof value === 'string' ? value : value.field, true, true));
}
export function campusLookupReadsCourseGrades(input: { domain?: string; fields?: string[]; filters?: string[]; sort?: string }) {
  if (input.domain !== 'courses') return false;
  const paths = [...(input.fields || []), ...(input.filters || []).map(value => value.split(':')[0].trim()),
    ...(input.sort || '').split(',').map(value => value.trim().replace(/^-/, ''))].filter(Boolean);
  return campusQueryReadsCourseGrades({ operation: 'quick', resource: 'courses', fields: paths, offset: 0, limit: 1, refresh: false });
}

/** Preserve the evaluated window; relative selectors are not re-evaluated at
 * the next page. Time-derived membership/order needs a new query baseline. */
export function campusQueryOnSnapshot(input: CampusQuery, result: Record<string, any>) {
  let pinned: CampusQuery;
  try { pinned = structuredClone(campusCourseQueryForSemester(input, result.semester_id)); }
  catch (error) { if (error instanceof HarnessError && error.code === 'campus_semester_unknown') return; throw error; }
  const time = pinned.spec?.time, interval = result.time_interval;
  const validTime = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
  let fixed = true;
  if (time?.at) {
    if (!validTime(interval?.from)) fixed = false;
    else { time.at = interval.from; delete time.from; delete time.to; delete time.window; }
  } else if (time && (time.window || time.from || time.to)) {
    if ((time.window || time.from) && !validTime(interval?.from) || (time.window || time.to) && !validTime(interval?.to)) fixed = false;
    else { delete time.window; if (validTime(interval?.from)) time.from = interval.from;
      if (validTime(interval?.to)) time.to = interval.to; }
  }
  const dynamic = new Set(['ongoing', 'ended', 'minutes_from_now']);
  const hasDynamicField = (value: unknown, fields = false): boolean => {
    if (typeof value === 'string') return fields && dynamic.has(value.split('.').at(-1)!);
    if (Array.isArray(value)) return value.some(item => hasDynamicField(item, fields));
    return !!value && typeof value === 'object' && Object.entries(value).some(([key, child]) =>
      hasDynamicField(child, ['field', 'sort', 'order_by', 'group_by', 'distinct', 'weight'].includes(key)));
  };
  const spec = pinned.spec;
  const dependent = hasDynamicField(spec && { where: spec.where, after_join_where: spec.after_join_where,
    having: spec.having, sort: spec.sort, order_by: spec.order_by, group_by: spec.group_by, distinct: spec.distinct, metrics: spec.metrics })
    || spec?.operation === 'gaps' && !time?.from;
  pinned.refresh = false;
  if (['quick', 'select', 'read'].includes(input.operation)) {
    if (typeof result.bundle_id !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(result.bundle_id)
      || input.bundleId && input.bundleId !== result.bundle_id) return;
    pinned.bundleId = result.bundle_id;
    if (typeof result.snapshotProof?.version === 'string') pinned.expectedSnapshotVersion = result.snapshotProof.version;
  }
  return { arguments: validateCampusQuery(pinned), evaluation: {
    ...(validTime(result.evaluated_at) ? { at: result.evaluated_at } : {}),
    paging: fixed && !dependent ? 'fixed_conditions' as const : 'evaluation_dependent' as const,
    dynamicValues: !(input.operation === 'read' && input.resource === 'exams' && input.pointer === examCourseRecordsPointer)
      && ['classes', 'exams'].includes(input.resource || input.spec?.resource || '')
      && (!spec?.fields || hasDynamicField(spec.fields, true)),
  } };
}

/** A next page is the same declared query on the source's actual snapshot,
 * not a request to refresh it or silently start another query. */
export function campusQueryContinuation(input: CampusQuery, result: Record<string, any>) {
  const nextOffset = result.next_offset, currentOffset = input.spec?.offset ?? input.offset;
  if (!['ok', 'partial'].includes(result.status) || !Number.isSafeInteger(nextOffset)
    || nextOffset <= currentOffset || nextOffset > 1000000) return;
  const frozen = campusQueryOnSnapshot(input, result);
  if (!frozen || frozen.evaluation.paging !== 'fixed_conditions') return;
  const next = frozen.arguments;
  next.offset = nextOffset;
  next.refresh = false;
  if (next.spec) next.spec.offset = nextOffset;
  return { capability: 'campus.query' as const, arguments: validateCampusQuery(next),
    meaning: input.operation === 'read' && input.resource === 'exams' && input.pointer === examCourseRecordsPointer
      ? "Continue reading original course records in this exam collection. Pagination counts courses; each course lists its exam occurrences separately."
      : input.operation === 'history' ? "Continue the saved-version catalog for this resource. New queries may update that catalog."
      : input.operation === 'diff' ? "Continue comparing the same two records. Differences occurred between observations; exact change time needs source evidence."
      : input.spec?.join || (input.spec?.resources?.length || 0) > 1
      ? "Continue the same query's next page. The main record keeps this version, while joined sources recheck their own versions."
      : "Continue the same record with the previous conditions. Time-dependent states use the current instant; missing source portions remain marked." };
}
