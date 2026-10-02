import type { DabInstance, DepositionModel, TipKind } from "./types";

/**
 * dab 인스턴스 64 B 레이아웃 — TS·WGSL·Rust의 단일 원천.
 *
 * WGSL 구조체(크기 64, 정렬 16):
 * ```wgsl
 * struct Dab { p: vec2<f32>, r: vec2<f32>, angle: f32, hardness: f32, flow: f32, shape_exp: f32,
 *              color: vec4<f32>, tip_seed: u32, grain: f32, wet: f32, flags: u32 }
 * ```
 * - `tip_seed` u32: bits 24..31 = TIP_KIND_ID, bits 0..23 = seed.
 * - `flags` u32: bits 0..15 = pigmentMass(u16, /65535), bits 16..20 = 불리언 플래그, bits 24..31 = DEPOSITION_ID.
 * - u32 필드는 Float32Array 버퍼 위에 Uint32Array 뷰로 bitcast해 기록한다(NaN 정규화 회피).
 */
export const DAB_FLOATS = 16;
export const DAB_BYTES = 64;

/** float 인덱스(16 f32 안에서의 위치). */
export const DAB_FIELD = {
  x: 0,
  y: 1,
  rx: 2,
  ry: 3,
  angle: 4,
  hardness: 5,
  flow: 6,
  shapeExp: 7,
  r: 8,
  g: 9,
  b: 10,
  a: 11,
  tipSeed: 12,
  grain: 13,
  wet: 14,
  flags: 15,
} as const;

/** WGSL struct Dab 필드 순서(정적 대조 테스트가 common.wgsl.ts와 비교). */
export const DAB_WGSL_STRUCT_FIELDS = [
  "p",
  "r",
  "angle",
  "hardness",
  "flow",
  "shape_exp",
  "color",
  "tip_seed",
  "grain",
  "wet",
  "flags",
] as const;

export const TIP_KIND_ID: Record<TipKind, number> = {
  round: 0,
  flat: 1,
  "bristle-strands": 2,
  "texture-stamp": 3,
  noise: 4,
  hatch: 5,
  stipple: 6,
  particle: 7,
};

export const DEPOSITION_ID: Record<DepositionModel, number> = {
  "dry-stamp": 0,
  airbrush: 1,
  spray: 2,
  bristle: 3,
  "hatch-halftone": 4,
  smudge: 5,
  eraser: 6,
  impasto: 7,
  "wet-flow": 8,
};

export const DAB_FLAG = {
  erase: 1 << 16,
  smudge: 1 << 17,
  dualTip: 1 << 18,
  lockAlpha: 1 << 19,
  impasto: 1 << 20,
} as const;

const TIP_KIND_BY_ID: readonly TipKind[] = (Object.keys(TIP_KIND_ID) as TipKind[]).sort(
  (a, b) => TIP_KIND_ID[a] - TIP_KIND_ID[b],
);
const DEPOSITION_BY_ID: readonly DepositionModel[] = (
  Object.keys(DEPOSITION_ID) as DepositionModel[]
).sort((a, b) => DEPOSITION_ID[a] - DEPOSITION_ID[b]);

const SEED_MASK = 0x00ff_ffff;
const PIGMENT_MASK = 0xffff;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** `tip_seed` u32 인코딩. */
export function packTipSeed(tipKind: TipKind, seed: number): number {
  return ((TIP_KIND_ID[tipKind] << 24) | (seed & SEED_MASK)) >>> 0;
}

/** `flags` u32 인코딩. */
export function packFlags(dab: DabInstance): number {
  const pigment = Math.round(clamp01(dab.pigmentMass) * PIGMENT_MASK) & PIGMENT_MASK;
  let flags = pigment;
  if (dab.erase) flags |= DAB_FLAG.erase;
  if (dab.smudge) flags |= DAB_FLAG.smudge;
  if (dab.dualTip) flags |= DAB_FLAG.dualTip;
  if (dab.lockAlpha) flags |= DAB_FLAG.lockAlpha;
  if (dab.impasto) flags |= DAB_FLAG.impasto;
  flags |= DEPOSITION_ID[dab.deposition] << 24;
  return flags >>> 0;
}

/** dab 1개를 `out[index*16 ..]`에 기록한다. u32 필드는 같은 버퍼의 Uint32Array 뷰로 bitcast. */
export function packDab(dab: DabInstance, out: Float32Array, index: number): void {
  const base = index * DAB_FLOATS;
  out[base + DAB_FIELD.x] = dab.x;
  out[base + DAB_FIELD.y] = dab.y;
  out[base + DAB_FIELD.rx] = dab.rx;
  out[base + DAB_FIELD.ry] = dab.ry;
  out[base + DAB_FIELD.angle] = dab.angle;
  out[base + DAB_FIELD.hardness] = dab.hardness;
  out[base + DAB_FIELD.flow] = dab.flow;
  out[base + DAB_FIELD.shapeExp] = dab.shapeExp;
  out[base + DAB_FIELD.r] = dab.r;
  out[base + DAB_FIELD.g] = dab.g;
  out[base + DAB_FIELD.b] = dab.b;
  out[base + DAB_FIELD.a] = dab.a;
  out[base + DAB_FIELD.grain] = dab.grain;
  out[base + DAB_FIELD.wet] = dab.wet;
  const u32 = new Uint32Array(out.buffer, out.byteOffset, out.length);
  u32[base + DAB_FIELD.tipSeed] = packTipSeed(dab.tipKind, dab.seed);
  u32[base + DAB_FIELD.flags] = packFlags(dab);
}

/** `buf[index*16 ..]`에서 dab 1개를 복원한다. */
export function unpackDab(buf: Float32Array, index: number): DabInstance {
  const base = index * DAB_FLOATS;
  const u32 = new Uint32Array(buf.buffer, buf.byteOffset, buf.length);
  const tipSeed = u32[base + DAB_FIELD.tipSeed] ?? 0;
  const flags = u32[base + DAB_FIELD.flags] ?? 0;
  const tipKind = TIP_KIND_BY_ID[tipSeed >>> 24] ?? "round";
  const deposition = DEPOSITION_BY_ID[flags >>> 24] ?? "dry-stamp";
  return {
    x: buf[base + DAB_FIELD.x] ?? 0,
    y: buf[base + DAB_FIELD.y] ?? 0,
    rx: buf[base + DAB_FIELD.rx] ?? 0,
    ry: buf[base + DAB_FIELD.ry] ?? 0,
    angle: buf[base + DAB_FIELD.angle] ?? 0,
    hardness: buf[base + DAB_FIELD.hardness] ?? 0,
    flow: buf[base + DAB_FIELD.flow] ?? 0,
    shapeExp: buf[base + DAB_FIELD.shapeExp] ?? 2,
    r: buf[base + DAB_FIELD.r] ?? 0,
    g: buf[base + DAB_FIELD.g] ?? 0,
    b: buf[base + DAB_FIELD.b] ?? 0,
    a: buf[base + DAB_FIELD.a] ?? 0,
    tipKind,
    seed: tipSeed & SEED_MASK,
    grain: buf[base + DAB_FIELD.grain] ?? 0,
    wet: buf[base + DAB_FIELD.wet] ?? 0,
    pigmentMass: (flags & PIGMENT_MASK) / PIGMENT_MASK,
    erase: (flags & DAB_FLAG.erase) !== 0,
    smudge: (flags & DAB_FLAG.smudge) !== 0,
    dualTip: (flags & DAB_FLAG.dualTip) !== 0,
    lockAlpha: (flags & DAB_FLAG.lockAlpha) !== 0,
    impasto: (flags & DAB_FLAG.impasto) !== 0,
    deposition,
  };
}

/**
 * 고정 용량 dab 배치. `data`는 capacity·16 f32이며 `view()`는 채워진 구간만 돌려준다.
 * push가 false를 돌려주면 용량 초과이며 호출자가 분할 제출한다(무음 폐기 없음).
 */
export class DabBatch {
  readonly data: Float32Array;
  readonly capacity: number;
  count = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(`DabBatch capacity must be a positive integer, got ${capacity}`);
    }
    this.capacity = capacity;
    this.data = new Float32Array(capacity * DAB_FLOATS);
  }

  push(dab: DabInstance): boolean {
    if (this.count >= this.capacity) return false;
    packDab(dab, this.data, this.count);
    this.count += 1;
    return true;
  }

  /** i번째 dab을 복원한다(테스트·CPU 참조용). */
  at(index: number): DabInstance {
    if (index < 0 || index >= this.count) {
      throw new RangeError(`DabBatch index ${index} out of range (count ${this.count})`);
    }
    return unpackDab(this.data, index);
  }

  /** 채워진 구간의 Float32Array 뷰(복사 없음). */
  view(): Float32Array {
    return this.data.subarray(0, this.count * DAB_FLOATS);
  }

  reset(): void {
    this.count = 0;
  }
}
