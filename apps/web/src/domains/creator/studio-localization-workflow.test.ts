import { describe, expect, it } from "vitest";

import {
  createStudioLocalizationUnit,
  evaluateStudioLocalizationQa,
  isStudioLocalizationStatus,
  isStudioLocalizationUnitKind,
  summarizeStudioLocalization,
  transitionStudioLocalizationUnit,
  type StudioLocalizationUnit,
} from "./studio-localization-workflow";

const BASE_UNIT = {
  id: "dialogue-1",
  sourceLocale: "ko-KR",
  targetLocale: "en-US",
  kind: "dialogue" as const,
  sourceText: "우리는 반드시 돌아온다.",
  glossary: [
    {
      sourceTerm: "돌아온다",
      expectedTarget: "return",
      actualTarget: "return",
      required: true,
    },
  ],
  sourceRemoved: false,
  backgroundRestored: false,
  letteringApplied: false,
  readingOrderAssigned: false,
  fontAvailable: true,
  updatedAt: "2026-09-11T00:00:00.000Z",
};

function createUnit(): StudioLocalizationUnit {
  return createStudioLocalizationUnit(BASE_UNIT);
}

function advanceToApproved(): StudioLocalizationUnit {
  let unit = createUnit();
  unit = transitionStudioLocalizationUnit(unit, {
    type: "start-ai-draft",
    translatedText: "We will return.",
    at: "2026-09-11T00:00:01.000Z",
  });
  unit = transitionStudioLocalizationUnit(unit, {
    type: "request-review",
    at: "2026-09-11T00:00:02.000Z",
  });
  return transitionStudioLocalizationUnit(unit, {
    type: "approve",
    reviewerId: "reviewer-1",
    at: "2026-09-11T00:00:03.000Z",
  });
}

describe("Studio localization publishing workflow", () => {
  it("moves a dialogue from source text to an approved, lettered result", () => {
    const approved = advanceToApproved();
    expect(approved).toMatchObject({
      status: "approved",
      translatedText: "We will return.",
      reviewerId: "reviewer-1",
    });

    const layout = transitionStudioLocalizationUnit(approved, {
      type: "prepare-layout",
      at: "2026-09-11T00:00:04.000Z",
      sourceRemoved: true,
      backgroundRestored: true,
      letteringApplied: true,
      readingOrderAssigned: true,
      fontAvailable: true,
      balloonFit: {
        availableWidth: 320,
        availableHeight: 180,
        renderedWidth: 250,
        renderedHeight: 90,
        minimumFontSize: 12,
        actualFontSize: 18,
        lineCount: 2,
        maxLineCount: 4,
      },
    });
    expect(evaluateStudioLocalizationQa(layout)).toEqual([]);

    const completed = transitionStudioLocalizationUnit(layout, {
      type: "complete",
      at: "2026-09-11T00:00:05.000Z",
    });
    expect(completed.status).toBe("complete");
  });

  it("blocks approval when required terminology is inconsistent", () => {
    let unit = createStudioLocalizationUnit({
      ...BASE_UNIT,
      glossary: [{
        sourceTerm: "돌아온다",
        expectedTarget: "return",
        actualTarget: "come back",
        required: true,
      }],
    });
    unit = transitionStudioLocalizationUnit(unit, {
      type: "start-translation",
      at: "2026-09-11T00:00:01.000Z",
    });
    unit = transitionStudioLocalizationUnit(unit, {
      type: "update-translation",
      translatedText: "We will come back.",
      at: "2026-09-11T00:00:02.000Z",
    });
    unit = transitionStudioLocalizationUnit(unit, {
      type: "request-review",
      at: "2026-09-11T00:00:03.000Z",
    });
    expect(() => transitionStudioLocalizationUnit(unit, {
      type: "approve",
      reviewerId: "reviewer-1",
      at: "2026-09-11T00:00:04.000Z",
    })).toThrow(/translation QA/u);
  });

  it("detects overflow, missing fonts, reading order and incomplete cleaning", () => {
    const layout = transitionStudioLocalizationUnit(advanceToApproved(), {
      type: "prepare-layout",
      at: "2026-09-11T00:00:04.000Z",
      sourceRemoved: false,
      backgroundRestored: false,
      letteringApplied: true,
      readingOrderAssigned: false,
      fontAvailable: false,
      balloonFit: {
        availableWidth: 200,
        availableHeight: 80,
        renderedWidth: 260,
        renderedHeight: 110,
        minimumFontSize: 14,
        actualFontSize: 10,
        lineCount: 6,
        maxLineCount: 3,
      },
    });
    expect(evaluateStudioLocalizationQa(layout)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "reading-order", severity: "error" }),
      expect.objectContaining({ code: "font-missing", severity: "error" }),
      expect.objectContaining({ code: "source-not-removed", severity: "error" }),
      expect.objectContaining({ code: "background-not-restored", severity: "warning" }),
      expect.objectContaining({ code: "balloon-overflow", severity: "error" }),
      expect.objectContaining({ code: "font-too-small", severity: "error" }),
    ]));
    expect(() => transitionStudioLocalizationUnit(layout, {
      type: "complete",
      at: "2026-09-11T00:00:05.000Z",
    })).toThrow(/blocked by QA/u);
  });

  it("reopens a completed unit without losing source and translation identity", () => {
    let unit = advanceToApproved();
    unit = transitionStudioLocalizationUnit(unit, {
      type: "prepare-layout",
      at: "2026-09-11T00:00:04.000Z",
      sourceRemoved: true,
      backgroundRestored: true,
      letteringApplied: true,
      readingOrderAssigned: true,
      fontAvailable: true,
    });
    unit = transitionStudioLocalizationUnit(unit, {
      type: "complete",
      at: "2026-09-11T00:00:05.000Z",
    });
    const reopened = transitionStudioLocalizationUnit(unit, {
      type: "reopen",
      at: "2026-09-11T00:00:06.000Z",
    });
    expect(reopened).toMatchObject({
      id: "dialogue-1",
      status: "review-required",
      sourceText: "우리는 반드시 돌아온다.",
      translatedText: "We will return.",
      reviewerId: undefined,
    });
  });

  it("summarizes language progress deterministically", () => {
    const untranslated = createUnit();
    const approved = advanceToApproved();
    let complete = transitionStudioLocalizationUnit(approved, {
      type: "prepare-layout",
      at: "2026-09-11T00:00:04.000Z",
      sourceRemoved: true,
      backgroundRestored: true,
      letteringApplied: true,
      readingOrderAssigned: true,
      fontAvailable: true,
    });
    complete = transitionStudioLocalizationUnit(complete, {
      type: "complete",
      at: "2026-09-11T00:00:05.000Z",
    });
    expect(summarizeStudioLocalization([untranslated, approved, complete])).toMatchObject({
      total: 3,
      completed: 1,
      progress: 0.567,
      byStatus: {
        untranslated: 1,
        approved: 1,
        complete: 1,
      },
    });
  });

  it("rejects invalid transitions and adjacent enum values", () => {
    expect(() => transitionStudioLocalizationUnit(createUnit(), {
      type: "approve",
      reviewerId: "reviewer-1",
      at: "2026-09-11T00:00:01.000Z",
    })).toThrow(/not allowed/u);
    expect(isStudioLocalizationStatus("layout-check")).toBe(true);
    expect(isStudioLocalizationStatus("server-lock")).toBe(false);
    expect(isStudioLocalizationUnitKind("sfx")).toBe(true);
    expect(isStudioLocalizationUnitKind("layer")).toBe(false);
  });
});
