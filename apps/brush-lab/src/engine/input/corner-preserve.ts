import type { OneEuroParams } from "./one-euro";
import type { Pt } from "../core/types";

/**
 * 모서리 보존. 1€ 필터는 저속·고곡률에서 모서리를 둥글리므로
 * 곡률이 크면 차단 주파수를 올려 추종하고, 아주 느리면 차단 주파수를 내려 떨림을 억제한다.
 *
 * 손떨림(표본 간격보다 큰 잡음)은 표본 3개만 보면 모서리와 구분되지 않으므로,
 * 모서리 판정은 "직전 진행 방향이 일관됐는가"(연속 걸음의 평균 코사인)로 게이트한다.
 * 깨끗한 L자 경로는 일관성 1·회전각 90°로 모서리, 떨림은 일관성 ≈ 0이라 모서리가 아니다.
 */

/** 모서리 판정 회전각(rad). 설계 보충 §2.6: 최근 3표본 회전각 > 60°. */
export const CORNER_ANGLE_RAD = Math.PI / 3;
/** 모서리 판정에 필요한 직전 방향 일관성(평균 코사인) 하한. */
export const CORNER_MIN_CONSISTENCY = 0.85;
/** 방향 추정용 앵커 최소 간격(px). 이보다 짧은 걸음은 방향 잡음이라 앵커로 쓰지 않는다. */
export const CORNER_MIN_STEP_PX = 0.75;
/** 일관성 계산에 쓰는 직전 걸음 수. */
export const CORNER_CONSISTENCY_WINDOW = 6;
/** 모서리 뒤 N표본 동안 minCutoff를 올려 필터가 새 방향에 빨리 붙게 한다(설계 보충 §2.6: ×4). */
export const CORNER_HOLD_SAMPLES = 4;
export const CORNER_HOLD_CUTOFF_SCALE = 4;

/** Menger 곡률(1/px, 부호 있음: 왼쪽 회전 양수). 퇴화 삼각형은 0. */
export function estimateCurvature(p0: Pt, p1: Pt, p2: Pt): number {
  const ax = p1.x - p0.x;
  const ay = p1.y - p0.y;
  const bx = p2.x - p1.x;
  const by = p2.y - p1.y;
  const cx = p2.x - p0.x;
  const cy = p2.y - p0.y;
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  const lc = Math.hypot(cx, cy);
  if (la < 1e-6 || lb < 1e-6 || lc < 1e-6) return 0;
  const cross = ax * by - ay * bx;
  return (2 * cross) / (la * lb * lc);
}

/** 두 걸음(p0→p1, p1→p2) 사이 회전각(rad, 0..π). 퇴화 걸음은 0. */
export function turnAngle(p0: Pt, p1: Pt, p2: Pt): number {
  const ax = p1.x - p0.x;
  const ay = p1.y - p0.y;
  const bx = p2.x - p1.x;
  const by = p2.y - p1.y;
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (la < 1e-6 || lb < 1e-6) return 0;
  const cos = (ax * bx + ay * by) / (la * lb);
  return Math.acos(cos < -1 ? -1 : cos > 1 ? 1 : cos);
}

export interface AdaptiveCutoffOptions {
  curvatureGain: number;
  slowSpeedPxPerMs: number;
  slowCutoffScale: number;
}

/**
 * 곡률·속도 적응 파라미터.
 * |curvature|가 크면 minCutoff ↑(추종), 속도 < slowSpeed면 minCutoff × slowCutoffScale(떨림 억제).
 */
export function adaptiveCutoff(
  base: OneEuroParams,
  curvature: number,
  speedPxPerMs: number,
  opts: AdaptiveCutoffOptions,
): OneEuroParams {
  let minCutoff = base.minCutoff * (1 + opts.curvatureGain * Math.abs(curvature));
  if (speedPxPerMs < opts.slowSpeedPxPerMs) {
    minCutoff *= opts.slowCutoffScale;
  }
  return { minCutoff, beta: base.beta, dCutoff: base.dCutoff };
}

/** 예측을 꺼야 하는 상황(모서리 또는 저속). */
export function shouldSuppressPrediction(
  curvature: number,
  speedPxPerMs: number,
  cornerCurvature: number,
  slowSpeedPxPerMs: number,
): boolean {
  return Math.abs(curvature) > cornerCurvature || speedPxPerMs < slowSpeedPxPerMs;
}

export interface CornerVerdict {
  /** 이 표본이 모서리 직후 표본(정점은 직전 앵커)인가. */
  isCorner: boolean;
  /** 직전 두 앵커와 이 점의 회전각(rad). */
  turnRad: number;
  /** 직전 걸음들의 방향 일관성 0..1(평균 코사인, 음수는 0). 앵커가 2개 미만이면 0. */
  consistency: number;
  /** 잡음 게이트를 거친 Menger 곡률(1/px) = 원 곡률 × consistency². */
  curvature: number;
}

export interface CornerDetectorOptions {
  cornerAngleRad?: number;
  minConsistency?: number;
  minStepPx?: number;
  window?: number;
}

/**
 * 모서리 감지기(상태 있음). 앵커(≥ minStepPx 간격의 raw 점)를 유지하고,
 * 새 점이 들어올 때 (a−2, a−1, p)의 회전각과 직전 걸음 방향의 일관성으로 판정한다.
 */
export class CornerDetector {
  private readonly cornerAngleRad: number;
  private readonly minConsistency: number;
  private readonly minStepPx: number;
  private readonly window: number;
  private anchors: Pt[] = [];
  /** 연속 걸음 방향 사이 코사인(최근 window개). */
  private stepCos: number[] = [];
  private lastDir: { x: number; y: number } | null = null;

  constructor(opts: CornerDetectorOptions = {}) {
    this.cornerAngleRad = opts.cornerAngleRad ?? CORNER_ANGLE_RAD;
    this.minConsistency = opts.minConsistency ?? CORNER_MIN_CONSISTENCY;
    this.minStepPx = opts.minStepPx ?? CORNER_MIN_STEP_PX;
    this.window = Math.max(1, Math.floor(opts.window ?? CORNER_CONSISTENCY_WINDOW));
  }

  reset(): void {
    this.anchors = [];
    this.stepCos = [];
    this.lastDir = null;
  }

  /** 직전 걸음들의 방향 일관성(현재 걸음 제외). */
  consistency(): number {
    if (this.stepCos.length === 0) return 0;
    let sum = 0;
    for (const c of this.stepCos) sum += c;
    const mean = sum / this.stepCos.length;
    return mean < 0 ? 0 : mean > 1 ? 1 : mean;
  }

  push(p: Pt): CornerVerdict {
    const n = this.anchors.length;
    const last = this.anchors[n - 1];
    if (!last) {
      this.anchors.push({ x: p.x, y: p.y });
      return { isCorner: false, turnRad: 0, consistency: 0, curvature: 0 };
    }
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    const len = Math.hypot(dx, dy);
    if (len < this.minStepPx) {
      // 앵커 간격 미만: 방향 추정에 쓰지 않는다(잡음). 현재 상태만 보고한다.
      return { isCorner: false, turnRad: 0, consistency: this.consistency(), curvature: 0 };
    }
    const prev = this.anchors[n - 2];
    const consistency = this.consistency();
    let turnRad = 0;
    let curvature = 0;
    if (prev) {
      turnRad = turnAngle(prev, last, p);
      curvature = estimateCurvature(prev, last, p) * consistency * consistency;
    }
    const isCorner = prev !== undefined && this.stepCos.length >= 2 && turnRad >= this.cornerAngleRad && consistency >= this.minConsistency;
    const dir = { x: dx / len, y: dy / len };
    if (this.lastDir) {
      const cos = this.lastDir.x * dir.x + this.lastDir.y * dir.y;
      this.stepCos.push(cos);
      if (this.stepCos.length > this.window) this.stepCos.shift();
    }
    this.lastDir = dir;
    this.anchors.push({ x: p.x, y: p.y });
    if (this.anchors.length > 3) this.anchors.shift();
    if (isCorner) {
      // 모서리 뒤에는 새 방향을 기준으로 일관성을 다시 쌓는다.
      this.stepCos = [];
    }
    return { isCorner, turnRad, consistency, curvature };
  }
}
