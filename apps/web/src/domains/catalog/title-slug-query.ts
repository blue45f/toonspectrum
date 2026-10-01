/** 검색어 제안 최대 길이 — 주소에 붙은 긴 꼬리 문자열이 검색창을 넘치지 않게 한다. */
const MAX_QUERY_LENGTH = 80;

/**
 * 작품 주소(slug)에서 검색어를 되살린다. `나-혼자만-레벨업`처럼 사람이 읽는 주소는 "나 혼자만 레벨업"으로,
 * `kw-4172`처럼 카탈로그 식별자 모양이면 검색어로 쓸 수 없으므로 null을 돌려준다.
 */
export function titleSlugSearchQuery(slug: string | undefined): string | null {
  if (!slug) return null;
  const text = slug.replace(/[-_+]+/gu, " ").replace(/\s+/gu, " ").trim();
  if (!text || /^[a-z]{1,4} ?\d+$/iu.test(text)) return null;
  return text.slice(0, MAX_QUERY_LENGTH);
}
