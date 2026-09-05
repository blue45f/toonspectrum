import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { requireMemberMutationAdmin } from "./admin-member-policy";

describe("member mutation privilege boundary", () => {
  it("allows administrators", () => {
    expect(() => requireMemberMutationAdmin({ role: "admin" })).not.toThrow();
  });
  it.each(["operator", "creator", "user", "owner", "", "ADMIN"])(
    "rejects non-canonical administrator role %s", (role) => {
      expect(() => requireMemberMutationAdmin({ role })).toThrow(ForbiddenException);
    },
  );
});
