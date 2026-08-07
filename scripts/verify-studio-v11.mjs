#!/usr/bin/env node
/**
 * V11 engine-layer verification gate.
 *
 * 1. Integrity: the committed vello wasm pkg must match INTEGRITY.sha256
 *    (same release-contract idea as studio-hokusai-wasm — generated artifacts
 *    are pinned, never hand-edited).
 * 2. Contracts: typecheck every *-v11 package.
 * 3. Behavior: run the V11 test scope (packages, cross-renderer diff, shadow
 *    parity) through the root vitest config.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PKG_DIR = join(ROOT, "crates", "vello-adapter-v11", "pkg");

function fail(message) {
  console.error(`verify:studio-v11 FAILED — ${message}`);
  process.exit(1);
}

// 1. wasm pkg integrity
const manifest = readFileSync(join(PKG_DIR, "INTEGRITY.sha256"), "utf8");
for (const line of manifest.split("\n")) {
  if (line.trim() === "") continue;
  const match = line.match(/^([0-9a-f]{64}) [ *](.+)$/);
  if (!match) fail(`unparseable INTEGRITY line: ${line}`);
  const [, expected, file] = match;
  const actual = createHash("sha256")
    .update(readFileSync(join(PKG_DIR, file)))
    .digest("hex");
  if (actual !== expected) {
    fail(
      `${file} hash mismatch — rebuild via wasm-pack (crates/vello-adapter-v11) and refresh INTEGRITY.sha256`,
    );
  }
}
console.log("vello wasm pkg integrity: OK");

const V11_PACKAGES = [
  "@toonspectrum/project-model-v11",
  "@toonspectrum/provider-catalog-v11",
  "@toonspectrum/command-registry-v11",
  "@toonspectrum/skia-adapter-v11",
  "@toonspectrum/vello-adapter-v11",
  "@toonspectrum/brush-platform-v11",
  "@toonspectrum/benchmark-lab-v11",
];

// 2. package typechecks
for (const name of V11_PACKAGES) {
  const result = spawnSync("pnpm", ["--filter", name, "typecheck"], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (result.status !== 0) fail(`typecheck failed: ${name}`);
}

// 3. V11 test scope
const test = spawnSync(
  "pnpm",
  [
    "exec",
    "vitest",
    "run",
    "packages/project-model-v11",
    "packages/provider-catalog-v11",
    "packages/command-registry-v11",
    "packages/skia-adapter-v11",
    "packages/vello-adapter-v11",
    "packages/brush-platform-v11",
    "tests/studio-v11",
    "src/domains/creator/studio-v11-surface-plan-shadow.test.ts",
  ],
  { cwd: ROOT, stdio: "inherit" },
);
if (test.status !== 0) fail("V11 vitest scope failed");

console.log("verify:studio-v11 PASSED");
