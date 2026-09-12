const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");

function titleBucket(identifier) {
  return createHash("sha256").update(identifier, "utf8").digest("hex").slice(0, 2);
}

/** Bounded, deployment-local cache. Misses/errors are never cached. */
function createTitleMetadataReader(directory, read = readFileSync, capacity = 16) {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 256) throw new RangeError("Invalid shard cache capacity");
  const shards = new Map();
  return function readTitleMetadata(identifier) {
    if (typeof identifier !== "string" || !identifier || identifier.length > 512) return null;
    const bucket = titleBucket(identifier);
    let data = shards.get(bucket);
    if (data) {
      shards.delete(bucket);
      shards.set(bucket, data);
    } else {
      try {
        data = JSON.parse(read(path.join(directory, `${bucket}.json`), "utf8"));
        if (!data || typeof data !== "object" || Array.isArray(data)) return null;
      } catch {
        return null;
      }
      shards.set(bucket, data);
      while (shards.size > capacity) shards.delete(shards.keys().next().value);
    }
    if (!Object.prototype.hasOwnProperty.call(data, identifier)) return null;
    const title = data[identifier];
    return title && typeof title.title === "string" ? title : null;
  };
}

const readTitleMetadata = createTitleMetadataReader(path.join(process.cwd(), "dist", "og", "titles"));
module.exports = { titleBucket, createTitleMetadataReader, readTitleMetadata };
