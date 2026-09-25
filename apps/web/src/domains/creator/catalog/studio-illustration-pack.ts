import { z } from "zod";

import manifest from "./studio-illustration-pack-manifest.json";

import type { Studio2dAssetMetadata } from "../studio-2d-asset-quality";

const illustrationAssetSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["background", "prop-cluster", "bubble-decoration", "effect-overlay", "texture"]),
  title: z.string().min(1),
  genre: z.string().min(1),
  collection: z.enum(["daily", "school", "fantasy", "urban", "scifi", "coastal", "romance"]),
  src: z.string().regex(/^\/assets\/studio\/illustration-20260926\/[a-z0-9-]+\.png$/u),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  hasAlpha: z.boolean(),
  defaultBlendMode: z.enum(["source-over", "multiply", "screen", "overlay"]).optional(),
  repeatable: z.boolean().optional(),
  environment: z.enum(["실내", "실외"]),
  timeOfDay: z.enum(["낮", "노을", "밤"]),
  containsPeople: z.boolean(),
  containsText: z.literal(false),
  tags: z.array(z.string().min(1)).min(1),
  review: z.object({
    method: z.literal("full-image"),
    status: z.literal("usable"),
    reviewedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    reviewer: z.literal("assistant"),
    notes: z.array(z.string().min(1)).min(1),
  }),
  promptSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  sourcePromptId: z.string().min(1),
  editPromptSha256: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  postProcessing: z.array(z.literal("built-in-image-edit")),
});

const packSchema = z.object({
  version: z.literal(1),
  generatedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  generator: z.object({
    provider: z.literal("openai"),
    tool: z.literal("built-in image_gen"),
    model: z.literal("unverified"),
    modelVersionVerified: z.literal(false),
  }),
  assets: z.array(illustrationAssetSchema),
});

// 도구가 확인해 주지 않은 모델 버전은 요청한 모델명으로 추정하지 않는다.
export const STUDIO_ILLUSTRATION_PACK = Object.freeze(packSchema.parse(manifest));
export type StudioIllustrationAsset = z.infer<typeof illustrationAssetSchema>;

export const STUDIO_ILLUSTRATION_BACKGROUND_METADATA: readonly Studio2dAssetMetadata[] =
  Object.freeze(STUDIO_ILLUSTRATION_PACK.assets
    .filter((asset) => asset.kind === "background")
    .map((asset): Studio2dAssetMetadata => ({
      ...asset,
      label: asset.title,
      recommended: true,
      mediaType: "image/png",
      style: "webtoon-illustration",
      legacySrc: null,
      sourceManifest: "studio-illustration-pack-manifest.json",
      provenance: {
        kind: "built-in-image-gen",
        licenseStatus: "first-party-generated",
        provider: STUDIO_ILLUSTRATION_PACK.generator.provider,
        model: STUDIO_ILLUSTRATION_PACK.generator.model,
        modelVersionVerified: false,
        generatedAt: STUDIO_ILLUSTRATION_PACK.generatedOn,
        ...(asset.promptSha256 ? { promptHash: asset.promptSha256 } : {}),
      },
    })));

export const STUDIO_ILLUSTRATION_BG_SCENES = Object.freeze(
  STUDIO_ILLUSTRATION_BACKGROUND_METADATA.map((asset) => Object.freeze({
    id: asset.id,
    label: asset.title,
    genre: asset.genre ?? "일상",
    imgSrc: asset.src,
    width: asset.width,
    height: asset.height,
  })),
);
