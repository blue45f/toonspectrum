// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { studioVirtualAvatarProfile } from "./studio-virtual-space-model";
import {
  clearStudioVirtualAvatarProfile,
  parseStudioVirtualAvatarProfile,
  randomStudioVirtualAvatarProfile,
  readStudioVirtualAvatarProfile,
  resolveStudioVirtualAvatarProfile,
  writeStudioVirtualAvatarProfile,
} from "./studio-virtual-space-avatar-store";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

const VALID = {
  skin: "oklch(0.91 0.055 55)",
  hair: "oklch(0.31 0.055 25)",
  hairHighlight: "oklch(0.56 0.12 25)",
  outfit: "oklch(0.63 0.2 300)",
  accent: "oklch(0.78 0.19 335)",
  accessory: "glasses",
  hairStyle: "bob",
  outfitStyle: "hoodie",
  expression: "smile",
} as const;

describe("아바타 프로필 저장소", () => {
  it("유효한 프로필을 그대로 통과시킨다", () => {
    expect(parseStudioVirtualAvatarProfile(VALID)).toEqual(VALID);
  });

  it("카탈로그에 없는 값은 버린다", () => {
    expect(parseStudioVirtualAvatarProfile({ ...VALID, skin: "red" })).toBeNull();
    expect(parseStudioVirtualAvatarProfile({ ...VALID, hairStyle: "mohawk2" })).toBeNull();
    expect(parseStudioVirtualAvatarProfile({ ...VALID, accessory: "javascript:alert(1)" })).toBeNull();
    expect(parseStudioVirtualAvatarProfile(null)).toBeNull();
    expect(parseStudioVirtualAvatarProfile("avatar")).toBeNull();
    expect(parseStudioVirtualAvatarProfile({})).toBeNull();
  });

  it("저장 후 읽으면 같은 프로필이 돌아온다", () => {
    expect(writeStudioVirtualAvatarProfile({ ...VALID })).toBe(true);
    expect(readStudioVirtualAvatarProfile()).toEqual(VALID);
  });

  it("깨진 저장값은 null을 돌려준다", () => {
    localStorage.setItem("toonspectrum:virtual-space-avatar-profile:v1", "{broken");
    expect(readStudioVirtualAvatarProfile()).toBeNull();
  });

  it("지우면 기본값으로 되돌아간다", () => {
    writeStudioVirtualAvatarProfile({ ...VALID });
    clearStudioVirtualAvatarProfile();
    expect(readStudioVirtualAvatarProfile()).toBeNull();
  });

  it("resolve는 저장값 우선, 없으면 해시 기본값", () => {
    const identity = "test-user-1";
    expect(resolveStudioVirtualAvatarProfile(identity))
      .toEqual(studioVirtualAvatarProfile(identity));
    writeStudioVirtualAvatarProfile({ ...VALID });
    expect(resolveStudioVirtualAvatarProfile(identity)).toEqual(VALID);
    expect(resolveStudioVirtualAvatarProfile(identity)).not.toEqual(studioVirtualAvatarProfile(identity));
  });

  it("랜덤 프로필은 항상 유효하다", () => {
    for (let index = 0; index < 20; index += 1) {
      const profile = randomStudioVirtualAvatarProfile();
      expect(parseStudioVirtualAvatarProfile(profile)).toEqual(profile);
    }
  });

  it("랜덤 프로필은 시드를 주면 결정적이다", () => {
    let seed = 42;
    const deterministic = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const first = randomStudioVirtualAvatarProfile(deterministic);
    seed = 42;
    expect(randomStudioVirtualAvatarProfile(deterministic)).toEqual(first);
  });
});

describe("스프라이트 시트 저장", () => {
  const IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const SHEET = {
    image: IMAGE,
    frameWidth: 48,
    frameHeight: 48,
    framesPerDirection: 4,
    directionCount: 4,
    walkFrames: 3,
    anchorX: 0.5,
    anchorY: 1,
    offsetX: 0,
    offsetY: 0,
    frameRate: 8,
    displayHeight: 131,
  } as const;

  it("유효한 시트는 함께 파싱된다", () => {
    const parsed = parseStudioVirtualAvatarProfile({ ...VALID, spriteSheet: SHEET });
    expect(parsed?.spriteSheet).toEqual(SHEET);
  });

  it("깨진 시트는 필드만 버리고 꾸밈은 유지한다", () => {
    const parsed = parseStudioVirtualAvatarProfile({
      ...VALID,
      spriteSheet: { image: IMAGE, frameWidth: 3, frameHeight: 48, framesPerDirection: 4, directionCount: 4 },
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.spriteSheet).toBeUndefined();
    expect(parsed?.hairStyle).toBe("bob");
  });

  it("시트 포함 저장·읽기가 왕복한다", () => {
    expect(writeStudioVirtualAvatarProfile({ ...VALID, spriteSheet: SHEET })).toBe(true);
    expect(readStudioVirtualAvatarProfile()?.spriteSheet).toEqual(SHEET);
  });

  it("랜덤 주사위는 기존 시트를 유지한다", () => {
    writeStudioVirtualAvatarProfile({ ...VALID, spriteSheet: SHEET });
    const randomized = randomStudioVirtualAvatarProfile(() => 0.1);
    expect(randomized.spriteSheet).toEqual(SHEET);
  });

  it("시트가 없으면 랜덤 결과에도 시트가 없다", () => {
    writeStudioVirtualAvatarProfile({ ...VALID });
    expect(randomStudioVirtualAvatarProfile(() => 0.1).spriteSheet).toBeUndefined();
  });
});
