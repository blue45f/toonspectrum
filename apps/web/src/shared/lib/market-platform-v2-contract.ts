import { z } from "zod";

import {
  CreatorMarketplaceResourceKindSchema,
  CreatorMarketplaceResourceLicenseSchema,
  CreatorMarketplaceResourceRecordSchema,
} from "./creator-marketplace-resource-contract";

export const MARKET_PLATFORM_V2_SCHEMA_VERSION = 2 as const;
export const MARKET_CATALOG_PAGE_SIZE_MAX = 48;
export const MARKET_VIEWER_CONTEXT_PACKAGE_MAX = 64;
export const MARKET_TAXONOMY_VALUE_MAX = 24;

export const MARKET_CATALOG_SORTS = [
  "project-fit",
  "relevance",
  "verified",
  "updated",
  "newest",
] as const;
export const MARKET_CATALOG_PURPOSES = [
  "planning",
  "storyboard",
  "inking",
  "coloring",
  "background",
  "3d-layout",
  "direction",
  "post-process",
] as const;
export const MARKET_CATALOG_TYPES = [
  "line-brush",
  "color-brush",
  "texture-brush",
  "effect-brush",
  "screen-tone",
  "speech-bubble",
  "effect-line",
  "pose",
  "background",
  "furniture",
  "costume",
  "weapon",
  "vehicle",
  "3d-character",
  "scene-template",
  "palette",
  "color-grade",
  "procedural-object",
] as const;
export const MARKET_CATALOG_GENRES = [
  "romance",
  "romance-fantasy",
  "school",
  "fantasy",
  "action",
  "modern",
  "horror",
  "daily",
  "historical",
  "sf",
] as const;
export const MARKET_CATALOG_SCENES = [
  "classroom",
  "corridor",
  "home",
  "cafe",
  "street",
  "palace",
  "forest",
  "hospital",
  "battle",
  "night",
  "office",
  "vehicle",
] as const;
export const MARKET_CATALOG_STYLES = [
  "realistic",
  "webtoon",
  "cartoon",
  "low-poly",
  "sd",
  "watercolor",
  "monochrome",
  "anime",
] as const;
export const MARKET_AI_DISCLOSURES = [
  "none-declared",
  "assistive",
  "generated-components",
  "substantially-generated",
  "unknown",
] as const;
export const MARKET_MEDIA_ROLES = [
  "hero",
  "gallery",
  "before",
  "after",
  "stroke-sheet",
  "turntable",
  "line-render",
  "wireframe",
  "studio-example",
  "video-poster",
] as const;
export const MARKET_MEDIA_TYPES = [
  "image",
  "video",
  "before-after",
  "turntable",
  "interactive",
] as const;
export const MARKET_MEDIA_STATUSES = [
  "pending",
  "processing",
  "ready",
  "failed",
  "quarantined",
] as const;
export const MARKET_COMPATIBILITY_STATUSES = [
  "verified-compatible",
  "manifest-compatible",
  "degraded",
  "incompatible",
  "unknown",
] as const;
export const MARKET_COMPATIBILITY_EVIDENCE = [
  "platform-test",
  "manifest-rule",
  "creator-declaration",
  "community-evidence",
] as const;
export const MARKET_HANDOFF_MODES = [
  "install",
  "open-catalog",
  "preview-apply",
  "update",
] as const;
export const MARKET_HANDOFF_STATES = [
  "created",
  "redeemed",
  "preparing",
  "snapshot-created",
  "preview-applied",
  "confirmed",
  "rolled-back",
  "failed",
  "cancelled",
  "expired",
] as const;
export const MARKET_APPLICATION_STATES = [
  "preparing",
  "snapshot-created",
  "preview-applied",
  "confirmed",
  "rolled-back",
  "failed",
  "cancelled",
] as const;
export const MARKET_AUTHORING_STATUSES = [
  "cloud-draft",
  "validating",
  "validation-failed",
  "ready-to-submit",
  "submitted",
  "published",
  "rejected",
] as const;
export const MARKET_VALIDATION_STATES = [
  "queued",
  "running",
  "failed",
  "passed-with-warnings",
  "passed",
] as const;

export const MarketCatalogSortSchema = z.enum(MARKET_CATALOG_SORTS);
export const MarketCatalogPurposeSchema = z.enum(MARKET_CATALOG_PURPOSES);
export const MarketCatalogTypeSchema = z.enum(MARKET_CATALOG_TYPES);
export const MarketCatalogGenreSchema = z.enum(MARKET_CATALOG_GENRES);
export const MarketCatalogSceneSchema = z.enum(MARKET_CATALOG_SCENES);
export const MarketCatalogStyleSchema = z.enum(MARKET_CATALOG_STYLES);
export const MarketAiDisclosureSchema = z.enum(MARKET_AI_DISCLOSURES);
export const MarketMediaRoleSchema = z.enum(MARKET_MEDIA_ROLES);
export const MarketMediaTypeSchema = z.enum(MARKET_MEDIA_TYPES);
export const MarketMediaStatusSchema = z.enum(MARKET_MEDIA_STATUSES);
export const MarketCompatibilityStatusSchema = z.enum(MARKET_COMPATIBILITY_STATUSES);
export const MarketCompatibilityEvidenceSchema = z.enum(MARKET_COMPATIBILITY_EVIDENCE);
export const MarketHandoffModeSchema = z.enum(MARKET_HANDOFF_MODES);
export const MarketHandoffStateSchema = z.enum(MARKET_HANDOFF_STATES);
export const MarketApplicationStateSchema = z.enum(MARKET_APPLICATION_STATES);
export const MarketAuthoringStatusSchema = z.enum(MARKET_AUTHORING_STATUSES);
export const MarketValidationStateSchema = z.enum(MARKET_VALIDATION_STATES);

const IsoDateTimeSchema = z.iso.datetime({ offset: true });
const UuidSchema = z.string().uuid();
const HttpsUrlSchema = z.string().url().max(2_048).refine(
  (value) => value.startsWith("https://"),
  "HTTPS 주소만 사용할 수 있습니다.",
);
const TaxonomyArraySchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.array(schema).max(MARKET_TAXONOMY_VALUE_MAX).default([]);

export const MarketMediaSchema = z.object({
  id: UuidSchema,
  releaseId: UuidSchema,
  role: MarketMediaRoleSchema,
  type: MarketMediaTypeSchema,
  url: HttpsUrlSchema,
  altText: z.string().trim().min(3).max(500),
  width: z.number().int().positive().max(32_768).nullable(),
  height: z.number().int().positive().max(32_768).nullable(),
  durationMs: z.number().int().positive().max(60 * 60 * 1_000).nullable(),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/u).nullable(),
  status: MarketMediaStatusSchema,
  sortOrder: z.number().int().min(0).max(1_000),
}).strict();

export const MarketCatalogCreatorSchema = z.object({
  id: z.string().min(1).max(160),
  displayName: z.string().trim().min(1).max(120),
  avatarUrl: z.string().url().max(2_048).nullable(),
}).strict();

export const MarketCatalogReleaseSummarySchema = z.object({
  id: UuidSchema,
  version: z.string().min(1).max(64),
  releaseOrdinal: z.number().int().positive(),
  minimumStudioVersion: z.string().min(1).max(64),
  publishedAt: IsoDateTimeSchema,
  manifestHash: z.string().regex(/^[0-9a-f]{64}$/u),
  entryCount: z.number().int().min(1).max(32),
}).strict();

export const MarketLicenseCapabilitySchema = z.object({
  license: CreatorMarketplaceResourceLicenseSchema,
  commercialUse: z.boolean(),
  modification: z.boolean(),
  attributionRequired: z.boolean(),
  redistributionAllowed: z.boolean(),
  clientDelivery: z.boolean(),
}).strict();

export const MarketCatalogTaxonomySchema = z.object({
  purposes: TaxonomyArraySchema(MarketCatalogPurposeSchema),
  catalogTypes: TaxonomyArraySchema(MarketCatalogTypeSchema),
  genres: TaxonomyArraySchema(MarketCatalogGenreSchema),
  scenes: TaxonomyArraySchema(MarketCatalogSceneSchema),
  styles: TaxonomyArraySchema(MarketCatalogStyleSchema),
  technicalFeatures: z.array(z.string().trim().min(1).max(80))
    .max(MARKET_TAXONOMY_VALUE_MAX).default([]),
}).strict();

export const MarketCatalogVerificationSchema = z.object({
  manifestVerified: z.literal(true),
  studioLoadVerified: z.boolean(),
  projectApplyEvidenceCount: z.number().int().min(0),
  lastVerifiedAt: IsoDateTimeSchema.nullable(),
}).strict();

export const MarketCatalogItemSummarySchema = z.object({
  schemaVersion: z.literal(MARKET_PLATFORM_V2_SCHEMA_VERSION),
  packageId: UuidSchema,
  slug: z.string().min(1).max(180),
  machinePackageId: z.string().min(1).max(160),
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().max(300),
  runtimeKind: CreatorMarketplaceResourceKindSchema,
  creator: MarketCatalogCreatorSchema,
  currentRelease: MarketCatalogReleaseSummarySchema,
  heroMedia: MarketMediaSchema.nullable(),
  taxonomy: MarketCatalogTaxonomySchema,
  license: MarketLicenseCapabilitySchema,
  aiDisclosure: MarketAiDisclosureSchema,
  verification: MarketCatalogVerificationSchema,
  offering: z.object({ type: z.literal("free") }).strict(),
}).strict();

export const MarketFacetValueSchema = z.object({
  value: z.string().min(1).max(100),
  label: z.string().min(1).max(120),
  count: z.number().int().min(0),
}).strict();

export const MarketCatalogPageSchema = z.object({
  schemaVersion: z.literal(MARKET_PLATFORM_V2_SCHEMA_VERSION),
  query: z.object({
    original: z.string().max(160),
    normalized: z.string().max(160),
    appliedSynonyms: z.array(z.string().max(80)).max(16),
  }).strict(),
  items: z.array(MarketCatalogItemSummarySchema).max(MARKET_CATALOG_PAGE_SIZE_MAX),
  page: z.object({
    limit: z.number().int().min(1).max(MARKET_CATALOG_PAGE_SIZE_MAX),
    hasMore: z.boolean(),
    nextCursor: z.string().min(1).max(512).nullable(),
    total: z.number().int().min(0),
    totalRelation: z.enum(["eq", "gte"]),
  }).strict(),
  facets: z.object({
    runtimeKind: z.array(MarketFacetValueSchema),
    purpose: z.array(MarketFacetValueSchema),
    catalogType: z.array(MarketFacetValueSchema),
    genre: z.array(MarketFacetValueSchema),
    scene: z.array(MarketFacetValueSchema),
    style: z.array(MarketFacetValueSchema),
    licenseUse: z.array(MarketFacetValueSchema),
    verification: z.array(MarketFacetValueSchema),
  }).strict(),
  rankVersion: z.number().int().positive(),
  taxonomyVersion: z.number().int().positive(),
  generatedAt: IsoDateTimeSchema,
}).strict();

export const MarketPackageDetailSchema = z.object({
  package: MarketCatalogItemSummarySchema,
  description: z.string().max(10_000),
  tags: z.array(z.string().max(80)).max(64),
  media: z.array(MarketMediaSchema).max(64),
  release: CreatorMarketplaceResourceRecordSchema,
  related: z.array(MarketCatalogItemSummarySchema).max(12),
}).strict();

export const MarketProjectContextSchema = z.object({
  studioVersion: z.string().min(1).max(64),
  renderer: z.enum(["canvas2d", "webgl2", "webgpu", "three"]),
  documentType: z.enum(["scroll", "page", "scene", "unknown"]).default("unknown"),
  deviceClass: z.enum(["desktop", "tablet", "mobile"]).default("desktop"),
  licensePurpose: z.enum(["personal", "commercial", "client-delivery", "team"])
    .default("commercial"),
}).strict();

export const MarketCompatibilityEvaluationSchema = z.object({
  status: MarketCompatibilityStatusSchema,
  evidence: z.array(MarketCompatibilityEvidenceSchema).min(1).max(4),
  blockers: z.array(z.string().min(1).max(80)).max(16),
  warnings: z.array(z.string().min(1).max(80)).max(16),
  evaluatedAt: IsoDateTimeSchema,
  testedStudioVersion: z.string().max(64).nullable(),
}).strict();

export const MarketViewerContextRequestSchema = z.object({
  packageIds: z.array(UuidSchema).min(1).max(MARKET_VIEWER_CONTEXT_PACKAGE_MAX),
  projectRef: z.string().trim().min(1).max(160).nullable().default(null),
  documentRef: z.string().trim().min(1).max(160).nullable().default(null),
  projectContext: MarketProjectContextSchema.optional(),
  deviceInstallations: z.array(z.object({
    packageId: UuidSchema,
    releaseId: UuidSchema,
    version: z.string().min(1).max(64),
  }).strict()).max(MARKET_VIEWER_CONTEXT_PACKAGE_MAX).default([]),
}).strict();

export const MarketViewerPackageStateSchema = z.object({
  packageId: UuidSchema,
  favorite: z.boolean(),
  library: z.discriminatedUnion("state", [
    z.object({ state: z.literal("none") }).strict(),
    z.object({
      state: z.literal("active"),
      itemId: UuidSchema,
      acquiredVersion: z.string().min(1).max(64),
    }).strict(),
    z.object({
      state: z.literal("archived"),
      itemId: UuidSchema,
      acquiredVersion: z.string().min(1).max(64),
    }).strict(),
  ]),
  accountInstall: z.discriminatedUnion("state", [
    z.object({ state: z.literal("none") }).strict(),
    z.object({
      state: z.literal("confirmed"),
      releaseId: UuidSchema.nullable(),
      version: z.string().min(1).max(64),
      confirmedAt: IsoDateTimeSchema,
    }).strict(),
  ]),
  deviceInstall: z.discriminatedUnion("state", [
    z.object({ state: z.literal("unknown") }).strict(),
    z.object({ state: z.literal("not-installed") }).strict(),
    z.object({
      state: z.literal("installed"),
      releaseId: UuidSchema,
      version: z.string().min(1).max(64),
    }).strict(),
  ]),
  projectUsage: z.discriminatedUnion("state", [
    z.object({ state: z.literal("not-used") }).strict(),
    z.object({
      state: z.literal("preview"),
      applicationId: UuidSchema,
      releaseId: UuidSchema,
    }).strict(),
    z.object({
      state: z.literal("applied"),
      applicationId: UuidSchema,
      releaseId: UuidSchema,
      instanceCount: z.number().int().min(0),
    }).strict(),
  ]),
  update: z.object({
    available: z.boolean(),
    latestVersion: z.string().min(1).max(64),
  }).strict(),
  compatibility: MarketCompatibilityEvaluationSchema,
}).strict();

export const MarketViewerContextResponseSchema = z.object({
  items: z.array(MarketViewerPackageStateSchema)
    .max(MARKET_VIEWER_CONTEXT_PACKAGE_MAX),
}).strict();

export const MarketFavoriteReceiptSchema = z.object({
  packageId: UuidSchema,
  favorite: z.boolean(),
  updatedAt: IsoDateTimeSchema,
}).strict();

export const MarketHomeSectionSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  description: z.string().max(300),
  reason: z.string().min(1).max(80),
  items: z.array(MarketCatalogItemSummarySchema).max(12),
  moreLink: z.string().min(1).max(500),
}).strict();

export const MarketEditorialCollectionSchema = z.object({
  id: UuidSchema,
  slug: z.string().min(1).max(180),
  title: z.string().min(1).max(120),
  description: z.string().max(500),
  heroUrl: HttpsUrlSchema.nullable(),
  items: z.array(MarketCatalogItemSummarySchema).max(24),
}).strict();

export const MarketHomeFeedSchema = z.object({
  schemaVersion: z.literal(MARKET_PLATFORM_V2_SCHEMA_VERSION),
  sections: z.array(MarketHomeSectionSchema).max(12),
  collections: z.array(MarketEditorialCollectionSchema).max(12),
  generatedAt: IsoDateTimeSchema,
}).strict();

export const MarketPackageProfileUpdateSchema = z.object({
  title: z.string().trim().min(2).max(120),
  summary: z.string().trim().min(12).max(300),
  description: z.string().trim().min(30).max(10_000),
  purposes: TaxonomyArraySchema(MarketCatalogPurposeSchema),
  catalogTypes: TaxonomyArraySchema(MarketCatalogTypeSchema),
  genres: TaxonomyArraySchema(MarketCatalogGenreSchema),
  scenes: TaxonomyArraySchema(MarketCatalogSceneSchema),
  styles: TaxonomyArraySchema(MarketCatalogStyleSchema),
  technicalFeatures: z.array(z.string().trim().min(1).max(80))
    .max(MARKET_TAXONOMY_VALUE_MAX).default([]),
  aiDisclosure: MarketAiDisclosureSchema,
}).strict();

export const MarketMediaUpsertSchema = z.object({
  items: z.array(z.object({
    id: UuidSchema.optional(),
    role: MarketMediaRoleSchema,
    type: MarketMediaTypeSchema,
    url: HttpsUrlSchema,
    altText: z.string().trim().min(3).max(500),
    width: z.number().int().positive().max(32_768).nullable().default(null),
    height: z.number().int().positive().max(32_768).nullable().default(null),
    durationMs: z.number().int().positive().max(60 * 60 * 1_000).nullable()
      .default(null),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/u).nullable().default(null),
    sortOrder: z.number().int().min(0).max(1_000),
  }).strict()).max(64),
}).strict();

export const MarketHandoffCreateSchema = z.object({
  packageId: UuidSchema,
  releaseId: UuidSchema,
  mode: MarketHandoffModeSchema,
  projectRef: z.string().trim().min(1).max(160).nullable().default(null),
  documentRef: z.string().trim().min(1).max(160).nullable().default(null),
  returnPath: z.string().trim().min(1).max(500).default("/market"),
  projectContext: MarketProjectContextSchema,
}).strict();

export const MarketHandoffReceiptSchema = z.object({
  id: UuidSchema,
  token: z.string().min(32).max(512),
  studioUrl: z.string().min(1).max(1_000),
  state: MarketHandoffStateSchema,
  expiresAt: IsoDateTimeSchema,
  compatibility: MarketCompatibilityEvaluationSchema,
}).strict();

export const MarketHandoffRedeemSchema = z.object({
  token: z.string().min(32).max(512),
}).strict();

export const MarketHandoffPayloadSchema = z.object({
  id: UuidSchema,
  packageId: UuidSchema,
  releaseId: UuidSchema,
  mode: MarketHandoffModeSchema,
  projectRef: z.string().nullable(),
  documentRef: z.string().nullable(),
  returnPath: z.string(),
  resource: CreatorMarketplaceResourceRecordSchema,
  compatibility: MarketCompatibilityEvaluationSchema,
  redeemedAt: IsoDateTimeSchema,
}).strict();

export const MarketHandoffCompleteSchema = z.object({
  state: z.enum(["snapshot-created", "preview-applied", "confirmed", "rolled-back", "failed", "cancelled"]),
  transactionId: UuidSchema,
  projectRevisionBefore: z.string().max(200).nullable().default(null),
  projectRevisionAfter: z.string().max(200).nullable().default(null),
  createdLayerIds: z.array(z.string().max(200)).max(1_000).default([]),
  createdObjectIds: z.array(z.string().max(200)).max(1_000).default([]),
  modifiedPropertyPaths: z.array(z.string().max(500)).max(2_000).default([]),
  warnings: z.array(z.string().max(200)).max(64).default([]),
  failureCode: z.string().max(100).nullable().default(null),
}).strict();

export const MarketProjectApplicationSchema = z.object({
  id: UuidSchema,
  packageId: UuidSchema,
  releaseId: UuidSchema,
  handoffId: UuidSchema.nullable(),
  projectRef: z.string().nullable(),
  documentRef: z.string().nullable(),
  transactionId: UuidSchema,
  state: MarketApplicationStateSchema,
  createdLayerIds: z.array(z.string()),
  createdObjectIds: z.array(z.string()),
  modifiedPropertyPaths: z.array(z.string()),
  warnings: z.array(z.string()),
  appliedAt: IsoDateTimeSchema,
  confirmedAt: IsoDateTimeSchema.nullable(),
  rolledBackAt: IsoDateTimeSchema.nullable(),
}).strict();

export const MarketProjectApplicationPageSchema = z.object({
  items: z.array(MarketProjectApplicationSchema).max(200),
}).strict();

export const MarketAuthoringDraftCreateSchema = z.object({
  runtimeKind: CreatorMarketplaceResourceKindSchema,
  authoringTemplate: z.enum([
    "brush",
    "tone",
    "palette",
    "pose",
    "3d",
    "background",
    "bubble",
    "template",
    "material",
    "manifest",
  ]),
  packageId: UuidSchema.nullable().default(null),
  baseReleaseId: UuidSchema.nullable().default(null),
  payload: z.record(z.string(), z.unknown()).default({}),
}).strict();

export const MarketAuthoringDraftUpdateSchema = z.object({
  revision: z.number().int().positive(),
  payload: z.record(z.string(), z.unknown()),
}).strict();

export const MarketAuthoringDraftSchema = z.object({
  id: UuidSchema,
  runtimeKind: CreatorMarketplaceResourceKindSchema,
  authoringTemplate: z.string(),
  packageId: UuidSchema.nullable(),
  baseReleaseId: UuidSchema.nullable(),
  revision: z.number().int().positive(),
  status: MarketAuthoringStatusSchema,
  payload: z.record(z.string(), z.unknown()),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  submittedAt: IsoDateTimeSchema.nullable(),
  publishedReleaseId: UuidSchema.nullable(),
}).strict();

export const MarketValidationDiagnosticSchema = z.object({
  code: z.string().min(1).max(100),
  severity: z.enum(["error", "warning", "info"]),
  path: z.array(z.union([z.string(), z.number().int()])).max(32),
  message: z.string().min(1).max(1_000),
}).strict();

export const MarketValidationJobSchema = z.object({
  id: UuidSchema,
  draftId: UuidSchema,
  state: MarketValidationStateSchema,
  diagnostics: z.array(MarketValidationDiagnosticSchema).max(500),
  createdAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema.nullable(),
}).strict();

export type MarketCatalogSort = z.infer<typeof MarketCatalogSortSchema>;
export type MarketCatalogPurpose = z.infer<typeof MarketCatalogPurposeSchema>;
export type MarketCatalogType = z.infer<typeof MarketCatalogTypeSchema>;
export type MarketCatalogGenre = z.infer<typeof MarketCatalogGenreSchema>;
export type MarketCatalogScene = z.infer<typeof MarketCatalogSceneSchema>;
export type MarketCatalogStyle = z.infer<typeof MarketCatalogStyleSchema>;
export type MarketAiDisclosure = z.infer<typeof MarketAiDisclosureSchema>;
export type MarketCatalogItemSummary = z.infer<typeof MarketCatalogItemSummarySchema>;
export type MarketCatalogPage = z.infer<typeof MarketCatalogPageSchema>;
export type MarketPackageDetail = z.infer<typeof MarketPackageDetailSchema>;
export type MarketProjectContext = z.infer<typeof MarketProjectContextSchema>;
export type MarketCompatibilityEvaluation = z.infer<typeof MarketCompatibilityEvaluationSchema>;
export type MarketViewerContextRequest = z.infer<typeof MarketViewerContextRequestSchema>;
export type MarketViewerContextResponse = z.infer<typeof MarketViewerContextResponseSchema>;
export type MarketHomeFeed = z.infer<typeof MarketHomeFeedSchema>;
export type MarketPackageProfileUpdate = z.infer<typeof MarketPackageProfileUpdateSchema>;
export type MarketMediaUpsert = z.infer<typeof MarketMediaUpsertSchema>;
export type MarketHandoffCreate = z.infer<typeof MarketHandoffCreateSchema>;
export type MarketHandoffReceipt = z.infer<typeof MarketHandoffReceiptSchema>;
export type MarketHandoffPayload = z.infer<typeof MarketHandoffPayloadSchema>;
export type MarketHandoffComplete = z.infer<typeof MarketHandoffCompleteSchema>;
export type MarketProjectApplication = z.infer<typeof MarketProjectApplicationSchema>;
export type MarketAuthoringDraftCreate = z.infer<typeof MarketAuthoringDraftCreateSchema>;
export type MarketAuthoringDraftUpdate = z.infer<typeof MarketAuthoringDraftUpdateSchema>;
export type MarketAuthoringDraft = z.infer<typeof MarketAuthoringDraftSchema>;
export type MarketValidationJob = z.infer<typeof MarketValidationJobSchema>;
