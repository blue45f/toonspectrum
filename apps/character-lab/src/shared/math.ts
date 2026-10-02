/**
 * 엔진 중립 수학 유틸. 우수 좌표계, Y-up, 쿼터니언 [x, y, z, w], Mat4는 column-major(glTF 규약,
 * 평행이동이 인덱스 12·13·14). 모든 함수는 순수하며 입력을 변경하지 않는다.
 *
 * 타입은 contracts/pose.ts의 Vec3/Quat와 구조적으로 동일하다(shared는 contracts를 import하지 않는다).
 */
export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];
/** 16개, column-major */
export type Mat4 = Float32Array;

export const EPSILON = 1e-8;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function approxEqual(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}

// ---------------------------------------------------------------- vec3

export const VEC3_ZERO: Vec3 = [0, 0, 0];
export const VEC3_X: Vec3 = [1, 0, 0];
export const VEC3_Y: Vec3 = [0, 1, 0];
export const VEC3_Z: Vec3 = [0, 0, 1];

export function v3(x: number, y: number, z: number): Vec3 {
  return [x, y, z];
}

export function v3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function v3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function v3Scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function v3Mul(a: Vec3, b: Vec3): Vec3 {
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
}

export function v3Negate(a: Vec3): Vec3 {
  return [-a[0], -a[1], -a[2]];
}

export function v3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function v3Cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function v3LengthSq(a: Vec3): number {
  return v3Dot(a, a);
}

export function v3Length(a: Vec3): number {
  return Math.sqrt(v3LengthSq(a));
}

export function v3Distance(a: Vec3, b: Vec3): number {
  return v3Length(v3Sub(a, b));
}

/** 길이가 0에 가까우면 NaN 대신 [0,0,0]을 돌려준다. */
export function v3Normalize(a: Vec3): Vec3 {
  const len = v3Length(a);
  if (len < EPSILON || !Number.isFinite(len)) return VEC3_ZERO;
  return [a[0] / len, a[1] / len, a[2] / len];
}

export function v3Lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function v3Equals(a: Vec3, b: Vec3, eps = 1e-6): boolean {
  return approxEqual(a[0], b[0], eps) && approxEqual(a[1], b[1], eps) && approxEqual(a[2], b[2], eps);
}

export function v3IsFinite(a: Vec3): boolean {
  return Number.isFinite(a[0]) && Number.isFinite(a[1]) && Number.isFinite(a[2]);
}

/** a에 수직인 임의의 단위 벡터(결정적) */
export function v3AnyPerpendicular(a: Vec3): Vec3 {
  const axis: Vec3 = Math.abs(a[0]) < 0.9 ? VEC3_X : VEC3_Y;
  return v3Normalize(v3Cross(a, axis));
}

// ---------------------------------------------------------------- quat

export const QUAT_IDENTITY: Quat = [0, 0, 0, 1];

export function quat(x: number, y: number, z: number, w: number): Quat {
  return [x, y, z, w];
}

export function qDot(a: Quat, b: Quat): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

export function qLength(a: Quat): number {
  return Math.sqrt(qDot(a, a));
}

/** 길이 0·NaN이면 항등 쿼터니언 */
export function qNormalize(a: Quat): Quat {
  const len = qLength(a);
  if (len < EPSILON || !Number.isFinite(len)) return QUAT_IDENTITY;
  return [a[0] / len, a[1] / len, a[2] / len, a[3] / len];
}

export function qConjugate(a: Quat): Quat {
  return [-a[0], -a[1], -a[2], a[3]];
}

/** 단위 쿼터니언의 역 = 켤레 */
export function qInverse(a: Quat): Quat {
  return qConjugate(qNormalize(a));
}

/** a ∘ b: b를 먼저 적용하고 a를 적용하는 회전 */
export function qMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function qFromAxisAngle(axis: Vec3, angleRad: number): Quat {
  const n = v3Normalize(axis);
  const half = angleRad * 0.5;
  const s = Math.sin(half);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(half)];
}

/**
 * 단위 쿼터니언 → { axis, angle(rad, 0..π) }. 회전이 없으면 axis=[0,1,0], angle=0.
 * q와 -q는 같은 회전(이중 덮개)이므로 w<0이면 부호를 뒤집어 w≥0 쪽으로 정규화한다.
 * 그러지 않으면 angle이 (π, 2π]가 되어 qClampAngle·qRotationAngle이 반대 방향의 큰 회전으로 읽는다.
 */
export function qToAxisAngle(q: Quat): { axis: Vec3; angle: number } {
  const n = qNormalize(q);
  const sign = n[3] < 0 ? -1 : 1;
  const w = clamp(sign * n[3], 0, 1);
  const angle = 2 * Math.acos(w);
  const s = Math.sqrt(Math.max(0, 1 - w * w));
  if (s < 1e-6) return { axis: VEC3_Y, angle: 0 };
  return { axis: [(sign * n[0]) / s, (sign * n[1]) / s, (sign * n[2]) / s], angle };
}

/** 오일러(XYZ 순서, rad) → 쿼터니언. q = qz ∘ qy ∘ qx */
export function qFromEulerXYZ(x: number, y: number, z: number): Quat {
  return qMultiply(qFromAxisAngle(VEC3_Z, z), qMultiply(qFromAxisAngle(VEC3_Y, y), qFromAxisAngle(VEC3_X, x)));
}

export function qRotateVec3(q: Quat, v: Vec3): Vec3 {
  // v' = v + 2w(u×v) + 2(u×(u×v)), u = (x,y,z)
  const u: Vec3 = [q[0], q[1], q[2]];
  const w = q[3];
  const uv = v3Cross(u, v);
  const uuv = v3Cross(u, uv);
  return v3Add(v, v3Add(v3Scale(uv, 2 * w), v3Scale(uuv, 2)));
}

/** 두 쿼터니언 사이 각(rad, 0..π) */
export function qAngle(a: Quat, b: Quat): number {
  const d = clamp(Math.abs(qDot(qNormalize(a), qNormalize(b))), 0, 1);
  return 2 * Math.acos(d);
}

export function qSlerp(a: Quat, b: Quat, t: number): Quat {
  let cos = qDot(a, b);
  let bAdj: Quat = b;
  if (cos < 0) {
    cos = -cos;
    bAdj = [-b[0], -b[1], -b[2], -b[3]];
  }
  if (cos > 0.9995) {
    return qNormalize([
      lerp(a[0], bAdj[0], t),
      lerp(a[1], bAdj[1], t),
      lerp(a[2], bAdj[2], t),
      lerp(a[3], bAdj[3], t),
    ]);
  }
  const theta = Math.acos(clamp(cos, -1, 1));
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sinTheta;
  const wb = Math.sin(t * theta) / sinTheta;
  return [
    a[0] * wa + bAdj[0] * wb,
    a[1] * wa + bAdj[1] * wb,
    a[2] * wa + bAdj[2] * wb,
    a[3] * wa + bAdj[3] * wb,
  ];
}

/**
 * 단위 벡터 from을 to로 돌리는 최소 회전. 180° 반대 방향은 from에 수직인 축으로 π 회전한다.
 */
export function quatFromTo(from: Vec3, to: Vec3): Quat {
  const f = v3Normalize(from);
  const t = v3Normalize(to);
  if (v3LengthSq(f) === 0 || v3LengthSq(t) === 0) return QUAT_IDENTITY;
  const d = v3Dot(f, t);
  if (d >= 1 - 1e-9) return QUAT_IDENTITY;
  if (d <= -1 + 1e-9) {
    const axis = v3AnyPerpendicular(f);
    return [axis[0], axis[1], axis[2], 0];
  }
  const c = v3Cross(f, t);
  return qNormalize([c[0], c[1], c[2], 1 + d]);
}

/**
 * swing-twist 분해: q = swing ∘ twist, twist는 axis 주위 회전.
 * 관절 드래그 제한(JOINT_LIMITS_DEG)에서 swing·twist 각을 따로 클램프할 때 쓴다.
 */
export function swingTwist(q: Quat, axis: Vec3): { swing: Quat; twist: Quat } {
  const n = qNormalize(q);
  const a = v3Normalize(axis);
  const projection = v3Scale(a, v3Dot([n[0], n[1], n[2]], a));
  const twistRaw: Quat = [projection[0], projection[1], projection[2], n[3]];
  const twistLen = qLength(twistRaw);
  const twist: Quat = twistLen < EPSILON ? QUAT_IDENTITY : qNormalize(twistRaw);
  const swing = qNormalize(qMultiply(n, qConjugate(twist)));
  return { swing, twist };
}

/** 쿼터니언의 회전각(rad, 0..π) */
export function qRotationAngle(q: Quat): number {
  return qToAxisAngle(q).angle;
}

/** 회전각을 maxRad로 제한한 쿼터니언 */
export function qClampAngle(q: Quat, maxRad: number): Quat {
  const { axis, angle } = qToAxisAngle(q);
  if (angle <= maxRad) return qNormalize(q);
  return qFromAxisAngle(axis, maxRad);
}

// ---------------------------------------------------------------- mat4

export function mat4Identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

export function mat4FromQuat(q: Quat): Mat4 {
  const [x, y, z, w] = qNormalize(q);
  const m = mat4Identity();
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  m[0] = 1 - 2 * (yy + zz);
  m[1] = 2 * (xy + wz);
  m[2] = 2 * (xz - wy);
  m[4] = 2 * (xy - wz);
  m[5] = 1 - 2 * (xx + zz);
  m[6] = 2 * (yz + wx);
  m[8] = 2 * (xz + wy);
  m[9] = 2 * (yz - wx);
  m[10] = 1 - 2 * (xx + yy);
  return m;
}

/** T · R · S */
export function mat4FromTRS(translation: Vec3, rotation: Quat, scale: Vec3 = [1, 1, 1]): Mat4 {
  const m = mat4FromQuat(rotation);
  for (let col = 0; col < 3; col += 1) {
    const s = scale[col] ?? 1;
    m[col * 4] = (m[col * 4] ?? 0) * s;
    m[col * 4 + 1] = (m[col * 4 + 1] ?? 0) * s;
    m[col * 4 + 2] = (m[col * 4 + 2] ?? 0) * s;
  }
  m[12] = translation[0];
  m[13] = translation[1];
  m[14] = translation[2];
  return m;
}

/** a · b (b를 먼저 적용) */
export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        sum += (a[k * 4 + row] ?? 0) * (b[col * 4 + k] ?? 0);
      }
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

export function mat4TransformPoint(m: Mat4, p: Vec3): Vec3 {
  const x = (m[0] ?? 0) * p[0] + (m[4] ?? 0) * p[1] + (m[8] ?? 0) * p[2] + (m[12] ?? 0);
  const y = (m[1] ?? 0) * p[0] + (m[5] ?? 0) * p[1] + (m[9] ?? 0) * p[2] + (m[13] ?? 0);
  const z = (m[2] ?? 0) * p[0] + (m[6] ?? 0) * p[1] + (m[10] ?? 0) * p[2] + (m[14] ?? 0);
  const w = (m[3] ?? 0) * p[0] + (m[7] ?? 0) * p[1] + (m[11] ?? 0) * p[2] + (m[15] ?? 1);
  if (w !== 0 && w !== 1) return [x / w, y / w, z / w];
  return [x, y, z];
}

export function mat4TransformDirection(m: Mat4, d: Vec3): Vec3 {
  return [
    (m[0] ?? 0) * d[0] + (m[4] ?? 0) * d[1] + (m[8] ?? 0) * d[2],
    (m[1] ?? 0) * d[0] + (m[5] ?? 0) * d[1] + (m[9] ?? 0) * d[2],
    (m[2] ?? 0) * d[0] + (m[6] ?? 0) * d[1] + (m[10] ?? 0) * d[2],
  ];
}

export function mat4GetTranslation(m: Mat4): Vec3 {
  return [m[12] ?? 0, m[13] ?? 0, m[14] ?? 0];
}

/** 일반 4×4 역행렬. 특이 행렬이면 null. */
export function mat4Invert(m: Mat4): Mat4 | null {
  const a = Array.from(m) as number[];
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = a as [
    number, number, number, number, number, number, number, number,
    number, number, number, number, number, number, number, number,
  ];
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det || !Number.isFinite(det)) return null;
  const inv = 1 / det;
  const out = new Float32Array(16);
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * inv;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * inv;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * inv;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * inv;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * inv;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * inv;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * inv;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * inv;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * inv;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * inv;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * inv;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * inv;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * inv;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * inv;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * inv;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * inv;
  return out;
}

// ---------------------------------------------------------------- 기하

/** 선분 ab 위에서 p에 가장 가까운 점 */
export function closestPointOnSegment(p: Vec3, a: Vec3, b: Vec3): Vec3 {
  const ab = v3Sub(b, a);
  const lenSq = v3LengthSq(ab);
  if (lenSq < EPSILON) return a;
  const t = clamp(v3Dot(v3Sub(p, a), ab) / lenSq, 0, 1);
  return v3Add(a, v3Scale(ab, t));
}

/** 캡슐(선분 ab, 반경 r) 표면까지의 부호 있는 거리(안쪽이면 음수) */
export function capsuleDistance(p: Vec3, a: Vec3, b: Vec3, radius: number): number {
  return v3Distance(p, closestPointOnSegment(p, a, b)) - radius;
}

/** 캡슐 밖으로 밀어낸 점과 법선. 이미 밖이면 그대로 돌려준다. */
export function projectOutOfCapsule(p: Vec3, a: Vec3, b: Vec3, radius: number): { point: Vec3; normal: Vec3; penetration: number } {
  const closest = closestPointOnSegment(p, a, b);
  const offset = v3Sub(p, closest);
  const dist = v3Length(offset);
  const normal = dist < EPSILON ? v3AnyPerpendicular(v3Normalize(v3Sub(b, a))) : v3Scale(offset, 1 / dist);
  const penetration = radius - dist;
  if (penetration <= 0) return { point: p, normal, penetration: 0 };
  return { point: v3Add(closest, v3Scale(normal, radius)), normal, penetration };
}
