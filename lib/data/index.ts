import type { Title, SeedReview, WorkType } from "../types";
import { TITLES } from "./titles";
import { SEED_REVIEWS } from "./reviews";

export { TITLES, SEED_REVIEWS };

const BY_ID = new Map<string, Title>(TITLES.map((t) => [t.id, t]));
const BY_SLUG = new Map<string, Title>(TITLES.map((t) => [t.slug, t]));

export function getTitle(idOrSlug: string): Title | undefined {
  return BY_ID.get(idOrSlug) ?? BY_SLUG.get(idOrSlug);
}

export function allTitles(): Title[] {
  return TITLES;
}

// 작품의 참여 작가(글·그림) 이름 목록 — 쉼표/슬래시 분리
export function namesOf(t: Title): string[] {
  const raw = [t.author, t.artist].filter(Boolean).join(", ");
  return [...new Set(raw.split(/[,/]/).map((s) => s.trim()).filter((s) => s && s !== "미상"))];
}

export function authorWorks(name: string): Title[] {
  return TITLES.filter((t) => namesOf(t).includes(name)).sort(
    (a, b) => b.stats.views - a.stats.views
  );
}

export function allAuthorNames(): string[] {
  const set = new Set<string>();
  TITLES.forEach((t) => namesOf(t).forEach((n) => set.add(n)));
  return [...set];
}

export function titlesByType(type: WorkType): Title[] {
  return TITLES.filter((t) => t.type === type);
}

export function reviewsFor(titleId: string): SeedReview[] {
  return SEED_REVIEWS.filter((r) => r.titleId === titleId);
}

// 원작 (이 작품이 무엇을 원작으로 하는가)
export function originalOf(t: Title): Title | undefined {
  return t.adaptedFrom ? BY_ID.get(t.adaptedFrom) : undefined;
}

// 2차 창작 (이 작품을 원작으로 하는 작품들 — 보통 웹소설 -> 웹툰)
export function adaptationsOf(t: Title): Title[] {
  return TITLES.filter((x) => x.adaptedFrom === t.id);
}

// 작품 universe (원작 + 모든 2차창작) — 그래프 노드
export function adaptationFamily(t: Title): Title[] {
  const root = originalOf(t) ?? t;
  return [root, ...adaptationsOf(root)];
}

// 전체 장르 (데이터에 실제 등장하는 것)
export function activeGenres(): string[] {
  const set = new Set<string>();
  TITLES.forEach((t) => t.genres.forEach((g) => set.add(g)));
  return Array.from(set);
}

export function activeTags(): { tag: string; count: number }[] {
  const map = new Map<string, number>();
  TITLES.forEach((t) => t.tags.forEach((tag) => map.set(tag, (map.get(tag) ?? 0) + 1)));
  return Array.from(map.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

// 모든 리뷰 (작품 정보 조인)
export function allReviewsJoined(): (SeedReview & { title?: Title })[] {
  return SEED_REVIEWS.map((r) => ({ ...r, title: BY_ID.get(r.titleId) }));
}
