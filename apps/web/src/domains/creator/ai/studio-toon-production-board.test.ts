import { describe, expect, it } from "vitest";

import { scenarioImageInputFingerprint } from "./studio-scenario-candidate-workflow";
import {
  createStudioToonProductionHandoff,
  extendStudioToonProductionScenes,
  STUDIO_TOON_PRODUCTION_MAX_SCENES,
  summarizeStudioToonProductionScenes,
} from "./studio-toon-production-board";

import type { ScenarioPreviewItem } from "../studio-scenario-layout";

function scene(index: number, patch: Partial<ScenarioPreviewItem> = {}): ScenarioPreviewItem {
  return {
    frame: {
      x: 0,
      y: index * 220,
      width: 320,
      height: 196,
    },
    bubbles: [],
    beatType: "escalation",
    summary: `${index + 1}번 장면`,
    imagePrompt: `${index + 1}번 장면 이미지 프롬프트`,
    dialogue: "",
    aspect: "landscape",
    ...patch,
  };
}

describe("Studio toon production board model", () => {
  it("adds connected editable drafts without copying generated outcomes", () => {
    const source = scene(0, {
      imageDataUrl: "data:image/png;base64,approved",
      imageCandidates: [{
        id: "candidate-1",
        imageDataUrl: "data:image/png;base64,approved",
        inputFingerprint: "fingerprint",
        createdAt: "2026-09-23T00:00:00.000Z",
      }],
      selectedImageCandidateId: "candidate-1",
      approvedImageCandidateId: "candidate-1",
      preferredVariantCount: 4,
      preferredQualityProfile: "final",
      preferredVariationStrategy: "coverage",
    });

    const result = extendStudioToonProductionScenes({
      scenes: [source],
      count: 3,
      direction: "도시 밖 추격으로 이어진다",
    });

    expect(result.added).toBe(3);
    expect(result.scenes).toHaveLength(4);
    expect(result.scenes[1]).toMatchObject({
      summary: "연결 장면 2 · 도시 밖 추격으로 이어진다",
      aspect: "landscape",
      preferredVariantCount: 4,
      preferredQualityProfile: "final",
      preferredVariationStrategy: "coverage",
    });
    expect(result.scenes[1]?.frame.y).toBe(source.frame.y + source.frame.height + 24);
    expect(result.scenes[1]?.imagePrompt).toContain("직전 장면: 1번 장면");
    expect(result.scenes[1]).not.toHaveProperty("imageDataUrl");
    expect(result.scenes[1]).not.toHaveProperty("imageCandidates");
    expect(result.scenes[1]).not.toHaveProperty("approvedImageCandidateId");
  });

  it("never extends a project beyond fifty scenes", () => {
    const scenes = Array.from({ length: 49 }, (_, index) => scene(index));
    const result = extendStudioToonProductionScenes({ scenes, count: 10 });

    expect(result.scenes).toHaveLength(STUDIO_TOON_PRODUCTION_MAX_SCENES);
    expect(result.added).toBe(1);
    expect(result.remainingCapacity).toBe(0);
  });

  it("hands only selected scenes and generation preferences to Studio", () => {
    const scenes = [scene(0), scene(1), scene(2)];
    const handoff = createStudioToonProductionHandoff({
      title: "테스트 회차",
      storyText: "스토리",
      characterDescription: "인물 기준",
      scenes,
      request: {
        indexes: [1],
        variants: 4,
        qualityProfile: "final",
        variationStrategy: "coverage",
      },
    });

    expect(handoff).toMatchObject({
      variants: 4,
      qualityProfile: "final",
      variationStrategy: "coverage",
      totalCuts: 1,
      projectedOutputCount: 4,
      generationWorkUnits: 4,
    });
    expect(handoff.modeLabel).toContain("최종 작화");
    expect(handoff.modeLabel).toContain("커버리지");
    expect(handoff.scenes).toHaveLength(1);
    expect(handoff.scenes[0]).toMatchObject({
      sourceSceneNumber: 2,
      summary: "2번 장면",
    });
  });

  it("keeps all scenes for a normal continue action and summarizes review state", () => {
    const approved = scene(2);
    const approvedFingerprint = scenarioImageInputFingerprint(approved);
    approved.imageDataUrl = "data:image/png;base64,approved";
    approved.imageCandidates = [{
      id: "approved",
      imageDataUrl: approved.imageDataUrl,
      inputFingerprint: approvedFingerprint,
      createdAt: "2026-09-23T00:00:00.000Z",
    }];
    approved.selectedImageCandidateId = "approved";
    approved.approvedImageCandidateId = "approved";
    const scenes = [
      scene(0, { imagePrompt: "" }),
      scene(1, { imageDataUrl: "data:image/png;base64,generated" }),
      approved,
      scene(3, { imageError: "provider error" }),
    ];
    const handoff = createStudioToonProductionHandoff({
      title: "전체 인계",
      storyText: "스토리",
      characterDescription: "",
      scenes,
    });

    expect(handoff.scenes).toHaveLength(4);
    expect(handoff.variants).toBe(2);
    expect(summarizeStudioToonProductionScenes(scenes)).toEqual({
      total: 4,
      generated: 2,
      approved: 1,
      failed: 1,
    });
  });
});
