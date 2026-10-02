/**
 * 결정적 PRNG(mulberry32). `Math.random`은 이 앱 소스에서 금지(architecture.test.ts).
 * 같은 시드 → 같은 수열. 지오메트리·k-means·바람 노이즈 등 모든 무작위성은 여기서 나온다.
 */
import { fnv1a32 } from "./hash";

export type RandomSource = () => number;

/** [0, 1) 균등 난수 생성기. 시드는 32bit 정수로 절단한다. */
export function mulberry32(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 문자열에서 시드를 만든다(fnv1a32). */
export function seedFromString(input: string): number {
  return fnv1a32(input);
}

export interface Prng {
  readonly seed: number;
  /** [0, 1) */
  next(): number;
  /** [0, maxExclusive) 정수 */
  nextInt(maxExclusive: number): number;
  /** [min, max) 실수 */
  nextRange(min: number, max: number): number;
  /** 표준정규 근사(Box-Muller) */
  nextGaussian(): number;
  /** 배열을 제자리에서 결정적으로 섞는다(Fisher-Yates). */
  shuffle<T>(items: T[]): T[];
}

export function createPrng(seed: number): Prng {
  const source = mulberry32(seed);
  return {
    seed: seed >>> 0,
    next: source,
    nextInt(maxExclusive) {
      if (maxExclusive <= 0) return 0;
      return Math.floor(source() * maxExclusive);
    },
    nextRange(min, max) {
      return min + (max - min) * source();
    },
    nextGaussian() {
      // u1은 0을 피해야 log가 유한하다.
      const u1 = 1 - source();
      const u2 = source();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    },
    shuffle(items) {
      for (let i = items.length - 1; i > 0; i -= 1) {
        const j = Math.floor(source() * (i + 1));
        const tmp = items[i] as (typeof items)[number];
        items[i] = items[j] as (typeof items)[number];
        items[j] = tmp;
      }
      return items;
    },
  };
}
