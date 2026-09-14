const { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } = require("node:fs");
const path = require("node:path");
const { titleBucket } = require("../apps/api/og-title-files.cjs");


function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function loadPublicCatalog(dataDirectory) {
  const manifestPath = path.join(dataDirectory, "catalog", "manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = readJson(manifestPath);
    if (!manifest || !Number.isSafeInteger(manifest.count) || !Array.isArray(manifest.shards)) {
      throw new TypeError("Invalid public catalog shard manifest");
    }
    const titles = [];
    for (const descriptor of manifest.shards) {
      if (!descriptor || typeof descriptor.file !== "string" || !Number.isSafeInteger(descriptor.count)) {
        throw new TypeError("Invalid public catalog shard descriptor");
      }
      const file = path.resolve(dataDirectory, descriptor.file);
      const relative = path.relative(dataDirectory, file);
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new TypeError("Public catalog shard escaped the data directory");
      }
      const shard = readJson(file);
      if (!Array.isArray(shard) || shard.length !== descriptor.count) {
        throw new TypeError(`Public catalog shard count mismatch: ${descriptor.file}`);
      }
      titles.push(...shard);
    }
    if (titles.length !== manifest.count) {
      throw new TypeError("Public catalog manifest total does not match its shards");
    }
    return titles;
  }

  const legacyPath = path.join(dataDirectory, "catalog.json");
  if (!existsSync(legacyPath)) {
    throw new TypeError("Public catalog output is missing");
  }
  const titles = readJson(legacyPath);
  if (!Array.isArray(titles)) throw new TypeError("Expected a public catalog array");
  return titles;
}

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
  const titles = loadPublicCatalog(path.join(root, "dist", "data"));
  console.log("OG title metadata", buildOgTitleShards(titles, path.join(root, "dist", "og", "titles")));
}
module.exports = { buildOgTitleShards, loadPublicCatalog, projectTitle };
