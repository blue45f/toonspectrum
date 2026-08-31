import { z } from "zod";

import { blendModeIRSchema } from "./color";
import { canonicalJson, fnv1a64Hex } from "./digest";

/**
 * AssetMetadataIR (V12 §15) is the complete, engine-neutral compatibility
 * card carried by every AssetPackage. References identify content; renderer
 * objects, object URLs and engine-owned handles never enter this IR.
 *
 * The schema is intentionally strict at every object boundary. Unknown data
 * must be versioned or surfaced by provenance instead of being stripped by
 * Zod. Legacy V11 cards remain readable through explicit null/empty defaults
 * and the engineRequirements -> providerRequirements compatibility lift.
 */

export const ASSET_METADATA_LIMITS = Object.freeze({
  id: 160,
  name: 256,
  shortText: 512,
  longText: 4_096,
  mediaType: 128,
  locator: 2_048,
  array: 256,
  provenanceEntries: 512,
  tags: 64,
  dependencyNodes: 256,
  referenceBytes: Number.MAX_SAFE_INTEGER,
  imageEdgePx: 32_768,
  pressureSamples: 10_000_000,
} as const);

const identifierSchema = z
  .string()
  .min(1)
  .max(ASSET_METADATA_LIMITS.id)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/,
    "identifier must start with an alphanumeric character and contain only A-Z, a-z, 0-9, ., _, :, / or -",
  );
const shortTextSchema = z.string().min(1).max(ASSET_METADATA_LIMITS.shortText);
const longTextSchema = z.string().min(1).max(ASSET_METADATA_LIMITS.longText);
const nullableShortTextSchema = z
  .string()
  .min(1)
  .max(ASSET_METADATA_LIMITS.shortText)
  .nullable();

export const assetKindIRSchema = z.enum([
  "brush-program",
  "brush-stamp-fragment",
  "svg-decoration",
  "lottie-effect",
  "gradient-material",
  "image-material",
  "text-style",
  "balloon-layout",
  "geometry-recipe",
  "screen-tone",
  "brush-tip",
]);
export type AssetKindIR = z.infer<typeof assetKindIRSchema>;

export const assetSourceFormatIRSchema = z.enum([
  "myb",
  "kpp",
  "abr",
  "svg",
  "lottie",
  "native",
]);
export type AssetSourceFormatIR = z.infer<typeof assetSourceFormatIRSchema>;

/** Provider-descriptor capability vocabulary: dotted lowercase paths only. */
export const assetCapabilityTokenSchema = z
  .string()
  .max(ASSET_METADATA_LIMITS.shortText)
  .regex(/^[a-z0-9]+(\.[a-z0-9-]+)+$/, "capability must be namespaced (a.b.c)");
export type AssetCapabilityToken = z.infer<typeof assetCapabilityTokenSchema>;

/** `fnv1a64:` + 16 lowercase hex chars — see computeAssetContentDigest. */
export const assetContentDigestSchema = z
  .string()
  .regex(/^fnv1a64:[0-9a-f]{16}$/, "digest must be fnv1a64:<16 hex chars>");
export type AssetContentDigest = z.infer<typeof assetContentDigestSchema>;

/** Semver core with optional prerelease/build metadata. */
export const assetVersionIRSchema = z
  .string()
  .max(128)
  .regex(
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
    "version must be semver (MAJOR.MINOR.PATCH[-pre][+build])",
  );

/** A bounded npm-style subset sufficient for deterministic package solving. */
export const assetSemverRangeIRSchema = z
  .string()
  .max(256)
  .regex(
    /^(?:\*|(?:(?:\^|~|>=|<=|>|<|=)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)(?:\s+(?:(?:>=|<=|>|<|=)\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?))*)$/,
    "dependency versionRange must be *, an exact semver, or a bounded semver comparator range",
  );

export const assetLicenseIRSchema = z
  .object({
    /** SPDX-ish expression, audited by the deployment license gate. */
    spdx: z.string().min(1).max(256),
    attribution: z.string().min(1).max(ASSET_METADATA_LIMITS.longText).optional(),
  })
  .strict();
export type AssetLicenseIR = z.infer<typeof assetLicenseIRSchema>;

export const assetProvenanceIRSchema = z
  .object({
    importer: shortTextSchema,
    sourceFileName: z.string().min(1).max(1_024).nullable().default(null),
    importedAt: z.number().int().nonnegative(),
    warnings: z
      .array(z.string().min(1).max(ASSET_METADATA_LIMITS.longText))
      .max(ASSET_METADATA_LIMITS.provenanceEntries)
      .default([]),
    unmapped: z
      .array(z.string().min(1).max(ASSET_METADATA_LIMITS.longText))
      .max(ASSET_METADATA_LIMITS.provenanceEntries)
      .default([]),
  })
  .strict();
export type AssetProvenanceIR = z.infer<typeof assetProvenanceIRSchema>;

/** Content-addressed reference. A null locator still has a stable digest key. */
export const assetBlobReferenceIRSchema = z
  .object({
    digest: assetContentDigestSchema,
    byteLength: z
      .number()
      .int()
      .nonnegative()
      .max(ASSET_METADATA_LIMITS.referenceBytes),
    mediaType: z
      .string()
      .min(3)
      .max(ASSET_METADATA_LIMITS.mediaType)
      .regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:;[ -~]+)?$/i, "invalid media type"),
    locator: z.string().min(1).max(ASSET_METADATA_LIMITS.locator).nullable().default(null),
  })
  .strict();
export type AssetBlobReferenceIR = z.infer<typeof assetBlobReferenceIRSchema>;

export const assetNormalizedIrReferenceSchema = z
  .object({
    digest: assetContentDigestSchema,
    schema: z.string().min(1).max(ASSET_METADATA_LIMITS.shortText),
    schemaVersion: z.number().int().positive().max(65_535),
    mediaType: z
      .string()
      .min(3)
      .max(ASSET_METADATA_LIMITS.mediaType)
      .regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:;[ -~]+)?$/i, "invalid media type"),
    locator: z.string().min(1).max(ASSET_METADATA_LIMITS.locator).nullable().default(null),
  })
  .strict();
export type AssetNormalizedIrReference = z.infer<
  typeof assetNormalizedIrReferenceSchema
>;

export const assetProviderRequirementIRSchema = z
  .object({
    capability: assetCapabilityTokenSchema,
    /** Empty means any provider that truthfully declares the capability. */
    providerIds: z.array(identifierSchema).max(32).default([]),
    versionRange: assetSemverRangeIRSchema.nullable().default(null),
    optional: z.boolean().default(false),
    reason: nullableShortTextSchema.default(null),
  })
  .strict();
export type AssetProviderRequirementIR = z.infer<
  typeof assetProviderRequirementIRSchema
>;

export const assetRendererVariantIRSchema = z
  .object({
    id: identifierSchema,
    tier: z.enum(["stable", "studio-max"]),
    providerId: identifierSchema,
    providerVersion: z.string().min(1).max(256).nullable().default(null),
    normalizedIrRef: assetNormalizedIrReferenceSchema.nullable().default(null),
    requiredCapabilities: z
      .array(assetCapabilityTokenSchema)
      .max(ASSET_METADATA_LIMITS.array)
      .default([]),
    qualityStatus: z.enum(["unmeasured", "candidate", "verified"]).default("unmeasured"),
    determinism: z
      .enum(["unmeasured", "bit-exact", "tolerance", "non-deterministic"])
      .default("unmeasured"),
    limitations: z
      .array(shortTextSchema)
      .max(ASSET_METADATA_LIMITS.array)
      .default([]),
  })
  .strict();
export type AssetRendererVariantIR = z.infer<typeof assetRendererVariantIRSchema>;

export const assetDeviceProfileIRSchema = z
  .object({
    id: identifierSchema,
    name: z.string().min(1).max(ASSET_METADATA_LIMITS.name),
    deviceClass: z.enum(["desktop", "tablet", "mobile", "pen-display"]),
    operatingSystem: z.string().min(1).max(128),
    browser: z.string().min(1).max(128).nullable().default(null),
    inputDevice: z.string().min(1).max(256),
    pressureLevels: z.number().int().positive().max(1_048_576).nullable().default(null),
    supportsTilt: z.boolean().default(false),
    supportsAzimuth: z.boolean().default(false),
    gpuBackend: z.string().min(1).max(128).nullable().default(null),
    devicePixelRatio: z.number().positive().finite().max(16),
    notes: z.array(shortTextSchema).max(64).default([]),
  })
  .strict();
export type AssetDeviceProfileIR = z.infer<typeof assetDeviceProfileIRSchema>;

export const assetRealStrokePreviewIRSchema = z
  .object({
    id: identifierSchema,
    artifactRef: assetBlobReferenceIRSchema,
    rendererVariantId: identifierSchema,
    deviceProfileId: identifierSchema,
    strokeCorpusId: identifierSchema,
    capturedAt: z.number().int().nonnegative(),
    pressureSampleCount: z
      .number()
      .int()
      .positive()
      .max(ASSET_METADATA_LIMITS.pressureSamples),
    widthPx: z.number().int().positive().max(ASSET_METADATA_LIMITS.imageEdgePx),
    heightPx: z.number().int().positive().max(ASSET_METADATA_LIMITS.imageEdgePx),
    notes: z.array(shortTextSchema).max(64).default([]),
  })
  .strict();
export type AssetRealStrokePreviewIR = z.infer<
  typeof assetRealStrokePreviewIRSchema
>;

export const assetVisualEquivalenceReportIRSchema = z
  .object({
    verdict: z.enum(["unmeasured", "equivalent", "not-equivalent"]),
    referenceRendererVariantId: identifierSchema.nullable().default(null),
    candidateRendererVariantId: identifierSchema.nullable().default(null),
    corpusId: identifierSchema.nullable().default(null),
    sampleCount: z.number().int().nonnegative().max(10_000_000).default(0),
    metric: z.enum(["fuzzy-mismatch-pct", "ssim", "psnr-db"]).nullable().default(null),
    threshold: z.number().finite().nonnegative().nullable().default(null),
    observed: z.number().finite().nonnegative().nullable().default(null),
    measuredAt: z.number().int().nonnegative().nullable().default(null),
    evidenceRef: assetBlobReferenceIRSchema.nullable().default(null),
    notes: z.array(shortTextSchema).max(64).default([]),
  })
  .strict()
  .superRefine((report, context) => {
    const measured = report.verdict !== "unmeasured";
    const required = [
      ["referenceRendererVariantId", report.referenceRendererVariantId],
      ["candidateRendererVariantId", report.candidateRendererVariantId],
      ["corpusId", report.corpusId],
      ["metric", report.metric],
      ["threshold", report.threshold],
      ["observed", report.observed],
      ["measuredAt", report.measuredAt],
      ["evidenceRef", report.evidenceRef],
    ] as const;
    if (measured && report.sampleCount === 0) {
      context.addIssue({
        code: "custom",
        path: ["sampleCount"],
        message: "a measured visual-equivalence report requires sampleCount > 0",
      });
    }
    for (const [field, value] of required) {
      if (measured && value === null) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: `a measured visual-equivalence report requires ${field}`,
        });
      }
      if (!measured && value !== null) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: `an unmeasured visual-equivalence report cannot claim ${field}`,
        });
      }
    }
    if (!measured && report.sampleCount !== 0) {
      context.addIssue({
        code: "custom",
        path: ["sampleCount"],
        message: "an unmeasured visual-equivalence report requires sampleCount 0",
      });
    }
  });
export type AssetVisualEquivalenceReportIR = z.infer<
  typeof assetVisualEquivalenceReportIRSchema
>;

export const assetDependencyIRSchema = z
  .object({
    id: identifierSchema,
    versionRange: assetSemverRangeIRSchema,
    optional: z.boolean().default(false),
    dependencies: z.array(identifierSchema).max(ASSET_METADATA_LIMITS.dependencyNodes).default([]),
  })
  .strict();
export type AssetDependencyIR = z.infer<typeof assetDependencyIRSchema>;

export const assetPreviewVariantIRSchema = z
  .object({
    status: z.enum(["available", "not-generated", "unavailable"]),
    artifactRef: assetBlobReferenceIRSchema.nullable().default(null),
    rendererVariantId: identifierSchema.nullable().default(null),
    realStrokePreviewIds: z.array(identifierSchema).max(ASSET_METADATA_LIMITS.array).default([]),
    reason: z.string().min(1).max(ASSET_METADATA_LIMITS.longText).nullable().default(null),
  })
  .strict()
  .superRefine((preview, context) => {
    if (preview.status === "available") {
      if (preview.artifactRef === null) {
        context.addIssue({
          code: "custom",
          path: ["artifactRef"],
          message: "an available preview requires an artifactRef",
        });
      }
      if (preview.rendererVariantId === null) {
        context.addIssue({
          code: "custom",
          path: ["rendererVariantId"],
          message: "an available preview requires a rendererVariantId",
        });
      }
      if (preview.reason !== null) {
        context.addIssue({
          code: "custom",
          path: ["reason"],
          message: "an available preview cannot carry an unavailability reason",
        });
      }
    } else {
      if (preview.artifactRef !== null) {
        context.addIssue({
          code: "custom",
          path: ["artifactRef"],
          message: "a non-available preview cannot claim an artifactRef",
        });
      }
      if (preview.reason === null) {
        context.addIssue({
          code: "custom",
          path: ["reason"],
          message: "a non-available preview requires an explicit reason",
        });
      }
    }
  });
export type AssetPreviewVariantIR = z.infer<typeof assetPreviewVariantIRSchema>;

export const assetPreviewVariantsIRSchema = z
  .object({
    stable: assetPreviewVariantIRSchema.nullable().default(null),
    studioMax: assetPreviewVariantIRSchema.nullable().default(null),
  })
  .strict();
export type AssetPreviewVariantsIR = z.infer<typeof assetPreviewVariantsIRSchema>;

/**
 * Legacy input only. V12 cards used this shape to describe automatic renderer
 * substitution. Do not emit it in new metadata: use providerUnavailable
 * instead, which is deliberately fail-closed.
 */
const legacyAssetRendererSubstitutionIRSchema = z
  .object({
    strategy: z.enum(["renderer-variant", "normalized-ir", "source-reimport", "unavailable"]),
    rendererVariantId: identifierSchema.nullable().default(null),
    providerId: identifierSchema.nullable().default(null),
    preservesNormalizedIr: z.boolean(),
    reason: longTextSchema,
    limitations: z.array(shortTextSchema).max(ASSET_METADATA_LIMITS.array).default([]),
  })
  .strict()
  .superRefine((fallback, context) => {
    if (fallback.strategy === "renderer-variant" && fallback.rendererVariantId === null) {
      context.addIssue({
        code: "custom",
        path: ["rendererVariantId"],
        message: "renderer-variant fallback requires rendererVariantId",
      });
    }
    if (fallback.strategy === "unavailable" && fallback.providerId !== null) {
      context.addIssue({
        code: "custom",
        path: ["providerId"],
        message: "unavailable fallback cannot claim a providerId",
      });
    }
  });

/**
 * What to do when the selected provider cannot run this asset. This is an
 * unavailable state, not a route instruction: no renderer is selected or
 * substituted here. The next operation is deliberately an explicit user or
 * caller provider selection over the retained normalized IR.
 */
export const assetProviderUnavailableIRSchema = z
  .object({
    status: z.literal("unavailable"),
    retainsNormalizedIr: z.literal(true),
    nextOperation: z.literal("select-provider"),
    selectableRendererVariantIds: z
      .array(identifierSchema)
      .min(1)
      .max(ASSET_METADATA_LIMITS.array),
    reason: longTextSchema,
    limitations: z.array(shortTextSchema).max(ASSET_METADATA_LIMITS.array).default([]),
  })
  .strict();
export type AssetProviderUnavailableIR = z.infer<
  typeof assetProviderUnavailableIRSchema
>;

export const assetReplacementEvidenceIRSchema = z.enum([
  "visual-equivalence",
  "real-device-stroke",
  "pressure-fidelity",
  "performance",
  "memory",
  "determinism",
  "license",
  "explicit-provider-selection",
  "soak",
]);

export const assetReplacementConditionIRSchema = z
  .object({
    summary: longTextSchema,
    requiredEvidence: z
      .array(assetReplacementEvidenceIRSchema)
      .min(1)
      .max(assetReplacementEvidenceIRSchema.options.length),
  })
  .strict();
export type AssetReplacementConditionIR = z.infer<
  typeof assetReplacementConditionIRSchema
>;

export const assetMarketplaceMetadataIRSchema = z
  .object({
    status: z.enum(["not-listed", "draft", "published", "suspended"]),
    listingId: identifierSchema.nullable().default(null),
    publisherId: identifierSchema.nullable().default(null),
    access: z.enum(["free", "paid", "subscription"]).nullable().default(null),
    category: nullableShortTextSchema.default(null),
    tags: z.array(z.string().min(1).max(128)).max(ASSET_METADATA_LIMITS.tags).default([]),
    commercialUseAllowed: z.boolean().nullable().default(null),
    attributionRequired: z.boolean().nullable().default(null),
    updatedAt: z.number().int().nonnegative().nullable().default(null),
  })
  .strict()
  .superRefine((marketplace, context) => {
    if (marketplace.status !== "published") return;
    for (const [field, value] of [
      ["listingId", marketplace.listingId],
      ["publisherId", marketplace.publisherId],
      ["access", marketplace.access],
      ["category", marketplace.category],
      ["commercialUseAllowed", marketplace.commercialUseAllowed],
      ["attributionRequired", marketplace.attributionRequired],
      ["updatedAt", marketplace.updatedAt],
    ] as const) {
      if (value === null) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: `published marketplace metadata requires ${field}`,
        });
      }
    }
  });
export type AssetMarketplaceMetadataIR = z.infer<
  typeof assetMarketplaceMetadataIRSchema
>;

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function addUniqueIdIssues(
  values: readonly { id: string }[],
  path: string,
  context: z.RefinementCtx,
): void {
  const duplicates = duplicateValues(values.map((value) => value.id));
  if (duplicates.length > 0) {
    context.addIssue({
      code: "custom",
      path: [path],
      message: `duplicate ${path} id(s): ${duplicates.join(", ")}`,
    });
  }
}

function validateDependencyGraph(
  assetId: string,
  dependencies: readonly AssetDependencyIR[],
  context: z.RefinementCtx,
): void {
  addUniqueIdIssues(dependencies, "dependencies", context);
  const nodes = new Map(dependencies.map((dependency) => [dependency.id, dependency]));
  for (const [index, dependency] of dependencies.entries()) {
    if (dependency.id === assetId) {
      context.addIssue({
        code: "custom",
        path: ["dependencies", index, "id"],
        message: "dependency graph cannot contain the root asset id",
      });
    }
    const duplicateEdges = duplicateValues(dependency.dependencies);
    if (duplicateEdges.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["dependencies", index, "dependencies"],
        message: `duplicate dependency edge(s): ${duplicateEdges.join(", ")}`,
      });
    }
    for (const target of dependency.dependencies) {
      if (target === assetId) {
        context.addIssue({
          code: "custom",
          path: ["dependencies", index, "dependencies"],
          message: `dependency graph contains a cycle: ${assetId} -> ${dependency.id} -> ${assetId}`,
        });
      }
      if (target !== assetId && !nodes.has(target)) {
        context.addIssue({
          code: "custom",
          path: ["dependencies", index, "dependencies"],
          message: `dependency edge references undeclared id: ${target}`,
        });
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, trail: readonly string[]): void => {
    if (visiting.has(id)) {
      const start = trail.indexOf(id);
      const cycle = [...trail.slice(Math.max(0, start)), id];
      context.addIssue({
        code: "custom",
        path: ["dependencies"],
        message: `dependency graph contains a cycle: ${cycle.join(" -> ")}`,
      });
      return;
    }
    if (visited.has(id) || id === assetId) return;
    const node = nodes.get(id);
    if (node === undefined) return;
    visiting.add(id);
    for (const target of node.dependencies) visit(target, [...trail, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const dependency of dependencies) visit(dependency.id, []);
}

const assetMetadataBaseSchema = z
  .object({
    id: identifierSchema,
    kind: assetKindIRSchema,
    name: z.string().min(1).max(ASSET_METADATA_LIMITS.name),
    version: assetVersionIRSchema,
    /** V11 compatibility view: required capability tokens only. */
    engineRequirements: z
      .array(assetCapabilityTokenSchema)
      .max(ASSET_METADATA_LIMITS.array)
      .default([]),
    providerRequirements: z
      .array(assetProviderRequirementIRSchema)
      .max(ASSET_METADATA_LIMITS.array)
      .default([]),
    sourceFormat: assetSourceFormatIRSchema,
    originalBlobRef: assetBlobReferenceIRSchema.nullable().default(null),
    normalizedIrRef: assetNormalizedIrReferenceSchema.nullable().default(null),
    rendererVariants: z
      .array(assetRendererVariantIRSchema)
      .max(ASSET_METADATA_LIMITS.array)
      .default([]),
    realStrokePreviews: z
      .array(assetRealStrokePreviewIRSchema)
      .max(ASSET_METADATA_LIMITS.array)
      .default([]),
    deviceProfiles: z
      .array(assetDeviceProfileIRSchema)
      .max(ASSET_METADATA_LIMITS.array)
      .default([]),
    visualEquivalenceReport: assetVisualEquivalenceReportIRSchema.nullable().default(null),
    license: assetLicenseIRSchema,
    contentDigest: assetContentDigestSchema,
    createdAt: z.number().int().nonnegative(),
    provenance: assetProvenanceIRSchema,
    dependencies: z
      .array(assetDependencyIRSchema)
      .max(ASSET_METADATA_LIMITS.dependencyNodes)
      .default([]),
    previewVariants: assetPreviewVariantsIRSchema.default(() => ({
      stable: null,
      studioMax: null,
    })),
    providerUnavailable: assetProviderUnavailableIRSchema.nullable().default(null),
    replacementCondition: assetReplacementConditionIRSchema.nullable().default(null),
    marketplace: assetMarketplaceMetadataIRSchema.nullable().default(null),
  })
  .strict()
  .superRefine((metadata, context) => {
    const requiredProviderCapabilities = metadata.providerRequirements
      .filter((requirement) => !requirement.optional)
      .map((requirement) => requirement.capability);
    const engineSet = new Set(metadata.engineRequirements);
    const providerSet = new Set(requiredProviderCapabilities);
    if (engineSet.size > 0 && providerSet.size > 0) {
      const onlyEngine = [...engineSet].filter((token) => !providerSet.has(token)).sort();
      const onlyProvider = [...providerSet].filter((token) => !engineSet.has(token)).sort();
      if (onlyEngine.length > 0 || onlyProvider.length > 0) {
        context.addIssue({
          code: "custom",
          path: ["providerRequirements"],
          message:
            "engineRequirements and required providerRequirements disagree" +
            ` (engine-only: ${onlyEngine.join(", ") || "none"}; provider-only: ${onlyProvider.join(", ") || "none"})`,
        });
      }
    }
    const duplicateCapabilities = duplicateValues(
      metadata.providerRequirements.map((requirement) => requirement.capability),
    );
    if (duplicateCapabilities.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["providerRequirements"],
        message: `duplicate provider requirement capability(s): ${duplicateCapabilities.join(", ")}`,
      });
    }

    addUniqueIdIssues(metadata.rendererVariants, "rendererVariants", context);
    addUniqueIdIssues(metadata.realStrokePreviews, "realStrokePreviews", context);
    addUniqueIdIssues(metadata.deviceProfiles, "deviceProfiles", context);
    validateDependencyGraph(metadata.id, metadata.dependencies, context);

    if (
      metadata.originalBlobRef !== null &&
      metadata.originalBlobRef.digest !== metadata.contentDigest
    ) {
      context.addIssue({
        code: "custom",
        path: ["originalBlobRef", "digest"],
        message: "originalBlobRef.digest must equal contentDigest",
      });
    }

    const rendererIds = new Set(metadata.rendererVariants.map((variant) => variant.id));
    const deviceIds = new Set(metadata.deviceProfiles.map((profile) => profile.id));
    const strokePreviewIds = new Set(metadata.realStrokePreviews.map((preview) => preview.id));
    for (const [index, variant] of metadata.rendererVariants.entries()) {
      if (
        variant.normalizedIrRef !== null &&
        metadata.normalizedIrRef !== null &&
        variant.normalizedIrRef.digest !== metadata.normalizedIrRef.digest
      ) {
        context.addIssue({
          code: "custom",
          path: ["rendererVariants", index, "normalizedIrRef", "digest"],
          message: "renderer variant normalizedIrRef must identify the package normalized IR",
        });
      }
    }
    for (const [index, preview] of metadata.realStrokePreviews.entries()) {
      if (!rendererIds.has(preview.rendererVariantId)) {
        context.addIssue({
          code: "custom",
          path: ["realStrokePreviews", index, "rendererVariantId"],
          message: `unknown renderer variant: ${preview.rendererVariantId}`,
        });
      }
      if (!deviceIds.has(preview.deviceProfileId)) {
        context.addIssue({
          code: "custom",
          path: ["realStrokePreviews", index, "deviceProfileId"],
          message: `unknown device profile: ${preview.deviceProfileId}`,
        });
      }
    }
    for (const tier of ["stable", "studioMax"] as const) {
      const preview = metadata.previewVariants[tier];
      if (preview === null) continue;
      if (preview.rendererVariantId !== null && !rendererIds.has(preview.rendererVariantId)) {
        context.addIssue({
          code: "custom",
          path: ["previewVariants", tier, "rendererVariantId"],
          message: `unknown renderer variant: ${preview.rendererVariantId}`,
        });
      }
      for (const id of preview.realStrokePreviewIds) {
        if (!strokePreviewIds.has(id)) {
          context.addIssue({
            code: "custom",
            path: ["previewVariants", tier, "realStrokePreviewIds"],
            message: `unknown real-stroke preview: ${id}`,
          });
        }
      }
    }
    const report = metadata.visualEquivalenceReport;
    if (report !== null) {
      for (const [field, id] of [
        ["referenceRendererVariantId", report.referenceRendererVariantId],
        ["candidateRendererVariantId", report.candidateRendererVariantId],
      ] as const) {
        if (id !== null && !rendererIds.has(id)) {
          context.addIssue({
            code: "custom",
            path: ["visualEquivalenceReport", field],
            message: `unknown renderer variant: ${id}`,
          });
        }
      }
    }
    const unavailable = metadata.providerUnavailable;
    if (unavailable !== null) {
      if (metadata.normalizedIrRef === null) {
        context.addIssue({
          code: "custom",
          path: ["providerUnavailable", "retainsNormalizedIr"],
          message: "an unavailable asset must retain a normalizedIrRef",
        });
      }
      for (const id of unavailable.selectableRendererVariantIds) {
        if (!rendererIds.has(id)) {
          context.addIssue({
            code: "custom",
            path: ["providerUnavailable", "selectableRendererVariantIds"],
            message: `unknown selectable renderer variant: ${id}`,
          });
        }
      }
    }
  });

type AssetMetadataBase = z.infer<typeof assetMetadataBaseSchema>;

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function normalizeAssetMetadata(metadata: AssetMetadataBase): AssetMetadataBase {
  const engineRequirements = sortedUnique(
    metadata.engineRequirements.length > 0
      ? metadata.engineRequirements
      : metadata.providerRequirements
          .filter((requirement) => !requirement.optional)
          .map((requirement) => requirement.capability),
  );
  const providerRequirements = (
    metadata.providerRequirements.length > 0
      ? metadata.providerRequirements
      : engineRequirements.map((capability) => ({
          capability,
          providerIds: [],
          versionRange: null,
          optional: false,
          reason: null,
        }))
  )
    .map((requirement) => ({
      ...requirement,
      providerIds: sortedUnique(requirement.providerIds),
    }))
    .sort((left, right) => compareCodeUnits(left.capability, right.capability));

  return deepFreeze({
    ...metadata,
    engineRequirements,
    providerRequirements,
    rendererVariants: metadata.rendererVariants
      .map((variant) => ({
        ...variant,
        requiredCapabilities: sortedUnique(variant.requiredCapabilities),
        limitations: sortedUnique(variant.limitations),
      }))
      .sort((left, right) => compareCodeUnits(left.id, right.id)),
    realStrokePreviews: metadata.realStrokePreviews
      .map((preview) => ({ ...preview, notes: sortedUnique(preview.notes) }))
      .sort((left, right) => compareCodeUnits(left.id, right.id)),
    deviceProfiles: metadata.deviceProfiles
      .map((profile) => ({ ...profile, notes: sortedUnique(profile.notes) }))
      .sort((left, right) => compareCodeUnits(left.id, right.id)),
    dependencies: metadata.dependencies
      .map((dependency) => ({
        ...dependency,
        dependencies: sortedUnique(dependency.dependencies),
      }))
      .sort((left, right) => compareCodeUnits(left.id, right.id)),
    previewVariants: {
      stable:
        metadata.previewVariants.stable === null
          ? null
          : {
              ...metadata.previewVariants.stable,
              realStrokePreviewIds: sortedUnique(
                metadata.previewVariants.stable.realStrokePreviewIds,
              ),
            },
      studioMax:
        metadata.previewVariants.studioMax === null
          ? null
          : {
              ...metadata.previewVariants.studioMax,
              realStrokePreviewIds: sortedUnique(
                metadata.previewVariants.studioMax.realStrokePreviewIds,
              ),
            },
    },
    providerUnavailable:
      metadata.providerUnavailable === null
        ? null
        : {
            ...metadata.providerUnavailable,
            selectableRendererVariantIds: sortedUnique(
              metadata.providerUnavailable.selectableRendererVariantIds,
            ),
            limitations: sortedUnique(metadata.providerUnavailable.limitations),
          },
    replacementCondition:
      metadata.replacementCondition === null
        ? null
        : {
            ...metadata.replacementCondition,
            requiredEvidence: [...new Set(metadata.replacementCondition.requiredEvidence)].sort(),
          },
    marketplace:
      metadata.marketplace === null
        ? null
        : {
            ...metadata.marketplace,
            tags: sortedUnique(metadata.marketplace.tags),
          },
  });
}

export const assetMetadataIRSchema = assetMetadataBaseSchema.transform(
  normalizeAssetMetadata,
);
export type AssetMetadataIR = z.infer<typeof assetMetadataIRSchema>;

export class AssetMetadataMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetMetadataMigrationError";
  }
}

/**
 * Converts the retired V12 automatic-substitution record into the fail-closed
 * card shape. This is intentionally opt-in through parseAssetMetadata: direct
 * schema parsing rejects a retired `fallback` field, preventing new writers
 * from accidentally preserving auto-selection semantics.
 */
export function migrateLegacyAssetRendererSubstitution(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const candidate = value as Record<string, unknown>;
  if (!("fallback" in candidate)) return value;
  const { fallback: retiredInstruction, ...withoutRetiredInstruction } = candidate;
  // Old cards emitted `fallback: null` by default. It carries no routing
  // instruction, so remove it without inventing an unavailable state.
  if (retiredInstruction === null) return withoutRetiredInstruction;
  if (
    candidate.providerUnavailable !== undefined &&
    candidate.providerUnavailable !== null
  ) {
    throw new AssetMetadataMigrationError(
      "retired renderer-substitution metadata conflicts with providerUnavailable",
    );
  }

  const legacy = legacyAssetRendererSubstitutionIRSchema.safeParse(retiredInstruction);
  if (!legacy.success) {
    throw new AssetMetadataMigrationError(
      "retired renderer-substitution metadata is invalid and cannot be migrated",
    );
  }
  if (
    !legacy.data.preservesNormalizedIr ||
    candidate.normalizedIrRef === null ||
    candidate.normalizedIrRef === undefined
  ) {
    throw new AssetMetadataMigrationError(
      "retired renderer-substitution metadata cannot migrate without retained normalized IR",
    );
  }

  const selectableRendererVariantIds = Array.isArray(candidate.rendererVariants)
    ? candidate.rendererVariants.flatMap((variant) => {
        if (variant === null || typeof variant !== "object" || Array.isArray(variant)) {
          return [];
        }
        const id = (variant as Record<string, unknown>).id;
        return typeof id === "string" ? [id] : [];
      })
    : [];
  if (selectableRendererVariantIds.length === 0) {
    throw new AssetMetadataMigrationError(
      "retired renderer-substitution metadata cannot migrate without selectable renderer variants",
    );
  }

  return {
    ...withoutRetiredInstruction,
    providerUnavailable: {
      status: "unavailable",
      retainsNormalizedIr: true,
      nextOperation: "select-provider",
      selectableRendererVariantIds,
      reason:
        "A retired automatic renderer-substitution record was migrated. " +
        "Keep the normalized IR and require an explicit provider selection before retrying.",
      limitations: legacy.data.limitations,
    },
  };
}

// ---------------------------------------------------------------------------
// Content digest (deterministic, dependency-free, byte-exact)
// ---------------------------------------------------------------------------

const ASSET_DIGEST_PREFIX = "fnv1a64:";

function fnv1a64HexOfBytes(bytes: Uint8Array): string {
  let hash = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x100000001b3");
  const mask = BigInt("0xffffffffffffffff");
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

export function computeAssetContentDigest(content: Uint8Array | string): string {
  const bytes =
    typeof content === "string" ? new TextEncoder().encode(content) : content;
  return ASSET_DIGEST_PREFIX + fnv1a64HexOfBytes(bytes);
}

export function computeAssetStructuredDigest(value: unknown): string {
  return ASSET_DIGEST_PREFIX + fnv1a64Hex(canonicalJson(value));
}

// ---------------------------------------------------------------------------
// Capability vocabulary validation (reject unknown tokens loudly)
// ---------------------------------------------------------------------------

export class UnknownAssetCapabilityError extends Error {
  constructor(
    readonly assetId: string,
    readonly unknownTokens: readonly string[],
  ) {
    super(
      `asset ${assetId} requires capability token(s) outside the engine ` +
        `vocabulary: ${unknownTokens.join(", ")} — refusing to register a ` +
        "material no engine can ever be matched against",
    );
    this.name = "UnknownAssetCapabilityError";
  }
}

export function assertAssetCapabilitiesKnown(
  metadata: AssetMetadataIR,
  vocabulary: Iterable<string>,
): void {
  const known = vocabulary instanceof Set ? vocabulary : new Set(vocabulary);
  const declared = [
    ...metadata.engineRequirements,
    ...metadata.providerRequirements.map((requirement) => requirement.capability),
    ...metadata.rendererVariants.flatMap((variant) => variant.requiredCapabilities),
  ];
  const unknown = declared.filter((token) => !known.has(token));
  if (unknown.length > 0) {
    throw new UnknownAssetCapabilityError(metadata.id, [...new Set(unknown)].sort());
  }
}

export function parseAssetMetadata(
  value: unknown,
  vocabulary?: Iterable<string>,
): AssetMetadataIR {
  const metadata = assetMetadataIRSchema.parse(
    migrateLegacyAssetRendererSubstitution(value),
  );
  if (vocabulary !== undefined) assertAssetCapabilitiesKnown(metadata, vocabulary);
  return metadata;
}

export function sceneFeatureCapabilityVocabulary(): string[] {
  const blends = blendModeIRSchema.options
    .filter((mode) => mode !== "src-over")
    .map((mode) => `render.blend.${mode}`);
  return [
    "render.vector.fill",
    "render.vector.stroke",
    "render.vector.gradient",
    "render.vector.gradient.sweep",
    "render.text.paragraph",
    "render.group.opacity",
    "render.group.clip",
    ...blends,
  ].sort();
}
