import { Bone, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Scene, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";

import { classifyMeshName } from "../../vrm/studio-vrm-costume";
import { buildStudioVrmComponentCapturePlan } from "../../vrm/studio-vrm-component-pass-plan";
import { executeCharacterAuthoringTask } from "../runtime/character-authoring-worker-runtime";
import { characterSurfaceObjectPath, characterSurfaceTopologyRevision } from "../surface-ink/character-surface-ink-three-mesh";
import { createEmptyCharacterGroomDocument } from "./character-groom-document";
import { addCharacterGroomGroup } from "./character-groom-edit";
import { CharacterGroomThreeRuntime } from "./character-groom-three-runtime";

import type { CharacterGroomDocument, CharacterGroomSurfaceAnchor } from "./character-groom-document";
import type { CharacterGroomTaskExecutor } from "./character-groom-three-runtime";

const execute: CharacterGroomTaskExecutor = async (task) => executeCharacterAuthoringTask(task);

function fixture(skinned = false) {
  const scene = new Scene();
  scene.name = "character";
  const head = new Group();
  head.name = "head";
  scene.add(head);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setAttribute("normal", new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.morphAttributes.position = [new Float32BufferAttribute([0, 0, 1, 1, 0, 1, 0, 1, 1], 3)];
  const scalp = skinned ? new SkinnedMesh(geometry, new MeshStandardMaterial()) : new Mesh(geometry, new MeshStandardMaterial());
  scalp.name = "scalp";
  scene.add(scalp);
  const bone = new Bone();
  if (scalp instanceof SkinnedMesh) {
    geometry.setAttribute("skinIndex", new Uint16BufferAttribute(new Uint16Array(12), 4));
    geometry.setAttribute("skinWeight", new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    scalp.add(bone);
    scalp.bind(new Skeleton([bone]));
  }
  scalp.updateMorphTargets();
  scene.updateMatrixWorld(true);
  const anchor: CharacterGroomSurfaceAnchor = {
    meshAssetId: characterSurfaceObjectPath(scalp), topologyRevision: characterSurfaceTopologyRevision("model:test", scalp),
    primitiveIndex: 0, triangleIndex: 0, barycentric: [0.5, 0.25, 0.25], localNormal: [0, 0, 1],
  };
  const initial = addCharacterGroomGroup(createEmptyCharacterGroomDocument("topology:test"), "두피 헤어");
  const document: CharacterGroomDocument = {
    ...initial, groups: initial.groups.map((group) => ({
      ...group, scalpRegionId: "scalp:front", guides: group.guides.map((guide) => ({
        ...guide, points: guide.points.map((point, index) => index === 0 ? { ...point, surfaceAnchor: anchor } : point),
      })),
    })),
  };
  const options = { surface: { scene, modelKey: "model:test" } };
  const runtime = new CharacterGroomThreeRuntime(head, () => undefined, execute);
  const mesh = () => {
    const value = head.children[0]?.children[0];
    if (!(value instanceof Mesh)) throw new Error("헤어 메시가 없습니다.");
    return value;
  };
  const rootPosition = () => {
    scene.updateMatrixWorld(true);
    if (scalp instanceof SkinnedMesh) scalp.skeleton.update();
    const value = mesh();
    return value.getVertexPosition(0, new Vector3()).add(value.getVertexPosition(1, new Vector3()))
      .multiplyScalar(0.5).applyMatrix4(value.matrixWorld);
  };
  return { scene, head, scalp, bone, document, options, runtime, mesh, rootPosition };
}

describe("두피 표면 앵커 groom", () => {
  it("확인된 삼각형에 실제 메시를 부착하고 포즈·장면 이동·표정 morph를 따른다", async () => {
    const f = fixture(true);
    const original = JSON.stringify(f.document);
    const result = await f.runtime.update(f.document, "topology:test", "#332211", f.options);
    expect(result).toMatchObject({ guideCount: 1, skippedGuideCount: 0, attachedGuideIds: ["groom:guide:1"] });
    expect(f.mesh()).toBeInstanceOf(SkinnedMesh);
    const attached = f.rootPosition();
    expect(attached.x).toBeCloseTo(0.25, 6);
    expect(attached.y).toBeCloseTo(0.25, 6);
    expect(attached.z).toBeCloseTo(0, 6);
    f.bone.position.x = 0.4;
    f.scalp.position.y = 0.3;
    if (!f.scalp.morphTargetInfluences) throw new Error("morph가 없습니다.");
    f.scalp.morphTargetInfluences[0] = 1;
    const transformed = f.rootPosition();
    expect(transformed.x).toBeCloseTo(0.65);
    expect(transformed.y).toBeCloseTo(0.55);
    expect(transformed.z).toBeCloseTo(1);
    f.scalp.morphTargetInfluences[0] = 0;
    expect(f.rootPosition().z).toBeCloseTo(0);
    expect(JSON.stringify(f.document)).toBe(original);
    const dispose = vi.spyOn(f.mesh().geometry, "dispose");
    f.runtime.dispose();
    expect(dispose).toHaveBeenCalledOnce();
    expect(f.head.children).toHaveLength(0);
  });

  it("토폴로지가 바뀌면 보류 이유를 표시하고 원본을 보존하며 같은 원본 복원 후 다시 부착한다", async () => {
    const f = fixture();
    const original = JSON.stringify(f.document);
    const originalGeometry = f.scalp.geometry;
    f.scalp.geometry = originalGeometry.clone();
    f.scalp.geometry.getAttribute("position").setXYZ(0, 0.1, 0, 0);
    f.scalp.geometry.getAttribute("position").needsUpdate = true;
    const failed = await f.runtime.update(f.document, "topology:test", "#332211", f.options);
    expect(failed.skippedGuideCount).toBe(1);
    expect(failed.notices?.join(" ")).toContain("토폴로지");
    expect(f.head.children[0]?.children).toHaveLength(0);
    f.scalp.geometry = originalGeometry;
    const restored = { ...f.document, groups: f.document.groups.map((group) => ({ ...group, guides: group.guides.map((guide) => ({ ...guide, status: "needs-reprojection" as const })) })) };
    expect((await f.runtime.update(restored, "topology:test", "#332211", f.options)).guideCount).toBe(1);
    expect(JSON.stringify(f.document)).toBe(original);
    f.runtime.dispose();
  });

  it.each(["primitive", "multiple", "ambiguous"])("확인할 수 없는 %s 앵커는 다른 표면에 붙이지 않는다", async (mode) => {
    const f = fixture();
    const guide = f.document.groups[0]?.guides[0];
    const anchor = guide?.points[0]?.surfaceAnchor;
    if (!anchor) throw new Error("앵커가 없습니다.");
    if (mode === "ambiguous") {
      const duplicate = f.scalp.clone(); duplicate.name = f.scalp.name; f.scene.add(duplicate);
    }
    const document = { ...f.document, groups: f.document.groups.map((group) => ({ ...group, guides: group.guides.map((entry) => ({ ...entry,
      points: entry.points.map((point, index) => mode === "primitive" && index === 0 ? { ...point, surfaceAnchor: { ...anchor, primitiveIndex: 1 } }
        : mode === "multiple" && index === 1 ? { ...point, surfaceAnchor: anchor } : point),
    })) })) };
    expect((await f.runtime.update(document, "topology:test", "#332211", f.options)).skippedGuideCount).toBe(1);
    expect(f.head.children[0]?.children).toHaveLength(0);
    f.runtime.dispose();
  });

  it("표시 중 두피가 교체되면 이전 메시를 숨기고 보류를 한 번 알리며 원본 재생으로 복구한다", async () => {
    const f = fixture();
    const onSurfaceInvalidated = vi.fn();
    await f.runtime.update(f.document, "topology:test", "#332211", { ...f.options, onSurfaceInvalidated });
    const old = f.mesh();
    f.scene.remove(f.scalp);
    f.scene.updateMatrixWorld(true);
    f.scene.updateMatrixWorld(true);
    expect(old.visible).toBe(false);
    expect(onSurfaceInvalidated).toHaveBeenCalledExactlyOnceWith("groom:guide:1", expect.stringContaining("토폴로지"));
    f.scene.add(f.scalp);
    expect((await f.runtime.update(f.document, "topology:test", "#332211", f.options)).guideCount).toBe(1);
    expect(f.mesh().visible).toBe(true);
    f.runtime.dispose();
  });

  it("지연 Worker가 끝나기 전에 바뀐 두피를 이전 좌표로 덮어쓰지 않는다", async () => {
    const f = fixture();
    f.runtime.dispose();
    let release: (() => void) | undefined;
    const delayed: CharacterGroomTaskExecutor = (task) => new Promise((resolve) => {
      release = () => resolve(executeCharacterAuthoringTask(task));
    });
    const runtime = new CharacterGroomThreeRuntime(f.head, () => undefined, delayed);
    const pending = runtime.update(f.document, "topology:test", "#332211", f.options);
    const position = f.scalp.geometry.getAttribute("position");
    position.setXYZ(0, 0.1, 0, 0); position.needsUpdate = true;
    release?.();
    const result = await pending;
    expect(result.guideCount).toBe(0);
    expect(result.skippedGuideCount).toBe(1);
    expect(result.notices?.join(" ")).toContain("생성하는 동안");
    expect(f.head.children[0]?.children).toHaveLength(0);
    runtime.dispose();
  });

  it("PNG 장면에 포함하고 PSD Hair 분류와 재질 override·undo를 보존한다", async () => {
    const f = fixture();
    await f.runtime.update(f.document, "topology:test", "#332211", { ...f.options,
      materialOverrides: [{ materialId: "material:hair", baseColor: "#ff000080", opacity: 0.5 }],
    });
    const mesh = f.mesh();
    const material = mesh.material;
    if (!(material instanceof MeshStandardMaterial)) throw new Error("헤어 재질이 없습니다.");
    expect(material.color.getHexString()).toBe("ff0000");
    expect(material.opacity).toBeCloseTo(0.5 * 128 / 255);
    expect(f.scene.getObjectById(mesh.id)).toBe(mesh);
    expect(classifyMeshName(mesh.name).protected).toBe("hair");
    expect(classifyMeshName(material.name).protected).toBe("hair");
    const capture = buildStudioVrmComponentCapturePlan([{ objectId: "groom:mesh", objectName: mesh.name,
      objectUserData: mesh.userData, materialUserData: material.userData,
    }]);
    expect(capture.classifications[0]).toMatchObject({ component: "hair", confidence: "explicit" });
    await f.runtime.update(f.document, "topology:test", "#332211", f.options);
    const reset = f.mesh().material;
    if (!(reset instanceof MeshStandardMaterial)) throw new Error("헤어 재질이 없습니다.");
    expect(reset.color.getHexString()).toBe("332211");
    expect(reset.opacity).toBe(1);
    await f.runtime.update(createEmptyCharacterGroomDocument("topology:test"), "topology:test", "#332211", f.options);
    expect(f.head.children[0]?.children).toHaveLength(0);
    f.runtime.dispose();
  });
});
