import { HarnessError } from '../../shared/harness';
type Row = Record<string, any>;
const get = (row: Row, field?: string): any => row != null && typeof field === 'string'
  ? Object.hasOwn(row, field) ? row[field] : field.split('.').reduce((value, key) => value?.[key], row) : undefined;
function condition(row: Row, test: any): boolean {
  if (!test || typeof test !== 'object') return true;
  if (Array.isArray(test.and)) return test.and.every((item: any) => condition(row, item));
  if (Array.isArray(test.or)) return test.or.some((item: any) => condition(row, item));
  if (test.not) return !condition(row, test.not);
  if (test.any || test.all) { const selected = test.any || test.all, values = get(row, selected.field); return Array.isArray(values)
    && (test.any ? values.some(item => condition(item, selected.where)) : values.every(item => condition(item, selected.where))); }
  const value = get(row, String(test.field || '')), expected = test.value;
  switch (test.op || 'eq') {
    case 'eq': return value === expected || typeof expected === 'string' && value != null && String(value) === expected;
    case 'ne': return !condition(row, { ...test, op: 'eq' });
    case 'in': return Array.isArray(expected) && expected.includes(value);
    case 'not_in': return Array.isArray(expected) && !expected.includes(value);
    case 'contains': return typeof value === 'string' ? value.toLocaleLowerCase('en-US').includes(String(expected).toLocaleLowerCase('en-US')) : Array.isArray(value) && value.includes(expected);
    case 'starts_with': return typeof value === 'string' && value.startsWith(String(expected));
    case 'ends_with': return typeof value === 'string' && value.endsWith(String(expected));
    case 'length_gt': return (typeof value === 'string' || Array.isArray(value)) && value.length > Number(expected);
    case 'length_eq': return (typeof value === 'string' || Array.isArray(value)) && value.length === Number(expected);
    case 'gt': return value != null && value > expected;
    case 'gte': return value != null && value >= expected;
    case 'lt': return value != null && value < expected;
    case 'lte': return value != null && value <= expected;
    case 'missing': return value == null;
    case 'exists': return value != null;
    default: throw new HarnessError('campus_condition', 'This campus comparison operator is not supported.');
  }
}
function metric(rows: Row[], spec: any): any {
  const values = rows.map(row => get(row, spec.field)), numbers = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  switch (spec.op) {
    case 'count': return rows.length;
    case 'count_where': return rows.filter(row => condition(row, spec.where)).length;
    case 'fraction': return rows.length ? rows.filter(row => condition(row, spec.where)).length / rows.length : null;
    case 'count_distinct': return new Set(values.filter(value => value != null).map(value => JSON.stringify(value))).size;
    case 'sum': return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) : null;
    case 'mean': return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
    case 'min': return numbers.length ? Math.min(...numbers) : null;
    case 'max': return numbers.length ? Math.max(...numbers) : null;
    case 'median': { const sorted = numbers.slice().sort((a, b) => a - b), middle = Math.floor(sorted.length / 2); return sorted.length ? sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2 : null; }
    case 'first': return values[0] ?? null;
    case 'last': return values.at(-1) ?? null;
    case 'weighted_mean': { const included = rows.filter(row => typeof get(row, spec.field) === 'number' && Number.isFinite(get(row, spec.field)) && typeof get(row, spec.weight) === 'number' && get(row, spec.weight) > 0), denominator = included.reduce((sum, row) => sum + get(row, spec.weight), 0);
      return denominator ? included.reduce((sum, row) => sum + get(row, spec.field) * get(row, spec.weight), 0) / denominator : null; }
    default: throw new HarnessError('campus_metric', 'This campus summary operation is not supported.');
  }
}
/** Bounded analysis of one source snapshot; never acquisition or a business action. */
export function selectCampusRows(input: Row[], spec: any, resources: Record<string, Row[]>): { rows: Row[]; unknownTime: number; metricQuality: Row[] } {
  let rows = input.map(row => ({ ...row })), unknownTime = 0;
  const metricQuality:Row[]=[];
  if (spec.resources?.length) rows = spec.resources.flatMap((resource: string) => { if (!resources[resource]) throw new HarnessError('campus_resource_missing', `The imported source does not contain ${resource}.`); return resources[resource].map(row => ({ ...row, resource })); });
  rows = rows.filter(row => condition(row, spec.where));
  if (spec.join) { const join = spec.join, right = resources[join.resource]; if (!right) throw new HarnessError('campus_join_source', 'The imported snapshot lacks the joined resource.');
    rows = rows.flatMap(row => { const matches = right.filter(item => get(row, join.left_on) === get(item, join.right_on)); return matches.length ? matches.map(item => ({ ...row, [join.as || join.resource]: { ...item } })) : join.kind === 'inner' ? [] : [{ ...row, [join.as || join.resource]: null }]; }); }
  rows = rows.filter(row => condition(row, spec.after_join_where));
  if (spec.time) { const time = spec.time, start = time.from ? Date.parse(time.from) : -Infinity, end = time.to ? Date.parse(time.to) : Infinity, at = time.at ? Date.parse(time.at) : undefined;
    rows = rows.filter(row => { const lo = Date.parse(get(row, time.field || 'startTime') || row.starts_at || row.startsAt), hi = Date.parse(get(row, time.end_field || 'endTime') || row.ends_at || row.endsAt);
      if (!Number.isFinite(lo)) { unknownTime++; return false; } if (at !== undefined) { if (!Number.isFinite(hi)) { unknownTime++; return false; } return lo <= at && at < hi; }
      if (time.mode === 'starts') return lo >= start && lo < end; if (!Number.isFinite(hi)) { unknownTime++; return false; }
      return time.mode === 'contained' ? lo >= start && hi <= end : lo < end && hi > start; }); }
  if (['conflicts', 'transitions', 'gaps'].includes(spec.operation)) {
    const timed = rows.flatMap(row => { const start = Date.parse(row.startTime || row.startsAt || row.starts_at), end = Date.parse(row.endTime || row.endsAt || row.ends_at);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) { unknownTime++; return []; } return [{ row, start, end }]; }).sort((a, b) => a.start - b.start);
    if (spec.operation === 'conflicts') rows = timed.flatMap((left, index) => timed.slice(index + 1).filter(right => right.start < left.end && right.end > left.start)
      .map(right => ({ left: left.row, right: right.row, overlapFrom: new Date(Math.max(left.start, right.start)).toISOString(), overlapTo: new Date(Math.min(left.end, right.end)).toISOString() })));
    else rows = timed.slice(1).map((next, index) => ({ before: timed[index].row, after: next.row, from: new Date(timed[index].end).toISOString(), to: new Date(next.start).toISOString(), minutes: (next.start - timed[index].end) / 60000,
      meaning: spec.operation === 'gaps' ? 'Gap between these known intervals only; unknown occupancy is not free time.' : 'Interval between known events, not a verified travel duration.' })).filter(row => spec.operation !== 'gaps' || row.minutes > 0);
  }
  if (spec.metrics?.length || spec.operation === 'aggregate' || spec.group_by?.length) { const groups = new Map<string, Row[]>(), fields: string[] = spec.group_by || [];
    for (const row of rows) { const key = JSON.stringify(fields.map(field => get(row, field) ?? null)); groups.set(key, [...(groups.get(key) || []), row]); }
    if (!fields.length && !groups.size) groups.set('[]', []);
    rows = [...groups].map(([key, items]) => ({ ...Object.fromEntries(fields.map((field, index) => [field, JSON.parse(key)[index]])), ...Object.fromEntries((spec.metrics || [{ op: 'count', as: 'count' }]).map((item: any, index: number) => {
      const name=item.as||`${item.op}_${index}`,known=items.filter(row=>item.op==='weighted_mean'
        ?typeof get(row,item.field)==='number'&&Number.isFinite(get(row,item.field))&&typeof get(row,item.weight)==='number'&&get(row,item.weight)>0
        :['count','count_where','fraction'].includes(item.op)?true
          :['sum','mean','median','min','max'].includes(item.op)?typeof get(row,item.field)==='number'&&Number.isFinite(get(row,item.field)):get(row,item.field)!=null);
      metricQuality.push({group:JSON.parse(key),metric:name,sourceRows:items.length,knownRows:known.length,omittedRows:items.length-known.length,complete:known.length===items.length,
        meaning:'Numeric summaries use known finite values only. Omitted values are not zero and prevent a complete-population conclusion.'});
      return [name,metric(items,item)];
    })) })); }
  rows = rows.filter(row => condition(row, spec.having));
  if (spec.distinct?.length) { const seen = new Set<string>(); rows = rows.filter(row => { const key = JSON.stringify(spec.distinct.map((field: string) => get(row, field) ?? null)); if (seen.has(key)) return false; seen.add(key); return true; }); }
  const order: any[] = spec.order_by || spec.sort || [];
  if (order.length) rows.sort((a, b) => { for (const item of order) { const field = typeof item === 'string' ? item.replace(/^-/, '') : item.field, descending = typeof item === 'string' ? item.startsWith('-') : item.descending, left = get(a, field), right = get(b, field);
    if (left == null && right == null) continue; if (left == null) return 1; if (right == null) return -1;
    const comparison = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), 'en-US'); if (comparison) return descending ? -comparison : comparison; } return 0; });
  if (spec.fields?.length) rows = rows.map(row => Object.fromEntries(spec.fields.map((field: string) => [field, get(row, field) ?? null])));
  return { rows, unknownTime, metricQuality };
}
