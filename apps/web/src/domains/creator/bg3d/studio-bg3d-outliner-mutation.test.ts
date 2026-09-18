import { describe, expect, it } from "vitest";

import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { BgPrimitive } from "../studio-background-3d-primitives";

import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";
import {
  applyStudioBg3dOutlinerSelectionEffect,
  planStudioBg3dOutlinerMutation,
  type StudioBg3dOutlinerMutationDependencies,
  type StudioBg3dOutlinerSceneSnapshot,
} from "./studio-bg3d-outliner-mutation";

const PRIMITIVE: BgPrimitive = {
  id: "primitive-1",
  kind: "box",
  position: [0, 0.5, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  color: "#ffffff",
};

const MODEL: BgCustomModelInstance = {
  id: "model-1",
  modelId: "stored-model-1",
  position: [1, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};
function scene(): StudioBg3dOutlinerSceneSnapshot {
  return {
    primitives: [{ ...PRIMITIVE, position: [...PRIMITIVE.position] }],
    customModels: [{ ...MODEL, position: [...MODEL.position] }],
    document: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  };
}

const dependencies: StudioBg3dOutlinerMutationDependencies = {
  duplicatePrimitive: (source) => ({
    ...source,
    id: "primitive-copy",
    position: [source.position[0] + 0.4, source.position[1], source.position[2] + 0.4],
  }),
  duplicateModel: (source) => ({
    ...source,
    id: "model-copy",
    position: [source.position[0] + 0.4, source.position[1], source.position[2] + 0.4],
  }),
  planRemoval: ({ snapshot, entityIds }) => ({
    ok: true,
    snapshot: {
      primitives: snapshot.primitives.filter((entry) => !entityIds.has(entry.id)),
      customModels: snapshot.customModels.filter((entry) => !entityIds.has(entry.id)),
      document: snapshot.document,
    },
  }),
};
describe("planStudioBg3dOutlinerMutation", () => {
  it("plans a renderer-neutral rename without mutating the source scene", () => {
    const source = scene();
    const result = planStudioBg3dOutlinerMutation({
      snapshot: source,
      action: {
        type: "rename",
        item: {
          id: "primitive-1",
          kind: "primitive",
          label: "상자",
          visible: true,
          locked: false,
          parentId: null,
        },
        name: "주인공 책상",
      },
      dependencies,
    });

    expect(result).toMatchObject({
      ok: true,
      command: { id: "bg3d.outliner.rename", source: "menu" },
      selection: { type: "preserve" },
    });
    if (!result.ok) return;
    expect(result.snapshot.primitives[0]?.name).toBe("주인공 책상");
    expect(source.primitives[0]?.name).toBeUndefined();
  });
  it("toggles default visibility and lock semantics as one command plan", () => {
    const visibility = planStudioBg3dOutlinerMutation({
      snapshot: scene(),
      action: {
        type: "toggle-visibility",
        item: {
          id: "model-1",
          kind: "model",
          label: "배경 모델",
          visible: true,
          locked: false,
          parentId: null,
        },
      },
      dependencies,
    });
    expect(visibility.ok && visibility.snapshot.customModels[0]?.visible).toBe(false);

    const locking = planStudioBg3dOutlinerMutation({
      snapshot: scene(),
      action: {
        type: "toggle-lock",
        item: {
          id: "primitive-1",
          kind: "primitive",
          label: "상자",
          visible: true,
          locked: false,
          parentId: null,
        },
      },
      dependencies,
    });
    expect(locking.ok && locking.snapshot.primitives[0]?.locked).toBe(true);
  });

  it("selects the newly duplicated entity and keeps the operation atomic", () => {
    const result = planStudioBg3dOutlinerMutation({
      snapshot: scene(),
      action: {
        type: "duplicate",
        item: {
          id: "model-1",
          kind: "model",
          label: "배경 모델",
          visible: true,
          locked: false,
          parentId: null,
        },
      },
      dependencies,
    });

    expect(result).toMatchObject({
      ok: true,
      command: { id: "bg3d.outliner.duplicate" },
      selection: { type: "replace" },
    });
    if (!result.ok || result.selection.type !== "replace") return;
    expect(result.snapshot.customModels.map((entry) => entry.id)).toEqual([
      "model-1",
      "model-copy",
    ]);
    expect([...result.selection.ids]).toEqual(["model-copy"]);
  });

  it("removes only the deleted id from the current selection", () => {
    const result = planStudioBg3dOutlinerMutation({
      snapshot: scene(),
      action: {
        type: "remove",
        item: {
          id: "primitive-1",
          kind: "primitive",
          label: "상자",
          visible: true,
          locked: false,
          parentId: null,
        },
      },
      dependencies,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.primitives).toHaveLength(0);
    expect(applyStudioBg3dOutlinerSelectionEffect(
      new Set(["primitive-1", "model-1"]),
      result.selection,
    )).toEqual(new Set(["model-1"]));
  });
  it("does not publish history entries for unchanged or stale requests", () => {
    const unchanged = planStudioBg3dOutlinerMutation({
      snapshot: scene(),
      action: {
        type: "rename",
        item: {
          id: "primitive-1",
          kind: "primitive",
          label: "상자",
          visible: true,
          locked: false,
          parentId: null,
        },
        name: "상자",
      },
      dependencies,
    });
    const missing = planStudioBg3dOutlinerMutation({
      snapshot: scene(),
      action: {
        type: "remove",
        item: {
          id: "missing",
          kind: "model",
          label: "사라진 모델",
          visible: true,
          locked: false,
          parentId: null,
        },
      },
      dependencies,
    });

    expect(unchanged).toEqual({ ok: false, reason: "unchanged" });
    expect(missing).toEqual({ ok: false, reason: "entity-not-found" });
  });
});
