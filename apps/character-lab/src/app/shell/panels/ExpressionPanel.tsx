/**
 * ExpressionPanel: 표정 프리셋 12 카드 + 프리셋 세기 + FACS 16 슬라이더 + 초기화·길항(모순 유닛) 완화.
 *
 * - 카드 클릭 = `slot/apply`(expression) 1회(레시피 표정을 프리셋 가중치로 교체·슬롯 기록).
 * - 슬라이더 변경 = `expression/set`(merge: true, 해당 유닛만) — 슬라이더가 프리셋보다 우선(blendExpression 규칙).
 * - 프리셋 세기 = blendExpressionPresets([{프리셋 가중치, 세기}])에 이 패널에서 만진 유닛을 덮어(blendExpression)
 *   `expression/set`(merge: false)로 교체. 프리셋을 바꾸면 세기·덮어쓰기 목록을 초기화한다.
 * - 모순 유닛 완화 = relaxAntagonists(현재 표정)로 교체(바뀌는 것이 없으면 비활성). 초기화 = 빈 표정.
 * - 슬라이더 드래그는 `expression/set`에 `coalesceKey: unit`을 실어 같은 유닛의 연속 변경을 history 1단계로 병합한다
 *   (`param/set`과 같은 규칙, state/lab-store가 처리). 프리셋 카드·세기·초기화·완화는 각각 1단계다.
 * - 스타일 접두 `cl-expression-`(core의 character-lab.css가 정의).
 */
import { useId, useState } from "react";

import { blendExpression, blendExpressionPresets, expressionToMorphWeights, relaxAntagonists } from "../../../animation/expression-blend";
import { EXPRESSION_PRESETS } from "../../../animation/presets";
import { FACS_LABELS_KO, FACS_UNITS, clampExpression } from "../../../contracts";
import { useApplyPlan, useDispatch, useLabState } from "../lab-store-context";

import type { ExpressionPreset, ExpressionWeights, FacsUnit } from "../../../contracts";

/** 두 표정이 클램프 후 같은지(없는 유닛 = 0) */
export function expressionsEqual(a: ExpressionWeights, b: ExpressionWeights): boolean {
  const ca = clampExpression(a);
  const cb = clampExpression(b);
  return FACS_UNITS.every((unit) => (ca[unit] ?? 0) === (cb[unit] ?? 0));
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function ExpressionPanel() {
  const { recipe, capabilities } = useLabState();
  const dispatch = useDispatch();
  const plan = useApplyPlan();
  const ids = useId();
  /** 이 패널에서 슬라이더로 만진 유닛(프리셋 세기 변경 시 보존) */
  const [overrides, setOverrides] = useState<ExpressionWeights>({});
  const [influence, setInfluence] = useState(1);

  const capability = capabilities.expression;
  const disabled = capability.status === "unavailable";
  const unsupported = plan?.unsupported.find((item) => item.slot === "expression");
  const currentPreset = EXPRESSION_PRESETS.find((preset) => preset.id === recipe.slots.expression);
  const relaxed = relaxAntagonists(recipe.expression);
  const canRelax = !expressionsEqual(relaxed, recipe.expression);
  const activeUnits = FACS_UNITS.filter((unit) => (recipe.expression[unit] ?? 0) > 0);
  const morphCount = Object.keys(expressionToMorphWeights(recipe.expression)).length;

  const applyPreset = (preset: ExpressionPreset): void => {
    setOverrides({});
    setInfluence(1);
    dispatch({ type: "slot/apply", slot: "expression", presetId: preset.id });
  };

  const setUnit = (unit: FacsUnit, value: number): void => {
    setOverrides((previous) => ({ ...previous, [unit]: value }));
    dispatch({ type: "expression/set", weights: { [unit]: value }, merge: true, coalesceKey: unit });
  };

  const setPresetInfluence = (value: number): void => {
    setInfluence(value);
    const base = blendExpressionPresets([{ weights: currentPreset?.weights ?? {}, influence: value }]);
    dispatch({ type: "expression/set", weights: blendExpression(base, overrides), merge: false });
  };

  const reset = (): void => {
    setOverrides({});
    setInfluence(1);
    dispatch({ type: "expression/set", weights: {}, merge: false });
  };

  const relax = (): void => {
    dispatch({ type: "expression/set", weights: relaxed, merge: false });
  };

  return (
    <section className="cl-expression-panel" aria-label="표정">
      <h2 className="cl-expression-title">표정</h2>
      {capability.status !== "available" ? (
        <p className="cl-expression-reason" role="note">
          표정 슬롯 {capability.status === "partial" ? "부분 지원" : "미지원"}: {capability.reasonKo ?? "사유 없음"}
        </p>
      ) : null}
      {unsupported ? (
        <p className="cl-expression-reason" role="status">
          현재 표정이 적용되지 않았습니다: {unsupported.reasonKo}
        </p>
      ) : null}

      <div className="cl-expression-grid" role="group" aria-label="표정 프리셋">
        {EXPRESSION_PRESETS.map((preset) => {
          const selected = recipe.slots.expression === preset.id;
          const unitCount = FACS_UNITS.filter((unit) => (preset.weights[unit] ?? 0) > 0).length;
          return (
            <button
              key={preset.id}
              type="button"
              className={`cl-expression-card${selected ? " cl-expression-card--selected" : ""}`}
              aria-pressed={selected}
              disabled={disabled}
              title={capability.reasonKo}
              data-preset-id={preset.id}
              onClick={() => applyPreset(preset)}
            >
              <span className="cl-expression-card-label">{preset.labelKo}</span>
              <span className="cl-expression-card-meta">유닛 {unitCount}개</span>
            </button>
          );
        })}
      </div>

      <div className="cl-expression-row">
        <label htmlFor={`${ids}-influence`}>프리셋 세기</label>
        <input
          id={`${ids}-influence`}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={influence}
          disabled={disabled || !currentPreset}
          onChange={(event) => setPresetInfluence(Number(event.target.value))}
        />
        <output htmlFor={`${ids}-influence`}>{percent(influence)}</output>
      </div>

      <div className="cl-expression-sliders" role="group" aria-label="FACS 슬라이더">
        {FACS_UNITS.map((unit) => {
          const value = recipe.expression[unit] ?? 0;
          return (
            <div key={unit} className="cl-expression-row">
              <label htmlFor={`${ids}-${unit}`}>{FACS_LABELS_KO[unit]}</label>
              <input id={`${ids}-${unit}`} type="range" min={0} max={1} step={0.01} value={value} disabled={disabled} onChange={(event) => setUnit(unit, Number(event.target.value))} />
              <output htmlFor={`${ids}-${unit}`}>{percent(value)}</output>
            </div>
          );
        })}
      </div>

      <div className="cl-expression-actions">
        <button type="button" onClick={reset} disabled={disabled}>
          표정 초기화
        </button>
        <button type="button" onClick={relax} disabled={disabled || !canRelax}>
          모순 유닛 완화
        </button>
      </div>
      <p className="cl-expression-status">
        활성 유닛 {activeUnits.length}개 · morph {morphCount}개{currentPreset ? ` · 프리셋 ${currentPreset.labelKo}` : ""}
      </p>
      <p className="cl-expression-footer">같은 슬라이더의 연속 드래그는 되돌리기 1단계로 병합되고, 프리셋 카드·세기·초기화는 각각 1단계입니다.</p>
    </section>
  );
}
