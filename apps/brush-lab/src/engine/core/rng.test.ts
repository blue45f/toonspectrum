import { describe, expect, it } from "vitest";

import { fbm2D, hashNoise2D, hashU32, lowbias32, Pcg32, valueNoise2D } from "./rng";

/**
 * 골든 값 표. PCG32(42, 54)는 O'Neill 참조 구현의 공개 수열이고,
 * 해시·노이즈 10개 입력은 WGSL 미러(`hash_u32`, `value_noise_2d`, `fbm_2d`) 대조용 자체 골든이다.
 */
const PCG_42_54 = [0xa15c02b7, 0x7b47f409, 0xba1d3330, 0x83d2f293, 0xbfa4784b, 0xcbed606e];

const HASH_INPUTS: readonly [number, number, number][] = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [1, 1, 1],
  [5, -3, 7],
  [123, 456, 789],
  [-1, -1, 99],
  [1024, 2048, 3],
  [7, 7, 7],
  [31, 17, 0xdeadbeef],
];
const HASH_GOLDEN = [
  2308606514, 1845633836, 2741764994, 3708375709, 963188817, 1280836352, 538412179, 3536781618, 3632462206, 2027755821,
];

const NOISE_INPUTS: readonly [number, number, number][] = [
  [0.5, 0.5, 1],
  [1.25, 2.75, 1],
  [3.1, 0.2, 7],
  [10.5, 10.5, 7],
  [0.1, 0.9, 99],
  [2.5, 2.5, 3],
  [7.75, 1.25, 11],
  [100.3, 50.7, 5],
  [0.01, 0.99, 1],
  [12.34, 56.78, 90],
];
const VALUE_NOISE_GOLDEN = [
  0.6901534199714661, 0.4288788437843323, 0.18663515150547028, 0.5438653230667114, 0.16464276611804962,
  0.4011768698692322, 0.6818299293518066, 0.6167690753936768, 0.5002962350845337, 0.4653027653694153,
];
const FBM_GOLDEN = [
  0.7634343504905701, 0.44562801718711853, 0.3156983554363251, 0.6723617911338806, 0.258506715297699,
  0.6175159811973572, 0.5569635629653931, 0.554551362991333, 0.40094149112701416, 0.5079920887947083,
];

describe("Pcg32", () => {
  it("참조 수열(seed 42, seq 54)과 일치한다", () => {
    const rng = new Pcg32(42, 54);
    expect(Array.from({ length: 6 }, () => rng.nextU32())).toEqual(PCG_42_54);
  });

  it("같은 시드는 같은 수열, 다른 시드·fork는 다른 수열", () => {
    const a = new Pcg32(7, 1);
    const b = new Pcg32(7, 1);
    const c = new Pcg32(8, 1);
    const seqA = Array.from({ length: 32 }, () => a.nextU32());
    const seqB = Array.from({ length: 32 }, () => b.nextU32());
    const seqC = Array.from({ length: 32 }, () => c.nextU32());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    const forked = new Pcg32(7, 1).fork(3);
    expect(Array.from({ length: 8 }, () => forked.nextU32())).not.toEqual(seqA.slice(0, 8));
  });

  it("nextF32는 [0,1) f32이며 상위 24비트만 쓴다", () => {
    const rng = new Pcg32(99, 0);
    let min = 1;
    let max = 0;
    for (let i = 0; i < 10000; i += 1) {
      const v = rng.nextF32();
      expect(v).toBe(Math.fround(v));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBeLessThan(0.01);
    expect(max).toBeGreaterThan(0.99);
  });
});

describe("해시 노이즈", () => {
  it("lowbias32·hashU32는 정수 연산만 쓰며 골든 값과 일치한다", () => {
    expect(lowbias32(0)).toBe(0);
    expect(HASH_INPUTS.map(([x, y, s]) => hashU32(x, y, s))).toEqual(HASH_GOLDEN);
    // 음수·실수 입력은 u32로 접힌다
    expect(hashU32(-1, -1, 99)).toBe(hashU32(0xffffffff, 0xffffffff, 99));
  });

  it("hashNoise2D는 [0,1) f32이고 격자점에서 valueNoise2D와 같다", () => {
    for (const [x, y, s] of HASH_INPUTS) {
      const h = hashNoise2D(x, y, s);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
      expect(h).toBe(Math.fround(h));
      expect(valueNoise2D(x, y, s)).toBe(h);
    }
  });

  it("valueNoise2D·fbm2D 골든 값(WGSL 미러 입력 10개)과 Math.fround 일치", () => {
    const vn = NOISE_INPUTS.map(([x, y, s]) => valueNoise2D(x, y, s));
    const fb = NOISE_INPUTS.map(([x, y, s]) => fbm2D(x, y, 4, s));
    expect(vn).toEqual(VALUE_NOISE_GOLDEN);
    expect(fb).toEqual(FBM_GOLDEN);
    for (const v of [...vn, ...fb]) {
      expect(v).toBe(Math.fround(v));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("fbm2D는 옥타브가 늘수록 결정적이며 1옥타브는 valueNoise2D와 같다", () => {
    expect(fbm2D(3.3, 4.4, 1, 5)).toBe(valueNoise2D(3.3, 4.4, 5));
    expect(fbm2D(3.3, 4.4, 5, 5)).toBe(fbm2D(3.3, 4.4, 5, 5));
    expect(fbm2D(3.3, 4.4, 5, 5)).not.toBe(fbm2D(3.3, 4.4, 5, 6));
  });
});
