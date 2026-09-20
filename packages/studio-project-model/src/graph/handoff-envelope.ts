import { z } from "zod";

import { studioReviewCompletionTaskIdSchema, studioReviewTaskCompletionReceiptSchema } from "./review-task-completion";
import { studioReviewTaskReferenceSchema } from "./review-task-reference";

const identity = studioReviewTaskReferenceSchema.shape.commentId;
const opaque = studioReviewCompletionTaskIdSchema;
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const at = z.iso.datetime({ offset: true });
const text = z.string().trim().max(4_000);
const recipient = z.object({ userId: identity, roleAssignmentId: opaque }).strict();
export const studioHandoffRecipientChoiceSchema = recipient.extend({ displayName: z.string().max(240), roleLabel: z.string().max(240), bindingDigest: digest }).strict();
export const studioHandoffEnvelopePrepareSchema = z.object({
  workId: identity, taskId: opaque, taskTitle: z.string().max(240), baseRevision: z.number().int().min(0),
  completionFingerprint: digest, recipients: z.array(studioHandoffRecipientChoiceSchema).max(1000),
}).strict();
export const studioHandoffEnvelopeCreateSchema = z.object({
  envelopeId: identity, taskId: opaque, baseRevision: z.number().int().min(0), completionFingerprint: digest,
  recipient, recipientBindingDigest: digest, usageConditions: text.min(1), remainingNotes: text,
}).strict();
export const studioHandoffEnvelopeSchema = z.object({
  contract: z.literal("studio-handoff-envelope-v1"), id: identity, workId: identity, taskId: opaque, taskTitle: z.string().max(240),
  senderUserId: identity, recipient, createdAt: at,
  completion: studioReviewTaskCompletionReceiptSchema,
  brief: z.object({ id: opaque, fromRole: z.string().max(80), toRole: z.string().max(80), scenePurpose: text,
    emotionalBeat: text, mustShow: z.array(z.string().max(600)).max(128), continuityNotes: z.array(z.string().max(600)).max(128),
    lockedFields: z.array(z.string().max(80)).max(6), acceptanceCriteria: z.array(z.string().max(600)).min(1).max(128) }).strict(),
  remainingIssues: z.array(z.object({ commentId: identity, reviewId: identity, revisionId: identity,
    body: z.string().max(20_000), severity: z.enum(["required", "recommended", "note"]), status: z.enum(["open", "reopened"]), updatedAt: at }).strict()),
  usageConditions: text.min(1), remainingNotes: text,
}).strict().superRefine((value, context) => {
  if (value.senderUserId === value.recipient.userId || value.completion.workId !== value.workId
    || value.completion.taskId !== value.taskId || value.completion.reference.handoffId !== value.brief.id
    || JSON.stringify(value.completion.criteria) !== JSON.stringify(value.brief.acceptanceCriteria)) {
    context.addIssue({ code: "custom", message: "Envelope identity and completion evidence must agree." });
  }
  const pins = [value.completion.reference.subject, value.completion.replacement];
  if (value.remainingIssues.some((issue) => !pins.some((pin) => pin.reviewId === issue.reviewId && pin.revisionId === issue.revisionId))
    || new Set(value.remainingIssues.map((issue) => issue.commentId)).size !== value.remainingIssues.length) {
    context.addIssue({ code: "custom", message: "Remaining issues must belong to the exact pinned reviews." });
  }
});
export const studioHandoffEnvelopeActionSchema = z.object({ requestId: identity, envelopeDigest: digest }).strict();
export const studioHandoffEnvelopeAcceptSchema = studioHandoffEnvelopeActionSchema.extend({ confirmed: z.literal(true) }).strict();
const evidence = z.object({ actorUserId: identity, at, requestId: identity }).strict();
export const studioHandoffEnvelopeViewSchema = z.object({
  envelope: studioHandoffEnvelopeSchema, envelopeDigest: digest,
  status: z.enum(["delivered", "read", "accepted", "cancelled", "changed"]),
  opened: evidence.nullable(), accepted: evidence.nullable(), cancelled: evidence.nullable(),
  canAccept: z.boolean(), canCancel: z.boolean(),
}).strict();
export const studioHandoffEnvelopeSummarySchema = z.object({ id: identity, taskTitle: z.string().max(240),
  direction: z.enum(["sent", "received"]), createdAt: at, status: studioHandoffEnvelopeViewSchema.shape.status }).strict();
export const studioHandoffEnvelopeListSchema = z.object({ items: z.array(studioHandoffEnvelopeSummarySchema), nextCursor: z.string().nullable() }).strict();
export type StudioHandoffEnvelope = z.infer<typeof studioHandoffEnvelopeSchema>;
export type StudioHandoffEnvelopePrepare = z.infer<typeof studioHandoffEnvelopePrepareSchema>;
export type StudioHandoffEnvelopeCreate = z.infer<typeof studioHandoffEnvelopeCreateSchema>;
export type StudioHandoffEnvelopeView = z.infer<typeof studioHandoffEnvelopeViewSchema>;
export type StudioHandoffEnvelopeAction = z.infer<typeof studioHandoffEnvelopeActionSchema>;
export type StudioHandoffEnvelopeList = z.infer<typeof studioHandoffEnvelopeListSchema>;
