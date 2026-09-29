// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  WEBTOON_POSE_PRESET_MAX_RECENT,
  clearWebtoonPosePresetRecent,
  readWebtoonPosePresetFavorites,
  readWebtoonPosePresetRecent,
  recordWebtoonPosePresetRecent,
  toggleWebtoonPosePresetFavorite,
  writeWebtoonPosePresetFavorites,
} from "./studio-webtoon-pose-preset-storage";

beforeEach(() => {
  window.localStorage.clear();
});

describe("웹툰 포즈 프리셋 저장소 (localStorage 방어 패턴)", () => {
  it("즐겨찾기를 토글하고 순서대로 읽는다", () => {
    expect(readWebtoonPosePresetFavorites()).toEqual([]);

    expect(toggleWebtoonPosePresetFavorite("action-hero-landing")).toEqual([
      "action-hero-landing",
    ]);
    expect(toggleWebtoonPosePresetFavorite("daily-coffee-sip")).toEqual([
      "daily-coffee-sip",
      "action-hero-landing",
    ]);
    expect(readWebtoonPosePresetFavorites()).toEqual([
      "daily-coffee-sip",
      "action-hero-landing",
    ]);

    // 다시 토글하면 해제된다.
    expect(toggleWebtoonPosePresetFavorite("daily-coffee-sip")).toEqual([
      "action-hero-landing",
    ]);
  });

  it("최근 사용 목록은 최신 순으로 최대 개수까지만 유지한다", () => {
    for (let index = 0; index < WEBTOON_POSE_PRESET_MAX_RECENT + 3; index += 1) {
      recordWebtoonPosePresetRecent(`pose-${index}`);
    }
    const recent = readWebtoonPosePresetRecent();
    expect(recent.length).toBe(WEBTOON_POSE_PRESET_MAX_RECENT);
    expect(recent[0]).toBe(`pose-${WEBTOON_POSE_PRESET_MAX_RECENT + 2}`);

    // 이미 있던 id를 다시 기록하면 맨 앞으로 이동한다.
    recordWebtoonPosePresetRecent("pose-0");
    expect(readWebtoonPosePresetRecent()[0]).toBe("pose-0");
    expect(readWebtoonPosePresetRecent().length).toBe(WEBTOON_POSE_PRESET_MAX_RECENT);
  });

  it("최근 사용 목록을 비울 수 있다", () => {
    recordWebtoonPosePresetRecent("action-hero-landing");
    expect(clearWebtoonPosePresetRecent()).toBe(true);
    expect(readWebtoonPosePresetRecent()).toEqual([]);
  });

  it("즐겨찾기 목록을 통째로 덮어쓸 수 있다(공유 가져오기용)", () => {
    toggleWebtoonPosePresetFavorite("action-hero-landing");
    expect(writeWebtoonPosePresetFavorites(["daily-coffee-sip", "daily-coffee-sip"])).toBe(true);
    expect(readWebtoonPosePresetFavorites()).toEqual(["daily-coffee-sip"]);
  });

  it("깨진 저장소 값은 빈 목록으로 복원된다", () => {
    window.localStorage.setItem("toonstudio.webtoon-pose-preset.favorites.v1", "깨진값{{");
    expect(readWebtoonPosePresetFavorites()).toEqual([]);

    window.localStorage.setItem(
      "toonstudio.webtoon-pose-preset.recent.v1",
      JSON.stringify({ not: "an-array" }),
    );
    expect(readWebtoonPosePresetRecent()).toEqual([]);
  });
});
