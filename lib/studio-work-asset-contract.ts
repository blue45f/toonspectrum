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
 * the realtime reference envelope. Pixel/source data stays in the private asset body. The sole
 * object-valued edit field (`smartFilters`) is accepted through an explicit bounded schema below.
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

export const STUDIO_WORK_ASSET_REFERENCE_EDIT_KEYS = [
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "opacity",
  "smartFilters",
  ...STUDIO_WORK_ASSET_BOOLEAN_EDIT_KEYS,
  ...Object.keys(STUDIO_WORK_ASSET_SCALAR_FILTER_RANGES),
] as const;

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
  "sharpen",
  "noise",
  "invert",
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
    grayscale: z.boolean().optional(),
    sepia: z.boolean().optional(),
    screentone: z.boolean().optional(),
    lineart: z.boolean().optional(),
    invert: z.boolean().optional(),
    smartFilters: StudioWorkAssetSmartFiltersSchema.optional(),
    ...StudioWorkAssetScalarFiltersSchema.shape,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.type !== "image" && value.smartFilters !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["smartFilters"],
        message: "스마트 필터는 이미지 에셋에만 사용할 수 있습니다.",
      });
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
