// 커뮤니티 / 리뷰 — 웹·토스가 공유하는 읽기전용 리뷰 피드 응답 타입(브랜치 A).
// GET /api/reviews 의 응답 계약을 한 곳에 모은다. 웹 ReviewsPage 와 토스가 동일 타입으로
// 같은 GET(CORS 통과)을 fetch 한다. 작성형 데모 커뮤니티 엔진은 ./store 참고(브랜치 B).

import type { SeedReview, Title } from "../types";

/** 리뷰 정렬 키(최신·좋아요·고평점·저평점). */
export type ReviewSort = "recent" | "likes" | "high" | "low";

/** 피드 한 항목 — 리뷰 + 그 작품(조인). */
export type ReviewFeedItem = SeedReview & { title: Title };

/** 많이 리뷰된 작품 랭킹 한 항목. */
export interface TopReviewedItem {
  title: Title;
  count: number;
}

/** 리뷰 피드 통계 요약. */
export interface ReviewsStats {
  total: number;
  avg: number;
  spoilerPct: number;
  distinctTitles: number;
}

/** GET /api/reviews 응답 — 웹 ReviewsPage·토스 공유. */
export interface ReviewsResponse {
  sort: ReviewSort;
  feed: ReviewFeedItem[];
  topReviewed: TopReviewedItem[];
  stats: ReviewsStats;
  generatedAt: string;
  source: "database";
}
