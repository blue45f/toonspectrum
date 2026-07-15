import { describe, expect, it } from "vitest";

import {
  AVATAR_FORGE_PRESETS,
  AVATAR_FORGE_VERSION,
  buildAvatarForgeHairParts,
  createAvatarForgeState,
  parseAvatarForgeState,
  sanitizeAvatarForgeState,
  serializeAvatarForgeState,
} from "./studio-vrm-avatar-forge";

describe("studio-vrm-avatar-forge state", () => {
  it("offers diverse, independently cloned starter presets", () => {
    expect(AVATAR_FORGE_PRESETS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(AVATAR_FORGE_PRESETS.map((preset) => preset.state.hair.style)).size).toBeGreaterThanOrEqual(6);

    const first = createAvatarForgeState("soft-bob");
    const second = createAvatarForgeState("soft-bob");
    first.hair.baseColor = "#000000";
    expect(second.hair.baseColor).not.toBe(first.hair.baseColor);
  });

  it("sanitizes hostile or stale state without leaking unknown fields", () => {
    const result = sanitizeAvatarForgeState({
      version: 999,
      presetId: "x".repeat(100),
      face: { headWidth: 99, headHeight: -4, headDepth: "1.08", cheekVolume: Number.NaN },
      hair: {
        style: "exploit",
        replaceOriginal: "yes",
        volume: Number.POSITIVE_INFINITY,
        length: -1,
        strandWidth: 99,
        fringe: 0.5,
        curl: 2,
        shine: -2,
        baseColor: "url(javascript:bad)",
        tipColor: "#ABCDEF",
      },
      unknown: "discarded",
    });

    expect(result.version).toBe(AVATAR_FORGE_VERSION);
    expect(result.presetId).toHaveLength(64);
    expect(result.face.headWidth).toBe(1.18);
    expect(result.face.headHeight).toBe(0.86);
    expect(result.face.headDepth).toBe(1.08);
    expect(result.face.cheekVolume).toBe(0.35);
    expect(result.hair.style).toBe("none");
    expect(result.hair.replaceOriginal).toBe(false);
    expect(result.hair.length).toBe(0.55);
    expect(result.hair.strandWidth).toBe(1.45);
    expect(result.hair.curl).toBe(1);
    expect(result.hair.shine).toBe(0);
    expect(result.hair.baseColor).toBe("#352a28");
    expect(result.hair.tipColor).toBe("#abcdef");
    expect("unknown" in result).toBe(false);
  });

  it("parses JSON and falls back safely for malformed JSON", () => {
    expect(parseAvatarForgeState(JSON.stringify(createAvatarForgeState("elegant-bun"))).hair.style).toBe("bun");
    expect(parseAvatarForgeState("{broken").hair.style).toBe("none");
  });

  it("serializes a plain sanitized object", () => {
    const serialized = serializeAvatarForgeState({ hair: { style: "long", baseColor: "#112233" } });
    expect(serialized).toEqual(parseAvatarForgeState(serialized));
    expect(serialized.hair.style).toBe("long");
    expect(serialized.hair.baseColor).toBe("#112233");
  });

  it.each(["short", "bob", "long", "ponytail", "twintail", "bun"] as const)(
    "builds deterministic geometry plans for %s",
    (style) => {
      const state = createAvatarForgeState();
      state.hair.style = style;
      const first = buildAvatarForgeHairParts(state);
      const second = buildAvatarForgeHairParts(state);
      expect(first).toEqual(second);
      expect(first.length).toBeGreaterThanOrEqual(6);
      expect(new Set(first.map((part) => part.id)).size).toBe(first.length);
      expect(first.every((part) => part.baseColor === state.hair.baseColor)).toBe(true);
    }
  );

  it("returns no generated parts for the none hairstyle", () => {
    const state = createAvatarForgeState();
    state.hair.style = "none";
    expect(buildAvatarForgeHairParts(state)).toEqual([]);
  });

  it("scales long-hair plans from normalized controls", () => {
    const compact = createAvatarForgeState("romance-long");
    compact.hair.length = 0.7;
    const extended = createAvatarForgeState("romance-long");
    extended.hair.length = 1.6;

    const compactBack = buildAvatarForgeHairParts(compact).find((part) => part.id === "back");
    const extendedBack = buildAvatarForgeHairParts(extended).find((part) => part.id === "back");
    expect(extendedBack?.scale[1]).toBeGreaterThan(compactBack?.scale[1] ?? 0);
  });
});
