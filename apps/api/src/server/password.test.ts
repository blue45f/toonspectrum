import { scryptSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  hashPassword,
  passwordPolicyError,
  verifyPassword,
} from "./password";

describe("password credentials", () => {
  it("enforces a long passphrase without composition rules", () => {
    expect(passwordPolicyError("too-short")).toMatch(/15자/u);
    expect(passwordPolicyError("correct horse battery staple")).toBeNull();
  });

  it("creates a versioned hash and verifies it asynchronously", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(stored).toMatch(/^scrypt\$v2\$/u);
    await expect(verifyPassword("correct horse battery staple", stored)).resolves.toEqual({
      valid: true,
      needsRehash: false,
    });
    await expect(verifyPassword("wrong password phrase", stored)).resolves.toEqual({
      valid: false,
      needsRehash: false,
    });
  });

  it("accepts a legacy salt:hash once and marks it for upgrade", async () => {
    const salt = "0123456789abcdef0123456789abcdef";
    const hash = scryptSync("legacy password phrase", salt, 64).toString("hex");
    await expect(verifyPassword("legacy password phrase", `${salt}:${hash}`)).resolves.toEqual({
      valid: true,
      needsRehash: true,
    });
  });

  it("runs a bounded failure path when no password credential exists", async () => {
    await expect(verifyPassword("any supplied password", null)).resolves.toEqual({
      valid: false,
      needsRehash: false,
    });
  });
});
