import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const CreatorReferenceIdSchema = z.string().trim().min(1).max(160).nullable();
const CreatorWorkRevisionSchema = z.number().int().min(1).max(2_147_483_647);
const CreatorCollaborationUserIdSchema = z.string().trim().min(1).max(160);
const CreatorCollaborationRoleSchema = z.enum(["admin", "editor", "commenter", "viewer"]);
const CreatorCollaborationInvitationIdSchema = z.string().uuid();

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
export class CreatorWorkRevisionParamsDto extends createZodDto(CreatorWorkRevisionParamsSchema) {}
export class CreatorWorkRevisionListParamsDto extends createZodDto(CreatorWorkRevisionListParamsSchema) {}
export class CreatorWorkRevisionListQueryDto extends createZodDto(CreatorWorkRevisionListQuerySchema) {}
export class RestoreCreatorWorkRevisionDto extends createZodDto(RestoreCreatorWorkRevisionSchema) {}
export class CreatorTeamWorkParamsDto extends createZodDto(CreatorTeamWorkParamsSchema) {}
export class CreatorTeamMemberParamsDto extends createZodDto(CreatorTeamMemberParamsSchema) {}
export class InviteCreatorTeamMemberDto extends createZodDto(InviteCreatorTeamMemberSchema) {}
export class UpdateCreatorTeamMemberDto extends createZodDto(UpdateCreatorTeamMemberSchema) {}
export class RespondCreatorTeamInvitationDto extends createZodDto(RespondCreatorTeamInvitationSchema) {}
