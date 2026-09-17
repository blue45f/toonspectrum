import { describe, expect, it } from "vitest";

import {
  buildStudioModeLaunchHref,
  resolveStudioCreationPlan,
} from "./studio-mode-creation-plan";

describe("Studio creation mode plan", () => {
  it("uses the selected mode for the initial document instead of a generic drawing launch", () => {
    const illustration = resolveStudioCreationPlan("illustration", "illustration-portrait");
    expect(illustration.document).toMatchObject({
      kind: "illustration",
      workspace: "draw",
      width: 2048,
      height: 2560,
    });
    expect(illustration.launch.primaryTool).toBe("draw");

    const slides = resolveStudioCreationPlan("slides", "slides-pitch");
    expect(slides.document.workspace).toBe("slides");
    expect(slides.profile.document.taskWorkspace).toBe("slides-deck");
    expect(slides.launch.primaryTool).toBe("select");
  });
  it("builds a launch href from the mode profile", () => {
    const slides = resolveStudioCreationPlan("slides", "slides-pitch");
    expect(buildStudioModeLaunchHref(
      "/studio/p/project-a/d/deck-a?workspace=draw",
      slides,
    )).toBe(
      "/studio/p/project-a/d/deck-a?workspace=slides&uiMode=basic&startTool=select",
    );
  });

  it("opens 3D through the spatial document workspace", () => {
    const plan = resolveStudioCreationPlan("three-d", "3d-pose");
    expect(plan.document).toMatchObject({ kind: "three-d", workspace: "3d" });
    expect(plan.profile.document.taskWorkspace).toBe("pose-3d");
    expect(plan.launch.shell).toBe("spatial");
  });
});
