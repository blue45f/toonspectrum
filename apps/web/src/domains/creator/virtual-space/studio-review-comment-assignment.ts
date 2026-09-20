import type { StudioTeamMember, StudioTeamSnapshot } from "../studio-team-client";

/** Match the repository's work-owner or active admin/editor policy using user IDs. */
export function studioReviewAssignmentCandidates(team: StudioTeamSnapshot, workId: string, actorId: string): readonly StudioTeamMember[] {
  if (team.workId !== workId || team.viewer.userId !== actorId || team.viewer.status !== "active"
    || !team.viewer.capabilities.view || !team.viewer.capabilities.comment) throw new Error("review-assignment-access-unavailable");
  return team.members.filter((member) => member.status === "active"
    && ((member.isOwner && member.role === "owner") || (!member.isOwner && ["admin", "editor"].includes(member.role))));
}

export function normalizeStudioReviewAssignees(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

export function studioReviewAssigneesAllowed(team: StudioTeamSnapshot, workId: string, actorId: string, ids: readonly string[]): boolean {
  const allowed = new Set(studioReviewAssignmentCandidates(team, workId, actorId).map((member) => member.userId));
  return ids.length <= 64 && ids.every((id) => allowed.has(id));
}

/** datetime-local expresses the user's wall clock. Reject impossible dates/DST gaps instead of rolling them forward. */
export function studioReviewDueAt(value: string): { ok: true; dueAt?: string } | { ok: false } {
  if (!value) return { ok: true };
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return { ok: false };
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (year! < 100 || month! < 1 || month! > 12 || day! < 1 || day! > 31 || hour! > 23 || minute! > 59) return { ok: false };
  const date = new Date(year!, month! - 1, day, hour, minute);
  if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day
    || date.getHours() !== hour || date.getMinutes() !== minute) return { ok: false };
  return { ok: true, dueAt: date.toISOString() };
}
