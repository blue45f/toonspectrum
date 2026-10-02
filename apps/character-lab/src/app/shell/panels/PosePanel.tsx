/**
 * PosePanel: 포즈 프리셋 10 · 손 포즈 프리셋 8 · 적용 범위(스코프) · IK 목표(손·발 4 + 머리 척추 체인) · 관절 제한 도구.
 *
 * - 프리셋 카드 클릭 = dispatch 1회. 범위가 '전신'이면 `slot/apply`(슬롯 기록·썸네일·되돌리기 라벨), 다른 범위는
 *   `pose/set`(범위 안 본만 교체, 밖은 보존 — reducer의 mergePoseScoped는 animation `mergePose(replaceScope)`와 같은 의미).
 * - 손 포즈: 양손 = `slot/apply`(hand-pose, 양쪽 patch), 왼손/오른손 = `hand-pose/set`(한쪽만).
 * - IK: 참조 스켈레톤(createReferenceSkeleton)으로 현재 레시피 포즈를 FK → 목표 환산 → `pose/set`(전신, 결과 포즈 전체).
 *   손·발은 해석적 two-bone(폴 벡터 선택), 머리는 척추 FABRIK 체인. 도달 불가·관절 제한 클램프는 사유를 status 문구와
 *   `data-status`(reached/clamped/unreachable, core CSS 색상)로 보여주고(무음 없음) 결과 포즈(최대 신장·클램프)는 그대로 기록한다.
 * - 뷰포트의 관절 핸들 드래그는 render ViewportPane이 animation/joint-drag.ts로 같은 `pose/set`을 보낸다.
 * - 스타일 접두 `cl-pose-`(core의 character-lab.css가 정의).
 */
import { useId, useMemo, useState } from "react";

import { SPINE_IK_CHAIN, solveChainIk } from "../../../animation/fabrik";
import { solveIkGoal } from "../../../animation/ik-apply";
import { clampPoseToLimits, poseLimitViolations } from "../../../animation/joint-limits";
import { HAND_POSE_PRESETS, POSE_PRESETS } from "../../../animation/presets";
import { createReferenceSkeleton } from "../../../animation/reference-skeleton";
import { computeWorldTransforms } from "../../../animation/skeleton-fk";
import { IK_CHAINS, POSE_SCOPE_LABELS_KO } from "../../../contracts";
import { useApplyPlan, useDispatch, useLabState } from "../lab-store-context";

import type { HandPosePreset, HumanoidBoneName, IkChainId, Pose, PosePreset, PoseScope, Vec3 } from "../../../contracts";

/** 패널에서 고를 수 있는 적용 범위(손 전용 스코프는 손 포즈 섹션이 맡는다) */
export const POSE_PANEL_SCOPES: readonly PoseScope[] = ["full", "upper", "arms-hands", "lower"];

export type IkTargetId = IkChainId | "head";

export const IK_TARGET_IDS: readonly IkTargetId[] = ["leftArm", "rightArm", "leftLeg", "rightLeg", "head"];

export const IK_TARGET_LABELS_KO: Readonly<Record<IkTargetId, string>> = {
  leftArm: "왼손",
  rightArm: "오른손",
  leftLeg: "왼발",
  rightLeg: "오른발",
  head: "머리(척추 체인)",
};

type HandSide = "both" | "left" | "right";

const HAND_SIDE_LABELS_KO: Readonly<Record<HandSide, string>> = { both: "양손", left: "왼손", right: "오른손" };
const HAND_SIDES: readonly HandSide[] = ["both", "left", "right"];

/** 패널 IK 환산에 쓰는 소스 독립 참조 스켈레톤(결정적) */
const REFERENCE_SKELETON = createReferenceSkeleton();

interface Coords {
  readonly x: string;
  readonly y: string;
  readonly z: string;
}

function isIkTargetId(value: string): value is IkTargetId {
  return (IK_TARGET_IDS as readonly string[]).includes(value);
}

function isHandSide(value: string): value is HandSide {
  return (HAND_SIDES as readonly string[]).includes(value);
}

function endBoneOf(target: IkTargetId): HumanoidBoneName {
  return target === "head" ? "head" : IK_CHAINS[target][2];
}

function midBoneOf(target: IkTargetId): HumanoidBoneName {
  return target === "head" ? "chest" : IK_CHAINS[target][1];
}

/** 참조 스켈레톤 기준 현재 포즈의 말단(손·발·머리) 월드 위치 */
export function ikEndPosition(pose: Pose, target: IkTargetId): Vec3 {
  return computeWorldTransforms(REFERENCE_SKELETON, pose).get(endBoneOf(target))?.position ?? [0, 0, 0];
}

function midPosition(pose: Pose, target: IkTargetId): Vec3 {
  return computeWorldTransforms(REFERENCE_SKELETON, pose).get(midBoneOf(target))?.position ?? [0, 0, 0];
}

function toCoords(v: Vec3): Coords {
  return { x: v[0].toFixed(3), y: v[1].toFixed(3), z: v[2].toFixed(3) };
}

/** 세 좌표 문자열을 Vec3로. 빈 칸·비수치는 null(무음 0 대체 금지). */
export function parseCoords(coords: Coords): Vec3 | null {
  const parts = [coords.x, coords.y, coords.z].map((text) => (text.trim() === "" ? Number.NaN : Number(text)));
  const [x, y, z] = parts;
  if (x === undefined || y === undefined || z === undefined || !parts.every(Number.isFinite)) return null;
  return [x, y, z];
}

interface IkOutcome {
  readonly reached: boolean;
  readonly error: number;
  readonly status: string;
  readonly reasonKo?: string;
}

/** IK 결과를 사용자 문장으로(도달/미도달 + 사유 + 오차 mm) */
export function describeIkOutcome(labelKo: string, outcome: IkOutcome): string {
  const mm = (outcome.error * 1000).toFixed(1);
  if (outcome.reached) return `${labelKo} 목표 도달 (오차 ${mm} mm)`;
  return `${labelKo} 목표 미도달(${outcome.status}): ${outcome.reasonKo ?? "사유 없음"} · 오차 ${mm} mm`;
}

/** core CSS `.cl-pose-ik-status[data-status]`가 색을 입히는 결과 분류 */
export type IkStatusTone = "reached" | "clamped" | "unreachable";

/** 도달 / 관절 제한 클램프 / 그 외 미도달(최대 신장·최소 접힘·중간 관절 제한·미수렴·퇴화) */
export function ikStatusTone(outcome: IkOutcome): IkStatusTone {
  if (outcome.reached) return "reached";
  return outcome.status === "clamped" ? "clamped" : "unreachable";
}

interface IkStatusLine {
  readonly text: string;
  /** 입력 오류(좌표 비수치)처럼 솔버를 돌리지 않은 경우는 없음 */
  readonly status?: IkStatusTone;
}

interface CoordInputsProps {
  readonly idPrefix: string;
  readonly labelPrefix: string;
  readonly value: Coords;
  readonly onChange: (next: Coords) => void;
}

function CoordInputs({ idPrefix, labelPrefix, value, onChange }: CoordInputsProps) {
  const axes: ReadonlyArray<readonly [keyof Coords, string]> = [
    ["x", "X"],
    ["y", "Y"],
    ["z", "Z"],
  ];
  return (
    <div className="cl-pose-row cl-pose-coords">
      {axes.map(([key, axis]) => (
        <span key={key} className="cl-pose-coord">
          <label htmlFor={`${idPrefix}-${key}`}>{`${labelPrefix} ${axis}`}</label>
          <input id={`${idPrefix}-${key}`} type="number" step={0.01} value={value[key]} onChange={(event) => onChange({ ...value, [key]: event.target.value })} />
        </span>
      ))}
    </div>
  );
}

export function PosePanel() {
  const { recipe, capabilities } = useLabState();
  const dispatch = useDispatch();
  const plan = useApplyPlan();
  const ids = useId();

  const [scope, setScope] = useState<PoseScope>("full");
  const [handSide, setHandSide] = useState<HandSide>("both");
  const [ikTarget, setIkTarget] = useState<IkTargetId>("leftArm");
  const [coords, setCoords] = useState<Coords>(() => toCoords(ikEndPosition(recipe.pose, "leftArm")));
  const [usePole, setUsePole] = useState(false);
  const [pole, setPole] = useState<Coords>(() => toCoords(midPosition(recipe.pose, "leftArm")));
  const [ikStatus, setIkStatus] = useState<IkStatusLine | null>(null);

  const poseCapability = capabilities.pose;
  const handCapability = capabilities["hand-pose"];
  const poseDisabled = poseCapability.status === "unavailable";
  const handDisabled = handCapability.status === "unavailable";
  const unsupportedPose = plan?.unsupported.find((item) => item.slot === "pose");
  const unsupportedHand = plan?.unsupported.find((item) => item.slot === "hand-pose");
  const violations = useMemo(() => poseLimitViolations(recipe.pose, REFERENCE_SKELETON), [recipe.pose]);
  const boneCount = Object.keys(recipe.pose).length;

  const applyPosePreset = (preset: PosePreset): void => {
    if (scope === "full") {
      dispatch({ type: "slot/apply", slot: "pose", presetId: preset.id });
      return;
    }
    dispatch({ type: "pose/set", pose: preset.pose, scope, labelKo: `포즈 ${preset.labelKo} (${POSE_SCOPE_LABELS_KO[scope]})` });
  };

  const applyHandPreset = (preset: HandPosePreset): void => {
    if (handSide === "both") {
      dispatch({ type: "slot/apply", slot: "hand-pose", presetId: preset.id });
      return;
    }
    dispatch({ type: "hand-pose/set", side: handSide, presetId: preset.id });
  };

  const selectIkTarget = (next: IkTargetId): void => {
    setIkTarget(next);
    setCoords(toCoords(ikEndPosition(recipe.pose, next)));
    setPole(toCoords(midPosition(recipe.pose, next)));
    setIkStatus(null);
  };

  const readCurrent = (): void => {
    setCoords(toCoords(ikEndPosition(recipe.pose, ikTarget)));
    setPole(toCoords(midPosition(recipe.pose, ikTarget)));
    setIkStatus(null);
  };

  const applyIk = (): void => {
    const target = parseCoords(coords);
    if (!target) {
      setIkStatus({ text: "목표 좌표가 숫자가 아닙니다." });
      return;
    }
    const label = IK_TARGET_LABELS_KO[ikTarget];
    const where = `(${target.map((v) => v.toFixed(2)).join(", ")})`;
    if (ikTarget === "head") {
      const result = solveChainIk(recipe.pose, REFERENCE_SKELETON, SPINE_IK_CHAIN, target);
      dispatch({ type: "pose/set", pose: result.pose, scope: "full", labelKo: `IK ${label} → ${where}` });
      setIkStatus({ text: describeIkOutcome(label, result), status: ikStatusTone(result) });
      return;
    }
    let poleVec: Vec3 | undefined;
    if (usePole) {
      const parsed = parseCoords(pole);
      if (!parsed) {
        setIkStatus({ text: "폴 벡터 좌표가 숫자가 아닙니다." });
        return;
      }
      poleVec = parsed;
    }
    const result = solveIkGoal(recipe.pose, REFERENCE_SKELETON, { chain: ikTarget, target, ...(poleVec ? { pole: poleVec } : {}) });
    dispatch({ type: "pose/set", pose: result.pose, scope: "full", labelKo: `IK ${label} → ${where}` });
    setIkStatus({ text: describeIkOutcome(label, result), status: ikStatusTone(result) });
  };

  const resetPose = (): void => {
    dispatch({ type: "pose/set", pose: {}, scope: "full", labelKo: "포즈 초기화(rest)" });
  };

  const clampPose = (): void => {
    dispatch({ type: "pose/set", pose: clampPoseToLimits(recipe.pose, REFERENCE_SKELETON), scope: "full", labelKo: "관절 제한으로 클램프" });
  };

  return (
    <section className="cl-pose-panel" aria-label="포즈">
      <h2 className="cl-pose-title">포즈</h2>
      {poseCapability.status !== "available" ? (
        <p className="cl-pose-reason" role="note">
          포즈 슬롯 {poseCapability.status === "partial" ? "부분 지원" : "미지원"}: {poseCapability.reasonKo ?? "사유 없음"}
        </p>
      ) : null}
      {unsupportedPose ? (
        <p className="cl-pose-reason" role="status">
          현재 포즈가 적용되지 않았습니다: {unsupportedPose.reasonKo}
        </p>
      ) : null}

      <fieldset className="cl-pose-scope">
        <legend>적용 범위</legend>
        {POSE_PANEL_SCOPES.map((item) => (
          <label key={item} className="cl-pose-radio" htmlFor={`${ids}-scope-${item}`}>
            <input id={`${ids}-scope-${item}`} type="radio" name={`${ids}-scope`} value={item} checked={scope === item} onChange={() => setScope(item)} />
            {POSE_SCOPE_LABELS_KO[item]}
          </label>
        ))}
        <p className="cl-pose-hint">전신은 슬롯 프리셋으로 기록하고, 다른 범위는 범위 안 본만 바꿉니다(밖은 보존).</p>
      </fieldset>

      <div className="cl-pose-grid" role="group" aria-label="포즈 프리셋">
        {POSE_PRESETS.map((preset) => {
          const selected = scope === "full" && recipe.slots.pose === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              className={`cl-pose-card${selected ? " cl-pose-card--selected" : ""}`}
              aria-pressed={selected}
              disabled={poseDisabled}
              title={poseCapability.reasonKo}
              data-preset-id={preset.id}
              onClick={() => applyPosePreset(preset)}
            >
              <span className="cl-pose-card-label">{preset.labelKo}</span>
              <span className="cl-pose-card-meta">
                {POSE_SCOPE_LABELS_KO[preset.scope]} · 본 {Object.keys(preset.pose).length}개
              </span>
            </button>
          );
        })}
      </div>
      <div className="cl-pose-actions">
        <button type="button" onClick={resetPose}>
          포즈 초기화
        </button>
        <button type="button" onClick={clampPose} disabled={violations.length === 0}>
          관절 제한으로 클램프
        </button>
      </div>
      <p className="cl-pose-status">
        포즈 본 {boneCount}개 · 관절 제한 위반 {violations.length}건{violations.length > 0 ? `: ${violations.map((v) => v.bone).join(", ")}` : ""}
      </p>

      <fieldset className="cl-pose-hand">
        <legend>손 포즈</legend>
        {handCapability.status !== "available" ? (
          <p className="cl-pose-reason" role="note">
            손 포즈 슬롯 {handCapability.status === "partial" ? "부분 지원" : "미지원"}: {handCapability.reasonKo ?? "사유 없음"}
          </p>
        ) : null}
        {unsupportedHand ? (
          <p className="cl-pose-reason" role="status">
            현재 손 포즈가 적용되지 않았습니다: {unsupportedHand.reasonKo}
          </p>
        ) : null}
        <div className="cl-pose-row">
          {HAND_SIDES.map((side) => (
            <label key={side} className="cl-pose-radio" htmlFor={`${ids}-hand-${side}`}>
              <input
                id={`${ids}-hand-${side}`}
                type="radio"
                name={`${ids}-hand`}
                value={side}
                checked={handSide === side}
                onChange={(event) => {
                  if (isHandSide(event.target.value)) setHandSide(event.target.value);
                }}
              />
              {HAND_SIDE_LABELS_KO[side]}
            </label>
          ))}
        </div>
        <div className="cl-pose-grid" role="group" aria-label="손 포즈 프리셋">
          {HAND_POSE_PRESETS.map((preset) => {
            const selected = recipe.slots["hand-pose"] === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                className={`cl-pose-card${selected ? " cl-pose-card--selected" : ""}`}
                aria-pressed={selected}
                disabled={handDisabled}
                title={handCapability.reasonKo}
                data-preset-id={preset.id}
                onClick={() => applyHandPreset(preset)}
              >
                <span className="cl-pose-card-label">{preset.labelKo}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="cl-pose-ik">
        <legend>IK 목표</legend>
        <div className="cl-pose-row">
          <label htmlFor={`${ids}-ik-target`}>부위</label>
          <select
            id={`${ids}-ik-target`}
            value={ikTarget}
            onChange={(event) => {
              if (isIkTargetId(event.target.value)) selectIkTarget(event.target.value);
            }}
          >
            {IK_TARGET_IDS.map((item) => (
              <option key={item} value={item}>
                {IK_TARGET_LABELS_KO[item]}
              </option>
            ))}
          </select>
        </div>
        <CoordInputs idPrefix={`${ids}-target`} labelPrefix="목표" value={coords} onChange={setCoords} />
        {ikTarget !== "head" ? (
          <div className="cl-pose-row">
            <label className="cl-pose-radio" htmlFor={`${ids}-pole`}>
              <input id={`${ids}-pole`} type="checkbox" checked={usePole} onChange={(event) => setUsePole(event.target.checked)} />
              폴 벡터 지정(팔꿈치·무릎이 향할 위치)
            </label>
          </div>
        ) : null}
        {ikTarget !== "head" && usePole ? <CoordInputs idPrefix={`${ids}-pole`} labelPrefix="폴" value={pole} onChange={setPole} /> : null}
        <div className="cl-pose-actions">
          <button type="button" onClick={readCurrent}>
            현재 위치 읽기
          </button>
          <button type="button" onClick={applyIk} disabled={poseDisabled}>
            IK 적용
          </button>
        </div>
        <p className="cl-pose-ik-status" role="status" data-status={ikStatus?.status}>
          {ikStatus?.text ?? "목표 좌표(미터, 모델 공간: 정면 +Z · 왼쪽 +X · 위 +Y)를 넣고 IK 적용을 누르세요."}
        </p>
      </fieldset>
      <p className="cl-pose-footer">뷰포트의 관절 핸들 드래그도 같은 포즈 명령으로 기록됩니다(swing-twist 관절 제한).</p>
    </section>
  );
}
