import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const root = fileURLToPath(new URL("../", import.meta.url));
const verifierPath = "scripts/verify-studio-p2p-huddle.mjs";
const source = readFileSync(join(root, verifierPath), "utf8");
const eslint = new ESLint({ cwd: root });

test("P2P browser verification cache is excluded by the actual ESLint configuration", async () => {
  const cache = source.match(/cacheDir:\s*`\$\{root\}([^`]+)`/u)?.[1];
  assert.ok(cache, "the browser verifier must declare its generated dependency cache");
  assert.equal(await eslint.isPathIgnored(join(root, cache, "deps/react.js")), true,
    "running browser verification must not make third-party bundles fail strict lint");
});

test("P2P source and verification scripts remain subject to strict lint", async () => {
  for (const path of [verifierPath, "scripts/verify-studio-p2p-huddle.test.mjs",
    "apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-controller.ts"]) {
    assert.equal(await eslint.isPathIgnored(join(root, path)), false, path);
  }
});
