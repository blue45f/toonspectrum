import { describe, expect, it } from "vitest";

import {
  BGM_PRESETS,
  getAudioState,
  isBgmSuspended,
  resumeBgmForContext,
  setBgmVolume,
  suspendBgmForContext,
} from "./audio";

describe("site-wide BGM presets", () => {
  it("offers a broad, unique theme catalog for page-aware soundscapes", () => {
    expect(BGM_PRESETS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(BGM_PRESETS.map((preset) => preset.id)).size).toBe(BGM_PRESETS.length);
    expect(new Set(BGM_PRESETS.map((preset) => preset.name)).size).toBe(BGM_PRESETS.length);
    for (const preset of BGM_PRESETS) {
      expect(preset.beatDuration).toBeGreaterThan(0);
      expect(preset.beatsPerBar).toBeGreaterThan(0);
      expect(typeof preset.schedule).toBe("function");
    }
  });

  it("keeps BGM volume independent and composes multiple suspension reasons", () => {
    setBgmVolume(0.32);
    expect(getAudioState().bgmVolume).toBe(0.32);

    suspendBgmForContext("audio-editor");
    suspendBgmForContext("live-call");
    expect(isBgmSuspended()).toBe(true);
    resumeBgmForContext("audio-editor");
    expect(isBgmSuspended()).toBe(true);
    resumeBgmForContext("live-call");
    expect(isBgmSuspended()).toBe(false);

    setBgmVolume(0.48);
  });

  it("includes subtle reading themes as well as energetic webtoon genres", () => {
    const ids = BGM_PRESETS.map((preset) => preset.id);
    expect(ids).toEqual(expect.arrayContaining([
      "atelier_focus",
      "library_night",
      "royal_waltz",
      "mystery_noir",
      "healing_walk",
      "worldbuilding",
      "battle",
      "citypop",
    ]));
  });
});
