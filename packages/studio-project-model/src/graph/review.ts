import { z } from "zod";

import { isoTimestampSchema, studioEntityIdSchema } from "./ids";
import { scopeRefSchema } from "./scope-ref";

import type {
  ArtifactId,
  ReviewCommentId,
  ReviewId,
  RevisionId,
  UserId,
} from "./ids";
import type { ScopeRef } from "./scope-ref";

export const reviewAnchorKindSchema = z.enum([
  "artifact",
  "page",
  "panel",
  "object",
  "coordinate",
  "region",
  "timecode",
]);
export type ReviewAnchorKind = z.infer<typeof reviewAnchorKindSchema>;

export interface ReviewAnchor {
  readonly artifactId: ArtifactId;
  readonly revisionId: RevisionId;
  readonly scope: ScopeRef;
  readonly kind: ReviewAnchorKind;
  readonly objectId?: string;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly timecodeMs?: number;
}

export const reviewAnchorSchema = z
  .object({
    artifactId: studioEntityIdSchema,
    revisionId: studioEntityIdSchema,
    scope: scopeRefSchema,
    kind: reviewAnchorKindSchema,
    objectId: studioEntityIdSchema.optional(),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    width: z.number().finite().positive().optional(),
    height: z.number().finite().positive().optional(),
    timecodeMs: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine((anchor, context) => {
    if (anchor.kind === "object" && anchor.objectId === undefined) {
      context.addIssue({ code: "custom", path: ["objectId"], message: "object anchor requires objectId" });
    }
    if (anchor.kind === "coordinate" && (anchor.x === undefined || anchor.y === undefined)) {
      context.addIssue({ code: "custom", path: ["x"], message: "coordinate anchor requires x and y" });
    }
    if (
      anchor.kind === "region"
      && (anchor.x === undefined || anchor.y === undefined || anchor.width === undefined || anchor.height === undefined)
    ) {
      context.addIssue({ code: "custom", path: ["width"], message: "region anchor requires x, y, width and height" });
    }
    if (anchor.kind === "timecode" && anchor.timecodeMs === undefined) {
      context.addIssue({ code: "custom", path: ["timecodeMs"], message: "timecode anchor requires timecodeMs" });
    }
  });

export const reviewCommentSeveritySchema = z.enum(["required", "recommended", "note"]);
export const reviewCommentStatusSchema = z.enum(["open", "resolved", "reopened", "dismissed"]);

export interface ReviewComment {
  readonly id: ReviewCommentId;
  readonly reviewId: ReviewId;
  readonly anchor: ReviewAnchor;
  readonly authorId: UserId;
  readonly body: string;
  readonly severity: z.infer<typeof reviewCommentSeveritySchema>;
  readonly status: z.infer<typeof reviewCommentStatusSchema>;
  readonly assigneeIds: readonly UserId[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly dueAt?: string;
  readonly resolutionRevisionId?: RevisionId;
  readonly resolvedBy?: UserId;
}

export const reviewCommentSchema = z
  .object({
    id: studioEntityIdSchema,
    reviewId: studioEntityIdSchema,
    anchor: reviewAnchorSchema,
    authorId: studioEntityIdSchema,
    body: z.string().trim().min(1).max(20_000),
    severity: reviewCommentSeveritySchema,
    status: reviewCommentStatusSchema,
    assigneeIds: z.array(studioEntityIdSchema).max(64),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
    dueAt: isoTimestampSchema.optional(),
    resolutionRevisionId: studioEntityIdSchema.optional(),
    resolvedBy: studioEntityIdSchema.optional(),
  })
  .strict()
  .superRefine((comment, context) => {
    if (new Set(comment.assigneeIds).size !== comment.assigneeIds.length) {
      context.addIssue({ code: "custom", path: ["assigneeIds"], message: "assignees must be unique" });
    }
    const resolved = comment.status === "resolved" || comment.status === "dismissed";
    if (resolved && (comment.resolutionRevisionId === undefined || comment.resolvedBy === undefined)) {
      context.addIssue({ code: "custom", path: ["resolutionRevisionId"], message: "closed comments require resolver and revision" });
    }
    if (!resolved && (comment.resolutionRevisionId !== undefined || comment.resolvedBy !== undefined)) {
      context.addIssue({ code: "custom", path: ["resolutionRevisionId"], message: "open comments cannot carry resolution fields" });
    }
  });

export const reviewStatusSchema = z.enum(["open", "changes-requested", "approved", "rejected", "cancelled"]);

export interface ReviewSnapshotRecord {
  readonly id: ReviewId;
  readonly artifactId: ArtifactId;
  readonly revisionId: RevisionId;
  readonly requestedBy: UserId;
  readonly reviewerIds: readonly UserId[];
  readonly status: z.infer<typeof reviewStatusSchema>;
  readonly title: string;
  readonly createdAt: string;
  readonly decidedAt?: string;
  readonly decidedBy?: UserId;
}

export const reviewSnapshotRecordSchema = z
  .object({
    id: studioEntityIdSchema,
    artifactId: studioEntityIdSchema,
    revisionId: studioEntityIdSchema,
    requestedBy: studioEntityIdSchema,
    reviewerIds: z.array(studioEntityIdSchema).min(1).max(64),
    status: reviewStatusSchema,
    title: z.string().trim().min(1).max(240),
    createdAt: isoTimestampSchema,
    decidedAt: isoTimestampSchema.optional(),
    decidedBy: studioEntityIdSchema.optional(),
  })
  .strict()
  .superRefine((review, context) => {
    if (new Set(review.reviewerIds).size !== review.reviewerIds.length) {
      context.addIssue({ code: "custom", path: ["reviewerIds"], message: "reviewers must be unique" });
    }
    const decided = review.status === "approved" || review.status === "rejected" || review.status === "cancelled";
    if (decided && (review.decidedAt === undefined || review.decidedBy === undefined)) {
      context.addIssue({ code: "custom", path: ["decidedAt"], message: "decided review requires actor and timestamp" });
    }
    if (!decided && (review.decidedAt !== undefined || review.decidedBy !== undefined)) {
      context.addIssue({ code: "custom", path: ["decidedAt"], message: "open review cannot carry decision fields" });
    }
  });
