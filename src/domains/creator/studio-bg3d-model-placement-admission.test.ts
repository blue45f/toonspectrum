import { describe, expect, it } from "vitest";

import { StudioBg3dModalOperationCoordinator } from "./studio-bg3d-modal-operation-coordinator";
import {
  assertStudioBg3dModelPlacementAdmission,
  calculateStudioBg3dPlacedModelBytes,
  StudioBg3dModelPlacementAdmissionError,
} from "./studio-bg3d-model-placement-admission";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";

import type { Bg3dVerifiedStoredRecord } from "./bg3d-model-library";
import type { BgCustomModelInstance } from "./studio-background-3d-model";
import type {
  StudioBg3dModelAttachment,
  StudioBg3dParsedGlbMetrics,
  StudioBg3dSceneBudgets,
} from "./studio-bg3d-scene-document";

const HASH_A: `sha256:${string}` = `sha256:${"a".repeat(64)}`;
const HASH_B: `sha256:${string}` = `sha256:${"b".repeat(64)}`;

function record(
  id: string,
  contentHash: `sha256:${string}`,
  byteSize: number,
): Pick<Bg3dVerifiedStoredRecord, "id" | "contentHash" | "byteSize" | "mime"> {
  return { id, contentHash, byteSize, mime: "model/gltf-binary" };
}

function attachment(
  id: string,
  hash: `sha256:${string}`,
  byteSize: number,
): StudioBg3dModelAttachment {
  return {
    id: `attachment-${id}`,
    name: `${id}.glb`,
    mime: "model/gltf-binary",
    byteSize,
    hash,
    rights: {
      status: "owned",
      commercialUse: true,
      attributionRequired: false,
    },
    source: "local-library",
  };
}

function metrics(overrides: Partial<StudioBg3dParsedGlbMetrics> = {}): StudioBg3dParsedGlbMetrics {
  return {
    nodes: 1,
    triangles: 1,
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
    accessorElements: 3,
    estimatedDecodedGeometryBytes: 36,
    textures: 0,
    textureBytes: 0,
    maxTextureDimension: 0,
    ...overrides,
  };
}

function budgets(maxModelBytes = 100): StudioBg3dSceneBudgets {
  return {
    ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.budgets,
    complexity: {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.budgets.complexity,
      maxModelBytes,
    },
  };
}

function instance(id: string, modelId: string): BgCustomModelInstance {
  return {
    id,
    modelId,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
}

describe("Studio BG3D cached model placement admission", () => {
  it("re-admits a deleted then cached model placement without charging duplicate scene bytes", () => {
    const currentRecord = record("model-a", HASH_A, 60);
    const selectedBudgets = budgets(100);

    expect(() => assertStudioBg3dModelPlacementAdmission({
      record: currentRecord,
      cachedRecord: currentRecord,
      metrics: metrics(),
      budgets: selectedBudgets,
      cumulativeUsedBytes: 0,
      maximumCumulativeBytes: 100,
    })).not.toThrow();

    expect(() => assertStudioBg3dModelPlacementAdmission({
      record: currentRecord,
      cachedRecord: currentRecord,
      metrics: metrics(),
      budgets: selectedBudgets,
      cumulativeUsedBytes: 50,
      maximumCumulativeBytes: 100,
    })).toThrowError(expect.objectContaining({
      code: "cumulative-byte-budget-exceeded",
    } satisfies Partial<StudioBg3dModelPlacementAdmissionError>));
  });

  it("uses the authoritative live scene for rapid queued adds and rejects the second overflow", async () => {
    const coordinator = new StudioBg3dModalOperationCoordinator();
    const session = coordinator.beginSession();
    const selectedBudgets = budgets(100);
    const records = {
      "model-a": record("model-a", HASH_A, 60),
      "model-b": record("model-b", HASH_B, 50),
    } as const;
    const attachments = new Map<string, StudioBg3dModelAttachment>([
      ["model-a", attachment("model-a", HASH_A, 60)],
      ["model-b", attachment("model-b", HASH_B, 50)],
    ]);
    let liveModels: BgCustomModelInstance[] = [];

    const queueAdd = (modelId: keyof typeof records) => coordinator.runSceneMutation(
      session,
      () => {
        const cumulativeUsedBytes = calculateStudioBg3dPlacedModelBytes(
          liveModels,
          attachments,
          modelId,
        );
        assertStudioBg3dModelPlacementAdmission({
          record: records[modelId],
          metrics: metrics(),
          budgets: selectedBudgets,
          cumulativeUsedBytes,
          maximumCumulativeBytes: 100,
        });
        return instance(`instance-${modelId}`, modelId);
      },
      (placement) => {
        liveModels = [...liveModels, placement];
      },
    );

    const first = queueAdd("model-a");
    const second = queueAdd("model-b");
    await expect(first).resolves.toMatchObject({ status: "committed" });
    await expect(second).rejects.toMatchObject({
      code: "cumulative-byte-budget-exceeded",
    });
    expect(liveModels.map((model) => model.modelId)).toEqual(["model-a"]);
  });

  it("checks current profile metrics and immutable cache identity on every cache hit", () => {
    const currentRecord = record("model-a", HASH_A, 20);
    expect(() => assertStudioBg3dModelPlacementAdmission({
      record: currentRecord,
      cachedRecord: currentRecord,
      metrics: metrics({ triangles: 11 }),
      budgets: {
        ...budgets(),
        complexity: {
          ...budgets().complexity,
          maxTriangles: 10,
        },
      },
      cumulativeUsedBytes: 0,
      maximumCumulativeBytes: 100,
    })).toThrowError(expect.objectContaining({ code: "triangle-budget-exceeded" }));

    expect(() => assertStudioBg3dModelPlacementAdmission({
      record: currentRecord,
      cachedRecord: record("model-a", HASH_B, 20),
      metrics: metrics(),
      budgets: budgets(),
      cumulativeUsedBytes: 0,
      maximumCumulativeBytes: 100,
    })).toThrowError(expect.objectContaining({ code: "cached-record-mismatch" }));
  });
});
