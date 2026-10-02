/**
 * 캡슐 SDF 충돌(character-physics.md §4.2). CapsuleSet은 SoA Float32Array이며
 * `prev→current` 보간으로 서브스텝마다 캡슐 위치를 평가한다. 커널은 `+ - * / sqrt fround`만 쓴다.
 */
import { f32Length3, f32Lerp } from "../core/vec";

import type { CapsuleSet, Vec3 } from "../../../contracts";

const F = Math.fround;

export interface MutableCapsuleSet extends CapsuleSet {
  readonly head: Float32Array;
  readonly tail: Float32Array;
  readonly radius: Float32Array;
  readonly prevHead: Float32Array;
  readonly prevTail: Float32Array;
}

export function createCapsuleSet(count: number): MutableCapsuleSet {
  return {
    count,
    head: new Float32Array(count * 3),
    tail: new Float32Array(count * 3),
    radius: new Float32Array(count),
    prevHead: new Float32Array(count * 3),
    prevTail: new Float32Array(count * 3),
  };
}

/** index번 캡슐의 현재 위치를 쓴다. prev는 commitCapsuleSet이 갱신한다. */
export function writeCapsule(set: MutableCapsuleSet, index: number, head: Vec3, tail: Vec3, radius: number): void {
  const o = index * 3;
  set.head[o] = head[0];
  set.head[o + 1] = head[1];
  set.head[o + 2] = head[2];
  set.tail[o] = tail[0];
  set.tail[o + 1] = tail[1];
  set.tail[o + 2] = tail[2];
  set.radius[index] = radius;
}

/** prev ← current (프레임 끝에 호출) */
export function commitCapsuleSet(set: MutableCapsuleSet): void {
  set.prevHead.set(set.head);
  set.prevTail.set(set.tail);
}

/** prev와 current를 같게 맞춘다(초기화·reset용) */
export function resetCapsuleHistory(set: MutableCapsuleSet): void {
  commitCapsuleSet(set);
}

/**
 * 입자 pos[i]를 모든 캡슐 밖으로 밀어낸다. t는 prev→current 보간 비율(0..1), margin은 입자 hitRadius.
 * 돌려주는 값은 처리한 최대 관통 깊이(m, 0이면 충돌 없음).
 */
export function projectParticleOutOfCapsules(
  pos: Float32Array,
  particle: number,
  set: CapsuleSet,
  t: number,
  margin: number,
): number {
  const p = particle * 3;
  let maxPenetration = 0;
  for (let c = 0; c < set.count; c += 1) {
    const o = c * 3;
    const ax = f32Lerp(set.prevHead[o], set.head[o], t);
    const ay = f32Lerp(set.prevHead[o + 1], set.head[o + 1], t);
    const az = f32Lerp(set.prevHead[o + 2], set.head[o + 2], t);
    const bx = f32Lerp(set.prevTail[o], set.tail[o], t);
    const by = f32Lerp(set.prevTail[o + 1], set.tail[o + 1], t);
    const bz = f32Lerp(set.prevTail[o + 2], set.tail[o + 2], t);
    const reach = F(set.radius[c] + margin);
    const penetration = projectOutOfCapsuleInPlace(pos, p, ax, ay, az, bx, by, bz, reach);
    if (penetration > maxPenetration) maxPenetration = penetration;
  }
  return maxPenetration;
}

/**
 * 단일 캡슐(선분 a-b, 반경 reach) 투영. 점이 축 위에 있으면 결정적 수직 방향으로 밀어낸다.
 * 돌려주는 값은 관통 깊이(0이면 이미 밖).
 */
export function projectOutOfCapsuleInPlace(
  pos: Float32Array,
  p: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  reach: number,
): number {
  const px = pos[p];
  const py = pos[p + 1];
  const pz = pos[p + 2];
  const abx = F(bx - ax);
  const aby = F(by - ay);
  const abz = F(bz - az);
  const abLenSq = F(F(F(abx * abx) + F(aby * aby)) + F(abz * abz));
  let s = 0;
  if (abLenSq > 0) {
    const apx = F(px - ax);
    const apy = F(py - ay);
    const apz = F(pz - az);
    s = F(F(F(F(apx * abx) + F(apy * aby)) + F(apz * abz)) / abLenSq);
    if (s < 0) s = 0;
    else if (s > 1) s = 1;
  }
  const cx = F(ax + F(abx * s));
  const cy = F(ay + F(aby * s));
  const cz = F(az + F(abz * s));
  let dx = F(px - cx);
  let dy = F(py - cy);
  let dz = F(pz - cz);
  let dist = f32Length3(dx, dy, dz);
  if (dist >= reach) return 0;
  const penetration = F(reach - dist);
  if (dist === 0) {
    // 축 위의 점: 축과 수직인 결정적 방향(|ab.x|가 작으면 X, 아니면 Y와 외적)
    const useX = (abx < 0 ? -abx : abx) < F(0.9 * F(Math.sqrt(abLenSq))) || abLenSq === 0;
    if (useX) {
      dx = 0;
      dy = abz;
      dz = -aby;
    } else {
      dx = -abz;
      dy = 0;
      dz = abx;
    }
    dist = f32Length3(dx, dy, dz);
    if (dist === 0) {
      dx = 1;
      dy = 0;
      dz = 0;
      dist = 1;
    }
  }
  const scale = F(reach / dist);
  pos[p] = F(cx + F(dx * scale));
  pos[p + 1] = F(cy + F(dy * scale));
  pos[p + 2] = F(cz + F(dz * scale));
  return penetration;
}

/** 점과 캡슐 표면의 부호 있는 거리(검증용, 안쪽이면 음수) */
export function capsuleSignedDistance(point: Vec3, head: Vec3, tail: Vec3, radius: number): number {
  const abx = tail[0] - head[0];
  const aby = tail[1] - head[1];
  const abz = tail[2] - head[2];
  const lenSq = abx * abx + aby * aby + abz * abz;
  let s = 0;
  if (lenSq > 0) {
    s = ((point[0] - head[0]) * abx + (point[1] - head[1]) * aby + (point[2] - head[2]) * abz) / lenSq;
    s = s < 0 ? 0 : s > 1 ? 1 : s;
  }
  const cx = head[0] + abx * s;
  const cy = head[1] + aby * s;
  const cz = head[2] + abz * s;
  const dx = point[0] - cx;
  const dy = point[1] - cy;
  const dz = point[2] - cz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - radius;
}
