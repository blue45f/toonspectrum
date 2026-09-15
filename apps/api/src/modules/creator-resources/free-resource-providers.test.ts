import { describe, expect, it, vi } from "vitest";

import { googleBooksUrl } from "./google-books-provider";
import { polyHavenUrl } from "./polyhaven-provider";
import { createResourceEngine } from "./resource-engine";
import { parseResource, parseSearchResult } from "../../../../web/src/shared/lib/creator-resources";

const stamp = "2026-09-15T12:00:00.000Z";

describe("Google Books provider", () => {
  it("keeps the server key out of the URL and bounds pagination", () => {
    const url = googleBooksUrl("graphic novel & key=evil", 2);
    expect(url.hostname).toBe("www.googleapis.com");
    expect(url.searchParams.get("q")).toBe("graphic novel & key=evil");
    expect(url.searchParams.get("startIndex")).toBe("12");
    expect(url.searchParams.get("maxResults")).toBe("12");
    expect(url.searchParams.has("key")).toBe(false);
  });

  it("uses a restricted server header and returns metadata-only records", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("books-key");
      return Response.json({ totalItems: 1, items: [{
        id: "book_1",
        volumeInfo: {
          title: "Drawing Comics",
          authors: ["A. Artist"],
          publisher: "Studio Press",
          publishedDate: "2026-09-01",
          industryIdentifiers: [{ type: "ISBN_13", identifier: "9781234567897" }],
          categories: ["Comics & Graphic Novels"],
          language: "en",
          pageCount: 240,
          description: "A practical guide",
        },
      }] });
    });
    const engine = createResourceEngine({ fetch: fetcher, env: () => ({ GOOGLE_BOOKS_API_KEY: "books-key" }), now: () => Date.parse(stamp) });
    const result = await engine.search({ provider: "googlebooks", q: "drawing comics" });
    expect(result.status).toBe("ready");
    expect(result.items[0]).toMatchObject({ provider: "googlebooks", license: "metadata-only", title: "Drawing Comics" });
    expect(result.items[0].imageUrl).toBeUndefined();
    expect(result.items[0].sourceUrl).toBe("https://books.google.com/books?id=book_1");
    expect(parseSearchResult(result)).not.toBeNull();
  });

  it("reports an explicit unconfigured state without an upstream call", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await createResourceEngine({ fetch: fetcher, env: () => ({}) }).search({ provider: "googlebooks", q: "manga" });
    expect(result.status).toBe("not_configured");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("Poly Haven provider", () => {
  it("uses the three bounded metadata feeds", () => {
    expect(polyHavenUrl("hdris").searchParams.get("type")).toBe("hdris");
    expect(polyHavenUrl("textures").searchParams.get("type")).toBe("textures");
    expect(polyHavenUrl("models").searchParams.get("type")).toBe("models");
  });

  it("searches cached CC0 metadata and preserves mandatory attribution", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (raw, init) => {
      const url = new URL(String(raw));
      expect(new Headers(init?.headers).get("user-agent")).toContain("ToonSpectrum/1.0");
      const type = url.searchParams.get("type");
      if (type === "models") return Response.json({
        wooden_chair: {
          name: "Wooden Chair",
          description: "A production-ready chair model",
          category: "Furniture/Seating",
          tags: ["chair", "wood", "furniture"],
          type: 2,
          authors: { "Poly Artist": "All" },
          max_resolution: [8192, 8192],
          polycount: 12000,
          download_count: 500,
          date_published: 1_725_148_800,
          thumbnail_url: "https://cdn.polyhaven.com/asset_img/thumbs/wooden_chair.png?width=256&height=256",
        },
      });
      return Response.json({});
    });
    const engine = createResourceEngine({ fetch: fetcher, env: () => ({}), now: () => Date.parse(stamp) });
    const result = await engine.search({ provider: "polyhaven", q: "의자" });
    expect(result.status).toBe("ready");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ provider: "polyhaven", license: "CC0", title: "Wooden Chair", credit: "Poly Haven · Poly Artist" });
    expect(parseResource(result.items[0])?.imageUrl).toContain("cdn.polyhaven.com");
    await engine.search({ provider: "polyhaven", q: "wood" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("rejects forged thumbnail hosts during shared-contract parsing", () => {
    expect(parseResource({
      id: "polyhaven:chair", provider: "polyhaven", title: "Chair",
      sourceUrl: "https://polyhaven.com/a/chair", imageUrl: "https://evil.test/chair.png",
      license: "CC0", fetchedAt: stamp,
    })?.imageUrl).toBeUndefined();
  });
});
