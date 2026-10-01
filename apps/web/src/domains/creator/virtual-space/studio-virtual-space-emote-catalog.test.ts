import { describe, expect, it } from "vitest";

import {
  STUDIO_SPACE_EMOTE_IDS,
  STUDIO_SPACE_EMOTES,
  isStudioSpaceEmoteId,
  studioSpaceEmoteById,
  studioSpaceEmoteDurationMs,
  studioSpaceEmoteForKey,
} from "./studio-virtual-space-emote-catalog";

describe("studio virtual space emote catalog", () => {
  it("16종 id는 고유하고 기존 wave·heart·sparkles·thumbs-up을 포함한다", () => {
    expect(STUDIO_SPACE_EMOTE_IDS).toHaveLength(16);
    expect(new Set(STUDIO_SPACE_EMOTE_IDS).size).toBe(16);
    for (const legacy of ["wave", "heart", "sparkles", "thumbs-up"]) {
      expect(STUDIO_SPACE_EMOTE_IDS).toContain(legacy);
    }
    // 정의 배열 순서가 선택기 순서(id 배열 순서)와 같다.
    expect(STUDIO_SPACE_EMOTES.map((emote) => emote.id)).toEqual([...STUDIO_SPACE_EMOTE_IDS]);
  });

  it("1~9·Z 단축키는 겹치지 않는다", () => {
    const shortcuts = STUDIO_SPACE_EMOTES.flatMap((emote) => emote.shortcut ? [emote.shortcut] : []);
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
    expect([...shortcuts].sort()).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "Z"]);
    expect(studioSpaceEmoteForKey("1")?.id).toBe("wave");
    expect(studioSpaceEmoteForKey("2")?.id).toBe("heart");
    expect(studioSpaceEmoteForKey("3")?.id).toBe("party");
    expect(studioSpaceEmoteForKey("4")?.id).toBe("thumbs-up");
    expect(studioSpaceEmoteForKey("5")?.id).toBe("laugh");
    expect(studioSpaceEmoteForKey("6")?.id).toBe("clap");
    expect(studioSpaceEmoteForKey("7")?.id).toBe("wow");
    expect(studioSpaceEmoteForKey("8")?.id).toBe("think");
    expect(studioSpaceEmoteForKey("9")?.id).toBe("idea");
    expect(studioSpaceEmoteForKey("z")?.id).toBe("dance");
    expect(studioSpaceEmoteForKey("Z")?.id).toBe("dance");
    expect(studioSpaceEmoteForKey("0")).toBeNull();
    expect(studioSpaceEmoteForKey("e")).toBeNull();
    expect(studioSpaceEmoteForKey("12")).toBeNull();
  });

  it("모든 이모트는 한·영 라벨과 1200~4000ms 지속 시간을 가진다", () => {
    for (const emote of STUDIO_SPACE_EMOTES) {
      expect(emote.labelKo.trim().length).toBeGreaterThan(0);
      expect(/[가-힣]/u.test(emote.labelKo)).toBe(true);
      expect(/^[A-Za-z][A-Za-z ()!-]*$/u.test(emote.labelEn)).toBe(true);
      expect(emote.glyph.length).toBeGreaterThan(0);
      expect(emote.durationMs).toBeGreaterThanOrEqual(1_200);
      expect(emote.durationMs).toBeLessThanOrEqual(4_000);
      expect(Object.isFrozen(emote)).toBe(true);
    }
  });

  it("id 조회·판별과 지속 시간 제한을 제공한다", () => {
    expect(studioSpaceEmoteById("dance")?.motion).toBe("dance");
    expect(studioSpaceEmoteById("sleep")?.motion).toBe("doze");
    expect(studioSpaceEmoteById("wow")?.expression).toBe("surprised");
    expect(studioSpaceEmoteById("nope")).toBeNull();
    expect(isStudioSpaceEmoteId("party")).toBe(true);
    expect(isStudioSpaceEmoteId("cheer")).toBe(false);
    expect(isStudioSpaceEmoteId(3)).toBe(false);
    expect(studioSpaceEmoteDurationMs("dance")).toBe(4_000);
    expect(studioSpaceEmoteDurationMs("unknown")).toBe(2_400);
  });
});
