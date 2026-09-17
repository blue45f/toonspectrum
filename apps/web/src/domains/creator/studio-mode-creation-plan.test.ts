import { describe, expect, it } from "vitest";

import { buildStudioModeLaunchHref, resolveStudioModeCreationPlan } from "./studio-mode-creation-plan";

const EXPECTED = {
  webtoon: ["comic", "draw"],
  illustration: ["draw", "draw"],
  image: ["image", "select"],
  design: ["design", "select"],
  slides: ["slides", "select"],
  storyboard: ["storyboard", "draw"],
  "three-d": ["3d", "select"],
  animation: ["animation", "select"],
} as const;

describe("studio mode creation plan", () => {
  it.each(Object.entries(EXPECTED))("routes %s into its own workspace and primary tool", (kind, expected) => {
    const plan = resolveStudioModeCreationPlan(kind as keyof typeof EXPECTED);
    expect(plan.document.workspace).toBe(expected[0]);
    expect(plan.launch.startTool).toBe(expected[1]);
    expect(plan.document.width).toBeGreaterThan(0);
    expect(plan.document.height).toBeGreaterThan(0);
  });

  it("replaces generic launch hints while preserving unrelated query state", () => {
    const plan = resolveStudioModeCreationPlan("three-d", "3d-pose");
    const href = buildStudioModeLaunchHref(
      { href: "/studio/p/p1/d/d1?workspace=draw&room=team-a&uiMode=focus&startTool=draw" },
      plan,
    );
    const [pathname, rawSearch = ""] = href.split("?", 2);
    const search = new URLSearchParams(rawSearch);
    expect(pathname).toBe("/studio/p/p1/d/d1");
    expect(search.get("workspace")).toBe("3d");
    expect(search.get("room")).toBe("team-a");
    expect(search.get("uiMode")).toBe("basic");
    expect(search.get("startTool")).toBe("select");
  });
});
