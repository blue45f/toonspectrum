/**
 * 적용 플랜: 레시피·능력·카탈로그에서 플래너(state/apply-plan.ts)가 계산하고 엔진이 그대로 적용한다.
 * 엔진은 플랜을 해석하지 않는다(morph 이름·본 이름·partId만 본다).
 */
import type { MaterialPresetId } from "./mesh-data";
import type { PhysicsProviderId } from "./physics";
import type { Pose } from "./pose";
import type { RecipeColors } from "./recipe";
import type { PresetId, SlotKind } from "./slots";

export interface ApplyPlanPart {
  readonly partId: number;
  readonly visible: boolean;
  readonly materialPreset: MaterialPresetId;
  /** 소문자 #rrggbb */
  readonly color?: string;
}

export interface UnsupportedSlot {
  readonly slot: SlotKind;
  readonly presetId: PresetId;
  readonly reasonKo: string;
}

export interface ApplyPlan {
  /** 레시피 revision(history와 동일 단조 증가) */
  readonly revision: number;
  /** morph 이름 → 가중치 [0,1] */
  readonly morphWeights: Readonly<Record<string, number>>;
  /** 본 이름 → 로컬 회전(정규화됨) */
  readonly boneRotations: Pose;
  readonly parts: ReadonlyArray<ApplyPlanPart>;
  readonly colors: RecipeColors;
  readonly physics: { readonly provider: PhysicsProviderId; readonly settleSteps: number };
  /** 미지원이라 적용하지 않은 슬롯과 사유(대체 없음) */
  readonly unsupported: ReadonlyArray<UnsupportedSlot>;
}

export interface ApplyReceipt {
  readonly revision: number;
  readonly appliedMorphs: number;
  readonly appliedBones: number;
  /** 소스에 없어 건너뛴 morph 이름 */
  readonly skippedMorphs: readonly string[];
  readonly skippedBones: readonly string[];
}
