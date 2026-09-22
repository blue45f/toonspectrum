import { z } from "zod";

import { pinnedShareId, pinnedSharePageSchema, pinnedShareSubject } from "./pinned-review-share";

const identity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const timestamp = z.iso.datetime({ offset: true });
const boundedText = z.string().trim().min(1).max(2_000);

export const REVIEW_DELIVERY_MAX_PAGES = 100;
export const REVIEW_DELIVERY_MAX_SOURCE_BYTES = 128 * 1024 * 1024;
export const reviewDeliveryId = pinnedShareId;
export const reviewDeliveryState = z.enum(["prepared", "issued", "delivered", "accepted", "cancelled"]);
export const reviewDeliveryProfileSchema = z.object({
  contract: z.literal("studio-review-delivery-profile-v1"),
  id: z.literal("approved-review-original-zip"), version: z.literal(1),
  container: z.literal("zip-store"), includeReadme: z.literal(true),
}).strict();
export type ReviewDeliveryProfile = z.infer<typeof reviewDeliveryProfileSchema>;
export const DEFAULT_REVIEW_DELIVERY_PROFILE: ReviewDeliveryProfile = Object.freeze({
  contract: "studio-review-delivery-profile-v1", id: "approved-review-original-zip", version: 1,
  container: "zip-store", includeReadme: true,
});

export const reviewDeliveryRightsSchema = z.object({
  contract: z.literal("studio-review-delivery-rights-v1"), statementVersion: z.literal(1),
  mode: z.enum(["free", "paid"]), rightsGraphDigest: digest, confirmed: z.literal(true),
  statement: boundedText,
}).strict();
export type ReviewDeliveryRights = z.infer<typeof reviewDeliveryRightsSchema>;

export const reviewDeliveryPrepareSchema = z.object({
  id: reviewDeliveryId, operationId: reviewDeliveryId, subject: pinnedShareSubject,
  title: z.string().trim().min(1).max(160), recipientUserId: identity,
  profile: reviewDeliveryProfileSchema, rights: reviewDeliveryRightsSchema,
}).strict();
export type ReviewDeliveryPrepare = z.infer<typeof reviewDeliveryPrepareSchema>;

export const reviewDeliveryActionSchema = z.object({
  operationId: reviewDeliveryId, expectedVersion: z.number().int().min(0).max(2_147_483_647),
  manifestDigest: digest,
}).strict();
export const reviewDeliveryAcceptSchema = reviewDeliveryActionSchema.extend({ confirmed: z.literal(true) }).strict();
export type ReviewDeliveryAction = z.infer<typeof reviewDeliveryActionSchema>;
export type ReviewDeliveryAccept = z.infer<typeof reviewDeliveryAcceptSchema>;

export const reviewDeliverySourceSchema = z.object({
  subject: pinnedShareSubject, approvalDigest: digest, decidedAt: timestamp,
  pages: z.array(pinnedSharePageSchema).min(1).max(REVIEW_DELIVERY_MAX_PAGES),
}).strict().superRefine((source, context) => {
  if (source.pages.some((page, index) => page.ordinal !== index)
    || source.pages.reduce((sum, page) => sum + page.byteLength, 0) > REVIEW_DELIVERY_MAX_SOURCE_BYTES) {
    context.addIssue({ code: "custom", message: "Delivery pages must be a complete bounded ordinal sequence" });
  }
});
export type ReviewDeliverySource = z.infer<typeof reviewDeliverySourceSchema>;

export const reviewDeliveryManifestSchema = z.object({
  contract: z.literal("toonstudio.approved-review-delivery/v1"), jobId: reviewDeliveryId,
  title: z.string().min(1).max(160), preparedAt: timestamp,
  source: z.object({ reviewId: identity, revisionId: identity, rootGraphHash: digest,
    sourceDigest: digest, approvalDigest: digest }).strict(),
  profile: reviewDeliveryProfileSchema,
  rights: reviewDeliveryRightsSchema.omit({ statement: true }),
  pages: z.array(pinnedSharePageSchema.extend({ path: z.string().regex(/^pages\/[0-9]{6}\.(?:png|jpg|webp)$/u) }).strict())
    .min(1).max(REVIEW_DELIVERY_MAX_PAGES),
  totalPageBytes: z.number().int().positive().max(REVIEW_DELIVERY_MAX_SOURCE_BYTES), checksum: z.literal("SHA-256"),
}).strict().superRefine((manifest, context) => {
  if (manifest.pages.some((page, index) => page.ordinal !== index)
    || manifest.pages.reduce((sum, page) => sum + page.byteLength, 0) !== manifest.totalPageBytes) {
    context.addIssue({ code: "custom", message: "Delivery manifest totals or order are invalid" });
  }
});
export type ReviewDeliveryManifest = z.infer<typeof reviewDeliveryManifestSchema>;

export const reviewDeliveryRecipientSchema = z.object({ userId: identity, displayName: z.string().min(1).max(160) }).strict();
export const reviewDeliveryJobSchema = z.object({
  contract: z.literal("studio-review-delivery-job-v1"), id: reviewDeliveryId, workId: identity,
  subject: pinnedShareSubject, title: z.string().min(1).max(160),
  sourceDigest: digest, profile: reviewDeliveryProfileSchema, profileDigest: digest,
  rights: reviewDeliveryRightsSchema, manifest: reviewDeliveryManifestSchema, manifestDigest: digest,
  recipient: reviewDeliveryRecipientSchema, state: reviewDeliveryState, version: z.number().int().min(0),
  createdBy: identity, createdAt: timestamp, issuedAt: timestamp.nullable(), deliveredAt: timestamp.nullable(),
  acceptedAt: timestamp.nullable(), cancelledAt: timestamp.nullable(),
  archiveSha256: digest.nullable(), archiveByteLength: z.number().int().positive().max(160 * 1024 * 1024).nullable(),
  currentRecipientBinding: z.boolean(), canIssue: z.boolean(), canDownload: z.boolean(), canAccept: z.boolean(), canCancel: z.boolean(),
}).strict();
export type ReviewDeliveryJob = z.infer<typeof reviewDeliveryJobSchema>;
export const reviewDeliveryListSchema = z.object({ items: z.array(reviewDeliveryJobSchema).max(100),
  recipients: z.array(reviewDeliveryRecipientSchema).max(1_000), canPrepare: z.boolean(), mode: z.enum(["free", "paid"]) }).strict();

export function reviewDeliveryPagePath(page: z.infer<typeof pinnedSharePageSchema>): string {
  const extension = page.mediaType === "image/jpeg" ? "jpg" : page.mediaType === "image/webp" ? "webp" : "png";
  return `pages/${String(page.ordinal + 1).padStart(6, "0")}.${extension}`;
}
export function createReviewDeliveryManifest(input: {
  readonly id: string; readonly title: string; readonly preparedAt: string;
  readonly source: ReviewDeliverySource; readonly sourceDigest: string;
  readonly profile: ReviewDeliveryProfile; readonly rights: ReviewDeliveryRights;
}): ReviewDeliveryManifest {
  const sourceDigest = digest.parse(input.sourceDigest);
  return reviewDeliveryManifestSchema.parse({ contract: "toonstudio.approved-review-delivery/v1", jobId: input.id,
    title: input.title, preparedAt: input.preparedAt,
    source: { reviewId: input.source.subject.reviewId, revisionId: input.source.subject.revisionId,
      rootGraphHash: input.source.subject.rootGraphHash, sourceDigest, approvalDigest: input.source.approvalDigest },
    profile: input.profile, rights: { contract: input.rights.contract, statementVersion: input.rights.statementVersion,
      mode: input.rights.mode, rightsGraphDigest: input.rights.rightsGraphDigest, confirmed: true },
    pages: input.source.pages.map((page) => ({ ...page, path: reviewDeliveryPagePath(page) })),
    totalPageBytes: input.source.pages.reduce((sum, page) => sum + page.byteLength, 0), checksum: "SHA-256" });
}
