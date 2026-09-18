import { z } from "zod";

import { sha256Schema, studioEntityIdSchema } from "../graph/ids";
import { colorIRSchema } from "./color";

import type { Sha256 } from "../graph/ids";
import type { ColorIR } from "./color";

export interface VectorPointV3 {
  readonly x: number;
  readonly y: number;
}

export const vectorPointV3Schema = z
  .object({ x: z.number().finite(), y: z.number().finite() })
  .strict();

export interface CubicSegmentV3 {
  readonly p0: VectorPointV3;
  readonly p1: VectorPointV3;
  readonly p2: VectorPointV3;
  readonly p3: VectorPointV3;
}

export const cubicSegmentV3Schema = z
  .object({
    p0: vectorPointV3Schema,
    p1: vectorPointV3Schema,
    p2: vectorPointV3Schema,
    p3: vectorPointV3Schema,
  })
  .strict();

export interface WidthSampleV3 {
  readonly t: number;
  readonly width: number;
  readonly opacity?: number;
}

export const widthSampleV3Schema = z
  .object({
    t: z.number().finite().min(0).max(1),
    width: z.number().finite().positive().max(100_000),
    opacity: z.number().finite().min(0).max(1).optional(),
  })
  .strict();

export interface VectorBrushRefV3 {
  readonly brushId: string;
  readonly version: string;
  readonly contentHash: Sha256;
}

export const vectorBrushRefV3Schema = z
  .object({
    brushId: studioEntityIdSchema,
    version: z.string().trim().min(1).max(80),
    contentHash: sha256Schema,
  })
  .strict();

export interface EditableVectorStrokeV3 {
  readonly id: string;
  readonly brushRef: VectorBrushRefV3;
  readonly centerline: readonly CubicSegmentV3[];
  readonly widthProfile: readonly WidthSampleV3[];
  readonly color: ColorIR;
  readonly opacity: number;
  readonly deterministicSeed: number;
  readonly sourceSamplesBlobHash?: Sha256;
}

export const editableVectorStrokeV3Schema = z
  .object({
    id: studioEntityIdSchema,
    brushRef: vectorBrushRefV3Schema,
    centerline: z.array(cubicSegmentV3Schema).min(1).max(1_000_000),
    widthProfile: z.array(widthSampleV3Schema).min(2).max(65_536),
    color: colorIRSchema,
    opacity: z.number().finite().min(0).max(1),
    deterministicSeed: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    sourceSamplesBlobHash: sha256Schema.optional(),
  })
  .strict()
  .superRefine((stroke, context) => {
    if (stroke.widthProfile[0]?.t !== 0) {
      context.addIssue({
        code: "custom",
        path: ["widthProfile", 0, "t"],
        message: "width profile must start at t=0",
      });
    }
    if (stroke.widthProfile.at(-1)?.t !== 1) {
      context.addIssue({
        code: "custom",
        path: ["widthProfile"],
        message: "width profile must end at t=1",
      });
    }
    for (let index = 1; index < stroke.widthProfile.length; index += 1) {
      const previous = stroke.widthProfile[index - 1];
      const current = stroke.widthProfile[index];
      if (previous !== undefined && current !== undefined && current.t <= previous.t) {
        context.addIssue({
          code: "custom",
          path: ["widthProfile", index, "t"],
          message: "width profile t values must be strictly increasing",
        });
      }
    }
    for (let index = 1; index < stroke.centerline.length; index += 1) {
      const previous = stroke.centerline[index - 1];
      const current = stroke.centerline[index];
      if (
        previous !== undefined
        && current !== undefined
        && (previous.p3.x !== current.p0.x || previous.p3.y !== current.p0.y)
      ) {
        context.addIssue({
          code: "custom",
          path: ["centerline", index, "p0"],
          message: "cubic segments must form a continuous centerline",
        });
      }
    }
  });

export function vectorStrokeV3Bounds(stroke: EditableVectorStrokeV3): {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
} {
  const points = stroke.centerline.flatMap((segment) => [
    segment.p0,
    segment.p1,
    segment.p2,
    segment.p3,
  ]);
  const radius = Math.max(...stroke.widthProfile.map((sample) => sample.width)) / 2;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs) - radius,
    minY: Math.min(...ys) - radius,
    maxX: Math.max(...xs) + radius,
    maxY: Math.max(...ys) + radius,
  };
}

export function rescaleVectorStrokeV3(
  stroke: EditableVectorStrokeV3,
  scaleX: number,
  scaleY: number,
): EditableVectorStrokeV3 {
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX === 0 || scaleY === 0) {
    throw new RangeError("vector stroke scale must be finite and non-zero");
  }
  const mapPoint = (point: VectorPointV3): VectorPointV3 => ({
    x: point.x * scaleX,
    y: point.y * scaleY,
  });
  const widthScale = Math.sqrt(Math.abs(scaleX * scaleY));
  return editableVectorStrokeV3Schema.parse({
    ...stroke,
    centerline: stroke.centerline.map((segment) => ({
      p0: mapPoint(segment.p0),
      p1: mapPoint(segment.p1),
      p2: mapPoint(segment.p2),
      p3: mapPoint(segment.p3),
    })),
    widthProfile: stroke.widthProfile.map((sample) => ({
      ...sample,
      width: sample.width * widthScale,
    })),
  }) as EditableVectorStrokeV3;
}
