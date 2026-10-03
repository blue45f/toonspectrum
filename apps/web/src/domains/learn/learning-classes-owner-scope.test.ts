/**
 * 수강 등록 소유자 스코프 회귀 테스트.
 *
 * 등록 기록이 계정 구분 없이 한 키에 저장돼, 계정을 바꾸면 이전 계정의
 * 수강·환불 상태가 그대로 보이던 혼선을 막는다.
 */

import { describe, expect, it } from "vitest";

import {
  CLASS_PRODUCTS,
  emptyClassEnrollments,
  enrollClass,
  loadClassEnrollments,
  saveClassEnrollments,
} from "./learning-classes";

const NOW = "2026-10-02T00:00:00.000Z";
const FIRST = CLASS_PRODUCTS[0];

function memoryStorage() {
  const memory = new Map<string, string>();
  return {
    memory,
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
  };
}

describe("수강 등록 소유자 스코프", () => {
  it("계정마다 등록 기록이 갈라진다", () => {
    const storage = memoryStorage();
    const enrolled = enrollClass(emptyClassEnrollments(), FIRST.id, { now: NOW });
    expect(saveClassEnrollments(storage, enrolled, "user-a")).toBe(true);

    expect(loadClassEnrollments(storage, "user-a")).toEqual(enrolled);
    expect(loadClassEnrollments(storage, "user-b").enrollments).toEqual({});
    expect(loadClassEnrollments(storage, "guest").enrollments).toEqual({});
  });

  it("레거시(무스코프) 기록은 첫 계정이 claim 하고 게스트에게는 보이지 않는다", () => {
    const storage = memoryStorage();
    const enrolled = enrollClass(emptyClassEnrollments(), FIRST.id, { now: NOW });
    expect(saveClassEnrollments(storage, enrolled)).toBe(true);

    expect(loadClassEnrollments(storage, "guest").enrollments).toEqual({});
    expect(loadClassEnrollments(storage, "user-a")).toEqual(enrolled);
    // claim 은 레거시를 소비한다 — 다른 계정이 같은 기록을 또 가져가지 않는다.
    expect(loadClassEnrollments(storage, "user-b").enrollments).toEqual({});
  });
});
