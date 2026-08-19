import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const studioPageSource = readFileSync(
  new URL("./StudioPage.tsx", import.meta.url),
  "utf8",
);
const studioPageLoaderSource = readFileSync(
  new URL("./studio-page-editor-runtime-loaders.ts", import.meta.url),
  "utf8",
);
const inspectorSource = readFileSync(
  new URL("./StudioInspectorAside.tsx", import.meta.url),
  "utf8",
);
const mobileDockSource = readFileSync(
  new URL("./StudioMobileEditingDock.tsx", import.meta.url),
  "utf8",
);
const panelSource = readFileSync(
  new URL("./StudioBrushLibraryPanel.tsx", import.meta.url),
  "utf8",
);
const vrmPreferencesSource = readFileSync(
  new URL("./studio-vrm-poser-preferences-sqlite.ts", import.meta.url),
  "utf8",
);

describe("Studio brush-library SQLite product boundary", () => {
  it("hydrates the quick shelf from the same paged product repository as the library panel", () => {
    expect(studioPageSource).toContain("openProductBrushLibraryRepository");
    expect(studioPageLoaderSource).toContain("readAllBrushesFromRepository");
    expect(studioPageSource).toContain("productBrushRepository()");
  });

  it("routes desktop and mobile library panels through the page-owned repository", () => {
    expect(
      studioPageSource.match(/openBrushLibraryRepository=\{productBrushRepository\}/g),
    ).toHaveLength(2);
    for (const projection of [inspectorSource, mobileDockSource]) {
      expect(projection).toContain("repositoryFactory: openBrushLibraryRepository");
    }
  });

  it("delegates every projection access to the generation-aware product repository", () => {
    expect(studioPageSource).not.toContain("brushRepositoryPromiseRef");
    expect(panelSource).not.toContain("repositoryPromiseRef");
    expect(studioPageSource).toContain(
      "loadStudioBrushLibrarySqliteRepository().then(",
    );
    expect(panelSource).toContain("const repositoryPromise = repositoryFactory();");
    expect(panelSource).toContain("return repositoryFactory();");
    expect(vrmPreferencesSource).toContain("preserveBrushMemorySession: true");
  });

  it("commits apply metadata, undo, and menu import through the async repository", () => {
    expect(studioPageSource).toContain("product.repository.restore(pending.deleted)");
    expect(studioPageSource).toContain("product.repository.getById(saved.id)");
    expect(studioPageSource).toContain("product.repository.put({ ...stored, lastUsedAt: usedAt })");
    expect(studioPageSource).toContain("importAndCommitStudioBrushProgramFile");
    expect(studioPageSource).toContain("file, \"bundle\", product.repository");
  });

  it("does not reopen the legacy localStorage brush authority from StudioPage", () => {
    expect(studioPageSource).not.toContain("browserBrushLibraryStorage(");
    expect(studioPageSource).not.toContain("markBrushUsedWithResult(");
    expect(studioPageSource).not.toContain("restoreDeletedBrush(");
    expect(studioPageSource).not.toContain("saveBrushBatchWithResult(");
    expect(studioPageSource).not.toContain('legacyDataPolicy: "import-explicit"');
    expect(studioPageSource).not.toContain("브러시가 40개");
    expect(studioPageSource).not.toContain("브러시 라이브러리가 가득");
  });
});
