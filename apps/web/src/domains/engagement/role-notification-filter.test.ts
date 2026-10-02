import { describe, expect, it } from "vitest";

import type { EngagementNotification } from "./engagement-model";
import {
  isHiddenByRoleNotificationSettings,
  productionInboxBucketOf,
  roleNotificationEventFor,
} from "./role-notification-filter";

import {
  CREATOR_ROLE_NOTIFICATION_EVENTS,
  type CreatorRoleNotificationEvent,
} from "@/shared/lib/creator-role-workspace-contract";

function productionNotification(bucket: string): Pick<EngagementNotification, "category" | "sourceKey"> {
  return {
    category: "production",
    sourceKey: `production-inbox:project-1:task-1:${bucket}`,
  };
}

function settingsWith(
  overrides: Partial<Record<CreatorRoleNotificationEvent, boolean>>,
): Readonly<Record<CreatorRoleNotificationEvent, boolean>> {
  return Object.fromEntries(
    CREATOR_ROLE_NOTIFICATION_EVENTS.map((event) => [event, overrides[event] ?? true]),
  ) as Record<CreatorRoleNotificationEvent, boolean>;
}

describe("productionInboxBucketOf", () => {
  it("인박스 sourceKey 말미의 bucket을 돌려준다", () => {
    expect(productionInboxBucketOf(productionNotification("review"))).toBe("review");
    expect(productionInboxBucketOf(productionNotification("blockingOthers"))).toBe("blockingOthers");
  });

  it("인박스가 아닌 sourceKey는 null이다", () => {
    expect(productionInboxBucketOf({ sourceKey: "release:title-1" })).toBeNull();
    expect(productionInboxBucketOf({ sourceKey: "market-library-update:pack-1" })).toBeNull();
  });

  it("알 수 없는 bucket은 null이다(fail-open)", () => {
    expect(productionInboxBucketOf(productionNotification("someday"))).toBeNull();
    expect(productionInboxBucketOf({ sourceKey: "production-inbox:" })).toBeNull();
  });
});

describe("roleNotificationEventFor", () => {
  it("bucket 6종을 직군 이벤트로 대응한다", () => {
    expect(roleNotificationEventFor(productionNotification("review"))).toBe("review-request");
    expect(roleNotificationEventFor(productionNotification("ready"))).toBe("handoff-ready");
    expect(roleNotificationEventFor(productionNotification("dueToday"))).toBe("deadline-risk");
    expect(roleNotificationEventFor(productionNotification("blockingOthers"))).toBe("deadline-risk");
    expect(roleNotificationEventFor(productionNotification("waitingInput"))).toBe("question");
    expect(roleNotificationEventFor(productionNotification("inProgress"))).toBe("assignment");
  });

  it("제작 카테고리가 아니면 대응하지 않는다", () => {
    expect(roleNotificationEventFor({
      category: "release",
      sourceKey: "production-inbox:project-1:task-1:review",
    })).toBeNull();
  });

  it("인박스에서 오지 않은 제작 알림은 대응하지 않는다", () => {
    expect(roleNotificationEventFor({
      category: "production",
      sourceKey: "manual:notice-1",
    })).toBeNull();
  });
});

describe("isHiddenByRoleNotificationSettings", () => {
  it("설정이 없으면 숨기지 않는다", () => {
    expect(isHiddenByRoleNotificationSettings(productionNotification("review"), null)).toBe(false);
  });

  it("대응 이벤트가 꺼져 있을 때만 숨긴다", () => {
    const settings = settingsWith({ "review-request": false });
    expect(isHiddenByRoleNotificationSettings(productionNotification("review"), settings)).toBe(true);
    expect(isHiddenByRoleNotificationSettings(productionNotification("ready"), settings)).toBe(false);
  });

  it("이벤트로 분류되지 않는 알림은 설정과 무관하게 숨기지 않는다", () => {
    const settings = settingsWith(Object.fromEntries(
      CREATOR_ROLE_NOTIFICATION_EVENTS.map((event) => [event, false]),
    ));
    expect(isHiddenByRoleNotificationSettings({ category: "system", sourceKey: "test:1" }, settings))
      .toBe(false);
    expect(isHiddenByRoleNotificationSettings(
      { category: "production", sourceKey: "manual:notice-1" },
      settings,
    )).toBe(false);
  });
});
