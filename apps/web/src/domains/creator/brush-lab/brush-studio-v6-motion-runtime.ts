import type { BrushStudioV6MaterialPoint } from "./brush-studio-v6-material-engine";

export interface BrushStudioV6MotionFilter {
  push(point: BrushStudioV6MaterialPoint): BrushStudioV6MaterialPoint;
  reset(): void;
}

const finite = (value: number, fallback = 0): number => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, finite(value, min)));

function normalized(point: BrushStudioV6MaterialPoint): BrushStudioV6MaterialPoint {
  return Object.freeze({
    x: finite(point.x),
    y: finite(point.y),
    pressure: clamp(point.pressure, 0, 1),
    tilt: clamp(point.tilt ?? 0, 0, 1),
    twist: finite(point.twist ?? 0),
  });
}

function moved(
  source: BrushStudioV6MaterialPoint,
  x: number,
  y: number,
): BrushStudioV6MaterialPoint {
  return Object.freeze({ ...source, x, y });
}
export function createBrushStudioV6MotionFilter(input: {
  readonly motionId: string;
  readonly stabilization: number;
  readonly size: number;
  readonly friction: number;
}): BrushStudioV6MotionFilter {
  const strength = clamp(input.stabilization, 0, 1);
  const size = clamp(input.size, 1, 240);
  const friction = clamp(input.friction, 0, 1);
  let output: BrushStudioV6MaterialPoint | null = null;
  let target: BrushStudioV6MaterialPoint | null = null;
  let velocityX = 0;
  let velocityY = 0;

  const direct = (point: BrushStudioV6MaterialPoint): BrushStudioV6MaterialPoint => {
    output = point;
    target = point;
    return point;
  };

  const reset = (): void => {
    output = null;
    target = null;
    velocityX = 0;
    velocityY = 0;
  };

  return {
    push(inputPoint): BrushStudioV6MaterialPoint {
      const point = normalized(inputPoint);
      if (!output || !target || input.motionId === "motion-direct") return direct(point);
      const dx = point.x - output.x;
      const dy = point.y - output.y;
      const distance = Math.hypot(dx, dy);

      if (input.motionId === "motion-adaptive-ema") {
        const velocityFollow = Math.min(0.82, distance / Math.max(1, size * 0.45));
        const alpha = clamp((1 - strength) * 0.55 + velocityFollow * 0.7, 0.06, 0.94);
        output = moved(point, output.x + dx * alpha, output.y + dy * alpha);
      } else if (input.motionId === "motion-spring") {
        const stiffness = 0.08 + (1 - strength) * 0.24;
        const damping = 0.42 + strength * 0.42;
        velocityX = velocityX * damping + dx * stiffness;
        velocityY = velocityY * damping + dy * stiffness;
        output = moved(point, output.x + velocityX, output.y + velocityY);
      } else if (input.motionId === "motion-brush-inertia") {
        const responseLength = size * (0.08 + friction * 0.42 + strength * 0.32);
        const alpha = clamp(1 - Math.exp(-Math.max(0.01, distance) / responseLength), 0.04, 0.92);
        output = moved(point, output.x + dx * alpha, output.y + dy * alpha);
      } else if (input.motionId === "motion-lazy-leash") {
        const radius = size * (0.12 + strength * 0.82);
        if (distance > radius) {
          const ratio = (distance - radius) / distance;
          output = moved(point, output.x + dx * ratio, output.y + dy * ratio);
        } else {
          output = moved(point, output.x, output.y);
        }
      } else {
        return direct(point);
      }
      target = point;
      return output;
    },
    reset,
  };
}
