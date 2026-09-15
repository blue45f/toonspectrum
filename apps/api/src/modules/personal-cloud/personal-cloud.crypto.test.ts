import { describe, expect, it } from "vitest";

import {
  createPersonalCloudNonce,
  createPersonalCloudPkcePair,
  decryptPersonalCloudSecret,
  encryptPersonalCloudSecret,
  issuePersonalCloudOAuthState,
  verifyPersonalCloudOAuthState,
} from "./personal-cloud.crypto";

const secret = "0123456789abcdef0123456789abcdef0123456789abcdef";

describe("personal cloud cryptography", () => {
  it("encrypts credentials with context-bound authenticated encryption", () => {
    const encrypted = encryptPersonalCloudSecret("refresh-secret", "user:google", secret);
    expect(encrypted).not.toContain("refresh-secret");
    expect(decryptPersonalCloudSecret(encrypted, "user:google", secret)).toBe("refresh-secret");
    expect(() => decryptPersonalCloudSecret(encrypted, "other-user:google", secret)).toThrow();
  });

  it("issues bounded PKCE material", () => {
    const pair = createPersonalCloudPkcePair();
    expect(pair.verifier.length).toBeGreaterThanOrEqual(43);
    expect(pair.challenge).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(createPersonalCloudNonce()).toMatch(/^[A-Za-z0-9_-]+$/u);
  });

  it("rejects tampered and expired OAuth state", () => {
    const now = Date.now();
    const state = issuePersonalCloudOAuthState({
      version: 1,
      provider: "google-drive",
      userId: "user-1",
      nonce: "a".repeat(32),
      returnTo: "/studio?view=storage",
      issuedAt: now,
    }, secret);
    expect(verifyPersonalCloudOAuthState(state, secret, now)?.userId).toBe("user-1");
    expect(verifyPersonalCloudOAuthState(`${state.slice(0, -1)}x`, secret, now)).toBeNull();
    expect(verifyPersonalCloudOAuthState(state, secret, now + 11 * 60_000)).toBeNull();
  });
});
