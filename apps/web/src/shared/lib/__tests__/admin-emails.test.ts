import { describe, expect, it } from "vitest";

import {
  DEFAULT_ADMIN_EMAILS,
  getAdminEmailWhitelist,
  isWhitelistedAdminEmail,
  normalizeAdminEmail,
  resolveEffectiveAdminRole,
} from "../../../../../../apps/api/src/server/admin-emails";

describe("retired admin email whitelist", () => {
  it("keeps every email-based privilege path disabled", () => {
    process.env.ADMIN_EMAILS = "ops@example.com,blue45f@gmail.com";
    expect(DEFAULT_ADMIN_EMAILS).toEqual([]);
    expect(getAdminEmailWhitelist().size).toBe(0);
    expect(isWhitelistedAdminEmail("ops@example.com")).toBe(false);
    expect(isWhitelistedAdminEmail("blue45f@gmail.com")).toBe(false);
  });

  it("normalizes profile email text without granting privileges", () => {
    expect(normalizeAdminEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
    expect(normalizeAdminEmail(null)).toBe("");
    expect(resolveEffectiveAdminRole("user", "blue45f@gmail.com")).toBe("user");
    expect(resolveEffectiveAdminRole("creator", "blue45f@gmail.com")).toBe("creator");
    expect(resolveEffectiveAdminRole("operator", "reader@example.com")).toBe("operator");
    expect(resolveEffectiveAdminRole("admin", "reader@example.com")).toBe("admin");
  });
});
