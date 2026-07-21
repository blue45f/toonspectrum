import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const StudioTeamCommentOpaqueIdSchema = z
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

const StudioTeamCommentWorkIdSchema = z.string().trim().min(1).max(160);
export const StudioTeamCommentMutationIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine(
    (value) => ![...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159);
    }),
    "요청 식별자에 제어 문자를 사용할 수 없습니다."
  );
const StudioTeamCommentAnchorIdSchema = z
  .string()
  .max(120)
  .trim()
  .min(1)
  .refine(
    (value) => ![...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159);
    }),
    "식별자에 제어 문자를 사용할 수 없습니다."
  );
const StudioTeamCommentBodySchema = z
  .string()
  .max(4_000)
  .transform((value) => value.trim())
  .pipe(z.string().min(1).max(4_000));
const StudioTeamCommentSequenceSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,18})$/u)
  .refine((value) => BigInt(value) <= BigInt("9223372036854775807"), {
    message: "댓글 activity sequence가 PostgreSQL bigint 범위를 벗어났습니다.",
  });
export const StudioTeamCommentExpectedActivitySequenceSchema =
  StudioTeamCommentSequenceSchema.refine((value) => BigInt(value) > BigInt(0), {
    message: "댓글의 예상 activity sequence는 1 이상이어야 합니다.",
  });
const StudioTeamCommentCursorSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/u);
const StudioTeamCommentDateTimeSchema = z.iso.datetime({ offset: true });

/**
 * Semantic canvas anchor shared with the Studio document model.
 *
 * Page/frame/element anchors follow the target as the document is rearranged. Free pins use
 * normalized page coordinates so they remain stable across viewport zoom and canvas resizing.
 */
export const StudioTeamCommentAnchorSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("page"),
      pageId: StudioTeamCommentAnchorIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("frame"),
      pageId: StudioTeamCommentAnchorIdSchema,
      frameId: StudioTeamCommentAnchorIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("element"),
      pageId: StudioTeamCommentAnchorIdSchema,
      frameId: StudioTeamCommentAnchorIdSchema.optional(),
      elementId: StudioTeamCommentAnchorIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("point"),
      pageId: StudioTeamCommentAnchorIdSchema,
      x: z.number().finite().min(0).max(1),
      y: z.number().finite().min(0).max(1),
    })
    .strict(),
]);

export const StudioTeamCommentWorkParamsSchema = z
  .object({ id: StudioTeamCommentWorkIdSchema })
  .strict();

export const StudioTeamCommentThreadParamsSchema = StudioTeamCommentWorkParamsSchema.extend({
  threadId: StudioTeamCommentOpaqueIdSchema,
}).strict();

export const ListStudioTeamCommentsQuerySchema = z
  .object({
    status: z.enum(["all", "open", "resolved"]).default("all"),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    messageLimit: z.coerce.number().int().min(1).max(51).default(20),
    cursor: StudioTeamCommentCursorSchema.optional(),
  })
  .strict()
  .superRefine((query, context) => {
    if (query.limit * query.messageLimit > 500) {
      context.addIssue({
        code: "custom",
        message: "한 번에 조회할 댓글 메시지는 최대 500개입니다.",
        path: ["messageLimit"],
      });
    }
  });

export const GetStudioTeamCommentThreadQuerySchema = z
  .object({
    messageLimit: z.coerce.number().int().min(1).max(51).default(51),
  })
  .strict();

export const CreateStudioTeamCommentThreadSchema = z
  .object({
    // Optional during the rolling-deploy window: new clients send Idempotency-Key while cached
    // clients keep the legacy body. The service supplies a server key when neither is present.
    mutationId: StudioTeamCommentMutationIdSchema.optional(),
    anchor: StudioTeamCommentAnchorSchema,
    body: StudioTeamCommentBodySchema,
  })
  .strict();

export const AddStudioTeamCommentReplySchema = CreateStudioTeamCommentThreadSchema
  .pick({ mutationId: true, body: true })
  .strict();

export const ReanchorStudioTeamCommentThreadSchema = z
  .object({
    // Header/body reconciliation happens in the controller. Unlike the rolling create/reply
    // endpoints, a re-anchor command must have one retry key before it reaches the service.
    mutationId: StudioTeamCommentMutationIdSchema.optional(),
    anchor: StudioTeamCommentAnchorSchema,
    expectedActivitySequence: StudioTeamCommentExpectedActivitySequenceSchema,
  })
  .strict();

export const ReanchorStudioTeamCommentCommandSchema =
  ReanchorStudioTeamCommentThreadSchema.extend({
    mutationId: StudioTeamCommentMutationIdSchema,
  }).strict();

export const StudioTeamCommentUserSchema = z
  .object({
    userId: StudioTeamCommentOpaqueIdSchema.nullable(),
    name: z.string().trim().min(1).max(160),
  })
  .strict();

export const StudioTeamCommentMessageSchema = z
  .object({
    id: StudioTeamCommentOpaqueIdSchema,
    author: StudioTeamCommentUserSchema,
    body: z.string().min(1).max(4_000),
    createdAt: StudioTeamCommentDateTimeSchema,
  })
  .strict();

export const StudioTeamCommentThreadSchema = z
  .object({
    id: StudioTeamCommentOpaqueIdSchema,
    workId: StudioTeamCommentWorkIdSchema,
    anchor: StudioTeamCommentAnchorSchema,
    status: z.enum(["open", "resolved"]),
    createdBy: StudioTeamCommentUserSchema,
    resolvedBy: StudioTeamCommentUserSchema.nullable(),
    resolvedAt: StudioTeamCommentDateTimeSchema.nullable(),
    createdAt: StudioTeamCommentDateTimeSchema,
    updatedAt: StudioTeamCommentDateTimeSchema,
    latestActivitySequence: StudioTeamCommentSequenceSchema,
    unread: z.boolean(),
    messageCount: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    messages: z.array(StudioTeamCommentMessageSchema).max(51),
    messagesTruncated: z.boolean(),
  })
  .strict()
  .superRefine((thread, context) => {
    const resolved = thread.status === "resolved";
    if (resolved !== (thread.resolvedAt !== null)) {
      context.addIssue({
        code: "custom",
        message: "댓글 해결 상태와 해결 시각이 일치해야 합니다.",
        path: ["resolvedAt"],
      });
    }
    if (!resolved && thread.resolvedBy !== null) {
      context.addIssue({
        code: "custom",
        message: "열린 댓글에는 해결자가 없어야 합니다.",
        path: ["resolvedBy"],
      });
    }
    if (Date.parse(thread.updatedAt) < Date.parse(thread.createdAt)) {
      context.addIssue({
        code: "custom",
        message: "댓글 수정 시각은 생성 시각보다 빠를 수 없습니다.",
        path: ["updatedAt"],
      });
    }
    if (thread.messageCount < thread.messages.length) {
      context.addIssue({
        code: "custom",
        message: "전체 메시지 수가 반환된 메시지 수보다 작을 수 없습니다.",
        path: ["messageCount"],
      });
    }
    if (thread.messagesTruncated !== (thread.messageCount > thread.messages.length)) {
      context.addIssue({
        code: "custom",
        message: "댓글 메시지 잘림 상태가 실제 반환 범위와 일치해야 합니다.",
        path: ["messagesTruncated"],
      });
    }
  });

export const StudioTeamCommentCapabilitiesSchema = z
  .object({
    view: z.literal(true),
    comment: z.boolean(),
    resolve: z.boolean(),
    // Optional only for a rolling deployment with an older API. New repository responses always
    // include it. `true` means the actor may move any thread; authors may still move their own.
    reanchor: z.boolean().optional(),
  })
  .strict();

export const ListStudioTeamCommentsResponseSchema = z
  .object({
    workId: StudioTeamCommentWorkIdSchema,
    capabilities: StudioTeamCommentCapabilitiesSchema,
    items: z.array(StudioTeamCommentThreadSchema).max(50),
    nextCursor: StudioTeamCommentCursorSchema.nullable(),
  })
  .strict();

export const AddStudioTeamCommentReplyResponseSchema = z
  .object({
    threadId: StudioTeamCommentOpaqueIdSchema,
    message: StudioTeamCommentMessageSchema,
    latestActivitySequence: StudioTeamCommentSequenceSchema,
  })
  .strict();

export const TransitionStudioTeamCommentResponseSchema = z
  .object({
    threadId: StudioTeamCommentOpaqueIdSchema,
    status: z.enum(["open", "resolved"]),
    resolvedBy: StudioTeamCommentUserSchema.nullable(),
    resolvedAt: StudioTeamCommentDateTimeSchema.nullable(),
    updatedAt: StudioTeamCommentDateTimeSchema,
    latestActivitySequence: StudioTeamCommentSequenceSchema,
  })
  .strict();

export const ReanchorStudioTeamCommentResponseSchema = z
  .object({
    threadId: StudioTeamCommentOpaqueIdSchema,
    anchor: StudioTeamCommentAnchorSchema,
    updatedAt: StudioTeamCommentDateTimeSchema,
    latestActivitySequence: StudioTeamCommentExpectedActivitySequenceSchema,
  })
  .strict();

export const ReadStudioTeamCommentResponseSchema = z
  .object({
    threadId: StudioTeamCommentOpaqueIdSchema,
    lastReadActivitySequence: StudioTeamCommentSequenceSchema,
    readAt: StudioTeamCommentDateTimeSchema,
  })
  .strict();

export const ReadAllStudioTeamCommentsResponseSchema = z
  .object({
    workId: StudioTeamCommentWorkIdSchema,
    readCount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    readAt: StudioTeamCommentDateTimeSchema,
  })
  .strict();

export class StudioTeamCommentWorkParamsDto extends createZodDto(
  StudioTeamCommentWorkParamsSchema
) {}
export class StudioTeamCommentThreadParamsDto extends createZodDto(
  StudioTeamCommentThreadParamsSchema
) {}
export class ListStudioTeamCommentsQueryDto extends createZodDto(
  ListStudioTeamCommentsQuerySchema
) {}
export class GetStudioTeamCommentThreadQueryDto extends createZodDto(
  GetStudioTeamCommentThreadQuerySchema
) {}
export class CreateStudioTeamCommentThreadDto extends createZodDto(
  CreateStudioTeamCommentThreadSchema
) {}
export class AddStudioTeamCommentReplyDto extends createZodDto(
  AddStudioTeamCommentReplySchema
) {}
export class ReanchorStudioTeamCommentThreadDto extends createZodDto(
  ReanchorStudioTeamCommentThreadSchema
) {}

export type StudioTeamCommentAnchor = z.infer<typeof StudioTeamCommentAnchorSchema>;
export type StudioTeamCommentMessage = z.infer<typeof StudioTeamCommentMessageSchema>;
export type StudioTeamCommentThread = z.infer<typeof StudioTeamCommentThreadSchema>;
export type StudioTeamCommentListResponse = z.infer<
  typeof ListStudioTeamCommentsResponseSchema
>;
export type StudioTeamCommentReplyResponse = z.infer<
  typeof AddStudioTeamCommentReplyResponseSchema
>;
export type StudioTeamCommentTransitionResponse = z.infer<
  typeof TransitionStudioTeamCommentResponseSchema
>;
export type ReanchorStudioTeamCommentCommand = z.infer<
  typeof ReanchorStudioTeamCommentCommandSchema
>;
export type StudioTeamCommentReanchorResponse = z.infer<
  typeof ReanchorStudioTeamCommentResponseSchema
>;
export type StudioTeamCommentReadResponse = z.infer<
  typeof ReadStudioTeamCommentResponseSchema
>;
export type StudioTeamCommentReadAllResponse = z.infer<
  typeof ReadAllStudioTeamCommentsResponseSchema
>;
