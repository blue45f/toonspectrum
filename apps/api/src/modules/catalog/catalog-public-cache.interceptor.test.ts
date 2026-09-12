import { lastValueFrom, of, throwError } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { catalogPublicCacheSeconds, CatalogPublicCacheInterceptor } from "./catalog-public-cache.interceptor";

import type { ExecutionContext } from "@nestjs/common";

const state = vi.hoisted(() => ({ titleCount: 100 }));
vi.mock("../../../../../packages/core/src/server/catalog-store", () => ({ getCatalogState: () => state }));

function harness(path = "/api/home", headers: Record<string, string> = {}, statusCode = 200, method = "GET") {
  const responseHeaders = new Map<string, unknown>([["vary", "Origin"], ["cache-control", "no-store"]]);
  const res = {
    headersSent: false, statusCode,
    getHeader: (key: string) => responseHeaders.get(key.toLowerCase()),
    setHeader: (key: string, value: unknown) => responseHeaders.set(key.toLowerCase(), value),
    removeHeader: (key: string) => responseHeaders.delete(key.toLowerCase()),
    vary: (key: string) => responseHeaders.set("vary", `${responseHeaders.get("vary")}, ${key}`),
  };
  const context = { switchToHttp: () => ({ getRequest: () => ({ path, headers, method }), getResponse: () => res }) } as unknown as ExecutionContext;
  const run = () => lastValueFrom(new CatalogPublicCacheInterceptor().intercept(context, { handle: () => of({ ok: true }) }));
  return { responseHeaders, res, context, run };
}

beforeEach(() => {
  vi.stubEnv("CATALOG_PUBLIC_CACHE_SECONDS", "30");
  vi.stubEnv("KMAS_PRV_KEY", "");
  state.titleCount = 100;
});
afterEach(() => vi.unstubAllEnvs());

 describe("public catalog cache boundary", () => {
  it.each(["/api/home", "/api/calendar", "/api/insights", "/api/ranking", "/api/explore", "/api/tags", "/api/authors"])(
    "caches only a successful anonymous public read: %s", async (path) => {
      const h = harness(path);
      await h.run();
      expect(h.responseHeaders.get("cache-control")).toBe("public, max-age=0, s-maxage=30");
      expect(h.responseHeaders.get("vary")).toBe("Origin, Cookie, Authorization, X-User-Id");
    },
  );
  it.each(["cookie", "authorization", "x-user-id", "range"])("does not cache requests carrying %s", async (header) => {
    const h = harness("/api/home", { [header]: "value" });
    await h.run();
    expect(h.responseHeaders.get("cache-control")).toContain("no-store");
  });
  it.each(["/api/config", "/api/titles/one", "/api/search", "/api/recommend", "/api/creator/marketplace/resources/one"])(
    "does not opt an unaudited endpoint into caching: %s", async (path) => {
      const h = harness(path);
      await h.run();
      expect(h.responseHeaders.get("cache-control")).toBe("no-store");
      expect(h.responseHeaders.get("vary")).toBe("Origin");
    },
  );
  it("does not cache cookies, errors, writes or an empty catalog", async () => {
    const cookies = harness();
    cookies.res.setHeader("Set-Cookie", "session=private");
    const failure = harness("/api/home", {}, 503);
    const write = harness("/api/home", {}, 200, "POST");
    for (const h of [cookies, failure, write]) {
      await h.run();
      expect(h.responseHeaders.get("cache-control")).toContain("no-store");
    }
    state.titleCount = 0;
    const empty = harness();
    await empty.run();
    expect(empty.responseHeaders.get("cache-control")).toContain("no-store");
  });
  it("removes higher-priority cache headers on exceptions", async () => {
    const h = harness();
    h.res.setHeader("Vercel-CDN-Cache-Control", "s-maxage=999");
    await expect(lastValueFrom(new CatalogPublicCacheInterceptor().intercept(h.context, {
      handle: () => throwError(() => new Error("read failed")),
    }))).rejects.toThrow("read failed");
    expect(h.responseHeaders.get("cache-control")).toContain("no-store");
    expect(h.responseHeaders.has("vercel-cdn-cache-control")).toBe(false);
  });
  it("bounds the TTL and supports disabling live enrichment or caching", () => {
    expect(catalogPublicCacheSeconds({})).toBe(30);
    for (const value of ["0", "-1", "NaN", "9999", "1.5"]) {
      expect(catalogPublicCacheSeconds({ CATALOG_PUBLIC_CACHE_SECONDS: value })).toBe(0);
    }
    expect(catalogPublicCacheSeconds({ KMAS_PRV_KEY: "configured" })).toBe(0);
    expect(catalogPublicCacheSeconds({ KMAS_PRV_KEY: "configured", KMAS_MERGE_ON_ACCESS: "0" })).toBe(30);
  });
});
