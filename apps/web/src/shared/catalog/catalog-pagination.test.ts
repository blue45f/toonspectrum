import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { searchFixture } from "../../../../../packages/core/src/__tests__/search-fixture";

beforeEach(() => { vi.resetModules(); vi.stubEnv("KMAS_PRV_KEY", ""); });
afterEach(() => vi.unstubAllEnvs());

describe("static catalog pagination contract", () => {
  it("uses the same default, totals, page boundaries and saved filters as HTTP API", async () => {
    const { handleStaticCatalogRequest } = await import("./catalog-static-engine");
    const fetch = vi.fn(async () => new Response(JSON.stringify(searchFixture()), { status: 200 }));
    const query = async (params: string) => (await handleStaticCatalogRequest("/api/search", new URLSearchParams(params), undefined, fetch)).json();
    const first = await query("sort=popular");
    expect(first.items).toHaveLength(24); expect(first.total).toBe(160);
    expect(first.typeCount).toEqual({ webtoon: 80, webnovel: 80 });
    const second = await query("sort=popular&page=2");
    expect(second.items[0].id).toBe("work-24");
    const saved = await query("ids=work-159&page=1");
    expect(saved.items.map((item: { id: string }) => item.id)).toEqual(["work-159"]);
    expect((await query("ids=")).total).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("honors POST body filters rather than the old URL closure", async () => {
    const { handleStaticCatalogRequest } = await import("./catalog-static-engine");
    const fetch = vi.fn(async () => new Response(JSON.stringify(searchFixture()), { status: 200 }));
    const response = await handleStaticCatalogRequest("/api/search", new URLSearchParams(), {
      method: "POST", body: JSON.stringify({ ids: "work-159", page: "1", pageSize: "24" }),
    }, fetch);
    expect(response.status).toBe(200);
    expect((await response.json()).items.map((item: { id: string }) => item.id)).toEqual(["work-159"]);
  });
  it.each(["page=0", "pageSize=81", "page=1&page=2", "q=one&q=two", `q=${"x".repeat(513)}`])("rejects %s before loading the catalog", async (query) => {
    const { handleStaticCatalogRequest } = await import("./catalog-static-engine");
    const fetch = vi.fn();
    const response = await handleStaticCatalogRequest("/api/search", new URLSearchParams(query), undefined, fetch);
    expect(response.status).toBe(400); expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects malformed POST bodies without fetching the catalog", async () => {
    const { handleStaticCatalogRequest } = await import("./catalog-static-engine");
    const fetch = vi.fn();
    const response = await handleStaticCatalogRequest("/api/search", new URLSearchParams(), { method: "POST", body: "[" }, fetch);
    expect(response.status).toBe(400); expect(fetch).not.toHaveBeenCalled();
  });
});
