import { describe, expect, it } from "vitest";

import { feedbackRouteState } from "./feedback-route-state";

describe("feedback route state", () => {
  it("opens the requested composer on mobile and keeps a safe tag filter", () => {
    expect(feedbackRouteState("?type=bug&tag=%23accessibility", false)).toEqual({
      kind: "bug",
      filters: {
        category: "all",
        progress: "all",
        query: "",
        mine: false,
        tag: "accessibility",
      },
      composerOpen: true,
    });
  });

  it("falls back to bug without opening a mobile composer for invalid input", () => {
    expect(feedbackRouteState("?type=private&tag=%20%20very%20long%20tag%20name%20beyond%20limit", false)).toMatchObject({
      kind: "bug",
      composerOpen: false,
      filters: { tag: "very long tag name b" },
    });
  });

  it("keeps the composer open on desktop without a requested type", () => {
    expect(feedbackRouteState("", true)).toMatchObject({ kind: "bug", composerOpen: true });
  });
});
