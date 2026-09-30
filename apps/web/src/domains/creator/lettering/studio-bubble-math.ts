/**
 * Studio Bubble Math — 말풍선 모듈 공용 수학 헬퍼.
 *
 * lettering/bubble-* 모듈들이 각자 중복 정의하던 순수 헬퍼를 한 곳으로 모은다.
 * 전부 순수·결정적. DOM 의존성 없음.
 */

/** 값을 [lo, hi] 구간으로 클램프한다. */
export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** SVG path용 좌표를 소수점 2자리 문자열로 포맷한다. */
export function formatCoord(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

/** 0..1 범위로 클램프한다. */
export function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

/** 간단한 결정적 PRNG (mulberry32). 같은 시드면 같은 수열을 낸다. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 두 점 사이 거리. */
export function dist2d(
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  return Math.hypot(bx - ax, by - ay);
}
