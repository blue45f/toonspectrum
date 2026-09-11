import { describe, expect, it } from "vitest";

import { createStudioLocalizationUnit, transitionStudioLocalizationUnit } from "./studio-localization-workflow";
import {
  parseStudioLocalizationProjectDocument,
  projectLocalizationDiagnostics,
  readStudioLocalizationProject,
  writeStudioLocalizationProject,
} from "./studio-localization-project-store";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

function baseUnit(id = "line-1") {
  return createStudioLocalizationUnit({
    id,
    sourceLocale: "ko-KR",
    targetLocale: "en-US",
    kind: "dialogue",
    sourceText: "그게 무슨 뜻이야?",
    glossary: [],
    sourceRemoved: false,
    backgroundRestored: false,
    letteringApplied: false,
    readingOrderAssigned: false,
    fontAvailable: false,
    updatedAt: "2026-09-11T03:00:00.000Z",
  });
}

describe("Studio localization project store", () => {
  it("persists validated units without accepting malformed payloads", () => {
    const storage = memoryStorage();
    const document = writeStudioLocalizationProject(storage, {
      schemaVersion: 1,
      projectId: "project-12",
      units: [baseUnit()],
      updatedAt: "2026-09-11T03:00:00.000Z",
    });

    expect(readStudioLocalizationProject(storage, "project-12")).toEqual(document);
    expect(parseStudioLocalizationProjectDocument({
      ...document,
      units: [{ id: "broken" }],
    }, "project-12")).toBeNull();
  });

  it("projects incomplete work as blocked and completed QA as ready", () => {
    const initial = baseUnit();
    expect(projectLocalizationDiagnostics([initial])).toEqual([
      expect.objectContaining({ locale: "en-US", status: "blocked" }),
    ]);

    let complete = transitionStudioLocalizationUnit(initial, {
      type: "start-ai-draft",
      at: "2026-09-11T03:01:00.000Z",
      translatedText: "What do you mean?",
    });
    complete = transitionStudioLocalizationUnit(complete, {
      type: "request-review",
      at: "2026-09-11T03:02:00.000Z",
    });
    complete = transitionStudioLocalizationUnit(complete, {
      type: "approve",
      at: "2026-09-11T03:03:00.000Z",
      reviewerId: "reviewer-1",
    });
    complete = transitionStudioLocalizationUnit(complete, {
      type: "prepare-layout",
      at: "2026-09-11T03:04:00.000Z",
      sourceRemoved: true,
      backgroundRestored: true,
      letteringApplied: true,
      readingOrderAssigned: true,
      fontAvailable: true,
      balloonFit: {
        availableWidth: 320,
        availableHeight: 180,
        renderedWidth: 240,
        renderedHeight: 90,
        minimumFontSize: 14,
        actualFontSize: 18,
        lineCount: 2,
        maxLineCount: 4,
      },
    });
    complete = transitionStudioLocalizationUnit(complete, {
      type: "complete",
      at: "2026-09-11T03:05:00.000Z",
    });

    expect(projectLocalizationDiagnostics([complete])).toEqual([
      expect.objectContaining({
        locale: "en-US",
        status: "complete",
        blockingIssueCount: 0,
        warningIssueCount: 0,
      }),
    ]);
  });
});
