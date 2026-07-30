import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(fileName: string): string {
  return readFileSync(new URL(fileName, import.meta.url), "utf8");
}

describe("studio main-menu catalogue ownership boundary", () => {
  it("keeps the catalogue React-, browser-, and page-state-free", () => {
    const catalogue = source("./studio-main-menu-groups.ts");
    const localization = source("./studio-main-menu-localization.ts");

    expect(catalogue).not.toMatch(/from\s+["']react["']/u);
    expect(catalogue).not.toMatch(/\b(?:document|window|globalThis)\s*\./u);
    expect(catalogue).not.toContain("StudioPage");
    expect(catalogue).not.toMatch(/\buse(?:Memo|Callback|Effect|State|Ref)\b/u);
    expect(catalogue).toContain('from "./studio-main-menu-localization"');
    expect(catalogue).not.toContain("function localizeText(");
    expect(catalogue).not.toContain("translateItemUnavailableReason");
    expect(localization).not.toMatch(/from\s+["']react["']/u);
    expect(localization).not.toMatch(/\b(?:document|window|globalThis)\s*\./u);
    expect(localization).toContain("export function localizeStudioMainMenuGroups(");
    // 캔버스 px 눈금자, 빠른 액세스, 전문 필터 항목을 소유해도 카탈로그가 독립 모듈
    // 경계를 유지한다. 기능 카탈로그 확장분만 허용하고 React/browser 경계는 위에서 엄격히 막는다.
    expect(catalogue.split("\n").length).toBeLessThanOrEqual(1_120);
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
    expect(composition.split("\n").length).toBeLessThanOrEqual(212);
  });
});
