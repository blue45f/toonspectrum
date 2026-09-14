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

function moved(source: BrushStudioV6MaterialPoint, x: number, y: number): BrushStudioV6MaterialPoint {
  return Object.freeze({ ...source, x, y });
}

/** Exact first-order response to a target moving linearly over arc length. */
function advanceDistanceLag(input: {
  readonly output: BrushStudioV6MaterialPoint;
  readonly target: BrushStudioV6MaterialPoint;
  readonly point: BrushStudioV6MaterialPoint;
  readonly distance: number;
  readonly unitX: number;
  readonly unitY: number;
  readonly responseLength: number;
}): BrushStudioV6MaterialPoint {
  const decay = Math.exp(-input.distance / input.responseLength);
  const errorX = input.output.x - input.target.x;
  const errorY = input.output.y - input.target.y;
  const nextErrorX = (errorX + input.responseLength * input.unitX) * decay
    - input.responseLength * input.unitX;
  const nextErrorY = (errorY + input.responseLength * input.unitY) * decay
    - input.responseLength * input.unitY;
  return moved(input.point, input.point.x + nextErrorX, input.point.y + nextErrorY);
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
  let springDerivativeX = 0;
  let springDerivativeY = 0;

  const direct = (point: BrushStudioV6MaterialPoint): BrushStudioV6MaterialPoint => {
    output = point;
    target = point;
    springDerivativeX = 0;
    springDerivativeY = 0;
    return point;
  };

  const reset = (): void => {
    output = null;
    target = null;
    springDerivativeX = 0;
    springDerivativeY = 0;
  };

  return {
    push(inputPoint): BrushStudioV6MaterialPoint {
      const point = normalized(inputPoint);
      if (!output || !target || input.motionId === "motion-direct") return direct(point);
      const targetDx = point.x - target.x;
      const targetDy = point.y - target.y;
      const distance = Math.hypot(targetDx, targetDy);
      if (distance < 1e-9) {
        target = point;
        return moved(point, output.x, output.y);
      }
      const unitX = targetDx / distance;
      const unitY = targetDy / distance;
      // Teleports and severely sparse samples are explicit discontinuities. Keeping a
      // smoothing tail here would repaint behind the already committed bounded segment.
      if (distance > size * 64) return direct(point);

      if (input.motionId === "motion-adaptive-ema") {
        output = advanceDistanceLag({
          output,
          target,
          point,
          distance,
          unitX,
          unitY,
          responseLength: Math.max(0.35, size * (0.035 + strength * 0.28)),
        });
      } else if (input.motionId === "motion-brush-inertia") {
        output = advanceDistanceLag({
          output,
          target,
          point,
          distance,
          unitX,
          unitY,
          responseLength: Math.max(0.5, size * (0.08 + friction * 0.32 + strength * 0.24)),
        });
      } else if (input.motionId === "motion-spring") {
        const responseLength = Math.max(0.6, size * (0.07 + strength * 0.2));
        const omega = 1 / responseLength;
        const decay = Math.exp(-omega * distance);
        const errorX = output.x - target.x;
        const errorY = output.y - target.y;
        const derivativeErrorX = springDerivativeX - unitX;
        const derivativeErrorY = springDerivativeY - unitY;
        const coefficientX = derivativeErrorX + omega * errorX;
        const coefficientY = derivativeErrorY + omega * errorY;
        const nextErrorX = (errorX + coefficientX * distance) * decay;
        const nextErrorY = (errorY + coefficientY * distance) * decay;
        const nextDerivativeErrorX = (
          coefficientX - omega * (errorX + coefficientX * distance)
        ) * decay;
        const nextDerivativeErrorY = (
          coefficientY - omega * (errorY + coefficientY * distance)
        ) * decay;
        output = moved(point, point.x + nextErrorX, point.y + nextErrorY);
        springDerivativeX = unitX + nextDerivativeErrorX;
        springDerivativeY = unitY + nextDerivativeErrorY;
      } else if (input.motionId === "motion-lazy-leash") {
        const outputDx = point.x - output.x;
        const outputDy = point.y - output.y;
        const outputDistance = Math.hypot(outputDx, outputDy);
        const radius = size * (0.12 + strength * 0.82);
        if (outputDistance > radius) {
          const ratio = (outputDistance - radius) / outputDistance;
          output = moved(point, output.x + outputDx * ratio, output.y + outputDy * ratio);
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
