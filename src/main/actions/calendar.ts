import type { Action } from '../../shared/types';
import { calendarFieldsSchema, localCalendarChangeSchema } from '../../shared/calendar';
import { HarnessError } from '../../shared/harness';
import { addDate, dateInZone, resolveLocalTime } from '../runtime/semantics';
import { planningDayBounds } from './planning-days';

export function localStamp(instant: string, timeZone: string) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(instant)).replace(' ', 'T');
}
const dayNumber = (date: string) => Math.floor(Date.parse(date + 'T12:00:00Z') / 86400000);
function matchesDate(date: string, anchor: string, rule: NonNullable<Action['recurrence']>) {
  const difference = dayNumber(date) - dayNumber(anchor);
  if (difference < 0) return false;
  const day = new Date(date + 'T12:00:00Z').getUTCDay();
  if (rule.weekdays?.length && !rule.weekdays.includes(day)) return false;
  const interval = rule.interval || 1;
  if (rule.frequency === 'daily') return difference % interval === 0;
  if (rule.frequency === 'weekly') {
    const anchorDay = new Date(anchor + 'T12:00:00Z').getUTCDay();
    return Math.floor((difference + ((anchorDay + 6) % 7)) / 7) % interval === 0 && (rule.weekdays?.length ? true : day === anchorDay);
  }
  const [y, m, d] = date.split('-').map(Number), [ay, am, ad] = anchor.split('-').map(Number);
  return rule.frequency === 'monthly' ? ((y - ay) * 12 + m - am) % interval === 0 && d === ad : (y - ay) % interval === 0 && m === am && d === ad;
}

export function normalizeCalendarInput<T extends { title: string; detail: string; startsAt?: string; durationMinutes?: number } & import('../../shared/calendar').CalendarFields>(input: T, hostTimeZone: string): T {
  calendarFieldsSchema.parse(input);
  const timeZone = input.timeZone || hostTimeZone;
  try { new Intl.DateTimeFormat('en', { timeZone }); } catch { throw new HarnessError('time_zone', "The time zone is invalid."); }
  if (input.allDayDate && input.startsAt) throw new HarnessError('time_object', "An all-day date and a specific start time cannot both be supplied.");
  if (input.durationMinutes && !input.startsAt) throw new HarnessError('time_object', "A duration needs a corresponding start time.");
  if ((input.kind === 'event' || input.kind === 'time_block' || input.kind === 'reminder') && !input.startsAt && !input.allDayDate)
    throw new HarnessError('time_missing', "This time object has neither a date nor a start time.");
  if (input.kind === 'time_block' && !input.durationMinutes) throw new HarnessError('duration_missing', "A time block needs a duration. A start-only item can be recorded as an event.");
  if (input.recurrence && !input.startsAt && !input.allDayDate) throw new HarnessError('recurrence_anchor', "A recurring event needs a start date.");
  if (input.exceptions?.length && !input.recurrence) throw new HarnessError('recurrence_missing', "An occurrence exception needs its recurring series.");
  const anchor = input.allDayDate || (input.startsAt ? dateInZone(input.startsAt, timeZone) : undefined);
  if (input.recurrence && input.recurrence.untilDate && anchor && input.recurrence.untilDate < anchor)
    throw new HarnessError('recurrence_range', "The recurrence end date precedes its start date.");
  for (const exception of input.exceptions || []) if (anchor && input.recurrence) {
    if (!matchesDate(exception.onDate, anchor, input.recurrence) || (input.recurrence.untilDate && exception.onDate > input.recurrence.untilDate))
      throw new HarnessError('occurrence_missing', "The specified date does not belong to this recurring series.");
    if (input.recurrence.count) {
      let count = 0;
      if (dayNumber(exception.onDate) - dayNumber(anchor) > 40000) throw new HarnessError('recurrence_budget', "The series exceeds the current calculation range.");
      for (let date = anchor; date <= exception.onDate; date = addDate(date, 1)) if (matchesDate(date, anchor, input.recurrence)) count++;
      if (count > input.recurrence.count) throw new HarnessError('occurrence_missing', "The requested occurrence exceeds the series count.");
    }
  }
  return { ...input, kind: input.kind || (input.startsAt || input.allDayDate ? 'event' : 'todo'), timeZone,
    ...(input.recurrence ? { recurrence: { ...input.recurrence, interval: input.recurrence.interval || 1, ...(input.recurrence.weekdays ? { weekdays: [...new Set(input.recurrence.weekdays)].sort() } : {}) } } : {}),
    ...(input.startsAt ? { startsAt: new Date(input.startsAt).toISOString() } : {}) };
}

/** Shared projection for review and transaction commit; never mutates the stored object. */
export function projectCalendarChange(previous: Action, raw: unknown, hostTimeZone: string): Action {
  const args = localCalendarChangeSchema.parse(raw);
  if (previous.id !== args.targetId || (previous.revision || 1) !== args.expectedRevision) throw new HarnessError('revision_conflict', "The event changed. Read its current version first.");
  if (args.operation === 'delete') throw new HarnessError('calendar_delete_projection', "Deletion has no new calendar projection.");
  let changed: Action;
  if (args.operation === 'change_occurrence') {
    if (!args.occurrenceDate || !previous.recurrence) throw new HarnessError('occurrence_missing', "An occurrence change needs the series and its original occurrence date.");
    if (Object.keys(args.changes || {}).some(key => !['startsAt', 'durationMinutes', 'detail'].includes(key))) throw new HarnessError('occurrence_fields', "An occurrence exception may change this occurrence's time, duration or description, without changing the whole series.");
    if (args.changes?.startsAt === null) throw new HarnessError('occurrence_time', "A one-time event cannot lose its start time. Cancel that occurrence if it will no longer happen.");
    const exception = { ...(previous.exceptions || []).find(item => item.onDate === args.occurrenceDate), onDate: args.occurrenceDate,
      ...(args.cancelled !== undefined ? { cancelled: args.cancelled } : {}), ...(args.changes || {}) };
    changed = { ...previous, exceptions: [...(previous.exceptions || []).filter(item => item.onDate !== args.occurrenceDate), exception] } as Action;
  } else {
    const value: Record<string, unknown> = { ...previous, ...args.changes };
    for (const [key, field] of Object.entries(value)) if (field === null) delete value[key];
    if (args.changes?.recurrence === null) delete value.exceptions;
    changed = value as unknown as Action;
  }
  changed = normalizeCalendarInput(changed, hostTimeZone);
  if (!previous.kind && !args.changes?.kind) delete changed.kind;
  return changed;
}

/** Calendar calculation only: no effects, inferred duration, or school rules. */
export function expandAgenda(items: Action[], from: string, to: string, fallbackTimeZone: string) {
  if (!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || Date.parse(to) <= Date.parse(from)) throw new HarnessError('time_window', "The query window is invalid.");
  if (Date.parse(to) - Date.parse(from) > 366 * 86400000) throw new HarnessError('time_window', "Read a shorter period, up to one year at a time.");
  const occurrences: Record<string, unknown>[] = [], issues: Record<string, unknown>[] = [];
  const unknownEnd = (item: Action, startsAt: string, date?: string) => {
    const prior = issues.find(issue => issue.id === item.id && issue.status === 'unknown_end');
    if (prior && Date.parse(String(prior.startsAt)) >= Date.parse(startsAt)) return;
    if (prior) issues.splice(issues.indexOf(prior), 1);
    issues.push({ id: item.id, ...(date ? { date } : {}), status: 'unknown_end', startsAt });
  };
  for (const item of items.filter(item => !item.done)) {
    const zone = item.timeZone || fallbackTimeZone;
    if (!item.recurrence) {
      const bounds = item.allDayDate ? planningDayBounds(item.allDayDate, zone) : null;
      if (bounds && Date.parse(bounds.to) <= Date.parse(bounds.from)) {
        if (Date.parse(bounds.from) >= Date.parse(from) && Date.parse(bounds.from) < Date.parse(to))
          issues.push({ id: item.id, date: item.allDayDate, status: 'nonexistent', reason: 'local_date_absent' });
        continue;
      }
      const start = bounds?.from || item.startsAt;
      const end = bounds?.to || (start && item.durationMinutes ? new Date(Date.parse(start) + item.durationMinutes * 60000).toISOString() : start);
      if (start && !bounds && !item.durationMinutes && (!item.kind || item.kind === 'event') && Date.parse(start) < Date.parse(from)) unknownEnd(item, start);
      if (start && end && Date.parse(start) < Date.parse(to) && (start === end ? Date.parse(start) >= Date.parse(from) : Date.parse(end) > Date.parse(from))) occurrences.push({ ...item, occurrenceId: item.id, ...(bounds ? { dateBounds: bounds } : { endsAt: item.durationMinutes ? end : null }) });
      continue;
    }
    const anchor = item.allDayDate || (item.startsAt ? dateInZone(item.startsAt, zone) : undefined);
    if (!anchor) { issues.push({ id: item.id, status: 'unknown', reason: 'missing_anchor' }); continue; }
    const last = [addDate(dateInZone(to, zone), 1), ...(item.exceptions || []).filter(entry => entry.startsAt && Date.parse(entry.startsAt) >= Date.parse(from) && Date.parse(entry.startsAt) < Date.parse(to)).map(entry => entry.onDate)].sort().at(-1)!;
    if (dayNumber(last) - dayNumber(anchor) > 40000) { issues.push({ id: item.id, status: 'partial', reason: 'series_outside_calculation_budget' }); continue; }
    let count = 0;
    for (let date = anchor; date <= last; date = addDate(date, 1)) {
      if (item.recurrence.untilDate && date > item.recurrence.untilDate) break;
      if (!matchesDate(date, anchor, item.recurrence)) continue;
      if (item.recurrence.count && ++count > item.recurrence.count) break;
      const exception = item.exceptions?.find(entry => entry.onDate === date);
      if (exception?.cancelled) continue;
      const dateWindow = planningDayBounds(date, zone);
      if (!exception?.startsAt && Date.parse(dateWindow.to) <= Date.parse(dateWindow.from)) {
        if (Date.parse(dateWindow.from) >= Date.parse(from) && Date.parse(dateWindow.from) < Date.parse(to))
          issues.push({ id: item.id, date, status: 'nonexistent', reason: 'local_date_absent' });
        continue;
      }
      const hasUnknownEnd = !item.allDayDate && !(exception?.durationMinutes === null ? undefined : exception?.durationMinutes ?? item.durationMinutes) && (!item.kind || item.kind === 'event');
      if (!exception?.startsAt && (Date.parse(dateWindow.to) <= Date.parse(from) && !hasUnknownEnd || Date.parse(dateWindow.from) >= Date.parse(to))) continue;
      const stamp = item.allDayDate ? null : date + 'T' + localStamp(item.startsAt!, zone).slice(11);
      const resolved = exception?.startsAt ? { status: 'resolved', instants: [exception.startsAt] } : stamp ? resolveLocalTime(stamp, zone) : null;
      if (resolved && resolved.status !== 'resolved') { issues.push({ id: item.id, date, status: resolved.status, instants: resolved.instants }); continue; }
      const startsAt = resolved?.instants[0], durationMinutes = exception?.durationMinutes === null ? undefined : exception?.durationMinutes ?? item.durationMinutes;
      if (startsAt && (Date.parse(startsAt) >= Date.parse(to) || (durationMinutes ? Date.parse(startsAt) + durationMinutes * 60000 <= Date.parse(from) : Date.parse(startsAt) < Date.parse(from)))) {
        if (!durationMinutes && (!item.kind || item.kind === 'event') && Date.parse(startsAt) < Date.parse(from)) unknownEnd(item, startsAt, date);
        continue;
      }
      const occurrence: Record<string, unknown> = { ...item, occurrenceId: `${item.id}::${date}`, originalDate: date,
        ...(item.allDayDate && !startsAt ? { allDayDate: date } : { startsAt, durationMinutes, endsAt: startsAt && durationMinutes ? new Date(Date.parse(startsAt) + durationMinutes * 60000).toISOString() : null }),
        detail: exception?.detail ?? item.detail, exception: !!exception,
      };
      if (startsAt) delete occurrence.allDayDate;
      if (durationMinutes === undefined) delete occurrence.durationMinutes;
      occurrences.push(occurrence);
    }
  }
  return { items: occurrences, issues, coverage: { complete: issues.length === 0, from, to }, status: issues.length ? 'partial' : occurrences.length ? 'fresh' : 'known_absent' };
}
