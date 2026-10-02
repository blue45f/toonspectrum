import type { Pcg32 } from "../core/rng";

/** 산포 스펙. 모두 0이면 산포 없음. */
export interface ScatterSpec {
  /** 위치 산포 반경(px). */
  positionPx: number;
  /** 각도 산포 ±rad. */
  angleRad: number;
  /** 크기 산포 ±비율(0.2 = ±20%). */
  scale: number;
  /** dab 개수 지터 0..1(spray 등에서 추가 dab 확률). */
  countJitter: number;
}

export const NO_SCATTER: ScatterSpec = { positionPx: 0, angleRad: 0, scale: 0, countJitter: 0 };

/**
 * 산포 오프셋. 스펙 값과 무관하게 항상 난수 4개를 소비해 수열 위치가 고정된다
 * (산포 on/off가 다른 dab의 난수를 바꾸지 않는다).
 */
export function scatterOffset(
  rng: Pcg32,
  spec: ScatterSpec,
): { dx: number; dy: number; dAngle: number; dScale: number } {
  const u1 = rng.nextF32();
  const u2 = rng.nextF32();
  const u3 = rng.nextF32();
  const u4 = rng.nextF32();
  const theta = u1 * Math.PI * 2;
  const radius = spec.positionPx * Math.sqrt(u2);
  return {
    dx: Math.cos(theta) * radius,
    dy: Math.sin(theta) * radius,
    dAngle: (u3 * 2 - 1) * spec.angleRad,
    dScale: Math.max(0.05, 1 + (u4 * 2 - 1) * spec.scale),
  };
}
