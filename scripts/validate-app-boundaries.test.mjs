import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validator = path.join(repositoryRoot, "scripts/validate-app-boundaries.mjs");
const emptyBudgets = {
  webToAdmin: 0,
  webToApi: 0,
  adminToWeb: 0,
  adminToApi: 0,
  apiToWeb: 0,
  apiToAdmin: 0,
  packagesToApps: 0,
  adminSharedToDomain: 0,
  adminCrossDomainDeepImport: 0,
  webSharedToDomain: 0,
  webCrossDomainDeepImport: 0,
  contractsToApps: 0,
  contractsForbiddenImport: 0,
  crossAppTestOutsideIntegration: 0,
};

function fixture(files) {
  const root = mkdtempSync(path.join(tmpdir(), "toonspectrum-app-boundary-"));
  mkdirSync(path.join(root, "config"), { recursive: true });
  writeFileSync(
    path.join(root, "config/architecture-boundary-ratchet.json"),
    `${JSON.stringify(emptyBudgets, null, 2)}\n`,
  );
  for (const [relative, source] of Object.entries(files)) {
    const target = path.join(root, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, source);
  }
  return root;
}

function run(root) {
  return spawnSync(process.execPath, [validator], { cwd: root, encoding: "utf8" });
}

test("rejects cross-application source inspection from app and package tests", () => {
  const root = fixture({
    "apps/web/src/catalog-boundary.test.ts": `export const target = "apps/api/src/modules/catalog/catalog.service.ts";\n`,
    "packages/sample/src/package-boundary.test.ts": `export const target = "../../../../apps/web/src/app/App.tsx";\n`,
  });
  try {
    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /crossAppTestOutsideIntegration: 2\/0/u);
    assert.match(result.stderr, /crossAppTestOutsideIntegration increased to 2/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("allows cross-application contracts under tests/integration", () => {
  const root = fixture({
    "tests/integration/web-api/catalog.test.ts": `export const target = "apps/api/src/modules/catalog/catalog.service.ts";\n`,
  });
  try {
    const result = run(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /crossAppTestOutsideIntegration: 0\/0/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
