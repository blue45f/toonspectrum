/**
 * 에셋 포인트 스토어 IndexedDB 이관 테스트 —
 * 구 localStorage 원장이 첫 읽기에 IDB로 이관돼 잔액·순번이 보존되는지,
 * 이후 쓰기가 IDB에만 가는지를 검증한다. (원장 데이터 유실 방지)
 */

// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { idbKvGet } from "../../../shared/lib/idb-kv";
import { computeBalance } from "./asset-points-ledger";
import { ASSET_POINTS_STORAGE_KEY, useAssetPointsStore } from "./asset-points-store";

const LEGACY_PAYLOAD = JSON.stringify({
  state: {
    events: [
      {
        id: "ape_000001",
        kind: "earn",
        amount: 120,
        activityKey: "auth.login.daily",
        sourceRef: "legacy-seed",
        occurredAt: "2026-10-01T03:00:00.000Z",
        expiresAt: "2027-10-01T03:00:00.000Z",
      },
    ],
    nextSeq: 2,
  },
  version: 0,
});

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
});

describe("asset-points IDB 이관", () => {
  it("구 localStorage 원장이 하이드레이션으로 보존되고 구 키가 제거된다", async () => {
    localStorage.setItem(ASSET_POINTS_STORAGE_KEY, LEGACY_PAYLOAD);
    await useAssetPointsStore.persist.rehydrate();

    const state = useAssetPointsStore.getState();
    expect(state.events).toHaveLength(1);
    expect(state.events[0]?.id).toBe("ape_000001");
    expect(state.nextSeq).toBe(2);
    expect(computeBalance(state.events, new Date("2026-10-02T00:00:00.000Z"))).toBe(120);

    // 이관이 끝났으니 구 키는 사라지고 IDB가 정본이다.
    expect(localStorage.getItem(ASSET_POINTS_STORAGE_KEY)).toBeNull();
    await expect(idbKvGet(ASSET_POINTS_STORAGE_KEY)).resolves.toBe(LEGACY_PAYLOAD);
  });

  it("적립 쓰기는 IDB에만 남고 localStorage에는 키가 생기지 않는다", async () => {
    useAssetPointsStore.getState().resetForTests();
    const result = useAssetPointsStore.getState().earn("auth.login.daily", "idb-write", new Date("2026-10-02T00:00:00.000Z"));
    expect(result.granted).toBe(true);
    await vi.waitFor(async () => {
      const persisted = await idbKvGet(ASSET_POINTS_STORAGE_KEY);
      expect(persisted).toContain("idb-write");
    });
    expect(localStorage.getItem(ASSET_POINTS_STORAGE_KEY)).toBeNull();
  });
});
