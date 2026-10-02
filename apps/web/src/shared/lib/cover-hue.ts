/** 식별값에서 커버 색상환(0~359)을 결정한다. 같은 seed는 항상 같은 값을 돌려준다. */
export function coverHueFromSeed(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash % 360;
}
