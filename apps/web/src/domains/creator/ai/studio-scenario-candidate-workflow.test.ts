import { describe, expect, it } from "vitest";

import type { ScenarioPreviewItem } from "../studio-scenario-layout";
import {
  appendScenarioImageCandidate,
  approveScenarioImageCandidate,
  isScenarioImageCandidateStale,
  planStudioScenarioImageGeneration,
  scenarioImageCandidates,
  scenarioImageInputFingerprint,
  selectScenarioImageCandidate,
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

    expect(planStudioScenarioImageGeneration(items)).toEqual([
      { index: 1, variant: 1, variantCount: 1 },
      { index: 2, variant: 1, variantCount: 1 },
    ]);
    expect(planStudioScenarioImageGeneration(items, { indexes: [2, 0, 2], variants: 4 }))
      .toHaveLength(8);
  });

  it("preserves the reviewed result as a candidate and appends a new selected result", () => {
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
    });

    expect(scenarioImageCandidates(appended)).toHaveLength(2);
    expect(appended.imageDataUrl).toContain("new");
    expect(appended.selectedImageCandidateId).toBe("operation-2");
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
    expect(
      isScenarioImageCandidateStale(
        approved.imageCandidates![0]!,
        { ...approved, imagePrompt: "바뀐 프롬프트" },
        "refs-v1",
      ),
    ).toBe(true);
  });
});
