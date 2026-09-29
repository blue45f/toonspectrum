import { describe, expect, it } from "vitest";
import {
  STUDIO_SPRITE_WALK_FRAME_COUNT,
  awayIndicatorState,
  buildCharacterRenderParams,
  spriteDirectionToFacing,
  spriteSheetCell,
  speechBubbleState,
  velocityToSpriteDirection,
  walkAnimationFrame,
} from "./studio-virtual-space-sprite";
import { studioVirtualAvatarProfile } from "./studio-virtual-space-model";

describe("velocityToSpriteDirection", () => {
  it("정지 상태에서는 이전 방향을 유지한다", () => {
    expect(velocityToSpriteDirection({ x: 0, y: 0 }, "up")).toBe("up");
    expect(velocityToSpriteDirection({ x: 0.5, y: 0.3 }, "left")).toBe("left");
  });

  it("4방향 기본 방향을 구한다", () => {
    expect(velocityToSpriteDirection({ x: 0, y: 100 })).toBe("down");
    expect(velocityToSpriteDirection({ x: 0, y: -100 })).toBe("up");
    expect(velocityToSpriteDirection({ x: -100, y: 0 })).toBe("left");
    expect(velocityToSpriteDirection({ x: 100, y: 0 })).toBe("right");
  });

  it("대각선 방향을 구한다", () => {
    expect(velocityToSpriteDirection({ x: 100, y: 100 })).toBe("down-right");
    expect(velocityToSpriteDirection({ x: -100, y: 100 })).toBe("down-left");
    expect(velocityToSpriteDirection({ x: -100, y: -100 })).toBe("up-left");
    expect(velocityToSpriteDirection({ x: 100, y: -100 })).toBe("up-right");
  });
});

describe("spriteDirectionToFacing", () => {
  it("8방향을 4방향 facing으로 변환한다", () => {
    expect(spriteDirectionToFacing("down")).toBe("down");
    expect(spriteDirectionToFacing("down-left")).toBe("down");
    expect(spriteDirectionToFacing("down-right")).toBe("down");
    expect(spriteDirectionToFacing("up")).toBe("up");
    expect(spriteDirectionToFacing("up-left")).toBe("up");
    expect(spriteDirectionToFacing("up-right")).toBe("up");
    expect(spriteDirectionToFacing("left")).toBe("left");
    expect(spriteDirectionToFacing("right")).toBe("right");
  });
});

describe("walkAnimationFrame", () => {
  it("이동 거리에 따라 프레임이 순환한다", () => {
    expect(walkAnimationFrame(0)).toBe(0);
    expect(walkAnimationFrame(18)).toBe(1);
    expect(walkAnimationFrame(18 * STUDIO_SPRITE_WALK_FRAME_COUNT)).toBe(0);
  });

  it("reducedMotion에서는 항상 0이다", () => {
    expect(walkAnimationFrame(1000, 18, true)).toBe(0);
  });
});

describe("spriteSheetCell", () => {
  it("방향별 행을 반환한다", () => {
    expect(spriteSheetCell("down", 0).row).toBe(0);
    expect(spriteSheetCell("up", 0).row).toBe(4);
    expect(spriteSheetCell("left", 0).row).toBe(2);
  });

  it("idle 상태에서는 0열이다", () => {
    expect(spriteSheetCell("down", 3, "idle").column).toBe(0);
  });

  it("sit 상태에서는 행 8을 쓴다", () => {
    expect(spriteSheetCell("down", 2, "sit").row).toBe(8);
  });
});

describe("speechBubbleState", () => {
  it("발화 중이 아니면 숨긴다", () => {
    const state = speechBubbleState(false, null, 0, 1000);
    expect(state.visible).toBe(false);
  });

  it("발화 시작 직후에는 나타남 프레임이다", () => {
    const state = speechBubbleState(true, "안녕", 1000, 1050);
    expect(state.visible).toBe(true);
    expect(state.frame).toBe(0);
    expect(state.text).toBe("안녕");
  });
});

describe("awayIndicatorState", () => {
  it("상태별 표시를 반환한다", () => {
    expect(awayIndicatorState("away").visible).toBe(true);
    expect(awayIndicatorState("away").labelKo).toBe("자리 비움");
    expect(awayIndicatorState("break").labelKo).toBe("휴식 중");
    expect(awayIndicatorState("in-meeting").labelKo).toBe("회의 중");
    expect(awayIndicatorState("available").visible).toBe(false);
  });
});

describe("buildCharacterRenderParams", () => {
  it("렌더 파라미터를 조립한다", () => {
    const profile = studioVirtualAvatarProfile("test-user");
    const params = buildCharacterRenderParams({
      profile,
      velocity: { x: 100, y: 0 },
      previousDirection: "down",
      distanceTraveled: 36,
      motionState: "walk",
      speaking: true,
      speechText: "회의 시작해요",
      speechStartedAt: 1000,
      userStatus: "available",
      now: 1500,
      reducedMotion: false,
    });
    expect(params.direction).toBe("right");
    expect(params.profile).toBe(profile);
    expect(params.speechBubble.visible).toBe(true);
    expect(params.awayIndicator.visible).toBe(false);
    expect(params.cell.row).toBe(6);
  });

  it("앉은 상태에서는 방향을 유지한다", () => {
    const profile = studioVirtualAvatarProfile("test-user");
    const params = buildCharacterRenderParams({
      profile,
      velocity: { x: 0, y: 0 },
      previousDirection: "up",
      distanceTraveled: 0,
      motionState: "sit",
      speaking: false,
      speechText: null,
      speechStartedAt: 0,
      userStatus: "available",
      now: 1000,
      reducedMotion: false,
    });
    expect(params.direction).toBe("up");
    expect(params.cell.row).toBe(8);
  });
});
