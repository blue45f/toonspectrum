import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { REQUIRED_CORE_GATES } from "./ci-core-gate.mjs";

// Support both the complete Vitest suite and a small standalone Node gate.
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const source = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const jobs = source.slice(source.indexOf("\njobs:\n") + 7).split(/(?=^ {2}[a-z][a-z0-9-]*:\n)/m);
function job(name) {
  const block = jobs.find((entry) => entry.startsWith(`  ${name}:\n`));
  assert.ok(block, `missing job: ${name}`);
  return block;
}

test("core retains all executing main checks without a bypass", () => {
  assert.doesNotMatch(source, /CI_CORE_BYPASS|continue-on-error|if:\s*\$\{\{\s*false/);
    assert.match(source, /permissions:\n {2}contents: read/);
  for (const name of REQUIRED_CORE_GATES) {
    assert.doesNotMatch(job(name), /^ {4}if:/m, `${name} must not be conditionally skipped`);
    assert.match(job(name), /pnpm install --frozen-lockfile/);
  }
  for (const command of [
    "pnpm run validate:architecture", "pnpm run lint:strict", "pnpm run typecheck",
    "pnpm run typecheck:cloudflare-realtime", "pnpm run verify:csp",
    "pnpm run verify:toolchain-coverage", "pnpm exec vitest run",
    "scripts/audit-studio-brush-quality-portfolio.mts",
  ]) assert.ok(job("static").includes(command), `missing static gate: ${command}`);
  for (const command of ["pnpm --filter @webtoon-nest/api build", "pnpm run build", "pnpm run check:studio-bundle", "test -s dist/.vite/manifest.json", "pnpm run verify:api-serverless-build"]) {
    assert.ok(job("build").includes(command), `missing build gate: ${command}`);
  }
  assert.ok(job("serial").includes("pnpm run test:perf"));
});

test("core aggregation rejects skipped dependencies and verify requires core success", () => {
  assert.ok(job("core").includes(`needs: [${REQUIRED_CORE_GATES.join(", ")}]`));
  assert.ok(job("core").includes("if: ${{ always() }}"));
  assert.ok(job("core").includes("CORE_RESULTS: ${{ toJSON(needs) }}"));
  assert.ok(job("core").includes("run: node scripts/ci-core-gate.mjs"));
  assert.ok(job("verify").includes("needs: core"));
  assert.ok(job("verify").includes('test "$CORE_RESULT" = success'));
});

const REQUIRED_REGRESSION_FILES = [
  "apps/api/src/modules/catalog/catalog-search-cache.test.ts",
  "apps/api/src/config/catalog-initialization.test.ts",
  "apps/api/src/config/cors.test.ts",
  "apps/api/src/config/security-headers.test.ts",
  "apps/api/src/csrf-middleware.test.ts",
  "apps/api/src/modules/catalog/catalog-pagination.test.ts",
  "apps/api/src/modules/catalog/catalog-public-cache.interceptor.test.ts",
  "apps/api/src/modules/catalog/lazy-serverless-catalog.service.test.ts",
  "apps/api/src/modules/creator-marketplace/creator-marketplace-social-boundary.test.ts",
  "apps/api/src/runtime/runtime-boundary.test.ts",
  "apps/api/src/runtime/serverless-partitions.test.ts",
  "apps/api/src/server/marketplace-og.test.ts",
  "apps/api/src/serverless.test.ts",
  "apps/api/src/session-middleware.test.ts",
  "apps/web/src/app/routes/groups/creator-brush-lab-route-contract.test.ts",
  "apps/web/src/domains/creator/bg3d/StudioBg3dViewPanel.test.tsx",
  "apps/web/src/domains/creator/bg3d/StudioBg3dViewPanelLazy.test.tsx",
  "apps/web/src/domains/creator/bg3d/studio-bg3d-a11y-boundary.test.ts",
  "apps/web/src/domains/creator/bg3d/studio-bg3d-panel-source-boundary.test.ts",
  "apps/web/src/domains/creator/brush-lab/brush-studio-v5-quality.test.ts",
  "apps/web/src/domains/creator/brush-lab/brush-studio-version-integration.test.ts",
  "apps/web/src/domains/creator/brush/StudioBrushEngineProgramControls.test.tsx",
  "apps/web/src/domains/creator/brush/StudioBrushLibrarySheet.test.tsx",
  "apps/web/src/domains/creator/brush/StudioBrushTray.test.tsx",
  "apps/web/src/domains/creator/brush/studio-brush-browser-evidence.test.ts",
  "apps/web/src/domains/creator/brush/studio-brush-catalog-contract.test.ts",
  "apps/web/src/domains/creator/brush/studio-brush-composition-runtime-boundary.test.ts",
  "apps/web/src/domains/creator/brush/studio-brush-composition-runtime.test.ts",
  "apps/web/src/domains/creator/brush/studio-brush-listed-uniqueness.test.ts",
  "apps/web/src/domains/creator/brush/studio-brush-quality-portfolio.test.ts",
  "apps/web/src/domains/creator/canvas/StudioCanvasStickyBanners.view-workspace.test.tsx",
  "apps/web/src/domains/creator/studio-autosave-opfs-product-boundary.test.ts",
  "apps/web/src/domains/creator/studio-autosave-opfs-session.test.ts",
  "apps/web/src/domains/creator/studio-autosave-snapshot-fence.test.ts",
  "apps/web/src/domains/creator/studio-autosave-sqlite-store.test.ts",
  "apps/web/src/domains/creator/studio-integration-closure.test.ts",
  "apps/web/src/domains/creator/studio-page-autosave-runtime.test.ts",
  "apps/web/src/domains/creator/studio-release-schedule-empty-recovery.test.ts",
  "apps/web/src/domains/creator/studio-release-schedule-loader.test.ts",
  "apps/web/src/domains/creator/studio-shared-document-client.test.ts",
  "apps/web/src/domains/creator/studio-shell/StudioAssetGovernancePanel.test.tsx",
  "apps/web/src/domains/creator/studio-source-hydration-recovery-boundary.test.ts",
  "apps/web/src/domains/creator/studio-unsaved-work-guard.test.ts",
  "apps/web/src/infrastructure/creator-work-read-options.test.ts",
  "apps/web/src/infrastructure/search-client.test.ts",
  "apps/web/src/infrastructure/use-paginated-search.test.tsx",
  "apps/web/src/shared/catalog/catalog-pagination.test.ts",
  "apps/web/src/shared/lib/__tests__/og-ssr.test.ts",
  "apps/web/src/shared/lib/__tests__/search.test.ts",
  "packages/core/src/search-normalization.test.ts",
  "packages/core/src/server/home.cpu-cache.test.ts"
];

function assertMandatoryRegressionFiles(paths) {
  const present = new Set(paths);
  for (const filename of REQUIRED_REGRESSION_FILES) {
    assert.ok(present.has(filename), `missing mandatory regression: ${filename}`);
  }
}

test("all existing and follow-up regression files remain mandatory; additions are allowed", () => {
  const paths = job("static").match(/(?:apps|packages)\/[^\s]+\.test\.[a-z]+/g) ?? [];
  assertMandatoryRegressionFiles(paths);
});

test("removing any required regression is rejected, not hidden by another added test", () => {
  for (const removed of REQUIRED_REGRESSION_FILES) {
    const remaining = REQUIRED_REGRESSION_FILES.filter((path) => path !== removed);
    assert.throws(() => assertMandatoryRegressionFiles([...remaining, "apps/extra.test.ts"]));
  }
  assert.doesNotThrow(() => assertMandatoryRegressionFiles([...REQUIRED_REGRESSION_FILES, "apps/extra.test.ts"]));
});

// Manual validation must not cancel push validation; retries keep prior evidence.
test("isolates event concurrency and retry artifact names", () => {
  assert.ok(source.includes("group: core-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}"));
  assert.ok(job("serial").includes("name: core-serial-attempt-${{ github.run_attempt }}"));
  assert.ok(job("build").includes("name: core-build-attempt-${{ github.run_attempt }}"));
});
