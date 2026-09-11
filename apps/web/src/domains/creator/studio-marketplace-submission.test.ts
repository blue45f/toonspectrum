import { describe, expect, it } from "vitest";

import {
  evaluateStudioMarketplaceSubmission,
  transitionStudioMarketplaceSubmission,
  type StudioMarketplaceSubmission,
} from "./studio-marketplace-submission";

const HASH = `sha256:${"a".repeat(64)}`;
const SUBMISSION: StudioMarketplaceSubmission = Object.freeze<StudioMarketplaceSubmission>({
  id: "asset-1",
  sellerId: "seller-1",
  title: "웹툰 학교 배경",
  description: "카메라와 조명을 조절할 수 있는 학교 배경입니다.",
  assetType: "3d-background",
  status: "draft",
  version: 1,
  priceMinor: 19000,
  currency: "KRW",
  licenseId: "commercial-standard",
  aiClassification: "none",
  aiProviderNames: [],
  sourceReferencesCleared: true,
  compatibilityTargets: ["web", "desktop"],
  qualityScore: 92,
  files: [
    { path: "school.glb", role: "primary", format: "glb", sizeBytes: 1024, checksum: HASH },
    { path: "preview.webp", role: "preview", format: "webp", sizeBytes: 512, checksum: HASH },
  ],
  moderationNotes: [],
  updatedAt: "2026-09-11T00:00:00.000Z",
});

describe("Studio marketplace submission", () => {
  it("moves a ready submission through review, approval and publication", () => {
    expect(evaluateStudioMarketplaceSubmission(SUBMISSION)).toEqual({
      status: "ready",
      findings: [],
    });
    const submitted = transitionStudioMarketplaceSubmission(SUBMISSION, {
      type: "submit",
      at: "2026-09-11T00:01:00.000Z",
    });
    const approved = transitionStudioMarketplaceSubmission(submitted, {
      type: "approve",
      at: "2026-09-11T00:02:00.000Z",
    });
    expect(transitionStudioMarketplaceSubmission(approved, {
      type: "publish",
      at: "2026-09-11T00:03:00.000Z",
    }).status).toBe("published");
  });

  it("records actionable change requests and permits resubmission", () => {
    const submitted = transitionStudioMarketplaceSubmission(SUBMISSION, {
      type: "submit",
      at: "2026-09-11T00:01:00.000Z",
    });
    const changes = transitionStudioMarketplaceSubmission(submitted, {
      type: "request-changes",
      at: "2026-09-11T00:02:00.000Z",
      note: "선화 미리보기를 추가해 주세요.",
    });
    expect(changes).toMatchObject({
      status: "changes-requested",
      moderationNotes: ["선화 미리보기를 추가해 주세요."],
    });
    expect(transitionStudioMarketplaceSubmission(changes, {
      type: "submit",
      at: "2026-09-11T00:03:00.000Z",
    }).status).toBe("submitted");
  });

  it("blocks incomplete rights, quality and AI declarations", () => {
    const result = evaluateStudioMarketplaceSubmission({
      ...SUBMISSION,
      qualityScore: 60,
      aiClassification: "generated",
      sourceReferencesCleared: false,
      files: SUBMISSION.files.filter((file) => file.role === "primary"),
    });
    expect(result.status).toBe("blocked");
    expect(result.findings.map((item) => item.code)).toEqual(expect.arrayContaining([
      "quality-threshold",
      "preview-file",
      "ai-provider",
      "source-rights",
    ]));
  });

  it("keeps published submissions immutable through the workflow", () => {
    const published = { ...SUBMISSION, status: "published" as const };
    expect(() => transitionStudioMarketplaceSubmission(published, {
      type: "submit",
      at: "2026-09-11T00:01:00.000Z",
    })).toThrow("not allowed");
  });
});
