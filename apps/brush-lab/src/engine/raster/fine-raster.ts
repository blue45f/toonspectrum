import { evalCurve } from "../core/curve";
import { hashNoise2D } from "../core/rng";
import { samplePaper } from "../texture/paper-grain";
import { lodFor, sampleMask } from "../texture/sampling";
import { pushHeightField, wetHeightAccess } from "../wet/impasto";
import { WET_CH } from "../wet/state";

import { superellipseCoverage } from "./coverage";
import { dabExtentPx, dabTileBounds, MAX_TILES_PER_DAB_DEFAULT, TILE_PIXELS, TILE_SIZE, tileRefs } from "./tile-binning";

import type { BinResult } from "./tile-binning";
import type { Curve } from "../core/curve";
import type { DabBatch } from "../core/dab-layout";
import type { DabInstance, TipKind } from "../core/types";
import type { BrushProgram } from "../presets/program-schema";
import type { PaperField } from "../texture/paper-grain";
import type { TipMask } from "../texture/tip-generators";
import type { WetState, WetTile } from "../wet/state";

/**
 * CPU 참조 fine 래스터라이저. GPU `raster_tile`과 같은 수식·순서:
 * 픽셀(16×16) 루프 × refs(dab 인덱스 오름차순) 루프 → cov × 팁 마스크 × 그레인 응답 → src = color·cov·flow
 * → strokeTile = over(src, strokeTile) (선형 premultiplied f32).
 * - erase: 알파만 누적(합성 시 문서 알파를 깎는다)
 * - smudge: 문서에서 픽업한 색을 src로
 * - wet-flow: wetTile.water += wet·cov, pigment += pigmentMass·cov (획 레이어 침착은 (1 − 0.6·wet)배)
 * - impasto: 높이장은 타일을 가로지르므로 타일 루프가 아니라 `applyImpastoDabs`가 dab 순서로 처리한다
 *   (기존 높이를 dab 진행 방향(angle)으로 cov·mask·IMPASTO_PUSH·(1 − viscosity)만큼 밀고(부피 보존),
 *   height += cov·mask·grain·flow·max(0.25, pigmentMass)). 타일 국소 밀기는 타일 경계에 물감이 쌓여
 *   격자 무늬를 만들었다(2026-10-01 수정). GPU `FLAG_IMPASTO` 분기는 누적만 하며 밀기는 CPU 전용 베타다.
 */

/** 임파스토 밀기 비율(커버리지 1·점성 0에서 픽셀 높이의 이동 비율). */
export const IMPASTO_PUSH = 0.5;
export interface RasterContext {
  program: BrushProgram;
  tipChain: Record<TipKind, TipMask[]>;
  paper: PaperField | null;
  document: Float32Array | null;
  width: number;
  height: number;
  tilesX: number;
  tilesY: number;
  seed: number;
  wet?: WetState | null;
  /** accumulate()가 채우는 언팩 캐시. 없으면 batch에서 직접 복원한다. */
  dabs?: DabInstance[];
  /** smudge: dab i가 내려놓는 운반 색(premultiplied, i·4). accumulate()가 획 순서대로 채운다. */
  smudgeColors?: Float32Array;
  /** smudge: 획 동안 붓이 들고 있는 색(픽업 버퍼). beginStroke마다 새로 만든다. */
  smudgeCarry?: { rgba: [number, number, number, number]; loaded: boolean };
}

/** smudge 침착 강도(운반 색 × 커버리지 × flow × 이 값). GPU `SMUDGE_STRENGTH`와 같다. */
export const SMUDGE_STRENGTH = 0.7;
/**
 * smudge 픽업 비율(기준 간격당): 붓이 반경의 SMUDGE_PICKUP_SPACING만큼 진행할 때
 * 붓 색 ← lerp(붓 색, 문서 색, SMUDGE_PICKUP). dab 간격이 더 촘촘하면 dab당 비율을
 * 1 − (1 − SMUDGE_PICKUP)^(spacing / SMUDGE_PICKUP_SPACING)으로 줄여 **진행 거리당** 픽업량을 같게 유지한다
 * (간격 0.1·r인 붓이 2 px 만에 색을 다 잃는 것을 막는다).
 */
export const SMUDGE_PICKUP = 0.5;
export const SMUDGE_PICKUP_SPACING = 0.5;

/** dab 간격(반경 비율)에 대한 dab당 픽업 비율. 간격이 0 이하면 0(픽업 없음). */
export function smudgePickupPerDab(spacing: number): number {
  if (!(spacing > 0)) return 0;
  return f(1 - (1 - SMUDGE_PICKUP) ** (spacing / SMUDGE_PICKUP_SPACING));
}

const f = Math.fround;

function isIdentityCurve(curve: readonly number[]): boolean {
  if (curve.length === 2) return curve[0] === 0 && curve[1] === 1;
  for (let i = 0; i < curve.length; i += 1) {
    if (Math.abs((curve[i] ?? 0) - i / (curve.length - 1)) > 1e-9) return false;
  }
  return true;
}

/** 문서에서 dab 중심 주변 3×3 평균(premultiplied)을 픽업한다. */
export function pickupColor(doc: Float32Array, width: number, height: number, cx: number, cy: number): [number, number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let n = 0;
  const ix = Math.floor(cx);
  const iy = Math.floor(cy);
  for (let oy = -1; oy <= 1; oy += 1) {
    const y = iy + oy;
    if (y < 0 || y >= height) continue;
    for (let ox = -1; ox <= 1; ox += 1) {
      const x = ix + ox;
      if (x < 0 || x >= width) continue;
      const o = (y * width + x) * 4;
      r += doc[o] ?? 0;
      g += doc[o + 1] ?? 0;
      b += doc[o + 2] ?? 0;
      a += doc[o + 3] ?? 0;
      n += 1;
    }
  }
  if (n === 0) return [0, 0, 0, 0];
  return [f(r / n), f(g / n), f(b / n), f(a / n)];
}

export function unpackAll(batch: DabBatch): DabInstance[] {
  const out: DabInstance[] = new Array<DabInstance>(batch.count);
  for (let i = 0; i < batch.count; i += 1) out[i] = batch.at(i);
  return out;
}

/**
 * smudge 운반 색을 dab 순서대로 계산한다(Chu 2010 픽업 맵 개념의 1픽셀 버퍼판, 코드 미복제).
 * dab i는 현재 붓 색을 내려놓고, 그 자리의 문서 색(3×3 평균)을 smudgePickupPerDab(spacing) 비율로 집어 든다.
 * 첫 dab에서는 붓이 비어 있으므로 그 자리 색을 먼저 집고 아무것도 내려놓지 않는다(투명).
 * 문서는 획 중에 바뀌지 않으므로(endStroke에서 합성) 결과는 dab 순서에만 의존해 결정적이다.
 */
export function computeSmudgeColors(dabs: readonly DabInstance[], ctx: RasterContext): Float32Array {
  const out = new Float32Array(dabs.length * 4);
  const doc = ctx.document;
  if (!doc) return out;
  const carry = ctx.smudgeCarry ?? { rgba: [0, 0, 0, 0], loaded: false };
  ctx.smudgeCarry = carry;
  const pickup = smudgePickupPerDab(ctx.program.deposition.spacing);
  for (let i = 0; i < dabs.length; i += 1) {
    const dab = dabs[i];
    if (!dab || !dab.smudge) continue;
    const local = pickupColor(doc, ctx.width, ctx.height, dab.x, dab.y);
    if (!carry.loaded) {
      carry.rgba = local;
      carry.loaded = true;
      continue;
    }
    out[i * 4] = carry.rgba[0];
    out[i * 4 + 1] = carry.rgba[1];
    out[i * 4 + 2] = carry.rgba[2];
    out[i * 4 + 3] = carry.rgba[3];
    carry.rgba = [
      f(carry.rgba[0] + (local[0] - carry.rgba[0]) * pickup),
      f(carry.rgba[1] + (local[1] - carry.rgba[1]) * pickup),
      f(carry.rgba[2] + (local[2] - carry.rgba[2]) * pickup),
      f(carry.rgba[3] + (local[3] - carry.rgba[3]) * pickup),
    ];
  }
  return out;
}

/** dab 1개의 픽셀 셰이딩 준비물(팁 마스크 LOD·이방성·회전·에지 곡선). 래스터와 임파스토 패스가 공유한다. */
export interface DabShadePrep {
  /** AABB 반경(px). */
  extent: number;
  chain: readonly TipMask[];
  useMask: boolean;
  lod: number;
  aniso: { dirU: number; dirV: number; ratio: number } | undefined;
  /** cos/sin(dab.angle). */
  c: number;
  s: number;
  worldAligned: boolean;
  curve: Curve;
  useCurve: boolean;
}

/** `shadeDabPixel`의 출력(재사용 객체; 호출 사이에 값이 덮어쓰인다). */
export interface DabPixelShade {
  /** 해석적 커버리지(에지 곡선 적용 후). */
  cov: number;
  /** 팁 마스크 샘플(마스크가 없으면 1). */
  mask: number;
  /** 종이 그레인 응답 1 − grain·(1 − bump)(그레인이 없으면 1). */
  grain: number;
}

export function prepareDabShade(dab: DabInstance, ctx: RasterContext): DabShadePrep {
  const rmin = Math.min(dab.rx, dab.ry);
  const rmax = Math.max(dab.rx, dab.ry);
  const chain = ctx.tipChain[dab.tipKind];
  const useMask = dab.tipKind !== "round" && chain.length > 0;
  const anisoRatio = rmax / Math.max(rmin, 1e-3);
  const curve = ctx.program.edge.curve;
  return {
    extent: dabExtentPx(dab),
    chain,
    useMask,
    lod: useMask ? lodFor((2 * rmin) / (chain[0]?.size ?? 1)) : 0,
    aniso: anisoRatio > 1.01 ? { dirU: dab.rx >= dab.ry ? 1 : 0, dirV: dab.rx >= dab.ry ? 0 : 1, ratio: anisoRatio } : undefined,
    c: Math.cos(dab.angle),
    s: Math.sin(dab.angle),
    worldAligned: dab.deposition === "hatch-halftone",
    curve,
    useCurve: !isIdentityCurve(curve),
  };
}

/**
 * 픽셀 중심 (px, py)의 커버리지·팁 마스크·그레인을 계산한다. 맞지 않으면(cov ≤ 0 또는 mask ≤ 0) false.
 * `rasterizeTile`의 인라인 계산과 같은 순서·같은 f32 반올림이다(GPU `shade_dab` 미러).
 */
export function shadeDabPixel(
  dab: DabInstance,
  prep: DabShadePrep,
  ctx: RasterContext,
  px: number,
  py: number,
  out: DabPixelShade,
): boolean {
  const dx = px - dab.x;
  const dy = py - dab.y;
  if (dy > prep.extent || dy < -prep.extent || dx > prep.extent || dx < -prep.extent) return false;
  let cov = superellipseCoverage(dx, dy, dab);
  if (cov <= 0) return false;
  if (prep.useCurve) cov = f(evalCurve(prep.curve, cov));
  let m = 1;
  if (prep.useMask) {
    let u: number;
    let v: number;
    if (prep.worldAligned) {
      const pu = px / (2 * dab.rx);
      const pv = py / (2 * dab.ry);
      u = pu - Math.floor(pu);
      v = pv - Math.floor(pv);
    } else {
      const lu = dx * prep.c + dy * prep.s;
      const lv = -dx * prep.s + dy * prep.c;
      u = (lu / dab.rx) * 0.5 + 0.5;
      v = (lv / dab.ry) * 0.5 + 0.5;
    }
    m = sampleMask(prep.chain, u, v, prep.lod, ctx.program.paper.filter, prep.aniso);
    if (m <= 0) return false;
  }
  let grain = 1;
  if (dab.grain > 0 && ctx.paper) {
    const bump = samplePaper(ctx.paper, px, py, ctx.program.paper).bump;
    grain = f(1 - dab.grain * (1 - bump));
  }
  out.cov = cov;
  out.mask = m;
  out.grain = grain;
  return true;
}

/** 임파스토 높이 누적의 최소 질량 계수(안료 질량이 작아도 두께가 쌓인다). */
export const IMPASTO_MIN_MASS = 0.25;

/**
 * 임파스토 패스(CPU 참조): dab 순서대로 (1) 기존 높이를 진행 방향으로 밀고(타일 경계를 넘는 부피 보존 gather)
 * (2) 같은 dab의 침착량을 더한다. 밀기·침착 모두 cov·팁 마스크(·그레인)를 따르므로 붓모 가닥이 지난 자리는
 * 골, 가닥 사이는 능선으로 남는다(furrow). 타일 래스터와 독립이라 색 누적 결과에는 영향이 없다.
 * 오버플로 dab(타일 수 상한 초과)은 래스터와 같이 건너뛴다.
 */
export function applyImpastoDabs(wet: WetState, dabs: readonly DabInstance[], ctx: RasterContext): void {
  const prog = ctx.program;
  if (!prog.wet) return;
  const access = wetHeightAccess(wet);
  const push = IMPASTO_PUSH * (1 - Math.min(1, Math.max(0, prog.wet.viscosity)));
  const shade: DabPixelShade = { cov: 0, mask: 1, grain: 1 };
  for (const dab of dabs) {
    if (!dab.impasto) continue;
    const bounds = dabTileBounds(dab, ctx.tilesX, ctx.tilesY);
    if (!bounds) continue;
    if ((bounds.x1 - bounds.x0 + 1) * (bounds.y1 - bounds.y0 + 1) > MAX_TILES_PER_DAB_DEFAULT) continue;
    const prep = prepareDabShade(dab, ctx);
    const x0 = Math.max(0, Math.floor(dab.x - prep.extent));
    const x1 = Math.min(ctx.width - 1, Math.ceil(dab.x + prep.extent));
    const y0 = Math.max(0, Math.floor(dab.y - prep.extent));
    const y1 = Math.min(ctx.height - 1, Math.ceil(dab.y + prep.extent));
    if (x1 < x0 || y1 < y0) continue;
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const amount = new Float32Array(w * h);
    const deposit = new Float32Array(w * h);
    const mass = Math.max(IMPASTO_MIN_MASS, dab.pigmentMass);
    let any = false;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (!shadeDabPixel(dab, prep, ctx, x + 0.5, y + 0.5, shade)) continue;
        const i = (y - y0) * w + (x - x0);
        amount[i] = f(shade.cov * shade.mask * push);
        deposit[i] = f(shade.cov * shade.mask * shade.grain * dab.flow * mass);
        any = true;
      }
    }
    if (!any) continue;
    if (push > 0) {
      pushHeightField(access, ctx.width, ctx.height, { x0, y0, x1, y1 }, prep.c, prep.s, (px, py) => amount[(py - y0) * w + (px - x0)] ?? 0);
    }
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const d = deposit[(y - y0) * w + (x - x0)] ?? 0;
        if (d > 0) access.set(x, y, f(access.get(x, y) + d));
      }
    }
  }
}

export function rasterizeTile(
  tile: number,
  bin: BinResult,
  batch: DabBatch,
  ctx: RasterContext,
  strokeTile: Float32Array,
  wetTile: Float32Array | null,
): void {
  const dabs = ctx.dabs ?? unpackAll(batch);
  const refs = tileRefs(bin, tile);
  if (refs.length === 0) return;
  const tx = tile % ctx.tilesX;
  const ty = Math.floor(tile / ctx.tilesX);
  const px0 = tx * TILE_SIZE;
  const py0 = ty * TILE_SIZE;
  const wetView: WetTile | null = wetTile ? sliceWet(wetTile) : null;
  const smudgeStrength = SMUDGE_STRENGTH;
  const smudgeColors = ctx.smudgeColors ?? (dabs.some((d) => d.smudge) ? computeSmudgeColors(dabs, ctx) : null);
  const shade: DabPixelShade = { cov: 0, mask: 1, grain: 1 };

  for (let k = 0; k < refs.length; k += 1) {
    const dabIndex = refs[k] ?? 0;
    const dab = dabs[dabIndex];
    if (!dab) continue;
    const prep = prepareDabShade(dab, ctx);
    const e = prep.extent;
    const pick: [number, number, number, number] | null =
      dab.smudge && smudgeColors
        ? [
            smudgeColors[dabIndex * 4] ?? 0,
            smudgeColors[dabIndex * 4 + 1] ?? 0,
            smudgeColors[dabIndex * 4 + 2] ?? 0,
            smudgeColors[dabIndex * 4 + 3] ?? 0,
          ]
        : null;
    if (pick && pick[3] <= 0) continue;
    const isSpray = dab.deposition === "spray";
    const wetFactor = dab.deposition === "wet-flow" ? 1 - 0.6 * dab.wet : 1;
    // 안료 색(unpremultiplied 선형)
    const pr = dab.a > 0 ? dab.r / dab.a : 0;
    const pg = dab.a > 0 ? dab.g / dab.a : 0;
    const pb = dab.a > 0 ? dab.b / dab.a : 0;

    for (let ly = 0; ly < TILE_SIZE; ly += 1) {
      const py = py0 + ly + 0.5;
      const dy = py - dab.y;
      if (dy > e || dy < -e) continue;
      for (let lx = 0; lx < TILE_SIZE; lx += 1) {
        const px = px0 + lx + 0.5;
        const dx = px - dab.x;
        if (dx > e || dx < -e) continue;
        if (!shadeDabPixel(dab, prep, ctx, px, py, shade)) continue;
        let cov = shade.cov;
        const m = shade.mask;
        const grainResp = shade.grain;
        if (isSpray) {
          const h = hashNoise2D(Math.floor(px), Math.floor(py), dab.seed);
          if (h > 0.3 * cov + 0.1) continue;
          cov = 1;
        }
        const alpha = f(cov * m * grainResp * dab.flow);
        if (alpha <= 0) continue;
        const o = (ly * TILE_SIZE + lx) * 4;
        let sr: number;
        let sg: number;
        let sb: number;
        let sa: number;
        if (dab.erase) {
          sr = 0;
          sg = 0;
          sb = 0;
          sa = alpha;
        } else if (pick) {
          const sm = f(alpha * smudgeStrength);
          sr = f(pick[0] * sm);
          sg = f(pick[1] * sm);
          sb = f(pick[2] * sm);
          sa = f(pick[3] * sm);
        } else {
          const w = f(alpha * wetFactor);
          sr = f(dab.r * w);
          sg = f(dab.g * w);
          sb = f(dab.b * w);
          sa = f(dab.a * w);
        }
        const kInv = f(1 - sa);
        strokeTile[o] = f(sr + (strokeTile[o] ?? 0) * kInv);
        strokeTile[o + 1] = f(sg + (strokeTile[o + 1] ?? 0) * kInv);
        strokeTile[o + 2] = f(sb + (strokeTile[o + 2] ?? 0) * kInv);
        strokeTile[o + 3] = f(sa + (strokeTile[o + 3] ?? 0) * kInv);
        if (wetView) {
          const local = ly * TILE_SIZE + lx;
          if (dab.deposition === "wet-flow") {
            wetView.water[local] = f((wetView.water[local] ?? 0) + dab.wet * cov);
            const mass = f(dab.pigmentMass * cov * m);
            wetView.pigment[3 * TILE_PIXELS + local] = f((wetView.pigment[3 * TILE_PIXELS + local] ?? 0) + mass);
            wetView.pigment[local] = f((wetView.pigment[local] ?? 0) + pr * mass);
            wetView.pigment[TILE_PIXELS + local] = f((wetView.pigment[TILE_PIXELS + local] ?? 0) + pg * mass);
            wetView.pigment[2 * TILE_PIXELS + local] = f((wetView.pigment[2 * TILE_PIXELS + local] ?? 0) + pb * mass);
          }
        }
      }
    }
  }
}

function sliceWet(data: Float32Array): WetTile {
  const n = TILE_PIXELS;
  return {
    water: data.subarray(WET_CH.water * n, (WET_CH.water + 1) * n),
    velocity: data.subarray(WET_CH.velocityX * n, (WET_CH.velocityY + 1) * n),
    pigment: data.subarray(WET_CH.pigmentR * n, (WET_CH.pigmentMass + 1) * n),
    height: data.subarray(WET_CH.height * n, (WET_CH.height + 1) * n),
    fixed: data.subarray(WET_CH.fixedR * n, (WET_CH.fixedMass + 1) * n),
  };
}
