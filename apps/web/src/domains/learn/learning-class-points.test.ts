import { describe, expect, it } from "vitest";

import {
  ASSET_POINTS_STORAGE_KEY,
  cancelClassEnrollment,
  computePointBalance,
  enrollInClass,
  parsePointLedger,
  readPointBalance,
  refundClassPoints,
  spendPointsForClass,
  type PointLedgerEvent,
} from "./learning-class-points";
import {
  CLASS_PRODUCTS,
  emptyClassEnrollments,
  getActiveEnrollment,
} from "./learning-classes";

const NOW = new Date("2026-10-02T09:00:00.000Z");
const FIRST = CLASS_PRODUCTS[0];
const SECOND = CLASS_PRODUCTS[1];
const DAY_MS = 24 * 60 * 60 * 1000;

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
  };
}

type MemoryStorage = ReturnType<typeof memoryStorage>;

function earnEvent(id: string, amount: number, occurredAt: Date, expiresAt?: Date): PointLedgerEvent {
  return {
    id,
    kind: "earn",
    amount,
    activityKey: "cuts.clip.published",
    sourceRef: `seed-${id}`,
    occurredAt: occurredAt.toISOString(),
    expiresAt: (expiresAt ?? new Date(occurredAt.getTime() + 365 * DAY_MS)).toISOString(),
  };
}

/** M-4 지갑 스토어(zustand persist)가 쓰는 것과 같은 봉투로 원장을 심는다. */
function seedWallet(storage: MemoryStorage, events: readonly PointLedgerEvent[], nextSeq?: number) {
  storage.setItem(
    ASSET_POINTS_STORAGE_KEY,
    JSON.stringify({ state: { events, nextSeq: nextSeq ?? events.length + 1 }, version: 0 }),
  );
}

function storedEvents(storage: MemoryStorage): readonly PointLedgerEvent[] {
  const raw = storage.map.get(ASSET_POINTS_STORAGE_KEY);
  return raw ? parsePointLedger(raw).events : [];
}

describe("지갑 원장 파싱과 잔액 계산", () => {
  it("M-4 봉투에서 잔액을 계산하고, 차감된 만큼 줄어든다", () => {
    const storage = memoryStorage();
    seedWallet(storage, [
      earnEvent("ape_000001", 2_000, NOW),
      {
        id: "ape_000002",
        kind: "spend",
        amount: 990,
        resourceId: "class:first-episode-masterclass",
        occurredAt: NOW.toISOString(),
      },
    ]);
    expect(readPointBalance(storage, NOW)).toBe(1_010);
    expect(computePointBalance(storedEvents(storage), NOW)).toBe(1_010);
  });

  it("만료된 적립은 잔액에서 빠진다", () => {
    const storage = memoryStorage();
    const longAgo = new Date(NOW.getTime() - 400 * DAY_MS);
    seedWallet(storage, [earnEvent("ape_000001", 500, longAgo, new Date(longAgo.getTime() + 365 * DAY_MS))]);
    expect(readPointBalance(storage, NOW)).toBe(0);
  });

  it("봉투가 아니거나 깨진 값이면 잔액 0으로 본다", () => {
    const storage = memoryStorage();
    expect(readPointBalance(storage, NOW)).toBe(0);
    storage.setItem(ASSET_POINTS_STORAGE_KEY, "{broken");
    expect(readPointBalance(storage, NOW)).toBe(0);
    storage.setItem(ASSET_POINTS_STORAGE_KEY, JSON.stringify({ events: [] }));
    expect(readPointBalance(storage, NOW)).toBe(0);
    expect(parsePointLedger(null)).toEqual({ events: [], nextSeq: 1 });
  });
});

describe("클래스 포인트 차감", () => {
  it("잔액이 충분하면 spend 이벤트를 남기고 봉투 순번이 이어진다", () => {
    const storage = memoryStorage();
    seedWallet(storage, [earnEvent("ape_000001", 2_000, NOW)]);
    const result = spendPointsForClass(storage, {
      classId: FIRST.id,
      classTitle: FIRST.title,
      pointPrice: FIRST.pointPrice,
      now: NOW,
    });
    expect(result).toEqual({ ok: true, eventId: "ape_000002", balanceAfter: 1_010 });
    const events = storedEvents(storage);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      kind: "spend",
      amount: 990,
      resourceId: "class:first-episode-masterclass",
      resourceName: FIRST.title,
    });
    expect(parsePointLedger(storage.map.get(ASSET_POINTS_STORAGE_KEY) ?? null).nextSeq).toBe(3);
    expect(readPointBalance(storage, NOW)).toBe(1_010);
  });

  it("잔액이 부족하면 차감 이벤트를 남기지 않는다", () => {
    const storage = memoryStorage();
    seedWallet(storage, [earnEvent("ape_000001", 100, NOW)]);
    const result = spendPointsForClass(storage, {
      classId: FIRST.id,
      classTitle: FIRST.title,
      pointPrice: FIRST.pointPrice,
      now: NOW,
    });
    expect(result).toEqual({ ok: false, reason: "insufficient", balance: 100 });
    expect(storedEvents(storage)).toHaveLength(1);
    expect(readPointBalance(storage, NOW)).toBe(100);
  });

  it("이미 차감한 클래스는 다시 차감하지 않는다", () => {
    const storage = memoryStorage();
    seedWallet(storage, [earnEvent("ape_000001", 2_000, NOW)]);
    spendPointsForClass(storage, { classId: FIRST.id, classTitle: FIRST.title, pointPrice: 990, now: NOW });
    const again = spendPointsForClass(storage, {
      classId: FIRST.id,
      classTitle: FIRST.title,
      pointPrice: 990,
      now: NOW,
    });
    expect(again.ok).toBe(false);
    if (!again.ok) {
      expect(again.reason).toBe("already-owned");
      expect(again.existingEventId).toBe("ape_000002");
    }
    expect(storedEvents(storage).filter((event) => event.kind === "spend")).toHaveLength(1);
  });

  it("무료(0P) 차감은 원장에 이벤트를 남기지 않는다", () => {
    const storage = memoryStorage();
    const result = spendPointsForClass(storage, {
      classId: SECOND.id,
      classTitle: SECOND.title,
      pointPrice: 0,
      now: NOW,
    });
    expect(result).toEqual({ ok: true, eventId: null, balanceAfter: 0 });
    expect(storage.map.has(ASSET_POINTS_STORAGE_KEY)).toBe(false);
  });

  it("저장소가 없으면 유료 차감은 거부하고 무료는 통과한다", () => {
    expect(spendPointsForClass(null, { classId: FIRST.id, classTitle: FIRST.title, pointPrice: 990, now: NOW }))
      .toEqual({ ok: false, reason: "storage-unavailable", balance: 0 });
    expect(spendPointsForClass(null, { classId: SECOND.id, classTitle: SECOND.title, pointPrice: 0, now: NOW }).ok)
      .toBe(true);
  });
});

describe("포인트 환불", () => {
  it("차감을 환불하면 잔액이 복원되고, 환불은 한 번만 된다", () => {
    const storage = memoryStorage();
    seedWallet(storage, [earnEvent("ape_000001", 2_000, NOW)]);
    const spent = spendPointsForClass(storage, {
      classId: FIRST.id,
      classTitle: FIRST.title,
      pointPrice: 990,
      now: NOW,
    });
    if (!spent.ok || !spent.eventId) throw new Error("차감 실패");
    expect(refundClassPoints(storage, spent.eventId, NOW)).toBe(true);
    expect(readPointBalance(storage, NOW)).toBe(2_000);
    expect(refundClassPoints(storage, spent.eventId, NOW)).toBe(false);
    expect(refundClassPoints(storage, "ape_999999", NOW)).toBe(false);
    expect(storedEvents(storage).filter((event) => event.kind === "spend_refund")).toHaveLength(1);
  });
});

describe("수강 등록 흐름", () => {
  it("계정이 없으면 거부하고 차감하지 않는다", () => {
    const storage = memoryStorage();
    seedWallet(storage, [earnEvent("ape_000001", 2_000, NOW)]);
    const result = enrollInClass({
      enrollments: emptyClassEnrollments(),
      classId: FIRST.id,
      userId: null,
      pointsStorage: storage,
      now: NOW,
    });
    expect(result.kind).toBe("requires-account");
    expect(storedEvents(storage)).toHaveLength(1);
  });

  it("모르는 클래스는 거부한다", () => {
    const result = enrollInClass({
      enrollments: emptyClassEnrollments(),
      classId: "ghost",
      userId: "user-1",
      pointsStorage: memoryStorage(),
      now: NOW,
    });
    expect(result.kind).toBe("unknown-class");
  });

  it("포인트 클래스는 차감과 함께 등록되고 차감 이벤트 ID가 기록된다", () => {
    const storage = memoryStorage();
    seedWallet(storage, [earnEvent("ape_000001", 2_000, NOW)]);
    const result = enrollInClass({
      enrollments: emptyClassEnrollments(),
      classId: FIRST.id,
      userId: "user-1",
      pointsStorage: storage,
      now: NOW,
    });
    expect(result.kind).toBe("enrolled");
    if (result.kind !== "enrolled") throw new Error("등록 실패");
    expect(result.balanceAfter).toBe(1_010);
    expect(result.pointPricePaid).toBe(990);
    const active = getActiveEnrollment(result.state, FIRST.id);
    expect(active?.spendEventId).toBe("ape_000002");
    expect(active?.pointPricePaid).toBe(990);
    expect(readPointBalance(storage, NOW)).toBe(1_010);
  });

  it("잔액이 부족하면 차감도 등록도 일어나지 않는다", () => {
    const storage = memoryStorage();
    seedWallet(storage, [earnEvent("ape_000001", 100, NOW)]);
    const before = storage.map.get(ASSET_POINTS_STORAGE_KEY);
    const result = enrollInClass({
      enrollments: emptyClassEnrollments(),
      classId: FIRST.id,
      userId: "user-1",
      pointsStorage: storage,
      now: NOW,
    });
    expect(result.kind).toBe("insufficient-points");
    if (result.kind !== "insufficient-points") throw new Error("부족 판정 실패");
    expect(result.balance).toBe(100);
    expect(result.pointPrice).toBe(990);
    expect(getActiveEnrollment(result.state, FIRST.id)).toBeNull();
    expect(storage.map.get(ASSET_POINTS_STORAGE_KEY)).toBe(before);
  });

  it("무료 클래스는 잔액 0이어도 바로 등록되고 원장은 그대로다", () => {
    const storage = memoryStorage();
    const result = enrollInClass({
      enrollments: emptyClassEnrollments(),
      classId: SECOND.id,
      userId: "user-1",
      pointsStorage: storage,
      now: NOW,
    });
    expect(result.kind).toBe("enrolled");
    if (result.kind !== "enrolled") throw new Error("등록 실패");
    expect(result.spendEventId).toBeNull();
    expect(result.pointPricePaid).toBe(0);
    expect(storage.map.has(ASSET_POINTS_STORAGE_KEY)).toBe(false);
    expect(getActiveEnrollment(result.state, SECOND.id)).not.toBeNull();
  });

  it("이미 등록된 클래스는 다시 차감하지 않는다", () => {
    const storage = memoryStorage();
    seedWallet(storage, [earnEvent("ape_000001", 2_000, NOW)]);
    const first = enrollInClass({
      enrollments: emptyClassEnrollments(),
      classId: FIRST.id,
      userId: "user-1",
      pointsStorage: storage,
      now: NOW,
    });
    if (first.kind !== "enrolled") throw new Error("등록 실패");
    const second = enrollInClass({
      enrollments: first.state,
      classId: FIRST.id,
      userId: "user-1",
      pointsStorage: storage,
      now: NOW,
    });
    expect(second.kind).toBe("already-enrolled");
    expect(storedEvents(storage).filter((event) => event.kind === "spend")).toHaveLength(1);
  });

  it("원장에 차감만 있고 등록 기록이 없으면 다시 차감하지 않고 등록을 복구한다", () => {
    const storage = memoryStorage();
    seedWallet(storage, [
      earnEvent("ape_000001", 2_000, NOW),
      {
        id: "ape_000002",
        kind: "spend",
        amount: 990,
        resourceId: "class:first-episode-masterclass",
        occurredAt: NOW.toISOString(),
      },
    ]);
    const result = enrollInClass({
      enrollments: emptyClassEnrollments(),
      classId: FIRST.id,
      userId: "user-1",
      pointsStorage: storage,
      now: NOW,
    });
    expect(result.kind).toBe("enrolled");
    if (result.kind !== "enrolled") throw new Error("등록 실패");
    expect(result.spendEventId).toBe("ape_000002");
    expect(storedEvents(storage).filter((event) => event.kind === "spend")).toHaveLength(1);
    expect(readPointBalance(storage, NOW)).toBe(1_010);
  });

  it("수강을 취소하면 차감이 환불되고 잔액이 복원된다", () => {
    const storage = memoryStorage();
    seedWallet(storage, [earnEvent("ape_000001", 2_000, NOW)]);
    const enrolled = enrollInClass({
      enrollments: emptyClassEnrollments(),
      classId: FIRST.id,
      userId: "user-1",
      pointsStorage: storage,
      now: NOW,
    });
    if (enrolled.kind !== "enrolled") throw new Error("등록 실패");
    const cancelled = cancelClassEnrollment({
      enrollments: enrolled.state,
      classId: FIRST.id,
      pointsStorage: storage,
      now: NOW,
    });
    expect(cancelled.refundedPoints).toBe(990);
    expect(getActiveEnrollment(cancelled.state, FIRST.id)).toBeNull();
    expect(readPointBalance(storage, NOW)).toBe(2_000);
    // 취소 뒤 재등록하면 새 차감이 일어난다(환불된 차감은 소유로 보지 않는다).
    const reenrolled = enrollInClass({
      enrollments: cancelled.state,
      classId: FIRST.id,
      userId: "user-1",
      pointsStorage: storage,
      now: NOW,
    });
    expect(reenrolled.kind).toBe("enrolled");
    expect(readPointBalance(storage, NOW)).toBe(1_010);
  });

  it("무료 클래스 취소는 환불 없이 상태만 바뀐다", () => {
    const storage = memoryStorage();
    const enrolled = enrollInClass({
      enrollments: emptyClassEnrollments(),
      classId: SECOND.id,
      userId: "user-1",
      pointsStorage: storage,
      now: NOW,
    });
    if (enrolled.kind !== "enrolled") throw new Error("등록 실패");
    const cancelled = cancelClassEnrollment({
      enrollments: enrolled.state,
      classId: SECOND.id,
      pointsStorage: storage,
      now: NOW,
    });
    expect(cancelled.refundedPoints).toBe(0);
    expect(storage.map.has(ASSET_POINTS_STORAGE_KEY)).toBe(false);
  });
});
