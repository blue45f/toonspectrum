import { describe, expect, it } from "vitest";

import {
  buildCharacterRenderParams,
  screenShareIndicatorState,
} from "./studio-virtual-space-sprite";

describe("screenShareIndicatorState", () => {
  it("공유 중이면 표시자가 보인다", () => {
    const state = screenShareIndicatorState(true);
    expect(state.visible).toBe(true);
    expect(state.labelKo).toContain("화면 공유");
    expect(state.labelEn).toContain("Sharing screen");
  });

  it("공유 중이 아니면 숨는다", () => {
    const state = screenShareIndicatorState(false);
    expect(state.visible).toBe(false);
  });
});

describe("buildCharacterRenderParams", () => {
  function params(screenSharing?: boolean) {
    return buildCharacterRenderParams({
      profile: {
        skin: "s", hair: "h", hairHighlight: "hh", outfit: "o", accent: "a",
        accessory: "none", hairStyle: "short", expression: "smile",
      },
      velocity: { x: 0, y: 0 },
      previousDirection: "down",
      distanceTraveled: 0,
      motionState: "idle",
      speaking: false,
      speechText: null,
      speechStartedAt: 0,
      userStatus: "available",
      now: 1000,
      reducedMotion: false,
      ...(screenSharing === undefined ? {} : { screenSharing }),
    });
  }

  it("screenSharing이 true면 아바타 상단 표시자가 켜진다", () => {
    expect(params(true).screenShareIndicator.visible).toBe(true);
  });

  it("기본값은 꺼져 있다", () => {
    expect(params().screenShareIndicator.visible).toBe(false);
    expect(params(false).screenShareIndicator.visible).toBe(false);
  });
});
