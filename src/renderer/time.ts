import { DEFAULT_SETTINGS } from '../shared/types';

export const DEFAULT_TIME_ZONE = DEFAULT_SETTINGS.timeZone || 'America/Los_Angeles';

function parts(instant: string | number, timeZone: string) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
}

export function timeZoneLabel(timeZone = DEFAULT_TIME_ZONE) {
  try {
    return (
      new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'long' })
        .formatToParts(new Date())
        .find((part) => part.type === 'timeZoneName')?.value || timeZone
    );
  } catch {
    return 'Time zone needs review';
  }
}

export function formatDateTime(
  value: string,
  timeZone = DEFAULT_TIME_ZONE,
  options: Intl.DateTimeFormatOptions = {},
) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      ...options,
      timeZone,
    }).format(new Date(value));
  } catch {
    return 'Time needs review';
  }
}

/** A civil clock value for datetime-local, explicitly independent of the OS zone. */
export function toTimeInput(value?: string, timeZone = DEFAULT_TIME_ZONE) {
  if (!value) return '';
  try {
    const p = parts(value, timeZone);
    return `${p.year.padStart(4, '0')}-${p.month}-${p.day}T${p.hour}:${p.minute}${p.second === '00' ? '' : ':' + p.second}`;
  } catch {
    return '';
  }
}

/** Resolve an edited civil time without silently choosing a DST fold or gap. */
export function fromTimeInput(value: string, timeZone = DEFAULT_TIME_ZONE, original?: string) {
  if (!value) return undefined;
  if (original && toTimeInput(original, timeZone) === value) return new Date(original).toISOString();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) throw new Error('Enter a complete date and time.');
  const stamp = value.length === 16 ? value + ':00' : value;
  const civil = Date.parse(stamp + 'Z');
  if (!Number.isFinite(civil) || new Date(civil).toISOString().slice(0, 19) !== stamp)
    throw new Error('This date or time is invalid. Check it before saving.');
  const offsets = new Set<number>();
  try {
    for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
      const instant = civil + hours * 3600000,
        p = parts(instant, timeZone);
      offsets.add(
        Date.parse(`${p.year.padStart(4, '0')}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`) -
          instant,
      );
    }
  } catch {
    throw new Error('This event’s time zone needs review. Your changes have not been saved.');
  }
  const instants = [...offsets]
    .map((offset) => new Date(civil - offset).toISOString())
    .filter((instant) => {
      const p = parts(instant, timeZone);
      return `${p.year.padStart(4, '0')}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}` === stamp;
    });
  if (!instants.length) throw new Error('This local time does not exist on that date in this time zone. Choose another time.');
  if (instants.length > 1)
    throw new Error('This local time occurs twice on that date. Specify the UTC offset in chat, or choose an unambiguous time.');
  return instants[0];
}
