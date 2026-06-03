import type { Title } from "./types";

// 핵심 지표(별점·평가수·조회)가 실수집인지 추정/합성인지 런타임 판별.
// 크롤 단계(scripts/crawl.mjs) 기준: 네이버 웹툰만 별점·조회·관심을 실수집하고,
// 카카오웹툰과 모든 웹소설(시리즈·오리지널)의 해당 지표는 hashInt 기반 추정값이다.
// (완독률·몰입지수·평점분포 등 파생 지표는 작품 종류와 무관하게 데모용 추정이다.)
export function statsAreEstimated(t: Title): boolean {
  // 크롤 단계에서 0 노출 방지로 조회/관심을 보정한 작품(예: 네이버가 공개 조회수를
  // 내려 viewCount=0으로 응답한 웹툰)은 명시적으로 추정으로 표시한다.
  if (t.statsEstimated) return true;
  if (t.type === "webnovel") return true;
  return !t.availability.some((a) => a.platformId === "naver-webtoon");
}
