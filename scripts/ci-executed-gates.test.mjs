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

// This is a minimum protected set, not an exact total. Additional coverage is
// welcome; deleting or moving a protected suite requires an explicit review.
const requiredRegressions = Object.freeze([
  "apps/web/src/domains/creator/studio-workspace-route.test.ts",
  "apps/web/src/domains/creator/studio-production/studio-production-scope.test.ts",
  "apps/web/src/domains/creator/studio-production/StudioProductionHubPage.scope.test.tsx",
  "apps/web/src/domains/creator/studio-router/studio-route-manifest.test.ts",
  "apps/web/src/domains/creator/studio-router/studio-route-manifest.home-boundary.test.ts",
  "apps/web/src/domains/creator/studio-router/StudioRouteCollaborationGateway.test.tsx",
  "apps/web/src/domains/creator/studio-router/studio-production-command-center-boundary.test.ts",
  "apps/web/src/domains/creator/studio-router/StudioRouteEntryContracts.test.tsx",
  "apps/web/src/domains/creator/studio-batch-rename.test.ts",
  "apps/web/src/domains/creator/StudioInspectorBatchRenameSection.test.tsx",
  "apps/web/src/domains/creator/studio-inspector-multi-selection-boundary.test.ts",
  "apps/web/src/domains/creator/StudioInspectorOrderAlignSection.test.tsx",
  "apps/web/src/domains/creator/color/studio-color-proof.test.ts",
  "apps/web/src/domains/creator/studio-live-adjustment.test.ts",
  "apps/web/src/domains/creator/useStudioAdjustmentLayerCommands.test.tsx",
  "apps/web/src/domains/creator/canvas/StudioLiveAdjustmentGroup.test.tsx",
  "apps/web/src/domains/creator/export/studio-psd-adjustment-graph.test.ts",
  "apps/web/src/domains/creator/vector/studio-node-edit-pointer-ownership.test.tsx",
  "apps/web/src/domains/creator/studio-palette-brand-clip-sqlite-authority-contract.test.ts",
  "apps/web/src/domains/creator/studio-smart-filter-opacity.test.ts",
  "apps/web/src/domains/creator/ai/studio-scenario-image-generation.test.ts",
  "apps/web/src/domains/creator/contracts/studio-work-asset-contract.test.ts",
  "apps/api/src/config/catalog-initialization.test.ts",
  "apps/api/src/modules/catalog/lazy-serverless-catalog.service.test.ts",
  "apps/api/src/modules/catalog/catalog-public-cache.interceptor.test.ts",
  "packages/core/src/search-normalization.test.ts",
  "packages/core/src/server/home.cpu-cache.test.ts",
  "apps/web/src/infrastructure/creator-work-read-options.test.ts",
  "apps/web/src/domains/creator/studio-source-hydration-recovery-boundary.test.ts",
  "apps/web/src/domains/creator/studio-shared-document-client.test.ts",
  "apps/web/src/domains/creator/studio-release-schedule-loader.test.ts",
  "apps/web/src/domains/creator/studio-release-schedule-empty-recovery.test.ts",
  "apps/web/src/domains/creator/studio-autosave-snapshot-fence.test.ts",
  "apps/web/src/domains/creator/studio-autosave-opfs-product-boundary.test.ts",
  "apps/web/src/domains/creator/studio-autosave-opfs-session.test.ts",
  "apps/web/src/domains/creator/studio-autosave-sqlite-store.test.ts",
  "apps/web/src/domains/creator/studio-page-autosave-runtime.test.ts",
  "apps/web/src/domains/creator/studio-unsaved-work-guard.test.ts",
  "apps/web/src/domains/creator/canvas/StudioCanvasStickyBanners.view-workspace.test.tsx",
  "apps/web/src/domains/creator/brush/StudioBrushLibrarySheet.test.tsx",
  "apps/web/src/domains/creator/brush/StudioBrushTray.test.tsx",
  "apps/web/src/domains/creator/brush/studio-brush-quality-portfolio.test.ts",
  "apps/web/src/domains/creator/brush/studio-brush-listed-uniqueness.test.ts",
  "apps/web/src/domains/creator/brush/studio-brush-catalog-contract.test.ts",
  "apps/web/src/domains/creator/brush/studio-brush-browser-evidence.test.ts",
  "apps/web/src/domains/creator/brush/studio-brush-composition-runtime.test.ts",
  "apps/web/src/domains/creator/brush/studio-brush-composition-runtime-boundary.test.ts",
  "apps/web/src/domains/creator/brush/StudioBrushEngineProgramControls.test.tsx",
  "apps/web/src/domains/creator/brush-lab/brush-studio-v5-quality.test.ts",
  "apps/web/src/domains/creator/brush-lab/brush-studio-version-integration.test.ts",
  "apps/web/src/app/routes/groups/creator-brush-lab-route-contract.test.ts",
  "apps/web/src/domains/creator/studio-integration-closure.test.ts",
  "apps/web/src/domains/creator/bg3d/StudioBg3dViewPanelLazy.test.tsx",
  "apps/web/src/domains/creator/bg3d/StudioBg3dViewPanel.test.tsx",
  "apps/web/src/domains/creator/bg3d/studio-bg3d-panel-source-boundary.test.ts",
  "apps/web/src/domains/creator/bg3d/studio-bg3d-a11y-boundary.test.ts",
  "apps/web/src/domains/creator/studio-shell/StudioAssetGovernancePanel.test.tsx",
]);

// Read the explicit file arguments of the Vitest commands used by this workflow.
// Comments and echo text do not count as execution; keep packages/ and .tsx paths.
function executedRegressions(block) {
  return block
    .replace(/\\\r?\n/g, " ")
    .split(/\r?\n/)
    .filter((line) => /^\s*(?:-\s*)?(?:run:\s*)?pnpm exec vitest run(?:\s|$)/.test(line))
    .flatMap((line) => line.replace(/[ \t]+#.*$/u, "").trim().split(/\s+/))
    .map((word) => word.replace(/^["']|["']$/g, ""))
    .filter((word) => /^(?:apps|packages)\/[\w./-]+\.test\.(?:[cm]?[jt]s|[jt]sx)$/.test(word));
}

function assertRequiredRegressions(block) {
  const tests = executedRegressions(block);
  const actual = new Set(tests);
  assert.equal(actual.size, tests.length, "duplicate regression arguments in static CI");
  for (const path of requiredRegressions) {
    assert.ok(actual.has(path), `missing mandatory regression: ${path}`);
  }
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
  for (const command of ["pnpm --filter @webtoon-nest/api build", "pnpm run build", "pnpm run check:studio-bundle", "test -s dist/.vite/manifest.json"]) {
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

test("preflight validates CI before any dependency installation or expensive gate", () => {
  assert.doesNotMatch(job("preflight"), /^\s+(?:if|continue-on-error):/m);
  assert.ok(job("preflight").includes("node --test scripts/ci-core-gate.test.mjs scripts/ci-executed-gates.test.mjs"));
  assert.doesNotMatch(job("preflight"), /pnpm (?:install|exec|run)|cache: pnpm/);
  assert.ok(job("preflight").includes("package-manager-cache: false"));
  for (const name of REQUIRED_CORE_GATES) {
    assert.match(job(name), /^ {4}needs: preflight$/m, `${name} must wait for preflight success`);
  }
  assert.doesNotMatch(job("static"), /^\s+if:/m, "mandatory static steps cannot be skipped");
});

test("all named main regressions remain mandatory without fixing the total count", () => {
  assert.equal(new Set(requiredRegressions).size, requiredRegressions.length);
  assertRequiredRegressions(job("static"));
});

test("additional application and package coverage does not break the CI contract", () => {
  const extra = `${job("static")}
      - name: Additional regressions
        run: pnpm exec vitest run apps/web/src/Additional.test.tsx packages/core/src/additional.test.ts
`;
  assertRequiredRegressions(extra);
});

for (const path of requiredRegressions) {
  test(`rejects removal of ${path} even when the total count is unchanged`, () => {
    const replaced = job("static").replace(path, "apps/web/src/unrelated-replacement.test.ts");
    assert.throws(() => assertRequiredRegressions(replaced), /missing mandatory regression/);
  });
}

test("comments and echo output cannot replace an executing regression", () => {
  const path = requiredRegressions[0];
  const missing = job("static").replace(path, "apps/web/src/unrelated-replacement.test.ts");
  const decoys = `${missing}
      # pnpm exec vitest run ${path}
      - run: echo "pnpm exec vitest run ${path}"
`;
  assert.throws(() => assertRequiredRegressions(decoys), /missing mandatory regression/);
});

test("duplicate arguments cannot inflate regression coverage", () => {
  const duplicated = `${job("static")}
      - run: pnpm exec vitest run ${requiredRegressions[0]}
`;
  assert.throws(() => assertRequiredRegressions(duplicated), /duplicate regression arguments/);
});

// Manual validation must not cancel push validation; retries keep prior evidence.
test("isolates event concurrency and retry artifact names", () => {
  assert.ok(source.includes("group: core-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}"));
  assert.ok(job("serial").includes("name: core-serial-attempt-${{ github.run_attempt }}"));
  assert.ok(job("build").includes("name: core-build-attempt-${{ github.run_attempt }}"));
});

test("production visual audit uses the Vitest runner for its policy suite", () => {
  const audit = readFileSync(new URL("../.github/workflows/studio-3d-production-visual-audit.yml", import.meta.url), "utf8");
  assert.ok(audit.includes("      - name: Verify audit policy\n        run: pnpm exec vitest run scripts/lib/studio-3d-production-audit-policy.test.mjs\n"));
  assert.doesNotMatch(audit, /node\s+--test\s+scripts\/lib\/studio-3d-production-audit-policy\.test\.mjs/);
});

test("required core executes the production audit policy suite before merge", () => {
  assert.ok(job("static").includes("      - name: Studio 3D production audit policy regressions\n        run: pnpm exec vitest run scripts/lib/studio-3d-production-audit-policy.test.mjs\n"));
});

test("removal and inline comments cannot replace mandatory execution", () => {
  for (const path of requiredRegressions) {
    const missing = job("static").replace(path, "");
    assert.throws(() => assertRequiredRegressions(missing), /missing mandatory regression/);
    assert.throws(() => assertRequiredRegressions(missing + "\n          pnpm exec vitest run # " + path), /missing mandatory regression/);
  }
});
