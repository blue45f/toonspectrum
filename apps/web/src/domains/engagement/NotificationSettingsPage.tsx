import { useEngagement } from "./engagement-store";
import {
  NOTIFICATION_CATEGORY_META,
  NOTIFICATION_CATEGORY_ORDER,
} from "./notification-categories";

import type { EngagementNotificationCategory } from "./engagement-model";

import Link from "@/shared/navigation/router-link";
import { Container } from "@/shared/components/section";
import { useDocumentTitle, useMetaRobots } from "@/shared/seo/use-document-title";
import { NOINDEX_PRIVATE_ROBOTS } from "@/shared/lib/seo-route-policy";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

function CategorySwitch({
  category,
  enabled,
  onChange,
}: {
  readonly category: EngagementNotificationCategory;
  readonly enabled: boolean;
  readonly onChange: (category: EngagementNotificationCategory, enabled: boolean) => void;
}) {
  const meta = NOTIFICATION_CATEGORY_META[category];
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

/** 종류별 알림 수신 설정 — 알림 센터에서 분리한 전용 화면(/settings/notifications). */
export function NotificationSettingsPage() {
  useDocumentTitle("알림 설정");
  useMetaRobots(NOINDEX_PRIVATE_ROBOTS);
  const categorySettings = useEngagement((state) => state.notificationCategorySettings);
  const setNotificationCategoryEnabled = useEngagement((state) => state.setNotificationCategoryEnabled);

  return (
    <Container size="wide" className="py-8 sm:py-12">
      <Link href="/notifications" className="inline-flex min-h-11 items-center text-sm font-bold text-accent">
        ← 알림 센터
      </Link>
      <header className="mb-7 mt-3 max-w-3xl">
        <p className="eyebrow text-accent">NOTIFICATION SETTINGS</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">알림 설정</h1>
      </header>

      <section aria-label="알림 종류별 설정" className="rounded-2xl border border-line bg-panel/60 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-black text-fg">종류별 알림 받기</h2>
            <p className="mt-1 text-xs leading-5 text-fg-3">끄면 해당 종류의 알림은 목록과 알림 뱃지에서 숨겨집니다. 저장된 알림은 삭제되지 않습니다.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              for (const category of NOTIFICATION_CATEGORY_ORDER) setNotificationCategoryEnabled(category, true);
            }}
            className={buttonClass({ variant: "ghost", size: "sm" })}
          >
            전부 켜기
          </button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {NOTIFICATION_CATEGORY_ORDER.map((category) => (
            <CategorySwitch
              key={category}
              category={category}
              enabled={categorySettings[category] !== false}
              onChange={setNotificationCategoryEnabled}
            />
          ))}
        </div>
      </section>
    </Container>
  );
}
