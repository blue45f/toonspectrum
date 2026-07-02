// 관련 정보 크롤러의 "순수 파싱" 로직 — 네트워크 없이 단위 테스트 가능하게 분리한다.
// 공식 API(네이버 검색·YouTube Data) 응답은 실제 키가 있어야 크롤러로 검증되므로, 응답 shape 를
// 목킹해 여기서 변환 로직을 테스트한다(scripts/__tests__/related-info-parse.test.mjs).

// JSON 문자열 리터럴 정확 언이스케이프(\", \\, \uXXXX, \n 등). ytInitialData 스크래핑 제목용.
export function jsonUnescape(s) {
  try {
    return JSON.parse(`"${s}"`);
  } catch {
    return String(s || "")
      .replace(/\\u([\dA-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\(.)/g, "$1");
  }
}

// HTML 엔티티·태그 정제(네이버 API title 은 <b> 강조태그 + 엔티티 포함).
export function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;/gi, "'")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// 네이버 뉴스 검색 API items[] → {url, title}[]. url 은 네이버 기사(link) 우선, 없으면 원문(originallink).
export function mapNaverNewsItems(items, query, max) {
  const list = Array.isArray(items) ? items : [];
  return list
    .slice(0, max)
    .map((it, i) => ({
      url: it.link || it.originallink,
      title: decodeEntities(it.title) || `${query} 관련 뉴스 ${i + 1}`,
    }))
    .filter((it) => it.url);
}

// 네이버 블로그 검색 API items[] → {url, title}[].
export function mapNaverBlogItems(items, query, max) {
  const list = Array.isArray(items) ? items : [];
  return list
    .slice(0, max)
    .map((it) => ({
      url: it.link,
      title: decodeEntities(it.title) || `${query} 후기·리뷰 블로그`,
    }))
    .filter((it) => it.url);
}

// YouTube Data API v3 search items[] → {id, title, views}[]. videoId 있는 것만.
export function mapYoutubeApiItems(items, max) {
  const list = Array.isArray(items) ? items : [];
  return list
    .filter((it) => it.id?.videoId)
    .slice(0, max)
    .map((it) => ({ id: it.id.videoId, title: decodeEntities(it.snippet?.title || ""), views: undefined }))
    .filter((v) => v.title);
}
