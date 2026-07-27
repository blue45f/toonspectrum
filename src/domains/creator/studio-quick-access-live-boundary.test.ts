import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const studioPageSource = readFileSync(
  new URL("./StudioPage.tsx", import.meta.url),
  "utf8",
);
const integrationSource = readFileSync(
  new URL("./studio-quick-access-integration.ts", import.meta.url),
  "utf8",
);
const mainMenuCatalogueSource = readFileSync(
  new URL("./studio-main-menu-groups.ts", import.meta.url),
  "utf8",
);

describe("Studio Quick Access live boundary", () => {
  it("keeps optional UI and persistence code behind the explicit user intent boundary", () => {
    expect(studioPageSource).toContain(
      'import("./studio-quick-access-integration")',
    );
    expect(studioPageSource).toContain(
      'import("./StudioQuickAccessSurface")',
    );
    expect(studioPageSource).not.toMatch(
      /^import\s+\{[^}]*loadStudioQuickAccessState[^}]*\}\s+from\s+"\.\/studio-quick-access-integration";/mu,
    );
    expect(studioPageSource).toContain("quickAccessPaletteOpen && quickAccessState");
  });

  it("exposes one CLIP-familiar menu/shortcut entry and reuses trusted editor actions", () => {
    expect(mainMenuCatalogueSource.match(/id: "quick-access-palette"/gu)).toHaveLength(1);
    expect(mainMenuCatalogueSource).toContain('shortcut: "⇧Q"');
    expect(mainMenuCatalogueSource).toContain("onSelect: ui.toggleQuickAccessPalette");
    expect(studioPageSource).not.toContain('id: "quick-access-palette"');
    expect(studioPageSource).toContain(
      "toggleQuickAccessPalette: studioMainMenuActions.toggleStudioQuickAccessPalette",
    );
    expect(studioPageSource).toContain('e.code === "KeyQ"');
    expect(studioPageSource).toContain(
      "resolveStudioQuickAccessExecutionIntent(commandId)",
    );
    expect(studioPageSource).toContain("executeQuickAction(intent.action)");
    expect(studioPageSource).toContain('handleSave("draft")');
    expect(studioPageSource).toContain("openPixelSelectionTransform()");
  });

  it("persists only the bounded owner-scoped local model without a network path", () => {
    expect(integrationSource).toContain("encodeStudioQuickAccessState(state)");
    expect(integrationSource).toContain("VALID_OWNER_SCOPE");
    expect(integrationSource).toContain("storage.setItem(key, encoded)");
    expect(integrationSource).not.toMatch(/\bfetch\s*\(/u);
    expect(integrationSource).not.toMatch(/\bWebSocket\b/u);
  });
});
