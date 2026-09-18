import { afterEach, describe, expect, it, vi } from "vitest";

import { renderOgPage } from "./og-page";

const RESOURCE_ID = "123e4567-e89b-42d3-a456-426614174000";
const crawler = "Googlebot/2.1";

function lastJsonLd(html: string): Record<string, unknown> {
  const openingTag = '<script type="application/ld+json">';
  const start = html.lastIndexOf(openingTag);
  if (start < 0) throw new Error("rendered page has no JSON-LD script");
  const contentStart = start + openingTag.length;
  const end = html.indexOf("</script>", contentStart);
  if (end < 0) throw new Error("rendered JSON-LD script is not closed");
  return JSON.parse(html.slice(contentStart, end)) as Record<string, unknown>;
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

  it("renders crawler metadata for static public share pages", async () => {
    const readCreatorWork = vi.fn();
    const result = await renderOgPage({
      query: { publicPath: "/ranking" },
      userAgent: "KAKAOTALK-scrap/1.0",
      canonicalHost: "test-canonical.com",
      readers: { readCreatorWork },
    });

    expect(result.source).toBe("public");
    expect(result.cacheControl).toBe("public, max-age=300, s-maxage=86400");
    expect(result.html).toContain("툰스튜디오 통합 랭킹");
    expect(result.html).toContain('href="https://test-canonical.com/ranking"');
    expect(readCreatorWork).not.toHaveBeenCalled();
  });

  it("renders a public creator work and normalizes showcase aliases", async () => {
    const readCreatorWork = vi.fn().mockResolvedValue({
      id: "work-1",
      title: "공개 작품",
      description: "작품 설명",
      status: "published",
      cover: "/covers/work-1.png",
      author: { id: "author-1", name: "김작가" },
      doc: { publication: { visibility: "unlisted", socialTitle: "공유 제목" } },
    });
    const result = await renderOgPage({
      query: { publicPath: "/showcase/work/work-1" },
      userAgent: "facebookexternalhit/1.1",
      canonicalHost: "test-canonical.com",
      readers: { readCreatorWork },
    });

    expect(readCreatorWork).toHaveBeenCalledExactlyOnceWith("work-1");
    expect(result.source).toBe("public");
    expect(result.cacheControl).toBe("no-store");
    expect(result.html).toContain("공유 제목 · 툰스튜디오");
    expect(result.html).toContain('href="https://test-canonical.com/create/work-1"');
    expect(result.html).toContain("https://test-canonical.com/covers/work-1.png");
  });

  it.each([
    {
      publicPath: "/author/%EA%B9%80%EC%9E%91%EA%B0%80",
      readerName: "readAuthor",
      value: {
        author: "김작가",
        genres: ["판타지", "드라마"],
        works: [{ coverImage: "/covers/author.png" }],
      },
      expected: "김작가 작가",
      canonicalPath: "/author/%EA%B9%80%EC%9E%91%EA%B0%80",
    },
    {
      publicPath: "/u/creator-1",
      readerName: "readCreatorProfile",
      value: { id: "creator-1", name: "희준", bio: "웹툰 창작자", avatar: "/avatars/creator.png" },
      expected: "희준 창작자 프로필",
      canonicalPath: "/u/creator-1",
    },
    {
      publicPath: "/create/series/series-1",
      readerName: "readCreatorSeries",
      value: {
        id: "series-1",
        title: "연재 작품",
        description: "공개 연재 소개",
        author: { name: "시리즈 작가" },
        episodeList: [{ id: "episode-1", status: "published" }],
      },
      expected: "연재 작품",
      canonicalPath: "/create/series/series-1",
    },
    {
      publicPath: "/community/post/post-1",
      readerName: "readCommunityPost",
      value: { id: "post-1", title: "공개 토론", text: "함께 이야기해요", scope: "title" },
      expected: "공개 토론",
      canonicalPath: "/community/post/post-1",
    },
    {
      publicPath: "/community/cafes/open-cafe",
      readerName: "readCommunityCafe",
      value: { id: "cafe-1", name: "공개 카페", description: "누구나 읽는 카페", visibility: "public", status: "active" },
      expected: "공개 카페",
      canonicalPath: "/community/cafes/open-cafe",
    },
    {
      publicPath: "/collaborate/job-1",
      readerName: "readCollaboration",
      value: { id: "job-1", title: "배경 작가 모집", role: "background", hidden: false, status: "open", expired: false, details: { description: "함께 제작해요" } },
      expected: "배경 작가 모집",
      canonicalPath: "/collaborate/job-1",
    },
    {
      publicPath: "/community/promote/promo-1",
      readerName: "readPromotion",
      value: { post: { id: "promo-1", title: "신작 소개", seriesTitle: "별의 거리", description: "공개 홍보", hidden: false, archived: false, cover: "/covers/promo.png" } },
      expected: "신작 소개 · 별의 거리",
      canonicalPath: "/community/promote/promo-1",
    },
  ] as const)(
    "renders durable public metadata for $publicPath",
    async ({ publicPath, readerName, value, expected, canonicalPath }) => {
      const reader = vi.fn().mockResolvedValue(value);
      const readers = { [readerName]: reader } as NonNullable<
        NonNullable<Parameters<typeof renderOgPage>[0]>["readers"]
      >;
      const result = await renderOgPage({
        query: { publicPath },
        userAgent: crawler,
        canonicalHost: "test-canonical.com",
        readers,
      });

      expect(reader).toHaveBeenCalledOnce();
      expect(result.source).toBe("public");
      expect(result.html).toContain(expected);
      expect(result.html).toContain(`href="https://test-canonical.com${canonicalPath}"`);
    },
  );

  it("renders the public pencafe route without inventing private source data", async () => {
    const result = await renderOgPage({
      query: { publicPath: "/pencafe/%EB%B2%88%EC%97%AD%EC%9E%90" },
      userAgent: crawler,
      canonicalHost: "test-canonical.com",
    });

    expect(result.source).toBe("public");
    expect(result.cacheControl).toBe("public, max-age=300, s-maxage=86400");
    expect(result.html).toContain("번역자 펜카페");
    expect(result.html).toContain(
      'href="https://test-canonical.com/pencafe/%EB%B2%88%EC%97%AD%EC%9E%90"',
    );
  });

  it("rejects editor and moderation aliases before public readers run", async () => {
    const readCollaboration = vi.fn();
    const readPromotion = vi.fn();
    for (const publicPath of [
      "/collaborate/new",
      "/collaborate/moderation",
      "/community/promote/new",
      "/community/promote/moderation",
    ]) {
      const result = await renderOgPage({
        query: { publicPath },
        userAgent: crawler,
        readers: { readCollaboration, readPromotion },
      });
      expect(result.source).toBe("fallback");
      expect(result.cacheControl).toBe("no-store");
    }
    expect(readCollaboration).not.toHaveBeenCalled();
    expect(readPromotion).not.toHaveBeenCalled();
  });

  it.each([
    ["/create/private-work", "readCreatorWork", { title: "비공개 작품", status: "published", doc: { publication: { visibility: "private" } } }],
    ["/community/post/cafe-post", "readCommunityPost", { title: "카페 전용 글", scope: "cafe", text: "비공개" }],
    ["/community/cafes/private-cafe", "readCommunityCafe", { name: "비공개 카페", visibility: "private", status: "active" }],
    ["/collaborate/closed", "readCollaboration", { title: "마감 공고", hidden: false, status: "closed", expired: false }],
    ["/community/promote/hidden", "readPromotion", { post: { title: "숨김 홍보", hidden: true, archived: false } }],
  ] as const)("does not leak non-shareable metadata for %s", async (publicPath, readerName, value) => {
    const reader = vi.fn().mockResolvedValue(value);
    const result = await renderOgPage({
      query: { publicPath },
      userAgent: crawler,
      readers: { [readerName]: reader },
    });

    expect(reader).toHaveBeenCalledOnce();
    expect(result.source).toBe("fallback");
    expect(result.cacheControl).toBe("no-store");
    expect(result.html).not.toContain("비공개 작품");
    expect(result.html).not.toContain("카페 전용 글");
    expect(result.html).not.toContain("비공개 카페");
    expect(result.html).not.toContain("마감 공고");
    expect(result.html).not.toContain("숨김 홍보");
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
