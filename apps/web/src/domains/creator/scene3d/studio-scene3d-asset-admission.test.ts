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

  it("rejects declared LODs when measured triangle evidence is missing or fake", () => {
    const missing = evaluateStudioScene3dAssetAdmission(asset, {
      ...excellentEvidence,
      technical: {
        ...excellentEvidence.technical,
        lodCount: 3,
        trianglesByLod: [120_000],
      },
    });
    expect(missing.status).toBe("reject");
    expect(missing.blockers).toContain("LOD 선언과 실제 삼각형 증거가 일치하지 않습니다.");

    const flat = evaluateStudioScene3dAssetAdmission(asset, {
      ...excellentEvidence,
      technical: {
        ...excellentEvidence.technical,
        trianglesByLod: [120_000, 120_000, 120_000],
      },
    });
    expect(flat.status).toBe("reject");
    expect(flat.blockers).toContain("LOD별 삼각형 수가 근거리에서 원거리로 엄격히 감소하지 않습니다.");
  });

  it("warns when far LODs technically decrease but do not save enough geometry", () => {
    const result = evaluateStudioScene3dAssetAdmission(asset, {
      ...excellentEvidence,
      technical: {
        ...excellentEvidence.technical,
        trianglesByLod: [120_000, 96_000, 72_000],
      },
    });

    expect(result.status).toBe("review");
    expect(result.warnings).toContain(
      "최원거리 LOD가 LOD0의 50%를 초과해 실제 스트리밍/렌더 절감 효과가 작습니다.",
    );
  });

  it("rejects impossible runtime measurement receipts", () => {
    const result = evaluateStudioScene3dAssetAdmission(asset, {
      ...excellentEvidence,
      technical: {
        ...excellentEvidence.technical,
        gpuBytesEstimate: 0,
        drawCalls: -1,
      },
    });

    expect(result.status).toBe("reject");
    expect(result.blockers).toEqual(expect.arrayContaining([
      "GPU 메모리 추정치가 유효한 양수로 측정되지 않았습니다.",
      "draw call 측정값이 유효하지 않습니다.",
    ]));
  });

  it("rejects malformed LOD count receipts instead of treating them as review-only metadata", () => {
    const result = evaluateStudioScene3dAssetAdmission(asset, {
      ...excellentEvidence,
      technical: {
        ...excellentEvidence.technical,
        lodCount: Number.NaN,
      },
    });

    expect(result.status).toBe("reject");
    expect(result.blockers).toContain("LOD 단계 수 측정값이 유효하지 않습니다.");
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

    expect(result.status).toBe("reject");
    expect(result.blockers).toEqual(expect.arrayContaining([
      "GPU texture가 KTX2/Basis production 경로를 사용하지 않습니다.",
      "meshoptimizer/Draco geometry compression receipt가 없습니다.",
    ]));
  });
});
