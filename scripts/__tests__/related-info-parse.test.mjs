import { describe, expect, it } from "vitest";

import {
  decodeEntities,
  jsonUnescape,
  mapNaverBlogItems,
  mapNaverNewsItems,
  mapYoutubeApiItems,
} from "../related-info-parse.mjs";

describe("related-info-parse — 공식 API/스크래핑 응답 파싱", () => {
  it("decodeEntities 는 <b> 강조태그·HTML 엔티티·공백을 정제한다(네이버 API title)", () => {
    expect(decodeEntities("<b>덴마</b> 웹툰 &amp; 리뷰")).toBe("덴마 웹툰 & 리뷰");
    expect(decodeEntities("김규삼 &#39;정글고&#39;")).toBe("김규삼 '정글고'");
    expect(decodeEntities("줄  바꿈\n다수  공백")).toBe("줄 바꿈 다수 공백");
    expect(decodeEntities(null)).toBe("");
  });

  it("jsonUnescape 는 ytInitialData 제목의 \\\" 와 \\uXXXX 를 정확히 복원한다", () => {
    expect(jsonUnescape('한때 최애\\"였던\\" 레전드')).toBe('한때 최애"였던" 레전드');
    expect(jsonUnescape("\\uD55C\\uAE00")).toBe("한글"); // 유니코드 이스케이프(한=U+D55C, 글=U+AE00)
    expect(jsonUnescape("보통 제목")).toBe("보통 제목");
  });

  it("mapNaverNewsItems: link 우선(없으면 originallink), title 정제, url 없으면 제외", () => {
    const items = [
      { title: "<b>덴마</b> 애니화 확정", link: "https://n.news.naver.com/a/1", originallink: "https://press.com/1" },
      { title: "", link: "", originallink: "https://press.com/2" }, // title 빈값 → 폴백, url=originallink
      { title: "무효", link: "", originallink: "" }, // url 전무 → 제외
    ];
    const out = mapNaverNewsItems(items, "덴마 웹툰", 5);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ url: "https://n.news.naver.com/a/1", title: "덴마 애니화 확정" });
    expect(out[1]).toEqual({ url: "https://press.com/2", title: "덴마 웹툰 관련 뉴스 2" });
  });

  it("mapNaverBlogItems: link 사용, title 정제, max 제한", () => {
    const items = [
      { title: "<b>노블레스</b> 완벽 가이드", link: "https://blog.naver.com/u/1" },
      { title: "두번째", link: "https://blog.naver.com/u/2" },
    ];
    const out = mapNaverBlogItems(items, "노블레스 웹툰", 1);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ url: "https://blog.naver.com/u/1", title: "노블레스 완벽 가이드" });
  });

  it("mapYoutubeApiItems: videoId 있는 것만, snippet.title 정제, max 제한", () => {
    const items = [
      { id: { videoId: "abc12345678" }, snippet: { title: "덴마 리뷰 &quot;완결&quot;" } },
      { id: { kind: "channel" }, snippet: { title: "채널(비디오 아님)" } }, // videoId 없음 → 제외
      { id: { videoId: "def12345678" }, snippet: { title: "두번째 영상" } },
    ];
    const out = mapYoutubeApiItems(items, 1);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ id: "abc12345678", title: '덴마 리뷰 "완결"', views: undefined });
  });

  it("빈/비배열 입력에 안전하다(무효 응답)", () => {
    expect(mapNaverNewsItems(undefined, "q", 2)).toEqual([]);
    expect(mapNaverBlogItems(null, "q", 2)).toEqual([]);
    expect(mapYoutubeApiItems({}, 2)).toEqual([]);
  });
});
