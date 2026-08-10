import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(name: string): string {
  return readFileSync(new URL(name, import.meta.url), "utf8");
}

describe("sensitive Studio browser state stays session-scoped", () => {
  it("keeps Unsplash credentials in sessionStorage and discards the legacy persistent key", () => {
    const panel = source("./StudioIntegrationsSettingsPanel.tsx");
    expect(panel).toContain('browserStorage("sessionStorage")');
    expect(panel).toContain(
      'discardLegacyStudioStockImageAccessKey(browserStorage("localStorage"))',
    );
    expect(panel).not.toContain(
      'saveStudioStockImageAccessKey(browserStorage("localStorage")',
    );
  });

  it("keeps recent AI prompts in the current tab and never imports the old durable value", () => {
    const page = source("./StudioPage.tsx");
    expect(page).toContain(
      "loadStudioAiRecentPrompts(globalThis.sessionStorage)",
    );
    expect(page).toContain(
      "pushStudioAiRecentPrompt(globalThis.sessionStorage",
    );
    expect(page).toContain(
      "globalThis.localStorage.removeItem(STUDIO_AI_RECENT_PROMPTS_KEY)",
    );
    expect(page).not.toContain(
      "loadStudioAiRecentPrompts(globalThis.localStorage)",
    );
  });

  it("keeps fallback pose clipboards in sessionStorage and removes legacy copies", () => {
    const poser = source("./StudioVrmPoser.tsx");
    for (const key of ["studio_pose_clipboard", "studio_vrm_full_clip"]) {
      expect(poser).toContain(`sessionStorage.setItem("${key}"`);
      expect(poser).toContain(`localStorage.removeItem("${key}")`);
      expect(poser).not.toContain(`localStorage.setItem("${key}"`);
    }
  });
});
