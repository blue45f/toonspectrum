import { z } from "zod";
import {
  PRODUCTION_BOARD_STATUSES,
  PRODUCTION_ROLE_TYPES,
} from "../../../../../packages/core/src/production";

const Identity = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u);
const ProcessKey = z.string().regex(/^[a-z][a-z0-9-]{0,79}$/u);
export const ProductionTaskBriefBlockSchema = z
  .object({
    id: Identity,
    kind: z.enum(["paragraph", "heading", "checklist", "quote"]),
    text: z.string().max(4000),
    checked: z.boolean().optional(),
  })
  .strict();
export const ProductionWorkflowProfileSchema = z
  .object({
    id: Identity,
    projectId: Identity,
    name: z.string().trim().min(1).max(120),
    scale: z.enum(["solo", "team", "studio"]),
    revision: z.number().int().min(1).max(2147483647),
    updatedAt: z.string().datetime({ offset: true }),
    steps: z
      .array(
        z
          .object({
            key: ProcessKey,
            name: z.string().trim().min(1).max(120),
            description: z.string().max(4000),
            defaultRole: z.enum(PRODUCTION_ROLE_TYPES),
            dependsOn: z.array(ProcessKey).max(31),
            wipLimit: z.number().int().min(1).max(1000).nullable(),
            reviewRequired: z.boolean(),
            estimateHours: z.number().min(0).max(10000),
            completionCriteria: z.array(z.string().trim().min(1).max(4000)).max(30),
          })
          .strict(),
      )
      .min(1)
      .max(32),
  })
  .strict();
const ConfigureWorkflowCommand = z
  .object({
    type: z.literal("configure-workflow"),
    profile: ProductionWorkflowProfileSchema,
    expectedWorkflowRevision: z.number().int().min(0).max(2147483647),
  })
  .strict();
const InstantiateWorkflowCommand = z
  .object({
    type: z.literal("instantiate-workflow"),
    episodeId: Identity,
    workflowRevision: z.number().int().min(1).max(2147483647),
    instanceId: z.string().uuid(),
  })
  .strict();
const TransitionTaskBatchCommand = z
  .object({
    type: z.literal("transition-task-batch"),
    transitions: z
      .array(
        z
          .object({
            taskId: Identity,
            fromStatus: z.enum(PRODUCTION_BOARD_STATUSES),
            toStatus: z.enum(PRODUCTION_BOARD_STATUSES),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();
export const ProductionWorkflowCommandSchemas = [
  ConfigureWorkflowCommand,
  InstantiateWorkflowCommand,
  TransitionTaskBatchCommand,
] as const;
