import { Bell } from "lucide-react";

import { activeEngagementNotifications, useEngagement } from "./engagement-store";
import { isHiddenByRoleNotificationSettings } from "./role-notification-filter";
import { useNotificationClock } from "./use-notification-clock";
import { useRoleNotificationSettings } from "./use-role-notification-settings";

import Link from "@/shared/navigation/router-link";
import { cx } from "@/shared/lib/cx";

export function EngagementNotificationBell() {
  const notifications = useEngagement((state) => state.notifications);
  const categorySettings = useEngagement((state) => state.notificationCategorySettings);
  const { settings: roleSettings } = useRoleNotificationSettings();
  const clockNow = useNotificationClock(notifications);
  // 뱃지는 알림 센터의 기본 상태(직군 설정 적용)와 같은 기준으로 센다.
  const unread = activeEngagementNotifications(notifications, clockNow)
    .filter((item) => !item.readAt
      && categorySettings[item.category] !== false
      && !isHiddenByRoleNotificationSettings(item, roleSettings)).length;
  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? `읽지 않은 알림 ${unread}개` : "알림 센터"}
      title="알림 센터"
      className={cx(
        "relative grid size-11 shrink-0 place-items-center rounded-[0.9rem] border bg-card/80 shadow-sm outline-none transition-colors",
        unread > 0
          ? "border-accent/45 text-accent hover:bg-accent-soft"
          : "border-line text-fg-3 hover:border-line-strong hover:bg-raised hover:text-fg",
        "focus-visible:border-accent/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      )}
    >
      <Bell size={17} aria-hidden="true" />
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-canvas bg-accent px-1 text-[0.6rem] font-black leading-none text-on-accent"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
