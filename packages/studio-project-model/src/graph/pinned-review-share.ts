import { z } from "zod";

import { studioReviewTaskReferenceSchema } from "./review-task-reference";

export const pinnedShareId = z.string().uuid();
export const pinnedShareToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);
export const pinnedShareSubject = studioReviewTaskReferenceSchema.shape.subject;
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const timestamp = z.iso.datetime({ offset: true });
const ordinal = z.number().int().min(0).max(99_999);
export const PINNED_SHARE_IMAGE_BYTES = 32 * 1024 * 1024;
export const PINNED_SHARE_TOTAL_BYTES = 128 * 1024 * 1024;
export const pinnedSharePageSchema = z.object({ ordinal, sha256,
  byteLength: z.number().int().positive().max(PINNED_SHARE_IMAGE_BYTES),
  mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  width: z.number().int().positive().max(16_384), height: z.number().int().positive().max(16_384),
}).strict().refine((page) => page.width * page.height <= 16_777_216, "Image decoded size exceeds the preview budget");
export type PinnedSharePage = z.infer<typeof pinnedSharePageSchema>;
export const pinnedShareCreateSchema = z.object({ id: pinnedShareId, operationId: pinnedShareId,
  subject: pinnedShareSubject, title: z.string().trim().min(1).max(160), instructions: z.string().trim().max(2000),
  purpose: z.enum(["external-review", "mentoring", "showcase"]), role: z.enum(["viewer", "commenter"]),
  pageOrdinals: z.array(ordinal).min(1).max(100).refine((values) => new Set(values).size === values.length, "Duplicate page identity"),
  expiresInHours: z.number().int().min(1).max(720), watermark: z.boolean(),
  rightsStatement: z.string().trim().max(2000), publicationConsent: z.boolean(),
}).strict().superRefine((input, ctx) => {
  if (input.purpose === "showcase" && (!input.publicationConsent || input.role !== "viewer" || !input.rightsStatement))
    ctx.addIssue({ code: "custom", message: "Showcase needs explicit publication consent, stated rights and read-only access" });
  if (input.purpose !== "showcase" && input.publicationConsent) ctx.addIssue({ code: "custom", message: "Private review is not public publication" });
});
export type PinnedShareCreate = z.infer<typeof pinnedShareCreateSchema>;
export const pinnedShareSnapshotSchema = z.object({ contract: z.literal("studio-pinned-review-share-v1"),
  input: pinnedShareCreateSchema, pages: z.array(pinnedSharePageSchema).min(1).max(100),
  createdBy: z.string().min(1).max(160), managerDigest: sha256, createdAt: timestamp, expiresAt: timestamp, approvalDigest: sha256.nullable(),
}).strict().superRefine((state, ctx) => {
  if (state.pages.length !== state.input.pageOrdinals.length || state.pages.some((page, i) => page.ordinal !== state.input.pageOrdinals[i])
    || state.pages.reduce((sum, page) => sum + page.byteLength, 0) > PINNED_SHARE_TOTAL_BYTES
    || Date.parse(state.expiresAt) !== Date.parse(state.createdAt) + state.input.expiresInHours * 3600_000
    || (state.input.purpose === "showcase" && !state.approvalDigest)) ctx.addIssue({ code: "custom", message: "Invalid immutable share scope or lifetime" });
});
export type PinnedShareSnapshot = z.infer<typeof pinnedShareSnapshotSchema>;
export const pinnedShareFeedbackInputSchema = z.object({ id: pinnedShareId, pageOrdinal: ordinal,
  reviewerName: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(4000),
}).strict();
export type PinnedShareFeedbackInput = z.infer<typeof pinnedShareFeedbackInputSchema>;
export const pinnedShareFeedbackSchema = pinnedShareFeedbackInputSchema.extend({ createdAt: timestamp }).strict();
/** No source work IDs, internal people, manuscript metadata, storage locators or tokens. */
export const pinnedShareViewSchema = z.object({ id: pinnedShareId, title: z.string().max(160), instructions: z.string().max(2000),
  purpose: z.enum(["external-review", "mentoring", "showcase"]), role: z.enum(["viewer", "commenter"]), watermark: z.boolean(),
  rightsStatement: z.string().max(2000), revisionFingerprint: sha256, expiresAt: timestamp, leaseExpiresAt: timestamp,
  pages: z.array(pinnedSharePageSchema).min(1).max(100), feedback: z.array(pinnedShareFeedbackSchema).max(100),
}).strict();
export type PinnedShareView = z.infer<typeof pinnedShareViewSchema>;
export const pinnedShareOwnerViewSchema = z.object({ id: pinnedShareId, input: pinnedShareCreateSchema,
  createdAt: timestamp, expiresAt: timestamp, revokedAt: timestamp.nullable(), feedback: z.array(pinnedShareFeedbackSchema).max(100),
}).strict();
export type PinnedShareOwnerView = z.infer<typeof pinnedShareOwnerViewSchema>;
export const pinnedShareCreatedSchema = z.object({ share: pinnedShareOwnerViewSchema, token: pinnedShareToken.nullable(), replayed: z.boolean() }).strict();
export const pinnedShareAccessSchema = z.union([z.object({ token: pinnedShareToken }).strict(), z.object({ publicId: pinnedShareId }).strict()]);
export type PinnedShareAccess = z.infer<typeof pinnedShareAccessSchema>;
export const pinnedShareSourcesSchema = z.object({ subject: pinnedShareSubject, pages: z.array(pinnedSharePageSchema).max(32),
  nextOffset: ordinal.nullable(), approved: z.boolean(), expiresAt: timestamp }).strict();
export const pinnedSharePublicEntrySchema = z.object({ id: pinnedShareId, title: z.string().max(160), pageCount: z.number().int().min(1).max(100),
  expiresAt: timestamp }).strict();
export const pinnedSharePublicListSchema = z.object({ items: z.array(pinnedSharePublicEntrySchema).max(10), nextCursor: pinnedShareId.nullable() }).strict();
