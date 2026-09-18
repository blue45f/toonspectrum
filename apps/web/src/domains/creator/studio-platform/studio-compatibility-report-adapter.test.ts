import { describe, expect, it } from "vitest";

import type { StudioImportCompatibilityReport } from "../studio-import-compatibility-report";
import { adaptStudioImportCompatibilityReport } from "./studio-compatibility-report-adapter";

const DIGEST = `sha256:${"a".repeat(64)}` as const;
const NOW = "2026-09-17T09:00:00.000Z";

function sourceReport(
  overrides: Partial<StudioImportCompatibilityReport> = {},
): StudioImportCompatibilityReport {
  return {
    revision: 1,
    parser: "three-gltf-loader",
    format: "glb",
    sourceHash: DIGEST,
    units: "meters",
    axis: "y-up",
    counts: {
      meshes: 1,
      materials: 1,
      textures: 1,
      nodes: 2,
      bones: 0,
      animations: 0,
      morphTargets: 0,
    },
    unsupportedEntities: [],
    fidelity: {
      geometry: "A",
      material: "B",
      rigAnimation: "P",
      semanticHistory: "X",
    },
    warnings: [],
    committed: false,
    sceneIrNodeCount: 2,
    ...overrides,
  };
}

describe("Studio compatibility report adapter", () => {
  it("normalizes legacy fidelity grades without losing the original source digest", () => {
    const report = adaptStudioImportCompatibilityReport({
      report: sourceReport(),
      parserVersion: "1.0.0",
      createdAt: NOW,
    });

    expect(report.sourceDigest).toBe(DIGEST);
    expect(report.preservedOriginalBlobDigest).toBe(DIGEST);
    expect(report.items.map((item) => item.outcome)).toEqual([
      "preserved",
      "converted",
      "opaque-preserved",
      "blocked",
    ]);
  });

  it("does not allow a committed import to hide unsupported entities", () => {
    expect(() => adaptStudioImportCompatibilityReport({
      report: sourceReport({
        committed: true,
        fidelity: {
          geometry: "A",
          material: "A",
          rigAnimation: "A",
          semanticHistory: "A",
        },
        unsupportedEntities: [{ kind: "extension", reason: "Unknown native extension." }],
      }),
      parserVersion: "1.0.0",
      createdAt: NOW,
    })).toThrow("blocked-report-committed");
  });
});
