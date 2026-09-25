import type { SeriesSummary, WorkSummary } from "@/platform/creator-client";
import {
  canonicalCampusObjectCandidate,
  type CampusObject,
} from "@/shared/lib/spatial-campus/campus-objects";

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
    const encodedId = encodeURIComponent(work.id);
    const object = canonicalCampusObjectCandidate({
      id: encodedId,
      title: work.title,
      href: `/showcase/work/${encodedId}`,
      kind: "work",
      exposure: "public",
    });
    if (!object) continue;
    objects.push(object);
    if (objects.length >= capacity) break;
  }
  return objects;
}

export const SPATIAL_SHOWCASE_SERIES_LIMIT = 12;

/**
 * Series require their own explicit placement consent. Public episodes alone never imply consent,
 * while consent alone never publishes a draft episode. The public episode aggregate must be > 0.
 */
export function spatialShowcaseSeriesObjects(
  seriesList: readonly SeriesSummary[],
  limit = SPATIAL_SHOWCASE_SERIES_LIMIT,
): readonly CampusObject[] {
  const capacity = Number.isFinite(limit)
    ? Math.max(0, Math.min(SPATIAL_SHOWCASE_SERIES_LIMIT, Math.floor(limit)))
    : SPATIAL_SHOWCASE_SERIES_LIMIT;
  if (capacity === 0) return [];

  const seen = new Set<string>();
  const objects: CampusObject[] = [];
  for (const series of seriesList) {
    if (series.showcaseEnabled !== true || series.episodes < 1 || seen.has(series.id)) continue;
    seen.add(series.id);
    const encodedId = encodeURIComponent(series.id);
    const object = canonicalCampusObjectCandidate({
      id: `series-${encodedId}`,
      title: series.title,
      href: `/showcase/series/${encodedId}`,
      kind: "series",
      exposure: "public",
    });
    if (!object) continue;
    objects.push(object);
    if (objects.length >= capacity) break;
  }
  return objects;
}
