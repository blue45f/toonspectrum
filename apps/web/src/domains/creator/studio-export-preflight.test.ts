import { describe, expect, it } from "vitest";

import {
  runStudioExportPreflight,
  studioExportTargetProfile,
  type StudioExportDocumentSnapshot,
} from "./studio-export-preflight";

const READY_WEBTOON: StudioExportDocumentSnapshot = Object.freeze({
  documentId: "episode-12",
  format: "png",
  width: 800,
  height: 38_400,
  segmentHeights: [12_800, 12_800, 12_800],
  estimatedFileSizeBytes: 12 * 1024 * 1024,
  dpi: 144,
  colorSpace: "sRGB",
  minimumTextPx: 22,
  missingFontIds: [],
  missingAssetIds: [],
  rightsBlockedAssetIds: [],
  rightsWarningAssetIds: [],
  aiGeneratedObjectIds: [],
  aiDisclosurePrepared: true,
  readingOrderComplete: true,
  altTextCoverage: 1,
  captionsComplete: true,
  editableStructurePreserved: true,
  localizationBlockingIssues: 0,
  unresolvedComments: 0,
});

describe("Studio export preflight", () => {
  it("passes a clean webtoon package against a versioned target profile", () => {
    expect(studioExportTargetProfile("webtoon-platform")).toMatchObject({
      policyVersion: "2026-09",
      exactWidth: 800,
      maxSegmentHeight: 12_800,
    });
    expect(runStudioExportPreflight("webtoon-platform", READY_WEBTOON)).toEqual({
      target: "webtoon-platform",
      policyVersion: "2026-09",
      status: "pass",
      blockingCount: 0,
      warningCount: 0,
      findings: [],
      summaryKo: "내보낼 준비가 되었습니다.",
      summaryEn: "Ready to export.",
    });
  });

  it("blocks incompatible format, size, segmentation, rights, AI and reading order together", () => {
    const result = runStudioExportPreflight("webtoon-platform", {
      ...READY_WEBTOON,
      format: "psd",
      width: 1_200,
      segmentHeights: [12_800, 18_000],
      estimatedFileSizeBytes: 30 * 1024 * 1024,
      missingFontIds: ["font-1"],
      missingAssetIds: ["asset-missing"],
      rightsBlockedAssetIds: ["asset-rights"],
      aiGeneratedObjectIds: ["layer-ai-1"],
      aiDisclosurePrepared: false,
      readingOrderComplete: false,
      localizationBlockingIssues: 3,
    });
    expect(result.status).toBe("blocked");
    expect(result.blockingCount).toBeGreaterThanOrEqual(9);
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "format", severity: "error" }),
      expect.objectContaining({ code: "width-exact", severity: "error" }),
      expect.objectContaining({ code: "segment-height", severity: "error" }),
      expect.objectContaining({ code: "file-size", severity: "error" }),
      expect.objectContaining({ code: "missing-fonts", affectedIds: ["font-1"] }),
      expect.objectContaining({ code: "missing-assets", affectedIds: ["asset-missing"] }),
      expect.objectContaining({ code: "rights-blocked", affectedIds: ["asset-rights"] }),
      expect.objectContaining({ code: "ai-disclosure", affectedIds: ["layer-ai-1"] }),
      expect.objectContaining({ code: "reading-order", severity: "error" }),
      expect.objectContaining({ code: "localization", severity: "error" }),
    ]));
  });

  it("keeps accessibility and review advice non-blocking for social output", () => {
    const result = runStudioExportPreflight("social", {
      ...READY_WEBTOON,
      format: "mp4",
      width: 1_080,
      height: 1_920,
      segmentHeights: [],
      estimatedFileSizeBytes: 24 * 1024 * 1024,
      minimumTextPx: 14,
      altTextCoverage: 0.5,
      captionsComplete: false,
      unresolvedComments: 2,
    });
    expect(result).toMatchObject({
      status: "warning",
      blockingCount: 0,
      warningCount: 4,
    });
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "text-size", severity: "warning" }),
      expect.objectContaining({ code: "alt-text", severity: "warning" }),
      expect.objectContaining({ code: "captions", severity: "warning" }),
      expect.objectContaining({ code: "unresolved-comments", severity: "warning" }),
    ]));
  });

  it("enforces print resolution and color-space requirements", () => {
    const result = runStudioExportPreflight("print", {
      ...READY_WEBTOON,
      format: "pdf",
      width: 2_480,
      height: 3_508,
      segmentHeights: [],
      dpi: 144,
      colorSpace: "sRGB",
      estimatedFileSizeBytes: 80 * 1024 * 1024,
    });
    expect(result.status).toBe("blocked");
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "dpi", severity: "error" }),
      expect.objectContaining({ code: "color-space", severity: "error" }),
    ]));
  });

  it("blocks editable handoff when structure would be flattened", () => {
    const result = runStudioExportPreflight("editable", {
      ...READY_WEBTOON,
      format: "psd",
      width: 4_000,
      height: 6_000,
      segmentHeights: [],
      editableStructurePreserved: false,
      estimatedFileSizeBytes: 200 * 1024 * 1024,
    });
    expect(result).toMatchObject({ status: "blocked", blockingCount: 1 });
    expect(result.findings[0]).toMatchObject({
      code: "editable-structure",
      severity: "error",
    });
  });

  it("does not require publication rights or AI disclosure for a complete archive", () => {
    const result = runStudioExportPreflight("archive", {
      ...READY_WEBTOON,
      format: "toonstudio",
      width: 4_000,
      height: 20_000,
      segmentHeights: [],
      colorSpace: "display-p3",
      estimatedFileSizeBytes: 2 * 1024 * 1024 * 1024,
      rightsBlockedAssetIds: ["license-pending"],
      aiGeneratedObjectIds: ["layer-ai"],
      aiDisclosurePrepared: false,
    });
    expect(result.status).toBe("pass");
  });

  it("rejects malformed document snapshots and unknown targets", () => {
    expect(() => runStudioExportPreflight("webtoon-platform", {
      ...READY_WEBTOON,
      width: 0,
    })).toThrow(/valid document snapshot/u);
    expect(() => studioExportTargetProfile("unknown" as never)).toThrow(/Unknown/u);
  });
});
