import { describe, expect, it } from "vitest";

import {
  buildStudioStoryAdaptationPlan,
  buildWriterRoomFromStoryAdaptation,
  createStudioStoryDevelopmentDocument,
} from "./studio-story-adaptation";

describe("studio story adaptation", () => {
  it("turns prose into deterministic scenes, beats and storyboard estimates", () => {
    const plan = buildStudioStoryAdaptationPlan(
      '비가 내리는 밤, 주인공이 역에 도착한다.\n\n“늦었어.” 친구가 말했다. 둘은 플랫폼 끝으로 달린다.',
    );

    expect(plan.scenes).toHaveLength(2);
    expect(plan.beats.length).toBeGreaterThanOrEqual(3);
    expect(plan.estimatedPanels).toBe(plan.beats.length);
    expect(plan.beats.some((beat) => beat.kind === "dialogue")).toBe(true);
  });

  it("creates a writer-room document without mutating the source plan", () => {
    const development = {
      ...createStudioStoryDevelopmentDocument(new Date("2026-09-18T00:00:00.000Z")),
      title: "테스트 작품",
      logline: "두 친구가 사라진 열차를 쫓는다.",
      synopsis: "마지막 열차 뒤에 감춰진 비밀을 추적한다.",
      chapters: [{ id: "chapter-1", title: "1화", body: "역에 도착한다.\n\n“가자.” 둘은 달린다.", status: "draft" as const }],
    };
    const plan = buildStudioStoryAdaptationPlan(development.chapters[0]!.body);
    const writerRoom = buildWriterRoomFromStoryAdaptation({ development, plan });

    expect(writerRoom.stages.synopsis.text).toContain("마지막 열차");
    expect(writerRoom.stages.scenes.items).toHaveLength(plan.scenes.length);
    expect(writerRoom.stages["panel-plan"].items).toHaveLength(plan.estimatedPanels);
    expect(writerRoom.completion["panel-plan"]).toBe(true);
  });
});
