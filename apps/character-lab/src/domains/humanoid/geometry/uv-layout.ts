/**
 * 고정 UV 아틀라스. 머리 파츠는 u∈[0,0.5], 몸(피부) 파츠는 u∈[0.5,1]을 쓴다(스펙: 부위별 섬 고정).
 * 다른 파츠(눈·치아 등)는 각자 [0,1]² 전체를 쓴다. 모든 섬은 거터만큼 안쪽으로 들여 배치한다.
 */
import type { Vec2 } from "../../../shared/math";

export interface UvRect {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

function rect(u0: number, v0: number, u1: number, v1: number): UvRect {
  return { u0, v0, u1, v1 };
}

export const UV_ISLANDS = {
  // 머리 파츠(u 0~0.5)
  head: rect(0.0, 0.3, 0.5, 1.0),
  leftEar: rect(0.0, 0.15, 0.1, 0.3),
  rightEar: rect(0.1, 0.15, 0.2, 0.3),
  // 피부 파츠(u 0.5~1)
  torso: rect(0.5, 0.6, 1.0, 1.0),
  leftArm: rect(0.5, 0.4, 0.75, 0.6),
  rightArm: rect(0.75, 0.4, 1.0, 0.6),
  leftLeg: rect(0.5, 0.15, 0.75, 0.4),
  rightLeg: rect(0.75, 0.15, 1.0, 0.4),
} as const;

export type UvIslandId = keyof typeof UV_ISLANDS;

/**
 * 입 안(주머니) 섬: 머리 캡 셀 6·7을 합친 [0.35,0.5]×[0.225,0.3]. 관 부분(입술 → 안쪽 벽)은 아래 [v 0.225~0.285],
 * 안쪽 끝 캡은 위 [v 0.285~0.3]의 원형 셀을 쓴다. 머리 캡 셀 0~5(폴·귀)와 겹치지 않는다.
 */
export const MOUTH_TUBE_RECT: UvRect = rect(0.35, 0.225, 0.5, 0.285);
export const MOUTH_CAP_RECT: UvRect = rect(0.405, 0.285, 0.445, 0.3);

export const DEFAULT_UV_GUTTER = 0.012;

/** [0,1]² 로컬 좌표를 섬 사각형 안(거터 포함)으로 사상 */
export function placeUv(island: UvRect, u: number, v: number, gutter = DEFAULT_UV_GUTTER): Vec2 {
  const w = island.u1 - island.u0;
  const h = island.v1 - island.v0;
  const gu = Math.min(gutter, w * 0.25);
  const gv = Math.min(gutter, h * 0.25);
  return [island.u0 + gu + (w - 2 * gu) * u, island.v0 + gv + (h - 2 * gv) * v];
}

/** 손가락 띠: 왼손 [0.5,0.75]×[0,0.15], 오른손 [0.75,1]×[0,0.15]을 5칸으로 나눈다. */
export function fingerStripRect(side: "left" | "right", finger: number): UvRect {
  const base = side === "left" ? 0.5 : 0.75;
  const width = 0.25 / 5;
  return rect(base + finger * width, 0.0, base + (finger + 1) * width, 0.15);
}

/** 캡(폴) 섬: 머리 파츠는 [0.2,0.5]×[0.15,0.3]을 4×2칸, 피부 파츠는 [0.5,1]×[0.0,0.15]에 겹치지 않는 별도 띠 */
export function capCellRect(group: "head" | "skin", index: number): UvRect {
  if (group === "head") {
    const cols = 4;
    const cell = 0.3 / cols;
    const col = index % cols;
    const row = Math.floor(index / cols);
    return rect(0.2 + col * cell, 0.15 + row * 0.075, 0.2 + (col + 1) * cell, 0.15 + (row + 1) * 0.075);
  }
  // 피부 캡은 손가락 띠 아래쪽에 두지 않고 다리 섬 사이 여백 대신 [0.5,1]×[0.0,0.15] 중 손가락이 쓰지 않는
  // 세로 여백이 없으므로, 손가락 띠의 상단 1/4(v 0.11~0.15)을 캡 전용 띠로 나눈다(손가락은 v 0~0.11).
  const cols = 16;
  const cell = 0.5 / cols;
  const col = index % cols;
  return rect(0.5 + col * cell, 0.112, 0.5 + (col + 1) * cell, 0.15);
}

/** 손가락 띠 중 캡 띠를 제외한 영역 */
export function fingerBodyRect(side: "left" | "right", finger: number): UvRect {
  const strip = fingerStripRect(side, finger);
  return rect(strip.u0, strip.v0, strip.u1, 0.11);
}

/** 원형 섬 UV(n+1개, 마지막은 첫 점 복제) + 중심 */
export function discIslandUvs(island: UvRect, n: number, gutter = DEFAULT_UV_GUTTER): { ring: Vec2[]; center: Vec2 } {
  const ring: Vec2[] = [];
  for (let k = 0; k <= n; k += 1) {
    const theta = (2 * Math.PI * (k % n)) / n;
    ring.push(placeUv(island, 0.5 + 0.5 * Math.cos(theta), 0.5 + 0.5 * Math.sin(theta), gutter));
  }
  return { ring, center: placeUv(island, 0.5, 0.5, gutter) };
}
