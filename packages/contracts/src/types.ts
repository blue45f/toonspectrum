import type { ReadState } from "../../core/src/types";

// 기존 웹·API 소비자가 공유하는 순수 계약만 공개해 UI와 브라우저 효과의 전이를 막는다.
export * from "../../core/src/types";
export * from "../../core/src/community-governance";
export * from "../../core/src/creator-ecosystem";
export type { ReviewFeedItem, ReviewSort, ReviewsResponse } from "../../core/src/community/types";

/** 저장된 작품 집합 계산에 필요한 컬렉션의 최소 구조. */
export interface CollectionLike {
  titleIds: string[];
}

// 기존 core/library/store의 순수 계산만 유지해 저장소 어댑터가 계약으로 전이되지 않게 한다.
export function deriveSavedTitleIds(
  reads: Record<string, ReadState | undefined>,
  subscriptions: Record<string, boolean>,
  collections: CollectionLike[],
): Set<string> {
  const set = new Set<string>();
  for (const [id, state] of Object.entries(reads)) if (state && state !== "dropped") set.add(id);
  for (const [id, on] of Object.entries(subscriptions)) if (on) set.add(id);
  for (const col of collections) for (const id of col.titleIds) set.add(id);
  return set;
}
