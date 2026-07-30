import { z } from "zod";

export const STUDIO_WORK_ASSET_CONTRACT_VERSION = 1 as const;
export const STUDIO_WORK_ASSET_ADMISSION_OPT_IN_TOKEN =
  "enable-immutable-readonly-work-assets-v1" as const;
export const STUDIO_WORK_ASSET_IMAGE_ADMISSION_OPT_IN_TOKEN =
  STUDIO_WORK_ASSET_ADMISSION_OPT_IN_TOKEN;

export function isStudioWorkAssetAdmissionOptedIn(value: unknown): boolean {
  return value === STUDIO_WORK_ASSET_ADMISSION_OPT_IN_TOKEN;
}

export function isStudioWorkAssetImageAdmissionOptedIn(value: unknown): boolean {
  return isStudioWorkAssetAdmissionOptedIn(value);
}
export const STUDIO_WORK_ASSET_TYPES = ["image", "vrm", "background3d"] as const;
export type StudioWorkAssetType = (typeof STUDIO_WORK_ASSET_TYPES)[number];

export const STUDIO_WORK_ASSET_MAX_DESCRIPTOR_BYTES = 2 * 1024;
export const STUDIO_WORK_ASSET_MAX_ASSETS_PER_WORK = 250;
export const STUDIO_WORK_ASSET_MAX_TOMBSTONES_PER_WORK = 5_000;
export const STUDIO_WORK_ASSET_MAX_TOTAL_BYTES_PER_WORK = 256 * 1024 * 1024;
export const STUDIO_WORK_ASSET_MAX_IMAGE_AXIS = 16_384;
/**
 * Browser image decoders materialize at least one RGBA surface regardless of compressed size.
 * Keeping one admitted image at or below 64 MiB avoids a tiny upload expanding into hundreds of
 * megabytes before the hydrator can enforce its resident-resource budget.
 */
export const STUDIO_WORK_ASSET_MAX_IMAGE_DECODED_BYTES = 64 * 1024 * 1024;
export const STUDIO_WORK_ASSET_MAX_IMAGE_PIXELS =
  STUDIO_WORK_ASSET_MAX_IMAGE_DECODED_BYTES / 4;
export const STUDIO_WORK_ASSET_MAX_BYTES_BY_TYPE: Readonly<Record<StudioWorkAssetType, number>> = {
  image: 8 * 1024 * 1024,
  vrm: 12 * 1024 * 1024,
  background3d: 12 * 1024 * 1024,
};

const ExactIdentifierSchema = z
  .string()
  .min(1)
  .max(160)
  .refine((value) => value.trim().length > 0, "식별자가 비어 있습니다.")
  .refine(
    (value) => ![...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159);
    }),
    "식별자에 제어 문자를 사용할 수 없습니다."
  );

export const StudioWorkAssetTypeSchema = z.enum(STUDIO_WORK_ASSET_TYPES);

export const StudioWorkAssetReferenceSchema = z
  .object({
    assetId: ExactIdentifierSchema,
    elementType: StudioWorkAssetTypeSchema,
  })
  .strict();

export type StudioWorkAssetReference = z.infer<typeof StudioWorkAssetReferenceSchema>;

/**
 * Small, non-destructive fields that are safe to keep in an immutable upload descriptor and in
 * the realtime reference envelope. Pixel/source data stays in the private asset body.
 * Object-valued filter edits are accepted only through explicit bounded schemas below.
 */
export const STUDIO_WORK_ASSET_BOOLEAN_EDIT_KEYS = [
  "hidden",
  "locked",
  "noClip",
  "lockAspect",
  "clipBelow",
  "alphaLocked",
  "flipped",
  "flippedY",
  "filterPageComposite",
  "grayscale",
  "sepia",
  "screentone",
  "lineart",
  "invert",
] as const;

export const STUDIO_WORK_ASSET_SCALAR_FILTER_RANGES = {
  blur: { minimum: 0, maximum: 30 },
  brightness: { minimum: -0.8, maximum: 0.8 },
  contrast: { minimum: -80, maximum: 80 },
  chromatic: { minimum: 0, maximum: 12 },
  posterize: { minimum: 0, maximum: 8 },
  noise: { minimum: 0, maximum: 100 },
  saturation: { minimum: -1, maximum: 1 },
  hue: { minimum: -180, maximum: 180 },
  temperature: { minimum: -100, maximum: 100 },
  sharpen: { minimum: 0, maximum: 1 },
  pixelate: { minimum: 0, maximum: 40 },
  inkThreshold: { minimum: 0, maximum: 1 },
} as const;

export const STUDIO_WORK_ASSET_STRUCTURED_EDIT_KEYS = [
  "blurFx",
  "lensBlur",
  "fieldIrisBlur",
  "tiltShiftBlur",
  "selectiveGaussianBlur",
  "tileableBlur",
  "differenceOfGaussians",
  "dustScratches",
  "colorToAlpha",
  "curve",
  "curveCh",
  "edgeAwareDenoise",
  "jpegArtifactReduction",
  "lineCleanup",
  "screentoneRemoval",
  "smartFilters",
] as const;
export type StudioWorkAssetStructuredEditKey =
  (typeof STUDIO_WORK_ASSET_STRUCTURED_EDIT_KEYS)[number];

const StudioWorkAssetScalarFiltersSchema = z.object(Object.fromEntries(
  Object.entries(STUDIO_WORK_ASSET_SCALAR_FILTER_RANGES).map(
    ([key, range]) => [
      key,
      z.number().finite().min(range.minimum).max(range.maximum).optional(),
    ]
  )
) as {
  [Key in keyof typeof STUDIO_WORK_ASSET_SCALAR_FILTER_RANGES]: z.ZodOptional<z.ZodNumber>;
});

const STUDIO_WORK_ASSET_ADJUSTMENT_ENGINE_IDS = [
  "curves",
  "levels",
  "brightness-contrast",
  "hue-saturation",
  "color-balance",
  "channel-mixer",
  "gradient-map",
  "blur",
  "gaussian-blur",
  "motion-blur",
  "spin-blur",
  "zoom-blur",
  "lens-blur",
  "field-iris-blur",
  "tilt-shift-blur",
  "selective-gaussian-blur",
  "tileable-blur",
  "sharpen",
  "smart-sharpen",
  "median-despeckle",
  "high-pass",
  "noise",
  "invert",
  "grayscale",
  "sepia",
  "pixelate",
  "posterize",
  "ink-threshold",
  "line-extraction",
  "line-cleanup",
  "screentone-removal",
  "jpeg-artifact-reduction",
  "edge-aware-denoise",
  "dust-scratches",
  "difference-of-gaussians",
  "color-to-alpha",
  "screentone",
  "color-halftone",
  "chromatic-aberration",
  "edge-detect",
  "emboss",
  "solarize",
  "oil-paint",
  "exposure",
  "unsharp-mask",
  "morphology",
  "offset",
  "custom-convolution",
  "clouds",
] as const;

const StudioWorkAssetAdjustmentParamSchema = z.union([
  z.number().finite(),
  z.string().max(128),
  z.boolean(),
]);

const StudioWorkAssetAdjustmentParamsSchema = z
  .record(z.string().min(1).max(48), StudioWorkAssetAdjustmentParamSchema)
  .superRefine((params, context) => {
    if (Object.keys(params).length > 16) {
      context.addIssue({
        code: "custom",
        message: "스마트 필터 매개변수가 안전 한도를 넘었습니다.",
      });
    }
  });

export const StudioWorkAssetSmartFiltersSchema = z
  .object({
    version: z.literal(1),
    entries: z.array(z.object({
      id: z.string().min(1).max(80),
      engine: z.enum(STUDIO_WORK_ASSET_ADJUSTMENT_ENGINE_IDS),
      enabled: z.boolean(),
      params: StudioWorkAssetAdjustmentParamsSchema,
    }).strict()).max(24),
  })
  .strict();

export const StudioWorkAssetBlurFxSchema = z
  .object({
    type: z.enum(["gaussian", "motion", "spin", "zoom"]),
    strength: z.number().finite().min(0).max(100),
    radius: z.number().finite().min(1).max(40),
    angle: z.number().finite().min(0).max(360),
  })
  .strict();

/**
 * Exact normalized option objects for the four advanced blur kernels. Keeping each option scalar
 * explicit makes immutable descriptors and CRDT references reject partial, widened, or
 * implementation-specific payloads at the shared boundary.
 */
export const StudioWorkAssetLensBlurSchema = z
  .object({
    radius: z.number().finite().min(0.25).max(18),
    sampleCount: z.number().finite().int().min(5).max(64),
    apertureBlades: z.number().finite().int().min(3).max(12),
    apertureRotationRadians: z.number().finite().min(-Math.PI).max(Math.PI),
  })
  .strict();

export const StudioWorkAssetFieldIrisBlurSchema = z
  .object({
    focusCenterX: z.number().finite().min(0).max(1),
    focusCenterY: z.number().finite().min(0).max(1),
    focusRadius: z.number().finite().min(0).max(Math.SQRT2),
    feather: z.number().finite().min(0.001).max(Math.SQRT2),
    maximumBlurRadius: z.number().finite().min(0.25).max(18),
    sampleCount: z.number().finite().int().min(5).max(64),
    apertureBlades: z.number().finite().int().min(3).max(12),
  })
  .strict();

export const StudioWorkAssetTiltShiftBlurSchema = z
  .object({
    axisRadians: z.number().finite().min(-Math.PI).max(Math.PI),
    focusWidth: z.number().finite().min(0).max(Math.SQRT2 * 2),
    feather: z.number().finite().min(0.001).max(Math.SQRT2),
    maximumBlurRadius: z.number().finite().min(0.25).max(18),
    sampleCount: z.number().finite().int().min(5).max(64),
  })
  .strict();

export const StudioWorkAssetSelectiveGaussianBlurSchema = z
  .object({
    radius: z.number().finite().int().min(1).max(10),
    spatialSigma: z.number().finite().min(0.1).max(20),
    edgeThreshold: z.number().finite().min(0).max(255),
    edgeSoftness: z.number().finite().min(0).max(2),
  })
  .strict();

export const StudioWorkAssetTileableBlurSchema = z
  .object({
    radius: z.number().finite().int().min(1).max(20),
    sigma: z.number().finite().min(0.1).max(20),
    strength: z.number().finite().min(0).max(1),
  })
  .strict();

export const StudioWorkAssetDifferenceOfGaussiansSchema = z
  .object({
    smallSigma: z.number().finite().min(0.25).max(6),
    largeSigma: z.number().finite().min(0.35).max(12),
    threshold: z.number().finite().min(0).max(64),
    strength: z.number().finite().min(0).max(32),
  })
  .strict()
  .refine(
    (value) => value.largeSigma >= value.smallSigma + 0.1,
    "대형 시그마는 미세 시그마보다 0.1 이상 커야 합니다.",
  );

export const StudioWorkAssetDustScratchesSchema = z
  .object({
    radius: z.number().finite().int().min(1).max(5),
    threshold: z.number().finite().min(0).max(255),
    strength: z.number().finite().min(0).max(1),
  })
  .strict();

export const StudioWorkAssetColorToAlphaSchema = z
  .object({
    keyColor: z.string().regex(/^#[0-9a-f]{6}$/i),
    strength: z.number().finite().min(0).max(100),
  })
  .strict();

/**
 * A master or RGB-channel curve is intentionally capped at 16 points. Four full curves remain
 * comfortably inside the immutable descriptor's 2 KiB budget while still covering detailed
 * tonal edits. The strict wire form is already normalized by the authoring UI.
 */
export const STUDIO_WORK_ASSET_MAX_CURVE_POINTS = 16;

export const StudioWorkAssetCurvePointSchema = z
  .object({
    x: z.number().finite().int().min(0).max(255),
    y: z.number().finite().int().min(0).max(255),
  })
  .strict();

export const StudioWorkAssetCurveSchema = z
  .array(StudioWorkAssetCurvePointSchema)
  .min(2)
  .max(STUDIO_WORK_ASSET_MAX_CURVE_POINTS)
  .superRefine((points, context) => {
    if (points[0]?.x !== 0) {
      context.addIssue({
        code: "custom",
        path: [0, "x"],
        message: "커브의 첫 입력점은 0이어야 합니다.",
      });
    }
    if (points.at(-1)?.x !== 255) {
      context.addIssue({
        code: "custom",
        path: [points.length - 1, "x"],
        message: "커브의 마지막 입력점은 255여야 합니다.",
      });
    }
    for (let index = 1; index < points.length; index += 1) {
      if (points[index]!.x <= points[index - 1]!.x) {
        context.addIssue({
          code: "custom",
          path: [index, "x"],
          message: "커브 입력점은 중복 없이 오름차순이어야 합니다.",
        });
      }
    }
  });

export const StudioWorkAssetCurveChannelsSchema = z
  .object({
    r: StudioWorkAssetCurveSchema.optional(),
    g: StudioWorkAssetCurveSchema.optional(),
    b: StudioWorkAssetCurveSchema.optional(),
  })
  .strict();

/** Bounded direct-image representation used by the line-cleanup dialog and Worker pipeline. */
export const StudioWorkAssetLineCleanupSchema = z
  .object({
    threshold: z.number().finite().min(0).max(1),
    strength: z.number().finite().min(0).max(1),
  })
  .strict();

export const StudioWorkAssetScreentoneRemovalSchema = z
  .object({
    radius: z.number().finite().int().min(1).max(3),
    strength: z.number().finite().min(0).max(1),
    inkLumaThreshold: z.number().finite().min(0).max(160),
  })
  .strict();

export const StudioWorkAssetJpegArtifactReductionSchema = z
  .object({
    deblockStrength: z.number().finite().min(0).max(1),
    deringStrength: z.number().finite().min(0).max(1),
    boundaryThreshold: z.number().finite().min(1).max(64),
    protectedEdgeThreshold: z.number().finite().min(32).max(224),
    ringingThreshold: z.number().finite().min(1).max(96),
    inkLumaThreshold: z.number().finite().min(0).max(160),
  })
  .strict();

export const StudioWorkAssetEdgeAwareDenoiseSchema = z
  .object({
    radius: z.number().finite().int().min(1).max(3),
    strength: z.number().finite().min(0).max(1),
    rangeThreshold: z.number().finite().min(4).max(192),
  })
  .strict();

export type StudioWorkAssetStructuredEditValue =
  | z.infer<typeof StudioWorkAssetBlurFxSchema>
  | z.infer<typeof StudioWorkAssetLensBlurSchema>
  | z.infer<typeof StudioWorkAssetFieldIrisBlurSchema>
  | z.infer<typeof StudioWorkAssetTiltShiftBlurSchema>
  | z.infer<typeof StudioWorkAssetSelectiveGaussianBlurSchema>
  | z.infer<typeof StudioWorkAssetTileableBlurSchema>
  | z.infer<typeof StudioWorkAssetDifferenceOfGaussiansSchema>
  | z.infer<typeof StudioWorkAssetDustScratchesSchema>
  | z.infer<typeof StudioWorkAssetColorToAlphaSchema>
  | z.infer<typeof StudioWorkAssetCurveSchema>
  | z.infer<typeof StudioWorkAssetCurveChannelsSchema>
  | z.infer<typeof StudioWorkAssetEdgeAwareDenoiseSchema>
  | z.infer<typeof StudioWorkAssetJpegArtifactReductionSchema>
  | z.infer<typeof StudioWorkAssetLineCleanupSchema>
  | z.infer<typeof StudioWorkAssetScreentoneRemovalSchema>
  | z.infer<typeof StudioWorkAssetSmartFiltersSchema>;

/** Parses and clones one structured reference edit through its exact bounded wire schema. */
export function parseStudioWorkAssetStructuredEditValue(
  key: StudioWorkAssetStructuredEditKey,
  value: unknown
): StudioWorkAssetStructuredEditValue {
  switch (key) {
    case "blurFx":
      return StudioWorkAssetBlurFxSchema.parse(value);
    case "lensBlur":
      return StudioWorkAssetLensBlurSchema.parse(value);
    case "fieldIrisBlur":
      return StudioWorkAssetFieldIrisBlurSchema.parse(value);
    case "tiltShiftBlur":
      return StudioWorkAssetTiltShiftBlurSchema.parse(value);
    case "selectiveGaussianBlur":
      return StudioWorkAssetSelectiveGaussianBlurSchema.parse(value);
    case "tileableBlur":
      return StudioWorkAssetTileableBlurSchema.parse(value);
    case "differenceOfGaussians":
      return StudioWorkAssetDifferenceOfGaussiansSchema.parse(value);
    case "dustScratches":
      return StudioWorkAssetDustScratchesSchema.parse(value);
    case "colorToAlpha":
      return StudioWorkAssetColorToAlphaSchema.parse(value);
    case "curve":
      return StudioWorkAssetCurveSchema.parse(value);
    case "curveCh":
      return StudioWorkAssetCurveChannelsSchema.parse(value);
    case "edgeAwareDenoise":
      return StudioWorkAssetEdgeAwareDenoiseSchema.parse(value);
    case "jpegArtifactReduction":
      return StudioWorkAssetJpegArtifactReductionSchema.parse(value);
    case "lineCleanup":
      return StudioWorkAssetLineCleanupSchema.parse(value);
    case "screentoneRemoval":
      return StudioWorkAssetScreentoneRemovalSchema.parse(value);
    case "smartFilters":
      return StudioWorkAssetSmartFiltersSchema.parse(value);
  }
}

export const STUDIO_WORK_ASSET_REFERENCE_EDIT_KEYS = [
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "opacity",
  ...STUDIO_WORK_ASSET_STRUCTURED_EDIT_KEYS,
  ...STUDIO_WORK_ASSET_BOOLEAN_EDIT_KEYS,
  ...Object.keys(STUDIO_WORK_ASSET_SCALAR_FILTER_RANGES),
] as const;

export const StudioWorkAssetElementSchema = z
  .object({
    id: ExactIdentifierSchema,
    type: StudioWorkAssetTypeSchema,
    x: z.number().finite().min(-10_000_000).max(10_000_000),
    y: z.number().finite().min(-10_000_000).max(10_000_000),
    width: z.number().finite().positive().max(10_000_000),
    height: z.number().finite().positive().max(10_000_000),
    rotation: z.number().finite().min(-360_000).max(360_000),
    name: z.string().min(1).max(200).optional(),
    opacity: z.number().finite().min(0).max(1).optional(),
    hidden: z.boolean().optional(),
    locked: z.boolean().optional(),
    noClip: z.boolean().optional(),
    lockAspect: z.boolean().optional(),
    clipBelow: z.boolean().optional(),
    alphaLocked: z.boolean().optional(),
    flipped: z.boolean().optional(),
    flippedY: z.boolean().optional(),
    filterPageComposite: z.boolean().optional(),
    grayscale: z.boolean().optional(),
    sepia: z.boolean().optional(),
    screentone: z.boolean().optional(),
    lineart: z.boolean().optional(),
    invert: z.boolean().optional(),
    blurFx: StudioWorkAssetBlurFxSchema.optional(),
    lensBlur: StudioWorkAssetLensBlurSchema.optional(),
    fieldIrisBlur: StudioWorkAssetFieldIrisBlurSchema.optional(),
    tiltShiftBlur: StudioWorkAssetTiltShiftBlurSchema.optional(),
    selectiveGaussianBlur: StudioWorkAssetSelectiveGaussianBlurSchema.optional(),
    tileableBlur: StudioWorkAssetTileableBlurSchema.optional(),
    differenceOfGaussians: StudioWorkAssetDifferenceOfGaussiansSchema.optional(),
    dustScratches: StudioWorkAssetDustScratchesSchema.optional(),
    colorToAlpha: StudioWorkAssetColorToAlphaSchema.optional(),
    curve: StudioWorkAssetCurveSchema.optional(),
    curveCh: StudioWorkAssetCurveChannelsSchema.optional(),
    edgeAwareDenoise: StudioWorkAssetEdgeAwareDenoiseSchema.optional(),
    jpegArtifactReduction: StudioWorkAssetJpegArtifactReductionSchema.optional(),
    lineCleanup: StudioWorkAssetLineCleanupSchema.optional(),
    screentoneRemoval: StudioWorkAssetScreentoneRemovalSchema.optional(),
    smartFilters: StudioWorkAssetSmartFiltersSchema.optional(),
    ...StudioWorkAssetScalarFiltersSchema.shape,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.type !== "image") {
      for (const key of STUDIO_WORK_ASSET_STRUCTURED_EDIT_KEYS) {
        if (value[key] === undefined) continue;
        context.addIssue({
          code: "custom",
          path: [key],
          message: "구조화된 필터는 이미지 에셋에만 사용할 수 있습니다.",
        });
      }
    }
  });

export const StudioWorkAssetDescriptorSchema = z
  .object({
    version: z.literal(STUDIO_WORK_ASSET_CONTRACT_VERSION),
    element: StudioWorkAssetElementSchema,
  })
  .strict();

export type StudioWorkAssetDescriptor = z.infer<typeof StudioWorkAssetDescriptorSchema>;

export const StudioWorkAssetIntrinsicImageSchema = z
  .object({
    width: z.number().int().positive().max(STUDIO_WORK_ASSET_MAX_IMAGE_AXIS),
    height: z.number().int().positive().max(STUDIO_WORK_ASSET_MAX_IMAGE_AXIS),
    decodedRgbaBytes: z.number().int().positive().max(STUDIO_WORK_ASSET_MAX_IMAGE_DECODED_BYTES),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.width * value.height > STUDIO_WORK_ASSET_MAX_IMAGE_PIXELS ||
      value.decodedRgbaBytes !== value.width * value.height * 4
    ) {
      context.addIssue({
        code: "custom",
        message: "이미지의 고유 크기와 RGBA 디코드 비용이 일치하지 않습니다.",
      });
    }
  });

export type StudioWorkAssetIntrinsicImage = z.infer<
  typeof StudioWorkAssetIntrinsicImageSchema
>;

export const StudioWorkAssetManifestSchema = z
  .object({
    version: z.literal(STUDIO_WORK_ASSET_CONTRACT_VERSION),
    assetId: ExactIdentifierSchema,
    elementType: StudioWorkAssetTypeSchema,
    mimeType: z.enum([
      "image/png",
      "image/jpeg",
      "image/webp",
      "model/gltf-binary",
    ]),
    byteSize: z.number().int().min(1).max(12 * 1024 * 1024),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u),
    intrinsicImage: StudioWorkAssetIntrinsicImageSchema.nullable(),
    descriptor: StudioWorkAssetDescriptorSchema,
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.assetId !== value.descriptor.element.id ||
      value.elementType !== value.descriptor.element.type
    ) {
      context.addIssue({
        code: "custom",
        message: "에셋 manifest와 요소 설명의 식별자가 일치하지 않습니다.",
      });
    }
    if (value.byteSize > STUDIO_WORK_ASSET_MAX_BYTES_BY_TYPE[value.elementType]) {
      context.addIssue({
        code: "custom",
        message: "에셋 크기가 타입별 안전 한도를 넘었습니다.",
      });
    }
    const imageMime = value.mimeType.startsWith("image/");
    if ((value.elementType === "image") !== imageMime) {
      context.addIssue({
        code: "custom",
        message: "에셋 타입과 MIME 형식이 일치하지 않습니다.",
      });
    }
    if ((value.elementType === "image") !== (value.intrinsicImage !== null)) {
      context.addIssue({
        code: "custom",
        message: "이미지 에셋의 고유 크기 정보가 올바르지 않습니다.",
      });
    }
  });

export type StudioWorkAssetManifest = z.infer<typeof StudioWorkAssetManifestSchema>;

const TEXT_ENCODER = new TextEncoder();

export function parseStudioWorkAssetDescriptor(
  value: unknown,
  expected: { assetId: string; elementType: StudioWorkAssetType }
): StudioWorkAssetDescriptor {
  const descriptor = StudioWorkAssetDescriptorSchema.parse(value);
  if (
    descriptor.element.id !== expected.assetId ||
    descriptor.element.type !== expected.elementType
  ) {
    throw new Error("에셋 식별자와 요소 설명이 일치하지 않습니다.");
  }
  if (TEXT_ENCODER.encode(JSON.stringify(descriptor)).byteLength > STUDIO_WORK_ASSET_MAX_DESCRIPTOR_BYTES) {
    throw new Error("에셋 요소 설명이 안전 한도를 넘었습니다.");
  }
  return descriptor;
}

export function studioWorkAssetReferenceKey(
  reference: Pick<StudioWorkAssetManifest, "assetId" | "elementType">
): string {
  return JSON.stringify([reference.assetId, reference.elementType]);
}

export function studioWorkAssetSourceUri(
  reference: Pick<StudioWorkAssetManifest, "assetId" | "elementType">
): string {
  return `work-asset://${reference.elementType}/${encodeURIComponent(reference.assetId)}`;
}

export function parseStudioWorkAssetSourceUri(
  value: string
): Pick<StudioWorkAssetManifest, "assetId" | "elementType"> | null {
  const match = /^work-asset:\/\/(image|vrm|background3d)\/(.+)$/u.exec(value);
  if (!match) return null;
  let assetId: string;
  try {
    assetId = decodeURIComponent(match[2] ?? "");
  } catch {
    return null;
  }
  const parsedId = ExactIdentifierSchema.safeParse(assetId);
  const parsedType = StudioWorkAssetTypeSchema.safeParse(match[1]);
  if (!parsedId.success || !parsedType.success) return null;
  const parsed = { assetId: parsedId.data, elementType: parsedType.data };
  return studioWorkAssetSourceUri(parsed) === value ? parsed : null;
}
