// 창작 갤러리 추천 영역의 순수 계산 — 화면과 분리해 단위 테스트한다.
import type { ChallengeSummary, WorkSummary } from "@/platform/creator-client";

export const TRENDING_TAG_LIMIT = 8;

/** 최근 작품에서 많이 쓰인 태그 순위. 동률이면 먼저 등장한 태그를 앞에 둔다(안정 정렬). */
export function trendingTagCounts(
  works: readonly Pick<WorkSummary, "tags">[],
  limit = TRENDING_TAG_LIMIT,
): [string, number][] {
  const counts = new Map<string, number>();
  for (const work of works) {
    for (const tag of work.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

/** 진행 중인 챌린지를 우선하고, 없으면 목록의 첫 챌린지(가장 최근)를 고른다. */
export function pickFeaturedChallenge(
  challenges: readonly ChallengeSummary[],
): ChallengeSummary | null {
  return challenges.find((item) => item.state !== "ended") ?? challenges[0] ?? null;
}
