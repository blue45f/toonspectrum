/**
 * UV 공간 스트로크 보간: 두 입력점 사이를 brush.spacing(반지름 비율) 간격으로 dab을 채운다.
 * - 간격은 픽셀 거리 기준(du·width, dv·height)이며 세그먼트 사이의 잔여 거리(carry)를 이어받아
 *   스트로크 전체에서 dab 간격이 일정하다.
 * - wrap이면 UV 경계(0↔1)를 넘는 최단 경로로 보간하고 결과 UV를 [0,1)로 감는다.
 */
import { wrapUnit } from "./paint-layer";

import type { BrushDab, BrushSettings } from "../contracts";

export interface LayerSize {
  readonly width: number;
  readonly height: number;
}

export interface InterpolateOptions {
  readonly wrap?: boolean;
  /** 이전 세그먼트에서 마지막 dab 이후 진행한 픽셀 거리(0 = 새 스트로크) */
  readonly carry?: number;
}

export interface DabInterpolation {
  /** `from`을 제외하고 `to` 방향으로 배치한 dab(간격 순) */
  readonly dabs: BrushDab[];
  /** 마지막 dab 이후 `to`까지 남은 픽셀 거리(다음 세그먼트의 carry) */
  readonly carry: number;
  /** 이 세그먼트의 픽셀 길이 */
  readonly lengthPx: number;
}

/** dab 간격(px). 최소 0.5px. */
export function spacingPx(brush: Pick<BrushSettings, "radiusPx" | "spacing">): number {
  return Math.max(0.5, brush.spacing * brush.radiusPx);
}

/** 최단 UV 델타. wrap이면 ±0.5를 넘는 성분을 반대 방향으로 감는다. */
export function shortestUvDelta(from: BrushDab, to: BrushDab, wrap: boolean): readonly [number, number] {
  let du = to.u - from.u;
  let dv = to.v - from.v;
  if (wrap) {
    du -= Math.round(du);
    dv -= Math.round(dv);
  }
  return [du, dv];
}

export function uvDistancePx(from: BrushDab, to: BrushDab, size: LayerSize, wrap: boolean): number {
  const [du, dv] = shortestUvDelta(from, to, wrap);
  return Math.hypot(du * size.width, dv * size.height);
}

export function interpolateDabs(from: BrushDab, to: BrushDab, brush: BrushSettings, size: LayerSize, options: InterpolateOptions = {}): DabInterpolation {
  const wrap = options.wrap ?? true;
  const carry = Math.max(0, options.carry ?? 0);
  const [du, dv] = shortestUvDelta(from, to, wrap);
  const lengthPx = Math.hypot(du * size.width, dv * size.height);
  const step = spacingPx(brush);
  const dabs: BrushDab[] = [];
  if (!(lengthPx > 0)) return { dabs, carry, lengthPx: 0 };
  let next = step - carry;
  let lastPlaced = -carry;
  while (next <= lengthPx + 1e-9) {
    const t = Math.min(1, next / lengthPx);
    const u = from.u + du * t;
    const v = from.v + dv * t;
    dabs.push({
      u: wrap ? wrapUnit(u) : u,
      v: wrap ? wrapUnit(v) : v,
      pressure: from.pressure + (to.pressure - from.pressure) * t,
    });
    lastPlaced = next;
    next += step;
  }
  return { dabs, carry: lengthPx - lastPlaced, lengthPx };
}
