import { z } from "zod";

import rawManifest from "./manifest/providers.json";

/**
 * Candidate manifest — machine-readable mirror of the V11 engine placement
 * matrix (E01–E28). This is the license/deployment ledger the candidate docs
 * and the registry both reference; drift against the CSV is a review error.
 */

export const candidateEntrySchema = z.object({
  id: z.string().regex(/^E\d{2}$/),
  key: z.string().min(1),
  name: z.string().min(1),
  area: z.string().min(1),
  role: z.string().min(1),
  verdict: z.string().min(1),
  license: z.string().min(1),
  url: z.string().url(),
});
export type CandidateEntry = z.infer<typeof candidateEntrySchema>;

export const candidateManifestSchema = z.object({
  generatedFrom: z.string().min(1),
  entries: z.array(candidateEntrySchema).length(28),
});
export type CandidateManifest = z.infer<typeof candidateManifestSchema>;

export function loadCandidateManifest(): CandidateManifest {
  return candidateManifestSchema.parse(rawManifest);
}

export function findCandidate(idOrKey: string): CandidateEntry | null {
  const manifest = loadCandidateManifest();
  return (
    manifest.entries.find(
      (entry) => entry.id === idOrKey || entry.key === idOrKey,
    ) ?? null
  );
}
