import { describe, expect, it } from "vitest";

import {
  EMPTY_STUDIO_SPATIAL_INTERACTION_STATE,
  reduceStudioSpatialInteraction,
  studioSpatialInteractionBusy,
} from "./studio-virtual-space-interaction-state";

describe("spatial interaction state", () => {
  it("moves through proximity, choice, authority and execution explicitly", () => {
    const nearby = reduceStudioSpatialInteraction(EMPTY_STUDIO_SPATIAL_INTERACTION_STATE, {
      type: "nearby", interactionId: "review-monitor",
    });
    expect(nearby.phase).toBe("nearby");
    const choosing = reduceStudioSpatialInteraction(nearby, {
      type: "choose", interactionId: "review-monitor",
    });
    const checking = reduceStudioSpatialInteraction(choosing, {
      type: "select-action", actionId: "quality-control", authority: true,
    });
    expect(checking.phase).toBe("checking-authority");
    expect(studioSpatialInteractionBusy(checking)).toBe(true);
    const confirming = reduceStudioSpatialInteraction(checking, { type: "confirm" });
    const running = reduceStudioSpatialInteraction(confirming, { type: "run" });
    const completed = reduceStudioSpatialInteraction(running, { type: "complete" });
    expect(completed).toMatchObject({ phase: "completed", interactionId: "review-monitor", actionId: "quality-control" });
  });

  it("does not let proximity departure interrupt an active action", () => {
    const choosing = reduceStudioSpatialInteraction(EMPTY_STUDIO_SPATIAL_INTERACTION_STATE, {
      type: "choose", interactionId: "waterfall-east",
    });
    const running = reduceStudioSpatialInteraction(choosing, {
      type: "select-action", actionId: "waterfall-splash", authority: false,
    });
    expect(reduceStudioSpatialInteraction(running, { type: "leave" })).toBe(running);
    const failed = reduceStudioSpatialInteraction(running, { type: "fail", error: "  blocked\u0000  " });
    expect(failed).toMatchObject({ phase: "failed", error: "blocked" });
    expect(reduceStudioSpatialInteraction(failed, { type: "close" }).phase).toBe("idle");
  });

  it("rejects arbitrary identifiers", () => {
    const state = reduceStudioSpatialInteraction(EMPTY_STUDIO_SPATIAL_INTERACTION_STATE, {
      type: "nearby", interactionId: "<script>",
    });
    expect(state).toBe(EMPTY_STUDIO_SPATIAL_INTERACTION_STATE);
  });
});
