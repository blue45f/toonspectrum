import { describe, expect, it } from "vitest";

import { resolveStudioExternalReviewEntry } from "./studio-external-review-entry";

const TOKEN = `A${"b".repeat(31)}`;

describe("resolveStudioExternalReviewEntry", () => {
  it("returns none when no external review capability is present", () => {
    expect(resolveStudioExternalReviewEntry("?scope=work%3Achapter-1")).toEqual({ kind: "none" });
  });

  it("accepts one canonical review capability", () => {
    expect(resolveStudioExternalReviewEntry(`?shareToken=${TOKEN}`)).toEqual({
      kind: "valid",
      token: TOKEN,
    });
  });

  it.each([
    `?shareToken=${TOKEN}&shareToken=${TOKEN}`,
    "?shareToken=too-short",
    `?shareToken=${TOKEN}%2Fescape`,
    `?shareToken=${TOKEN}&scope=work%3Achapter-1`,
    `?shareToken=${TOKEN}&id=chapter-1`,
    `?shareToken=${TOKEN}&demo=1`,
    `?shareToken=${TOKEN}&invite=${TOKEN}`,
    `?shareToken=${TOKEN}&presentationToken=${TOKEN}`,
  ])("fails closed for ambiguous or conflicting entry %s", (search) => {
    expect(resolveStudioExternalReviewEntry(search)).toEqual({ kind: "invalid" });
  });
});
