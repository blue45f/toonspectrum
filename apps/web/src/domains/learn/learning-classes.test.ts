import { describe, expect, it } from "vitest";

import {
  CLASS_ENROLLMENT_STORAGE_KEY,
  CLASS_PRODUCTS,
  cancelEnrollment,
  emptyClassEnrollments,
  enrollClass,
  formatPoints,
  getActiveEnrollment,
  getClassLessonIds,
  getClassProduct,
  loadClassEnrollments,
  parseClassEnrollments,
  saveClassEnrollments,
  validateClassCatalog,
} from "./learning-classes";

const NOW = "2026-10-02T00:00:00.000Z";
const LATER = "2026-10-03T00:00:00.000Z";
const FIRST = CLASS_PRODUCTS[0];
const SECOND = CLASS_PRODUCTS[1];

describe("클래스 카탈로그", () => {
  it("참조 무결성과 포인트 가격·주차 구조가 올바르다", () => {
    expect(validateClassCatalog()).toEqual([]);
    // 마스터클래스는 포인트 클래스, 작화·채색 클래스는 무료 클래스다.
    expect(FIRST.pointPrice).toBe(990);
    expect(SECOND.pointPrice).toBe(0);
    for (const product of CLASS_PRODUCTS) {
      expect(getClassLessonIds(product).length).toBeGreaterThan(0);
      // 현금 가격 필드는 존재하지 않는다.
      expect(Object.keys(product)).not.toContain("priceKrw");
      expect(Object.keys(product)).not.toContain("listPriceKrw");
    }
    expect(getClassProduct("no-such-class")).toBeUndefined();
  });

  it("포인트를 P 표기로 바꾼다", () => {
    expect(formatPoints(990)).toBe("990P");
    expect(formatPoints(0)).toBe("0P");
    expect(formatPoints(12_345)).toBe("12,345P");
    expect(formatPoints(Number.NaN)).toBe("0P");
  });
});

describe("수강 등록 상태 전이", () => {
  it("등록하면 active가 되고, 다시 등록해도 최초 등록 시각을 유지한다", () => {
    const enrolled = enrollClass(emptyClassEnrollments(), FIRST.id, {
      now: NOW,
      spendEventId: "ape_000002",
      pointPricePaid: 990,
    });
    const active = getActiveEnrollment(enrolled, FIRST.id);
    expect(active?.enrolledAt).toBe(NOW);
    expect(active?.spendEventId).toBe("ape_000002");
    expect(active?.pointPricePaid).toBe(990);
    expect(enrollClass(enrolled, FIRST.id, { now: LATER })).toBe(enrolled);
  });

  it("무료 등록은 차감 이벤트 없이 기록된다", () => {
    const enrolled = enrollClass(emptyClassEnrollments(), SECOND.id, { now: NOW });
    const active = getActiveEnrollment(enrolled, SECOND.id);
    expect(active?.spendEventId).toBeNull();
    expect(active?.pointPricePaid).toBe(0);
  });

  it("취소하면 active에서 빠지고, 재등록하면 최초 등록 시각을 되살린다", () => {
    const enrolled = enrollClass(emptyClassEnrollments(), FIRST.id, { now: NOW });
    const cancelled = cancelEnrollment(enrolled, FIRST.id, LATER);
    expect(getActiveEnrollment(cancelled, FIRST.id)).toBeNull();
    expect(cancelled.enrollments[FIRST.id].status).toBe("cancelled");
    const reenrolled = enrollClass(cancelled, FIRST.id, { now: LATER });
    expect(getActiveEnrollment(reenrolled, FIRST.id)?.enrolledAt).toBe(NOW);
    expect(getActiveEnrollment(reenrolled, FIRST.id)?.updatedAt).toBe(LATER);
  });

  it("모르는 클래스의 등록과 없는 등록의 취소는 무시한다", () => {
    expect(enrollClass(emptyClassEnrollments(), "ghost", { now: NOW })).toEqual(emptyClassEnrollments());
    expect(cancelEnrollment(emptyClassEnrollments(), FIRST.id, NOW)).toEqual(emptyClassEnrollments());
  });

  it("깨진 저장값은 버리고 유효한 등록만 복원한다 (구 사전 신청 상태는 버린다)", () => {
    expect(parseClassEnrollments("{broken")).toEqual(emptyClassEnrollments());
    const raw = JSON.stringify({
      version: 1,
      enrollments: {
        [FIRST.id]: {
          classId: FIRST.id,
          status: "enrolled",
          enrolledAt: NOW,
          updatedAt: NOW,
          spendEventId: "ape_000002",
          pointPricePaid: 990,
        },
        ghost: { classId: "ghost", status: "enrolled", enrolledAt: NOW, updatedAt: NOW },
        // 결제 전제였던 구 상태(applied/paid)는 새 모델에서 복원하지 않는다.
        [SECOND.id]: { classId: SECOND.id, status: "applied", appliedAt: NOW, updatedAt: NOW },
      },
    });
    const parsed = parseClassEnrollments(raw);
    expect(Object.keys(parsed.enrollments)).toEqual([FIRST.id]);
    expect(parsed.enrollments[FIRST.id].spendEventId).toBe("ape_000002");
    expect(parsed.enrollments[FIRST.id].pointPricePaid).toBe(990);
  });

  it("저장 후 다시 읽으면 같은 상태가 복원된다", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
    };
    const enrolled = enrollClass(emptyClassEnrollments(), FIRST.id, {
      now: NOW,
      spendEventId: "ape_000002",
      pointPricePaid: 990,
    });
    expect(saveClassEnrollments(storage, enrolled)).toBe(true);
    expect(memory.has(CLASS_ENROLLMENT_STORAGE_KEY)).toBe(true);
    expect(loadClassEnrollments(storage)).toEqual(enrolled);
  });
});
