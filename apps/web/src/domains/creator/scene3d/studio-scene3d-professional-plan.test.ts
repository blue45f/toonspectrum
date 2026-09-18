import { describe, expect, it } from "vitest";

import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "../bg3d/studio-bg3d-scene-document";
import { createStudioShared3dSceneSession } from "../studio-shared-3d-scene-bridge";
import { createStudioVrmSceneDocument } from "../vrm/studio-vrm-scene-document";
import { createStudioScene3dAuthority } from "./studio-scene3d-authority";
import { buildStudioScene3dProfessionalPlan } from "./studio-scene3d-professional-plan";

import type { StudioScene3dDeviceCapabilities } from "./studio-scene3d-runtime-policy";

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
      features: { tsl: true, mrt: true, ktx2: true, meshopt: true },
    });
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
