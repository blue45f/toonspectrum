/**
 * paywall-model.test.ts
 *
 * 회차 접근 판정·정책 입력 검증 테스트.
 */
import { describe, expect, it } from "vitest";

import {
  isValidEarlyAccessDays,
  NO_SUPPORTER_EVIDENCE,
  resolveEpisodeAccess,
  validateEarlyAccessPolicy,
  type EarlyAccessPolicy,
} from "./paywall-model";

const NOW = new Date("2026-10-01T12:00:00.000Z");

function makePolicy(overrides: Partial<EarlyAccessPolicy> = {}): EarlyAccessPolicy {
  return {
    id: "eap-1",
    creatorId: "creator-1",
    titleId: "title-a",
    titleName: "테스트 작품",
    enabled: true,
    earlyAccessDays: 7,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveEpisodeAccess", () => {
  it("정책이 없거나 꺼져 있으면 전체 공개한다", () => {
    expect(
      resolveEpisodeAccess({
        policy: null,
        publishedAt: "2026-10-01T00:00:00.000Z",
        evidence: NO_SUPPORTER_EVIDENCE,
        now: NOW,
      }).reason,
    ).toBe("open");
    expect(
      resolveEpisodeAccess({
        policy: makePolicy({ enabled: false }),
        publishedAt: "2026-10-01T00:00:00.000Z",
        evidence: NO_SUPPORTER_EVIDENCE,
        now: NOW,
      }).accessible,
    ).toBe(true);
  });

  it("얼리 액세스 기간이 지나면 전체 공개한다", () => {
    const state = resolveEpisodeAccess({
      policy: makePolicy({ earlyAccessDays: 7 }),
      publishedAt: "2026-09-20T00:00:00.000Z",
      evidence: NO_SUPPORTER_EVIDENCE,
      now: NOW,
    });
    expect(state).toMatchObject({ accessible: true, reason: "open" });
  });

  it("기간 내 서포터는 열람할 수 있다", () => {
    const publishedAt = "2026-09-29T00:00:00.000Z";
    for (const evidence of [{ hasTipped: true, isMember: false }, { hasTipped: false, isMember: true }]) {
      const state = resolveEpisodeAccess({
        policy: makePolicy({ earlyAccessDays: 7 }),
        publishedAt,
        evidence,
        now: NOW,
      });
      expect(state.accessible).toBe(true);
      expect(state.reason).toBe("supporter-early-access");
      expect(state.daysUntilFree).toBe(5);
      expect(state.freeAt).toBe("2026-10-06T00:00:00.000Z");
    }
  });

  it("기간 내 비서포터는 잠금 상태와 남은 일수를 받는다", () => {
    const state = resolveEpisodeAccess({
      policy: makePolicy({ earlyAccessDays: 7 }),
      publishedAt: "2026-09-29T00:00:00.000Z",
      evidence: NO_SUPPORTER_EVIDENCE,
      now: NOW,
    });
    expect(state).toMatchObject({
      accessible: false,
      reason: "locked",
      daysUntilFree: 5,
    });
    expect(state.freeAt).toBe("2026-10-06T00:00:00.000Z");
  });

  it("공개 시점이 비정상이면 안전하게 전체 공개한다", () => {
    const state = resolveEpisodeAccess({
      policy: makePolicy(),
      publishedAt: "not-a-date",
      evidence: NO_SUPPORTER_EVIDENCE,
      now: NOW,
    });
    expect(state.accessible).toBe(true);
  });
});

describe("isValidEarlyAccessDays", () => {
  it("1~90일 사이의 정수를 통과시킨다", () => {
    expect(isValidEarlyAccessDays(1)).toBe(true);
    expect(isValidEarlyAccessDays(90)).toBe(true);
    expect(isValidEarlyAccessDays(0)).toBe(false);
    expect(isValidEarlyAccessDays(91)).toBe(false);
    expect(isValidEarlyAccessDays(7.5)).toBe(false);
  });
});

describe("validateEarlyAccessPolicy", () => {
  it("올바른 입력을 통과시킨다", () => {
    expect(
      validateEarlyAccessPolicy({ titleId: "title-a", titleName: "작품", earlyAccessDays: 14 }),
    ).toBe(null);
  });

  it("작품 정보가 없거나 기간이 범위를 벗어나면 오류를 반환한다", () => {
    expect(
      validateEarlyAccessPolicy({ titleId: "  ", titleName: "작품", earlyAccessDays: 14 }),
    ).toBe("titleRequired");
    expect(
      validateEarlyAccessPolicy({ titleId: "title-a", titleName: "작품", earlyAccessDays: 0 }),
    ).toBe("daysOutOfRange");
  });
});
