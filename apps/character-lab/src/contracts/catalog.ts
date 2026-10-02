/**
 * 프리셋 카탈로그 계약. 외형 64개(state-presets)와 연기 30개(animation)를 core가 병합한다.
 * `catalogInvariants`가 어휘·개수·patch 스키마·본 이름·쿼터니언 정규화를 검사한다.
 */
import { FINGER_BONE_NAMES, isHumanoidBoneName } from "./bones";
import { failVisible } from "./errors";
import { isUnitQuat } from "./pose";
import { MIN_PRESETS_PER_SLOT, isVocabularyPresetId } from "./preset-vocabulary";
import { recipePatchSchema } from "./recipe";
import { CHARACTER_SLOT_KINDS, isPresetId, presetSlot } from "./slots";

import type { CameraFraming } from "./capture";
import type { LabFailure } from "./errors";
import type { Pose } from "./pose";
import type { CharacterRecipe, PatchPartSlot, RecipeColors } from "./recipe";
import type { PresetId, SlotKind } from "./slots";

/**
 * 프리셋이 레시피에 적용하는 부분 변경. colors는 부분 지정을 허용한다(reducer가 병합).
 * parts는 지오메트리 파츠 선택 id(어휘 이름, 슬롯 접두 없음).
 */
export type RecipePatch = Partial<Pick<CharacterRecipe, "body" | "face" | "expression" | "pose" | "handPose">> & {
  readonly colors?: Partial<RecipeColors>;
  readonly parts?: Partial<Record<PatchPartSlot, string>>;
};

export interface PresetEntry {
  readonly id: PresetId;
  readonly slot: SlotKind;
  readonly labelKo: string;
  readonly patch: RecipePatch;
  /**
   * 소스가 제공해야 하는 요구 사항. 형식:
   * - `morph:<이름>` — SourceCapabilities.morphNames에 있어야 함
   * - `bone:<이름>`  — SourceCapabilities.boneNames에 있어야 함
   * - `slot:<kind>`  — 해당 슬롯 능력이 unavailable이 아니어야 함
   * 불충족이면 플래너가 unsupported 사유로 노출한다(대체 없음).
   */
  readonly requires: readonly string[];
  /** 함께 적용할 수 없는 프리셋(적용은 되지만 partial 사유 노출) */
  readonly conflictsWith: readonly PresetId[];
  readonly thumbnailFraming: CameraFraming;
  /** 모든 프리셋은 자체 제작물이다(경쟁 제품 에셋 복제 금지). */
  readonly license: "original";
}

export const PRESET_REQUIREMENT_PATTERN = /^(morph|bone|slot):.+$/u;

export interface PresetCatalog {
  readonly entries: readonly PresetEntry[];
  bySlot(slot: SlotKind): readonly PresetEntry[];
  get(id: PresetId): PresetEntry | undefined;
}

export function createPresetCatalog(entries: readonly PresetEntry[]): PresetCatalog {
  const byId = new Map<PresetId, PresetEntry>();
  const bySlot = new Map<SlotKind, PresetEntry[]>();
  for (const slot of CHARACTER_SLOT_KINDS) bySlot.set(slot, []);
  for (const entry of entries) {
    if (!byId.has(entry.id)) byId.set(entry.id, entry);
    bySlot.get(entry.slot)?.push(entry);
  }
  const frozen = Object.freeze([...entries]);
  return {
    entries: frozen,
    bySlot: (slot) => bySlot.get(slot) ?? [],
    get: (id) => byId.get(id),
  };
}

function poseQuatsNormalized(pose: Pose | undefined): string | null {
  if (!pose) return null;
  for (const [bone, quat] of Object.entries(pose)) {
    if (!quat) continue;
    if (!isUnitQuat(quat)) return bone;
  }
  return null;
}

/**
 * 카탈로그 불변식. 위반 목록(비어 있으면 통과):
 * 슬롯당 최소 개수, id 유일, id 어휘 안, id 슬롯 = entry.slot, patch 스키마, 포즈 본 이름,
 * 손 포즈 손가락 본만, 쿼터니언 정규화, conflictsWith 참조 유효, requires 형식.
 */
export function catalogInvariants(catalog: PresetCatalog, now?: number): LabFailure[] {
  const failures: LabFailure[] = [];
  const fail = (code: string, reasonKo: string): void => {
    failures.push(failVisible(code, reasonKo, undefined, now));
  };
  const seen = new Set<string>();
  const fingerSet = new Set<string>(FINGER_BONE_NAMES);

  for (const entry of catalog.entries) {
    if (!isPresetId(entry.id)) {
      fail("catalog-id-format", `프리셋 id 형식이 틀립니다: ${String(entry.id)}`);
      continue;
    }
    if (seen.has(entry.id)) fail("catalog-id-duplicate", `프리셋 id가 중복됩니다: ${entry.id}`);
    seen.add(entry.id);
    if (presetSlot(entry.id) !== entry.slot) {
      fail("catalog-slot-mismatch", `프리셋 ${entry.id}의 slot(${entry.slot})이 id의 슬롯과 다릅니다.`);
    }
    if (!isVocabularyPresetId(entry.id)) fail("catalog-id-vocabulary", `프리셋 id가 어휘 밖입니다: ${entry.id}`);
    if (entry.license !== "original") fail("catalog-license", `프리셋 ${entry.id}의 license는 "original"이어야 합니다.`);
    if (!entry.labelKo || !/[가-힣]/u.test(entry.labelKo)) {
      fail("catalog-label-ko", `프리셋 ${entry.id}의 labelKo가 비어 있거나 한글이 아닙니다.`);
    }

    const parsed = recipePatchSchema.safeParse(entry.patch);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      fail("catalog-patch-schema", `프리셋 ${entry.id}의 patch가 스키마에 맞지 않습니다: ${first?.path.map(String).join(".") ?? ""} ${first?.message ?? ""}`);
    }
    for (const bone of Object.keys(entry.patch.pose ?? {})) {
      if (!isHumanoidBoneName(bone)) fail("catalog-pose-bone", `프리셋 ${entry.id}의 포즈 본 이름이 어휘 밖입니다: ${bone}`);
    }
    for (const side of ["left", "right"] as const) {
      for (const bone of Object.keys(entry.patch.handPose?.[side] ?? {})) {
        if (!fingerSet.has(bone)) fail("catalog-hand-pose-bone", `프리셋 ${entry.id}의 ${side} 손 포즈에 손가락이 아닌 본이 있습니다: ${bone}`);
      }
    }
    const badPoseBone = poseQuatsNormalized(entry.patch.pose);
    if (badPoseBone) fail("catalog-quat-normalized", `프리셋 ${entry.id}의 ${badPoseBone} 회전이 단위 쿼터니언이 아닙니다.`);
    const badHandBone = poseQuatsNormalized(entry.patch.handPose?.left) ?? poseQuatsNormalized(entry.patch.handPose?.right);
    if (badHandBone) fail("catalog-quat-normalized", `프리셋 ${entry.id}의 손 ${badHandBone} 회전이 단위 쿼터니언이 아닙니다.`);

    for (const requirement of entry.requires) {
      if (!PRESET_REQUIREMENT_PATTERN.test(requirement)) {
        fail("catalog-requires-format", `프리셋 ${entry.id}의 requires 항목 형식이 틀립니다: ${requirement}`);
      }
    }
    for (const conflict of entry.conflictsWith) {
      if (!catalog.get(conflict)) fail("catalog-conflict-ref", `프리셋 ${entry.id}의 conflictsWith가 없는 프리셋을 가리킵니다: ${conflict}`);
      if (conflict === entry.id) fail("catalog-conflict-self", `프리셋 ${entry.id}가 자기 자신과 충돌로 선언되어 있습니다.`);
    }
  }

  for (const slot of CHARACTER_SLOT_KINDS) {
    const count = catalog.bySlot(slot).length;
    const min = MIN_PRESETS_PER_SLOT[slot];
    if (count < min) fail("catalog-slot-min", `슬롯 ${slot}의 프리셋이 ${count}개로 최소 ${min}개에 못 미칩니다.`);
  }
  return failures;
}
