/**
 * 결정적 value noise(바람용, character-physics.md §4.2).
 * 격자 해시는 fnv1a32(정수 비트 연산이라 플랫폼 간 동일), 보간은 smoothstep(+ - * 만).
 */
import { fnv1a32Bytes } from "../../../shared/hash";

const F = Math.fround;
const scratch = new Uint8Array(8);

/** (seed, 정수 격자 좌표) → [0, 1) */
export function latticeHash(seed: number, cell: number): number {
  const s = seed >>> 0;
  const c = cell | 0;
  scratch[0] = s & 0xff;
  scratch[1] = (s >>> 8) & 0xff;
  scratch[2] = (s >>> 16) & 0xff;
  scratch[3] = (s >>> 24) & 0xff;
  scratch[4] = c & 0xff;
  scratch[5] = (c >>> 8) & 0xff;
  scratch[6] = (c >>> 16) & 0xff;
  scratch[7] = (c >>> 24) & 0xff;
  return fnv1a32Bytes(scratch) / 4294967296;
}

/** 1차원 value noise, [0, 1). t는 노이즈 공간 좌표(초 단위 시간 × 주파수). */
export function valueNoise1D(seed: number, t: number): number {
  const cell = Math.floor(t);
  const frac = F(t - cell);
  const a = latticeHash(seed, cell);
  const b = latticeHash(seed, cell + 1);
  const s = F(F(frac * frac) * F(3 - F(2 * frac)));
  return F(a + F(F(b - a) * s));
}

/** 바람 세기 계수 0.6 + 0.4 * noise (character-physics.md §4.2) */
export function windGustFactor(seed: number, timeSeconds: number, frequencyHz = 1.5): number {
  return F(0.6 + F(0.4 * valueNoise1D(seed, F(timeSeconds * frequencyHz))));
}
