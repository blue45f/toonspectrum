import { normalizeProgram } from "../../engine/presets/program-schema";
import { DEFAULT_WET_PARAMS } from "../../engine/wet/params";

import type { LabOverrides } from "./lab-store";
import type { OneEuroParams } from "../../engine/input/one-euro";
import type { BrushDepositionSpec, BrushProgram, BrushTipSpec } from "../../engine/presets/program-schema";

/**
 * 파라미터 패널 오버라이드를 프리셋에 적용해 새 `BrushProgram`을 만든다.
 * 결과는 `normalizeProgram`으로 다시 검증하므로 범위 밖 값은 ZodError로 드러난다(무음 보정 없음).
 */

function lerp(a: number, b: number, t: number): number {
  // 끝점(t=0, t=1)에서 정확히 a·b가 되도록 가중합 형태를 쓴다(부동소수 오차 방지).
  return a * (1 - t) + b * t;
}

/**
 * 안정화 강도 0..1 → 위치 1€ 필터 파라미터(보충 설계 §2.3).
 * `minCutoff = lerp(3.0, 0.5, s)`, `β = lerp(0.05, 0.005, s)`, `dCutoff = 1.0`.
 * 0.6 초과 구간은 설계상 spring 팔로워 백엔드 위임 대상이지만 이 랩에는 없으므로 같은 1€ 매핑을 쓴다
 * (패널에 표시).
 */
export function stabilizerToOneEuro(strength: number): OneEuroParams {
  const s = strength < 0 ? 0 : strength > 1 ? 1 : strength;
  return { minCutoff: lerp(3.0, 0.5, s), beta: lerp(0.05, 0.005, s), dCutoff: 1.0 };
}

export const STABILIZER_BACKEND_LIMIT = 0.6;

function pickTip(base: BrushTipSpec, o: LabOverrides): BrushTipSpec {
  return {
    kind: o.kind ?? base.kind,
    sizePx: o.sizePx ?? base.sizePx,
    hardness: o.hardness ?? base.hardness,
    aspect: o.aspect ?? base.aspect,
    angleRad: o.angleRad ?? base.angleRad,
    shapeExp: o.shapeExp ?? base.shapeExp,
    seed: o.seed ?? base.seed,
    params: o.params ?? base.params,
  };
}

function pickDeposition(base: BrushDepositionSpec, o: LabOverrides): BrushDepositionSpec {
  return {
    model: o.model ?? base.model,
    flow: o.flow ?? base.flow,
    opacity: o.opacity ?? base.opacity,
    spacing: o.spacing ?? base.spacing,
    timeDabsPerSecond: o.timeDabsPerSecond ?? base.timeDabsPerSecond,
    blend: o.blend ?? base.blend,
    dual: o.dual !== undefined ? o.dual : base.dual,
  };
}

export function applyOverrides(base: BrushProgram, o: LabOverrides): BrushProgram {
  const candidate: BrushProgram = {
    ...base,
    tip: pickTip(base.tip, o),
    deposition: pickDeposition(base.deposition, o),
    paper: {
      ...base.paper,
      enabled: o.grain ?? base.paper.enabled,
      filter: o.filter ?? base.paper.filter,
    },
    strokeDynamics: {
      ...base.strokeDynamics,
      scatter: {
        ...base.strokeDynamics.scatter,
        positionPx: o.scatterPx ?? base.strokeDynamics.scatter.positionPx,
      },
    },
    colorDynamics: {
      ...base.colorDynamics,
      kmMixing: o.kmBeta ?? base.colorDynamics.kmMixing,
    },
    wet: o.wetBeta === undefined ? base.wet : o.wetBeta ? (base.wet ?? DEFAULT_WET_PARAMS) : null,
    input:
      o.stabilizer === undefined
        ? base.input
        : {
            ...base.input,
            oneEuro: {
              position: stabilizerToOneEuro(o.stabilizer),
              pressure: base.input.oneEuro?.pressure ?? { minCutoff: 5.0, beta: 0.02, dCutoff: 1.0 },
              tilt: base.input.oneEuro?.tilt ?? { minCutoff: 2.0, beta: 0.01, dCutoff: 1.0 },
            },
          },
  };
  return normalizeProgram(candidate);
}

/** 오버라이드가 하나라도 있는지. */
export function hasOverrides(o: LabOverrides): boolean {
  return Object.values(o).some((v) => v !== undefined);
}
