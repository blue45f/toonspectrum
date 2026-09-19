import { describe, expect, it } from "vitest";

import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "../bg3d/studio-bg3d-scene-document";
import { createStudioShared3dSceneSession } from "../studio-shared-3d-scene-bridge";
import { createStudioVrmSceneDocument } from "../vrm/studio-vrm-scene-document";
import { createStudioScene3dAuthority } from "./studio-scene3d-authority";
import { buildStudioScene3dProfessionalPlan } from "./studio-scene3d-professional-plan";

import {
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
  compressedTextureBc: false,
  compressedTextureEtc2: true,
  maxTextureDimension2d: 16_384,
  deviceMemoryGiB: 8,
});

function authority(withCharacter = false) {
  return createStudioScene3dAuthority({
    authorityId: "scene:professional-plan",
    bg3d: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    sharedSceneSession: withCharacter
      ? createStudioShared3dSceneSession([{
          elementId: "hero",
          label: "Hero",
          scene: createStudioVrmSceneDocument(),
          stageTransform: { position: [0, 0, 0], rotationY: 0 },
        }])
      : undefined,
    viewportAspectRatio: 16 / 9,
    revision: 3,
    now: "2026-09-17T00:00:00.000Z",
  });
}

describe("Studio Scene3D professional plan", () => {
  it("connects an asset-free scene to the WebGPU NPR production graph", () => {
    const plan = buildStudioScene3dProfessionalPlan({
      authority: authority(),
      capabilities: CAPABILITIES,
      requestedPasses: ["beauty", "line", "tone", "object-id"],
    });
    expect(plan).toMatchObject({
      editorReady: true,
      productionReady: true,
      blockers: [],
      assets: [],
    });
    expect(plan.renderGraph.runtimePlan).toMatchObject({
      primaryRenderer: "three-webgpu",
      qualityTier: "ultra",
      features: { tsl: true, mrt: false, ktx2: true, meshopt: true },
    });
    expect(plan.evolution.next.map(({ id }) => id)).toContain("tsl-npr-render-graph");
    expect(plan.renderGraph.executionOrder).toEqual(expect.arrayContaining([
      "depth",
      "normal",
      "object-id",
      "material-id",
      "line",
      "tone",
    ]));
  });

  it("blocks production when a linked character lacks quality, rights, and grounding evidence", () => {
    const plan = buildStudioScene3dProfessionalPlan({
      authority: authority(true),
      capabilities: CAPABILITIES,
    });
    expect(plan.editorReady).toBe(true);
    expect(plan.productionReady).toBe(false);
    expect(plan.assets).toHaveLength(1);
    expect(plan.assets[0]).toMatchObject({
      status: "missing-evidence",
      result: null,
    });
    expect(plan.characters).toMatchObject({ readyCount: 0, blockedCount: 1 });
    expect(plan.blockers.join(" ")).toContain("admission receipt");
    expect(plan.blockers.join(" ")).toContain("접지");
  });

  it("blocks requested advanced render features until their product runtime is admitted", () => {
    const base = authority();
    const advanced = {
      ...base,
      document: {
        ...base.document,
        render: {
          ...base.document.render,
          antialiasing: "taau" as const,
          shadows: {
            ...base.document.render.shadows,
            mode: "csm" as const,
            cascades: 3 as const,
          },
          effects: {
            ...base.document.render.effects,
            ssgi: true,
          },
        },
      },
    };
    const blocked = buildStudioScene3dProfessionalPlan({
      authority: advanced,
      capabilities: CAPABILITIES,
    });
    expect(blocked.productionReady).toBe(false);
    expect(blocked.blockers.join(" ")).toContain("TAAU");
    expect(blocked.blockers.join(" ")).toContain("CSM");
    expect(blocked.blockers.join(" ")).toContain("SSGI");

    const admitted = buildStudioScene3dProfessionalPlan({
      authority: advanced,
      capabilities: CAPABILITIES,
      software: {
        ...STUDIO_SCENE3D_CURRENT_SOFTWARE_CAPABILITIES,
        tslNprRenderGraph: true,
        taau: true,
        csmShadows: true,
        ssgi: true,
      },
    });
    expect(admitted.blockers.join(" ")).not.toContain("TAAU");
    expect(admitted.blockers.join(" ")).not.toContain("CSM");
    expect(admitted.blockers.join(" ")).not.toContain("SSGI");
  });

  it("keeps review assets editable but out of production-ready output", () => {
    const base = authority();
    const reviewAsset = {
      id: "asset:review-room",
      kind: "mesh" as const,
      version: "1",
      contentSha256: "c".repeat(64),
      uri: "/assets/review-room.glb",
      mime: "model/gltf-binary",
      byteSize: 1_000_000,
      rights: {
        commercialUse: true,
        redistribution: true,
        derivativeUse: true,
        licenseName: "CC0-1.0",
      },
      quality: {
        accepted: true,
        score: 98,
        reportUri: "/assets/review-room-quality.json",
      },
    };
    const reviewedAuthority = {
      ...base,
      document: {
        ...base.document,
        assets: [reviewAsset],
        entities: [{
          id: "model:review-room",
          kind: "model" as const,
          name: "Review room",
          assetId: reviewAsset.id,
          materialVariantId: null,
          transform: {
            position: [0, 0, 0] as const,
            rotation: [0, 0, 0, 1] as const,
            scale: [1, 1, 1] as const,
          },
          visible: true,
          locked: false,
          castShadow: true,
          receiveShadow: true,
          parentId: null,
        }],
      },
    };
    const plan = buildStudioScene3dProfessionalPlan({
      authority: reviewedAuthority,
      capabilities: CAPABILITIES,
      evidenceByAssetId: new Map([[reviewAsset.id, {
        visual: {
          goldenViewIds: ["front", "back", "left", "right", "wide", "detail"],
          silhouetteScore: 98,
          materialScore: 97,
          deformationScore: 96,
          compositionScore: 98,
          severeIntersectionCount: 0,
          thumbnailWidth: 1024,
          thumbnailHeight: 1024,
        },
        technical: {
          lodCount: 3,
          trianglesByLod: [120_000, 96_000, 72_000],
          drawCalls: 42,
          materialCount: 14,
          textureCount: 18,
          maxTextureDimension: 4096,
          geometryCompression: "meshopt" as const,
          textureCompression: "ktx2" as const,
          gpuBytesEstimate: 64 * 1024 * 1024,
        },
      }]]),
    });

    expect(plan.editorReady).toBe(true);
    expect(plan.assets[0]?.status).toBe("review");
    expect(plan.productionReady).toBe(false);
    expect(plan.blockers.join(" ")).toContain("production 승격 전 품질·성능 검토");
  });

  it("keeps the Three WebGL editor usable when specialist FX is unavailable", () => {
    const plan = buildStudioScene3dProfessionalPlan({
      authority: authority(),
      capabilities: {
        ...CAPABILITIES,
        webgpu: false,
        computeShaders: false,
      },
      requestedPasses: ["beauty", "line"],
      fx: { rain: true, bloom: true },
      babylonSpecialistAvailable: false,
    });
    expect(plan.editorReady).toBe(true);
    expect(plan.renderGraph.runtimePlan.primaryRenderer).toBe("three-webgl2");
    expect(plan.renderGraph.fxSpecialistEnabled).toBe(false);
    expect(plan.warnings.join(" ")).toContain("Babylon FX specialist");
    expect(plan.warnings.join(" ")).toContain("WebGL2");
  });
});
