import { WET_FRAME_MS } from "../raster/reference-renderer";
import { DEFAULT_PAPER_SPEC } from "../texture/paper-grain";
import { OIL_LEVEL_RATE, OIL_YIELD_SCALE } from "../wet/oil-layer";
import { fiberLinkBlocking } from "../wet/paper-wet";
import { makeWaterKernel } from "../wet/step-water";

import { PAPER_WET_FLOATS } from "./layout";

import type { WetKernelValues } from "./layout";
import type { BrushProgram } from "../presets/program-schema";
import type { PaperField } from "../texture/paper-grain";
import type { WetParams } from "../wet/params";

/**
 * 습식 서브스텝 상수의 호스트 계산(uniform `wet_kernel`로 올린다). 값의 단일 원천은 CPU 참조다:
 *  - 수채 계열: `wet/step-water.ts` `makeWaterKernel(params, hMs)`(33개 f32) + `fiberLinkBlocking`(섬유 κ∥·κ⊥)
 *  - 종이 샘플 스펙: CPU `stepWet`이 쓰는 `DEFAULT_PAPER_SPEC`(scale·회전·필터·시드; 종이 회전의 cos/sin은 호스트 Math.cos/sin)
 *  - 유화: `fine-raster.ts` `applyImpastoDabs`(밀기 비율 oilDepth·(1 − viscosity), 패스 수 1 + ⌊2(1 − viscosity)⌋)와
 *    `oil-layer.ts` `stepOil`(레벨링 유량·항복 높이·건조 감쇠)
 * GPU는 f32로 받아 같은 식을 쓴다.
 */

/** 서브스텝 수(CPU `stepWet`과 같다). */
export function wetSubsteps(wet: WetParams): number {
  return Math.max(1, Math.floor(wet.substeps));
}

/** 서브스텝 길이(ms): 프레임 시간 / 서브스텝 수. */
export function wetSubstepMs(wet: WetParams): number {
  return WET_FRAME_MS / wetSubsteps(wet);
}

/** 유화 밀기 패스 수(CPU `applyImpastoDabs`). */
export function oilPassesOf(wet: WetParams): number {
  const visc = Math.min(1, Math.max(0, wet.viscosity));
  return 1 + Math.floor((1 - visc) * 2);
}

/** 유화 밀기 비율 oilDepth·(1 − viscosity)(CPU `applyImpastoDabs`). */
export function oilPushOf(wet: WetParams): number {
  const visc = Math.min(1, Math.max(0, wet.viscosity));
  return wet.oilDepth * (1 - visc);
}

/** 습식 프로그램 → `wet_kernel` 값(습식이 아니면 null). */
export function wetKernelValues(program: BrushProgram): WetKernelValues | null {
  const wet = program.wet;
  if (!wet) return null;
  const hMs = wetSubstepMs(wet);
  const k = makeWaterKernel(wet, hMs);
  const blk = fiberLinkBlocking(wet.fiberBlocking, wet.fiberAnisotropy);
  const spec = DEFAULT_PAPER_SPEC;
  const scale = spec.scale > 0 ? spec.scale : 1;
  const values: WetKernelValues = {
    surf_tension: k.surfTension,
    alpha: k.alpha,
    beta: k.beta,
    cap_scale: k.capScale,
    dc: k.dc,
    theta_c: k.thetaC,
    kc: k.kc,
    es: k.es,
    ef: k.ef,
    ec: k.ec,
    dry_tail: k.dryTail,
    edge_boost: k.edgeBoost,
    eta_edge: k.etaEdge,
    kh_flow: k.khFlow,
    g_ax: k.gAx,
    g_ay: k.gAy,
    dp: k.dp,
    inv_gref: k.invGref,
    grain_drift: k.grainDrift,
    edge_drift: k.edgeDrift,
    lambda_k: k.lambda,
    rho_k: k.rhoK,
    omega_k: k.omegaK,
    pin: k.pin,
    gran: k.gran,
    glue_gain: k.glueGain,
    dry_brush: k.dryBrush,
    rewet: k.rewet,
    cure_limit: k.cureLimit,
    s_wake: k.sWake,
    hf: k.hf,
    omega_lbm: k.omegaLbm,
    tau: k.tau,
    fiber_par: blk.parallel,
    fiber_perp: blk.perpendicular,
    fiber_k0: wet.fiberBlocking,
    fiber_rough: wet.fiberRoughness,
    fiber_seed: spec.seed >>> 0,
    paper_scale_w: scale,
    paper_cos: Math.cos(spec.rotationRad),
    paper_sin: Math.sin(spec.rotationRad),
    paper_rot: spec.rotationRad,
    paper_nearest: spec.filter === "nearest" ? 1 : 0,
    oil_push: oilPushOf(wet),
    oil_passes: oilPassesOf(wet),
    oil_mixing: wet.oilMixing,
    oil_pickup: wet.oilPickup,
    oil_rate: OIL_LEVEL_RATE * (1 - wet.viscosity) * (hMs / (1000 / 60)),
    oil_yield_h: wet.oilYield * OIL_YIELD_SCALE,
    oil_decay: 1 - Math.min(1, hMs / Math.max(1, wet.dryingMs)),
  };
  return values;
}

/** 종이 필드 → f32 인터리브(bump, absorb, direction) 버퍼 데이터. 길이 = PAPER_WET_FLOATS. */
export function encodePaperWet(field: PaperField): Float32Array {
  const n = field.size * field.size;
  if (n * 3 !== PAPER_WET_FLOATS) throw new RangeError(`paper_wet needs a ${Math.sqrt(PAPER_WET_FLOATS / 3)}² field, got ${field.size}²`);
  const out = new Float32Array(PAPER_WET_FLOATS);
  for (let i = 0; i < n; i += 1) {
    out[i * 3] = field.bump[i] ?? 0;
    out[i * 3 + 1] = field.absorb[i] ?? 0;
    out[i * 3 + 2] = field.direction[i] ?? 0;
  }
  return out;
}
