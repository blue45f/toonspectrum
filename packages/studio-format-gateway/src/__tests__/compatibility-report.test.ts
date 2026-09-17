import { describe, expect, it } from "vitest";

import {
  compatibilityReportSchema,
  createCompatibilityReport,
  deriveCompatibilityGrade,
  sourcePreservationManifestSchema,
} from "../compatibility-report";

const hash = "a".repeat(64);
const createdAt = "2026-09-17T03:00:00.000Z";

function source() {
  return sourcePreservationManifestSchema.parse({
    sourceFileName: "episode-001.psd",
    sourceFormat: "psd",
    sourceHash: hash,
    sourceSize: 1_024,
    sourceBlob: {
      id: "source-blob-1",
      sha256: hash,
      size: 1_024,
      mediaType: "image/vnd.adobe.photoshop",
      role: "source",
    },
    immutable: true,
    importedAt: createdAt,
  });
}

describe("CompatibilityReport", () => {
  it("creates an A report only when every object is semantically preserved", () => {
    const report = createCompatibilityReport({
      id: "report-a",
      artifactId: "artifact-1",
      source: source() as never,
      items: [{
        id: "item-layer-1",
        path: "/layers/1",
        sourceFeature: "raster-layer",
        disposition: "preserved",
        severity: "info",
        targetFeature: "RasterLayerV3",
        message: "레이어와 블렌드 모드가 보존됩니다.",
      }],
      createdAt,
    } as never);
    expect(report.grade).toBe("A");
    expect(report.requiresApproval).toBe(false);
    expect(report.summary.preserved).toBe(1);
  });

  it("cannot hide rasterized or ignored content behind an A/B grade", () => {
    const items = [
      {
        id: "item-smart-filter",
        path: "/layers/2/smartFilters/0",
        sourceFeature: "smart-filter",
        disposition: "rasterized",
        severity: "warning",
        targetFeature: "RasterLayerV3",
        message: "필터 결과만 래스터로 보존됩니다.",
      },
    ] as const;
    expect(deriveCompatibilityGrade(items)).toBe("C");
    expect(() => compatibilityReportSchema.parse({
      id: "report-overclaim",
      source: source(),
      grade: "A",
      items,
      summary: {
        total: 1,
        preserved: 0,
        converted: 0,
        approximated: 0,
        rasterized: 1,
        ignored: 0,
        opaquePreserved: 0,
        blocked: 0,
      },
      requiresApproval: true,
      createdAt,
    })).toThrow(/overclaims/u);
  });

  it("grades opaque CLIP preservation as D until a verified parser maps the object", () => {
    expect(deriveCompatibilityGrade([{
      id: "clip-object-1",
      path: "/unknown/1",
      sourceFeature: "clip-private-object",
      disposition: "opaque-preserved",
      severity: "warning",
      message: "원본 바이트는 보존되지만 편집 의미는 확인되지 않았습니다.",
    }])).toBe("D");
  });

  it("rejects a source manifest whose blob is not the immutable original", () => {
    expect(() => sourcePreservationManifestSchema.parse({
      ...source(),
      sourceBlob: { ...source().sourceBlob, role: "preview" },
    })).toThrow(/source blob role/u);
  });
});
