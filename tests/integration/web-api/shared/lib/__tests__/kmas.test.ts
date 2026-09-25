import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearKmasLookupCacheForTests,
  enrichTitleWithKmas,
  getKmasBookAndWebtoonProxyResponse,
  kmasItemToTitle,
  kmasItems,
  kmasLookupCacheDiagnostics,
  mergeKmasItemIntoTitle,
  type KmasBookAndWebtoonResponse,
} from "../../../../../../apps/api/src/server/kmas";

import type { Title } from "../../../../../../apps/web/src/shared/lib/types";

const sampleItem = {
  prdctNm: "원피스",
  title: "[전자책]원피스 112권",
  pictrWritrNm: "오다 에이치로",
  sntncWritrNm: "오다 에이치로",
  mainGenreCdNm: "판타지",
  outline: "해적왕이라 불리웠던 'G 로저'가 남긴 보물을 둘러싸고 펼쳐지는 대해적 시대.",
  isbn: "9791132364474",
  ageGradCdNm: "전체연령",
  imageDownloadUrl: "https://www.kmas.or.kr:443/common/file/atchmnflDownload.ajax?fileImageId=82e7c463",
};

function existingTitle(title: string): Title {
  return {
    id: `test-${title}`, slug: `test-${title}`, type: "webtoon", title, author: "테스트 작가",
    genres: ["드라마"], tags: [], synopsis: "기존 줄거리",
    cover: ["oklch(0.45 0.14 35)", "oklch(0.28 0.1 75)"],
    status: "ongoing", ageRating: "all", releaseYear: 2024,
    availability: [{ platformId: "kmas", pricing: "free" }],
    stats: { views: 1, likes: 1, bookmarks: 1, ratingAvg: 4.2, ratingCount: 10,
      ratingDist: [1, 1, 2, 3, 3], rankDelta: 0, trendingScore: 50, completionRate: 70, bingeIndex: 70 },
  };
}

afterEach(() => {
  clearKmasLookupCacheForTests();
  vi.useRealTimers();
});

describe("kmas integration helpers", () => {
  it("실제 KMAS 응답 구조인 최상위 itemList를 읽는다", () => {
    const response: KmasBookAndWebtoonResponse = {
      result: {
        viewItemCnt: 1,
        pageNo: 1,
        resultState: "success",
        resultMessage: "성공",
        totalCount: 1,
      },
      itemList: [sampleItem],
    };

    expect(kmasItems(response)).toEqual([sampleItem]);
  });

  it("문서 표기의 result.itemlist도 하위호환으로 읽는다", () => {
    const response: KmasBookAndWebtoonResponse = {
      result: {
        resultState: "success",
        resultMessage: "성공",
        itemlist: [sampleItem],
      },
    };

    expect(kmasItems(response)).toEqual([sampleItem]);
  });

  it("KMAS item을 앱 Title로 정규화하면서 imageDownloadUrl을 그대로 노출한다", () => {
    const title = kmasItemToTitle(sampleItem, 0);

    expect(title.id).toBe("kmas-9791132364474");
    expect(title.title).toBe("원피스");
    expect(title.author).toBe("오다 에이치로");
    expect(title.genres).toEqual(["판타지"]);
    expect(title.availability[0].platformId).toBe("kmas");
    expect(title.coverImage).toBe(sampleItem.imageDownloadUrl);
  });

  it("빈 프록시 쿼리는 KMAS 전체 목록 호출을 위해 prvKey 외 파라미터를 붙이지 않는다", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ result: { resultState: "success" }, itemList: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      await getKmasBookAndWebtoonProxyResponse({}, { KMAS_PRV_KEY: "test-key" });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const url = new URL(calls[0]);
    expect([...url.searchParams.keys()]).toEqual(["prvKey"]);
  });

  it("기존 Title에 KMAS 표지와 줄거리를 병합한다", () => {
    const existing: Title = {
      id: "nw-1",
      slug: "nw-1",
      type: "webtoon",
      title: "원피스",
      author: "오다 에이치로",
      genres: ["드라마"],
      tags: [],
      synopsis: "기존 줄거리",
      cover: ["oklch(0.45 0.14 35)", "oklch(0.28 0.1 75)"],
      coverImage: "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F1.jpg",
      status: "ongoing",
      ageRating: "15",
      releaseYear: 2024,
      availability: [{ platformId: "naver-webtoon", pricing: "free" }],
      stats: {
        views: 1,
        likes: 1,
        bookmarks: 1,
        ratingAvg: 4.2,
        ratingCount: 10,
        ratingDist: [1, 1, 2, 3, 3],
        rankDelta: 0,
        trendingScore: 50,
        completionRate: 70,
        bingeIndex: 70,
      },
    };

    expect(mergeKmasItemIntoTitle(existing, sampleItem)).toBe(true);
    expect(existing.synopsis).toBe(sampleItem.outline);
    expect(existing.ageRating).toBe("all");
    expect(existing.genres[0]).toBe("판타지");
    expect(existing.coverImage).toContain("kmas.or.kr");
  });

  it("이미지 생략 옵션으로 병합하면 coverImage를 저장하지 않는다", () => {
    const existing: Title = {
      id: "nw-2",
      slug: "nw-2",
      type: "webtoon",
      title: "원피스",
      author: "오다 에이치로",
      genres: ["드라마"],
      tags: [],
      synopsis: "기존 줄거리",
      cover: ["oklch(0.45 0.14 35)", "oklch(0.28 0.1 75)"],
      coverImage: "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F2.jpg",
      status: "ongoing",
      ageRating: "15",
      releaseYear: 2024,
      availability: [{ platformId: "naver-webtoon", pricing: "free" }],
      stats: {
        views: 1,
        likes: 1,
        bookmarks: 1,
        ratingAvg: 4.2,
        ratingCount: 10,
        ratingDist: [1, 1, 2, 3, 3],
        rankDelta: 0,
        trendingScore: 50,
        completionRate: 70,
        bingeIndex: 70,
      },
    };

    expect(mergeKmasItemIntoTitle(existing, sampleItem, { image: "omit" })).toBe(true);
    expect(existing.coverImage).toBe("/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F2.jpg");
    expect(existing.synopsis).toBe(sampleItem.outline);
  });

  it("lookup cache를 LRU entry 상한으로 제한한다", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const title = url.searchParams.get("title") ?? "";
      calls.push(title);
      return new Response(JSON.stringify({
        result: { resultState: "success" },
        itemList: [{
          prdctNm: title,
          title,
          sntncWritrNm: "테스트 작가",
          imageDownloadUrl: `https://www.kmas.or.kr/common/file/${encodeURIComponent(title)}.png`,
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    const env = {
      KMAS_PRV_KEY: "test-key",
      KMAS_LOOKUP_CACHE_MAX_ENTRIES: "2",
      KMAS_LOOKUP_CACHE_MAX_BYTES: "1048576",
    };

    try {
      await enrichTitleWithKmas(existingTitle("A"), env);
      await enrichTitleWithKmas(existingTitle("B"), env);
      await enrichTitleWithKmas(existingTitle("A"), env); // refresh A in LRU order
      await enrichTitleWithKmas(existingTitle("C"), env); // evicts B
      await enrichTitleWithKmas(existingTitle("B"), env); // must fetch B again
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(calls).toEqual(["A", "B", "C", "B"]);
    expect(kmasLookupCacheDiagnostics().entries).toBeLessThanOrEqual(2);
  });

  it("lookup cache byte budget가 너무 작으면 항목을 retained 하지 않는다", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const title = new URL(String(input)).searchParams.get("title") ?? "";
      return new Response(JSON.stringify({
        result: { resultState: "success" },
        itemList: [{ prdctNm: title, title, sntncWritrNm: "테스트 작가", outline: "x".repeat(1000) }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    try {
      await enrichTitleWithKmas(existingTitle("byte-budget"), {
        KMAS_PRV_KEY: "test-key",
        KMAS_LOOKUP_CACHE_MAX_ENTRIES: "10",
        KMAS_LOOKUP_CACHE_MAX_BYTES: "128",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(kmasLookupCacheDiagnostics()).toEqual({ entries: 0, estimatedBytes: 0 });
  });

});
