import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import {
  CREATOR_COLLABORATION_STATUSES,
  CREATOR_ROLE_IDS,
  CREATOR_SPECIALTY_IDS,
} from "../../../../web/src/shared/lib/creator-role-contract";
import {
  CREATOR_DETAILED_ROLE_LENSES,
  CREATOR_ROLE_NOTIFICATION_EVENTS,
  CREATOR_ROLE_NOTIFICATION_PRESETS,
  CREATOR_ROLE_USAGE_GOALS,
  CREATOR_ROLE_WORKSPACE_PRESETS,
  CREATOR_WORKSPACE_MODES,
  isCreatorRoleProjectKey,
} from "../../../../web/src/shared/lib/creator-role-workspace-contract";

const CreatorRoleIdSchema = z.enum(CREATOR_ROLE_IDS);
const CreatorSpecialtyIdSchema = z.enum(CREATOR_SPECIALTY_IDS);
const CreatorCollaborationStatusSchema = z.enum(
  CREATOR_COLLABORATION_STATUSES,
);
const ProjectKeySchema = z
  .string()
  .min(1)
  .max(170)
  .refine(isCreatorRoleProjectKey, "지원하지 않는 프로젝트 범위입니다.");
const IdentitySchema = z
  .string()
  .min(1)
  .max(160)
  .refine((value) => value.trim() === value)
  .refine((value) => !value.includes("\\"));

const VisibilitySchema = z.object({
  roles: z.boolean(),
  specialties: z.boolean(),
  experienceLevel: z.boolean(),
  collaborationStatus: z.boolean(),
}).strict();

const CapacitySchema = z.object({
  weeklyCapacityHours: z.number().finite().min(0).max(168).nullable(),
  currentAssignedHours: z.number().finite().min(0).max(2_000),
  concurrentTaskLimit: z.number().int().min(1).max(100).nullable(),
  unavailableUntil: z.iso.datetime({ offset: true }).nullable(),
}).strict();

const NotificationOverridesSchema = z.partialRecord(
  z.enum(CREATOR_ROLE_NOTIFICATION_EVENTS),
  z.boolean(),
);

const ChecklistStatesSchema = z.record(
  z.string().trim().min(1).max(100),
  z.boolean(),
).superRefine((value, context) => {
  if (Object.keys(value).length > 96) {
    context.addIssue({
      code: "custom",
      message: "체크리스트 상태는 96개를 초과할 수 없습니다.",
    });
  }
});

export const CreatorRoleWorkspaceDocumentSchema = z.object({
  version: z.literal(1),
  activeRole: CreatorRoleIdSchema.nullable(),
  detailedLens: z.enum(CREATOR_DETAILED_ROLE_LENSES).nullable(),
  workspacePreset: z.enum(CREATOR_ROLE_WORKSPACE_PRESETS).nullable(),
  notificationPreset: z.enum(CREATOR_ROLE_NOTIFICATION_PRESETS),
  notificationOverrides: NotificationOverridesSchema,
  usageGoals: z.array(z.enum(CREATOR_ROLE_USAGE_GOALS))
    .max(CREATOR_ROLE_USAGE_GOALS.length)
    .refine((items) => new Set(items).size === items.length),
  workspaceMode: z.enum(CREATOR_WORKSPACE_MODES).default("creator"),
  capacity: CapacitySchema,
  visibility: VisibilitySchema,
  customRoleLabel: z.string().trim().min(1).max(48).nullable(),
  onboardingComplete: z.boolean(),
  checklistStates: ChecklistStatesSchema,
}).strict();

export const CreatorRoleWorkspaceParamsSchema = z.object({
  projectKey: ProjectKeySchema,
}).strict();

export const UpdateCreatorRoleWorkspaceSchema = z.object({
  baseRevision: z.number().int().min(0).max(2_147_483_647),
  document: CreatorRoleWorkspaceDocumentSchema,
}).strict();

export const BatchCreatorRoleProfilesSchema = z.object({
  userIds: z.array(IdentitySchema)
    .min(1)
    .max(100)
    .refine((items) => new Set(items).size === items.length),
}).strict();

export const CreatorRoleDirectoryQuerySchema = z.object({
  role: CreatorRoleIdSchema.optional(),
  specialty: CreatorSpecialtyIdSchema.optional(),
  collaborationStatus: CreatorCollaborationStatusSchema.optional(),
  q: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
}).strict();

export class CreatorRoleWorkspaceParamsDto extends createZodDto(
  CreatorRoleWorkspaceParamsSchema,
) {}
export class UpdateCreatorRoleWorkspaceDto extends createZodDto(
  UpdateCreatorRoleWorkspaceSchema,
) {}
export class BatchCreatorRoleProfilesDto extends createZodDto(
  BatchCreatorRoleProfilesSchema,
) {}
export class CreatorRoleDirectoryQueryDto extends createZodDto(
  CreatorRoleDirectoryQuerySchema,
) {}
