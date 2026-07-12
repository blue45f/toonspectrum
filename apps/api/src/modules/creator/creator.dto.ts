import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const CreatorReferenceIdSchema = z.string().trim().min(1).max(160).nullable();
const CreatorWorkRevisionSchema = z.number().int().min(1).max(2_147_483_647);
const CreatorCollaborationUserIdSchema = z.string().trim().min(1).max(160);
const CreatorCollaborationRoleSchema = z.enum(["admin", "editor", "commenter", "viewer"]);
const CreatorCollaborationViewerRoleSchema = z.enum([
  "owner",
  "admin",
  "editor",
  "commenter",
  "viewer",
]);
const CreatorCollaborationInvitationIdSchema = z.string().uuid();
const CreatorIsoDateTimeSchema = z.iso.datetime({ offset: true });
const CreatorSharedWorksCursorSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/);

const CreatorWorkMutableFieldsSchema = z.object({
  title: z.string().max(120),
  description: z.string().max(2_000),
  tags: z.array(z.string().max(24)).max(8),
  format: z.enum(["cuttoon", "upload"]),
  titleId: CreatorReferenceIdSchema,
  cover: z.string(),
  pages: z.array(z.string()).max(200),
  doc: z.record(z.string(), z.unknown()),
  status: z.enum(["draft", "published"]),
  seriesId: CreatorReferenceIdSchema,
  challengeId: CreatorReferenceIdSchema,
  remixFromId: CreatorReferenceIdSchema,
});

export const CreateCreatorWorkSchema = CreatorWorkMutableFieldsSchema.partial()
  .extend({ title: CreatorWorkMutableFieldsSchema.shape.title })
  .strict();

const updateFields = CreatorWorkMutableFieldsSchema.omit({ remixFromId: true }).partial();
const updateFieldNames = Object.keys(updateFields.shape);

export const UpdateCreatorWorkSchema = updateFields
  .extend({ baseRevision: CreatorWorkRevisionSchema.optional() })
  .strict()
  .superRefine((value, context) => {
    if (!updateFieldNames.some((field) => Object.hasOwn(value, field))) {
      context.addIssue({
        code: "custom",
        message: "수정할 작품 필드를 하나 이상 보내 주세요.",
      });
    }
  });

const CreatorSharedDocumentMutableFieldsSchema = CreatorWorkMutableFieldsSchema.omit({
  seriesId: true,
  challengeId: true,
  remixFromId: true,
  format: true,
}).extend({
  // 공동 편집 저장은 creator.ts의 clamp/빈 제목 검증을 우회하므로 DTO 경계에서 같은 불변식을 지킨다.
  title: z.string().trim().min(1).max(120),
});
const creatorSharedDocumentFieldNames = Object.keys(
  CreatorSharedDocumentMutableFieldsSchema.shape
);

/**
 * 공동 편집자는 작품 콘텐츠만 저장한다. 시리즈/챌린지 연결과 리믹스 원본은 소유자 전용
 * 기존 플로우에 남겨, 다른 사용자의 연재 관계를 우회 변경하지 못하게 한다.
 */
export const UpdateCreatorSharedDocumentSchema = CreatorSharedDocumentMutableFieldsSchema.partial()
  .extend({ baseRevision: CreatorWorkRevisionSchema })
  .strict()
  .superRefine((value, context) => {
    if (!creatorSharedDocumentFieldNames.some((field) => Object.hasOwn(value, field))) {
      context.addIssue({
        code: "custom",
        message: "저장할 공동 문서 필드를 하나 이상 보내 주세요.",
      });
    }
  });

export const CreatorSharedWorkCapabilitiesSchema = z
  .object({
    view: z.boolean(),
    comment: z.boolean(),
    edit: z.boolean(),
    manageMembers: z.boolean(),
  })
  .strict();

export const CreatorSharedWorkSchema = z
  .object({
    workId: CreatorCollaborationUserIdSchema,
    title: z.string().max(120),
    format: z.enum(["cuttoon", "upload"]),
    role: CreatorCollaborationViewerRoleSchema,
    status: z.literal("active"),
    capabilities: CreatorSharedWorkCapabilitiesSchema,
    owner: z.object({ name: z.string().min(1) }).strict(),
    updatedAt: CreatorIsoDateTimeSchema,
  })
  .strict();

export const CreatorSharedWorksResponseSchema = z
  .object({
    items: z.array(CreatorSharedWorkSchema).max(50),
    nextCursor: CreatorSharedWorksCursorSchema.nullable(),
  })
  .strict();

export const CreatorSharedDocumentContentSchema = CreatorWorkMutableFieldsSchema.extend({
  episodeNo: z.number().int().min(1).nullable(),
}).strict();

export const CreatorSharedDocumentResponseSchema = z
  .object({
    workId: CreatorCollaborationUserIdSchema,
    role: CreatorCollaborationViewerRoleSchema,
    status: z.literal("active"),
    capabilities: z.object({ view: z.literal(true), edit: z.boolean() }).strict(),
    revision: CreatorWorkRevisionSchema,
    updatedAt: CreatorIsoDateTimeSchema,
    document: CreatorSharedDocumentContentSchema,
  })
  .strict();

export const CreatorSharedDocumentMetaResponseSchema = CreatorSharedDocumentResponseSchema.omit({
  document: true,
}).strict();

export const CreatorSharedDocumentSaveResponseSchema = z
  .object({
    workId: CreatorCollaborationUserIdSchema,
    revision: CreatorWorkRevisionSchema,
    updatedAt: CreatorIsoDateTimeSchema,
  })
  .strict();

export const CreatorWorkRevisionParamsSchema = z
  .object({
    id: z.string().trim().min(1).max(160),
    revision: z.coerce.number().int().min(1).max(2_147_483_647),
  })
  .strict();

export const CreatorWorkRevisionListParamsSchema = z
  .object({ id: z.string().trim().min(1).max(160) })
  .strict();

export const CreatorWorkRevisionListQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(20).default(20) })
  .strict();

export const CreatorTeamListQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(50).default(20) })
  .strict();

export const CreatorSharedWorksListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: CreatorSharedWorksCursorSchema.optional(),
  })
  .strict();

export const RestoreCreatorWorkRevisionSchema = z
  .object({ baseRevision: CreatorWorkRevisionSchema })
  .strict();

export const CreatorTeamWorkParamsSchema = z
  .object({ id: CreatorCollaborationUserIdSchema })
  .strict();

export const CreatorTeamMemberParamsSchema = CreatorTeamWorkParamsSchema.extend({
  userId: CreatorCollaborationUserIdSchema,
}).strict();

export const InviteCreatorTeamMemberSchema = z
  .object({
    userId: CreatorCollaborationUserIdSchema,
    role: CreatorCollaborationRoleSchema,
  })
  .strict();

export const UpdateCreatorTeamMemberSchema = InviteCreatorTeamMemberSchema.pick({ role: true }).strict();

export const RespondCreatorTeamInvitationSchema = z
  .object({
    action: z.enum(["accept", "decline"]),
    invitationId: CreatorCollaborationInvitationIdSchema,
  })
  .strict();

export class CreateCreatorWorkDto extends createZodDto(CreateCreatorWorkSchema) {}
export class UpdateCreatorWorkDto extends createZodDto(UpdateCreatorWorkSchema) {}
export class UpdateCreatorSharedDocumentDto extends createZodDto(UpdateCreatorSharedDocumentSchema) {}
export class CreatorWorkRevisionParamsDto extends createZodDto(CreatorWorkRevisionParamsSchema) {}
export class CreatorWorkRevisionListParamsDto extends createZodDto(CreatorWorkRevisionListParamsSchema) {}
export class CreatorWorkRevisionListQueryDto extends createZodDto(CreatorWorkRevisionListQuerySchema) {}
export class CreatorTeamListQueryDto extends createZodDto(CreatorTeamListQuerySchema) {}
export class CreatorSharedWorksListQueryDto extends createZodDto(CreatorSharedWorksListQuerySchema) {}
export class RestoreCreatorWorkRevisionDto extends createZodDto(RestoreCreatorWorkRevisionSchema) {}
export class CreatorTeamWorkParamsDto extends createZodDto(CreatorTeamWorkParamsSchema) {}
export class CreatorTeamMemberParamsDto extends createZodDto(CreatorTeamMemberParamsSchema) {}
export class InviteCreatorTeamMemberDto extends createZodDto(InviteCreatorTeamMemberSchema) {}
export class UpdateCreatorTeamMemberDto extends createZodDto(UpdateCreatorTeamMemberSchema) {}
export class RespondCreatorTeamInvitationDto extends createZodDto(RespondCreatorTeamInvitationSchema) {}
