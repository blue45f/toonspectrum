import type { StudioReviewComment } from "../project-graph/studio-project-graph-contract";

export const REVIEW_NOTE_VIEWS = ["all", "open", "required", "mine", "resolved"] as const;
export type ReviewNoteView = typeof REVIEW_NOTE_VIEWS[number];
export function reviewNoteMatches(note: Pick<StudioReviewComment, "body" | "status" | "severity" | "assigneeIds">, view: ReviewNoteView, query: string, actorId: string | null): boolean {
  const closed = note.status === "resolved" || note.status === "dismissed";
  if (view === "open" && closed) return false;
  if (view === "resolved" && !closed) return false;
  if (view === "required" && (closed || note.severity !== "required")) return false;
  if (view === "mine" && (!actorId || !note.assigneeIds?.includes(actorId) || closed)) return false;
  const text = query.trim().normalize("NFKC").toLocaleLowerCase();
  return !text || note.body.normalize("NFKC").toLocaleLowerCase().includes(text);
}

/** Navigation is constrained to visible IDs; it cannot change an anchor or resolve a note. */
export function nextReviewNoteId(ids: readonly string[], currentId: string | null, direction: -1 | 1): string | null {
  if (!ids.length) return null;
  const index = currentId === null ? -1 : ids.indexOf(currentId);
  if (index < 0) return direction === 1 ? ids[0]! : ids[ids.length - 1]!;
  return ids[(index + direction + ids.length) % ids.length]!;
}
