/**
 * 눈 4파츠(안구·홍채·동공·하이라이트) × 좌우 × 스타일. 안구는 UV 구, 나머지는 안구 구면 위 타원 캡 디스크다.
 * `eyes` 프리셋(6종)은 안구 비율·속눈썹을, `irises` 프리셋(5종)은 홍채 각반경·동공 모양·하이라이트 배치를 정한다.
 * 모든 좌표는 머리 프레임을 거쳐 모델 공간으로 나오며 오른눈은 왼눈의 x 거울이다.
 */
import { HEAD_LANDMARKS, headLocalToWorld, type HeadFrame } from "../proportions";

import { mergeTriMeshes, mirrorTriMeshX, sphericalDisc, uvSphere, type TriMesh } from "./tri-mesh";

import type { EyesStyleId, IrisStyleId } from "../../../contracts";
import type { Vec2, Vec3 } from "../../../shared/math";

export type EyeSide = "left" | "right";
export const EYE_SIDES: readonly EyeSide[] = ["left", "right"];

export interface EyeStyleSpec {
  readonly labelKo: string;
  /** 안구 축별 배율(x, y, z) */
  readonly eyeballScale: Vec3;
  /** 속눈썹 길이(머리 로컬) */
  readonly lashLength: number;
  /** 속눈썹 말림(앞으로 기울임 비율) */
  readonly lashCurl: number;
  /** 속눈썹 호 각 범위(rad, 중심 기준 ±) */
  readonly lashArc: number;
}

export const EYE_STYLE_SPECS: Readonly<Record<EyesStyleId, EyeStyleSpec>> = {
  almond: { labelKo: "아몬드", eyeballScale: [1, 1, 1], lashLength: 0.1, lashCurl: 0.5, lashArc: 1.0 },
  round: { labelKo: "둥근", eyeballScale: [1.08, 1.12, 1.04], lashLength: 0.11, lashCurl: 0.55, lashArc: 1.1 },
  droopy: { labelKo: "처진", eyeballScale: [1.02, 0.98, 1], lashLength: 0.12, lashCurl: 0.35, lashArc: 1.05 },
  upturned: { labelKo: "올라간", eyeballScale: [1, 1, 1], lashLength: 0.11, lashCurl: 0.7, lashArc: 0.95 },
  narrow: { labelKo: "가는", eyeballScale: [1.04, 0.82, 0.98], lashLength: 0.08, lashCurl: 0.4, lashArc: 1.15 },
  wide: { labelKo: "큰", eyeballScale: [1.12, 1.18, 1.06], lashLength: 0.13, lashCurl: 0.6, lashArc: 1.0 },
};

export interface IrisHighlightSpec {
  /** 홍채 중심 기준 각 오프셋(rad): x=바깥쪽, y=위 */
  readonly offset: Vec2;
  readonly angularRadius: number;
}

export interface IrisStyleSpec {
  readonly labelKo: string;
  readonly irisAngularRadius: number;
  /** 동공 각반경 비율(홍채 대비, x·y) */
  readonly pupilRatio: Vec2;
  readonly highlights: readonly IrisHighlightSpec[];
}

export const IRIS_STYLE_SPECS: Readonly<Record<IrisStyleId, IrisStyleSpec>> = {
  "round-large": { labelKo: "크고 둥근", irisAngularRadius: 0.62, pupilRatio: [0.45, 0.45], highlights: [{ offset: [-0.2, 0.22], angularRadius: 0.13 }] },
  "round-small": { labelKo: "작고 둥근", irisAngularRadius: 0.48, pupilRatio: [0.42, 0.42], highlights: [{ offset: [-0.15, 0.16], angularRadius: 0.09 }] },
  cat: { labelKo: "고양이", irisAngularRadius: 0.58, pupilRatio: [0.14, 0.72], highlights: [{ offset: [-0.18, 0.2], angularRadius: 0.1 }] },
  "star-highlight": {
    labelKo: "별 하이라이트",
    irisAngularRadius: 0.6,
    pupilRatio: [0.4, 0.4],
    highlights: [
      { offset: [-0.2, 0.2], angularRadius: 0.14 },
      { offset: [0.18, -0.18], angularRadius: 0.07 },
      { offset: [0.0, 0.3], angularRadius: 0.05 },
    ],
  },
  "soft-gradient": { labelKo: "부드러운 그라데이션", irisAngularRadius: 0.66, pupilRatio: [0.5, 0.5], highlights: [{ offset: [-0.22, 0.24], angularRadius: 0.16 }] },
};

export function sideSign(side: EyeSide): number {
  return side === "left" ? 1 : -1;
}

/** 안구 중심(모델 공간) */
export function eyeCenter(frame: HeadFrame, side: EyeSide): Vec3 {
  const e = HEAD_LANDMARKS.eye;
  return headLocalToWorld(frame, [sideSign(side) * e[0], e[1], e[2]]);
}

export function eyeballRadius(frame: HeadFrame): number {
  return HEAD_LANDMARKS.eyeballRadius * frame.scale;
}

/** 오른쪽은 왼쪽 메시의 정확한 x 거울(정점 대응 유지) */
function sided(side: EyeSide, left: TriMesh): TriMesh {
  return side === "left" ? left : mirrorTriMeshX(left);
}

export function buildEyeball(frame: HeadFrame, side: EyeSide, style: EyesStyleId): TriMesh {
  const spec = EYE_STYLE_SPECS[style];
  const r = eyeballRadius(frame);
  return sided(
    side,
    uvSphere({
      center: eyeCenter(frame, "left"),
      radii: [r * spec.eyeballScale[0], r * spec.eyeballScale[1], r * spec.eyeballScale[2]],
      longitudes: 16,
      latitudes: 12,
    }),
  );
}

const UP: Vec3 = [0, 1, 0];

function disc(frame: HeadFrame, side: EyeSide, style: EyesStyleId, lift: number, angularX: number, angularY: number, offset: Vec2): TriMesh {
  const spec = EYE_STYLE_SPECS[style];
  const r = eyeballRadius(frame) * spec.eyeballScale[2] * lift;
  // 오프셋은 구면 위 회전으로 근사: forward를 오프셋만큼 기울인다(왼눈 기준, x 양수 = 바깥쪽).
  const ox = offset[0];
  const oy = offset[1];
  const forward: Vec3 = [Math.sin(ox), Math.sin(oy), Math.cos(ox) * Math.cos(oy)];
  const len = Math.hypot(forward[0], forward[1], forward[2]);
  return sided(
    side,
    sphericalDisc({
      center: eyeCenter(frame, "left"),
      radius: r,
      forward: [forward[0] / len, forward[1] / len, forward[2] / len],
      up: UP,
      angularRadiusX: angularX,
      angularRadiusY: angularY,
      segments: 24,
      rings: 3,
    }),
  );
}

export function buildIris(frame: HeadFrame, side: EyeSide, eyes: EyesStyleId, iris: IrisStyleId): TriMesh {
  const spec = IRIS_STYLE_SPECS[iris];
  return disc(frame, side, eyes, 1.004, spec.irisAngularRadius, spec.irisAngularRadius, [0, 0]);
}

export function buildPupil(frame: HeadFrame, side: EyeSide, eyes: EyesStyleId, iris: IrisStyleId): TriMesh {
  const spec = IRIS_STYLE_SPECS[iris];
  return disc(frame, side, eyes, 1.008, spec.irisAngularRadius * spec.pupilRatio[0], spec.irisAngularRadius * spec.pupilRatio[1], [0, 0]);
}

export function buildEyeHighlight(frame: HeadFrame, side: EyeSide, eyes: EyesStyleId, iris: IrisStyleId): TriMesh {
  const spec = IRIS_STYLE_SPECS[iris];
  return mergeTriMeshes(spec.highlights.map((h) => disc(frame, side, eyes, 1.012, h.angularRadius, h.angularRadius, h.offset)));
}
