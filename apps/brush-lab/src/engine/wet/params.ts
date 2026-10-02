import { z } from "zod";

/**
 * 습식 파라미터. zod는 engine/ 안에서 이 파일과 presets/program-schema.ts에서만 허용된다.
 *
 * 매체(`medium`)별 물리 파라미터 묶음은 `wetMediumPreset()`이 설계 보충 문서(§4 표)의 값으로 채운다.
 * 수채·수묵·구아슈는 같은 코어(LBM D2Q9 흐름층 + Curtis식 표면/모세관/침착 층)의 프리셋 차이이고,
 * 유화(`oil`)는 별도 높이장 모델(`oil-layer.ts`)을 쓴다.
 */
export const WET_MEDIA = ["watercolor", "sumi", "gouache", "oil"] as const;
export type WetMedium = (typeof WET_MEDIA)[number];

export interface WetParams {
  /** 매체. `oil`이면 유화 높이장 모델, 나머지는 수채 코어. */
  medium: WetMedium;
  /** 안료 확산 계수(격자 단위) 0..1. */
  diffusion: number;
  /** 표면층 증발률(ms⁻¹) 0..0.1. 흐름·모세관 층은 아래 비율을 곱한다. */
  evaporation: number;
  /** 종이 흡수(표면 → 흐름/모세관) 세기 0..1. 격자 스텝당 흡수율 = 0.5·capillary·absorb(x)·(1 − s/c). */
  capillary: number;
  /** 에지 다크닝 세기 0..2: 젖음 전선의 증발 가중(edgeBoost = 2·값)과 바깥 방향 흐름(Curtis FlowOutward 개념). */
  edgeDarkening: number;
  /** 요철 침전(그래뉼레이션) 세기 0..1: 골 침착 가중과 종이 기울기 방향 흐름. */
  granulation: number;
  /** 종이 모세관 용량 스케일 0..1(0.5 = 기준). */
  absorptivity: number;
  /** 유화 점도 0..1: 밀기 깊이·레벨링 속도 감쇠. */
  viscosity: number;
  /** 표면 장력 0..1: 젖음 전선의 투과율 비선형성(전선 선명도). */
  surfaceTension: number;
  /** 건조 시간(ms) 100..60000: 1차 증발 꼬리와 경화(cure) 시간 척도. */
  dryingMs: number;
  /** 흘러내림 방향 [-1..1]². */
  gravity: [number, number];
  /** 프레임당 스텝 1..8. */
  substeps: number;
  // ---- 종이 섬유(수묵 갈라짐·번짐 이방성) ----
  /** 링크 차단 계수 기준 k0 0..0.9(MoXi 부분 bounce-back 비율). */
  fiberBlocking: number;
  /**
   * 섬유 방향 이방성 0..1: 섬유 정렬 종이에서 확산 반경 이방비 1 − R⊥/R∥가 이 값이 되도록 섬유 방향 링크는 덜,
   * 가로 방향 링크는 더 막는다(k0는 두 방향 차단 계수의 평균으로 유지). 이산화 한계로 약 0.75에서 포화한다.
   */
  fiberAnisotropy: number;
  /** 섬유 단위 무작위 차단 변동 0..1(가지치기·갈라짐). */
  fiberRoughness: number;
  // ---- 3층 물 교환 ----
  /** 흡수된 물 중 모세관층으로 가는 비율 β 0..1(나머지는 흐름층). */
  seepSplit: number;
  /** 모세관층 확산 계수 D_c 0..0.2. */
  capillaryDiffusion: number;
  /** 모세관 확산이 켜지는 포화 문턱 θ_c(용량 대비) 0..1. */
  wetThreshold: number;
  /** 모세관 흡입 세기 k_c 0..0.2(포화가 낮은 쪽으로 흐름 가속). */
  capillaryForce: number;
  /** 흐름층 증발 / 표면층 증발 비. */
  evapFlowRatio: number;
  /** 모세관층 증발 / 표면층 증발 비. */
  evapCapillaryRatio: number;
  // ---- 안료 침착·재습윤 ----
  /** 침착률 ρ_k(스텝당 부유 안료 비율) 0..0.5. */
  depositRate: number;
  /** 재부유율 ω_k 0..0.2(젖은 곳의 침착 안료가 다시 떠오르는 비율). */
  liftRate: number;
  /** 안료 이동도 λ_k 0..1(<1이면 물보다 느려 옅은 후광이 생긴다). */
  pigmentMobility: number;
  /** 섬유 고정(핀닝) 세기 0..1. */
  pinning: number;
  /** 경화 후에도 재습윤 가능한 침착 비율 0..1(0이면 마르면 완전 고정, 수묵). */
  rewet: number;
  /** 아교 효과 0..4: 안료 함량에 비례해 핀닝을 키운다. */
  glueGain: number;
  /** 갈필 문턱 0..1: 물이 종이 요철 × 이 값보다 적은 곳의 부유 안료는 즉시 종이에 걸려 침착한다. */
  dryBrush: number;
  // ---- 유화 ----
  /** Bingham 항복 응력(높이차 문턱) 0..1. */
  oilYield: number;
  /** 붓이 젖은 물감을 집어 드는 비율 0..1(더러워진 붓). */
  oilPickup: number;
  /** 젖은 물감끼리의 KM 혼색 깊이 0..1. */
  oilMixing: number;
  /** 젖은 물감의 광택 가중 0..2. */
  oilGloss: number;
  /** 밀기 깊이(커버리지 1·점도 0에서 이동 비율) 0..1. */
  oilDepth: number;
}

export const DEFAULT_WET_PARAMS: WetParams = {
  medium: "watercolor",
  diffusion: 0.25,
  evaporation: 0.0007,
  capillary: 0.05,
  edgeDarkening: 1.0,
  granulation: 0.5,
  absorptivity: 0.5,
  viscosity: 0.1,
  surfaceTension: 0.2,
  dryingMs: 3000,
  gravity: [0, 0],
  substeps: 2,
  fiberBlocking: 0.35,
  fiberAnisotropy: 0.3,
  fiberRoughness: 0.25,
  seepSplit: 0.4,
  capillaryDiffusion: 0.05,
  wetThreshold: 0.6,
  capillaryForce: 0.02,
  evapFlowRatio: 0.667,
  evapCapillaryRatio: 0.333,
  depositRate: 0.05,
  liftRate: 0.05,
  pigmentMobility: 0.85,
  pinning: 0.04,
  rewet: 0.5,
  glueGain: 0,
  dryBrush: 0,
  oilYield: 0.25,
  oilPickup: 0.3,
  oilMixing: 0.6,
  oilGloss: 0.6,
  oilDepth: 0.5,
};

export const wetParamsSchema = z.object({
  medium: z.enum(WET_MEDIA).default(DEFAULT_WET_PARAMS.medium),
  diffusion: z.number().min(0).max(1).default(DEFAULT_WET_PARAMS.diffusion),
  evaporation: z.number().min(0).max(0.1).default(DEFAULT_WET_PARAMS.evaporation),
  capillary: z.number().min(0).max(1).default(DEFAULT_WET_PARAMS.capillary),
  edgeDarkening: z.number().min(0).max(2).default(DEFAULT_WET_PARAMS.edgeDarkening),
  granulation: z.number().min(0).max(1).default(DEFAULT_WET_PARAMS.granulation),
  absorptivity: z.number().min(0).max(1).default(DEFAULT_WET_PARAMS.absorptivity),
  viscosity: z.number().min(0).max(1).default(DEFAULT_WET_PARAMS.viscosity),
  surfaceTension: z.number().min(0).max(1).default(DEFAULT_WET_PARAMS.surfaceTension),
  dryingMs: z.number().min(100).max(60000).default(DEFAULT_WET_PARAMS.dryingMs),
  gravity: z.tuple([z.number().min(-1).max(1), z.number().min(-1).max(1)]).default([0, 0]),
  substeps: z.number().int().min(1).max(8).default(DEFAULT_WET_PARAMS.substeps),
  fiberBlocking: z.number().min(0).max(0.9).default(DEFAULT_WET_PARAMS.fiberBlocking),
  fiberAnisotropy: z.number().min(0).max(1).default(DEFAULT_WET_PARAMS.fiberAnisotropy),
  fiberRoughness: z.number().min(0).max(1).default(DEFAULT_WET_PARAMS.fiberRoughness),
  seepSplit: z.number().min(0).max(1).default(DEFAULT_WET_PARAMS.seepSplit),
  capillaryDiffusion: z.number().min(0).max(0.2).default(DEFAULT_WET_PARAMS.capillaryDiffusion),
  wetThreshold: z.number().min(0).max(1).default(DEFAULT_WET_PARAMS.wetThreshold),
  capillaryForce: z.number().min(0).max(0.2).default(DEFAULT_WET_PARAMS.capillaryForce),
  evapFlowRatio: z.number().min(0).max(2).default(DEFAULT_WET_PARAMS.evapFlowRatio),
  evapCapillaryRatio: z.number().min(0).max(2).default(DEFAULT_WET_PARAMS.evapCapillaryRatio),
  depositRate: z.number().min(0).max(0.5).default(DEFAULT_WET_PARAMS.depositRate),
  liftRate: z.number().min(0).max(0.2).default(DEFAULT_WET_PARAMS.liftRate),
  pigmentMobility: z.number().min(0).max(1).default(DEFAULT_WET_PARAMS.pigmentMobility),
  pinning: z.number().min(0).max(1).default(DEFAULT_WET_PARAMS.pinning),
  rewet: z.number().min(0).max(1).default(DEFAULT_WET_PARAMS.rewet),
  glueGain: z.number().min(0).max(4).default(DEFAULT_WET_PARAMS.glueGain),
  dryBrush: z.number().min(0).max(1).default(DEFAULT_WET_PARAMS.dryBrush),
  oilYield: z.number().min(0).max(1).default(DEFAULT_WET_PARAMS.oilYield),
  oilPickup: z.number().min(0).max(1).default(DEFAULT_WET_PARAMS.oilPickup),
  oilMixing: z.number().min(0).max(1).default(DEFAULT_WET_PARAMS.oilMixing),
  oilGloss: z.number().min(0).max(2).default(DEFAULT_WET_PARAMS.oilGloss),
  oilDepth: z.number().min(0).max(1).default(DEFAULT_WET_PARAMS.oilDepth),
});

/** 부분 입력을 기본값으로 채워 검증한다. */
export function normalizeWetParams(input: unknown): WetParams {
  const parsed: WetParams = wetParamsSchema.parse(input ?? {});
  return parsed;
}

/**
 * 매체별 물리 파라미터 묶음(설계 보충 §4 표의 값을 이 엔진의 단위로 환산).
 * 환산: 설계의 e_s·e_f·e_c는 "격자 스텝(dt_v = 1/240 s)당"이라 ms⁻¹로 나눠(÷4.1667) `evaporation`과 비로 둔다.
 * edgeBoost = 2·edgeDarkening, γ_k = 1.2·granulation, α = 0.5·capillary, 경화 시간 = 2/3·dryingMs.
 */
const MEDIUM_BASE: Record<WetMedium, Partial<WetParams>> = {
  watercolor: {},
  sumi: {
    diffusion: 0.4,
    evaporation: 0.00096,
    capillary: 0.12,
    edgeDarkening: 1.0,
    granulation: 0.17,
    surfaceTension: 0.3,
    dryingMs: 1500,
    fiberBlocking: 0.55,
    fiberAnisotropy: 0.7,
    fiberRoughness: 0.65,
    seepSplit: 0.3,
    capillaryDiffusion: 0.2,
    wetThreshold: 0.15,
    capillaryForce: 0.03,
    evapFlowRatio: 0.75,
    evapCapillaryRatio: 0.25,
    depositRate: 0.004,
    liftRate: 0.005,
    pigmentMobility: 0.7,
    pinning: 0.015,
    rewet: 0,
    glueGain: 1.2,
    dryBrush: 0.3,
  },
  gouache: {
    diffusion: 0.05,
    evaporation: 0.00096,
    capillary: 0.04,
    edgeDarkening: 0.15,
    granulation: 0,
    surfaceTension: 0.4,
    dryingMs: 2250,
    fiberBlocking: 0.4,
    fiberAnisotropy: 0.2,
    fiberRoughness: 0.15,
    seepSplit: 0.3,
    capillaryDiffusion: 0.02,
    wetThreshold: 0.7,
    capillaryForce: 0.01,
    evapFlowRatio: 0.75,
    evapCapillaryRatio: 0.25,
    depositRate: 0.12,
    liftRate: 0.01,
    pigmentMobility: 0.9,
    pinning: 0.05,
    rewet: 0.05,
    glueGain: 0,
    dryBrush: 0.1,
  },
  oil: {
    diffusion: 0,
    evaporation: 0,
    capillary: 0,
    edgeDarkening: 0,
    granulation: 0,
    viscosity: 0.6,
    dryingMs: 20000,
    substeps: 1,
  },
};

/** 매체의 기본 물리 파라미터에 덮어쓰기를 적용해 검증된 `WetParams`를 돌려준다. */
export function wetMediumPreset(medium: WetMedium, overrides: Partial<WetParams> = {}): WetParams {
  return normalizeWetParams({ ...MEDIUM_BASE[medium], medium, ...overrides });
}

/**
 * CPU 참조 커널 상수 — GPU `wet-step.wgsl`(구 최소 모델)이 단일 원천으로 읽는 값이다.
 * 새 물리(`WET_PHYSICS`)로 바뀐 뒤에도 이 필드와 값은 GPU 계약이라 바꾸지 않는다(GPU 미러 갱신은
 * `docs/drafts/brush-wet-gpu-mirror-spec.md`가 정의한다).
 */
export interface WetKernelConstants {
  /** 물 확산 계수 = waterDiffusionScale·diffusion(스텝당, 명시적 안정 한계 0.25 이하). */
  waterDiffusionScale: number;
  /** 모세관 흡수 = capillary·absorptivity·absorb(paper)·capillaryScale·dt. */
  capillaryScale: number;
  /** 젖은 셀 사이 안료 확산 = pigmentDiffusionScale·diffusion. */
  pigmentDiffusionScale: number;
  /** 마른 쪽 이웃으로의 안료 이류 = edgeAdvectionScale·edgeDarkening·clamp((w − wₙ)/(w + ε)). */
  edgeAdvectionScale: number;
  /** 그래뉼레이션 침전 = granulationScale·granulation·bump. */
  granulationScale: number;
  /** 임파스토 높이 완화 = heightRelaxScale·(1 − viscosity)(스텝당, 부피 보존). */
  heightRelaxScale: number;
}

export const WET_KERNEL: WetKernelConstants = {
  waterDiffusionScale: 0.24,
  capillaryScale: 0.002,
  pigmentDiffusionScale: 0.06,
  edgeAdvectionScale: 0.5,
  granulationScale: 0.02,
  heightRelaxScale: 0.05,
};

/**
 * 새 습식 물리의 내부 상수(프리셋에 노출하지 않는 스케일). GPU 미러가 같은 값을 써야 한다.
 * 값의 근거는 2026-10-01 CPU 실험(`wet/step-water.ts` 머리 주석의 보정 기록)이다.
 */
export const WET_PHYSICS = {
  /** BGK 완화 시간(격자 단위). τ = 1이면 충돌 후 분포가 평형 분포와 같다. */
  lbmTau: 1,
  /** 평형 속도 상한(마하 한계, 격자 단위/스텝). */
  uMax: 0.2,
  /** 링크 투과율이 1이 되는 링크 평균 흐름층 밀도(이보다 옅으면 투과율이 줄어 전선이 선명해진다). */
  rhoFull: 0.02,
  /** 젖음 판정 문턱: 표면+흐름층 물이 이보다 적으면 마른 셀이다. */
  rhoMin: 0.002,
  /** 총 물이 이보다 적으면 0으로 접고 증발량에 가산한다. */
  waterEps: 1e-4,
  /** 표면층 물 상한: 초과분은 곧바로 흐름층으로 흘러든다. */
  surfaceCap: 1.2,
  /** 기준 스텝 길이(ms) = 1000/240. 비율 상수는 이 길이당 값이다. */
  nominalStepMs: 1000 / 240,
  /** 링크 κ 상한. */
  kappaMax: 0.985,
  /** 섬유 줄무늬 길이·폭(px). */
  fiberLengthPx: 9,
  fiberWidthPx: 1.3,
  /** 젖음 블러 B(헬름홀츠 완화)의 유지 계수: 젖은 셀 / 마른 셀. B' = (1 − k)·w + k·평균(이웃 B). */
  wetBlurKeepWet: 0.985,
  wetBlurKeepDry: 0.9,
  /** 이 물 깊이(표면 + 흐름층) 이상이면 젖음 w = 1(이하는 선형). */
  wetBlurFull: 0.05,
  /** B가 이 값 이상인 셀은 가벼운 경로에서 제외된다(활성 유지·모세관 깨움과 같은 기준). */
  wetBlurWake: 0.01,
  /** 안료 에지 이동(Curtis FlowOutward의 안료 쪽 대응) = edgeDriftScale·edgeDarkening·(B_안쪽 − B_바깥쪽)(면 유출 비율). */
  edgeDriftScale: 1,
  /** 에지 바깥 흐름 가속 = edgeFlowScale·edgeDarkening. */
  edgeFlowScale: 0.06,
  /** 전선 증발 가중 = edgeBoostScale·edgeDarkening. */
  edgeBoostScale: 2,
  /** 종이 기울기 방향 흐름 가속 = heightFlowScale·granulation. */
  heightFlowScale: 0.05,
  /** 중력 가속 = gravityScale·gravity. */
  gravityScale: 0.01,
  /** 가속도 상한. */
  accelMax: 0.05,
  /** 안료 확산 = pigmentDiffusionScale·diffusion. */
  pigmentDiffusionScale: 0.06,
  /** 면당 안료 유출 비율 상한(4면 합 ≤ 0.5). */
  faceOutMax: 0.125,
  /** 대각 링크당 안료 유출 비율 상한(4대각 합 ≤ 0.2). */
  diagOutMax: 0.05,
  /** 침착 시 얇은 물막 가중. */
  thinBoost: 1.5,
  /** 얇은 물막 기준 깊이. */
  depthRef: 0.15,
  /** 갈필: 물 깊이가 dryBrush·h(종이 요철)·dryBrushDepth보다 얕은 곳의 부유 안료는 곧바로 종이에 걸려 침착한다. */
  dryBrushDepth: 0.4,
  /** 섬유 포집(핀닝)이 최대가 되는 안료 이동 속도(격자 단위/스텝). 이보다 느리면 속도에 비례해 줄어든다. */
  pinSpeedRef: 0.05,
  /** 정지한 안료도 받는 포집 비율(0..1): 포집 = pin·κ̄·(정지분 + (1 − 정지분)·min(1, |u|/pinSpeedRef)). */
  pinStaticFraction: 0.25,
  /** 그래뉼레이션 골 방향 안료 이동 = grainDriftScale·granulation·(h_높은 쪽 − h_낮은 쪽)(면 유출 비율). */
  grainDriftScale: 1.5,
  /** 그래뉼레이션 γ = granulationGain·granulation. */
  granulationGain: 1.2,
  /** 경화 시간 = cureFraction·dryingMs. */
  cureFraction: 2 / 3,
  /** 모세관 용량 c = (0.4 + 0.6·absorb)·(0.5 + absorptivity). */
  capacityBase: 0.4,
  capacitySpan: 0.6,
} as const;
