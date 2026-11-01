import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, LoaderCircle } from 'lucide-react';
import type { CampusAcademicReference } from '../../shared/campus-academic';
import type { CampusGpaScale, CampusRecord, CampusScene, SemanticSelection } from '../../shared/scenes';
import { uiError } from '../ui';
import './campus-academic.css';

const labels: Record<CampusGpaScale, string> = { fivePoint: 'Original 5-point scale', fourPoint: '4-point GPA', fourPointLegacy: 'Alternative 4-point scale', hundredPoint: 'Percentage equivalent' };
const maxima: Record<CampusGpaScale, number> = { fivePoint: 5, fourPoint: 4, fourPointLegacy: 4, hundredPoint: 100 };
const policies: Record<string, string> = { all_attempts: 'All attempts', first_attempt: 'First attempt', highest_attempt: 'Highest grade', repository_first_response: 'First source record' };
const format = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
  ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value) : '—';
const term = (value: string) => value.replace(/^(\d{4})-(\d{4})-([12])$/, '$1–$2 · term $3');
const point = (row: CampusRecord, scale: CampusGpaScale) => row.gpa ? row.gpa.values[scale] : row.grade?.[scale];
const stamp = (value: string, timeZone = 'America/Los_Angeles') => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('en-US', {
  timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
}) : 'Collection time not provided';

export function CampusAcademicView({ scene, sessionId, boundaryKey = '', timeZone, selection, onSelect }: {
  scene: CampusScene | CampusAcademicReference; sessionId: string; boundaryKey?: string; timeZone?: string;
  selection?: SemanticSelection | null; onSelect: (value: SemanticSelection) => void;
}) {
  const key = `${sessionId}:${scene.id}@${scene.revision}`, currentKey = useRef(key); currentKey.current = key;
  const request = useRef(0), boundary = useRef(boundaryKey), blocked = useRef<string | undefined>(undefined), liveVersion = useRef(scene.source.version);
  const [data, setData] = useState<CampusScene | undefined>(scene.kind === 'campus' ? scene : undefined);
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [selected, setSelected] = useState<string>();
  const [scale, setScale] = useState<CampusGpaScale>(scene.kind === 'campus' ? scene.academicDisplay?.scale || 'fourPoint' : scene.display.scale);
  const previousKey = useRef(key), sourceId = useId();
  useEffect(() => {
    if (previousKey.current !== key || liveVersion.current !== scene.source.version) {
      previousKey.current = key; liveVersion.current = scene.source.version; request.current++; setSelected(undefined); setError('');
      setPending(false); setData(scene.kind === 'campus' && blocked.current !== key ? scene : undefined);
      setScale(scene.kind === 'campus' ? scene.academicDisplay?.scale || 'fourPoint' : scene.display.scale);
    } else if (scene.kind === 'campus' && blocked.current !== key) setData(scene);
  }, [key, scene]);
  useEffect(() => {
    if (boundary.current === boundaryKey) return;
    boundary.current = boundaryKey; blocked.current = key; request.current++;
    setData(undefined); setSelected(undefined); setPending(false); setError('');
  }, [boundaryKey, key]);
  useEffect(() => () => { request.current++; }, []);
  async function open() {
    const generation = ++request.current, expected = key;
    setPending(true); setError('');
    try {
      const next = await window.anima.campusAcademicRead({ sessionId, sceneId: scene.id, sceneRevision: scene.revision });
      if (generation !== request.current || currentKey.current !== expected) return;
      blocked.current = undefined; setData(next); setSelected(undefined); setScale(next.academicDisplay?.scale || 'fourPoint');
    } catch (problem) { if (generation === request.current && currentKey.current === expected) setError(uiError(problem)); }
    finally { if (generation === request.current && currentKey.current === expected) setPending(false); }
  }
  const heading = scene.domain === 'grades' ? 'Grades' : scene.domain === 'gpa_semesters' ? 'Term GPA' : scene.domain === 'gpa_cumulative' ? 'Cumulative GPA' : 'GPA policy';
  const recordLabel = scene.domain === 'grades' ? 'Grade records' : `${heading} records`;
  if (!data || boundary.current !== boundaryKey || previousKey.current !== key || liveVersion.current !== scene.source.version)
    return <section className="academic-reference" aria-label={recordLabel}>
    <div><h3>{recordLabel}</h3></div>
    <button type="button" disabled={pending} onClick={() => void open()}>{pending ? <LoaderCircle size={16} className="academic-loading" aria-hidden="true" /> : <ArrowUpRight size={16} aria-hidden="true" />}
      {pending ? 'Reading original records' : 'Open original records'}</button>
    {error && <p role="alert" className="academic-error">{error}</p>}
  </section>;
  const grade = data.domain === 'grades', mode = data.academicDisplay?.mode || (data.records.length === 1 ? 'detail' : 'table');
  const selectedId = selection?.sceneId === data.id && selection.sceneRevision === data.revision && selection.kind === 'record' ? selection.recordId : selected;
  const row = data.records.find(row => row.id === selectedId) || (mode === 'detail' ? data.records[0] : undefined);
  const available = (Object.keys(labels) as CampusGpaScale[]).filter(scale => data.records.some(row => row.gpa
    ? Object.hasOwn(row.gpa.values, scale) : row.grade && Object.hasOwn(row.grade, scale)));
  const choose = (row: CampusRecord) => {
    setSelected(row.id); onSelect({ sceneId: data.id, sceneRevision: data.revision, kind: 'record', recordId: row.id, campusScale: scale });
  };
  return <section className="academic-view" aria-label={heading} data-scene-id={data.id}>
    <header className="academic-heading"><div><h3>{mode === 'detail' && grade && row ? row.title : heading}</h3>
      {data.term && <p>{term(data.term)}</p>}</div>
      {!grade && available.length > 1 && <div className="academic-scales" role="group" aria-label="GPA scale">
        {available.map(value => <button type="button" key={value} aria-pressed={scale === value} onClick={() => setScale(value)}>{labels[value]}</button>)}
      </div>}
    </header>
    {mode === 'detail' && row ? <div className="academic-single"><div className="academic-single-score">
      <strong title={grade ? row.grade?.original || undefined : String(point(row, scale) ?? '')}>{grade ? row.grade?.original || 'Not provided' : format(point(row, scale))}</strong>
      <span>{grade ? 'Original grade' : labels[scale]}</span></div>
      <div className="academic-single-context">{grade ? <><p>{row.credit === undefined ? 'Units not provided' : `${row.credit} ${row.credit === 1 ? 'unit' : 'units'}`}</p>
        <p>{labels[scale]} <b>{format(point(row, scale))}</b></p></> : <><h4>{term(row.title)}</h4><p>{row.gpa?.denominator == null ? 'Counted units not provided' : `${format(row.gpa.denominator)} counted units`}</p></>}
      </div>
    </div> : mode === 'trend' ? <AcademicTrend rows={data.records} scale={scale} selectedId={selectedId} onSelect={choose} />
      : <div className="academic-table-scroll"><table className="academic-table"><thead><tr>
        <th scope="col">{grade ? 'Course' : data.domain === 'gpa_overall' ? 'Attempt policy' : 'Term'}</th>
        <th scope="col">{grade ? 'Units' : labels[scale]}</th><th scope="col">{grade ? 'Original grade' : 'Counted units'}</th>
        <th scope="col">{grade ? `Grade points · ${labels[scale]}` : 'Counted attempts'}</th>
      </tr></thead><tbody>{data.records.map(item => <tr key={item.id} className={selectedId === item.id ? 'is-selected' : undefined} onClick={() => choose(item)}>
        <th scope="row"><button type="button" aria-pressed={selectedId === item.id}>{term(item.title)}</button>
          {grade && item.term && item.term !== data.term && <small>{term(item.term)}</small>}</th>
        <td title={grade ? undefined : String(point(item, scale) ?? '')}>{grade ? format(item.credit) : format(point(item, scale))}</td>
        <td>{grade ? item.grade?.original || 'Not provided' : format(item.gpa?.denominator)}</td>
        <td title={grade ? String(point(item, scale) ?? '') : undefined}>{grade ? format(point(item, scale)) : format(item.gpa?.countedAttempts)}</td>
      </tr>)}</tbody></table></div>}
    {row && <div className="academic-selected">
      {mode !== 'detail' && <h4>{term(row.title)}</h4>}
      {grade ? <p>{row.grade?.exclusionReason || (row.grade?.included === true ? 'The source marks this as included in GPA.' : row.grade?.included === false ? 'The source marks this as excluded from GPA.' : 'The source does not state whether this is included in GPA.')}</p>
        : <p>{row.gpa?.policy ? policies[row.gpa.policy] || row.gpa.policy : 'Attempt policy not provided'}
          {row.gpa?.complete === false || row.gpa?.sourceComplete === false ? ' · Material is incomplete' : ''}
          {row.gpa?.incompleteAttempts ? ` · ${row.gpa.incompleteAttempts} records lack calculation data` : ''}</p>}
      <button type="button" className="academic-continue" onClick={() => choose(row)}>Discuss this {grade ? 'course' : 'policy'}<ArrowUpRight size={15} aria-hidden="true" /></button>
    </div>}
    <footer className="academic-footer"><details><summary aria-controls={sourceId}>Policy and source<ChevronDown size={13} aria-hidden="true" /></summary>
      <div id={sourceId}><p>{data.sourceLabel} · {stamp(data.source.fetchedAt, timeZone)}{Number.isFinite(Date.parse(data.source.fetchedAt)) ? ' · Retrieved' : ''}</p>
        <p>{labels[scale]}{!grade ? ' · Analysis weighted by units from the original source.' : ' · Every attempt is retained; original grades and grade points remain separate.'}</p>
        {!grade && <p>The denominator uses only counted units. Different attempt policies and term scopes are not combined, and missing values are not treated as zero.</p>}
        {row?.gpa?.formula && <p className="academic-formula">{row.gpa.formula}</p>}
        {data.resultStatus === 'stale' && <p>This is an earlier result retained by the source. Reread it when current information is needed.</p>}
      </div></details><span>{grade ? labels[scale] + ' · ' : ''}Records read: {data.records.length}{data.total !== undefined && data.total > data.records.length ? ` / ${data.total}` : ''}{!data.complete ? ' · Partial material' : ''}</span>
    </footer>
  </section>;
}

function AcademicTrend({ rows, scale, selectedId, onSelect }: { rows: CampusRecord[]; scale: CampusGpaScale; selectedId?: string; onSelect: (row: CampusRecord) => void }) {
  // Preserve the source order: quarter and semester identifiers need not sort lexically.
  const items = rows;
  const max = maxima[scale], width = 700, height = 216;
  const points = items.map((row, index) => { const value = point(row, scale); return { row, value,
    x: 36 + index * ((width - 72) / Math.max(1, items.length - 1)),
    y: typeof value === 'number' && value >= 0 && value <= max ? 20 + (1 - value / max) * (height - 56) : null }; });
  return <div className="academic-trend"><svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${labels[scale]} trend in source order`}>
    {[0, max / 2, max].map(value => { const y = 20 + (1 - value / max) * (height - 56); return <g key={value}><line x1="32" x2={width - 24} y1={y} y2={y} className="academic-chart-rule" /><text x="4" y={y + 4} className="academic-chart-axis">{format(value)}</text></g>; })}
    {points.map((current, index) => { const previous = points[index - 1]; return current.y !== null && previous?.y != null
      && current.row.gpa?.complete === true && previous.row.gpa?.complete === true
      ? <line key={`line:${current.row.id}`} x1={previous.x} y1={previous.y} x2={current.x} y2={current.y} className="academic-chart-line" /> : null; })}
    {points.map(value => value.y === null ? null : <g key={value.row.id} role="button" tabIndex={0} aria-label={`${term(value.row.title)}, ${format(value.value)}, select to continue`}
      aria-pressed={selectedId === value.row.id} onClick={() => onSelect(value.row)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(value.row); } }}>
      <circle cx={value.x} cy={value.y} r="17" fill="transparent" />
      <circle cx={value.x} cy={value.y} r={selectedId === value.row.id ? 5.5 : 4} className={`academic-chart-dot${value.row.gpa?.complete !== true ? ' is-partial' : ''}`} />
      <text x={value.x} y={value.y - 15} textAnchor="middle" className="academic-chart-value">{format(value.value)}</text>
    </g>)}
  </svg><div className="academic-trend-labels">{items.map(row => <button type="button" key={row.id} onClick={() => onSelect(row)} aria-pressed={selectedId === row.id}>{term(row.term || row.gpa?.throughTerm || row.title)}</button>)}</div></div>;
}
