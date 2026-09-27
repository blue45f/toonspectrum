// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION,
  addStudioVirtualDecoration,
  parseStudioVirtualCharacterCustomization,
  parseStudioVirtualDecorationState,
  readStudioVirtualCharacterCustomization,
  readStudioVirtualDecorationState,
  removeStudioVirtualDecoration,
  studioVirtualDecorationPreset,
  writeStudioVirtualCharacterCustomization,
  writeStudioVirtualDecorationState,
} from "./studio-virtual-space-customization";

const CHARACTER_STORAGE_KEY = "toonspectrum:virtual-space-character-customization:v1";
const DECOR_STORAGE_KEY = "toonspectrum:virtual-space-decoration:v1";

beforeEach(() => localStorage.clear());
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe("Virtual Studio safe customization", () => {
  it("accepts only allowlisted cosmetic tokens", () => {
    expect(parseStudioVirtualCharacterCustomization(DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION))
      .toEqual(DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION);
    expect(parseStudioVirtualCharacterCustomization({ ...DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION, accessoryKey: "javascript:" }))
      .toBeNull();
  });

  it("creates bounded built-in decor presets without arbitrary assets", () => {
    for (const key of ["minimal", "creator-garden", "festival", "night-market"] as const) {
      const preset = studioVirtualDecorationPreset(key);
      expect(parseStudioVirtualDecorationState(preset)).toEqual(preset);
      expect(preset.placements.length).toBeLessThanOrEqual(36);
      expect(preset.placements.every((item) => item.x >= 16 && item.x <= 1264 && item.y >= 16 && item.y <= 944)).toBe(true);
    }
  });

  it("persists only validated customization under exact reviewed keys", () => {
    const character = {
      ...DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION,
      accessoryKey: "beret" as const,
      auraKey: "sparkle" as const,
      trailKey: "pixel" as const,
      nameplateKey: "sky" as const,
    };
    expect(writeStudioVirtualCharacterCustomization(character)).toBe(true);
    expect(JSON.parse(localStorage.getItem(CHARACTER_STORAGE_KEY)!)).toEqual(character);
    expect(readStudioVirtualCharacterCustomization()).toEqual(character);

    const decorations = studioVirtualDecorationPreset("festival");
    expect(writeStudioVirtualDecorationState(decorations)).toBe(true);
    expect(JSON.parse(localStorage.getItem(DECOR_STORAGE_KEY)!)).toEqual(decorations);
    expect(readStudioVirtualDecorationState()).toEqual(decorations);
  });

  it("rejects invalid writes and falls back from corrupt browser data", () => {
    const decorations = studioVirtualDecorationPreset("creator-garden");
    expect(writeStudioVirtualDecorationState(decorations)).toBe(true);
    const storedDecorations = localStorage.getItem(DECOR_STORAGE_KEY);
    const invalidDecorations = {
      ...decorations,
      placements: [{ ...decorations.placements[0], x: -1 }],
    } as unknown as Parameters<typeof writeStudioVirtualDecorationState>[0];
    expect(writeStudioVirtualDecorationState(invalidDecorations)).toBe(false);
    expect(localStorage.getItem(DECOR_STORAGE_KEY)).toBe(storedDecorations);

    localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify({
      ...DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION,
      accessoryKey: "javascript:",
    }));
    expect(readStudioVirtualCharacterCustomization()).toEqual(
      DEFAULT_STUDIO_VIRTUAL_CHARACTER_CUSTOMIZATION,
    );

    localStorage.setItem(DECOR_STORAGE_KEY, "{");
    const fallback = readStudioVirtualDecorationState();
    expect(fallback.presetKey).toBe("creator-garden");
    expect(parseStudioVirtualDecorationState(fallback)).toEqual(fallback);
  });

  it("adds and removes a nearby decoration while preserving the bounded contract", () => {
    const base = studioVirtualDecorationPreset("minimal");
    const added = addStudioVirtualDecoration(base, "flower-bed", { x: 780, y: 700 });
    expect(added.placements).toHaveLength(1);
    expect(parseStudioVirtualDecorationState(added)).toEqual(added);
    expect(removeStudioVirtualDecoration(added, added.placements[0]!.id).placements).toEqual([]);
  });

  it("장소별 배치를 분리하며 읽기는 기존 저장본을 바꾸지 않는다", () => {
    const legacy = studioVirtualDecorationPreset("festival");
    writeStudioVirtualDecorationState(legacy);
    const writer = vi.spyOn(Storage.prototype, "setItem");
    expect(readStudioVirtualDecorationState("project-a:skyport")).toEqual(legacy);
    expect(writer).not.toHaveBeenCalled();
    const personal = studioVirtualDecorationPreset("minimal");
    expect(writeStudioVirtualDecorationState(personal, "project-a:skyport")).toBe(true);
    expect(readStudioVirtualDecorationState("project-a:skyport")).toEqual(personal);
    expect(readStudioVirtualDecorationState("project-b:skyport")).toEqual(legacy);
    expect(readStudioVirtualDecorationState()).toEqual(legacy);
    localStorage.setItem(`${DECOR_STORAGE_KEY}:${encodeURIComponent("project-a:skyport")}`, "{");
    expect(readStudioVirtualDecorationState("project-a:skyport").presetKey).toBe("creator-garden");
  });

  it("실제 월드 크기와 새 가구를 저장하고 비정상 수치·부분 크기는 거부한다", () => {
    const state = { ...studioVirtualDecorationPreset("minimal"), layoutWidth: 1600, layoutHeight: 1200,
      placements: [{ id: "desk-a", type: "drawing-desk" as const, x: 1400, y: 1000, rotation: 90 as const, scale: 1 }] };
    expect(writeStudioVirtualDecorationState(state, "large-world")).toBe(true);
    expect(readStudioVirtualDecorationState("large-world")).toEqual(state);
    expect(parseStudioVirtualDecorationState({ ...state, layoutHeight: undefined })).toBeNull();
    expect(parseStudioVirtualDecorationState({ ...state, placements: [{ ...state.placements[0], scale: Number.NaN }] })).toBeNull();
    expect(parseStudioVirtualDecorationState({ ...state, placements: [{ ...state.placements[0], rotation: "90" }] })).toBeNull();
  });

  it("같은 밀리초에서 가구를 반복 추가해도 식별자가 겹치지 않는다", () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);
    let state = studioVirtualDecorationPreset("minimal");
    for (let index = 0; index < 12; index += 1) state = addStudioVirtualDecoration(state, "rug", { x: 100, y: 100 });
    expect(new Set(state.placements.map((item) => item.id)).size).toBe(12);
    expect(parseStudioVirtualDecorationState(state)).not.toBeNull();
  });
});
