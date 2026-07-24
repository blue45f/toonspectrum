import { describe, expect, it } from "vitest";

import studioPageSource from "./StudioPage.tsx?raw";

describe("Studio dialogue structure entry boundary", () => {
  it("connects split, merge, move, copy, text→bubble, multi-format, and ruby to the shipped story panel", () => {
    expect(studioPageSource).toContain("splitDialogueElement(pages");
    expect(studioPageSource).toContain("mergeDialogueWithNext(pages");
    expect(studioPageSource).toContain("transferDialogueElement(pages");
    expect(studioPageSource).toContain("convertTextElementsToBubbles(pages");
    expect(studioPageSource).toContain("applyDialogueFormatPatch(pages");
    expect(studioPageSource).toContain("applyDialogueRubySpan(pages");
    expect(studioPageSource).toContain("clearDialogueRubyRange(pages");
    expect(studioPageSource).toContain("onSplitText={splitDialogueText}");
    expect(studioPageSource).toContain("onMergeWithNext={mergeDialogueTextWithNext}");
    expect(studioPageSource).toContain("onTransferElement={transferDialogueText}");
    expect(studioPageSource).toContain("onConvertTextToBubble={convertDialogueTextToBubble}");
    expect(studioPageSource).toContain("onConvertTextsToBubbles={convertDialogueTextsToBubbles}");
    expect(studioPageSource).toContain("onApplyFormat={applyDialogueMultiFormat}");
    expect(studioPageSource).toContain("onApplyDialogueRuby={applyDialogueRuby}");
    expect(studioPageSource).toContain("onClearDialogueRuby={clearDialogueRuby}");
    expect(studioPageSource).toContain(
      "selectedIds={marqueeIds.length > 0 ? marqueeIds : selectedId ? [selectedId] : []}"
    );
  });

  it("selects the resulting dialogue and target page after a structural commit", () => {
    expect(studioPageSource).toContain("setSelectedId(newElementId);");
    expect(studioPageSource).toContain("setCurrentPageId(targetPageId);");
    expect(studioPageSource).toContain("setSelectedId(nextElementId);");
  });
});
