import type { Store } from '../store';
import { HarnessError } from '../../shared/harness';
import { campusScheduleInput, type CampusScheduleResult } from '../../shared/campus-calendar';
import { campusConstraintSummary } from '../actions/planning-campus';

/** One private, bounded native read through the configured connector's normal
 * path. No model call or agenda writer; connector authentication is unchanged. */
export class NativeCampusCalendar {
  constructor(readonly store: Store) {}
  async read(raw: unknown): Promise<CampusScheduleResult> {
    const window = campusScheduleInput.parse(raw), runtime = this.store.runtime;
    const sourceBoundary = runtime.policy.sourceBoundary;
    if (runtime.presentation.public) throw new HarnessError('private_view_required', 'Return to the private view to read your campus schedule.');
    const base = runtime.policy.validate(runtime.policy.hostScope());
    const handle = runtime.policy.hostScope({ sources: base.sources.filter(source => source === 'campus:academic-account'),
      grants: base.grants.filter(grant => ['campus:read', 'evidence:read'].includes(grant)), infer: false });
    runtime.policy.require(handle, 'campus:read');
    const scope = runtime.policy.validate(handle);
    if (!scope.sources.includes('campus:academic-account')) throw new HarnessError('source_forbidden', 'This campus source is outside the current read permission.');
    const connector = runtime.connections.campus?.describe();
    const campus = connector?.configured && connector.available && connector.credentialsConfigured !== false
      ? await runtime.planning.readCampus(scope, window.from, window.to, new AbortController().signal) : null;
    runtime.policy.require(handle, 'campus:read');
    const current = runtime.policy.validate(handle);
    if (sourceBoundary !== runtime.policy.sourceBoundary)
      throw new HarnessError('campus_calendar_changed', 'The campus connection or source scope changed during reading. Open the current source again.');
    if (runtime.presentation.public) throw new HarnessError('private_view_required', 'The presentation scope changed; campus data was not delivered.');
    if (!campus || campus.proofs.length === 0) return { readMode: 'existing_connector_default', status: 'not_read', window, sourceId: 'campus:academic-account', snapshotVersion: null, items: [], snapshots: [], scheduleQuality: campus?.scheduleQuality || [],
      issues: campus?.issues.length ? campus.issues : ['No connected personal campus snapshot was read. This does not mean there are no classes or exams.'], cancelledCount: null, pendingCount: null,
      coverage: { completeForSavedSnapshot: false, live: false, attendanceEstablished: false, realAvailabilityEstablished: false },
      meaning: 'Read through the explicitly configured campus owner. The owner retains source acquisition and completeness; no local calendar entry was created.' };
    if (!runtime.planning.campusCurrent(current, campus))
      throw new HarnessError('campus_calendar_changed', 'The campus source, snapshot or read scope changed during reading. The old result was not delivered; reopen the current source.');
    const summary = campusConstraintSummary(campus);
    return { readMode: 'existing_connector_default', status: campus.coverage.status === 'complete' ? 'ready' : 'partial', window, sourceId: campus.sourceId,
      snapshotVersion: campus.version, items: campus.items, snapshots: summary.snapshots, scheduleQuality: campus.scheduleQuality, issues: campus.issues,
      cancelledCount: campus.cancelledCount, pendingCount: campus.pendingCount,
      coverage: { completeForSavedSnapshot: campus.coverage.status === 'complete', live: false, attendanceEstablished: false, realAvailabilityEstablished: false },
      meaning: summary.meaning };
  }
}
