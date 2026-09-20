import { canonicalJson, resolveStudioReviewTaskRoleSelections, studioReviewRoleAssignmentCoversTask,
  studioReviewTaskReferenceSchema, type StudioReviewTaskReference } from "@toonspectrum/studio-project-model";

import type { StudioReviewComment } from "../project-graph/studio-project-graph-contract";
import type { ProductionWorkspace } from "../studio-production/studio-production-workspace-runtime";
import type { StudioServerProductionSnapshot } from "../studio-production/studio-production-server-client";
import type { StudioTeamSnapshot } from "../studio-team-client";
import { studioReviewAssignmentCandidates } from "../virtual-space/studio-review-comment-assignment";

export type StudioReviewProductionRequest = Pick<StudioReviewTaskReference, "subject" | "commentId">;
export interface StudioReviewProductionAuthority {
  readonly request: StudioReviewProductionRequest;
  readonly comment: StudioReviewComment;
  readonly workspace: StudioServerProductionSnapshot;
  readonly team: StudioTeamSnapshot;
  readonly actorId: string;
  readonly expiresAt: number;
}
export interface StudioReviewProductionChoice {
  readonly taskId: string;
  readonly handoffId: string | null;
  readonly roleSelections: Readonly<Record<string, string>>;
  readonly replaceExisting: boolean;
  readonly expectedPreviousRef: StudioReviewTaskReference | null;
  /** Exact criteria shown when choosing the brief. Never copied into the saved reference. */
  readonly expectedHandoff: string | null;
}
export type StudioReviewProductionReason = "unavailable" | "access-denied" | "expired" | "context-changed"
  | "missing-task" | "missing-handoff" | "assignment-required" | "existing-link" | "conflict" | "uncertain";
export class StudioReviewProductionError extends Error {
  constructor(readonly reason: StudioReviewProductionReason) { super(reason); }
}
export function parseStudioReviewProductionRequest(value: StudioReviewProductionRequest): StudioReviewProductionRequest | null {
  const parsed = studioReviewTaskReferenceSchema.safeParse({ ...value, handoffId: null });
  return parsed.success ? { subject: parsed.data.subject, commentId: parsed.data.commentId } : null;
}
export function reviewProductionEligibleUserIds(authority: StudioReviewProductionAuthority): readonly string[] {
  return studioReviewAssignmentCandidates(authority.team, authority.request.subject.workId, authority.actorId).map((member) => member.userId);
}
export interface StudioReviewProductionPatch {
  readonly document: ProductionWorkspace;
  readonly reference: StudioReviewTaskReference;
  readonly roleIds: readonly string[];
  readonly changed: boolean;
}

/** Start from fresh server JSON. Only the chosen task's locator and explicit role IDs change. */
export function prepareStudioReviewProductionPatch(
  authority: StudioReviewProductionAuthority, choice: StudioReviewProductionChoice,
): StudioReviewProductionPatch {
  const document = authority.workspace.document, matches = document.tasks.filter((task) => task.id === choice.taskId);
  if (matches.length !== 1) throw new StudioReviewProductionError("missing-task");
  const task = matches[0]!;
  const handoffs = choice.handoffId === null ? [] : document.handoffs.filter((handoff) => handoff.id === choice.handoffId);
  const handoff = handoffs[0];
  if (choice.handoffId !== null && (handoffs.length !== 1 || handoff?.hierarchyNodeId !== task.hierarchyNodeId)) {
    throw new StudioReviewProductionError("missing-handoff");
  }
  if (choice.expectedHandoff !== (handoff ? canonicalJson(handoff) : null)) throw new StudioReviewProductionError("conflict");
  const reference = studioReviewTaskReferenceSchema.parse({ ...authority.request, handoffId: choice.handoffId });
  if (task.reviewRef && canonicalJson(task.reviewRef) !== canonicalJson(reference)
    && (!choice.replaceExisting || canonicalJson(choice.expectedPreviousRef) !== canonicalJson(task.reviewRef))) {
    throw new StudioReviewProductionError("existing-link");
  }
  const eligibleUserIds = reviewProductionEligibleUserIds(authority);
  const roleIds = resolveStudioReviewTaskRoleSelections({ assigneeUserIds: authority.comment.assigneeIds, task,
    roleAssignments: document.roleAssignments, hierarchy: document.hierarchy, eligibleUserIds }, choice.roleSelections);
  if (!roleIds) throw new StudioReviewProductionError("assignment-required");
  const assigneeIds = [...new Set([...(task.assigneeIds ?? []), ...roleIds])];
  for (const id of assigneeIds) {
    const roles = document.roleAssignments.filter((role) => role.id === id), role = roles[0];
    if (roles.length !== 1 || !role?.memberId || !eligibleUserIds.includes(role.memberId)
      || !studioReviewRoleAssignmentCoversTask(task.hierarchyNodeId, role.hierarchyNodeId, document.hierarchy)) {
      throw new StudioReviewProductionError("assignment-required");
    }
  }
  const next = { ...task, assigneeIds, reviewRef: reference };
  return { document: { ...document, tasks: document.tasks.map((candidate) => candidate.id === task.id ? next : candidate) },
    reference, roleIds, changed: canonicalJson(task) !== canonicalJson(next) };
}

/** A lost PUT response is complete only after an authorized read proves the exact desired link. */
export function studioReviewProductionPatchIsPresent(
  snapshot: StudioServerProductionSnapshot, taskId: string, patch: StudioReviewProductionPatch,
): boolean {
  const matches = snapshot.document.tasks.filter((task) => task.id === taskId), task = matches[0];
  return snapshot.capabilities.edit && snapshot.workId === patch.reference.subject.workId && matches.length === 1
    && canonicalJson(task?.reviewRef ?? null) === canonicalJson(patch.reference)
    && patch.roleIds.every((id) => task?.assigneeIds?.includes(id));
}
