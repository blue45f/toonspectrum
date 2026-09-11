import { describe, expect, it } from "vitest";

import { planStudioPublishingPackage } from "./studio-publishing-package";

import type { StudioExportPreflightResult } from "./studio-export-preflight";
import type { StudioRightsAuditReport } from "./studio-rights-graph";

const HASH = `sha256:${"c".repeat(64)}`;
const PREFLIGHT: StudioExportPreflightResult = Object.freeze<StudioExportPreflightResult>({
  target: "webtoon-platform",
  policyVersion: "2026-09",
  status: "pass",
  blockingCount: 0,
  warningCount: 0,
  findings: [],
  summaryKo: "준비 완료",
  summaryEn: "Ready",
});
const RIGHTS: StudioRightsAuditReport = Object.freeze<StudioRightsAuditReport>({
  status: "allowed",
  rootIds: ["document"],
  entries: [{
    id: "document",
    kind: "document",
    title: "1화",
    status: "allowed",
    licenseId: null,
    attributionText: null,
    sourceUrl: null,
    paths: [["document"]],
  }],
  attributionTexts: ["Background by Artist"],
  findings: [],
});

function input() {
  return {
    projectId: "project-1",
    documentId: "document-1",
    targetId: "platform-a",
    policyVersion: "2026-09",
    preflight: PREFLIGHT,
    rights: RIGHTS,
    locales: [{ locale: "ko", status: "complete" as const, blockingIssueCount: 0, warningIssueCount: 0 }],
    metadata: [{ locale: "ko", title: "1화", description: "첫 번째 에피소드", author: "작가", contentRating: "all", tags: ["성장", "로맨스"] }],
    files: [
      { path: "ko/episode-1.png", role: "content" as const, sizeBytes: 1000, checksum: HASH, locale: "ko" },
      { path: "thumbnail.webp", role: "thumbnail" as const, sizeBytes: 200, checksum: HASH, locale: null },
    ],
    aiDisclosureRequired: true,
    aiDisclosureText: "AI-assisted cleanup was used.",
    additionalAttributionTexts: ["Font by Foundry"],
    createdAt: "2026-09-11T00:00:00.000Z",
  };
}

describe("Studio publishing package", () => {
  it("builds a deterministic rights-aware publishing manifest", () => {
    const first = planStudioPublishingPackage(input());
    const second = planStudioPublishingPackage({
      ...input(),
      files: [...input().files].reverse(),
      metadata: input().metadata.map((item) => ({ ...item, tags: [...item.tags].reverse() })),
    });
    expect(first.status).toBe("ready");
    expect(first.manifest).toMatchObject({
      packageId: expect.stringMatching(/^publish:/u),
      locales: ["ko"],
      attributionTexts: ["Background by Artist", "Font by Foundry"],
      aiDisclosureText: "AI-assisted cleanup was used.",
      totalSizeBytes: 1200,
    });
    expect(second.manifest?.packageId).toBe(first.manifest?.packageId);
  });

  it("blocks failed preflight, rights, localization and missing disclosure", () => {
    const plan = planStudioPublishingPackage({
      ...input(),
      preflight: { ...PREFLIGHT, status: "blocked", blockingCount: 1 },
      rights: { ...RIGHTS, status: "blocked" },
      locales: [{ locale: "ko", status: "blocked", blockingIssueCount: 2, warningIssueCount: 0 }],
      aiDisclosureText: null,
    });
    expect(plan.status).toBe("blocked");
    expect(plan.manifest).toBeNull();
    expect(plan.blockingCodes).toEqual(expect.arrayContaining([
      "preflight-blocked",
      "rights-blocked",
      "locale-blocked:ko",
      "ai-disclosure-missing",
    ]));
  });

  it("warns about review locales and a missing thumbnail without hiding content", () => {
    const plan = planStudioPublishingPackage({
      ...input(),
      locales: [{ locale: "ko", status: "review", blockingIssueCount: 0, warningIssueCount: 1 }],
      files: input().files.filter((file) => file.role === "content"),
    });
    expect(plan.status).toBe("review");
    expect(plan.manifest).not.toBeNull();
    expect(plan.warningCodes).toEqual(expect.arrayContaining([
      "locale-review:ko",
      "thumbnail-file-missing",
    ]));
  });
});
