import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createStudioShared3dSceneSession,
} from "./studio-shared-3d-scene-bridge";
import { createStudioVrmSceneDocument, normalizeStudioVrmSceneDocument } from "./studio-vrm-scene-document";

const loadStudioVrmAsset = vi.fn();
const getStoredVrmModelByHash = vi.fn();
const selectableSampleVrmUrl = vi.fn();
const applyPoseToVrm = vi.fn(() => true);
const applyFingerRotations = vi.fn();
const applyBodyScale = vi.fn();
const applyExpressionWeightsToVrm = vi.fn();
const applyVrmCustomColors = vi.fn();
const applyVrmMaterialFx = vi.fn();

vi.mock("./studio-vrm-asset-runtime", () => ({
  STUDIO_VRM_BASE_ROTATION_Y_KEY: "studioVrmBaseRotationY",
  disposeStudioVrmAsset: vi.fn(),
  loadStudioVrmAsset,
}));
vi.mock("./vrm-library", () => ({
  getStoredVrmModelByHash,
  selectableSampleVrmUrl,
}));
vi.mock("./studio-vrm-poser-utils", () => ({
  applyBodyScale,
  applyExpressionWeightsToVrm,
  applyFingerRotations,
  applyPoseToVrm,
  applyVrmCustomColors,
  applyVrmMaterialFx,
}));

const {
  applyStudioBg3dLinkedCharacterState,
  loadStudioBg3dLinkedVrm,
} = await import("./studio-bg3d-shared-vrm-runtime");
const { raycastStudioBg3dSharedCharacterGroundSurface } = await import(
  "./StudioBg3dSharedVrmCharacter"
);

function groundPlane(
  entityId: string,
  y: number,
  material: THREE.Material | THREE.Material[],
  materialIndex = 0,
): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(2, 2);
  if (Array.isArray(material)) {
    geometry.clearGroups();
    geometry.addGroup(0, geometry.index?.count ?? 0, materialIndex);
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = entityId;
  mesh.position.y = y;
  mesh.rotation.x = -Math.PI / 2;
  mesh.userData.studioBg3dEntityId = entityId;
  return mesh;
}

describe("Studio BG3D linked VRM runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectableSampleVrmUrl.mockReturnValue("/vrm/sample.vrm");
  });

  it("resolves a rights-admitted bundled model through the shared VRM runtime", async () => {
    const vrm = { scene: new THREE.Group() };
    loadStudioVrmAsset.mockResolvedValue(vrm);

    await expect(loadStudioBg3dLinkedVrm(createStudioVrmSceneDocument())).resolves.toBe(vrm);
    expect(selectableSampleVrmUrl).toHaveBeenCalledWith("sample-vrm");
    expect(loadStudioVrmAsset).toHaveBeenCalledWith("/vrm/sample.vrm");
    expect(getStoredVrmModelByHash).not.toHaveBeenCalled();
  });

  it("resolves an uploaded character by content hash and revokes its temporary URL", async () => {
    const hash = `sha256:${"b".repeat(64)}`;
    const scene = createStudioVrmSceneDocument({
      source: "attachment",
      hash,
      byteSize: 4,
      mime: "model/vrm",
      name: "업로드 캐릭터",
    });
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "model/vrm" });
    const vrm = { scene: new THREE.Group() };
    getStoredVrmModelByHash.mockResolvedValue({ blob });
    loadStudioVrmAsset.mockResolvedValue(vrm);
    const revoke = vi.spyOn(URL, "revokeObjectURL");

    await expect(loadStudioBg3dLinkedVrm(scene)).resolves.toBe(vrm);
    expect(getStoredVrmModelByHash).toHaveBeenCalledWith(hash);
    const runtimeUrl = loadStudioVrmAsset.mock.calls[0]?.[0] as string;
    expect(runtimeUrl).toMatch(/^blob:/u);
    expect(revoke).toHaveBeenCalledWith(runtimeUrl);
    revoke.mockRestore();
  });

  it("applies the canonical subset while internal meshes stay pass-through for the root proxy", () => {
    const scene = normalizeStudioVrmSceneDocument({
      ...createStudioVrmSceneDocument(),
      pose: {
        ...createStudioVrmSceneDocument().pose,
        bodyRotationY: 0.4,
        yOffset: 0.2,
      },
      expressions: { happy: 0.8 },
      appearance: {
        ...createStudioVrmSceneDocument().appearance,
        customColors: { hair: "#112233" },
      },
    });
    const source = createStudioShared3dSceneSession([
      { elementId: "character-a", scene },
    ]).characters[0]!;
    const root = new THREE.Group();
    root.userData.studioVrmBaseRotationY = 0.1;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    root.add(mesh);
    const vrm = {
      scene: root,
      update: vi.fn(),
    } as never;

    expect(applyStudioBg3dLinkedCharacterState(vrm, source)).toBe(true);
    expect(applyPoseToVrm).toHaveBeenCalledWith(
      vrm,
      scene.pose.bones,
      0.2,
      scene.pose.translations,
    );
    expect(applyFingerRotations).toHaveBeenCalledWith(vrm, scene.pose.fingerOverrides);
    expect(applyExpressionWeightsToVrm).toHaveBeenCalledWith(vrm, { happy: 0.8 });
    expect(applyVrmCustomColors).toHaveBeenCalledWith(vrm, { hair: "#112233" });
    expect(root.rotation.y).toBeCloseTo(0.5, 10);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    const intersects: THREE.Intersection[] = [];
    mesh.raycast(new THREE.Raycaster(), intersects);
    expect(intersects).toHaveLength(0);
    expect(mesh.raycast).not.toBe(THREE.Mesh.prototype.raycast);
  });

  it("applies Stage placement last while retaining source pose, expression and model state", () => {
    const scene = normalizeStudioVrmSceneDocument({
      ...createStudioVrmSceneDocument(),
      pose: {
        ...createStudioVrmSceneDocument().pose,
        bodyRotationY: 0.25,
        yOffset: 0.1,
        translations: {
          ...createStudioVrmSceneDocument().pose.translations,
          root: [1, 0, -2],
        },
        bones: { head: { rotation: [0.1, 0.2, 0.3] } },
      },
      expressions: { happy: 0.7 },
    });
    const source = createStudioShared3dSceneSession([{
      elementId: "character-a",
      scene,
      stageId: "stage-a",
      stageTransform: { position: [-4, 1.25, 3], rotationY: -0.75 },
    }]).characters[0]!;
    const root = new THREE.Group();
    root.userData.studioVrmBaseRotationY = 0.1;
    const vrm = { scene: root, update: vi.fn() } as never;

    expect(applyStudioBg3dLinkedCharacterState(vrm, source)).toBe(true);
    expect(applyPoseToVrm).toHaveBeenLastCalledWith(
      vrm,
      scene.pose.bones,
      1.25,
      {
        ...scene.pose.translations,
        root: [-4, 0, 3],
      },
    );
    expect(applyExpressionWeightsToVrm).toHaveBeenLastCalledWith(vrm, { happy: 0.7 });
    expect(root.rotation.y).toBeCloseTo(-0.65, 10);
    expect(scene.pose.translations.root).toEqual([1, 0, -2]);
    expect(scene.pose.yOffset).toBe(0.1);
    expect(scene.pose.bodyRotationY).toBe(0.25);
  });
});

describe("Studio BG3D shared character surface raycast", () => {
  it("skips a hidden single material and selects the next visible surface", () => {
    const scene = new THREE.Scene();
    scene.add(
      groundPlane("hidden-top", 0.1, new THREE.MeshBasicMaterial({ visible: false })),
      groundPlane("visible-floor", -0.05, new THREE.MeshBasicMaterial()),
    );

    expect(
      raycastStudioBg3dSharedCharacterGroundSurface(scene, [0, 0, 0]),
    ).toMatchObject({
      source: "background-surface",
      targetEntityId: "visible-floor",
      point: [0, -0.05, 0],
    });
  });

  it("skips a fully transparent single material and selects the next visible surface", () => {
    const scene = new THREE.Scene();
    scene.add(
      groundPlane(
        "transparent-top",
        0.1,
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }),
      ),
      groundPlane("visible-floor", -0.08, new THREE.MeshBasicMaterial()),
    );

    expect(
      raycastStudioBg3dSharedCharacterGroundSurface(scene, [0, 0, 0]),
    ).toMatchObject({
      source: "background-surface",
      targetEntityId: "visible-floor",
      point: [0, -0.08, 0],
    });
  });

  it("uses face.materialIndex for material arrays before accepting a hit", () => {
    const scene = new THREE.Scene();
    scene.add(
      groundPlane(
        "hidden-array-slot",
        0.1,
        [
          new THREE.MeshBasicMaterial(),
          new THREE.MeshBasicMaterial({ visible: false }),
        ],
        1,
      ),
      groundPlane("visible-floor", -0.1, new THREE.MeshBasicMaterial()),
    );

    expect(
      raycastStudioBg3dSharedCharacterGroundSurface(scene, [0, 0, 0]),
    ).toMatchObject({
      source: "background-surface",
      targetEntityId: "visible-floor",
      point: [0, -0.1, 0],
    });
  });

  it("accepts the visible indexed slot even when another array material is hidden", () => {
    const scene = new THREE.Scene();
    scene.add(
      groundPlane(
        "visible-array-slot",
        0.1,
        [
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }),
          new THREE.MeshBasicMaterial(),
        ],
        1,
      ),
      groundPlane("lower-floor", -0.1, new THREE.MeshBasicMaterial()),
    );

    expect(
      raycastStudioBg3dSharedCharacterGroundSurface(scene, [0, 0, 0]),
    ).toMatchObject({
      source: "background-surface",
      targetEntityId: "visible-array-slot",
      point: [0, 0.1, 0],
    });
  });

  it("continues to reject a surface hidden by an ancestor", () => {
    const scene = new THREE.Scene();
    const hiddenLayer = new THREE.Group();
    hiddenLayer.visible = false;
    hiddenLayer.add(groundPlane("hidden-by-parent", 0.1, new THREE.MeshBasicMaterial()));
    scene.add(
      hiddenLayer,
      groundPlane("visible-floor", -0.06, new THREE.MeshBasicMaterial()),
    );

    expect(
      raycastStudioBg3dSharedCharacterGroundSurface(scene, [0, 0, 0]),
    ).toMatchObject({
      source: "background-surface",
      targetEntityId: "visible-floor",
    });
  });

  it("preserves instanced surface identity resolution", () => {
    const scene = new THREE.Scene();
    const geometry = new THREE.PlaneGeometry(2, 2);
    geometry.rotateX(-Math.PI / 2);
    const surface = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshBasicMaterial(),
      1,
    );
    surface.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0.1, 0));
    surface.userData.studioBg3dResolveInstanceId = (instanceId: number) =>
      `instance-${instanceId}`;
    scene.add(surface);

    const hit = raycastStudioBg3dSharedCharacterGroundSurface(scene, [0, 0, 0]);
    expect(hit).toMatchObject({
      source: "background-surface",
      targetEntityId: "instance-0",
    });
    expect(hit.point[1]).toBeCloseTo(0.1, 7);
  });
});
