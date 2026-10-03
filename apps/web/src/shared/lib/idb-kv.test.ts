// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  idbKvGet,
  idbKvRemove,
  idbKvSet,
  migrateLocalStorageValueToIdb,
} from "./idb-kv";

beforeEach(() => {
  // 팩토리를 갈아끼우면 모듈이 새 팩토리로 다시 연다 — 테스트 간 격리.
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
});

describe("idbKv 기본 동작", () => {
  it("쓰고 읽고 지울 수 있다", async () => {
    await expect(idbKvGet("missing")).resolves.toBeNull();
    await expect(idbKvSet("k1", "v1")).resolves.toBe(true);
    await expect(idbKvGet("k1")).resolves.toBe("v1");
    await idbKvSet("k1", "v2");
    await expect(idbKvGet("k1")).resolves.toBe("v2");
    await idbKvRemove("k1");
    await expect(idbKvGet("k1")).resolves.toBeNull();
  });

  it("큰 값도 그대로 왕복한다", async () => {
    const big = "x".repeat(2_000_000);
    await expect(idbKvSet("big", big)).resolves.toBe(true);
    await expect(idbKvGet("big")).resolves.toBe(big);
  });
});

describe("migrateLocalStorageValueToIdb", () => {
  it("구 값을 복사하고 검증 뒤 구 키를 제거한다", async () => {
    localStorage.setItem("legacy", "{\"a\":1}");
    await expect(migrateLocalStorageValueToIdb("legacy")).resolves.toBe(true);
    await expect(idbKvGet("legacy")).resolves.toBe("{\"a\":1}");
    expect(localStorage.getItem("legacy")).toBeNull();
  });

  it("구 값이 없으면 아무 일도 하지 않는다", async () => {
    await expect(migrateLocalStorageValueToIdb("nope")).resolves.toBe(false);
    await expect(idbKvGet("nope")).resolves.toBeNull();
  });

  it("IDB에 이미 값이 있으면 IDB 값을 지키고 낡은 구 키만 제거한다", async () => {
    await idbKvSet("dup", "idb-value");
    localStorage.setItem("dup", "stale-ls-value");
    await expect(migrateLocalStorageValueToIdb("dup")).resolves.toBe(false);
    await expect(idbKvGet("dup")).resolves.toBe("idb-value");
    expect(localStorage.getItem("dup")).toBeNull();
  });

  it("IndexedDB를 못 쓰면 구 키를 절대 건드리지 않는다", async () => {
    localStorage.setItem("keep", "precious");
    vi.stubGlobal("indexedDB", undefined);
    await expect(migrateLocalStorageValueToIdb("keep")).resolves.toBe(false);
    expect(localStorage.getItem("keep")).toBe("precious");
    await expect(idbKvGet("keep")).resolves.toBeNull();
    await expect(idbKvSet("keep", "x")).resolves.toBe(false);
  });
});
