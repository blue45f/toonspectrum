import assert from "node:assert/strict";
import test from "node:test";

import { measureSourceLayout, validateSourceLayout } from "./validate-source-layout.mjs";

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
    apiCommonFiles: 0,
    apiInfrastructureFiles: 0,
    apiDbFiles: 0,
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
