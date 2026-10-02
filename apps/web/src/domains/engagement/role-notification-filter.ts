import type { EngagementNotification } from "./engagement-model";

import type { CreatorRoleNotificationEvent } from "@/shared/lib/creator-role-workspace-contract";

/**
 * 제작 개인 인박스 bucket과 직군 알림 이벤트의 대응표.
 *
 * engagement 알림 모델에는 직군 이벤트 종류 필드가 없어, 제작 알림으로 변환될 때
 * sourceKey 말미에 실린 인박스 bucket이 유일한 판정 재료다. 대응이 없는 bucket이나
 * 제작 알림이 아닌 항목은 직군 설정으로 숨기지 않는다(fail-open).
 */
export const PRODUCTION_BUCKET_ROLE_EVENT: Readonly<
  Record<string, CreatorRoleNotificationEvent>
> = {
  review: "review-request",
  ready: "handoff-ready",
  dueToday: "deadline-risk",
  blockingOthers: "deadline-risk",
  waitingInput: "question",
  inProgress: "assignment",
};

const PRODUCTION_INBOX_SOURCE_PREFIX = "production-inbox:";

/** 제작 인박스에서 온 알림이면 bucket을, 아니면(또는 알 수 없으면) null을 돌려준다. */
export function productionInboxBucketOf(
  notification: Pick<EngagementNotification, "sourceKey">,
): string | null {
  if (!notification.sourceKey.startsWith(PRODUCTION_INBOX_SOURCE_PREFIX)) return null;
  const bucket = notification.sourceKey.slice(notification.sourceKey.lastIndexOf(":") + 1);
  return bucket in PRODUCTION_BUCKET_ROLE_EVENT ? bucket : null;
}

/** 알림이 직군 알림 이벤트로 분류되면 그 이벤트를, 아니면 null을 돌려준다. */
export function roleNotificationEventFor(
  notification: Pick<EngagementNotification, "category" | "sourceKey">,
): CreatorRoleNotificationEvent | null {
  if (notification.category !== "production") return null;
  const bucket = productionInboxBucketOf(notification);
  return bucket ? PRODUCTION_BUCKET_ROLE_EVENT[bucket] ?? null : null;
}

/**
 * 직군 알림 설정으로 이 알림을 숨겨야 하는지 판정한다.
 * 설정이 없으면(미로드·직군 미선택·비인증) 숨기지 않는다.
 */
export function isHiddenByRoleNotificationSettings(
  notification: Pick<EngagementNotification, "category" | "sourceKey">,
  settings: Readonly<Record<CreatorRoleNotificationEvent, boolean>> | null,
): boolean {
  if (!settings) return false;
  const event = roleNotificationEventFor(notification);
  return event !== null && settings[event] === false;
}
