import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import process from "node:process";

import {
  formatCiBytes,
  listCiVisibleFiles,
  parseCiShardArguments,
  selectCiFileShard,
} from "./ci-file-shards.mjs";

const ROOT_CONFIG_FILES = new Set([
  "playwright.config.ts",
  "tailwind.config.ts",
  "vite.config.ts",
  "vitest.config.ts",
  "vitest.perf.config.ts",
]);
const TYPESCRIPT_FILE = /\.(?:tsx?|mts|cts)$/u;
const DECLARATION_FILE = /\.d\.(?:ts|mts|cts)$/u;
const TYPESCRIPT_HEAP_MB = 4096;

function isRootTypecheckFile(file) {
  if (!TYPESCRIPT_FILE.test(file)) return false;
  if (file.startsWith("tests/benchmarks/")) return false;
  if (ROOT_CONFIG_FILES.has(file)) return true;
  if (file.startsWith("src/")) return true;
  if (file.startsWith("apps/web/src/")) return true;
  if (file.startsWith("apps/web/config/")) return true;
  if (file.startsWith("tests/")) return true;
  if (file.startsWith("scripts/")) return /\.(?:ts|mts)$/u.test(file);
  return /^packages\/[^/]+\/src\//u.test(file);
}

function isLikelyGlobalScript(file) {
  if (DECLARATION_FILE.test(file)) return true;
  const source = readFileSync(file, "utf8");
  return !/(?:^|\n)\s*(?:import|export)\b/mu.test(source);
}

function pnpmExecutable() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

const { index, count } = parseCiShardArguments(process.argv.slice(2));
const candidates = listCiVisibleFiles().filter(isRootTypecheckFile);
const sharedFiles = candidates.filter(isLikelyGlobalScript);
const sharedFileSet = new Set(sharedFiles);
const partitionedFiles = candidates.filter((file) => !sharedFileSet.has(file));
const shard = selectCiFileShard(partitionedFiles, index, count);
const files = [...new Set([...sharedFiles, ...shard.files])].sort();
const temporaryConfig = `.tsconfig.ci-shard-${index + 1}-of-${count}.json`;

console.log(
  `[typecheck] shard ${index + 1}/${count}: ${shard.files.length} assigned modules, `
  + `${sharedFiles.length} shared declarations/global scripts, ${formatCiBytes(shard.bytes)}`,
);

writeFileSync(
  temporaryConfig,
  `${JSON.stringify(
    {
      extends: "./tsconfig.json",
      compilerOptions: { incremental: false },
      files,
      include: [],
      exclude: [],
    },
    null,
    2,
  )}\n`,
  "utf8",
);

try {
  const result = spawnSync(
    pnpmExecutable(),
    [
      "exec",
      "tsc",
      "-p",
      temporaryConfig,
      "--pretty",
      "false",
      "--diagnostics",
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_OPTIONS: `--max-old-space-size=${TYPESCRIPT_HEAP_MB}`,
      },
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = result.signal ? ` (signal ${result.signal})` : "";
    throw new Error(
      `TypeScript shard ${index + 1}/${count} failed${detail} with exit ${String(result.status)}`,
    );
  }
} finally {
  try {
    unlinkSync(temporaryConfig);
  } catch {
    // The config may already be gone after an interrupted runner cleanup.
  }
}

console.log(`[typecheck] shard ${index + 1}/${count} passed.`);