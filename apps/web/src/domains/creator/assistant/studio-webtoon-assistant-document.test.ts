import { describe, expect, it } from "vitest";

import { buildStudioWebtoonAssistantDocumentAnalysis } from "./studio-webtoon-assistant-document";
import type { El } from "../studio-element-model";

function frame(id: string, x: number, y: number, width: number, height: number): El {
  return { id, type: "frame", x, y, width, height, rotation: 0 } as El;
}

function text(id: string, x: number, y: number, width: number, height: number): El {
  return { id, type: "text", x, y, width, height, rotation: 0, text: "대사", font: "sans-serif", fontSize: 24, fill: "#111", align: "left", lineHeight: 1.2, letterSpacing: 0 } as El;
}

describe("Studio Webtoon Assistant document projection", () => {
  it("derives ordered panel bounds, protected regions, and dialogue counts from the active page", () => {
    const result = buildStudioWebtoonAssistantDocumentAnalysis([
      frame("frame-b", 0, 800, 690, 500),
      text("outside", 10, 1500, 100, 50),
      frame("frame-a", 20, 100, 650, 550),
      text("dialogue-a", 100, 180, 220, 80),
      text("dialogue-b", 400, 900, 180, 70),
    ]);

    expect(result.panels).toEqual([
      { id: "frame-a", topY: 100, bottomY: 650, heightPx: 550, dialogueCount: 1 },
      { id: "frame-b", topY: 800, bottomY: 1300, heightPx: 500, dialogueCount: 1 },
    ]);
    expect(result.protectedRegions).toEqual([
      { top: 100, bottom: 650, label: "원고 컷 1" },
      { top: 800, bottom: 1300, label: "원고 컷 2" },
    ]);
  });

  it("returns an empty projection instead of demo fixtures when the page has no frames", () => {
    expect(buildStudioWebtoonAssistantDocumentAnalysis([])).toEqual({
      protectedRegions: [],
      panels: [],
    });
  });
});
