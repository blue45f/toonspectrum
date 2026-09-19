import { describe, expect, it } from "vitest";

import {
  createStudioScene3dDocument,
  STUDIO_SCENE3D_IDENTITY_TRANSFORM,
  type StudioScene3dDocumentV1,
} from "./studio-scene3d-document";
import {
  buildStudioScene3dEvolutionPlan,
  STUDIO_SCENE3D_EVOLUTION_CANDIDATES,
} from "./studio-scene3d-platform-evolution";
import {
  resolveStudioScene3dRuntimePlan,
  STUDIO_SCENE3D_CURRENT_SOFTWARE_CAPABILITIES,
  type StudioScene3dDeviceCapabilities,
} from "./studio-scene3d-runtime-policy";

const CAPABILITIES: StudioScene3dDeviceCapabilities = Object.freeze({
  webgpu: true,
  webgl2: true,
  computeShaders: true,
  timestampQueries: true,
  float16Shaders: true,
  compressedTextureAstc: true,
  compressedTextureBc: true,
  compressedTextureEtc2: true,
  maxTextureDimension2d: 16_384,
  deviceMemoryGiB: 16,
});

function runtime(document: StudioScene3dDocumentV1) {
  const characterCount = document.entities.filter(({ kind }) => kind === "character").length;
  const environmentCount = document.entities.length - characterCount;
  return resolveStudioScene3dRuntimePlan(CAPABILITIES, {
    gaussianSplats: document.assets.some(({ kind }) => kind === "gaussian-splat"),
    specialistCadOrBim: false,
    liveClothOrHair: characterCount > 0,
    highQualityStill: document.output.width >= 2048 || document.output.height >= 2048,
    workload: characterCount > 0 && environmentCount <= 2
      ? "character-detail"
      : environmentCount > 0
        ? "environment-compose"
        : "mixed-scene",
  });
}

describe("Studio Scene3D platform evolution registry", () => {
  it("keeps candidate packages non-admitted until a product runtime lands", () => {
    const document = createStudioScene3dDocument(
      "scene:evolution",
      "2026-09-19T00:00:00.000Z",
    );
    const plan = buildStudioScene3dEvolutionPlan({
      document,
      runtimePlan: runtime(document),
      software: STUDIO_SCENE3D_CURRENT_SOFTWARE_CAPABILITIES,
    });

    expect(STUDIO_SCENE3D_EVOLUTION_CANDIDATES.length).toBeGreaterThanOrEqual(15);
    expect(plan.candidates.filter(({ admitted }) => admitted)).toEqual([]);
    expect(plan.next.some(({ id }) => id === "tsl-npr-render-graph")).toBe(true);
    expect(plan.research.some(({ id }) => id === "pathtraced-still")).toBe(false);
  });

  it("surfaces character-specific IK, XPBD and deformation work without changing authority", () => {
    const base = createStudioScene3dDocument(
      "scene:character-evolution",
      "2026-09-19T00:00:00.000Z",
    );
    const document: StudioScene3dDocumentV1 = {
      ...base,
      assets: [{
        id: "asset:character",
        kind: "character",
        version: "1",
        contentSha256: "a".repeat(64),
        uri: "/assets/character.vrm",
        mime: "model/vrm",
        byteSize: 1,
        rights: {
          commercialUse: true,
          redistribution: true,
          derivativeUse: true,
          licenseName: "test",
        },
        quality: {
          accepted: true,
          score: 100,
          reportUri: "/assets/character-quality.json",
        },
      }],
      entities: [{
        id: "character:hero",
        kind: "character",
        name: "Hero",
        assetId: "asset:character",
        characterDocumentId: "character-doc:hero",
        characterRevision: 1,
        transform: STUDIO_SCENE3D_IDENTITY_TRANSFORM,
        visible: true,
        locked: false,
        castShadow: true,
        receiveShadow: true,
        parentId: null,
      }],
    };
    const plan = buildStudioScene3dEvolutionPlan({
      document,
      runtimePlan: runtime(document),
      software: STUDIO_SCENE3D_CURRENT_SOFTWARE_CAPABILITIES,
    });

    expect(plan.next.map(({ id }) => id)).toEqual(expect.arrayContaining([
      "asset-release-pipeline",
      "bvh-webgpu-compute",
      "gpu-xpbd",
      "closed-chain-ik",
    ]));
    expect(plan.evaluate.map(({ id }) => id)).toEqual(expect.arrayContaining([
      "libigl-deformation",
      "opensubdiv",
    ]));
    expect(plan.candidates.find(({ id }) => id === "closed-chain-ik")?.authorityPolicy)
      .toContain("CharacterDocument");
  });

  it("prioritizes native Three splats before optional specialist renderers", () => {
    const base = createStudioScene3dDocument(
      "scene:splat-evolution",
      "2026-09-19T00:00:00.000Z",
    );
    const document: StudioScene3dDocumentV1 = {
      ...base,
      assets: [{
        id: "asset:splat",
        kind: "gaussian-splat",
        version: "1",
        contentSha256: "b".repeat(64),
        uri: "/assets/location.splat",
        mime: "application/octet-stream",
        byteSize: 1,
        rights: {
          commercialUse: true,
          redistribution: true,
          derivativeUse: true,
          licenseName: "test",
        },
        quality: {
          accepted: true,
          score: 100,
          reportUri: "/assets/splat-quality.json",
        },
      }],
      entities: [{
        id: "splat:location",
        kind: "gaussian-splat",
        name: "Location",
        assetId: "asset:splat",
        opacity: 1,
        cropVolumeId: null,
        transform: STUDIO_SCENE3D_IDENTITY_TRANSFORM,
        visible: true,
        locked: false,
        castShadow: false,
        receiveShadow: false,
        parentId: null,
      }],
    };
    const plan = buildStudioScene3dEvolutionPlan({
      document,
      runtimePlan: runtime(document),
      software: STUDIO_SCENE3D_CURRENT_SOFTWARE_CAPABILITIES,
    });

    expect(plan.next.map(({ id }) => id)).toContain("three-native-gsplat");
    expect(plan.evaluate.map(({ id }) => id)).toEqual(expect.arrayContaining([
      "spark-gsplat",
      "playcanvas-supersplat",
    ]));
  });
});
