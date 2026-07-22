// 커뮤니티 / 리뷰 읽기전용 피드 응답 타입(브랜치 A).
// GET /api/reviews 응답 계약을 한 곳에 모아 서버·클라이언트 드리프트를 방지합니다.

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

/** GET /api/reviews 응답. */
export interface ReviewsResponse {
  sort: ReviewSort;
  feed: ReviewFeedItem[];
  topReviewed: TopReviewedItem[];
  stats: ReviewsStats;
  generatedAt: string;
  source: "database";
}
