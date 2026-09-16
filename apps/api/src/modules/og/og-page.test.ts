import { afterEach, describe, expect, it, vi } from "vitest";

import { renderOgPage } from "./og-page";

const RESOURCE_ID = "123e4567-e89b-42d3-a456-426614174000";
const crawler = "Googlebot/2.1";

function lastJsonLd(html: string): Record<string, unknown> {
  const values = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gu)];
  return JSON.parse(values.at(-1)?.[1] ?? "null") as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("provider-neutral OG rendering", () => {
  it("keeps ordinary browsers on a no-store shell without metadata reads", async () => {
    const readTitle = vi.fn();
    const readMarketResource = vi.fn();
    const result = await renderOgPage({
      query: { slug: "test" },
      userAgent: "Mozilla/5.0",
      readers: { readTitle, readMarketResource },
    });

    expect(result.source).toBe("site");
    expect(result.cacheControl).toBe("no-store");
    expect(result.html).toContain("<!doctype html>");
    expect(readTitle).not.toHaveBeenCalled();
    expect(readMarketResource).not.toHaveBeenCalled();
  });

  it("renders canonical title metadata without trusting request hosts or using HTTP", async () => {
    const fetch = vi.fn(() => { throw new Error("OG rendering must not call HTTP"); });
    vi.stubGlobal("fetch", fetch);
    const readTitle = vi.fn().mockResolvedValue({
      title: "테스트 웹툰",
      synopsis: "재미있는 웹툰 설명",
      coverImage: "/covers/test.png",
      author: "작가A",
      genres: ["일상", "개그"],
      releaseYear: 2025,
      stats: { ratingCount: 150, ratingAvg: 4.8 },
    });

    const result = await renderOgPage({
      query: { slug: "test-webtoon" },
      userAgent: "facebookexternalhit/1.1",
      canonicalHost: "test-canonical.com",
      readers: { readTitle },
    });

    expect(readTitle).toHaveBeenCalledExactlyOnceWith("test-webtoon");
    expect(fetch).not.toHaveBeenCalled();
    expect(result.cacheControl).toBe("public, max-age=300, s-maxage=86400");
    expect(result.html).toContain("<title>테스트 웹툰 · 툰스튜디오</title>");
    expect(result.html).toContain('content="작가A · 일상 · 개그 — 재미있는 웹툰 설명"');
    expect(result.html).toContain('href="https://test-canonical.com/title/test-webtoon"');
    expect(result.html).toContain('content="https://test-canonical.com/covers/test.png"');
    const graph = lastJsonLd(result.html)["@graph"] as Array<Record<string, unknown>>;
    expect(graph[0]).toMatchObject({
      "@type": "Book",
      name: "테스트 웹툰",
      author: { name: "작가A" },
      aggregateRating: { ratingValue: 4.8, ratingCount: 150 },
    });
  });

  it("falls back to the production canonical host for invalid configuration", async () => {
    const result = await renderOgPage({
      query: { slug: "canonical-probe" },
      userAgent: crawler,
      canonicalHost: "https://attacker.invalid/path",
      readers: { readTitle: () => ({ title: "Canonical" }) },
    });

    expect(result.html).toContain(
      'href="https://www.toonstudio.cloud/title/canonical-probe"',
    );
    expect(result.html).not.toContain("attacker.invalid");
  });

  it("escapes marketplace metadata and rechecks mutable visibility", async () => {
    const readMarketResource = vi.fn()
      .mockResolvedValueOnce({
        id: RESOURCE_ID,
        name: "먹선 </script><script>alert(1)</script>",
        description: "웹툰 펜선용 브러시",
        kind: "brush",
        resourceVersion: "1.2.0",
        license: "cc-by-4.0",
        tags: ["잉크", "선화"],
        publisher: { name: "김작가" },
        createdAt: "2026-08-20T00:00:00.000Z",
        updatedAt: "2026-08-30T00:00:00.000Z",
      })
      .mockRejectedValueOnce(new Error("not public"));
    const input = {
      query: { marketResourceId: RESOURCE_ID },
      userAgent: "Twitterbot",
      canonicalHost: "test-canonical.com",
      readers: { readMarketResource },
    } as const;

    const visible = await renderOgPage(input);
    const hidden = await renderOgPage(input);

    expect(readMarketResource).toHaveBeenCalledTimes(2);
    expect(visible.cacheControl).toBe("no-store");
    expect(visible.html).toContain("먹선 &lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(visible.html).not.toContain("</script><script>alert(1)</script>");
    const graph = lastJsonLd(visible.html)["@graph"] as Array<Record<string, unknown>>;
    expect(graph[0]).toMatchObject({
      "@type": "CreativeWork",
      version: "1.2.0",
      isAccessibleForFree: true,
      author: { "@type": "Person", name: "김작가" },
      license: "https://creativecommons.org/licenses/by/4.0/",
    });
    expect(hidden.source).toBe("fallback");
    expect(hidden.html).not.toContain("김작가");
  });

  it("renders cacheable marketplace discovery metadata without readers", async () => {
    const result = await renderOgPage({
      query: { marketPage: "browse" },
      userAgent: crawler,
      canonicalHost: "test-canonical.com",
    });

    expect(result.source).toBe("market");
    expect(result.cacheControl).toBe("public, max-age=300, s-maxage=86400");
    expect(result.html).toContain("<title>마켓 탐색 · 툰스튜디오</title>");
    expect(result.html).toContain('href="https://test-canonical.com/market/browse"');
    expect(result.html).toContain('"@type":"SearchResultsPage"');
  });

  it.each(["../../metadata", `${RESOURCE_ID}\n`, ""])(
    "rejects malformed marketplace identifiers before the reader: %j",
    async (identifier) => {
      const readMarketResource = vi.fn();
      const result = await renderOgPage({
        query: { marketResourceId: identifier },
        userAgent: crawler,
        readers: { readMarketResource },
      });

      expect(readMarketResource).not.toHaveBeenCalled();
      expect(result.source).toBe("fallback");
      expect(result.cacheControl).toBe("no-store");
    },
  );
});
