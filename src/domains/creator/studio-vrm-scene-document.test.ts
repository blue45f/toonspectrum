import { describe, expect, it } from "vitest";

import { buildVrmPoseDataUrlMetadata } from "./studio-vrm-poser-utils";
import { STUDIO_VRM_RIG_PROFILE_PURPOSE } from "./studio-vrm-rig-profile";
import {
  DEFAULT_STUDIO_VRM_SCENE_DOCUMENT,
  STUDIO_VRM_SCENE_DOCUMENT_KIND,
  STUDIO_VRM_SCENE_DOCUMENT_MAX_BYTES,
  STUDIO_VRM_SCENE_DOCUMENT_V1_MAX_BYTES,
  STUDIO_VRM_SCENE_DOCUMENT_V2_MAX_BYTES,
  STUDIO_VRM_SCENE_DOCUMENT_VERSION,
  areStudioVrmSceneDocumentsEqual,
  createDefaultStudioVrmSceneDocument,
  migrateStudioVrmLegacyMetadata,
  migrateStudioVrmSceneDocument,
  normalizeStudioVrmSceneDocument,
  parseStudioVrmLegacyFragment,
  parseStudioVrmSceneDocument,
  serializeStudioVrmSceneDocument,
  studioVrmSceneHasContent,
  type StudioVrmSceneDocument,
} from "./studio-vrm-scene-document";

function mutableDefault(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(createDefaultStudioVrmSceneDocument())) as Record<string, unknown>;
}

function canonicalScene(overrides: Partial<StudioVrmSceneDocument>): StudioVrmSceneDocument {
  return normalizeStudioVrmSceneDocument({
    ...mutableDefault(),
    ...overrides,
  });
}

function canonicalVersionOne(
  scene: StudioVrmSceneDocument = createDefaultStudioVrmSceneDocument(),
): Record<string, unknown> {
  const cloned = JSON.parse(JSON.stringify(scene)) as Record<string, unknown> & {
    pose: Record<string, unknown>;
    rig: unknown;
  };
  const { translations: _translations, ...legacyPose } = cloned.pose;
  const { rig: _rig, ...versionOne } = cloned;
  return { ...versionOne, version: 1, pose: legacyPose };
}

function canonicalVersionTwo(
  scene: StudioVrmSceneDocument = createDefaultStudioVrmSceneDocument(),
): Record<string, unknown> {
  const cloned = JSON.parse(JSON.stringify(scene)) as Record<string, unknown> & {
    pose: Record<string, unknown>;
  };
  const { translations: _translations, ...versionTwoPose } = cloned.pose;
  return { ...cloned, version: 2, pose: versionTwoPose };
}

describe("studio-vrm-scene-document", () => {
  it("round-trips a canonical attachment scene without camera or rotation drift", () => {
    const hash = `sha256:${"a1".repeat(32)}`;
    const scene = canonicalScene({
      model: {
        source: "attachment",
        hash,
        byteSize: 8_456_123,
        mime: "model/vrm",
        name: "주인공 모델",
      },
      pose: {
        bones: {
          hips: { rotation: [0.125, -0.25, 0.375] },
          head: { rotation: [-1.125, 0.75, 1.5] },
        },
        yOffset: -0.125,
        translations: {
          version: 1,
          root: [0.4, 0, -0.25],
          hips: [0.08, -0.04, 0.03],
          spine: [-0.03, 0.09, 0.05],
        },
        bodyRotationY: 1.234567890123,
        fingerOverrides: {
          leftIndexProximal: [0.1, 0.2, -0.3],
          rightThumbDistal: [-0.4, 0.5, 0.6],
        },
      },
      expressions: { blinkLeft: 0.25, happy: 0.8 },
      camera: {
        projection: "perspective",
        position: [1.25, 2.5, 3.75],
        target: [0.125, 1.375, -0.25],
        up: [0, 1, 0],
        fovDegrees: 31.75,
        near: 0.025,
        far: 543.21,
      },
      appearance: {
        bodyScale: { height: 1.2, width: 0.91 },
        customColors: { hair: "#abcdef", tops: "#12345678" },
        materialFx: {
          shadeColor: "#123",
          outlineColor: "#010203",
          rimColor: "#abcdef",
          rimIntensity: 0.4,
          emissiveColor: null,
          emissiveIntensity: 0.2,
        },
        mannequin: true,
        avatarForge: { face: { jaw: 0.2 }, tags: ["hero", "adult"] },
        costume: { preset: "school" },
        wardrobe: { items: [{ id: "coat-1", visible: true }] },
      },
      rig: {
        version: 1,
        jointProfile: {
          version: 1,
          purpose: STUDIO_VRM_RIG_PROFILE_PURPOSE,
          id: "limited",
        },
        fullBodyIk: true,
        footPlant: true,
        floorHeight: -0.125,
      },
      props: { items: [{ id: "prop-1", scale: [1, 1, 1] }] },
      sceneProps: { items: [{ id: "cat-1", parent: "world" }] },
      lighting: { intensity: 1.75, colorTemp: 0.35, directionDeg: -72.5 },
      physics: {
        version: 1,
        stiffnessScale: 1.25,
        gravityScale: 0.8,
        windDirectionDeg: 123,
        windStrength: 0.45,
      },
      env: "room",
      render: {
        width: 2048,
        height: 1536,
        transparentBackground: false,
        backgroundColor: "#fafafa",
      },
    });

    const serialized = serializeStudioVrmSceneDocument(scene);
    const parsed = parseStudioVrmSceneDocument(serialized ?? "");

    expect(serialized).not.toBeNull();
    expect(parsed).toEqual(scene);
    expect(parsed?.model).toEqual({
      source: "attachment",
      hash,
      byteSize: 8_456_123,
      mime: "model/vrm",
      name: "주인공 모델",
    });
    expect(parsed?.camera).toEqual(scene.camera);
    expect(parsed?.camera.position).toEqual([1.25, 2.5, 3.75]);
    expect(parsed?.pose.bodyRotationY).toBe(1.234567890123);
    expect(parsed?.pose.translations).toEqual(scene.pose.translations);
    expect(serializeStudioVrmSceneDocument(parsed)).toBe(serialized);
  });

  it("returns detached, deeply frozen defaults and canonicalizes rotations", () => {
    const first = createDefaultStudioVrmSceneDocument();
    const second = createDefaultStudioVrmSceneDocument();
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.camera.position)).toBe(true);

    const normalized = normalizeStudioVrmSceneDocument({
      ...mutableDefault(),
      pose: {
        bones: {
          head: { rotation: [Math.PI * 4 + 0.5, -Math.PI * 4 - 0.25, -0] },
          unknownBone: { rotation: [1, 2, 3] },
          leftUpperArm: { direction: { sideX: 0.5, y: -1 } },
        },
        yOffset: 0,
        bodyRotationY: Math.PI * 2 + 0.75,
        fingerOverrides: {
          leftIndexProximal: [Math.PI * 2 + 0.2, 0, 0],
          head: [1, 2, 3],
        },
      },
    });

    expect(normalized.pose.bones).toEqual({ head: { rotation: [0.5, -0.25, 0] } });
    expect(normalized.pose.bodyRotationY).toBeCloseTo(0.75, 12);
    expect(normalized.pose.fingerOverrides).toEqual({
      leftIndexProximal: [expect.closeTo(0.2, 12), 0, 0],
    });
  });

  it("rejects unsafe model references, attachment-local ids, and malformed hashes", () => {
    const bundled = mutableDefault();
    bundled.model = { source: "bundled", id: "blob:local-key", name: "unsafe" };
    expect(parseStudioVrmSceneDocument(JSON.stringify(bundled))).toBeNull();
    expect(serializeStudioVrmSceneDocument(bundled)).toBeNull();

    const attachmentWithLocalId = mutableDefault();
    attachmentWithLocalId.model = {
      source: "attachment",
      id: "indexed-db-row-7",
      hash: `sha256:${"ab".repeat(32)}`,
      byteSize: 10,
      mime: "model/vrm",
      name: "모델",
    };
    expect(parseStudioVrmSceneDocument(JSON.stringify(attachmentWithLocalId))).toBeNull();

    const uppercaseHash = mutableDefault();
    uppercaseHash.model = {
      source: "attachment",
      hash: `sha256:${"AB".repeat(32)}`,
      byteSize: 10,
      mime: "model/gltf-binary",
      name: "모델",
    };
    expect(parseStudioVrmSceneDocument(JSON.stringify(uppercaseHash))).toBeNull();
  });

  it("rejects unsafe URLs, binary values, sparse arrays, NaN, and future versions", () => {
    const unsafeUrl = mutableDefault();
    unsafeUrl.props = { runtimeUrl: "blob:hostile" };
    expect(parseStudioVrmSceneDocument(JSON.stringify(unsafeUrl))).toBeNull();

    const dataUrl = mutableDefault();
    dataUrl.sceneProps = { texture: "data:image/png;base64,AAAA" };
    expect(serializeStudioVrmSceneDocument(dataUrl)).toBeNull();

    const binary = mutableDefault();
    binary.props = { bytes: new Uint8Array([1, 2, 3]) };
    expect(serializeStudioVrmSceneDocument(binary)).toBeNull();

    const sparse = mutableDefault();
    const items = new Array(2) as unknown[];
    items[1] = "only-one";
    sparse.props = { items };
    expect(serializeStudioVrmSceneDocument(sparse)).toBeNull();

    const nan = mutableDefault();
    nan.lighting = { intensity: Number.NaN, colorTemp: 0.5, directionDeg: 0 };
    expect(serializeStudioVrmSceneDocument(nan)).toBeNull();

    const future = mutableDefault();
    future.version = STUDIO_VRM_SCENE_DOCUMENT_VERSION + 1;
    expect(parseStudioVrmSceneDocument(JSON.stringify(future))).toBeNull();
    expect(migrateStudioVrmSceneDocument(future)).toBeNull();
  });

  it("losslessly promotes strict v1/v2 scenes to v3 with neutral translations", () => {
    const current = canonicalScene({
      pose: {
        bones: {
          leftUpperArm: { rotation: [0.25, -0.5, 0.75] },
          rightUpperArm: { rotation: [0.25, 0.5, -0.75] },
        },
        yOffset: 0.14,
        translations: {
          version: 1,
          root: [0, 0, 0],
          hips: [0, 0, 0],
          spine: [0, 0, 0],
        },
        bodyRotationY: -0.4,
        fingerOverrides: {
          leftIndexProximal: [0.1, 0.2, -0.3],
          rightIndexProximal: [0.1, -0.2, 0.3],
        },
      },
      camera: {
        projection: "perspective",
        position: [-1.25, 2.1, 4.25],
        target: [0.2, 1.3, -0.1],
        up: [0, 1, 0],
        fovDegrees: 37,
        near: 0.05,
        far: 250,
      },
      props: { items: [{ id: "mirror-safe-prop", side: "left" }] },
    });
    const versionOne = canonicalVersionOne(current);
    const versionTwo = canonicalVersionTwo(current);

    const parsed = parseStudioVrmSceneDocument(JSON.stringify(versionOne));
    const migrated = migrateStudioVrmSceneDocument(versionOne);
    const migratedVersionTwo = parseStudioVrmSceneDocument(JSON.stringify(versionTwo));

    expect(parsed).toEqual(migrated);
    expect(migratedVersionTwo).toEqual(parsed);
    expect(parsed).toMatchObject({
      kind: STUDIO_VRM_SCENE_DOCUMENT_KIND,
      version: STUDIO_VRM_SCENE_DOCUMENT_VERSION,
      pose: current.pose,
      camera: current.camera,
      props: current.props,
      rig: {
        version: 1,
        jointProfile: {
          version: 1,
          purpose: STUDIO_VRM_RIG_PROFILE_PURPOSE,
          id: "neutral",
        },
        fullBodyIk: false,
        footPlant: false,
        floorHeight: 0,
      },
    });
    expect(parsed?.pose.bones.leftUpperArm).toEqual(current.pose.bones.leftUpperArm);
    expect(parsed?.pose.bones.rightUpperArm).toEqual(current.pose.bones.rightUpperArm);
    expect(parsed?.pose.fingerOverrides).toEqual(current.pose.fingerOverrides);
    expect(serializeStudioVrmSceneDocument(parsed)).not.toBeNull();
  });

  it("keeps authored v2 rig data while adding only the canonical zero translation block", () => {
    const current = canonicalScene({
      rig: {
        version: 1,
        jointProfile: {
          version: 1,
          purpose: STUDIO_VRM_RIG_PROFILE_PURPOSE,
          id: "flexible",
        },
        fullBodyIk: true,
        footPlant: true,
        floorHeight: -0.2,
      },
    });
    const versionTwo = canonicalVersionTwo(current);
    const source = JSON.stringify(versionTwo);
    expect(new TextEncoder().encode(source).byteLength)
      .toBeLessThanOrEqual(STUDIO_VRM_SCENE_DOCUMENT_V2_MAX_BYTES);
    const migrated = parseStudioVrmSceneDocument(source);
    expect(migrated?.version).toBe(STUDIO_VRM_SCENE_DOCUMENT_VERSION);
    expect(migrated?.rig).toEqual(current.rig);
    expect(migrated?.pose.translations).toEqual({
      version: 1,
      root: [0, 0, 0],
      hips: [0, 0, 0],
      spine: [0, 0, 0],
    });
  });

  it("rejects unknown v1/v2/v3 root, translation, or rig keys instead of dropping them", () => {
    const current = mutableDefault();
    expect(parseStudioVrmSceneDocument(JSON.stringify({ ...current, futureRoot: true }))).toBeNull();
    expect(serializeStudioVrmSceneDocument({ ...current, futureRoot: true })).toBeNull();
    expect(parseStudioVrmSceneDocument(JSON.stringify({
      ...current,
      rig: { ...(current.rig as Record<string, unknown>), diagnosis: "none" },
    }))).toBeNull();

    const versionOne = canonicalVersionOne();
    const versionTwo = canonicalVersionTwo();
    expect(parseStudioVrmSceneDocument(JSON.stringify({ ...versionOne, rig: {} }))).toBeNull();
    expect(migrateStudioVrmSceneDocument({ ...versionOne, unknown: true })).toBeNull();
    expect(migrateStudioVrmSceneDocument({ ...versionTwo, unknown: true })).toBeNull();
    const pose = current.pose as Record<string, unknown>;
    expect(serializeStudioVrmSceneDocument({
      ...current,
      pose: {
        ...pose,
        translations: {
          ...(pose.translations as Record<string, unknown>),
          future: true,
        },
      },
    })).toBeNull();
  });

  it("keeps near-ceiling v1 content through promotion while rejecting oversized documents", () => {
    const noteEntries = Array.from({ length: 126 }, (_, index) => [
        `note-${String(index).padStart(3, "0")}`,
        "x".repeat(1_000),
      ] as const);
    let notes = Object.fromEntries(noteEntries);
    let versionOne = canonicalVersionOne(canonicalScene({ props: notes }));
    let serializedV1 = JSON.stringify(versionOne);
    let remaining = STUDIO_VRM_SCENE_DOCUMENT_V1_MAX_BYTES - 256
      - new TextEncoder().encode(serializedV1).byteLength;
    for (let index = 0; remaining > 0 && index < noteEntries.length; index += 1) {
      const extra = Math.min(24, remaining);
      noteEntries[index] = [noteEntries[index][0], `${noteEntries[index][1]}${"x".repeat(extra)}`];
      remaining -= extra;
    }
    notes = Object.fromEntries(noteEntries);
    versionOne = canonicalVersionOne(canonicalScene({ props: notes }));
    serializedV1 = JSON.stringify(versionOne);
    expect(new TextEncoder().encode(serializedV1).byteLength).toBeGreaterThan(
      STUDIO_VRM_SCENE_DOCUMENT_V1_MAX_BYTES - 512,
    );

    const migrated = parseStudioVrmSceneDocument(serializedV1);
    const serializedV2 = serializeStudioVrmSceneDocument(migrated);
    expect(migrated?.props).toEqual(notes);
    expect(serializedV2).not.toBeNull();

    const oversized = `${serializedV2}${" ".repeat(STUDIO_VRM_SCENE_DOCUMENT_MAX_BYTES)}`;
    expect(parseStudioVrmSceneDocument(oversized)).toBeNull();

    const compactVersionOne = JSON.stringify(canonicalVersionOne());
    const compactVersionOneBytes = new TextEncoder().encode(compactVersionOne).byteLength;
    const paddedVersionOne = `${compactVersionOne}${" ".repeat(
      STUDIO_VRM_SCENE_DOCUMENT_V1_MAX_BYTES - compactVersionOneBytes + 1,
    )}`;
    expect(new TextEncoder().encode(paddedVersionOne).byteLength)
      .toBe(STUDIO_VRM_SCENE_DOCUMENT_V1_MAX_BYTES + 1);
    expect(parseStudioVrmSceneDocument(paddedVersionOne)).toBeNull();
    expect(migrateStudioVrmSceneDocument(paddedVersionOne)).toBeNull();
  });

  it("honors the historical v2 byte ceiling while reserving v3 migration headroom", () => {
    const compactVersionTwo = JSON.stringify(canonicalVersionTwo());
    const compactBytes = new TextEncoder().encode(compactVersionTwo).byteLength;
    const atCeiling = `${compactVersionTwo}${" ".repeat(
      STUDIO_VRM_SCENE_DOCUMENT_V2_MAX_BYTES - compactBytes,
    )}`;
    expect(new TextEncoder().encode(atCeiling).byteLength)
      .toBe(STUDIO_VRM_SCENE_DOCUMENT_V2_MAX_BYTES);
    expect(parseStudioVrmSceneDocument(atCeiling)?.version)
      .toBe(STUDIO_VRM_SCENE_DOCUMENT_VERSION);
    expect(parseStudioVrmSceneDocument(`${atCeiling} `)).toBeNull();
  });

  it("never invokes accessors while parsing, serializing, or normalizing", () => {
    let reads = 0;
    const hostile = mutableDefault();
    Object.defineProperty(hostile, "model", {
      enumerable: true,
      get() {
        reads += 1;
        throw new Error("getter must not execute");
      },
    });

    expect(serializeStudioVrmSceneDocument(hostile)).toBeNull();
    expect(normalizeStudioVrmSceneDocument(hostile)).toEqual(DEFAULT_STUDIO_VRM_SCENE_DOCUMENT);
    expect(migrateStudioVrmSceneDocument(hostile)).toBeNull();
    expect(reads).toBe(0);
  });

  it("rejects current documents over the versioned UTF-8 ceiling", () => {
    const oversized = JSON.stringify({
      ...mutableDefault(),
      props: { note: "가".repeat(STUDIO_VRM_SCENE_DOCUMENT_MAX_BYTES) },
    });
    expect(new TextEncoder().encode(oversized).byteLength).toBeGreaterThan(
      STUDIO_VRM_SCENE_DOCUMENT_MAX_BYTES
    );
    expect(parseStudioVrmSceneDocument(oversized)).toBeNull();
  });

  it("migrates explicit and pre-tool legacy bundled fragments while stripping the PNG fragment", () => {
    const metadata = {
      tool: "vrm-poser",
      modelId: "avatar-a",
      modelName: "untrusted display name",
      yOffset: -0.2,
      bodyRotationY: 0.65,
      bones: {
        head: { rotation: [0.1, 0.2, 0.3] },
        leftUpperArm: { direction: { sideX: 0.3, y: -0.9 } },
      },
      fingerOverrides: { leftIndexDistal: [0.4, 0.5, 0.6] },
      expressionWeights: { happy: 0.75 },
      customColors: { hair: "#ABCDEF" },
      bodyScale: { height: 1.1, width: 0.9 },
      lighting: { intensity: 1.2, colorTemp: 0.4, directionDeg: 30 },
      physics: {
        version: 1,
        stiffnessScale: 1.2,
        gravityScale: 0.8,
        windDirectionDeg: 10,
        windStrength: 0.25,
      },
      env: "floor",
      vrmProps: { items: [{ id: "hat" }] },
    };
    const registry = [{ id: "avatar-a", name: "하린" }];
    const rasterSrc = "data:image/png;base64,iVBORw0KGgo=";
    const fragment = `${rasterSrc}#${encodeURIComponent(JSON.stringify(metadata))}`;
    const migrated = parseStudioVrmLegacyFragment(fragment, { bundledModels: registry });

    expect(migrated).toMatchObject({
      status: "resolved",
      rasterSrc,
      document: {
        kind: STUDIO_VRM_SCENE_DOCUMENT_KIND,
        model: { source: "bundled", id: "avatar-a", name: "하린" },
        pose: { yOffset: -0.2, bodyRotationY: 0.65 },
        expressions: { happy: 0.75 },
        env: "floor",
      },
    });
    if (migrated?.status !== "resolved") throw new Error("Expected resolved migration");
    expect(migrated.document.pose.bones).toEqual({ head: { rotation: [0.1, 0.2, 0.3] } });
    expect(migrated.document.appearance.customColors).toEqual({ hair: "#abcdef" });
    expect(serializeStudioVrmSceneDocument(migrated.document)).not.toBeNull();

    const { tool: _tool, ...prehistory } = metadata;
    expect(migrateStudioVrmSceneDocument(prehistory, { bundledModels: registry })).toMatchObject({
      model: { id: "avatar-a", name: "하린" },
      pose: { bodyRotationY: 0.65 },
    });
  });

  it("strictly migrates the currently emitted full-state v2 fragment without losing translations", () => {
    const metadata = buildVrmPoseDataUrlMetadata({
      modelId: "avatar-a",
      bones: { head: { rotation: [0.1, -0.2, 0.3] } },
      yOffset: 0.15,
      poseTranslations: {
        version: 1,
        root: [0.4, 0, -0.2],
        hips: [0.1, -0.05, 0.03],
        spine: [-0.08, 0.12, 0.04],
      },
      bodyRotation: 0.45,
      expressionWeights: { happy: 0.7 },
      props: { version: 1, items: [] },
    }, "하린");
    const decodedMetadata = JSON.parse(JSON.stringify(metadata)) as typeof metadata;
    const registry = [{ id: "avatar-a", name: "하린" }];
    const rasterSrc = "data:image/png;base64,iVBORw0KGgo=";
    const source = `${rasterSrc}#${encodeURIComponent(JSON.stringify(decodedMetadata))}`;
    const migrated = parseStudioVrmLegacyFragment(source, { bundledModels: registry });

    expect(migrated).toMatchObject({
      status: "resolved",
      rasterSrc,
      document: {
        model: { source: "bundled", id: "avatar-a", name: "하린" },
        pose: {
          bones: { head: { rotation: [0.1, -0.2, 0.3] } },
          yOffset: 0.15,
          translations: decodedMetadata.poseTranslations,
          bodyRotationY: 0.45,
        },
        expressions: { happy: 0.7 },
        props: { version: 1, items: [] },
      },
    });

    expect(migrateStudioVrmLegacyMetadata({
      ...decodedMetadata,
      poseTranslations: { ...decodedMetadata.poseTranslations, root: [0, 0.1, 0] },
    }, { bundledModels: registry })).toBeNull();
    expect(migrateStudioVrmLegacyMetadata({
      ...decodedMetadata,
      runtimeUrl: "blob:hostile",
    }, { bundledModels: registry })).toBeNull();
    expect(migrateStudioVrmLegacyMetadata({
      ...decodedMetadata,
      version: 3,
    }, { bundledModels: registry })).toBeNull();
    expect(migrateStudioVrmLegacyMetadata({
      ...decodedMetadata,
      modelId: "local-upload-model",
    }, { bundledModels: registry })).toMatchObject({
      status: "unresolved-model",
      modelId: "local-upload-model",
    });
  });

  it("reports arbitrary legacy local ids as unresolved instead of persisting them", () => {
    const metadata = {
      tool: "vrm-poser",
      modelId: "vrm-1712345678-local-row",
      modelName: "내 업로드",
      bones: {},
      yOffset: 0,
    };
    expect(migrateStudioVrmSceneDocument(metadata)).toBeNull();
    expect(migrateStudioVrmLegacyMetadata(metadata)).toEqual({
      status: "unresolved-model",
      modelId: "vrm-1712345678-local-row",
      modelName: "내 업로드",
    });

    const rasterSrc = "data:image/png;base64,AAAA";
    expect(parseStudioVrmLegacyFragment(
      `${rasterSrc}#${encodeURIComponent(JSON.stringify(metadata))}`
    )).toEqual({
      status: "unresolved-model",
      rasterSrc,
      modelId: "vrm-1712345678-local-row",
      modelName: "내 업로드",
    });
  });

  it("rejects legacy metadata with foreign tools or smuggled references", () => {
    expect(migrateStudioVrmSceneDocument({
      tool: "bg3d",
      modelId: "sample-vrm",
      bones: {},
    })).toBeNull();
    expect(migrateStudioVrmSceneDocument({
      tool: "vrm-poser",
      modelId: "sample-vrm",
      bones: {},
      runtimeUrl: "blob:hostile",
    })).toBeNull();
    expect(parseStudioVrmLegacyFragment(
      `data:image/jpeg;base64,AAAA#${encodeURIComponent(JSON.stringify({
        modelId: "sample-vrm",
      }))}`
    )).toBeNull();
  });

  it("provides canonical equality and non-default content helpers", () => {
    const first = createDefaultStudioVrmSceneDocument();
    const second = parseStudioVrmSceneDocument(JSON.stringify(first));
    expect(areStudioVrmSceneDocumentsEqual(first, second)).toBe(true);
    expect(studioVrmSceneHasContent(first)).toBe(false);

    const changed = canonicalScene({ expressions: { happy: 1 } });
    expect(studioVrmSceneHasContent(changed)).toBe(true);
    expect(areStudioVrmSceneDocumentsEqual(first, changed)).toBe(false);
    expect(areStudioVrmSceneDocumentsEqual(first, { ...first, extra: true })).toBe(false);

    const versionOneDefault = canonicalVersionOne(first);
    const versionOneChanged = canonicalVersionOne(changed);
    expect(areStudioVrmSceneDocumentsEqual(versionOneDefault, first)).toBe(true);
    expect(studioVrmSceneHasContent(versionOneDefault)).toBe(false);
    expect(studioVrmSceneHasContent(versionOneChanged)).toBe(true);
  });
});
