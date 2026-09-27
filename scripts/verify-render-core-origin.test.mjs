import { describe, expect, it, vi } from "vitest";

import {
  parseRenderCoreOrigin,
  verifyRenderCoreOrigin,
} from "./verify-render-core-origin.mjs";

function response(body, options = {}) {
  return new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers: {
      "content-type": "application/json",
      server: options.server ?? "Render",
      ...(options.headers ?? {}),
    },
  });
}

describe("Render Core API verification", () => {
  it("accepts a healthy non-Vercel Core API", async () => {
    const fetchImpl = vi.fn(async (url) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname === "/api/health/live") return response({ status: "ok" });
      if (pathname === "/api/health/ready") return response({ status: "ready" });
      return response({ error: "not_found" }, { status: 404 });
    });

    await expect(verifyRenderCoreOrigin({
      origin: "https://toonspectrum-core-api.onrender.com",
      fetchImpl,
      timeoutMs: 5_000,
    })).resolves.toMatchObject({
      origin: "https://toonspectrum-core-api.onrender.com",
      liveness: { status: 200 },
      readiness: { status: 200 },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects a response that still traverses Vercel", async () => {
    const fetchImpl = vi.fn(async () => response(
      { status: "ok" },
      { headers: { "x-vercel-id": "iad1::fixture" } },
    ));

    await expect(verifyRenderCoreOrigin({
      origin: "https://toonspectrum-core-api.onrender.com",
      fetchImpl,
      timeoutMs: 5_000,
    })).rejects.toThrow("still served by Vercel");
  });

  it("requires database readiness before traffic cutover", async () => {
    const fetchImpl = vi.fn(async (url) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname === "/api/health/live") return response({ status: "ok" });
      return response({
        statusCode: 503,
        status: "not_ready",
        error: "service_not_ready",
        message: "Service is not ready",
      }, { status: 503 });
    });

    await expect(verifyRenderCoreOrigin({
      origin: "https://toonspectrum-core-api.onrender.com",
      fetchImpl,
      timeoutMs: 5_000,
    })).rejects.toThrow("/api/health/ready returned 503");
  });

  it.each([
    "",
    "http://api.example.test",
    // secretlint-disable-next-line @secretlint/secretlint-rule-basicauth -- synthetic unsafe-origin rejection fixture
    "https://user:pass@api.example.test",
    "https://api.example.test/path",
    "https://api.example.test?query=1",
  ])("rejects an unsafe origin: %s", (origin) => {
    expect(() => parseRenderCoreOrigin(origin)).toThrow();
  });
});
