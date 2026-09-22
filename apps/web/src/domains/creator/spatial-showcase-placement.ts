import type { WorkSummary } from "@/infrastructure/creator-client";
import type { CampusObject } from "@/shared/lib/spatial-campus/campus-objects";

export const SPATIAL_SHOWCASE_WORK_LIMIT = 24;

/**
 * The virtual gallery is an explicit placement surface, not another public-feed projection.
 * Only already-published works whose owner opted into the existing portfolio flag may appear.
 */
export function spatialShowcaseObjects(
  works: readonly WorkSummary[],
  limit = SPATIAL_SHOWCASE_WORK_LIMIT,
): readonly CampusObject[] {
  const capacity = Number.isFinite(limit)
    ? Math.max(0, Math.min(SPATIAL_SHOWCASE_WORK_LIMIT, Math.floor(limit)))
    : SPATIAL_SHOWCASE_WORK_LIMIT;
  if (capacity === 0) return [];

  const seen = new Set<string>();
  const objects: CampusObject[] = [];
  for (const work of works) {
    if (work.status !== "published" || work.community?.portfolio !== true || seen.has(work.id)) {
      continue;
    }
    seen.add(work.id);
    objects.push({
      id: work.id,
      title: work.title,
      href: `/showcase/work/${encodeURIComponent(work.id)}`,
      kind: "work",
      exposure: "public",
    });
    if (objects.length >= capacity) break;
  }
  return objects;
}
