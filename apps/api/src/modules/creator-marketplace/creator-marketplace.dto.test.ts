import { describe, expect, it } from "vitest";

import {
  CreatorMarketplaceResourceListQuerySchema,
  CreatorMarketplaceResourceParamsSchema,
} from "./creator-marketplace.dto";

describe("creator marketplace DTO contracts", () => {
  it("목록 쿼리를 제한하고 unknown query를 거절한다", () => {
    expect(CreatorMarketplaceResourceListQuerySchema.parse({
      limit: "12",
      kind: "brush",
      license: "cc0-1.0",
      search: " 잉크 ",
    })).toMatchObject({
      limit: 12,
      kind: "brush",
      license: "cc0-1.0",
      search: "잉크",
    });
    expect(
      CreatorMarketplaceResourceListQuerySchema.safeParse({
        limit: 21,
        paid: "1",
      }).success
    ).toBe(false);
  });

  it("base64url 커서와 UUID resource id만 허용한다", () => {
    expect(
      CreatorMarketplaceResourceListQuerySchema.safeParse({ cursor: "abc_DEF-123" }).success
    ).toBe(true);
    expect(
      CreatorMarketplaceResourceListQuerySchema.safeParse({ cursor: "not+base64" }).success
    ).toBe(false);
    expect(
      CreatorMarketplaceResourceParamsSchema.safeParse({
        id: "123e4567-e89b-42d3-a456-426614174000",
      }).success
    ).toBe(true);
    expect(CreatorMarketplaceResourceParamsSchema.safeParse({ id: "../asset" }).success).toBe(
      false
    );
  });
});
