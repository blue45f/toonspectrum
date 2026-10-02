/**
 * humanoid-model 테스트 fixture: outfit 포트 규약을 따르는 결정적 스텁.
 * 도메인 교차 import가 금지(architecture.test)라 실제 `domains/outfit` 대신 같은 규약만 흉내 낸다
 * (파츠 partId 0·materialId 0, 보조 본 인덱스는 결과 안에서 55부터, 보조 본 `auxiliary: true`).
 * 실제 outfit과의 결합은 `app/humanoid-outfit.integration.test.ts`가 검증한다.
 */
import { HUMANOID_BONE_NAMES } from "../../contracts";

import type {
  BodySurface,
  BoneData,
  ChainAnchor,
  GarmentSelection,
  HairStyleId,
  MaterialPresetId,
  MeshPartData,
  MorphDelta,
  OutfitBuildContext,
  OutfitBuilderPort,
  OutfitBuildResult,
  PartRole,
  RecipeColorKey,
  ScalpSurface,
  Vec3,
} from "../../contracts";

/** outfit 규약: 보조 본 인덱스 기준(= VRM 55본) */
export const STUB_AUX_BASE = HUMANOID_BONE_NAMES.length;

export interface StubOutfitCalls {
  readonly hair: Array<{ style: HairStyleId; scalp: ScalpSurface; context: OutfitBuildContext }>;
  readonly garments: Array<{ selection: GarmentSelection; body: BodySurface; bodyMorphs: readonly MorphDelta[]; context: OutfitBuildContext }>;
}

export interface StubOutfitOptions {
  /** 헤어를 같은 역할의 두 파츠로 나눠 돌려준다(조립기 병합 검증) */
  readonly splitHair?: boolean;
  /** 존재하지 않는 본을 가리키는 체인을 돌려준다(조립기 실패 검증) */
  readonly brokenChain?: boolean;
  /** 보조 본 수를 넘는 본 인덱스를 가진 파츠를 돌려준다(조립기 실패 검증) */
  readonly outOfRangeJoint?: boolean;
}

function humanoidBoneIndex(name: (typeof HUMANOID_BONE_NAMES)[number]): number {
  return HUMANOID_BONE_NAMES.indexOf(name);
}

/** 4정점 카드 파츠. 위 두 정점은 bones[0], 아래 두 정점은 bones[1]에 가중 1. */
function cardPart(role: PartRole, id: string, origin: Vec3, bones: readonly [number, number], materialPreset: MaterialPresetId, colorKey: RecipeColorKey, morphs: readonly MorphDelta[] = []): MeshPartData {
  const [x, y, z] = origin;
  const positions = new Float32Array([x, y, z, x + 0.04, y, z, x + 0.04, y - 0.05, z, x, y - 0.05, z]);
  const jointIndices = new Uint16Array(16);
  const jointWeights = new Float32Array(16);
  for (let v = 0; v < 4; v += 1) {
    jointIndices[v * 4] = v < 2 ? bones[0] : bones[1];
    jointWeights[v * 4] = 1;
  }
  return {
    id,
    role,
    partId: 0,
    materialId: 0,
    materialPreset,
    colorKey,
    positions,
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    jointIndices,
    jointWeights,
    morphs,
  };
}

function auxBone(name: string, parent: string, restTranslation: Vec3): BoneData {
  return { name, parent, restTranslation, restRotation: [0, 0, 0, 1], auxiliary: true };
}

function chainOf(id: string, role: ChainAnchor["role"], boneNames: readonly string[], origin: Vec3): ChainAnchor {
  return {
    id,
    role,
    boneNames,
    restPoints: boneNames.map((_, i): Vec3 => [origin[0], origin[1] - 0.05 * i, origin[2]]),
    radius: 0.01,
    stiffness: 0.5,
    damping: 0.3,
    gravityScale: 1,
  };
}

/** 스텁이 `param:height:+` morph를 하나씩 싣는다(의상 파츠가 체형 morph 이름을 가진다는 규약). */
function heightMorph(): MorphDelta {
  const delta = new Float32Array(12);
  for (let v = 0; v < 4; v += 1) delta[v * 3 + 1] = 0.01;
  return { name: "param:height:+", deltaPositions: delta };
}

export function createStubOutfitBuilder(options: StubOutfitOptions = {}): { readonly builder: OutfitBuilderPort; readonly calls: StubOutfitCalls } {
  const calls: StubOutfitCalls = { hair: [], garments: [] };
  const builder: OutfitBuilderPort = {
    buildHair(style, scalp, context): OutfitBuildResult {
      calls.hair.push({ style, scalp, context });
      const anchor = scalp.samples[0]?.position ?? scalp.center;
      const rootName = `hair_${style}_0_0`;
      const tipName = `hair_${style}_0_1`;
      const bones: BoneData[] = [auxBone(rootName, "head", [0, 0, 0]), auxBone(tipName, rootName, [0, -0.05, 0])];
      // outfit이 직접 준 `param:headSize:+`는 조립기가 머리 프레임 델타로 대체해야 한다(값 9는 표식).
      const marker: MorphDelta = { name: "param:headSize:+", deltaPositions: new Float32Array(12).fill(9) };
      const first = cardPart("hair", `stub-hair-${style}`, anchor, [STUB_AUX_BASE, STUB_AUX_BASE + 1], "hair-aniso", "hair", [marker]);
      const parts: MeshPartData[] = [first];
      if (options.splitHair) {
        const shifted: Vec3 = [anchor[0] + 0.05, anchor[1], anchor[2]];
        parts.push(cardPart("hair", `stub-hair-${style}-b`, shifted, [STUB_AUX_BASE, STUB_AUX_BASE + 1], "hair-aniso", "hair"));
      }
      if (options.outOfRangeJoint) parts.push(cardPart("hair", "stub-hair-bad", anchor, [STUB_AUX_BASE + 50, STUB_AUX_BASE + 50], "hair-aniso", "hair"));
      const chainBones = options.brokenChain ? [rootName, "hair_missing_bone"] : [rootName, tipName];
      return { parts, bones, chains: [chainOf(`hair-${style}-0`, "hair", chainBones, anchor)] };
    },
    buildGarments(selection, body, bodyMorphs, context): OutfitBuildResult {
      calls.garments.push({ selection, body, bodyMorphs, context });
      const parts: MeshPartData[] = [];
      const bones: BoneData[] = [];
      const chains: ChainAnchor[] = [];
      const chest = humanoidBoneIndex("chest");
      if (selection.top) parts.push(cardPart("top", `stub-top-${selection.top}`, [0, 1.2, 0.1], [chest, chest], "cloth-cotton", "top", [heightMorph()]));
      if (selection.bottom) {
        bones.push(auxBone("skirt_0_0", "hips", [0, -0.02, 0]), auxBone("skirt_0_1", "skirt_0_0", [0, -0.1, 0]));
        parts.push(cardPart("bottom", `stub-bottom-${selection.bottom}`, [0, 0.9, 0.1], [STUB_AUX_BASE, STUB_AUX_BASE + 1], "cloth-denim", "bottom", [heightMorph()]));
        chains.push(chainOf("skirt-0", "skirt", ["skirt_0_0", "skirt_0_1"], [0, 0.9, 0.1]));
      }
      if (selection.shoes) {
        const foot = humanoidBoneIndex("leftFoot");
        parts.push(cardPart("shoes", `stub-shoes-${selection.shoes}`, [0.1, 0.05, 0.1], [foot, foot], "leather", "shoes"));
      }
      if (selection.accessory) {
        const offset = bones.length;
        bones.push(auxBone("ribbon_0_0", "head", [0, 0.05, 0]));
        parts.push(cardPart("accessory", `stub-accessory-${selection.accessory}`, [0, 1.6, 0.1], [STUB_AUX_BASE + offset, STUB_AUX_BASE + offset], "cloth-silk", "accessory"));
        chains.push(chainOf("ribbon-0", "ribbon", ["ribbon_0_0"], [0, 1.6, 0.1]));
      }
      return { parts, bones, chains };
    },
  };
  return { builder, calls };
}

/**
 * 기준 구현(레이캐스트 홀짝): 점에서 비축 정렬 방향으로 쏜 반직선이 삼각형을 홀수 번 지나면 머리 고체 안,
 * 짝수 번이면 공기(바깥 또는 입 안 공동)다. 방향이 축에서 살짝 기울어 간선·꼭짓점 정확 적중을 피한다.
 */
export function countRayCrossings(point: Vec3, positions: Float32Array, triangles: Uint32Array): number {
  const length = Math.hypot(1, 0.0137, 0.0071);
  const dir: Vec3 = [1 / length, 0.0137 / length, 0.0071 / length];
  let hits = 0;
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t] * 3;
    const b = triangles[t + 1] * 3;
    const c = triangles[t + 2] * 3;
    const e1: Vec3 = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
    const e2: Vec3 = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
    const h: Vec3 = [dir[1] * e2[2] - dir[2] * e2[1], dir[2] * e2[0] - dir[0] * e2[2], dir[0] * e2[1] - dir[1] * e2[0]];
    const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
    if (Math.abs(det) < 1e-14) continue;
    const f = 1 / det;
    const s: Vec3 = [point[0] - positions[a], point[1] - positions[a + 1], point[2] - positions[a + 2]];
    const u = f * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]);
    if (u < 0 || u > 1) continue;
    const q: Vec3 = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const v = f * (dir[0] * q[0] + dir[1] * q[1] + dir[2] * q[2]);
    if (v < 0 || u + v > 1) continue;
    if (f * (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) > 1e-9) hits += 1;
  }
  return hits;
}
