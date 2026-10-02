import { describe, expect, it } from "vitest";

import {
  clearStudioVirtualSpaceLastPosition,
  readStudioVirtualSpaceLastPosition,
  studioVirtualSpaceLastPositionStorageKey,
  studioVirtualSpaceResumeDecision,
  writeStudioVirtualSpaceLastPosition,
  type StudioVirtualSpaceLastPositionStorage,
} from "./studio-virtual-space-last-position";

function storageFixture(): StudioVirtualSpaceLastPositionStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

describe("virtual studio last position", () => {
  it("저장한 장소·좌표를 다시 읽는다", () => {
    const storage = storageFixture();
    expect(writeStudioVirtualSpaceLastPosition("project-1",
      { placeId: "tree-library", point: { x: 300.4, y: 210.6 } }, storage, 1234)).toBe(true);
    expect(readStudioVirtualSpaceLastPosition("project-1", storage)).toEqual({
      placeId: "tree-library", point: { x: 300, y: 211 }, savedAt: 1234,
    });
  });

  it("프로젝트마다 기록이 분리된다", () => {
    const storage = storageFixture();
    writeStudioVirtualSpaceLastPosition("project-1", { placeId: "garden", point: { x: 10, y: 20 } }, storage);
    expect(readStudioVirtualSpaceLastPosition("project-2", storage)).toBeNull();
    expect(studioVirtualSpaceLastPositionStorageKey("project-1"))
      .not.toBe(studioVirtualSpaceLastPositionStorageKey("project-2"));
  });

  it("손상된 기록은 없는 것으로 취급한다", () => {
    const storage = storageFixture();
    const key = studioVirtualSpaceLastPositionStorageKey("project-1");
    storage.setItem(key, "{not-json");
    expect(readStudioVirtualSpaceLastPosition("project-1", storage)).toBeNull();
    storage.setItem(key, JSON.stringify({ placeId: "", point: { x: 1, y: 2 } }));
    expect(readStudioVirtualSpaceLastPosition("project-1", storage)).toBeNull();
    storage.setItem(key, JSON.stringify({ placeId: "garden", point: { x: Number.NaN, y: 2 } }));
    expect(readStudioVirtualSpaceLastPosition("project-1", storage)).toBeNull();
    storage.setItem(key, JSON.stringify({ placeId: "garden" }));
    expect(readStudioVirtualSpaceLastPosition("project-1", storage)).toBeNull();
  });

  it("지우면 복원 후보가 사라진다", () => {
    const storage = storageFixture();
    writeStudioVirtualSpaceLastPosition("project-1", { placeId: "garden", point: { x: 10, y: 20 } }, storage);
    clearStudioVirtualSpaceLastPosition("project-1", storage);
    expect(readStudioVirtualSpaceLastPosition("project-1", storage)).toBeNull();
  });

  it("유한하지 않은 좌표는 저장하지 않는다", () => {
    const storage = storageFixture();
    expect(writeStudioVirtualSpaceLastPosition("project-1",
      { placeId: "garden", point: { x: Number.POSITIVE_INFINITY, y: 20 } }, storage)).toBe(false);
    expect(readStudioVirtualSpaceLastPosition("project-1", storage)).toBeNull();
  });

  it("복원 방식을 기록 유무와 장소 일치로 판정한다", () => {
    const record = { placeId: "tree-library", point: { x: 1, y: 2 }, savedAt: 1 };
    expect(studioVirtualSpaceResumeDecision(null, "skyport")).toBe("none");
    expect(studioVirtualSpaceResumeDecision(record, "tree-library")).toBe("silent");
    expect(studioVirtualSpaceResumeDecision(record, "skyport")).toBe("ask");
  });
});
