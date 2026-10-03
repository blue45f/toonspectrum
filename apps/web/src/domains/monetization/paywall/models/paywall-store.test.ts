// @vitest-environment jsdom
/**
 * paywall-store.test.ts
 *
 * 얼리 액세스 정책의 소유자 스코프 회귀 테스트.
 * titleId만으로 정책을 찾으면 다른 창작자가 같은 작품 ID로 저장할 때
 * 남의 정책을 덮어쓰는 계정 혼선이 생긴다.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  deleteEarlyAccessPolicy,
  getEarlyAccessPolicy,
  listEarlyAccessPolicies,
  upsertEarlyAccessPolicy,
} from "./paywall-store";

beforeEach(() => {
  window.localStorage.clear();
});

describe("paywall store owner scope", () => {
  it("다른 창작자의 upsert가 기존 정책을 덮어쓰지 않고 별도 정책을 만든다", () => {
    upsertEarlyAccessPolicy({
      creatorId: "creator-a",
      titleId: "title-1",
      titleName: "A의 작품",
      enabled: true,
      earlyAccessDays: 14,
    });
    upsertEarlyAccessPolicy({
      creatorId: "creator-b",
      titleId: "title-1",
      titleName: "B의 저장 시도",
      enabled: false,
      earlyAccessDays: 3,
    });

    const aPolicies = listEarlyAccessPolicies("creator-a");
    expect(aPolicies).toHaveLength(1);
    expect(aPolicies[0]).toMatchObject({ titleName: "A의 작품", enabled: true, earlyAccessDays: 14 });
    expect(listEarlyAccessPolicies("creator-b")).toHaveLength(1);
    expect(getEarlyAccessPolicy("title-1")?.creatorId).toBe("creator-a");
  });

  it("같은 창작자의 upsert는 기존 정책을 갱신한다", () => {
    upsertEarlyAccessPolicy({
      creatorId: "creator-a",
      titleId: "title-1",
      titleName: "작품",
      enabled: true,
      earlyAccessDays: 14,
    });
    upsertEarlyAccessPolicy({
      creatorId: "creator-a",
      titleId: "title-1",
      titleName: "작품",
      enabled: false,
      earlyAccessDays: 7,
    });
    const policies = listEarlyAccessPolicies("creator-a");
    expect(policies).toHaveLength(1);
    expect(policies[0]).toMatchObject({ enabled: false, earlyAccessDays: 7 });
  });

  it("소유자가 아닌 창작자는 정책을 삭제할 수 없다", () => {
    const created = upsertEarlyAccessPolicy({
      creatorId: "creator-a",
      titleId: "title-1",
      titleName: "작품",
      enabled: true,
      earlyAccessDays: 14,
    });
    expect(deleteEarlyAccessPolicy(created.id, "creator-b")).toBe(false);
    expect(listEarlyAccessPolicies("creator-a")).toHaveLength(1);
    expect(deleteEarlyAccessPolicy(created.id, "creator-a")).toBe(true);
    expect(listEarlyAccessPolicies("creator-a")).toHaveLength(0);
  });
});
