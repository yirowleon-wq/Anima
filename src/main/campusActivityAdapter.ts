import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as z from 'zod';
import { CAMPUS_ACTIVITY_MODULES, CAMPUS_ACTIVITY_SOURCE_ID, type CampusActivityConnectorState,
  type CampusActivityObservation, type CampusActivityReadArgs } from '../shared/campusActivity';
import { HarnessError } from '../shared/harness';
const documentSchema = z.object({ schemaVersion: z.literal('anima-campus-activity/v1'), institutionId: z.string().min(1).max(100),
  source: z.string().min(1).max(500), fetchedAt: z.iso.datetime({ offset: true }), timeZone: z.string().min(1).max(100),
  resources: z.record(z.string(), z.object({ kind: z.enum(['records', 'catalog', 'official_page']), complete: z.boolean().default(false),
    selection: z.record(z.string(), z.json()).optional(), data: z.json() }).strict()),
}).strict();
interface Snapshot { id: string; identity: string; importedAt: string; document: z.infer<typeof documentSchema>; derivedFrom?: string; selector?: Record<string, unknown> }
const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const idPattern = /^[a-f0-9]{32}$/;

/** Nineteen campus-life resources share an explicit local source owner.
 * Imports are observations, never university authentication, booking or official certification. */
export class CampusActivityAdapter {
  constructor(private directory: string) {}
  private selection(): { file: string; head: string; identity: string } | undefined {
    try { const value = JSON.parse(readFileSync(path.join(this.directory, 'selection.json'), 'utf8'));
      return typeof value.file === 'string' && idPattern.test(value.head) && typeof value.identity === 'string' ? value : undefined; } catch { return; }
  }
  private snapshot(id?: string): Snapshot | undefined { const selected = this.selection(); if (!selected || id && !idPattern.test(id)) return;
    try { const value = JSON.parse(readFileSync(path.join(this.directory, 'snapshots', `${id || selected.head}.json`), 'utf8')) as Snapshot;
      return value.id === (id || selected.head) && value.identity === selected.identity && documentSchema.safeParse(value.document).success ? value : undefined; } catch { return; }
  }
  configure(file: string): CampusActivityConnectorState {
    const selected = path.resolve(file), raw = readFileSync(selected); if (raw.byteLength > 32 * 1024 * 1024) throw new HarnessError('campus_activity_size', 'Choose an activity file smaller than 32 MiB.');
    const document = documentSchema.parse(JSON.parse(raw.toString('utf8')));
    try { new Intl.DateTimeFormat('en-US', { timeZone: document.timeZone }); } catch { throw new HarnessError('time_zone', 'The activity source needs a valid IANA time zone.'); }
    const identity = digest(JSON.stringify({ file: selected, institutionId: document.institutionId, source: document.source })), id = digest(Buffer.concat([Buffer.from(identity), raw])).slice(0, 32);
    const saved: Snapshot = { id, identity, importedAt: new Date().toISOString(), document };
    mkdirSync(path.join(this.directory, 'snapshots'), { recursive: true });
    const snapshotFile = path.join(this.directory, 'snapshots', `${id}.json`); if (!existsSync(snapshotFile)) writeFileSync(snapshotFile, JSON.stringify(saved), { flag: 'wx' });
    const temporary = path.join(this.directory, 'selection.next.json'); writeFileSync(temporary, JSON.stringify({ file: selected, head: id, identity })); renameSync(temporary, path.join(this.directory, 'selection.json'));
    return this.describe();
  }
  /** Clear only files owned by this activity source. Other directory contents are preserved. */
  clear() {
    const snapshots = path.resolve(this.directory, 'snapshots');
    if (existsSync(snapshots)) {
      if (lstatSync(snapshots).isSymbolicLink()) throw new HarnessError('campus_activity_storage', 'The activity storage directory is not a direct local directory.');
      for (const name of readdirSync(snapshots)) if (/^[a-f0-9]{32}\.json$/.test(name)) unlinkSync(path.join(snapshots, name));
    }
    for (const name of ['selection.json', 'selection.next.json']) { const file = path.join(this.directory, name); if (existsSync(file)) unlinkSync(file); }
  }
  describe(): CampusActivityConnectorState { const snapshot = this.snapshot(); return { sourceId: CAMPUS_ACTIVITY_SOURCE_ID,
    label: 'Campus activities', configured: !!snapshot, credentialsConfigured: !!snapshot, sessionSaved: false,
    runtimeAvailable: true, signerConfigured: false, reason: snapshot ? 'Explicit local activity import; no university account or official submission service is connected.' : 'Import a campus activity JSON file. No university account is connected.' }; }
  async catalog(signal?: AbortSignal): Promise<CampusActivityObservation> { signal?.throwIfAborted(); return { sourceId: CAMPUS_ACTIVITY_SOURCE_ID, resource: 'menus', status: 'fresh',
    observedAt: new Date().toISOString(), data: { catalogOnly: true, recordRead: false, modules: CAMPUS_ACTIVITY_MODULES, officialSubmissionAvailable: false }, coverage: { complete: true, kind: 'catalog' } }; }
  async authenticate(signal?: AbortSignal): Promise<CampusActivityObservation> { signal?.throwIfAborted(); const snapshot = this.snapshot();
    return { sourceId: CAMPUS_ACTIVITY_SOURCE_ID, resource: 'profile', status: snapshot ? 'fresh' : 'unavailable', observedAt: new Date().toISOString(),
      ...(snapshot ? { fetchedAt: snapshot.document.fetchedAt, snapshotId: snapshot.id, data: { importedSourceChecked: true, recordRead: false, live: false, authenticated: false } } : {}),
      coverage: { complete: false, kind: 'unknown' }, note: snapshot ? 'The explicitly imported local file is available. No university sign-in was attempted.' : 'Choose an activity data file before reading records.' }; }
  async read(args: CampusActivityReadArgs, signal?: AbortSignal): Promise<CampusActivityObservation> {
    signal?.throwIfAborted(); const observedAt = new Date().toISOString();
    if (args.refresh && args.snapshotId) throw new HarnessError('campus_activity_snapshot', 'A continuation stays on its saved snapshot. Start a separate refresh for new records.');
    if (args.refresh) { const selected = this.selection(); if (selected) this.configure(selected.file); }
    let snapshot = this.snapshot(args.snapshotId);
    const unavailable = (reason: string): CampusActivityObservation => ({ sourceId: CAMPUS_ACTIVITY_SOURCE_ID,
      resource: args.resource, status: 'unavailable', observedAt, coverage: { complete: false, kind: 'unknown' }, error: { code: 'resource_unavailable', message: reason } });
    if (!snapshot) return unavailable('No readable snapshot is connected for this source.');
    let selected = snapshot.document.resources[args.resource]; if (!selected) return unavailable('This source does not include the selected resource. This is not an empty-record result.');
    if (args.snapshotId && [args.termId,args.courseId,args.recordId,args.schoolYear,args.subpage,args.venueSiteId,args.searchDate,args.begin,args.end,args.period,args.validStatus].some(value=>value!==undefined))
      throw new HarnessError('campus_activity_continuation', 'Continue the saved selection without changing its query conditions. Start a new read to change them.');
    if (args.upstreamPage !== undefined) return unavailable('This source is a local snapshot. Continue with its snapshot ID and offset; no live upstream page exists.');
    const root = `/resources/${args.resource}/data`, pointer = args.pointer || root;
    if (pointer !== root && !pointer.startsWith(root + '/') || /(?:password|secret|cookie|token|authorization)/i.test(pointer)) throw new HarnessError('campus_activity_pointer', 'Use a readable original address within this activity resource.');
    let value: any = selected.data, unknownSelection = 0;
    for (const part of pointer.slice(root.length).split('/').filter(Boolean)) value = value?.[part.replaceAll('~1', '/').replaceAll('~0', '~')];
    if (value === undefined) return unavailable('That original address is not present in this immutable snapshot.');
    const offset = args.offset || 0, limit = args.limit || 8;
    const filters = ([
      ['termId',args.termId,['termId','term_id']],['courseId',args.courseId,['courseId','course_id']],['recordId',args.recordId,['recordId','id']],
      ['schoolYear',args.schoolYear,['schoolYear','academicYear']],['subpage',args.subpage,['subpage']],['venueSiteId',args.venueSiteId,['venueSiteId']],
      ['searchDate',args.searchDate,['searchDate','date']],['begin',args.begin,['begin']],['end',args.end,['end']],['period',args.period,['period']],['validStatus',args.validStatus,['validStatus']],
    ] as [string,unknown,string[]][]).filter(entry=>entry[1]!==undefined);
    if (!args.snapshotId && !args.pointer && filters.length) {
      const matches = (row: any) => filters.every(([key,expected,aliases])=>{
        const sourceValue = selected.selection?.[key] ?? (row && typeof row==='object' ? aliases.map(alias=>row[alias]).find(value=>value!==undefined) : undefined);
        if(sourceValue===undefined){unknownSelection++;return false;} return sourceValue===expected;
      });
      if (Array.isArray(value)) value=value.filter(matches);
      else if (!matches(value)) return unavailable(unknownSelection ? 'The imported resource does not declare the requested selection or statistics range.' : 'This resource describes a different selection or statistics range.');
      if (unknownSelection) return unavailable('Some source records do not declare the requested selection or statistics range. A filtered empty result would not be reliable.');
      // This immutable response retains its acquisition and selection lineage.
      // A continuation reads the same response, rather than reapplying a query to a new head.
      const selector=Object.fromEntries(filters.map(([key,value])=>[key,value]));
      const id=digest(JSON.stringify({sourceSnapshotId:snapshot.id,resource:args.resource,selector})).slice(0,32);
      const document=structuredClone(snapshot.document);document.resources[args.resource]={...selected,data:value,selection:selector as Record<string,any>};
      const response:Snapshot={...snapshot,id,document,derivedFrom:snapshot.id,selector};
      const responseFile=path.join(this.directory,'snapshots',`${id}.json`);if(!existsSync(responseFile))writeFileSync(responseFile,JSON.stringify(response),{flag:'wx'});
      snapshot=response;selected=document.resources[args.resource];
    }
    const total = Array.isArray(value) ? value.length : typeof value === 'string' ? [...value].length : 1;
    const data = Array.isArray(value) ? value.slice(offset, offset + limit) : typeof value === 'string' ? [...value].slice(offset, offset + limit).join('') : value;
    signal?.throwIfAborted(); if (!this.snapshot(snapshot.id)) return unavailable('The selected activity source changed during this read.');
    return { sourceId: CAMPUS_ACTIVITY_SOURCE_ID, resource: args.resource, status: selected.complete ? 'saved' : 'partial', observedAt,
      fetchedAt: snapshot.document.fetchedAt, snapshotId: snapshot.id, data,
      coverage: { complete: selected.complete, kind: selected.kind, total, returned: Array.isArray(data) ? data.length : 1, offset, pointer,
        ...(offset + limit < total ? { next: { snapshotId: snapshot.id, offset: offset + limit, pointer } } : {}),
        upstreamPagination: 'whole_response', extent: 'returned_response', unit: 'unicode_codepoints' },
      note: 'Read from an explicitly imported local source. It does not establish current university status, attendance, booking, or official exercise credit.' };
  }
}
