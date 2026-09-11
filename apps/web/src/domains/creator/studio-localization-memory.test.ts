import { describe, expect, it } from "vitest";

import {
  suggestStudioLocalization,
  validateStudioLocalizationMemory,
  type StudioLocalizationTerm,
  type StudioTranslationMemoryEntry,
} from "./studio-localization-memory";

const TERMS: readonly StudioLocalizationTerm[] = [
  {
    id: "term-studio",
    sourceLocale: "ko",
    targetLocale: "en",
    source: "작업실",
    target: "studio",
    caseSensitive: false,
    speakerIds: [],
    forbiddenAlternatives: ["workroom"],
  },
];

const ENTRIES: readonly StudioTranslationMemoryEntry[] = [
  {
    id: "memory-exact",
    sourceLocale: "ko",
    targetLocale: "en",
    source: "작업실로 돌아가자.",
    target: "Let us return to the studio.",
    speakerId: "hero",
    contextTags: ["episode-1", "school"],
    approved: true,
    updatedAt: "2026-09-11T00:00:00.000Z",
  },
  {
    id: "memory-fuzzy",
    sourceLocale: "ko",
    targetLocale: "en",
    source: "우리 작업실로 다시 가자.",
    target: "Let us go back to our studio.",
    speakerId: "hero",
    contextTags: ["episode-2", "school"],
    approved: true,
    updatedAt: "2026-09-12T00:00:00.000Z",
  },
];

describe("Studio localization memory", () => {
  it("returns an exact approved translation without applying it automatically", () => {
    expect(validateStudioLocalizationMemory({ terms: TERMS, entries: ENTRIES })).toEqual([]);
    expect(suggestStudioLocalization({
      segment: {
        id: "line-1",
        sourceLocale: "ko",
        targetLocale: "en",
        source: "작업실로 돌아가자.",
        speakerId: "hero",
        contextTags: ["episode-1", "school"],
      },
      terms: TERMS,
      entries: ENTRIES,
    })).toMatchObject({
      status: "exact",
      targetText: "Let us return to the studio.",
      sourceEntryId: "memory-exact",
      confidence: 1,
      satisfiedTermIds: ["term-studio"],
      warnings: [],
    });
  });

  it("uses speaker and context to rank a similar approved translation", () => {
    const suggestion = suggestStudioLocalization({
      segment: {
        id: "line-2",
        sourceLocale: "ko",
        targetLocale: "en",
        source: "우리 작업실에 다시 가자.",
        speakerId: "hero",
        contextTags: ["episode-2", "school"],
      },
      terms: TERMS,
      entries: ENTRIES,
      minimumFuzzyConfidence: 0.4,
    });
    expect(suggestion).toMatchObject({
      status: "fuzzy",
      sourceEntryId: "memory-fuzzy",
      targetText: "Let us go back to our studio.",
    });
    expect(suggestion.confidence).toBeGreaterThan(0.4);
  });

  it("blocks suggestions that violate an approved glossary", () => {
    const blocked = suggestStudioLocalization({
      segment: {
        id: "line-3",
        sourceLocale: "ko",
        targetLocale: "en",
        source: "작업실로 돌아가자.",
        speakerId: "hero",
        contextTags: [],
      },
      terms: TERMS,
      entries: [{
        ...ENTRIES[0]!,
        id: "bad-memory",
        target: "Let us return to the workroom.",
      }],
    });
    expect(blocked.status).toBe("blocked");
    expect(blocked.warnings).toEqual(expect.arrayContaining([
      "glossary-mismatch:term-studio",
      "forbidden-alternative:term-studio:workroom",
    ]));
  });

  it("returns no suggestion when approved memory is too dissimilar", () => {
    expect(suggestStudioLocalization({
      segment: {
        id: "line-4",
        sourceLocale: "ko",
        targetLocale: "en",
        source: "고양이가 창문에서 잠든다.",
        speakerId: null,
        contextTags: [],
      },
      terms: TERMS,
      entries: ENTRIES,
      minimumFuzzyConfidence: 0.8,
    })).toMatchObject({ status: "none", targetText: null, confidence: 0 });
  });
});
