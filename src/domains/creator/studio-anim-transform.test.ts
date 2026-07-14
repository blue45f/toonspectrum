import { describe, expect, it } from "vitest";

import {
  createEmptyAnimationTimelineDoc,
  easeStudioAnimProgress,
  normalizeStudioAnimTransform,
  resolveTimelineTransforms,
  resolveTrackTransformAt,
  type StudioAnimKeyframe,
} from "./studio-anim-tracks";

describe("studio anim transform tween", () => {
  it("eases and normalizes transform poses", () => {
    expect(easeStudioAnimProgress(0.5, "linear")).toBe(0.5);
    expect(easeStudioAnimProgress(0.5, "ease-in-out")).toBeCloseTo(0.5, 10);
    expect(normalizeStudioAnimTransform({ scaleX: 0 }).scaleX).toBe(0.01);
  });

  it("interpolates between transform keyframes with ease-in-out", () => {
    const track: StudioAnimKeyframe[] = [
      {
        frameIndex: 0,
        frame: { id: "f0", src: "a", durationMs: 100 },
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        ease: "linear",
      },
      {
        frameIndex: 10,
        frame: { id: "f1", src: "b", durationMs: 100 },
        transform: { x: 100, y: 50, rotation: 90, scaleX: 2, scaleY: 2 },
        ease: "linear",
      },
    ];
    const mid = resolveTrackTransformAt(track, 5);
    expect(mid.x).toBeCloseTo(50, 8);
    expect(mid.y).toBeCloseTo(25, 8);
    expect(mid.rotation).toBeCloseTo(45, 8);
    expect(mid.scaleX).toBeCloseTo(1.5, 8);
  });

  it("holds previous transform when past last keyframe", () => {
    const track: StudioAnimKeyframe[] = [
      {
        frameIndex: 2,
        frame: { id: "f0", src: "a", durationMs: 100 },
        transform: { x: 10, y: 20, rotation: 0, scaleX: 1, scaleY: 1 },
      },
    ];
    expect(resolveTrackTransformAt(track, 0)).toEqual(
      normalizeStudioAnimTransform({ x: 10, y: 20, rotation: 0, scaleX: 1, scaleY: 1 })
    );
    expect(resolveTrackTransformAt(track, 9).x).toBe(10);
  });

  it("resolveTimelineTransforms returns poses only for tracks with transform keyframes", () => {
    const doc = createEmptyAnimationTimelineDoc(12, 12);
    doc.tracks["a"] = [
      {
        frameIndex: 0,
        frame: { id: "f0", src: "a", durationMs: 100 },
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      },
      {
        frameIndex: 10,
        frame: { id: "f1", src: "b", durationMs: 100 },
        transform: { x: 20, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      },
    ];
    doc.tracks["b"] = [
      { frameIndex: 0, frame: { id: "f2", src: "c", durationMs: 100 } },
    ];
    const map = resolveTimelineTransforms(doc, ["a", "b", "c"], 5);
    expect(map.has("a")).toBe(true);
    expect(map.get("a")!.x).toBeCloseTo(10, 8);
    expect(map.has("b")).toBe(false);
    expect(map.has("c")).toBe(false);
  });
});
