import { describe, expect, it } from "vitest";

import {
  auditStudioAccessibility,
  studioColorContrast,
  type StudioAccessibilityPolicy,
} from "./studio-accessibility-audit";

const POLICY: StudioAccessibilityPolicy = Object.freeze({
  minimumTextPx: 16,
  minimumContrast: 4.5,
  minimumLargeTextContrast: 3,
  largeTextPx: 24,
  minimumTouchTargetPx: 44,
  requireAltText: true,
  requireCaptions: true,
  requireReadingOrder: true,
});

describe("Studio accessibility audit", () => {
  it("passes a readable keyboard and media-complete document", () => {
    expect(studioColorContrast("#000000", "#ffffff")).toBeCloseTo(21);
    expect(auditStudioAccessibility({
      textNodes: [{ id: "title", text: "작품명", sizePx: 26, foreground: "#111111", background: "#ffffff", essential: true }],
      imageNodes: [{ id: "cover", decorative: false, altText: "두 인물이 별빛 아래 서 있다." }],
      interactiveNodes: [{ id: "next", label: "다음 장면", widthPx: 44, heightPx: 44, keyboardReachable: true }],
      audioNodes: [{ id: "voice", hasSpeechOrMeaningfulSound: true, captionsComplete: true, transcriptComplete: true }],
      readingOrderIds: ["title", "cover", "next"],
      requiredReadingOrderIds: ["title", "cover", "next"],
    }, POLICY)).toMatchObject({ status: "pass", findings: [] });
  });

  it("blocks contrast, keyboard, captions and reading-order failures", () => {
    const report = auditStudioAccessibility({
      textNodes: [{ id: "body", text: "대사", sizePx: 12, foreground: "#999999", background: "#ffffff", essential: true }],
      imageNodes: [{ id: "scene", decorative: false, altText: "" }],
      interactiveNodes: [{ id: "tiny", label: "", widthPx: 24, heightPx: 24, keyboardReachable: false }],
      audioNodes: [{ id: "voice", hasSpeechOrMeaningfulSound: true, captionsComplete: false, transcriptComplete: false }],
      readingOrderIds: ["body", "body"],
      requiredReadingOrderIds: ["body", "scene", "tiny"],
    }, POLICY);
    expect(report.status).toBe("blocked");
    expect(report.findings.map((item) => item.code)).toEqual(expect.arrayContaining([
      "text-size",
      "text-contrast",
      "alt-text",
      "control-label",
      "touch-target",
      "keyboard",
      "captions",
      "transcript",
      "reading-order-duplicate",
      "reading-order-missing",
    ]));
  });

  it("ignores decorative images and silent audio", () => {
    const report = auditStudioAccessibility({
      textNodes: [],
      imageNodes: [{ id: "texture", decorative: true, altText: "" }],
      interactiveNodes: [],
      audioNodes: [{ id: "silent", hasSpeechOrMeaningfulSound: false, captionsComplete: false, transcriptComplete: false }],
      readingOrderIds: [],
      requiredReadingOrderIds: [],
    }, POLICY);
    expect(report.status).toBe("pass");
  });

  it("rejects malformed colors and policy thresholds", () => {
    expect(() => studioColorContrast("red", "#ffffff")).toThrow("Invalid accessibility color");
    expect(() => auditStudioAccessibility({
      textNodes: [],
      imageNodes: [],
      interactiveNodes: [],
      audioNodes: [],
      readingOrderIds: [],
      requiredReadingOrderIds: [],
    }, { ...POLICY, minimumTouchTargetPx: 0 })).toThrow("positive");
  });
});
