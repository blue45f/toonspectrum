import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  normalizeStudioBg3dSceneDocument,
} from "../bg3d/studio-bg3d-scene-document";
import { createStudioShared3dSceneSession } from "../studio-shared-3d-scene-bridge";
import { createStudioVrmSceneDocument } from "../vrm/studio-vrm-scene-document";
import {
  createStudioScene3dAuthority,
  projectStudioScene3dAuthorityToSources,
} from "./studio-scene3d-authority";

const NOW = "2026-09-17T00:00:00.000Z";

function scene() {
  return normalizeStudioBg3dSceneDocument({
    ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    nodes: [{
      id: "cube",
      name: "Cube",
      kind: "primitive",
      primitiveKind: "box",
      transform: { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      visible: true,
      locked: false,
      castsShadow: true,
      receivesShadow: true,
      parentId: null,
      color: "#ffffff",
    }],
  });
}

function authority() {
  const shared = createStudioShared3dSceneSession([{
    elementId: "hero",
    label: "Hero",
    scene: createStudioVrmSceneDocument(),
    stageTransform: { position: [1, 0, 2], rotationY: 0.25 },
  }]);
  return createStudioScene3dAuthority({
    authorityId: "scene:authority-test",
    bg3d: scene(),
    sharedSceneSession: shared,
    viewportAspectRatio: 1,
    revision: 4,
    now: NOW,
  });
}

describe("StudioScene3d authority", () => {
  it("projects BG3D and linked VRM sources into one validated document", () => {
    const value = authority();
    expect(value.document.revision).toBe(4);
    expect(value.document.entities.map((entry) => entry.id)).toEqual(["cube", "character:hero"]);
    expect(value.bindings).toHaveLength(2);
    expect(value.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(value.document.entities[1]).toMatchObject({
      kind: "character",
      characterDocumentId: value.characters[0]?.sourceHash,
    });
  });

  it("round-trips scene, camera, output, and source-owned character placement", () => {
    const current = authority();
    const next = {
      ...current.document,
      revision: 5,
      entities: current.document.entities.map((entity) => {
        if (entity.id === "cube") {
          return { ...entity, name: "Moved cube", transform: { ...entity.transform, position: [3, 2, 1] as const } };
        }
        if (entity.id === "character:hero") {
          const yaw = 0.75;
          return {
            ...entity,
            transform: {
              ...entity.transform,
              position: [4, 0, -2] as const,
              rotation: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)] as const,
            },
          };
        }
        return entity;
      }),
      cameras: current.document.cameras.map((camera) =>
        camera.id === current.document.activeCameraId
          ? { ...camera, position: [8, 4, 6] as const, focalLengthMm: 85 }
          : camera),
      output: { ...current.document.output, width: 900, height: 1200 },
    };
    const projected = projectStudioScene3dAuthorityToSources(current, next);
    expect(projected.bg3d.nodes[0]).toMatchObject({
      id: "cube",
      name: "Moved cube",
      transform: { position: [3, 2, 1] },
    });
    expect(projected.bg3d.camera.position).toEqual([8, 4, 6]);
    expect(projected.bg3d.output).toMatchObject({ exportHeight: 1200, exportAspectRatio: 0.75 });
    expect(projected.characterTransformRequests).toEqual([expect.objectContaining({
      elementId: "hero",
      transform: expect.objectContaining({ position: [4, 0, -2], rotationY: expect.closeTo(0.75, 6) }),
    })]);
    expect(projected.changedEntityIds).toEqual(["character:hero", "cube"]);
    expect(projected.issues).toEqual([]);
  });

  it("fails closed when a linked source is deleted or the revision moves backwards", () => {
    const current = authority();
    const withoutCharacter = {
      ...current.document,
      revision: 5,
      entities: current.document.entities.filter((entity) => entity.id !== "character:hero"),
    };
    expect(projectStudioScene3dAuthorityToSources(current, withoutCharacter).issues)
      .toContainEqual(expect.objectContaining({ code: "linked-character-removal" }));
    expect(() => projectStudioScene3dAuthorityToSources(current, {
      ...current.document,
      revision: 3,
    })).toThrow(/revision moved backwards/u);
  });
});
