import { z } from "zod";

import { studioReviewTaskReferenceSchema } from "./review-task-reference";

const identity = studioReviewTaskReferenceSchema.shape.commentId;
// Production task IDs predate graph IDs and allow Unicode/interior spaces.
export const studioReviewCompletionTaskIdSchema = z.string().min(1).max(160)
  .refine((value) => value.trim() === value && !value.includes("\\")
    && ![...value].some((character) => { const point = character.codePointAt(0) ?? 0;
      return point <= 31 || (point >= 127 && point <= 159); }));
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const criteria = z.array(z.string().min(1).max(600)).min(1).max(128);
const revision = z.number().int().min(0).max(2_147_483_647);
const timestamp = z.iso.datetime({ offset: true });

/** An immutable server receipt, not workspace JSON or an approval/release grant. */
export const studioReviewTaskCompletionReceiptSchema = z.object({
  contract: z.literal("studio-review-task-completion-v1"),
  workId: identity, taskId: studioReviewCompletionTaskIdSchema, requestId: identity,
  reference: studioReviewTaskReferenceSchema,
  replacement: studioReviewTaskReferenceSchema.shape.subject,
  criteria,
  resolution: z.object({ revisionId: identity, resolvedBy: identity, updatedAt: timestamp }).strict(),
  proofDigest: digest,
  workspaceRevision: revision,
  completedBy: identity, completedAt: timestamp,
}).strict();

export const studioReviewTaskCompletionContextSchema = z.object({
  workId: identity, taskId: studioReviewCompletionTaskIdSchema, taskTitle: z.string().min(1).max(240),
  commentBody: z.string().min(1).max(20_000),
  reference: studioReviewTaskReferenceSchema,
  replacement: studioReviewTaskReferenceSchema.shape.subject,
  criteria,
  resolution: studioReviewTaskCompletionReceiptSchema.shape.resolution,
  baseRevision: revision, proofDigest: digest,
  evidence: z.object({ receipt: studioReviewTaskCompletionReceiptSchema, current: z.boolean() }).strict().nullable(),
}).strict();

/** Exact confirmed values are compared against freshly locked server state. Actor/time are absent. */
export const studioReviewTaskCompletionInputSchema = z.object({
  requestId: identity, baseRevision: revision, proofDigest: digest, confirmedCriteria: criteria,
}).strict();
export type StudioReviewTaskCompletionReceipt = z.infer<typeof studioReviewTaskCompletionReceiptSchema>;
export type StudioReviewTaskCompletionContext = z.infer<typeof studioReviewTaskCompletionContextSchema>;
export type StudioReviewTaskCompletionInput = z.infer<typeof studioReviewTaskCompletionInputSchema>;
