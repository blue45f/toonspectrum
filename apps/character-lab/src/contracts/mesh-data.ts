/**
 * 엔진 중립 메시·스켈레톤 데이터 계약.
 * humanoid/outfit이 생성하고 render가 Babylon 객체로 바인딩한다. TypedArray만 쓴다.
 */
import { failVisible } from "./errors";

import type { HumanoidBoneName } from "./bones";
import type { LabFailure } from "./errors";
import type { MorphTargetName } from "./morph-names";
import type { Quat, Vec3 } from "./pose";

export const PART_ROLES = [
  "skin",
  "head",
  "eyeball",
  "iris",
  "pupil",
  "eye-highlight",
  "brow",
  "lash",
  "teeth",
  "tongue",
  "hair",
  "top",
  "bottom",
  "shoes",
  "accessory",
] as const;

export type PartRole = (typeof PART_ROLES)[number];

export const PART_ROLE_LABELS_KO: Readonly<Record<PartRole, string>> = {
  skin: "피부",
  head: "머리",
  eyeball: "안구",
  iris: "홍채",
  pupil: "동공",
  "eye-highlight": "눈 하이라이트",
  brow: "눈썹",
  lash: "속눈썹",
  teeth: "치아",
  tongue: "혀",
  hair: "헤어",
  top: "상의",
  bottom: "하의",
  shoes: "신발",
  accessory: "액세서리",
};

const PART_ROLE_SET: ReadonlySet<string> = new Set(PART_ROLES);

export function isPartRole(value: string): value is PartRole {
  return PART_ROLE_SET.has(value);
}

export const MATERIAL_PRESET_IDS = [
  "skin-sss",
  "eye-wet",
  "iris",
  "hair-aniso",
  "cloth-cotton",
  "cloth-denim",
  "cloth-silk",
  "leather",
  "metal",
  "plastic",
  "unlit-highlight",
] as const;

export type MaterialPresetId = (typeof MATERIAL_PRESET_IDS)[number];

/** 레시피 색 키(recipe.ts의 recipeColorsSchema와 동일 집합) */
export const RECIPE_COLOR_KEYS = ["skin", "iris", "hair", "brow", "top", "bottom", "shoes", "accessory"] as const;
export type RecipeColorKey = (typeof RECIPE_COLOR_KEYS)[number];

export interface MorphDelta {
  /** 규약 이름(MorphTargetName) 또는 패키지 원본 이름 */
  readonly name: MorphTargetName | string;
  /** 정점당 3 */
  readonly deltaPositions: Float32Array;
  readonly deltaNormals?: Float32Array;
}

export interface MeshPartData {
  readonly id: string;
  readonly role: PartRole;
  /** 1..n, 0은 배경. ID 패스에 R=partId&255, G=partId>>8로 기록 */
  readonly partId: number;
  readonly materialId: number;
  readonly materialPreset: MaterialPresetId;
  /** 레시피 색을 적용할 키(없으면 재질 프리셋 기본색) */
  readonly colorKey?: RecipeColorKey;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  /** 정점당 4 */
  readonly jointIndices?: Uint16Array;
  /** 정점당 4, 합 1 */
  readonly jointWeights?: Float32Array;
  readonly morphs: readonly MorphDelta[];
}

export interface BoneData {
  readonly name: HumanoidBoneName | string;
  readonly parent: string | null;
  readonly restTranslation: Vec3;
  readonly restRotation: Quat;
  /** 헤어·스커트 체인 등 보조 본(휴머노이드 어휘 밖) */
  readonly auxiliary?: boolean;
}

export interface SkeletonData {
  readonly bones: readonly BoneData[];
}

export type ChainRole = "hair" | "skirt" | "ribbon";

/** 물리 체인 앵커: 보조 본 사슬과 rest 위치, VRMC_springBone 호환 파라미터 */
export interface ChainAnchor {
  readonly id: string;
  readonly role: ChainRole;
  /** 루트→말단 순서의 보조 본 이름 */
  readonly boneNames: readonly string[];
  /** boneNames와 같은 길이의 rest 월드 위치 */
  readonly restPoints: readonly Vec3[];
  /** 입자 충돌 반경(m) */
  readonly radius: number;
  readonly stiffness: number;
  readonly damping: number;
  readonly gravityScale: number;
}

export interface CapsuleCollider {
  readonly bone: HumanoidBoneName;
  /** 본 로컬 공간 캡슐 양 끝 */
  readonly a: Vec3;
  readonly b: Vec3;
  readonly radius: number;
}

export type PartIdPalette = Readonly<Record<number, { readonly role: PartRole; readonly labelKo: string }>>;

/** 본 이름 → rest 평행이동 오프셋(모델 공간, m) */
export type BoneRestOffsets = Readonly<Partial<Record<HumanoidBoneName, Vec3>>>;
/** 체형 morph 이름(`param:<키>:±`) → 본별 rest 오프셋 */
export type MorphJointOffsets = Readonly<Partial<Record<string, BoneRestOffsets>>>;

export interface HumanoidModelData {
  readonly parts: readonly MeshPartData[];
  readonly skeleton: SkeletonData;
  /** 엔진에 등록할 morph 이름 전체(결정적 순서) */
  readonly morphNames: readonly string[];
  readonly chains: readonly ChainAnchor[];
  readonly colliders: readonly CapsuleCollider[];
  readonly partIdPalette: PartIdPalette;
  /**
   * 체형 morph가 움직이는 관절 위치(선택, 2026-10-01 humanoid 요청으로 core가 올림). 플랜의 체형 morph 가중치 w마다 본 rest 위치에
   * w × 오프셋을 더하고 역바인드를 morph된 rest에서 다시 만들어야 팔·다리가 새 관절을 중심으로 회전한다. 없으면 morph만 정점에 반영된다
   * (제작 패키지·관절 이동이 없는 소스). 기준 구현은 humanoid `skeletonWithJointOffsets`다.
   */
  readonly jointOffsets?: MorphJointOffsets;
}

function hasNaN(array: Float32Array): boolean {
  for (let i = 0; i < array.length; i += 1) {
    if (!Number.isFinite(array[i])) return true;
  }
  return false;
}

/**
 * 메시 파츠 정합성 검사: 길이 정합·인덱스 범위·가중치 합 1±1e-4·NaN.
 * 문제 없으면 null, 있으면 첫 번째 위반을 LabFailure로 돌려준다.
 */
export function validateMeshPartData(part: MeshPartData, now?: number): LabFailure | null {
  const fail = (code: string, reasonKo: string): LabFailure => failVisible(code, `${part.id}: ${reasonKo}`, undefined, now);
  if (part.positions.length === 0 || part.positions.length % 3 !== 0) {
    return fail("mesh-positions-length", "positions 길이가 3의 배수가 아니거나 비어 있습니다.");
  }
  const vertexCount = part.positions.length / 3;
  if (part.normals.length !== vertexCount * 3) {
    return fail("mesh-normals-length", `normals 길이(${part.normals.length})가 정점 수 ×3(${vertexCount * 3})과 다릅니다.`);
  }
  if (part.uvs.length !== vertexCount * 2) {
    return fail("mesh-uvs-length", `uvs 길이(${part.uvs.length})가 정점 수 ×2(${vertexCount * 2})와 다릅니다.`);
  }
  if (part.indices.length === 0 || part.indices.length % 3 !== 0) {
    return fail("mesh-indices-length", "indices 길이가 3의 배수가 아니거나 비어 있습니다.");
  }
  for (let i = 0; i < part.indices.length; i += 1) {
    const index = part.indices[i] ?? Number.NaN;
    if (index >= vertexCount) {
      return fail("mesh-index-range", `indices[${i}]=${index}가 정점 수(${vertexCount})를 벗어납니다.`);
    }
  }
  if (!Number.isInteger(part.partId) || part.partId < 1 || part.partId > 0xffff) {
    return fail("mesh-part-id", `partId(${part.partId})는 1..65535 정수여야 합니다.`);
  }
  if (!Number.isInteger(part.materialId) || part.materialId < 0 || part.materialId > 255) {
    return fail("mesh-material-id", `materialId(${part.materialId})는 0..255 정수여야 합니다.`);
  }
  if (hasNaN(part.positions) || hasNaN(part.normals) || hasNaN(part.uvs)) {
    return fail("mesh-nan", "positions/normals/uvs에 NaN 또는 무한대가 있습니다.");
  }
  const hasIndices = part.jointIndices !== undefined;
  const hasWeights = part.jointWeights !== undefined;
  if (hasIndices !== hasWeights) {
    return fail("mesh-skin-pair", "jointIndices와 jointWeights는 함께 있어야 합니다.");
  }
  if (part.jointIndices && part.jointWeights) {
    if (part.jointIndices.length !== vertexCount * 4 || part.jointWeights.length !== vertexCount * 4) {
      return fail("mesh-skin-length", "jointIndices/jointWeights 길이가 정점 수 ×4와 다릅니다.");
    }
    if (hasNaN(part.jointWeights)) {
      return fail("mesh-skin-nan", "jointWeights에 NaN이 있습니다.");
    }
    for (let v = 0; v < vertexCount; v += 1) {
      const base = v * 4;
      const sum =
        (part.jointWeights[base] ?? 0) +
        (part.jointWeights[base + 1] ?? 0) +
        (part.jointWeights[base + 2] ?? 0) +
        (part.jointWeights[base + 3] ?? 0);
      if (Math.abs(sum - 1) > 1e-4) {
        return fail("mesh-skin-weight-sum", `정점 ${v}의 스킨 가중치 합(${sum.toFixed(5)})이 1이 아닙니다.`);
      }
    }
  }
  for (const morph of part.morphs) {
    if (morph.deltaPositions.length !== vertexCount * 3) {
      return fail("mesh-morph-length", `morph "${morph.name}" deltaPositions 길이가 정점 수 ×3과 다릅니다.`);
    }
    if (morph.deltaNormals && morph.deltaNormals.length !== vertexCount * 3) {
      return fail("mesh-morph-normals-length", `morph "${morph.name}" deltaNormals 길이가 정점 수 ×3과 다릅니다.`);
    }
    if (hasNaN(morph.deltaPositions) || (morph.deltaNormals !== undefined && hasNaN(morph.deltaNormals))) {
      return fail("mesh-morph-nan", `morph "${morph.name}"에 NaN이 있습니다.`);
    }
  }
  return null;
}

/**
 * 파츠 순서대로 partId 1..n을 배정한 팔레트를 만든다(0 = 배경).
 * 파츠의 `partId` 필드는 이 함수의 결과와 같아야 한다(생성 측이 같은 순서로 배정).
 * 예외: 역할 고정 레이아웃을 쓰는 소스(절차 휴머노이드)는 partId = `PART_ROLES` 인덱스 + 1로 배정하므로 슬롯이 비어 파츠가 없는 역할이 있으면
 * 팔레트가 희소(sparse)하고 이 함수의 결과와 다르다 — 그 소스는 `rolePartId`·`allocatePartIdsByRole`을 쓴다(`state/apply-plan`의 `DEFAULT_PART_LAYOUT`과 같은 규칙,
 * docs/parity/humanoid.md §1.3).
 */
export function allocatePartIds(parts: ReadonlyArray<Pick<MeshPartData, "role">>): PartIdPalette {
  const palette: Record<number, { role: PartRole; labelKo: string }> = {};
  parts.forEach((part, index) => {
    palette[index + 1] = { role: part.role, labelKo: PART_ROLE_LABELS_KO[part.role] };
  });
  return palette;
}

/**
 * 역할 고정 partId = `PART_ROLES` 인덱스 + 1(0 = 배경). `state/apply-plan`의 `DEFAULT_PART_LAYOUT`과 절차 휴머노이드가 쓰는 규칙이라
 * 슬롯이 비어 파츠가 없는 역할이 있어도 나머지 partId가 밀리지 않는다.
 */
export function rolePartId(role: PartRole): number {
  return PART_ROLES.indexOf(role) + 1;
}

/**
 * 역할 고정 레이아웃의 partId 팔레트(희소: 실제 파츠가 있는 역할만 담는다). 모든 역할이 `PART_ROLES` 순서로 하나씩 있으면
 * `allocatePartIds`와 같다. 역할당 파츠 하나를 가정한다(같은 역할이 둘이면 뒤 항목이 앞 항목을 덮는다).
 */
export function allocatePartIdsByRole(parts: ReadonlyArray<Pick<MeshPartData, "role">>): PartIdPalette {
  const palette: Record<number, { role: PartRole; labelKo: string }> = {};
  for (const part of parts) palette[rolePartId(part.role)] = { role: part.role, labelKo: PART_ROLE_LABELS_KO[part.role] };
  return palette;
}

/** 파츠 배열의 총 삼각형 수 */
export function countTriangles(parts: ReadonlyArray<Pick<MeshPartData, "indices">>): number {
  let total = 0;
  for (const part of parts) total += part.indices.length / 3;
  return total;
}
