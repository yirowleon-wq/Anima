import { createHash } from 'node:crypto';
import type { Action } from '../../shared/types';
import { calendarExportInput } from '../../shared/calendar-export';
import { HarnessError } from '../../shared/harness';
import { expandAgenda } from './calendar';
import { calendarCommitment } from './planning';
import { addDate } from '../runtime/semantics';

// RFC 5545 text escaping and UTF-8 octet folding. No executable content or invitations.
const text = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
function fold(line: string) {
  let out = '', current = '', bytes = 0;
  for (const point of line) {
    const length = Buffer.byteLength(point, 'utf8');
    if (bytes + length > 75) { out += current + '\r\n'; current = ' '; bytes = 1; }
    current += point; bytes += length;
  }
  return out + current;
}
const stamp = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

/** Finite snapshot of accepted local occurrences; not a subscription or cross-device sync. */
export function exportCalendarSnapshot(items: Action[], raw: unknown, now: string) {
  const input = calendarExportInput.parse(raw);
  if (!Number.isFinite(Date.parse(now))) throw new HarnessError('invalid_time', "The current time could not be read.");
  try { new Intl.DateTimeFormat('en', { timeZone: input.timeZone }); }
  catch { throw new HarnessError('time_zone', "Choose a valid time zone."); }
  const accepted = items.filter(item => !item.done && !item.demo && calendarCommitment(item).state === 'accepted');
  const expanded = expandAgenda(accepted, input.from, input.to, input.timeZone);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Anima//Personal Calendar//ZH', 'CALSCALE:GREGORIAN', "X-WR-CALNAME:Anima · My schedule"];
  const reasons = new Set<string>(); let count = 0, omitted = expanded.issues.length;
  if (expanded.issues.length) reasons.add("Some dates or times still need confirmation and were left out of the file.");
  for (const item of expanded.items) {
    const allDay = typeof item.allDayDate === 'string' ? item.allDayDate : undefined;
    const start = typeof item.startsAt === 'string' ? item.startsAt : undefined;
    const end = typeof item.endsAt === 'string' ? item.endsAt : undefined;
    const point = item.kind === 'deadline' || item.kind === 'reminder';
    if (!allDay && (!start || !end && !point)) {
      omitted++; reasons.add("Some events have no confirmed end time. Add that time to include them in the export."); continue;
    }
    const uid = createHash('sha256').update(String(item.occurrenceId)).digest('hex') + '@anima.local';
    lines.push('BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + stamp(now), 'SEQUENCE:' + Math.max(0, Number(item.revision || 1)), 'CLASS:PRIVATE', 'STATUS:CONFIRMED', 'SUMMARY:' + text(String(item.title)));
    if (allDay) lines.push('DTSTART;VALUE=DATE:' + allDay.replaceAll('-', ''), 'DTEND;VALUE=DATE:' + addDate(allDay, 1).replaceAll('-', ''));
    else {
      lines.push('DTSTART:' + stamp(start!));
      if (end) lines.push('DTEND:' + stamp(end));
    }
    if (!calendarCommitment(item as unknown as Action).occupiesTime) lines.push('TRANSP:TRANSPARENT');
    if (input.includeDetails && typeof item.detail === 'string' && item.detail) lines.push('DESCRIPTION:' + text(item.detail));
    lines.push('END:VEVENT'); count++;
  }
  lines.push('END:VCALENDAR');
  return { content: lines.map(fold).join('\r\n') + '\r\n', count, omitted, reasons: [...reasons], snapshot: true as const };
}
