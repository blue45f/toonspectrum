import type { Title } from "./types";

// 핵심 지표(별점·평가수·조회)가 실수집인지 추정/합성인지 런타임 판별.
// 크롤 단계(scripts/crawl.mjs) 기준: 네이버 웹툰만 별점·조회·관심을 실수집하고,
// 카카오웹툰과 모든 웹소설(시리즈·오리지널)의 해당 지표는 hashInt 기반 추정값이다.
// (완독률·몰입지수·평점분포 등 파생 지표는 작품 종류와 무관하게 추정값이다.)
//
// 랭킹 산식(lib/ranking.ts)은 이 판별 하나로 세 가지 보정을 일관되게 적용한다.
//   1) 신뢰계수: 추정 작품은 0.78~0.80으로 감점(실데이터 1.00~1.06)
//   2) 모멘텀 감쇠: 합성 rankDelta·trendingScore가 기간 블렌딩에서 실데이터만큼 힘을 갖지 못하게
//   3) 베이즈 사전값(C) 유도: 추정 표본은 25% 가중만 — 합성 평점이 사전평균을 끌고 가지 않게
// 따라서 새 추정 지표를 추가하더라도 statsEstimated 플래그의 의미(핵심 지표가 합성값)는 바꾸지 말 것.
export function statsAreEstimated(t: Title): boolean {
  // 크롤 단계에서 0 노출 방지로 조회/관심을 보정한 작품(예: 네이버가 공개 조회수를
  // 내려 viewCount=0으로 응답한 웹툰)은 명시적으로 추정으로 표시한다.
  if (t.statsEstimated) return true;
  if (t.type === "webnovel") return true;
  return !t.availability.some((a) => a.platformId === "naver-webtoon");
}
