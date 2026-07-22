// 화면 공용 view-model derivation — 동일 산식을 재사용해 중복과 드리프트를 막습니다.
// (랭킹/검색/추천 같은 핵심 알고리즘은 각 모듈에; 여기는 칩·커버리지 등 가벼운 파생값.)

import { PLATFORMS } from "./platforms";

import type { PlatformId, Title } from "./types";

/** 작품 목록에서 빈도순 상위 장르(min편 이상). 검색·연재 칩 공용 단일 소스. */
export function topGenres(
  titles: Title[],
  { min = 2, limit = 8 }: { min?: number; limit?: number } = {},
): string[] {
  const counts = new Map<string, number>();
  for (const t of titles) for (const g of t.genres || []) counts.set(g, (counts.get(g) || 0) + 1);
  return [...counts.entries()]
    .filter(([, n]) => n >= min)
    .sort((a, b) => b[1] - a[1])
    .map(([g]) => g)
    .slice(0, limit);
}

export interface PlatformCoverageEntry {
  id: PlatformId;
  label: string;
  color: string;
  count: number;
  share: number;
}

/** 플랫폼별 작품 수·점유율(많은 순). 캘린더·탐색·검색 패널 공용 단일 소스. */
export function platformCoverage(titles: Title[]): PlatformCoverageEntry[] {
  const counts = new Map<PlatformId, number>();
  for (const title of titles) {
    const ids = new Set((title.availability ?? []).map((entry) => entry.platformId));
    ids.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  }
  return [...counts.entries()]
    .map(([id, count]) => ({
      id,
      label: PLATFORMS[id]?.short ?? id,
      color: PLATFORMS[id]?.color ?? "oklch(0.72 0.02 70)",
      count,
      share: titles.length ? Math.round((count / titles.length) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}
