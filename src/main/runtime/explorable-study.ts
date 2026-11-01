import { HarnessError } from '../../shared/harness';
import { explorableStudySchema, projectExplorableStudy, type ExplorableStudySpec } from '../../shared/explorable-study';

/** A calculation boundary after the real Study owner/material read. No Work,
 * facts, background job or authority is created by changing a condition. */
export function resolveExplorableStudy(spec: ExplorableStudySpec | undefined, values: unknown) {
  if (!spec) throw new HarnessError('study_exploration_changed', "This segment has no matching explanation with an editable condition. Continue from the current study page.");
  try { return projectExplorableStudy(explorableStudySchema.parse(spec), values).observation; }
  catch (error) {
    throw new HarnessError('study_exploration_range', error instanceof Error && !(error.name === 'ZodError')
      ? error.message : "The explanation or changed condition is outside this limited quadratic-relation support. Ordinary explanation or investigation can continue.");
  }
}
