import { describe, expect, it } from "vitest";

import {
  buildStudioBg3dModelCacheResidencyCandidates,
  planStudioBg3dModelCacheResidency,
} from "./studio-bg3d-model-cache-residency";

import type { StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";
import type { BgCustomModelInstance } from "../studio-background-3d-model";

function cacheEntry(
  geometryBytes: number,
  textureBytes: number,
): StudioBg3dModelRootCacheEntry {
  return {
    metrics: {
      nodes: 1,
      triangles: 12,
      drawCalls: 1,
      materials: 1,
      lights: 0,
      animations: 0,
      animationChannels: 0,
      animationKeyframes: 0,
      animationValues: 0,
      skins: 0,
      joints: 0,
      morphTargets: 0,
      accessorElements: 36,
      estimatedDecodedGeometryBytes: geometryBytes,
      textures: textureBytes > 0 ? 1 : 0,
      textureBytes,
      maxTextureDimension: textureBytes > 0 ? 1024 : 0,
    },
  } as unknown as StudioBg3dModelRootCacheEntry;
}

function instance(
  id: string,
  modelId: string,
  visible = true,
): BgCustomModelInstance {
  return {
    id,
    modelId,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible,
  };
}

describe("Studio BG3D model cache residency adapter", () => {
  it("projects decoded geometry and texture bytes with live reference counts", () => {
    const cache = new Map<string, StudioBg3dModelRootCacheEntry>([
      ["model:a", cacheEntry(40, 20)],
      ["model:b", cacheEntry(30, 10)],
    ]);
    const candidates = buildStudioBg3dModelCacheResidencyCandidates({
      cache,
      instances: [
        instance("instance:a1", "model:a"),
        instance("instance:a2", "model:a", false),
        instance("instance:b1", "model:b", false),
      ],
      selectedInstanceIds: new Set(["instance:b1"]),
      pinnedModelIds: new Set(["model:a"]),
      lastUsedOrdinalByModelId: new Map([
        ["model:a", 4],
        ["model:b", 9],
      ]),
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        assetId: "model:a",
        estimatedGpuBytes: 60,
        visibleRefCount: 1,
        selectedRefCount: 0,
        pinCount: 1,
        lastUsedOrdinal: 4,
      }),
      expect.objectContaining({
        assetId: "model:b",
        estimatedGpuBytes: 40,
        visibleRefCount: 0,
        selectedRefCount: 1,
        pinCount: 0,
        lastUsedOrdinal: 9,
      }),
    ]);
  });

  it("only offers completely unused cache entries for eviction", () => {
    const cache = new Map<string, StudioBg3dModelRootCacheEntry>([
      ["model:visible", cacheEntry(60, 20)],
      ["model:warm", cacheEntry(30, 10)],
      ["model:cold", cacheEntry(30, 10)],
    ]);
    const plan = planStudioBg3dModelCacheResidency({
      budgetBytes: 120,
      cache,
      instances: [instance("instance:visible", "model:visible")],
      lastUsedOrdinalByModelId: new Map([
        ["model:warm", 10],
        ["model:cold", 1],
      ]),
    });

    expect(plan.residentAssetIds).toEqual(["model:visible", "model:warm"]);
    expect(plan.evictAssetIds).toEqual(["model:cold"]);
    expect(plan.overBudgetBytes).toBe(0);
  });
});
