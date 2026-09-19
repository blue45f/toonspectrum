import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { readStudioCanvasViewportStack } from "../canvas/read-studio-canvas-viewport-stack";


const studioCanvasViewportSource = readStudioCanvasViewportStack(import.meta.url, "../canvas/");
const studioCanvasModalsSource = readFileSync(
  new URL("../canvas/StudioCanvasModalsBody.tsx", import.meta.url),
  "utf8",
);

describe("Studio dialogue structure entry boundary", () => {
  it("connects split, merge, move, copy, text→bubble, multi-format, and ruby to the shipped story panel", () => {
    expect(studioCanvasViewportSource).toContain("splitDialogueElement(pages");
    expect(studioCanvasViewportSource).toContain("mergeDialogueWithNext(pages");
    expect(studioCanvasViewportSource).toContain("transferDialogueElement(pages");
    expect(studioCanvasViewportSource).toContain("convertTextElementsToBubbles(pages");
    expect(studioCanvasViewportSource).toContain("applyDialogueFormatPatch(pages");
    expect(studioCanvasViewportSource).toContain("applyDialogueRubySpan(pages");
    expect(studioCanvasViewportSource).toContain("clearDialogueRubyRange(pages");
    expect(studioCanvasModalsSource).toContain("onSplitText={splitDialogueText}");
    expect(studioCanvasModalsSource).toContain("onMergeWithNext={mergeDialogueTextWithNext}");
    expect(studioCanvasModalsSource).toContain("onTransferElement={transferDialogueText}");
    expect(studioCanvasModalsSource).toContain("onConvertTextToBubble={convertDialogueTextToBubble}");
    expect(studioCanvasModalsSource).toContain(
      "onConvertTextsToBubbles={convertDialogueTextsToBubbles}",
    );
    expect(studioCanvasModalsSource).toContain("onApplyFormat={applyDialogueMultiFormat}");
    expect(studioCanvasModalsSource).toContain("onApplyDialogueRuby={applyDialogueRuby}");
    expect(studioCanvasModalsSource).toContain("onClearDialogueRuby={clearDialogueRuby}");
    expect(studioCanvasModalsSource).toContain(
      "selectedIds={marqueeIds.length > 0 ? marqueeIds : selectedId ? [selectedId] : []}"
    );
  });

  it("selects the resulting dialogue and target page after a structural commit", () => {
    expect(studioCanvasViewportSource).toContain("setSelectedId(newElementId);");
    expect(studioCanvasViewportSource).toContain("setCurrentPageId(targetPageId);");
    expect(studioCanvasViewportSource).toContain("setSelectedId(nextElementId);");
  });
});
