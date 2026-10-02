/**
 * 결정적 f32 벡터·쿼터니언 커널(character-physics.md §4.3).
 *
 * 런타임 커널 규칙: `+ - * / Math.sqrt Math.fround`만 쓴다. `Math.sin/cos/hypot/pow`는 compile 단계
 * 전용이며 여기에는 없다. 모든 결과는 `Math.fround`로 f32에 맞춰 CPU 커널과 WGSL compute 커널이
 * 같은 비트를 내도록 한다(DETERMINISM_SCOPE "cross-engine-f32").
 *
 * 벡터는 `Float32Array`의 (offset, offset+1, offset+2) 슬롯을 직접 다룬다(SoA, 할당 없음).
 */
import type { Quat, Vec3 } from "../../../contracts";

const F = Math.fround;

/** f32 길이. 0 길이는 0을 돌려준다(NaN 금지). */
export function f32Length3(x: number, y: number, z: number): number {
  const sq = F(F(F(x * x) + F(y * y)) + F(z * z));
  return sq > 0 ? F(Math.sqrt(sq)) : 0;
}

/** f32 내적 */
export function f32Dot3(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return F(F(F(ax * bx) + F(ay * by)) + F(az * bz));
}

/** buffer[offset..+3]를 f32로 쓴다. */
export function writeVec3(buffer: Float32Array, offset: number, x: number, y: number, z: number): void {
  buffer[offset] = x;
  buffer[offset + 1] = y;
  buffer[offset + 2] = z;
}

/** buffer[offset..+3] += (x, y, z) */
export function addVec3(buffer: Float32Array, offset: number, x: number, y: number, z: number): void {
  buffer[offset] = F(buffer[offset] + x);
  buffer[offset + 1] = F(buffer[offset + 1] + y);
  buffer[offset + 2] = F(buffer[offset + 2] + z);
}

/** 단위 쿼터니언 q(xyzw)로 벡터 v를 회전한 결과를 out[3]에 쓴다(+ - * 만 사용). */
export function rotateVec3ByQuat(
  qx: number,
  qy: number,
  qz: number,
  qw: number,
  vx: number,
  vy: number,
  vz: number,
  out: Float32Array,
  outOffset: number,
): void {
  // t = 2 * cross(q.xyz, v); v' = v + w * t + cross(q.xyz, t)
  const tx = F(2 * F(F(qy * vz) - F(qz * vy)));
  const ty = F(2 * F(F(qz * vx) - F(qx * vz)));
  const tz = F(2 * F(F(qx * vy) - F(qy * vx)));
  out[outOffset] = F(F(vx + F(qw * tx)) + F(F(qy * tz) - F(qz * ty)));
  out[outOffset + 1] = F(F(vy + F(qw * ty)) + F(F(qz * tx) - F(qx * tz)));
  out[outOffset + 2] = F(F(vz + F(qw * tz)) + F(F(qx * ty) - F(qy * tx)));
}

/** 선형 보간 a + (b - a) * t (f32) */
export function f32Lerp(a: number, b: number, t: number): number {
  return F(a + F(F(b - a) * t));
}

/** 튜플 벡터 정규화. 길이 0·NaN이면 [0,0,0]. sqrt만 쓴다. */
export function normalizeVec3(v: Vec3): Vec3 {
  const len = f32Length3(v[0], v[1], v[2]);
  if (!(len > 0) || !Number.isFinite(len)) return [0, 0, 0];
  return [F(v[0] / len), F(v[1] / len), F(v[2] / len)];
}

/** 쿼터니언 정규화. 길이 0·NaN이면 항등. */
export function normalizeQuat(q: Quat): Quat {
  const sq = F(F(F(q[0] * q[0]) + F(q[1] * q[1])) + F(F(q[2] * q[2]) + F(q[3] * q[3])));
  if (!(sq > 0) || !Number.isFinite(sq)) return [0, 0, 0, 1];
  const len = F(Math.sqrt(sq));
  return [F(q[0] / len), F(q[1] / len), F(q[2] / len), F(q[3] / len)];
}

/** a ∘ b (b를 먼저 적용), f32 */
export function multiplyQuat(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    F(F(F(aw * bx) + F(ax * bw)) + F(F(ay * bz) - F(az * by))),
    F(F(F(aw * by) - F(ax * bz)) + F(F(ay * bw) + F(az * bx))),
    F(F(F(aw * bz) + F(ax * by)) - F(F(ay * bx) - F(az * bw))),
    F(F(F(aw * bw) - F(ax * bx)) - F(F(ay * by) + F(az * bz))),
  ];
}

export function conjugateQuat(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

export function rotateVec3(q: Quat, v: Vec3): Vec3 {
  const out = new Float32Array(3);
  rotateVec3ByQuat(q[0], q[1], q[2], q[3], v[0], v[1], v[2], out, 0);
  return [out[0], out[1], out[2]];
}

/** from에 수직인 결정적 단위 벡터(180° 특이점용) */
function anyPerpendicular(from: Vec3): Vec3 {
  const ax = from[0] < 0 ? -from[0] : from[0];
  // |x|가 작으면 X축, 아니면 Y축과 외적
  const axis: Vec3 = ax < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const cx = F(F(from[1] * axis[2]) - F(from[2] * axis[1]));
  const cy = F(F(from[2] * axis[0]) - F(from[0] * axis[2]));
  const cz = F(F(from[0] * axis[1]) - F(from[1] * axis[0]));
  return normalizeVec3([cx, cy, cz]);
}

/**
 * 단위 벡터 from을 to로 돌리는 최소 회전(역산 회전용, character-physics.md §4.4).
 * 180° 반대 방향은 from에 수직인 축으로 π 회전한다. 0 벡터·NaN은 항등을 돌려준다(무음 전파 금지).
 */
export function quatFromUnitVectors(from: Vec3, to: Vec3): Quat {
  const f = normalizeVec3(from);
  const t = normalizeVec3(to);
  if (f32Dot3(f[0], f[1], f[2], f[0], f[1], f[2]) === 0 || f32Dot3(t[0], t[1], t[2], t[0], t[1], t[2]) === 0) {
    return [0, 0, 0, 1];
  }
  const d = f32Dot3(f[0], f[1], f[2], t[0], t[1], t[2]);
  if (d >= F(1 - 1e-7)) return [0, 0, 0, 1];
  if (d <= F(-1 + 1e-7)) {
    const axis = anyPerpendicular(f);
    return [axis[0], axis[1], axis[2], 0];
  }
  const cx = F(F(f[1] * t[2]) - F(f[2] * t[1]));
  const cy = F(F(f[2] * t[0]) - F(f[0] * t[2]));
  const cz = F(F(f[0] * t[1]) - F(f[1] * t[0]));
  return normalizeQuat([cx, cy, cz, F(1 + d)]);
}

/** Float32Array 전체에 NaN·무한대가 있는지 */
export function hasNonFinite(buffer: Float32Array): boolean {
  for (let i = 0; i < buffer.length; i += 1) {
    if (!Number.isFinite(buffer[i])) return true;
  }
  return false;
}
