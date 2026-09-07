import { TITLES } from "./catalog-store";

import type { Title } from "../types";

/** Shared random discovery for the API and static catalog, retaining the requested age boundary. */
export function getRandomData(
  query: Record<string, string | undefined> = {},
  titles: readonly Title[] = TITLES,
) {
  const allowAdult = query.adult === "true" || query.adult === "1";
  const eligible = titles.filter((title) => allowAdult || title.ageRating !== "19");
  let pool = eligible.filter((title) => Boolean(title.coverImage) && title.stats.ratingCount > 0);
  if (query.type === "webtoon" || query.type === "webnovel") {
    pool = pool.filter((title) => title.type === query.type);
  }
  const genre = query.genre;
  if (genre) pool = pool.filter((title) => title.genres.includes(genre));
  // Relax discovery preferences when they yield no results, while preserving the age filter.
  if (pool.length === 0) pool = eligible;
  const pick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null; // NOSONAR S2245 Random recommendation, not security material.
  return {
    slug: pick?.slug ?? pick?.id ?? null,
    id: pick?.id ?? null,
    title: pick?.title ?? null,
    poolSize: pool.length,
    generatedAt: new Date().toISOString(),
  };
}
