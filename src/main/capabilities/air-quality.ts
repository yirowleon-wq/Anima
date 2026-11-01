import * as z from 'zod';
import { HarnessError } from '../../shared/harness';
import { weatherInput, weatherRequest } from './weather';
import { addDate, dateInZone, dayBounds } from '../runtime/semantics';

export const airQualityInput = z.object({
  location: weatherInput.shape.location,
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
}).strict();
const columns = ['pm2_5', 'pm10', 'us_aqi', 'european_aqi'] as const;
export const airQualityOutput = z.object({
  location: z.string(), timeZone: z.string(),
  reference: z.object({ latitude: z.number(), longitude: z.number(), basis: z.string(), userLocation: z.literal(false) }).strict(),
  window: z.object({ from: z.string(), to: z.string(), complete: z.boolean() }).strict(),
  samples: z.array(z.object({ at: z.string(), localTime: z.string(), pm2_5: z.number().nullable(), pm10: z.number().nullable(), us_aqi: z.number().nullable(), european_aqi: z.number().nullable() }).strict()),
  units: z.object({ pm2_5: z.literal('μg/m³'), pm10: z.literal('μg/m³'), us_aqi: z.literal('US AQI'), european_aqi: z.literal('European AQI') }).strict(),
  kind: z.literal('model_forecast'), retrievedAt: z.string(), issuedAt: z.null(),
  source: z.literal('Open-Meteo / CAMS'), sourceUrl: z.string(), limitations: z.array(z.string()),
}).strict();

/** Public references only; the accepted shape cannot contain a device fix. */
export function airQualityRequest(raw: unknown, now: string) {
  const input = airQualityInput.parse(raw);
  const location = weatherRequest({ location: input.location }, now).location;
  if (!!input.from !== !!input.to) throw new HarnessError('air_quality_window', "Supply both start and end times for air quality, or omit both.");
  const from = input.from || new Date(Math.floor(Date.parse(now) / 3600000) * 3600000).toISOString();
  const to = input.to || new Date(Date.parse(from) + 24 * 3600000).toISOString();
  const first = Math.floor(Date.parse(from) / 3600000) * 3600000, end = Date.parse(to);
  const today = dateInZone(now, location.timeZone), earliest = Date.parse(dayBounds(today, location.timeZone).from),
    latest = Date.parse(dayBounds(addDate(today, 4), location.timeZone).to);
  if (end <= Date.parse(from) || Date.parse(from) < earliest || end > latest)
    throw new HarnessError('air_quality_window', "Air-quality forecasts cover a valid window within the selected location's next five local dates, using natural-day boundaries. Later periods remain unknown.");
  const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
  url.search = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude),
    hourly: columns.join(','), timezone: 'UTC', timeformat: 'unixtime',
    start_date: new Date(first).toISOString().slice(0, 10), end_date: new Date(end - 1).toISOString().slice(0, 10) }).toString();
  return { location, from, to, first, end, url };
}

export function airQualityResult(query: ReturnType<typeof airQualityRequest>, raw: any, retrievedAt: string) {
  const times = raw?.hourly?.time;
  if (!Array.isArray(times) || times.some((value: unknown) => typeof value !== 'number' || !Number.isFinite(value))
    || columns.some(column => !Array.isArray(raw.hourly[column]) || raw.hourly[column].length !== times.length))
    throw new HarnessError('air_quality_incomplete', "The air-quality source did not return complete, aligned hourly columns.");
  const units = raw.hourly_units || {};
  if (!['μg/m³', 'µg/m³'].includes(units.pm2_5) || !['μg/m³', 'µg/m³'].includes(units.pm10)
    || units.us_aqi !== 'USAQI' || units.european_aqi !== 'EAQI')
    throw new HarnessError('air_quality_units', "The source units or AQI scale do not match. The numbers were not accepted as usable results.");
  if (times.some((value: number, index: number) => index > 0 && value <= times[index - 1]))
    throw new HarnessError('air_quality_time', "Air-quality timestamps are duplicated or out of order.");
  const indices = times.flatMap((value: number, index: number) => value * 1000 >= query.first && value * 1000 < query.end ? [index] : []);
  const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  const local = new Intl.DateTimeFormat('sv-SE', { timeZone: query.location.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const samples = indices.map(index => ({ at: new Date(times[index] * 1000).toISOString(),
    localTime: local.format(new Date(times[index] * 1000)),
    pm2_5: finite(raw.hourly.pm2_5[index]), pm10: finite(raw.hourly.pm10[index]),
    us_aqi: finite(raw.hourly.us_aqi[index]), european_aqi: finite(raw.hourly.european_aqi[index]),
  }));
  const expected = Math.ceil((query.end - query.first) / 3600000);
  const complete = samples.length === expected && samples.every((sample, index) =>
    Date.parse(sample.at) === query.first + index * 3600000 && columns.every(column => sample[column] !== null));
  return { complete, data: airQualityOutput.parse({ location: query.location.label, timeZone: query.location.timeZone,
    reference: { latitude: query.location.latitude, longitude: query.location.longitude, basis: query.location.basis, userLocation: false },
    window: { from: query.from, to: query.to, complete }, samples,
    units: { pm2_5: 'μg/m³', pm10: 'μg/m³', us_aqi: 'US AQI', european_aqi: 'European AQI' },
    kind: 'model_forecast', retrievedAt, issuedAt: null, source: 'Open-Meteo / CAMS', sourceUrl: 'https://open-meteo.com/en/docs/air-quality-api',
    limitations: ["This forecast comes from a model grid near the selected public reference point. Conditions at a particular campus location may differ.",
      "US AQI and European AQI retain their distinct scales. Check a local monitoring agency for official station observations.",
      "Each hourly forecast represents its stated time. A window starting between hours includes the preceding whole hour for reference.",
      "Missing measurements remain null. The source supplied no forecast issue time.",
      "When planning exercise, consider current comfort, weather and facility opening conditions too."] }) };
}
