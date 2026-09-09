import { describe, expect, it } from "vitest";

import type { ScenarioPreviewItem } from "../studio-scenario-layout";
import {
  appendScenarioImageCandidate,
  approveScenarioImageCandidate,
  compileStudioScenarioImagePromptDirective,
  inspectStudioScenarioImageGeneration,
  isScenarioImageCandidateStale,
  planStudioScenarioImageGeneration,
  scenarioCandidateReviewStatus,
  scenarioImageCandidates,
  scenarioImageInputFingerprint,
  selectScenarioImageCandidate,
  STUDIO_SCENARIO_IMAGE_MAX_REQUESTS_PER_BATCH,
  summarizeStudioScenarioCandidateReadiness,
} from "./studio-scenario-candidate-workflow";

function item(overrides: Partial<ScenarioPreviewItem> = {}): ScenarioPreviewItem {
  return {
    frame: { x: 0, y: 0, width: 800, height: 600 },
    bubbles: [],
    beatType: "setup",
    summary: "비 오는 골목",
    imagePrompt: "비 오는 골목의 주인공",
    dialogue: "",
    aspect: "landscape",
    ...overrides,
  };
}

describe("scenario candidate workflow", () => {
  it("plans only explicit cuts with 1/2/4 variants and keeps default missing-only behavior", () => {
    const items = [
      item({ imageDataUrl: "data:image/png;base64,reviewed" }),
      item({ imagePrompt: "두 번째 컷" }),
      item({ imagePrompt: "세 번째 컷" }),
    ];

    expect(
      planStudioScenarioImageGeneration(items).map(
        ({ index, variant, variantCount }) => ({ index, variant, variantCount }),
      ),
    ).toEqual([
      { index: 1, variant: 1, variantCount: 1 },
      { index: 2, variant: 1, variantCount: 1 },
    ]);
    const alternatives = planStudioScenarioImageGeneration(items, {
      indexes: [2, 0, 2],
      variants: 4,
      qualityProfile: "final",
      variationStrategy: "coverage",
    });
    expect(alternatives).toHaveLength(8);
    expect(alternatives[0]).toMatchObject({
      qualityProfile: "final",
      variationStrategy: "coverage",
      variationLabel: "와이드 설정 숏",
    });
    expect(new Set(alternatives.slice(0, 4).map((task) => task.variationLabel)).size).toBe(4);
  });

  it("compiles provider-neutral quality and shot-coverage directives without inventing a seed", () => {
    const compiled = compileStudioScenarioImagePromptDirective({
      qualityProfile: "final",
      variationStrategy: "coverage",
      variant: 3,
      variantCount: 4,
    });

    expect(compiled.qualityLabel).toBe("최종 작화");
    expect(compiled.variationLabel).toBe("클로즈 감정 숏");
    expect(compiled.promptDirective).toContain("얼굴·손·의상·소품");
    expect(compiled.promptDirective).toContain("이미지 내부 문자는 생성하지 않습니다");
    expect(compiled.promptDirective.toLowerCase()).not.toContain("seed");
  });

  it("fails closed before an accidental oversized paid batch starts", () => {
    const items = Array.from({ length: 7 }, (_, index) =>
      item({ imagePrompt: `${index + 1}번 컷` }),
    );
    const request = { indexes: items.map((_, index) => index), variants: 4 as const };
    const preflight = inspectStudioScenarioImageGeneration(items, request);

    expect(preflight.requestedCount).toBe(28);
    expect(preflight.maxRequests).toBe(STUDIO_SCENARIO_IMAGE_MAX_REQUESTS_PER_BATCH);
    expect(preflight.withinLimit).toBe(false);
    expect(planStudioScenarioImageGeneration(items, request)).toEqual([]);
  });

  it("preserves the reviewed result as a candidate and appends a labeled new result", () => {
    const original = item({
      imageDataUrl: "data:image/png;base64,original",
      imageProvenance: {
        action: "generated",
        provider: "original.test",
        model: "original-model",
        transport: "byok",
        promptVersion: 1,
        createdAt: "2026-09-08T00:00:00.000Z",
      },
    });
    const fingerprint = scenarioImageInputFingerprint(original, "refs-v1");
    const appended = appendScenarioImageCandidate(original, {
      id: "operation-2",
      imageDataUrl: "data:image/png;base64,new",
      inputFingerprint: fingerprint,
      qualityProfile: "balanced",
      variationStrategy: "directorial",
      variationLabel: "블로킹·여백",
    });

    expect(scenarioImageCandidates(appended)).toHaveLength(2);
    expect(appended.imageDataUrl).toContain("new");
    expect(appended.selectedImageCandidateId).toBe("operation-2");
    expect(appended.imageCandidates?.at(-1)).toMatchObject({
      qualityProfile: "balanced",
      variationStrategy: "directorial",
      variationLabel: "블로킹·여백",
    });
  });

  it("selects and approves without deleting alternatives, then marks them stale after input changes", () => {
    const base = item();
    const fingerprint = scenarioImageInputFingerprint(base, "refs-v1");
    const first = appendScenarioImageCandidate(base, {
      id: "first",
      imageDataUrl: "data:image/png;base64,first",
      inputFingerprint: fingerprint,
    });
    const second = appendScenarioImageCandidate(first, {
      id: "second",
      imageDataUrl: "data:image/png;base64,second",
      inputFingerprint: fingerprint,
    });
    const selected = selectScenarioImageCandidate(second, "first");
    const approved = approveScenarioImageCandidate(selected, "first");

    expect(approved.imageDataUrl).toContain("first");
    expect(approved.approvedImageCandidateId).toBe("first");
    expect(approved.imageCandidates).toHaveLength(2);
    expect(isScenarioImageCandidateStale(approved.imageCandidates![0]!, approved, "refs-v1")).toBe(false);
    expect(scenarioCandidateReviewStatus(approved, "refs-v1")).toBe("approved");
    expect(
      isScenarioImageCandidateStale(
        approved.imageCandidates![0]!,
        { ...approved, imagePrompt: "바뀐 프롬프트" },
        "refs-v1",
      ),
    ).toBe(true);
  });

  it("summarizes missing, failed, review-required and approved cuts for bulk selection", () => {
    const approvedBase = item({ summary: "승인 컷" });
    const fingerprint = scenarioImageInputFingerprint(approvedBase, "refs");
    const approved = approveScenarioImageCandidate(
      appendScenarioImageCandidate(approvedBase, {
        id: "approved",
        imageDataUrl: "data:image/png;base64,approved",
        inputFingerprint: fingerprint,
      }),
      "approved",
    );
    const unapproved = appendScenarioImageCandidate(item({ summary: "검토 컷" }), {
      id: "review",
      imageDataUrl: "data:image/png;base64,review",
      inputFingerprint: scenarioImageInputFingerprint(item({ summary: "검토 컷" }), "refs"),
    });
    const readiness = summarizeStudioScenarioCandidateReadiness([
      approved,
      unapproved,
      item({ summary: "누락 컷" }),
      item({ summary: "실패 컷", imageError: "provider failed" }),
    ], "refs");

    expect(readiness).toMatchObject({
      total: 4,
      approved: 1,
      unapproved: 1,
      missing: 1,
      failed: 1,
      reviewIndexes: [1],
      missingIndexes: [2, 3],
    });
  });
});
