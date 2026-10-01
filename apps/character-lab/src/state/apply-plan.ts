/**
 * 적용 플래너. 레시피·능력 맵·카탈로그에서 엔진이 그대로 적용할 `ApplyPlan`을 계산한다.
 *
 * - morphWeights = `paramToMorphWeights(body ∪ face)` + FACS(expression).
 * - boneRotations = pose ∪ handPose(left, right), 모두 정규화.
 * - parts = 파츠 레이아웃(partId·역할·variant)별 가시성·재질 프리셋·색.
 * - 능력이 `unavailable`이거나 `requires`가 불충족이면 `unsupported`에 사유를 넣고 그 슬롯을 적용하지 않는다
 *   (프리셋 patch의 파라미터 morph 제외, 파츠는 소스 기본값 유지). 대체 프리셋은 고르지 않는다.
 * - `conflictsWith` 충돌과 `partial` 능력은 `partial` 사유로 노출한다(적용은 된다).
 *
 * 플래너 계약(`ApplyPlanner`)에는 파츠 레이아웃·소스 feature가 없으므로 `createApplyPlanner`로 주입한다.
 * 기본 `planApply`는 PART_ROLES 순서로 역할당 파츠 1개(partId = 순서+1, `allocatePartIds`와 동일)를 가정한다.
 * revision은 플래너가 알 수 없으므로 0이며 store(`getPlan`)가 history revision으로 덮어쓴다.
 */
import {
  CHARACTER_SLOT_KINDS,
  PART_ROLES,
  SLOT_LABELS_KO,
  expressionToMorphWeights,
  isSlotKind,
  paramToMorphWeights,
  presetName,
  presetSlot,
} from "../contracts";
import { qNormalize } from "../shared/math";

import { QUAT_MIN_LENGTH, reduceRecipe } from "./recipe-reducer";

import type {
  ApplyPlan,
  ApplyPlanPart,
  ApplyPlanner,
  CharacterRecipe,
  HumanoidBoneName,
  MaterialPresetId,
  ParamKey,
  PartIdPalette,
  PartRole,
  PatchPartSlot,
  Pose,
  PresetCatalog,
  PresetEntry,
  PresetId,
  Quat,
  RecipeColorKey,
  SlotCapabilityMap,
  SlotKind,
  UnsupportedSlot,
} from "../contracts";

export interface PartLayoutEntry {
  readonly partId: number;
  readonly role: PartRole;
  /** 같은 역할의 파츠가 여러 변형(예: 헤어 7종)으로 모두 올라와 있을 때 어휘 이름(`soft-bob`) */
  readonly variant?: string;
}

/** 역할당 파츠 1개, partId = PART_ROLES 순서 + 1 */
export const DEFAULT_PART_LAYOUT: readonly PartLayoutEntry[] = Object.freeze(PART_ROLES.map((role, index) => ({ partId: index + 1, role })));

/** 엔진 `SourceCapabilities.partIdPalette`에서 레이아웃을 만든다(partId 오름차순). variants는 partId → 어휘 이름. */
export function layoutFromPalette(palette: PartIdPalette, variants: Readonly<Record<number, string>> = {}): readonly PartLayoutEntry[] {
  const ids = Object.keys(palette)
    .map((key) => Number(key))
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((a, b) => a - b);
  return ids.map((partId) => {
    const info = palette[partId];
    const variant = variants[partId];
    return variant === undefined ? { partId, role: info?.role ?? "skin" } : { partId, role: info?.role ?? "skin", variant };
  });
}

export interface SourceFeatures {
  readonly morphNames: readonly string[];
  readonly boneNames: readonly string[];
}

export interface ApplyPlannerOptions {
  readonly partLayout?: readonly PartLayoutEntry[];
  /** 주면 `morph:`·`bone:` 요구를 검사한다. 없으면 `slot:` 요구만 검사한다(검사 생략을 문서에 명시). */
  readonly features?: SourceFeatures;
  /** 플랜 적용 시 물리 settle 스텝(기본 0 = 상호작용 중 settle 없음) */
  readonly settleSteps?: number;
}

export interface PartialSlot {
  readonly slot: SlotKind;
  readonly presetId: PresetId;
  readonly reasonKo: string;
}

/** `ApplyPlan` + partial 사유. 구조적으로 ApplyPlan이므로 엔진에 그대로 넘길 수 있다. */
export interface DetailedApplyPlan extends ApplyPlan {
  readonly partial: readonly PartialSlot[];
}

export type DetailedApplyPlanner = (recipe: CharacterRecipe, capabilities: SlotCapabilityMap, catalog: PresetCatalog) => DetailedApplyPlan;

/** 슬롯 선택이 가시성·variant를 결정하는 파츠 역할 */
export const SLOT_PART_ROLES: Readonly<Partial<Record<SlotKind, readonly PartRole[]>>> = {
  eyes: ["eyeball", "lash"],
  irises: ["iris", "pupil", "eye-highlight"],
  hair: ["hair"],
  top: ["top"],
  bottom: ["bottom"],
  shoes: ["shoes"],
  accessory: ["accessory"],
};

const ROLE_SLOT: Readonly<Partial<Record<PartRole, PatchPartSlot>>> = (() => {
  const map: Partial<Record<PartRole, PatchPartSlot>> = {};
  for (const [slot, roles] of Object.entries(SLOT_PART_ROLES) as Array<[PatchPartSlot, readonly PartRole[]]>) {
    for (const role of roles) map[role] = slot;
  }
  return map;
})();

/** 파츠 역할 → 레시피 색 키(없으면 재질 프리셋 기본색) */
export const PART_COLOR_KEYS: Readonly<Partial<Record<PartRole, RecipeColorKey>>> = {
  skin: "skin",
  head: "skin",
  iris: "iris",
  pupil: "iris",
  brow: "brow",
  lash: "brow",
  hair: "hair",
  top: "top",
  bottom: "bottom",
  shoes: "shoes",
  accessory: "accessory",
};

const ROLE_MATERIAL_DEFAULTS: Readonly<Record<PartRole, MaterialPresetId>> = {
  skin: "skin-sss",
  head: "skin-sss",
  eyeball: "eye-wet",
  iris: "iris",
  pupil: "iris",
  "eye-highlight": "unlit-highlight",
  brow: "hair-aniso",
  lash: "hair-aniso",
  teeth: "plastic",
  tongue: "skin-sss",
  hair: "hair-aniso",
  top: "cloth-cotton",
  bottom: "cloth-denim",
  shoes: "leather",
  accessory: "plastic",
};

/** 프리셋별 재질 프리셋(의상·신발·액세서리). 없으면 역할 기본값. */
export const PRESET_MATERIALS: Readonly<Partial<Record<PresetId, MaterialPresetId>>> = {
  "top/tee": "cloth-cotton",
  "top/hoodie": "cloth-cotton",
  "top/shirt": "cloth-cotton",
  "top/blazer": "cloth-cotton",
  "top/sailor": "cloth-cotton",
  "bottom/jeans": "cloth-denim",
  "bottom/shorts": "cloth-denim",
  "bottom/pleated-skirt": "cloth-cotton",
  "bottom/long-skirt": "cloth-silk",
  "bottom/slacks": "cloth-cotton",
  "shoes/sneakers": "cloth-cotton",
  "shoes/loafers": "leather",
  "shoes/boots": "leather",
  "shoes/sandals": "leather",
  "accessory/glasses": "metal",
  "accessory/ribbon": "cloth-silk",
  "accessory/cap": "cloth-cotton",
  "accessory/earrings": "metal",
  "accessory/choker": "leather",
  "accessory/headphones": "plastic",
};

export function materialPresetFor(role: PartRole, presetId: PresetId | null): MaterialPresetId {
  return (presetId !== null ? PRESET_MATERIALS[presetId] : undefined) ?? ROLE_MATERIAL_DEFAULTS[role];
}

interface FeatureSets {
  readonly morph: ReadonlySet<string>;
  readonly bone: ReadonlySet<string>;
}

/**
 * 프리셋 `requires` 중 불충족 항목의 한글 사유. 모두 충족이면 null.
 * `slot:` 요구는 능력 맵으로, `morph:`·`bone:` 요구는 features가 있을 때만 검사한다.
 */
export function unmetRequirement(entry: PresetEntry, capabilities: SlotCapabilityMap, features?: SourceFeatures | null): string | null {
  const sets: FeatureSets | null = features ? { morph: new Set(features.morphNames), bone: new Set(features.boneNames) } : null;
  return unmetRequirementWithSets(entry, capabilities, sets);
}

function unmetRequirementWithSets(entry: PresetEntry, capabilities: SlotCapabilityMap, sets: FeatureSets | null): string | null {
  for (const requirement of entry.requires) {
    const colon = requirement.indexOf(":");
    const kind = requirement.slice(0, colon);
    const name = requirement.slice(colon + 1);
    if (kind === "slot") {
      if (!isSlotKind(name)) return `요구 슬롯 이름이 어휘 밖입니다: ${name}`;
      if (capabilities[name].status === "unavailable") return `${SLOT_LABELS_KO[name]} 슬롯을 소스가 지원하지 않습니다.`;
    } else if (kind === "morph") {
      if (sets && !sets.morph.has(name)) return `소스에 morph "${name}"이 없습니다.`;
    } else if (kind === "bone") {
      if (sets && !sets.bone.has(name)) return `소스에 본 "${name}"이 없습니다.`;
    } else {
      return `요구 사항 형식이 틀립니다: ${requirement}`;
    }
  }
  return null;
}

/** 후보 프리셋이 현재 레시피에 적용된 프리셋과 충돌하면 그 항목들(카드 배지용) */
export function presetConflicts(entry: PresetEntry, recipe: CharacterRecipe, catalog: PresetCatalog): readonly PresetEntry[] {
  const result: PresetEntry[] = [];
  for (const conflict of entry.conflictsWith) {
    const slot = presetSlot(conflict);
    if (slot === entry.slot) continue;
    if (recipe.slots[slot] !== conflict) continue;
    const other = catalog.get(conflict);
    if (other) result.push(other);
  }
  return result;
}

function conflictReasonKo(other: PresetEntry): string {
  return `${other.labelKo}(${SLOT_LABELS_KO[other.slot]})와 함께 쓰면 겹침이 생길 수 있습니다.`;
}

/** 유한하지 않거나 길이가 0에 가까운 회전은 건너뛴다(reducer가 이미 거부하지만 외부 레시피 방어). */
function addPose(target: Partial<Record<HumanoidBoneName, Quat>>, pose: Pose): void {
  for (const [bone, quat] of Object.entries(pose) as Array<[HumanoidBoneName, Quat | undefined]>) {
    if (!quat || quat.length !== 4 || !quat.every(Number.isFinite)) continue;
    if (Math.hypot(quat[0], quat[1], quat[2], quat[3]) < QUAT_MIN_LENGTH) continue;
    target[bone] = qNormalize(quat);
  }
}

function patchParamKeys(entry: PresetEntry | undefined): readonly ParamKey[] {
  if (!entry) return [];
  return [...Object.keys(entry.patch.body ?? {}), ...Object.keys(entry.patch.face ?? {})] as ParamKey[];
}

function planPart(
  layoutEntry: PartLayoutEntry,
  recipe: CharacterRecipe,
  applied: ReadonlyMap<SlotKind, PresetEntry>,
  unsupportedSlots: ReadonlySet<SlotKind>,
): ApplyPlanPart {
  const { partId, role } = layoutEntry;
  const colorKey = PART_COLOR_KEYS[role];
  const color = colorKey ? recipe.colors[colorKey] : undefined;
  const withColor = (part: Omit<ApplyPlanPart, "color">): ApplyPlanPart => (color === undefined ? part : { ...part, color });
  const slot = ROLE_SLOT[role];
  if (!slot) return withColor({ partId, visible: true, materialPreset: materialPresetFor(role, null) });
  const presetId = recipe.slots[slot];
  // 미지원 슬롯은 적용하지 않는다: 소스가 가진 기본 파츠를 그대로 둔다(대체 없음).
  if (unsupportedSlots.has(slot)) return withColor({ partId, visible: true, materialPreset: materialPresetFor(role, null) });
  if (presetId === null) return withColor({ partId, visible: false, materialPreset: materialPresetFor(role, null) });
  const entry = applied.get(slot);
  const wanted = entry?.patch.parts?.[slot] ?? presetName(presetId);
  const visible = layoutEntry.variant === undefined || layoutEntry.variant === wanted;
  return withColor({ partId, visible, materialPreset: materialPresetFor(role, presetId) });
}

export function createApplyPlanner(options: ApplyPlannerOptions = {}): DetailedApplyPlanner {
  const layout = options.partLayout ?? DEFAULT_PART_LAYOUT;
  const sets: FeatureSets | null = options.features ? { morph: new Set(options.features.morphNames), bone: new Set(options.features.boneNames) } : null;
  const settleSteps = Math.max(0, Math.floor(options.settleSteps ?? 0));

  return (recipe, capabilities, catalog) => {
    const unsupported: UnsupportedSlot[] = [];
    const partial: PartialSlot[] = [];
    const applied = new Map<SlotKind, PresetEntry>();
    const unsupportedSlots = new Set<SlotKind>();

    for (const slot of CHARACTER_SLOT_KINDS) {
      const presetId = recipe.slots[slot];
      const capability = capabilities[slot];
      if (capability.status === "unavailable") {
        unsupportedSlots.add(slot);
        if (presetId !== null) unsupported.push({ slot, presetId, reasonKo: capability.reasonKo ?? `${SLOT_LABELS_KO[slot]} 슬롯을 소스가 지원하지 않습니다.` });
        continue;
      }
      if (presetId === null) continue;
      const entry = catalog.get(presetId);
      if (!entry) {
        unsupportedSlots.add(slot);
        unsupported.push({ slot, presetId, reasonKo: `카탈로그에 없는 프리셋입니다: ${presetId}` });
        continue;
      }
      const unmet = unmetRequirementWithSets(entry, capabilities, sets);
      if (unmet) {
        unsupportedSlots.add(slot);
        unsupported.push({ slot, presetId, reasonKo: unmet });
        continue;
      }
      applied.set(slot, entry);
      if (capability.status === "partial") {
        partial.push({ slot, presetId, reasonKo: capability.reasonKo ?? `${SLOT_LABELS_KO[slot]} 슬롯은 부분적으로만 지원됩니다.` });
      }
    }

    for (const [slot, entry] of applied) {
      for (const other of presetConflicts(entry, recipe, catalog)) {
        if (!applied.has(other.slot)) continue;
        partial.push({ slot, presetId: entry.id, reasonKo: conflictReasonKo(other) });
      }
    }

    const excluded = new Set<ParamKey>();
    for (const slot of unsupportedSlots) {
      const presetId = recipe.slots[slot];
      for (const key of patchParamKeys(presetId === null ? undefined : catalog.get(presetId))) excluded.add(key);
    }
    const params: Partial<Record<ParamKey, number>> = { ...recipe.body, ...recipe.face };
    for (const key of excluded) delete params[key];
    const morphWeights: Record<string, number> = { ...paramToMorphWeights(params) };
    if (!unsupportedSlots.has("expression")) Object.assign(morphWeights, expressionToMorphWeights(recipe.expression));

    const boneRotations: Partial<Record<HumanoidBoneName, Quat>> = {};
    if (!unsupportedSlots.has("pose")) addPose(boneRotations, recipe.pose);
    if (!unsupportedSlots.has("hand-pose")) {
      addPose(boneRotations, recipe.handPose.left);
      addPose(boneRotations, recipe.handPose.right);
    }

    const parts = layout.map((layoutEntry) => planPart(layoutEntry, recipe, applied, unsupportedSlots));

    return {
      revision: 0,
      morphWeights,
      boneRotations,
      parts,
      colors: recipe.colors,
      physics: { provider: recipe.physics.provider, settleSteps },
      unsupported,
      partial,
    };
  };
}

/** 기본 플래너(역할당 파츠 1개 레이아웃, feature 검사 없음). `ApplyPlanner` 계약 그대로. */
export const planApply: ApplyPlanner = createApplyPlanner();

/** 프리셋을 현재 레시피에 임시 적용한 플랜(썸네일용). 카탈로그에 없는 프리셋이면 reducer가 throw한다. */
export function planWithPreset(
  recipe: CharacterRecipe,
  presetId: PresetId,
  capabilities: SlotCapabilityMap,
  catalog: PresetCatalog,
  planner: ApplyPlanner = planApply,
): ApplyPlan {
  const slot = presetSlot(presetId);
  const previewRecipe = reduceRecipe(recipe, { type: "slot/apply", slot, presetId }, catalog);
  return planner(previewRecipe, capabilities, catalog);
}
