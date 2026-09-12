import { z } from "zod";
import { STUDIO_ADJUSTMENT_ENGINE_IDS } from "./studio-adjustment-engine-ids";

const StudioWorkAssetAdjustmentParamSchema = z.union([
  z.number().finite(),
  z.string().max(128),
  z.boolean(),
]);

const StudioWorkAssetAdjustmentParamsSchema = z
  .record(z.string().min(1).max(48), StudioWorkAssetAdjustmentParamSchema)
  .superRefine((params, context) => {
    if (Object.keys(params).length > 16) {
      context.addIssue({
        code: "custom",
        message: "스마트 필터 매개변수가 안전 한도를 넘었습니다.",
      });
    }
  });

export const StudioWorkAssetSmartFiltersSchema = z
  .object({
    version: z.literal(1),
    entries: z.array(z.object({
      id: z.string().min(1).max(80),
      engine: z.enum(STUDIO_ADJUSTMENT_ENGINE_IDS),
      enabled: z.boolean(),
      opacity: z.number().finite().min(0).max(1).optional(),
      params: StudioWorkAssetAdjustmentParamsSchema,
    }).strict()).max(24),
  })
  .strict();
