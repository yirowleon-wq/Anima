import * as z from 'zod';

/** An explicitly chosen public reference. It never describes device location. */
export const publicEnvironmentReferenceSchema = z.object({
  id: z.string().min(1).max(100), label: z.string().min(1).max(160),
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  timeZone: z.string().min(1).max(100).refine(value => {
    try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true; } catch { return false; }
  }, 'Choose a valid IANA time zone.'),
  basis: z.literal('explicit_public_reference'),
}).strict();
export type PublicEnvironmentReference = z.infer<typeof publicEnvironmentReferenceSchema>;

/** Public institutional defaults are separate from a person's actual enrollment. */
export const DEFAULT_CAMPUS_PROFILE = {
  institutionId: 'uci', institutionLabel: 'UC Irvine', academicSystem: 'quarter',
  timeZone: 'America/Los_Angeles',
  publicWeatherReference: {
    id: 'irvine-public-reference', label: 'Irvine public reference',
    latitude: 33.6846, longitude: -117.8265, timeZone: 'America/Los_Angeles',
    basis: 'explicit_public_reference',
  } satisfies PublicEnvironmentReference,
} as const;

export function environmentReference(settings?: { environmentReference?: PublicEnvironmentReference }): PublicEnvironmentReference {
  const configured = publicEnvironmentReferenceSchema.safeParse(settings?.environmentReference);
  return configured.success ? configured.data : { ...DEFAULT_CAMPUS_PROFILE.publicWeatherReference };
}
