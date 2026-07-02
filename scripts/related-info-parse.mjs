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

// 제목 끝의 잘림 흔적(쉼표·중점·하이픈·연속공백)을 정리한다.
export function trimTitle(s) {
  return String(s || "")
    .replace(/[\s,·ㆍ、\-–—]+$/u, "")
    .trim();
}

// HTML 에서 og:title(없으면 <title>) 추출. content 속성값에 작은/큰따옴표가 들어가도 잘리지 않게
// 여는 따옴표를 역참조(\1)로 닫는다(한국 헤드라인의 '인용'·"강조" 대응). 무의미한 네이버 기본
// 타이틀은 "" 로 버려 호출부가 폴백을 쓰게 한다.
export function extractOgTitle(html) {
  const s = String(html || "");
  const og =
    s.match(/<meta[^>]+property=["']og:title["'][^>]+content=(["'])([\s\S]*?)\1/i) ||
    s.match(/<meta[^>]+content=(["'])([\s\S]*?)\1[^>]+property=["']og:title["']/i);
  let raw = og ? og[2] : "";
  if (!raw) {
    const tm = s.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    raw = tm ? tm[1] : "";
  }
  const t = trimTitle(decodeEntities(raw));
  if (!t || /^(네이버\s*(뉴스|블로그|포스트)?|NAVER)$/i.test(t)) return "";
  return t.slice(0, 110);
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
