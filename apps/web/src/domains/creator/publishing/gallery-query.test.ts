import { describe, expect, it } from "vitest";

import { hasActiveFilters, parseGalleryView, patchSearchParams } from "./gallery-query";
import { showcaseGalleryHref } from "./showcase-links";

describe("갤러리 보기 조건 읽기", () => {
  it("주소가 비어 있으면 전체 작품·최신·전체 유형으로 시작한다", () => {
    const view = parseGalleryView(new URLSearchParams());
    expect(view.tab).toBe("works");
    expect(view.query).toEqual({ sort: "recent", tag: "", contentType: "all", provenance: undefined, portfolio: false });
    expect(hasActiveFilters(view.query)).toBe(false);
  });

  it("알 수 없는 값은 무시하고 기본값으로 되돌린다", () => {
    const view = parseGalleryView(new URLSearchParams("tab=nope&sort=random&content=video&provenance=robot&portfolio=yes"));
    expect(view.tab).toBe("works");
    expect(view.query.sort).toBe("recent");
    expect(view.query.contentType).toBe("all");
    expect(view.query.provenance).toBeUndefined();
    expect(view.query.portfolio).toBe(false);
  });

  it("showcaseGalleryHref가 만든 주소를 그대로 같은 조건으로 읽는다", () => {
    const href = showcaseGalleryHref({ tab: "series", sort: "likes", tag: "로맨스", content: "webtoon", provenance: "ai_assisted", portfolio: true });
    const view = parseGalleryView(new URL(href, "https://example.test").searchParams);
    expect(view.tab).toBe("series");
    expect(view.query).toEqual({ sort: "likes", tag: "로맨스", contentType: "webtoon", provenance: "ai_assisted", portfolio: true });
    expect(hasActiveFilters(view.query)).toBe(true);
  });

  it("필터가 하나라도 있으면 활성으로 본다(정렬은 필터가 아니다)", () => {
    expect(hasActiveFilters(parseGalleryView(new URLSearchParams("sort=views")).query)).toBe(false);
    expect(hasActiveFilters(parseGalleryView(new URLSearchParams("tag=a")).query)).toBe(true);
    expect(hasActiveFilters(parseGalleryView(new URLSearchParams("portfolio=1")).query)).toBe(true);
    expect(hasActiveFilters(parseGalleryView(new URLSearchParams("content=process")).query)).toBe(true);
    expect(hasActiveFilters(parseGalleryView(new URLSearchParams("provenance=human")).query)).toBe(true);
  });
});

describe("주소 조건 바꾸기", () => {
  it("값이 null이면 키를 지우고 나머지는 지킨다", () => {
    const source = new URLSearchParams("tab=series&sort=likes&tag=a");
    const next = patchSearchParams(source, { tab: null, content: "webtoon" });
    expect(next.toString()).toBe("sort=likes&tag=a&content=webtoon");
  });

  it("원본을 바꾸지 않는다", () => {
    const source = new URLSearchParams("sort=likes");
    patchSearchParams(source, { sort: null, tag: "x" });
    expect(source.toString()).toBe("sort=likes");
  });
});
