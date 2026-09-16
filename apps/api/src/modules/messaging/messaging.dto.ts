import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const MessagingIdSchema = z.string().trim().min(1).max(160);
const MessagingDateTimeSchema = z.iso.datetime({ offset: true });

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint === 0x0a) return false;
    return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159) || codePoint === 0x200b;
  });
}

function normalizedTextSchema(max: number) {
  return z
    .string()
    .max(max + 200)
    .transform((value) => value.replace(/\r\n?/gu, "\n").trim())
    .pipe(
      z.string().min(1).max(max).refine((value) => !hasControlCharacter(value), {
        message: "메시지에 제어 문자를 사용할 수 없습니다.",
      })
    );
}

export const MessagingThreadStateSchema = z.enum(["pending", "active", "declined", "closed"]);
export const MessagingRequestCategorySchema = z.enum(["feedback", "collaboration", "business", "general"]);
export const MessagingContextTypeSchema = z.enum(["profile", "work", "project", "general"]);
export const MessagingReceiveFromSchema = z.enum(["everyone", "followers", "mutuals", "nobody"]);
export const MessagingReportReasonSchema = z.enum([
  "harassment",
  "spam",
  "scam",
  "sexual",
  "threat",
  "copyright",
  "other",
]);

export const MessagingContextSchema = z
  .object({
    type: MessagingContextTypeSchema,
    id: MessagingIdSchema.nullable(),
    label: z.string().max(160),
    href: z.string().max(500).nullable(),
  })
  .strict();

export const MessagingUserSchema = z
  .object({
    id: MessagingIdSchema,
    name: z.string().min(1).max(160),
    image: z.string().max(2_000).nullable(),
    avatar: z.string().max(200).nullable(),
  })
  .strict();

export const MessagingMessageSchema = z
  .object({
    id: MessagingIdSchema,
    threadId: MessagingIdSchema,
    senderId: MessagingIdSchema.nullable(),
    type: z.enum(["text", "work_card", "project_card", "system"]),
    body: z.string().min(1).max(2_000),
    metadata: z.record(z.string(), z.unknown()),
    createdAt: MessagingDateTimeSchema,
    deletedAt: MessagingDateTimeSchema.nullable(),
    mine: z.boolean(),
    readByOther: z.boolean(),
  })
  .strict();

export const MessagingThreadSummarySchema = z
  .object({
    id: MessagingIdSchema,
    state: MessagingThreadStateSchema,
    category: MessagingRequestCategorySchema,
    context: MessagingContextSchema,
    otherUser: MessagingUserSchema,
    createdByMe: z.boolean(),
    incomingRequest: z.boolean(),
    canReply: z.boolean(),
    blocked: z.boolean(),
    archivedAt: MessagingDateTimeSchema.nullable(),
    mutedUntil: MessagingDateTimeSchema.nullable(),
    unreadCount: z.number().int().min(0),
    lastMessage: MessagingMessageSchema.pick({
      id: true,
      senderId: true,
      type: true,
      body: true,
      createdAt: true,
      deletedAt: true,
    }).nullable(),
    createdAt: MessagingDateTimeSchema,
    updatedAt: MessagingDateTimeSchema,
    lastMessageAt: MessagingDateTimeSchema,
  })
  .strict();

export const MessagingThreadDetailSchema = z
  .object({
    thread: MessagingThreadSummarySchema,
    messages: z.array(MessagingMessageSchema).max(101),
    nextBefore: MessagingIdSchema.nullable(),
  })
  .strict();

export const MessagingPreferencesSchema = z
  .object({
    receiveFrom: MessagingReceiveFromSchema,
    emailNotification: z.boolean(),
    readReceipt: z.boolean(),
    updatedAt: MessagingDateTimeSchema.nullable(),
  })
  .strict();

export const MessagingBlockedUserSchema = z
  .object({
    user: MessagingUserSchema,
    blockedAt: MessagingDateTimeSchema,
  })
  .strict();

export const CreateMessageRequestSchema = z
  .object({
    recipientId: MessagingIdSchema,
    category: MessagingRequestCategorySchema.default("general"),
    text: normalizedTextSchema(300),
    contextType: MessagingContextTypeSchema.default("profile"),
    contextId: MessagingIdSchema.optional(),
    contextLabel: z.string().trim().max(160).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.contextType === "work" || value.contextType === "project") && !value.contextId) {
      context.addIssue({
        code: "custom",
        path: ["contextId"],
        message: "작품 또는 프로젝트 식별자가 필요합니다.",
      });
    }
    if (/\b(?:https?:\/\/|www\.)/iu.test(value.text)) {
      context.addIssue({
        code: "custom",
        path: ["text"],
        message: "첫 메시지에는 외부 링크를 넣을 수 없습니다.",
      });
    }
  });

export const SendMessageSchema = z
  .object({
    text: normalizedTextSchema(2_000),
    type: z.enum(["text", "work_card", "project_card"]).default("text"),
    contextId: MessagingIdSchema.optional(),
    contextLabel: z.string().trim().max(160).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.type !== "text" && !value.contextId) {
      context.addIssue({
        code: "custom",
        path: ["contextId"],
        message: "카드 메시지에는 연결할 항목이 필요합니다.",
      });
    }
  });

export const ListMessagingThreadsQuerySchema = z
  .object({
    tab: z.enum(["active", "requests", "archived", "all"]).default("active"),
    limit: z.coerce.number().int().min(1).max(50).default(30),
  })
  .strict();

export const GetMessagingThreadQuerySchema = z
  .object({
    before: MessagingIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const MarkMessageReadSchema = z
  .object({ messageId: MessagingIdSchema.optional() })
  .strict();

export const ArchiveMessageThreadSchema = z
  .object({ archived: z.boolean().default(true) })
  .strict();

export const MuteMessageThreadSchema = z
  .object({
    until: z.union([MessagingDateTimeSchema, z.null()]),
  })
  .strict();

export const UpdateMessagingPreferencesSchema = z
  .object({
    receiveFrom: MessagingReceiveFromSchema.optional(),
    emailNotification: z.boolean().optional(),
    readReceipt: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "변경할 설정이 없습니다.");

export const ReportMessageSchema = z
  .object({
    reason: MessagingReportReasonSchema,
    details: z.string().trim().max(1_000).default(""),
  })
  .strict();

export const MessagingIdParamsSchema = z.object({ id: MessagingIdSchema }).strict();
export const MessagingThreadParamsSchema = z.object({ threadId: MessagingIdSchema }).strict();
export const MessagingMessageParamsSchema = z.object({ messageId: MessagingIdSchema }).strict();
export const MessagingUserParamsSchema = z.object({ userId: MessagingIdSchema }).strict();

export class CreateMessageRequestDto extends createZodDto(CreateMessageRequestSchema) {}
export class SendMessageDto extends createZodDto(SendMessageSchema) {}
export class ListMessagingThreadsQueryDto extends createZodDto(ListMessagingThreadsQuerySchema) {}
export class GetMessagingThreadQueryDto extends createZodDto(GetMessagingThreadQuerySchema) {}
export class MarkMessageReadDto extends createZodDto(MarkMessageReadSchema) {}
export class ArchiveMessageThreadDto extends createZodDto(ArchiveMessageThreadSchema) {}
export class MuteMessageThreadDto extends createZodDto(MuteMessageThreadSchema) {}
export class UpdateMessagingPreferencesDto extends createZodDto(UpdateMessagingPreferencesSchema) {}
export class ReportMessageDto extends createZodDto(ReportMessageSchema) {}
export class MessagingThreadParamsDto extends createZodDto(MessagingThreadParamsSchema) {}
export class MessagingMessageParamsDto extends createZodDto(MessagingMessageParamsSchema) {}
export class MessagingUserParamsDto extends createZodDto(MessagingUserParamsSchema) {}

export type MessagingThreadState = z.infer<typeof MessagingThreadStateSchema>;
export type MessagingRequestCategory = z.infer<typeof MessagingRequestCategorySchema>;
export type MessagingContextType = z.infer<typeof MessagingContextTypeSchema>;
export type MessagingReceiveFrom = z.infer<typeof MessagingReceiveFromSchema>;
export type MessagingContext = z.infer<typeof MessagingContextSchema>;
export type MessagingUser = z.infer<typeof MessagingUserSchema>;
export type MessagingMessage = z.infer<typeof MessagingMessageSchema>;
export type MessagingThreadSummary = z.infer<typeof MessagingThreadSummarySchema>;
export type MessagingThreadDetail = z.infer<typeof MessagingThreadDetailSchema>;
export type MessagingPreferences = z.infer<typeof MessagingPreferencesSchema>;
export type MessagingBlockedUser = z.infer<typeof MessagingBlockedUserSchema>;
export type CreateMessageRequestInput = z.infer<typeof CreateMessageRequestSchema>;
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
export type ListMessagingThreadsQuery = z.infer<typeof ListMessagingThreadsQuerySchema>;
export type GetMessagingThreadQuery = z.infer<typeof GetMessagingThreadQuerySchema>;
export type UpdateMessagingPreferencesInput = z.infer<typeof UpdateMessagingPreferencesSchema>;
export type ReportMessageInput = z.infer<typeof ReportMessageSchema>;
