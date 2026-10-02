import { FAMILY_TARGETS } from "../../engine/presets/families";

import type { ThresholdOp, ThresholdRule, Verdict } from "./report-schema";
import type { BrushFamily } from "../../engine/presets/program-schema";
import type { LaneKind } from "../../lanes/lane";
import type { FixtureId } from "../fixtures/stroke-fixtures";

/**
 * 임계값 표와 판정. 전역 임계값(렌더·필기감)과 가족별 임계값(`FAMILY_TARGETS`)을 병합한다.
 *
 * 임계값 ID는 `<group>.<metric>[:<qualifier>]`다. qualifier는 같은 지표에 상·하한을 함께 걸 때 쓰며
 * 판정 시 `:` 뒤를 떼고 지표 키를 찾는다(예: `family.strandSeparation`, `family.strandSeparation:max`).
 * 측정값이 null·비유한이면 UNAVAILABLE, 아니면 op·threshold로 PASS/FAIL.
 */

export type ThresholdRequirement =
  | "reference"
  | "determinism"
  | "pressure-variation"
  | "hi-res"
  | "taper";

export interface ThresholdSpec extends ThresholdRule {
  /** `<group>.<metric>[:<qualifier>]`. */
  id: string;
  /** 적용 fixture. 없으면 전부. */
  fixtures?: readonly FixtureId[];
  /** 적용 레인 종류. 없으면 전부. */
  laneKinds?: readonly LaneKind[];
  /** 적용 전제(참조 레인·재실행 등). 없으면 조건 없음. */
  requires?: ThresholdRequirement;
  /** 한글 설명(출처: 스펙 §16·필기감 설계 §3·연구 수치 목표). */
  description: string;
}

const PRESSURE_FIXTURES: readonly FixtureId[] = ["slow-pressure-ramp", "spiral"];
const STRAIGHT_FIXTURES: readonly FixtureId[] = ["line", "tilt-sweep", "slow-pressure-ramp", "tremor"];
const CANDIDATE_KINDS: readonly LaneKind[] = ["candidate", "comparison"];

export const GLOBAL_THRESHOLDS: readonly ThresholdSpec[] = [
  {
    id: "render.edgeStaircaseEnergy",
    op: "<=",
    threshold: 0.5,
    description: "경계 전이 중 부분 커버리지 없이 0→max로 건너뛰는 직접 전이 비율(이진 계단 에지 = 1, 해석적 AA ≈ 0)",
  },
  {
    id: "render.opacityAccumulationError",
    op: "<=",
    threshold: 0.01,
    description: "같은 자리 10회 dab의 누적 알파가 opacity·(1 − (1 − flow)^10)과 일치(CPU 참조 합성 검사)",
  },
  {
    id: "render.fuzzyMismatchPct",
    op: "<=",
    threshold: 0.5,
    requires: "reference",
    description: "참조 레인 대비 δ48 3×3 이웃 퍼지 불일치율(%)",
  },
  {
    id: "render.deltaEP99",
    op: "<=",
    threshold: 1.0,
    requires: "reference",
    description: "참조 레인 대비 CIE76 ΔE 99백분위",
  },
  {
    id: "render.determinism",
    op: ">=",
    threshold: 1,
    requires: "determinism",
    description: "같은 입력 재실행 픽셀 해시 동일(1) / 상이(0)",
  },
  {
    id: "handfeel.latencyP95Ms",
    op: "<=",
    threshold: 16.7,
    laneKinds: CANDIDATE_KINDS,
    description: "입력→제출 + 프레임 시간 p95 ≤ 1프레임(연구 수치 목표; 기준선 레인은 보고만)",
  },
  {
    id: "handfeel.pressureMonotonicity",
    op: ">=",
    threshold: 0.95,
    fixtures: ["slow-pressure-ramp"],
    requires: "pressure-variation",
    description: "압력 램프 상승 구간 선폭의 스피어만 단조성",
  },
  {
    id: "handfeel.pressureLinearityR2",
    op: ">=",
    threshold: 0.9,
    fixtures: ["slow-pressure-ramp"],
    requires: "pressure-variation",
    description: "선폭 ~ p^γ 거듭제곱 적합 R²(필기감 설계 §3)",
  },
  {
    id: "handfeel.hysteresisWidth",
    op: "<=",
    threshold: 0.15,
    fixtures: ["slow-pressure-ramp"],
    requires: "pressure-variation",
    description: "삼각파 압력 상승/하강 선폭 루프 면적 / (wMax·Δp); 먹붓 8–15 %까지 허용",
  },
  {
    id: "handfeel.slowSpeedJitterRms",
    op: "<=",
    threshold: 0.5,
    fixtures: ["tremor"],
    description: "저속 떨림 fixture의 이미지 중심선 3차 detrend 잔차 RMS(px)",
  },
  {
    id: "handfeel.cornerDeviationPx",
    op: "<=",
    threshold: 1.5,
    fixtures: ["corner-square", "zigzag"],
    description: "모서리 정점과 이미지 중심선의 최소 거리 최대값(px)",
  },
  {
    id: "handfeel.cornerOvershootPx",
    op: "<=",
    threshold: 1.0,
    fixtures: ["corner-square", "zigzag"],
    description: "모서리 정점을 지나 진입 방향으로 뻗은 중심선 길이(px)",
  },
  {
    id: "handfeel.taperEndWidthRatio",
    op: "<=",
    threshold: 0.15,
    fixtures: ["fast-flick", "line"],
    requires: "taper",
    description: "끝 테이퍼 마지막 선폭 / 최대 선폭(필기감 설계 §3: ≤ 15 %)",
  },
  {
    id: "handfeel.speedConsistencyCv",
    op: "<=",
    threshold: 0.15,
    fixtures: ["spiral", "curve"],
    description: "속도 구간별 단면 잉크 질량의 변동계수",
  },
  {
    id: "texture.resolutionConsistency",
    op: "<=",
    threshold: 3.0,
    requires: "hi-res",
    description: "2배 캔버스 렌더를 다운샘플한 결과와의 평균 ΔE",
  },
];

/** 가족 지표별 적용 fixture·전제(측정 가능한 fixture에서만 판정). */
const FAMILY_METRIC_SCOPE: Record<string, Pick<ThresholdSpec, "fixtures" | "requires">> = {
  grainPressureMonotonicity: { fixtures: PRESSURE_FIXTURES, requires: "pressure-variation" },
  edgeTransitionWidthPx: { fixtures: ["line", "zigzag", "corner-square", "tilt-sweep"] },
  taperWidthError: { fixtures: ["line", "fast-flick", "curve"], requires: "taper" },
  airbrushGaussianFit: { fixtures: STRAIGHT_FIXTURES },
};

/** 가족 임계값을 `family.<key>[:max]` ID로 펼친다(같은 키의 두 번째 규칙은 `:max`/`:min`). */
export function familyThresholdSpecs(family: BrushFamily): ThresholdSpec[] {
  const seen = new Map<string, number>();
  const out: ThresholdSpec[] = [];
  for (const target of FAMILY_TARGETS[family].metrics) {
    const n = seen.get(target.key) ?? 0;
    seen.set(target.key, n + 1);
    const qualifier = n === 0 ? "" : target.op === "<=" ? ":max" : ":min";
    const scope = FAMILY_METRIC_SCOPE[target.key] ?? {};
    const spec: ThresholdSpec = {
      id: `family.${target.key}${qualifier}`,
      op: target.op,
      threshold: target.threshold,
      description: `${family} 가족 목표: ${FAMILY_TARGETS[family].goal}`,
    };
    if (scope.fixtures) spec.fixtures = scope.fixtures;
    if (scope.requires) spec.requires = scope.requires;
    out.push(spec);
  }
  return out;
}

export interface ThresholdContext {
  family: BrushFamily;
  fixtureId: string;
  laneKind: LaneKind;
  hasReference: boolean;
  hasDeterminism: boolean;
  hasPressureVariation: boolean;
  hasHiRes: boolean;
  hasTaper: boolean;
}

function requirementMet(req: ThresholdRequirement | undefined, ctx: ThresholdContext): boolean {
  switch (req) {
    case undefined:
      return true;
    case "reference":
      return ctx.hasReference;
    case "determinism":
      return ctx.hasDeterminism;
    case "pressure-variation":
      return ctx.hasPressureVariation;
    case "hi-res":
      return ctx.hasHiRes;
    case "taper":
      return ctx.hasTaper;
  }
}

/** 이 실행에 적용되는 임계값 표(리포트 `thresholds` 필드). */
export function thresholdsFor(ctx: ThresholdContext): Record<string, ThresholdRule> {
  const out: Record<string, ThresholdRule> = {};
  const specs = [...GLOBAL_THRESHOLDS, ...familyThresholdSpecs(ctx.family)];
  for (const spec of specs) {
    if (spec.fixtures && !(spec.fixtures as readonly string[]).includes(ctx.fixtureId)) continue;
    if (spec.laneKinds && !spec.laneKinds.includes(ctx.laneKind)) continue;
    if (!requirementMet(spec.requires, ctx)) continue;
    out[spec.id] = { op: spec.op, threshold: spec.threshold };
  }
  return out;
}

/** 임계값 ID → 지표 키(`:qualifier` 제거). */
export function metricKeyOf(thresholdId: string): string {
  const i = thresholdId.indexOf(":");
  return i < 0 ? thresholdId : thresholdId.slice(0, i);
}

export function compareWithOp(value: number, op: ThresholdOp, threshold: number): boolean {
  return op === ">=" ? value >= threshold : value <= threshold;
}

export interface Judgement {
  verdicts: Record<string, Verdict>;
  verdict: Verdict;
}

/** 지표(평탄화 `<group>.<key>`)와 임계값 표로 판정한다. FAIL > UNAVAILABLE > PASS. */
export function judge(
  metrics: Record<string, number | null | undefined>,
  thresholds: Record<string, ThresholdRule>,
): Judgement {
  const verdicts: Record<string, Verdict> = {};
  let anyFail = false;
  let anyUnavailable = false;
  for (const [id, rule] of Object.entries(thresholds)) {
    const value = metrics[metricKeyOf(id)];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      verdicts[id] = "UNAVAILABLE";
      anyUnavailable = true;
      continue;
    }
    const pass = compareWithOp(value, rule.op, rule.threshold);
    verdicts[id] = pass ? "PASS" : "FAIL";
    if (!pass) anyFail = true;
  }
  return { verdicts, verdict: anyFail ? "FAIL" : anyUnavailable ? "UNAVAILABLE" : "PASS" };
}

/** 개별 판정 목록 → 종합 판정(FAIL > UNAVAILABLE > PASS). */
export function overallVerdict(verdicts: Iterable<Verdict>): Verdict {
  let unavailable = false;
  for (const v of verdicts) {
    if (v === "FAIL") return "FAIL";
    if (v === "UNAVAILABLE") unavailable = true;
  }
  return unavailable ? "UNAVAILABLE" : "PASS";
}
