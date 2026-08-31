import { describe, expect, it } from "vitest";

import {
  CreatorMarketplaceLibraryIntegrityError,
  isCreatorMarketplacePackageKindContinuityViolation,
  mapCreatorMarketplaceLibraryDatabaseError,
} from "./creator-marketplace-library.repository-contract";

describe("creator marketplace library repository contract", () => {
  it("DB package kind continuity 위반을 안정된 library integrity 오류로 매핑한다", () => {
    const databaseError = {
      code: "23514",
      constraint: "creator_marketplace_resource_package_kind_continuity",
    };
    expect(isCreatorMarketplacePackageKindContinuityViolation(databaseError)).toBe(true);
    expect(() => mapCreatorMarketplaceLibraryDatabaseError(databaseError)).toThrowError(
      expect.objectContaining<Partial<CreatorMarketplaceLibraryIntegrityError>>({
        reason: "package-kind-continuity",
      }),
    );
  });

  it("digest 충돌과 confirmation equivocation을 fail closed한다", () => {
    expect(() => mapCreatorMarketplaceLibraryDatabaseError({
      code: "23514",
      constraint: "creator_marketplace_library_package_identity_integrity",
    })).toThrowError(expect.objectContaining({ reason: "package-identity-collision" }));
    expect(() => mapCreatorMarketplaceLibraryDatabaseError({
      code: "23514",
      constraint: "creator_marketplace_library_confirmation_equivocation",
    })).toThrowError(expect.objectContaining({ reason: "confirmation-equivocation" }));
  });

  it("관계없는 DB 오류는 의미를 숨기지 않고 그대로 전달한다", () => {
    const error = Object.assign(new Error("network"), { code: "08006" });
    expect(() => mapCreatorMarketplaceLibraryDatabaseError(error)).toThrow(error);
  });
});
