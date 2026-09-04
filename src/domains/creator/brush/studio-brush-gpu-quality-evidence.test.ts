import { describe, expect, it } from "vitest";

import {
  STUDIO_BRUSH_GPU_QUALITY_EVIDENCE,
  STUDIO_BRUSH_GPU_QUALITY_EVIDENCE_MAX_AGE_MS,
  studioBrushGpuQualityEvidenceAllows,
  studioBrushGpuQualityEvidenceRecordAllows,
  type StudioBrushGpuQualityEvidenceRecord,
} from "./studio-brush-gpu-quality-evidence";
import {
  STUDIO_BRUSH_GPU_QUALITY_RENDER_CONTRACT_VERSION,
} from "./studio-brush-gpu-quality-election";

const NOW = Date.parse("2026-09-04T00:00:00.000Z");

function evidence(
  overrides: Partial<StudioBrushGpuQualityEvidenceRecord> = {},
): StudioBrushGpuQualityEvidenceRecord {
  return {
    schemaVersion: 2,
    rendererContractVersion: STUDIO_BRUSH_GPU_QUALITY_RENDER_CONTRACT_VERSION,
    generatedAt: new Date(NOW - 60_000).toISOString(),
    expiresAt: new Date(NOW + STUDIO_BRUSH_GPU_QUALITY_EVIDENCE_MAX_AGE_MS - 60_000)
      .toISOString(),
    sourceCommit: "a".repeat(40),
    benchmarkDigest: `sha256:${"b".repeat(64)}`,
    measurementRunCount: 1,
    measuredBrushCount: 192,
    hardwareClass: "hardware",
    hardwareAdapterFingerprints: ["apple:m2-max:metal"],
    approvedBrushIds: ["gpen"],
    rejectedBrushIds: ["watercolor"],
    ...overrides,
  };
}

describe("Studio brush GPU quality evidence", () => {
  it("allows only a fresh physical-GPU record for the requested brush", () => {
    expect(studioBrushGpuQualityEvidenceRecordAllows(evidence(), "gpen", NOW)).toBe(true);
    expect(studioBrushGpuQualityEvidenceRecordAllows(evidence(), "watercolor", NOW)).toBe(false);
  });

  it("rejects stale, future, malformed, and renderer-mismatched records", () => {
    expect(studioBrushGpuQualityEvidenceRecordAllows(evidence({
      expiresAt: new Date(NOW - 1).toISOString(),
    }), "gpen", NOW)).toBe(false);
    expect(studioBrushGpuQualityEvidenceRecordAllows(evidence({
      generatedAt: new Date(NOW + 10 * 60_000).toISOString(),
    }), "gpen", NOW)).toBe(false);
    expect(studioBrushGpuQualityEvidenceRecordAllows(evidence({
      rendererContractVersion: STUDIO_BRUSH_GPU_QUALITY_RENDER_CONTRACT_VERSION + 1,
    }), "gpen", NOW)).toBe(false);
    expect(studioBrushGpuQualityEvidenceRecordAllows(evidence({
      benchmarkDigest: "not-a-digest",
    }), "gpen", NOW)).toBe(false);
  });

  it("rejects software, unrepeatable, and unidentified adapter evidence", () => {
    expect(studioBrushGpuQualityEvidenceRecordAllows(evidence({
      hardwareClass: null,
    }), "gpen", NOW)).toBe(false);
    expect(studioBrushGpuQualityEvidenceRecordAllows(evidence({
      measurementRunCount: 0,
    }), "gpen", NOW)).toBe(false);
    expect(studioBrushGpuQualityEvidenceRecordAllows(evidence({
      hardwareAdapterFingerprints: [],
    }), "gpen", NOW)).toBe(false);
  });

  it("keeps the checked-in generated record fail-closed until a benchmark authors it", () => {
    expect(STUDIO_BRUSH_GPU_QUALITY_EVIDENCE.approvedBrushIds).toEqual([]);
    expect(studioBrushGpuQualityEvidenceAllows("gpen")).toBe(false);
  });
});
