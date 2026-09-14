import { describe, expect, it } from "vitest";

import {
  applySafePreflightFixes,
  createBetaReviewPackage,
  detectContinuityIssues,
  normalizeCreatorEcosystemState,
  parseBetaFeedbackPackage,
  parsePreflightDocument,
  runPreflight,
  setDialogueTranslation,
  translationStatus,
  upsertDialogueSource,
  EMPTY_CREATOR_ECOSYSTEM_STATE,
} from "./creator-ecosystem-model";

describe("creator ecosystem model", () => {
  it("detects continuity changes without transition reasons", () => {
    const issues = detectContinuityIssues([
      { id: "a", episode: 1, entity: "하나", field: "의상", value: "교복", transitionReason: "" },
      { id: "b", episode: 2, entity: "하나", field: "의상", value: "코트", transitionReason: "" },
      { id: "c", episode: 3, entity: "하나", field: "의상", value: "정장", transitionReason: "졸업식" },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.currentId).toBe("b");
  });

  it("marks translations stale after the source changes", () => {
    let state = upsertDialogueSource(structuredClone(EMPTY_CREATOR_ECOSYSTEM_STATE), "line-1", "안녕");
    state = setDialogueTranslation(state, "line-1", "en", "Hello", true);
    expect(translationStatus(state.dialogue[0]!, "en")).toBe("approved");
    state = upsertDialogueSource(state, "line-1", "안녕하세요");
    expect(translationStatus(state.dialogue[0]!, "en")).toBe("stale");
  });

  it("keeps unsafe preflight findings while applying deterministic safe fixes", () => {
    const source = parsePreflightDocument({ title: "  작품  ", tags: ["로맨스", "로맨스"], pages: [{ id: "p1", minimumTextPx: 14, missingAssets: ["font"], rightsBlocked: [], readingOrderComplete: false, approved: false }] });
    const fixed = applySafePreflightFixes(source);
    expect(fixed.title).toBe("작품");
    expect(fixed.tags).toEqual(["로맨스"]);
    expect(runPreflight(fixed).map((item) => item.code)).toContain("MISSING_ASSET");
  });

  it("creates bounded beta packages and rejects unrelated files", () => {
    const pack = createBetaReviewPackage("작품", ["1화", "2화"]);
    expect(pack.pages).toHaveLength(2);
    expect(() => parseBetaFeedbackPackage({ kind: "other", version: 1, feedback: [] })).toThrow();
  });

  it("drops malformed persisted entries instead of trusting them", () => {
    const state = normalizeCreatorEcosystemState({ version: 1, installedScenePackIds: ["cafe-dialogue", "unknown"], continuityFacts: [{ id: "bad", episode: -1 }] });
    expect(state.installedScenePackIds).toEqual(["cafe-dialogue"]);
    expect(state.continuityFacts).toEqual([]);
  });
});
