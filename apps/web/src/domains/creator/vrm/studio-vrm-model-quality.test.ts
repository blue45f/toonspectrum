import { describe, expect, it } from "vitest";

import {
  classifyStudioVrmModelTechnicalRejection,
  isStudioVrmProductionModelUrl,
  STUDIO_VRM_MODEL_MAX_BYTES,
  STUDIO_VRM_MODEL_MAX_TRIANGLES,
  type StudioVrmModelTechnicalMetrics,
} from "./studio-vrm-model-quality";

const healthy: StudioVrmModelTechnicalMetrics = Object.freeze({
  byteSize: 8 * 1024 * 1024,
  triangles: 80_000,
  primitives: 20,
  materials: 10,
  textures: 12,
  joints: 72,
  meshes: 4,
  skins: 1,
  hasVrmExtension: true,
  validatorErrors: 0,
});

describe("VRM bundled model URL admission", () => {
  it.each([
    "/assets/3d/characters/lumi.vrm",
    "/assets/3d/characters/fantasy/ranger.glb",
    "/assets/3d/models/reference/hero.gltf",
    "/vrm/sample.VRM",
  ])("accepts a safe deployment-owned glTF model: %s", (url) => {
    expect(isStudioVrmProductionModelUrl(url)).toBe(true);
  });

  it.each([
    null,
    "",
    "https://cdn.example.com/hero.vrm",
    "data:model/gltf-binary;base64,AA",
    "blob:https://toonstudio.cloud/model",
    "//cdn.example.com/hero.vrm",
    "/assets/3d/characters/../private/hero.vrm",
    "/assets/3d/characters/%2e%2e/private/hero.vrm",
    "/assets/3d/characters/%2E/hero.vrm",
    "/assets/3d/characters/folder//hero.vrm",
    "/assets/3d/characters/hero.vrm?version=1",
    "/assets/3d/characters/hero.vrm#scene",
    "/assets/3d/characters/hero%3fversion.vrm",
    "/assets/3d/characters/hero%23scene.vrm",
    "/assets/3d/characters/hero.obj",
    "/assets/3d/characters/hero%00.vrm",
    "/assets/3d/characters/hero%0a.vrm",
    "/assets/3d/characters/hero%5cmodel.vrm",
    "/assets/3d/characters/%E0%A4%A.vrm",
  ])("rejects unsafe or unsupported bundled model URLs: %s", (url) => {
    expect(isStudioVrmProductionModelUrl(url)).toBe(false);
  });
});

describe("VRM technical quality admission", () => {
  it("accepts a healthy production character", () => {
    expect(classifyStudioVrmModelTechnicalRejection(healthy)).toBeNull();
  });

  it.each([
    [{ byteSize: 1_000 }, "file-too-small"],
    [{ byteSize: STUDIO_VRM_MODEL_MAX_BYTES + 1 }, "file-too-large"],
    [{ validatorErrors: 1 }, "validator-errors"],
    [{ meshes: 0 }, "mesh-missing"],
    [{ skins: 0 }, "skin-missing"],
    [{ hasVrmExtension: false }, "vrm-extension-missing"],
    [{ triangles: STUDIO_VRM_MODEL_MAX_TRIANGLES + 1 }, "triangles"],
    [{ primitives: 129 }, "primitives"],
    [{ materials: 49 }, "materials"],
    [{ textures: 65 }, "textures"],
    [{ joints: 257 }, "joints"],
  ] as const)("fails closed for %o", (patch, expected) => {
    expect(classifyStudioVrmModelTechnicalRejection({ ...healthy, ...patch })).toBe(expected);
  });
});
