/** A saved source address. The academic owner issues and revalidates proofs.
 * This type neither opens credentials nor discovers external source folders. */
export interface CampusSnapshotProof {
  sourceId: 'campus:academic-account'; bundleId: string; resource: string; version: string;
  selection: 'saved_head' | 'historical'; collectedAt?: string;
  sourceFetchedAt: Record<string, string>; coverage: unknown;
  /** An anchor is not proof that the exact pointer or page was read. */
  original: { bundleId: string; pointer: string };
}
