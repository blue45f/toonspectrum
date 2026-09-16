import { describe, expect, it } from "vitest";

import { readStudioLivePageNavigationType } from "./studio-live-page-lifecycle";

describe("studio live page lifecycle", () => {
  it.each(["navigate", "reload", "back_forward", "prerender"] as const)(
    "reads the %s navigation type",
    (type) => {
      expect(readStudioLivePageNavigationType({
        getEntriesByType: () => [{ type }],
      })).toBe(type);
    },
  );

  it("returns unknown for missing, invalid, or denied navigation timing", () => {
    expect(readStudioLivePageNavigationType(null)).toBe("unknown");
    expect(readStudioLivePageNavigationType({
      getEntriesByType: () => [{ type: "duplicate" }],
    })).toBe("unknown");
    expect(readStudioLivePageNavigationType({
      getEntriesByType: () => { throw new Error("denied"); },
    })).toBe("unknown");
  });
});
