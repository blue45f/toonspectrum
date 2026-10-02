/**
 * 명령(LabCommand)·이벤트(LabEvent) 유니온.
 * 명령은 패널 → store로 가는 사용자 의도이며 1 명령 = history 1단계다(`param/set`·`expression/set`은 coalesceKey로 병합).
 * 이벤트는 엔진·물리·비전·스케줄러 → store로 가는 상태 보고이며 history에 들어가지 않는다.
 */
import type { PoseScope } from "./bones";
import type { CaptureResult, ThumbnailEntry } from "./capture";
import type { EngineStatus } from "./engine";
import type { LabFailure } from "./errors";
import type { ExpressionWeights } from "./expression";
import type { RecipeColorKey } from "./mesh-data";
import type { PaintUndoToken } from "./paint";
import type { BodyParamKey, FaceParamKey } from "./params";
import type { PhysicsProviderId, PhysicsStatus } from "./physics";
import type { Pose } from "./pose";
import type { CharacterRecipe } from "./recipe";
import type { ShadingProfile } from "./shading";
import type { PresetId, SlotCapabilityMap, SlotKind } from "./slots";
import type { VisionStatus } from "./vision";

export type LabCommand =
  | { readonly type: "slot/apply"; readonly slot: SlotKind; readonly presetId: PresetId | null }
  | {
      readonly type: "param/set";
      readonly group: "body" | "face";
      readonly key: BodyParamKey | FaceParamKey;
      readonly value: number;
      /** 같은 키의 연속 드래그를 history 1단계로 병합 */
      readonly coalesceKey?: string;
    }
  | { readonly type: "color/set"; readonly key: RecipeColorKey; readonly value: string }
  | {
      readonly type: "expression/set";
      readonly weights: ExpressionWeights;
      readonly merge: boolean;
      /**
       * FACS 슬라이더의 연속 드래그를 history 1단계로 병합(`param/set`과 같은 의미, 2026-10-01 animation 요청으로 추가).
       * state/lab-store가 `param/set`과 동일하게 history 항목에 전달한다.
       */
      readonly coalesceKey?: string;
    }
  /** IK·관절 드래그·사진 포즈 결과도 이 명령으로 기록한다 */
  | { readonly type: "pose/set"; readonly pose: Pose; readonly scope: PoseScope; readonly labelKo: string }
  | { readonly type: "hand-pose/set"; readonly side: "left" | "right"; readonly presetId: PresetId | null }
  | { readonly type: "shading/set"; readonly profile: Partial<ShadingProfile> }
  | { readonly type: "physics/set-provider"; readonly provider: PhysicsProviderId }
  | { readonly type: "source/set"; readonly source: CharacterRecipe["source"]; readonly capabilities: SlotCapabilityMap }
  | { readonly type: "recipe/load"; readonly recipe: CharacterRecipe }
  | { readonly type: "paint/stroke"; readonly undoToken: PaintUndoToken }
  | { readonly type: "history/undo" }
  | { readonly type: "history/redo" };

export type LabCommandType = LabCommand["type"];

/** history에 기록되는(레시피를 바꾸는) 명령 */
export type RecipeCommand = Exclude<LabCommand, { type: "history/undo" | "history/redo" | "paint/stroke" }>;

export type LabEvent =
  | { readonly type: "engine/status"; readonly status: EngineStatus }
  | { readonly type: "capture/done"; readonly result: CaptureResult }
  | { readonly type: "failure"; readonly failure: LabFailure }
  | { readonly type: "failure/dismiss"; readonly failure: LabFailure }
  | { readonly type: "vision/status"; readonly status: VisionStatus }
  | { readonly type: "physics/status"; readonly status: PhysicsStatus }
  | { readonly type: "thumbnail/update"; readonly presetId: PresetId; readonly entry: ThumbnailEntry }
  /**
   * 엔진이 방금 올린 소스의 슬롯 능력 보고(2026-10-01 core 추가). history에 들어가지 않으며(undo 단계 없음) 현재 소스와 스토어의 능력 맵이
   * 어긋났을 때(기본 절차 소스, `recipe/load`로 소스가 바뀐 경우) 적용 루프가 `loadSource` 결과로 맞춘다.
   * 제작 패키지를 사용자가 고르는 흐름의 `source/set`(능력 맵까지 undo/redo)과는 별개다.
   */
  | { readonly type: "source/capabilities"; readonly capabilities: SlotCapabilityMap };

export type LabEventType = LabEvent["type"];
