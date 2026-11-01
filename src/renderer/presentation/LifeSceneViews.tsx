import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { CalendarDays, ChevronDown, CircleDashed, Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun, Wind } from 'lucide-react';
import type { EnvironmentSample, EnvironmentScene, PlanningBlock, PlanningScene, SemanticSelection } from '../../shared/scenes';
import { environmentTimeLabels } from './environment-time';
import './life-scenes.css';

interface SelectionProps { selection?: SemanticSelection | null; onSelect: (value: SemanticSelection) => void }
const number = (value: number | null | undefined, unit = '') => value == null ? 'Unknown' : `${Number(value.toFixed(1))}${unit}`;
function stamp(value: string, zone: string, date = false) {
  return new Date(value).toLocaleString('en-US', { timeZone: zone, ...(date ? { month: 'numeric', day: 'numeric' } : {}), hour: '2-digit', minute: '2-digit', hour12: false });
}
function dayKey(value: string, zone: string) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
function dayName(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'short' });
}
function interval(block: PlanningBlock, zone: string, viewedDay?: string) {
  if (block.agendaRecord?.allDayDate && block.agendaRecord.timeZone === zone) return 'All day';
  const startsElsewhere = !!viewedDay && viewedDay !== dayKey(block.start, zone);
  if (!block.end) return `From ${stamp(block.start, zone, startsElsewhere)}`;
  return `${stamp(block.start, zone, startsElsewhere)} — ${stamp(block.end, zone, dayKey(block.start, zone) !== dayKey(block.end, zone))}`;
}
const sourceName = (id: string) => id === 'local-agenda' ? 'Local calendar' : ['user-declared', 'current'].includes(id) ? 'Events stated this turn' : id.startsWith('campus:') ? 'Campus material' : id.startsWith('map:') ? 'Campus routes' : id.startsWith('weather:') ? 'Environment forecast' : 'Related material';
const blockNames: Record<PlanningBlock['kind'], string> = { busy: 'Existing event', work: 'To discuss', setup: 'Preparation', cleanup: 'Cleanup', transition: 'Travel / rest', protected: 'Protected open space', free: 'Unscheduled' };
const agendaStates: Record<NonNullable<PlanningBlock['agendaRecord']>['state'], string> = {
  invitation: 'Invitation · not accepted', wish: 'Would like to do', proposed: 'Awaiting confirmation', accepted: 'Accepted', registered: 'Scheduled',
};
function blockDuration(block: PlanningBlock) {
  if (block.agendaRecord?.allDayDate) return 'All-day record';
  if (block.end) return duration((Date.parse(block.end) - Date.parse(block.start)) / 60000);
  return block.agendaRecord?.kind === 'deadline' ? 'Deadline' : block.agendaRecord?.kind === 'reminder' ? 'Reminder time' : 'End not set';
}
function duration(minutes: number) {
  if (minutes > 0 && minutes < 1) return 'Less than a minute';
  const rounded = Math.round(minutes);
  return rounded >= 60 ? `${Math.floor(rounded / 60)} h${rounded % 60 ? ` ${rounded % 60} min` : ''}` : `${rounded} min`;
}
function useExpired(expiresAt?: string) {
  const [tick, refresh] = useState(0);
  useEffect(() => {
    const remaining = Date.parse(expiresAt || '') - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) return;
    const timer = window.setTimeout(() => refresh(value => value + 1), Math.min(remaining + 1, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [expiresAt, tick]);
  return !!expiresAt && Date.parse(expiresAt) <= Date.now();
}
/** Keep the focused or selected choice visible without moving the chat's scroll or focus. */
function useChoiceVisibility(ref: RefObject<HTMLDivElement | null>, key: string | undefined, selector: string) {
  useEffect(() => {
    const strip = ref.current;
    if (!strip) return;
    const reveal = () => {
      const chosen = strip.querySelector<HTMLElement>('button:focus') || strip.querySelector<HTMLElement>(selector);
      if (!chosen) return;
      const frame = strip.getBoundingClientRect(), item = chosen.getBoundingClientRect();
      if (item.left < frame.left) strip.scrollLeft -= frame.left - item.left;
      else if (item.right > frame.left + strip.clientWidth) strip.scrollLeft += item.right - frame.left - strip.clientWidth;
    };
    const observer = new ResizeObserver(reveal);
    observer.observe(strip); reveal();
    return () => observer.disconnect();
  }, [ref, key, selector]);
}

export function PlanningTime({ scene, selection, onSelect, viewedDay, onViewDay }: SelectionProps & {
  scene: PlanningScene; viewedDay?: string; onViewDay?: (day: string) => void;
}) {
  const zone = scene.window.timeZone;
  const agenda = scene.mode === 'agenda';
  const comparison = !!(scene.source.coverage as { planningComparison?: unknown } | undefined)?.planningComparison;
  const groups = useMemo(() => {
    const displayDays = scene.agendaRead?.days || scene.daySummaries;
    const map = new Map<string, PlanningBlock[]>((displayDays || []).map(day => [day.date, []]));
    for (const block of scene.blocks) {
      const days = displayDays?.length ? displayDays.filter(day => Date.parse(block.start) < Date.parse(day.to)
        && Date.parse(block.end || scene.window.to) > Date.parse(day.from)).map(day => day.date)
        : [dayKey(new Date(Math.max(Date.parse(block.start), Date.parse(scene.window.from))).toISOString(), zone)];
      for (const day of days) {
        if (agenda && block.end === null && day !== dayKey(block.start, zone)) continue;
        map.set(day, [...(map.get(day) || []), block]);
      }
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [scene.blocks, scene.daySummaries, scene.agendaRead, scene.window.from, scene.window.to, zone, agenda]);
  const selectedId = selection?.kind === 'time_block' && selection.sceneId === scene.id && selection.sceneRevision === scene.revision ? selection.blockId : undefined;
  const [browsedDay, setBrowsedDay] = useState<string>();
  const requestedDay = viewedDay ?? browsedDay;
  const activeDay = groups.some(([day]) => day === requestedDay) ? requestedDay!
    : groups.find(([, items]) => items.some(block => block.id === selectedId))?.[0] || groups[0]?.[0];
  const blocks = groups.find(([day]) => day === activeDay)?.[1] || [];
  const summary = scene.daySummaries?.find(day => day.date === activeDay);
  const declaredWindows = scene.scheduleCoverage?.mode === 'provided_windows';
  const eligibleWindows = declaredWindows ? summary?.eligibleWindows : undefined;
  const emptyDay = eligibleWindows?.length === 0;
  // These are visual breaks only. The host owns the windows, rows and daily totals.
  const windowFor = (block: PlanningBlock) => eligibleWindows?.findIndex(window => Date.parse(block.start) >= Date.parse(window.start)
    && !!block.end && Date.parse(block.end) <= Date.parse(window.end)) ?? -1;
  const dates = useRef<HTMLDivElement>(null);
  useChoiceVisibility(dates, `${scene.id}@${scene.revision}:${activeDay}`, '[aria-selected="true"]');
  const expired = useExpired(scene.expiresAt || scene.source.expiresAt);
  const unresolved = [...new Set([...scene.conditions, ...(scene.adoption?.blockers || [])])];
  return <section className={`life-scene planning-scene${comparison ? ' is-comparison' : ''}${agenda ? ' is-agenda-read' : ''}`} aria-label={agenda ? 'Events in this time window' : 'Time for yourself'} data-scene-id={scene.id}>
    <header className="life-scene-heading">
      <div><h3>{agenda ? 'Saved events' : scene.continuation ? 'Continue the previous plan' : groups.length > 1 ? 'Planning these days' : scene.mode === 'draft' ? 'Time for yourself' : 'Explore the available time'}</h3>
        {scene.continuation && <p className="planning-continuation">
          <span>{scene.continuation.allocatedMinutes > 0 ? `${expired ? 'Previously ' : ''}in the calendar: ${duration(scene.continuation.allocatedMinutes)}` : 'The idea saved last time'}</span>
          <span>{scene.continuation.scheduledMinutes > 0 ? `Additional time this round: ${duration(scene.continuation.scheduledMinutes)}` : 'No new events this time'}</span>
        </p>}
      </div>
      {groups.length === 1 && activeDay && !summary ? <span className="life-scene-date">{dayName(activeDay)}</span> : null}
    </header>
    {groups.length > 1 && <div className="planning-day-strip" role="tablist" aria-label="Choose day to view" ref={dates}>
      {groups.map(([day]) => {
        const value = scene.daySummaries?.find(item => item.date === day);
        return <button type="button" role="tab" key={day} aria-selected={activeDay === day} tabIndex={activeDay === day ? 0 : -1}
          onKeyDown={event => moveAlongChoices(event, true)} onClick={() => { setBrowsedDay(day); onViewDay?.(day); }}>
          <span className="planning-day-name">{dayName(day)}</span>
          {value && (declaredWindows && value.eligibleWindows ? <span className="planning-day-times">{value.eligibleWindows.length === 0 ? 'Keep this day unplanned'
            : value.eligibleWindows.map(window => <span key={window.start}>{stamp(window.start, zone)} — {stamp(window.end, zone, dayKey(window.start, zone) !== dayKey(window.end, zone))}</span>)}</span>
            : <span className="planning-day-balance">{scene.continuation ? 'Additional time' : 'Planned time'} {duration(value.scheduledMinutes)}<span> · {duration(value.freeMinutes)} {comparison ? 'Keep for yourself' : 'Unscheduled'}</span></span>)}
        </button>;
      })}
    </div>}
    {summary && <div className="planning-day-overview"><strong>{dayName(summary.date)}</strong>
      {declaredWindows ? <div className="planning-day-windows">{emptyDay ? <span className="planning-day-unplanned">Keep this day unplanned</span>
        : eligibleWindows?.map(window => <span key={window.start}>{stamp(window.start, zone)} — {stamp(window.end, zone, dayKey(window.start, zone) !== dayKey(window.end, zone))}</span>)}</div>
        : <span>{stamp(summary.from, zone)} — {stamp(summary.to, zone, dayKey(summary.from, zone) !== dayKey(summary.to, zone))}</span>}
      {declaredWindows && !emptyDay && (!scene.continuation || groups.length > 1) && <p className="planning-day-balance">{scene.continuation ? 'Additional time this day' : 'Planned time'} {duration(summary.scheduledMinutes)} · {duration(summary.freeMinutes)} {comparison ? 'Keep for yourself' : 'Unscheduled'}</p>}
      {!emptyDay && summary.reserveShortfallMinutes > 0 && <p className="planning-day-shortfall">Existing events use some of the open space. The reserve is short by {duration(summary.reserveShortfallMinutes)}.</p>}
    </div>}
    <div className="planning-timeline" role="group" aria-label="Choose a time block to discuss">
      {blocks.map((block, index) => {
        const window = windowFor(block);
        const startsWindow = declaredWindows && (window < 0 || index === 0 || windowFor(blocks[index - 1]) !== window);
        const endsWindow = declaredWindows && (window < 0 || index === blocks.length - 1 || windowFor(blocks[index + 1]) !== window);
        const note = block.usableMinutes ? `After transitions on both sides, usable time is ${number(block.usableMinutes.min)}${block.usableMinutes.max !== block.usableMinutes.min ? `—${number(block.usableMinutes.max)}` : ''} min`
          : block.kind === 'free' ? undefined : block.reason;
        return <button type="button" className={`planning-time-block planning-time-${block.kind}${selectedId === block.id ? ' is-selected' : ''}${startsWindow ? ' is-window-start' : ''}${endsWindow ? ' is-window-end' : ''}`} key={block.id}
        aria-pressed={selectedId === block.id} onClick={() => onSelect({ sceneId: scene.id, sceneRevision: scene.revision, kind: 'time_block', blockId: block.id })}
        aria-label={`${interval(block, zone, activeDay)}, ${block.label}, ${block.agendaRecord ? agendaStates[block.agendaRecord.state] : comparison && block.kind === 'free' ? 'Keep for yourself' : blockNames[block.kind]}, ${blockDuration(block)}, select to discuss`}>
        <span className="planning-time-stamp">{interval(block, zone, activeDay)}</span><span className="planning-time-dot" aria-hidden="true" />
        <span className="planning-time-content"><span className="planning-time-title"><strong>{block.label}</strong><span>{blockDuration(block)}</span></span>
          {block.agendaRecord && <span className="planning-time-note">{agendaStates[block.agendaRecord.state]}{block.agendaRecord.timeZone !== zone ? ` · Original time zone ${block.agendaRecord.timeZone}` : ''}</span>}
          {note && <span className="planning-time-note">{note}</span>}
          {agenda && block.originalRange && selectedId === block.id && <span className="planning-time-note">Complete interval: {stamp(block.originalRange.start, zone, true)} — {block.originalRange.end ? stamp(block.originalRange.end, zone, true) : 'End unknown'}</span>}
        </span>
      </button>;})}
      {!blocks.length && !emptyDay && <p className="life-scene-empty">{agenda ? scene.agendaRead?.complete ? 'No matching events were found in this window.' : 'Only part of the agenda was read. The remaining time cannot be assumed free.' : 'No time blocks are available to display yet. Continue describing how you would like to plan.'}</p>}
    </div>
    {scene.unscheduled.length > 0 && <details className="life-scene-notes"><summary>{scene.unscheduled.length === 1 ? 'One event remains unscheduled' : `${scene.unscheduled.length} events remain unscheduled`}<ChevronDown size={13} /></summary><ul>{scene.unscheduled.map((item, index) => <li key={index}><strong>{item.title}</strong> · {item.reason}</li>)}</ul></details>}
    {unresolved.length > 0 && <details className="life-scene-notes"><summary>Some conditions need review<ChevronDown size={13} /></summary><ul>{unresolved.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
    <footer className="life-scene-footer"><span><CalendarDays size={14} aria-hidden="true" />{agenda ? 'Local records · read snapshot' : expired ? 'Earlier proposed plan' : 'Discussing together · not saved'}</span>
      <details><summary>Plan and evidence<ChevronDown size={13} /></summary><div className="life-scene-source">
        <p>{stamp(scene.window.from, zone, true)} — {stamp(scene.window.to, zone, true)} · {zone}</p>
        {summary && !emptyDay && <p>{dayName(summary.date)}: {declaredWindows ? 'Within the selected window, ' : ''}Including existing events, preparation, and rest, occupied time is {duration(summary.occupiedMinutes)}, {duration(summary.freeMinutes)} {comparison ? 'Keep for yourself' : 'Unscheduled'}.
          {summary.budget?.maxScheduledMinutes !== undefined ? ` Maximum new work for this day: ${duration(summary.budget.maxScheduledMinutes)}.` : ''}
          {summary.budget?.reserveMinutes !== undefined ? ` Desired open space: ${duration(summary.budget.reserveMinutes)}.` : ''}</p>}
        <p>{scene.source.fetchedAt ? `Local agenda read on ${stamp(scene.source.fetchedAt, zone, true)}` : 'This plan has no recorded read time.'}</p>
        {scene.sourceCoverage.map((row, index) => <p key={index}>{sourceName(row.sourceId)}{row.status !== 'complete' ? ' · Incomplete coverage' : ''}{row.reason ? `: ${row.reason}` : ''}</p>)}
        <p>{agenda ? 'Select a block to discuss it. An unaccepted invitation is not a commitment, and a blank area does not necessarily mean free time.' : 'Selecting only continues the discussion. The current agenda is checked again before adopting a plan.'}</p>
        {scene.expiresAt && <p>This plan was checked through {stamp(scene.expiresAt, zone, true)}; after that, review it against the current agenda.</p>}
      </div></details>
    </footer>
  </section>;
}

function WeatherIcon({ sample, size = 25 }: { sample: EnvironmentSample; size?: number }) {
  const code = sample.weatherCode;
  const Icon = code === 0 ? Sun : code === 1 || code === 2 ? CloudSun : code === 45 || code === 48 ? CloudFog
    : code != null && [95, 96, 97, 99].includes(code) ? CloudLightning
      : code != null && [71, 73, 75, 77, 85, 86].includes(code) ? CloudSnow
        : code != null && [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code) ? CloudRain : code === 3 ? Cloud : CircleDashed;
  return <Icon size={size} strokeWidth={1.5} aria-hidden="true" />;
}
function moveAlongChoices(event: KeyboardEvent<HTMLButtonElement>, activate = false) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const items = [...event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('button')];
  const index = items.indexOf(event.currentTarget), target = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
  event.preventDefault();
  const chosen = items[target], strip = event.currentTarget.parentElement!;
  if (!chosen) return;
  chosen.focus({ preventScroll: true });
  if (activate) chosen.click();
  const frame = strip.getBoundingClientRect(), item = chosen.getBoundingClientRect();
  if (item.left < frame.left) strip.scrollLeft -= frame.left - item.left;
  else if (item.right > frame.left + strip.clientWidth) strip.scrollLeft += item.right - frame.left - strip.clientWidth;
}

export function EnvironmentHours({ scene, selection, onSelect }: SelectionProps & { scene: EnvironmentScene }) {
  const air = scene.domain === 'air_quality';
  const expired = useExpired(scene.source.expiresAt);
  const hours = useRef<HTMLDivElement>(null);
  const selectedId = selection?.kind === 'environment_sample' && selection.sceneId === scene.id && selection.sceneRevision === scene.revision ? selection.sampleId : undefined;
  const sample = scene.samples.find(row => row.id === selectedId) || scene.samples.find(row => Date.parse(row.at) >= Date.parse(scene.window.from)) || scene.samples[0];
  const clock = environmentTimeLabels(scene), hourStamp = clock.stamp;
  useChoiceVisibility(hours, `${scene.id}@${scene.revision}:${sample?.id}`, '.environment-hour.is-active');
  if (!sample) return null;
  const select = (row: EnvironmentSample) => onSelect({ sceneId: scene.id, sceneRevision: scene.revision, kind: 'environment_sample', sampleId: row.id });
  return <section className={`life-scene environment-scene${air ? ' environment-air' : ''}`} aria-label={air ? 'Hourly air forecast' : 'Hourly weather forecast'} data-scene-id={scene.id}>
    <header className="life-scene-heading"><div className="environment-heading-label">{air ? <Wind size={27} strokeWidth={1.5} aria-hidden="true" /> : <WeatherIcon sample={sample} size={29} />}<div><h3>{air ? 'A look at the air' : 'Weather for this time window'}</h3><p>{scene.location} · {scene.timeZone}</p></div></div></header>
    <div className="environment-hour-strip" role="group" aria-label="Choose forecast time; use Left and Right to browse" ref={hours}>
      {scene.samples.map(row => <button type="button" key={row.id} className={`environment-hour${sample.id === row.id ? ' is-active' : ''}${selectedId === row.id ? ' is-selected' : ''}`} aria-pressed={selectedId === row.id}
        onClick={() => select(row)} onKeyDown={event => moveAlongChoices(event)}
        aria-label={`${hourStamp(row.at, true)}, ${air ? `PM2.5 ${number(row.pm2_5, ' μg/m³')}` : `Temperature ${number(row.temperatureC, ' °C')}`}, select to discuss`}>
        <span className="environment-hour-day">{dayName(dayKey(row.at, scene.timeZone))}</span><time dateTime={row.at}>{stamp(row.at, scene.timeZone)}{clock.hasRepeatedTimes && <small>{clock.offset(row.at) || '\u00a0'}</small>}</time>
        {air ? <Wind size={23} strokeWidth={1.4} aria-hidden="true" /> : <WeatherIcon sample={row} />}
        <strong>{air ? number(row.pm2_5) : number(row.temperatureC, '°')}</strong><small>{air ? 'PM2.5 · μg/m³' : 'Temperature at this time'}</small>
      </button>)}
    </div>
    <div className="environment-hour-detail" aria-live="polite">
      <div className="environment-detail-heading">{air ? <Wind size={24} strokeWidth={1.5} aria-hidden="true" /> : <WeatherIcon sample={sample} size={29} />}<strong>{hourStamp(sample.at, true)}{!air ? ` · ${number(sample.temperatureC, '°C')}` : ''}</strong></div>
      {air ? <dl className="environment-air-values"><div><dt>PM2.5</dt><dd>{number(sample.pm2_5)}<small> μg/m³</small></dd></div><div><dt>PM10</dt><dd>{number(sample.pm10)}<small> μg/m³</small></dd></div><div><dt>US AQI</dt><dd>{number(sample.usAqi)}</dd></div><div><dt>European AQI</dt><dd>{number(sample.europeanAqi)}</dd></div></dl>
        : <p>{sample.precipitationIntervalStart ? `${hourStamp(sample.precipitationIntervalStart, dayKey(sample.precipitationIntervalStart, scene.timeZone) !== dayKey(sample.at, scene.timeZone))} — ${hourStamp(sample.at)} ` : 'Preceding hour '}Precipitation {number(sample.precipitationMm, ' mm')} · Probability {number(sample.precipitationProbability, '%')}</p>}
    </div>
    <footer className="life-scene-footer"><span>{expired ? 'Earlier forecast' : scene.window.complete ? 'Forecast for a public reference point' : 'Forecast has missing values or incomplete coverage'}</span><details><summary>Time and source<ChevronDown size={13} /></summary><div className="life-scene-source">
      <p>{air ? 'Open-Meteo / CAMS' : 'Open-Meteo'} · Public reference location</p>
      <p>{scene.source.fetchedAt ? `Retrieved ${stamp(scene.source.fetchedAt, scene.timeZone, true)}` : 'The source has no recorded retrieval time.'}</p>
      <p>Query window: {hourStamp(scene.window.from, true)} — {hourStamp(scene.window.to, true)}.</p>
      {scene.limitations.map((item, index) => <p key={index}>{item}</p>)}
    </div></details></footer>
  </section>;
}
