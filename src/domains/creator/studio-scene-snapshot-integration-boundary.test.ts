import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  new URL("./StudioPage.tsx", import.meta.url),
  "utf8"
);

describe("scene snapshot Studio integration boundary", () => {
  it("keeps the library lazy and applies the full page through document history", () => {
    expect(pageSource).toContain('import("./StudioSceneSnapshotDialog")');
    expect(pageSource).toContain("const [sceneSnapshotOpen, setSceneSnapshotOpen]");
    expect(pageSource).toMatch(
      /const restoredPage: PageState = \{\s+\.\.\.snapshot\.page,\s+id: activePage\.id,/u
    );
    expect(pageSource).toContain("if (!commitPages(nextPages)) return;");
    expect(pageSource).toContain("setWebtoonTheme(snapshot.theme);");
    expect(pageSource).toContain("setSceneSnapshotOpen(false);");
  });

  it("does not apply a snapshot without the explicit replacement confirmation", () => {
    const handlerStart = pageSource.indexOf("function applySceneSnapshot(");
    const nextHandler = pageSource.indexOf("async function startFromExample", handlerStart);
    const handlerSource = pageSource.slice(handlerStart, nextHandler);

    expect(handlerStart).toBeGreaterThan(-1);
    expect(handlerSource).toContain("globalThis.confirm(");
    expect(handlerSource.indexOf("globalThis.confirm(")).toBeLessThan(
      handlerSource.indexOf("commitPages(nextPages)")
    );
  });
});
