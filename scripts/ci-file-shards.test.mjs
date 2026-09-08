import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  formatCiBytes,
  parseCiShardArguments,
  partitionCiFilesByWeight,
  selectCiFileShard,
} from "./ci-file-shards.mjs";

test("parseCiShardArguments accepts explicit zero-based matrix coordinates", () => {
  assert.deepEqual(
    parseCiShardArguments(["--index=2", "--count=6"]),
    { index: 2, count: 6 },
  );
  assert.throws(
    () => parseCiShardArguments(["--index=6", "--count=6"]),
    /shard index must be between 0 and 5/u,
  );
  assert.throws(
    () => parseCiShardArguments(["--unknown=1"]),
    /Unknown shard argument/u,
  );
});

test("partitionCiFilesByWeight assigns each file exactly once with stable ordering", () => {
  const cwd = mkdtempSync(join(tmpdir(), "toonspectrum-ci-shards-"));
  try {
    const files = [
      ["a.ts", 90],
      ["b.ts", 60],
      ["c.ts", 30],
      ["d.ts", 20],
      ["e.ts", 10],
      ["f.ts", 5],
    ];
    for (const [file, bytes] of files) {
      writeFileSync(join(cwd, file), "x".repeat(bytes), "utf8");
    }
    const names = files.map(([file]) => file);
    const first = partitionCiFilesByWeight(names, 3, cwd);
    const second = partitionCiFilesByWeight([...names].reverse(), 3, cwd);
    assert.deepEqual(first, second);
    assert.deepEqual(first.flatMap((bucket) => bucket.files).sort(), [...names].sort());
    assert.equal(new Set(first.flatMap((bucket) => bucket.files)).size, names.length);
    const loads = first.map((bucket) => bucket.bytes);
    assert.ok(Math.max(...loads) - Math.min(...loads) <= 20);
    assert.deepEqual(selectCiFileShard(names, 1, 3, cwd), first[1]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("formatCiBytes keeps runner diagnostics compact", () => {
  assert.equal(formatCiBytes(100), "100 B");
  assert.equal(formatCiBytes(2048), "2.0 KiB");
  assert.equal(formatCiBytes(2 * 1024 * 1024), "2.0 MiB");
  assert.equal(formatCiBytes(Number.NaN), "unknown");
});