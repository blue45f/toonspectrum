import { describe, expect, it } from "vitest";

import { planStudioStoryboard } from "./studio-storyboard-planner";

describe("Studio storyboard planner", () => {
  it("turns ordered story beats into deterministic webtoon shots", () => {
    const plan = planStudioStoryboard([
      { id: "beat-1", sceneId: "scene-1", order: 0, kind: "setup", summary: "학교 전경", dialogue: "", characterIds: [], locationId: "school" },
      { id: "beat-2", sceneId: "scene-1", order: 1, kind: "dialogue", summary: "주인공이 친구를 부른다", dialogue: "민서야!", characterIds: ["hero", "friend"], locationId: "school" },
      { id: "beat-3", sceneId: "scene-2", order: 2, kind: "reveal", summary: "문 뒤의 인물이 드러난다", dialogue: "설마...", characterIds: ["hero"], locationId: "hallway" },
    ]);
    expect(plan.status).toBe("ready");
    expect(plan.shots).toMatchObject([
      { shotSize: "wide", camera: "eye-level establishing" },
      { shotSize: "medium", camera: "shot-reverse-shot", composition: "multi-character readable staging", scrollGapAfterPx: 240 },
      { shotSize: "extreme-close-up", camera: "controlled push-in" },
    ]);
    expect(plan.estimatedCanvasHeightPx).toBeGreaterThan(2000);
  });

  it("flags long dialogue and missing characters for human review", () => {
    const plan = planStudioStoryboard([{
      id: "beat-1",
      sceneId: "scene-1",
      order: 0,
      kind: "dialogue",
      summary: "긴 설명",
      dialogue: "아주 긴 대사 ".repeat(30),
      characterIds: [],
      locationId: null,
    }]);
    expect(plan.status).toBe("review");
    expect(plan.warnings).toEqual([
      "long-dialogue:beat-1",
      "character-missing:beat-1",
    ]);
  });

  it("rejects empty, duplicate or ambiguously ordered beats", () => {
    expect(() => planStudioStoryboard([])).toThrow("at least one");
    const beat = { id: "same", sceneId: "scene", order: 0, kind: "setup" as const, summary: "장면", dialogue: "", characterIds: [], locationId: null };
    expect(() => planStudioStoryboard([beat, beat])).toThrow("ids must be unique");
  });
});
