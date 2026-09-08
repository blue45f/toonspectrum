import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_CINEMATIC_ASSET_BLUEPRINTS,
  STUDIO_BG3D_CINEMATIC_ASSET_COUNTS,
  STUDIO_BG3D_CINEMATIC_ASSET_IDS,
} from "./studio-bg3d-cinematic-asset-blueprints";
import {
  STUDIO_BG3D_PROCEDURAL_STARTER_ASSETS,
  planStudioBg3dProceduralStarterInsertion,
} from "./studio-bg3d-procedural-starter-pack";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";
import { filterStudioBg3dProceduralStarterAssets } from "./studio-bg3d-procedural-starter-ui";

const CINEMATIC_ID_SET = new Set(STUDIO_BG3D_CINEMATIC_ASSET_IDS);
const CINEMATIC_ASSETS = STUDIO_BG3D_PROCEDURAL_STARTER_ASSETS.filter((asset) =>
  CINEMATIC_ID_SET.has(asset.id),
);
const DEFAULT_LIMITS = DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.budgets.complexity;
const EMPTY_USAGE = {
  nodes: 0,
  triangles: 0,
  drawCalls: 0,
  materials: 0,
  textures: 0,
} as const;

describe("studio BG3D cinematic procedural asset pack", () => {
  it("ships eight characters, eight scenes, and eight props with stable ids", () => {
    expect(STUDIO_BG3D_CINEMATIC_ASSET_COUNTS).toEqual({
      character: 8,
      scene: 8,
      prop: 8,
      total: 24,
    });
    expect(STUDIO_BG3D_CINEMATIC_ASSET_BLUEPRINTS).toHaveLength(24);
    expect(STUDIO_BG3D_CINEMATIC_ASSET_IDS).toHaveLength(24);
    expect(new Set(STUDIO_BG3D_CINEMATIC_ASSET_IDS).size).toBe(24);
    expect(CINEMATIC_ASSETS).toHaveLength(24);

    const counts = CINEMATIC_ASSETS.reduce<Record<string, number>>((result, item) => {
      result[item.category] = (result[item.category] ?? 0) + 1;
      return result;
    }, {});
    expect(counts).toMatchObject({ character: 8, scene: 8, prop: 8 });
  });

  it("keeps every asset editable, bounded, and independently admissible", () => {
    for (const asset of CINEMATIC_ASSETS) {
      expect(asset.parts.length).toBeGreaterThanOrEqual(12);
      expect(asset.parts.length).toBeLessThanOrEqual(16);
      expect(asset.budget.nodes).toBe(asset.parts.length);
      expect(asset.budget.triangles).toBeLessThanOrEqual(3_000);
      expect(asset.budget.drawCalls).toBeLessThanOrEqual(32);
      expect(asset.budget.materials).toBeLessThanOrEqual(32);
      expect(asset.provenance).toMatchObject({
        origin: "original-procedural",
        derivativeSource: false,
        externalFiles: false,
        externalTextures: false,
        license: { spdx: "CC0-1.0", attributionRequired: false },
      });

      const plan = planStudioBg3dProceduralStarterInsertion({
        assetId: asset.id,
        occupiedNodeIds: [],
        currentUsage: EMPTY_USAGE,
        limits: DEFAULT_LIMITS,
      });
      expect(plan.ok, asset.id).toBe(true);
    }
  });

  it("preserves expressive XYZ limb rotations while rotating the whole asset", () => {
    const running = CINEMATIC_ASSETS.find(
      (asset) => asset.id === "ts3d-character-running-v1",
    );
    expect(running).toBeTruthy();
    expect(
      running!.parts.filter(
        (part) => Math.abs(part.rotation[0]) > 0.01 || Math.abs(part.rotation[2]) > 0.01,
      ).length,
    ).toBeGreaterThanOrEqual(8);

    const plan = planStudioBg3dProceduralStarterInsertion({
      assetId: running!.id,
      instanceId: "running-reference",
      occupiedNodeIds: [],
      currentUsage: EMPTY_USAGE,
      limits: DEFAULT_LIMITS,
      origin: [4, 0, -3],
      yawRadians: Math.PI / 3,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.primitives).toHaveLength(running!.parts.length);
    expect(
      plan.primitives.filter(
        (primitive) =>
          Math.abs(primitive.rotation[0]) > 0.01 ||
          Math.abs(primitive.rotation[2]) > 0.01,
      ).length,
    ).toBeGreaterThanOrEqual(8);
    expect(
      plan.primitives.every((primitive) =>
        primitive.rotation.every(
          (value) => Number.isFinite(value) && Math.abs(value) <= Math.PI,
        ),
      ),
    ).toBe(true);
  });

  it("surfaces characters, finished backgrounds, and props through Korean search", () => {
    expect(
      filterStudioBg3dProceduralStarterAssets(
        STUDIO_BG3D_PROCEDURAL_STARTER_ASSETS,
        { query: "달리기", category: "character" },
      ).map((asset) => asset.id),
    ).toEqual(["ts3d-character-running-v1"]);

    expect(
      filterStudioBg3dProceduralStarterAssets(
        STUDIO_BG3D_PROCEDURAL_STARTER_ASSETS,
        { query: "지하철", category: "scene" },
      ).map((asset) => asset.id),
    ).toEqual(["ts3d-scene-subway-platform-v1"]);

    expect(
      filterStudioBg3dProceduralStarterAssets(
        STUDIO_BG3D_PROCEDURAL_STARTER_ASSETS,
        { query: "촬영", category: "prop" },
      ).map((asset) => asset.id),
    ).toEqual(["ts3d-prop-cinema-camera-rig-v1"]);
  });

  it("contains no remote URL, binary dependency, or marketplace identity", () => {
    const serialized = JSON.stringify(STUDIO_BG3D_CINEMATIC_ASSET_BLUEPRINTS);
    expect(serialized).not.toMatch(/https?:|blob:|data:|file:|download|marketplace/iu);
  });
});
