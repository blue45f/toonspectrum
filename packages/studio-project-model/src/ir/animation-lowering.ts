import { resolveExposedCel } from "./animation";

import type {
  AnimationCameraTrackIR,
  AnimationGraphIR,
  AnimationKeyframeIR,
} from "./animation";
import type { SceneNodeIR } from "./scene";

/**
 * AnimationGraphIR → per-frame SceneIR lowering (V12 §13, animation lane).
 *
 * The X-sheet stays the timing source of truth: this module only samples it —
 * camera curves via keyframe easing, level stacks via resolveExposedCel — and
 * asks the caller to materialize cel artwork (`resolveCel`). Unresolvable
 * cels surface in `warnings` instead of vanishing (absolute rule: no quiet
 * loss).
 */

export interface CameraSampleIR {
  x: number;
  y: number;
  scale: number;
  rotationDeg: number;
}

export interface AnimationFrameComposition {
  /** Cel artwork of every level, bottom-to-top in level declaration order. */
  nodes: SceneNodeIR[];
  camera: CameraSampleIR;
  warnings: string[];
}

/**
 * Quadratic easing family. `hold` steps: the outgoing keyframe's value is kept
 * until the next keyframe's exact frame.
 */
function applyEasing(easing: AnimationKeyframeIR["easing"], t: number): number {
  switch (easing) {
    case "hold":
      return 0;
    case "linear":
      return t;
    case "ease-in":
      return t * t;
    case "ease-out":
      return 1 - (1 - t) * (1 - t);
    case "ease-in-out":
      return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
  }
}

/**
 * Samples one keyframe curve at `frame`. Outside the keyframe range the curve
 * clamps to its first/last value; between keyframes the segment interpolates
 * with the easing declared on the segment's starting keyframe.
 */
function sampleTrackValue(
  keyframes: AnimationKeyframeIR[],
  frame: number,
  fallback: number,
): number {
  const first = keyframes[0];
  if (first === undefined) return fallback;
  if (frame <= first.frame) return first.value;
  const last = keyframes[keyframes.length - 1];
  if (last === undefined || frame >= last.frame) return last?.value ?? fallback;
  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const from = keyframes[index];
    const to = keyframes[index + 1];
    if (from === undefined || to === undefined) break;
    if (frame < from.frame || frame >= to.frame) continue;
    const span = to.frame - from.frame;
    const t = span > 0 ? (frame - from.frame) / span : 1;
    return from.value + (to.value - from.value) * applyEasing(from.easing, t);
  }
  return last.value;
}

/** Camera state at `frame` (defaults: origin, scale 1, no rotation). */
export function sampleCameraAt(
  track: AnimationCameraTrackIR,
  frame: number,
): CameraSampleIR {
  return {
    x: sampleTrackValue(track.x, frame, 0),
    y: sampleTrackValue(track.y, frame, 0),
    scale: sampleTrackValue(track.scale, frame, 1),
    rotationDeg: sampleTrackValue(track.rotationDeg, frame, 0),
  };
}

/**
 * Composes the scene-node stack visible at `frame`.
 *
 * Levels contribute in declaration order (bottom-to-top). Exposure holds are
 * honored through resolveExposedCel; an explicit `celId: null` exposure is a
 * representable empty hold, not a loss. `resolveCel` returning null means the
 * cel artwork could not be found — that is recorded as a warning.
 */
export function composeAnimationFrameNodes(
  graph: AnimationGraphIR,
  frame: number,
  resolveCel: (celId: string) => SceneNodeIR[] | null,
): AnimationFrameComposition {
  const warnings: string[] = [];
  if (frame < 0 || frame >= graph.durationFrames) {
    warnings.push(
      `frame ${frame} is outside the graph duration 0..${graph.durationFrames - 1}`,
    );
  }
  const nodes: SceneNodeIR[] = [];
  for (const level of graph.levels) {
    const celId = resolveExposedCel(graph, level.id, frame);
    if (celId === null) continue;
    const celNodes = resolveCel(celId);
    if (celNodes === null) {
      warnings.push(
        `level ${level.id}: cel ${celId} 미해결 — 프레임 ${frame} 합성에서 제외됨`,
      );
      continue;
    }
    nodes.push(...celNodes);
  }
  return { nodes, camera: sampleCameraAt(graph.camera, frame), warnings };
}
