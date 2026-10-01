import { z } from "zod";

/**
 * 습식 파라미터(베타). 범위·기본값은 스펙 §11 표와 같다.
 * zod는 engine/ 안에서 이 파일과 presets/program-schema.ts에서만 허용된다.
 */
export interface WetParams {
  /** 확산 계수(격자 단위) 0..1. */
  diffusion: number;
  /** ms당 증발 0..0.1. */
  evaporation: number;
  /** 종이 흡수 속도 0..1. */
  capillary: number;
  /** 경계 안료 이류 강도 0..2. */
  edgeDarkening: number;
  /** 요철 침전율 0..1. */
  granulation: number;
  /** 종이 absorb 채널 스케일 0..1. */
  absorptivity: number;
  /** 유화 높이 밀기 감쇠 0..1(확장). */
  viscosity: number;
  /** 0..1(확장). */
  surfaceTension: number;
  /** 건조 시간 100..60000 ms. */
  dryingMs: number;
  /** 흘러내림 방향 [-1..1]²(확장). */
  gravity: [number, number];
  /** 프레임당 스텝 1..8. */
  substeps: number;
}

export const DEFAULT_WET_PARAMS: WetParams = {
  diffusion: 0.25,
  evaporation: 0.004,
  capillary: 0.3,
  edgeDarkening: 0.8,
  granulation: 0.4,
  absorptivity: 0.5,
  viscosity: 0.1,
  surfaceTension: 0.2,
  dryingMs: 4000,
  gravity: [0, 0],
  substeps: 2,
};

export const wetParamsSchema = z.object({
  diffusion: z.number().min(0).max(1).default(DEFAULT_WET_PARAMS.diffusion),
  evaporation: z.number().min(0).max(0.1).default(DEFAULT_WET_PARAMS.evaporation),
  capillary: z.number().min(0).max(1).default(DEFAULT_WET_PARAMS.capillary),
  edgeDarkening: z.number().min(0).max(2).default(DEFAULT_WET_PARAMS.edgeDarkening),
  granulation: z.number().min(0).max(1).default(DEFAULT_WET_PARAMS.granulation),
  absorptivity: z.number().min(0).max(1).default(DEFAULT_WET_PARAMS.absorptivity),
  viscosity: z.number().min(0).max(1).default(DEFAULT_WET_PARAMS.viscosity),
  surfaceTension: z.number().min(0).max(1).default(DEFAULT_WET_PARAMS.surfaceTension),
  dryingMs: z.number().min(100).max(60000).default(DEFAULT_WET_PARAMS.dryingMs),
  gravity: z
    .tuple([z.number().min(-1).max(1), z.number().min(-1).max(1)])
    .default([0, 0]),
  substeps: z.number().int().min(1).max(8).default(DEFAULT_WET_PARAMS.substeps),
});

/** 부분 입력을 기본값으로 채워 검증한다. */
export function normalizeWetParams(input: unknown): WetParams {
  const parsed: WetParams = wetParamsSchema.parse(input ?? {});
  return parsed;
}

/**
 * CPU 참조 커널 상수 — GPU `wet-step.wgsl`이 같은 값을 써야 하는 단일 원천.
 * 사용자 파라미터(`WetParams`)에 곱해지는 내부 스케일이며 프리셋에 노출하지 않는다.
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

/**
 * 2026-10-01 CPU 실험(64² 원판 r=12, 물 1, 3 px 링/내부 침착비): pigmentDiffusionScale 0.12·edgeAdvectionScale 0.25는
 * edgeDarkening 0.8에서 비 0.99(미달), 0.06·0.5는 0.8 → 1.23, 1.0 → 1.32, 1.5 → 1.48(단조)이며 질량 보존 유지.
 * 전선 증발 가중(pinning)은 링을 오히려 약화시켜 채택하지 않았다.
 */
export const WET_KERNEL: WetKernelConstants = {
  waterDiffusionScale: 0.24,
  capillaryScale: 0.002,
  pigmentDiffusionScale: 0.06,
  edgeAdvectionScale: 0.5,
  granulationScale: 0.02,
  heightRelaxScale: 0.05,
};
