import { describe, expect, it } from "vitest";

import {
  STUDIO_GETTING_STARTED_TASKS,
  studioGettingStartedTaskDisabled,
  studioToolbarDisclosureAllows,
  studioToolbarIsExpanded,
} from "./studio-toolbar-disclosure";

import type { StudioUiChromeRegion } from "./studio-ui-density";

const essential: StudioUiChromeRegion[] = ["toolbar-assets", "toolbar-cut", "toolbar-draw", "toolbar-insert"];
const specialist: StudioUiChromeRegion[] = ["toolbar-reference", "toolbar-scene", "toolbar-style", "toolbar-ai"];

describe("Studio progressive toolbar disclosure", () => {
  it.each(["simple", "focus"] as const)("starts %s with a complete core creation path", (mode) => {
    expect(studioToolbarIsExpanded(mode, false)).toBe(false);
    for (const region of essential) expect(studioToolbarDisclosureAllows(mode, false, region)).toBe(true);
    for (const region of specialist) expect(studioToolbarDisclosureAllows(mode, false, region)).toBe(false);
  });

  it.each(["simple", "focus", "full"] as const)("makes every toolbar group reachable in %s", (mode) => {
    expect(studioToolbarIsExpanded(mode, true)).toBe(true);
    for (const region of [...essential, ...specialist]) {
      expect(studioToolbarDisclosureAllows(mode, true, region)).toBe(true);
    }
  });

  it("never folds the explicitly chosen full workspace", () => {
    expect(studioToolbarIsExpanded("full", false)).toBe(true);
    for (const region of [...essential, ...specialist]) {
      expect(studioToolbarDisclosureAllows("full", false, region)).toBe(true);
    }
  });

  it("has six unique, described tasks and does not change them when checking locks", () => {
    const before = JSON.stringify(STUDIO_GETTING_STARTED_TASKS);
    expect(new Set(STUDIO_GETTING_STARTED_TASKS.map((task) => task.id)).size).toBe(6);
    for (const task of STUDIO_GETTING_STARTED_TASKS) {
      expect(task.label.length).toBeGreaterThan(0);
      expect(task.description.length).toBeGreaterThan(0);
      expect(studioGettingStartedTaskDisabled(task, false)).toBe(false);
      expect(studioGettingStartedTaskDisabled(task, true)).toBe(task.changesDocument);
    }
    expect(STUDIO_GETTING_STARTED_TASKS.filter((task) => !studioGettingStartedTaskDisabled(task, true)).map((task) => task.id)).toEqual(["preview", "help"]);
    expect(JSON.stringify(STUDIO_GETTING_STARTED_TASKS)).toBe(before);
  });
});
