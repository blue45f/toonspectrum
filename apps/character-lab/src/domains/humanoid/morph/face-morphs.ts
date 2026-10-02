/**
 * 얼굴 파라미터 15종 ± morph와 FACS 16 델타: 머리 프레임 로컬 공간에서 필드를 평가해 모델 공간 델타로 바꾼다.
 * 머리 케이지(용접 정점)·눈썹·속눈썹·안구 파츠·치아·혀 등 어떤 정점 배열에도 같은 필드를 쓴다.
 */
import { FACE_PARAM_KEYS, FACS_UNITS, facsMorphName, paramMorphName, type FaceParamKey, type FacsUnit, type MorphTargetName } from "../../../contracts";
import { worldToHeadLocal, type HeadFrame } from "../proportions";

import { FACE_PARAM_FIELDS, FACS_FIELDS, type FaceField, type FaceMorphScope } from "./face-fields";

export interface NamedDelta {
  readonly name: MorphTargetName;
  /** 정점 ×3(모델 공간) */
  readonly deltaPositions: Float32Array;
}

/**
 * 스펙 공개 API(일반형): 필드를 정점 배열(모델 공간)에 평가한다. sign은 ± 방향.
 */
export function evaluateFaceField(field: FaceField, positions: Float32Array, frame: HeadFrame, scope: FaceMorphScope, sign: 1 | -1 = 1): Float32Array {
  const out = new Float32Array(positions.length);
  const k = frame.scale * sign;
  for (let i = 0; i < positions.length; i += 3) {
    const local = worldToHeadLocal(frame, [positions[i], positions[i + 1], positions[i + 2]]);
    const d = field(local, scope);
    out[i] = d[0] * k;
    out[i + 1] = d[1] * k;
    out[i + 2] = d[2] * k;
  }
  return out;
}

/** 얼굴 파라미터 ± 30개(키 순서 × +,−) */
export function buildFaceParamDeltas(positions: Float32Array, frame: HeadFrame, scope: FaceMorphScope, keys: readonly FaceParamKey[] = FACE_PARAM_KEYS): NamedDelta[] {
  const out: NamedDelta[] = [];
  for (const key of keys) {
    const plus = evaluateFaceField(FACE_PARAM_FIELDS[key], positions, frame, scope, 1);
    const minus = new Float32Array(plus.length);
    for (let i = 0; i < plus.length; i += 1) minus[i] = -plus[i];
    out.push({ name: paramMorphName(key, "+"), deltaPositions: plus }, { name: paramMorphName(key, "-"), deltaPositions: minus });
  }
  return out;
}

/** FACS 16 델타 */
export function buildFacsDeltas(positions: Float32Array, frame: HeadFrame, scope: FaceMorphScope, units: readonly FacsUnit[] = FACS_UNITS): NamedDelta[] {
  return units.map((unit) => ({ name: facsMorphName(unit), deltaPositions: evaluateFaceField(FACS_FIELDS[unit], positions, frame, scope, 1) }));
}
