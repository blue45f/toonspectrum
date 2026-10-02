/**
 * 계약 타입(Vec3/Quat, 순수 배열) ↔ Babylon 수학 객체 변환. 우수 좌표·Y-up·쿼터니언 [x,y,z,w] 그대로이며
 * Babylon의 Hamilton 곱·회전 적용식이 shared/math와 같은 규약이므로 성분을 복사만 한다.
 */
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { qNormalize } from "../../shared/math";

import type { Quat, Vec3 } from "../../contracts";

export function toVector3(v: Vec3): Vector3 {
  return new Vector3(v[0], v[1], v[2]);
}

export function fromVector3(v: { readonly x: number; readonly y: number; readonly z: number }): Vec3 {
  return [v.x, v.y, v.z];
}

export function toQuaternion(q: Quat): Quaternion {
  const n = qNormalize(q);
  return new Quaternion(n[0], n[1], n[2], n[3]);
}

export function fromQuaternion(q: { readonly x: number; readonly y: number; readonly z: number; readonly w: number } | null | undefined): Quat {
  if (!q) return [0, 0, 0, 1];
  return qNormalize([q.x, q.y, q.z, q.w]);
}

export function toColor3(rgb: readonly [number, number, number]): Color3 {
  return new Color3(rgb[0], rgb[1], rgb[2]);
}

export function toColor4(rgba: readonly [number, number, number, number]): Color4 {
  return new Color4(rgba[0], rgba[1], rgba[2], rgba[3]);
}

/** Babylon Float32Array 요구에 맞춰 정수 배열을 float로 복사한다(스킨 인덱스 등). */
export function toFloat32(source: ArrayLike<number>): Float32Array {
  const out = new Float32Array(source.length);
  for (let i = 0; i < source.length; i += 1) out[i] = source[i] ?? 0;
  return out;
}

/** 두 배열을 더한다(morph 절대 위치 = 기준 + 델타) */
export function addFloat32(base: ArrayLike<number>, delta: ArrayLike<number>): Float32Array {
  const out = new Float32Array(base.length);
  for (let i = 0; i < base.length; i += 1) out[i] = (base[i] ?? 0) + (delta[i] ?? 0);
  return out;
}
