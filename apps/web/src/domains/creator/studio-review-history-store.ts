import type { StudioReviewSession } from "./studio-review-workflow";

export interface StudioReviewHistoryDocument {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly sessions: readonly StudioReviewSession[];
  readonly updatedAt: string;
}

export interface StudioReviewHistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function keyFor(projectId: string): string {
  const normalized = projectId.trim();
  if (!normalized || normalized === "." || normalized === ".." || normalized.includes("\\")) {
    throw new Error("A valid project id is required.");
  }
  return `toonstudio:review-history:v1:${encodeURIComponent(normalized)}`;
}

function isSession(value: unknown): value is StudioReviewSession {
  if (typeof value !== "object" || value === null) return false;
  const session = value as Partial<StudioReviewSession>;
  return typeof session.documentId === "string"
    && typeof session.versionId === "string"
    && typeof session.status === "string"
    && Array.isArray(session.requiredReviewerIds)
    && Array.isArray(session.threads)
    && Array.isArray(session.decisions)
    && typeof session.updatedAt === "string"
    && Number.isFinite(Date.parse(session.updatedAt));
}

export function readStudioReviewHistory(
  storage: StudioReviewHistoryStorage,
  projectId: string,
): StudioReviewHistoryDocument {
  const raw = storage.getItem(keyFor(projectId));
  if (raw) {
    try {
      const value = JSON.parse(raw) as Partial<StudioReviewHistoryDocument>;
      if (value.schemaVersion === 1
        && value.projectId === projectId
        && Array.isArray(value.sessions)
        && value.sessions.every(isSession)
        && typeof value.updatedAt === "string") {
        return Object.freeze({
          schemaVersion: 1,
          projectId,
          sessions: Object.freeze([...value.sessions]),
          updatedAt: value.updatedAt,
        });
      }
    } catch {
      // Corrupt review archives never replace the active project review session.
    }
  }
  return Object.freeze({
    schemaVersion: 1,
    projectId,
    sessions: Object.freeze([]),
    updatedAt: new Date(0).toISOString(),
  });
}

/** Store an immutable review version once, keyed by document and version identity. */
export function archiveStudioReviewSession(
  storage: StudioReviewHistoryStorage,
  projectId: string,
  session: StudioReviewSession,
): StudioReviewHistoryDocument {
  const current = readStudioReviewHistory(storage, projectId);
  const sessions = [
    ...current.sessions.filter((candidate) => !(
      candidate.documentId === session.documentId && candidate.versionId === session.versionId
    )),
    session,
  ].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const next = Object.freeze({
    schemaVersion: 1 as const,
    projectId,
    sessions: Object.freeze(sessions),
    updatedAt: new Date().toISOString(),
  });
  storage.setItem(keyFor(projectId), JSON.stringify(next));
  return next;
}
