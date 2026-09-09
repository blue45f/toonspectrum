import { describe, expect, it } from "vitest";

import {
  marketSceneCompletionBrowseHref,
  marketSceneCompletionSequenceForKind,
} from "./MarketSceneCompletionJourney";

describe("market scene completion journey", () => {
  it("moves template users into assets, brushes and finishing resources", () => {
    expect(marketSceneCompletionSequenceForKind("template")).toEqual([
      "asset",
      "brush",
      "look",
    ]);
  });

  it("moves 2d asset users back to scene structure before finishing", () => {
    expect(marketSceneCompletionSequenceForKind("asset")).toEqual([
      "template",
      "brush",
      "look",
    ]);
  });

  it("uses template, 2d and brush companions for 3d resources", () => {
    expect(marketSceneCompletionSequenceForKind("3d-asset")).toEqual([
      "template",
      "asset",
      "brush",
    ]);
  });

  it("preserves the active genre tag in cross-resource browse links", () => {
    expect(marketSceneCompletionBrowseHref("asset", "로맨스")).toBe(
      "/market/browse?kind=asset&tag=%EB%A1%9C%EB%A7%A8%EC%8A%A4",
    );
    expect(marketSceneCompletionBrowseHref("brush", null)).toBe(
      "/market/browse?kind=brush",
    );
  });
});
