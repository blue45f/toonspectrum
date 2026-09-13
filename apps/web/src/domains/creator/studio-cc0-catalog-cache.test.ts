import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadStudioCc0Catalog, STUDIO_CC0_DELIVERY_ROOT } from "./studio-cc0-asset-delivery";

afterEach(() => vi.unstubAllGlobals());

describe("mutable CC0 catalog cache recovery", () => {
  it("revalidates the versioned manifest instead of reusing a year-long HTTP entry", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      schema: "toonspectrum.asset-delivery.v1", assets: [],
    })));
    vi.stubGlobal("fetch", fetch);
    expect(await loadStudioCc0Catalog()).toEqual([]);
    expect(fetch).toHaveBeenCalledWith(
      `${STUDIO_CC0_DELIVERY_ROOT}manifest.json?v=diversity-20260913`,
      expect.objectContaining({ cache: "no-cache", credentials: "same-origin", redirect: "error" }),
    );
  });

  it("propagates cancellation while fetching the manifest", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError"));
    vi.stubGlobal("fetch", fetch);
    controller.abort();
    await expect(loadStudioCc0Catalog(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch.mock.calls[0]?.[1].signal).toBe(controller.signal);
  });

  it("overrides immutable asset headers for the mutable catalog only", () => {
    const config = JSON.parse(readFileSync(new URL("../../../../../vercel.json", import.meta.url), "utf8")) as {
      headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
    };
    const general = config.headers.findIndex(rule => rule.source === "/assets/(.*)");
    const catalog = config.headers.findIndex(rule => rule.source === `${STUDIO_CC0_DELIVERY_ROOT}manifest.json`);
    expect(general).toBeGreaterThanOrEqual(0);
    expect(catalog).toBeGreaterThan(general);
    const headers = Object.fromEntries(config.headers[catalog]!.headers.map(item => [item.key, item.value]));
    expect(headers["Cache-Control"]).toBe("public, max-age=0, must-revalidate");
    expect(headers["CDN-Cache-Control"]).toBe("no-cache");
    expect(headers["Vercel-CDN-Cache-Control"]).toBe("no-cache");
    expect(config.headers[general]!.headers.find(item => item.key === "Cache-Control")?.value)
      .toContain("immutable");
  });
});
