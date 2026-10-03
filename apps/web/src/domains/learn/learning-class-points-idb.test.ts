/**
 * 클래스 포인트 × 지갑 IDB 이관 종단 테스트 —
 * 구 localStorage 원장이 스토어 하이드레이션으로 IndexedDB에 이관된 뒤,
 * 클래스 차감·환불이 갈라진 복사본이 아니라 같은 원장에 쌓이는지 검증한다.
 */

// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ASSET_POINTS_STORAGE_KEY,
  useAssetPointsStore,
} from "@/domains/account/public/asset-points";
import { idbKvGet } from "@/shared/lib/idb-kv";

import { cancelClassEnrollment, enrollInClass, readPointBalance } from "./learning-class-points";
import { CLASS_PRODUCTS, emptyClassEnrollments, getActiveEnrollment } from "./learning-classes";

const NOW = new Date("2026-10-02T09:00:00.000Z");
const FIRST = CLASS_PRODUCTS[0];

const LEGACY_WALLET = JSON.stringify({
  state: {
    events: [
      {
        id: "ape_000001",
        kind: "earn",
        amount: 2_000,
        activityKey: "cuts.clip.published",
        sourceRef: "legacy-seed",
        occurredAt: NOW.toISOString(),
        expiresAt: new Date(NOW.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    nextSeq: 2,
  },
  version: 0,
});

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
  // resetForTests를 부르지 않는다 — 그 쓰기가 IDB에 빈 페이로드를 먼저 심으면
  // 어댑터가 "IDB 우선" 규칙으로 구 원장을 이관하지 않기 때문이다.
  // (실사용에서는 스토어 생성 직후의 자동 하이드레이션이 항상 상태 변경보다 먼저 이관을 수행한다.)
});

describe("클래스 포인트 IDB 종단", () => {
  it("이관된 원장으로 등록하면 차감·환불이 같은 IDB 원장에 쌓인다", async () => {
    localStorage.setItem(ASSET_POINTS_STORAGE_KEY, LEGACY_WALLET);
    await useAssetPointsStore.persist.rehydrate();

    // 이관: 구 키는 사라지고 잔액은 스토어 기준으로 읽힌다.
    expect(localStorage.getItem(ASSET_POINTS_STORAGE_KEY)).toBeNull();
    expect(readPointBalance(NOW)).toBe(2_000);

    const enrolled = enrollInClass({
      enrollments: emptyClassEnrollments(),
      classId: FIRST.id,
      userId: "user-1",
      now: NOW,
    });
    expect(enrolled.kind).toBe("enrolled");
    if (enrolled.kind !== "enrolled") throw new Error("등록 실패");
    expect(enrolled.spendEventId).toBe("ape_000002");
    expect(readPointBalance(NOW)).toBe(1_010);

    // 차감이 IDB 정본에 도달했는지 확인한다 (localStorage 복사본이 아니다).
    await vi.waitFor(async () => {
      const persisted = await idbKvGet(ASSET_POINTS_STORAGE_KEY);
      expect(persisted).toContain("\"kind\":\"spend\"");
      expect(persisted).toContain("class:first-episode-masterclass");
    });
    expect(localStorage.getItem(ASSET_POINTS_STORAGE_KEY)).toBeNull();

    const cancelled = cancelClassEnrollment({
      enrollments: enrolled.state,
      classId: FIRST.id,
      now: NOW,
    });
    expect(cancelled.refundedPoints).toBe(990);
    expect(getActiveEnrollment(cancelled.state, FIRST.id)).toBeNull();
    expect(readPointBalance(NOW)).toBe(2_000);
    await vi.waitFor(async () => {
      const persisted = await idbKvGet(ASSET_POINTS_STORAGE_KEY);
      expect(persisted).toContain("\"kind\":\"spend_refund\"");
    });
  });
});
