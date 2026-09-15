// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearStudioToonBridgeSettings,
  loadStudioToonBridgeSettings,
  saveStudioToonBridgeSettings,
  StudioToonBridgeClient,
  STUDIO_TOONBRIDGE_SESSION_KEY,
  validateStudioToonBridgeSettings,
} from "./studio-toonbridge-client";

const TOKEN = "a".repeat(40);

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  clearStudioToonBridgeSettings();
  vi.unstubAllGlobals();
});

describe("Studio ToonBridge client", () => {
  it("accepts local HTTP and HTTPS but rejects credentials, paths and remote plaintext", () => {
    expect(validateStudioToonBridgeSettings({
      baseUrl: "http://127.0.0.1:49631/",
      token: TOKEN,
    }).baseUrl).toBe("http://127.0.0.1:49631");
    expect(validateStudioToonBridgeSettings({
      baseUrl: "https://bridge.example.com",
      token: TOKEN,
    }).baseUrl).toBe("https://bridge.example.com");

    expect(() => validateStudioToonBridgeSettings({
      baseUrl: "http://bridge.example.com",
      token: TOKEN,
    })).toThrow(/HTTPS/u);
    expect(() => validateStudioToonBridgeSettings({
      baseUrl: "http://user:pass@127.0.0.1:49631",
      token: TOKEN,
    })).toThrow(/자격증명/u);
    expect(() => validateStudioToonBridgeSettings({
      baseUrl: "http://127.0.0.1:49631/api",
      token: TOKEN,
    })).toThrow(/경로/u);
    expect(() => validateStudioToonBridgeSettings({
      baseUrl: "http://127.0.0.1:49631?token=secret",
      token: TOKEN,
    })).toThrow(/쿼리/u);
  });

  it("keeps credentials in session storage and clears invalid values", () => {
    saveStudioToonBridgeSettings({
      baseUrl: "http://127.0.0.1:49631",
      token: TOKEN,
    });
    expect(loadStudioToonBridgeSettings()).toEqual({
      baseUrl: "http://127.0.0.1:49631",
      token: TOKEN,
    });

    sessionStorage.setItem(STUDIO_TOONBRIDGE_SESSION_KEY, JSON.stringify({
      baseUrl: "http://evil.example.com",
      token: "short",
    }));
    expect(loadStudioToonBridgeSettings()).toBeNull();
    expect(sessionStorage.getItem(STUDIO_TOONBRIDGE_SESSION_KEY)).toBeNull();
  });

  it("sends exact auth and protocol headers without credentials", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
      expect(headers.get("x-toonbridge-version")).toBe("2");
      expect(init?.credentials).toBe("omit");
      expect(init?.redirect).toBe("error");
      return response({
        protocol: "toonstudio.production-toolchain",
        version: 2,
        serviceVersion: "0.1.0",
        activeJobs: 0,
        retainedJobs: 2,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new StudioToonBridgeClient({
      baseUrl: "http://127.0.0.1:49631",
      token: TOKEN,
    });
    await expect(client.status()).resolves.toMatchObject({ retainedJobs: 2 });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:49631/v2/status",
      expect.objectContaining({ cache: "no-store", credentials: "omit" }),
    );
  });

  it("rejects malformed success payloads and preserves structured server messages", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ version: 99 })));
    const client = new StudioToonBridgeClient({
      baseUrl: "http://127.0.0.1:49631",
      token: TOKEN,
    });
    await expect(client.status()).rejects.toThrow();

    vi.stubGlobal("fetch", vi.fn(async () => response({
      code: "LICENSE_REJECTED",
      message: "Research NC profile required",
    }, 403)));
    await expect(client.status()).rejects.toThrow("Research NC profile required");
  });
});
