import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "./studio-virtual-space-model";

export const STUDIO_CHARACTER_FOOT_ORIGIN = 492 / 512;
export const STUDIO_GAIT_DISTANCE_PER_CYCLE = 84;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const finitePoint = (point: StudioVirtualSpacePoint) => Number.isFinite(point.x) && Number.isFinite(point.y);
const lerpPoint = (a: StudioVirtualSpacePoint, b: StudioVirtualSpacePoint, t: number) => ({
  x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
});

/** Keep fixed physics ticks on their simulation clock instead of stamping every catch-up step with one RAF time. */
export class StudioFixedStepClock {
  private tickAt: number;

  constructor(startAt = 0) {
    this.tickAt = Number.isFinite(startAt) ? startAt : 0;
  }

  get time(): number {
    return this.tickAt;
  }

  reset(time: number): number {
    if (Number.isFinite(time)) this.tickAt = time;
    return this.tickAt;
  }

  advance(deltaSeconds: number): number {
    if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) this.tickAt += deltaSeconds * 1_000;
    return this.tickAt;
  }

  /** A suspended tab can advance the RAF clock without running physics. Rebase once instead of drifting forever. */
  reconcile(renderTime: number, maxDriftMs = 250): number {
    const limit = Number.isFinite(maxDriftMs) ? Math.max(0, maxDriftMs) : 250;
    if (Number.isFinite(renderTime) && Math.abs(renderTime - this.tickAt) > limit) this.tickAt = renderTime;
    return this.tickAt;
  }
}

/** One fixed-step of visual latency, independent of monitor refresh rate. */
export class StudioFixedStepPose {
  private previous: StudioVirtualSpacePoint;
  private current: StudioVirtualSpacePoint;
  private observedAt = 0;
  constructor(point: StudioVirtualSpacePoint, private readonly stepMs = 1000 / 60) {
    this.previous = { ...point }; this.current = { ...point };
  }
  reset(point: StudioVirtualSpacePoint, time = 0): void {
    if (!finitePoint(point)) return;
    this.previous = { ...point }; this.current = { ...point }; this.observedAt = time;
  }
  observe(point: StudioVirtualSpacePoint, time: number): void {
    if (!finitePoint(point) || !Number.isFinite(time)) return;
    if (Math.hypot(point.x - this.current.x, point.y - this.current.y) > 128) {
      this.reset(point, time); return;
    }
    this.previous = this.current; this.current = { ...point }; this.observedAt = time;
  }
  sample(time: number): StudioVirtualSpacePoint {
    return lerpPoint(this.previous, this.current, clamp01((time - this.observedAt) / this.stepMs));
  }
}

export interface StudioPeerTimelineSample extends StudioVirtualSpacePoint {
  readonly at: number;
  readonly sequence?: number;
  readonly moving: boolean;
  readonly facing: StudioVirtualSpaceFacing;
}

export interface StudioPeerPresentation extends StudioVirtualSpacePoint {
  readonly moving: boolean;
  readonly facing: StudioVirtualSpaceFacing;
}

function presentPeerSample(sample: StudioPeerTimelineSample): StudioPeerPresentation {
  return { x: sample.x, y: sample.y, moving: sample.moving, facing: sample.facing };
}

/** Arrival-clock interpolation, never trusts another browser's wall clock. */
export class StudioPeerTimeline {
  private samples: StudioPeerTimelineSample[] = [];
  constructor(private readonly delayMs = 85, private readonly extrapolationMs = 80) {}
  push(sample: StudioPeerTimelineSample): void {
    if (!finitePoint(sample) || !Number.isFinite(sample.at)) return;
    const last = this.samples.at(-1);
    const sequenced = last
      && Number.isSafeInteger(last.sequence)
      && Number.isSafeInteger(sample.sequence);
    if (last && (sequenced ? sample.sequence! <= last.sequence! : sample.at <= last.at)) return;
    if (last && (sample.at - last.at > 1500 || Math.hypot(sample.x - last.x, sample.y - last.y) > 260)) this.samples = [];
    const current = this.samples.at(-1);
    this.samples.push({
      ...sample,
      at: current && sample.at <= current.at ? current.at + 0.001 : sample.at,
    });
    if (this.samples.length > 24) this.samples.shift();
  }
  sample(now: number): StudioPeerPresentation | null {
    const first = this.samples[0]; const last = this.samples.at(-1);
    if (!first || !last) return null;
    const at = now - this.delayMs;
    if (at <= first.at) return presentPeerSample(first);
    for (let i = 1; i < this.samples.length; i++) {
      const right = this.samples[i]!; const left = this.samples[i - 1]!;
      if (at <= right.at) {
        const progress = clamp01((at - left.at) / (right.at - left.at));
        const point = lerpPoint(left, right, progress);
        const travel = { x: right.x - left.x, y: right.y - left.y };
        const traversing = progress > 0 && progress < 1 && Math.hypot(travel.x, travel.y) > 0.01;
        const intervalSeconds = Math.max(0.001, (right.at - left.at) / 1_000);
        const velocity = { x: travel.x / intervalSeconds, y: travel.y / intervalSeconds };
        return {
          ...point,
          moving: traversing || (progress >= 1 ? right.moving : left.moving),
          facing: traversing
            ? studioStableFacing(velocity, left.facing)
            : progress >= 1 ? right.facing : left.facing,
        };
      }
    }
    const previous = this.samples.at(-2);
    if (!last.moving || !previous) return presentPeerSample(last);
    const overdue = Math.max(0, at - last.at);
    const elapsed = Math.min(this.extrapolationMs, overdue);
    const interval = Math.max(16, last.at - previous.at);
    const vx = (last.x - previous.x) / interval, vy = (last.y - previous.y) / interval;
    const limit = Math.min(1, 0.5 / Math.max(0.0001, Math.hypot(vx, vy)));
    const velocity = { x: vx * limit, y: vy * limit };
    return {
      x: last.x + velocity.x * elapsed,
      y: last.y + velocity.y * elapsed,
      moving: overdue <= this.extrapolationMs && Math.hypot(velocity.x, velocity.y) > 0.0001,
      facing: studioStableFacing({ x: velocity.x * 1_000, y: velocity.y * 1_000 }, last.facing),
    };
  }
}

/** Walk phase is distance-driven: no treadmill at walls or slow analog input. */
export function studioGaitFrame(distance: number, frameCount: number, stride = STUDIO_GAIT_DISTANCE_PER_CYCLE): number {
  if (!Number.isFinite(distance) || frameCount < 1 || stride <= 0) return 0;
  return Math.floor(((Math.max(0, distance) % stride) / stride) * frameCount) % frameCount;
}

/** Hysteresis avoids sprite front/side flicker around diagonal directions. */
export function studioStableFacing(vector: StudioVirtualSpacePoint, previous: StudioVirtualSpaceFacing): StudioVirtualSpaceFacing {
  const ax = Math.abs(vector.x), ay = Math.abs(vector.y);
  if (!finitePoint(vector) || Math.hypot(ax, ay) < 6) return previous;
  const wasHorizontal = previous === "left" || previous === "right";
  const horizontal = wasHorizontal ? ax >= ay * 0.82 : ax > ay * 1.18;
  return horizontal ? vector.x < 0 ? "left" : "right" : vector.y < 0 ? "up" : "down";
}

export function studioRenderViewport(width: number, height: number, deviceRatio: number) {
  const cssWidth = Math.max(1, Number.isFinite(width) ? Math.round(width) : 1);
  const cssHeight = Math.max(1, Number.isFinite(height) ? Math.round(height) : 1);
  const requested = Number.isFinite(deviceRatio) ? deviceRatio : 1;
  const ratio = Math.min(2, Math.max(1, requested), Math.sqrt(4_000_000 / (cssWidth * cssHeight)));
  return { cssWidth, cssHeight, ratio, width: Math.round(cssWidth * ratio), height: Math.round(cssHeight * ratio) };
}

/** Cover a fixed world without distorting native artwork; any excess is cropped equally around the centre. */
export function studioCoverRect(
  targetWidth: number,
  targetHeight: number,
  sourceWidth: number,
  sourceHeight: number,
) {
  const width = Number.isFinite(targetWidth) && targetWidth > 0 ? targetWidth : 1;
  const height = Number.isFinite(targetHeight) && targetHeight > 0 ? targetHeight : 1;
  const nativeWidth = Number.isFinite(sourceWidth) && sourceWidth > 0 ? sourceWidth : width;
  const nativeHeight = Number.isFinite(sourceHeight) && sourceHeight > 0 ? sourceHeight : height;
  const scale = Math.max(width / nativeWidth, height / nativeHeight);
  const coveredWidth = nativeWidth * scale;
  const coveredHeight = nativeHeight * scale;
  return {
    x: (width - coveredWidth) / 2,
    y: (height - coveredHeight) / 2,
    width: coveredWidth,
    height: coveredHeight,
  };
}

/** Convert a 60-Hz smoothing factor into an equivalent arbitrary-frame factor. */
export function studioCameraLerp(deltaSeconds: number, base = 0.12): number {
  const dt = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(0.05, deltaSeconds)) : 0;
  return 1 - Math.pow(1 - base, dt * 60);
}
