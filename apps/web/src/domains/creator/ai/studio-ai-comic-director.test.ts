import { describe, expect, it } from "vitest";

import type { ScenarioPreviewItem } from "../studio-scenario-layout";
import {
  analyzeStudioAiComicDirectorQuality,
  applyStudioAiComicDirectorPromptIntent,
  defaultStudioAiComicDirectorSelection,
  inferStudioAiComicDirectorStage,
  normalizeStudioAiComicDirectorSelection,
  parseStudioAiComicDirectorPreferences,
  studioAiComicDirectorApplySummary,
  studioAiComicDirectorPromptIntent,
} from "./studio-ai-comic-director";

function item(overrides: Partial<ScenarioPreviewItem> = {}): ScenarioPreviewItem {
  return {
    frame: { x: 0, y: 0, width: 800, height: 600 },
    bubbles: [],
    beatType: "setup",
    summary: "비 오는 폐역",
    imagePrompt: "폐역 플랫폼에 선 두 인물",
    dialogue: "유진: 오랜만이야.",
    aspect: "landscape",
    ...overrides,
  };
}

describe("AI comic director model", () => {
  it("moves from brief to direction and production based on real session data", () => {
    expect(inferStudioAiComicDirectorStage(null)).toBe("brief");
    expect(inferStudioAiComicDirectorStage([item()])).toBe("direction");
    expect(
      inferStudioAiComicDirectorStage([
        item({ imageDataUrl: "data:image/png;base64,result" }),
      ]),
    ).toBe("production");
  });

  it("applies one deterministic candidate intent marker without stacking copies", () => {
    const expressive = applyStudioAiComicDirectorPromptIntent(
      "폐역에 선 유진",
      "expressive",
    );
    const cinematic = applyStudioAiComicDirectorPromptIntent(
      expressive,
      "cinematic",
    );

    expect(studioAiComicDirectorPromptIntent(expressive)).toBe("expressive");
    expect(studioAiComicDirectorPromptIntent(cinematic)).toBe("cinematic");
    expect(cinematic.match(/AI 코믹 디렉터 제작 방향/gu)).toHaveLength(1);
    expect(cinematic).toContain("폐역에 선 유진");
  });

  it("normalizes selections and defaults to missing-image panels", () => {
    const items = [
      item({ imageDataUrl: "data:image/png;base64,ready" }),
      item(),
      item(),
    ];
    expect(normalizeStudioAiComicDirectorSelection([2, 2, -1, 9, 1], 3)).toEqual([
      1,
      2,
    ]);
    expect(defaultStudioAiComicDirectorSelection(items)).toEqual([1, 2]);
  });

  it("reports actionable blockers and review findings without inventing a score", () => {
    const findings = analyzeStudioAiComicDirectorQuality({
      items: [
        item({ summary: "", imagePrompt: "" }),
        item({ dialogue: "대사 ".repeat(70), imageError: "429" }),
      ],
      referenceSignature: "refs",
      referencesLoading: false,
      missingReferenceCount: 1,
      referenceCount: 3,
      referenceLimit: 4,
    });

    expect(findings.some((finding) => finding.id === "references-missing")).toBe(true);
    expect(findings.some((finding) => finding.id === "panel-0-summary")).toBe(true);
    expect(findings.some((finding) => finding.id === "panel-0-prompt")).toBe(true);
    expect(findings.some((finding) => finding.id === "panel-1-dialogue-density")).toBe(true);
    expect(findings.some((finding) => finding.id === "panel-1-image-error")).toBe(true);
  });

  it("summarizes only objects that the existing Studio apply path can really create", () => {
    expect(
      studioAiComicDirectorApplySummary([
        item({
          imageDataUrl: "data:image/png;base64,ready",
          bubbles: [{
            type: "bubble",
            variant: "speech",
            text: "오랜만이야.",
            x: 0,
            y: 0,
            width: 100,
            height: 50,
            fill: "#ffffff",
            textFill: "#111111",
            rotation: 0,
            tail: "left",
            align: "center",
          }],
        }),
        item({ dialogue: "서하: 누구야?\n(잠시 정적)", imageError: "failed" }),
      ]),
    ).toEqual({
      frames: 2,
      images: 1,
      dialogueLines: 3,
      bubbles: 1,
      failedImages: 1,
    });
  });

  it("fails soft when session preferences are corrupt or refer to removed panels", () => {
    expect(parseStudioAiComicDirectorPreferences("not-json", [item()]).stage).toBe(
      "direction",
    );
    const restored = parseStudioAiComicDirectorPreferences(
      JSON.stringify({
        stage: "production",
        view: "list",
        profile: "final",
        selectedIndexes: [0, 3, -1],
        selectedPanelIndex: 4,
        intents: { 0: "expressive", 1: "unknown" },
      }),
      [item()],
    );
    expect(restored.selectedIndexes).toEqual([0]);
    expect(restored.selectedPanelIndex).toBe(0);
    expect(restored.intents).toEqual({ 0: "expressive" });
  });
});
