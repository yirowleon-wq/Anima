import type { CapabilityResult } from '../capabilities/broker';
import type { CampusScene } from '../../shared/scenes';

/** Host proofs remain with the original campus owner, outside the model body. */
export function projectCampusModelResult(capability: string, result: CapabilityResult): CapabilityResult {
  if (!['campus.lookup', 'campus.query', 'campus.imported_lookup'].includes(capability)) return result;
  const data = result.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return result;
  const body = data as Record<string, unknown>, academic = ['grades', 'gpa', 'gpa_overall', 'gpa_semesters', 'gpa_cumulative', 'retakes'].includes(String(body.domain || body.resource));
  const { snapshotProof: _proof, snapshotProofs: _proofs, ...visible } = body;
  return { ...result, data: { ...visible,
    ...(_proof || _proofs ? { hostSnapshotProof: 'The local owner retains the version proof. Continue reading the same original campus snapshot.' } : {}),
    ...(academic ? {
      academicMeaning: 'Grades, units, grade-point scale, inclusion, repeat treatment and source coverage retain their imported meanings. fourPoint is a supplied or explicitly configured four-point value, not a conversion from another institution’s scale. Unknown grades, missing results and zero are distinct. The GPA denominator includes only the attempts actually admitted by the declared policy. Earned units are separate and adding repeated earned units can double-count credit. Term, cumulative cutoff, major selection and attempt policies each have their own denominator. A local calculation is not an official university transcript or degree decision. Acquisition time is not grade publication time.',
      academicCalculation: 'Read the original course units, points and inclusion status, then a GPA G and denominator C for the same scale, scope and attempt selection. If this attempt is included and every other included attempt and denominator remains unchanged, changing its points to p gives G + units×(p−originalPoints)/C. Adding an included c-unit course without replacing another gives (G×C+p×c)/(C+c). Verify repeat and replacement rules first. Respect the declared scale maximum; a percentage change need not change grade points. An ungraded course remains unknown; a target is a hypothetical condition. Combine term averages by their actual denominators, not a simple average. A major-only analysis needs actual source-confirmed major membership and a separately filtered denominator.',
      academicPolicyGuidance: 'Use the policy applicable to the source, institution, program, cohort, year and purpose. Consult an appropriate public source when needed; an import alone does not establish the person’s enrollment or make an unrelated institution’s policy applicable.',
    } : {}) } };
}

/** A document address is not a reading of unseen course rows. */
export function campusNativeModelResult(result: CapabilityResult, scene: CampusScene): CapabilityResult & {
  sceneRef: { id: string; revision: number }; presentation: string;
} {
  const source = result.data as Record<string, unknown>;
  return { ...result, data: { domain: scene.domain, modelBodyDelivered: false,
    nativeDocument: { id: scene.id, revision: scene.revision, kind: scene.kind, term: scene.term,
      returned: scene.records.length, total: scene.total, complete: scene.complete, source: scene.source, sourceLabel: scene.sourceLabel },
    sourceCoverage: source.sourceCoverage ?? source.coverage, ...(source.authentication ? { authentication: source.authentication } : {}),
    ...(source.courseRecords ? { courseRecords: source.courseRecords } : {}), next: scene.continuation || null,
    meaning: 'Individual courses, occurrences and exams remain on the original local campus page. This response supplies coverage, counts, source and continuation addresses without row bodies. Read a specific record through its original address or the row the user selected.' },
    sceneRef: { id: scene.id, revision: scene.revision },
    presentation: 'Pass this sceneRef to present_view to unfold the same campus document. The row bodies have not been read into the model. read_current_campus_selection reads the original selected row. Term, acquisition time and read coverage remain attached to the source; scheduled classes do not prove attendance.' };
}
export function campusSceneModelSummary(scene: CampusScene) {
  const source: CampusScene['source'] = { sourceId: scene.source.sourceId, fetchedAt: '' };
  return { id: scene.id, revision: scene.revision, kind: scene.kind, domain: scene.domain, source, modelBodyDelivered: false as const,
    meaning: 'This address restores the original campus view without supplying row bodies. Check this turn’s campusReading address to identify the current page. read_current_campus_selection reads the exact original row selected on that page.' };
}
