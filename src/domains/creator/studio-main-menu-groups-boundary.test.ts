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
    // 캔버스 px 눈금자와 빠른 액세스 항목을 소유해도 카탈로그가 독립 모듈 경계를 유지한다.
    expect(catalogue.split("\n").length).toBeLessThanOrEqual(1_090);
  });

  it("leaves only state projection and browser command composition in StudioPage", () => {
    const page = source("./StudioPage.tsx");
    const companion = source("./studio-tools-companion.ts");
    const start = page.indexOf("const studioMainMenuGroups = useMemo(");
    const end = page.indexOf("// 모바일 하단 보조 막대 버튼", start);
    const composition = page.slice(start, end);

    expect(page).toContain('from "./studio-main-menu-groups"');
    expect(composition).toContain("buildStudioMainMenuGroups({");
    // Root import inputs: null-guard then click (optional chaining removed for explicit UX).
    expect(composition).toContain("projectImportInputRef.current.click()");
    expect(composition).toContain("if (!projectImportInputRef.current)");
    expect(page).toContain('window.open("", "_blank", STUDIO_TOOLS_COMPANION_RESERVATION_FEATURES)');
    expect(page).toContain("ready.protocol.openReadyStudioToolsCompanionForMenu({");
    expect(page).toContain("runtime.protocol.completeReservedStudioToolsCompanionWindow({");
    expect(page).toContain("}, 8_000)");
    expect(companion).toContain("openStudioToolsCompanionWindow(");
    expect(companion).toContain("isStudioToolsCompanionWindowReusable(");
    expect(companion).toContain('const surface = input.surface ?? "workspace"');
    expect(companion).toContain("input.binding.release(surface)");
    expect(companion).toContain("도구 창을 복구해 다시 연결합니다");
    expect(composition).toContain("openStudioToolsCompanionForMenu({");
    expect(composition).toContain("windowRef: companionWindowRef");
    expect(composition).not.toContain("items: [");
    expect(composition).not.toContain("STUDIO_EDIT_MENU_COMMANDS");
    expect(composition).not.toContain('id: "quick-access-palette"');
    // Null-guarded root import clicks add a few lines vs optional-chaining form. Menu item
    // definitions, including Quick Access, remain owned by the pure catalogue.
    expect(composition.split("\n").length).toBeLessThanOrEqual(210);
  });
});
