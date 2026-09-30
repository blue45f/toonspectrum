// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  createStudioPosePresetStorage,
  STUDIO_POSE_PRESET_MAX_RECENT_DEFAULT,
} from "./studio-pose-preset-storage";

describe("studio-pose-preset-storage (공용 즐겨찾기·최근 사용 팩토리)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("네임스페이스마다 독립된 키를 사용한다", () => {
    const a = createStudioPosePresetStorage("ns-a");
    const b = createStudioPosePresetStorage("ns-b");
    a.toggleFavorite("pose-1");
    expect(a.readFavorites()).toEqual(["pose-1"]);
    expect(b.readFavorites()).toEqual([]);
    expect(window.localStorage.getItem("toonstudio.ns-a.favorites.v1")).toContain("pose-1");
    expect(window.localStorage.getItem("toonstudio.ns-b.favorites.v1")).toBeNull();
  });

  it("즐겨찾기를 토글하고 순서를 유지한다", () => {
    const storage = createStudioPosePresetStorage("ns-toggle");
    expect(storage.toggleFavorite("p1")).toEqual(["p1"]);
    expect(storage.toggleFavorite("p2")).toEqual(["p2", "p1"]);
    expect(storage.toggleFavorite("p1")).toEqual(["p2"]);
    expect(storage.readFavorites()).toEqual(["p2"]);
  });

  it("최근 사용은 최신 순으로 최대 개수까지만 보관한다", () => {
    const storage = createStudioPosePresetStorage("ns-recent", 3);
    expect(storage.recordRecent("a")).toEqual(["a"]);
    expect(storage.recordRecent("b")).toEqual(["b", "a"]);
    expect(storage.recordRecent("a")).toEqual(["a", "b"]);
    expect(storage.recordRecent("c")).toEqual(["c", "a", "b"]);
    expect(storage.recordRecent("d")).toEqual(["d", "c", "a"]);
    expect(storage.readRecent()).toEqual(["d", "c", "a"]);
  });

  it("최근 사용 목록을 비울 수 있다", () => {
    const storage = createStudioPosePresetStorage("ns-clear");
    storage.recordRecent("a");
    expect(storage.clearRecent()).toBe(true);
    expect(storage.readRecent()).toEqual([]);
  });

  it("기본 최대 보관 개수는 8이다", () => {
    expect(STUDIO_POSE_PRESET_MAX_RECENT_DEFAULT).toBe(8);
    const storage = createStudioPosePresetStorage("ns-default");
    for (let i = 0; i < 12; i += 1) storage.recordRecent(`p${i}`);
    expect(storage.readRecent()).toHaveLength(8);
    expect(storage.readRecent()[0]).toBe("p11");
  });

  it("localStorage가 막혀도 메모리 상태로 동작한다", () => {
    const storage = createStudioPosePresetStorage("ns-blocked");
    const original = window.localStorage;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      expect(storage.readFavorites()).toEqual([]);
      expect(storage.toggleFavorite("p1")).toEqual(["p1"]);
      expect(storage.writeFavorites(["p1"])).toBe(false);
      expect(storage.recordRecent("p1")).toEqual(["p1"]);
      expect(storage.clearRecent()).toBe(false);
    } finally {
      Object.defineProperty(window, "localStorage", { configurable: true, value: original });
    }
  });

  it("손상된 JSON은 빈 목록으로 복원된다", () => {
    window.localStorage.setItem("toonstudio.ns-corrupt.favorites.v1", "not-json{{{");
    const storage = createStudioPosePresetStorage("ns-corrupt");
    expect(storage.readFavorites()).toEqual([]);
  });
});
