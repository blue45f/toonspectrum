import { describe, expect, it } from "vitest";

import {
  isStudioBg3dAnimationOnceComplete,
  resolveStudioBg3dAnimationTime,
  snapshotStudioBg3dLiveAnimationPlayback,
} from "./studio-bg3d-animation-time";
import { DEFAULT_STUDIO_BG3D_ANIMATION_PLAYBACK } from "./studio-bg3d-scene-document";

describe("resolveStudioBg3dAnimationTime", () => {
  it("wraps repeat playback in both forward and reverse directions", () => {
    expect(resolveStudioBg3dAnimationTime({
      baseTimeSeconds: 1.75,
      elapsedSeconds: 0.5,
      timeScale: 1,
      durationSeconds: 2,
      loop: "repeat",
    })).toBeCloseTo(0.25);
    expect(resolveStudioBg3dAnimationTime({
      baseTimeSeconds: 0.25,
      elapsedSeconds: 0.5,
      timeScale: -1,
      durationSeconds: 2,
      loop: "repeat",
    })).toBeCloseTo(1.75);
  });

  it("reflects ping-pong playback across both clip boundaries", () => {
    expect(resolveStudioBg3dAnimationTime({
      baseTimeSeconds: 1.5,
      elapsedSeconds: 1,
      timeScale: 1,
      durationSeconds: 2,
      loop: "ping-pong",
    })).toBeCloseTo(1.5);
    expect(resolveStudioBg3dAnimationTime({
      baseTimeSeconds: 0.25,
      elapsedSeconds: 0.5,
      timeScale: -1,
      durationSeconds: 2,
      loop: "ping-pong",
    })).toBeCloseTo(0.25);
  });

  it("clamps one-shot playback and preserves a zero-speed pose", () => {
    expect(resolveStudioBg3dAnimationTime({
      baseTimeSeconds: 1,
      elapsedSeconds: 10,
      timeScale: 1,
      durationSeconds: 2,
      loop: "once",
    })).toBe(2);
    expect(resolveStudioBg3dAnimationTime({
      baseTimeSeconds: 1,
      elapsedSeconds: 10,
      timeScale: 0,
      durationSeconds: 2,
      loop: "repeat",
    })).toBe(1);
  });

  it("fails closed for invalid durations and normalizes non-finite inputs", () => {
    expect(resolveStudioBg3dAnimationTime({
      baseTimeSeconds: 1,
      elapsedSeconds: 1,
      timeScale: 1,
      durationSeconds: 0,
      loop: "repeat",
    })).toBe(0);
    expect(resolveStudioBg3dAnimationTime({
      baseTimeSeconds: Number.NaN,
      elapsedSeconds: Number.POSITIVE_INFINITY,
      timeScale: Number.NaN,
      durationSeconds: 2,
      loop: "once",
    })).toBe(0);
  });

  it("reports one-shot completion once in either direction", () => {
    expect(isStudioBg3dAnimationOnceComplete({
      baseTimeSeconds: 1.5,
      elapsedSeconds: 0.5,
      timeScale: 1,
      durationSeconds: 2,
      loop: "once",
    })).toBe(true);
    expect(isStudioBg3dAnimationOnceComplete({
      baseTimeSeconds: 0.5,
      elapsedSeconds: 0.5,
      timeScale: -1,
      durationSeconds: 2,
      loop: "once",
    })).toBe(true);
    expect(isStudioBg3dAnimationOnceComplete({
      baseTimeSeconds: 0.5,
      elapsedSeconds: 20,
      timeScale: -1,
      durationSeconds: 2,
      loop: "repeat",
    })).toBe(false);
  });

  it("snapshots the live mixer time before pause or playback edits", () => {
    const playing = { ...DEFAULT_STUDIO_BG3D_ANIMATION_PLAYBACK, playing: true, timeSeconds: 0 };
    const snapshot = snapshotStudioBg3dLiveAnimationPlayback(playing, 1.375);

    expect(snapshot).toEqual({ ...playing, timeSeconds: 1.375 });
    expect(snapshot).not.toBe(playing);
    expect(snapshotStudioBg3dLiveAnimationPlayback(
      { ...playing, playing: false },
      1.375,
    )).toEqual({ ...playing, playing: false });
    expect(snapshotStudioBg3dLiveAnimationPlayback(playing, Number.NaN)).toBe(playing);
  });
});
