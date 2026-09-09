import { describe, expect, it } from "vitest";

import {
  createCharacterCanonicalPartPlan,
  deriveCharacterCanonicalPartFitScale,
  inspectCharacterCanonicalPartAvailability,
  selectCharacterCanonicalPartLod,
} from "./character-canonical-part-plan";
import {
  canonicalManifestCapabilityIds,
  parseCharacterCanonicalManifestV2,
} from "./character-canonical-manifest";

function fixture() {
  return parseCharacterCanonicalManifestV2({
    schemaVersion: 2,
    identity: {
      assetId: "character:lumi",
      version: "1",
      topologyFamily: "toon-standard",
      topologyRevision: "topology-3",
      rigRevision: "rig-7",
      morphRevision: "morph-5",
      rendererRevision: "toon-4",
    },
    runtime: {
      format: "vrm-1.0",
      modelFile: "/vrm/sample.vrm",
      unitScale: 1,
      upAxis: "Y",
      forwardAxis: "-Z",
    },
    semantics: { nodes: {}, materials: {}, renderIds: {} },
    morphs: {},
    fitting: {
      bodyMeasurements: { headWidth: 0.18, shoulderWidth: 0.42 },
      sockets: [{
        id: "head",
        node: "head",
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
        tags: ["hair", "accessory"],
      }],
      colliders: [],
    },
    parts: [{
      id: "hair:donor-bob",
      label: "보브",
      slot: "hair",
      thumbnail: "/assets/3d/characters/thumbnails/sample-vrm.png",
      source: {
        format: "vrm-donor",
        file: "/vrm/AvatarSample_A.vrm",
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        selector: { kind: "semantic", semantic: "hair" },
      },
      binding: {
        kind: "skinned-transplant",
        requiredRigRevisions: ["rig-7"],
        requiredTopologyFamilies: ["toon-standard"],
      },
      fitting: {
        drivers: [{
          measurement: "headWidth",
          reference: 0.16,
          axis: "uniform",
          weight: 0.5,
          minimumScale: 0.9,
          maximumScale: 1.2,
        }],
        clearanceMeters: 0.002,
        hideTargetPart: true,
        correctiveMorphs: { "hair-temple-clearance": 0.25 },
      },
      lods: [
        {
          id: "lod2",
          sourceFile: "/parts/hair-bob-lod2.glb",
          sourceSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          maximumProjectedHeightPx: 160,
        },
        {
          id: "lod1",
          sourceFile: "/parts/hair-bob-lod1.glb",
          sourceSha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          maximumProjectedHeightPx: 480,
        },
        {
          id: "lod0",
          sourceFile: "/parts/hair-bob-lod0.glb",
          sourceSha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
          maximumProjectedHeightPx: 4096,
        },
      ],
      semanticLayers: ["hair-front", "hair-back"],
      quality: {
        minimumScore: 96,
        accepted: true,
        reportFile: "/quality/hair-bob.json",
        goldenPoseIds: ["standing", "action"],
        goldenCameraIds: ["front", "side", "back"],
      },
      provenance: {
        creatorId: "toonstudio-assets",
        sourceLicense: "CC0-1.0",
        commercialUse: true,
        redistribution: true,
        derivativeUse: true,
      },
    }],
    exports: { supportedPasses: [], psdLayerMap: {} },
    quality: {
      reportFile: "quality-report.json",
      minimumScore: 94,
      acceptedAt: "2026-09-09T00:00:00.000Z",
      acceptedBy: "character-quality-gate",
      goldenPoseIds: ["standing"],
      goldenCameraIds: ["front"],
    },
    provenance: {
      creatorId: "toonstudio",
      sourceLicense: "CC0-1.0",
      commercialUse: true,
      redistribution: true,
      contentSha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    },
  });
}

describe("canonical production parts", () => {
  it("keeps V2 compatibility while exposing modular-part capability", () => {
    const manifest = fixture();
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.parts).toHaveLength(1);
    expect(canonicalManifestCapabilityIds(manifest)).toContain("modular-character-parts");
  });

  it("derives bounded measurement fitting and deterministic LOD", () => {
    const manifest = fixture();
    const part = manifest.parts![0]!;
    const scale = deriveCharacterCanonicalPartFitScale(part, manifest.fitting.bodyMeasurements);
    expect(scale.x).toBeCloseTo(1.0625, 6);
    expect(scale.y).toBeCloseTo(1.0625, 6);
    expect(scale.z).toBeCloseTo(1.0625, 6);
    expect(selectCharacterCanonicalPartLod(part, 120)?.id).toBe("lod2");
    expect(selectCharacterCanonicalPartLod(part, 300)?.id).toBe("lod1");
    expect(selectCharacterCanonicalPartLod(part, 900)?.id).toBe("lod0");
  });

  it("fails closed for quality, rights and rig mismatches", () => {
    const manifest = fixture();
    const part = manifest.parts![0]!;
    expect(inspectCharacterCanonicalPartAvailability(manifest, part).status).toBe("supported");
    expect(inspectCharacterCanonicalPartAvailability(manifest, {
      ...part,
      quality: { ...part.quality, accepted: false },
    }).status).toBe("unavailable");
    expect(inspectCharacterCanonicalPartAvailability(manifest, {
      ...part,
      provenance: { ...part.provenance, derivativeUse: false },
    }).status).toBe("unavailable");
    expect(inspectCharacterCanonicalPartAvailability({
      ...manifest,
      identity: { ...manifest.identity, rigRevision: "other-rig" },
    }, part).status).toBe("unavailable");
  });

  it("rejects traversal and non-path schemes before any asset fetch can happen", () => {
    const manifest = fixture();
    const part = manifest.parts![0]!;
    expect(() => parseCharacterCanonicalManifestV2({
      ...manifest,
      parts: [{
        ...part,
        source: { ...part.source, file: "/assets/parts/../private.glb" },
      }],
    })).toThrow();
    expect(() => parseCharacterCanonicalManifestV2({
      ...manifest,
      parts: [{
        ...part,
        quality: { ...part.quality, reportFile: "javascript:alert(1)" },
      }],
    })).toThrow();
  });

  it("creates one immutable application plan with semantic fit data", () => {
    const manifest = fixture();
    const plan = createCharacterCanonicalPartPlan({
      manifest,
      part: manifest.parts![0]!,
      projectedHeightPx: 520,
    });
    expect(plan.availability.status).toBe("supported");
    expect(plan.lod?.id).toBe("lod0");
    expect(plan.hideTargetPart).toBe(true);
    expect(plan.clearanceMeters).toBe(0.002);
    expect(plan.correctiveMorphs["hair-temple-clearance"]).toBe(0.25);
    expect(Object.isFrozen(plan)).toBe(true);
  });
});
