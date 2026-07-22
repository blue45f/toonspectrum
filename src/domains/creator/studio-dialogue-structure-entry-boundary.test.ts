import { describe, expect, it } from "vitest";

import studioPageSource from "./StudioPage.tsx?raw";

describe("Studio dialogue structure entry boundary", () => {
  it("connects split, merge, move, and copy operations to the shipped story panel", () => {
    expect(studioPageSource).toContain("splitDialogueElement(pages");
    expect(studioPageSource).toContain("mergeDialogueWithNext(pages");
    expect(studioPageSource).toContain("transferDialogueElement(pages");
    expect(studioPageSource).toContain("onSplitText={splitDialogueText}");
    expect(studioPageSource).toContain("onMergeWithNext={mergeDialogueTextWithNext}");
    expect(studioPageSource).toContain("onTransferElement={transferDialogueText}");
  });

  it("selects the resulting dialogue and target page after a structural commit", () => {
    expect(studioPageSource).toContain("setSelectedId(newElementId);");
    expect(studioPageSource).toContain("setCurrentPageId(targetPageId);");
    expect(studioPageSource).toContain("setSelectedId(nextElementId);");
  });
});
