import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// Register with the active runner; node:test alone is invisible to Vitest's root suite.
// Keep the standalone Node gate usable without initializing a Vitest worker.
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const source = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
test("core gates cannot turn green through the removed fast-merge switch", () => {
  assert.equal(source.includes("CI_CORE_BYPASS"), false);
  for (const command of [
    "pnpm run validate:architecture", "pnpm run lint", "pnpm run typecheck",
    "pnpm run build", "pnpm run build:all", "pnpm run test:cloudflare-realtime",
  ]) assert.ok(source.includes(command), `missing required command: ${command}`);
  assert.ok(source.includes("needs: [lint, typecheck, build, test, test-serial]"));
  assert.ok(source.includes('select(.value.result != "success")'));
  assert.ok(source.includes("if: ${{ always() }}"));
});
