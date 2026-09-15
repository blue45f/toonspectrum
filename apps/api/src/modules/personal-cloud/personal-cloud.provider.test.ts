import { describe, expect, it, vi } from "vitest";

import {
  buildPersonalCloudAuthorizeUrl,
  exchangePersonalCloudCode,
  fetchPersonalCloudAccountProfile,
} from "./personal-cloud.provider";

import type { PersonalCloudProviderConfig } from "./personal-cloud.config";

const google: PersonalCloudProviderConfig = {
  id: "google-drive",
  label: "Google Drive",
  clientId: "client",
  clientSecret: "secret",
  authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  accountUrl: "https://openidconnect.googleapis.com/v1/userinfo",
  scopes: ["openid", "https://www.googleapis.com/auth/drive.file"],
  redirectUri: "https://www.toonstudio.cloud/api/personal-cloud/oauth/google-drive/callback",
  configured: true,
  reason: null,
};

describe("personal cloud provider protocol", () => {
  it("builds a PKCE authorization request with offline Drive access", () => {
    const url = new URL(buildPersonalCloudAuthorizeUrl(google, {
      state: "signed-state",
      challenge: "pkce-challenge",
    }));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toContain("drive.file");
  });

  it("requires a refresh token for durable account connections", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      access_token: "access",
      expires_in: 3600,
      token_type: "Bearer",
    }), { status: 200, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;
    await expect(exchangePersonalCloudCode(google, {
      code: "code",
      verifier: "v".repeat(64),
    }, fetchImpl)).rejects.toThrow(/offline access/u);
  });

  it("normalizes account identity without exposing tokens", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      sub: "google-user",
      email: "artist@example.com",
    }), { status: 200, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;
    await expect(fetchPersonalCloudAccountProfile(google, "access-token", fetchImpl)).resolves.toEqual({
      providerAccountId: "google-user",
      accountLabel: "artist@example.com",
    });
  });
});
