import { describe, expect, it } from "vitest";

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
