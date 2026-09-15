import { describe, expect, it } from "vitest";

import {
  CreateStudioReviewFeedbackSchema,
  StudioPersonalKitDocumentSchema,
  StudioProductionWorkspaceDocumentSchema,
} from "./studio-production.dto";

const NOW = "2026-09-15T00:00:00.000Z";

function document() {
  return {
    schemaVersion: 3 as const,
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
function hierarchy() {
  return [
    { id: "episode-1", kind: "episode" as const, parentId: null, title: "1화", order: 0, pageId: null },
    { id: "sequence-1", kind: "sequence" as const, parentId: "episode-1", title: "도입", order: 0, pageId: null },
    { id: "scene-1", kind: "scene" as const, parentId: "sequence-1", title: "첫 만남", order: 0, pageId: null },
    { id: "page-node-1", kind: "page" as const, parentId: "scene-1", title: "1페이지", order: 0, pageId: "page-1" },
  ];
}

describe("StudioProductionWorkspaceDocumentSchema", () => {
  it("accepts the canonical episode-to-page hierarchy", () => {
    expect(StudioProductionWorkspaceDocumentSchema.safeParse({
      ...document(),
      hierarchy: hierarchy(),
    }).success).toBe(true);
  });

  it("rejects hierarchy gaps, duplicate page links, and cycles", () => {
    const wrongParent = {
      ...document(),
      hierarchy: [{
        id: "sequence-1", kind: "sequence" as const, parentId: null,
        title: "도입", order: 0, pageId: null,
      }],
    };
    expect(StudioProductionWorkspaceDocumentSchema.safeParse(wrongParent).success).toBe(false);
    const duplicatePages = hierarchy();
    duplicatePages.push({
      id: "page-node-2", kind: "page", parentId: "scene-1",
      title: "2페이지", order: 1, pageId: "page-1",
    });
    expect(StudioProductionWorkspaceDocumentSchema.safeParse({
      ...document(), hierarchy: duplicatePages,
    }).success).toBe(false);

    const tasks = ["task-a", "task-b"].map((id, index) => ({
      id,
      title: id,
      owner: "작가",
      due: "2026-09-20",
      progress: 0,
      status: "todo" as const,
      stage: "planning" as const,
      priority: "normal" as const,
      role: null,
      hierarchyNodeId: null,
      dependencyIds: [index === 0 ? "task-b" : "task-a"],
      assigneeIds: [],
      reviewerIds: [],
      blockedReason: "",
    }));
    expect(StudioProductionWorkspaceDocumentSchema.safeParse({
      ...document(), tasks,
    }).success).toBe(false);
  });
});

describe("Studio Personal Kit and external review DTOs", () => {
  it("rejects secrets and source-document data from synchronized preferences", () => {
    const base = {
      schemaVersion: 1 as const,
      updatedAt: NOW,
      workspaceProfiles: [],
      quickAccess: {},
      gestureMap: {},
      penButtonMap: {},
      touchPolicy: "pen-draw-touch-pan" as const,
      favoriteRefs: [],
    };
    expect(StudioPersonalKitDocumentSchema.safeParse(base).success).toBe(true);
    expect(StudioPersonalKitDocumentSchema.safeParse({
      ...base,
      quickAccess: { nested: { api_key: "secret" } },
    }).success).toBe(false);
    expect(StudioPersonalKitDocumentSchema.safeParse({
      ...base,
      workspaceProfiles: [{ clipboard: "private" }],
    }).success).toBe(false);
  });

  it("requires paired coordinates and a body for comment or rejection", () => {
    expect(CreateStudioReviewFeedbackSchema.safeParse({
      kind: "comment", reviewerName: "검수자",
      anchor: { pageId: "page-1", x: 0.5 }, body: "의견",
    }).success).toBe(false);
    expect(CreateStudioReviewFeedbackSchema.safeParse({
      kind: "reject", reviewerName: "검수자", anchor: null, body: " ",
    }).success).toBe(false);
    expect(CreateStudioReviewFeedbackSchema.safeParse({
      kind: "approve", reviewerName: "검수자", anchor: null, body: "",
    }).success).toBe(true);
    expect(CreateStudioReviewFeedbackSchema.safeParse({
      kind: "comment", reviewerName: "검수자",
      anchor: { pageId: "page-1", x: 0.5, y: 0.25 }, body: "의견",
    }).success).toBe(true);
  });
});
