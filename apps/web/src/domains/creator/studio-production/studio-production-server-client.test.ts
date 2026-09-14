import { beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyProductionWorkspace } from "./studio-production-workspace-runtime";

import {
  loadStudioExternalReview,
  StudioProductionServerContractError,
  studioProductionServerClientTestHelpers as helpers,
} from "./studio-production-server-client";

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));
vi.mock("@/infrastructure/api", () => ({
  api: http,
  isHttpError: () => false,
  toApiError: async (error: unknown, fallback: string) =>
    error instanceof Error ? error : new Error(fallback),
}));

const NOW = "2026-09-15T00:00:00.000Z";
const TOKEN = `T${"o".repeat(31)}`;

function capabilities() {
  return { view: true, edit: true, manageLinks: true, manageRoles: true, approve: true, publish: true };
}
function externalReview() {
  return {
    link: {
      id: "link-1",
      role: "commenter" as const,
      pageIds: ["page-1"],
      watermark: true,
      allowDownload: false,
      expiresAt: "2026-09-16T00:00:00.000Z",
    },
    work: {
      id: "work-1",
      title: "검토 작품",
      description: "",
      cover: "",
      pages: [{ id: "page-1", index: 0, source: "https://example.com/page-1.png" }],
    },
    feedback: [{
      id: "feedback-1",
      kind: "comment" as const,
      reviewerName: "검수자",
      anchor: { pageId: "page-1", x: 0.25, y: 0.5 },
      body: "수정 의견",
      createdAt: NOW,
    }],
  };
}

beforeEach(() => vi.clearAllMocks());
describe("studio production server client contracts", () => {
  it("accepts a revision-matched workspace with explicit role-management authority", () => {
    const document = createEmptyProductionWorkspace("work:chapter-1", NOW);
    expect(helpers.parseServerWorkspace({
      workId: "chapter-1",
      revision: 0,
      updatedAt: NOW,
      capabilities: capabilities(),
      document,
    }, "chapter-1")).toMatchObject({
      workId: "chapter-1",
      revision: 0,
      capabilities: { manageRoles: true },
    });
  });

  it("rejects incomplete capabilities and mismatched workspace revisions", () => {
    const document = createEmptyProductionWorkspace("work:chapter-1", NOW);
    const withoutRoleAuthority = { ...capabilities() } as Partial<ReturnType<typeof capabilities>>;
    delete withoutRoleAuthority.manageRoles;
    expect(() => helpers.parseServerWorkspace({
      workId: "chapter-1", revision: 0, updatedAt: NOW,
      capabilities: withoutRoleAuthority, document,
    }, "chapter-1")).toThrow(StudioProductionServerContractError);
    expect(() => helpers.parseServerWorkspace({
      workId: "chapter-1", revision: 1, updatedAt: NOW,
      capabilities: capabilities(), document,
    }, "chapter-1")).toThrow(/리비전/u);
  });
  it("rejects secret-bearing Personal Kit payloads and duplicate review scopes", () => {
    const document = {
      schemaVersion: 1 as const,
      updatedAt: NOW,
      workspaceProfiles: [],
      quickAccess: { apiKey: "must-not-sync" },
      gestureMap: {},
      penButtonMap: {},
      touchPolicy: "pen-draw-touch-pan" as const,
      favoriteRefs: [],
    };
    expect(() => helpers.parseServerPersonalKit({
      revision: 0,
      updatedAt: NOW,
      document,
    })).toThrow(StudioProductionServerContractError);
    expect(() => helpers.canonicalReviewLinkInput({
      role: "commenter",
      pageIds: ["page-1", "page-1"],
      watermark: true,
      allowDownload: false,
      expiresInHours: 24,
    })).toThrow(TypeError);
  });

  it("requires complete anchor coordinates and meaningful non-approval feedback", () => {
    expect(() => helpers.canonicalExternalFeedbackInput({
      kind: "comment", reviewerName: "검수자",
      anchor: { pageId: "page-1", x: 0.5 }, body: "의견",
    })).toThrow(TypeError);
    expect(() => helpers.canonicalExternalFeedbackInput({
      kind: "reject", reviewerName: "검수자", anchor: null, body: "   ",
    })).toThrow(TypeError);
    expect(helpers.canonicalExternalFeedbackInput({
      kind: "approve", reviewerName: "검수자", anchor: null, body: "",
    })).toMatchObject({ kind: "approve", body: "" });
  });

  it("rejects duplicate pages, unknown anchors, and partial response coordinates", async () => {
    const duplicate = externalReview();
    duplicate.work.pages.push({
      id: "page-1", index: 1, source: "https://example.com/page-2.png",
    });
    http.get.mockResolvedValueOnce(duplicate);
    await expect(loadStudioExternalReview(TOKEN)).rejects.toThrow(
      StudioProductionServerContractError,
    );

    const unknownAnchor = externalReview();
    unknownAnchor.feedback[0]!.anchor = { pageId: "page-2", x: 0.2, y: 0.4 };
    http.get.mockResolvedValueOnce(unknownAnchor);
    await expect(loadStudioExternalReview(TOKEN)).rejects.toThrow(
      StudioProductionServerContractError,
    );

    const partialCoordinates = externalReview();
    (partialCoordinates.feedback[0]! as unknown as { anchor: unknown }).anchor = { pageId: "page-1", x: 0.2 };
    http.get.mockResolvedValueOnce(partialCoordinates);
    await expect(loadStudioExternalReview(TOKEN)).rejects.toThrow(
      StudioProductionServerContractError,
    );
  });

  it("accepts a page-scoped external review with canonical feedback", async () => {
    http.get.mockResolvedValueOnce(externalReview());
    await expect(loadStudioExternalReview(TOKEN)).resolves.toMatchObject({
      link: { role: "commenter", pageIds: ["page-1"] },
      work: { pages: [{ id: "page-1" }] },
      feedback: [{ anchor: { pageId: "page-1", x: 0.25, y: 0.5 } }],
    });
  });
});
