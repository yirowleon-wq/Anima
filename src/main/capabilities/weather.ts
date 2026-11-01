import * as z from 'zod';
import { HarnessError } from '../../shared/harness';
import { addDate, dateInZone, dayBounds } from '../runtime/semantics';
import type { EnvironmentCondition } from '../../shared/environment';
import { environmentReference } from '../../shared/campus-profile';

const publicLocation = z.object({
  id: z.string().min(1).max(100).optional(),
  label: z.string().min(1).max(120), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  timeZone: z.string().min(1).max(100), basis: z.literal('explicit_public_reference'),
}).strict();
export const weatherInput = z.object({
  days: z.number().int().min(1).max(7).default(3),
  location: publicLocation.default(() => environmentReference()),
  date: z.iso.date().optional(), from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional(),
}).strict();
const nullableNumbers = z.array(z.number().nullable());
const interval = z.object({ from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }) }).strict();
// Open-Meteo's WMO interpretation codes: https://open-meteo.com/en/docs#weathervariabledocumentation
const weatherCodeMeanings: Record<number, string> = {
  0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Depositing rime fog",
  51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle", 56: "Light freezing drizzle", 57: "Dense freezing drizzle",
  61: "Light rain", 63: "Moderate rain", 65: "Heavy rain", 66: "Light freezing rain", 67: "Heavy freezing rain",
  71: "Light snow", 73: "Moderate snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Light rain showers", 81: "Moderate rain showers", 82: "Violent rain showers", 85: "Light snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with small hail", 97: "Heavy thunderstorm", 99: "Thunderstorm with heavy hail",
};
export function weatherCondition(code: number | null): EnvironmentCondition {
  if (code === 0 || code === 1) return 'clear';
  if (code === 2 || code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code !== null && [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if (code !== null && [71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if (code !== null && [95, 96, 97, 99].includes(code)) return 'storm';
  return 'unknown';
}
export const weatherOutput = z.object({
  location: z.string(), timeZone: z.string(),
  reference: z.object({ latitude: z.number(), longitude: z.number(), basis: z.string(), userLocation: z.literal(false) }).strict(),
  forecast: z.object({ time: z.array(z.string()), weather_code: nullableNumbers, temperature_2m_max: nullableNumbers, temperature_2m_min: nullableNumbers, precipitation_probability_max: nullableNumbers }).strict(),
  // Optional for historical results. These are model samples, not a daily
  // aggregate or a report from a local measurement station.
  currentCondition: z.object({ at: z.string().datetime({ offset: true }), intervalSeconds: z.number().int().positive().nullable(),
    weatherCode: z.number().int().nullable(), isDay: z.boolean().nullable(), temperatureC: z.number().nullable(), precipitationMm: z.number().nullable(),
  }).strict().nullable().optional(),
  solar: z.object({ time: z.array(z.iso.date()), sunriseAt: z.array(z.string().datetime({ offset: true }).nullable()),
    sunsetAt: z.array(z.string().datetime({ offset: true }).nullable()),
  }).strict().optional(),
  // Optional only for old saved results; newly fetched results always carry the source intervals.
  dailyAggregation: z.object({ basis: z.literal('source_fixed_offset_24h'), utcOffsetSeconds: z.number().int(), complete: z.boolean(),
    periods: z.array(z.object({ date: z.iso.date(), sourceWindow: interval, localDay: interval, matchesLocalDay: z.boolean(), valuesComplete: z.boolean() }).strict()),
  }).strict().optional(),
  hourly: z.object({ time: z.array(z.string()), precipitationIntervalStart: z.array(z.string()), temperature_2m: nullableNumbers, precipitation_probability: nullableNumbers, precipitation: nullableNumbers, weather_code: nullableNumbers }).strict().optional(),
  window: z.object({ from: z.string(), to: z.string(), granularity: z.enum(['daily', 'hourly']), complete: z.boolean() }).strict(),
  weatherCodeMeanings: z.record(z.string(), z.string()).optional(),
  weatherCodeSource: z.string().optional(),
  observedAt: z.string(), forecastIssuedAt: z.null(), modelVersion: z.literal('not_reported'), limitations: z.array(z.string()),
}).strict();

/** Only public references are accepted. This adapter never reads or forwards a device fix. */
export function weatherRequest(raw: unknown, now: string) {
  const input = weatherInput.parse(raw);
  const location = input.location;
  try { new Intl.DateTimeFormat('en', { timeZone: location.timeZone }); } catch { throw new HarnessError('time_zone', "The weather location's time zone is invalid."); }
  if (!!input.from !== !!input.to || input.date && input.from) throw new HarnessError('weather_window', "Supply both from and to for a time window, without date.");
  if (input.from && Date.parse(input.to!) <= Date.parse(input.from)) throw new HarnessError('weather_window', "The weather query end must follow its start.");
  const today = dateInZone(now, location.timeZone), first = input.from ? dateInZone(input.from, location.timeZone) : input.date || today;
  const last = input.to ? dateInZone(new Date(Date.parse(input.to) - 1).toISOString(), location.timeZone) : input.date || addDate(today, input.days - 1);
  if (first < today || last > addDate(today, 6)) throw new HarnessError('weather_window', "Weather queries cover the selected location's next seven local dates.");
  const from = input.from || dayBounds(first, location.timeZone).from, to = input.to || dayBounds(last, location.timeZone).to;
  // Preceding-hour precipitation ending at midnight is the next day's first
  // sample. Fetch that boundary day without widening the reported window.
  const requestLast = input.from ? addDate(last, 1) : last;
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    current: 'temperature_2m,precipitation,weather_code,is_day',
    ...(input.from ? { hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code' } : {}),
    // Epoch instants avoid ambiguity during repeated local hours.
    timezone: location.timeZone, timeformat: 'unixtime', start_date: first, end_date: requestLast }).toString();
  return { input, location, from, to, first, last, requestLast, url, hourly: !!input.from };
}

export function weatherResult(query: ReturnType<typeof weatherRequest>, raw: any, observedAt: string) {
  const columns = ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max'] as const;
  const times = raw?.daily?.time;
  const expectedDates: string[] = [];
  for (let date = query.first; date <= query.last; date = addDate(date, 1)) expectedDates.push(date);
  const expectedReturnedDates = query.hourly ? [...expectedDates, query.requestLast] : expectedDates;
  if (!Array.isArray(times) || times.length !== expectedReturnedDates.length || times.some((at: unknown) => typeof at !== 'number' || !Number.isFinite(at)) || columns.some(column => !Array.isArray(raw.daily[column]) || raw.daily[column].length !== times.length)) throw new HarnessError('weather_incomplete', "The weather source omitted some selected dates. This forecast is incomplete.");
  // Open-Meteo daily unix timestamps need the response utc_offset_seconds to recover the date.
  if (!Number.isInteger(raw.utc_offset_seconds) || times.some((at: number, index: number) =>
    new Date((at + raw.utc_offset_seconds) * 1000).toISOString() !== `${expectedReturnedDates[index]}T00:00:00.000Z`
    || index > 0 && at - times[index - 1] !== 86400)) throw new HarnessError('weather_incomplete', "The weather source returned dates that differ from the request.");
  const values = (array: unknown[]) => array.map(value => typeof value === 'number' && Number.isFinite(value) ? value : null);
  const forecast = { time: expectedDates, ...Object.fromEntries(columns.map(column => [column, values(raw.daily[column]).slice(0, expectedDates.length)])) } as z.infer<typeof weatherOutput>['forecast'];
  const numberOrNull = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const epochInstant = (value: unknown) => {
    const epoch = numberOrNull(value), at = epoch === null ? NaN : epoch * 1000;
    return Number.isFinite(at) && Number.isFinite(new Date(at).getTime()) ? new Date(at).toISOString() : null;
  };
  const currentAt = epochInstant(raw.current?.time), currentCode = numberOrNull(raw.current?.weather_code), currentInterval = numberOrNull(raw.current?.interval);
  const currentCondition = currentAt ? { at: currentAt,
    intervalSeconds: currentInterval !== null && Number.isInteger(currentInterval) && currentInterval > 0 ? currentInterval : null,
    weatherCode: currentCode !== null && Number.isInteger(currentCode) ? currentCode : null,
    isDay: raw.current?.is_day === 1 ? true : raw.current?.is_day === 0 ? false : null,
    temperatureC: numberOrNull(raw.current?.temperature_2m), precipitationMm: numberOrNull(raw.current?.precipitation),
  } : null;
  const solar = { time: expectedDates, sunriseAt: expectedDates.map((_, index) => epochInstant(raw.daily?.sunrise?.[index])),
    sunsetAt: expectedDates.map((_, index) => epochInstant(raw.daily?.sunset?.[index])) };
  const periods = expectedDates.map((date, index) => {
    const sourceWindow = { from: new Date(times[index] * 1000).toISOString(), to: new Date((times[index] + 86400) * 1000).toISOString() };
    const localDay = dayBounds(date, query.location.timeZone);
    return { date, sourceWindow, localDay, matchesLocalDay: sourceWindow.from === localDay.from && sourceWindow.to === localDay.to,
      valuesComplete: columns.every(column => forecast[column][index] !== null) };
  });
  const dailyAggregation = { basis: 'source_fixed_offset_24h' as const, utcOffsetSeconds: raw.utc_offset_seconds,
    complete: periods.every(period => period.matchesLocalDay && period.valuesComplete), periods };
  let complete = dailyAggregation.complete;
  let hourly: z.infer<typeof weatherOutput>['hourly'];
  if (query.hourly) {
    const hourlyColumns = ['temperature_2m', 'precipitation_probability', 'precipitation', 'weather_code'] as const;
    const hours = raw.hourly?.time;
    if (!Array.isArray(hours) || hours.some(at => typeof at !== 'number' || !Number.isFinite(at)) || hourlyColumns.some(column => !Array.isArray(raw.hourly?.[column]) || raw.hourly[column].length !== hours.length)) throw new HarnessError('weather_incomplete', "The weather source returned no valid hourly forecast.");
    const from = Date.parse(query.from), to = Date.parse(query.to);
    const indices = hours.flatMap((at: number, index: number) => (at * 1000 < to && at * 1000 + 3600000 > from || at * 1000 > from && at * 1000 - 3600000 < to) ? [index] : []);
    hourly = { time: indices.map(index => new Date(hours[index] * 1000).toISOString()), precipitationIntervalStart: indices.map(index => new Date((hours[index] - 3600) * 1000).toISOString()), ...Object.fromEntries(hourlyColumns.map(column => [column, values(indices.map(index => raw.hourly[column][index]))])) } as z.infer<typeof weatherOutput>['hourly'];
    const coverage = indices.length > 0 && hours[indices[0]] * 1000 <= from && hours[indices.at(-1)!] * 1000 >= to && indices.every((index, i) => i === 0 || hours[index] - hours[indices[i - 1]] === 3600);
    complete = coverage && hourlyColumns.every(column => hourly![column].every(value => value !== null));
  }
  return { complete, data: weatherOutput.parse({ location: query.location.label, timeZone: query.location.timeZone,
    reference: { latitude: query.location.latitude, longitude: query.location.longitude, basis: query.location.basis, userLocation: false }, forecast, currentCondition, solar, dailyAggregation, ...(hourly ? { hourly } : {}),
    window: { from: query.from, to: query.to, granularity: query.hourly ? 'hourly' : 'daily', complete }, observedAt, forecastIssuedAt: null, modelVersion: 'not_reported',
    weatherCodeMeanings: Object.fromEntries([...forecast.weather_code, ...(hourly?.weather_code || []), currentCondition?.weatherCode ?? null].flatMap(code =>
      code !== null && weatherCodeMeanings[code] ? [[String(code), weatherCodeMeanings[code]]] : [])),
    weatherCodeSource: 'https://open-meteo.com/en/docs#weathervariabledocumentation',
    limitations: ["This is a forecast for the selected reference location. Local campus conditions and short-term changes may differ.",
      "Daily maxima and minima use the source's stated 24-hour aggregation. Use hourly forecasts for a few selected hours.",
      ...(!periods.every(period => period.matchesLocalDay) ? ["Some daily statistics are offset from a complete local day and describe only their stated window. Check hourly coverage separately for the intended period."] : []),
      "Hourly temperatures and weather codes refer to the stated instant; precipitation amount and probability refer to the preceding hour.",
      "Current weather is a model sample for the reference point, not an on-site station observation. Its source time and precipitation interval remain in the result.",
      "The source did not provide forecast issue time or model version. The recorded time is when this material was retrieved.",
      "Missing values stay null. Before going out or exercising, consider actual weather, personal comfort and facility opening conditions together."] }) };
}
