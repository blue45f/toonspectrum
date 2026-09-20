import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
test("the full creator typecheck retains the established core heap budget and all validation stages", () => {
  const workflow = read("../.github/workflows/creator-promotion-validation.yml");
  const core = read("../.github/workflows/ci.yml");
  const heap = (text) => text.match(/NODE_OPTIONS: --max-old-space-size=(\d+)/u)?.[1];
  expect(heap(workflow)).toBe(heap(core));
  expect(heap(workflow)).toBe("12288");
  for (const stage of [
    "pnpm exec tsc --noEmit --pretty false",
    "pnpm exec tsc -p apps/api/tsconfig.json --noEmit --pretty false",
    "pnpm exec vitest run packages/core/src/collaboration.test.ts",
    "pnpm exec playwright test --config playwright.creator-hub.config.ts",
  ]) expect(workflow).toContain(stage);
  expect(workflow).toContain("runs-on: ubuntu-latest");
  expect(workflow).toContain("timeout-minutes: 25");
});
