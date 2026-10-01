/**
 * 결정적 난수·해시 노이즈. 엔진 안의 모든 확률은 여기서 나온다(`Math.random` 금지).
 *
 * WGSL 미러: `hash_u32`, `hash_noise_2d`, `value_noise_2d`, `fbm_2d`(gpu/wgsl/common.wgsl.ts).
 * 정수 연산만 쓰는 함수는 비트 동일, 부동소수 함수는 `Math.fround`로 f32 경계를 맞춘다.
 */

const f = Math.fround;

/** lowbias32(Chris Wellons, 공개 도메인 수식). 정수 연산만 사용. */
export function lowbias32(v: number): number {
  let x = v >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

/** 2D 정수 격자 + 시드 → u32 해시. `hash_u32(x, y, seed)` 미러. */
export function hashU32(x: number, y: number, seed: number): number {
  const sx = lowbias32((seed >>> 0) ^ 0x9e3779b9);
  const hx = lowbias32(sx ^ (x >>> 0));
  return lowbias32(hx ^ Math.imul(y >>> 0, 0x85ebca6b) ^ 0x27d4eb2f) >>> 0;
}

/** 정수 격자 해시 → [0,1). `hash_noise_2d` 미러(u32 / 2^32, f32). */
export function hashNoise2D(x: number, y: number, seed: number): number {
  return f(hashU32(x | 0, y | 0, seed) * 2.3283064365386963e-10);
}

function smoothstep01(t: number): number {
  return f(t * t * f(3 - 2 * t));
}

/**
 * 쌍선형 보간 값 노이즈 [0,1). 격자점 값은 hashNoise2D. `value_noise_2d` 미러.
 * 입력 좌표를 먼저 f32로 접어 WGSL(f32 인자)과 같은 격자 분수를 쓴다.
 */
export function valueNoise2D(x: number, y: number, seed: number): number {
  const px = f(x);
  const py = f(y);
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = f(px - ix);
  const fy = f(py - iy);
  const sx = smoothstep01(fx);
  const sy = smoothstep01(fy);
  const n00 = hashNoise2D(ix, iy, seed);
  const n10 = hashNoise2D(ix + 1, iy, seed);
  const n01 = hashNoise2D(ix, iy + 1, seed);
  const n11 = hashNoise2D(ix + 1, iy + 1, seed);
  const a = f(n00 + f(sx * f(n10 - n00)));
  const b = f(n01 + f(sx * f(n11 - n01)));
  return f(a + f(sy * f(b - a)));
}

/** 프랙탈 브라운 운동 [0,1). 진폭 합으로 정규화. `fbm_2d` 미러. */
export function fbm2D(
  x: number,
  y: number,
  octaves: number,
  seed: number,
  lacunarity = 2,
  gain = 0.5,
): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let px = f(x);
  let py = f(y);
  const n = Math.max(1, Math.floor(octaves));
  for (let i = 0; i < n; i += 1) {
    sum = f(sum + f(amp * valueNoise2D(px, py, (seed + i * 0x1000193) >>> 0)));
    norm = f(norm + amp);
    amp = f(amp * gain);
    px = f(px * lacunarity);
    py = f(py * lacunarity);
  }
  return f(sum / norm);
}

const PCG_MULT_HI = 0x5851f42d;
const PCG_MULT_LO = 0x4c957f2d;

/**
 * 64비트 곱셈 (a·b) mod 2^64. 각 피연산자는 (hi, lo) u32 쌍.
 * double로 정확히 표현되는 범위(< 2^53) 안에서만 중간값을 만든다.
 */
function mul64(ahi: number, alo: number, bhi: number, blo: number): [number, number] {
  const a0 = alo & 0xffff;
  const a1 = alo >>> 16;
  const b0 = blo & 0xffff;
  const b1 = blo >>> 16;
  const p00 = a0 * b0;
  const p01 = a0 * b1;
  const p10 = a1 * b0;
  const p11 = a1 * b1;
  const mid = p01 + p10;
  const loFull = p00 + (mid & 0xffff) * 65536;
  const lo = loFull >>> 0;
  const carry = Math.floor(loFull / 4294967296) + Math.floor(mid / 65536);
  const hi = (p11 + carry + Math.imul(ahi, blo) + Math.imul(alo, bhi)) >>> 0;
  return [hi, lo];
}

/** 64비트 덧셈 mod 2^64. */
function add64(ahi: number, alo: number, bhi: number, blo: number): [number, number] {
  const loFull = alo + blo;
  const lo = loFull >>> 0;
  const carry = loFull >= 4294967296 ? 1 : 0;
  const hi = (ahi + bhi + carry) >>> 0;
  return [hi, lo];
}

/**
 * PCG32(XSH-RR, O'Neill, Apache-2.0/MIT 수식). 64비트 상태를 u32 두 개로 들고 있다.
 * 같은 (seed, seq)이면 플랫폼과 무관하게 같은 수열이다.
 */
export class Pcg32 {
  private hi = 0;
  private lo = 0;
  private readonly incHi: number;
  private readonly incLo: number;

  constructor(seed: number, seq = 0) {
    const s = seq >>> 0;
    this.incHi = s >>> 31;
    this.incLo = ((s << 1) | 1) >>> 0;
    this.step();
    [this.hi, this.lo] = add64(this.hi, this.lo, 0, seed >>> 0);
    this.step();
  }

  private step(): void {
    const [mh, ml] = mul64(this.hi, this.lo, PCG_MULT_HI, PCG_MULT_LO);
    [this.hi, this.lo] = add64(mh, ml, this.incHi, this.incLo);
  }

  nextU32(): number {
    const hi = this.hi;
    const lo = this.lo;
    this.step();
    // xorshifted = ((state >> 18) ^ state) >> 27 의 하위 32비트
    const sh18Hi = hi >>> 18;
    const sh18Lo = ((lo >>> 18) | (hi << 14)) >>> 0;
    const xHi = (hi ^ sh18Hi) >>> 0;
    const xLo = (lo ^ sh18Lo) >>> 0;
    const xorshifted = ((xLo >>> 27) | (xHi << 5)) >>> 0;
    const rot = hi >>> 27;
    return ((xorshifted >>> rot) | (xorshifted << ((32 - rot) & 31))) >>> 0;
  }

  /** [0, 1) f32. 상위 24비트만 사용해 f32로 정확히 표현된다. */
  nextF32(): number {
    return f((this.nextU32() >>> 8) * 5.960464477539063e-8);
  }

  /** 독립 스트림 분기. */
  fork(stream: number): Pcg32 {
    return new Pcg32(this.nextU32(), stream);
  }
}
