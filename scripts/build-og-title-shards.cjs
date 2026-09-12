const { mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } = require("node:fs");
const path = require("node:path");
const { titleBucket } = require("../apps/api/og-title-files.cjs");

function projectTitle(title) {
  if (!title || typeof title.id !== "string" || typeof title.slug !== "string" || typeof title.title !== "string") {
    throw new TypeError("OG metadata requires id, slug and title");
  }
  // Build from the already policy-filtered public card catalog, never raw DB/private records.
  return {
    id: title.id,
    slug: title.slug,
    title: title.title,
    author: title.author,
    genres: title.genres,
    synopsis: typeof title.synopsis === "string" ? title.synopsis.slice(0, 500) : "",
    coverImage: title.coverImage,
    releaseYear: title.releaseYear,
    stats: {
      ratingAvg: Number.isFinite(title.stats?.ratingAvg) ? title.stats.ratingAvg : 0,
      ratingCount: Number.isFinite(title.stats?.ratingCount) ? title.stats.ratingCount : 0,
    },
  };
}

function buildOgTitleShards(titles, directory) {
  if (!Array.isArray(titles)) throw new TypeError("Expected a public catalog array");
  const shards = new Map();
  for (const raw of titles) {
    const title = projectTitle(raw);
    for (const identifier of new Set([title.id, title.slug])) {
      if (!identifier || identifier.length > 512) throw new TypeError("Invalid OG identifier");
      const bucket = titleBucket(identifier);
      if (!shards.has(bucket)) shards.set(bucket, Object.create(null));
      // Preserve the catalog store's last-write-wins ID/slug lookup semantics.
      shards.get(bucket)[identifier] = title;
    }
  }
  mkdirSync(directory, { recursive: true });
  for (const filename of readdirSync(directory)) {
    if (/^[a-f0-9]{2}\.json$/.test(filename)) unlinkSync(path.join(directory, filename));
  }
  for (const [bucket, values] of shards) {
    writeFileSync(path.join(directory, `${bucket}.json`), JSON.stringify(values));
  }
  return { titles: titles.length, shards: shards.size };
}

if (require.main === module) {
  const root = process.cwd();
  const titles = JSON.parse(readFileSync(path.join(root, "dist", "data", "catalog.json"), "utf8"));
  console.log("OG title metadata", buildOgTitleShards(titles, path.join(root, "dist", "og", "titles")));
}
module.exports = { buildOgTitleShards, projectTitle };
