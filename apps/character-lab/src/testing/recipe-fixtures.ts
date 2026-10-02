/**
 * 레시피·프리셋·휴머노이드 모델 fixture. 모든 값은 결정적이다.
 */
import {
  ALL_FACS_MORPH_NAMES,
  CHARACTER_SLOT_KINDS,
  DEFAULT_FRAMING,
  SLOT_LABELS_KO,
  SLOT_PRESET_IDS,
  allocatePartIds,
  createDefaultRecipe,
  paramMorphName,
} from "../contracts";

import type {
  ApplyPlan,
  BoneData,
  CharacterRecipe,
  HumanoidModelData,
  MeshPartData,
  Pose,
  PresetEntry,
  PresetId,
  RecipePatch,
  SlotKind,
} from "../contracts";

/** 기본 레시피(매 호출 새 객체) */
export function defaultRecipeFixture(): CharacterRecipe {
  return createDefaultRecipe();
}

/** 기본 레시피에 얕은 덮어쓰기 */
export function recipeFixture(overrides: Partial<CharacterRecipe> = {}): CharacterRecipe {
  return { ...createDefaultRecipe(), ...overrides };
}

/** 슬롯 일부만 바꾼 레시피 */
export function recipeWithSlots(slots: Partial<Record<SlotKind, PresetId | null>>): CharacterRecipe {
  const base = createDefaultRecipe();
  return { ...base, slots: { ...base.slots, ...slots } };
}

export interface PresetEntryOverrides {
  readonly labelKo?: string;
  readonly patch?: RecipePatch;
  readonly requires?: readonly string[];
  readonly conflictsWith?: readonly PresetId[];
}

/** 어휘 id로 PresetEntry를 만든다(기본 patch는 빈 객체). */
export function presetEntryFixture(id: PresetId, overrides: PresetEntryOverrides = {}): PresetEntry {
  const slot = id.slice(0, id.indexOf("/")) as SlotKind;
  return {
    id,
    slot,
    labelKo: overrides.labelKo ?? `${SLOT_LABELS_KO[slot]} ${id.slice(id.indexOf("/") + 1)}`,
    patch: overrides.patch ?? {},
    requires: overrides.requires ?? [],
    conflictsWith: overrides.conflictsWith ?? [],
    thumbnailFraming: DEFAULT_FRAMING,
    license: "original",
  };
}

/** 어휘 전체(15슬롯)를 빈 patch로 채운 카탈로그 항목 — catalogInvariants를 통과한다. */
export function vocabularyCatalogEntries(): PresetEntry[] {
  const entries: PresetEntry[] = [];
  for (const slot of CHARACTER_SLOT_KINDS) {
    for (const name of SLOT_PRESET_IDS[slot]) {
      entries.push(presetEntryFixture(`${slot}/${name}`));
    }
  }
  return entries;
}

/** 간단한 포즈: 왼팔을 90° 내린 회전(z축) */
export function samplePose(): Pose {
  const half = Math.SQRT1_2;
  return { leftUpperArm: [0, 0, half, half], rightUpperArm: [0, 0, -half, half] };
}

export function applyPlanFixture(overrides: Partial<ApplyPlan> = {}): ApplyPlan {
  const recipe = createDefaultRecipe();
  return {
    revision: 1,
    morphWeights: {},
    boneRotations: {},
    parts: [],
    colors: recipe.colors,
    physics: { provider: "builtin-pbd", settleSteps: 0 },
    unsupported: [],
    ...overrides,
  };
}

function quadPart(id: string, role: MeshPartData["role"], partId: number, materialId: number, y: number, withSkin: boolean): MeshPartData {
  const positions = new Float32Array([-0.1, y, 0, 0.1, y, 0, 0.1, y + 0.2, 0, -0.1, y + 0.2, 0]);
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
  const skin = withSkin
    ? {
        jointIndices: new Uint16Array([0, 1, 0, 0, 0, 1, 0, 0, 1, 2, 0, 0, 1, 2, 0, 0]),
        jointWeights: new Float32Array([0.7, 0.3, 0, 0, 0.7, 0.3, 0, 0, 0.5, 0.5, 0, 0, 0.5, 0.5, 0, 0]),
      }
    : {};
  const vertexCount = 4;
  const deltaUp = new Float32Array(vertexCount * 3);
  for (let v = 0; v < vertexCount; v += 1) deltaUp[v * 3 + 1] = 0.01;
  return {
    id,
    role,
    partId,
    materialId,
    materialPreset: role === "hair" ? "hair-aniso" : "skin-sss",
    colorKey: role === "hair" ? "hair" : "skin",
    positions,
    normals,
    uvs,
    indices,
    ...skin,
    morphs: [
      { name: paramMorphName("eyeSize", "+"), deltaPositions: deltaUp },
      { name: ALL_FACS_MORPH_NAMES[9] ?? "facs:jawOpen", deltaPositions: new Float32Array(vertexCount * 3) },
    ],
  };
}

/**
 * 최소 휴머노이드 모델: 피부 쿼드(스킨 3본) + 헤어 쿼드, 본 hips/spine/head + 보조 체인 본 2개,
 * morph 2개, 체인 1개, 캡슐 1개. validateMeshPartData를 통과한다.
 */
export function minimalHumanoidModelFixture(): HumanoidModelData {
  const parts = [quadPart("skin", "skin", 1, 0, 0, true), quadPart("hair", "hair", 2, 1, 0.2, false)];
  const bones: BoneData[] = [
    { name: "hips", parent: null, restTranslation: [0, 0.9, 0], restRotation: [0, 0, 0, 1] },
    { name: "spine", parent: "hips", restTranslation: [0, 0.15, 0], restRotation: [0, 0, 0, 1] },
    { name: "head", parent: "spine", restTranslation: [0, 0.5, 0], restRotation: [0, 0, 0, 1] },
    { name: "hair_soft-bob_0_0", parent: "head", restTranslation: [0, 0.1, -0.05], restRotation: [0, 0, 0, 1], auxiliary: true },
    { name: "hair_soft-bob_0_1", parent: "hair_soft-bob_0_0", restTranslation: [0, -0.08, 0], restRotation: [0, 0, 0, 1], auxiliary: true },
  ];
  return {
    parts,
    skeleton: { bones },
    morphNames: [paramMorphName("eyeSize", "+"), "facs:jawOpen"],
    chains: [
      {
        id: "hair-0",
        role: "hair",
        boneNames: ["hair_soft-bob_0_0", "hair_soft-bob_0_1"],
        restPoints: [
          [0, 1.65, -0.05],
          [0, 1.57, -0.05],
        ],
        radius: 0.02,
        stiffness: 1,
        damping: 0.5,
        gravityScale: 0.05,
      },
    ],
    colliders: [{ bone: "head", a: [0, 0, 0], b: [0, 0.12, 0], radius: 0.1 }],
    partIdPalette: allocatePartIds(parts),
  };
}
