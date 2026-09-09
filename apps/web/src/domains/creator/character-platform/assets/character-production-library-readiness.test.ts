import { describe, expect, it } from "vitest";

import {
  evaluateCharacterProductionLibraryReadiness,
} from "./character-production-library-readiness";
import {
  parseCharacterCanonicalManifestV2,
  type CharacterCanonicalPartSlot,
} from "./character-canonical-manifest";

const SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function part(slot: CharacterCanonicalPartSlot, quality = 98) {
  return {
    id: `${slot}:production`,
    label: `${slot} production`,
    slot,
    source: {
      format: "glb-part",
      file: `/parts/${slot}.glb`,
      sha256: SHA,
      selector: { kind: "nodes", names: [`TS_${slot}`] },
    },
    binding: { kind: "rigid-follow", targetBone: slot === "hair" ? "head" : "hips" },
    fitting: { drivers: [], clearanceMeters: 0, hideTargetPart: true, correctiveMorphs: {} },
    lods: [
      { id: "lod2", sourceFile: `/parts/${slot}-2.glb`, sourceSha256: SHA, maximumProjectedHeightPx: 160 },
      { id: "lod1", sourceFile: `/parts/${slot}-1.glb`, sourceSha256: SHA, maximumProjectedHeightPx: 480 },
      { id: "lod0", sourceFile: `/parts/${slot}-0.glb`, sourceSha256: SHA, maximumProjectedHeightPx: 4096 },
    ],
    semanticLayers: slot === "hair" ? ["hair-front", "hair-back"] : ["accessory"],
    quality: {
      minimumScore: quality,
      accepted: true,
      reportFile: `/quality/${slot}.json`,
      goldenPoseIds: ["standing", "action"],
      goldenCameraIds: ["front", "three-quarter", "side", "back"],
    },
    provenance: {
      creatorId: "toonstudio",
      sourceLicense: "CC0-1.0",
      commercialUse: true,
      redistribution: true,
      derivativeUse: true,
    },
  };
}

function manifest(parts: readonly ReturnType<typeof part>[]) {
  return parseCharacterCanonicalManifestV2({
    schemaVersion: 2,
    identity: {
      assetId: "orion",
      version: "1",
      topologyFamily: "toon-standard",
      topologyRevision: "topology-1",
      rigRevision: "vrm1-humanoid",
      morphRevision: "morph-1",
      rendererRevision: "toon-1",
    },
    runtime: { format: "vrm-1.0", modelFile: "/vrm/orion.vrm", unitScale: 1, upAxis: "Y", forwardAxis: "-Z" },
    semantics: { nodes: {}, materials: {}, renderIds: {} },
    morphs: {},
    fitting: { bodyMeasurements: {}, sockets: [], colliders: [] },
    parts,
    exports: { supportedPasses: [], psdLayerMap: {} },
    quality: {
      reportFile: "/quality/orion.json",
      minimumScore: 98,
      acceptedAt: "2026-09-09T00:00:00Z",
      acceptedBy: "test",
      goldenPoseIds: ["standing", "action"],
      goldenCameraIds: ["front", "three-quarter", "side", "back"],
    },
    provenance: {
      creatorId: "toonstudio",
      sourceLicense: "CC0-1.0",
      commercialUse: true,
      redistribution: true,
      contentSha256: SHA,
    },
  });
}

describe("production library readiness", () => {
  it("does not call one excellent hair asset a completed competitive library", () => {
    const result = evaluateCharacterProductionLibraryReadiness(manifest([part("hair")]));
    expect(result.ready).toBe(false);
    expect(result.readySlotCount).toBe(1);
    expect(result.missingSlotCount).toBe(9);
    expect(result.score).toBe(10);
  });

  it("degrades an authored asset below the competitive quality threshold", () => {
    const result = evaluateCharacterProductionLibraryReadiness(manifest([part("hair", 92)]));
    expect(result.readySlotCount).toBe(0);
    expect(result.degradedSlotCount).toBe(1);
    expect(result.score).toBe(5);
  });

  it("only becomes ready when every required production slot passes the higher bar", () => {
    const slots: CharacterCanonicalPartSlot[] = [
      "eyes", "irises", "nose", "mouth", "ears", "hair", "top", "bottom", "shoes", "accessory",
    ];
    const result = evaluateCharacterProductionLibraryReadiness(manifest(slots.map((slot) => part(slot))));
    expect(result.ready).toBe(true);
    expect(result.readySlotCount).toBe(10);
    expect(result.missingSlotCount).toBe(0);
    expect(result.score).toBe(100);
  });
});
