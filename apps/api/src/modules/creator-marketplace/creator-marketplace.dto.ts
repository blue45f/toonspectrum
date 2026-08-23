import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import {
  CREATOR_MARKETPLACE_RESOURCE_CURSOR_MAX_CHARACTERS,
  CREATOR_MARKETPLACE_RESOURCE_KINDS,
  CREATOR_MARKETPLACE_RESOURCE_LICENSES,
  CREATOR_MARKETPLACE_RESOURCE_MAX_PAGE_SIZE,
  CreatorMarketplaceResourceManifestSchema,
} from "../../../../../lib/creator-marketplace-resource-contract";

export const CreatorMarketplaceResourceListQuerySchema = z
  .object({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(CREATOR_MARKETPLACE_RESOURCE_MAX_PAGE_SIZE)
      .default(CREATOR_MARKETPLACE_RESOURCE_MAX_PAGE_SIZE),
    cursor: z
      .preprocess(
        (value) =>
          typeof value === "string" && value.trim().length === 0
            ? undefined
            : value ?? undefined,
        z
          .string()
          .min(1)
          .max(CREATOR_MARKETPLACE_RESOURCE_CURSOR_MAX_CHARACTERS)
          .regex(/^[A-Za-z0-9_-]+$/u)
          .optional()
      ),
    search: z.string().trim().max(80).optional(),
    tag: z.string().trim().max(24).optional(),
    kind: z.enum(CREATOR_MARKETPLACE_RESOURCE_KINDS).optional(),
    license: z.enum(CREATOR_MARKETPLACE_RESOURCE_LICENSES).optional(),
    // 공개 카탈로그의 배급자 필터. viewer-agnostic URL 상태라 엣지 캐시와 충돌하지 않는다.
    publisher: z.string().uuid().optional(),
  })
  .strict();

export const CreatorMarketplaceResourceParamsSchema = z
  .object({ id: z.string().uuid() })
  .strict();

export class PublishCreatorMarketplaceResourceDto extends createZodDto(
  CreatorMarketplaceResourceManifestSchema
) {}
export class CreatorMarketplaceResourceListQueryDto extends createZodDto(
  CreatorMarketplaceResourceListQuerySchema
) {}
export class CreatorMarketplaceResourceParamsDto extends createZodDto(
  CreatorMarketplaceResourceParamsSchema
) {}
