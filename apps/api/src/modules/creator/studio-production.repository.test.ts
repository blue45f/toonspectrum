import { describe, expect, it, vi } from "vitest";
import { validateStudioProductionReviewChanges } from "./studio-production-review-reference";

import {
  hashStudioReviewToken,
  studioProductionRepositoryTestHelpers as helpers,
} from "./studio-production.repository";

import type { StudioProductionWorkspaceDocument } from "./studio-production.dto";

const NOW = "2026-09-15T00:00:00.000Z";

function workspace(): StudioProductionWorkspaceDocument {
  return {
    schemaVersion: 3,
    revision: 0,
    scopeKey: "work:chapter-1",
    title: "1화 제작 운영",
    updatedAt: NOW,
    tasks: [],
    reviews: [],
    hierarchy: [],
    roleAssignments: [],
    handoffs: [],
    versions: [],
    slides: [],
    members: [],
    inviteToken: null,
  };
}
function task(stage: StudioProductionWorkspaceDocument["tasks"][number]["stage"]) {
  return {
    id: "task-1",
    title: "선화",
    owner: "작화 작가",
    due: "2026-09-20",
    progress: 0,
    status: "todo" as const,
    stage,
    priority: "normal" as const,
    role: "lineart" as const,
    hierarchyNodeId: null,
    dependencyIds: [],
    assigneeIds: [],
    reviewerIds: [],
    blockedReason: "",
  };
}

describe("protectedProductionOperation", () => {
  it("allows ordinary content edits while protecting role, approval, and publish boundaries", () => {
    const current = workspace();
    expect(helpers.protectedProductionOperation(current, {
      ...current,
      title: "수정된 제목",
    })).toBeNull();

    expect(helpers.protectedProductionOperation(current, {
      ...current,
      members: ["디렉터"],
    })).toBe("manage-roles");
    expect(helpers.protectedProductionOperation(current, {
      ...current,
      tasks: [task("approved")],
    })).toBe("approve");

    expect(helpers.protectedProductionOperation(current, {
      ...current,
      tasks: [task("publishing")],
    })).toBe("publish");

    const publishing = { ...current, tasks: [task("publishing")] };
    expect(helpers.protectedProductionOperation(publishing, {
      ...publishing,
      tasks: [],
    })).toBe("publish");
  });

  it("requires approval authority when an approval-gated review is resolved", () => {
    const review = {
      id: "review-1",
      title: "최종 검수",
      assignee: "디렉터",
      severity: "blocker" as const,
      status: "open" as const,
      hierarchyNodeId: null,
      pageId: null,
      requestedByRole: "director" as const,
      approvalRequired: true,
    };
    const current = { ...workspace(), reviews: [review] };
    expect(helpers.protectedProductionOperation(current, {
      ...current,
      reviews: [{ ...review, status: "resolved" }],
    })).toBe("approve");
  });
});

describe("external review page projection", () => {
  it("uses stable document IDs while repairing invalid or duplicate IDs", () => {
    expect(helpers.projectExternalReviewPages(
      ["source-a", "source-b", "source-c", "source-d"],
      {
        pagesList: [
          { id: "page-2" },
          { id: "page-2" },
          { id: "canonical-page" },
          { id: "invalid\\page" },
        ],
      },
    )).toEqual([
      { id: "page-2", index: 0, source: "source-a" },
      { id: "page-2-2", index: 1, source: "source-b" },
      { id: "canonical-page", index: 2, source: "source-c" },
      { id: "page-4", index: 3, source: "source-d" },
    ]);
  });

  it("hashes review capabilities without retaining their raw value", () => {
    const raw = "review-capability-that-must-not-be-stored";
    const digest = hashStudioReviewToken(raw);
    expect(digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(digest).not.toContain(raw);
    expect(hashStudioReviewToken(raw)).toBe(digest);
  });
});

describe("production review assignment change boundary", () => {
  function linked(): StudioProductionWorkspaceDocument {
    return { ...workspace(), roleAssignments: [{ id: "role-editor", memberId: "user-editor", displayName: "Editor", roles: ["lineart"], hierarchyNodeId: null }],
      tasks: [{ ...task("planning"), assigneeIds: ["role-editor"], reviewRef: { subject: { schemaVersion: 1,
        workId: "chapter-1", projectId: "project", artifactId: "artifact", reviewId: "review", revisionId: "snapshot", rootGraphHash: "a".repeat(64) },
      commentId: "comment", handoffId: null } }] };
  }
  function authority() { return { readReference: vi.fn(async () => ["user-editor"] as readonly string[] | null), readEligibleUserIds: vi.fn(async () => ["user-editor"]) }; }
  it("does not require new membership admission for unchanged historical links, equivalent role order, or display-only edits", async () => {
    const current = linked(), port = authority(); const next = structuredClone(current);
    next.tasks[0]!.title = "Completed work"; next.tasks[0]!.status = "done"; next.roleAssignments[0]!.displayName = "Updated display name";
    port.readEligibleUserIds.mockResolvedValue([]);
    await validateStudioProductionReviewChanges(current, next, port);
    expect(port.readReference).not.toHaveBeenCalled(); expect(port.readEligibleUserIds).not.toHaveBeenCalled();
  });
  it("detects semantic rebindings behind an unchanged role ID and requires current comment-user coverage", async () => {
    const current = linked(), next = structuredClone(current), port = authority();
    next.roleAssignments[0]!.memberId = "other-user"; port.readEligibleUserIds.mockResolvedValue(["other-user", "user-editor"]);
    await expect(validateStudioProductionReviewChanges(current, next, port)).rejects.toMatchObject({ reason: "assignees" });
    expect(port.readReference).toHaveBeenCalledOnce();
  });
  it("validates newly manufactured version-only references while preserving existing historical ones", async () => {
    const current = linked(), next = structuredClone(current), port = authority();
    next.versions = [{ id: "version", name: "Saved version", createdAt: NOW, tasks: structuredClone(next.tasks), reviews: [], hierarchy: [], roleAssignments: next.roleAssignments, handoffs: [] }];
    await validateStudioProductionReviewChanges(current, next, port); expect(port.readReference).not.toHaveBeenCalled();
    next.versions[0]!.tasks[0]!.reviewRef!.commentId = "forged-comment"; port.readReference.mockResolvedValue(null);
    await expect(validateStudioProductionReviewChanges(current, next, port)).rejects.toMatchObject({ reason: "reference" });
    expect(port.readReference).toHaveBeenCalledOnce();
  });
  it("preserves legacy member-ID assignments on ordinary unlinked work but never silently converts them for a new link", async () => {
    const current = linked(), next = structuredClone(current), port = authority();
    delete current.tasks[0]!.reviewRef; current.tasks[0]!.assigneeIds = ["user-editor"];
    await validateStudioProductionReviewChanges(workspace(), current, port); expect(port.readReference).not.toHaveBeenCalled();
    next.tasks[0]!.assigneeIds = ["user-editor"];
    await expect(validateStudioProductionReviewChanges(current, next, port)).rejects.toMatchObject({ reason: "assignees" });
  });
});
