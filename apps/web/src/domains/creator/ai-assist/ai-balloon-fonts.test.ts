import { describe, expect, it } from "vitest";

import type { AiBalloonKind } from "./ai-balloon-placement";
import {
  AI_BALLOON_FONTS,
  balloonFontCssUrl,
  recommendBalloonFonts,
} from "./ai-balloon-fonts";

const KINDS: readonly AiBalloonKind[] = ["speech", "thought", "shout", "whisper", "narration"];

describe("recommendBalloonFonts", () => {
  it.each(KINDS)("타입 %s에 최소 3개의 폰트를 추천한다", (kind) => {
    const fonts = recommendBalloonFonts(kind);
    expect(fonts.length).toBeGreaterThanOrEqual(3);
  });

  it("외침에는 굵은 폰트가 먼저 나온다", () => {
    const fonts = recommendBalloonFonts("shout");
    expect(fonts[0].suits[0]).toBe("shout");
  });

  it("속삭임에는 여린 폰트가 먼저 나온다", () => {
    const fonts = recommendBalloonFonts("whisper");
    expect(fonts[0].suits[0]).toBe("whisper");
  });

  it("limit을 지정하면 개수만큼 반환한다", () => {
    expect(recommendBalloonFonts("speech", 2)).toHaveLength(2);
  });

  it("모든 추천 폰트에 한글 이름과 추천 이유가 있다", () => {
    for (const font of AI_BALLOON_FONTS) {
      expect(font.name.length).toBeGreaterThan(0);
      expect(font.reason.ko.length).toBeGreaterThan(0);
      expect(font.family).toContain("sans-serif");
    }
  });
});

describe("balloonFontCssUrl", () => {
  it("Google Fonts URL을 생성한다", () => {
    const url = balloonFontCssUrl(AI_BALLOON_FONTS.slice(0, 2));
    expect(url).toContain("fonts.googleapis.com");
    expect(url).toContain("family=Gowun+Dodum");
  });

  it("로드할 폰트가 없으면 빈 문자열을 반환한다", () => {
    expect(balloonFontCssUrl([])).toBe("");
  });
});
