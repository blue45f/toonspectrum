import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  STUDIO_NATIVE_RASTER_REQUIRED_SCENARIOS,
  studioNativeRasterMatrixViolations,
  studioNativeRasterScenarioViolations,
  type StudioNativeRasterScenarioEvidence,
} from "./studio-native-raster-tools-policy";

function passingEvidence(
  id: StudioNativeRasterScenarioEvidence["id"] = "smudge",
): StudioNativeRasterScenarioEvidence {
  return {
    id,
    status: "passed",
    fixture: {
      usedExternalImageFixture: false,
      trustedCanvasPointerDowns: 2,
      trustedCanvasPointerMoves: 20,
      trustedCanvasPointerUps: 2,
      drawCount: 2,
      closedOutlinePointCount: 12,
      closedOutlineEndpointDistance: 0,
      internalLinePointCount: 6,
    },
    activation: { inactiveBefore: true, activeAfter: true },
    editableRaster: {
      expected: true,
      createdImage: true,
      nativeDrawCount: 2,
      hiddenNativeDrawCount: 2,
      selectedImageObserved: true,
    },
    firstGesture: { expected: true, replayed: true },
    operationDiff: {
      changedPixels: 240,
      totalPixels: 20_000,
      maxChannelDelta: 90,
      meanChangedChannelDelta: 18,
    },
    undo: {
      attempted: true,
      restored: true,
      retainedEditableRasterWhenExpected: true,
      diffFromBefore: {
        changedPixels: 3,
        totalPixels: 20_000,
        maxChannelDelta: 3,
        meanChangedChannelDelta: 1,
      },
    },
    browserErrors: [],
    failedResponses: [],
  };
}

describe("Studio native-raster browser gate policy", () => {
  it("accepts complete trusted-pointer, raster-copy, pixel-diff and Undo evidence", () => {
    expect(studioNativeRasterScenarioViolations(passingEvidence())).toEqual([]);
  });

  it("rejects imported fixtures, first-gesture loss and Undo that removes the editable copy", () => {
    const evidence = passingEvidence();
    evidence.fixture.usedExternalImageFixture = true;
    evidence.firstGesture.replayed = false;
    evidence.undo.retainedEditableRasterWhenExpected = false;

    expect(studioNativeRasterScenarioViolations(evidence)).toEqual(expect.arrayContaining([
      expect.stringContaining("external/imported image"),
      expect.stringContaining("first pointer gesture"),
      expect.stringContaining("one-step Undo"),
    ]));
  });

  it("requires the complete quick matrix exactly once", () => {
    const complete = STUDIO_NATIVE_RASTER_REQUIRED_SCENARIOS.map((id) => {
      const evidence = passingEvidence(id);
      if (id === "filter-whole") evidence.editableRaster.hiddenNativeDrawCount = 0;
      return evidence;
    });
    expect(studioNativeRasterMatrixViolations(complete)).toEqual([]);
    expect(studioNativeRasterMatrixViolations(complete.slice(1))).toContain(
      "matrix: missing required scenario paint-bucket",
    );
    expect(studioNativeRasterMatrixViolations([...complete, complete[0]!])).toContain(
      "matrix: duplicate scenario paint-bucket",
    );
  });

  it("distinguishes a non-destructive whole-page filter layer from destructive pixel targets", () => {
    const pageFilter = passingEvidence("filter-whole");
    pageFilter.editableRaster.hiddenNativeDrawCount = 0;
    expect(studioNativeRasterScenarioViolations(pageFilter)).toEqual([]);

    const smudge = passingEvidence("smudge");
    smudge.editableRaster.hiddenNativeDrawCount = 0;
    expect(studioNativeRasterScenarioViolations(smudge)).toContain(
      "smudge: destructive pixel target did not hide both preserved native sources",
    );
  });

  it("keeps the production verifier native-pointer-only and on the repository Playwright runtime", () => {
    const source = readFileSync(
      new URL("./verify-studio-native-raster-tools.mts", import.meta.url),
      "utf8",
    );
    expect(source).toContain('from "playwright"');
    expect(source).toContain("page.mouse.down()");
    expect(source).toContain("page.mouse.up()");
    expect(source).toContain("NATIVE_OUTLINE_DOCUMENT_POINTS");
    expect(source).toContain("NATIVE_INTERNAL_LINE_DOCUMENT_POINTS");
    expect(source).not.toContain("@playwright/test");
    expect(source).not.toContain("setInputFiles");
    expect(source).not.toContain("createFixturePng");
    expect(source).not.toContain("data:image/");
    expect(source).not.toContain("FilePayload");
  });
});
