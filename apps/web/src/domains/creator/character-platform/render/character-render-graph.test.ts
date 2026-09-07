import { describe, expect, it } from "vitest";

import { createCharacterRenderGraphPlan } from "./character-render-graph";

import type { CharacterCompatibilityReport } from "../compatibility/character-compatibility-report";
import type { CharacterCanonicalManifestV2 } from "../assets/character-canonical-manifest";

function compatibility(grade: CharacterCompatibilityReport["grade"]): CharacterCompatibilityReport {
  return {
    grade,
    label: grade === "canonical" ? "공식 품질" : `호환 ${grade}`,
    summary: "",
    features: [
      { id: "identity", label: "얼굴", status: "supported", reason: "" },
      { id: "iris", label: "눈동자", status: "supported", reason: "" },
      { id: "expression", label: "표정", status: "supported", reason: "" },
      { id: "pose", label: "포즈", status: "supported", reason: "" },
      { id: "wardrobe", label: "의상", status: "supported", reason: "" },
      { id: "accessories", label: "소품", status: "supported", reason: "" },
      { id: "authored-hair", label: "헤어", status: "supported", reason: "" },
      { id: "surface-paint", label: "표면", status: "supported", reason: "" },
      { id: "semantic-psd", label: "PSD", status: grade === "viewer" ? "unsupported" : "partial", reason: "" },
    ],
    supportedCount: 8,
    partialCount: 1,
    unsupportedCount: 0,
    semanticMorphCount: 9,
    sourceRevision: "test",
  };
}

function manifest(): CharacterCanonicalManifestV2 {
  return {
    schemaVersion: 2,
    identity: {
      assetId: "character:lumi",
      version: "1",
      topologyFamily: "toon-standard",
      topologyRevision: "t1",
      rigRevision: "r1",
      morphRevision: "m1",
      rendererRevision: "rr1",
    },
    runtime: { format: "vrm-1.0", modelFile: "lumi.vrm", unitScale: 1, upAxis: "Y", forwardAxis: "-Z" },
    semantics: {
      nodes: { face: ["Face"], "hair-front": ["Hair"] },
      materials: { face: ["Skin"], "hair-front": ["Hair"] },
      renderIds: { face: 1, "hair-front": 2 },
    },
    morphs: {},
    fitting: { bodyMeasurements: {}, sockets: [], colliders: [] },
    exports: { supportedPasses: ["beauty", "flat", "line"], psdLayerMap: {} },
    quality: {
      reportFile: "quality.json",
      minimumScore: 90,
      acceptedAt: "2026-09-08",
      acceptedBy: "gate",
      goldenPoseIds: [],
      goldenCameraIds: [],
    },
    provenance: {
      creatorId: "toonstudio",
      sourceLicense: "original",
      commercialUse: true,
      redistribution: true,
      contentSha256: "a".repeat(64),
    },
  };
}

describe("character render graph", () => {
  it("uses direct canonical passes and resolves dependencies", () => {
    const plan = createCharacterRenderGraphPlan({
      compatibility: compatibility("canonical"),
      canonicalManifest: manifest(),
      hasSurfacePaint: true,
      hasSurfaceInk: true,
      requested: ["ambient-occlusion", "surface-ink", "hair-shadow"],
    });
    expect(plan.mode).toBe("canonical");
    expect(plan.enabled).toEqual(["depth", "normal", "ambient-occlusion", "surface-ink", "base-color", "hair-base", "hair-shadow"]);
    expect(plan.warnings).toEqual([]);
  });

  it("keeps compatibility rendering honest about inferred and absent passes", () => {
    const plan = createCharacterRenderGraphPlan({
      compatibility: compatibility("B"),
      requested: ["cel-shadow", "surface-ink", "part-id"],
      hasSurfaceInk: false,
    });
    expect(plan.mode).toBe("compatibility");
    expect(plan.passes.find((pass) => pass.id === "cel-shadow")?.availability).toBe("conditional");
    expect(plan.passes.find((pass) => pass.id === "surface-ink")?.availability).toBe("unavailable");
    expect(plan.warnings.some((warning) => warning.includes("3D 펜선"))).toBe(true);
  });
});
