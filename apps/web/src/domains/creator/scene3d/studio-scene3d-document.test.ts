import { describe, expect, it } from "vitest";

import {
  createStudioScene3dDocument,
  isStudioScene3dDocument,
  STUDIO_SCENE3D_DOCUMENT_KIND,
  STUDIO_SCENE3D_DOCUMENT_VERSION,
} from "./studio-scene3d-document";
import {
  inferStudioScene3dRuntimeNeeds,
  resolveStudioScene3dRuntimePlan,
} from "./studio-scene3d-runtime-policy";

const webGpuDevice = Object.freeze({
  webgpu: true,
  webgl2: true,
  computeShaders: true,
  timestampQueries: true,
  float16Shaders: true,
  compressedTextureAstc: true,
  compressedTextureBc: true,
  compressedTextureEtc2: true,
  maxTextureDimension2d: 16384,
  deviceMemoryGiB: 16,
});

describe("Studio Scene3D clean authority", () => {
  it("creates one scene authority for camera, lighting, output and future characters/backgrounds", () => {
    const document = createStudioScene3dDocument("scene:test", "2026-09-10T00:00:00.000Z");

    expect(document.kind).toBe(STUDIO_SCENE3D_DOCUMENT_KIND);
    expect(document.version).toBe(STUDIO_SCENE3D_DOCUMENT_VERSION);
    expect(document.coordinateSystem).toEqual({
      unit: "meter",
      handedness: "right",
      upAxis: "Y",
      forwardAxis: "-Z",
    });
    expect(document.render.profile).toBe("webtoon");
    expect(document.render.shadows.mode).toBe("csm");
    expect(document.output.smartLayer).toBe(true);
    expect(document.output.semanticPasses).toEqual([
      "beauty",
      "line",
      "shadow",
      "depth",
      "normal",
      "object-id",
      "material-id",
    ]);
    expect(isStudioScene3dDocument(document)).toBe(true);
  });

  it("fails closed for missing asset references instead of silently substituting a primitive", () => {
    const document = createStudioScene3dDocument("scene:test", "2026-09-10T00:00:00.000Z");
    const invalid = {
      ...document,
      entities: [{
        id: "character:1",
        name: "Character",
        kind: "character",
        assetId: "missing",
        characterDocumentId: "character-doc:1",
        characterRevision: 0,
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
        visible: true,
        locked: false,
        castShadow: true,
        receiveShadow: true,
        parentId: null,
      }],
    };

    expect(isStudioScene3dDocument(invalid)).toBe(false);
  });

  it("rejects path traversal in asset URIs", () => {
    const document = createStudioScene3dDocument("scene:test", "2026-09-10T00:00:00.000Z");
    const invalid = {
      ...document,
      assets: [{
        id: "asset:bad",
        kind: "mesh",
        version: "1",
        contentSha256: "a".repeat(64),
        uri: "/assets/../secret.glb",
        mime: "model/gltf-binary",
        byteSize: 100,
        rights: {
          commercialUse: true,
          redistribution: true,
          derivativeUse: true,
          licenseName: "CC0-1.0",
        },
        quality: {
          accepted: true,
          score: 100,
          reportUri: "/assets/report.json",
        },
      }],
    };

    expect(isStudioScene3dDocument(invalid)).toBe(false);
  });

  it("selects Three WebGPU as the primary renderer and specialist engines only by scene need", () => {
    const document = createStudioScene3dDocument("scene:test", "2026-09-10T00:00:00.000Z");
    const plan = resolveStudioScene3dRuntimePlan(webGpuDevice, inferStudioScene3dRuntimeNeeds(document));

    expect(plan.primaryRenderer).toBe("three-webgpu");
    expect(plan.specialists).toEqual([]);
    expect(plan.features).toMatchObject({
      tsl: true,
      mrt: true,
      gpuCompute: true,
      csm: true,
      taau: true,
      ssgi: true,
      sss: true,
      ktx2: true,
      meshopt: true,
      progressiveStill: "raster-ssaa",
    });
    expect(plan.qualityTier).toBe("ultra");
  });

  it("keeps a deterministic WebGL2 fallback instead of requiring WebGPU", () => {
    const plan = resolveStudioScene3dRuntimePlan({
      ...webGpuDevice,
      webgpu: false,
      computeShaders: false,
      timestampQueries: false,
      float16Shaders: false,
      maxTextureDimension2d: 8192,
      deviceMemoryGiB: 4,
    }, {
      gaussianSplats: false,
      specialistCadOrBim: false,
      liveClothOrHair: true,
      highQualityStill: true,
    });

    expect(plan.primaryRenderer).toBe("three-webgl2");
    expect(plan.features.tsl).toBe(false);
    expect(plan.features.gpuCompute).toBe(false);
    expect(plan.features.progressiveStill).toBe("raster-ssaa");
    expect(plan.qualityTier).toBe("compatibility");
  });

  it("isolates Gaussian Splat rendering instead of replacing the main scene engine", () => {
    const plan = resolveStudioScene3dRuntimePlan(webGpuDevice, {
      gaussianSplats: true,
      specialistCadOrBim: false,
      liveClothOrHair: false,
      highQualityStill: true,
    });

    expect(plan.primaryRenderer).toBe("three-webgpu");
    expect(plan.specialists).toEqual(["playcanvas-gsplat"]);
    expect(plan.features.gaussianSplatGpuSort).toBe(true);
  });
});
