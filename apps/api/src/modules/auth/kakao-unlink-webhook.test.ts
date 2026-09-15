import { describe, expect, it, vi } from "vitest";

import {
  KakaoWebhookAuthenticationError,
  KakaoWebhookConfigurationError,
  KakaoWebhookPayloadError,
  type KakaoUnlinkEvent,
  type KakaoUnlinkStore,
  parseKakaoUnlinkWebhook,
  processKakaoUnlink,
} from "./kakao-unlink-webhook";

const ENV = {
  KAKAO_ADMIN_KEY: "fixture-kakao-admin-key",
  KAKAO_APP_ID: "1578766",
} as NodeJS.ProcessEnv;

const EVENT: KakaoUnlinkEvent = {
  appId: "1578766",
  userId: "987654321",
  referrerType: "UNLINK_FROM_APPS",
};

function payload(overrides: Record<string, unknown> = {}) {
  return {
    app_id: EVENT.appId,
    user_id: EVENT.userId,
    referrer_type: EVENT.referrerType,
    ...overrides,
  };
}

describe("Kakao unlink webhook authentication", () => {
  it("accepts the configured app, admin key, user id, and reason", () => {
    expect(
      parseKakaoUnlinkWebhook(
        "KakaoAK fixture-kakao-admin-key",
        payload(),
        ENV,
      ),
    ).toEqual(EVENT);
  });

  it("fails closed when webhook secrets are not configured", () => {
    expect(() =>
      parseKakaoUnlinkWebhook(
        "KakaoAK fixture-kakao-admin-key",
        payload(),
        {},
      )
    ).toThrow(KakaoWebhookConfigurationError);
  });

  it("rejects a mismatched authority or app id", () => {
    expect(() =>
      parseKakaoUnlinkWebhook("KakaoAK wrong", payload(), ENV)
    ).toThrow(KakaoWebhookAuthenticationError);
    expect(() =>
      parseKakaoUnlinkWebhook(
        "KakaoAK fixture-kakao-admin-key",
        payload({ app_id: "9999999" }),
        ENV,
      )
    ).toThrow(KakaoWebhookAuthenticationError);
  });
  it("rejects parameter pollution and unknown unlink reasons", () => {
    expect(() =>
      parseKakaoUnlinkWebhook(
        "KakaoAK fixture-kakao-admin-key",
        payload({ user_id: [EVENT.userId, "2"] }),
        ENV,
      )
    ).toThrow(KakaoWebhookPayloadError);
    expect(() =>
      parseKakaoUnlinkWebhook(
        "KakaoAK fixture-kakao-admin-key",
        payload({ referrer_type: "UNKNOWN" }),
        ENV,
      )
    ).toThrow(KakaoWebhookPayloadError);
  });
});

function store(
  state: Awaited<ReturnType<KakaoUnlinkStore["findAccountState"]>>,
  calls: string[],
): KakaoUnlinkStore {
  return {
    findAccountState: vi.fn(async () => state),
    revokeSessions: vi.fn(async (userId) => {
      calls.push(`revoke:${userId}`);
    }),
    removeKakaoLink: vi.fn(async (userId, providerAccountId) => {
      calls.push(`unlink:${userId}:${providerAccountId}`);
    }),
    softDelete: vi.fn(async (userId, reason) => {
      calls.push(`delete:${userId}:${reason}`);
    }),
  };
}

describe("Kakao unlink account processing", () => {
  it("is idempotent when the provider link no longer exists", async () => {
    const calls: string[] = [];
    await expect(processKakaoUnlink(EVENT, store(null, calls))).resolves.toBe(
      "not-linked",
    );
    expect(calls).toEqual([]);
  });

  it("revokes sessions before removing one link when another login remains", async () => {
    const calls: string[] = [];
    const result = await processKakaoUnlink(
      EVENT,
      store(
        { userId: "user-1", hasAnotherLoginMethod: true },
        calls,
      ),
    );
    expect(result).toBe("link-removed");
    expect(calls).toEqual([
      "revoke:user-1",
      `unlink:user-1:${EVENT.userId}`,
    ]);
  });

  it("soft-deletes and anonymizes a Kakao-only account", async () => {
    const calls: string[] = [];
    const result = await processKakaoUnlink(
      EVENT,
      store(
        { userId: "user-2", hasAnotherLoginMethod: false },
        calls,
      ),
    );
    expect(result).toBe("account-deleted");
    expect(calls).toEqual([
      "delete:user-2:kakao-unlink:UNLINK_FROM_APPS",
    ]);
  });
});
