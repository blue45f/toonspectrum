import { describe, expect, it } from "vitest";

import { classCheckoutAdapter } from "./learning-class-checkout";
import {
  CLASS_ENROLLMENT_STORAGE_KEY,
  CLASS_PRODUCTS,
  applyEnrollment,
  cancelEnrollment,
  emptyClassEnrollments,
  formatKrwPrice,
  getActiveEnrollment,
  getClassDiscountPercent,
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

describe("유료 클래스 카탈로그", () => {
  it("참조 무결성과 가격·주차 구조가 올바르다", () => {
    expect(validateClassCatalog()).toEqual([]);
    for (const product of CLASS_PRODUCTS) {
      expect(product.priceKrw).toBeGreaterThan(0);
      expect(getClassLessonIds(product).length).toBeGreaterThan(0);
    }
    expect(getClassProduct("no-such-class")).toBeUndefined();
  });

  it("가격을 원화 표기로 바꾸고 할인율을 계산한다", () => {
    expect(formatKrwPrice(99_000)).toBe("99,000원");
    expect(formatKrwPrice(0)).toBe("0원");
    expect(formatKrwPrice(Number.NaN)).toBe("0원");
    expect(getClassDiscountPercent(FIRST)).toBe(38);
  });
});

describe("수강 신청 상태 전이", () => {
  it("신청하면 active가 되고, 다시 신청해도 최초 신청 시각을 유지한다", () => {
    const applied = applyEnrollment(emptyClassEnrollments(), FIRST.id, NOW);
    expect(getActiveEnrollment(applied, FIRST.id)?.appliedAt).toBe(NOW);
    expect(applyEnrollment(applied, FIRST.id, LATER)).toBe(applied);
  });

  it("취소하면 active에서 빠지고, 재신청하면 최초 신청 시각을 되살린다", () => {
    const applied = applyEnrollment(emptyClassEnrollments(), FIRST.id, NOW);
    const cancelled = cancelEnrollment(applied, FIRST.id, LATER);
    expect(getActiveEnrollment(cancelled, FIRST.id)).toBeNull();
    expect(cancelled.enrollments[FIRST.id].status).toBe("cancelled");
    const reapplied = applyEnrollment(cancelled, FIRST.id, LATER);
    expect(getActiveEnrollment(reapplied, FIRST.id)?.appliedAt).toBe(NOW);
    expect(getActiveEnrollment(reapplied, FIRST.id)?.updatedAt).toBe(LATER);
  });

  it("모르는 클래스의 신청과 없는 신청의 취소는 무시한다", () => {
    expect(applyEnrollment(emptyClassEnrollments(), "ghost", NOW)).toEqual(emptyClassEnrollments());
    expect(cancelEnrollment(emptyClassEnrollments(), FIRST.id, NOW)).toEqual(emptyClassEnrollments());
  });

  it("깨진 저장값은 버리고 유효한 신청만 복원한다", () => {
    expect(parseClassEnrollments("{broken")).toEqual(emptyClassEnrollments());
    const raw = JSON.stringify({
      version: 1,
      enrollments: {
        [FIRST.id]: { classId: FIRST.id, status: "applied", appliedAt: NOW, updatedAt: NOW },
        ghost: { classId: "ghost", status: "applied", appliedAt: NOW, updatedAt: NOW },
        [CLASS_PRODUCTS[1].id]: { classId: CLASS_PRODUCTS[1].id, status: "paid", appliedAt: NOW, updatedAt: NOW },
      },
    });
    const parsed = parseClassEnrollments(raw);
    expect(Object.keys(parsed.enrollments)).toEqual([FIRST.id]);
  });

  it("저장 후 다시 읽으면 같은 상태가 복원된다", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
    };
    const applied = applyEnrollment(emptyClassEnrollments(), FIRST.id, NOW);
    expect(saveClassEnrollments(storage, applied)).toBe(true);
    expect(memory.has(CLASS_ENROLLMENT_STORAGE_KEY)).toBe(true);
    expect(loadClassEnrollments(storage)).toEqual(applied);
  });
});

describe("결제 어댑터(단일 연결 지점)", () => {
  it("계정이 없으면 접수를 거부한다", async () => {
    await expect(classCheckoutAdapter.checkout({ classId: FIRST.id, userId: null }))
      .resolves.toEqual({ kind: "requires-account" });
  });

  it("모르는 클래스는 거부하고, 로그인 사용자의 신청은 사전 신청으로 접수한다", async () => {
    await expect(classCheckoutAdapter.checkout({ classId: "ghost", userId: "user-1" }))
      .resolves.toEqual({ kind: "unknown-class" });
    const accepted = await classCheckoutAdapter.checkout({ classId: FIRST.id, userId: "user-1" });
    expect(accepted.kind).toBe("accepted");
    if (accepted.kind === "accepted") expect(accepted.appliedAt.length).toBeGreaterThan(0);
  });
});
