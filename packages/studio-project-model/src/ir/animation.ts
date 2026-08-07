import { z } from "zod";

/**
 * AnimationGraphIR — the connected animation-production layer (V11.1 §10.3).
 *
 * Cels, drawing levels, the exposure sheet (X-sheet), camera and audio hang
 * off one graph so the timeline, light table and batch output all read the
 * same structure. Cel pixels live in the scene/layer store; this graph owns
 * timing and references only.
 */

export const animationCelIRSchema = z.object({
  id: z.string().min(1),
  /** Scene node (layer) holding this cel's artwork. */
  sceneNodeId: z.string().min(1),
  label: z.string().default(""),
});
export type AnimationCelIR = z.infer<typeof animationCelIRSchema>;

/** A drawing level = one X-sheet column (A/B/C… in paper terms). */
export const animationLevelIRSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  cels: z.array(animationCelIRSchema),
});
export type AnimationLevelIR = z.infer<typeof animationLevelIRSchema>;

/** One exposure: at `frame`, `levelId` shows `celId` (null = hold nothing). */
export const animationExposureIRSchema = z.object({
  frame: z.number().int().nonnegative(),
  levelId: z.string().min(1),
  celId: z.string().min(1).nullable(),
});
export type AnimationExposureIR = z.infer<typeof animationExposureIRSchema>;

export const animationKeyframeIRSchema = z.object({
  frame: z.number().int().nonnegative(),
  value: z.number(),
  easing: z.enum(["hold", "linear", "ease-in", "ease-out", "ease-in-out"]).default("linear"),
});
export type AnimationKeyframeIR = z.infer<typeof animationKeyframeIRSchema>;

export const animationCameraTrackIRSchema = z.object({
  /** Animated camera parameter curves, frames strictly increasing. */
  x: z.array(animationKeyframeIRSchema).default([]),
  y: z.array(animationKeyframeIRSchema).default([]),
  scale: z.array(animationKeyframeIRSchema).default([]),
  rotationDeg: z.array(animationKeyframeIRSchema).default([]),
});
export type AnimationCameraTrackIR = z.infer<typeof animationCameraTrackIRSchema>;

export const animationAudioTrackIRSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  offsetFrames: z.number().int(),
  gain: z.number().min(0).max(4).default(1),
});
export type AnimationAudioTrackIR = z.infer<typeof animationAudioTrackIRSchema>;

export const animationGraphIRSchema = z.object({
  version: z.literal(1),
  fps: z.number().positive().max(120),
  durationFrames: z.number().int().positive(),
  levels: z.array(animationLevelIRSchema),
  exposures: z.array(animationExposureIRSchema),
  camera: animationCameraTrackIRSchema.default({
    x: [],
    y: [],
    scale: [],
    rotationDeg: [],
  }),
  audio: z.array(animationAudioTrackIRSchema).default([]),
});
export type AnimationGraphIR = z.infer<typeof animationGraphIRSchema>;

export interface AnimationGraphIssue {
  entityId: string | null;
  message: string;
}

export function validateAnimationGraph(
  graph: AnimationGraphIR,
): AnimationGraphIssue[] {
  const issues: AnimationGraphIssue[] = [];
  const levelIds = new Set<string>();
  const celIdsByLevel = new Map<string, Set<string>>();

  for (const level of graph.levels) {
    if (levelIds.has(level.id)) {
      issues.push({ entityId: level.id, message: `duplicate level id: ${level.id}` });
    }
    levelIds.add(level.id);
    const celIds = new Set<string>();
    for (const cel of level.cels) {
      if (celIds.has(cel.id)) {
        issues.push({
          entityId: cel.id,
          message: `duplicate cel id in level ${level.id}: ${cel.id}`,
        });
      }
      celIds.add(cel.id);
    }
    celIdsByLevel.set(level.id, celIds);
  }

  const seenExposureSlots = new Set<string>();
  for (const exposure of graph.exposures) {
    if (exposure.frame >= graph.durationFrames) {
      issues.push({
        entityId: exposure.levelId,
        message: `exposure frame ${exposure.frame} exceeds duration ${graph.durationFrames}`,
      });
    }
    const celIds = celIdsByLevel.get(exposure.levelId);
    if (!celIds) {
      issues.push({
        entityId: exposure.levelId,
        message: `exposure references unknown level ${exposure.levelId}`,
      });
      continue;
    }
    if (exposure.celId !== null && !celIds.has(exposure.celId)) {
      issues.push({
        entityId: exposure.celId,
        message: `exposure references unknown cel ${exposure.celId} in level ${exposure.levelId}`,
      });
    }
    const slot = `${exposure.levelId}@${exposure.frame}`;
    if (seenExposureSlots.has(slot)) {
      issues.push({
        entityId: exposure.levelId,
        message: `conflicting exposures for level ${exposure.levelId} at frame ${exposure.frame}`,
      });
    }
    seenExposureSlots.add(slot);
  }

  const tracks: Array<[string, AnimationKeyframeIR[]]> = [
    ["camera.x", graph.camera.x],
    ["camera.y", graph.camera.y],
    ["camera.scale", graph.camera.scale],
    ["camera.rotationDeg", graph.camera.rotationDeg],
  ];
  for (const [name, keyframes] of tracks) {
    for (let index = 1; index < keyframes.length; index += 1) {
      const previous = keyframes[index - 1];
      const current = keyframes[index];
      if (previous && current && current.frame <= previous.frame) {
        issues.push({
          entityId: name,
          message: `${name} keyframes must have strictly increasing frames`,
        });
        break;
      }
    }
  }
  return issues;
}

/**
 * X-sheet resolution: the cel visible on `levelId` at `frame`, honoring
 * exposure holds (latest exposure at or before the frame wins).
 */
export function resolveExposedCel(
  graph: AnimationGraphIR,
  levelId: string,
  frame: number,
): string | null {
  let resolved: AnimationExposureIR | null = null;
  for (const exposure of graph.exposures) {
    if (exposure.levelId !== levelId || exposure.frame > frame) continue;
    if (resolved === null || exposure.frame > resolved.frame) resolved = exposure;
  }
  return resolved?.celId ?? null;
}
