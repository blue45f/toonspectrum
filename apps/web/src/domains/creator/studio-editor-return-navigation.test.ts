import { describe, expect, it, vi } from "vitest";

import {
  resolveStudioEditorReturnStrategy,
  runStudioEditorReturnNavigation,
} from "./studio-editor-return-navigation";

const CURRENT = "https://toonstudio.cloud/studio/canvas";

describe("studio editor return navigation", () => {
  it("uses the real previous entry when React Router reports one", () => {
    expect(resolveStudioEditorReturnStrategy({
      currentHref: CURRENT,
      referrer: "",
      historyLength: 4,
      historyState: { idx: 3 },
    })).toBe("history");
  });

  it("ignores an impossible router index when there is no previous browser entry", () => {
    expect(resolveStudioEditorReturnStrategy({
      currentHref: CURRENT,
      referrer: "",
      historyLength: 1,
      historyState: { idx: 3 },
    })).toBe("studio-home");
  });

  it("recognizes a same-origin document referrer after an isolated Studio entry", () => {
    expect(resolveStudioEditorReturnStrategy({
      currentHref: CURRENT,
      referrer: "https://toonstudio.cloud/studio?view=recent",
      historyLength: 2,
      historyState: { idx: 0 },
    })).toBe("history");
  });

  it("does not mistake a same-origin referrer in a new tab for usable back history", () => {
    expect(resolveStudioEditorReturnStrategy({
      currentHref: CURRENT,
      referrer: "https://toonstudio.cloud/studio",
      historyLength: 1,
      historyState: { idx: 0 },
    })).toBe("studio-home");
  });

  it("uses Studio home for direct links, restored tabs and unsafe referrers", () => {
    for (const referrer of [
      "",
      CURRENT,
      "https://example.com/previous",
      "not a url",
    ]) {
      expect(resolveStudioEditorReturnStrategy({
        currentHref: CURRENT,
        referrer,
        historyLength: 2,
        historyState: { idx: 0 },
      })).toBe("studio-home");
    }
  });

  it("calls exactly one navigation action", () => {
    const back = vi.fn();
    const openStudioHome = vi.fn();
    expect(runStudioEditorReturnNavigation({
      currentHref: CURRENT,
      referrer: "",
      historyLength: 3,
      historyState: { idx: 2 },
      back,
      openStudioHome,
    })).toBe("history");
    expect(back).toHaveBeenCalledOnce();
    expect(openStudioHome).not.toHaveBeenCalled();

    back.mockClear();
    expect(runStudioEditorReturnNavigation({
      currentHref: CURRENT,
      referrer: "",
      historyLength: 1,
      historyState: { idx: 0 },
      back,
      openStudioHome,
    })).toBe("studio-home");
    expect(back).not.toHaveBeenCalled();
    expect(openStudioHome).toHaveBeenCalledOnce();
  });
});
