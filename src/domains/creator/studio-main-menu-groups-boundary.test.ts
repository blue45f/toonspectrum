import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(fileName: string): string {
  return readFileSync(new URL(fileName, import.meta.url), "utf8");
}

describe("studio main-menu catalogue ownership boundary", () => {
  it("keeps the catalogue React-, browser-, and page-state-free", () => {
    const catalogue = source("./studio-main-menu-groups.ts");

    expect(catalogue).not.toMatch(/from\s+["']react["']/u);
    expect(catalogue).not.toMatch(/\b(?:document|window|globalThis)\s*\./u);
    expect(catalogue).not.toContain("StudioPage");
    expect(catalogue).not.toMatch(/\buse(?:Memo|Callback|Effect|State|Ref)\b/u);
    expect(catalogue.split("\n").length).toBeLessThanOrEqual(1_050);
  });

  it("leaves only state projection and browser command composition in StudioPage", () => {
    const page = source("./StudioPage.tsx");
    const start = page.indexOf("const studioMainMenuGroups = useMemo(");
    const end = page.indexOf("// 모바일 하단 보조 막대 버튼", start);
    const composition = page.slice(start, end);

    expect(page).toContain('from "./studio-main-menu-groups"');
    expect(composition).toContain("buildStudioMainMenuGroups({");
    expect(composition).toContain("projectImportInputRef.current?.click()");
    expect(composition).toContain("openStudioToolsCompanionWindow()");
    expect(composition).not.toContain("items: [");
    expect(composition).not.toContain("STUDIO_EDIT_MENU_COMMANDS");
    expect(composition.split("\n").length).toBeLessThanOrEqual(190);
  });
});
