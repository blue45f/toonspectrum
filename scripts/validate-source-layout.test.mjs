import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

import { measureSourceLayout, repositoryFiles, validateSourceLayout } from "./validate-source-layout.mjs";

test("미스테이징 이동과 신규 소스를 검사하고 무시된 산출물은 제외한다", () => {
  const root = mkdtempSync(join(tmpdir(), "toonstudio-source-layout-"));
  try {
    const creator = "apps/web/src/domains/creator";
    mkdirSync(join(root, creator, "localization"), { recursive: true });
    writeFileSync(join(root, creator, "loader.ts"), "export {};\n");
    writeFileSync(join(root, ".gitignore"), "ignored/\n");
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    execFileSync("git", ["add", "."], { cwd: root });
    renameSync(join(root, creator, "loader.ts"), join(root, creator, "localization/loader.ts"));
    writeFileSync(join(root, creator, "new.ts"), "export {};\n");
    mkdirSync(join(root, "ignored"));
    writeFileSync(join(root, "ignored/result.ts"), "export {};\n");

    const beforeStaging = repositoryFiles(root).sort();
    assert.deepEqual(beforeStaging, [".gitignore", `${creator}/localization/loader.ts`, `${creator}/new.ts`]);
    const { failures } = validateSourceLayout({
      files: beforeStaging,
      budgets: measureSourceLayout([]),
    });
    assert.deepEqual(failures, ["creatorRootFiles increased to 1 (budget 0)"]);
    execFileSync("git", ["add", "."], { cwd: root });
    assert.deepEqual(repositoryFiles(root).sort(), beforeStaging);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("counts only direct Creator root files while counting all files for migration folders", () => {
  const files = [
    "apps/web/src/domains/creator/RootPage.tsx",
    "apps/web/src/domains/creator/brush/Brush.ts",
    "apps/web/src/domains/admin/AdminPage.tsx",
    "apps/web/src/compat/router-link.tsx",
    ".qa/result.json",
  ];
  assert.deepEqual(measureSourceLayout(files), {
    creatorRootFiles: 1,
    webAdminFiles: 1,
    apiServerFiles: 0,
    apiHttpFiles: 0,
    apiAdapterFiles: 0,
    apiDatabaseFiles: 0,
    packagesCoreFiles: 0,
    desktopSyncAgentFiles: 0,
    trackedQaFiles: 1,
    trackedArtifactFiles: 0,
    webCompatFiles: 1,
    webComponentsFiles: 0,
    webHooksFiles: 0,
    webInfrastructureFiles: 0,
    webGeneratedFiles: 0,
    webStylesFiles: 0,
    webTypesFiles: 0,
    rootAndroidFiles: 0,
    rootIosFiles: 0,
    rootMobileShellFiles: 0,
    rootMobileResourcesFiles: 0,
    rootCapacitorConfigFiles: 0,
    rootMediaFiles: 0,
    rootAutomationFiles: 0,
    rootMarketplaceBenchmarkFiles: 0,
    rootViteConfigFiles: 0,
    rootDrizzleConfigFiles: 0,
  });
});

test("fails only when a measured source boundary exceeds its budget", () => {
  const files = ["apps/web/src/domains/creator/One.ts", "apps/web/src/domains/creator/Two.ts"];
  const budgets = Object.fromEntries(
    Object.keys(measureSourceLayout([])).map((key) => [key, key === "creatorRootFiles" ? 1 : 0]),
  );
  const { failures } = validateSourceLayout({ files, budgets });
  assert.deepEqual(failures, ["creatorRootFiles increased to 2 (budget 1)"]);
});
