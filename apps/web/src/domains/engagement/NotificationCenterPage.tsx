import {
  Archive,
  BellRing,
  CheckCheck,
  Clock3,
  Ellipsis,
  ExternalLink,
  PackageCheck,
  RefreshCw,
  Settings2,
  Sparkles,
  Store,
  TriangleAlert,
  Users,
  Workflow,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { EngagementNotification, EngagementNotificationCategory } from "./engagement-model";
import {
  NOTIFICATION_DATE_BUCKET_LABEL,
  groupNotificationsByDate,
} from "./engagement-model";
import { activeEngagementNotifications, useEngagement } from "./engagement-store";
import { isHiddenByRoleNotificationSettings } from "./role-notification-filter";
import { useNotificationClock } from "./use-notification-clock";
import { useRoleNotificationSettings } from "./use-role-notification-settings";

import Link from "@/shared/navigation/router-link";
import { Container } from "@/shared/components/section";
import { useDocumentTitle, useMetaRobots } from "@/shared/seo/use-document-title";
import { NOINDEX_PRIVATE_ROBOTS } from "@/shared/lib/seo-route-policy";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { LoadingState } from "@/shared/components/LoadingState";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const CATEGORY_META: Record<EngagementNotificationCategory, {
  readonly label: string;
  readonly icon: typeof BellRing;
  readonly description: string;
}> = {
  release: { label: "연재", icon: Sparkles, description: "구독 작품의 연재일 알림" },
  availability: { label: "가격·제공처", icon: PackageCheck, description: "제공처·이용 방식 변화" },
  production: { label: "제작", icon: Workflow, description: "마감·검수·인수인계" },
  market: { label: "마켓", icon: Store, description: "소재 업데이트·권리 변경" },
  community: { label: "커뮤니티", icon: Users, description: "팔로우·댓글·리스트 반응" },
  system: { label: "서비스", icon: BellRing, description: "공지·점검·정책 안내" },
};

const CATEGORY_ORDER: readonly EngagementNotificationCategory[] = [
  "release",
  "availability",
  "production",
  "market",
  "community",
  "system",
];

type Filter = "all" | "unread" | "archived" | EngagementNotificationCategory;

const DATE_TIME = new Intl.DateTimeFormat("ko-KR", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** 방금 도착한 알림으로 표시할 기준(분). */
const NEW_NOTIFICATION_MINUTES = 60;
/** 한 번에 렌더하는 알림 수 — 무제한 렌더 방지용 페이지 크기. */
const PAGE_SIZE = 50;

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? DATE_TIME.format(date) : value;
}

function isNewNotification(item: EngagementNotification, now: number): boolean {
  if (item.readAt || now <= 0) return false;
  const createdAt = Date.parse(item.createdAt);
  return Number.isFinite(createdAt) && createdAt >= now - NEW_NOTIFICATION_MINUTES * 60_000;
}

function CategorySwitch({
  category,
  enabled,
  onChange,
}: {
  readonly category: EngagementNotificationCategory;
  readonly enabled: boolean;
  readonly onChange: (category: EngagementNotificationCategory, enabled: boolean) => void;
}) {
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(category, !enabled)}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        enabled ? "border-line bg-card" : "border-line/70 bg-panel/60",
      )}
    >
      <span className={cn(
        "grid size-9 shrink-0 place-items-center rounded-lg",
        enabled ? "bg-accent-soft text-accent" : "bg-raised text-fg-3",
      )}>
        <Icon size={16} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm font-bold", enabled ? "text-fg" : "text-fg-3")}>{meta.label}</span>
        <span className="block truncate text-[0.68rem] text-fg-3">{meta.description}</span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          enabled ? "bg-accent" : "bg-line-strong",
        )}
      >
        <span className={cn(
          "absolute top-0.5 size-5 rounded-full bg-on-accent shadow transition-all",
          enabled ? "left-[1.375rem]" : "left-0.5",
        )} />
      </span>
    </button>
  );
}

/** 카드 스캔을 방해하지 않도록 읽기·나중에·보관을 모아 둔 오버플로우 메뉴. */
function CardOverflowMenu({
  read,
  archived,
  onToggleRead,
  onSnooze,
  onArchive,
  t,
}: {
  readonly read: boolean;
  readonly archived: boolean;
  readonly onToggleRead: () => void;
  readonly onSnooze: () => void;
  readonly onArchive: () => void;
  readonly t: (ko: string, en: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open ]);

  const menuItemClass = cn(
    "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm font-semibold text-fg",
    "transition-colors hover:bg-raised",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
  );

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("알림 옵션", "Notification options")}
        onClick={() => setOpen((value) => !value)}
        className={buttonClass({ variant: "ghost", size: "sm", className: "px-2.5" })}
      >
        <Ellipsis size={17} aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={t("알림 옵션", "Notification options")}
          className="absolute right-0 z-30 mt-1.5 w-48 rounded-xl border border-line bg-card p-1 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onToggleRead(); }}
            className={menuItemClass}
          >
            <CheckCheck size={15} className="shrink-0 text-fg-3" aria-hidden="true" />
            {read ? t("안 읽음으로", "Mark as unread") : t("읽음으로", "Mark as read")}
          </button>
          {!archived ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); onSnooze(); }}
                className={menuItemClass}
              >
                <Clock3 size={15} className="shrink-0 text-fg-3" aria-hidden="true" />
                {t("하루 뒤", "Remind me tomorrow")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); onArchive(); }}
                className={menuItemClass}
              >
                <Archive size={15} className="shrink-0 text-fg-3" aria-hidden="true" />
                {t("보관", "Archive")}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function NotificationCard({
  notification,
  isNew,
  onToggleRead,
  onSnooze,
  onArchive,
}: {
  readonly notification: EngagementNotification;
  readonly isNew: boolean;
  readonly onToggleRead: () => void;
  readonly onSnooze: () => void;
  readonly onArchive: () => void;
}) {
  const meta = CATEGORY_META[notification.category];
  const Icon = meta.icon;
  const read = Boolean(notification.readAt);
  const t = useBilingual("domains.engagement.NotificationCenterPage");
  return (
    <article
      aria-label={notification.title}
      className={cn(
        "rounded-2xl border bg-card p-4 transition-colors sm:p-5",
        read ? "border-line" : "border-accent/35 ring-1 ring-accent/10",
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl",
          read ? "bg-raised text-fg-3" : "bg-accent-soft text-accent",
        )}>
          <Icon size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-[0.65rem] font-bold text-fg-3">{meta.label}</span>
            <time className="text-[0.68rem] text-fg-3" dateTime={notification.createdAt}>{formatTime(notification.createdAt)}</time>
            {isNew ? (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[0.65rem] font-black text-on-accent">새 알림</span>
            ) : null}
            {!read && !isNew ? <span className="size-2 rounded-full bg-accent" aria-label="읽지 않음" /> : null}
          </div>
          <h3 className="mt-2 text-base font-black text-fg">{notification.title}</h3>
          <p className="mt-1 text-sm leading-6 text-fg-2">{notification.body}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link
              href={notification.href}
              onClick={() => {
                if (!read) onToggleRead();
              }}
              className={buttonClass({ size: "sm", className: "gap-1.5" })}
            >
              {t("열기", "Open")} <ExternalLink size={13} aria-hidden="true" />
            </Link>
            <CardOverflowMenu
              read={read}
              archived={Boolean(notification.archivedAt)}
              onToggleRead={onToggleRead}
              onSnooze={onSnooze}
              onArchive={onArchive}
              t={t}
            />
          </div>
        </div>
      </div>
    </article>
  );
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
  const categorySettings = useEngagement((state) => state.notificationCategorySettings);
  const setNotificationCategoryEnabled = useEngagement((state) => state.setNotificationCategoryEnabled);
  const syncStatus = useEngagement((state) => state.notificationSyncStatus);
  const requestNotificationSyncRetry = useEngagement((state) => state.requestNotificationSyncRetry);
  const [filter, setFilter] = useState<Filter>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showRoleFiltered, setShowRoleFiltered] = useState(false);
  const { settings: roleSettings } = useRoleNotificationSettings();
  const clockNow = useNotificationClock(notifications);
  const active = activeEngagementNotifications(notifications, clockNow);
  // 종류별 설정과 직군 설정은 서로 덮어쓰지 않고 숨김 방향으로만 합성한다.
  const roleHiddenCount = roleSettings
    ? active.filter((item) => categorySettings[item.category] !== false
      && isHiddenByRoleNotificationSettings(item, roleSettings)).length
    : 0;
  const enabledActive = active.filter((item) => categorySettings[item.category] !== false
    && (showRoleFiltered || !isHiddenByRoleNotificationSettings(item, roleSettings)));
  const unreadCount = enabledActive.filter((item) => !item.readAt).length;
  const archivedCount = notifications.filter((item) => item.archivedAt).length;
  const disabledCategory: EngagementNotificationCategory | null = (
    filter !== "all" && filter !== "unread" && filter !== "archived"
    && categorySettings[filter] === false
  ) ? filter : null;

  const visible = useMemo(() => notifications
    .filter((item) => {
      if (filter === "archived") return Boolean(item.archivedAt);
      if (item.archivedAt) return false;
      if (item.snoozedUntil && Date.parse(item.snoozedUntil) > clockNow) return false;
      if (categorySettings[item.category] === false) return false;
      // 보관함에서는 직군 설정을 적용하지 않는다(종류별 설정과 같은 관례).
      if (!showRoleFiltered && isHiddenByRoleNotificationSettings(item, roleSettings)) return false;
      if (filter === "unread") return !item.readAt;
      if (filter === "all") return true;
      return item.category === filter;
    })
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
  [categorySettings, clockNow, filter, notifications, roleSettings, showRoleFiltered]);

  const paged = visible.slice(0, visibleCount);
  const grouped = useMemo(() => groupNotificationsByDate(paged), [paged]);
  const remaining = visible.length - paged.length;

  const selectFilter = (value: Filter) => {
    setFilter(value);
    setVisibleCount(PAGE_SIZE);
  };

  const filters: readonly { value: Filter; label: string }[] = [
    { value: "all", label: `전체 ${enabledActive.length}` },
    { value: "unread", label: `안 읽음 ${unreadCount}` },
    { value: "release", label: "연재" },
    { value: "availability", label: "가격·제공처" },
    { value: "production", label: "제작" },
    { value: "market", label: "마켓" },
    { value: "community", label: "커뮤니티" },
    { value: "archived", label: `보관 ${archivedCount}` },
  ];

  const loading = syncStatus === "loading" && enabledActive.length === 0;

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
          <button
            type="button"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
            className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}
          >
            <Settings2 size={15} aria-hidden="true" /> 알림 설정
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

      <p className="sr-only" role="status">읽지 않은 알림 {unreadCount}개</p>

      {settingsOpen ? (
        <section aria-label="알림 종류별 설정" className="mt-6 rounded-2xl border border-line bg-panel/60 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-black text-fg">종류별 알림 받기</h2>
              <p className="mt-1 text-xs leading-5 text-fg-3">끄면 해당 종류의 알림은 목록과 알림 뱃지에서 숨겨집니다. 저장된 알림은 삭제되지 않습니다.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                for (const category of CATEGORY_ORDER) setNotificationCategoryEnabled(category, true);
              }}
              className={buttonClass({ variant: "ghost", size: "sm" })}
            >
              전부 켜기
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {CATEGORY_ORDER.map((category) => (
              <CategorySwitch
                key={category}
                category={category}
                enabled={categorySettings[category] !== false}
                onChange={setNotificationCategoryEnabled}
              />
            ))}
          </div>
        </section>
      ) : null}

      {syncStatus === "error" ? (
        <div role="alert" className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-warn/30 bg-warn/10 p-4">
          <TriangleAlert size={18} className="shrink-0 text-warn" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-fg">최신 알림을 불러오지 못했어요</p>
            <p className="mt-0.5 text-xs text-fg-3">저장된 알림은 그대로 볼 수 있습니다. 네트워크를 확인하고 다시 시도해 주세요.</p>
          </div>
          <button
            type="button"
            onClick={requestNotificationSyncRetry}
            className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}
          >
            <RefreshCw size={13} aria-hidden="true" /> 다시 시도
          </button>
        </div>
      ) : null}

      <div
        role="group"
        aria-label="알림 필터"
        className="mt-7 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={filter === item.value}
            onClick={() => selectFilter(item.value)}
            className={cn(
              "min-h-10 shrink-0 rounded-full border px-4 text-xs font-bold transition-colors",
              "pointer-coarse:min-h-11",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              filter === item.value
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {roleSettings && roleHiddenCount > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel/60 px-4 py-3">
          <p className="min-w-0 flex-1 text-xs leading-5 text-fg-2">
            {showRoleFiltered
              ? `직군 알림 설정으로 숨길 제작 알림 ${roleHiddenCount}건을 함께 표시하고 있습니다.`
              : `직군 알림 설정으로 제작 알림 ${roleHiddenCount}건이 숨겨져 있습니다. 숨긴 알림은 삭제되지 않습니다.`}
          </p>
          <button
            type="button"
            aria-pressed={showRoleFiltered}
            onClick={() => setShowRoleFiltered((value) => !value)}
            className={buttonClass({ variant: "outline", size: "sm" })}
          >
            {showRoleFiltered ? "직군 설정 적용" : "모두 보기"}
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-8 grid gap-3">
          <LoadingState label="알림을 불러오는 중" className="rounded-2xl border border-line bg-card p-5" />
          <LoadingState label="알림을 불러오는 중" className="rounded-2xl border border-line bg-card p-5" />
        </div>
      ) : disabledCategory ? (
        <div className="mt-8 rounded-3xl border border-dashed border-line bg-card/50 p-10 text-center">
          <BellRing className="mx-auto size-9 text-fg-3" aria-hidden="true" />
          <h2 className="mt-3 font-black text-fg">‘{CATEGORY_META[disabledCategory].label}’ 알림이 꺼져 있습니다</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-fg-3">알림 설정에서 다시 켜면 해당 종류의 알림을 확인할 수 있습니다.</p>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className={buttonClass({ size: "sm", className: "mt-4 gap-1.5" })}
          >
            <Settings2 size={14} aria-hidden="true" /> 알림 설정 열기
          </button>
        </div>
      ) : visible.length === 0 ? (
        <ActionableEmptyState
          className="mt-8"
          art="notifications"
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
        <div className="mt-6">
          {grouped.map((group) => (
            <section key={group.bucket} aria-label={NOTIFICATION_DATE_BUCKET_LABEL[group.bucket]} className="mb-6 last:mb-0">
              <h2 className="mb-3 flex items-center gap-2 text-xs font-black tracking-wide text-fg-3">
                {NOTIFICATION_DATE_BUCKET_LABEL[group.bucket]}
                <span className="rounded-full bg-raised px-2 py-0.5 text-[0.65rem] text-fg-2">{group.items.length}</span>
              </h2>
              <div className="grid gap-3">
                {group.items.map((notification) => (
                  <NotificationCard
                    key={notification.id}
                    notification={notification}
                    isNew={isNewNotification(notification, clockNow)}
                    onToggleRead={() => markNotificationRead(notification.id, !notification.readAt)}
                    onSnooze={() => snoozeNotification(
                      notification.id,
                      new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
                    )}
                    onArchive={() => archiveNotification(notification.id)}
                  />
                ))}
              </div>
            </section>
          ))}
          {remaining > 0 ? (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                className={buttonClass({ variant: "outline", className: "gap-1.5" })}
              >
                더 보기 <span className="text-fg-3">남은 {remaining}개</span>
              </button>
            </div>
          ) : null}
        </div>
      )}
    </Container>
  );
}
