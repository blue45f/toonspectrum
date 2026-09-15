import { describe, expect, it } from "vitest";

import {
  authTokenIdentifier,
  hashAuthToken,
  isValidRawAuthToken,
} from "./auth-one-time-token";

describe("authentication one-time token primitives", () => {
  it("namespaces token ownership by purpose", () => {
    expect(authTokenIdentifier("verify-email", "user-1"))
      .toBe("verify-email:user-1");
    expect(authTokenIdentifier("reset-password", "user-1"))
      .toBe("reset-password:user-1");
  });

  it("stores a deterministic digest instead of the bearer token", () => {
    const raw = "A".repeat(43);
    const digest = hashAuthToken(raw);
    expect(digest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(digest).not.toContain(raw);
  });

  it("accepts only a canonical 32-byte base64url token", () => {
    expect(isValidRawAuthToken("A".repeat(43))).toBe(true);
    expect(isValidRawAuthToken("A".repeat(42))).toBe(false);
    expect(isValidRawAuthToken("A".repeat(42) + "=")).toBe(false);
    expect(isValidRawAuthToken({ token: "A".repeat(43) })).toBe(false);
  });
});
