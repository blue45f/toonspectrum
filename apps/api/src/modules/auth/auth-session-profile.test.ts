import { describe, expect, it } from "vitest";

import {
  normalizeAuthSessionRole,
  resolveAuthSessionUser,
} from "./auth-session-profile";

describe("auth session public profile", () => {
  it("rehydrates synthetic demo identities without requiring a database row", async () => {
    await expect(resolveAuthSessionUser("demo-kakao")).resolves.toEqual({
      id: "demo-kakao",
      name: "카카오 데모 사용자",
      email: "demo.kakao@webdex.local",
      image: null,
      role: "user",
    });
  });

  it("allows only roles understood by the browser session contract", () => {
    expect(normalizeAuthSessionRole("ADMIN")).toBe("admin");
    expect(normalizeAuthSessionRole("operator")).toBe("operator");
    expect(normalizeAuthSessionRole("unknown-role")).toBe("user");
  });
});
