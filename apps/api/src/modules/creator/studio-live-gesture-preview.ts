import { z } from "zod";

/** Server-side mirror of the transport-neutral Studio gesture preview v1 contract. */
export const STUDIO_LIVE_GESTURE_PREVIEW_VERSION = 1 as const;
export const STUDIO_LIVE_GESTURE_PREVIEW_KIND = "preview:gesture" as const;
export const STUDIO_LIVE_GESTURE_PREVIEW_MAX_BYTES = 64 * 1_024;
export const STUDIO_LIVE_GESTURE_PREVIEW_MAX_SAMPLES_PER_MESSAGE = 512;
export const STUDIO_LIVE_GESTURE_PREVIEW_MAX_SAMPLES_PER_GESTURE = 100_000;

export const STUDIO_LIVE_GESTURE_PREVIEW_PHASES = [
  "begin",
  "append",
  "replace",
  "end",
  "cancel",
] as const;
export const STUDIO_LIVE_GESTURE_PREVIEW_OPERATIONS = [
  "draw",
  "erase",
  "shape",
  "lasso-fill",
  "retouch",
] as const;
export const STUDIO_LIVE_GESTURE_PREVIEW_DRAW_KINDS = [
  "freehand",
  "line",
  "rect",
  "ellipse",
  "star",
  "arrow",
  "triangle",
  "polygon",
] as const;
export const STUDIO_LIVE_GESTURE_PREVIEW_SHAPE_KINDS = [
  "line",
  "rect",
  "ellipse",
  "star",
  "arrow",
  "triangle",
  "polygon",
] as const;
export const STUDIO_LIVE_GESTURE_PREVIEW_BLEND_MODES = [
  "normal",
  "source-over",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
] as const;
export const STUDIO_LIVE_GESTURE_PREVIEW_SAMPLE_CHANNEL_KEYS = [
  "pressures",
  "tiltXs",
  "tiltYs",
  "twists",
  "speeds",
  "tangentialPressures",
  "altitudeAngles",
  "azimuthAngles",
  "contactWidths",
  "contactHeights",
  "sampleTimeOffsets",
] as const;
export const STUDIO_LIVE_GESTURE_PREVIEW_LIMITS = Object.freeze({
  identifierLength: 160,
  rendererTextLength: 160,
  colorLength: 64,
  coordinateMagnitude: 10_000_000,
  strokeWidth: 8_192,
  sampleSpacing: 8_192,
  speed: 1_000_000,
  contactSize: 8_192,
  sampleTimeOffsetMs: 600_000,
  retouchRadiusNorm: 4,
  brushSeed: 0xffff_ffff,
} as const);

const FORBIDDEN_RESOURCE_STRING = /(?:\b(?:https?|data|blob|file|javascript):|url\s*\()/iu;

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    if (point <= 0x1f || (point >= 0x7f && point <= 0x9f)) return true;
  }
  return false;
}

const safeString = (maximum: number) => z
  .string()
  .min(1)
  .max(maximum)
  .refine((value) => value === value.trim(), "string must be canonical")
  .refine((value) => !containsControlCharacter(value), "control characters are not allowed")
  .refine((value) => !FORBIDDEN_RESOURCE_STRING.test(value), "resource strings are not allowed");

const finiteRange = (minimum: number, maximum: number) => z
  .number()
  .finite()
  .min(minimum)
  .max(maximum);

const safeIntegerRange = (minimum: number, maximum: number) => z
  .number()
  .int()
  .min(minimum)
  .max(maximum);

function rejectExplicitUndefined(
  value: Record<string, unknown>,
  optionalKeys: readonly string[],
  context: z.RefinementCtx,
): void {
  for (const key of optionalKeys) {
    if (Object.hasOwn(value, key) && value[key] === undefined) {
      context.addIssue({ code: "custom", path: [key], message: "explicit undefined is not allowed" });
    }
  }
}

export const StudioLiveGesturePreviewBaseSchema = z
  .object({
    documentGeneration: safeIntegerRange(0, Number.MAX_SAFE_INTEGER),
    targetElementId: safeString(STUDIO_LIVE_GESTURE_PREVIEW_LIMITS.identifierLength).optional(),
    targetRevision: safeString(STUDIO_LIVE_GESTURE_PREVIEW_LIMITS.identifierLength).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    rejectExplicitUndefined(value, ["targetElementId", "targetRevision"], context);
  });

const StudioLiveGesturePreviewBrushTipSchema = z
  .object({
    tiltEnabled: z.boolean(),
    angleDeg: finiteRange(-360, 360),
    roundness: finiteRange(0.01, 1),
  })
  .strict();

const StudioLiveGesturePreviewStrokeStyleSchema = z
  .object({
    dash: z.enum(["solid", "dash", "longDash", "dot", "dashDot", "sparse"]),
    lineCap: z.enum(["butt", "round", "square"]),
    arrowStart: z.enum(["none", "arrow", "dot"]),
    arrowEnd: z.enum(["none", "arrow", "dot"]),
  })
  .strict();

const StudioLiveGesturePreviewShapeParamsSchema = z
  .object({
    starPoints: safeIntegerRange(3, 12),
    starInnerRatio: finiteRange(0.1, 0.9),
    polygonSides: safeIntegerRange(3, 12),
    cornerRadius: finiteRange(0, 120),
  })
  .strict();

const StudioLiveGesturePreviewSketchSchema = z
  .object({
    enabled: z.boolean(),
    roughness: finiteRange(0.5, 3),
    bowing: finiteRange(0, 6),
    fillStyle: z.enum(["hachure", "solid", "cross-hatch", "zigzag"]),
  })
  .strict();

const StudioLiveGesturePreviewSymmetrySchema = z
  .object({
    type: z.enum(["none", "vertical", "horizontal", "radial", "kaleidoscope", "silk"]),
    centerX: finiteRange(
      -STUDIO_LIVE_GESTURE_PREVIEW_LIMITS.coordinateMagnitude,
      STUDIO_LIVE_GESTURE_PREVIEW_LIMITS.coordinateMagnitude,
    ),
    centerY: finiteRange(
      -STUDIO_LIVE_GESTURE_PREVIEW_LIMITS.coordinateMagnitude,
      STUDIO_LIVE_GESTURE_PREVIEW_LIMITS.coordinateMagnitude,
    ),
    radialCount: safeIntegerRange(1, 32).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    rejectExplicitUndefined(value, ["radialCount"], context);
    const radial = value.type === "radial"
      || value.type === "kaleidoscope"
      || value.type === "silk";
    if (radial !== (value.radialCount !== undefined)) {
      context.addIssue({
        code: "custom",
        path: ["radialCount"],
        message: radial
          ? "radial symmetry requires radialCount"
          : "non-radial symmetry forbids radialCount",
      });
    }
  });

const StudioLiveGesturePreviewBrushDynamicsSchema = z
  .object({
    version: z.literal(1),
    presetId: z.enum(["ink-particle", "airbrush", "dry-media"]),
    seed: safeIntegerRange(0, STUDIO_LIVE_GESTURE_PREVIEW_LIMITS.brushSeed),
    fallbackPressure: finiteRange(0, 1),
    minimumDiameterRatio: finiteRange(0, 1).optional(),
    spacingRatio: finiteRange(0.01, 16).nullable().optional(),
    scatterRatio: finiteRange(0, 16).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    rejectExplicitUndefined(
      value,
      ["minimumDiameterRatio", "spacingRatio", "scatterRatio"],
      context,
    );
  });

export const StudioLiveGesturePreviewRendererSnapshotSchema = z
  .object({
    kind: z.enum(STUDIO_LIVE_GESTURE_PREVIEW_DRAW_KINDS),
    mode: z.enum(["pen", "eraser"]),
    stroke: safeString(STUDIO_LIVE_GESTURE_PREVIEW_LIMITS.colorLength),
    strokeWidth: finiteRange(Number.EPSILON, STUDIO_LIVE_GESTURE_PREVIEW_LIMITS.strokeWidth),
    opacity: finiteRange(0, 1).optional(),
    fill: safeString(STUDIO_LIVE_GESTURE_PREVIEW_LIMITS.colorLength).optional(),
    brush: safeString(STUDIO_LIVE_GESTURE_PREVIEW_LIMITS.identifierLength).optional(),
    brushCatalogId: safeString(STUDIO_LIVE_GESTURE_PREVIEW_LIMITS.identifierLength).optional(),
    brushCatalogName: safeString(STUDIO_LIVE_GESTURE_PREVIEW_LIMITS.rendererTextLength).optional(),
    sampleSpacing: finiteRange(0, STUDIO_LIVE_GESTURE_PREVIEW_LIMITS.sampleSpacing).optional(),
    blendMode: z.enum(STUDIO_LIVE_GESTURE_PREVIEW_BLEND_MODES).optional(),
    paintModel: z.enum(["layered-flow-v1", "bounded-flow-v2"]).optional(),
    pressureModel: z.enum([
      "linear-full-v1",
      "linear-residual-v2",
      "linear-residual-path-v3",
    ]).optional(),
    materialPressureModel: z.literal("canonical-material-v1").optional(),
    materialMinimumDiameterRatio: finiteRange(0, 1).optional(),
    watercolorPipeline: z.literal("causal-walker-v2").optional(),
    stampPipeline: z.literal("causal-walker-v2").optional(),
    brushTip: StudioLiveGesturePreviewBrushTipSchema.optional(),
    strokeStyle: StudioLiveGesturePreviewStrokeStyleSchema.optional(),
    shapeParams: StudioLiveGesturePreviewShapeParamsSchema.optional(),
    sketch: StudioLiveGesturePreviewSketchSchema.optional(),
    symmetry: StudioLiveGesturePreviewSymmetrySchema.optional(),
    brushDynamics: StudioLiveGesturePreviewBrushDynamicsSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    rejectExplicitUndefined(
      value,
      [
        "opacity",
        "fill",
        "brush",
        "brushCatalogId",
        "brushCatalogName",
        "sampleSpacing",
        "blendMode",
        "paintModel",
        "pressureModel",
        "materialPressureModel",
        "materialMinimumDiameterRatio",
        "watercolorPipeline",
        "stampPipeline",
        "brushTip",
        "strokeStyle",
        "shapeParams",
        "sketch",
        "symmetry",
        "brushDynamics",
      ],
      context,
    );
  });

const coordinateSchema = finiteRange(
  -STUDIO_LIVE_GESTURE_PREVIEW_LIMITS.coordinateMagnitude,
  STUDIO_LIVE_GESTURE_PREVIEW_LIMITS.coordinateMagnitude,
);

const pointArraySchema = z
  .array(coordinateSchema)
  .min(2)
  .max(STUDIO_LIVE_GESTURE_PREVIEW_MAX_SAMPLES_PER_MESSAGE * 2)
  .refine((points) => points.length % 2 === 0, "points must contain complete coordinate pairs");

const sampleChannelSchema = (minimum: number, maximum: number) => z
  .array(finiteRange(minimum, maximum))
  .min(1)
  .max(STUDIO_LIVE_GESTURE_PREVIEW_MAX_SAMPLES_PER_MESSAGE);

export const StudioLiveGesturePreviewSamplesSchema = z
  .object({
    startIndex: safeIntegerRange(0, STUDIO_LIVE_GESTURE_PREVIEW_MAX_SAMPLES_PER_GESTURE),
    points: pointArraySchema,
    pressures: sampleChannelSchema(0, 1).optional(),
    tiltXs: sampleChannelSchema(-90, 90).optional(),
    tiltYs: sampleChannelSchema(-90, 90).optional(),
    twists: sampleChannelSchema(0, 359).optional(),
    speeds: sampleChannelSchema(0, STUDIO_LIVE_GESTURE_PREVIEW_LIMITS.speed).optional(),
    tangentialPressures: sampleChannelSchema(-1, 1).optional(),
    altitudeAngles: sampleChannelSchema(0, Math.PI / 2).optional(),
    azimuthAngles: sampleChannelSchema(0, Math.PI * 2).optional(),
    contactWidths: sampleChannelSchema(0, STUDIO_LIVE_GESTURE_PREVIEW_LIMITS.contactSize).optional(),
    contactHeights: sampleChannelSchema(0, STUDIO_LIVE_GESTURE_PREVIEW_LIMITS.contactSize).optional(),
    sampleTimeOffsets: sampleChannelSchema(
      0,
      STUDIO_LIVE_GESTURE_PREVIEW_LIMITS.sampleTimeOffsetMs,
    ).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    rejectExplicitUndefined(value, STUDIO_LIVE_GESTURE_PREVIEW_SAMPLE_CHANNEL_KEYS, context);
    const sampleCount = value.points.length / 2;
    if (value.startIndex + sampleCount > STUDIO_LIVE_GESTURE_PREVIEW_MAX_SAMPLES_PER_GESTURE) {
      context.addIssue({
        code: "custom",
        path: ["startIndex"],
        message: "sample suffix exceeds the gesture sample cap",
      });
    }
    for (const key of STUDIO_LIVE_GESTURE_PREVIEW_SAMPLE_CHANNEL_KEYS) {
      const channel = value[key];
      if (channel && channel.length !== sampleCount) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: "sample channel must align one-to-one with points",
        });
      }
    }
    const offsets = value.sampleTimeOffsets;
    if (offsets) {
      for (let index = 1; index < offsets.length; index += 1) {
        if (offsets[index]! < offsets[index - 1]!) {
          context.addIssue({
            code: "custom",
            path: ["sampleTimeOffsets", index],
            message: "sample time offsets must be monotonic",
          });
          break;
        }
      }
    }
  });

export const StudioLiveGesturePreviewShapeSchema = z
  .object({
    kind: z.enum(STUDIO_LIVE_GESTURE_PREVIEW_SHAPE_KINDS),
    x0: coordinateSchema,
    y0: coordinateSchema,
    x1: coordinateSchema,
    y1: coordinateSchema,
  })
  .strict();

export const StudioLiveGesturePreviewRetouchSchema = z
  .object({
    tool: z.literal("smudge"),
    startIndex: safeIntegerRange(0, STUDIO_LIVE_GESTURE_PREVIEW_MAX_SAMPLES_PER_GESTURE),
    points: z
      .array(finiteRange(0, 1))
      .min(2)
      .max(STUDIO_LIVE_GESTURE_PREVIEW_MAX_SAMPLES_PER_MESSAGE * 2)
      .refine((points) => points.length % 2 === 0, "points must contain complete coordinate pairs"),
    radiusNorm: finiteRange(Number.EPSILON, STUDIO_LIVE_GESTURE_PREVIEW_LIMITS.retouchRadiusNorm),
    strength: finiteRange(0, 1),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.startIndex + value.points.length / 2
      > STUDIO_LIVE_GESTURE_PREVIEW_MAX_SAMPLES_PER_GESTURE
    ) {
      context.addIssue({
        code: "custom",
        path: ["startIndex"],
        message: "retouch suffix exceeds the gesture sample cap",
      });
    }
  });

type Renderer = z.infer<typeof StudioLiveGesturePreviewRendererSnapshotSchema>;
type Shape = z.infer<typeof StudioLiveGesturePreviewShapeSchema>;

function rendererMatchesOperation(
  renderer: Renderer,
  operation: (typeof STUDIO_LIVE_GESTURE_PREVIEW_OPERATIONS)[number],
  shape?: Shape,
): boolean {
  switch (operation) {
    case "draw":
      return renderer.kind === "freehand" && renderer.mode === "pen" && renderer.fill === undefined;
    case "erase":
      return renderer.kind === "freehand" && renderer.mode === "eraser" && renderer.fill === undefined;
    case "lasso-fill":
      return renderer.kind === "freehand" && renderer.mode === "pen" && renderer.fill !== undefined;
    case "shape":
      return renderer.kind !== "freehand"
        && renderer.mode === "pen"
        && shape?.kind === renderer.kind;
    case "retouch":
      return false;
  }
}

export const StudioLiveGesturePreviewPayloadSchema = z
  .object({
    version: z.literal(STUDIO_LIVE_GESTURE_PREVIEW_VERSION),
    gestureId: safeString(STUDIO_LIVE_GESTURE_PREVIEW_LIMITS.identifierLength),
    pageId: safeString(STUDIO_LIVE_GESTURE_PREVIEW_LIMITS.identifierLength),
    seq: safeIntegerRange(1, Number.MAX_SAFE_INTEGER),
    phase: z.enum(STUDIO_LIVE_GESTURE_PREVIEW_PHASES),
    operation: z.enum(STUDIO_LIVE_GESTURE_PREVIEW_OPERATIONS),
    base: StudioLiveGesturePreviewBaseSchema.optional(),
    renderer: StudioLiveGesturePreviewRendererSnapshotSchema.optional(),
    samples: StudioLiveGesturePreviewSamplesSchema.optional(),
    shape: StudioLiveGesturePreviewShapeSchema.optional(),
    retouch: StudioLiveGesturePreviewRetouchSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    rejectExplicitUndefined(value, ["base", "renderer", "samples", "shape", "retouch"], context);
    let phaseMatches = false;
    switch (value.phase) {
      case "begin":
        if (value.seq !== 1) break;
        if (value.operation === "retouch") {
          phaseMatches = Boolean(
            value.base?.targetElementId
            && value.base.targetRevision
            && value.retouch
            && value.retouch.startIndex === 0
            && value.renderer === undefined
            && value.samples === undefined
            && value.shape === undefined,
          );
        } else if (
          value.renderer
          && rendererMatchesOperation(value.renderer, value.operation, value.shape)
        ) {
          phaseMatches = value.operation === "shape"
            ? value.shape !== undefined && value.samples === undefined && value.retouch === undefined
            : value.samples !== undefined
              && value.samples.startIndex === 0
              && value.shape === undefined
              && value.retouch === undefined;
        }
        break;
      case "append":
        if (value.base === undefined && value.renderer === undefined && value.shape === undefined) {
          phaseMatches = value.operation === "retouch"
            ? value.retouch !== undefined && value.samples === undefined
            : value.operation !== "shape"
              && value.samples !== undefined
              && value.retouch === undefined;
        }
        break;
      case "replace":
        phaseMatches = value.operation === "shape"
          && value.base === undefined
          && value.renderer === undefined
          && value.samples === undefined
          && value.shape !== undefined
          && value.retouch === undefined;
        break;
      case "end":
      case "cancel":
        phaseMatches = value.base === undefined
          && value.renderer === undefined
          && value.samples === undefined
          && value.shape === undefined
          && value.retouch === undefined;
        break;
    }
    if (!phaseMatches) {
      context.addIssue({
        code: "custom",
        path: ["phase"],
        message: "gesture preview fields do not match phase and operation",
      });
    }
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > STUDIO_LIVE_GESTURE_PREVIEW_MAX_BYTES) {
      context.addIssue({ code: "custom", message: "gesture preview exceeds 64 KiB" });
    }
  });

export type StudioLiveGesturePreviewInput = z.infer<
  typeof StudioLiveGesturePreviewPayloadSchema
>;
