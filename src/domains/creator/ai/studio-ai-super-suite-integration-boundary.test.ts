import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("AI super-suite production integration boundary", () => {
  it("keeps a non-lossy menu fallback when an optional host callback is absent", () => {
    const menu = source(
      "src/domains/creator/studio-main-menu-items-production.ts"
    );

    expect(menu).toContain("requestStudioAiSuperSuiteOpen");
    expect(menu).toContain('ui.openStudioMenu("aiAssist")');
  });

  it("consumes late open requests and returns a lossless recipe to the image tool", () => {
    const popover = source(
      "src/domains/creator/ai/StudioAiToolPopoverBody.tsx"
    );
    const modal = source(
      "src/domains/creator/ai/StudioAiSuperSuiteModal.tsx"
    );

    expect(popover).toContain("consumeStudioAiSuperSuiteOpenRequest");
    expect(popover).toContain("subscribeStudioAiSuperSuiteOpenRequest");
    expect(popover).toContain("compileStudioAiSuitePromptHandoff");
    expect(popover).toContain('setMenu("aiAssist")');
    expect(modal).toContain("onApplyPromptRecipe");
  });
});
