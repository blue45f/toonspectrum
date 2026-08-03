import { describe, expect, it } from "vitest";

import {
  STUDIO_SHARED_3D_MAX_CHARACTERS,
  createStudioShared3dCharacterShadowEntity,
  createStudioShared3dSceneSession,
  createStudioShared3dSceneSessionFromElements,
  inspectStudioShared3dCharacterCompatibility,
  inspectStudioShared3dCaptureReadiness,
  planStudioShared3dCapturedSourceLayerVisibility,
  planStudioShared3dCharacterTransformUpdate,
  selectStudioShared3dVisibleSceneElements,
  studioShared3dCharacterWorldTransform,
} from "./studio-shared-3d-scene-bridge";
import { createAvatarForgeState } from "./studio-vrm-avatar-forge";
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
    expect(session.characters[0]?.sourceHash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(session.characters[0]?.runtimeKey).toContain(
      session.characters[0]?.sourceHash ?? "missing",
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

  it("keeps the neutral Avatar Forge state capturable while flagging real forge edits", () => {
    const exact = createStudioVrmSceneDocument();
    const neutralForge = createAvatarForgeState();
    const neutral = normalizeStudioVrmSceneDocument({
      ...exact,
      appearance: {
        ...exact.appearance,
        avatarForge: neutralForge,
      },
    });
    const customized = normalizeStudioVrmSceneDocument({
      ...neutral,
      appearance: {
        ...neutral.appearance,
        avatarForge: {
          ...neutralForge,
          hair: {
            ...neutralForge.hair,
            style: "bob",
            curl: 0.48,
          },
        },
      },
    });

    expect(neutral.appearance.avatarForge).not.toBeNull();
    expect(inspectStudioShared3dCharacterCompatibility(neutral).previewOmissions)
      .not.toContainEqual(expect.objectContaining({ code: "avatar-forge" }));
    expect(customized.appearance.avatarForge).toMatchObject({
      hair: { style: "bob", curl: 0.48 },
    });
    expect(inspectStudioShared3dCharacterCompatibility(customized).previewOmissions)
      .toContainEqual(expect.objectContaining({ code: "avatar-forge" }));
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

  it("projects Stage-local placement without changing the VRM source or model identity", () => {
    const scene = normalizeStudioVrmSceneDocument({
      ...createStudioVrmSceneDocument(),
      pose: {
        ...createStudioVrmSceneDocument().pose,
        yOffset: 0.25,
        bodyRotationY: 0.4,
        translations: {
          ...createStudioVrmSceneDocument().pose.translations,
          root: [1, 0, -2],
        },
      },
    });
    const source = createStudioShared3dSceneSession([
      { elementId: "hero", scene },
    ]).characters[0]!;
    const stage = createStudioShared3dSceneSession([{
      elementId: "hero",
      scene,
      stageId: "stage-a",
      stageTransform: { position: [-3, 1.5, 4], rotationY: -0.8 },
    }]).characters[0]!;

    expect(stage).toMatchObject({
      stageId: "stage-a",
      placementAuthority: "stage-override",
      stageTransform: { position: [-3, 1.5, 4], rotationY: -0.8 },
    });
    expect(stage.sourceHash).toBe(source.sourceHash);
    expect(stage.runtimeKey).toBe(source.runtimeKey);
    expect(stage.modelRuntimeKey).toBe(source.modelRuntimeKey);
    expect(stage.placementHash).not.toBe(source.placementHash);
    expect(studioShared3dCharacterWorldTransform(stage.scene, stage.stageTransform)).toEqual({
      position: [-3, 1.5, 4],
      rotation: [0, -0.8, 0],
      scale: [1, 1, 1],
    });
    expect(createStudioShared3dCharacterShadowEntity(stage)).toMatchObject({
      position: [-3, 1.5, 4],
      rotation: [0, -0.8, 0],
      scale: [1, 1, 1],
    });
    expect(serializeStudioVrmSceneDocument(stage.scene)).toBe(
      serializeStudioVrmSceneDocument(scene),
    );
  });

  it("excludes both layer-hidden and group-hidden VRMs from an unlinked Stage draft", () => {
    const scene = createStudioVrmSceneDocument();
    const elements = [
      { id: "visible", type: "image", vrmScene: scene, hidden: false },
      { id: "layer-hidden", type: "image", vrmScene: scene, hidden: true },
      {
        id: "group-hidden",
        type: "image",
        vrmScene: scene,
        hidden: false,
        groupId: "hidden-folder",
      },
    ] as const;
    const candidates = selectStudioShared3dVisibleSceneElements(elements, [
      { id: "hidden-folder", name: "숨긴 캐릭터 폴더", hidden: true },
    ]);
    const session = createStudioShared3dSceneSessionFromElements(candidates);

    expect(session.characters.map(({ elementId }) => elementId)).toEqual(["visible"]);
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

    const exactReceiptOwnedHidden = [{ ...elements[0], hidden: true, locked: true }];
    const reused = planStudioShared3dCapturedSourceLayerVisibility({
      elements: exactReceiptOwnedHidden,
      capturedElementIds: ["ready-a"],
      isLocked: (element) => element.locked,
      reusableHiddenElementIds: new Set(["ready-a"]),
    });
    expect(reused).toMatchObject({
      ok: true,
      hiddenElementIds: [],
    });
    if (reused.ok) expect(reused.nextElements).toEqual(exactReceiptOwnedHidden);
  });

  it("writes shared-stage X/Y/Z and yaw back to one canonical VRM source", () => {
    const scene = normalizeStudioVrmSceneDocument({
      ...createStudioVrmSceneDocument(),
      pose: {
        ...createStudioVrmSceneDocument().pose,
        bones: { head: { rotation: [0.1, 0.2, 0.3] } },
      },
      expressions: { happy: 0.8 },
      appearance: {
        ...createStudioVrmSceneDocument().appearance,
        wardrobe: { jacket: "navy" },
        avatarForge: { preset: "hero" },
      },
      props: [{ id: "umbrella" }],
    });
    const source = createStudioShared3dSceneSession([
      { elementId: "hero-layer", scene },
    ]).characters[0]!;
    const elements = [
      { id: "hero-layer", type: "image", name: "주인공", vrmScene: scene, locked: false },
      { id: "background", type: "image", name: "배경", locked: false },
    ] as const;
    const before = serializeStudioVrmSceneDocument(scene)!;

    const planned = planStudioShared3dCharacterTransformUpdate({
      elements,
      request: {
        elementId: "hero-layer",
        expectedRuntimeKey: source.runtimeKey,
        transform: {
          position: [2.5, 0.35, -3.25],
          rotationY: Math.PI / 3,
        },
      },
      isLocked: (element) => element.locked,
    });

    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.changed).toBe(true);
    expect(planned.nextElements[1]).toBe(elements[1]);
    expect(planned.nextElements[0]).not.toBe(elements[0]);
    const updatedElement = planned.nextElements[0];
    expect(updatedElement && "vrmScene" in updatedElement).toBe(true);
    const updated = updatedElement && "vrmScene" in updatedElement
      ? updatedElement.vrmScene
      : undefined;
    expect(updated?.pose.translations.root).toEqual([2.5, 0, -3.25]);
    expect(updated?.pose.yOffset).toBe(0.35);
    expect(updated?.pose.bodyRotationY).toBeCloseTo(Math.PI / 3, 10);
    expect(updated?.pose.bones).toEqual(scene.pose.bones);
    expect(updated?.expressions).toEqual(scene.expressions);
    expect(updated?.appearance).toEqual(scene.appearance);
    expect(updated?.props).toEqual(scene.props);
    expect(serializeStudioVrmSceneDocument(scene)).toBe(before);
    expect(planned.receipt.beforeSourceHash).toBe(source.sourceHash);
    expect(planned.receipt.afterSourceHash).not.toBe(source.sourceHash);
    expect(planned.receipt.beforeRuntimeKey).toBe(source.runtimeKey);
    expect(planned.receipt.afterRuntimeKey).not.toBe(source.runtimeKey);
  });

  it("rejects stale, locked, duplicate and out-of-range character transform writes atomically", () => {
    const scene = createStudioVrmSceneDocument();
    const source = createStudioShared3dSceneSession([
      { elementId: "hero-layer", scene },
    ]).characters[0]!;
    const request = {
      elementId: "hero-layer",
      expectedRuntimeKey: source.runtimeKey,
      transform: { position: [1, 0, 2] as const, rotationY: 0.2 },
    };
    const unlocked = { id: "hero-layer", type: "image", vrmScene: scene, locked: false };

    const stale = planStudioShared3dCharacterTransformUpdate({
      elements: [unlocked],
      request: { ...request, expectedRuntimeKey: `${source.runtimeKey}-stale` },
      isLocked: (element) => element.locked,
    });
    expect(stale).toMatchObject({ ok: false, code: "stale-source" });

    const locked = planStudioShared3dCharacterTransformUpdate({
      elements: [{ ...unlocked, locked: true }],
      request,
      isLocked: (element) => element.locked,
    });
    expect(locked).toMatchObject({ ok: false, code: "locked-source" });

    const duplicate = planStudioShared3dCharacterTransformUpdate({
      elements: [unlocked, { ...unlocked }],
      request,
      isLocked: (element) => element.locked,
    });
    expect(duplicate).toMatchObject({ ok: false, code: "missing-source" });

    const unsafe = planStudioShared3dCharacterTransformUpdate({
      elements: [unlocked],
      request: {
        ...request,
        transform: { position: [11, 0, 0], rotationY: Number.NaN },
      },
      isLocked: (element) => element.locked,
    });
    expect(unsafe).toMatchObject({ ok: false, code: "invalid-request" });
    expect(unlocked.vrmScene).toBe(scene);

    expect(() => planStudioShared3dCharacterTransformUpdate({
      elements: [unlocked],
      request: {
        ...request,
        transform: { position: null, rotationY: 0 } as never,
      },
      isLocked: (element) => element.locked,
    })).not.toThrow();
    const malformed = planStudioShared3dCharacterTransformUpdate({
      elements: [unlocked],
      request: {
        ...request,
        transform: { position: [0, 0], rotationY: 0 } as never,
      },
      isLocked: (element) => element.locked,
    });
    expect(malformed).toMatchObject({ ok: false, code: "invalid-request" });
  });

  it("returns a no-op receipt without cloning elements when the transform is unchanged", () => {
    const scene = createStudioVrmSceneDocument();
    const source = createStudioShared3dSceneSession([
      { elementId: "hero-layer", scene },
    ]).characters[0]!;
    const elements = [{ id: "hero-layer", type: "image", vrmScene: scene }];
    const planned = planStudioShared3dCharacterTransformUpdate({
      elements,
      request: {
        elementId: "hero-layer",
        expectedRuntimeKey: source.runtimeKey,
        transform: { position: [0, 0, 0], rotationY: 0 },
      },
      isLocked: () => false,
    });

    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.changed).toBe(false);
    expect(planned.nextElements).toBe(elements);
    expect(planned.receipt.afterSourceHash).toBe(source.sourceHash);
  });
});
