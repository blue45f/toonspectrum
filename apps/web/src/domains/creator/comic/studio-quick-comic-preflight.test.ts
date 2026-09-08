import { describe, expect, it } from "vitest";

import { parseDialogueScript } from "../studio-dialogue";
import { PANEL_LAYOUTS } from "../studio-panel-layouts";

import {
  createQuickComicPreflightReport,
  normalizeQuickComicDialogueScript,
  recommendQuickComicLayout,
  splitLongQuickComicDialogueScript,
} from "./studio-quick-comic-preflight";

describe("studio quick comic preflight", () => {
  it("keeps the empty starting draft on a safe default flow", () => {
    const recommendation = recommendQuickComicLayout({
      dialogueScript: "",
      sceneTemplateId: null,
    });
    const report = createQuickComicPreflightReport({
      layoutId: "layout_two_rows",
      sceneTemplateId: null,
      dialogueScript: "",
      assemblyComposable: true,
    });

    expect(PANEL_LAYOUTS.some((layout) => layout.id === recommendation.layoutId)).toBe(true);
    expect(recommendation.layoutId).toBe("layout_two_rows");
    expect(report.status).toBe("ready");
    expect(report.issues.map((issue) => issue.code)).toContain("empty-page");
  });

  it("recommends more panels and explains density for dialogue-heavy pages", () => {
    const dialogueScript = Array.from(
      { length: 8 },
      (_, index) => `${index % 2 === 0 ? "민수" : "지영"}: ${index + 1}번째 대사`,
    ).join("\n");
    const report = createQuickComicPreflightReport({
      layoutId: "layout_two_rows",
      sceneTemplateId: null,
      dialogueScript,
      assemblyComposable: true,
    });

    expect(report.recommendation.frameCount).toBeGreaterThan(2);
    expect(report.metrics.maxDialogueInPanel).toBe(4);
    expect(report.issues.map((issue) => issue.code)).toContain("panel-density");
    expect(report.status).toBe("review");
  });

  it("warns only when preset dialogue placeholders would remain in the output", () => {
    const layoutWithBubbles = PANEL_LAYOUTS.find(
      (layout) => (layout.bubbles?.length ?? 0) > 0,
    )!;
    const placeholderReport = createQuickComicPreflightReport({
      layoutId: layoutWithBubbles.id,
      sceneTemplateId: null,
      dialogueScript: "",
      assemblyComposable: true,
      assemblyBubbleCount: layoutWithBubbles.bubbles?.length ?? 0,
    });
    const scenePlaceholderReport = createQuickComicPreflightReport({
      layoutId: "layout_two_rows",
      sceneTemplateId: "confession",
      dialogueScript: "",
      assemblyComposable: true,
      assemblyBubbleCount: 1,
    });
    const dialogueReport = createQuickComicPreflightReport({
      layoutId: layoutWithBubbles.id,
      sceneTemplateId: null,
      dialogueScript: "민수: 안녕\n지영: 반가워",
      assemblyComposable: true,
      assemblyBubbleCount: 2,
    });

    expect(placeholderReport.issues.map((issue) => issue.code)).toContain(
      "placeholder-dialogue",
    );
    expect(placeholderReport.status).toBe("review");
    expect(scenePlaceholderReport.issues.map((issue) => issue.code)).toContain(
      "placeholder-dialogue",
    );
    expect(scenePlaceholderReport.issues[0]?.detail).toContain("1개");
    expect(dialogueReport.issues.map((issue) => issue.code)).not.toContain(
      "placeholder-dialogue",
    );
  });

  it("normalizes speaker punctuation and splits long dialogue without losing speaker sides", () => {
    const source = ` 민수：  ${"오늘은 중요한 이야기를 천천히 설명해야 해서 문장이 아주 길어졌어. ".repeat(3)}\n[  잠시 후  ]`;
    const normalized = normalizeQuickComicDialogueScript(source);
    const split = splitLongQuickComicDialogueScript(normalized, 32);
    const lines = split.split("\n");
    const parsed = parseDialogueScript(split);

    expect(normalized.startsWith("민수: ")).toBe(true);
    expect(lines.filter((line) => line.startsWith("민수: ")).length).toBeGreaterThan(1);
    expect(lines.at(-1)).toBe("[잠시 후]");
    expect(parsed.filter((line) => line.kind === "speech").every((line) => line.side === "left"))
      .toBe(true);
    expect(parsed.every((line) => Array.from(line.text).length <= 32)).toBe(true);
  });

  it("blocks application when the shipped assembler cannot place the composition", () => {
    const report = createQuickComicPreflightReport({
      layoutId: "layout_two_rows",
      sceneTemplateId: "confession",
      dialogueScript: "민수: 첫 번째\n지영: 두 번째",
      assemblyComposable: false,
    });

    expect(report.status).toBe("blocked");
    expect(report.score).toBeLessThan(70);
    expect(report.issues[0]?.code).toBe("assembly-overlap");
    expect(report.issues[0]?.detail).toContain("장면 대상 컷");
  });
});
