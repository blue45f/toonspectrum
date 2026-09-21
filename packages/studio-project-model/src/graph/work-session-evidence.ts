import { z } from "zod";

import { studioReviewSourceReferenceSchema } from "./review-source-map";

const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const count = z.number().int().min(0).max(1_000_000_000);
const label = z.string().trim().min(1).max(180);
const usage = z.object({ promptTokens: count.optional(), completionTokens: count.optional(), totalTokens: count.optional() }).strict();
export const studioSessionAssetEvidenceSchema = z.object({
  source: studioReviewSourceReferenceSchema,
  name: label, kind: z.enum(["community", "builtin", "stock", "ai-generated", "native-3d", "local"]),
  assetId: z.string().min(1).max(240).nullable(),
  licenseLabel: z.string().max(240).nullable(), attribution: z.string().max(500).nullable(),
  commercialUse: z.enum(["allowed", "prohibited", "unknown"]),
  nativeSceneKind: z.enum(["background3d", "vrm"]).nullable(),
}).strict();
export const studioSessionAiEvidenceSchema = z.object({
  id: z.string().min(1).max(120), kind: z.enum(["text", "image"]),
  status: z.enum(["pending", "succeeded", "failed", "cancelled"]),
  provider: label, model: label, transport: z.enum(["server", "byok", "local", "other"]),
  createdAt: z.iso.datetime({ offset: true }), promptDigest: digest.nullable(),
  target: studioReviewSourceReferenceSchema.nullable(),
  targetStatus: z.enum(["mapped", "outside-page-window", "missing", "unmapped"]), usage: usage.nullable(),
}).strict();
export const studioSessionEvidenceSchema = z.object({
  version: z.literal(1), sourceContentDigest: digest, sourceServerRevision: z.number().int().positive(),
  assets: z.array(studioSessionAssetEvidenceSchema).max(250), aiOperations: z.array(studioSessionAiEvidenceSchema).max(100),
  omittedAssets: count, omittedAiOperations: count, invalidEntries: count,
}).strict();
export type StudioSessionEvidence = z.infer<typeof studioSessionEvidenceSchema>;

export const studioSessionEvidenceResponseSchema = z.object({
  workId: z.string().min(1).max(160), sessionId: z.string().min(1).max(160), inputDigest: digest,
  offset: z.number().int().min(0).max(99_999), expiresAt: z.iso.datetime({ offset: true }),
  evidence: studioSessionEvidenceSchema.nullable(), nextOffset: z.number().int().min(0).max(99_999).nullable(),
}).strict();
export type StudioSessionEvidenceResponse = z.infer<typeof studioSessionEvidenceResponseSchema>;
