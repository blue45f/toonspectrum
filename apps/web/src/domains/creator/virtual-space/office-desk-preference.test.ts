import { describe, expect, it } from "vitest";

import { readStudioOfficeDeskPreference, studioOfficeDeskPreferenceStorageKey, writeStudioOfficeDeskPreference } from "./office-desk-preference";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";

import type { StudioOfficeDeskPreferenceScope, StudioOfficeDeskPreferenceStorage } from "./office-desk-preference";

const scope: StudioOfficeDeskPreferenceScope = { userId: "author", projectId: "project", activeWorldScope: "world", authoringMode: false };
const manifest = DEFAULT_STUDIO_WORLD_MANIFEST;
const slot = manifest.interactionSlots?.[0];
if (!slot) throw new Error("기본 월드 좌석 fixture가 필요하다");
const slotId = slot.id;

function storageFixture() {
  const values = new Map<string, string>();
  const storage: StudioOfficeDeskPreferenceStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
  return { storage, values };
}

describe("내 자리 선호", () => {
  it("실존하는 좌석 ID만 저장하고 월드·좌석 점유 객체는 변경하지 않는다", () => {
    const { storage, values } = storageFixture();
    const before = JSON.stringify(manifest);
    expect(writeStudioOfficeDeskPreference(scope, manifest, slotId, storage)).toBe(true);
    expect(readStudioOfficeDeskPreference(scope, manifest, storage)).toBe(slotId);
    expect([...values.values()].map((raw) => JSON.parse(raw))).toEqual([{ version: 1, slotId }]);
    expect(JSON.stringify(manifest)).toBe(before);
    expect(writeStudioOfficeDeskPreference(scope, manifest, "missing", storage)).toBe(false);
    expect(readStudioOfficeDeskPreference(scope, manifest, storage)).toBe(slotId);
  });

  it.each([
    { userId: "other" }, { userId: null }, { projectId: "another" },
    { activeWorldScope: "republished-world" }, { authoringMode: true },
  ])("사용자·프로젝트·발행 월드·편집 scope가 바뀌면 공유하지 않는다: %j", (patch) => {
    const { storage } = storageFixture();
    expect(writeStudioOfficeDeskPreference(scope, manifest, slotId, storage)).toBe(true);
    expect(readStudioOfficeDeskPreference({ ...scope, ...patch }, manifest, storage)).toBeNull();
  });

  it("문자열 구분자와 null을 사용해도 다른 scope 키가 충돌하지 않는다", () => {
    const keys = [
      { ...scope, userId: null }, { ...scope, userId: "null" },
      { ...scope, userId: "a:b", projectId: "c" }, { ...scope, userId: "a", projectId: "b:c" },
    ].map(studioOfficeDeskPreferenceStorageKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("월드에서 제거한 좌석을 복원하지 않고 선호 해제를 지원한다", () => {
    const { storage, values } = storageFixture();
    writeStudioOfficeDeskPreference(scope, manifest, slotId, storage);
    expect(readStudioOfficeDeskPreference(scope, { ...manifest, interactionSlots: [] }, storage)).toBeNull();
    expect(writeStudioOfficeDeskPreference(scope, manifest, null, storage)).toBe(true);
    expect(values.size).toBe(0);
    expect(readStudioOfficeDeskPreference(scope, manifest, storage)).toBeNull();
  });

  it.each(["{", "null", "12", "[]", JSON.stringify({ version: 2, slotId }), JSON.stringify({ version: 1, slotId: "missing" }), "x".repeat(513)])(
    "손상되거나 다른 버전인 저장 값을 거절한다", (raw) => {
      const { storage } = storageFixture();
      storage.setItem(studioOfficeDeskPreferenceStorageKey(scope), raw);
      expect(readStudioOfficeDeskPreference(scope, manifest, storage)).toBeNull();
    },
  );

  it("브라우저 저장이 막혔어도 오류를 던지거나 성공했다고 표시하지 않는다", () => {
    const blocked: StudioOfficeDeskPreferenceStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("quota"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    expect(readStudioOfficeDeskPreference(scope, manifest, blocked)).toBeNull();
    expect(writeStudioOfficeDeskPreference(scope, manifest, slotId, blocked)).toBe(false);
    expect(writeStudioOfficeDeskPreference(scope, manifest, null, blocked)).toBe(false);
    expect(readStudioOfficeDeskPreference(scope, manifest, null)).toBeNull();
    expect(writeStudioOfficeDeskPreference(scope, manifest, slotId, null)).toBe(false);
  });
});
