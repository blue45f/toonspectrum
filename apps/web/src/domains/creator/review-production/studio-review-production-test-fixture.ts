import { canonicalJson } from "@toonspectrum/studio-project-model";

import { createEmptyProductionWorkspace } from "../studio-production/studio-production-workspace-runtime";
import type { StudioVirtualSpaceVerifiedReview } from "../virtual-space/studio-virtual-space-review-invitation";

import type { StudioReviewProductionAuthority, StudioReviewProductionChoice } from "./studio-review-production-model";

/** Synthetic saved records shared by behavioral tests and the development-only HTTP harness. */
export function reviewProductionFixture(now = Date.now()) {
  const at = "2026-09-20T00:00:00.000Z";
  const request = { subject: { schemaVersion: 1 as const, workId: "work", projectId: "graph", artifactId: "artifact",
    reviewId: "review", revisionId: "snapshot", rootGraphHash: "a".repeat(64) }, commentId: "comment" };
  const authority: StudioReviewProductionAuthority = { request, actorId: "actor", expiresAt: now + 15_000,
    comment: { id: "comment", reviewId: "review", authorUserId: "actor", body: "손의 방향을 수정해 주세요.", severity: "required", status: "open",
      anchor: { kind: "artifact", artifactId: "artifact", revisionId: "snapshot", scope: { projectId: "graph" } },
      assigneeIds: ["editor"], dueAt: null, resolutionRevisionId: null, resolvedBy: null, createdAt: at, updatedAt: at },
    workspace: { workId: "work", revision: 4, updatedAt: at,
      capabilities: { view: true, edit: true, manageLinks: true, manageRoles: true, approve: true, publish: true },
      document: { ...createEmptyProductionWorkspace("work:work", at), revision: 4, title: "제작 보드",
        tasks: [{ id: "task", title: "두 번째 컷 선화 수정", owner: "Editor", due: "2026-09-30", progress: 30, status: "doing", hierarchyNodeId: "episode", assigneeIds: [] },
          { id: "other-task", title: "보존할 다른 작업", owner: "", due: "2026-09-30", progress: 0, status: "todo", assigneeIds: [] }],
        hierarchy: [{ id: "episode", kind: "episode", parentId: null, title: "1화", order: 0, pageId: null }],
        roleAssignments: [{ id: "role-editor", memberId: "editor", displayName: "선화 담당", roles: ["lineart"], hierarchyNodeId: "episode" }],
        handoffs: [{ id: "handoff", hierarchyNodeId: "episode", fromRole: "story", toRole: "lineart", status: "draft", scenePurpose: "손의 방향 수정",
          emotionalBeat: "긴장", mustShow: [], continuityNotes: ["소매 유지"], lockedFields: [], acceptanceCriteria: ["손가락이 대사 방향을 가리킴", "소매 연결 유지"],
          createdBy: "actor", assignedTo: "editor", updatedAt: at }],
      } },
    team: { workId: "work", viewer: { userId: "actor", role: "owner", status: "active",
      capabilities: { view: true, comment: true, edit: true, manageMembers: true, respondInvite: false } },
      members: [{ userId: "actor", name: "작품 소유자", image: "", role: "owner", status: "active", isOwner: true },
        { userId: "editor", name: "선화 작가", image: "", role: "editor", status: "active", isOwner: false }] },
  };
  const verified: StudioVirtualSpaceVerifiedReview = { ok: true, subject: request.subject, verifiedAt: now, expiresAt: now + 15_000, href: "/pinned",
    project: { id: "graph", workId: "work", schemaVersion: 3, authorityVersion: "project-graph-v3", ownerUserId: "actor", createdAt: at, updatedAt: at,
      access: { view: true, comment: true, edit: true, manageMembers: true, respondInvite: false, owner: true, role: "owner" },
      artifacts: [{ id: "artifact", projectId: "graph", kind: "canvas-2d", title: "검수 원고", scope: { projectId: "graph" }, headRevisionId: "latest", approvedRevisionId: null,
        ownerWorkspaceId: "workspace", createdAt: at, updatedAt: at }] },
    review: { id: "review", artifactId: "artifact", revisionId: "snapshot", requestedBy: "actor", title: "수정 검수", status: "open", decidedAt: null, decidedBy: null,
      createdAt: at, updatedAt: at, reviewerIds: ["actor"], openRequiredCommentCount: 1, comments: [authority.comment] },
    revision: { id: "snapshot", artifactId: "artifact", kind: "review-snapshot", parentIds: [], rootGraphHash: request.subject.rootGraphHash,
      operationFirst: null, operationLast: null, createdBy: "actor", deviceId: "device", createdAt: at, message: null,
      compatibilityReportId: null, provenanceManifestId: null, blobRefs: [] },
  };
  const choice: StudioReviewProductionChoice = { taskId: "task", handoffId: "handoff", roleSelections: { editor: "role-editor" },
    replaceExisting: false, expectedPreviousRef: null, expectedHandoff: canonicalJson(authority.workspace.document.handoffs[0]) };
  return { request, authority, verified, choice };
}
