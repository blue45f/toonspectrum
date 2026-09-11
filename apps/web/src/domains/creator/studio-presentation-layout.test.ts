import { describe, expect, it } from "vitest";

import { auditStudioPresentation } from "./studio-presentation-layout";

describe("Studio presentation layout", () => {
  it("accepts a clear editable pitch slide and recommends a hero layout", () => {
    const plan = auditStudioPresentation([{
      id: "slide-1",
      title: "작품 소개",
      speakerNotes: "주인공과 핵심 갈등을 설명한다.",
      blocks: [
        { id: "title", kind: "title", bounds: { x: 0.08, y: 0.08, width: 0.84, height: 0.12 }, text: "별빛 아래 우리", fontSizePt: 36, assetRightsStatus: null },
        { id: "image", kind: "image", bounds: { x: 0.08, y: 0.25, width: 0.5, height: 0.65 }, text: "", fontSizePt: null, assetRightsStatus: "allowed" },
        { id: "body", kind: "body", bounds: { x: 0.63, y: 0.3, width: 0.29, height: 0.5 }, text: "두 인물이 비밀을 추적하는 성장 로맨스", fontSizePt: 20, assetRightsStatus: null },
      ],
    }]);
    expect(plan).toMatchObject({
      status: "ready",
      findings: [],
      recommendedLayoutBySlide: { "slide-1": "hero" },
    });
  });

  it("blocks invalid bounds and asset rights while warning about overlaps and small text", () => {
    const plan = auditStudioPresentation([{
      id: "slide-1",
      title: "문제 슬라이드",
      speakerNotes: "",
      blocks: [
        { id: "body-1", kind: "body", bounds: { x: 0.1, y: 0.1, width: 0.7, height: 0.7 }, text: "본문", fontSizePt: 9, assetRightsStatus: null },
        { id: "image", kind: "image", bounds: { x: 0.5, y: 0.5, width: 0.7, height: 0.7 }, text: "", fontSizePt: null, assetRightsStatus: "blocked" },
      ],
    }]);
    expect(plan.status).toBe("blocked");
    expect(plan.findings.map((item) => item.code)).toEqual(expect.arrayContaining([
      "title-block-missing",
      "text-too-small",
      "block-bounds",
      "asset-rights",
      "block-overlap",
    ]));
  });
});
