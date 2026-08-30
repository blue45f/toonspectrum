import { describe, expect, it } from "vitest";

import {
  AVATAR_FORGE_PRESETS,
  createAvatarForgeState,
  type AvatarForgeState,
} from "./studio-vrm-avatar-forge";
import { classifyMeshName } from "./studio-vrm-costume";
import { STUDIO_VRM_EXPORT_EXPRESSION_PRESETS } from "./studio-vrm-export-vrm-extension";
import {
  buildStudioVrmHumanoidMesh,
  STUDIO_VRM_HUMANOID_MORPH_TARGET_NAMES,
  type StudioVrmHumanoidMeshPart,
} from "./studio-vrm-humanoid-mesh";
import {
  buildStudioVrmRig,
  STUDIO_VRM_RIG_PARENTS,
  studioVrmRigInverseBindMatrices,
  studioVrmRigStandingHeight,
  type StudioVrmRigBone,
} from "./studio-vrm-humanoid-rig";

const NEUTRAL = createAvatarForgeState();
/**
 * 조형 상태의 기본 헤어는 `none` 이다 — 오버레이가 "원본 머리를 그대로 둔다"는 뜻으로 쓰는
 * 값이라 그대로 두는 게 맞다. 생성 캐릭터에 머리가 붙는지 보려면 프리셋 상태를 써야 한다.
 */
const HAIRED = createAvatarForgeState("romance-long");

function numbers(source: readonly number[] | Float32Array | Float64Array | undefined): number[] {
  return source === undefined ? [] : Array.from(source as ArrayLike<number>);
}

function allPrimitives(parts: readonly StudioVrmHumanoidMeshPart[]) {
  return parts.flatMap((part) => part.primitives);
}

describe("studio VRM humanoid rig", () => {
  it("parents every bone into an anatomical chain, with parents ahead of children", () => {
    const rig = buildStudioVrmRig({ proportions: NEUTRAL.proportions, face: NEUTRAL.face });
    const seen = new Set<StudioVrmRigBone>();
    for (const bone of rig.bones) {
      const parent = STUDIO_VRM_RIG_PARENTS[bone];
      if (parent !== null) {
        expect(seen.has(parent), `${bone} 의 부모 ${parent} 가 뒤에 온다`).toBe(true);
      }
      seen.add(bone);
    }
    // 평면 계층(전부 hips 직속)이면 무릎을 굽혀도 발이 따라오지 않는다 — 회귀 방지.
    expect(STUDIO_VRM_RIG_PARENTS.leftFoot).toBe("leftLowerLeg");
    expect(STUDIO_VRM_RIG_PARENTS.leftHand).toBe("leftLowerArm");
    expect(STUDIO_VRM_RIG_PARENTS.head).toBe("spine");
  });

  it("keeps world rest equal to the accumulated local chain", () => {
    const rig = buildStudioVrmRig({ proportions: NEUTRAL.proportions, face: NEUTRAL.face });
    for (const bone of rig.bones) {
      const parent = STUDIO_VRM_RIG_PARENTS[bone];
      const base = parent === null ? [0, 0, 0] : rig.worldRest[parent];
      const local = rig.localTranslation[bone];
      for (let axis = 0; axis < 3; axis += 1) {
        expect(rig.worldRest[bone][axis]).toBeCloseTo(base[axis] + local[axis], 10);
      }
    }
  });

  it("puts the character's left on +X and the face on +Z, as VRM 1.0 requires", () => {
    const rig = buildStudioVrmRig({ proportions: NEUTRAL.proportions, face: NEUTRAL.face });
    expect(rig.worldRest.leftUpperArm[0]).toBeGreaterThan(0);
    expect(rig.worldRest.rightUpperArm[0]).toBeLessThan(0);
    expect(rig.worldRest.leftUpperLeg[0]).toBeGreaterThan(0);
    expect(rig.worldRest.rightUpperLeg[0]).toBeLessThan(0);
  });

  it("writes inverse bind matrices as the pure inverse translation of the rest pose", () => {
    const rig = buildStudioVrmRig({ proportions: NEUTRAL.proportions, face: NEUTRAL.face });
    const matrices = studioVrmRigInverseBindMatrices(rig);
    expect(matrices).toHaveLength(rig.bones.length * 16);
    rig.bones.forEach((bone, index) => {
      const block = matrices.slice(index * 16, index * 16 + 16);
      expect(block.slice(0, 12)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
      expect(block.slice(12)).toEqual([
        -rig.worldRest[bone][0],
        -rig.worldRest[bone][1],
        -rig.worldRest[bone][2],
        1,
      ]);
    });
  });

  it("keeps the soles on the ground whatever the leg length, and scales height with overallHeight", () => {
    for (const legLength of [0.6, 1, 1.5]) {
      const rig = buildStudioVrmRig({
        proportions: { ...NEUTRAL.proportions, legLength },
      });
      expect(rig.worldRest.leftFoot[1]).toBeGreaterThan(0);
      expect(rig.worldRest.leftFoot[1]).toBeCloseTo(0.09, 2);
    }
    const short = studioVrmRigStandingHeight(buildStudioVrmRig({
      proportions: { ...NEUTRAL.proportions, overallHeight: 0.8 },
    }));
    const tall = studioVrmRigStandingHeight(buildStudioVrmRig({
      proportions: { ...NEUTRAL.proportions, overallHeight: 1.3 },
    }));
    expect(tall).toBeGreaterThan(short * 1.5);
  });

  it("reports a height scale that leg length cannot contaminate", () => {
    // 골반은 다리를 늘려도 발바닥이 지면에 남도록 보정된다. 그 높이로 배율을 유추하면
    // legLength 1.55 에서 1.50 이 나와 몸통·팔다리·의상이 50% 부푼다.
    for (const legLength of [0.55, 1, 1.55]) {
      const rig = buildStudioVrmRig({ proportions: { ...NEUTRAL.proportions, legLength } });
      expect(rig.heightScale, `legLength ${legLength}`).toBeCloseTo(1, 10);
      expect(rig.worldRest.hips[1] / 0.95).not.toBeCloseTo(legLength === 1 ? 0 : 1, 2);
    }
    for (const overallHeight of [0.8, 1.3]) {
      const rig = buildStudioVrmRig({ proportions: { ...NEUTRAL.proportions, overallHeight } });
      expect(rig.heightScale).toBeCloseTo(overallHeight, 10);
    }
  });

  it("only scales leaf bones, so no rotated child can inherit a shear", () => {
    const rig = buildStudioVrmRig({ proportions: NEUTRAL.proportions, face: NEUTRAL.face });
    const parents = new Set(
      rig.bones.map((bone) => STUDIO_VRM_RIG_PARENTS[bone]).filter((bone) => bone !== null),
    );
    for (const bone of Object.keys(rig.nodeScale) as StudioVrmRigBone[]) {
      expect(parents.has(bone), `${bone} 에 스케일이 붙었는데 자식이 있다`).toBe(false);
    }
  });
});

describe("studio VRM humanoid mesh", () => {
  const mesh = buildStudioVrmHumanoidMesh(NEUTRAL);

  it("emits consistent, in-range vertex attributes for every primitive", () => {
    const jointCount = mesh.rig.bones.length;
    for (const primitive of allPrimitives(mesh.parts)) {
      const positions = numbers(primitive.positions);
      const count = positions.length / 3;
      expect(count).toBeGreaterThan(0);
      expect(numbers(primitive.normals)).toHaveLength(count * 3);
      expect(numbers(primitive.uvs)).toHaveLength(count * 2);
      expect(numbers(primitive.joints as readonly number[])).toHaveLength(count * 4);
      expect(numbers(primitive.weights)).toHaveLength(count * 4);

      for (const joint of numbers(primitive.joints as readonly number[])) {
        expect(joint).toBeGreaterThanOrEqual(0);
        expect(joint).toBeLessThan(jointCount);
      }
      for (const index of numbers(primitive.indices as readonly number[])) {
        expect(index).toBeLessThan(count);
      }
    }
  });

  it("normalises skin weights and keeps normals unit length", () => {
    for (const primitive of allPrimitives(mesh.parts)) {
      const weights = numbers(primitive.weights);
      for (let vertex = 0; vertex * 4 < weights.length; vertex += 1) {
        const sum = weights.slice(vertex * 4, vertex * 4 + 4).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1, 5);
      }
      const normals = numbers(primitive.normals);
      for (let vertex = 0; vertex * 3 < normals.length; vertex += 1) {
        const [x, y, z] = normals.slice(vertex * 3, vertex * 3 + 3);
        expect(Math.hypot(x, y, z)).toBeCloseTo(1, 4);
      }
    }
  });

  it("stands on the ground plane and reaches the expected height", () => {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const primitive of allPrimitives(mesh.parts)) {
      const positions = numbers(primitive.positions);
      for (let index = 1; index < positions.length; index += 3) {
        minY = Math.min(minY, positions[index]);
        maxY = Math.max(maxY, positions[index]);
      }
    }
    expect(minY).toBeGreaterThanOrEqual(mesh.rig.groundY - 1e-6);
    expect(minY).toBeLessThan(0.01);
    expect(maxY).toBeGreaterThan(1.4);
    expect(maxY).toBeLessThan(1.9);
  });

  it("keeps body width independent of leg length", () => {
    const widthOf = (legLength: number) => {
      const built = buildStudioVrmHumanoidMesh({
        ...NEUTRAL,
        proportions: { ...NEUTRAL.proportions, legLength },
      });
      const positions = numbers(built.parts[0].primitives[0].positions);
      let maxX = 0;
      for (let index = 0; index < positions.length; index += 3) {
        maxX = Math.max(maxX, Math.abs(positions[index]));
      }
      return maxX;
    };
    // 팔 끝까지의 폭은 팔 길이가 정한다 — 다리 길이가 바꾸면 안 된다.
    expect(widthOf(1.55)).toBeCloseTo(widthOf(1), 6);
    expect(widthOf(0.55)).toBeCloseTo(widthOf(1), 6);
  });

  it("keeps scaled feet standing on the ground plane", () => {
    const posedSoleFor = (footScale: number) => {
      const built = buildStudioVrmHumanoidMesh({
        ...NEUTRAL,
        proportions: { ...NEUTRAL.proportions, footScale },
      });
      const ankleY = built.rig.worldRest.leftFoot[1];
      const scale = built.rig.nodeScale.leftFoot?.[1] ?? 1;
      let lowest = Infinity;
      for (const part of built.parts) {
        if (part.nodeName !== "Body" && part.nodeName !== "Shoes") continue;
        for (const primitive of part.primitives) {
          const positions = numbers(primitive.positions);
          for (let index = 1; index < positions.length; index += 3) {
            lowest = Math.min(lowest, positions[index]);
          }
        }
      }
      // 발 노드의 균등 스케일은 발목을 원점으로 걸린다 — 그 변환을 거친 뒤의 밑창 높이.
      return { posed: ankleY + (lowest - ankleY) * scale, ground: built.rig.groundY };
    };

    for (const footScale of [0.6, 1, 1.6]) {
      const { posed, ground } = posedSoleFor(footScale);
      expect(posed, `footScale ${footScale}`).toBeCloseTo(ground, 6);
    }
  });

  it("carries the forge hair shine into the exported hair material", () => {
    const glossy = buildStudioVrmHumanoidMesh({
      ...HAIRED,
      hair: { ...HAIRED.hair, shine: 0.9 },
    }).materials.find((material) => material.name === "Hair");
    const matte = buildStudioVrmHumanoidMesh({
      ...HAIRED,
      hair: { ...HAIRED.hair, shine: 0.05 },
    }).materials.find((material) => material.name === "Hair");
    expect(glossy?.roughnessFactor).toBeLessThan(matte?.roughnessFactor ?? 0);
  });

  it("names parts and materials so the wardrobe and hair systems classify them", () => {
    const byNode = new Map(buildStudioVrmHumanoidMesh(HAIRED).parts.map((part) => [part.nodeName, part]));
    expect([...byNode.keys()]).toEqual(
      expect.arrayContaining(["Body", "Face", "Hair", "Tops", "Bottoms", "Shoes"]),
    );
    // 피부·얼굴·머리는 의상 토글에서 보호돼야 하고, 옷은 슬롯으로 잡혀야 한다.
    expect(classifyMeshName("Body_Skin").protected).not.toBeNull();
    expect(classifyMeshName("Hair").protected).toBe("hair");
    expect(classifyMeshName("Tops").slot).toBe("tops");
    expect(classifyMeshName("Bottoms").slot).toBe("bottoms");
    expect(classifyMeshName("Shoes").slot).toBe("shoes");
    for (const material of mesh.materials.filter((m) => m.name?.startsWith("Face_"))) {
      expect(classifyMeshName(material.name).protected).not.toBeNull();
    }
  });

  it("gives every face primitive the same morph targets, named after VRM expression presets", () => {
    const face = mesh.parts[mesh.facePartIndex];
    expect(face.nodeName).toBe("Face");
    for (const primitive of face.primitives) {
      const targets = primitive.targets ?? [];
      expect(targets.map((target) => target.name)).toEqual([
        ...STUDIO_VRM_HUMANOID_MORPH_TARGET_NAMES,
      ]);
      const vertexCount = numbers(primitive.positions).length / 3;
      for (const target of targets) {
        expect(numbers(target.positions)).toHaveLength(vertexCount * 3);
      }
    }
    for (const name of STUDIO_VRM_HUMANOID_MORPH_TARGET_NAMES) {
      expect(STUDIO_VRM_EXPORT_EXPRESSION_PRESETS).toContain(name);
    }
    // 표정을 담지 않는 파트에 타깃이 섞이면 glTF 의 메시별 타깃 수 규칙이 깨진다.
    for (const part of mesh.parts.filter((candidate) => candidate.nodeName !== "Face")) {
      for (const primitive of part.primitives) expect(primitive.targets).toBeUndefined();
    }
  });

  it("moves the eyes for blink and the mouth for aa, and leaves brows alone on blink", () => {
    const face = mesh.parts[mesh.facePartIndex];
    const magnitude = (materialName: string, target: string) => {
      const index = mesh.materials.findIndex((material) => material.name === materialName);
      const primitive = face.primitives.find((candidate) => candidate.material === index);
      const found = primitive?.targets?.find((candidate) => candidate.name === target);
      return numbers(found?.positions).reduce((total, value) => total + Math.abs(value), 0);
    };
    expect(magnitude("Face_EyeWhite", "blink")).toBeGreaterThan(0);
    expect(magnitude("Face_Iris", "blink")).toBeGreaterThan(0);
    expect(magnitude("Face_Mouth", "blink")).toBe(0);
    expect(magnitude("Face_Mouth", "aa")).toBeGreaterThan(0);
    expect(magnitude("Face_EyeWhite", "aa")).toBe(0);
    // blinkLeft 는 blink 의 절반만 움직인다(한쪽 눈).
    expect(magnitude("Face_EyeWhite", "blinkLeft")).toBeCloseTo(
      magnitude("Face_EyeWhite", "blink") / 2,
      4,
    );
  });

  it("is deterministic and responds to the forge parameters", () => {
    const again = buildStudioVrmHumanoidMesh(createAvatarForgeState());
    expect(numbers(again.parts[0].primitives[0].positions)).toEqual(
      numbers(mesh.parts[0].primitives[0].positions),
    );

    const tall: AvatarForgeState = {
      ...NEUTRAL,
      proportions: { ...NEUTRAL.proportions, legLength: 1.4 },
    };
    expect(numbers(buildStudioVrmHumanoidMesh(tall).parts[0].primitives[0].positions)).not.toEqual(
      numbers(mesh.parts[0].primitives[0].positions),
    );
  });

  it("drops the hair part when the style is none, and keeps it for every shipped preset", () => {
    // 기본 상태가 곧 style "none" 이다.
    expect(NEUTRAL.hair.style).toBe("none");
    expect(mesh.parts.some((part) => part.nodeName === "Hair")).toBe(false);

    for (const preset of AVATAR_FORGE_PRESETS) {
      const built = buildStudioVrmHumanoidMesh(preset.state);
      expect(built.parts.some((part) => part.nodeName === "Hair"), preset.id).toBe(true);
    }
  });

  it("keeps hair on the skull instead of burying it or floating it above the crown", () => {
    const haired = buildStudioVrmHumanoidMesh(HAIRED);
    const hairPart = haired.parts.find((part) => part.nodeName === "Hair");
    if (!hairPart) throw new Error("expected hair");
    const head = haired.rig.head;
    const positions = numbers(hairPart.primitives[0].positions);
    let maxY = -Infinity;
    for (let index = 1; index < positions.length; index += 3) maxY = Math.max(maxY, positions[index]);
    // 정수리 위로 솟지 않는다(가닥 뿌리 앵커링). 두께만큼의 여유는 둔다.
    expect(maxY).toBeLessThan(head.center[1] + head.radiusY * 1.35);
    expect(maxY).toBeGreaterThan(head.center[1] + head.radiusY * 0.6);
  });
});
