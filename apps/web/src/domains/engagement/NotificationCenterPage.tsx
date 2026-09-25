import {
  Archive,
  BellRing,
  CheckCheck,
  Clock3,
  ExternalLink,
  PackageCheck,
  Sparkles,
  Store,
  Users,
  Workflow,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { EngagementNotificationCategory } from "./engagement-model";
import { activeEngagementNotifications, useEngagement } from "./engagement-store";
import { useNotificationClock } from "./use-notification-clock";

import Link from "@/shared/navigation/router-link";
import { Container } from "@/shared/components/section";
import { useDocumentTitle, useMetaRobots } from "@/shared/seo/use-document-title";
import { NOINDEX_PRIVATE_ROBOTS } from "@/shared/lib/seo-route-policy";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

const CATEGORY_META: Record<EngagementNotificationCategory, {
  readonly label: string;
  readonly icon: typeof BellRing;
}> = {
  release: { label: "연재", icon: Sparkles },
  availability: { label: "가격·제공처", icon: PackageCheck },
  production: { label: "제작", icon: Workflow },
  market: { label: "마켓", icon: Store },
  community: { label: "커뮤니티", icon: Users },
  system: { label: "서비스", icon: BellRing },
};

type Filter = "all" | "unread" | "archived" | EngagementNotificationCategory;

const DATE_TIME = new Intl.DateTimeFormat("ko-KR", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? DATE_TIME.format(date) : value;
}

export function NotificationCenterPage() {
  useDocumentTitle("알림 센터");
  useMetaRobots(NOINDEX_PRIVATE_ROBOTS);
  const notifications = useEngagement((state) => state.notifications);
  const markNotificationRead = useEngagement((state) => state.markNotificationRead);
  const markAllNotificationsRead = useEngagement((state) => state.markAllNotificationsRead);
  const archiveNotification = useEngagement((state) => state.archiveNotification);
  const snoozeNotification = useEngagement((state) => state.snoozeNotification);
  const deleteArchivedNotifications = useEngagement((state) => state.deleteArchivedNotifications);
  const [filter, setFilter] = useState<Filter>("all");
  const clockNow = useNotificationClock(notifications);
  const active = activeEngagementNotifications(notifications, clockNow);
  const unreadCount = active.filter((item) => !item.readAt).length;
  const archivedCount = notifications.filter((item) => item.archivedAt).length;

  const visible = useMemo(() => notifications
    .filter((item) => {
      if (filter === "archived") return Boolean(item.archivedAt);
      if (item.archivedAt) return false;
      if (item.snoozedUntil && Date.parse(item.snoozedUntil) > clockNow) return false;
      if (filter === "unread") return !item.readAt;
      if (filter === "all") return true;
      return item.category === filter;
    })
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
  [clockNow, filter, notifications]);

  const filters: readonly { value: Filter; label: string }[] = [
    { value: "all", label: `전체 ${active.length}` },
    { value: "unread", label: `안 읽음 ${unreadCount}` },
    { value: "release", label: "연재" },
    { value: "availability", label: "가격·제공처" },
    { value: "production", label: "제작" },
    { value: "market", label: "마켓" },
    { value: "community", label: "커뮤니티" },
    { value: "archived", label: `보관 ${archivedCount}` },
  ];

  return (
    <Container size="wide" className="py-8 sm:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-accent">NOTIFICATION CENTER</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">알림 센터</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-2">
            연재일, 이 기기에서 관찰한 제공처 변화, 제작 업무를 한곳에서 확인합니다.
            플랫폼의 실제 공개 여부와 가격은 이동한 제공처에서 마지막으로 확인해 주세요.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={markAllNotificationsRead}
            disabled={unreadCount === 0}
            className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}
          >
            <CheckCheck size={15} aria-hidden="true" /> 모두 읽음
          </button>
          {filter === "archived" && archivedCount > 0 ? (
            <button
              type="button"
              onClick={deleteArchivedNotifications}
              className={buttonClass({ variant: "outline", size: "sm" })}
            >
              보관 알림 비우기
            </button>
          ) : null}
        </div>
      </header>

      <div className="mt-7 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}
            className={cn(
              "min-h-10 shrink-0 rounded-full border px-4 text-xs font-bold transition-colors",
              filter === item.value
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <ActionableEmptyState
          className="mt-8"
          icon={BellRing}
          title={filter === "archived" ? "보관한 알림이 없습니다" : "아직 확인할 알림이 없습니다"}
          description={filter === "archived"
            ? "알림을 보관하면 나중에 다시 확인할 수 있습니다. 보관하지 않은 알림은 전체 탭에 남습니다."
            : "연재 알림을 켜거나 제작 프로젝트를 시작하면 출시 일정, 검수 요청과 제공처 변화를 이곳에서 한 번에 확인합니다."}
          primary={{ href: "/library?tab=alerts", label: "연재 알림 설정" }}
          secondary={{ href: "/production/projects", label: "제작 프로젝트 보기" }}
          sample={{ href: "/production/projects/sample-project/overview", label: "샘플 알림 흐름 미리 보기" }}
        >
          <div className="grid gap-2 text-xs sm:grid-cols-3">
            {[
              ["연재", "요일·공개 일정"],
              ["제작", "마감·검수·인수인계"],
              ["마켓", "소재 업데이트·권리 변경"],
            ].map(([label, detail]) => (
              <div key={label} className="rounded-xl border border-line bg-panel/70 p-3">
                <strong className="text-fg">{label}</strong>
                <p className="mt-1 text-fg-3">{detail}</p>
              </div>
            ))}
          </div>
        </ActionableEmptyState>
      ) : (
        <div className="mt-6 grid gap-3">
          {visible.map((notification) => {
            const meta = CATEGORY_META[notification.category];
            const Icon = meta.icon;
            return (
              <article
                key={notification.id}
                className={cn(
                  "rounded-2xl border bg-card p-4 transition-colors sm:p-5",
                  notification.readAt ? "border-line" : "border-accent/35 ring-1 ring-accent/10",
                )}
              >
                <div className="flex items-start gap-3">
                  <span className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-xl",
                    notification.readAt ? "bg-raised text-fg-3" : "bg-accent-soft text-accent",
                  )}>
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-[0.65rem] font-bold text-fg-3">{meta.label}</span>
                      <time className="text-[0.68rem] text-fg-3" dateTime={notification.createdAt}>{formatTime(notification.createdAt)}</time>
                      {!notification.readAt ? <span className="size-2 rounded-full bg-accent" aria-label="읽지 않음" /> : null}
                    </div>
                    <h2 className="mt-2 text-base font-black text-fg">{notification.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-fg-2">{notification.body}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={notification.href}
                        onClick={() => markNotificationRead(notification.id)}
                        className={buttonClass({ size: "sm", className: "gap-1.5" })}
                      >
                        열기 <ExternalLink size={13} aria-hidden="true" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => markNotificationRead(notification.id, !notification.readAt)}
                        className={buttonClass({ variant: "outline", size: "sm" })}
                      >
                        {notification.readAt ? "안 읽음으로" : "읽음"}
                      </button>
                      {!notification.archivedAt ? (
                        <>
                          <button
                            type="button"
                            onClick={() => snoozeNotification(
                              notification.id,
                              new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
                            )}
                            className={buttonClass({ variant: "ghost", size: "sm", className: "gap-1.5" })}
                          >
                            <Clock3 size={13} aria-hidden="true" /> 하루 뒤
                          </button>
                          <button
                            type="button"
                            onClick={() => archiveNotification(notification.id)}
                            className={buttonClass({ variant: "ghost", size: "sm", className: "gap-1.5" })}
                          >
                            <Archive size={13} aria-hidden="true" /> 보관
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Container>
  );
}
