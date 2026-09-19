/** Only immutable server identities cross the peer channel: never URLs, tokens or document data. */
export interface StudioVirtualSpaceReviewSubject {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly workId: string;
  readonly artifactId: string;
  readonly reviewId: string;
  readonly revisionId: string;
  readonly rootGraphHash: string;
}

const KEYS = ["schemaVersion", "projectId", "workId", "artifactId", "reviewId", "revisionId", "rootGraphHash"] as const;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/u;

export function parseStudioVirtualSpaceReviewSubject(value: unknown): StudioVirtualSpaceReviewSubject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== KEYS.length || Object.keys(record).some((key) => !KEYS.includes(key as typeof KEYS[number]))
    || record.schemaVersion !== 1 || typeof record.rootGraphHash !== "string"
    || !/^[a-f0-9]{64}$/u.test(record.rootGraphHash)
    || ["projectId", "workId", "artifactId", "reviewId", "revisionId"].some((key) =>
      typeof record[key] !== "string" || !ID.test(record[key]))) return null;
  // Fixed field order gives identity comparisons stable semantics independent of JSON key order.
  return Object.freeze({ schemaVersion: 1, projectId: record.projectId as string,
    workId: record.workId as string, artifactId: record.artifactId as string,
    reviewId: record.reviewId as string, revisionId: record.revisionId as string,
    rootGraphHash: record.rootGraphHash });
}

export function sameStudioVirtualSpaceReviewSubject(
  left: StudioVirtualSpaceReviewSubject | null | undefined,
  right: StudioVirtualSpaceReviewSubject | null | undefined,
): boolean {
  if (!left || !right) return !left && !right;
  return KEYS.every((key) => left[key] === right[key]);
}
