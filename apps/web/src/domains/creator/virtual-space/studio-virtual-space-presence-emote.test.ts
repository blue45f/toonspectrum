import { describe, expect, it } from "vitest";

import { studioPresenceEmoteIndicator } from "./studio-virtual-space-presence-emote";

describe("프레즌스 이모트 이름표 인디케이터", () => {
  it("알려진 이모트는 글리프와 진행형 라벨을 돌려준다", () => {
    expect(studioPresenceEmoteIndicator("dance")).toEqual({
      glyph: "💃",
      labelKo: "춤추는 중",
      labelEn: "Dancing",
    });
    expect(studioPresenceEmoteIndicator("sleep")).toEqual({
      glyph: "😴",
      labelKo: "자는 중",
      labelEn: "Sleeping",
    });
    expect(studioPresenceEmoteIndicator("sit")?.labelKo).toBe("앉아 있음");
  });

  it("없는 값·모르는 값은 null이다", () => {
    expect(studioPresenceEmoteIndicator(null)).toBeNull();
    expect(studioPresenceEmoteIndicator(undefined)).toBeNull();
    expect(studioPresenceEmoteIndicator("")).toBeNull();
    expect(studioPresenceEmoteIndicator("backflip")).toBeNull();
  });
});
