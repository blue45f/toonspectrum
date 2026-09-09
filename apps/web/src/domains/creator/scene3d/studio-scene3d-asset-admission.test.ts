import { describe, expect, it } from "vitest";

import { evaluateStudioScene3dAssetAdmission } from "./studio-scene3d-asset-admission";
import type { StudioScene3dAssetReference } from "./studio-scene3d-document";

const asset: StudioScene3dAssetReference = Object.freeze({
  id: "mesh:premium-room",
  kind: "mesh",
  version: "1",
  contentSha256: "a".repeat(64),
  uri: "/assets/3d/premium-room.glb",
  mime: "model/gltf-binary",
  byteSize: 1_000_000,
  rights: Object.freeze({
    commercialUse: true,
    redistribution: true,
    derivativeUse: true,
    licenseName: "CC0-1.0",
  }),
  quality: Object.freeze({
    accepted: true,
    score: 98,
    reportUri: "/assets/3d/premium-room-quality.json",
  }),
});

const excellentEvidence = Object.freeze({
  visual: Object.freeze({
    goldenViewIds: Object.freeze(["front", "back", "left", "right", "wide", "detail"]),
    silhouetteScore: 98,
    materialScore: 97,
    deformationScore: 96,
    compositionScore: 98,
    severeIntersectionCount: 0,
    thumbnailWidth: 1024,
    thumbnailHeight: 1024,
  }),
  technical: Object.freeze({
    lodCount: 3,
    trianglesByLod: Object.freeze([120_000, 48_000, 12_000]),
    drawCalls: 42,
    materialCount: 14,
    textureCount: 18,
    maxTextureDimension: 4096,
    geometryCompression: "meshopt" as const,
    textureCompression: "ktx2" as const,
    gpuBytesEstimate: 64 * 1024 * 1024,
  }),
});

describe("Studio Scene3D asset admission", () => {
  it("admits only visually and technically proven assets to production", () => {
    const result = evaluateStudioScene3dAssetAdmission(asset, excellentEvidence);

    expect(result.status).toBe("production");
    expect(result.score).toBeGreaterThanOrEqual(95);
    expect(result.blockers).toEqual([]);
  });

  it("rejects high-metadata-score assets when real rendered silhouettes are weak", () => {
    const result = evaluateStudioScene3dAssetAdmission(asset, {
      ...excellentEvidence,
      visual: {
        ...excellentEvidence.visual,
        silhouetteScore: 72,
      },
    });

    expect(result.status).toBe("reject");
    expect(result.blockers).toContain("실루엣 품질 점수가 95 미만입니다.");
  });

  it("rejects any visible character or garment intersection", () => {
    const result = evaluateStudioScene3dAssetAdmission(asset, {
      ...excellentEvidence,
      visual: {
        ...excellentEvidence.visual,
        severeIntersectionCount: 1,
      },
    });

    expect(result.status).toBe("reject");
  });

  it("keeps non-KTX2 or uncompressed geometry out of automatic production promotion", () => {
    const result = evaluateStudioScene3dAssetAdmission(asset, {
      ...excellentEvidence,
      technical: {
        ...excellentEvidence.technical,
        geometryCompression: "none",
        textureCompression: "webp",
      },
    });

    expect(result.status).toBe("review");
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
  });
});
