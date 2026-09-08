import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { requireAdminMutationActor } from "./admin-mutation-policy";

describe("high-risk admin mutation policy", () => {
  it("allows administrators", () => {
    expect(() => requireAdminMutationActor({ role: "admin" })).not.toThrow();
  });

  it.each(["operator", "creator", "user", ""])(
    "rejects %s actors",
    (role) => {
      expect(() => requireAdminMutationActor({ role })).toThrow(
        ForbiddenException,
      );
    },
  );
});
