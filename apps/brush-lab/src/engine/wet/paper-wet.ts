import { valueNoise2D } from "../core/rng";
import { TILE_SIZE } from "../raster/tile-binning";
import { samplePaper } from "../texture/paper-grain";

import { detCos, detSin } from "./det-math";
import { WET_PHYSICS } from "./params";

import type { WetParams } from "./params";
import type { WetState } from "./state";
import type { PaperField, PaperSpec } from "../texture/paper-grain";

/**
 * 습식용 종이 파생 필드(절차적, 시드 고정). 설계 보충 §1.1:
 * 요철 h, 흡수율 a, 섬유 방향 θ → 링크별 차단 계수. 링크 전도율 g = 1 − κ가 섬유와 링크가 이루는 각 φ에 대해
 * g(φ) = g⊥ + (g∥ − g⊥)·|cos φ|^6 이고(g∥/g⊥는 `fiberConductanceRatio`가 8링크 확산의 반경 이방비 1 − R⊥/R∥ = aniso로
 * 닫힌 형식에서 구한다), 섬유 줄무늬 노이즈 mod가 전도율에 곱해져 κ = clamp(1 − g(φ)·mod, 0, κmax)이다.
 * 섬유 방향 링크는 덜 막혀 물이 섬유를 따라 번지고 섬유를 가로지르는 링크는 막혀 수묵의 갈라진 가장자리가 생긴다.
 *
 * 타일마다 18×18(1셀 헤일로) 패딩 배열을 한 번 만들어 캐시한다. 값은 전역 셀 좌표의 함수라 타일 경계에서 연속이다.
 */

export const PAD_SIZE = TILE_SIZE + 2;
export const PAD_CELLS = PAD_SIZE * PAD_SIZE;

/** 종이 입력: 필드(없으면 균일한 등방 종이)와 샘플링 스펙. */
export interface WetPaperSource {
  field: PaperField | null;
  spec: PaperSpec;
}

export interface TilePaper {
  /** 종이 요철 0..1(패딩 18×18). */
  h: Float32Array;
  /** 흡수율 0..1(패딩). */
  absorb: Float32Array;
  /** 모세관 용량 기본값 0.4 + 0.6·absorb(패딩). 실제 용량 = 기본값·(0.5 + absorptivity). */
  capBase: Float32Array;
  /** 전방 링크 E, S, SE, NE의 κ(패딩, 링크 소유 셀 기준). */
  kappa: readonly [Float32Array, Float32Array, Float32Array, Float32Array];
  /** 셀 주변 4링크 평균 κ(타일 안 16×16 = 256, 핀닝용). */
  kbar: Float32Array;
  /** 전방 링크 κ 4개를 클래스 순서로 이어 붙인 배열(클래스 c의 셀 p = c·PAD_CELLS + p). 핫 루프용 평탄 뷰. */
  kappaFlat: Float32Array;
}

const fieldIds = new WeakMap<PaperField, number>();
let nextFieldId = 1;

function fieldId(field: PaperField | null): number {
  if (!field) return 0;
  const hit = fieldIds.get(field);
  if (hit !== undefined) return hit;
  const id = nextFieldId;
  nextFieldId += 1;
  fieldIds.set(field, id);
  return id;
}

/** 캐시 키: 종이 필드·샘플 스펙·차단 파라미터가 같으면 파생 필드도 같다. */
export function paperCacheKey(src: WetPaperSource, params: WetParams): string {
  const s = src.spec;
  return [
    fieldId(src.field),
    s.scale,
    s.rotationRad,
    s.filter,
    s.seed,
    params.fiberBlocking,
    params.fiberAnisotropy,
    params.fiberRoughness,
  ].join("|");
}

const f = Math.fround;
const SQRT1_2 = 0.7071067811865476;
/** 전방 링크 클래스 E, S, SE, NE의 단위 방향(대각은 정규화). */
const CLASS_DIR = [
  [1, 0],
  [0, 1],
  [SQRT1_2, SQRT1_2],
  [SQRT1_2, -SQRT1_2],
] as const;

/**
 * 섬유 링크 차단 계수 모델(MoXi 부분 bounce-back 개념의 재구현).
 *  - 링크 전도율 g = 1 − κ. 섬유와 각 φ를 이루는 링크의 전도율은 g(φ) = g⊥ + (g∥ − g⊥)·|cos φ|^FIBER_ANGLE_POWER이다
 *    (섬유 방향 g∥, 가로 방향 g⊥). 대각 링크의 영향을 줄이려고 높은 거듭제곱을 쓴다.
 *  - 전도율 비 r = g∥/g⊥는 8링크 확산(면 가중 2/3, 대각 1/6)의 섬유 정렬 경우에서 확산 반경 이방비
 *    1 − R⊥/R∥가 정확히 `fiberAnisotropy`가 되도록 닫힌 형식으로 정한다(`fiberConductanceRatio`).
 *    이 이산화는 aniso ≈ 0.75를 넘으면 가로 방향을 더 막아도 반경 비가 늘지 않는다(상한, 문서·테스트에 명시).
 *  - k0(`fiberBlocking`)는 섬유 방향과 가로 방향 링크 차단 계수의 평균이다: (κ∥ + κ⊥)/2 = k0.
 *  aniso = 0이면 r = 1이라 κ = k0(등방), aniso가 커지면 가로 방향이 막히고 섬유 방향은 열린다.
 */
export const FIBER_ANGLE_POWER = 6;

/** 섬유 방향·가로 방향 전도율 비 상한(aniso → 상한 근방 발산 방지). */
const FIBER_RATIO_MAX = 400;

/**
 * 확산 반경 이방비 `aniso`를 만드는 전도율 비 r = g∥/g⊥(섬유가 격자 축과 정렬된 경우).
 * D_xx ∝ (4/3 + 2δ/3)·g∥ + (2/3)(1 − δ)·g⊥, D_yy ∝ (4/3 + 2(1 − δ)/3)·g⊥ + (2δ/3)·g∥, δ = 2^(−FIBER_ANGLE_POWER/2),
 * D_yy/D_xx = (1 − aniso)²를 풀면 r이 나온다.
 */
export function fiberConductanceRatio(aniso: number): number {
  const a = aniso < 0 ? 0 : aniso > 1 ? 1 : aniso;
  const t = (1 - a) * (1 - a);
  const delta = 1 / (1 << (FIBER_ANGLE_POWER >> 1));
  const num = 4 / 3 + (2 / 3) * (1 - delta) * (1 - t);
  const den = t * (4 / 3 + (2 / 3) * delta) - (2 / 3) * delta;
  if (!(den > 1e-9)) return FIBER_RATIO_MAX;
  const r = num / den;
  return r < 1 ? 1 : r > FIBER_RATIO_MAX ? FIBER_RATIO_MAX : r;
}

/** (k0, aniso) → 섬유 방향·가로 방향 링크 차단 계수. */
export function fiberLinkBlocking(k0: number, aniso: number): { parallel: number; perpendicular: number; ratio: number } {
  const ratio = fiberConductanceRatio(aniso);
  let perp = (2 * k0 - 1 + ratio) / (1 + ratio);
  if (perp < k0) perp = k0;
  if (perp > WET_PHYSICS.kappaMax) perp = WET_PHYSICS.kappaMax;
  let par = 1 - ratio * (1 - perp);
  if (par < 0) par = 0;
  if (par > perp) par = perp;
  return { parallel: par, perpendicular: perp, ratio };
}

export function buildTilePaper(src: WetPaperSource, params: WetParams, tx: number, ty: number): TilePaper {
  const h = new Float32Array(PAD_CELLS);
  const absorb = new Float32Array(PAD_CELLS);
  const capBase = new Float32Array(PAD_CELLS);
  const kappa: [Float32Array, Float32Array, Float32Array, Float32Array] = [
    new Float32Array(PAD_CELLS),
    new Float32Array(PAD_CELLS),
    new Float32Array(PAD_CELLS),
    new Float32Array(PAD_CELLS),
  ];
  const k0 = params.fiberBlocking;
  const rough = params.fiberRoughness;
  const blk = fiberLinkBlocking(k0, params.fiberAnisotropy);
  const seed = src.spec.seed >>> 0;
  const kMax = WET_PHYSICS.kappaMax;
  const invL = 1 / WET_PHYSICS.fiberLengthPx;
  const invW = 1 / WET_PHYSICS.fiberWidthPx;
  for (let py = 0; py < PAD_SIZE; py += 1) {
    const gy = ty * TILE_SIZE - 1 + py;
    for (let px = 0; px < PAD_SIZE; px += 1) {
      const gx = tx * TILE_SIZE - 1 + px;
      const p = py * PAD_SIZE + px;
      if (!src.field) {
        h[p] = 0.5;
        absorb[p] = 0.5;
        capBase[p] = f(WET_PHYSICS.capacityBase + WET_PHYSICS.capacitySpan * 0.5);
        const k = f(Math.min(kMax, k0));
        for (let c = 0; c < 4; c += 1) (kappa[c] as Float32Array)[p] = k;
        continue;
      }
      const sample = samplePaper(src.field, gx + 0.5, gy + 0.5, src.spec);
      h[p] = f(sample.bump);
      absorb[p] = f(sample.absorb);
      capBase[p] = f(WET_PHYSICS.capacityBase + WET_PHYSICS.capacitySpan * sample.absorb);
      const cs = detCos(sample.dir);
      const sn = detSin(sample.dir);
      // 섬유 줄무늬: 섬유 방향으로 길고 가로로 얇은 값 노이즈. 1(섬유 채널)에 가까울수록 덜 막힌다.
      const fib = rough > 0 ? valueNoise2D((gx * cs + gy * sn) * invL, (-gx * sn + gy * cs) * invW, seed) : 0.5;
      // 섬유 줄무늬: 전도율에 곱해지는 무작위 변동(섬유 채널은 전도율↑, 섬유 사이 틈은 ↓).
      let mod = 1 + rough * (2 * fib - 1) * 1.2;
      if (mod < 0.05) mod = 0.05;
      for (let c = 0; c < 4; c += 1) {
        const d = CLASS_DIR[c] ?? CLASS_DIR[0];
        const dot = d[0] * cs + d[1] * sn;
        const d2 = dot * dot;
        const d6 = d2 * d2 * d2; // |cos φ|^FIBER_ANGLE_POWER(= 6): 거듭제곱 함수 대신 곱셈으로 결정적으로 계산
        const k = 1 - (1 - (blk.perpendicular + (blk.parallel - blk.perpendicular) * d6)) * mod;
        (kappa[c] as Float32Array)[p] = f(k < 0 ? 0 : k > kMax ? kMax : k);
      }
    }
  }
  const kbar = new Float32Array(TILE_SIZE * TILE_SIZE);
  const kE = kappa[0] as Float32Array;
  const kS = kappa[1] as Float32Array;
  for (let ly = 0; ly < TILE_SIZE; ly += 1) {
    for (let lx = 0; lx < TILE_SIZE; lx += 1) {
      const p = (ly + 1) * PAD_SIZE + (lx + 1);
      kbar[ly * TILE_SIZE + lx] = f(((kE[p] ?? 0) + (kE[p - 1] ?? 0) + (kS[p] ?? 0) + (kS[p - PAD_SIZE] ?? 0)) * 0.25);
    }
  }
  const kappaFlat = new Float32Array(4 * PAD_CELLS);
  for (let c = 0; c < 4; c += 1) kappaFlat.set(kappa[c] as Float32Array, c * PAD_CELLS);
  return { h, absorb, capBase, kappa, kbar, kappaFlat };
}

/** 상태의 타일 종이 캐시에서 타일의 파생 필드를 얻는다(없으면 만든다, 키가 바뀌면 캐시를 비운다). */
export function tilePaperFor(state: WetState, src: WetPaperSource, params: WetParams, tile: number): TilePaper {
  const key = paperCacheKey(src, params);
  if (!state.paperCache || state.paperCache.key !== key) state.paperCache = { key, tiles: new Map<number, TilePaper>() };
  const hit = state.paperCache.tiles.get(tile);
  if (hit) return hit;
  const built = buildTilePaper(src, params, tile % state.tilesX, Math.floor(tile / state.tilesX));
  state.paperCache.tiles.set(tile, built);
  return built;
}
