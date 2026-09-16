import {
  createCipheriv,
  createHash,
  createHmac,
} from "node:crypto";

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
const ENV = {
  NAVER_OAUTH_CLIENT_ID: "fixture-naver-client-id",
  NAVER_OAUTH_CLIENT_SECRET: "fixture-naver-client-secret",
} as NodeJS.ProcessEnv;
const USER_ID = "fixture_naver_user_1";
function protocolKey(secret = ENV.NAVER_OAUTH_CLIENT_SECRET!): Buffer {
  return createHash("md5").update(secret, "utf8").digest().subarray(0, 16);
}

function encryptedUserId(
  userId = USER_ID,
  secret = ENV.NAVER_OAUTH_CLIENT_SECRET!,
): string {
  const key = protocolKey(secret);
  const iv = Buffer.from("00112233445566778899aabbccddeeff", "hex");
  const cipher = createCipheriv("aes-128-cbc", key, iv);
  return Buffer.concat([
    iv,
    cipher.update(userId, "utf8"),
    cipher.final(),
  ]).toString("base64url");
}

function signature(
  clientId: string,
  encrypted: string,
  timestamp: string,
  secret = ENV.NAVER_OAUTH_CLIENT_SECRET!,
): string {
  const base = `clientId=${clientId}&encryptUniqueId=${encrypted}&timestamp=${timestamp}`;
  return createHmac("sha256", protocolKey(secret))
    .update(base, "utf8")
    .digest("base64url");
}
function payload(overrides: Record<string, unknown> = {}) {
  const clientId = String(overrides.clientId ?? ENV.NAVER_OAUTH_CLIENT_ID);
  const encryptUniqueId = String(
    overrides.encryptUniqueId ?? encryptedUserId(),
  );
  const timestamp = String(overrides.timestamp ?? NOW);
  return {
    clientId,
    encryptUniqueId,
    timestamp,
    signature: overrides.signature
      ?? signature(clientId, encryptUniqueId, timestamp),
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

    const invalidEncrypted = Buffer.alloc(32).toString("base64url");
    expect(() =>
      parseNaverUnlinkWebhook(
        payload({ encryptUniqueId: invalidEncrypted }),
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
