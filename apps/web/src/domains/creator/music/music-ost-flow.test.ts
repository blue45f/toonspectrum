import { describe, expect, it } from "vitest";

import { musicOstFlow } from "./music-ost-flow";

describe("music OST flow", () => {
  it("starts at the brief and advances one step at a time", () => {
    expect(musicOstFlow({ briefReady: false, trackCount: 0, savedCount: 0, bgmLinked: false }).map((step) => step.state))
      .toEqual(["current", "todo", "todo", "todo"]);
    expect(musicOstFlow({ briefReady: true, trackCount: 0, savedCount: 0, bgmLinked: false }).map((step) => step.state))
      .toEqual(["done", "current", "todo", "todo"]);
    expect(musicOstFlow({ briefReady: true, trackCount: 2, savedCount: 1, bgmLinked: false }).map((step) => step.state))
      .toEqual(["done", "done", "done", "current"]);
  });

  it("marks only verified steps as done", () => {
    const steps = musicOstFlow({ briefReady: false, trackCount: 1, savedCount: 0, bgmLinked: true });
    expect(steps.map((step) => step.state)).toEqual(["current", "done", "todo", "done"]);
    expect(steps.map((step) => step.anchor)).toEqual(["music-brief", "music-generate", "music-library", "music-publish"]);
  });
});
