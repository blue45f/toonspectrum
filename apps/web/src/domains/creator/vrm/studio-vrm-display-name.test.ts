import { describe, expect, it } from "vitest";

import {
  hasBundledVrmDisplayName,
  resolveBundledVrmDisplayName,
  resolveVrmLibraryEntryDisplayName,
} from "./studio-vrm-display-name";
import { SAMPLE_VRMS } from "./vrm-library";

describe("studio-vrm-display-name", () => {
  it("keeps every bundled character covered by a stable localized display label", () => {
    expect(SAMPLE_VRMS.filter((entry) => !hasBundledVrmDisplayName(entry.id)).map((entry) => entry.id))
      .toEqual([]);
  });

  it("localizes Quaternius roles and genders from stable model ids", () => {
    const id = "quaternius-modular-male-adventurer";
    const fallback = "Quaternius Adventurer (Male)";

    expect(resolveBundledVrmDisplayName(id, fallback, "ko-KR"))
      .toBe("쿼터니어스 모험가 (남성)");
    expect(resolveBundledVrmDisplayName(id, fallback, "en-US"))
      .toBe("Quaternius Adventurer (Male)");
    expect(resolveBundledVrmDisplayName(id, fallback, "ja-JP"))
      .toBe("クォータニアス 冒険者（男性）");
    expect(resolveBundledVrmDisplayName(id, fallback, "zh-CN"))
      .toBe("Quaternius 冒险者（男）");
    expect(resolveBundledVrmDisplayName(id, fallback, "zh-TW"))
      .toBe("Quaternius 冒險者（男）");
  });

  it("uses localized bundled labels and English fallback for other locales", () => {
    expect(resolveBundledVrmDisplayName("orion", "오리온 (로봇)", "ko"))
      .toBe("오리온 (로봇)");
    expect(resolveBundledVrmDisplayName("orion", "오리온 (로봇)", "ja"))
      .toBe("オリオン（ロボット）");
    expect(resolveBundledVrmDisplayName("orion", "오리온 (로봇)", "zh-Hant-HK"))
      .toBe("奧利安（機器人）");
    expect(resolveBundledVrmDisplayName("orion", "오리온 (로봇)", "fr-FR"))
      .toBe("Orion (Robot)");
  });

  it("never rewrites user-uploaded model names", () => {
    const uploaded = {
      id: "user-character",
      name: "My OC 캐릭터",
      source: "sqlite-opfs" as const,
    };

    expect(resolveVrmLibraryEntryDisplayName(uploaded, "ja-JP"))
      .toBe("My OC 캐릭터");
  });

  it("falls back to the canonical name for an unknown bundled id", () => {
    expect(resolveBundledVrmDisplayName("future-model", "Future Model", "ko"))
      .toBe("Future Model");
  });
});
