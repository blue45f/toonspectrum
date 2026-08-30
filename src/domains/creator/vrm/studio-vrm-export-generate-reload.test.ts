import { VRMLoaderPlugin, type VRM, type VRMHumanBoneName } from "@pixiv/three-vrm";
import { Vector3, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import {
  AVATAR_FORGE_PRESETS,
  createAvatarForgeState,
  sanitizeAvatarForgeState,
} from "./studio-vrm-avatar-forge";
import { STUDIO_VRM_EXPORT_REQUIRED_BONES } from "./studio-vrm-export-vrm-extension";
import {
  buildStudioVrmGenerateAuthoringSnapshot,
  createStudioVrmGenerateRecipe,
  exportStudioVrmFromGenerateRecipe,
} from "./studio-vrm-generate-recipe";
import { buildStudioVrmHumanoidMesh } from "./studio-vrm-humanoid-mesh";
import { countSpringBoneJoints } from "./studio-vrm-physics";
import { NEUTRAL_STUDIO_VRM_PROPORTIONS } from "./studio-vrm-proportion-core";
import { createStudioVrmProportionRigRuntime } from "./studio-vrm-proportion-rig-runtime";
import {
  createStudioVrmProportionVrmAdapter,
  measureStudioVrmProportionHeadLength,
} from "./studio-vrm-proportion-vrm-adapter";

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

  it.each([1, 1.5, 2.5])(
    "lands every hair joint on its intended rest position at headBodyRatio %s",
    async (headBodyRatio) => {
      // `head` 노드에는 조형 스케일이 붙어 있다. 체인을 그 밑에 바로 달면 조인트의 로컬
      // 이동에 그 스케일이 곱해져 rest 위치가 어긋난다 — 두신비 1.5 에서 28cm,
      // 2.5(SD)에서 81cm 어긋나 머리카락이 캐릭터에서 통째로 이탈했다.
      const base = createAvatarForgeState("hime-noble");
      const state = sanitizeAvatarForgeState({
        ...base,
        proportions: { ...base.proportions, headBodyRatio },
        face: { ...base.face, headWidth: 1.3 },
      });
      const mesh = buildStudioVrmHumanoidMesh(state);
      const hairRig = mesh.hairRig;
      if (!hairRig) throw new Error("expected a hair rig");

      const vrm = await loadVrmBytes(
        exportStudioVrmFromGenerateRecipe(createStudioVrmGenerateRecipe({ state })),
      );
      vrm.scene.updateMatrixWorld(true);
      const nodeByName = new Map<string, Object3D>();
      vrm.scene.traverse((object) => nodeByName.set(object.name, object));

      for (const joint of hairRig.joints) {
        const node = nodeByName.get(joint.name);
        expect(node, `${joint.name} 노드가 없다`).toBeDefined();
        const actual = node!.getWorldPosition(new Vector3());
        expect(
          actual.distanceTo(new Vector3(...joint.worldRest)),
          `${joint.name} 이 의도한 rest 위치에서 벗어났다`,
        ).toBeLessThan(1e-4);
      }
    },
    60_000,
  );

  it("hangs the hair chains under a scale-cancelling pivot, not the scaled head node", async () => {
    // 스케일이 붙은 본 아래에서 회전하면 전단·이방성 신축이 생긴다(리그의 "스케일이 붙은
    // 본은 말단" 불변식). 배포 프리셋 21개 중 18개가 비균등 머리 스케일을 쓴다.
    // 피벗이 S⁻¹ 이므로 `S · T(t) · S⁻¹ = T(S·t)` 로 아래쪽 선형부가 항등이 된다.
    const state = createAvatarForgeState("hime-noble");
    const snapshot = buildStudioVrmGenerateAuthoringSnapshot(
      createStudioVrmGenerateRecipe({ state }),
    );
    const nodes = snapshot.nodes ?? [];
    const headIndex = nodes.findIndex((node) => node.name === "head");
    const headScale = nodes[headIndex]?.scale ?? [1, 1, 1];
    const headChildren = nodes[headIndex]?.children ?? [];

    const pivotIndex = headChildren.find((child) => nodes[child]?.name === "HairRoot");
    expect(pivotIndex, "head 아래에 HairRoot 피벗이 없다").toBeDefined();
    const pivot = nodes[pivotIndex as number];
    // 피벗은 머리 스케일을 정확히 되돌린다.
    for (let axis = 0; axis < 3; axis += 1) {
      expect((pivot.scale ?? [1, 1, 1])[axis] * headScale[axis]).toBeCloseTo(1, 10);
    }
    // 스프링 조인트는 전부 피벗 아래에만 있다 — head 의 직계 자식이면 안 된다.
    const jointNodes = new Set(
      (snapshot.springBone?.springs ?? []).flatMap((spring) =>
        spring.joints.map((joint) => joint.node),
      ),
    );
    for (const child of headChildren) {
      expect(jointNodes.has(child), `노드 ${child} 가 head 직계 자식인데 스프링 조인트다`).toBe(
        false,
      );
    }
    expect(jointNodes.size).toBeGreaterThan(0);
  });

  it.each(["natural-short", "hime-noble", "wolf-rebel"])(
    "keeps %s's dynamic bangs from swinging deeper than they rest",
    async (presetId) => {
      // 앞머리·옆머리가 스프링 체인이 되면서, 몸통 콜라이더만으로는 고개를 흔들 때 머리카락이
      // 얼굴을 그대로 통과한다. 예전처럼 `head` 에 강체로 묶여 있을 때는 불가능한 일이었다.
      //
      // 기준은 **정지 상태의 깊이**다. 앞머리는 눌린 이마에 붙도록 저작되므로 원 타원체
      // 기준으로는 이미 0.75 쯤에 있다(1.0 이 타원체 표면). 콜라이더가 할 일은 그 자리에서
      // 머리카락을 끌어내는 것이 아니라 **그보다 더 파고드는 것만** 막는 것이다.
      const mesh = buildStudioVrmHumanoidMesh(createAvatarForgeState(presetId));
      const vrm = await loadVrmBytes(
        exportStudioVrmFromGenerateRecipe(createStudioVrmGenerateRecipe({ presetId })),
      );
      const head = vrm.humanoid?.getNormalizedBoneNode("head");
      const joints = [...(vrm.springBoneManager?.joints ?? [])];
      if (!head || joints.length === 0) throw new Error(`${presetId}: expected a spring rig`);

      // 콜라이더와 같은 프레임에서 잰다 — 헤어 피벗은 월드 스케일이 1 이고 머리 회전을 따라간다.
      let pivot: Object3D | null = null;
      vrm.scene.traverse((object) => {
        if (object.name === "HairRoot") pivot = object;
      });
      if (!pivot) throw new Error(`${presetId}: expected a HairRoot pivot`);
      const anchored = pivot as Object3D;

      const scale = mesh.rig.nodeScale.head ?? [1, 1, 1];
      const joint = mesh.rig.worldRest.head;
      const center = [0, 1, 2].map(
        (axis) => (mesh.rig.head.center[axis] - joint[axis]) * scale[axis],
      );
      const radii = [
        mesh.rig.head.radiusX * scale[0],
        mesh.rig.head.radiusY * scale[1],
        mesh.rig.head.radiusZ * scale[2],
      ];
      const skullDistance = (bone: Object3D): number => {
        const point = anchored.worldToLocal(bone.getWorldPosition(new Vector3()));
        return Math.hypot(
          (point.x - center[0]) / radii[0],
          (point.y - center[1]) / radii[1],
          (point.z - center[2]) / radii[2],
        );
      };

      vrm.scene.updateMatrixWorld(true);
      let rest = Infinity;
      for (const spring of joints) rest = Math.min(rest, skullDistance(spring.bone));

      let deepest = Infinity;
      for (let step = 0; step < 180; step += 1) {
        head.rotation.y = Math.sin(step / 8) * 1.1;
        head.rotation.x = Math.sin(step / 11) * 0.5;
        vrm.scene.updateMatrixWorld(true);
        vrm.update(1 / 60);
        if (step < 60) continue;
        for (const spring of joints) deepest = Math.min(deepest, skullDistance(spring.bone));
      }
      // 콜라이더를 떼면 −0.19 아래까지 가라앉는다. 0.14 는 그 절반보다도 빡빡한 문턱이다.
      expect(deepest - rest, `${presetId}: 머리카락이 정지 상태보다 깊이 파고들었다`).toBeGreaterThan(
        -0.14,
      );
    },
    60_000,
  );

  it.each(AVATAR_FORGE_PRESETS.map((preset) => preset.id))(
    "leaves %s's hair at rest when the head never moves",
    async (presetId) => {
      // 콜라이더가 정지 헤어를 뚫고 있으면, 고개를 전혀 움직이지 않아도 첫 프레임부터 스프링
      // 해석이 머리카락을 바깥으로 밀어낸다. 예전에는 앞머리가 4.5cm 앞으로 튀어나갔다 —
      // 두개골 캡슐을 눌리지 않은 원 타원체에서 뽑았고(렌더링된 이마는 0.87배로 눌린다),
      // 몸통 캡슐의 위쪽 반구가 반경만큼 어깨 위로 솟아 목덜미를 삼켰기 때문이다.
      const vrm = await loadVrmBytes(
        exportStudioVrmFromGenerateRecipe(createStudioVrmGenerateRecipe({ presetId })),
      );
      const joints = [...(vrm.springBoneManager?.joints ?? [])];
      if (joints.length === 0) return;
      const head = vrm.humanoid?.getNormalizedBoneNode("head");
      if (!head) throw new Error(`${presetId}: expected a head bone`);
      vrm.scene.updateMatrixWorld(true);
      const skull = head.getWorldPosition(new Vector3());
      const rest = joints.map((spring) => spring.bone.getWorldPosition(new Vector3()).clone());

      for (let step = 0; step < 200; step += 1) vrm.update(1 / 60);
      vrm.scene.updateMatrixWorld(true);

      let pushed = 0;
      let worst = "";
      joints.forEach((spring, index) => {
        const now = spring.bone.getWorldPosition(new Vector3());
        // 머리 관절에서 바깥으로 향하는 성분만 본다. 아래로 처지는 것은 중력이고 정상이다.
        const outward = now.sub(rest[index]).dot(rest[index].clone().sub(skull).normalize());
        if (outward > pushed) {
          pushed = outward;
          worst = spring.bone.name;
        }
      });
      expect(pushed, `${presetId}: ${worst} 가 정지 상태에서 밀려났다`).toBeLessThan(0.012);
    },
    60_000,
  );

  it("assigns both the torso and skull collider groups to every hair spring", () => {
    const snapshot = buildStudioVrmGenerateAuthoringSnapshot(
      createStudioVrmGenerateRecipe({ presetId: "hime-noble" }),
    );
    const groups = snapshot.springBone?.colliderGroups ?? [];
    expect(groups.map((group) => group.name)).toEqual(["Torso", "Skull"]);
    // 두개골은 캡슐 두 개의 합집합이다 — 하나로는 가로 두 축 중 작은 쪽밖에 못 감싼다.
    expect(groups[1]?.colliders).toEqual([1, 2]);
    const springs = snapshot.springBone?.springs ?? [];
    expect(springs.length).toBeGreaterThan(0);
    for (const spring of springs) {
      expect(spring.colliderGroups, spring.name).toEqual([0, 1]);
    }
  });
  it("keeps the torso capsule's outer extent between the hips and the shoulders", () => {
    // 캡슐의 겉면은 끝점에서 반경만큼 더 뻗는다. 끝점을 어깨 높이에 그대로 두면 겉면이
    // 어깨보다 반경(12cm)만큼 위로 솟아 목과 목덜미를 통째로 감쌌다.
    const recipe = createStudioVrmGenerateRecipe({ presetId: "action-pony" });
    const snapshot = buildStudioVrmGenerateAuthoringSnapshot(recipe);
    const rig = buildStudioVrmHumanoidMesh(recipe.state).rig;
    const torso = (snapshot.springBone?.colliders ?? [])[0];
    if (!torso || torso.shape !== "capsule" || !torso.tail) throw new Error("expected a torso capsule");
    const spineY = rig.worldRest.spine[1];
    const bottom = spineY + torso.offset[1] - torso.radius;
    const top = spineY + torso.tail[1] + torso.radius;
    expect(bottom).toBeGreaterThan(rig.worldRest.hips[1] - 0.05);
    expect(top).toBeLessThan(rig.worldRest.leftUpperArm[1] + 0.001);
  });

  it("keeps every skull collider inside the hair it has to protect", () => {
    // 콜라이더는 정지 헤어에 **내접**해야 한다. 그러지 않으면 rest 가 평형이 아니다.
    for (const presetId of ["natural-short", "hime-noble", "pixie-sport"]) {
      const recipe = createStudioVrmGenerateRecipe({ presetId });
      const snapshot = buildStudioVrmGenerateAuthoringSnapshot(recipe);
      const mesh = buildStudioVrmHumanoidMesh(recipe.state);
      const scale = mesh.rig.nodeScale.head ?? [1, 1, 1];
      // 두개골 캡슐 반경은 조형된 타원체의 가장 작은 가로 반경보다 확실히 작아야 한다.
      const smallest = Math.min(mesh.rig.head.radiusX * scale[0], mesh.rig.head.radiusZ * scale[2]);
      const skull = (snapshot.springBone?.colliders ?? []).slice(1);
      expect(skull.length, presetId).toBe(2);
      for (const collider of skull) {
        expect(collider.radius, `${presetId}: 두개골 콜라이더가 줄지 않았다`).toBeLessThan(smallest);
      }
    }
  });

  it.each(AVATAR_FORGE_PRESETS.map((preset) => preset.id))(
    "lets the studio's body sliders drive %s",
    async (presetId) => {
      // The face sculpt rides on the `head` node as a non-uniform scale. The proportion runtime
      // used to demand a uniform scale on every frame from the root to each bone, so generating a
      // character with any face proportion other than 1 made every body slider fail outright --
      // 18 of the 21 shipped presets. `head` carries no humanoid bone beneath it, which is exactly
      // what licenses the sculpt to live there.
      const vrm = await loadVrmBytes(
        exportStudioVrmFromGenerateRecipe(createStudioVrmGenerateRecipe({ presetId })),
      );
      const headLength = measureStudioVrmProportionHeadLength(vrm)?.value ?? 0.2;
      const adapter = createStudioVrmProportionVrmAdapter({
        vrm,
        getCurrentModelGeneration: () => 1,
        reapplyAuthoredPose: () => true,
      });
      const created = createStudioVrmProportionRigRuntime(adapter, { headLength });
      expect(created.ok, `${presetId}: 체형 런타임이 생성 캐릭터를 거부했다`).toBe(true);
      if (!created.ok) return;

      const head = vrm.humanoid?.getRawBoneNode("head");
      if (!head) throw new Error(`${presetId}: expected a head bone`);
      const authored = head.scale.clone();
      const applied = created.runtime.apply({
        ...NEUTRAL_STUDIO_VRM_PROPORTIONS,
        overallHeight: 1.6,
      });
      expect(applied.ok, `${presetId}: 체형 적용이 실패했다`).toBe(true);

      // The sculpt survives, multiplied by exactly the uniform body scale.
      expect(head.scale.x).toBeCloseTo(authored.x * 1.6, 9);
      expect(head.scale.y).toBeCloseTo(authored.y * 1.6, 9);
      expect(head.scale.z).toBeCloseTo(authored.z * 1.6, 9);
    },
    60_000,
  );

  it("keeps the torso capsule on the torso after the body is resized", async () => {
    // Collider shapes live in their node's local space and `setInitState()` never touches them, so
    // before this the capsule kept its authored size while the body grew around it: at
    // `overallHeight` 1.6 its top ended 17cm below the shoulders it was authored to reach.
    const presetId = "hime-noble";
    const spans: number[] = [];
    for (const overallHeight of [1, 1.6]) {
      const vrm = await loadVrmBytes(
        exportStudioVrmFromGenerateRecipe(createStudioVrmGenerateRecipe({ presetId })),
      );
      const headLength = measureStudioVrmProportionHeadLength(vrm)?.value ?? 0.2;
      const adapter = createStudioVrmProportionVrmAdapter({
        vrm,
        getCurrentModelGeneration: () => 1,
        reapplyAuthoredPose: () => true,
      });
      const created = createStudioVrmProportionRigRuntime(adapter, { headLength });
      if (!created.ok) throw new Error(`${presetId}: ${created.message}`);
      expect(created.runtime.apply({ ...NEUTRAL_STUDIO_VRM_PROPORTIONS, overallHeight }).ok).toBe(
        true,
      );
      vrm.scene.updateMatrixWorld(true);

      const hips = vrm.humanoid?.getRawBoneNode("hips")?.getWorldPosition(new Vector3());
      const shoulder = vrm.humanoid
        ?.getRawBoneNode("leftUpperArm")
        ?.getWorldPosition(new Vector3());
      const torso = [...(vrm.springBoneManager?.colliders ?? [])][0];
      if (!hips || !shoulder || !torso) throw new Error(`${presetId}: expected a torso capsule`);
      const shape = (torso as unknown as {
        shape: { offset: Vector3; tail?: Vector3; radius: number };
      }).shape;
      torso.updateWorldMatrix(true, false);
      const a = shape.offset.clone().applyMatrix4(torso.matrixWorld);
      const b = (shape.tail ?? shape.offset).clone().applyMatrix4(torso.matrixWorld);
      const bottom = Math.min(a.y, b.y) - shape.radius;
      const top = Math.max(a.y, b.y) + shape.radius;
      // The capsule's outer extent must sit on the torso, not float above or below it.
      expect(Math.abs(bottom - hips.y), `overallHeight ${overallHeight}: 캡슐 아래가 엉덩이를 벗어났다`).toBeLessThan(
        0.04 * overallHeight,
      );
      expect(Math.abs(top - shoulder.y), `overallHeight ${overallHeight}: 캡슐 위가 어깨를 벗어났다`).toBeLessThan(
        0.04 * overallHeight,
      );
      spans.push(top - bottom);
    }
    // And the span tracks the body rather than staying frozen at its authored size.
    expect(spans[1] / spans[0]).toBeCloseTo(1.6, 3);
  }, 60_000);
});
