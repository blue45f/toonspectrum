import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const wrapper = await fs.readFile(
  path.join(root, "scripts/verify-review-delivery-workflow-ci.mjs"),
  "utf8",
);
const workflow = await fs.readFile(
  path.join(root, ".github/workflows/studio-manuscript-delivery-acceptance.yml"),
  "utf8",
);

test("the public acceptance command owns its Vite bootstrap", () => {
  assert.equal(
    packageJson.scripts["verify:studio-manuscript-delivery-acceptance"],
    "node scripts/verify-review-delivery-workflow-ci.mjs",
  );
  assert.match(wrapper, /--strictPort/u);
  assert.match(wrapper, /assertListenersBelongToWorktree/u);
  assert.match(wrapper, /stopDetachedProcessTree/u);
  assert.match(wrapper, /verify-review-delivery-workflow\.mjs/u);
  assert.match(wrapper, /verify-production-manuscript-workspace\.mjs/u);
});
test("the workflow runs the complete delivery evidence gate", () => {
  assert.match(workflow, /^name: Studio manuscript delivery acceptance$/mu);
  assert.match(workflow, /STUDIO_DELIVERY_SOAK_MS: '60000'/u);
  assert.match(workflow, /pnpm run verify:studio-manuscript-delivery-acceptance/u);
  assert.match(workflow, /review-delivery-zip\.test\.ts/u);
  assert.match(workflow, /StudioReviewDelivery\.test\.tsx/u);
  assert.match(workflow, /StudioPinnedReviewPanel\.test\.tsx/u);
  assert.match(workflow, /verify-production-manuscript-workspace\.mjs/u);
  assert.match(workflow, /production-manuscript-workspace/u);
  assert.match(workflow, /actions\/upload-artifact@v4/u);
});

test("the workflow is retriggered by every authority boundary it validates", () => {
  for (const expectedPath of [
    "apps/api/src/modules/studio-project-graph/review-delivery/**",
    "apps/web/src/domains/creator/production-hub/*Manuscript*",
    "apps/web/src/domains/creator/review-export/**",
    "apps/web/src/domains/creator/review-share/StudioPinnedReviewShareManager*",
    "apps/web/src/domains/creator/virtual-space/StudioPinnedReviewPanel*",
    "apps/web/tools/browser-harnesses/virtual-studio-review-export*",
    "apps/web/tools/browser-harnesses/production-manuscript-workspace*",
    "scripts/verify-review-delivery-workflow*.mjs",
    "scripts/verify-production-manuscript-workspace.mjs",
  ]) {
    assert.match(workflow, new RegExp(expectedPath.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
});
