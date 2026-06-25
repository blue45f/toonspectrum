import { authorWorks, allAuthorNames } from "./catalog-store";

export function getAuthorStaticParams() {
  return allAuthorNames().map((name) => ({ name: encodeURIComponent(name) }));
}

export async function getAuthorData(rawName: string) {
  const author = decodeURIComponent(rawName);
  const works = authorWorks(author);
  if (works.length === 0) return null;

  return {
    author,
    works,
    totalViews: works.reduce((s, t) => s + t.stats.views, 0),
    avg: works.reduce((s, t) => s + t.stats.ratingAvg, 0) / works.length,
    genres: [...new Set(works.flatMap((t) => t.genres))].slice(0, 6),
    generatedAt: new Date().toISOString(),
    source: "server-catalog",
  };
}
