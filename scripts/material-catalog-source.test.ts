import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assembleMaterialCatalog, fetchMaterialJson, MATERIAL_ENDPOINTS, MATERIAL_FETCH_TIMEOUT_MS,
  MATERIAL_MAX_RESPONSE_BYTES, MATERIAL_USER_AGENT, normalizeAmbientCG, normalizePolyHaven, selectDiverseMaterials,
} from "./material-catalog-source";

const row = { name: "Wood chair", type: 2, tags: ["wood", "chair"], categories: ["indoor"], authors: { Artist: "All" }, thumbnail_url: "https://cdn.polyhaven.com/asset_img/thumbs/chair.png" };
const jsonResponse = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
afterEach(() => vi.useRealTimers());

describe("fixed-source snapshot normalization", () => {
  it.each([[0, "hdri"], [1, "texture"], [2, "model"]])("maps real Poly Haven type %s to %s", (type, kind) => expect(normalizePolyHaven({ chair: { ...row, type } })[0].kind).toBe(kind));
  it("omits invalid IDs, unexpected types and raw URLs", () => {
    expect(normalizePolyHaven({ "../escape": row, invalid: { ...row, type: 4 }, chair: { ...row, url: "https://evil.test" } })).toHaveLength(1);
    expect(normalizePolyHaven({ chair: row })[0].sourceUrl).toBe("https://polyhaven.com/a/chair");
  });
  it("reads only supported ambientCG material rows", () => {
    const result = normalizeAmbientCG({ foundAssets: [{ assetId: "Wood001", dataType: "Material", displayName: "Wood 001", tags: ["wood"], previewImage: {} }, { assetId: "unrelated", dataType: "Photo" }] });
    expect(result).toHaveLength(1); expect(result[0].sourceUrl).toBe("https://ambientcg.com/a/Wood001"); expect(result[0].license).toBe("CC0-1.0");
  });
  it("rejects unexpected upstream response schemas", () => { expect(() => normalizeAmbientCG([])).toThrow(); expect(() => normalizePolyHaven([])).toThrow(); });
  it("bounds a diverse catalog without mutating source ordering", () => {
    const data = normalizePolyHaven(Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`asset_${i}`, row])));
    const before = [...data]; expect(selectDiverseMaterials(data)).toHaveLength(32); expect(data).toEqual(before);
  });
  it("requires both sources and three kinds before replacing a snapshot", () => {
    const poly = [0, 1, 2].map((type) => normalizePolyHaven({ [`item${type}`]: { ...row, type } }));
    const ambient = [normalizeAmbientCG({ foundAssets: [{ assetId: "Wood001", dataType: "Material" }] })];
    expect(assembleMaterialCatalog(poly, ambient, "2026-09-14T00:00:00.000Z").assets).toHaveLength(4);
    expect(() => assembleMaterialCatalog(poly, [], "2026-09-14T00:00:00.000Z")).toThrow();
    expect(() => assembleMaterialCatalog(poly.slice(1), ambient, "2026-09-14T00:00:00.000Z")).toThrow();
  });
});
describe("bounded official API transport", () => {
  it("permits eleven exact endpoints; never follows arbitrary or pagination URLs", async () => {
    expect(MATERIAL_ENDPOINTS).toHaveLength(11); const fetcher = vi.fn();
    await expect(fetchMaterialJson("https://evil.test", fetcher)).rejects.toThrow("Unapproved");
    await expect(fetchMaterialJson(MATERIAL_ENDPOINTS[0] + "&offset=99", fetcher)).rejects.toThrow("Unapproved"); expect(fetcher).not.toHaveBeenCalled();
  });
  it("identifies ToonStudio and rejects redirects", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ ok: true }));
    await expect(fetchMaterialJson(MATERIAL_ENDPOINTS[0], fetcher)).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith(MATERIAL_ENDPOINTS[0], expect.objectContaining({ headers: { Accept: "application/json", "User-Agent": MATERIAL_USER_AGENT }, redirect: "error", signal: expect.any(AbortSignal) }));
  });
  it.each([403, 429, 500])("does not retry or use paid fallback on HTTP %s", async (status) => {
    const fetcher = vi.fn(async () => new Response("failure", { status }));
    await expect(fetchMaterialJson(MATERIAL_ENDPOINTS[0], fetcher)).rejects.toThrow(`HTTP ${status}`); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects HTML and malformed JSON", async () => {
    await expect(fetchMaterialJson(MATERIAL_ENDPOINTS[0], async () => new Response("<html>"))).rejects.toThrow();
    await expect(fetchMaterialJson(MATERIAL_ENDPOINTS[0], async () => new Response("invalid", { headers: { "content-type": "application/json" } }))).rejects.toThrow();
  });
  it("rejects declared and streaming oversize responses", async () => {
    await expect(fetchMaterialJson(MATERIAL_ENDPOINTS[0], async () => new Response("{}", { headers: { "content-type": "application/json", "content-length": String(MATERIAL_MAX_RESPONSE_BYTES + 1) } }))).rejects.toThrow("byte limit");
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(MATERIAL_MAX_RESPONSE_BYTES + 1)); controller.close(); } });
    await expect(fetchMaterialJson(MATERIAL_ENDPOINTS[0], async () => new Response(body, { headers: { "content-type": "application/json" } }))).rejects.toThrow("byte limit");
  });
  it("aborts stalled requests at the fixed deadline", async () => {
    vi.useFakeTimers();
    const fetcher: typeof fetch = (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    const outcome = expect(fetchMaterialJson(MATERIAL_ENDPOINTS[0], fetcher)).rejects.toThrow("aborted");
    await vi.advanceTimersByTimeAsync(MATERIAL_FETCH_TIMEOUT_MS); await outcome;
  });
});
