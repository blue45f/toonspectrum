import { VRMLoaderPlugin, type VRM, type VRMHumanBoneName } from "@pixiv/three-vrm";
import { Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import { createAvatarForgeState } from "./studio-vrm-avatar-forge";
import { STUDIO_VRM_EXPORT_REQUIRED_BONES } from "./studio-vrm-export-vrm-extension";
import {
  buildStudioVrmGenerateAuthoringSnapshot,
  createStudioVrmGenerateRecipe,
  exportStudioVrmFromGenerateRecipe,
} from "./studio-vrm-generate-recipe";
import { countSpringBoneJoints } from "./studio-vrm-physics";

(globalThis as unknown as { self: typeof globalThis }).self = globalThis;

async function loadVrmBytes(bytes: Uint8Array<ArrayBuffer>): Promise<VRM> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await new Promise<{ userData: { vrm: VRM } }>((resolve, reject) => {
    loader.parse(bytes.slice().buffer as ArrayBuffer, "", resolve as never, reject);
  });
  return gltf.userData.vrm;
}

/**
 * 사용자 경로 전체를 고정한다: 조형 패널의 레시피 → 실제 .vrm 바이너리 →
 * three-vrm 로더 재적재. 내보낸 파일은 스튜디오에서 즉시 캐릭터로 쓰일 수 있어야 한다.
 */
describe("generate recipe → .vrm file reload", () => {
  it("produces a loadable VRM with a complete humanoid and meta for the default and custom states", async () => {
    const recipes = [
      createStudioVrmGenerateRecipe({ presetId: null }),
      createStudioVrmGenerateRecipe({ state: createAvatarForgeState() }),
    ];
    for (const recipe of recipes) {
      const bytes = exportStudioVrmFromGenerateRecipe(recipe);
      expect(bytes.byteLength).toBeGreaterThan(1024);

      // glTF 컨테이너 헤더 + 확장 선언을 먼저 확인한다.
      const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
      expect(magic).toBe("glTF");

      const vrm = await loadVrmBytes(bytes);
      expect(vrm.humanoid).toBeDefined();
      for (const boneName of STUDIO_VRM_EXPORT_REQUIRED_BONES) {
        expect(
          vrm.humanoid?.getNormalizedBoneNode(boneName as VRMHumanBoneName),
          `${recipe.label}: ${boneName} 누락`,
        ).not.toBeNull();
      }
      const meta = vrm.meta as { authors?: readonly string[]; title?: string };
      expect(meta.authors?.length ?? 0).toBeGreaterThan(0);
    }
  }, 60_000);

  it("keeps distinct body parameters distinguishable after reload", async () => {
    const base = exportStudioVrmFromGenerateRecipe(
      createStudioVrmGenerateRecipe({ presetId: null }),
    );
    const modifiedState = {
      ...createAvatarForgeState(),
      proportions: {
        ...createAvatarForgeState().proportions,
        torsoLength: 1.35,
        legLength: 0.75,
      },
    };
    const modified = exportStudioVrmFromGenerateRecipe(
      createStudioVrmGenerateRecipe({ state: modifiedState }),
    );

    // 다른 체형 파라미터는 서로 다른 바이너리여야 하고(프리셋 충돌 금지),
    // 둘 다 재적재 시 유효한 휴머노이드를 유지해야 한다.
    expect(Buffer.from(modified).equals(Buffer.from(base))).toBe(false);

    const reloaded = await loadVrmBytes(modified);
    expect(reloaded.humanoid?.getNormalizedBoneNode("hips")).not.toBeNull();
  }, 60_000);

  it.each(["hime-noble", "braid-scholar"])(
    "gives %s a spring chain the studio's physics runtime can actually drive",
    async (presetId) => {
    // 헤어가 전 정점 `head` 100% 였을 때는 고개를 돌리면 긴 머리가 강체로 휩쓸렸고,
    // 리그에 헤어 조인트가 없어 스프링본이 물릴 곳도 없었다(생성 캐릭터의 스프링 조인트 0개).
    // `braid-scholar` 는 땋은 머리가 `sphere` 세그먼트 열이라, 가닥만 리그하던 시절에는
    // 본체 전체가 리그 밖이었다.
    const vrm = await loadVrmBytes(
      exportStudioVrmFromGenerateRecipe(createStudioVrmGenerateRecipe({ presetId })),
    );
    expect(countSpringBoneJoints(vrm as never)).toBeGreaterThan(0);

    // 스프링이 실제로 움직이는지 — 머리를 돌린 뒤 고정 dt 로 돌리면 마디들이 따라와야 한다.
    const head = vrm.humanoid?.getNormalizedBoneNode("head");
    if (!head) throw new Error("expected a head bone");
    const joints = [...(vrm.springBoneManager?.joints ?? [])];
    expect(joints.length).toBeGreaterThan(0);

    vrm.scene.updateMatrixWorld(true);
    const before = joints.map((joint) => joint.bone.getWorldPosition(new Vector3()).clone());
    head.rotation.y = 0.9;
    head.rotation.x = 0.35;
    vrm.scene.updateMatrixWorld(true);
    for (let step = 0; step < 60; step += 1) vrm.update(1 / 60);
    const moved = joints.filter(
      (joint, index) => joint.bone.getWorldPosition(new Vector3()).distanceTo(before[index]) > 0.005,
    );
    // 일부만 움직이면 어딘가가 아직 `head` 에 강체로 붙어 있다는 뜻이다.
    expect(moved.length).toBe(joints.length);

    // 몸통 콜라이더가 없으면 흔들리는 머리카락이 등을 그대로 통과한다. 시뮬레이션이 끝난 뒤
    // 어느 마디도 몸통 캡슐 안에 들어가 있으면 안 된다.
    const capsule = vrm.springBoneManager?.colliders ?? [];
    expect(capsule.length).toBeGreaterThan(0);
    const spine = vrm.humanoid?.getRawBoneNode("spine");
    if (!spine) throw new Error("expected a spine bone");
    const spineWorld = spine.getWorldPosition(new Vector3());
    const shape = (capsule[0] as unknown as {
      shape: { offset: Vector3; tail: Vector3; radius: number };
    }).shape;
    const bottom = shape.offset.clone().add(spineWorld);
    const top = shape.tail.clone().add(spineWorld);
    const axis = top.clone().sub(bottom);
    for (const joint of joints) {
      const point = joint.bone.getWorldPosition(new Vector3());
      const t = Math.max(0, Math.min(1, point.clone().sub(bottom).dot(axis) / axis.lengthSq()));
      const closest = bottom.clone().addScaledVector(axis, t);
      // 콜라이더는 마디의 중심을 반지름 + hitRadius 밖으로 밀어낸다. 수치 오차만 허용한다.
      expect(point.distanceTo(closest)).toBeGreaterThan(shape.radius * 0.98);
    }
    },
    60_000,
  );

  it("keeps every shipped preset's skin joints and inverse bind matrices in step", async () => {
    // 헤어 조인트를 스킨에 이어 붙이면서 IBM 을 같이 늘리지 않으면 로더가 조용히
    // 어긋난 바인드를 쓴다 — 머리카락이 원점으로 날아간다.
    for (const presetId of ["hime-noble", "wave-diva", "natural-short"]) {
      const snapshot = buildStudioVrmGenerateAuthoringSnapshot(
        createStudioVrmGenerateRecipe({ presetId }),
      );
      const skin = snapshot.skins?.[0];
      expect(skin, presetId).toBeDefined();
      expect(skin?.joints.length, presetId).toBe((skin?.inverseBindMatrices?.length ?? 0) / 16);

      const vrm = await loadVrmBytes(
        exportStudioVrmFromGenerateRecipe(createStudioVrmGenerateRecipe({ presetId })),
      );
      expect(vrm.humanoid?.getNormalizedBoneNode("head"), presetId).not.toBeNull();
    }
  }, 60_000);
});
