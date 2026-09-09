import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const MAX_SHARDS = 64;
const GIT_FILE_LIST_MAX_BYTES = 64 * 1024 * 1024;

function parseInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label} must be an integer, received ${String(value)}`);
  }
  return parsed;
}

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function parseCiShardArguments(
  argv,
  {
    defaultIndex = Number(process.env.CI_SHARD_INDEX ?? 0),
    defaultCount = Number(process.env.CI_SHARD_COUNT ?? 1),
  } = {},
) {
  let index = defaultIndex;
  let count = defaultCount;
  for (const argument of argv) {
    if (argument.startsWith("--index=")) {
      index = parseInteger(argument.slice("--index=".length), "shard index");
    } else if (argument.startsWith("--count=")) {
      count = parseInteger(argument.slice("--count=".length), "shard count");
    } else {
      throw new Error(`Unknown shard argument: ${argument}`);
    }
  }
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_SHARDS) {
    throw new Error(`shard count must be between 1 and ${MAX_SHARDS}`);
  }
  if (!Number.isSafeInteger(index) || index < 0 || index >= count) {
    throw new Error(`shard index must be between 0 and ${count - 1}`);
  }
  return { index, count };
}

export function listCiVisibleFiles(cwd = process.cwd()) {
  const output = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd, maxBuffer: GIT_FILE_LIST_MAX_BYTES },
  );
  return [...new Set(output.toString("utf8").split("\0").filter(Boolean))].sort(compareText);
}

function fileWeight(cwd, file) {
  try {
    const stat = statSync(resolve(cwd, file), { throwIfNoEntry: false });
    return stat?.isFile() ? Math.max(1, stat.size) : 0;
  } catch {
    return 0;
  }
}

/**
 * Greedy longest-first bin packing keeps every runner's source-byte load close while preserving a
 * deterministic assignment for the same checkout. Files are sorted inside each bucket so command
 * lines and diagnostics remain stable across runs.
 */
export function partitionCiFilesByWeight(files, shardCount, cwd = process.cwd()) {
  if (!Number.isSafeInteger(shardCount) || shardCount < 1 || shardCount > MAX_SHARDS) {
    throw new Error(`shard count must be between 1 and ${MAX_SHARDS}`);
  }
  const weighted = files
    .map((file) => ({ file, bytes: fileWeight(cwd, file) }))
    .filter((entry) => entry.bytes > 0)
    .sort((left, right) => right.bytes - left.bytes || compareText(left.file, right.file));
  const buckets = Array.from({ length: shardCount }, (_, index) => ({
    index,
    bytes: 0,
    files: [],
  }));
  for (const entry of weighted) {
    buckets.sort(
      (left, right) =>
        left.bytes - right.bytes
        || left.files.length - right.files.length
        || left.index - right.index,
    );
    const bucket = buckets[0];
    if (!bucket) throw new Error("Unable to allocate a CI shard bucket");
    bucket.files.push(entry.file);
    bucket.bytes += entry.bytes;
  }
  return buckets
    .sort((left, right) => left.index - right.index)
    .map((bucket) => ({
      bytes: bucket.bytes,
      files: bucket.files.sort(compareText),
    }));
}

export function selectCiFileShard(files, index, count, cwd = process.cwd()) {
  const bucket = partitionCiFilesByWeight(files, count, cwd)[index];
  if (!bucket) throw new Error(`Unable to resolve shard ${index + 1}/${count}`);
  return bucket;
}

export function formatCiBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}