import { StudioWorkAssetSmartFiltersSchema } from "./studio-smart-filter-stack-contract";
import { z } from "zod";

/** Pixel-free, versioned instruction in the ordinary image/layer history envelope. */
export const StudioLiveAdjustmentMetadataSchema = z.object({
  version: z.literal(1),
  scope: z.enum(["composite-below", "clip-previous"]),
}).strict();

export type StudioLiveAdjustmentMetadata = z.infer<typeof StudioLiveAdjustmentMetadataSchema>;

export function canonicalizeStudioLiveAdjustmentElement(value: unknown): unknown {
  if (!value || typeof value !== "object" || !("adjustmentLayer" in value)
    || value.adjustmentLayer === undefined) return value;
  if (!("type" in value) || value.type !== "image") {
    throw new Error("보정 레이어는 이미지 레이어 계약을 사용해야 합니다.");
  }
  const parsed = StudioLiveAdjustmentMetadataSchema.safeParse(value.adjustmentLayer);
  if (!parsed.success) throw new Error("보정 레이어 정보가 손상되었거나 지원하지 않는 버전입니다.");
  const smartFilters = "smartFilters" in value && value.smartFilters !== undefined
    ? StudioWorkAssetSmartFiltersSchema.parse(value.smartFilters) : undefined;
  return { ...value, adjustmentLayer: parsed.data, ...(smartFilters ? { smartFilters } : {}) };
}
