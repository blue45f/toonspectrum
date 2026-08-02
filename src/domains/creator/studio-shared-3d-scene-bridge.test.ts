import { describe, expect, it } from "vitest";

import {
  STUDIO_SHARED_3D_MAX_CHARACTERS,
  createStudioShared3dSceneSession,
  createStudioShared3dSceneSessionFromElements,
  inspectStudioShared3dCharacterCompatibility,
  inspectStudioShared3dCaptureReadiness,
  planStudioShared3dCapturedSourceLayerVisibility,
  studioShared3dCharacterWorldTransform,
} from "./studio-shared-3d-scene-bridge";
import {
  createStudioVrmSceneDocument,
  normalizeStudioVrmSceneDocument,
  serializeStudioVrmSceneDocument,
} from "./studio-vrm-scene-document";

describe("studio shared 3D scene bridge", () => {
  it("links canonical VRM authorities without projecting them into the background schema", () => {
    const scene = normalizeStudioVrmSceneDocument({
      ...createStudioVrmSceneDocument(),
      pose: {
        ...createStudioVrmSceneDocument().pose,
        yOffset: 0.25,
        bodyRotationY: Math.PI / 4,
        translations: {
          version: 1,
          root: [1.5, 0, -2],
          hips: [0, 0, 0],
          spine: [0, 0, 0],
        },
      },
      expressions: { happy: 0.7 },
    });
    const session = createStudioShared3dSceneSession([
      { elementId: "vrm-layer-1", label: "  주인공   A  ", scene },
    ]);

    expect(session.authority).toBe("background-stage-with-linked-character-sources");
    expect(session.characters).toHaveLength(1);
    expect(session.characters[0]?.label).toBe("주인공 A");
    expect(serializeStudioVrmSceneDocument(session.characters[0]?.scene)).toBe(
      serializeStudioVrmSceneDocument(scene),
    );
    expect(session.characters[0]?.compatibility.roundTrip).toBe(
      "source-authority-preserved",
    );
    expect(studioShared3dCharacterWorldTransform(scene)).toEqual({
      position: [1.5, 0.25, -2],
      rotation: [0, Math.PI / 4, 0],
      scale: [1, 1, 1],
    });
  });

  it("reports preview-only omissions while keeping their source document intact", () => {
    const scene = normalizeStudioVrmSceneDocument({
      ...createStudioVrmSceneDocument(),
      appearance: {
        ...createStudioVrmSceneDocument().appearance,
        costume: { coat: true },
        wardrobe: { jacket: "blue" },
        mannequin: true,
      },
      props: [{ id: "umbrella" }],
      sceneProps: [{ id: "chair" }],
      surfacePaint: {
        version: 1,
        textures: [{
          bindingKey: "body-baseColor",
          materialLocator: "gltf-material:0",
          textureSlot: "baseColor",
          hash: `sha256:${"a".repeat(64)}`,
          mime: "image/png",
          byteSize: 4,
          width: 1,
          height: 1,
        }],
      },
    });
    const before = serializeStudioVrmSceneDocument(scene);
    const report = inspectStudioShared3dCharacterCompatibility(scene);

    expect(report.previewOmissions.map(({ code }) => code)).toEqual([
      "costume",
      "mannequin-material",
      "props",
      "scene-props",
      "surface-paint",
      "wardrobe",
    ]);
    expect(serializeStudioVrmSceneDocument(scene)).toBe(before);
  });

  it("deduplicates unsafe sources and applies a deterministic GPU admission bound", () => {
    const scene = createStudioVrmSceneDocument();
    const inputs = Array.from({ length: STUDIO_SHARED_3D_MAX_CHARACTERS + 3 }, (_, index) => ({
      elementId: `character-${index}`,
      scene,
    }));
    inputs.push({ elementId: "character-0", scene });
    inputs.push({ elementId: "__proto__", scene });

    const session = createStudioShared3dSceneSession(inputs);
    expect(session.characters).toHaveLength(STUDIO_SHARED_3D_MAX_CHARACTERS);
    expect(session.omittedCharacterCount).toBe(3);
    expect(new Set(session.characters.map(({ elementId }) => elementId)).size).toBe(
      STUDIO_SHARED_3D_MAX_CHARACTERS,
    );
  });

  it("collects current-page character image authorities without linking unrelated layers", () => {
    const scene = createStudioVrmSceneDocument();
    const session = createStudioShared3dSceneSessionFromElements([
      { id: "character-a", type: "image", name: "주인공", vrmScene: scene },
      { id: "flat-image", type: "image", name: "평면 이미지" },
      { id: "text-layer", type: "text", vrmScene: scene },
    ]);

    expect(session.characters.map(({ elementId, label }) => ({ elementId, label }))).toEqual([
      { elementId: "character-a", label: "주인공" },
    ]);
  });

  it("admits only ready, full-fidelity characters into a hide-safe capture receipt", () => {
    const exact = createStudioVrmSceneDocument();
    const previewOnly = normalizeStudioVrmSceneDocument({
      ...exact,
      props: [{ id: "umbrella" }],
    });
    const session = createStudioShared3dSceneSession([
      { elementId: "ready-exact", scene: exact },
      { elementId: "ready-partial", scene: previewOnly },
      { elementId: "still-loading", scene: exact },
    ]);
    const runtimeKeyByElementId = new Map(
      session.characters.map((character) => [character.elementId, character.runtimeKey]),
    );

    const loading = inspectStudioShared3dCaptureReadiness(session, {
      [runtimeKeyByElementId.get("ready-exact")!]: "ready",
      [runtimeKeyByElementId.get("ready-partial")!]: "ready",
      [runtimeKeyByElementId.get("still-loading")!]: "loading",
    });
    expect(loading).toEqual({
      phase: "loading",
      capturableElementIds: ["ready-exact"],
      previewOnlyElementIds: ["ready-partial"],
    });

    const unavailable = inspectStudioShared3dCaptureReadiness(session, {
      [runtimeKeyByElementId.get("ready-exact")!]: "ready",
      [runtimeKeyByElementId.get("ready-partial")!]: "ready",
      [runtimeKeyByElementId.get("still-loading")!]: "unavailable",
    });
    expect(unavailable.phase).toBe("unavailable");
    expect(unavailable.capturableElementIds).not.toContain("still-loading");
  });

  it("hides captured VRM sources atomically and fails closed for partial or stale receipts", () => {
    const scene = createStudioVrmSceneDocument();
    const elements = [
      { id: "ready-a", type: "image", vrmScene: scene, hidden: false, locked: false },
      { id: "failed-b", type: "image", vrmScene: scene, hidden: false, locked: false },
    ] as const;
    const complete = planStudioShared3dCapturedSourceLayerVisibility({
      elements,
      capturedElementIds: ["ready-a"],
      isLocked: (element) => element.locked,
    });
    expect(complete.ok).toBe(true);
    if (complete.ok) {
      expect(complete.nextElements).toEqual([
        { ...elements[0], hidden: true },
        elements[1],
      ]);
      expect(complete.hiddenElementIds).toEqual(["ready-a"]);
    }

    const stale = planStudioShared3dCapturedSourceLayerVisibility({
      elements,
      capturedElementIds: ["ready-a", "missing-character"],
      isLocked: (element) => element.locked,
    });
    expect(stale.ok).toBe(false);
    expect(elements.every((element) => element.hidden === false)).toBe(true);

    const lockedElements = [{ ...elements[0], locked: true }, elements[1]];
    const locked = planStudioShared3dCapturedSourceLayerVisibility({
      elements: lockedElements,
      capturedElementIds: ["ready-a"],
      isLocked: (element) => element.locked,
    });
    expect(locked.ok).toBe(false);
    expect(lockedElements[0].hidden).toBe(false);
  });
});
