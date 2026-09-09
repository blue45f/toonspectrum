import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  type StudioBg3dSceneDocument,
} from "../bg3d/studio-bg3d-scene-document";
import { isStudioScene3dDocument } from "./studio-scene3d-document";
import { projectStudioBg3dDocumentToScene3d } from "./studio-scene3d-bg3d-projection";

describe("BG3D → Scene3D projection", () => {
  it("keeps primitives procedural and models content-addressed while sharing camera/light/output authority", () => {
    const source: StudioBg3dSceneDocument = {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      attachments: [{
        id: "chair",
        name: "Chair",
        mime: "model/gltf-binary",
        byteSize: 1024,
        hash: `sha256:${"a".repeat(64)}`,
        rights: {
          status: "public-domain",
          commercialUse: true,
          attributionRequired: false,
          licenseName: "CC0-1.0",
        },
        source: "bundled",
      }],
      nodes: [{
        id: "floor",
        name: "Floor",
        kind: "primitive",
        primitiveKind: "plane",
        color: "#dddddd",
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [4, 1, 4] },
        visible: true,
        locked: false,
        castsShadow: false,
        receivesShadow: true,
        parentId: null,
      }, {
        id: "chair-node",
        name: "Chair",
        kind: "model",
        attachmentId: "chair",
        transform: { position: [1, 0, 0], rotation: [0, Math.PI / 2, 0], scale: [1, 1, 1] },
        visible: true,
        locked: false,
        castsShadow: true,
        receivesShadow: true,
        parentId: null,
      }],
      output: {
        ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output,
        exportHeight: 640,
        exportAspectRatio: 0.75,
      },
    };

    const projected = projectStudioBg3dDocumentToScene3d({
      documentId: "scene:test",
      source,
      now: "2026-09-10T00:00:00.000Z",
    });

    expect(isStudioScene3dDocument(projected)).toBe(true);
    expect(projected.entities.map((entity) => entity.kind)).toEqual(["primitive", "model"]);
    expect(projected.assets).toHaveLength(1);
    expect(projected.assets[0]).toMatchObject({
      id: "bg3d:chair",
      uri: "attachment:chair",
      quality: { accepted: false, score: 0 },
    });
    expect(projected.output.height).toBe(2160);
    expect(projected.output.width).toBe(1620);
    expect(projected.output.pixelRatio).toBe(1);
    expect(projected.lights.map((light) => light.id)).toEqual(["light:key", "light:fill"]);
  });

  it("creates independent shot cameras instead of dropping legacy camera overrides", () => {
    const source: StudioBg3dSceneDocument = {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      shots: [{
        id: "close-up",
        name: "Close up",
        camera: { fovDegrees: 25 },
        nodeVisibility: [],
      }],
      activeShotId: "close-up",
    };

    const projected = projectStudioBg3dDocumentToScene3d({ documentId: "scene:shot", source });

    expect(projected.activeCameraId).toBe("camera:shot:close-up");
    expect(projected.cameras).toHaveLength(2);
    expect(projected.cameras[1]?.focalLengthMm).toBeGreaterThan(projected.cameras[0]!.focalLengthMm);
  });
});
