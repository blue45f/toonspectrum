import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  encryptPersonalCloudSecret,
  personalCloudTokenContext,
} from "./personal-cloud.crypto";
import { PersonalCloudRepository } from "./personal-cloud.repository";
import {
  PersonalCloudService,
} from "./personal-cloud.service";

import type {
  PersonalCloudConnectionRecord,
  PersonalCloudTokenSet,
} from "./personal-cloud.types";

const providerMocks = vi.hoisted(() => ({
  exchange: vi.fn(),
  profile: vi.fn(),
  refresh: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock("./personal-cloud.provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./personal-cloud.provider")>();
  return {
    ...actual,
    exchangePersonalCloudCode: providerMocks.exchange,
    fetchPersonalCloudAccountProfile: providerMocks.profile,
    refreshPersonalCloudToken: providerMocks.refresh,
    revokePersonalCloudToken: providerMocks.revoke,
  };
});

const USER_ID = "user-1";
const STATE_SECRET = "s".repeat(48);
const TOKEN_SECRET = "k".repeat(48);
function repositoryMock() {
  return {
    list: vi.fn().mockResolvedValue([]),
    find: vi.fn(),
    upsert: vi.fn(),
    updateTokens: vi.fn(),
    touch: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(true),
  };
}

function connectionRecord(input: {
  readonly accessToken?: string;
  readonly refreshToken?: string;
  readonly expiresAt?: Date;
} = {}): PersonalCloudConnectionRecord {
  const accessToken = input.accessToken ?? "old-access";
  const refreshToken = input.refreshToken ?? "old-refresh";
  const now = new Date("2026-09-15T00:00:00.000Z");
  return Object.freeze({
    userId: USER_ID,
    provider: "google-drive",
    providerAccountId: "google-account-1",
    accountLabel: "person@example.com",
    encryptedAccessToken: encryptPersonalCloudSecret(
      accessToken,
      personalCloudTokenContext(USER_ID, "google-drive", "access"),
      TOKEN_SECRET,
    ),
    encryptedRefreshToken: encryptPersonalCloudSecret(
      refreshToken,
      personalCloudTokenContext(USER_ID, "google-drive", "refresh"),
      TOKEN_SECRET,
    ),
    tokenType: "Bearer",
    scope: "openid email https://www.googleapis.com/auth/drive.file",
    accessTokenExpiresAt: input.expiresAt ?? new Date("2026-09-15T03:00:00.000Z"),
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
  });
}
beforeEach(() => {
  vi.stubEnv("PERSONAL_CLOUD_OAUTH_REDIRECT_BASE_URL", "https://www.toonstudio.cloud");
  vi.stubEnv("WEB_APP_BASE_URL", "https://www.toonstudio.cloud");
  vi.stubEnv("PERSONAL_CLOUD_OAUTH_STATE_SECRET", STATE_SECRET);
  vi.stubEnv("PERSONAL_CLOUD_TOKEN_ENCRYPTION_KEY", TOKEN_SECRET);
  vi.stubEnv("GOOGLE_DRIVE_OAUTH_CLIENT_ID", "google-client");
  vi.stubEnv("GOOGLE_DRIVE_OAUTH_CLIENT_SECRET", "google-secret");
  providerMocks.exchange.mockReset();
  providerMocks.profile.mockReset();
  providerMocks.refresh.mockReset();
  providerMocks.revoke.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PersonalCloudService", () => {
  it("binds OAuth state and encrypted PKCE cookie to the signed-in user", () => {
    const repository = repositoryMock();
    const service = new PersonalCloudService(
      repository as unknown as PersonalCloudRepository,
    );

    const started = service.startConnection({
      userId: USER_ID,
      provider: "google-drive",
      returnTo: "/studio?view=storage&project=project-1",
    });

    const authorizeUrl = new URL(started.authorizeUrl);
    expect(authorizeUrl.origin).toBe("https://accounts.google.com");
    expect(authorizeUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizeUrl.searchParams.get("scope")).toContain("drive.file");
    expect(authorizeUrl.searchParams.get("state")).toMatch(/^s1\./u);
    expect(started.cookieValue).toMatch(/^v1\./u);
    expect(started.cookieValue).not.toContain(USER_ID);
  });

  it("rejects OAuth completion when the current session user changed", async () => {
    const repository = repositoryMock();
    const service = new PersonalCloudService(
      repository as unknown as PersonalCloudRepository,
    );
    const started = service.startConnection({
      userId: USER_ID,
      provider: "google-drive",
      returnTo: "/studio?view=storage",
    });
    const state = new URL(started.authorizeUrl).searchParams.get("state")!;

    await expect(service.completeConnection({
      provider: "google-drive",
      state,
      code: "oauth-code",
      cookieValue: started.cookieValue,
      sessionUserId: "other-user",
    })).rejects.toMatchObject({
      status: 403,
      code: "session-user-mismatch",
    });
    expect(providerMocks.exchange).not.toHaveBeenCalled();
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it("refreshes an expiring token and returns only the short-lived access token", async () => {
    const repository = repositoryMock();
    const expired = connectionRecord({
      expiresAt: new Date(Date.now() + 10_000),
    });
    const refreshed: PersonalCloudTokenSet = Object.freeze({
      accessToken: "new-access",
      refreshToken: "new-refresh",
      tokenType: "Bearer",
      scope: "openid email https://www.googleapis.com/auth/drive.file",
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    const updated = connectionRecord({
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken!,
      expiresAt: refreshed.expiresAt,
    });
    repository.find.mockResolvedValue(expired);
    repository.updateTokens.mockResolvedValue(updated);
    providerMocks.refresh.mockResolvedValue(refreshed);
    const service = new PersonalCloudService(
      repository as unknown as PersonalCloudRepository,
    );

    await expect(service.accessToken(USER_ID, "google-drive")).resolves.toEqual({
      accessToken: "new-access",
      tokenType: "Bearer",
      expiresAt: refreshed.expiresAt.toISOString(),
      scope: ["openid", "email", "https://www.googleapis.com/auth/drive.file"],
      accountLabel: "pe****@example.com",
    });
    expect(providerMocks.refresh).toHaveBeenCalledWith(
      expect.objectContaining({ id: "google-drive" }),
      "old-refresh",
    );
    expect(repository.updateTokens).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      provider: "google-drive",
      encryptedAccessToken: expect.stringMatching(/^v1\./u),
      encryptedRefreshToken: expect.stringMatching(/^v1\./u),
    }));
    expect(repository.touch).not.toHaveBeenCalled();
  });
});
