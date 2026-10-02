/**
 * FACS 16 델타 공개 진입점. 실제 필드는 face-fields.ts, 평가는 face-morphs.ts에 있다.
 * 치아(아랫니)·혀는 `teeth`/`tongue` 스코프로 턱 열림·깔때기·혀 내밀기 델타를 받는다.
 */
import { FACS_UNITS } from "../../../contracts";

import { FACS_FIELDS } from "./face-fields";
import { buildFacsDeltas, type NamedDelta } from "./face-morphs";

import type { HeadFrame } from "../proportions";
import type { FaceMorphScope } from "./face-fields";

export { FACS_FIELDS };

/** 스펙 공개 API: 16 FACS 델타(모델 공간) */
export function buildFacsMorphs(positions: Float32Array, frame: HeadFrame, scope: FaceMorphScope): NamedDelta[] {
  return buildFacsDeltas(positions, frame, scope, FACS_UNITS);
}

export const FACS_MORPH_COUNT = FACS_UNITS.length;
