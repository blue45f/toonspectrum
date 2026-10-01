import type { ReviewSort } from "@/shared/lib/types";

/** 리뷰 피드 평점 필터(주소의 `rating`). */
export type ReviewRatingFilter = "all" | "high" | "low";

export const REVIEW_SORTS: readonly ReviewSort[] = ["recent", "likes", "high", "low"];
export const REVIEW_RATINGS: readonly ReviewRatingFilter[] = ["all", "high", "low"];

/** 주소의 `sort` 값을 알려진 정렬로 좁힌다. 모르는 값은 기본(최신순). */
export function parseReviewSort(value: string | null): ReviewSort {
  return REVIEW_SORTS.find((sort) => sort === value) ?? "recent";
}

/** 주소의 `rating` 값을 알려진 평점 필터로 좁힌다. 모르는 값은 전체. */
export function parseReviewRating(value: string | null): ReviewRatingFilter {
  return REVIEW_RATINGS.find((rating) => rating === value) ?? "all";
}
