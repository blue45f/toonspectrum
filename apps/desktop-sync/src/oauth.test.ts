import { describe, expect, it, vi } from "vitest";

import { MemoryDesktopCredentialVault } from "./credential-vault.js";
import {
  DesktopOAuthCredentialManager,
  buildDesktopOAuthAuthorizeUrl,
  createDesktopOAuthLoopbackCallback,
  createDesktopPkcePair,
  desktopOAuthProviderConfig,
} from "./oauth.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bodyValues(init: RequestInit | undefined): URLSearchParams {
  return new URLSearchParams(String(init?.body ?? ""));
}

describe("desktop OAuth", () => {
  it("builds provider-specific PKCE authorization URLs", () => {
    const pair = createDesktopPkcePair();
    expect(pair.verifier.length).toBeGreaterThanOrEqual(43);
    expect(pair.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/u);

    const google = desktopOAuthProviderConfig("google-drive", "client-id");
    const url = new URL(buildDesktopOAuthAuthorizeUrl(google, {
      redirectUri: "http://127.0.0.1:43123/oauth/callback",
      state: "state-value",
      challenge: pair.challenge,
    }));
    expect(url.protocol).toBe("https:");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://127.0.0.1:43123/oauth/callback",
    );

    const dropbox = desktopOAuthProviderConfig("dropbox", "client-id");
    const dropboxUrl = new URL(buildDesktopOAuthAuthorizeUrl(dropbox, {
      redirectUri: "http://127.0.0.1:43123/oauth/callback",
      state: "state-value",
      challenge: pair.challenge,
    }));
    expect(dropboxUrl.searchParams.get("token_access_type")).toBe("offline");

    const oneDrive = desktopOAuthProviderConfig(
      "onedrive",
      "client-id",
      "consumers",
    );
    expect(oneDrive.authorizeUrl).toContain("/consumers/");
    expect(oneDrive.scopes).toContain("offline_access");
  });

  it("uses a loopback callback without reflecting authorization codes", async () => {
    const callback = await createDesktopOAuthLoopbackCallback("known-state", {
      timeoutMs: 5_000,
    });
    try {
      const response = await fetch(
        `${callback.redirectUri}?state=known-state&code=private-code`,
      );
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).not.toContain("private-code");
      await expect(callback.code).resolves.toBe("private-code");
    } finally {
      await callback.close();
    }
  });

  it("stores offline credentials in the vault and returns redacted status", async () => {
    const vault = new MemoryDesktopCredentialVault();
    const launched: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (request, init) => {
      const url = request.toString();
      if (url.includes("/token")) {
        expect(bodyValues(init).get("code_verifier")).toBeTruthy();
        return jsonResponse({
          access_token: "access-one",
          refresh_token: "refresh-one",
          token_type: "Bearer",
          scope: "openid files.content.write",
          expires_in: 3_600,
        });
      }
      if (url.includes("get_current_account")) {
        return jsonResponse({
          account_id: "dbid:account",
          email: "artist@example.test",
        });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    const manager = new DesktopOAuthCredentialManager(vault, {
      fetchImpl,
      now: () => Date.parse("2026-09-17T00:00:00.000Z"),
      launchBrowser: async (url) => { launched.push(url); },
      createLoopback: async () => ({
        redirectUri: "http://127.0.0.1:43123/oauth/callback",
        code: Promise.resolve("authorization-code"),
        close: vi.fn(async () => undefined),
      }),
    });
    const status = await manager.login(
      desktopOAuthProviderConfig("dropbox", "client-id"),
    );
    expect(status).toMatchObject({
      connected: true,
      accountLabel: "artist@example.test",
      provider: "dropbox",
      profile: "default",
    });
    expect(JSON.stringify(status)).not.toContain("access-one");
    expect(JSON.stringify(status)).not.toContain("refresh-one");
    expect(launched).toHaveLength(1);
    expect(new URL(launched[0]!).searchParams.get("code_challenge")).toBeTruthy();
    await expect(manager.accessToken("dropbox")).resolves.toBe("access-one");
  });

  it("single-flights refreshes and persists refresh-token rotation", async () => {
    const vault = new MemoryDesktopCredentialVault();
    let now = Date.parse("2026-09-17T00:00:00.000Z");
    const refreshValues: string[] = [];
    let refreshSequence = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (request, init) => {
      const url = request.toString();
      if (url.includes("/token")) {
        const values = bodyValues(init);
        if (values.get("grant_type") === "authorization_code") {
          return jsonResponse({
            access_token: "access-initial",
            refresh_token: "refresh-initial",
            expires_in: 1,
          });
        }
        refreshValues.push(values.get("refresh_token") ?? "");
        refreshSequence += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return jsonResponse({
          access_token: `access-${refreshSequence}`,
          refresh_token: `refresh-${refreshSequence}`,
          expires_in: 1,
        });
      }
      if (url.includes("get_current_account")) {
        return jsonResponse({
          account_id: "dbid:account",
          email: "artist@example.test",
        });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    const manager = new DesktopOAuthCredentialManager(vault, {
      fetchImpl,
      now: () => now,
      launchBrowser: vi.fn(async () => undefined),
      createLoopback: async () => ({
        redirectUri: "http://127.0.0.1:43123/oauth/callback",
        code: Promise.resolve("authorization-code"),
        close: vi.fn(async () => undefined),
      }),
    });
    await manager.login(desktopOAuthProviderConfig("dropbox", "client-id"));
    now += 2_000;
    const [first, second] = await Promise.all([
      manager.accessToken("dropbox"),
      manager.accessToken("dropbox"),
    ]);
    expect(first).toBe("access-1");
    expect(second).toBe("access-1");
    expect(refreshValues).toEqual(["refresh-initial"]);

    now += 2_000;
    await expect(manager.accessToken("dropbox")).resolves.toBe("access-2");
    expect(refreshValues).toEqual(["refresh-initial", "refresh-1"]);
  });
});
