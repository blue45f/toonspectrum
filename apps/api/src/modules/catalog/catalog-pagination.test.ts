import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { searchFixture } from "../../../../../packages/core/src/__tests__/search-fixture";
import { replaceCatalogData, resetCatalogToEmpty } from "../../../../../packages/core/src/server/catalog-store";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";

const liveSearch = vi.hoisted(() => vi.fn(async () => null as unknown));
vi.mock("../../server/kmas", async (original) => ({ ...(await original<typeof import("../../server/kmas")>()), getKmasSearchData: liveSearch }));

beforeEach(() => {
  vi.stubEnv("KMAS_PRV_KEY", "");
  liveSearch.mockResolvedValue(null);
  replaceCatalogData(searchFixture());
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); resetCatalogToEmpty(); });

describe("catalog API bounded pagination", () => {
  it("returns 24 by default with full aggregate counts, not a truncated total", async () => {
    const result = await new CatalogService().getSearchData({ sort: "popular" });
    expect(result.items).toHaveLength(24);
    expect(result.total).toBe(160);
    expect(result.typeCount).toEqual({ webtoon: 80, webnovel: 80 });
    expect(result.pagination).toEqual({ page: 1, pageSize: 24, total: 160, hasMore: true, nextPage: 2 });
  });
  it("traverses every result exactly once under a fixed catalog snapshot", async () => {
    const service = new CatalogService();
    const ids: string[] = [];
    let page: number | null = 1;
    while (page !== null) {
      const result = await service.getSearchData({ sort: "popular", page: String(page), pageSize: "24" });
      ids.push(...result.items.map((item) => item.id));
      page = result.pagination.nextPage;
    }
    expect(ids).toEqual(searchFixture().map((item) => item.id));
  });
  it("filters saved IDs before pagination without losing global adaptation relationships", async () => {
    const titles = searchFixture();
    titles[1].adaptedFrom = titles[150].id;
    replaceCatalogData(titles);
    const service = new CatalogService();
    const result = await service.getSearchData({ ids: "work-150", adaptedOnly: "true" });
    expect(result.items.map((item) => item.id)).toEqual(["work-150"]);
    expect(result.total).toBe(1);
    expect((await service.getSearchData({ ids: "" })).total).toBe(0);
    expect(liveSearch).not.toHaveBeenCalled();
  });
  it.each([{ pageSize: "81" }, { page: "0" }, { page: ["1", "2"] }, { ids: "x".repeat(129) }])(
    "rejects invalid pagination before side effects: %j", async (query) => {
      const service = new CatalogService();
      const merge = vi.spyOn(service, "mergeKmasOnSiteAccess");
      await expect(service.getSearchData(query)).rejects.toMatchObject({ status: 400 });
      expect(merge).not.toHaveBeenCalled();
    },
  );
  it("keeps the provider page, size and page-scoped aggregates explicit", async () => {
    liveSearch.mockResolvedValue({ items: searchFixture(2), total: 200, typeCount: { webtoon: 1, webnovel: 1 }, topTags: [] });
    const result = await new CatalogService().getSearchData({ q: "story", page: "3", pageSize: "24" });
    expect(liveSearch).toHaveBeenCalledWith({ q: "story", page: 3, limit: 24 });
    expect(result.pagination).toMatchObject({ page: 3, total: 200, nextPage: 4 });
    expect(result.typeCountScope).toBe("page");
  });
  it("accepts bounded saved search bodies and rejects invalid body shapes", async () => {
    const controller = new CatalogController(new CatalogService());
    expect((await controller.postSearch({ ids: "work-159", page: "1", pageSize: "24" })).items.map((item) => item.id)).toEqual(["work-159"]);
    for (const invalid of [null, [], "q=x", { ids: ["work-1"] }, { unknown: "x" }]) {
      await expect(controller.postSearch(invalid)).rejects.toMatchObject({ status: 400 });
    }
  });
});
