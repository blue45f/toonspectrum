import { describe, expect, it } from "vitest";

import type { MotionEpisode } from "./motion-webtoon-model";
import {
  buildShareHashId,
  deleteMotionEpisode,
  isStoredMotionEpisode,
  loadLastEpisodeId,
  loadMotionEpisode,
  parseShareHashId,
  saveMotionEpisode,
} from "./motion-webtoon-storage";

/** 테스트용 인메모리 Storage. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

function makeEpisode(id = "ep-1"): MotionEpisode {
  return {
    id,
    titleKo: "테스트 회차",
    titleEn: "Test episode",
    characters: [{ id: "char-1", nameKo: "주인공", nameEn: "Hero", presetId: "narrator" }],
    cuts: [],
  };
}

describe("motion-webtoon-storage", () => {
  it("공유 해시를 파싱·생성한다", () => {
    expect(parseShareHashId("#motion-episode=ep-123")).toBe("ep-123");
    expect(parseShareHashId("#motion-episode=")).toBeNull();
    expect(parseShareHashId("#other=1")).toBeNull();
    expect(parseShareHashId("")).toBeNull();
    expect(buildShareHashId("ep-123")).toBe("#motion-episode=ep-123");
  });

  it("해시 파싱 왕복이 동작한다", () => {
    const id = "ep-한글 id";
    expect(parseShareHashId(buildShareHashId(id))).toBe(id);
  });

  it("회차를 저장·복원한다", () => {
    const storage = memoryStorage();
    const episode = makeEpisode("ep-save");
    saveMotionEpisode(episode, storage);
    const loaded = loadMotionEpisode("ep-save", storage);
    expect(loaded).toEqual(episode);
  });

  it("없는 회차는 null을 반환한다", () => {
    expect(loadMotionEpisode("nope", memoryStorage())).toBeNull();
  });

  it("손상된 JSON은 null을 반환한다", () => {
    const storage = memoryStorage();
    storage.setItem("toonstudio:motion-webtoon:episode:broken", "{not json");
    expect(loadMotionEpisode("broken", storage)).toBeNull();
  });

  it("스키마가 맞지 않는 데이터는 null을 반환한다", () => {
    const storage = memoryStorage();
    storage.setItem("toonstudio:motion-webtoon:episode:odd", JSON.stringify({ id: 1 }));
    expect(loadMotionEpisode("odd", storage)).toBeNull();
    expect(isStoredMotionEpisode({ id: "x", titleKo: "y", cuts: [], characters: [] })).toBe(true);
    expect(isStoredMotionEpisode(null)).toBe(false);
    expect(isStoredMotionEpisode({ id: "x" })).toBe(false);
  });

  it("마지막 회차 ID를 기억한다", () => {
    const storage = memoryStorage();
    expect(loadLastEpisodeId(storage)).toBeNull();
    saveMotionEpisode(makeEpisode("ep-last"), storage);
    expect(loadLastEpisodeId(storage)).toBe("ep-last");
  });

  it("회차를 삭제한다", () => {
    const storage = memoryStorage();
    saveMotionEpisode(makeEpisode("ep-del"), storage);
    deleteMotionEpisode("ep-del", storage);
    expect(loadMotionEpisode("ep-del", storage)).toBeNull();
  });

  it("storage가 없어도 크래시하지 않는다", () => {
    saveMotionEpisode(makeEpisode("ep-x"), null);
    expect(loadMotionEpisode("ep-x", null)).toBeNull();
    expect(loadLastEpisodeId(null)).toBeNull();
  });
});
