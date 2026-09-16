import { describe, expect, it, vi } from "vitest";

import {
  NaverWebhookAuthenticationError,
  NaverWebhookConfigurationError,
  NaverWebhookPayloadError,
  type NaverUnlinkEvent,
  type NaverUnlinkStore,
  parseNaverUnlinkWebhook,
  processNaverUnlink,
} from "./naver-unlink-webhook";

const NOW = 1_800_000_000;
const CLIENT_ID = "fixture-naver-client-id";
const CLIENT_SECRET = "fixture-naver-client-secret";
const ENV = {
  NAVER_OAUTH_CLIENT_ID: CLIENT_ID,
  NAVER_OAUTH_CLIENT_SECRET: CLIENT_SECRET,
} as NodeJS.ProcessEnv;
const USER_ID = "fixture_naver_user_1";

// Fixed vectors generated from Naver's documented disconnect-callback protocol:
// AES-128-CBC/PKCS padding with the first 16 bytes of MD5(client secret), then
// HMAC-SHA256 over the exact callback fields. Keeping the vectors static avoids
// reimplementing a provider-mandated legacy derivation inside application tests.
const ENCRYPTED_USER_ID =
  "ABEiM0RVZneImaq7zN3u__pmwdJA8cLTEl9FJQvleGYR7v_NscYy21jlUgTwEFCZ";
const VALID_SIGNATURE =
  "vYP5vI2_kLV1ucQV-HoS3oBpQzz8VLOLVdrNyzMI78Y";
const INVALID_ENCRYPTED_USER_ID =
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const INVALID_CIPHERTEXT_SIGNATURE =
  "MBnskZzfFhmdSRis0E5iKWY-7yNCJIQI3hm0Ck5F4-Q";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    clientId: CLIENT_ID,
    encryptUniqueId: ENCRYPTED_USER_ID,
    timestamp: String(NOW),
    signature: VALID_SIGNATURE,
    ...overrides,
  };
}

describe("Naver unlink webhook authentication", () => {
  it("verifies the app, timestamp, HMAC, and encrypted provider id", () => {
    expect(parseNaverUnlinkWebhook(payload(), ENV, NOW)).toEqual({
      clientId: ENV.NAVER_OAUTH_CLIENT_ID,
      userId: USER_ID,
      timestamp: NOW,
    });
  });

  it("supports the reviewed legacy environment aliases", () => {
    const aliases = {
      NAVER_CLIENT_ID: ENV.NAVER_OAUTH_CLIENT_ID,
      NAVER_CLIENT_SECRET: ENV.NAVER_OAUTH_CLIENT_SECRET,
    } as NodeJS.ProcessEnv;
    expect(parseNaverUnlinkWebhook(payload(), aliases, NOW).userId).toBe(
      USER_ID,
    );
  });

  it("fails closed when the provider credentials are incomplete", () => {
    expect(() => parseNaverUnlinkWebhook(payload(), {}, NOW)).toThrow(
      NaverWebhookConfigurationError,
    );
  });

  it("rejects mismatched clients, signatures, and replayed requests", () => {
    expect(() =>
      parseNaverUnlinkWebhook(
        payload({ clientId: "unexpected-client" }),
        ENV,
        NOW,
      )
    ).toThrow(NaverWebhookAuthenticationError);
    expect(() =>
      parseNaverUnlinkWebhook(
        payload({ signature: "invalid-signature" }),
        ENV,
        NOW,
      )
    ).toThrow(NaverWebhookAuthenticationError);
    expect(() =>
      parseNaverUnlinkWebhook(
        payload({ timestamp: String(NOW - 601) }),
        ENV,
        NOW,
      )
    ).toThrow(NaverWebhookAuthenticationError);
  });

  it("rejects parameter pollution and authenticated malformed ciphertext", () => {
    expect(() =>
      parseNaverUnlinkWebhook(
        payload({ clientId: [ENV.NAVER_OAUTH_CLIENT_ID] }),
        ENV,
        NOW,
      )
    ).toThrow(NaverWebhookPayloadError);

    expect(() =>
      parseNaverUnlinkWebhook(
        payload({
          encryptUniqueId: INVALID_ENCRYPTED_USER_ID,
          signature: INVALID_CIPHERTEXT_SIGNATURE,
        }),
        ENV,
        NOW,
      )
    ).toThrow(NaverWebhookAuthenticationError);
  });
});

const EVENT: NaverUnlinkEvent = {
  clientId: ENV.NAVER_OAUTH_CLIENT_ID!,
  userId: USER_ID,
  timestamp: NOW,
};

function store(
  state: Awaited<ReturnType<NaverUnlinkStore["findAccountState"]>>,
  calls: string[],
): NaverUnlinkStore {
  return {
    findAccountState: vi.fn(async () => state),
    revokeSessions: vi.fn(async (userId) => {
      calls.push(`revoke:${userId}`);
    }),
    removeNaverLink: vi.fn(async (userId, providerAccountId) => {
      calls.push(`unlink:${userId}:${providerAccountId}`);
    }),
    softDelete: vi.fn(async (userId, reason) => {
      calls.push(`delete:${userId}:${reason}`);
    }),
  };
}

describe("Naver unlink account processing", () => {
  it("is idempotent when the provider link no longer exists", async () => {
    const calls: string[] = [];
    await expect(processNaverUnlink(EVENT, store(null, calls))).resolves.toBe(
      "not-linked",
    );
    expect(calls).toEqual([]);
  });

  it("revokes sessions before removing one link when another login remains", async () => {
    const calls: string[] = [];
    await expect(
      processNaverUnlink(
        EVENT,
        store({ userId: "user-1", hasAnotherLoginMethod: true }, calls),
      ),
    ).resolves.toBe("link-removed");
    expect(calls).toEqual([
      "revoke:user-1",
      `unlink:user-1:${USER_ID}`,
    ]);
  });

  it("soft-deletes and anonymizes a Naver-only account", async () => {
    const calls: string[] = [];
    await expect(
      processNaverUnlink(
        EVENT,
        store({ userId: "user-2", hasAnotherLoginMethod: false }, calls),
      ),
    ).resolves.toBe("account-deleted");
    expect(calls).toEqual(["delete:user-2:naver-unlink"]);
  });
});
