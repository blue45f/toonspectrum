import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./StudioAiToolPopoverBody.tsx", import.meta.url)),
  "utf8"
);

describe("StudioAiToolPopoverBody webtoon AI production wiring", () => {
  it("keeps both advanced modals off the initial studio chunk", () => {
    expect(source).toContain('import("./StudioAiEpisodeProductionModal")');
    expect(source).toContain('import("./StudioAiSuperSuiteModal")');
    expect(source).toContain("lazyRetry(");
    expect(source).toContain("createStudioIntentLazyLoader");
    expect(source).toContain("studioAiEpisodeProductionModalLoader.preload");
    expect(source).toContain("studioAiSuperSuiteModalLoader.preload");
  });

  it("restores the previously hidden super-suite launcher and adds episode production", () => {
    expect(source).toContain("onOpenEpisodeProduction={() => setEpisodeProductionOpen(true)}");
    expect(source).toContain("onOpenSuperSuite={() => setSuperSuiteOpen(true)}");
    expect(source).toContain("<StudioAiEpisodeProductionModal");
    expect(source).toContain("<StudioAiSuperSuiteModal");
  });

  it("hands approved prompts back to the existing non-destructive AI tool flow", () => {
    expect(source).toContain('setAiAssistTool("composition")');
    expect(source).toContain("setAiCompositionDraft(trimmed)");
    expect(source).toContain("pushStudioAiRecentPrompt");
    expect(source).toContain('setMenu("aiAssist")');
    expect(source).toContain("onApplyPrompt={applyEpisodeBatchPrompt}");
    expect(source).toContain("onApplyPrompt={applySuperSuitePrompt}");
  });
});
