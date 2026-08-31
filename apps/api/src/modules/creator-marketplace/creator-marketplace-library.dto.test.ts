import { describe, expect, it } from "vitest";

import {
  CreatorMarketplaceLibraryIdParamsSchema,
  CreatorMarketplaceLibraryListQuerySchema,
} from "./creator-marketplace-library.dto";

describe("creator marketplace library DTO", () => {
  it("private keyset query를 bounded strict schema로 제한한다", () => {
    expect(CreatorMarketplaceLibraryListQuerySchema.parse({
      limit: "12",
      view: "archived",
      logicalPackId: `community:${"a".repeat(64)}`,
      cursor: "eyJ2ZXJzaW9uIjoxfQ",
    })).toEqual({
      limit: 12,
      view: "archived",
      logicalPackId: `community:${"a".repeat(64)}`,
      cursor: "eyJ2ZXJzaW9uIjoxfQ",
    });
    expect(CreatorMarketplaceLibraryListQuerySchema.parse({})).toEqual({
      limit: 50,
      view: "active",
    });
    expect(CreatorMarketplaceLibraryListQuerySchema.safeParse({
      view: "deleted",
    }).success).toBe(false);
    expect(CreatorMarketplaceLibraryListQuerySchema.safeParse({
      cursor: "not+base64",
    }).success).toBe(false);
    expect(CreatorMarketplaceLibraryListQuerySchema.safeParse({
      public: true,
    }).success).toBe(false);
  });

  it("route id를 UUID로 고정한다", () => {
    expect(CreatorMarketplaceLibraryIdParamsSchema.safeParse({
      id: "123e4567-e89b-42d3-a456-426614174000",
    }).success).toBe(true);
    expect(CreatorMarketplaceLibraryIdParamsSchema.safeParse({
      id: "../resource",
    }).success).toBe(false);
  });
});
