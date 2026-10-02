import { BRUSH_FAMILIES } from "./program-schema";

import type { BrushFamily } from "./program-schema";

/**
 * 매체 가족별 품질 목표(스펙 §15 표). 임계값은 자체 정의 기준이며 브라우저 실측 전까지
 * "달성"으로 보고하지 않는다. 벤치 `family-metrics`가 같은 키로 지표를 계산하고 `judge`가
 * 이 표의 `op`·`threshold`로 판정한다.
 */
export const FAMILY_METRIC_KEYS = [
  "grainPressureMonotonicity",
  "edgeTransitionWidthPx",
  "taperWidthError",
  "overlapAccumulationError",
  "edgeDarkeningRatio",
  "granulationContrast",
  "reliefLightingConsistency",
  "airbrushGaussianFit",
  "moireHighFrequencyRatio",
  "smudgeMassConservation",
  "halftoneDotRegularity",
  "strandSeparation",
  "seamScore",
  "eraserColorInvariance",
  "impastoReliefContrast",
] as const;
export type FamilyMetricKey = (typeof FAMILY_METRIC_KEYS)[number];

export type FamilyMetricOp = ">=" | "<=";

export interface FamilyMetricTarget {
  key: FamilyMetricKey;
  op: FamilyMetricOp;
  threshold: number;
}

export interface FamilyQualityTarget {
  family: BrushFamily;
  /** 한글 품질 목표 설명. */
  goal: string;
  metrics: readonly FamilyMetricTarget[];
}

const dryGrain: readonly FamilyMetricTarget[] = [
  { key: "grainPressureMonotonicity", op: ">=", threshold: 0.95 },
];
const inkLine: readonly FamilyMetricTarget[] = [
  { key: "edgeTransitionWidthPx", op: "<=", threshold: 1.2 },
  { key: "taperWidthError", op: "<=", threshold: 0.08 },
];
const opaqueOverlap: readonly FamilyMetricTarget[] = [
  { key: "overlapAccumulationError", op: "<=", threshold: 0.03 },
];
const scatterRange: readonly FamilyMetricTarget[] = [
  // 산포 분산 범위 검사: 가닥 분리도가 0(뭉침)과 1(완전 분산) 사이의 의도 구간에 있어야 한다.
  { key: "strandSeparation", op: ">=", threshold: 0.1 },
  { key: "strandSeparation", op: "<=", threshold: 0.9 },
];
const patternMoire: readonly FamilyMetricTarget[] = [
  { key: "moireHighFrequencyRatio", op: "<=", threshold: 0.35 },
  { key: "halftoneDotRegularity", op: ">=", threshold: 0.9 },
];

export const FAMILY_TARGETS: Record<BrushFamily, FamilyQualityTarget> = {
  pencil: {
    family: "pencil",
    goal: "압력이 오를수록 종이 요철이 메워지는 흑연 침착(그레인 단조성)",
    metrics: dryGrain,
  },
  ballpoint: {
    family: "ballpoint",
    goal: "균일한 세선과 속도 의존 농담, 1 px 안팎의 또렷한 가장자리",
    metrics: inkLine,
  },
  ink: {
    family: "ink",
    goal: "날카로운 해석적 AA 에지와 압력 추종 테이퍼(닙·붓펜)",
    metrics: inkLine,
  },
  marker: {
    family: "marker",
    goal: "반투명 중첩 농담이 이론값(1 − (1 − α)ⁿ)과 일치",
    metrics: [{ key: "overlapAccumulationError", op: "<=", threshold: 0.02 }],
  },
  chalk: {
    family: "chalk",
    goal: "거친 종이 결이 압력에 따라 단조로 채워지는 파스텔 질감",
    metrics: dryGrain,
  },
  charcoal: {
    family: "charcoal",
    goal: "짙은 침착과 강한 요철 응답(압력 단조)",
    metrics: dryGrain,
  },
  conte: {
    family: "conte",
    goal: "고정 각도 납작 팁의 방향성 그레인(압력 단조)",
    metrics: dryGrain,
  },
  crayon: {
    family: "crayon",
    goal: "왁스 그레인이 압력 포화 구간까지 단조 증가",
    metrics: dryGrain,
  },
  watercolor: {
    family: "watercolor",
    goal: "젖은 경계의 에지 다크닝과 요철 침전(그래뉼레이션)",
    metrics: [
      { key: "edgeDarkeningRatio", op: ">=", threshold: 1.15 },
      { key: "granulationContrast", op: ">=", threshold: 0.08 },
    ],
  },
  sumi: {
    family: "sumi",
    goal: "종이 섬유 결을 따라 번지는 먹: 가장자리가 부드럽게 번지고 섬유·붓모 결의 질감 대비가 보인다",
    metrics: [{ key: "granulationContrast", op: ">=", threshold: 0.08 }],
  },
  gouache: {
    family: "gouache",
    goal: "불투명 수성 안료의 중첩 누적이 이론값과 일치",
    metrics: opaqueOverlap,
  },
  oil: {
    family: "oil",
    goal: "임파스토 높이맵의 릴리프 조명이 광원 회전에 일관하고 두꺼운 획의 릴리프 대비가 보인다",
    metrics: [
      { key: "reliefLightingConsistency", op: ">=", threshold: 0.9 },
      // 조명 후 휘도 p95 − p5(습식 설계 §4): 두꺼운 획 ≥ 0.25, 글레이즈 ≤ 0.05. 카탈로그의 oil-impasto는 두꺼운 획.
      { key: "impastoReliefContrast", op: ">=", threshold: 0.25 },
    ],
  },
  acrylic: {
    family: "acrylic",
    goal: "반건식 불투명 중첩 누적이 이론값과 일치",
    metrics: opaqueOverlap,
  },
  airbrush: {
    family: "airbrush",
    goal: "단면 밀도가 가우시안에 적합(R²)",
    metrics: [{ key: "airbrushGaussianFit", op: ">=", threshold: 0.97 }],
  },
  spray: {
    family: "spray",
    goal: "입자 산포가 의도 분산 범위 안에서 재현",
    metrics: scatterRange,
  },
  hatch: {
    family: "hatch",
    goal: "방향 추종 해칭의 모아레 억제",
    metrics: patternMoire,
  },
  halftone: {
    family: "halftone",
    goal: "월드 좌표 고정 망점의 규칙성과 모아레 억제",
    metrics: patternMoire,
  },
  texture: {
    family: "texture",
    goal: "절차 질감 스탬프의 타일 이음새 부재",
    metrics: [{ key: "seamScore", op: "<=", threshold: 0.02 }],
  },
  smudge: {
    family: "smudge",
    goal: "문서 색을 끌 때 총 질량(알파·색 합) 보존",
    metrics: [{ key: "smudgeMassConservation", op: "<=", threshold: 0.02 }],
  },
  eraser: {
    family: "eraser",
    goal: "알파만 감소하고 색 채널은 불변(정확 일치)",
    metrics: [{ key: "eraserColorInvariance", op: "<=", threshold: 0 }],
  },
  special: {
    family: "special",
    goal: "특수 효과 산포·색 지터가 시드 재현 범위 안",
    metrics: scatterRange,
  },
};

/** FAMILY_TARGETS가 모든 가족을 덮는지(테스트·UI 공용). */
export function familyTargetsComplete(): boolean {
  return BRUSH_FAMILIES.every((family) => FAMILY_TARGETS[family]?.family === family);
}

/** 가족에서 쓰는 지표 키 집합(중복 제거, 선언 순서). */
export function metricKeysForFamily(family: BrushFamily): FamilyMetricKey[] {
  const seen = new Set<FamilyMetricKey>();
  for (const m of FAMILY_TARGETS[family].metrics) seen.add(m.key);
  return Array.from(seen);
}
