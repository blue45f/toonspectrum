import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  type StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import { projectStudioBg3dShotVisibilityToRuntime } from "./studio-bg3d-shot-runtime";

describe("Studio BG3D shot runtime projection", () => {
  const primitive = {
    id: "box-a",
    kind: "box" as const,
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale: [1, 1, 1] as [number, number, number],
    color: "#ffffff",
    visible: true,
  };
  const model = {
    id: "model-a",
    modelId: "local-model-a",
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale: [1, 1, 1] as [number, number, number],
    visible: false,
  };
  const document: StudioBg3dSceneDocument = {
    ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    nodes: [
      {
        id: "box-a",
        name: "상자",
        kind: "primitive" as const,
        primitiveKind: "box" as const,
        color: "#ffffff",
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        visible: false,
        locked: false,
        castsShadow: true,
        receivesShadow: true,
      },
      {
        id: "model-a",
        name: "모델",
        kind: "model" as const,
        attachmentId: "attachment-a",
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        visible: true,
        locked: false,
        castsShadow: true,
        receivesShadow: true,
      },
    ],
  };

  it("changes only visibility and preserves runtime-local model bindings", () => {
    const projected = projectStudioBg3dShotVisibilityToRuntime([primitive], [model], document);

    expect(projected?.primitives).toEqual([{ ...primitive, visible: false }]);
    expect(projected?.customModels).toEqual([{ ...model, visible: true }]);
    expect(projected?.customModels[0]?.modelId).toBe("local-model-a");
    expect(primitive.visible).toBe(true);
    expect(model.visible).toBe(false);
  });

  it("fails closed for missing, extra, or mismatched nodes", () => {
    expect(projectStudioBg3dShotVisibilityToRuntime([primitive], [], document)).toBeNull();
    expect(projectStudioBg3dShotVisibilityToRuntime(
      [{ ...primitive, kind: "sphere" }],
      [model],
      document,
    )).toBeNull();
    expect(projectStudioBg3dShotVisibilityToRuntime(
      [primitive],
      [{ ...model, id: "unknown-model" }],
      document,
    )).toBeNull();
  });
});
