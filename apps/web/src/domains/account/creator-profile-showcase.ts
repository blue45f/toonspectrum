import type { WorkSummary } from "@/infrastructure/creator-client";

export interface CreatorProfileShowcase {
  featured: WorkSummary[];
  specialties: string[];
  totalViews: number;
  totalLikes: number;
}

/**
 * Derive a compact creator showcase from public work data only.
 * No new private profile fields or schema migration are required, and older
 * creator APIs remain fully compatible.
 */
export function buildCreatorProfileShowcase(
  works: readonly WorkSummary[],
  featuredLimit = 3,
  specialtyLimit = 6
): CreatorProfileShowcase {
  const published = works.filter((work) => work.status === "published");
  const featured = [...published]
    .sort((left, right) => {
      const leftScore = Math.max(0, left.likes) * 4 + Math.max(0, left.views) + Math.max(0, left.comments) * 2;
      const rightScore = Math.max(0, right.likes) * 4 + Math.max(0, right.views) + Math.max(0, right.comments) * 2;
      if (rightScore !== leftScore) return rightScore - leftScore;
      return Date.parse(right.createdAt) - Date.parse(left.createdAt);
    })
    .slice(0, Math.max(0, featuredLimit));

  const tagCounts = new Map<string, number>();
  let totalViews = 0;
  let totalLikes = 0;
  for (const work of published) {
    totalViews += Math.max(0, work.views);
    totalLikes += Math.max(0, work.likes);
    for (const rawTag of work.tags) {
      const tag = rawTag.trim();
      if (!tag) continue;
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  const specialties = [...tagCounts]
    .sort(([leftTag, leftCount], [rightTag, rightCount]) => rightCount - leftCount || leftTag.localeCompare(rightTag))
    .slice(0, Math.max(0, specialtyLimit))
    .map(([tag]) => tag);

  return { featured, specialties, totalViews, totalLikes };
}
