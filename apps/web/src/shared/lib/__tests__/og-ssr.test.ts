import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import productionHandler from "../../../../../../api/og.js";

const RESOURCE = "123e4567-e89b-42d3-a456-426614174000";
function response() {
  const state = { status: 0, html: "" };
  const res = {
    setHeader: vi.fn(),
    status: vi.fn((code: number) => {
      state.status = code;
      return { send: (html: string) => { state.html = html; } };
    }),
  };
  return { state, res };
}

describe("OG local metadata, visibility and SSR safety", () => {
  const readTitle = vi.fn();
  const readMarketResource = vi.fn();
  const fetch = vi.fn(() => { throw new Error("OG must not call HTTP"); });
  const handler = productionHandler.createOgHandler({ readTitle, readMarketResource });
  beforeEach(() => {
    vi.stubEnv("CANONICAL_HOST", "test-canonical.com");
    vi.stubGlobal("fetch", fetch);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); readTitle.mockReset(); readMarketResource.mockReset(); });

  it("serves the human SPA without reading metadata or calling HTTP", async () => {
    const { res, state } = response();
    await handler({ query: { slug: "test" }, headers: { "user-agent": "Mozilla/5.0" } }, res);
    expect(state.status).toBe(200);
    expect(state.html).toContain("<!doctype html>");
    expect(readTitle).not.toHaveBeenCalled();
    expect(readMarketResource).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps canonical host, cover URLs and Book JSON-LD without self-fetching", async () => {
    readTitle.mockResolvedValue({ title: "테스트 웹툰", synopsis: "재미있는 웹툰 설명",
      coverImage: "/covers/test.png", author: "작가A", genres: ["일상", "개그"],
      releaseYear: 2025, stats: { ratingCount: 150, ratingAvg: 4.8 } });
    const { res, state } = response();
    await handler({ query: { slug: "test-webtoon" }, headers: {
      "user-agent": "facebookexternalhit/1.1", host: "attacker.invalid", "x-forwarded-host": "metadata.internal",
    } }, res);
    expect(readTitle).toHaveBeenCalledExactlyOnceWith("test-webtoon");
    expect(fetch).not.toHaveBeenCalled();
    expect(state.status).toBe(200);
    expect(state.html).toContain("<title>테스트 웹툰 · 툰스펙트럼</title>");
    expect(state.html).toContain('content="작가A · 일상 · 개그 — 재미있는 웹툰 설명"');
    expect(state.html).toContain('href="https://test-canonical.com/title/test-webtoon"');
    expect(state.html).toContain('content="https://test-canonical.com/covers/test.png"');
    expect(state.html).not.toMatch(/attacker.invalid|metadata.internal/);
    const graph = JSON.parse([...state.html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gu)].at(-1)?.[1] ?? "null");
    expect(graph["@context"]).toBe("https://schema.org");
    expect(graph["@graph"][0]).toMatchObject({ "@type": "Book", name: "테스트 웹툰",
      author: { name: "작가A" }, aggregateRating: { ratingValue: 4.8, ratingCount: 150 } });
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "public, max-age=300, s-maxage=86400");
  });

  it("defaults generated canonical URLs to www.toonstudio.cloud", async () => {
    vi.stubEnv("CANONICAL_HOST", "");
    readTitle.mockResolvedValue({ title: "Canonical" });
    const { res, state } = response();
    await handler({ query: { slug: "canonical-probe" }, headers: { "user-agent": "Twitterbot" } }, res);
    expect(state.html).toContain('href="https://www.toonstudio.cloud/title/canonical-probe"');
    expect(fetch).not.toHaveBeenCalled();
  });

  it("escapes market metadata, preserves CreativeWork/Breadcrumbs and never caches releases", async () => {
    readMarketResource.mockResolvedValue({ id: RESOURCE, name: "먹선 </script><script>alert(1)</script>",
      description: "웹툰 펜선용 브러시", kind: "brush", resourceVersion: "1.2.0", license: "cc-by-4.0",
      tags: ["잉크", "선화"], publisher: { id: "publisher", name: "김작가" },
      createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z" });
    const { res, state } = response();
    await handler({ query: { marketResourceId: RESOURCE }, headers: { "user-agent": "Googlebot", host: "attacker.invalid" } }, res);
    expect(readMarketResource).toHaveBeenCalledExactlyOnceWith(RESOURCE);
    expect(state.html).toContain(`href="https://test-canonical.com/market/resource/${RESOURCE}"`);
    expect(state.html).toContain('<meta property="og:type" content="article" />');
    expect(state.html).toContain("먹선 &lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(state.html).not.toContain("</script><script>alert(1)</script>");
    const graph = JSON.parse([...state.html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gu)].at(-1)?.[1] ?? "null");
    expect(graph["@graph"][0]).toMatchObject({ "@type": "CreativeWork", version: "1.2.0", isAccessibleForFree: true,
      author: { "@type": "Person", name: "김작가" }, license: "https://creativecommons.org/licenses/by/4.0/" });
    expect(graph["@graph"][1]["@type"]).toBe("BreadcrumbList");
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not reuse a resource after its public reader reports hidden/deleted", async () => {
    readMarketResource.mockResolvedValueOnce({ id: RESOURCE, name: "Visible", kind: "brush", publisher: { name: "Author" } })
      .mockRejectedValueOnce(new Error("not public"));
    const request = { query: { marketResourceId: RESOURCE }, headers: { "user-agent": "Twitterbot" } };
    const first = response(); const second = response();
    await handler(request, first.res); await handler(request, second.res);
    expect(first.state.html).toContain("Visible"); expect(second.state.html).not.toContain("Visible");
    expect(readMarketResource).toHaveBeenCalledTimes(2);
    expect(second.res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
  });

  it("keeps cacheable static discovery metadata without any reader", async () => {
    const { res, state } = response();
    await handler({ query: { marketPage: "browse" }, headers: { "user-agent": "Googlebot" } }, res);
    expect(state.html).toContain("<title>마켓 탐색 · 툰스펙트럼</title>");
    expect(state.html).toContain('href="https://test-canonical.com/market/browse"');
    expect(state.html).toContain('"@type":"SearchResultsPage"');
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "public, max-age=300, s-maxage=86400");
    expect(readTitle).not.toHaveBeenCalled(); expect(readMarketResource).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["../../metadata", RESOURCE + "\n", ""]) ("rejects malformed release ID %j before the reader", async (id) => {
    const { res } = response();
    await handler({ query: { marketResourceId: id }, headers: { "user-agent": "Twitterbot" } }, res);
    expect(readMarketResource).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
  });

  it("keeps metadata misses and errors as a no-store SPA fallback", async () => {
    readTitle.mockRejectedValue(new Error("missing shard"));
    const { res, state } = response();
    await handler({ query: { slug: "missing" }, headers: { "user-agent": "Twitterbot" } }, res);
    expect(state.status).toBe(200); expect(state.html).toContain("<!doctype html>");
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
  });
});
