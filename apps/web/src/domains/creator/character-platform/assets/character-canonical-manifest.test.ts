import { describe, expect, it } from "vitest";

import {
  canonicalManifestCapabilityIds,
  parseCharacterCanonicalManifestV2,
} from "./character-canonical-manifest";

function manifest() {
  return {
    schemaVersion: 2,
    identity: {
      assetId: "character:lumi",
      version: "1.0.0",
      topologyFamily: "toon-standard",
      topologyRevision: "topology-1",
      rigRevision: "rig-1",
      morphRevision: "morph-1",
      rendererRevision: "render-1",
    },
    runtime: {
      format: "vrm-1.0",
      modelFile: "lumi.vrm",
      unitScale: 1,
      upAxis: "Y",
      forwardAxis: "-Z",
    },
    semantics: {
      nodes: { face: ["Face"] },
      materials: { face: ["Skin"] },
      renderIds: { face: 1 },
    },
    morphs: {
      eyeSize: {
        positiveTarget: "eyeSizePlus",
        negativeTarget: "eyeSizeMinus",
        minimum: -1,
        maximum: 1,
        safeMinimum: -0.7,
        safeMaximum: 0.7,
        defaultValue: 0,
        affectedParts: ["eyes"],
      },
    },
    fitting: {
      bodyMeasurements: { height: 1.7 },
      sockets: [{
        id: "head-top",
        node: "Head",
        position: [0, 0.2, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
        tags: ["head"],
      }],
      colliders: [{
        id: "head",
        node: "Head",
        kind: "sphere",
        size: [0.12, 0.12, 0.12],
        offset: [0, 0.05, 0],
      }],
    },
    exports: {
      supportedPasses: ["beauty", "flat", "line"],
      psdLayerMap: { beauty: "미리보기", flat: "밑색", line: "주선" },
    },
    quality: {
      reportFile: "quality-report.json",
      minimumScore: 90,
      acceptedAt: "2026-09-08T00:00:00.000Z",
      acceptedBy: "character-quality-gate",
      goldenPoseIds: ["pose:standing"],
      goldenCameraIds: ["camera:front"],
    },
    provenance: {
      creatorId: "toonstudio",
      sourceLicense: "toonstudio-original",
      commercialUse: true,
      redistribution: true,
      contentSha256: "a".repeat(64),
    },
  } as const;
}

describe("canonical character manifest", () => {
  it("accepts a bounded production manifest and exposes capabilities", () => {
    const parsed = parseCharacterCanonicalManifestV2(manifest());
    expect(parsed.identity.topologyFamily).toBe("toon-standard");
    expect(canonicalManifestCapabilityIds(parsed)).toEqual([
      "attachment-sockets",
      "canonical-character",
      "collision-profile",
      "humanoid-pose",
      "semantic-morphs",
      "semantic-psd",
      "surface-ink",
      "surface-paint",
    ]);
  });

  it("rejects unsafe morph ranges", () => {
    const value = structuredClone(manifest()) as any;
    value.morphs.eyeSize.safeMaximum = 2;
    expect(() => parseCharacterCanonicalManifestV2(value)).toThrow("매니페스트");
  });

  it("rejects duplicate socket identities", () => {
    const value = structuredClone(manifest()) as any;
    value.fitting.sockets.push({ ...value.fitting.sockets[0] });
    expect(() => parseCharacterCanonicalManifestV2(value)).toThrow("중복");
  });
});
