import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  validateTranslationMemorySqliteOpfsEvidence,
  type TranslationMemorySqliteOpfsArtifact,
} from "../benchmarks/harness/translation-memory-sqlite-opfs-browser";

function artifact(): TranslationMemorySqliteOpfsArtifact {
  return JSON.parse(
    readFileSync(
      new URL(
        "../benchmarks/results/translation-memory-sqlite-opfs-browser.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as TranslationMemorySqliteOpfsArtifact;
}

describe("translation-memory Chromium SQLite OPFS evidence", () => {
  it("pins a passing raw artifact through the executable evidence gate", () => {
    const result = artifact();
    expect(result.status).toBe("pass");
    expect(result.pass).toBe(true);
    expect(
      validateTranslationMemorySqliteOpfsEvidence(
        result.benchmark,
        result.diagnostics,
        result.productionBuild.assets,
      ),
    ).toEqual([]);
  });

  it("keeps the production probe on a Dedicated Worker and V12-only authority", () => {
    const page = readFileSync(
      new URL(
        "../benchmarks/harness/translation-memory-sqlite-opfs-browser-page.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const worker = readFileSync(
      new URL(
        "../benchmarks/harness/translation-memory-sqlite-opfs-browser-client.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(page).toContain("new Worker(");
    expect(page).toContain('{ type: "module"');
    expect(worker).toContain('openStudioLocalDatabase({ vfs: "opfs", loadSqlite })');
    expect(worker).toContain("createStudioTranslationMemorySqlitePersistence");
    expect(worker).toContain("STUDIO_TRANSLATION_MEMORY_SQLITE_NAMESPACE");
    expect(worker).not.toContain("studioTranslationMemoryBrowserStorage");
  });
});
