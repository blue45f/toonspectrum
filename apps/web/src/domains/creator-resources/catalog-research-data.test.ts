import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildResearchSnapshot } from "@/shared/lib/catalog-research";

const snapshot = buildResearchSnapshot([{ id: "a", title: "작품", type: "webtoon", genres: ["판타지"] }], { crawledAt: "2026-06-27T03:50:38Z" }, "0123456789abcdef");
function fakeStorage(initial?: Response) {
  let saved = initial;
  const cache = { match: vi.fn(async () => saved?.clone()), put: vi.fn(async (_key: string, response: Response) => { saved = response.clone(); }) };
  return { storage: { open: vi.fn(async () => cache) } as unknown as CacheStorage, cache };
}
beforeEach(() => { vi.resetModules(); });
describe("catalog research transport and offline fallback", () => {
  it("uses a single same-origin request and caches only validated metadata", async () => {
    const { loadCatalogResearch } = await import("./catalog-research-data"); const { storage, cache } = fakeStorage();
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(snapshot));
    const result = await loadCatalogResearch(false, request, storage);
    expect(result.dataset.works).toHaveLength(1); expect(result.mode).toBe("network"); expect(result.offlineReady).toBe(true);
    expect(request.mock.calls[0]?.[0]).toBe("/data/research-index.json"); expect(cache.put).toHaveBeenCalledTimes(1);
    await loadCatalogResearch(false, request, storage); expect(request).toHaveBeenCalledTimes(1);
  });
  it("deduplicates concurrent consumers", async () => {
    const { loadCatalogResearch } = await import("./catalog-research-data"); const request = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(snapshot));
    const [a, b] = await Promise.all([loadCatalogResearch(false, request), loadCatalogResearch(false, request)]);
    expect(a).toBe(b); expect(request).toHaveBeenCalledTimes(1);
  });
  it("restores a validated cached index when the network fails", async () => {
    const { loadCatalogResearch } = await import("./catalog-research-data"); const { storage } = fakeStorage(Response.json(snapshot));
    const result = await loadCatalogResearch(true, vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")), storage);
    expect(result.mode).toBe("saved"); expect(result.offlineReady).toBe(true); expect(result.dataset.snapshot.collectedAt).toBe(snapshot.collectedAt);
  });
  it("never replaces a valid cache with invalid JSON shapes", async () => {
    const { loadCatalogResearch } = await import("./catalog-research-data"); const { storage, cache } = fakeStorage(Response.json(snapshot));
    const result = await loadCatalogResearch(true, vi.fn<typeof fetch>().mockResolvedValue(Response.json({ rows: "bad" })), storage);
    expect(result.mode).toBe("saved"); expect(cache.put).not.toHaveBeenCalled();
  });
  it("rejects corrupted cache when no usable source remains", async () => {
    const { loadCatalogResearch } = await import("./catalog-research-data"); const { storage } = fakeStorage(Response.json({ version: 1 }));
    await expect(loadCatalogResearch(true, vi.fn<typeof fetch>().mockRejectedValue(new Error("network down")), storage)).rejects.toThrow("network down");
  });
  it("retains the already-loaded in-memory index after refresh failure", async () => {
    const { loadCatalogResearch } = await import("./catalog-research-data");
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(snapshot)).mockRejectedValueOnce(new Error("offline"));
    await loadCatalogResearch(false, request); const result = await loadCatalogResearch(true, request);
    expect(result.mode).toBe("saved"); expect(result.dataset.works).toHaveLength(1);
  });
  it("continues online when browser storage quota is unavailable", async () => {
    const { loadCatalogResearch } = await import("./catalog-research-data"); const storage = { open: async () => { throw new Error("QuotaExceeded"); } } as unknown as CacheStorage;
    const result = await loadCatalogResearch(true, vi.fn<typeof fetch>().mockResolvedValue(Response.json(snapshot)), storage);
    expect(result.offlineReady).toBe(false); expect(result.mode).toBe("network");
  });
  it.each([new Response("<html>SPA fallback</html>", { headers: { "content-type": "text/html" } }), new Response("{}", { headers: { "content-type": "application/json", "content-length": String(33 * 1024 * 1024) } }), new Response("{}", { status: 503, headers: { "content-type": "application/json" } })])("rejects HTML, oversized and unavailable upstreams", async (response) => {
    const { loadCatalogResearch } = await import("./catalog-research-data"); await expect(loadCatalogResearch(true, vi.fn<typeof fetch>().mockResolvedValue(response))).rejects.toThrow();
  });
});
