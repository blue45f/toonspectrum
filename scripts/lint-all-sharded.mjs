import { spawnSync } from "node:child_process";
import process from "node:process";

import {
  formatCiBytes,
  listCiVisibleFiles,
  parseCiShardArguments,
  selectCiFileShard,
} from "./ci-file-shards.mjs";

const LINTABLE_FILE = /\.(?:[cm]?[jt]sx?)$/u;
const MAX_FILES_PER_PROCESS = 160;
const ESLINT_HEAP_MB = 4096;

function chunks(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

function pnpmExecutable() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

const { index, count } = parseCiShardArguments(process.argv.slice(2));
const candidates = listCiVisibleFiles().filter((file) => LINTABLE_FILE.test(file));
const shard = selectCiFileShard(candidates, index, count);
const batches = chunks(shard.files, MAX_FILES_PER_PROCESS);

console.log(
  `[lint] shard ${index + 1}/${count}: ${shard.files.length} candidate files, `
  + `${formatCiBytes(shard.bytes)}, ${batches.length} bounded ESLint processes`,
);

for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
  const files = batches[batchIndex];
  if (!files || files.length === 0) continue;
  console.log(`[lint] batch ${batchIndex + 1}/${batches.length}: ${files.length} files`);
  const result = spawnSync(
    pnpmExecutable(),
    [
      "exec",
      "eslint",
      "--max-warnings=0",
      "--no-warn-ignored",
      "--cache",
      "--cache-strategy",
      "content",
      "--cache-location",
      `node_modules/.cache/eslint/ci-${index}-${batchIndex}/`,
      "--",
      ...files,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_OPTIONS: `--max-old-space-size=${ESLINT_HEAP_MB}`,
      },
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = result.signal ? ` (signal ${result.signal})` : "";
    throw new Error(
      `ESLint shard ${index + 1}/${count}, batch ${batchIndex + 1}/${batches.length} failed`
      + `${detail} with exit ${String(result.status)}`,
    );
  }
}

console.log(`[lint] shard ${index + 1}/${count} passed with complete assigned-file coverage.`);